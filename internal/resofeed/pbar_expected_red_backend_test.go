package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Expected-red backend coverage for PRD behavior audit findings:
// B1,B2: Steer search command must execute lexical search semantics, not write policy rows.
// B4,B14,B15: NL steering translation failures must return an interpreted receipt/safe rejection.
// B16,B17: accepted combined reduce/hide + boost steering must influence ranking independently.
// B6,B18,B19,B20: /doctor must not overstate provider/model/item-transform health.
// B7,B22: shared readable payloads must be sanitized before summary/core-insight/body presentation.

func TestExpectedRedBackendSearchCommandExecutesLexicalQuery(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_search_cmd", "https://search.example/feed.xml", "Search Fixture")
	insertRankedItem(t, ctx, db, "item_sqlite_search", "src_search_cmd", "SQLite FTS restoration", now)
	insertRankedItem(t, ctx, db, "item_unrelated_search", "src_search_cmd", "Unrelated Today default", now.Add(-time.Minute))
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild search index: %v", err)
	}

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	for _, tc := range []struct {
		name          string
		command       string
		interpretedAs string
	}{
		{name: "B1 matching search command", command: "search sqlite fts", interpretedAs: "search"},
		{name: "B2 no-match search command", command: "search nozzzztoken", interpretedAs: "search_empty"},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			payload := `{"command":` + mustMarshalString(t, tc.command) + `,"actor_kind":"human","actor_id":"owner","idempotency_key":"` + strings.ReplaceAll(strings.ToLower(tc.name), " ", "-") + `"}`
			req := authorizedRequest(http.MethodPost, "/api/steer", bytes.NewReader([]byte(payload)))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, req)

			assertStatus(t, recorder, http.StatusOK)
			var result SteerResult
			if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
				t.Fatalf("unmarshal steer search result: %v; body=%s", err, recorder.Body.String())
			}
			if result.Receipt.InterpretedAs != tc.interpretedAs {
				t.Fatalf("%s receipt interpreted_as = %q, want %q executing lexical query rather than policy update; receipt=%+v", tc.name, result.Receipt.InterpretedAs, tc.interpretedAs, result.Receipt)
			}
			if len(result.Receipt.ChangedRules) != 0 {
				t.Fatalf("%s changed_rules = %+v, want no steering policy rows for retrieval command", tc.name, result.Receipt.ChangedRules)
			}
		})
	}

	items, echo, err := SearchItems(ctx, db, SearchQuery{Q: "nozzzztoken", Limit: 10})
	if err != nil {
		t.Fatalf("B2 direct no-match SearchItems returned ordinary-query error: %v", err)
	}
	if len(items) != 0 || echo.Q != "nozzzztoken" {
		t.Fatalf("B2 direct no-match lexical query items=%+v echo=%+v, want stable empty API state for submitted query and no stale/default rows", items, echo)
	}
}

func TestExpectedRedBackendSteerTranslationFailureReturnsReceiptNotInternal(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: expectedRedFailingLLM{err: errors.New("provider unavailable")}})

	for _, tc := range []struct {
		name    string
		command string
	}{
		{name: "B4 policy correction", command: "There is too much token-price speculation recently; reduce it."},
		{name: "B14 complex hide boost", command: "Hide celebrity gossip unless it is a policy story, and boost robotics safety research."},
		{name: "B15 simple reduce", command: "Reduce crypto token launch coverage."},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			payload := `{"command":` + mustMarshalString(t, tc.command) + `,"actor_kind":"human","actor_id":"owner","idempotency_key":"` + strings.ReplaceAll(strings.ToLower(tc.name), " ", "-") + `"}`
			req := authorizedRequest(http.MethodPost, "/api/steer", bytes.NewReader([]byte(payload)))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, req)

			if recorder.Code != http.StatusOK {
				t.Fatalf("%s status=%d body=%s, want 200 receipt with interpreted_as/apply or specific rejection, never generic internal", tc.name, recorder.Code, recorder.Body.String())
			}
			var result SteerResult
			if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
				t.Fatalf("unmarshal steer receipt: %v; body=%s", err, recorder.Body.String())
			}
			if result.Receipt.InterpretedAs == "" || strings.Contains(strings.ToLower(result.Receipt.Message), "internal") {
				t.Fatalf("%s receipt=%+v, want normalized interpretation plus applied/specific rejection without generic internal error", tc.name, result.Receipt)
			}
		})
	}
}

