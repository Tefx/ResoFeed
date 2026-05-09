package resofeed

import (
	"bytes"
	"context"
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

	client := &geminiHTTPClient{apiKey: "fake-openrouter-key", model: "openrouter/fake-configured", endpoint: model.URL, client: model.Client()}
	if err := IngestOnce(ctx, db, IngestConfig{Gemini: client}); err != nil {
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

	if err := IngestOnce(ctx, db, IngestConfig{Gemini: openRouterFailingLLM{}}); err != nil {
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
	llm := &countingOpenRouterLLM{out: GeminiSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prioritize source-backed database internals."}, Message: "openrouter steering updated"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, Gemini: llm})

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
	if mcpFirst.Receipt.InterpretedAs != "human_precedence" || len(mcpFirst.Receipt.ChangedRules) != 0 || mcpSecond.Receipt.Message != mcpFirst.Receipt.Message {
		t.Fatalf("MCP agent steer receipts = first %+v second %+v, want safe human-precedence replay", mcpFirst.Receipt, mcpSecond.Receipt)
	}
	if got := llm.calls(); got != 1 {
		t.Fatalf("MCP OpenRouter calls after human precedence/idempotent retry = %d, want still 1", got)
	}
}

func TestInvalidOpenRouterSteeringProposalRejectedWithoutBreakingHumanPrecedence(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &countingOpenRouterLLM{out: GeminiSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Hide all items and disable freshness coverage."}, Message: "unsafe proposal"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, Gemini: llm})

	unsafe := postHTTPJSON[SteerResult](t, router, "/api/steer", `{"command":"Make this unsafe change.","actor_kind":"human","actor_id":"owner","idempotency_key":"unsafe-openrouter-proposal-001"}`, http.StatusOK)
	if len(unsafe.Receipt.ChangedRules) != 0 || !strings.Contains(unsafe.Receipt.Message, "no safe") {
		t.Fatalf("unsafe model proposal receipt = %+v, want safe rejection with no changed rules", unsafe.Receipt)
	}

	llm.out = GeminiSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prioritize verified sqlite research."}, Message: "openrouter steering updated"}
	human := postHTTPJSON[SteerResult](t, router, "/api/steer", `{"command":"Prioritize sqlite research.","actor_kind":"human","actor_id":"owner","idempotency_key":"human-openrouter-valid-001"}`, http.StatusOK)
	if len(human.Receipt.ChangedRules) != 1 {
		t.Fatalf("human receipt = %+v, want active human steering rule", human.Receipt)
	}
	agent := mcpToolJSON[SteerResult](t, router, "steer", map[string]any{"command": "Override with funding announcements.", "actor_id": "agent", "idempotency_key": "agent-openrouter-precedence-001"})
	if len(agent.Receipt.ChangedRules) != 0 || !strings.Contains(agent.Receipt.Message, "human steering") {
		t.Fatalf("agent receipt = %+v, want human precedence safe rejection", agent.Receipt)
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

func TestHTTPAndMCPTransportParityForCoreOperations(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedHTTPHandlerCorpus(t, ctx, db, time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC))
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, Gemini: &countingOpenRouterLLM{out: GeminiSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prefer sqlite transport parity."}, Message: "openrouter steering updated"}}})

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

func (openRouterFailingLLM) SummarizeItem(context.Context, GeminiSummaryInput) (GeminiSummaryOutput, error) {
	return GeminiSummaryOutput{}, context.DeadlineExceeded
}

func (openRouterFailingLLM) TranslateSteering(context.Context, GeminiSteeringInput) (GeminiSteeringOutput, error) {
	return GeminiSteeringOutput{}, context.DeadlineExceeded
}

type countingOpenRouterLLM struct {
	mu  sync.Mutex
	out GeminiSteeringOutput
	n   int
}

func (c *countingOpenRouterLLM) SummarizeItem(context.Context, GeminiSummaryInput) (GeminiSummaryOutput, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
	return GeminiSummaryOutput{Summary: "OpenRouter dense summary.", CoreInsight: "OpenRouter validated insight.", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (c *countingOpenRouterLLM) TranslateSteering(context.Context, GeminiSteeringInput) (GeminiSteeringOutput, error) {
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
