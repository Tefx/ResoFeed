package resofeed

// expected_result: red
// These tests lock the Tavily operation persistence matrix from
// docs/TAVILY_EXTERNAL_EXTRACTION_PLAN.md after local readable and RSS/stored
// source evidence have failed. They intentionally add no production Tavily
// support; current failures should be semantic/runtime reds, not compile errors.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const (
	tavilyExtractionSourceExternal = "external_tavily"
	tavilyExtractionSourceLocal    = "local_readable"
	tavilyExtractionSourceNone     = "none"
	tavilyPriorSummaryToken        = "priorpreservedsummary"
	tavilySuccessSummaryToken      = "tavilysuccesssummary"
)

func TestTavilyOperationPersistenceNormalIngestManualFetchExpectedRed(t *testing.T) {
	for _, tc := range tavilyOperationMatrixCases() {
		t.Run(tc.name, func(t *testing.T) {
			resetIngestCoordinatorForTest(t)
			ctx := context.Background()
			db := newContractDB(t, ctx)
			tavilyConfigureKeyForCase(t, tc)
			shim := tavilyInstallHTTPShim(t, tc)

			itemURL := "mailto:not-eligible@example.test"
			article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				http.NotFound(w, nil)
			}))
			t.Cleanup(article.Close)
			if tc.eligibleURL {
				itemURL = article.URL + "/article-" + tc.name
			}

			entry := feedEntry{ID: "guid-" + tc.name, Title: "Tavily Matrix Item " + tc.name, URL: itemURL, Description: ""}
			feed := tavilyRSSServer(t, entry)
			source := Source{ID: "src_tavily_normal_" + tc.name, URL: feed.URL + "/feed.xml", Title: "Tavily Normal Source " + tc.name}
			seedSource(t, ctx, db, source.ID, source.URL, source.Title)
			itemID := ingestedItemID(source, entry)
			tavilySeedPriorGeneratedItem(t, ctx, db, itemID, source.ID, source.URL, itemURL, "")
			assertReprocessIndexReady(t, ctx, db)

			llm := &tavilyPersistenceLLM{}
			_, err := ManualFetchSource(ctx, db, IngestConfig{LLM: llm, FirstFetchMaxItems: 0, FirstFetchMaxItemsSet: true}, source.ID)
			if err != nil {
				t.Fatalf("ManualFetchSource returned error: %v", err)
			}
			tavilyAssertProviderCalls(t, shim, tc.wantTavilyCalls)

			if tc.kind == tavilyMatrixSuccess {
				tavilyAssertLLMInput(t, llm, itemID, tavilySuccessfulEvidence())
				state := tavilyReadItemState(t, ctx, db, itemID)
				tavilyAssertSuccessState(t, state, itemID, tavilyNormalAttempt)
				tavilyAssertFTSRefreshed(t, ctx, db, itemID)
				return
			}

			if calls := llm.callCount(); calls != 0 {
				t.Fatalf("OpenRouter calls = %d, want 0 when Tavily stage does not select usable source evidence", calls)
			}
			state := tavilyReadItemState(t, ctx, db, itemID)
			tavilyAssertNormalPreservedWithDiagnostics(t, state, tc.wantErrorCode)
			tavilyAssertFTSPreserved(t, ctx, db, itemID)
		})
	}
}

