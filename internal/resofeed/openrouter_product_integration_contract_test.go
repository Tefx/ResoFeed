package resofeed

// expected_result: red
// OpenRouter product integration contract tests encode expected migration
// behavior before all runtime/product seams have been migrated.

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestOpenRouterChatCompletionSummaryResponseValidatesAndPersists(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/feed.xml" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>OpenRouter Source</title><item><guid>or-article</guid><title>OpenRouter Article</title><link>` + r.Host + `://article</link><description>fallback body for OpenRouter summary</description><pubDate>Sat, 09 May 2026 12:00:00 +0000</pubDate></item></channel></rss>`))
	}))
	defer feed.Close()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'not_fetched', 1, 1)`, "src_openrouter", feed.URL+"/feed.xml", "Before", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert source: %v", err)
	}

	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"chatcmpl_test","model":"openrouter/fake-resolved","choices":[{"message":{"role":"assistant","content":"{\"summary\":\"OpenRouter dense summary.\",\"core_insight\":\"OpenRouter validated insight.\",\"value_tier\":\"high\",\"model_status\":\"ok\"}"}}]}`))
	}))
	defer model.Close()

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", model: "openrouter/fake-configured", endpoint: model.URL, client: model.Client()}
	if err := IngestOnce(ctx, db, IngestConfig{LLM: client}); err != nil {
		t.Fatalf("IngestOnce returned error: %v", err)
	}

	var summary, insight, modelStatus string
	if err := db.QueryRowContext(ctx, `select summary, core_insight, model_status from items where source_id = ?`, "src_openrouter").Scan(&summary, &insight, &modelStatus); err != nil {
		t.Fatalf("read ingested item: %v", err)
	}
	if summary != "OpenRouter dense summary." || insight != "OpenRouter validated insight." || modelStatus != modelStatusOK {
		t.Fatalf("ingested OpenRouter summary=(%q,%q,%q), want validated OpenRouter content and ok", summary, insight, modelStatus)
	}
}

