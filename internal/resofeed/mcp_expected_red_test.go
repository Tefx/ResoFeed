package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestMCPExpectedRedLanguageReprocessSearchDeliveryParityThroughPublicSurface(t *testing.T) {
	// Expected-red contract coverage from docs/ARCHITECTURE.md §7:
	// public Streamable HTTP /mcp must expose runtime language, reprocess,
	// delivery, search query echo, owner-token-only auth, provenance actor_id,
	// JSON-RPC error envelopes, and no per-call language override.
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedMCPCorpus(t, ctx, db)
	baseURL := startExpectedRedMCPServer(t, db)
	deliveredAt := time.Date(2026, 5, 9, 15, 0, 0, 0, time.UTC)

	resourcesResp := mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "resources/list"})
	resources := expectedRedResourceList(t, resourcesResp)
	if !expectedRedHasResource(resources, RuntimeLanguageMCPResourceURI) {
		t.Errorf("resources/list missing %s; resources=%v", RuntimeLanguageMCPResourceURI, resources)
	}

	toolsResp := mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
	tools := expectedRedToolNames(t, toolsResp)
	for _, name := range []string{"get_processing_language", "set_processing_language", "reprocess_library"} {
		if _, ok := tools[name]; !ok {
			t.Errorf("tools/list missing %s; tools=%v", name, tools)
		}
	}

	langResourceResp := mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 3, "method": "resources/read", "params": map[string]any{"uri": RuntimeLanguageMCPResourceURI}})
	if text, ok := expectedRedResourceText(t, langResourceResp, "runtime language resource"); ok {
		expectedRedAssertLanguageResponse(t, text, ProcessingLanguageEnglish, false, "runtime language resource")
	}

	getLangResp := expectedRedMCPToolCall(t, baseURL, "get_processing_language", map[string]any{})
	if text, ok := expectedRedToolText(t, getLangResp, "get_processing_language"); ok {
		expectedRedAssertLanguageResponse(t, text, ProcessingLanguageEnglish, false, "get_processing_language")
	}

	setArgs := map[string]any{"language": "zh", "actor_id": "briefing-agent", "idempotency_key": "mcp-lang-expected-red-001"}
	setLangResp := expectedRedMCPToolCall(t, baseURL, "set_processing_language", setArgs)
	if text, ok := expectedRedToolText(t, setLangResp, "set_processing_language"); ok {
		expectedRedAssertLanguageResponse(t, text, ProcessingLanguageChinese, false, "set_processing_language")
	}
	replayLangResp := expectedRedMCPToolCall(t, baseURL, "set_processing_language", setArgs)
	if text, ok := expectedRedToolText(t, replayLangResp, "set_processing_language replay"); ok {
		expectedRedAssertLanguageResponse(t, text, ProcessingLanguageChinese, true, "set_processing_language replay")
	}
	mismatchLangResp := expectedRedMCPToolCall(t, baseURL, "set_processing_language", map[string]any{"language": "en", "actor_id": "briefing-agent", "idempotency_key": "mcp-lang-expected-red-001"})
	expectedRedAssertNestedMCPError(t, mismatchLangResp, -32602, "bad_request", "idempotency_key", "request_fingerprint_mismatch", "set_processing_language fingerprint mismatch")

	release, err := tryAcquireIngestGuard(context.Background(), "ingest", "all")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	conflictResp := expectedRedMCPToolCall(t, baseURL, "reprocess_library", map[string]any{"actor_id": "briefing-agent", "idempotency_key": "mcp-reprocess-expected-red-conflict"})
	release()
	expectedRedAssertNestedMCPConflict(t, conflictResp, "reprocess_library guarded-operation conflict")

	reprocessResp := expectedRedMCPToolCall(t, baseURL, "reprocess_library", map[string]any{"actor_id": "briefing-agent", "idempotency_key": "mcp-reprocess-expected-red-001"})
	if text, ok := expectedRedToolText(t, reprocessResp, "reprocess_library"); ok {
		expectedRedAssertReprocessResponse(t, text)
	}
	expectedRedAssertNoDurableDeliveryOrReprocessTables(t, ctx, db)

	source := "MCP Source"
	from := "2026-05-01"
	to := "2026-05-31"
	resonated := false
	searchResp := expectedRedMCPToolCall(t, baseURL, "search_items", map[string]any{"query": "sqlite", "source": source, "from": from, "to": to, "resonated": resonated, "limit": 5})
	if text, ok := expectedRedToolText(t, searchResp, "search_items"); ok {
		expectedRedAssertSearchEcho(t, text, SearchQueryEcho{Q: "sqlite", Source: &source, From: &from, To: &to, Resonated: &resonated, Limit: 5})
	}
	noOverrideResp := expectedRedMCPToolCall(t, baseURL, "search_items", map[string]any{"query": "sqlite", "language": "zh"})
	expectedRedAssertNestedMCPError(t, noOverrideResp, -32602, "bad_request", "body", "", "search_items rejects per-call language override")

	unauthorizedPayload := map[string]any{"jsonrpc": "2.0", "id": 20, "method": "tools/call", "params": map[string]any{"name": "report_delivery", "arguments": map[string]any{"item_id": "mcp_item_01", "actor_id": "briefing-agent", "delivered_at": deliveredAt.Format(time.RFC3339), "idempotency_key": "mcp-delivery-no-auth"}}}
	unauthorized := mcpHTTPPostWithToken(t, baseURL, unauthorizedPayload, "wrong-owner-token")
	if unauthorized.status != http.StatusUnauthorized {
		t.Errorf("unauthorized /mcp report_delivery status = %d, want 401; body=%s", unauthorized.status, unauthorized.body)
	}
	assertReceiptCount(t, ctx, db, "mcp-delivery-no-auth", 0)

	missingActorResp := expectedRedMCPToolCall(t, baseURL, "report_delivery", map[string]any{"item_id": "mcp_item_01", "delivered_at": deliveredAt.Format(time.RFC3339), "idempotency_key": "mcp-delivery-missing-actor"})
	expectedRedAssertNestedMCPError(t, missingActorResp, -32602, "bad_request", "actor_id", "", "missing actor_id is schema/provenance error, not auth")
	assertReceiptCount(t, ctx, db, "mcp-delivery-missing-actor", 0)

	deliveryArgs := map[string]any{"item_id": "mcp_item_01", "actor_id": "briefing-agent", "delivered_at": deliveredAt.Format(time.RFC3339), "idempotency_key": "mcp-delivery-expected-red-001"}
	deliveryResp := expectedRedMCPToolCall(t, baseURL, "report_delivery", deliveryArgs)
	if text, ok := expectedRedToolText(t, deliveryResp, "report_delivery"); ok {
		expectedRedAssertDeliveryResult(t, text, deliveredAt, false, "report_delivery")
	}
	replayDeliveryResp := expectedRedMCPToolCall(t, baseURL, "report_delivery", deliveryArgs)
	if text, ok := expectedRedToolText(t, replayDeliveryResp, "report_delivery replay"); ok {
		expectedRedAssertDeliveryResult(t, text, deliveredAt, true, "report_delivery replay")
	}
	mismatchDeliveryResp := expectedRedMCPToolCall(t, baseURL, "report_delivery", map[string]any{"item_id": "mcp_item_01", "actor_id": "briefing-agent", "delivered_at": deliveredAt.Add(time.Minute).Format(time.RFC3339), "idempotency_key": "mcp-delivery-expected-red-001"})
	expectedRedAssertNestedMCPError(t, mismatchDeliveryResp, -32602, "bad_request", "idempotency_key", "request_fingerprint_mismatch", "report_delivery fingerprint mismatch")
	expectedRedAssertDeliveryState(t, ctx, db, deliveredAt, "briefing-agent")
}