func TestTavilyOperationPersistenceLibraryReprocessExpectedRed(t *testing.T) {
	for _, tc := range tavilyOperationMatrixCases() {
		t.Run(tc.name, func(t *testing.T) {
			resetIngestCoordinatorForTest(t)
			ctx := context.Background()
			db := newContractDB(t, ctx)
			tavilyConfigureKeyForCase(t, tc)
			shim := tavilyInstallHTTPShim(t, tc)

			itemURL := tavilyArticleURLForCase(t, tc)
			seedSource(t, ctx, db, "src_tavily_library_"+tc.name, "https://feeds.example.test/"+tc.name+".xml", "Tavily Library Source")
			itemID := "item_tavily_library_" + tc.name
			tavilySeedPriorGeneratedItem(t, ctx, db, itemID, "src_tavily_library_"+tc.name, "https://feeds.example.test/"+tc.name+".xml", itemURL, "")
			assertReprocessIndexReady(t, ctx, db)

			llm := &tavilyPersistenceLLM{}
			resp, err := ReprocessLibrary(ctx, db, llm, ReprocessLibraryRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "tavily-library-" + tc.name}})
			if err != nil {
				t.Fatalf("ReprocessLibrary returned error: %v", err)
			}
			tavilyAssertProviderCalls(t, shim, tc.wantTavilyCalls)
			tavilyAssertLibraryCounts(t, resp.Reprocess, tc)

			state := tavilyReadItemState(t, ctx, db, itemID)
			switch tc.kind {
			case tavilyMatrixSuccess:
				tavilyAssertLLMInput(t, llm, itemID, tavilySuccessfulEvidence())
				tavilyAssertSuccessState(t, state, itemID, tavilyReprocessAttempt)
				tavilyAssertFTSRefreshed(t, ctx, db, itemID)
			case tavilyMatrixUnavailable:
				if calls := llm.callCount(); calls != 0 {
					t.Fatalf("OpenRouter calls = %d, want 0 for unavailable Tavily-stage source evidence", calls)
				}
				tavilyAssertUnavailableRewriteState(t, state, itemURL, tc.wantErrorCode)
				tavilyAssertFTSUnavailableRewrite(t, ctx, db, itemID)
			case tavilyMatrixOperationalFailure:
				if calls := llm.callCount(); calls != 0 {
					t.Fatalf("OpenRouter calls = %d, want 0 for Tavily operational failure before source text selection", calls)
				}
				tavilyAssertPreservedFailureState(t, state, tc.wantErrorCode)
				tavilyAssertFTSPreserved(t, ctx, db, itemID)
			}
		})
	}
}

func TestTavilyOperationPersistenceSelectedItemReingestExpectedRed(t *testing.T) {
	for _, tc := range tavilyOperationMatrixCases() {
		t.Run(tc.name, func(t *testing.T) {
			resetIngestCoordinatorForTest(t)
			ctx := context.Background()
			db := newContractDB(t, ctx)
			tavilyConfigureKeyForCase(t, tc)
			shim := tavilyInstallHTTPShim(t, tc)

			itemURL := tavilyArticleURLForCase(t, tc)
			seedSource(t, ctx, db, "src_tavily_reingest_"+tc.name, "https://feeds.example.test/reingest-"+tc.name+".xml", "Tavily Reingest Source")
			itemID := "item_tavily_reingest_" + tc.name
			tavilySeedPriorGeneratedItem(t, ctx, db, itemID, "src_tavily_reingest_"+tc.name, "https://feeds.example.test/reingest-"+tc.name+".xml", itemURL, "")
			assertReprocessIndexReady(t, ctx, db)

			llm := &tavilyPersistenceLLM{}
			resp, err := ReingestItem(ctx, db, llm, itemID, ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "tavily-reingest-" + tc.name}})
			if err != nil {
				t.Fatalf("ReingestItem returned error: %v", err)
			}
			tavilyAssertProviderCalls(t, shim, tc.wantTavilyCalls)

			state := tavilyReadItemState(t, ctx, db, itemID)
			switch tc.kind {
			case tavilyMatrixSuccess:
				tavilyAssertLLMInput(t, llm, itemID, tavilySuccessfulEvidence())
				if resp.Reingest.Status != ReprocessStatusCompleted || resp.Reingest.Error != nil || !resp.Reingest.ItemUpdated || !resp.Reingest.FTSUpdated || resp.Reingest.Item == nil {
					t.Fatalf("selected reingest success = %+v, want completed item_updated/fts_updated with refreshed detail", resp.Reingest)
				}
				tavilyAssertSuccessState(t, state, itemID, tavilyReprocessAttempt)
				tavilyAssertFTSRefreshed(t, ctx, db, itemID)
			case tavilyMatrixUnavailable, tavilyMatrixOperationalFailure:
				if calls := llm.callCount(); calls != 0 {
					t.Fatalf("OpenRouter calls = %d, want 0 for failed Tavily source-acquisition", calls)
				}
				if resp.Reingest.Status != ReprocessStatusCompletedWithErrors || resp.Reingest.Error == nil || resp.Reingest.Error.Code != tc.wantErrorCode || resp.Reingest.ItemUpdated || resp.Reingest.FTSUpdated {
					t.Fatalf("selected reingest failure = %+v, want non-destructive completed_with_errors code=%q item_updated=false fts_updated=false", resp.Reingest, tc.wantErrorCode)
				}
				tavilyAssertPreservedFailureState(t, state, tc.wantErrorCode)
				tavilyAssertFTSPreserved(t, ctx, db, itemID)
			}
		})
	}
}

