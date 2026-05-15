package resofeed

import (
	"context"
	"database/sql"
	"time"
)

const (
	// RuntimeMetadataKeyProcessingLanguage stores the runtime-local default
	// processing language. If absent, the effective language is English. This key
	// is excluded from state export/import and is not portable user-owned state.
	RuntimeMetadataKeyProcessingLanguage = "processing_language"

	// RuntimeMetadataKeySearchFTSStaleSince is an optional RFC3339 UTC diagnostic
	// marker. It is present only while search_fts may not reflect final stored item
	// rows after reprocess begins/fails, and is cleared after a successful rebuild.
	RuntimeMetadataKeySearchFTSStaleSince = "search_fts_stale_since"

	// ProcessingLanguageDefault is the effective runtime language when
	// runtime_metadata.processing_language is absent.
	ProcessingLanguageDefault ProcessingLanguage = ProcessingLanguageEnglish

	// ReceiptLiveTTL is the maximum live idempotency receipt duration. Expired
	// rows are transactionally ignored, deleted, or replaced before accepting a
	// reused key; expired rows must not trigger fingerprint mismatch failures.
	ReceiptLiveTTL = 24 * time.Hour

	RuntimeLanguageHTTPPath         = "/api/runtime/language"
	RuntimeReprocessLibraryHTTPPath = "/api/runtime/reprocess-library"
	ItemDeliveryHTTPPath            = "/api/items/{id}/delivery"
	RuntimeLanguageMCPResourceURI   = "resofeed://runtime/language"

	DoctorSearchFTSOKLinePrefix    = "search_fts: ok"
	DoctorSearchFTSStaleLinePrefix = "search_fts: stale since "
)

// ProcessingLanguage is the approved target-language enum for item processing,
// UI chrome, search text, OpenRouter input, and MCP parity. No per-item or
// per-call language override is part of this contract.
type ProcessingLanguage string

const (
	ProcessingLanguageEnglish ProcessingLanguage = "en"
	ProcessingLanguageChinese ProcessingLanguage = "zh"
)

// ProcessingLanguageInfo is the shared HTTP/MCP language response shape.
// Labels are contractually English -> "English" and Chinese -> "中文".
type ProcessingLanguageInfo struct {
	Code  ProcessingLanguage `json:"code"`
	Label string             `json:"label"`
}

// SetProcessingLanguageRequest is the PUT /api/runtime/language request body.
// Unknown JSON body fields and all query parameters are rejected by the HTTP
// contract. Setting language affects future ingest/reprocess only and does not
// rewrite item rows or rebuild FTS.
type SetProcessingLanguageRequest struct {
	Language ProcessingLanguage `json:"language"`
	MutationRequestFields
}

// ProcessingLanguageResponse is returned by GET/PUT /api/runtime/language and
// MCP get_processing_language/set_processing_language.
type ProcessingLanguageResponse struct {
	Language       ProcessingLanguageInfo `json:"language"`
	AlreadyApplied bool                   `json:"already_applied"`
}

// ReprocessLibraryRequest is the POST /api/runtime/reprocess-library body. The
// operation uses the current persisted runtime language, rejects query params,
// and must not create durable jobs, queues, command histories, activity rows, or
// sync metadata.
type ReprocessLibraryRequest struct {
	MutationRequestFields
}

// ReprocessStatus is the terminal result enum for a library reprocess run.
type ReprocessStatus string

const (
	ReprocessStatusCompleted           ReprocessStatus = "completed"
	ReprocessStatusCompletedWithErrors ReprocessStatus = "completed_with_errors"
	ReprocessStatusFailed              ReprocessStatus = "failed"
)

// ReprocessErrorCode is constrained to the ingestion/extraction/model taxonomy;
// no translation_failed status or visual state is introduced.
type ReprocessErrorCode string

const (
	ReprocessErrorRSSFetchError       ReprocessErrorCode = "rss_fetch_error"
	ReprocessErrorModelLatencyError   ReprocessErrorCode = "model_latency_error"
	ReprocessErrorSummaryUnavailable  ReprocessErrorCode = "summary_unavailable"
	ReprocessErrorOriginalUnavailable ReprocessErrorCode = "original_unavailable"
	ReprocessErrorTimeout             ReprocessErrorCode = "timeout"
	ReprocessErrorInternal            ReprocessErrorCode = "internal"
)

