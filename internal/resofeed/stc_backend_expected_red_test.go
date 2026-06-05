package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unicode"
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

func TestSTCExpectedRedFoundationNoFeedTitleStorageOrBackendAliases(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	assertSQLiteTableColumnPresent(t, ctx, db, "sources", "title")
	assertSQLiteTableColumnAbsent(t, ctx, db, "sources", "feed_title")
	assertSQLiteSchemaTokenAbsent(t, ctx, db, "feed_title")
	assertProductionBackendTokenAbsent(t, "feed_title")
}

func TestSTCExpectedRedFoundationNoDurableQueueJobActivityWorkerOrSchedulerDrift(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	assertSQLiteTableNameFragmentsAbsent(t, ctx, db, []string{"queue", "job", "activity", "ledger", "history", "pending_work", "progress"})
	assertProductionBackendIdentifiersAbsent(t, []string{"worker", "eventbus", "event_bus", "scheduler"})
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

func assertSQLiteTableColumnPresent(t *testing.T, ctx context.Context, db *sql.DB, tableName string, columnName string) {
	t.Helper()
	columns := sqliteTableColumns(t, ctx, db, tableName)
	if !columns[columnName] {
		t.Fatalf("SQLite table %s missing required canonical column %s; columns=%v", tableName, columnName, stcMapKeys(columns))
	}
}

func assertSQLiteTableColumnAbsent(t *testing.T, ctx context.Context, db *sql.DB, tableName string, columnName string) {
	t.Helper()
	columns := sqliteTableColumns(t, ctx, db, tableName)
	if columns[columnName] {
		t.Fatalf("SQLite table %s contains forbidden source-title delta storage column %s", tableName, columnName)
	}
}

func sqliteTableColumns(t *testing.T, ctx context.Context, db *sql.DB, tableName string) map[string]bool {
	t.Helper()
	rows, err := db.QueryContext(ctx, `pragma table_info(`+tableName+`)`)
	if err != nil {
		t.Fatalf("read SQLite table metadata for %s: %v", tableName, err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close table metadata rows for %s: %v", tableName, err)
		}
	}()
	columns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue any
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan table metadata for %s: %v", tableName, err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table metadata for %s: %v", tableName, err)
	}
	return columns
}

func assertSQLiteSchemaTokenAbsent(t *testing.T, ctx context.Context, db *sql.DB, token string) {
	t.Helper()
	rows, err := db.QueryContext(ctx, `select name, coalesce(sql, '') from sqlite_master where type in ('table', 'view', 'trigger', 'index') and name not like 'sqlite_%'`)
	if err != nil {
		t.Fatalf("read SQLite schema for forbidden token %q: %v", token, err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close SQLite schema rows: %v", err)
		}
	}()
	needle := strings.ToLower(token)
	for rows.Next() {
		var name, sqlText string
		if err := rows.Scan(&name, &sqlText); err != nil {
			t.Fatalf("scan SQLite schema row: %v", err)
		}
		if strings.Contains(strings.ToLower(name), needle) || strings.Contains(strings.ToLower(sqlText), needle) {
			t.Fatalf("SQLite schema contains forbidden token %q in object %s: %s", token, name, sqlText)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate SQLite schema rows: %v", err)
	}
}

func assertSQLiteTableNameFragmentsAbsent(t *testing.T, ctx context.Context, db *sql.DB, forbiddenFragments []string) {
	t.Helper()
	rows, err := db.QueryContext(ctx, `select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`)
	if err != nil {
		t.Fatalf("read SQLite table names: %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close SQLite table rows: %v", err)
		}
	}()
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			t.Fatalf("scan SQLite table name: %v", err)
		}
		lowerName := strings.ToLower(tableName)
		for _, fragment := range forbiddenFragments {
			if strings.Contains(lowerName, fragment) {
				t.Fatalf("SQLite table %s contains forbidden durable-work fragment %q", tableName, fragment)
			}
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate SQLite table names: %v", err)
	}
}

func assertProductionBackendTokenAbsent(t *testing.T, token string) {
	t.Helper()
	needle := strings.ToLower(token)
	for _, file := range stcProductionBackendGoFiles(t) {
		content, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read production backend file %s: %v", file, err)
		}
		withoutComments := strings.ToLower(stcStripGoComments(string(content)))
		if strings.Contains(withoutComments, needle) {
			t.Fatalf("production backend file %s contains forbidden source-title token %q outside comments", stcRepoRelativePath(t, file), token)
		}
	}
}

