package resofeed

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPLHMHTTPGuardConflictsUseExactArchitectureShape(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSTCSource(t, ctx, db, "src_plhm_ingest_skip", "https://plhm.example/feed.xml", "PLHM Skip Probe", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	release, err := tryAcquireIngestGuard(ctx, "fetch", "source")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	t.Cleanup(release)

	conflictCases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "manual fetch", method: http.MethodPost, path: "/api/sources/src_missing/fetch", body: ManualFetchRequestBody},
		{name: "runtime reprocess", method: http.MethodPost, path: RuntimeReprocessLibraryHTTPPath, body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"plhm-reprocess-conflict"}`},
	}
	for _, tc := range conflictCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := authorizedRequest(tc.method, tc.path, bytes.NewReader([]byte(tc.body)))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, req)
			assertStatus(t, recorder, http.StatusConflict)

			var parsed ErrorBody
			if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
				t.Fatalf("unmarshal conflict body: %v; body=%s", err, recorder.Body.String())
			}
			if parsed.Error.Code != "conflict" || parsed.Error.Message != "operation already running" {
				t.Fatalf("error = %+v, want exact conflict message", parsed.Error)
			}
			assertGuardDetails(t, parsed.Error.Details, "source_fetch", "human")
		})
	}

	t.Run("manual ingest skips source-scoped blocker inside result", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		req := authorizedRequest(http.MethodPost, ManualIngestHTTPPath, bytes.NewReader([]byte(ManualFetchRequestBody)))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, req)
		assertStatus(t, recorder, http.StatusOK)
		icaAssertIngestCounter(t, recorder.Body.Bytes(), "sources_attempted", 0)
		icaAssertIngestCounter(t, recorder.Body.Bytes(), "sources_skipped", 1)
		icaAssertIngestError(t, recorder.Body.Bytes(), "src_plhm_ingest_skip", IngestErrorCodeSourceBusy)
	})

	t.Run("runtime language", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		req := authorizedRequest(http.MethodPut, RuntimeLanguageHTTPPath, bytes.NewReader([]byte(`{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"plhm-language-blocked"}`)))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, req)
		assertStatus(t, recorder, http.StatusConflict)

		var parsed ErrorBody
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal language conflict body: %v; body=%s", err, recorder.Body.String())
		}
		if parsed.Error.Code != "conflict" || parsed.Error.Details["reason"] != ConflictReasonGlobalOperationRunning {
			t.Fatalf("language conflict = %+v, want global operation conflict", parsed.Error)
		}
		assertGuardDetails(t, parsed.Error.Details, "source_fetch", "human")
	})
}

func TestPLHMMCPGuardConflictUsesActualHolderAndNestedOnlyData(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	release, err := tryAcquireIngestGuard(ctx, "ingest", "all")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	t.Cleanup(release)

	resp := mcpCall(t, handler, "reprocess_library", map[string]any{"actor_id": "agent", "idempotency_key": "plhm-mcp-conflict"})
	if resp.Error == nil {
		t.Fatalf("MCP response error nil, response=%+v", resp)
	}
	if resp.Error.Code != -32000 || resp.Error.Message != "operation already running" {
		t.Fatalf("MCP error = %+v, want conflict", resp.Error)
	}
	assertNestedOnlyMCPErrorData(t, resp.Error.Data, "conflict", "operation already running", "manual_ingest", "human")
}

func TestPLHMMCPRuntimeFieldErrorsUseNestedOnlyData(t *testing.T) {
	db := newContractDB(t, context.Background())
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	resp := mcpCall(t, handler, "set_processing_language", map[string]any{"actor_id": "agent", "idempotency_key": "plhm-mcp-field"})
	if resp.Error == nil {
		t.Fatalf("MCP response error nil, response=%+v", resp)
	}
	if resp.Error.Code != -32602 || resp.Error.Message != "invalid request" {
		t.Fatalf("MCP error = %+v, want invalid request", resp.Error)
	}
	if len(resp.Error.Data) != 1 {
		t.Fatalf("MCP error data = %#v, want only nested error object", resp.Error.Data)
	}
	inner, ok := resp.Error.Data["error"].(map[string]any)
	if !ok {
		t.Fatalf("MCP error data = %#v, want nested error object", resp.Error.Data)
	}
	if inner["code"] != "bad_request" || inner["message"] != "bad request" {
		t.Fatalf("nested error = %#v, want bad_request", inner)
	}
	details, ok := inner["details"].(map[string]any)
	if !ok || len(details) != 1 || details["field"] != "language" {
		t.Fatalf("nested details = %#v, want language field only", inner["details"])
	}
}

func assertGuardDetails(t *testing.T, details map[string]any, operation string, actorKind string) {
	t.Helper()
	if len(details) != 6 {
		t.Fatalf("guard details = %#v, want canonical fields, reason, and current_operation", details)
	}
	if details["reason"] == nil || details["reason"] == "" {
		t.Fatalf("guard details = %#v, want non-empty reason", details)
	}
	if details["operation_running"] != true || details["operation"] != operation || details["actor_kind"] != actorKind || details["retry_allowed"] != true {
		t.Fatalf("guard details = %#v, want operation=%s actor_kind=%s", details, operation, actorKind)
	}
}

func assertNestedOnlyMCPErrorData(t *testing.T, data map[string]any, code string, message string, operation string, actorKind string) {
	t.Helper()
	if len(data) != 1 {
		t.Fatalf("MCP error data = %#v, want only nested error object", data)
	}
	inner, ok := data["error"].(map[string]any)
	if !ok {
		t.Fatalf("MCP error data = %#v, want nested error object", data)
	}
	if inner["code"] != code || inner["message"] != message {
		t.Fatalf("nested error = %#v, want code=%s message=%s", inner, code, message)
	}
	details, ok := inner["details"].(map[string]any)
	if !ok {
		t.Fatalf("nested details = %#v, want object", inner["details"])
	}
	assertGuardDetails(t, details, operation, actorKind)
}
