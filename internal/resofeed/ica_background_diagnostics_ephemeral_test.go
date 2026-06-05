package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"
)

func TestICABackgroundBusySkippedDiagnosticsStayEphemeral(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	busyFeed, busyRequests := icaCountingFeedServer(t, "ICA Ephemeral Busy", "ephemeral-busy")
	seedSTCSource(t, ctx, db, "src_ica_ephemeral_busy", busyFeed.URL+"/feed.xml", "ICA Ephemeral Busy Fallback", 1)

	releaseBusy, err := tryAcquireIngestGuardWithActor(ctx, "fetch", "src_ica_ephemeral_busy", "background")
	if err != nil {
		t.Fatalf("hold busy background source lease: %v", err)
	}
	defer releaseBusy()

	result, err := ingestOnceBackgroundBounded(ctx, db, IngestConfig{SourceFetchTimeout: time.Second})
	if err != nil {
		t.Fatalf("background bounded ingest with busy source returned error: %v", err)
	}
	assertBackgroundSkippedResult(t, result, "src_ica_ephemeral_busy", IngestErrorCodeSourceBusy)
	if got := busyRequests.Load(); got != 0 {
		t.Fatalf("busy background source upstream requests = %d, want skipped with no contact", got)
	}
	assertSourceFetchDiagnosticUnchanged(t, ctx, db, "src_ica_ephemeral_busy")
	assertBackgroundSkipDiagnosticsNotPersisted(t, ctx, db, []string{IngestErrorCodeSourceBusy, "source already fetching"})

	releaseBusy()
	icaAssertNoDeferredFeedRequest(t, busyRequests, "busy background source after ephemeral skip")
}

func TestICABackgroundCapacitySkippedDiagnosticsStayEphemeral(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	releaseCapacity := icaHoldExternalSourceLeases(t, ctx, icaExpectedSourceConcurrencySlots)
	defer releaseCapacity()

	blockedFeed, blockedRequests := icaCountingFeedServer(t, "ICA Ephemeral Capacity", "ephemeral-capacity")
	seedSTCSource(t, ctx, db, "src_ica_ephemeral_capacity", blockedFeed.URL+"/feed.xml", "ICA Ephemeral Capacity Fallback", 1)

	result, err := ingestOnceBackgroundBounded(ctx, db, IngestConfig{SourceFetchTimeout: time.Second})
	if err != nil {
		t.Fatalf("background bounded ingest under external capacity returned error: %v", err)
	}
	assertBackgroundSkippedResult(t, result, "src_ica_ephemeral_capacity", IngestErrorCodeSourceCapacityExhausted)
	if got := blockedRequests.Load(); got != 0 {
		t.Fatalf("capacity-skipped background source upstream requests = %d, want skipped with no contact", got)
	}
	assertSourceFetchDiagnosticUnchanged(t, ctx, db, "src_ica_ephemeral_capacity")
	assertBackgroundSkipDiagnosticsNotPersisted(t, ctx, db, []string{IngestErrorCodeSourceCapacityExhausted, "source capacity exhausted"})

	releaseCapacity()
	icaAssertNoDeferredFeedRequest(t, blockedRequests, "capacity-skipped background source after ephemeral skip")
}

func TestICABackgroundCurrentOperationDiagnosticsClearAfterSkippedTick(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	releaseCapacity := icaHoldExternalSourceLeases(t, ctx, icaExpectedSourceConcurrencySlots)
	defer releaseCapacity()

	blockedFeed, blockedRequests := icaCountingFeedServer(t, "ICA Ephemeral Operation", "ephemeral-operation")
	seedSTCSource(t, ctx, db, "src_ica_ephemeral_operation", blockedFeed.URL+"/feed.xml", "ICA Ephemeral Operation Fallback", 1)

	if err := IngestOnce(ctx, db, IngestConfig{SourceFetchTimeout: time.Second}); err != nil {
		t.Fatalf("background IngestOnce under external capacity returned error: %v", err)
	}
	if got := blockedRequests.Load(); got != 0 {
		t.Fatalf("capacity-skipped IngestOnce source upstream requests = %d, want skipped with no contact", got)
	}
	operation := currentOperationInfo()
	if operation.Running || operation.Kind != nil || operation.Message != nil || operation.Count != nil {
		t.Fatalf("current operation after skipped background tick = %+v, want cleared ephemeral snapshot", operation)
	}
	assertBackgroundSkipDiagnosticsNotPersisted(t, ctx, db, []string{IngestErrorCodeSourceCapacityExhausted, "source capacity exhausted", "background ingest skipped"})

	releaseCapacity()
	icaAssertNoDeferredFeedRequest(t, blockedRequests, "capacity-skipped IngestOnce source after cleared operation")
}

func assertBackgroundSkippedResult(t *testing.T, result ManualFetchResult, sourceID string, code string) {
	t.Helper()
	if result.Operation != ManualFetchOperationIngest || !result.Completed {
		t.Fatalf("background skipped result operation/completed = %+v, want completed ingest result", result)
	}
	if result.SourcesFetched != 0 || result.ItemsDiscovered != 0 || result.ItemsUpserted != 0 {
		t.Fatalf("background skipped result started durable work: %+v", result)
	}
	for _, resultErr := range result.Errors {
		if resultErr.SourceID == sourceID && resultErr.Code == code {
			return
		}
	}
	t.Fatalf("background skipped result errors = %+v, want source_id=%s code=%s", result.Errors, sourceID, code)
}

func assertSourceFetchDiagnosticUnchanged(t *testing.T, ctx context.Context, db *sql.DB, sourceID string) {
	t.Helper()
	var status, fetchError, fetchedAt string
	err := db.QueryRowContext(ctx, `select last_fetch_status, coalesce(last_fetch_error, ''), coalesce(last_fetch_at, '') from sources where id = ?`, sourceID).Scan(&status, &fetchError, &fetchedAt)
	if err != nil {
		t.Fatalf("read source fetch diagnostics for %s: %v", sourceID, err)
	}
	if status != sourceStatusNotFetched || fetchError != "" || fetchedAt != "" {
		t.Fatalf("source %s persisted skipped diagnostic status=%q error=%q fetched_at=%q, want untouched not_fetched row", sourceID, status, fetchError, fetchedAt)
	}
}

func assertBackgroundSkipDiagnosticsNotPersisted(t *testing.T, ctx context.Context, db *sql.DB, forbidden []string) {
	t.Helper()
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)
	for _, token := range []string{"queue", "job", "pending_work", "operation_history", "activity", "command_history", "reading_history", "progress"} {
		assertSQLiteSchemaTokenAbsent(t, ctx, db, token)
	}
	assertSQLiteTableColumnAbsent(t, ctx, db, "sources", "feed_title")

	var doctor bytes.Buffer
	if err := WriteDoctor(ctx, db, &doctor); err != nil {
		t.Fatalf("write doctor diagnostics: %v", err)
	}
	var exported bytes.Buffer
	if err := ExportState(ctx, db, &exported); err != nil {
		t.Fatalf("export portable state: %v", err)
	}
	for _, token := range forbidden {
		if strings.Contains(doctor.String(), token) {
			t.Fatalf("/doctor persisted background skip diagnostic token %q in output:\n%s", token, doctor.String())
		}
		if strings.Contains(exported.String(), token) {
			t.Fatalf("portable state export persisted background skip diagnostic token %q in output:\n%s", token, exported.String())
		}
	}
}