func assertProductionBackendIdentifiersAbsent(t *testing.T, forbiddenFragments []string) {
	t.Helper()
	for _, file := range stcProductionBackendGoFiles(t) {
		content, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read production backend file %s: %v", file, err)
		}
		codeOnly := stcMaskGoStringLiterals(stcStripGoComments(string(content)))
		for _, token := range stcIdentifierTokens(codeOnly) {
			lowerToken := strings.ToLower(token)
			for _, fragment := range forbiddenFragments {
				if strings.Contains(lowerToken, fragment) {
					t.Fatalf("production backend file %s contains forbidden durable-work abstraction identifier %q matching %q", stcRepoRelativePath(t, file), token, fragment)
				}
			}
		}
	}
}

func stcProductionBackendGoFiles(t *testing.T) []string {
	t.Helper()
	backendDir := filepath.Join(stcRepositoryRoot(t), "internal", "resofeed")
	entries, err := os.ReadDir(backendDir)
	if err != nil {
		t.Fatalf("read backend directory %s: %v", backendDir, err)
	}
	var files []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		files = append(files, filepath.Join(backendDir, entry.Name()))
	}
	return files
}

func stcRepositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve repository root: runtime caller unavailable")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}

func stcRepoRelativePath(t *testing.T, path string) string {
	t.Helper()
	rel, err := filepath.Rel(stcRepositoryRoot(t), path)
	if err != nil {
		return path
	}
	return rel
}

func stcStripGoComments(src string) string {
	var out strings.Builder
	state := "code"
	escaped := false
	for i := 0; i < len(src); i++ {
		ch := src[i]
		next := byte(0)
		if i+1 < len(src) {
			next = src[i+1]
		}
		switch state {
		case "code":
			if ch == '/' && next == '/' {
				out.WriteByte(' ')
				i++
				state = "line_comment"
				continue
			}
			if ch == '/' && next == '*' {
				out.WriteByte(' ')
				i++
				state = "block_comment"
				continue
			}
			out.WriteByte(ch)
			if ch == '`' {
				state = "raw_string"
			} else if ch == '"' {
				state = "string"
				escaped = false
			} else if ch == '\'' {
				state = "rune"
				escaped = false
			}
		case "line_comment":
			if ch == '\n' {
				out.WriteByte('\n')
				state = "code"
			}
		case "block_comment":
			if ch == '\n' {
				out.WriteByte('\n')
			}
			if ch == '*' && next == '/' {
				out.WriteByte(' ')
				i++
				state = "code"
			}
		case "raw_string":
			out.WriteByte(ch)
			if ch == '`' {
				state = "code"
			}
		case "string":
			out.WriteByte(ch)
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				state = "code"
			}
		case "rune":
			out.WriteByte(ch)
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '\'' {
				state = "code"
			}
		}
	}
	return out.String()
}

func stcMaskGoStringLiterals(src string) string {
	var out strings.Builder
	state := "code"
	escaped := false
	for i := 0; i < len(src); i++ {
		ch := src[i]
		switch state {
		case "code":
			if ch == '`' {
				out.WriteByte(' ')
				state = "raw_string"
			} else if ch == '"' {
				out.WriteByte(' ')
				state = "string"
				escaped = false
			} else if ch == '\'' {
				out.WriteByte(' ')
				state = "rune"
				escaped = false
			} else {
				out.WriteByte(ch)
			}
		case "raw_string":
			if ch == '\n' {
				out.WriteByte('\n')
			} else {
				out.WriteByte(' ')
			}
			if ch == '`' {
				state = "code"
			}
		case "string":
			if ch == '\n' {
				out.WriteByte('\n')
			} else {
				out.WriteByte(' ')
			}
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				state = "code"
			}
		case "rune":
			out.WriteByte(' ')
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '\'' {
				state = "code"
			}
		}
	}
	return out.String()
}

func stcIdentifierTokens(src string) []string {
	fields := strings.FieldsFunc(src, func(r rune) bool {
		return r != '_' && !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	tokens := make([]string, 0, len(fields))
	for _, field := range fields {
		if field == "" {
			continue
		}
		tokens = append(tokens, field)
	}
	return tokens
}

func stcMapKeys[K comparable, V any](m map[K]V) []K {
	keys := make([]K, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	return keys
}
