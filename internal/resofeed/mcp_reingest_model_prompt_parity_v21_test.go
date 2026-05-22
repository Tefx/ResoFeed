package resofeed

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestV21MCPListOpenRouterModelsIsProviderBackedAndRedacted(t *testing.T) {
	withUnsetOpenRouterKey(t)
	missingKeyHandler := NewMCPHandler(MCPConfig{OwnerToken: contractOwnerToken})
	missingKey := mcpCall(t, missingKeyHandler, "list_openrouter_models", map[string]any{})
	var missingKeyBody OpenRouterModelsResponse
	if err := json.Unmarshal([]byte(mcpToolText(t, missingKey, "list_openrouter_models")), &missingKeyBody); err != nil {
		t.Fatalf("unmarshal missing-key MCP model list: %v", err)
	}
	if missingKeyBody.Models == nil || len(missingKeyBody.Models) != 0 {
		t.Fatalf("missing-key MCP model list = %+v, want empty models array", missingKeyBody)
	}

	providerCalls := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		providerCalls++
		if r.URL.Path != "/api/v1/models" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-or-mcp-model-list" {
			http.Error(w, `{"error":"raw auth leak sk-or-mcp-model-list /tmp/.env"}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"id":"openrouter/mcp-model","name":"MCP Model"}]}`)
	}))
	t.Cleanup(provider.Close)
	handler := NewMCPHandler(MCPConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-mcp-model-list", Endpoint: provider.URL}})
	resp := mcpCall(t, handler, "list_openrouter_models", map[string]any{})
	var body OpenRouterModelsResponse
	if err := json.Unmarshal([]byte(mcpToolText(t, resp, "list_openrouter_models")), &body); err != nil {
		t.Fatalf("unmarshal MCP model list: %v", err)
	}
	if providerCalls != 1 || len(body.Models) != 1 || body.Models[0].ID != "openrouter/mcp-model" || body.Models[0].Name != "MCP Model" {
		t.Fatalf("MCP provider-backed model list calls=%d body=%+v", providerCalls, body)
	}

	failingProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `OpenRouter raw provider detail sk-or-mcp-failure /Users/owner/project/.env owner-token-leak`, http.StatusBadGateway)
	}))
	t.Cleanup(failingProvider.Close)
	failingHandler := NewMCPHandler(MCPConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-mcp-failure", Endpoint: failingProvider.URL}})
	failure := mcpCall(t, failingHandler, "list_openrouter_models", map[string]any{})
	if failure.Error == nil {
		t.Fatalf("MCP model-list provider failure unexpectedly succeeded")
	}
	data, err := json.Marshal(failure.Error)
	if err != nil {
		t.Fatalf("marshal MCP provider error: %v", err)
	}
	if !strings.Contains(string(data), "provider_unavailable") || !strings.Contains(string(data), "models unavailable") {
		t.Fatalf("MCP provider failure = %s, want provider_unavailable models unavailable", data)
	}
	for _, forbidden := range []string{"OpenRouter raw provider detail", "sk-or-mcp-failure", ".env", "owner-token-leak", contractOwnerToken} {
		if strings.Contains(string(data), forbidden) {
			t.Fatalf("MCP provider failure leaked %q: %s", forbidden, data)
		}
	}
}

func TestV21MCPReingestItemAcceptsPromptModelAndUsesSharedOperation(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	llm := &v21RecordingReingestLLM{}
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})
	tools := mcpToolsListForTest(t, handler)
	for _, field := range []string{"model", "prompt", "extra_prompt"} {
		if !schemaAllowsProperty(tools["reingest_item"]["inputSchema"].(map[string]any), field) {
			t.Fatalf("reingest_item schema missing %s: %#v", field, tools["reingest_item"])
		}
	}
	if schemaAllowsProperty(tools["reingest_item"]["inputSchema"].(map[string]any), "language") {
		t.Fatalf("reingest_item schema admitted language override: %#v", tools["reingest_item"])
	}

	conflict := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-v21-conflict", "prompt": "first", "extra_prompt": "second"})
	if conflict.Error == nil || nestedMCPErrorField(conflict.Error.Data) != "prompt" {
		t.Fatalf("MCP prompt alias conflict = %+v, want prompt field error", conflict.Error)
	}
	if llm.calls != 0 {
		t.Fatalf("prompt alias conflict called LLM %d times", llm.calls)
	}

	first := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-v21-model-prompt", "model": " openrouter/request-scoped ", "extra_prompt": "  tighten facts  "})
	var parsed ItemReingestResponse
	if err := json.Unmarshal([]byte(mcpToolText(t, first, "reingest_item")), &parsed); err != nil {
		t.Fatalf("unmarshal MCP reingest response: %v", err)
	}
	if llm.last.Model != "openrouter/request-scoped" || llm.last.Prompt != "tighten facts" {
		t.Fatalf("MCP normalized model/prompt = %q/%q", llm.last.Model, llm.last.Prompt)
	}
	if parsed.Reingest.ItemID != "item_reingest_01" || parsed.Reingest.Status != ReprocessStatusCompleted || !parsed.Reingest.ItemUpdated || !parsed.Reingest.FTSUpdated || parsed.Reingest.Item == nil {
		t.Fatalf("MCP reingest response = %+v, want canonical shared ItemReingestResponse with refreshed item/FTS", parsed)
	}

	replay := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-v21-model-prompt", "model": "openrouter/request-scoped", "prompt": "tighten facts"})
	var replayBody ItemReingestResponse
	if err := json.Unmarshal([]byte(mcpToolText(t, replay, "reingest_item")), &replayBody); err != nil {
		t.Fatalf("unmarshal MCP reingest replay: %v", err)
	}
	if !replayBody.AlreadyApplied {
		t.Fatalf("MCP same normalized prompt/model replay = %+v, want already_applied", replayBody)
	}

	mismatch := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-v21-model-prompt", "model": "openrouter/request-scoped", "prompt": "different prompt"})
	if mismatch.Error == nil || nestedMCPErrorField(mismatch.Error.Data) != "idempotency_key" {
		t.Fatalf("MCP changed prompt/key mismatch = %+v, want idempotency_key error", mismatch.Error)
	}
	assertReceiptOmitsRawPromptModel(t, ctx, db, "mcp-v21-model-prompt", []string{"openrouter/request-scoped", "tighten facts", "different prompt"})
	assertStateExportOmits(t, ctx, db, []string{"openrouter/request-scoped", "tighten facts", "different prompt"})
}
