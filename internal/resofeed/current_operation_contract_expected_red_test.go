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
// operation conflicts without adding durable jobs, queues, histories, schema, or
// service/repository layers.
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
				"scope": null,
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
	if operation["running"] != true || operation["kind"] != "fetch" || operation["scope"] != "source" {
		t.Fatalf("operation snapshot = %#v, want running fetch/source from in-memory guard", operation)
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
	assertConflictDetailsWithCurrentOperation(t, parsed.Error.Details, "reprocess", "library")
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
	wantFields := []string{"running", "kind", "scope", "phase", "count", "message", "started_at", "updated_at"}
	if len(operation) != len(wantFields) {
		t.Fatalf("operation fields = %#v, want exactly %v", operation, wantFields)
	}
	for _, field := range wantFields {
		if _, ok := operation[field]; !ok {
			t.Fatalf("operation missing field %q: %#v", field, operation)
		}
	}
}

func assertConflictDetailsWithCurrentOperation(t *testing.T, details map[string]any, kind string, scope string) {
	t.Helper()
	if len(details) != 5 {
		t.Fatalf("conflict details = %#v, want legacy fields plus current_operation only", details)
	}
	if details["operation_running"] != true || details["operation"] != kind || details["scope"] != scope || details["retry_allowed"] != true {
		t.Fatalf("conflict legacy details = %#v, want operation=%s scope=%s", details, kind, scope)
	}
	operation, ok := details["current_operation"].(map[string]any)
	if !ok {
		t.Fatalf("current_operation = %#v, want object derived from same in-memory snapshot", details["current_operation"])
	}
	assertCurrentOperationShape(t, operation)
	if operation["running"] != true || operation["kind"] != kind || operation["scope"] != scope {
		t.Fatalf("current_operation = %#v, want same kind/scope as legacy conflict fields", operation)
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