type tavilyMatrixKind string

const (
	tavilyMatrixSuccess            tavilyMatrixKind = "success"
	tavilyMatrixUnavailable        tavilyMatrixKind = "unavailable"
	tavilyMatrixOperationalFailure tavilyMatrixKind = "operational_failure"
)

type tavilyProviderMode string

const (
	tavilyProviderSuccess        tavilyProviderMode = "success"
	tavilyProviderUnusable       tavilyProviderMode = "unusable"
	tavilyProviderTimeout        tavilyProviderMode = "timeout"
	tavilyProviderNetworkFailure tavilyProviderMode = "provider_network"
	tavilyProviderHTTPFailure    tavilyProviderMode = "provider_http"
	tavilyProviderSchemaFailure  tavilyProviderMode = "provider_schema"
	tavilyProviderUnreadableBody tavilyProviderMode = "provider_unreadable_body"
)

type tavilyOperationCase struct {
	name             string
	kind             tavilyMatrixKind
	providerMode     tavilyProviderMode
	keyConfigured    bool
	eligibleURL      bool
	wantTavilyCalls  int
	wantErrorCode    ReprocessErrorCode
	wantItemsUpdated int
	wantUnavailable  int
	wantFailed       int
}

func tavilyOperationMatrixCases() []tavilyOperationCase {
	return []tavilyOperationCase{
		{name: "success_openrouter_ok", kind: tavilyMatrixSuccess, providerMode: tavilyProviderSuccess, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantItemsUpdated: 1},
		{name: "missing_key", kind: tavilyMatrixUnavailable, keyConfigured: false, eligibleURL: true, wantTavilyCalls: 0, wantErrorCode: ReprocessErrorOriginalUnavailable, wantUnavailable: 1},
		{name: "no_eligible_url", kind: tavilyMatrixUnavailable, keyConfigured: true, eligibleURL: false, wantTavilyCalls: 0, wantErrorCode: ReprocessErrorOriginalUnavailable, wantUnavailable: 1},
		{name: "sanitized_unusable_evidence", kind: tavilyMatrixUnavailable, providerMode: tavilyProviderUnusable, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantErrorCode: ReprocessErrorOriginalUnavailable, wantUnavailable: 1},
		{name: "timeout", kind: tavilyMatrixOperationalFailure, providerMode: tavilyProviderTimeout, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantErrorCode: ReprocessErrorTimeout, wantFailed: 1},
		{name: "provider_network_failure", kind: tavilyMatrixOperationalFailure, providerMode: tavilyProviderNetworkFailure, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantErrorCode: ReprocessErrorProviderError, wantFailed: 1},
		{name: "provider_http_failure", kind: tavilyMatrixOperationalFailure, providerMode: tavilyProviderHTTPFailure, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantErrorCode: ReprocessErrorProviderError, wantFailed: 1},
		{name: "provider_schema_failure", kind: tavilyMatrixOperationalFailure, providerMode: tavilyProviderSchemaFailure, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantErrorCode: ReprocessErrorProviderError, wantFailed: 1},
		{name: "provider_unreadable_body", kind: tavilyMatrixOperationalFailure, providerMode: tavilyProviderUnreadableBody, keyConfigured: true, eligibleURL: true, wantTavilyCalls: 1, wantErrorCode: ReprocessErrorProviderError, wantFailed: 1},
	}
}

type tavilyAttemptSurface string

const (
	tavilyNormalAttempt    tavilyAttemptSurface = "normal"
	tavilyReprocessAttempt tavilyAttemptSurface = "reprocess"
)

type tavilyPersistenceLLM struct {
	mu     sync.Mutex
	inputs []OpenRouterSummaryInput
}

func (l *tavilyPersistenceLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.mu.Lock()
	l.inputs = append(l.inputs, input)
	l.mu.Unlock()
	return tavilySummaryOutput(input.ItemID), nil
}

func (l *tavilyPersistenceLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l *tavilyPersistenceLLM) callCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.inputs)
}

