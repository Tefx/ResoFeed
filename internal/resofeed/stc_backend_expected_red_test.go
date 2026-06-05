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
	"sync/atomic"
	"testing"
	"time"
)

const (
	stcRSSNonEmptyTitleFixture = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example Newsroom Dispatch</title><item><title>City Council Approves Transit Budget</title><link>https://example.test/city/transit-budget</link><description>Local reporting excerpt.</description></item></channel></rss>`
	stcAtomNonEmptyTitleFixture = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Open Standards Weekly</title><entry><title>Spec Editors Publish Draft</title><id>tag:example.test,2026:spec-draft</id><updated>2026-06-05T12:00:00Z</updated><summary>Standards update excerpt.</summary></entry></feed>`
	stcBlankTitleFixture = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>   </title><item><title>Untitled Feed Case Item</title><link>https://example.test/blank-title/item</link><description>Blank feed title regression.</description></item></channel></rss>`
)

func TestSTCExpectedRedSourceTitleRevisionAndTransportContracts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	rssFeed := stcStaticFeedServer(t, stcRSSNonEmptyTitleFixture)
	atomFeed := stcStaticFeedServer(t, stcAtomNonEmptyTitleFixture)
	blankFeed := stcStaticFeedServer(t, stcBlankTitleFixture)
	seedSTCSource(t, ctx, db, "src_stc_rss", rssFeed.URL+"/rss.xml", "Imported RSS Fallback", 10)
	seedSTCSource(t, ctx, db, "src_stc_atom", atomFeed.URL+"/atom.xml", "Imported Atom Fallback", 20)
	seedSTCSource(t, ctx, db, "src_stc_blank", blankFeed.URL+"/blank.xml", "Existing Blank Fallback", 10)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	rssResult := manualFetchJSON[IngestResponse](t, router, "/api/sources/src_stc_rss/fetch", ManualFetchRequestBody, http.StatusOK)
	if rssResult.Source == nil || rssResult.Source.Title != "Example Newsroom Dispatch" {
		t.Fatalf("RSS manual fetch source title = %+v, want canonical sources.title updated from documented RSS feed title", rssResult.Source)
	}

	atomResult := manualFetchJSON[IngestResponse](t, router, "/api/sources/src_stc_atom/fetch", ManualFetchRequestBody, http.StatusOK)
	if atomResult.Source == nil || atomResult.Source.Title != "Open Standards Weekly" {
		t.Fatalf("Atom manual fetch source title = %+v, want canonical sources.title updated from documented Atom feed title", atomResult.Source)
	}

	blankResult := manualFetchJSON[IngestResponse](t, router, "/api/sources/src_stc_blank/fetch", ManualFetchRequestBody, http.StatusOK)
	if blankResult.Source == nil || blankResult.Source.Title != "Existing Blank Fallback" {
		t.Fatalf("blank-title manual fetch source title = %+v, want existing fallback preserved", blankResult.Source)
	}

	t.Run("non-empty feed-title revision bump is distinct from blank-title fetch bookkeeping", func(t *testing.T) {
		rssRevision := stcSourceRevision(t, ctx, db, "src_stc_rss")
		blankRevision := stcSourceRevision(t, ctx, db, "src_stc_blank")
		if rssRevision <= blankRevision {
			t.Fatalf("RSS title-update revision = %d, blank-title revision = %d; want non-empty feed-title mutation to create a distinct revision bump beyond status-only blank-title fetch", rssRevision, blankRevision)
		}
	})

	t.Run("HTTP source listing exposes title only", func(t *testing.T) {
		assertSTCSourcesHTTPTitleOnly(t, router, "src_stc_atom", "Open Standards Weekly")
	})

	t.Run("MCP source listing exposes title only", func(t *testing.T) {
		assertSTCSourcesMCPTitleOnly(t, db, "src_stc_atom", "Open Standards Weekly")
	})
}