func TestExpectedRedBackendCombinedReduceAndBoostRulesAffectRankingIndependently(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_policy_probe", "https://policy-probe.example/feed.xml", "Policy Probe")
	insertRankedItem(t, ctx, db, "item_celebrity", "src_policy_probe", "Celebrity gossip token launch", now.Add(-30*time.Minute))
	insertRankedItem(t, ctx, db, "item_robotics", "src_policy_probe", "Robotics safety research", now.Add(-3*time.Hour))
	insertRankedItem(t, ctx, db, "item_plain", "src_policy_probe", "General infrastructure update", now.Add(-time.Hour))

	result, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Reduce celebrity gossip and boost robotics safety research.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "expected-red-combined-steering"}})
	if err != nil {
		t.Fatalf("ApplySteering returned error: %v", err)
	}
	if len(result.Receipt.ChangedRules) == 0 {
		t.Fatalf("B16/B17 combined steering receipt=%+v, want accepted policy before ranking assertion", result.Receipt)
	}

	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: 10, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) == 0 || items[0].ID != "item_robotics" {
		t.Fatalf("B17 ranked items=%+v, want boosted robotics item first after accepted boost rule", itemIDs(items))
	}
	for _, item := range items {
		if item.ID == "item_celebrity" {
			t.Fatalf("B16 ranked items=%+v, reduce/hide item_celebrity should be visibly demoted or filtered", itemIDs(items))
		}
	}
}

func TestExpectedRedBackendPolicyRankingFixtureBoostsSpecificOlderMatch(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 16, 0, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_policy_ranking", "https://policy-ranking.example/feed.xml", "Policy Ranking Fixture")
	insertPolicyRankingFixtureItem(t, ctx, db, "item_crypto", "Crypto token launch", time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC), now)
	insertPolicyRankingFixtureItem(t, ctx, db, "item_sqlite", "SQLite storage analysis", time.Date(2026, 5, 12, 9, 0, 0, 0, time.UTC), now)
	insertPolicyRankingFixtureItem(t, ctx, db, "item_rust", "Rust compiler release", time.Date(2026, 5, 12, 11, 0, 0, 0, time.UTC), now)

	if _, err := db.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, created_by_actor_kind, created_by_actor_id, revision) values ('rule_filter_crypto', 'filter crypto token', 1, ?, 'human', 'owner', 1), ('rule_boost_sqlite', 'boost sqlite storage analysis', 1, ?, 'human', 'owner', 1)`, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert steering rules: %v", err)
	}

	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: 50, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) == 0 || items[0].ID != "item_sqlite" {
		t.Fatalf("ranked items=%+v, want boosted sqlite first", itemIDs(items))
	}
	for _, item := range items {
		if item.ID == "item_crypto" {
			t.Fatalf("ranked items=%+v, filter crypto token should exclude crypto item", itemIDs(items))
		}
	}
}

func insertPolicyRankingFixtureItem(t *testing.T, ctx context.Context, db execDB, id string, title string, publishedAt time.Time, firstSeenAt time.Time) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status) values (?, 'src_policy_ranking', 'https://policy-ranking.example/feed.xml', ?, ?, ?, ?, ?, ?, 'partial_extraction', 'summary_unavailable')`, id, "https://policy-ranking.example/"+id, title, title+" summary", title+" insight", publishedAt.Format(time.RFC3339), firstSeenAt.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert policy ranking fixture item %s: %v", id, err)
	}
}