func (l *tavilyPersistenceLLM) inputFor(itemID string) (OpenRouterSummaryInput, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, input := range l.inputs {
		if input.ItemID == itemID {
			return input, true
		}
	}
	return OpenRouterSummaryInput{}, false
}

func tavilyAssertLLMInput(t *testing.T, llm *tavilyPersistenceLLM, itemID string, wantEvidence string) {
	t.Helper()
	input, ok := llm.inputFor(itemID)
	if !ok {
		t.Fatalf("OpenRouter input for %s missing; Tavily success must feed external evidence into OpenRouter", itemID)
	}
	if input.AvailableText != wantEvidence {
		t.Fatalf("OpenRouter available_text for %s = %q, want sanitized Tavily evidence %q", itemID, input.AvailableText, wantEvidence)
	}
	if input.AvailableTextSource != tavilyExtractionSourceExternal {
		t.Fatalf("OpenRouter available_text_source for %s = %q, want %q", itemID, input.AvailableTextSource, tavilyExtractionSourceExternal)
	}
}

func tavilySummaryOutput(itemID string) OpenRouterSummaryOutput {
	return OpenRouterSummaryOutput{
		LocalizedTitle: tavilyGeneratedTitle(itemID),
		Title:          tavilyGeneratedTitle(itemID),
		Summary:        tavilyExpectedSummary(itemID),
		CoreInsight:    tavilyExpectedCoreInsight(itemID),
		KeyPoints: []string{
			"tavilysuccesspointone source-backed detail for " + itemID + ".",
			"tavilysuccesspointtwo source-backed detail for " + itemID + ".",
			"tavilysuccesspointthree source-backed detail for " + itemID + ".",
		},
		FeedExcerpt:   "tavily generated display excerpt " + itemID,
		ExtractedText: "tavily generated representative text " + itemID,
		ValueTier:     "high",
		ModelStatus:   modelStatusOK,
	}
}

func tavilyGeneratedTitle(itemID string) string { return "Tavily generated title " + itemID }
func tavilyExpectedSummary(itemID string) string {
	return tavilySuccessSummaryToken + " source-backed summary for " + itemID + "."
}
func tavilyExpectedCoreInsight(itemID string) string {
	return "tavilysuccessinsight source-backed insight for " + itemID + "."
}

func tavilyConfigureKeyForCase(t *testing.T, tc tavilyOperationCase) {
	t.Helper()
	old, hadOld := os.LookupEnv("TAVILY_API_KEY")
	if tc.keyConfigured {
		if err := os.Setenv("TAVILY_API_KEY", "fake-tavily-key-for-operation-persistence-tests"); err != nil {
			t.Fatalf("set TAVILY_API_KEY: %v", err)
		}
	} else {
		if err := os.Unsetenv("TAVILY_API_KEY"); err != nil {
			t.Fatalf("unset TAVILY_API_KEY: %v", err)
		}
	}
	t.Cleanup(func() {
		if hadOld {
			_ = os.Setenv("TAVILY_API_KEY", old)
		} else {
			_ = os.Unsetenv("TAVILY_API_KEY")
		}
	})
}

type tavilyHTTPShim struct {
	fallback http.RoundTripper
	mode     tavilyProviderMode
	calls    atomic.Int64
}

func tavilyInstallHTTPShim(t *testing.T, tc tavilyOperationCase) *tavilyHTTPShim {
	t.Helper()
	oldClient := http.DefaultClient
	fallback := http.DefaultTransport
	if oldClient != nil && oldClient.Transport != nil {
		fallback = oldClient.Transport
	}
	shim := &tavilyHTTPShim{fallback: fallback, mode: tc.providerMode}
	http.DefaultClient = &http.Client{Transport: shim}
	t.Cleanup(func() { http.DefaultClient = oldClient })
	return shim
}