func startExpectedRedMCPServer(t *testing.T, db *sql.DB) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen expected-red MCP server: %v", err)
	}
	server := &http.Server{Handler: NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Serve(listener)
	}()
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			t.Fatalf("shutdown expected-red MCP server: %v", err)
		}
		if err := <-errCh; err != nil && err != http.ErrServerClosed {
			t.Fatalf("serve expected-red MCP server: %v", err)
		}
	})
	return "http://" + listener.Addr().String() + "/mcp"
}

func expectedRedMCPToolCall(t *testing.T, baseURL string, name string, args map[string]any) mcpResponse {
	t.Helper()
	return mcpHTTPPost(t, baseURL, map[string]any{"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": map[string]any{"name": name, "arguments": args}})
}

func expectedRedResourceList(t *testing.T, resp mcpResponse) []map[string]any {
	t.Helper()
	data, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatalf("marshal resources/list result: %v", err)
	}
	var parsed struct {
		Resources []map[string]any `json:"resources"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal resources/list result: %v; result=%s", err, data)
	}
	return parsed.Resources
}

func expectedRedHasResource(resources []map[string]any, uri string) bool {
	for _, resource := range resources {
		if resource["uri"] == uri {
			return true
		}
	}
	return false
}

func expectedRedToolNames(t *testing.T, resp mcpResponse) map[string]struct{} {
	t.Helper()
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
	names := make(map[string]struct{}, len(parsed.Tools))
	for _, tool := range parsed.Tools {
		name, _ := tool["name"].(string)
		names[name] = struct{}{}
	}
	return names
}

func expectedRedResourceText(t *testing.T, resp mcpResponse, operation string) (string, bool) {
	t.Helper()
	if resp.Error != nil {
		t.Errorf("%s error = %+v, want successful canonical resource payload", operation, resp.Error)
		return "", false
	}
	data, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatalf("marshal %s result: %v", operation, err)
	}
	var parsed struct {
		Contents []mcpResourceContent `json:"contents"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal %s result: %v; result=%s", operation, err, data)
	}
	if len(parsed.Contents) != 1 {
		t.Errorf("%s content len = %d, want 1", operation, len(parsed.Contents))
		return "", false
	}
	return parsed.Contents[0].Text, true
}

