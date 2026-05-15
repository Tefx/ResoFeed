package resofeed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestURDASourceLedgerSourcesExposeRawDiagnosticsForRows(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 15, 10, 30, 0, 0, time.UTC)
	const diagnostic = "err: timeout while fetching upstream feed"
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, last_fetch_error, is_active, revision) values (?, ?, ?, ?, ?, ?, ?, 1, 7)`,
		"src_urda_diag", "https://diagnostic.example/feed.xml", "Diagnostic Source", now.Format(time.RFC3339), now.Format(time.RFC3339), sourceStatusFetchError, diagnostic)
	if err != nil {
		t.Fatalf("insert diagnostic source: %v", err)
	}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/sources", nil))
	assertStatus(t, recorder, http.StatusOK)

	var parsed struct {
		Sources []map[string]any `json:"sources"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal sources response: %v; body=%s", err, recorder.Body.String())
	}
	if len(parsed.Sources) != 1 {
		t.Fatalf("sources length = %d, want 1; body=%s", len(parsed.Sources), recorder.Body.String())
	}
	if got, ok := parsed.Sources[0]["last_fetch_error"].(string); !ok || got != diagnostic {
		t.Fatalf("GET /api/sources source.last_fetch_error = %#v, want raw diagnostic %q for Source Ledger err: row rendering; full source=%v", parsed.Sources[0]["last_fetch_error"], diagnostic, parsed.Sources[0])
	}
}

func TestURDAManualIngestUsesArchitectureIngestRunEnvelopeAndStrictEmptyBody(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name string
		path string
	}{
		{name: "global ingest", path: "/api/ingest"},
		{name: "source fetch", path: "/api/sources/src_missing/fetch"},
	} {
		t.Run(tc.name+" rejects query parameters", func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, tc.path+"?idempotency_key=forbidden", string(readFixture(t, "manual_ingest_empty_request.json"))))
			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), "idempotency_key")
		})

		t.Run(tc.name+" rejects idempotency key body", func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, tc.path, `{"idempotency_key":"forbidden"}`))
			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), "body")
		})
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, "/api/ingest", string(readFixture(t, "manual_ingest_empty_request.json"))))
	assertStatus(t, recorder, http.StatusOK)
	assertArchitectureIngestRun(t, recorder.Body.Bytes(), "all", nil)
}

func TestURDASourceFetchReturnsUpdatedSourceAndSourceScopedErrors(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>URDA</title><item><guid>one</guid><title>One</title><link>` + "http://" + r.Host + `/item</link><description>one excerpt</description><pubDate>Sat, 09 May 2026 14:02:00 +0000</pubDate></item></channel></rss>`))
		case "/item":
			_, _ = w.Write([]byte(`<html><body><article>one article text</article></body></html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)
	seedManualFetchSource(t, ctx, db, "src_urda_fetch_ok", feed.URL+"/feed.xml", true)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	ok := httptest.NewRecorder()
	router.ServeHTTP(ok, manualFetchRequest(http.MethodPost, "/api/sources/src_urda_fetch_ok/fetch", string(readFixture(t, "manual_ingest_empty_request.json"))))
	assertStatus(t, ok, http.StatusOK)
	assertArchitectureSourceFetchResponse(t, ok.Body.Bytes(), "src_urda_fetch_ok", "ok")

	failDB := newContractDB(t, ctx)
	failingFeed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "bad gateway", http.StatusBadGateway)
	}))
	t.Cleanup(failingFeed.Close)
	seedManualFetchSource(t, ctx, failDB, "src_urda_fetch_err", failingFeed.URL+"/feed.xml", true)
	failRouter := NewRouter(HTTPServerConfig{DB: failDB, OwnerToken: contractOwnerToken})
	failure := httptest.NewRecorder()
	failRouter.ServeHTTP(failure, manualFetchRequest(http.MethodPost, "/api/sources/src_urda_fetch_err/fetch", string(readFixture(t, "manual_ingest_empty_request.json"))))
	assertStatus(t, failure, http.StatusOK)
	parsed := assertArchitectureSourceFetchResponse(t, failure.Body.Bytes(), "src_urda_fetch_err", sourceStatusFetchError)
	if parsed.Ingest.Status != "failed" || len(parsed.Ingest.Errors) != 1 || parsed.Ingest.Errors[0].SourceID == nil || *parsed.Ingest.Errors[0].SourceID != "src_urda_fetch_err" || parsed.Ingest.Errors[0].Message == "" {
		t.Fatalf("source fetch operational failure ingest = %+v, want source-scoped error in ARCHITECTURE IngestRunResult", parsed.Ingest)
	}
}

