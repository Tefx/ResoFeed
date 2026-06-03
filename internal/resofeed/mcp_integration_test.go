package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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
	if !strings.Contains(doctorText, "rss: ok") || !strings.Contains(doctorText, "openrouter:") {
		t.Fatalf("doctor resource text = %q, want rss/openrouter diagnostics", doctorText)
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
	if missingQuery.Error == nil || nestedMCPErrorField(missingQuery.Error.Data) != "query" {
		t.Fatalf("missing search query error = %+v, want field=query", missingQuery.Error)
	}
	missingKey := mcpCall(t, handler, "resonate_item", map[string]any{"item_id": "mcp_item_01", "resonated": true, "actor_id": "briefing-agent"})
	if missingKey.Error == nil || nestedMCPErrorField(missingKey.Error.Data) != "idempotency_key" {
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

func TestMCPResourcesReadFreshEmptyStateSerializesSourcesAndRulesAsArrays(t *testing.T) {
	// Spec-derived fixture: docs/ARCHITECTURE.md §7 MCP Surface Resources
	// documents the exact resource URIs and JSON bodies, while §6 Endpoint
	// contracts require /api/sources and /api/steer/active parity as arrays.
	ctx := context.Background()
	db := newContractDB(t, ctx)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		uri   string
		field string
	}{
		{uri: "resofeed://sources", field: "sources"},
		{uri: "resofeed://rules/active", field: "rules"},
	} {
		t.Run(tc.uri, func(t *testing.T) {
			assertMCPResourceJSONEmptyArray(t, handler, tc.uri, tc.field)
		})
	}
}

func TestMCPCurrentOperationResourceIdleAndRunningStates(t *testing.T) {
	handler := NewMCPHandler(MCPConfig{OwnerToken: contractOwnerToken})

	idleText := mcpResourceText(t, handler, RuntimeOperationMCPResourceURI)
	assertJSONEqual(t, []byte(idleText), []byte(`{
		"operation": {
			"running": false,
			"kind": null,
			"actor_kind": null,
			"phase": null,
			"count": null,
			"message": null,
			"started_at": null,
			"updated_at": null
		}
	}`))

	release, err := tryAcquireIngestGuard(context.Background(), "fetch", "source")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	t.Cleanup(release)

	runningText := mcpResourceText(t, handler, RuntimeOperationMCPResourceURI)
	operation := decodeCurrentOperationEnvelope(t, []byte(runningText))
	assertCurrentOperationShape(t, operation)
	if operation["running"] != true || operation["kind"] != "source_fetch" || operation["actor_kind"] != "human" {
		t.Fatalf("MCP operation snapshot = %#v, want running source_fetch with human actor from shared in-memory guard", operation)
	}
	assertRFC3339Field(t, operation, "started_at")
	assertRFC3339Field(t, operation, "updated_at")
}

func TestMCPGuardConflictDetailsMatchHTTPCurrentOperationShape(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})
	release, err := tryAcquireIngestGuard(ctx, "ingest", "all")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	t.Cleanup(release)

	resp := mcpCall(t, handler, "reprocess_library", map[string]any{"actor_id": "briefing-agent", "idempotency_key": "mcp-reprocess-operation-conflict"})
	if resp.Error == nil {
		t.Fatalf("reprocess_library conflict response missing error")
	}
	if resp.Error.Code != -32000 || resp.Error.Message != "operation already running" {
		t.Fatalf("MCP conflict error = %+v, want JSON-RPC operation conflict", resp.Error)
	}
	inner, ok := resp.Error.Data["error"].(map[string]any)
	if !ok {
		t.Fatalf("MCP conflict data = %#v, want nested error object", resp.Error.Data)
	}
	if inner["code"] != "conflict" || inner["message"] != "operation already running" {
		t.Fatalf("MCP nested conflict error = %#v, want HTTP conflict code/message", inner)
	}
	details, ok := inner["details"].(map[string]any)
	if !ok {
		t.Fatalf("MCP conflict details = %#v, want object", inner["details"])
	}
	assertConflictDetailsWithCurrentOperation(t, details, "manual_ingest", "human")
}