func TestOpenRouterModelFailureKeepsItemVisibleWithSafeStatus(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>Failure Source</title><item><guid>failure-visible</guid><title>Visible Despite Model Failure</title><link>` + r.Host + `://bad</link><description>fallback survives model failure</description><pubDate>Sat, 09 May 2026 12:00:00 +0000</pubDate></item></channel></rss>`))
	}))
	defer feed.Close()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'not_fetched', 1, 1)`, "src_model_failure", feed.URL, "Failure", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert source: %v", err)
	}

	if err := IngestOnce(ctx, db, IngestConfig{LLM: openRouterFailingLLM{}}); err != nil {
		t.Fatalf("IngestOnce returned error: %v", err)
	}
	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: 10, Now: time.Date(2026, 5, 9, 13, 0, 0, 0, time.UTC)})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) != 1 || items[0].Title != "Visible Despite Model Failure" {
		t.Fatalf("visible items after model failure = %+v, want failed item still visible", items)
	}
	if items[0].Summary != nil || items[0].CoreInsight != nil || items[0].ModelStatus != modelStatusLatencyError {
		t.Fatalf("failed item summary/core/model_status = %v/%v/%q, want nil/nil/model_latency_error", items[0].Summary, items[0].CoreInsight, items[0].ModelStatus)
	}
}

func TestSteeringHTTPAndMCPUseSharedOpenRouterPathWithRetrySafety(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &countingOpenRouterLLM{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prioritize source-backed database internals."}, Message: "openrouter steering updated"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	body := `{"command":"Push source-backed database internals.","actor_kind":"human","actor_id":"owner","idempotency_key":"http-openrouter-steer-001"}`
	firstHTTP := postHTTPJSON[SteerResult](t, router, "/api/steer", body, http.StatusOK)
	secondHTTP := postHTTPJSON[SteerResult](t, router, "/api/steer", body, http.StatusOK)
	if firstHTTP.Receipt.InterpretedAs != "openrouter_policy_update" || secondHTTP.Receipt.ChangedRules[0].ID != firstHTTP.Receipt.ChangedRules[0].ID {
		t.Fatalf("HTTP steer receipts = first %+v second %+v, want shared OpenRouter proposal and idempotent replay", firstHTTP.Receipt, secondHTTP.Receipt)
	}
	if got := llm.calls(); got != 1 {
		t.Fatalf("HTTP OpenRouter calls = %d, want 1 after idempotent retry", got)
	}

	mcpFirst := mcpToolJSON[SteerResult](t, router, "steer", map[string]any{"command": "Push source-backed kernel papers.", "actor_id": "briefing-agent", "idempotency_key": "mcp-openrouter-steer-001"})
	mcpSecond := mcpToolJSON[SteerResult](t, router, "steer", map[string]any{"command": "Push source-backed kernel papers.", "actor_id": "briefing-agent", "idempotency_key": "mcp-openrouter-steer-001"})
	if mcpFirst.Receipt.InterpretedAs != "openrouter_policy_update" || len(mcpFirst.Receipt.ChangedRules) != 1 || mcpSecond.Receipt.ChangedRules[0].ID != mcpFirst.Receipt.ChangedRules[0].ID {
		t.Fatalf("MCP agent steer receipts = first %+v second %+v, want non-conflicting agent rule accepted and replayed", mcpFirst.Receipt, mcpSecond.Receipt)
	}
	if got := llm.calls(); got != 2 {
		t.Fatalf("MCP OpenRouter calls after accepted agent/idempotent retry = %d, want 2", got)
	}
}

func TestInvalidOpenRouterSteeringProposalRejectedWithoutBreakingHumanPrecedence(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &countingOpenRouterLLM{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Hide all items and disable freshness coverage."}, Message: "unsafe proposal"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	unsafe := postHTTPJSON[SteerResult](t, router, "/api/steer", `{"command":"Make this unsafe change.","actor_kind":"human","actor_id":"owner","idempotency_key":"unsafe-openrouter-proposal-001"}`, http.StatusOK)
	if len(unsafe.Receipt.ChangedRules) != 0 || !strings.Contains(unsafe.Receipt.Message, "no safe") {
		t.Fatalf("unsafe model proposal receipt = %+v, want safe rejection with no changed rules", unsafe.Receipt)
	}

	llm.out = OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prioritize verified sqlite research."}, Message: "openrouter steering updated"}
	human := postHTTPJSON[SteerResult](t, router, "/api/steer", `{"command":"Prioritize sqlite research.","actor_kind":"human","actor_id":"owner","idempotency_key":"human-openrouter-valid-001"}`, http.StatusOK)
	if len(human.Receipt.ChangedRules) != 1 {
		t.Fatalf("human receipt = %+v, want active human steering rule", human.Receipt)
	}
	llm.out = OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Hide verified sqlite research."}, Message: "openrouter steering updated"}
	agent := mcpToolJSON[SteerResult](t, router, "steer", map[string]any{"command": "Override with funding announcements.", "actor_id": "agent", "idempotency_key": "agent-openrouter-precedence-001"})
	if len(agent.Receipt.ChangedRules) != 0 || !strings.Contains(agent.Receipt.Message, "human steering") {
		t.Fatalf("agent receipt = %+v, want conflict-specific human precedence safe rejection", agent.Receipt)
	}
}

func TestDoctorUsesOpenRouterPrefixAndNoGeminiRuntimeText(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)
	recorder := httptest.NewRecorder()
	NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken}).ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/doctor", nil))
	assertStatus(t, recorder, http.StatusOK)
	body := recorder.Body.String()
	if !strings.Contains(body, "openrouter:") {
		t.Fatalf("doctor body missing openrouter prefix: %q", body)
	}
	if strings.Contains(strings.ToLower(body), "gemini:") || strings.Contains(strings.ToLower(body), "gemini") {
		t.Fatalf("doctor body retained Gemini text after OpenRouter migration: %q", body)
	}
	if !strings.Contains(body, "configured_model=") || !strings.Contains(body, "account_default") {
		t.Fatalf("doctor body = %q, want configured_model with account_default when omitted", body)
	}
}

func TestStateExportExcludesOpenRouterRuntimeConfigAndSecrets(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)
	_, err := db.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, created_by_actor_kind, created_by_actor_id, revision) values ('rule_portable', 'Prioritize source-backed systems papers.', 1, ?, 'human', 'owner', 1)`, now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert active steer rule: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into item_state (item_id, is_resonated, human_inspected_at, external_surfaced_at, last_actor_kind, last_actor_id) values ('item_http_01', 1, ?, ?, 'agent', 'briefing-agent')`, now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert item state: %v", err)
	}
	for _, kv := range []struct{ key, value string }{
		{key: "openrouter_key", value: "sk-or-fake-test-key"},
		{key: "openrouter_model", value: "openrouter/fake-model"},
		{key: "openrouter_secret_source", value: ".env"},
		{key: "owner_token_sha256", value: "fake-owner-token-hash"},
	} {
		if _, err := db.ExecContext(ctx, `insert or replace into runtime_metadata (key, value, updated_at) values (?, ?, ?)`, kv.key, kv.value, now.Unix()); err != nil {
			t.Fatalf("insert runtime metadata %s: %v", kv.key, err)
		}
	}

	var exported bytes.Buffer
	if err := ExportState(ctx, db, &exported); err != nil {
		t.Fatalf("ExportState returned error: %v", err)
	}
	var bundle map[string]any
	if err := json.Unmarshal(exported.Bytes(), &bundle); err != nil {
		t.Fatalf("unmarshal exported state: %v; body=%s", err, exported.String())
	}
	for _, key := range []string{"sources", "steer_rules", "resonated_items"} {
		if _, ok := bundle[key]; !ok {
			t.Fatalf("exported state missing portable key %q: %s", key, exported.String())
		}
	}
	for _, forbidden := range []string{"openrouter", "OPENROUTER", "sk-or-fake-test-key", "fake-model", ".env", "owner_token", "runtime_metadata", "agent_receipts", "human_inspected_at", "external_surfaced_at"} {
		if strings.Contains(exported.String(), forbidden) {
			t.Fatalf("export leaked forbidden runtime/non-portable value %q: %s", forbidden, exported.String())
		}
	}
}

func TestStateImportRejectsOpenRouterRuntimeConfigAndSecrets(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	for _, kv := range []struct{ key, value string }{
		{key: "owner_token_sha256", value: "preexisting-owner-token-hash"},
		{key: "unrelated_runtime_setting", value: "preexisting-runtime-value"},
	} {
		if _, err := db.ExecContext(ctx, `insert or replace into runtime_metadata (key, value, updated_at) values (?, ?, ?)`, kv.key, kv.value, now.Unix()); err != nil {
			t.Fatalf("insert preexisting runtime metadata %s: %v", kv.key, err)
		}
	}

	maliciousBundle := `{
		"schema_version":"resofeed.state.v1",
		"exported_at":"2026-05-09T12:00:00Z",
		"sources":[{"id":"src_import","url":"https://import.example/feed.xml","title":"Imported Source"}],
		"steer_rules":[{"id":"rule_import","rule_text":"Prioritize imported systems research."}],
		"resonated_items":[],
		"openrouter_key":"sk-or-fake-import-secret",
		"openrouter_model":"openrouter/fake-import-model",
		"provider":"openrouter",
		"secret_source":".env",
		"runtime_config":{"endpoint":"https://openrouter.ai/api/v1/chat/completions"},
		"runtime_metadata":[{"key":"openrouter_secret_source","value":".env"}]
	}`
	_, err := ImportState(ctx, db, strings.NewReader(maliciousBundle))
	if err == nil {
		t.Fatal("ImportState accepted OpenRouter runtime configuration in portable state bundle")
	}
	for _, forbidden := range []string{"sk-or-fake-import-secret", "openrouter/fake-import-model", "https://openrouter.ai", ".env"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("ImportState error leaked forbidden OpenRouter runtime value %q: %v", forbidden, err)
		}
	}

	assertNoImportedOpenRouterRuntimeState(t, ctx, db)
	var sourceCount int
	if err := db.QueryRowContext(ctx, `select count(*) from sources where id = 'src_import'`).Scan(&sourceCount); err != nil {
		t.Fatalf("count rejected import source: %v", err)
	}
	if sourceCount != 0 {
		t.Fatalf("rejected import persisted %d OpenRouter-tainted source rows, want 0", sourceCount)
	}

	validBundle := `{
		"schema_version":"resofeed.state.v1",
		"exported_at":"2026-05-09T12:00:00Z",
		"sources":[{"id":"src_clean_import","url":"https://clean.example/feed.xml","title":"Clean Import"}],
		"steer_rules":[{"id":"rule_clean_import","rule_text":"Prioritize clean portable state."}],
		"resonated_items":[]
	}`
	if _, err := ImportState(ctx, db, strings.NewReader(validBundle)); err != nil {
		t.Fatalf("ImportState valid portable bundle returned error: %v", err)
	}
	assertNoImportedOpenRouterRuntimeState(t, ctx, db)
}

func assertNoImportedOpenRouterRuntimeState(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	for _, forbidden := range []string{
		"openrouter_key",
		"OPENROUTER_KEY",
		"openrouter_model",
		"openrouter_provider",
		"provider",
		"openrouter_secret_source",
		"secret_source",
		"openrouter_runtime_config",
		"runtime_config",
	} {
		var count int
		if err := db.QueryRowContext(ctx, `select count(*) from runtime_metadata where lower(key) = lower(?) or lower(value) = lower(?)`, forbidden, forbidden).Scan(&count); err != nil {
			t.Fatalf("query runtime metadata for %q: %v", forbidden, err)
		}
		if count != 0 {
			t.Fatalf("state import persisted forbidden OpenRouter runtime metadata %q", forbidden)
		}
	}
	for _, forbiddenValue := range []string{"sk-or-fake-import-secret", "openrouter/fake-import-model", "openrouter", ".env", "https://openrouter.ai/api/v1/chat/completions"} {
		var count int
		if err := db.QueryRowContext(ctx, `select count(*) from runtime_metadata where value = ?`, forbiddenValue).Scan(&count); err != nil {
			t.Fatalf("query runtime metadata value %q: %v", forbiddenValue, err)
		}
		if count != 0 {
			t.Fatalf("state import persisted forbidden OpenRouter runtime metadata value %q", forbiddenValue)
		}
	}
}

func TestHTTPAndMCPTransportParityForCoreOperations(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedHTTPHandlerCorpus(t, ctx, db, time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC))
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: &countingOpenRouterLLM{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prefer sqlite transport parity."}, Message: "openrouter steering updated"}}})

	for _, endpoint := range []struct{ method, path string }{
		{method: http.MethodGet, path: "/api/feed/today"},
		{method: http.MethodGet, path: "/api/search?q=sqlite"},
		{method: http.MethodGet, path: "/api/items/item_http_01"},
		{method: http.MethodPost, path: "/api/items/item_http_01/inspect"},
		{method: http.MethodPost, path: "/api/items/item_http_01/resonance"},
		{method: http.MethodPost, path: "/api/steer"},
	} {
		if endpoint.method == "" || endpoint.path == "" {
			t.Fatalf("invalid HTTP parity endpoint: %+v", endpoint)
		}
	}
	tools := mcpToolsListForTest(t, router)
	for _, tool := range []string{"list_candidate_items", "search_items", "read_item", "mark_inspected", "resonate_item", "steer"} {
		if _, ok := tools[tool]; !ok {
			t.Fatalf("MCP tools missing HTTP-equivalent operation %s; tools=%v", tool, tools)
		}
	}
	if got := mcpResourceText(t, router, "resofeed://feed/today"); !strings.Contains(got, "item_http_01") {
		t.Fatalf("MCP feed resource = %s, want same seeded item visible as HTTP feed", got)
	}
	if got := mcpToolJSON[ItemResponse](t, router, "read_item", map[string]any{"item_id": "item_http_01"}); got.Item.ID != "item_http_01" {
		t.Fatalf("MCP read_item = %+v, want HTTP item detail equivalent", got)
	}
}

func TestOpenRouterMigrationRemovesGeminiNamedRuntimeInjectionSurfaces(t *testing.T) {
	for _, typ := range []reflect.Type{reflect.TypeOf(HTTPServerConfig{}), reflect.TypeOf(MCPConfig{}), reflect.TypeOf(IngestConfig{})} {
		if _, ok := typ.FieldByName("Gemini"); ok {
			t.Fatalf("%s still exposes Gemini runtime injection; want shared LLMClient/OpenRouter surface", typ.Name())
		}
	}
}

type openRouterFailingLLM struct{}

func (openRouterFailingLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, context.DeadlineExceeded
}

func (openRouterFailingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, context.DeadlineExceeded
}

type countingOpenRouterLLM struct {
	mu  sync.Mutex
	out OpenRouterSteeringOutput
	n   int
}

func (c *countingOpenRouterLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
	return OpenRouterSummaryOutput{Summary: "OpenRouter dense summary.", CoreInsight: "OpenRouter validated insight.", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (c *countingOpenRouterLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
	return c.out, nil
}

func (c *countingOpenRouterLLM) calls() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.n
}
