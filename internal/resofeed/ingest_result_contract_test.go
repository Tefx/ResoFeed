package resofeed

import (
	"encoding/json"
	"testing"
	"time"
)

func TestIngestRunResultStatusDerivationContract(t *testing.T) {
	started := time.Date(2026, 5, 9, 14, 0, 0, 0, time.UTC)
	completed := started.Add(1500 * time.Millisecond)
	sourceID := "src_failed"

	tests := []struct {
		name   string
		scope  string
		source *string
		result ManualFetchResult
		want   IngestRunResult
	}{
		{
			name:  "zero active sources completes",
			scope: IngestRunScopeAll,
			result: ManualFetchResult{
				Operation:      ManualFetchOperationIngest,
				Completed:      true,
				SourcesTotal:   0,
				SourcesFetched: 0,
				Errors:         []ManualFetchSourceError{},
			},
			want: IngestRunResult{Status: IngestRunStatusCompleted, SourcesAttempted: 0, SourcesSucceeded: 0, SourcesFailed: 0, SourcesSkipped: 0},
		},
		{
			name:  "all successful source attempts complete",
			scope: IngestRunScopeAll,
			result: ManualFetchResult{
				Operation:      ManualFetchOperationIngest,
				Completed:      true,
				SourcesTotal:   2,
				SourcesFetched: 2,
				ItemsUpserted:  7,
				Errors:         []ManualFetchSourceError{},
			},
			want: IngestRunResult{Status: IngestRunStatusCompleted, SourcesAttempted: 2, SourcesSucceeded: 2, SourcesFailed: 0, SourcesSkipped: 0, ItemsUpserted: 7},
		},
		{
			name:  "item-level failures complete with source success and errors",
			scope: IngestRunScopeAll,
			result: ManualFetchResult{
				Operation:      ManualFetchOperationIngest,
				Completed:      true,
				SourcesTotal:   1,
				SourcesFetched: 1,
				ItemsUpserted:  2,
				Errors: []ManualFetchSourceError{{
					SourceID: "src_partial_item_failure",
					Code:     IngestErrorCodeItemProcessingError,
					Message:  "1 item(s) failed during processing",
				}},
			},
			want: IngestRunResult{Status: IngestRunStatusCompletedWithErrors, SourcesAttempted: 1, SourcesSucceeded: 1, SourcesFailed: 0, SourcesSkipped: 0, ItemsUpserted: 2},
		},
		{
			name:  "all source run with failed attempt completes with errors",
			scope: IngestRunScopeAll,
			result: ManualFetchResult{
				Operation:      ManualFetchOperationIngest,
				Completed:      true,
				SourcesTotal:   2,
				SourcesFetched: 1,
				ItemsUpserted:  3,
				Errors: []ManualFetchSourceError{{
					SourceID: "src_rss_error",
					Code:     IngestErrorCodeRSSFetchError,
					Message:  "feed returned HTTP 502",
				}},
			},
			want: IngestRunResult{Status: IngestRunStatusCompletedWithErrors, SourcesAttempted: 2, SourcesSucceeded: 1, SourcesFailed: 1, SourcesSkipped: 0, ItemsUpserted: 3},
		},
		{
			name:  "all source run with only failed started attempts completes with errors",
			scope: IngestRunScopeAll,
			result: ManualFetchResult{
				Operation:      ManualFetchOperationIngest,
				Completed:      true,
				SourcesTotal:   2,
				SourcesFetched: 0,
				Errors: []ManualFetchSourceError{
					{SourceID: "src_a", Code: IngestErrorCodeRSSFetchError, Message: "feed parse error"},
					{SourceID: "src_b", Code: IngestErrorCodeTimeout, Message: "timeout"},
				},
			},
			want: IngestRunResult{Status: IngestRunStatusCompletedWithErrors, SourcesAttempted: 2, SourcesSucceeded: 0, SourcesFailed: 2, SourcesSkipped: 0},
		},
		{
			name:   "single source started failure fails result",
			scope:  IngestRunScopeSource,
			source: &sourceID,
			result: ManualFetchResult{
				Operation:      ManualFetchOperationSourceFetch,
				SourceID:       &sourceID,
				Completed:      true,
				SourcesTotal:   1,
				SourcesFetched: 0,
				Errors: []ManualFetchSourceError{{
					SourceID: sourceID,
					Code:     IngestErrorCodeRSSFetchError,
					Message:  "connection refused",
				}},
			},
			want: IngestRunResult{Status: IngestRunStatusFailed, SourcesAttempted: 1, SourcesSucceeded: 0, SourcesFailed: 1, SourcesSkipped: 0},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := newIngestRunResult(tc.result, tc.scope, tc.source, started, completed)
			if got.Scope != tc.scope || got.SourceID != tc.source || got.Status != tc.want.Status || got.SourcesAttempted != tc.want.SourcesAttempted || got.SourcesSucceeded != tc.want.SourcesSucceeded || got.SourcesFailed != tc.want.SourcesFailed || got.SourcesSkipped != tc.want.SourcesSkipped || got.ItemsUpserted != tc.want.ItemsUpserted {
				t.Fatalf("IngestRunResult = %+v, want status/counters %+v", got, tc.want)
			}
			if got.DurationMS != 1500 || got.StartedAt != started.Format(time.RFC3339) || got.CompletedAt != completed.Format(time.RFC3339) {
				t.Fatalf("IngestRunResult timing = started %q completed %q duration %d", got.StartedAt, got.CompletedAt, got.DurationMS)
			}
			if got.Errors == nil {
				t.Fatalf("IngestRunResult errors = nil, want empty or populated slice")
			}
		})
	}
}

