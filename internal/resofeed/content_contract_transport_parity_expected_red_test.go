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

// expected_result: red
// These tests define the v2.2 content-contract transport matrix before the
// production transport/schema implementation exists. They intentionally assert
// raw JSON keys so the tests fail as contract gaps instead of forcing product
// types or migrations into this test-only step.

func TestCCRTransportResponsesExposeContentContractFieldsExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedCCRTransportFixture(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	mcpHandler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name     string
		payload  map[string]any
		selector func(t *testing.T, body map[string]any) map[string]any
	}{
		{
			name:    "http feed list item",
			payload: httpJSONMap(t, router, http.MethodGet, "/api/feed/today?limit=1", ""),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				return firstEnvelopeItem(t, body, "items")
			},
		},
		{
			name:    "http search result item",
			payload: httpJSONMap(t, router, http.MethodGet, "/api/search?q=contractunique&limit=5", ""),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				return firstEnvelopeItem(t, body, "items")
			},
		},
		{
			name:    "http item detail",
			payload: httpJSONMap(t, router, http.MethodGet, "/api/items/ccr_item_01", ""),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				item, _ := body["item"].(map[string]any)
				if item == nil {
					t.Fatalf("HTTP detail missing item object: %#v", body)
				}
				return item
			},
		},
		{
			name:    "mcp feed resource item",
			payload: decodeJSONTextMap(t, mcpResourceText(t, mcpHandler, "resofeed://feed/today")),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				return firstEnvelopeItem(t, body, "items")
			},
		},
		{
			name:    "mcp candidate tool item",
			payload: decodeJSONTextMap(t, mcpToolText(t, mcpCall(t, mcpHandler, "list_candidate_items", map[string]any{"limit": 5}), "list_candidate_items")),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				return firstEnvelopeItem(t, body, "items")
			},
		},
		{
			name:    "mcp search tool item",
			payload: decodeJSONTextMap(t, mcpToolText(t, mcpCall(t, mcpHandler, "search_items", map[string]any{"query": "contractunique", "limit": 5}), "search_items")),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				return firstEnvelopeItem(t, body, "items")
			},
		},
		{
			name:    "mcp read item detail",
			payload: decodeJSONTextMap(t, mcpToolText(t, mcpCall(t, mcpHandler, "read_item", map[string]any{"item_id": "ccr_item_01"}), "read_item")),
			selector: func(t *testing.T, body map[string]any) map[string]any {
				item, _ := body["item"].(map[string]any)
				if item == nil {
					t.Fatalf("MCP detail missing item object: %#v", body)
				}
				return item
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item := tc.selector(t, tc.payload)
			assertCCRItemTransportFields(t, item)
		})
	}
}

func TestCCROwnerTokenGatesTouchedHTTPAndMCPOperationsExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedCCRTransportFixture(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: ccrFailingReingestLLM{}})

	for _, tc := range []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "feed", method: http.MethodGet, path: "/api/feed/today?limit=1"},
		{name: "search", method: http.MethodGet, path: "/api/search?q=contractunique&limit=5"},
		{name: "detail", method: http.MethodGet, path: "/api/items/ccr_item_01"},
		{name: "reingest", method: http.MethodPost, path: "/api/items/ccr_item_01/reingest", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"ccr-auth-http"}`},
	} {
		t.Run("http "+tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
			assertStatus(t, recorder, http.StatusUnauthorized)
		})
	}

	mcpPayloads := []map[string]any{
		{"jsonrpc": "2.0", "id": 1, "method": "resources/read", "params": map[string]any{"uri": "resofeed://feed/today"}},
		{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": map[string]any{"name": "list_candidate_items", "arguments": map[string]any{"limit": 5}}},
		{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": map[string]any{"name": "search_items", "arguments": map[string]any{"query": "contractunique", "limit": 5}}},
		{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": map[string]any{"name": "read_item", "arguments": map[string]any{"item_id": "ccr_item_01"}}},
		{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": map[string]any{"name": "reingest_item", "arguments": map[string]any{"item_id": "ccr_item_01", "actor_id": "briefing-agent", "idempotency_key": "ccr-auth-mcp"}}},
	}
	mcpHandler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: ccrFailingReingestLLM{}})
	for _, payload := range mcpPayloads {
		recorder := httptest.NewRecorder()
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal MCP auth payload: %v", err)
		}
		mcpHandler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewReader(body)))
		assertStatus(t, recorder, http.StatusUnauthorized)
	}

	static := httptest.NewRecorder()
	router.ServeHTTP(static, httptest.NewRequest(http.MethodGet, "/", nil))
	assertStatus(t, static, http.StatusOK)
}

func TestCCRReingestFailureIsNonDestructiveAcrossHTTPAndMCPExpectedRed(t *testing.T) {
	for _, tc := range []struct {
		name      string
		exercise  func(t *testing.T, db *sql.DB) map[string]any
		assertKey string
	}{
		{
			name: "http",
			exercise: func(t *testing.T, db *sql.DB) map[string]any {
				router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: ccrFailingReingestLLM{}})
				return httpJSONMap(t, router, http.MethodPost, "/api/items/ccr_item_01/reingest", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"ccr-failure-http"}`)
			},
		},
		{
			name: "mcp",
			exercise: func(t *testing.T, db *sql.DB) map[string]any {
				handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: ccrFailingReingestLLM{}})
				return decodeJSONTextMap(t, mcpToolText(t, mcpCall(t, handler, "reingest_item", map[string]any{"item_id": "ccr_item_01", "actor_id": "briefing-agent", "idempotency_key": "ccr-failure-mcp"}), "reingest_item"))
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			db := newContractDB(t, ctx)
			seedCCRTransportFixture(t, ctx, db)
			body := tc.exercise(t, db)
			reingest, _ := body["reingest"].(map[string]any)
			if reingest == nil {
				t.Fatalf("reingest response missing object: %#v", body)
			}
			if got := reingest["status"]; got != string(ReprocessStatusCompletedWithErrors) {
				t.Fatalf("reingest status=%v, want completed_with_errors", got)
			}
			item, _ := reingest["item"].(map[string]any)
			if item == nil {
				t.Fatalf("%s reingest failure did not return refreshed preserved item detail: %#v", tc.name, reingest)
			}
			if item["summary"] != "保留的中文摘要 contractunique" || item["core_insight"] != "保留的一句话洞察。" || item["title"] != "Prior localized title" {
				t.Fatalf("%s reingest failure degraded current readable content: %#v", tc.name, item)
			}
			for _, field := range []string{"source_item_title", "localized_title", "key_points", "content_status", "last_reprocess_status", "last_reprocess_error_code", "last_reprocess_error_message", "last_reprocess_at"} {
				if _, ok := item[field]; !ok {
					t.Fatalf("%s reingest preserved item missing %q; item=%#v", tc.name, field, item)
				}
			}
		})
	}
}

