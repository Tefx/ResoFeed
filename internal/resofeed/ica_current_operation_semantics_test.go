package resofeed

import (
	"context"
	"testing"
)

func TestICACurrentOperationRepresentedCoordinatorKinds(t *testing.T) {
	cases := []struct {
		name      string
		operation string
		scope     any
		actorKind string
		wantKind  string
	}{
		{name: "background ingest", operation: "ingest", scope: "background", actorKind: "background", wantKind: "background_ingest"},
		{name: "manual ingest", operation: "ingest", scope: "all", actorKind: string(ActorKindHuman), wantKind: "manual_ingest"},
		{name: "source fetch", operation: "fetch", scope: "src_current", actorKind: string(ActorKindHuman), wantKind: "source_fetch"},
		{name: "library reprocess", operation: "reprocess", scope: "library", actorKind: string(ActorKindAgent), wantKind: "library_reprocess"},
		{name: "item reingest", operation: "item_reingest", scope: "item_current", actorKind: string(ActorKindHuman), wantKind: "item_reingest"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resetIngestCoordinatorForTest(t)
			release, err := tryAcquireIngestGuardWithActor(context.Background(), tc.operation, tc.scope, tc.actorKind)
			if err != nil {
				t.Fatalf("acquire %s guard: %v", tc.name, err)
			}
			defer release()

			operation := currentOperationInfo()
			if !operation.Running || operation.Kind == nil || *operation.Kind != tc.wantKind {
				t.Fatalf("current operation = %+v, want running kind %s", operation, tc.wantKind)
			}
			if operation.StartedAt == nil || operation.UpdatedAt == nil {
				t.Fatalf("current operation timestamps = started:%v updated:%v, want populated", operation.StartedAt, operation.UpdatedAt)
			}
		})
	}
}

func TestICACurrentOperationUnrepresentedGlobalGuardStaysNull(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	release, err := tryAcquireIngestGuardWithActor(context.Background(), "state_import", "restore", "")
	if err != nil {
		t.Fatalf("acquire unrepresented state import guard: %v", err)
	}
	defer release()

	operation := currentOperationInfo()
	if operation.Running || operation.Kind != nil {
		t.Fatalf("current operation = %+v, want idle/null for unrepresented global guard", operation)
	}

	_, err = tryAcquireIngestGuardWithActor(context.Background(), "language_write", "runtime_language", string(ActorKindHuman))
	if err == nil {
		t.Fatal("language write acquired while state import guard active; want global conflict")
	}
	details, ok := guardConflictDetails(err)
	if !ok {
		t.Fatalf("conflict details missing for %v", err)
	}
	serialized := guardConflictDetailMap(details)
	if serialized["reason"] != ConflictReasonGlobalOperationRunning {
		t.Fatalf("conflict reason = %#v, want %s", serialized["reason"], ConflictReasonGlobalOperationRunning)
	}
	for _, field := range []string{"operation", "actor_kind", "current_operation"} {
		if serialized[field] != nil {
			t.Fatalf("serialized[%s] = %#v, want nil for unrepresented blocker; details=%#v", field, serialized[field], serialized)
		}
	}
}