func TestSTCExpectedRedDifferentSourceFetchesOverlap(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	alphaEntered := make(chan struct{})
	alphaRelease := make(chan struct{})
	betaEntered := make(chan struct{})
	betaRelease := make(chan struct{})
	alphaFeed, alphaRequests := stcSlowFeedServer(t, stcRSSNonEmptyTitleFixture, alphaEntered, alphaRelease)
	betaFeed, betaRequests := stcSlowFeedServer(t, stcAtomNonEmptyTitleFixture, betaEntered, betaRelease)
	seedSTCSource(t, ctx, db, "src_stc_alpha", alphaFeed.URL+"/rss.xml", "Alpha Fallback", 1)
	seedSTCSource(t, ctx, db, "src_stc_beta", betaFeed.URL+"/atom.xml", "Beta Fallback", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	alphaDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		alphaDone <- stcPostManualFetch(router, "/api/sources/src_stc_alpha/fetch")
	}()
	stcWaitForSignal(t, alphaEntered, "first source fetch to enter upstream fixture")

	betaDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		betaDone <- stcPostManualFetch(router, "/api/sources/src_stc_beta/fetch")
	}()

	select {
	case <-betaEntered:
		// This is the required overlap proof: distinct source ids are both in flight.
	case recorder := <-betaDone:
		close(alphaRelease)
		assertStatus(t, <-alphaDone, http.StatusOK)
		t.Fatalf("different-source fetch completed before entering beta upstream fixture: status=%d body=%s; want concurrent in-flight fetch, not global conflict/sequential bypass", recorder.Code, recorder.Body.String())
	case <-time.After(2 * time.Second):
		close(alphaRelease)
		assertStatus(t, <-alphaDone, http.StatusOK)
		t.Fatal("timed out waiting for second source fetch to overlap first source fetch")
	}

	close(betaRelease)
	close(alphaRelease)
	assertStatus(t, <-betaDone, http.StatusOK)
	assertStatus(t, <-alphaDone, http.StatusOK)
	if got := alphaRequests.Load(); got != 1 {
		t.Fatalf("alpha upstream request count = %d, want one", got)
	}
	if got := betaRequests.Load(); got != 1 {
		t.Fatalf("beta upstream request count = %d, want one", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)
}

func TestSTCExpectedRedSameSourceDuplicateConflictsWithoutPendingWork(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	sameEntered := make(chan struct{})
	sameRelease := make(chan struct{})
	sameFeed, sameRequests := stcSlowFeedServer(t, stcRSSNonEmptyTitleFixture, sameEntered, sameRelease)
	seedSTCSource(t, ctx, db, "src_stc_same", sameFeed.URL+"/rss.xml", "Same Fallback", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	firstSameDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		firstSameDone <- stcPostManualFetch(router, "/api/sources/src_stc_same/fetch")
	}()
	stcWaitForSignal(t, sameEntered, "same-source first fetch to enter upstream fixture")

	secondSame := stcPostManualFetch(router, "/api/sources/src_stc_same/fetch")
	assertStatus(t, secondSame, http.StatusConflict)
	assertErrorCode(t, secondSame.Body.Bytes(), ManualFetchErrorCodeConflict)
	if got := sameRequests.Load(); got != 1 {
		close(sameRelease)
		assertStatus(t, <-firstSameDone, http.StatusOK)
		t.Fatalf("same-source duplicate upstream request count = %d, want no queued/retried second fetch", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)
	close(sameRelease)
	assertStatus(t, <-firstSameDone, http.StatusOK)
}

func TestSTCExpectedRedGlobalManualAndBackgroundIngestSkipWhileSourceFetchActive(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	fetchEntered := make(chan struct{})
	fetchRelease := make(chan struct{})
	fetchFeed, _ := stcSlowFeedServer(t, stcRSSNonEmptyTitleFixture, fetchEntered, fetchRelease)
	backgroundFeed, backgroundRequests := stcSlowFeedServer(t, stcAtomNonEmptyTitleFixture, make(chan struct{}), make(chan struct{}))
	seedSTCSource(t, ctx, db, "src_stc_active_fetch", fetchFeed.URL+"/rss.xml", "Active Fetch Fallback", 1)
	seedSTCSource(t, ctx, db, "src_stc_background_probe", backgroundFeed.URL+"/atom.xml", "Background Probe Fallback", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	fetchDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		fetchDone <- stcPostManualFetch(router, "/api/sources/src_stc_active_fetch/fetch")
	}()
	stcWaitForSignal(t, fetchEntered, "source fetch to enter upstream fixture")

	manualIngestConflict := stcPostManualFetch(router, ManualIngestHTTPPath)
	assertStatus(t, manualIngestConflict, http.StatusConflict)
	assertErrorCode(t, manualIngestConflict.Body.Bytes(), ManualFetchErrorCodeConflict)

	if err := IngestOnce(ctx, db, IngestConfig{}); err != nil {
		close(fetchRelease)
		assertStatus(t, <-fetchDone, http.StatusOK)
		t.Fatalf("background ingest tick while source fetch active returned error = %v, want skip/ignore without queue", err)
	}
	if got := backgroundRequests.Load(); got != 0 {
		close(fetchRelease)
		assertStatus(t, <-fetchDone, http.StatusOK)
		t.Fatalf("background tick contacted %d inactive-conflict probe feeds while a source fetch was active; want skipped/not queued", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)
	close(fetchRelease)
	assertStatus(t, <-fetchDone, http.StatusOK)
}

func stcStaticFeedServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server
}

func stcSlowFeedServer(t *testing.T, body string, entered chan<- struct{}, release <-chan struct{}) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var requests atomic.Int64
	var enterOnce sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		enterOnce.Do(func() { close(entered) })
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server, &requests
}

