package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPHandlersExerciseCorePaths(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	t.Run("auth failure", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/feed/today", nil))

		assertStatus(t, recorder, http.StatusUnauthorized)
		assertJSONFixture(t, recorder.Body.Bytes(), "error_unauthorized.json")
	})

	t.Run("feed today", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/feed/today?limit=1", nil))

		assertStatus(t, recorder, http.StatusOK)
		assertContentType(t, recorder, "application/json; charset=utf-8")
		var parsed TodayFeedResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal feed response: %v; body=%s", err, recorder.Body.String())
		}
		if len(parsed.Items) != 1 || parsed.Items[0].ID != "item_http_01" {
			t.Fatalf("feed items = %+v, want seeded item_http_01", parsed.Items)
		}
	})

	t.Run("search", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/search?q=sqlite&source=HTTP%20Source&from=2026-05-01&to=2026-05-31&resonated=false&limit=5", nil))

		assertStatus(t, recorder, http.StatusOK)
		var parsed SearchResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal search response: %v; body=%s", err, recorder.Body.String())
		}
		if parsed.Query.Q != "sqlite" || parsed.Query.Source == nil || *parsed.Query.Source != "HTTP Source" || parsed.Query.Resonated == nil || *parsed.Query.Resonated || parsed.Query.Limit != 5 {
			t.Fatalf("search query echo = %+v", parsed.Query)
		}
		if len(parsed.Items) != 1 || parsed.Items[0].ID != "item_http_01" {
			t.Fatalf("search items = %+v, want seeded item_http_01", parsed.Items)
		}
	})

	t.Run("state export import", func(t *testing.T) {
		exportRecorder := httptest.NewRecorder()
		router.ServeHTTP(exportRecorder, authorizedRequest(http.MethodGet, "/api/state/export", nil))
		assertStatus(t, exportRecorder, http.StatusOK)

		importRecorder := httptest.NewRecorder()
		req := authorizedRequest(http.MethodPost, "/api/state/import", bytes.NewReader(exportRecorder.Body.Bytes()))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(importRecorder, req)

		assertStatus(t, importRecorder, http.StatusOK)
		var parsed RestoreResult
		if err := json.Unmarshal(importRecorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal import response: %v; body=%s", err, importRecorder.Body.String())
		}
		if parsed.Restored.Sources != 1 {
			t.Fatalf("restored sources = %d, want 1", parsed.Restored.Sources)
		}
	})

	t.Run("doctor", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/doctor", nil))

		assertStatus(t, recorder, http.StatusOK)
		assertContentType(t, recorder, "text/plain; charset=utf-8")
		if !strings.Contains(recorder.Body.String(), "rss:") || !strings.Contains(recorder.Body.String(), "ingest: last_run=") {
			t.Fatalf("doctor body = %q", recorder.Body.String())
		}
	})
}

func TestHTTPQueryValidationRejectsUnknownAndDuplicateParameters(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name  string
		path  string
		field string
	}{
		{name: "feed unknown", path: "/api/feed/today?topic=sqlite", field: "topic"},
		{name: "feed duplicate", path: "/api/feed/today?limit=1&limit=2", field: "limit"},
		{name: "search unknown", path: "/api/search?semantic=true", field: "semantic"},
		{name: "search duplicate", path: "/api/search?q=a&q=b", field: "q"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, tc.path, nil))

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), tc.field)
		})
	}
}

func TestStaticRootServesHTMLAccessGate(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	assertStatus(t, recorder, http.StatusOK)
	contentType := recorder.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", contentType)
	}
	body := recorder.Body.String()
	if strings.TrimSpace(body) == "RESOFEED" || !strings.Contains(body, "RESOFEED") || !strings.Contains(strings.ToLower(body), "owner token") {
		t.Fatalf("root body did not expose HTML owner-token access gate; body=%q", body)
	}
}

func seedHTTPHandlerCorpus(t *testing.T, ctx context.Context, db *sql.DB, now time.Time) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, is_active, revision) values ('src_http', 'https://http.example/feed.xml', 'HTTP Source', ?, ?, 'ok', 1, 1)`, now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert http source: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text) values ('item_http_01', 'src_http', 'https://http.example/feed.xml', 'https://http.example/sqlite', 'SQLite HTTP Handler', 'sqlite summary', 'sqlite insight', ?, ?, 'full', 'ok', 'sqlite excerpt', 'sqlite text')`, now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert http item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild search index: %v", err)
	}
}

func assertContentType(t *testing.T, recorder *httptest.ResponseRecorder, want string) {
	t.Helper()
	if got := recorder.Header().Get("Content-Type"); got != want {
		t.Fatalf("Content-Type = %q, want %q", got, want)
	}
}