func (s *tavilyHTTPShim) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host == "api.tavily.com" && (req.URL.Path == "/extract" || req.URL.Path == "/extract/") {
		s.calls.Add(1)
		switch s.mode {
		case tavilyProviderSuccess:
			return tavilyJSONResponse(req, http.StatusOK, tavilyProviderPayload(tavilySuccessfulEvidence())), nil
		case tavilyProviderUnusable:
			return tavilyJSONResponse(req, http.StatusOK, tavilyProviderPayload(tavilyUnusableEvidence())), nil
		case tavilyProviderTimeout:
			return nil, context.DeadlineExceeded
		case tavilyProviderNetworkFailure:
			return nil, errors.New("synthetic tavily network failure")
		case tavilyProviderHTTPFailure:
			return tavilyJSONResponse(req, http.StatusServiceUnavailable, []byte(`{"error":"provider unavailable"}`)), nil
		case tavilyProviderSchemaFailure:
			return tavilyJSONResponse(req, http.StatusOK, []byte(`{"results":[{"raw_content":`)), nil
		case tavilyProviderUnreadableBody:
			return tavilyResponse(req, http.StatusOK, tavilyUnreadableBody{}), nil
		default:
			return tavilyJSONResponse(req, http.StatusOK, tavilyProviderPayload(tavilySuccessfulEvidence())), nil
		}
	}
	return s.fallback.RoundTrip(req)
}

func tavilyAssertProviderCalls(t *testing.T, shim *tavilyHTTPShim, want int) {
	t.Helper()
	if got := int(shim.calls.Load()); got != want {
		t.Fatalf("Tavily provider calls = %d, want %d for operation matrix outcome", got, want)
	}
}

func tavilyProviderPayload(rawContent string) []byte {
	payload := map[string]any{
		"results":        []map[string]string{{"url": "https://article.example.test/story", "raw_content": rawContent}},
		"failed_results": []any{},
	}
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return data
}

func tavilyJSONResponse(req *http.Request, status int, body []byte) *http.Response {
	return tavilyResponse(req, status, io.NopCloser(strings.NewReader(string(body))))
}

func tavilyResponse(req *http.Request, status int, body io.ReadCloser) *http.Response {
	resp := &http.Response{StatusCode: status, Status: fmt.Sprintf("%d synthetic", status), Header: make(http.Header), Body: body, Request: req}
	resp.Header.Set("Content-Type", "application/json")
	return resp
}

type tavilyUnreadableBody struct{}

func (tavilyUnreadableBody) Read([]byte) (int, error) {
	return 0, errors.New("synthetic unreadable tavily body")
}
func (tavilyUnreadableBody) Close() error { return nil }

func tavilySuccessfulEvidence() string {
	paragraphs := []string{
		"Tavily evidence paragraph one records source-backed facts about resilient SQLite ingestion, operation persistence, and bounded external extraction for the article under test.",
		"Tavily evidence paragraph two explains that local readable extraction and RSS evidence failed before this external recovery supplied usable article text for OpenRouter processing.",
		"Tavily evidence paragraph three preserves enough concrete article detail to satisfy the sanitation gate with multiple non-boilerplate paragraphs and no login chrome.",
	}
	return strings.Join(paragraphs, "\n\n") + strings.Repeat(" Additional source-backed Tavily sentence for persistence verification.", 12)
}

func tavilyUnusableEvidence() string {
	return strings.Repeat("Log in\nSign up\nTrending\nRelevant people\nFooter links\nCookie settings\n", 20)
}

func tavilyRSSServer(t *testing.T, entry feedEntry) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
		_, _ = io.WriteString(w, `<?xml version="1.0"?><rss version="2.0"><channel><title>Tavily Matrix Feed</title><item><guid>`+entry.ID+`</guid><title>`+entry.Title+`</title><link>`+entry.URL+`</link><description>`+entry.Description+`</description></item></channel></rss>`)
	}))
}

func tavilyArticleURLForCase(t *testing.T, tc tavilyOperationCase) string {
	t.Helper()
	if !tc.eligibleURL {
		return "not a tavily eligible article url"
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.NotFound(w, nil)
	}))
	t.Cleanup(server.Close)
	return server.URL + "/article-" + tc.name
}