func seedSTCSource(t *testing.T, ctx context.Context, db *sql.DB, id string, url string, title string, revision int64) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, ?, 1, ?)`, id, url, title, time.Now().UTC().Format(time.RFC3339), sourceStatusNotFetched, revision)
	if err != nil {
		t.Fatalf("insert STC source %s: %v", id, err)
	}
}

func stcSourceRevision(t *testing.T, ctx context.Context, db *sql.DB, sourceID string) int64 {
	t.Helper()
	var revision int64
	if err := db.QueryRowContext(ctx, `select revision from sources where id = ?`, sourceID).Scan(&revision); err != nil {
		t.Fatalf("read source revision %s: %v", sourceID, err)
	}
	return revision
}

func stcPostManualFetch(router http.Handler, path string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPost, path, bytes.NewReader([]byte(ManualFetchRequestBody)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	return recorder
}

func stcWaitForSignal(t *testing.T, ch <-chan struct{}, description string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", description)
	}
}

func assertSTCSourcesHTTPTitleOnly(t *testing.T, router http.Handler, sourceID string, wantTitle string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/sources", nil))
	assertStatus(t, recorder, http.StatusOK)
	assertSTCSourceListTitleOnly(t, recorder.Body.Bytes(), sourceID, wantTitle, "HTTP /api/sources")
}

func assertSTCSourcesMCPTitleOnly(t *testing.T, db *sql.DB, sourceID string, wantTitle string) {
	t.Helper()
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})
	text := mcpResourceText(t, handler, "resofeed://sources")
	assertSTCSourceListTitleOnly(t, []byte(text), sourceID, wantTitle, "MCP resofeed://sources")
}

func assertSTCSourceListTitleOnly(t *testing.T, body []byte, sourceID string, wantTitle string, surface string) {
	t.Helper()
	if strings.Contains(string(body), "feed_title") {
		t.Fatalf("%s leaked forbidden feed_title field: %s", surface, body)
	}
	var parsed struct {
		Sources []map[string]any `json:"sources"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal %s sources response: %v; body=%s", surface, err, body)
	}
	for _, source := range parsed.Sources {
		if source["id"] != sourceID {
			continue
		}
		if _, ok := source["feed_title"]; ok {
			t.Fatalf("%s source %s contains forbidden feed_title key: %#v", surface, sourceID, source)
		}
		if got, ok := source["title"].(string); !ok || got != wantTitle {
			t.Fatalf("%s source %s title = %#v, want %q; source=%#v", surface, sourceID, source["title"], wantTitle, source)
		}
		return
	}
	t.Fatalf("%s response missing source %s; body=%s", surface, sourceID, body)
}
