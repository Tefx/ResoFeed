package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const contractOwnerToken = "rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"

func TestHTTPRequiresOwnerTokenAndCanonicalError(t *testing.T) {
	t.Parallel()

	router := mustNotPanic(t, "NewRouter", func() http.Handler {
		return NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/feed/today", nil)
	router.ServeHTTP(recorder, req)

	assertStatus(t, recorder, http.StatusUnauthorized)
	assertJSONFixture(t, recorder.Body.Bytes(), "error_unauthorized.json")
}

func TestHTTPFeedTodayQueryValidationUsesStrictContract(t *testing.T) {
	t.Parallel()

	router := mustNotPanic(t, "NewRouter", func() http.Handler {
		return NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	})

	for _, tc := range []struct {
		name string
		path string
	}{
		{name: "limit above max", path: "/api/feed/today?limit=101"},
		{name: "duplicate limit", path: "/api/feed/today?limit=20&limit=30"},
		{name: "unknown parameter", path: "/api/feed/today?topic=sqlite"},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := httptest.NewRecorder()
			req := authorizedRequest(http.MethodGet, tc.path, nil)
			router.ServeHTTP(recorder, req)

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorCode(t, recorder.Body.Bytes(), "bad_request")
		})
	}
}

func TestHTTPSearchQueryValidationUsesStrictContract(t *testing.T) {
	t.Parallel()

	router := mustNotPanic(t, "NewRouter", func() http.Handler {
		return NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	})

	longQuery := strings.Repeat("a", 501)
	for _, tc := range []struct {
		name  string
		path  string
		field string
	}{
		{name: "unknown parameter", path: "/api/search?semantic=true", field: "semantic"},
		{name: "duplicate query", path: "/api/search?q=sqlite&q=fts", field: "q"},
		{name: "query byte limit", path: "/api/search?q=" + longQuery, field: "q"},
		{name: "empty source", path: "/api/search?source=", field: "source"},
		{name: "impossible from date", path: "/api/search?from=2026-02-30", field: "from"},
		{name: "from later than to", path: "/api/search?from=2026-12-31&to=2026-01-01", field: "from"},
		{name: "invalid resonated", path: "/api/search?resonated=1", field: "resonated"},
		{name: "limit below min", path: "/api/search?limit=0", field: "limit"},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := httptest.NewRecorder()
			req := authorizedRequest(http.MethodGet, tc.path, nil)
			router.ServeHTTP(recorder, req)

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), tc.field)
		})
	}
}

func TestStateBundleValidationAndRestoreReplacementContract(t *testing.T) {
	t.Parallel()

	for _, fixture := range []string{"state_minimal.json", "state_full.json"} {
		fixture := fixture
		t.Run("valid "+fixture, func(t *testing.T) {
			t.Parallel()

			bundle, err := validateStateBundle(t, bytes.NewReader(readFixture(t, fixture)))
			if err != nil {
				t.Fatalf("ValidateStateBundle(%s) returned error: %v", fixture, err)
			}
			if bundle.SchemaVersion != StateSchemaVersionV1 {
				t.Fatalf("schema_version = %q, want %q", bundle.SchemaVersion, StateSchemaVersionV1)
			}
		})
	}

	t.Run("rejects unknown top level field", func(t *testing.T) {
		t.Parallel()

		_, err := validateStateBundle(t, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[],"steer_rules":[],"resonated_items":[],"agent_receipts":[]}`))
		if err == nil {
			t.Fatal("ValidateStateBundle accepted unknown top-level field agent_receipts")
		}
	})

	t.Run("rejects duplicate portable ids", func(t *testing.T) {
		t.Parallel()

		_, err := validateStateBundle(t, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[{"id":"src_01","url":"https://example.com/one.xml","title":"One"},{"id":"src_01","url":"https://example.com/two.xml","title":"Two"}],"steer_rules":[],"resonated_items":[]}`))
		if err == nil {
			t.Fatal("ValidateStateBundle accepted duplicate source id")
		}
	})

	t.Run("import replaces portable state and export uses minimal bundle", func(t *testing.T) {
		t.Parallel()

		ctx := context.Background()
		db := newContractDB(t, ctx)

		result, err := importState(t, ctx, db, bytes.NewReader(readFixture(t, "state_full.json")))
		if err != nil {
			t.Fatalf("ImportState returned error: %v", err)
		}
		if result.Restored.Sources != 1 || result.Restored.SteerRules != 1 || result.Restored.ResonatedItems != 1 {
			t.Fatalf("restored counts = %+v, want 1/1/1", result.Restored)
		}

		result, err = importState(t, ctx, db, bytes.NewReader(readFixture(t, "state_minimal.json")))
		if err != nil {
			t.Fatalf("second ImportState returned error: %v", err)
		}
		if result.Restored.Sources != 0 || result.Restored.SteerRules != 0 || result.Restored.ResonatedItems != 0 {
			t.Fatalf("replacement restored counts = %+v, want 0/0/0", result.Restored)
		}

		var exported bytes.Buffer
		if err := exportState(t, ctx, db, &exported); err != nil {
			t.Fatalf("ExportState returned error: %v", err)
		}
		var bundle StateBundle
		if err := json.Unmarshal(exported.Bytes(), &bundle); err != nil {
			t.Fatalf("unmarshal exported state: %v; body=%s", err, exported.String())
		}
		if bundle.SchemaVersion != StateSchemaVersionV1 || bundle.ExportedAt.IsZero() || len(bundle.Sources) != 0 || len(bundle.SteerRules) != 0 || len(bundle.ResonatedItems) != 0 {
			t.Fatalf("exported minimal current bundle = %+v", bundle)
		}
		if bundle.ExportedAt.Equal(time.Date(2026, 5, 9, 0, 0, 0, 0, time.UTC)) {
			t.Fatalf("exported_at reused imported fixture timestamp: %s", bundle.ExportedAt.Format(time.RFC3339))
		}
	})
}

