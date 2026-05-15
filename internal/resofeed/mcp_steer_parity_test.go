package resofeed

import (
	"context"
	"testing"
)

func TestMCPPreviewSteerRejectsIdempotencyKeyByField(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	resp := mcpCall(t, handler, "preview_steer", map[string]any{
		"command":         "search sqlite",
		"actor_id":        "briefing-agent",
		"idempotency_key": "preview-is-read-only",
	})
	expectedRedAssertNestedMCPError(t, resp, -32602, "bad_request", "idempotency_key", "", "preview_steer rejects idempotency_key because preview is read-only")
}

func TestMCPUndoSteerFlatTargetInputAndUnsupportedKind(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	undo := mcpToolJSON[SteerUndoResult](t, handler, "undo_steer", map[string]any{
		"target_kind":     "steer_rule",
		"target_id":       "rule_srdct_existing",
		"actor_id":        "briefing-agent",
		"idempotency_key": "mcp-flat-undo-steer-rule",
	})
	if undo.Target == nil || undo.Target.Kind != "steer_rule" || undo.Target.ID != "rule_srdct_existing" || !undo.Undone || undo.RestoredRule == nil || undo.RestoredSource != nil {
		t.Fatalf("flat undo_steer result = %+v, want target-specific steer_rule undo", undo)
	}

	unsupported := mcpCall(t, handler, "undo_steer", map[string]any{
		"target_kind":     "global_history",
		"target_id":       "anything",
		"actor_id":        "briefing-agent",
		"idempotency_key": "mcp-flat-undo-unsupported",
	})
	expectedRedAssertNestedMCPError(t, unsupported, -32602, "bad_request", "target_kind", "", "undo_steer rejects unsupported target kind and never consults global history")
}