func tavilySeedPriorGeneratedItem(t *testing.T, ctx context.Context, db *sql.DB, itemID string, sourceID string, sourceURL string, itemURL string, canonicalURL string) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339)
	keyPoints := `["priorpreservedpoint one","priorpreservedpoint two","priorpreservedpoint three"]`
	priorExtracted := strings.Repeat("priorgeneratedextracted source-looking generated representative text that must not be reused as source evidence. ", 8)
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, source_item_title, localized_title, summary, core_insight, key_points, feed_excerpt, extracted_text, value_tier, content_status, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brief', 'ok', ?, 'full', 'ok')`, itemID, sourceID, sourceURL, itemURL, nullableString(canonicalURL), "Prior title "+itemID, "Source title "+itemID, "Prior localized "+itemID, tavilyPriorSummaryToken+" "+itemID, "priorpreservedinsight "+itemID, keyPoints, "prior generated feed display "+itemID, priorExtracted, now)
	if err != nil {
		t.Fatalf("seed prior generated item %s: %v", itemID, err)
	}
	tavilySetPriorEvidenceColumnsIfPresent(t, ctx, db, itemID)
}

func tavilySetPriorEvidenceColumnsIfPresent(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	sets := []string{}
	args := []any{}
	if tavilyColumnExists(t, ctx, db, "items", "extraction_source") {
		sets = append(sets, "extraction_source = ?")
		args = append(args, tavilyExtractionSourceLocal)
	}
	if tavilyColumnExists(t, ctx, db, "items", "source_evidence_text") {
		sets = append(sets, "source_evidence_text = null")
	}
	if len(sets) == 0 {
		return
	}
	args = append(args, itemID)
	query := "update items set " + strings.Join(sets, ", ") + " where id = ?"
	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		t.Fatalf("set prior evidence columns for %s: %v", itemID, err)
	}
}

