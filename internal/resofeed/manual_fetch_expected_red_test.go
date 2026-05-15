package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestManualRSSFetchHTTPContractsRequireAuthNoQueryAndExactEmptyObject(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedManualFetchSource(t, ctx, db, "manual_src_ok", "https://manual.example/feed.xml", true)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name string
		path string
	}{
		{name: "global ingest", path: ManualIngestHTTPPath},
		{name: "source fetch", path: "/api/sources/manual_src_ok/fetch"},
	} {
		t.Run(tc.name+" requires owner token", func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(ManualFetchRequestBody))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, req)

			assertStatus(t, recorder, ManualFetchHTTPStatusUnauthorized)
			assertErrorCode(t, recorder.Body.Bytes(), ManualFetchErrorCodeUnauthorized)
		})

		t.Run(tc.name+" rejects query parameters", func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, tc.path+"?trace=1", ManualFetchRequestBody))

			assertStatus(t, recorder, ManualFetchHTTPStatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), "trace")
		})

		for _, body := range []string{``, `null`, `[]`, `{"force":true}`, `{"idempotency_key":"not-contracted"}`} {
			body := body
			t.Run(tc.name+" rejects non exact empty object body "+body, func(t *testing.T) {
				recorder := httptest.NewRecorder()
				router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, tc.path, body))

				assertStatus(t, recorder, ManualFetchHTTPStatusBadRequest)
				assertErrorField(t, recorder.Body.Bytes(), "body")
			})
		}
	}
}

func TestManualRSSFetchGlobalIngestZeroSourcesReturnsCompletedZeroCounts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	result := manualFetchJSON[IngestResponse](t, router, ManualIngestHTTPPath, ManualFetchRequestBody, ManualFetchHTTPStatusOK)

	if result.Ingest.Scope != "all" || result.Ingest.SourceID != nil || result.Ingest.Status != "completed" || result.Ingest.SourcesAttempted != 0 || result.Ingest.SourcesSucceeded != 0 || result.Ingest.ItemsUpserted != 0 || len(result.Ingest.Errors) != 0 {
		t.Fatalf("manual ingest zero-source result = %+v, want completed ingest with zero counts and errors=[]", result)
	}
}

func TestManualRSSFetchSourceFetchMissingDeletedAndInactiveReturnNotFound(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedManualFetchSource(t, ctx, db, "manual_src_inactive", "https://manual.example/inactive.xml", false)
	seedManualFetchSource(t, ctx, db, "manual_src_deleted", "https://manual.example/deleted.xml", true)
	if _, err := db.ExecContext(ctx, `update sources set is_active = 0 where id = ?`, "manual_src_deleted"); err != nil {
		t.Fatalf("mark manual_src_deleted deleted: %v", err)
	}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, sourceID := range []string{"manual_src_missing", "manual_src_inactive", "manual_src_deleted"} {
		sourceID := sourceID
		t.Run(sourceID, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, "/api/sources/"+sourceID+"/fetch", ManualFetchRequestBody))

			assertStatus(t, recorder, ManualFetchHTTPStatusNotFound)
			assertErrorCode(t, recorder.Body.Bytes(), ManualFetchErrorCodeNotFound)
		})
	}
}

func TestManualRSSFetchOperationalSourceFailuresReturnRequestLevelOK(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "upstream failed", http.StatusBadGateway)
	}))
	t.Cleanup(feed.Close)
	seedManualFetchSource(t, ctx, db, "manual_src_rss_error", feed.URL+"/feed.xml", true)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	result := manualFetchJSON[IngestResponse](t, router, "/api/sources/manual_src_rss_error/fetch", ManualFetchRequestBody, ManualFetchHTTPStatusOK)

	if result.Ingest.Scope != "source" || result.Ingest.SourceID == nil || *result.Ingest.SourceID != "manual_src_rss_error" || result.Ingest.Status != "failed" || result.Ingest.SourcesAttempted != 1 || result.Ingest.SourcesSucceeded != 0 || len(result.Ingest.Errors) != 1 {
		t.Fatalf("manual source RSS error result = %+v, want request-level 200 with one source-level error", result)
	}
	if result.Ingest.Errors[0].SourceID == nil || *result.Ingest.Errors[0].SourceID != "manual_src_rss_error" || result.Ingest.Errors[0].Code != sourceStatusFetchError || result.Ingest.Errors[0].Message == "" {
		t.Fatalf("manual source RSS error entry = %+v, want rss_fetch_error with message", result.Ingest.Errors[0])
	}
}