func TestIngestRunResultSkippedCountersAndErrorEntriesContract(t *testing.T) {
	started := time.Date(2026, 5, 9, 14, 0, 0, 0, time.UTC)
	result := ManualFetchResult{
		Operation:      ManualFetchOperationIngest,
		Completed:      true,
		SourcesTotal:   1,
		SourcesFetched: 1,
		ItemsUpserted:  2,
		Errors: []ManualFetchSourceError{
			{SourceID: "src_busy", Code: IngestErrorCodeSourceBusy, Message: "source already fetching"},
			{SourceID: "src_capacity", Code: IngestErrorCodeSourceCapacityExhausted, Message: "source capacity exhausted"},
		},
	}

	got := newIngestRunResult(result, IngestRunScopeAll, nil, started, started)
	if got.Status != IngestRunStatusCompletedWithErrors || got.SourcesAttempted != 1 || got.SourcesSucceeded != 1 || got.SourcesFailed != 0 || got.SourcesSkipped != 2 {
		t.Fatalf("skipped IngestRunResult = %+v, want completed_with_errors attempted=1 succeeded=1 failed=0 skipped=2", got)
	}
	assertIngestErrorDetail(t, got.Errors, "src_busy", IngestErrorCodeSourceBusy)
	assertIngestErrorDetail(t, got.Errors, "src_capacity", IngestErrorCodeSourceCapacityExhausted)

	body, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal IngestRunResult: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal marshaled IngestRunResult: %v", err)
	}
	if parsed["sources_skipped"] != float64(2) {
		t.Fatalf("marshaled sources_skipped = %#v, want 2; body=%s", parsed["sources_skipped"], string(body))
	}
}

func TestIngestConflictReasonContract(t *testing.T) {
	tests := []struct {
		name    string
		details operationGuardDetails
		want    string
	}{
		{
			name:    "source lease conflict is source_busy",
			details: operationGuardDetails{Operation: "fetch", Scope: "src_01", ActorKind: string(ActorKindHuman)},
			want:    ConflictReasonSourceBusy,
		},
		{
			name:    "source capacity conflict is source_capacity_exhausted",
			details: operationGuardDetails{Operation: "fetch", Scope: string(ingestCoordinationScopeSourceCapacity), ActorKind: string(ActorKindHuman)},
			want:    ConflictReasonSourceCapacityExhausted,
		},
		{
			name:    "global operation conflict is global_operation_running",
			details: operationGuardDetails{Operation: "ingest", Scope: "all", ActorKind: string(ActorKindHuman)},
			want:    ConflictReasonGlobalOperationRunning,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := conflictReasonForGuardDetails(tc.details); got != tc.want {
				t.Fatalf("conflictReasonForGuardDetails(%+v) = %q, want %q", tc.details, got, tc.want)
			}
			detailMap := guardConflictDetailMap(tc.details)
			if detailMap["reason"] != tc.want {
				t.Fatalf("guardConflictDetailMap reason = %#v, want %q; details=%#v", detailMap["reason"], tc.want, detailMap)
			}
		})
	}
}

func assertIngestErrorDetail(t *testing.T, errors []IngestErrorDetail, sourceID string, code string) {
	t.Helper()
	for _, detail := range errors {
		if detail.SourceID != nil && *detail.SourceID == sourceID && detail.Code == code {
			return
		}
	}
	t.Fatalf("errors = %+v, want source_id=%q code=%q", errors, sourceID, code)
}