func TestCCRMCPExposesNoAgentOnlyContentConceptExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedCCRTransportFixture(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	mcpHandler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	httpDetail := httpJSONMap(t, router, http.MethodGet, "/api/items/ccr_item_01", "")
	mcpDetail := decodeJSONTextMap(t, mcpToolText(t, mcpCall(t, mcpHandler, "read_item", map[string]any{"item_id": "ccr_item_01"}), "read_item"))
	humanItem, _ := httpDetail["item"].(map[string]any)
	agentItem, _ := mcpDetail["item"].(map[string]any)
	if humanItem == nil || agentItem == nil {
		t.Fatalf("detail item shapes missing human=%#v agent=%#v", httpDetail, mcpDetail)
	}
	for _, field := range []string{"source_item_title", "localized_title", "key_points", "content_status", "last_reprocess_status", "last_reprocess_error_code", "last_reprocess_error_message", "last_reprocess_at"} {
		if _, ok := humanItem[field]; !ok {
			t.Fatalf("HTTP owner detail missing content field %q while MCP parity cannot be proven; human=%#v", field, humanItem)
		}
		if _, ok := agentItem[field]; !ok {
			t.Fatalf("MCP read_item missing owner-visible content field %q; agent=%#v", field, agentItem)
		}
	}
	for key := range agentItem {
		if _, ok := humanItem[key]; !ok {
			t.Fatalf("MCP read_item exposed agent-only field %q absent from HTTP owner detail; mcp=%#v http=%#v", key, agentItem, humanItem)
		}
	}
}

func assertCCRItemTransportFields(t *testing.T, item map[string]any) {
	t.Helper()
	for _, field := range []string{"source_item_title", "localized_title", "key_points", "content_status", "last_reprocess_status", "last_reprocess_error_code", "last_reprocess_error_message", "last_reprocess_at"} {
		if _, ok := item[field]; !ok {
			t.Fatalf("transport item missing %q from v2.2 content contract: %#v", field, item)
		}
	}
	if item["source_item_title"] == item["localized_title"] {
		t.Fatalf("source_item_title and localized_title collapsed into same value: %#v", item)
	}
	points, ok := item["key_points"].([]any)
	if !ok || len(points) < 3 || len(points) > 5 {
		t.Fatalf("key_points=%#v, want structured array with 3-5 items", item["key_points"])
	}
}

func seedCCRTransportFixture(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Date(2026, 5, 25, 9, 0, 0, 0, time.UTC)
	seedSource(t, ctx, db, "ccr_src", "https://ccr.example/feed.xml", "CCR Source Ledger")
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, feed_excerpt, extracted_text, value_tier, published_at, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'full', 'ok')`, "ccr_item_01", "ccr_src", "https://ccr.example/feed.xml", "https://ccr.example/article", "https://ccr.example/article", "Prior localized title", "保留的中文摘要 contractunique", "保留的一句话洞察。", "源摘录 contractunique", "保留的详情文本 contractunique", "high", now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert CCR transport fixture: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild CCR search index: %v", err)
	}
}

func httpJSONMap(t *testing.T, router http.Handler, method string, path string, body string) map[string]any {
	t.Helper()
	reader := bytes.NewReader([]byte(body))
	recorder := httptest.NewRecorder()
	req := authorizedRequest(method, path, reader)
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	router.ServeHTTP(recorder, req)
	assertStatus(t, recorder, http.StatusOK)
	return decodeJSONMap(t, recorder.Body.Bytes())
}

func decodeJSONTextMap(t *testing.T, text string) map[string]any {
	t.Helper()
	return decodeJSONMap(t, []byte(text))
}

func decodeJSONMap(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(data, &body); err != nil {
		t.Fatalf("decode JSON object: %v; body=%s", err, data)
	}
	return body
}

func firstEnvelopeItem(t *testing.T, body map[string]any, field string) map[string]any {
	t.Helper()
	items, _ := body[field].([]any)
	if len(items) == 0 {
		t.Fatalf("%s missing/non-empty array in body: %#v", field, body)
	}
	item, _ := items[0].(map[string]any)
	if item == nil {
		t.Fatalf("first %s entry is not an object: %#v", field, items[0])
	}
	return item
}

type ccrFailingReingestLLM struct{}

func (ccrFailingReingestLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{ModelStatus: modelStatusProviderError}, errors.New("provider unavailable")
}

func (ccrFailingReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}