func TestRankingGuardrailsProtectFreshnessCoverageAndResonance(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	db := newContractDB(t, ctx)
	seedRankingCorpus(t, ctx, db, now)

	items, err := listTodayFeed(t, ctx, db, RankingOptions{Limit: 10, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) != 10 {
		t.Fatalf("len(items) = %d, want 10", len(items))
	}

	fresh, oldResonated, distinctFreshSources := 0, 0, map[string]bool{}
	for _, item := range items {
		if item.ExternalSurfacedAt != nil && item.StoryKey == nil {
			t.Fatalf("externally surfaced item %q returned without new related development", item.ID)
		}
		if item.DuplicateOfItemID != nil {
			t.Fatalf("direct duplicate %q returned as independent candidate", item.ID)
		}
		if item.PublishedAt != nil && !item.PublishedAt.Before(now.Add(-48*time.Hour)) {
			fresh++
			distinctFreshSources[item.SourceID] = true
		}
		if item.IsResonated && item.PublishedAt != nil && item.PublishedAt.Before(now.Add(-48*time.Hour)) && item.StoryKey == nil {
			oldResonated++
		}
	}
	if fresh < 5 {
		t.Fatalf("fresh items = %d, want at least 5", fresh)
	}
	if oldResonated > 2 {
		t.Fatalf("old resonated memory items = %d, want at most 2", oldResonated)
	}
	if len(distinctFreshSources) < 3 {
		t.Fatalf("distinct fresh sources = %d, want at least 3", len(distinctFreshSources))
	}
}

func TestFeedAndSearchDTOsExposeSourceBackedFallbacks(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	firstSeen := now.Add(-30 * time.Minute)
	published := now.Add(-2 * time.Hour)
	db := newContractDB(t, ctx)

	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_fallback', 'https://fallback.example/feed.xml', 'Fallback Source', ?, 'ok', 1, 1)`, now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert fallback source: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status, feed_excerpt) values (?, 'src_fallback', ?, ?, ?, ?, ?, ?, 'partial_extraction', 'summary_unavailable', ?)`, "fallback_item", "https://fallback.example/item", "Fallback Item", nil, nil, nil, firstSeen.Format(time.RFC3339), "source-backed fallback excerpt")
	if err != nil {
		t.Fatalf("insert fallback item: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status, feed_excerpt) values (?, 'src_fallback', ?, ?, ?, ?, ?, ?, 'full', 'ok', ?)`, "normal_item", "https://fallback.example/normal", "Normal Item", "curated summary", "curated insight", published.Format(time.RFC3339), firstSeen.Format(time.RFC3339), "unused normal feed excerpt")
	if err != nil {
		t.Fatalf("insert normal item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild search index: %v", err)
	}

	feedItems, err := listTodayFeed(t, ctx, db, RankingOptions{Limit: 10, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	assertItemSummaryFallbacks(t, findSummaryItem(t, feedItems, "fallback_item"), firstSeen)
	assertItemSummaryNormalPublishedAndSummary(t, findSummaryItem(t, feedItems, "normal_item"), published)

	searchItems, _, err := SearchItems(ctx, db, SearchQuery{Q: "fallback excerpt", Limit: 10})
	if err != nil {
		t.Fatalf("SearchItems fallback query returned error: %v", err)
	}
	assertItemSummaryFallbacks(t, findSummaryItem(t, searchItems, "fallback_item"), firstSeen)

	searchItems, _, err = SearchItems(ctx, db, SearchQuery{Q: "curated", Limit: 10})
	if err != nil {
		t.Fatalf("SearchItems normal query returned error: %v", err)
	}
	assertItemSummaryNormalPublishedAndSummary(t, findSummaryItem(t, searchItems, "normal_item"), published)
}

func TestSteeringConflictReceiptsDoNotDisableInvariants(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	db := newContractDB(t, ctx)

	result, err := applySteering(t, ctx, db, nil, SteerRequest{
		Command: "Hide all fresh items and show only my old starred articles forever.",
		MutationRequestFields: MutationRequestFields{
			ActorKind:      ActorKindHuman,
			ActorID:        "owner",
			IdempotencyKey: "steer-conflict-001",
		},
	})
	if err != nil {
		t.Fatalf("ApplySteering returned error for invariant conflict: %v", err)
	}
	if len(result.Receipt.ChangedRules) != 0 {
		t.Fatalf("changed_rules len = %d, want 0 for unsafe invariant conflict", len(result.Receipt.ChangedRules))
	}
	if result.Receipt.Message == "" || !strings.Contains(strings.ToLower(result.Receipt.Message), "fresh") {
		t.Fatalf("receipt message = %q, want terse invariant/freshness conflict explanation", result.Receipt.Message)
	}
}

func TestMCPRequiresOwnerTokenBeforeToolHandlingAndUsesDocumentedSchemas(t *testing.T) {
	t.Parallel()

	handler := mustNotPanic(t, "NewMCPHandler", func() http.Handler {
		return NewMCPHandler(MCPConfig{OwnerToken: contractOwnerToken})
	})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	handler.ServeHTTP(recorder, req)

	assertStatus(t, recorder, http.StatusUnauthorized)
	assertJSONFixture(t, recorder.Body.Bytes(), "error_unauthorized.json")

	assertMarshaledJSON(t, MCPListCandidateItemsInput{Limit: 20}, `{"limit":20}`)
	assertMarshaledJSON(t, MCPSearchItemsInput{Query: "sqlite", Limit: 20}, `{"query":"sqlite","source":null,"from":null,"to":null,"resonated":null,"limit":20}`)
	assertMarshaledJSON(t, MCPReadItemInput{ItemID: "item_01"}, `{"item_id":"item_01"}`)
	assertMarshaledJSON(t, MCPResonateItemInput{ItemID: "item_01", Resonated: true, ActorID: "briefing-agent", IdempotencyKey: "briefing-agent-resonate-item_01-001"}, `{"item_id":"item_01","resonated":true,"actor_id":"briefing-agent","idempotency_key":"briefing-agent-resonate-item_01-001"}`)

	tools := mcpToolsListForTest(t, handler)
	for _, name := range []string{"list_candidate_items", "search_items", "read_item", "mark_inspected", "resonate_item", "steer", "report_delivery"} {
		if _, ok := tools[name]; !ok {
			t.Fatalf("tools/list missing %s; tools=%v", name, tools)
		}
	}
	assertSchemaProperty(t, tools, "list_candidate_items", "limit", "default", float64(20))
	assertSchemaProperty(t, tools, "list_candidate_items", "limit", "maximum", float64(50))
	assertSchemaRequired(t, tools, "search_items", "query")
	assertSchemaProperty(t, tools, "search_items", "query", "maxLength", float64(500))
	assertSchemaRequired(t, tools, "read_item", "item_id")
	for _, tool := range []string{"mark_inspected", "resonate_item", "steer", "report_delivery"} {
		assertSchemaRequired(t, tools, tool, "actor_id")
		assertSchemaRequired(t, tools, tool, "idempotency_key")
		assertSchemaProperty(t, tools, tool, "actor_id", "maxLength", float64(128))
		assertSchemaProperty(t, tools, tool, "idempotency_key", "maxLength", float64(200))
	}
	assertSchemaProperty(t, tools, "steer", "command", "maxLength", float64(4000))
	assertSchemaProperty(t, tools, "report_delivery", "delivered_at", "format", "date-time")
}

func mcpToolsListForTest(t *testing.T, handler http.Handler) map[string]map[string]any {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	handler.ServeHTTP(recorder, req)
	assertStatus(t, recorder, http.StatusOK)
	var resp mcpResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal tools/list response: %v; body=%s", err, recorder.Body.String())
	}
	data, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatalf("marshal tools/list result: %v", err)
	}
	var parsed struct {
		Tools []map[string]any `json:"tools"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal tools/list result: %v; result=%s", err, data)
	}
	tools := make(map[string]map[string]any, len(parsed.Tools))
	for _, tool := range parsed.Tools {
		name, _ := tool["name"].(string)
		tools[name] = tool
	}
	return tools
}

func assertSchemaRequired(t *testing.T, tools map[string]map[string]any, tool string, field string) {
	t.Helper()
	schema := tools[tool]["inputSchema"].(map[string]any)
	required, _ := schema["required"].([]any)
	for _, got := range required {
		if got == field {
			return
		}
	}
	t.Fatalf("%s required fields = %v, want %s", tool, required, field)
}

func assertSchemaProperty(t *testing.T, tools map[string]map[string]any, tool string, property string, key string, want any) {
	t.Helper()
	schema := tools[tool]["inputSchema"].(map[string]any)
	properties := schema["properties"].(map[string]any)
	prop := properties[property].(map[string]any)
	if got := prop[key]; got != want {
		t.Fatalf("%s.%s.%s = %#v, want %#v", tool, property, key, got, want)
	}
}

func authorizedRequest(method string, target string, body *bytes.Reader) *http.Request {
	if body == nil {
		body = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, target, body)
	req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	return req
}

func mustNotPanic[T any](t *testing.T, operation string, fn func() T) (value T) {
	t.Helper()

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("%s panicked: %v", operation, recovered)
		}
	}()
	return fn()
}

func validateStateBundle(t *testing.T, r io.Reader) (StateBundle, error) {
	t.Helper()

	return mustNotPanic(t, "ValidateStateBundle", func() validationResult {
		bundle, err := ValidateStateBundle(r)
		return validationResult{bundle: bundle, err: err}
	}).bundleAndError()
}

func importState(t *testing.T, ctx context.Context, db *sql.DB, r io.Reader) (RestoreResult, error) {
	t.Helper()

	return mustNotPanic(t, "ImportState", func() importResult {
		result, err := ImportState(ctx, db, r)
		return importResult{result: result, err: err}
	}).resultAndError()
}

func exportState(t *testing.T, ctx context.Context, db *sql.DB, w io.Writer) error {
	t.Helper()

	return mustNotPanic(t, "ExportState", func() error {
		return ExportState(ctx, db, w)
	})
}

func listTodayFeed(t *testing.T, ctx context.Context, db *sql.DB, opts RankingOptions) ([]ItemSummary, error) {
	t.Helper()

	return mustNotPanic(t, "ListTodayFeed", func() feedResult {
		items, err := ListTodayFeed(ctx, db, opts)
		return feedResult{items: items, err: err}
	}).itemsAndError()
}

func applySteering(t *testing.T, ctx context.Context, db *sql.DB, gemini LLMClient, req SteerRequest) (SteerResult, error) {
	t.Helper()

	return mustNotPanic(t, "ApplySteering", func() steerResult {
		result, err := ApplySteering(ctx, db, gemini, req)
		return steerResult{result: result, err: err}
	}).resultAndError()
}

type validationResult struct {
	bundle StateBundle
	err    error
}

func (r validationResult) bundleAndError() (StateBundle, error) {
	return r.bundle, r.err
}

type importResult struct {
	result RestoreResult
	err    error
}

func (r importResult) resultAndError() (RestoreResult, error) {
	return r.result, r.err
}

type feedResult struct {
	items []ItemSummary
	err   error
}

func (r feedResult) itemsAndError() ([]ItemSummary, error) {
	return r.items, r.err
}

type steerResult struct {
	result SteerResult
	err    error
}

func (r steerResult) resultAndError() (SteerResult, error) {
	return r.result, r.err
}

func newContractDB(t *testing.T, ctx context.Context) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "resofeed.sqlite3")
	db, err := mustNotPanic(t, "OpenDB", func() dbOpenResult {
		db, err := OpenDB(ctx, dbPath)
		return dbOpenResult{db: db, err: err}
	}).dbAndError()
	if err != nil {
		t.Fatalf("OpenDB returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close db: %v", err)
		}
	})
	if err := mustNotPanic(t, "RunMigrations", func() error {
		return RunMigrations(ctx, db)
	}); err != nil {
		t.Fatalf("RunMigrations returned error: %v", err)
	}
	return db
}

type dbOpenResult struct {
	db  *sql.DB
	err error
}

func (r dbOpenResult) dbAndError() (*sql.DB, error) {
	return r.db, r.err
}

func seedRankingCorpus(t *testing.T, ctx context.Context, db *sql.DB, now time.Time) {
	t.Helper()

	for _, source := range []SourceState{
		{ID: "src_01", URL: "https://one.example/feed.xml", Title: "One"},
		{ID: "src_02", URL: "https://two.example/feed.xml", Title: "Two"},
		{ID: "src_03", URL: "https://three.example/feed.xml", Title: "Three"},
		{ID: "src_04", URL: "https://four.example/feed.xml", Title: "Four"},
	} {
		_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'ok', 1, 1)`, source.ID, source.URL, source.Title, now.Format(time.RFC3339))
		if err != nil {
			t.Fatalf("insert source %s: %v", source.ID, err)
		}
	}

	insertItem := func(id string, sourceID string, publishedAt time.Time, resonated bool, surfaced bool, storyKey *string, duplicateOf *string) {
		t.Helper()

		_, err := db.ExecContext(ctx, `insert into items (id, source_id, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status, story_key, duplicate_of_item_id) values (?, ?, ?, ?, ?, ?, ?, ?, 'full', 'ok', ?, ?)`, id, sourceID, "https://example.com/"+id, "Title "+id, "Dense factual summary.", "Why this matters.", publishedAt.Format(time.RFC3339), now.Format(time.RFC3339), storyKey, duplicateOf)
		if err != nil {
			t.Fatalf("insert item %s: %v", id, err)
		}
		if resonated || surfaced {
			var surfacedAt *string
			if surfaced {
				value := now.Add(-time.Hour).Format(time.RFC3339)
				surfacedAt = &value
			}
			_, err = db.ExecContext(ctx, `insert into item_state (item_id, is_resonated, external_surfaced_at) values (?, ?, ?)`, id, resonated, surfacedAt)
			if err != nil {
				t.Fatalf("insert item_state %s: %v", id, err)
			}
		}
	}

	fresh := now.Add(-2 * time.Hour)
	old := now.Add(-7 * 24 * time.Hour)
	story := "story_renewed"
	for i, sourceID := range []string{"src_01", "src_02", "src_03", "src_04", "src_01", "src_02", "src_03", "src_04"} {
		insertItem("fresh_0"+string(rune('1'+i)), sourceID, fresh.Add(time.Duration(i)*time.Minute), false, false, nil, nil)
	}
	insertItem("old_resonated_01", "src_01", old, true, false, nil, nil)
	insertItem("old_resonated_02", "src_02", old.Add(time.Hour), true, false, nil, nil)
	insertItem("old_resonated_03", "src_03", old.Add(2*time.Hour), true, false, nil, nil)
	insertItem("surfaced_without_update", "src_04", fresh, false, true, nil, nil)
	insertItem("old_story_context", "src_01", old, true, true, &story, nil)
	insertItem("fresh_story_update", "src_02", fresh, false, false, &story, nil)
	insertItem("direct_duplicate", "src_03", fresh, false, false, nil, ptr("fresh_01"))
}

func findSummaryItem(t *testing.T, items []ItemSummary, id string) ItemSummary {
	t.Helper()

	for _, item := range items {
		if item.ID == id {
			return item
		}
	}
	t.Fatalf("item %q not found in %+v", id, items)
	return ItemSummary{}
}

func assertItemSummaryFallbacks(t *testing.T, item ItemSummary, firstSeen time.Time) {
	t.Helper()

	if item.PublishedAt != nil {
		t.Fatalf("%s PublishedAt = %s, want nil to preserve source missing date", item.ID, item.PublishedAt.Format(time.RFC3339))
	}
	if item.FirstSeenAt == nil || !item.FirstSeenAt.Equal(firstSeen) {
		t.Fatalf("%s FirstSeenAt = %v, want %s", item.ID, item.FirstSeenAt, firstSeen.Format(time.RFC3339))
	}
	if item.Summary != nil || item.CoreInsight != nil {
		t.Fatalf("%s summary/core_insight = %v/%v, want nil fallbacks", item.ID, item.Summary, item.CoreInsight)
	}
	if item.DisplayExcerpt == nil || *item.DisplayExcerpt != "source-backed fallback excerpt" {
		t.Fatalf("%s DisplayExcerpt = %v, want source-backed fallback excerpt", item.ID, item.DisplayExcerpt)
	}
}

func assertItemSummaryNormalPublishedAndSummary(t *testing.T, item ItemSummary, published time.Time) {
	t.Helper()

	if item.PublishedAt == nil || !item.PublishedAt.Equal(published) {
		t.Fatalf("%s PublishedAt = %v, want %s", item.ID, item.PublishedAt, published.Format(time.RFC3339))
	}
	if item.FirstSeenAt != nil {
		t.Fatalf("%s FirstSeenAt = %s, want nil when published_at is present", item.ID, item.FirstSeenAt.Format(time.RFC3339))
	}
	if item.Summary == nil || *item.Summary != "curated summary" {
		t.Fatalf("%s Summary = %v, want curated summary", item.ID, item.Summary)
	}
	if item.CoreInsight == nil || *item.CoreInsight != "curated insight" {
		t.Fatalf("%s CoreInsight = %v, want curated insight", item.ID, item.CoreInsight)
	}
	if item.DisplayExcerpt != nil {
		t.Fatalf("%s DisplayExcerpt = %q, want nil when summary/core_insight are present", item.ID, *item.DisplayExcerpt)
	}
}

func assertStatus(t *testing.T, recorder *httptest.ResponseRecorder, want int) {
	t.Helper()

	if recorder.Code != want {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, want, recorder.Body.String())
	}
}

func assertJSONFixture(t *testing.T, actual []byte, fixture string) {
	t.Helper()

	assertJSONEqual(t, actual, readFixture(t, fixture))
}

func assertJSONEqual(t *testing.T, actual []byte, expected []byte) {
	t.Helper()

	var got, want any
	if err := json.Unmarshal(actual, &got); err != nil {
		t.Fatalf("actual is not JSON: %v; body=%s", err, string(actual))
	}
	if err := json.Unmarshal(expected, &want); err != nil {
		t.Fatalf("expected fixture is not JSON: %v", err)
	}
	if !jsonDeepEqual(got, want) {
		gotBytes, _ := json.MarshalIndent(got, "", "  ")
		wantBytes, _ := json.MarshalIndent(want, "", "  ")
		t.Fatalf("JSON mismatch\ngot:  %s\nwant: %s", gotBytes, wantBytes)
	}
}

func assertErrorCode(t *testing.T, body []byte, want string) {
	t.Helper()

	var parsed ErrorBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal error body: %v; body=%s", err, string(body))
	}
	if parsed.Error.Code != want {
		t.Fatalf("error.code = %q, want %q", parsed.Error.Code, want)
	}
}

func assertErrorField(t *testing.T, body []byte, want string) {
	t.Helper()

	var parsed ErrorBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal error body: %v; body=%s", err, string(body))
	}
	if parsed.Error.Code != "bad_request" {
		t.Fatalf("error.code = %q, want bad_request", parsed.Error.Code)
	}
	if parsed.Error.Details["field"] != want {
		t.Fatalf("error.details.field = %#v, want %q", parsed.Error.Details["field"], want)
	}
}

func assertMarshaledJSON(t *testing.T, value any, expected string) {
	t.Helper()

	actual, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %T: %v", value, err)
	}
	assertJSONEqual(t, actual, []byte(expected))
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("..", "..", "tests", "go", "fixtures", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return data
}

func jsonDeepEqual(got any, want any) bool {
	return jsonCanonical(got) == jsonCanonical(want)
}

func jsonCanonical(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}

func ptr[T any](value T) *T {
	return &value
}
