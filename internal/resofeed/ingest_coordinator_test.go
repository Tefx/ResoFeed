package resofeed

import (
	"context"
	"errors"
	"testing"
)

func TestIngestConfigCoordinatorDefaults(t *testing.T) {
	cfg := (IngestConfig{}).coordinatorConfig()
	if cfg.SourceConcurrency != DefaultIngestSourceConcurrency {
		t.Fatalf("SourceConcurrency = %d, want %d", cfg.SourceConcurrency, DefaultIngestSourceConcurrency)
	}
	if cfg.ItemConcurrencyPerSource != DefaultIngestItemConcurrencyPerSource {
		t.Fatalf("ItemConcurrencyPerSource = %d, want %d", cfg.ItemConcurrencyPerSource, DefaultIngestItemConcurrencyPerSource)
	}
	if cfg.GlobalLLMConcurrency != DefaultIngestGlobalLLMConcurrency {
		t.Fatalf("GlobalLLMConcurrency = %d, want %d", cfg.GlobalLLMConcurrency, DefaultIngestGlobalLLMConcurrency)
	}
}

func TestCoordinatorConfigPreservesExplicitLimits(t *testing.T) {
	cfg := IngestConfig{
		SourceConcurrency:        2,
		ItemConcurrencyPerSource: 3,
		GlobalLLMConcurrency:     5,
	}.coordinatorConfig()
	if cfg.SourceConcurrency != 2 || cfg.ItemConcurrencyPerSource != 3 || cfg.GlobalLLMConcurrency != 5 {
		t.Fatalf("coordinator config = %+v, want explicit limits 2/3/5", cfg)
	}
}

func TestCoordinatorContractNamesEphemeralScopes(t *testing.T) {
	if ingestCoordinationScopeSourceLease != "source_lease" {
		t.Fatalf("source lease scope = %q", ingestCoordinationScopeSourceLease)
	}
	if ingestCoordinationScopeSourceCapacity != "source_capacity" {
		t.Fatalf("source capacity scope = %q", ingestCoordinationScopeSourceCapacity)
	}
	if ingestCoordinationScopeGlobalExclusive != "global_exclusive" {
		t.Fatalf("global exclusive scope = %q", ingestCoordinationScopeGlobalExclusive)
	}
}

func TestIngestCoordinatorSourceLeaseSameSourceConflictAndRelease(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx := context.Background()

	release, err := tryAcquireIngestGuardWithConfig(ctx, ingestCoordinatorConfig{SourceConcurrency: 2}, "fetch", "src_same", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire first source lease: %v", err)
	}
	defer release()

	duplicateRelease, err := tryAcquireIngestGuardWithConfig(ctx, ingestCoordinatorConfig{SourceConcurrency: 2}, "fetch", "src_same", string(ActorKindHuman))
	if err == nil {
		duplicateRelease()
		t.Fatal("duplicate same-source lease acquired; want source_busy conflict")
	}
	assertIngestConflictReason(t, err, ingestConflictReasonSourceBusy)

	release()
	afterRelease, err := tryAcquireIngestGuardWithConfig(ctx, ingestCoordinatorConfig{SourceConcurrency: 2}, "fetch", "src_same", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire same source after release: %v", err)
	}
	afterRelease()
}

func TestIngestCoordinatorUnrelatedSourceLeasesOverlap(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx := context.Background()

	releaseA, err := tryAcquireIngestGuardWithConfig(ctx, ingestCoordinatorConfig{SourceConcurrency: 2}, "fetch", "src_a", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire source A lease: %v", err)
	}
	defer releaseA()
	releaseB, err := tryAcquireIngestGuardWithConfig(ctx, ingestCoordinatorConfig{SourceConcurrency: 2}, "fetch", "src_b", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire unrelated source B lease while A active: %v", err)
	}
	releaseB()
}

func TestIngestCoordinatorSourceCapacityExhaustionFailsFast(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx := context.Background()
	cfg := ingestCoordinatorConfig{SourceConcurrency: 2}

	releaseA, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_a", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire source A lease: %v", err)
	}
	defer releaseA()
	releaseB, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_b", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire source B lease: %v", err)
	}
	defer releaseB()

	releaseC, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_c", string(ActorKindHuman))
	if err == nil {
		releaseC()
		t.Fatal("source lease acquired over capacity; want source_capacity_exhausted conflict")
	}
	assertIngestConflictReason(t, err, ingestConflictReasonSourceCapacityExhausted)

	releaseB()
	releaseC, err = tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_c", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire source C after capacity release: %v", err)
	}
	releaseC()
}

func TestIngestCoordinatorGlobalExclusiveConflictsAndReleases(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx := context.Background()
	cfg := ingestCoordinatorConfig{SourceConcurrency: 2}

	sourceRelease, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_active", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire active source lease: %v", err)
	}
	defer sourceRelease()

	globalRelease, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "reprocess", "library", string(ActorKindHuman))
	if err == nil {
		globalRelease()
		t.Fatal("global-exclusive operation acquired while source lease active; want conflict")
	}
	assertIngestConflictReason(t, err, ingestConflictReasonGlobalOperationRunning)

	sourceRelease()
	globalRelease, err = tryAcquireIngestGuardWithConfig(ctx, cfg, "reprocess", "library", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire global-exclusive after source release: %v", err)
	}
	defer globalRelease()

	sourceReleaseB, err := tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_b", string(ActorKindHuman))
	if err == nil {
		sourceReleaseB()
		t.Fatal("source lease acquired while global-exclusive operation active; want conflict")
	}
	assertIngestConflictReason(t, err, ingestConflictReasonGlobalOperationRunning)

	globalRelease()
	sourceReleaseB, err = tryAcquireIngestGuardWithConfig(ctx, cfg, "fetch", "src_b", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("acquire source lease after global release: %v", err)
	}
	sourceReleaseB()
}

func resetIngestCoordinatorForTest(t *testing.T) {
	t.Helper()
	reset := func() {
		ingestGuardState.mu.Lock()
		ingestGuardState.activeGlobal = operationGuardDetails{}
		ingestGuardState.activeFetches = nil
		ingestGuardState.holder.Store(operationGuardDetails{})
		ingestGuardState.mu.Unlock()
		ingestGuardState.current.clear()
	}
	reset()
	t.Cleanup(reset)
}

func assertIngestConflictReason(t *testing.T, err error, wantReason string) {
	t.Helper()
	if !errors.Is(err, errManualFetchConflict) {
		t.Fatalf("error = %v, want errManualFetchConflict", err)
	}
	details, ok := guardConflictDetails(err)
	if !ok {
		t.Fatalf("conflict details missing for error: %v", err)
	}
	if details.Reason != wantReason {
		t.Fatalf("conflict reason = %q, want %q (details=%+v)", details.Reason, wantReason, details)
	}
}