// ReprocessErrorDetail is capped at 50 entries by the response contract.
type ReprocessErrorDetail struct {
	ItemID  *string            `json:"item_id"`
	Code    ReprocessErrorCode `json:"code"`
	Message string             `json:"message"`
}

// ReprocessLibraryResult is the shared HTTP/MCP result shape. items_attempted
// must equal items_updated + items_unavailable + items_failed. items_indexed is
// non-zero only for rows indexed by the successful final FTS rebuild transaction.
type ReprocessLibraryResult struct {
	Status           ReprocessStatus        `json:"status"`
	Language         ProcessingLanguage     `json:"language"`
	StartedAt        time.Time              `json:"started_at"`
	CompletedAt      time.Time              `json:"completed_at"`
	ItemsAttempted   int                    `json:"items_attempted"`
	ItemsUpdated     int                    `json:"items_updated"`
	ItemsIndexed     int                    `json:"items_indexed"`
	ItemsUnavailable int                    `json:"items_unavailable"`
	ItemsFailed      int                    `json:"items_failed"`
	FTSRebuilt       bool                   `json:"fts_rebuilt"`
	Errors           []ReprocessErrorDetail `json:"errors"`
}

// ReprocessLibraryResponse is POST /api/runtime/reprocess-library and MCP
// reprocess_library output. A duplicate key during an active run is a conflict;
// after completion, live same-fingerprint replay returns AlreadyApplied=true.
type ReprocessLibraryResponse struct {
	Reprocess      ReprocessLibraryResult `json:"reprocess"`
	AlreadyApplied bool                   `json:"already_applied"`
}

// DeliveryReportRequest is the POST /api/items/{id}/delivery request body.
// actor_id is provenance/idempotency metadata only; owner-token possession is
// the authorization boundary.
type DeliveryReportRequest struct {
	DeliveredAt time.Time `json:"delivered_at"`
	MutationRequestFields
}

// MCPSetProcessingLanguageInput is the set_processing_language input schema.
type MCPSetProcessingLanguageInput struct {
	Language       ProcessingLanguage `json:"language"`
	ActorID        string             `json:"actor_id"`
	IdempotencyKey string             `json:"idempotency_key"`
}

// MCPGetProcessingLanguageInput is intentionally empty: the runtime language is
// read from persisted runtime metadata, with no per-call override.
type MCPGetProcessingLanguageInput struct{}

// MCPReprocessLibraryInput is the reprocess_library input schema.
type MCPReprocessLibraryInput struct {
	ActorID        string `json:"actor_id"`
	IdempotencyKey string `json:"idempotency_key"`
}

// MCPSearchItemsResponse pins the query echo parity requirement for
// search_items. The MCP tool must return the same SearchResponse envelope as
// GET /api/search, not a candidate-list-only envelope.
type MCPSearchItemsResponse = SearchResponse

// RuntimeLanguageContract pins the public function signatures to be implemented
// by runtime language code. This is a contract-only anchor, not a DI container
// or alternate storage abstraction.
type RuntimeLanguageContract interface {
	GetProcessingLanguage(ctx context.Context, db *sql.DB) (ProcessingLanguageInfo, error)
	SetProcessingLanguage(ctx context.Context, db *sql.DB, req SetProcessingLanguageRequest) (ProcessingLanguageResponse, error)
	ReprocessLibrary(ctx context.Context, db *sql.DB, llm LLMClient, req ReprocessLibraryRequest) (ReprocessLibraryResponse, error)
}

// RequestFingerprintContract documents receipt fingerprint semantics for all
// body-accepting receipt-backed mutations: compute from the validated request,
// store with the live receipt snapshot, replay same-key/same-fingerprint, reject
// live same-key/different-fingerprint, and ignore/delete/replace expired rows in
// the same transaction before accepting the reused key.
type RequestFingerprintContract struct {
	IdempotencyKey     string `json:"idempotency_key"`
	RequestFingerprint string `json:"request_fingerprint"`
	Operation          string `json:"operation"`
}

// ReprocessSourcePrecedence pins fresh source retrieval order for reprocess:
// use items.canonical_url first when it is a valid HTTP(S) URL, then items.url.
// Never use sources.url, items.source_url, public provenance.source_url, or
// existing target-language item text as reprocess source material.
var ReprocessSourcePrecedence = []string{"items.canonical_url", "items.url"}
