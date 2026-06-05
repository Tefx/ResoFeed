package resofeed

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestICARuntimeLanguageReprocessAndReingestConflictsReportActiveSourceReasons(t *testing.T) {
	blockers := []struct {
		name      string
		kind      string
		actorKind string
	}{
		{name: "manual source fetch", kind: "source_fetch", actorKind: string(ActorKindHuman)},
		{name: "manual ingest source attempt", kind: "manual_ingest", actorKind: string(ActorKindHuman)},
		{name: "background ingest source attempt", kind: "background_ingest", actorKind: "background"},
	}
	operations := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{
			name:   "runtime language write",
			method: http.MethodPut,
			path:   RuntimeLanguageHTTPPath,
			body:   `{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"ica-conflict-language"}`,
		},
		{
			name:   "library reprocess",
			method: http.MethodPost,
			path:   RuntimeReprocessLibraryHTTPPath,
			body:   `{"actor_kind":"human","actor_id":"owner","idempotency_key":"ica-conflict-reprocess"}`,
		},
		{
			name:   "item reingest",
			method: http.MethodPost,
			path:   ItemReingestHTTPPathPrefix + "ica_conflict_item" + ItemReingestHTTPPathSuffix,
			body:   `{"actor_kind":"human","actor_id":"owner","idempotency_key":"ica-conflict-reingest"}`,
		},
	}

	for _, blocker := range blockers {
		for _, operation := range operations {
			blocker := blocker
			operation := operation
			t.Run(blocker.name+" blocks "+operation.name, func(t *testing.T) {
				resetIngestCoordinatorForTest(t)
				ctx := context.Background()
				db := newContractDB(t, ctx)
				router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
				release := holdICARuntimeConflictSourceWork(t, ctx, blocker.kind, blocker.actorKind)
				t.Cleanup(release)

				recorder := httptest.NewRecorder()
				req := authorizedRequest(operation.method, operation.path, bytes.NewReader([]byte(operation.body)))
				req.Header.Set("Content-Type", "application/json")
				router.ServeHTTP(recorder, req)

				assertStatus(t, recorder, http.StatusConflict)
				assertICAGlobalOperationConflictDetails(t, recorder.Body.Bytes(), blocker.kind, blocker.actorKind)
			})
		}
	}
}

func holdICARuntimeConflictSourceWork(t *testing.T, ctx context.Context, representedKind string, actorKind string) func() {
	t.Helper()
	release, err := tryAcquireIngestGuardWithActor(ctx, "fetch", "src_ica_runtime_conflict_blocker", actorKind)
	if err != nil {
		t.Fatalf("hold active source work: %v", err)
	}
	switch representedKind {
	case "source_fetch":
		// The source lease acquisition already published the source_fetch snapshot.
	case "manual_ingest":
		ingestGuardState.current.start("ingest", "all", actorKind)
	case "background_ingest":
		ingestGuardState.current.start("ingest", "background", actorKind)
	default:
		release()
		t.Fatalf("unknown represented kind %q", representedKind)
	}
	return release
}

func assertICAGlobalOperationConflictDetails(t *testing.T, body []byte, wantOperation string, wantActorKind string) {
	t.Helper()
	var parsed ErrorBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal conflict body: %v; body=%s", err, string(body))
	}
	if parsed.Error.Code != ManualFetchErrorCodeConflict {
		t.Fatalf("error code = %q, want %q; body=%s", parsed.Error.Code, ManualFetchErrorCodeConflict, string(body))
	}
	details := parsed.Error.Details
	if details["reason"] != ConflictReasonGlobalOperationRunning {
		t.Fatalf("conflict reason = %#v, want %s; details=%#v", details["reason"], ConflictReasonGlobalOperationRunning, details)
	}
	if details["operation_running"] != true || details["retry_allowed"] != true {
		t.Fatalf("conflict details = %#v, want operation_running/retry_allowed true", details)
	}
	if details["operation"] != wantOperation || details["actor_kind"] != wantActorKind {
		t.Fatalf("conflict details = %#v, want operation=%s actor_kind=%s", details, wantOperation, wantActorKind)
	}
	current, ok := details["current_operation"].(map[string]any)
	if !ok {
		t.Fatalf("current_operation = %#v, want object", details["current_operation"])
	}
	if current["running"] != true || current["kind"] != wantOperation || current["actor_kind"] != wantActorKind {
		t.Fatalf("current_operation = %#v, want running %s actor_kind %s", current, wantOperation, wantActorKind)
	}
}
