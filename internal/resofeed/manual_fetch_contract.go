package resofeed

const (
	// ManualIngestHTTPPath is the global manual RSS fetch trigger. The request
	// contract is POST with Authorization: Bearer <OWNER_TOKEN>, no query
	// parameters, Content-Type application/json, and exactly the empty JSON object
	// body `{}`. Implementations must reject unknown fields, non-empty objects,
	// arrays, scalars, duplicate/unknown query parameters, and unauthenticated
	// requests before starting ingest work.
	ManualIngestHTTPPath = "/api/ingest"

	// ManualSourceFetchHTTPPathPattern is the per-source manual RSS fetch trigger.
	// `{id}` is an opaque source id path segment. The request contract is POST
	// with Authorization: Bearer <OWNER_TOKEN>, no query parameters,
	// Content-Type application/json, and exactly the empty JSON object body `{}`.
	ManualSourceFetchHTTPPathPattern = "/api/sources/{id}/fetch"

	// ManualFetchRequestBody is the only valid JSON request body for both manual
	// RSS fetch endpoints.
	ManualFetchRequestBody = "{}"

	ManualFetchOperationIngest      = "ingest"
	ManualFetchOperationSourceFetch = "source_fetch"

	IngestRunScopeAll    = "all"
	IngestRunScopeSource = "source"

	IngestRunStatusCompleted           = "completed"
	IngestRunStatusCompletedWithErrors = "completed_with_errors"
	IngestRunStatusFailed              = "failed"

	IngestErrorCodeRSSFetchError           = "rss_fetch_error"
	IngestErrorCodeTimeout                 = "timeout"
	IngestErrorCodeSourceBusy              = "source_busy"
	IngestErrorCodeSourceCapacityExhausted = "source_capacity_exhausted"
	IngestErrorCodeInternal                = "internal"

	ConflictReasonSourceBusy              = "source_busy"
	ConflictReasonSourceCapacityExhausted = "source_capacity_exhausted"
	ConflictReasonGlobalOperationRunning  = "global_operation_running"

	ManualFetchErrorCodeUnauthorized = "unauthorized"
	ManualFetchErrorCodeBadRequest   = "bad_request"
	ManualFetchErrorCodeNotFound     = "not_found"
	// ManualFetchErrorCodeConflict is used only for a live ingest/fetch guard
	// collision. This contract intentionally records the step-authoritative 409
	// requirement even though docs/ARCHITECTURE.md §6 currently lists allowed
	// common error codes without `conflict`.
	ManualFetchErrorCodeConflict = "conflict"
	ManualFetchErrorCodeInternal = "internal"

	ManualFetchHTTPStatusOK           = 200
	ManualFetchHTTPStatusUnauthorized = 401
	ManualFetchHTTPStatusBadRequest   = 400
	ManualFetchHTTPStatusNotFound     = 404
	ManualFetchHTTPStatusConflict     = 409
	ManualFetchHTTPStatusInternal     = 500
)

// ManualFetchRequest is an acceptance-only schema marker for both manual RSS
// fetch endpoints. It must decode only from the exact JSON object `{}`. This
// type deliberately contains no fields so future implementation code has no
// judgment to make about optional knobs, idempotency keys, queues, jobs, or
// receipt payloads.
type ManualFetchRequest struct{}

func isSkippedIngestErrorCode(code string) bool {
	return code == IngestErrorCodeSourceBusy || code == IngestErrorCodeSourceCapacityExhausted
}

func deriveIngestRunStatus(scope string, sourcesFailed int, sourcesSkipped int) string {
	if scope == IngestRunScopeSource && sourcesFailed > 0 {
		return IngestRunStatusFailed
	}
	if sourcesFailed > 0 || sourcesSkipped > 0 {
		return IngestRunStatusCompletedWithErrors
	}
	return IngestRunStatusCompleted
}

func conflictReasonForGuardDetails(details operationGuardDetails) string {
	if details.Operation == "fetch" {
		if sourceFetchGuardKey(details.Scope) == string(ingestCoordinationScopeSourceCapacity) {
			return ConflictReasonSourceCapacityExhausted
		}
		return ConflictReasonSourceBusy
	}
	return ConflictReasonGlobalOperationRunning
}

// ManualFetchResult is the request-level 200 response schema for successful or
// operationally completed manual RSS fetch triggers. RSS/source failures remain
// source-level entries in Errors; they are not generic transport failures.
//
// Contract decisions pinned here:
//   - zero active sources for global ingest returns Completed=true, all counts
//     zero, and Errors=[];
//   - missing, deleted, or inactive per-source fetch never uses this schema and
//     returns 404 not_found instead;
//   - concurrent background/manual or manual/manual overlap never queues work and
//     returns 409 conflict using the canonical error envelope;
//   - source failures are reported in Errors while the request status remains
//     200 so one source cannot block other sources.
type ManualFetchResult struct {
	Operation       string                   `json:"operation"`
	SourceID        *string                  `json:"source_id"`
	Completed       bool                     `json:"completed"`
	SourcesTotal    int                      `json:"sources_total"`
	SourcesFetched  int                      `json:"sources_fetched"`
	ItemsDiscovered int                      `json:"items_discovered"`
	ItemsUpserted   int                      `json:"items_upserted"`
	Errors          []ManualFetchSourceError `json:"errors"`
}

// ManualFetchSourceError is a source-level operational failure entry. Code is a
// terse stable value such as `rss_fetch_error`; Message is human-readable but
// must not contain secrets. These errors do not create durable jobs, ledgers, or
// retry queues.
type ManualFetchSourceError struct {
	SourceID string `json:"source_id"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

// ManualFetchGuardSemantics is an acceptance-only description of the single
// in-process ingest/fetch guard shared by background ingest, POST /api/ingest,
// and POST /api/sources/{id}/fetch. The guard is not durable state and must not
// become a queue, job table, receipt ledger, service layer, repository layer,
// DI container, or event bus.
//
// Required implementation semantics for later steps:
//   - exactly one background ingest, global manual ingest, or per-source manual
//     fetch may run at a time within the Go process;
//   - manual HTTP triggers that overlap any running operation return 409
//     conflict and do not enqueue work;
//   - guard acquisition must respect request context cancellation before work
//     starts;
//   - guard release must be guaranteed for normal completion, returned errors,
//     and panic/recover paths so stale state cannot block later manual fetches;
//   - guard state is memory-only and is never persisted to SQLite or exported.
type ManualFetchGuardSemantics struct{}

// ManualFetchForbiddenExpansions lists non-goals so acceptance tests can assert
// the manual RSS fetch implementation remains within the flat internal/resofeed
// architecture.
var ManualFetchForbiddenExpansions = []string{
	"durable queue",
	"job table",
	"receipt ledger",
	"sync coordinator",
	"service layer",
	"repository layer",
	"DI container",
	"event bus",
}
