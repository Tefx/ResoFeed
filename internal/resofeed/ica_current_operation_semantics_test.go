package resofeed

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
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

func TestICACurrentOperationBackgroundSnapshotOwnership(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	feedEntered := make(chan struct{})
	allowFeed := make(chan struct{})
	previousHTTPClient := outboundHTTPClient
	outboundHTTPClient = &http.Client{Transport: &blockingSnapshotFeedTransport{entered: feedEntered, release: allowFeed}}
	t.Cleanup(func() { outboundHTTPClient = previousHTTPClient })
	insertSource(t, ctx, db, "src_snapshot_ownership", "https://snapshot.example.test/feed.xml", "Snapshot Ownership")

	releaseHuman, err := tryAcquireIngestGuardWithActor(ctx, "fetch", "src_snapshot_ownership", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire human source-fetch guard: %v", err)
	}
	updateCurrentOperation("fetching_source", &CurrentOperationCount{Current: 0, Total: 1}, "human source fetch remains visible")

	if err := IngestOnce(ctx, db, IngestConfig{SourceFetchTimeout: time.Second}); err != nil {
		t.Fatalf("conflicting background ingest: %v", err)
	}
	assertCurrentOperationSnapshot(t, "source_fetch", string(ActorKindHuman), "fetching_source", "human source fetch remains visible")

	releaseHuman()
	if operation := currentOperationInfo(); operation.Running {
		t.Fatalf("current operation after human guard release = %+v, want idle", operation)
	}

	backgroundDone := make(chan error, 1)
	go func() {
		backgroundDone <- IngestOnce(ctx, db, IngestConfig{SourceFetchTimeout: time.Second})
	}()
	select {
	case <-feedEntered:
	case err := <-backgroundDone:
		t.Fatalf("background ingest completed before entering feed: %v", err)
	case <-ctx.Done():
		t.Fatalf("wait for acquired background source fetch: %v", ctx.Err())
	}
	assertCurrentOperationSnapshot(t, "background_ingest", "background", "fetching_feed", "fetching RSS source")

	close(allowFeed)
	select {
	case err := <-backgroundDone:
		if err != nil {
			t.Fatalf("acquired background ingest: %v", err)
		}
	case <-ctx.Done():
		t.Fatalf("wait for background ingest completion: %v", ctx.Err())
	}
	if operation := currentOperationInfo(); operation.Running || operation.Kind != nil {
		t.Fatalf("current operation after background guard release = %+v, want idle", operation)
	}
}

func TestICACurrentOperationForegroundPriorityOverBackgroundSourceLifecycle(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx := context.Background()
	cfg := ingestCoordinatorConfig{SourceConcurrency: 2}

	releaseHuman, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_foreground_a", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire foreground source A: %v", err)
	}
	updateCurrentOperation("fetching_source", &CurrentOperationCount{Current: 0, Total: 1}, "human source A fetching")
	assertCurrentOperationSnapshotWithCount(t, "source_fetch", string(ActorKindHuman), "fetching_source", 0, 1, "human source A fetching")

	backgroundAcquired := make(chan error, 1)
	backgroundAdvanced := make(chan struct{})
	advanceAgain := make(chan struct{})
	backgroundAdvancedAgain := make(chan struct{})
	releaseBackground := make(chan struct{})
	backgroundDone := make(chan struct{})
	go func() {
		release, acquireErr := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_background_b", "background")
		backgroundAcquired <- acquireErr
		if acquireErr != nil {
			close(backgroundDone)
			return
		}
		ingestGuardState.current.start("ingest", "background", "background")
		updateCurrentOperationForActor("background", "fetching_sources", &CurrentOperationCount{Current: 0, Total: 1}, "background source B aggregate")
		close(backgroundAdvanced)
		<-advanceAgain
		updateCurrentOperationForActor("background", "finalizing_source", &CurrentOperationCount{Current: 1, Total: 1}, "background source B finalizing")
		close(backgroundAdvancedAgain)
		<-releaseBackground
		release()
		close(backgroundDone)
	}()

	if err := <-backgroundAcquired; err != nil {
		t.Fatalf("acquire background source B: %v", err)
	}
	assertCurrentOperationSnapshotWithCount(t, "source_fetch", string(ActorKindHuman), "fetching_source", 0, 1, "human source A fetching")
	<-backgroundAdvanced
	assertCurrentOperationSnapshotWithCount(t, "source_fetch", string(ActorKindHuman), "fetching_source", 0, 1, "human source A fetching")

	releaseHuman()
	assertCurrentOperationSnapshotWithCount(t, "background_ingest", "background", "fetching_sources", 0, 1, "background source B aggregate")

	close(advanceAgain)
	<-backgroundAdvancedAgain
	assertCurrentOperationSnapshotWithCount(t, "background_ingest", "background", "finalizing_source", 1, 1, "background source B finalizing")

	close(releaseBackground)
	<-backgroundDone
	if operation := currentOperationInfo(); operation.Running || operation.Kind != nil {
		t.Fatalf("current operation after final background release = %+v, want idle", operation)
	}
}

func assertCurrentOperationSnapshotWithCount(t *testing.T, kind string, actorKind string, phase string, current int, total int, message string) {
	t.Helper()
	assertCurrentOperationSnapshot(t, kind, actorKind, phase, message)
	operation := currentOperationInfo()
	if operation.Count == nil || operation.Count.Current != current || operation.Count.Total != total {
		t.Fatalf("current operation count = %+v, want %d/%d", operation.Count, current, total)
	}
}

func assertCurrentOperationSnapshot(t *testing.T, kind string, actorKind string, phase string, message string) {
	t.Helper()
	operation := currentOperationInfo()
	if !operation.Running || operation.Kind == nil || *operation.Kind != kind ||
		operation.ActorKind == nil || *operation.ActorKind != actorKind ||
		operation.Phase == nil || *operation.Phase != phase ||
		operation.Message == nil || *operation.Message != message {
		t.Fatalf("current operation = %+v, want kind=%s actor=%s phase=%s message=%q", operation, kind, actorKind, phase, message)
	}
}

type blockingSnapshotFeedTransport struct {
	entered   chan<- struct{}
	release   <-chan struct{}
	enterOnce sync.Once
}

func (t *blockingSnapshotFeedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.enterOnce.Do(func() { close(t.entered) })
	select {
	case <-t.release:
	case <-req.Context().Done():
		return nil, req.Context().Err()
	}
	body := `<?xml version="1.0"?><rss><channel><title>Snapshot Ownership</title><item><guid>snapshot-item</guid><title>Snapshot Item</title><description>source-backed snapshot ownership fixture</description></item></channel></rss>`
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/rss+xml"}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}, nil
}
