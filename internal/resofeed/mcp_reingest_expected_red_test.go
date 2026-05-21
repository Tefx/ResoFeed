package resofeed

import (
	"context"
	"encoding/json"
	"testing"
)

// expected_result: red
// MCP parity for selected-item re-ingest and OpenRouter model listing should use
// the same product concepts as HTTP and must not admit language overrides.

func TestMCPToolsListIncludesReingestItemAndOpenRouterModelsContract(t *testing.T) {
	handler := NewMCPHandler(MCPConfig{OwnerToken: contractOwnerToken})
	tools := mcpToolsListForTest(t, handler)

	for _, name := range []string{"reingest_item", "list_openrouter_models"} {
		if _, ok := tools[name]; !ok {
			t.Fatalf("tools/list missing %s; tools=%v", name, tools)
		}
	}
	assertSchemaRequired(t, tools, "reingest_item", "item_id")
	assertSchemaRequired(t, tools, "reingest_item", "actor_id")
	assertSchemaRequired(t, tools, "reingest_item", "idempotency_key")
	if schema := tools["reingest_item"]["inputSchema"].(map[string]any); schemaAllowsProperty(schema, "language") {
		t.Fatalf("reingest_item schema admitted per-call language override: %#v", schema)
	}
}

func TestMCPReingestItemParityValidationAndResponseShapeContract(t *testing.T) {
	ctx := testingContext()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: itemReingestLLM{}})

	withLanguage := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-reingest-language", "language": "zh"})
	if withLanguage.Error == nil || nestedMCPErrorField(withLanguage.Error.Data) != "body" {
		t.Fatalf("MCP reingest language override error = %+v, want schema rejection", withLanguage.Error)
	}

	first := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-reingest-001"})
	if first.Error != nil {
		t.Fatalf("MCP reingest_item error: %+v", first.Error)
	}
	var parsed ItemReingestResponse
	if err := json.Unmarshal([]byte(mcpToolText(t, first, "reingest_item")), &parsed); err != nil {
		t.Fatalf("unmarshal MCP reingest response: %v", err)
	}
	if parsed.Reingest.ItemID != "item_reingest_01" || parsed.Reingest.Status != ReprocessStatusCompleted || parsed.Reingest.Item == nil || !parsed.Reingest.FTSUpdated {
		t.Fatalf("MCP reingest response = %+v, want HTTP parity response shape", parsed)
	}

	replay := mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "item_reingest_01", "actor_id": "briefing-agent", "idempotency_key": "mcp-reingest-001"})
	if replay.Error != nil {
		t.Fatalf("MCP reingest replay error: %+v", replay.Error)
	}
	var replayBody ItemReingestResponse
	if err := json.Unmarshal([]byte(mcpToolText(t, replay, "reingest_item")), &replayBody); err != nil {
		t.Fatalf("unmarshal MCP reingest replay: %v", err)
	}
	if !replayBody.AlreadyApplied {
		t.Fatalf("MCP reingest replay = %+v, want already_applied", replayBody)
	}
}

func schemaAllowsProperty(schema map[string]any, property string) bool {
	properties, _ := schema["properties"].(map[string]any)
	_, ok := properties[property]
	return ok
}

func testingContext() context.Context { return context.Background() }