func TestExpectedRedBackendDoctorSeparatesOpenRouterModelAndItemTransformHealth(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_doctor_probe", "https://doctor-probe.example/feed.xml", "Doctor Probe")
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, feed_excerpt, first_seen_at, extraction_status, model_status) values ('item_model_failed', 'src_doctor_probe', 'https://doctor-probe.example/feed.xml', 'https://doctor-probe.example/item', 'Model failed but provider reachable', 'excerpt fallback', ?, 'partial_extraction', 'model_latency_error')`, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert doctor probe item: %v", err)
	}

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "account_default"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	text := out.String()
	for _, want := range []string{
		"openrouter: configured_model=account_default",
		"openrouter: model_resolved=false resolved_model=unknown",
		"openrouter: item_transform_failures=1",
		"fallback_provenance: item=item_model_failed summary=excerpt model_status=model_latency_error extraction_status=partial_extraction",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("B6/B18/B19/B20 doctor output missing %q; got:\n%s", want, text)
		}
	}
	if strings.Contains(text, "openrouter: ok") {
		t.Fatalf("B20 doctor output overstates health with openrouter: ok while item transformations fail:\n%s", text)
	}
}

func TestPBARDoctorShowsFallbackProvenanceWhenNoItemTransformFailures(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "account_default"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	text := out.String()
	for _, want := range []string{
		"openrouter: item_transform_failures=0",
		"fallback_provenance: item_transform_failures=0 summary=none",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("zero-failure doctor output missing %q; got:\n%s", want, text)
		}
	}
	for _, forbidden := range []string{contractOwnerToken, "OPENROUTER_KEY", "dummy", "sk-or-", "provider API key"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("doctor output leaked forbidden secret marker %q; got:\n%s", forbidden, text)
		}
	}
}

func TestPBARPublicRuntimeSourceAddIngestThenSearchFindsLexicalFixture(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	const knownToken = "pbarlexicalfixturetoken"

	var feedServer *httptest.Server
	feedServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = w.Write([]byte(`<?xml version="1.0"?><rss version="2.0"><channel><title>PBAR Fixture Feed</title><item><guid>fixture-1</guid><title>Runtime lexical fixture</title><link>` + feedServer.URL + `/article</link><description>Known fixture body ` + knownToken + ` for public runtime search proof.</description><pubDate>Tue, 12 May 2026 10:00:00 +0000</pubDate></item></channel></rss>`))
		case "/article":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<html><body><article>Article body contains ` + knownToken + ` after source ingestion.</article></body></html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feedServer.Close)

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	steerBody := `{"command":` + mustMarshalString(t, feedServer.URL+"/feed.xml") + `,"actor_kind":"human","actor_id":"owner","idempotency_key":"pbar-runtime-add-source"}`
	steerRecorder := httptest.NewRecorder()
	steerReq := authorizedRequest(http.MethodPost, "/api/steer", bytes.NewReader([]byte(steerBody)))
	steerReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(steerRecorder, steerReq)
	assertStatus(t, steerRecorder, http.StatusOK)

	ingestRecorder := httptest.NewRecorder()
	ingestReq := authorizedRequest(http.MethodPost, ManualIngestHTTPPath, bytes.NewReader([]byte(ManualFetchRequestBody)))
	ingestReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(ingestRecorder, ingestReq)
	assertStatus(t, ingestRecorder, ManualFetchHTTPStatusOK)

	searchRecorder := httptest.NewRecorder()
	searchReq := authorizedRequest(http.MethodGet, "/api/search?q="+knownToken, nil)
	router.ServeHTTP(searchRecorder, searchReq)
	assertStatus(t, searchRecorder, http.StatusOK)

	var response SearchResponse
	if err := json.Unmarshal(searchRecorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal search response: %v; body=%s", err, searchRecorder.Body.String())
	}
	if response.Query.Q != knownToken || len(response.Items) != 1 || response.Items[0].Title != "Runtime lexical fixture" {
		t.Fatalf("search response = %+v, want one matching runtime-ingested fixture for %q", response, knownToken)
	}
}

func TestExpectedRedBackendReadablePayloadSanitizesSourceBoilerplate(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_polluted", "https://polluted.example/feed.xml", "Polluted Source")
	polluted := strings.Join([]string{
		"The actual article explains the procurement timeline and safety finding.",
		"Follow topics and authors from this story to personalize your feed.",
		"More from The Verge",
		"Related Stories",
		"A cracked unrelated phone leak appears in the tail.",
	}, "\n")
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, feed_excerpt, extracted_text, summary, core_insight, first_seen_at, extraction_status, model_status) values ('item_polluted', 'src_polluted', 'https://polluted.example/feed.xml', 'https://polluted.example/item', 'Polluted extraction', ?, ?, ?, ?, ?, 'full', 'ok')`, polluted, polluted, polluted, "More from The Verge / Related Stories residue", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert polluted item: %v", err)
	}

	detail, err := ReadItemDetail(ctx, db, "item_polluted")
	if err != nil {
		t.Fatalf("ReadItemDetail returned error: %v", err)
	}
	readable := strings.ToLower(strings.Join([]string{stringPtrValue(detail.Summary), stringPtrValue(detail.CoreInsight), stringPtrValue(detail.FeedExcerpt), stringPtrValue(detail.ExtractedText)}, "\n"))
	for _, forbidden := range []string{"follow topics", "authors from this story", "personalize your feed", "more from the verge", "related stories", "cracked unrelated phone"} {
		if strings.Contains(readable, forbidden) {
			t.Fatalf("B7/B22 readable payload still contains %q; detail=%+v", forbidden, detail)
		}
	}
	if !strings.Contains(readable, "actual article explains") {
		t.Fatalf("B7/B22 sanitized payload lost article body; readable=%q", readable)
	}
}

type expectedRedFailingLLM struct {
	err error
}

func (f expectedRedFailingLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{ModelStatus: modelStatusLatencyError}, f.err
}

func (f expectedRedFailingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, f.err
}

func mustMarshalString(t *testing.T, value string) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal string: %v", err)
	}
	return string(data)
}

func itemIDs(items []ItemSummary) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

var _ execDB = (*sql.DB)(nil)