func TestManualRSSFetchSharedGuardRejectsManualOverlapAndDoesNotPersistArtifacts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feedStarted := make(chan struct{})
	releaseFeed := make(chan struct{})
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		select {
		case <-feedStarted:
		default:
			close(feedStarted)
		}
		<-releaseFeed
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>Manual</title><item><guid>one</guid><title>One</title><link>https://manual.example/one</link><description>one</description></item></channel></rss>`))
	}))
	t.Cleanup(feed.Close)
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseFeed) }) }
	t.Cleanup(release)
	seedManualFetchSource(t, ctx, db, "manual_src_slow", feed.URL+"/feed.xml", true)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	firstDone := make(chan *httptest.ResponseRecorder, 1)
	firstDoneConsumed := false
	go func() {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, ManualIngestHTTPPath, ManualFetchRequestBody))
		firstDone <- recorder
	}()
	t.Cleanup(func() {
		if firstDoneConsumed {
			return
		}
		release()
		select {
		case <-firstDone:
		case <-time.After(2 * time.Second):
			t.Errorf("timed out waiting for first manual ingest goroutine to exit")
		}
	})

	select {
	case <-feedStarted:
		second := httptest.NewRecorder()
		router.ServeHTTP(second, manualFetchRequest(http.MethodPost, "/api/sources/manual_src_slow/fetch", ManualFetchRequestBody))
		assertStatus(t, second, ManualFetchHTTPStatusConflict)
		assertErrorCode(t, second.Body.Bytes(), ManualFetchErrorCodeConflict)
		assertManualFetchDurableArtifactsAbsent(t, ctx, db)
	case first := <-firstDone:
		firstDoneConsumed = true
		assertStatus(t, first, ManualFetchHTTPStatusOK)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first manual ingest to reach source fetch")
	}
}

func TestManualRSSFetchGuardReleasesAfterSuccessOperationalErrorAndRecoveredFailure(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	status := http.StatusOK
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if status >= 500 {
			http.Error(w, "temporary rss failure", status)
			return
		}
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>Manual</title><item><guid>one</guid><title>One</title><link>https://manual.example/one</link><description>one</description></item></channel></rss>`))
	}))
	t.Cleanup(feed.Close)
	seedManualFetchSource(t, ctx, db, "manual_src_guard", feed.URL+"/feed.xml", true)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	manualFetchJSON[IngestResponse](t, router, "/api/sources/manual_src_guard/fetch", ManualFetchRequestBody, ManualFetchHTTPStatusOK)
	status = http.StatusInternalServerError
	manualFetchJSON[IngestResponse](t, router, "/api/sources/manual_src_guard/fetch", ManualFetchRequestBody, ManualFetchHTTPStatusOK)
	status = http.StatusOK
	manualFetchJSON[IngestResponse](t, router, "/api/sources/manual_src_guard/fetch", ManualFetchRequestBody, ManualFetchHTTPStatusOK)
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)
}

func manualFetchRequest(method string, target string, body string) *http.Request {
	req := authorizedRequest(method, target, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func manualFetchJSON[T any](t *testing.T, router http.Handler, path string, body string, wantStatus int) T {
	t.Helper()

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, path, body))
	assertStatus(t, recorder, wantStatus)

	var parsed T
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal manual fetch response: %v; body=%s", err, recorder.Body.String())
	}
	return parsed
}

func seedManualFetchSource(t *testing.T, ctx context.Context, db *sql.DB, id string, url string, active bool) {
	t.Helper()

	activeInt := 0
	if active {
		activeInt = 1
	}
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, ?, ?, 1)`, id, url, "Manual Source "+id, time.Now().UTC().Format(time.RFC3339), sourceStatusNotFetched, activeInt)
	if err != nil {
		t.Fatalf("insert manual fetch source %s: %v", id, err)
	}
}

func assertManualFetchDurableArtifactsAbsent(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()

	var receipts int
	if err := db.QueryRowContext(ctx, `select count(*) from agent_receipts where operation in (?, ?)`, ManualFetchOperationIngest, ManualFetchOperationSourceFetch).Scan(&receipts); err != nil {
		t.Fatalf("count manual fetch receipts: %v", err)
	}
	if receipts != 0 {
		t.Fatalf("manual fetch durable receipts = %d, want 0", receipts)
	}
}