func TestURDAIngestFetchConflictResponseCarriesRawUIMessageDetails(t *testing.T) {
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
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>URDA</title><item><guid>one</guid><title>One</title><link>https://example.com/one</link><description>one</description></item></channel></rss>`))
	}))
	t.Cleanup(feed.Close)
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseFeed) }) }
	t.Cleanup(release)
	seedManualFetchSource(t, ctx, db, "src_urda_slow", feed.URL+"/feed.xml", true)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	firstDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, manualFetchRequest(http.MethodPost, "/api/ingest", string(readFixture(t, "manual_ingest_empty_request.json"))))
		firstDone <- recorder
	}()
	t.Cleanup(func() {
		release()
		select {
		case <-firstDone:
		case <-time.After(2 * time.Second):
			t.Errorf("timed out waiting for first ingest request to exit")
		}
	})

	select {
	case <-feedStarted:
		second := httptest.NewRecorder()
		router.ServeHTTP(second, manualFetchRequest(http.MethodPost, "/api/sources/src_urda_slow/fetch", string(readFixture(t, "manual_ingest_empty_request.json"))))
		assertStatus(t, second, http.StatusConflict)
		var parsed ErrorBody
		if err := json.Unmarshal(second.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal conflict body: %v; body=%s", err, second.Body.String())
		}
		if parsed.Error.Code != "conflict" || parsed.Error.Message != "operation already running" {
			t.Fatalf("conflict error = %+v, want operation guard conflict", parsed.Error)
		}
		if parsed.Error.Details["operation_running"] != true || parsed.Error.Details["operation"] != "ingest" || parsed.Error.Details["scope"] != "all" || parsed.Error.Details["retry_allowed"] != true {
			t.Fatalf("conflict details = %#v, want ARCHITECTURE guard details", parsed.Error.Details)
		}
	case first := <-firstDone:
		assertStatus(t, first, http.StatusOK)
		t.Fatal("first ingest completed before overlap conflict could be observed")
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first manual ingest to reach source fetch")
	}
}

type urdaIngestResponse struct {
	Ingest urdaIngestRunResult `json:"ingest"`
	Source *Source             `json:"source,omitempty"`
}

type urdaIngestRunResult struct {
	Scope            string                  `json:"scope"`
	SourceID         *string                 `json:"source_id"`
	Status           string                  `json:"status"`
	StartedAt        string                  `json:"started_at"`
	CompletedAt      string                  `json:"completed_at"`
	DurationMS       int                     `json:"duration_ms"`
	SourcesAttempted int                     `json:"sources_attempted"`
	SourcesSucceeded int                     `json:"sources_succeeded"`
	SourcesFailed    int                     `json:"sources_failed"`
	ItemsUpserted    int                     `json:"items_upserted"`
	Errors           []urdaIngestErrorDetail `json:"errors"`
}

type urdaIngestErrorDetail struct {
	SourceID *string `json:"source_id"`
	Code     string  `json:"code"`
	Message  string  `json:"message"`
}

func assertArchitectureIngestRun(t *testing.T, body []byte, scope string, sourceID *string) urdaIngestResponse {
	t.Helper()

	var parsed urdaIngestResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal ARCHITECTURE ingest response: %v; body=%s", err, string(body))
	}
	if parsed.Ingest.Scope != scope {
		t.Fatalf("ingest.scope = %q, want %q; body=%s", parsed.Ingest.Scope, scope, string(body))
	}
	if (sourceID == nil) != (parsed.Ingest.SourceID == nil) || (sourceID != nil && *parsed.Ingest.SourceID != *sourceID) {
		t.Fatalf("ingest.source_id = %v, want %v; body=%s", parsed.Ingest.SourceID, sourceID, string(body))
	}
	if parsed.Ingest.Status == "" || parsed.Ingest.Errors == nil {
		t.Fatalf("ingest result missing required status/errors fields: %+v; body=%s", parsed.Ingest, string(body))
	}
	if _, err := time.Parse(time.RFC3339, parsed.Ingest.StartedAt); err != nil {
		t.Fatalf("ingest.started_at = %q, want RFC3339: %v; body=%s", parsed.Ingest.StartedAt, err, string(body))
	}
	if _, err := time.Parse(time.RFC3339, parsed.Ingest.CompletedAt); err != nil {
		t.Fatalf("ingest.completed_at = %q, want RFC3339: %v; body=%s", parsed.Ingest.CompletedAt, err, string(body))
	}
	return parsed
}

func assertArchitectureSourceFetchResponse(t *testing.T, body []byte, sourceID string, sourceStatus string) urdaIngestResponse {
	t.Helper()

	parsed := assertArchitectureIngestRun(t, body, "source", &sourceID)
	if parsed.Source == nil {
		t.Fatalf("source fetch response missing updated source; body=%s", string(body))
	}
	if parsed.Source.ID != sourceID || parsed.Source.LastFetchStatus != sourceStatus || parsed.Source.LastFetchAt == nil || parsed.Source.LastFetchAt.IsZero() {
		t.Fatalf("source fetch source = %+v, want id=%q status=%q with updated RFC3339 last_fetch_at", parsed.Source, sourceID, sourceStatus)
	}
	return parsed
}
