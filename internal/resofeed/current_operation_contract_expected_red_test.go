package resofeed

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const currentOperationHTTPPath = "/api/runtime/operation"

// Expected-red contract for cos-backend-operation-snapshot.
//
// Exposed gaps are intentional in this step: the implementation owner must add
// an in-memory CurrentOperationInfo snapshot endpoint and enrich guarded
// operation conflicts without adding durable worker records, delayed backlogs,
// past-run logs, schema, or service/repository layers.
func TestCOSBackendCurrentOperationIdleContract(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})

	t.Run("idle exact documented shape", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, currentOperationHTTPPath, nil))

		assertStatus(t, recorder, http.StatusOK)
		assertJSONEqual(t, recorder.Body.Bytes(), []byte(`{
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
	})

	for _, target := range []string{currentOperationHTTPPath + "?trace=1", currentOperationHTTPPath + "?trace=1&trace=2"} {
		target := target
		t.Run("rejects query parameters "+target, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, target, nil))

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), "trace")
		})
	}
}

func TestCOSBackendOperationEndpointsRequireOwnerTokenContract(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name   string
		method string
		path   string
		body   []byte
	}{
		{name: "current operation read", method: http.MethodGet, path: currentOperationHTTPPath},
		{name: "manual ingest trigger", method: http.MethodPost, path: ManualIngestHTTPPath, body: []byte(ManualFetchRequestBody)},
		{name: "library reprocess trigger", method: http.MethodPost, path: RuntimeReprocessLibraryHTTPPath, body: []byte(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"reprocess-auth-contract"}`)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(tc.method, tc.path, bytes.NewReader(tc.body))
			if len(tc.body) > 0 {
				req.Header.Set("Content-Type", "application/json")
			}

			router.ServeHTTP(recorder, req)

			assertStatus(t, recorder, http.StatusUnauthorized)
		})
	}
}

func TestCOSBackendCurrentOperationRunningSnapshotContract(t *testing.T) {
	ctx := context.Background()
	release, err := tryAcquireIngestGuard(ctx, "fetch", "source")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	t.Cleanup(release)
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, currentOperationHTTPPath, nil))

	assertStatus(t, recorder, http.StatusOK)
	operation := decodeCurrentOperationEnvelope(t, recorder.Body.Bytes())
	assertCurrentOperationShape(t, operation)
	if operation["running"] != true || operation["kind"] != "source_fetch" || operation["actor_kind"] != "human" {
		t.Fatalf("operation snapshot = %#v, want running source_fetch with actor_kind human from in-memory guard", operation)
	}
	if phase, ok := operation["phase"].(string); !ok || phase == "" {
		t.Fatalf("operation.phase = %#v, want non-empty documented running phase", operation["phase"])
	}
	if message, ok := operation["message"].(string); !ok || message == "" {
		t.Fatalf("operation.message = %#v, want terse non-empty running message", operation["message"])
	}
	assertRFC3339Field(t, operation, "started_at")
	assertRFC3339Field(t, operation, "updated_at")
}

func TestCOSBackendGuardConflictIncludesCurrentOperationContract(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	release, err := tryAcquireIngestGuard(ctx, "reprocess", "library")
	if err != nil {
		t.Fatalf("hold operation guard: %v", err)
	}
	t.Cleanup(release)

	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPost, ManualIngestHTTPPath, bytes.NewReader([]byte(ManualFetchRequestBody)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)

	assertStatus(t, recorder, http.StatusConflict)
	var parsed ErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal conflict body: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Error.Code != "conflict" || parsed.Error.Message != "operation already running" {
		t.Fatalf("error = %+v, want operation guard conflict", parsed.Error)
	}
	assertConflictDetailsWithCurrentOperation(t, parsed.Error.Details, "library_reprocess", "human")
}

func decodeCurrentOperationEnvelope(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal current operation body: %v; body=%s", err, string(body))
	}
	operation, ok := parsed["operation"].(map[string]any)
	if !ok || len(parsed) != 1 {
		t.Fatalf("current operation envelope = %#v, want only operation object", parsed)
	}
	return operation
}

func assertCurrentOperationShape(t *testing.T, operation map[string]any) {
	t.Helper()
	wantFields := []string{"running", "kind", "actor_kind", "phase", "count", "message", "started_at", "updated_at"}
	if len(operation) != len(wantFields) {
		t.Fatalf("operation fields = %#v, want exactly %v", operation, wantFields)
	}
	for _, field := range wantFields {
		if _, ok := operation[field]; !ok {
			t.Fatalf("operation missing field %q: %#v", field, operation)
		}
	}
}

func assertConflictDetailsWithCurrentOperation(t *testing.T, details map[string]any, kind string, actorKind string) {
	t.Helper()
	if len(details) != 6 {
		t.Fatalf("conflict details = %#v, want operation_running, operation, actor_kind, retry_allowed, reason, and current_operation", details)
	}
	if details["reason"] != ConflictReasonGlobalOperationRunning {
		t.Fatalf("conflict reason = %#v, want %s", details["reason"], ConflictReasonGlobalOperationRunning)
	}
	if details["operation_running"] != true || details["operation"] != kind || details["actor_kind"] != actorKind || details["retry_allowed"] != true {
		t.Fatalf("conflict details = %#v, want canonical operation=%s actor_kind=%s retry_allowed true", details, kind, actorKind)
	}
	operation, ok := details["current_operation"].(map[string]any)
	if !ok {
		t.Fatalf("current_operation = %#v, want object derived from same in-memory snapshot", details["current_operation"])
	}
	assertCurrentOperationShape(t, operation)
	if operation["running"] != true || operation["kind"] != kind || operation["actor_kind"] != actorKind {
		t.Fatalf("current_operation = %#v, want canonical kind=%s actor_kind=%s", operation, kind, actorKind)
	}
	assertRFC3339Field(t, operation, "started_at")
	assertRFC3339Field(t, operation, "updated_at")
}

func assertRFC3339Field(t *testing.T, values map[string]any, field string) {
	t.Helper()
	value, ok := values[field].(string)
	if !ok || value == "" {
		t.Fatalf("%s = %#v, want RFC3339 string", field, values[field])
	}
	if _, err := time.Parse(time.RFC3339, value); err != nil {
		t.Fatalf("%s = %q, want RFC3339: %v", field, value, err)
	}
}
