package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMCPStreamableHTTPResourcesToolsAuthAndIdempotency(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedMCPCorpus(t, ctx, db)

	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"resources/list"}`)))
	assertStatus(t, unauthorized, http.StatusUnauthorized)
	assertErrorCode(t, unauthorized.Body.Bytes(), "unauthorized")

	doctorText := mcpResourceText(t, handler, "resofeed://system/doctor")
	if !strings.Contains(doctorText, "rss: ok") || !strings.Contains(doctorText, "gemini: ok") {
		t.Fatalf("doctor resource text = %q, want rss/gemini diagnostics", doctorText)
	}

	feedText := mcpResourceText(t, handler, "resofeed://feed/today")
	var feed TodayFeedResponse
	if err := json.Unmarshal([]byte(feedText), &feed); err != nil {
		t.Fatalf("unmarshal feed resource: %v; text=%s", err, feedText)
	}
	if len(feed.Items) == 0 || feed.Items[0].ID != "mcp_item_01" {
		t.Fatalf("feed resource items = %+v, want seeded item", feed.Items)
	}

	candidate := mcpToolJSON[TodayFeedResponse](t, handler, "list_candidate_items", map[string]any{"limit": 20})
	if len(candidate.Items) != len(feed.Items) || candidate.Items[0].ID != feed.Items[0].ID {
		t.Fatalf("candidate/feed parity mismatch: candidates=%+v feed=%+v", candidate.Items, feed.Items)
	}

	search := mcpToolJSON[TodayFeedResponse](t, handler, "search_items", map[string]any{"query": "sqlite", "limit": 20})
	if len(search.Items) != 1 || search.Items[0].ID != "mcp_item_01" {
		t.Fatalf("search_items response = %+v, want sqlite seeded item", search.Items)
	}

	detail := mcpToolJSON[ItemResponse](t, handler, "read_item", map[string]any{"item_id": "mcp_item_01"})
	if detail.Item.ID != "mcp_item_01" || detail.Item.Provenance.SourceURL != "https://mcp.example/feed.xml" || detail.Item.ExtractedText == nil {
		t.Fatalf("read_item detail = %+v, want canonical detail/provenance", detail.Item)
	}

	missingQuery := mcpCall(t, handler, "search_items", map[string]any{"limit": 20})
	if missingQuery.Error == nil || missingQuery.Error.Data["field"] != "query" {
		t.Fatalf("missing search query error = %+v, want field=query", missingQuery.Error)
	}
	missingKey := mcpCall(t, handler, "resonate_item", map[string]any{"item_id": "mcp_item_01", "resonated": true, "actor_id": "briefing-agent"})
	if missingKey.Error == nil || missingKey.Error.Data["field"] != "idempotency_key" {
		t.Fatalf("missing idempotency error = %+v, want field=idempotency_key", missingKey.Error)
	}

	first := mcpToolJSON[ResonanceResult](t, handler, "resonate_item", map[string]any{"item_id": "mcp_item_01", "resonated": true, "actor_id": "briefing-agent", "idempotency_key": "briefing-agent-resonate-mcp-item-01"})
	if first.ItemID != "mcp_item_01" || !first.IsResonated || first.AlreadyApplied {
		t.Fatalf("first resonance = %+v, want applied once", first)
	}
	second := mcpToolJSON[ResonanceResult](t, handler, "resonate_item", map[string]any{"item_id": "mcp_item_01", "resonated": true, "actor_id": "briefing-agent", "idempotency_key": "briefing-agent-resonate-mcp-item-01"})
	if !second.IsResonated || !second.AlreadyApplied {
		t.Fatalf("second resonance = %+v, want idempotent already_applied", second)
	}
}

func seedMCPCorpus(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, ?, 'ok', 1, 1)`, "mcp_src_01", "https://mcp.example/feed.xml", "MCP Source", now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert MCP source: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'full', 'ok')`, "mcp_item_01", "mcp_src_01", "https://mcp.example/feed.xml", "https://mcp.example/sqlite", "https://mcp.example/sqlite", "SQLite MCP contract", "sqlite excerpt", "full extracted sqlite text", "Dense sqlite summary", "Why sqlite matters", "high", now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert MCP item: %v", err)
	}
	if err := RebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild MCP search index: %v", err)
	}
}

func mcpResourceText(t *testing.T, handler http.Handler, uri string) string {
	t.Helper()
	resp := mcpRequestJSON(t, handler, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "resources/read", "params": map[string]any{"uri": uri}})
	if resp.Error != nil {
		t.Fatalf("resources/read %s error: %+v", uri, resp.Error)
	}
	data, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatalf("marshal resource result: %v", err)
	}
	var parsed struct {
		Contents []mcpResourceContent `json:"contents"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal resource result: %v; result=%s", err, data)
	}
	if len(parsed.Contents) != 1 {
		t.Fatalf("resource contents len = %d, want 1", len(parsed.Contents))
	}
	return parsed.Contents[0].Text
}

func mcpToolJSON[T any](t *testing.T, handler http.Handler, name string, args map[string]any) T {
	t.Helper()
	resp := mcpCall(t, handler, name, args)
	if resp.Error != nil {
		t.Fatalf("tools/call %s error: %+v", name, resp.Error)
	}
	data, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatalf("marshal tool result: %v", err)
	}
	var parsed struct {
		Content []mcpContent `json:"content"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal tool result: %v; result=%s", err, data)
	}
	if len(parsed.Content) != 1 {
		t.Fatalf("tool content len = %d, want 1", len(parsed.Content))
	}
	var value T
	if err := json.Unmarshal([]byte(parsed.Content[0].Text), &value); err != nil {
		t.Fatalf("unmarshal tool JSON text for %s: %v; text=%s", name, err, parsed.Content[0].Text)
	}
	return value
}

func mcpCall(t *testing.T, handler http.Handler, name string, args map[string]any) mcpResponse {
	t.Helper()
	return mcpRequestJSON(t, handler, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": map[string]any{"name": name, "arguments": args}})
}

func mcpRequestJSON(t *testing.T, handler http.Handler, payload map[string]any) mcpResponse {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal MCP request: %v", err)
	}
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	handler.ServeHTTP(recorder, req)
	assertStatus(t, recorder, http.StatusOK)
	var resp mcpResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal MCP response: %v; body=%s", err, recorder.Body.String())
	}
	return resp
}