func tavilyColumnExists(t *testing.T, ctx context.Context, db *sql.DB, table string, column string) bool {
	t.Helper()
	rows, err := db.QueryContext(ctx, `pragma table_info(`+table+`)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", table, err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull int
		var defaultValue any
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan table_info(%s): %v", table, err)
		}
		if name == column {
			return true
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table_info(%s): %v", table, err)
	}
	return false
}

type tavilyPersistedItemState struct {
	title             string
	localizedTitle    string
	summary           string
	coreInsight       string
	keyPointsJSON     string
	feedExcerpt       string
	extractedText     string
	valueTier         string
	contentStatus     string
	extractionStatus  string
	extractionSource  string
	sourceEvidence    string
	sourceEvidenceNil bool
	modelStatus       string
	lastStatus        string
	lastCode          string
	lastMessage       string
}

func tavilyReadItemState(t *testing.T, ctx context.Context, db *sql.DB, itemID string) tavilyPersistedItemState {
	t.Helper()
	var state tavilyPersistedItemState
	var sourceEvidenceNil int
	err := db.QueryRowContext(ctx, `select title, coalesce(localized_title, ''), coalesce(summary, ''), coalesce(core_insight, ''), coalesce(key_points, ''), coalesce(feed_excerpt, ''), coalesce(extracted_text, ''), coalesce(value_tier, ''), coalesce(content_status, model_status), extraction_status, extraction_source, coalesce(source_evidence_text, ''), case when source_evidence_text is null then 1 else 0 end, model_status, coalesce(last_reprocess_status, ''), coalesce(last_reprocess_error_code, ''), coalesce(last_reprocess_error_message, '') from items where id = ?`, itemID).Scan(&state.title, &state.localizedTitle, &state.summary, &state.coreInsight, &state.keyPointsJSON, &state.feedExcerpt, &state.extractedText, &state.valueTier, &state.contentStatus, &state.extractionStatus, &state.extractionSource, &state.sourceEvidence, &sourceEvidenceNil, &state.modelStatus, &state.lastStatus, &state.lastCode, &state.lastMessage)
	if err != nil {
		t.Fatalf("read Tavily persistence fields for %s: %v", itemID, err)
	}
	state.sourceEvidenceNil = sourceEvidenceNil == 1
	return state
}

func tavilyAssertSuccessState(t *testing.T, state tavilyPersistedItemState, itemID string, surface tavilyAttemptSurface) {
	t.Helper()
	if state.title != tavilyGeneratedTitle(itemID) || state.localizedTitle != tavilyGeneratedTitle(itemID) || state.summary != tavilyExpectedSummary(itemID) || state.coreInsight != tavilyExpectedCoreInsight(itemID) || state.valueTier != "high" {
		t.Fatalf("generated fields = title:%q localized:%q summary:%q core:%q value:%q, want Tavily/OpenRouter ok output", state.title, state.localizedTitle, state.summary, state.coreInsight, state.valueTier)
	}
	if !strings.Contains(state.keyPointsJSON, "tavilysuccesspointone") || state.feedExcerpt != "tavily generated display excerpt "+itemID || state.extractedText != "tavily generated representative text "+itemID {
		t.Fatalf("generated list/body fields = key_points:%q feed_excerpt:%q extracted_text:%q, want Tavily/OpenRouter generated fields", state.keyPointsJSON, state.feedExcerpt, state.extractedText)
	}
	if state.contentStatus != modelStatusOK || state.modelStatus != modelStatusOK || state.extractionStatus != extractionStatusFull || state.extractionSource != tavilyExtractionSourceExternal || state.sourceEvidenceNil || state.sourceEvidence != tavilySuccessfulEvidence() {
		t.Fatalf("Tavily success status/source fields = content:%q model:%q extraction:%q source:%q evidence_nil:%v evidence:%q", state.contentStatus, state.modelStatus, state.extractionStatus, state.extractionSource, state.sourceEvidenceNil, state.sourceEvidence)
	}
	if surface == tavilyReprocessAttempt && (state.lastStatus != "ok" || state.lastCode != "" || state.lastMessage != "") {
		t.Fatalf("success latest-attempt diagnostics = status:%q code:%q message:%q, want ok with cleared failure diagnostics", state.lastStatus, state.lastCode, state.lastMessage)
	}
	if surface == tavilyNormalAttempt && (state.lastCode != "" || state.lastMessage != "") {
		t.Fatalf("normal success latest-attempt failure diagnostics = code:%q message:%q, want cleared", state.lastCode, state.lastMessage)
	}
}

func tavilyAssertUnavailableRewriteState(t *testing.T, state tavilyPersistedItemState, fallbackURL string, code ReprocessErrorCode) {
	t.Helper()
	if state.summary != "" || state.coreInsight != "" || state.feedExcerpt != "" || state.extractedText != "" || state.valueTier != "" {
		t.Fatalf("unavailable rewrite generated fields = summary:%q core:%q feed:%q extracted:%q value:%q, want cleared unavailable fields", state.summary, state.coreInsight, state.feedExcerpt, state.extractedText, state.valueTier)
	}
	if state.title != fallbackReprocessTitle(fallbackURL) || state.contentStatus != modelStatusSummaryNA || state.modelStatus != modelStatusSummaryNA || state.extractionStatus != extractionStatusOriginalNA || state.extractionSource != tavilyExtractionSourceNone || !state.sourceEvidenceNil || state.sourceEvidence != "" {
		t.Fatalf("unavailable rewrite status/source fields = title:%q content:%q model:%q extraction:%q source:%q evidence_nil:%v evidence:%q", state.title, state.contentStatus, state.modelStatus, state.extractionStatus, state.extractionSource, state.sourceEvidenceNil, state.sourceEvidence)
	}
	if state.lastStatus != "failed" || state.lastCode != string(code) {
		t.Fatalf("unavailable latest-attempt diagnostics = status:%q code:%q, want failed/%q", state.lastStatus, state.lastCode, code)
	}
}

func tavilyAssertPreservedFailureState(t *testing.T, state tavilyPersistedItemState, code ReprocessErrorCode) {
	t.Helper()
	tavilyAssertPriorGeneratedFieldsPreserved(t, state)
	if state.extractionStatus != extractionStatusFull || state.extractionSource != tavilyExtractionSourceLocal || !state.sourceEvidenceNil || state.contentStatus != modelStatusOK || state.modelStatus != modelStatusOK {
		t.Fatalf("preserved failure status/source fields = content:%q model:%q extraction:%q source:%q evidence_nil:%v", state.contentStatus, state.modelStatus, state.extractionStatus, state.extractionSource, state.sourceEvidenceNil)
	}
	if state.lastStatus != "failed" || state.lastCode != string(code) {
		t.Fatalf("failure diagnostics = status:%q code:%q, want failed/%q", state.lastStatus, state.lastCode, code)
	}
}

func tavilyAssertNormalPreservedWithDiagnostics(t *testing.T, state tavilyPersistedItemState, code ReprocessErrorCode) {
	t.Helper()
	tavilyAssertPriorGeneratedFieldsPreserved(t, state)
	if state.extractionStatus != extractionStatusFull || state.extractionSource != tavilyExtractionSourceLocal || !state.sourceEvidenceNil || state.contentStatus != modelStatusOK || state.modelStatus != modelStatusOK {
		t.Fatalf("normal preserved status/source fields = content:%q model:%q extraction:%q source:%q evidence_nil:%v", state.contentStatus, state.modelStatus, state.extractionStatus, state.extractionSource, state.sourceEvidenceNil)
	}
	if code != "" && (state.lastStatus != "failed" || state.lastCode != string(code)) {
		t.Fatalf("normal latest-attempt diagnostics = status:%q code:%q, want failed/%q", state.lastStatus, state.lastCode, code)
	}
}

func tavilyAssertPriorGeneratedFieldsPreserved(t *testing.T, state tavilyPersistedItemState) {
	t.Helper()
	if !strings.HasPrefix(state.title, "Prior title ") || !strings.Contains(state.summary, tavilyPriorSummaryToken) || !strings.Contains(state.coreInsight, "priorpreservedinsight") || !strings.Contains(state.feedExcerpt, "prior generated feed display") || !strings.Contains(state.extractedText, "priorgeneratedextracted") || state.valueTier != "brief" {
		t.Fatalf("prior generated fields were not preserved: title:%q summary:%q core:%q feed:%q extracted:%q value:%q", state.title, state.summary, state.coreInsight, state.feedExcerpt, state.extractedText, state.valueTier)
	}
}

func tavilyAssertLibraryCounts(t *testing.T, result ReprocessLibraryResult, tc tavilyOperationCase) {
	t.Helper()
	wantStatus := ReprocessStatusCompleted
	if tc.wantUnavailable > 0 || tc.wantFailed > 0 {
		wantStatus = ReprocessStatusCompletedWithErrors
	}
	if result.Status != wantStatus || !result.FTSRebuilt || result.FTSStale || result.ItemsAttempted != 1 || result.ItemsUpdated != tc.wantItemsUpdated || result.ItemsUnavailable != tc.wantUnavailable || result.ItemsFailed != tc.wantFailed || result.ItemsIndexed != 1 {
		t.Fatalf("library result = %+v, want status=%q attempted=1 updated=%d unavailable=%d failed=%d indexed=1 rebuilt=true stale=false", result, wantStatus, tc.wantItemsUpdated, tc.wantUnavailable, tc.wantFailed)
	}
	if result.ItemsAttempted != result.ItemsUpdated+result.ItemsUnavailable+result.ItemsFailed {
		t.Fatalf("library attempted invariant broken: %+v", result)
	}
	if tc.wantErrorCode != "" {
		assertReprocessErrorCode(t, result.Errors, "item_tavily_library_"+tc.name, tc.wantErrorCode)
	}
}

func tavilyAssertFTSRefreshed(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	if count := reprocessFTSCount(t, ctx, db, itemID, tavilySuccessSummaryToken); count != 1 {
		t.Fatalf("FTS refreshed token count for %s = %d, want 1", itemID, count)
	}
	if count := reprocessFTSCount(t, ctx, db, itemID, tavilyPriorSummaryToken); count != 0 {
		t.Fatalf("FTS retained prior generated token for %s count=%d, want 0 after successful Tavily rewrite", itemID, count)
	}
}

func tavilyAssertFTSPreserved(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	if count := reprocessFTSCount(t, ctx, db, itemID, tavilyPriorSummaryToken); count != 1 {
		t.Fatalf("FTS preserved prior token count for %s = %d, want 1", itemID, count)
	}
	if count := reprocessFTSCount(t, ctx, db, itemID, tavilySuccessSummaryToken); count != 0 {
		t.Fatalf("FTS unexpectedly contains success token for preserved failure %s count=%d", itemID, count)
	}
}

func tavilyAssertFTSUnavailableRewrite(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	if count := reprocessFTSCount(t, ctx, db, itemID, tavilyPriorSummaryToken); count != 0 {
		t.Fatalf("FTS retained prior generated token for unavailable rewrite %s count=%d, want 0", itemID, count)
	}
	if count := reprocessFTSCount(t, ctx, db, itemID, tavilySuccessSummaryToken); count != 0 {
		t.Fatalf("FTS contains success token for unavailable rewrite %s count=%d", itemID, count)
	}
}