func TestMCPReadItemFullExtractionStatusRequiresDetailTextOrFallbackReason(t *testing.T) {
	// REG-2026-05-12-04: distinct from REG-02 empty-resource array coverage.
	// This fixture models the audit gap where SQLite transport parity showed
	// extraction_status=full while MCP read_item evidence had no extracted detail
	// text. A full extraction must expose non-empty detail text through the real
	// POST /mcp tool response, or the response/storage status must no longer claim
	// full extraction, or a clear fallback reason must be present.
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedMCPFullExtractionWithoutDetailText(t, ctx, db)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	var storedStatus string
	var storedExtracted sql.NullString
	err := db.QueryRowContext(ctx, `select extraction_status, extracted_text from items where id = 'mcp_reg04_full_without_text'`).Scan(&storedStatus, &storedExtracted)
	if err != nil {
		t.Fatalf("read REG-04 fixture storage: %v", err)
	}
	if storedStatus != "full" {
		t.Fatalf("REG-04 fixture storage extraction_status = %q, want full", storedStatus)
	}
	if strings.TrimSpace(storedExtracted.String) != "" {
		t.Fatalf("REG-04 fixture storage extracted_text = %q, want empty audit-gap fixture", storedExtracted.String)
	}

	resp := mcpCall(t, handler, "read_item", map[string]any{"item_id": "mcp_reg04_full_without_text"})
	rawToolText := mcpToolText(t, resp, "read_item")
	var body struct {
		Item struct {
			ID               string  `json:"id"`
			ExtractionStatus string  `json:"extraction_status"`
			ExtractedText    *string `json:"extracted_text"`
		} `json:"item"`
		FallbackReason *string `json:"fallback_reason"`
	}
	if err := json.Unmarshal([]byte(rawToolText), &body); err != nil {
		t.Fatalf("unmarshal REG-04 read_item response: %v; text=%s", err, rawToolText)
	}
	if body.Item.ID != "mcp_reg04_full_without_text" {
		t.Fatalf("REG-04 read_item id = %q, want fixture item; text=%s", body.Item.ID, rawToolText)
	}

	hasFallbackReason := body.FallbackReason != nil && strings.TrimSpace(*body.FallbackReason) != ""
	if body.Item.ExtractionStatus != extractionStatusFull {
		t.Fatalf("REG-04 read_item extraction_status = %q, want %q; response=%s", body.Item.ExtractionStatus, extractionStatusFull, rawToolText)
	}
	if !hasFallbackReason {
		t.Fatalf("REG-2026-05-12-04 exposed: MCP read_item returned extraction_status=full without fallback reason; response=%s", rawToolText)
	}
}