func expectedRedToolText(t *testing.T, resp mcpResponse, operation string) (string, bool) {
	t.Helper()
	if resp.Error != nil {
		t.Errorf("%s error = %+v, want successful canonical tool payload", operation, resp.Error)
		return "", false
	}
	data, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatalf("marshal %s result: %v", operation, err)
	}
	var parsed struct {
		Content []mcpContent `json:"content"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal %s result: %v; result=%s", operation, err, data)
	}
	if len(parsed.Content) != 1 {
		t.Errorf("%s content len = %d, want 1", operation, len(parsed.Content))
		return "", false
	}
	return parsed.Content[0].Text, true
}

func expectedRedAssertLanguageResponse(t *testing.T, text string, want ProcessingLanguage, wantAlready bool, operation string) {
	t.Helper()
	var parsed ProcessingLanguageResponse
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		t.Errorf("unmarshal %s language response: %v; text=%s", operation, err, text)
		return
	}
	if parsed.Language.Code != want || parsed.Language.Label == "" || parsed.AlreadyApplied != wantAlready {
		t.Errorf("%s language response = %+v, want code=%s non-empty label already_applied=%v", operation, parsed, want, wantAlready)
	}
}

func expectedRedAssertReprocessResponse(t *testing.T, text string) {
	t.Helper()
	var parsed ReprocessLibraryResponse
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		t.Errorf("unmarshal reprocess_library response: %v; text=%s", err, text)
		return
	}
	if parsed.Reprocess.Language == "" || parsed.Reprocess.Status == "" || parsed.Reprocess.ItemsAttempted != parsed.Reprocess.ItemsUpdated+parsed.Reprocess.ItemsUnavailable+parsed.Reprocess.ItemsFailed {
		t.Errorf("reprocess_library response = %+v, want canonical language/status/count invariant", parsed)
	}
}

func expectedRedAssertSearchEcho(t *testing.T, text string, want SearchQueryEcho) {
	t.Helper()
	var parsed SearchResponse
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		t.Errorf("unmarshal search_items response: %v; text=%s", err, text)
		return
	}
	if parsed.Query.Q != want.Q || !stringPtrEqual(parsed.Query.Source, want.Source) || !stringPtrEqual(parsed.Query.From, want.From) || !stringPtrEqual(parsed.Query.To, want.To) || !boolPtrEqual(parsed.Query.Resonated, want.Resonated) || parsed.Query.Limit != want.Limit {
		t.Errorf("search_items query echo = %+v, want %+v", parsed.Query, want)
	}
	if len(parsed.Items) != 1 || parsed.Items[0].ID != "mcp_item_01" {
		t.Errorf("search_items items = %+v, want seeded mcp_item_01", parsed.Items)
	}
}

func expectedRedAssertDeliveryResult(t *testing.T, text string, wantAt time.Time, wantAlready bool, operation string) {
	t.Helper()
	var parsed DeliveryReportResult
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		t.Errorf("unmarshal %s response: %v; text=%s", operation, err, text)
		return
	}
	if parsed.ItemID != "mcp_item_01" || !parsed.ExternalSurfacedAt.Equal(wantAt) || parsed.AlreadyApplied != wantAlready {
		t.Errorf("%s delivery result = %+v, want item=mcp_item_01 surfaced=%s already_applied=%v", operation, parsed, wantAt.Format(time.RFC3339), wantAlready)
	}
}

func expectedRedAssertNestedMCPError(t *testing.T, resp mcpResponse, wantRPCCode int, wantInnerCode string, wantField string, wantReason string, operation string) {
	t.Helper()
	if resp.Error == nil {
		t.Errorf("%s returned success, want JSON-RPC error %d/%s", operation, wantRPCCode, wantInnerCode)
		return
	}
	if resp.Error.Code != wantRPCCode {
		t.Errorf("%s JSON-RPC code = %d, want %d; error=%+v", operation, resp.Error.Code, wantRPCCode, resp.Error)
	}
	inner, ok := resp.Error.Data["error"].(map[string]any)
	if !ok {
		t.Errorf("%s error.data = %#v, want nested data.error envelope", operation, resp.Error.Data)
		return
	}
	if inner["code"] != wantInnerCode {
		t.Errorf("%s data.error.code = %#v, want %q", operation, inner["code"], wantInnerCode)
	}
	details, ok := inner["details"].(map[string]any)
	if !ok {
		t.Errorf("%s data.error.details = %#v, want object", operation, inner["details"])
		return
	}
	if details["field"] != wantField {
		t.Errorf("%s details.field = %#v, want %q", operation, details["field"], wantField)
	}
	if wantReason != "" && details["reason"] != wantReason {
		t.Errorf("%s details.reason = %#v, want %q", operation, details["reason"], wantReason)
	}
}

func expectedRedAssertNestedMCPConflict(t *testing.T, resp mcpResponse, operation string) {
	t.Helper()
	if resp.Error == nil {
		t.Errorf("%s returned success, want JSON-RPC conflict", operation)
		return
	}
	if resp.Error.Code != -32000 {
		t.Errorf("%s JSON-RPC code = %d, want -32000; error=%+v", operation, resp.Error.Code, resp.Error)
	}
	inner, ok := resp.Error.Data["error"].(map[string]any)
	if !ok {
		t.Errorf("%s error.data = %#v, want nested data.error envelope", operation, resp.Error.Data)
		return
	}
	details, _ := inner["details"].(map[string]any)
	currentOperation, ok := details["current_operation"].(map[string]any)
	if inner["code"] != "conflict" || details["retry_allowed"] != true || !ok || currentOperation["running"] != true {
		t.Errorf("%s nested conflict = code:%#v details:%#v", operation, inner["code"], details)
	}
}

func expectedRedAssertNoDurableDeliveryOrReprocessTables(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	for _, forbidden := range []string{"delivery_registry", "delivery_jobs", "delivery_ledger", "reprocess_jobs", "reprocess_ledger"} {
		var count int
		if err := db.QueryRowContext(ctx, `select count(*) from sqlite_master where type = 'table' and name = ?`, forbidden).Scan(&count); err != nil {
			t.Fatalf("inspect sqlite_master for %s: %v", forbidden, err)
		}
		if count != 0 {
			t.Errorf("forbidden durable registry/job/ledger table %s exists", forbidden)
		}
	}
}

func expectedRedAssertDeliveryState(t *testing.T, ctx context.Context, db *sql.DB, wantAt time.Time, wantActor string) {
	t.Helper()
	var storedAt string
	var actorKind string
	var actorID string
	if err := db.QueryRowContext(ctx, `select external_surfaced_at, last_actor_kind, last_actor_id from item_state where item_id = 'mcp_item_01'`).Scan(&storedAt, &actorKind, &actorID); err != nil {
		t.Errorf("read delivery state: %v", err)
		return
	}
	parsedAt, err := time.Parse(time.RFC3339Nano, storedAt)
	if err != nil {
		t.Errorf("parse stored delivery time %q: %v", storedAt, err)
		return
	}
	if !parsedAt.Equal(wantAt) || actorKind != string(ActorKindAgent) || actorID != wantActor {
		t.Errorf("delivery state = at:%s actor_kind:%s actor_id:%s, want at:%s actor_kind:%s actor_id:%s", storedAt, actorKind, actorID, wantAt.Format(time.RFC3339), ActorKindAgent, wantActor)
	}
}

func stringPtrEqual(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func boolPtrEqual(left *bool, right *bool) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}