func TestMCPSteerUsesConfiguredOpenRouterAndReceipts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &recordingSteeringGemini{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"OpenRouter translated systems policy."}, Message: "openrouter steering updated"}}
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	first := mcpToolJSON[SteerResult](t, handler, "steer", map[string]any{"command": "Push more systems papers.", "actor_id": "briefing-agent", "idempotency_key": "steer-openrouter-001"})
	if first.Receipt.InterpretedAs != "openrouter_policy_update" || first.Receipt.Message != "openrouter steering updated" || len(first.Receipt.ChangedRules) != 1 || first.Receipt.ChangedRules[0].RuleText != "OpenRouter translated systems policy." {
		t.Fatalf("first steer receipt = %+v, want OpenRouter translated policy", first.Receipt)
	}
	if got := llm.calls(); got != 1 {
		t.Fatalf("OpenRouter TranslateSteering calls = %d, want 1", got)
	}
	second := mcpToolJSON[SteerResult](t, handler, "steer", map[string]any{"command": "Push more systems papers.", "actor_id": "briefing-agent", "idempotency_key": "steer-openrouter-001"})
	if second.Receipt.InterpretedAs != first.Receipt.InterpretedAs || len(second.Receipt.ChangedRules) != 1 {
		t.Fatalf("idempotent steer receipt = %+v, want stored first receipt", second.Receipt)
	}
	if got := llm.calls(); got != 1 {
		t.Fatalf("OpenRouter calls after idempotent retry = %d, want still 1", got)
	}
	unauthorized := httptest.NewRecorder()
	body := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"steer","arguments":{"command":"Push more databases.","actor_id":"briefing-agent","idempotency_key":"steer-no-auth"}}}`
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(body)))
	assertStatus(t, unauthorized, http.StatusUnauthorized)
	if got := llm.calls(); got != 1 {
		t.Fatalf("OpenRouter calls after unauthorized request = %d, want still 1", got)
	}
}

func TestMCPRealBoundListenerInitializeResourcesAndTools(t *testing.T) {
	// Audit contract lock: downstream MCP-1 closure must exercise a real bound
	// listener equivalent to resofeed serve, prove missing/invalid POST /mcp auth
	// returns HTTP 401 before JSON-RPC dispatch, then prove a valid owner token can
	// initialize and read resources on that same running instance.
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedMCPCorpus(t, ctx, db)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	publicURL := "https://resofeed.example.test"
	server := &http.Server{Handler: NewRouter(HTTPServerConfig{DB: db, PublicURL: publicURL, OwnerToken: contractOwnerToken})}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Serve(listener)
	}()
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			t.Fatalf("shutdown bound MCP server: %v", err)
		}
		if err := <-errCh; err != nil && err != http.ErrServerClosed {
			t.Fatalf("serve bound MCP server: %v", err)
		}
	})
	baseURL := "http://" + listener.Addr().String() + "/mcp"
	initialize := mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "initialize"})
	if initialize.Error != nil {
		t.Fatalf("initialize error: %+v", initialize.Error)
	}
	initResult, ok := initialize.Result.(map[string]any)
	if !ok {
		t.Fatalf("initialize result has unexpected shape: %#v", initialize.Result)
	}
	serverInfo, ok := initResult["serverInfo"].(map[string]any)
	if !ok {
		t.Fatalf("initialize result missing serverInfo: %#v", initResult)
	}
	if got := serverInfo["publicUrl"]; got != publicURL {
		t.Fatalf("initialize publicUrl = %v, want %s", got, publicURL)
	}
	if got := serverInfo["mcpUrl"]; got != publicURL+"/mcp" {
		t.Fatalf("initialize mcpUrl = %v, want %s", got, publicURL+"/mcp")
	}
	resources := mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 2, "method": "resources/list"})
	if resources.Error != nil {
		t.Fatalf("resources/list error: %+v", resources.Error)
	}
	tools := mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 3, "method": "tools/list"})
	if tools.Error != nil {
		t.Fatalf("tools/list error: %+v", tools.Error)
	}
}

func TestMCPRealBoundListenerSteerUsesConfiguredOpenRouterAndIdempotency(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &recordingSteeringGemini{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"OpenRouter translated systems policy."}, Message: "openrouter steering updated"}}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	server := &http.Server{Handler: NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Serve(listener)
	}()
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			t.Fatalf("shutdown bound MCP steer server: %v", err)
		}
		if err := <-errCh; err != nil && err != http.ErrServerClosed {
			t.Fatalf("serve bound MCP steer server: %v", err)
		}
	})
	baseURL := "http://" + listener.Addr().String() + "/mcp"
	payload := map[string]any{"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": map[string]any{"name": "steer", "arguments": map[string]any{"command": "Push more systems papers.", "actor_id": "briefing-agent", "idempotency_key": "bound-steer-openrouter-001"}}}

	firstResp := mcpHTTPPost(t, baseURL, payload)
	first := mcpToolResultJSON[SteerResult](t, firstResp, "steer")
	if first.Receipt.InterpretedAs != "openrouter_policy_update" || first.Receipt.Message != "openrouter steering updated" || len(first.Receipt.ChangedRules) != 1 || first.Receipt.ChangedRules[0].RuleText != "OpenRouter translated systems policy." {
		t.Fatalf("first bound steer receipt = %+v, want configured OpenRouter translated policy", first.Receipt)
	}
	if got := llm.calls(); got != 1 {
		t.Fatalf("OpenRouter TranslateSteering calls after first bound steer = %d, want 1", got)
	}

	secondResp := mcpHTTPPost(t, baseURL, payload)
	second := mcpToolResultJSON[SteerResult](t, secondResp, "steer")
	if second.Receipt.InterpretedAs != first.Receipt.InterpretedAs || len(second.Receipt.ChangedRules) != 1 || second.Receipt.ChangedRules[0].RuleText != first.Receipt.ChangedRules[0].RuleText {
		t.Fatalf("idempotent bound steer receipt = %+v, want stored first receipt", second.Receipt)
	}
	if got := llm.calls(); got != 1 {
		t.Fatalf("OpenRouter TranslateSteering calls after bound retry = %d, want still 1", got)
	}

	unauthorized := mcpHTTPPostWithToken(t, baseURL, payload, "wrong-owner-token")
	if unauthorized.status != http.StatusUnauthorized {
		t.Fatalf("unauthorized bound steer status = %d, want 401; body=%s", unauthorized.status, unauthorized.body)
	}
	assertErrorCode(t, unauthorized.body, "unauthorized")
	if got := llm.calls(); got != 1 {
		t.Fatalf("OpenRouter TranslateSteering calls after unauthorized bound steer = %d, want still 1", got)
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
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild MCP search index: %v", err)
	}
}

func seedMCPFullExtractionWithoutDetailText(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Date(2026, 5, 12, 9, 0, 0, 0, time.UTC)
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, ?, 'ok', 1, 1)`, "mcp_reg04_src", "https://reg04.example/feed.xml", "REG-04 Source", now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert REG-04 source: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, 'full', 'ok')`, "mcp_reg04_full_without_text", "mcp_reg04_src", "https://reg04.example/feed.xml", "https://reg04.example/full-without-text", "https://reg04.example/full-without-text", "REG-04 full status without detail text", "feed excerpt exists but is not extracted article detail", "summary exists but cannot substitute for extracted detail text", "full status must imply stored extracted detail text", "high", now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert REG-04 item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild REG-04 search index: %v", err)
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

func assertMCPResourceJSONEmptyArray(t *testing.T, handler http.Handler, uri string, field string) {
	t.Helper()
	text := mcpResourceText(t, handler, uri)
	var body map[string]json.RawMessage
	if err := json.Unmarshal([]byte(text), &body); err != nil {
		t.Fatalf("unmarshal %s resource JSON: %v; text=%s", uri, err, text)
	}
	raw, ok := body[field]
	if !ok {
		t.Fatalf("%s resource missing %q field; text=%s", uri, field, text)
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		t.Fatalf("%s resource field %q = null, want empty JSON array; text=%s", uri, field, text)
	}
	var values []json.RawMessage
	if err := json.Unmarshal(raw, &values); err != nil {
		t.Fatalf("%s resource field %q is not a JSON array: %v; raw=%s", uri, field, err, raw)
	}
	if len(values) != 0 {
		t.Fatalf("%s resource field %q len = %d, want 0; text=%s", uri, field, len(values), text)
	}
}

func mcpToolJSON[T any](t *testing.T, handler http.Handler, name string, args map[string]any) T {
	t.Helper()
	resp := mcpCall(t, handler, name, args)
	if resp.Error != nil {
		t.Fatalf("tools/call %s error: %+v", name, resp.Error)
	}
	return mcpToolResultJSON[T](t, resp, name)
}

func mcpToolResultJSON[T any](t *testing.T, resp mcpResponse, name string) T {
	t.Helper()
	text := mcpToolText(t, resp, name)
	var value T
	if err := json.Unmarshal([]byte(text), &value); err != nil {
		t.Fatalf("unmarshal tool JSON text for %s: %v; text=%s", name, err, text)
	}
	return value
}

func mcpToolText(t *testing.T, resp mcpResponse, name string) string {
	t.Helper()
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
	return parsed.Content[0].Text
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

func nestedMCPErrorField(data map[string]any) string {
	inner, ok := data["error"].(map[string]any)
	if !ok {
		return ""
	}
	details, ok := inner["details"].(map[string]any)
	if !ok {
		return ""
	}
	field, _ := details["field"].(string)
	return field
}

func mcpHTTPPost(t *testing.T, url string, payload map[string]any) mcpResponse {
	t.Helper()
	result := mcpHTTPPostWithToken(t, url, payload, contractOwnerToken)
	if result.status != http.StatusOK {
		t.Fatalf("MCP HTTP status = %d, want 200; body=%s", result.status, result.body)
	}
	var decoded mcpResponse
	if err := json.Unmarshal(result.body, &decoded); err != nil {
		t.Fatalf("decode MCP HTTP response: %v", err)
	}
	return decoded
}

type mcpHTTPResult struct {
	status int
	body   []byte
}

func mcpHTTPPostWithToken(t *testing.T, url string, payload map[string]any, token string) mcpHTTPResult {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal MCP HTTP request: %v", err)
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create MCP HTTP request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Transport: &http.Transport{Proxy: nil}}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("post MCP HTTP request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read MCP HTTP response: %v", err)
	}
	return mcpHTTPResult{status: resp.StatusCode, body: data}
}

type recordingSteeringGemini struct {
	mu  sync.Mutex
	n   int
	out OpenRouterSteeringOutput
}

func (g *recordingSteeringGemini) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, nil
}

func (g *recordingSteeringGemini) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.n++
	return g.out, nil
}

func (g *recordingSteeringGemini) calls() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.n
}
