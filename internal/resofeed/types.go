package resofeed

import "time"

const (
	// StateSchemaVersionV1 is the only portable JSON state bundle schema
	// admitted by the current contract.
	StateSchemaVersionV1 = "resofeed.state.v1"

	// DefaultAddr is the documented bind address for web UI, JSON HTTP, and MCP.
	DefaultAddr = "127.0.0.1:8080"

	// DefaultDBPath is the documented SQLite file path for `resofeed serve`.
	DefaultDBPath = "./data/resofeed.sqlite3"

	// DefaultFirstFetchMaxItems caps brand-new source backfills while preserving
	// 0 as an explicit unlimited escape hatch.
	DefaultFirstFetchMaxItems = 50
	MaxFirstFetchMaxItems     = 500
)

// ServeConfig is the CLI contract for `resofeed serve`. CLI flags are the
// primary non-secret runtime configuration surface: --addr, --public-url,
// --db, --openrouter-model, optional --owner-token, and --first-fetch-limit.
type ServeConfig struct {
	Addr                string
	PublicURL           string
	DBPath              string
	OpenRouterKey       string
	OpenRouterKeySource string
	OpenRouterModel     string
	OwnerToken          string
	FirstFetchMaxItems  int
}

// ErrorBody is the canonical JSON error envelope for HTTP API failures.
// Allowed error codes are unauthorized, bad_request, not_found, conflict, and internal.
type ErrorBody struct {
	Error APIError `json:"error"`
}

// APIError is intentionally terse; raw operational details belong in /doctor.
type APIError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

// Source is the flat Source Ledger row shared by storage, HTTP, MCP, and UI
// response boundaries. OPML folders/tags are discarded on import. MCP must use
// the canonical SourcesResponse envelope rather than an MCP-only source shape.
type Source struct {
	ID              string     `json:"id"`
	URL             string     `json:"url"`
	Title           string     `json:"title"`
	LastFetchAt     *time.Time `json:"last_fetch_at"`
	LastFetchStatus string     `json:"last_fetch_status"`
	LastFetchError  *string    `json:"last_fetch_error"`
	IsActive        bool       `json:"is_active"`
	Revision        int64      `json:"revision"`
}

// Item is the canonical item cache contract. Public JSON response shapes must
// use ItemSummary for list/search/MCP candidate surfaces and ItemDetail for
// inspect/read surfaces so detail-only fields cannot leak into summaries.
type Item struct {
	ID                        string
	SourceID                  string
	SourceTitle               string
	URL                       string
	Title                     string
	SourceItemTitle           string
	LocalizedTitle            *string
	Summary                   *string
	CoreInsight               *string
	KeyPoints                 []string
	ValueTier                 *string
	ContentStatus             string
	LastReprocessStatus       *string
	LastReprocessErrorCode    *string
	LastReprocessErrorMessage *string
	LastReprocessAt           *time.Time
	PublishedAt               *time.Time
	ExtractionStatus          string
	ExtractionSource          string
	SourceEvidenceText        *string
	ModelStatus               string
	IsResonated               bool
	HumanInspectedAt          *time.Time
	ExternalSurfacedAt        *time.Time
	StoryKey                  *string
	DuplicateOfItemID         *string
	FeedExcerpt               *string
	ExtractedText             *string
	Provenance                Provenance
}

// ItemSummary is the canonical HTTP/MCP list, search, and candidate item shape.
// It intentionally excludes raw feed_excerpt, extracted_text, and provenance;
// those fields belong only on ItemDetail. Display fallback fields are derived
// from canonical item columns for compact list/search rendering.
type ItemSummary struct {
	ID                        string     `json:"id"`
	SourceID                  string     `json:"source_id"`
	SourceTitle               string     `json:"source_title"`
	URL                       string     `json:"url"`
	Title                     string     `json:"title"`
	SourceItemTitle           string     `json:"source_item_title"`
	LocalizedTitle            *string    `json:"localized_title"`
	Summary                   *string    `json:"summary"`
	CoreInsight               *string    `json:"core_insight"`
	DisplayExcerpt            *string    `json:"display_excerpt,omitempty"`
	KeyPoints                 []string   `json:"key_points"`
	ValueTier                 *string    `json:"value_tier"`
	PublishedAt               *time.Time `json:"published_at"`
	FirstSeenAt               *time.Time `json:"first_seen_at,omitempty"`
	ExtractionStatus          string     `json:"extraction_status"`
	ExtractionSource          string     `json:"extraction_source"`
	ModelStatus               string     `json:"model_status"`
	ContentStatus             string     `json:"content_status"`
	LastReprocessStatus       *string    `json:"last_reprocess_status"`
	LastReprocessErrorCode    *string    `json:"last_reprocess_error_code"`
	LastReprocessErrorMessage *string    `json:"last_reprocess_error_message"`
	LastReprocessAt           *time.Time `json:"last_reprocess_at"`
	IsResonated               bool       `json:"is_resonated"`
	HumanInspectedAt          *time.Time `json:"human_inspected_at"`
	ExternalSurfacedAt        *time.Time `json:"external_surfaced_at"`
	StoryKey                  *string    `json:"story_key"`
	DuplicateOfItemID         *string    `json:"duplicate_of_item_id"`
}

// ItemDetail is the canonical HTTP/MCP inspect/read item shape. Nullable fields
// are present as null when unavailable; provenance is always present as an
// object so original source context remains accessible.
type ItemDetail struct {
	ID                        string     `json:"id"`
	SourceID                  string     `json:"source_id"`
	SourceTitle               string     `json:"source_title"`
	URL                       string     `json:"url"`
	Title                     string     `json:"title"`
	SourceItemTitle           string     `json:"source_item_title"`
	LocalizedTitle            *string    `json:"localized_title"`
	Summary                   *string    `json:"summary"`
	CoreInsight               *string    `json:"core_insight"`
	KeyPoints                 []string   `json:"key_points"`
	ValueTier                 *string    `json:"value_tier"`
	PublishedAt               *time.Time `json:"published_at"`
	ExtractionStatus          string     `json:"extraction_status"`
	ExtractionSource          string     `json:"extraction_source"`
	ModelStatus               string     `json:"model_status"`
	ContentStatus             string     `json:"content_status"`
	LastReprocessStatus       *string    `json:"last_reprocess_status"`
	LastReprocessErrorCode    *string    `json:"last_reprocess_error_code"`
	LastReprocessErrorMessage *string    `json:"last_reprocess_error_message"`
	LastReprocessAt           *time.Time `json:"last_reprocess_at"`
	IsResonated               bool       `json:"is_resonated"`
	HumanInspectedAt          *time.Time `json:"human_inspected_at"`
	ExternalSurfacedAt        *time.Time `json:"external_surfaced_at"`
	StoryKey                  *string    `json:"story_key"`
	DuplicateOfItemID         *string    `json:"duplicate_of_item_id"`
	FeedExcerpt               *string    `json:"feed_excerpt"`
	ExtractedText             *string    `json:"extracted_text"`
	SourceEvidenceText        *string    `json:"source_evidence_text"`
	Provenance                Provenance `json:"provenance"`
}

// GroupedSourceItem is a terse source-list disclosure for every persisted item
// sharing an ItemDetail story_key. It is provenance only: grouping does not
// merge rows, suppress sources, or create sync/activity history.
type GroupedSourceItem struct {
	ItemID            string     `json:"item_id"`
	SourceID          string     `json:"source_id"`
	SourceTitle       string     `json:"source_title"`
	SourceURL         string     `json:"source_url"`
	URL               string     `json:"url"`
	CanonicalURL      *string    `json:"canonical_url"`
	Title             string     `json:"title"`
	PublishedAt       *time.Time `json:"published_at"`
	FirstSeenAt       *time.Time `json:"first_seen_at"`
	ExtractionStatus  string     `json:"extraction_status"`
	ModelStatus       string     `json:"model_status"`
	StoryKey          *string    `json:"story_key"`
	DuplicateOfItemID *string    `json:"duplicate_of_item_id"`
	IsSelectedItem    bool       `json:"is_selected_item"`
}

// Provenance is included on item detail so summaries, grouping, and search
// results remain verifiable without hiding original source items.
type Provenance struct {
	SourceURL          string              `json:"source_url"`
	CanonicalURL       *string             `json:"canonical_url"`
	OriginalURL        string              `json:"original_url"`
	StoryKey           *string             `json:"story_key"`
	DuplicateOfItemID  *string             `json:"duplicate_of_item_id"`
	GroupedSourceItems []GroupedSourceItem `json:"grouped_source_items"`
}

// ItemState is current attention state only. Inspection and external surfacing
// are operational state; resonance is portable state.
type ItemState struct {
	ItemID             string     `json:"item_id"`
	IsResonated        bool       `json:"is_resonated"`
	HumanInspectedAt   *time.Time `json:"human_inspected_at"`
	ExternalSurfacedAt *time.Time `json:"external_surfaced_at"`
	LastActorKind      *string    `json:"last_actor_kind"`
	LastActorID        *string    `json:"last_actor_id"`
}

// OpenRouterModelInfo is the contract-only model listing DTO for the runtime
// OpenRouter account. It is intentionally ephemeral and must not be persisted as
// selected model state, prompt state, or provider configuration.
type OpenRouterModelInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// OpenRouterModelsResponse is the HTTP/MCP model listing response shape. Errors
// that occur while fetching models must be redacted and must never leak API keys,
// owner tokens, .env paths, or raw provider payloads.
type OpenRouterModelsResponse struct {
	Models []OpenRouterModelInfo `json:"models"`
}

// ItemReingestRequest is the selected Inspector item re-ingest mutation body.
// It uses the same actor/idempotency boundary as other owner-authorized
// mutations and intentionally excludes processing-language overrides.
type ItemReingestRequest struct {
	// Model and Prompt are request-scoped only. They may influence the current
	// OpenRouter transform call but are never persisted as durable provider or
	// prompt state.
	Model  *string `json:"model"`
	Prompt *string `json:"prompt"`
	MutationRequestFields
}

// ItemReingestResult is the selected-item re-ingest response payload. It reports
// only the current item rewrite and derived search-index refresh, not a job,
// queue, history entry, or durable progress record.
type ItemReingestResult struct {
	ItemID      string                `json:"item_id"`
	Status      ReprocessStatus       `json:"status"`
	Language    ProcessingLanguage    `json:"language"`
	ItemUpdated bool                  `json:"item_updated"`
	FTSUpdated  bool                  `json:"fts_updated"`
	Error       *ReprocessErrorDetail `json:"error"`
	Item        *ItemDetail           `json:"item"`
}

// ItemReingestResponse is returned by HTTP selected-item re-ingest and MCP
// reingest_item. Same-key/same-fingerprint replay returns AlreadyApplied=true.
type ItemReingestResponse struct {
	Reingest       ItemReingestResult `json:"reingest"`
	AlreadyApplied bool               `json:"already_applied"`
}

// MCPReingestItemInput is the MCP parity input schema for selected-item
// re-ingest. The runtime language is read from persisted metadata; per-call
// language overrides are deliberately not admitted.
type MCPReingestItemInput struct {
	ItemID         string  `json:"item_id"`
	ActorID        string  `json:"actor_id"`
	IdempotencyKey string  `json:"idempotency_key"`
	Model          *string `json:"model"`
	Prompt         *string `json:"prompt"`
	ExtraPrompt    *string `json:"extra_prompt"`
}

// SteerRule is the current steering policy row. Only active rules affect
// ranking; inactive/superseded rows are not a command history UI. MCP must use
// the canonical RulesResponse envelope rather than an MCP-only rule shape.
type SteerRule struct {
	ID                 string  `json:"id"`
	RuleText           string  `json:"rule_text"`
	IsActive           bool    `json:"is_active"`
	SupersededBy       *string `json:"superseded_by"`
	Revision           int64   `json:"revision"`
	CreatedByActorKind *string `json:"created_by_actor_kind,omitempty"`
	CreatedByActorID   *string `json:"created_by_actor_id,omitempty"`
}

// SearchQueryEcho is the normalized HTTP search query echo. The API contract
// does not trim, fold case, normalize Unicode, or collapse query whitespace.
type SearchQueryEcho struct {
	Q         string  `json:"q"`
	Source    *string `json:"source"`
	From      *string `json:"from"`
	To        *string `json:"to"`
	Resonated *bool   `json:"resonated"`
	Limit     int     `json:"limit"`
}

// SteerRouteKind is the contract-level classifier output for Steer input before
// a caller decides whether to preview, commit, or undo. It is a route selector,
// not an implementation registry: the single Go binary still handles all routes
// through flat internal/resofeed functions and SQLite current state.
type SteerRouteKind string

const (
	// SteerRoutePolicy is a future-behavior steering rule change.
	SteerRoutePolicy SteerRouteKind = "policy"
	// SteerRouteSource is an RSS/Atom source subscription command pasted into Steer.
	SteerRouteSource SteerRouteKind = "source"
	// SteerRouteSearch is a lexical retrieval alias from the Steer command surface.
	SteerRouteSearch SteerRouteKind = "search"
	// SteerRouteDoctor is the /doctor diagnostics alias from the Steer command surface.
	SteerRouteDoctor SteerRouteKind = "doctor"
	// SteerRouteInvariantConflict is a deterministic safety/product-invariant receipt.
	SteerRouteInvariantConflict SteerRouteKind = "invariant_conflict"
	// SteerRouteUnknown is used when no product-valid route is available.
	SteerRouteUnknown SteerRouteKind = "unknown"
)

// SteerPreviewRequest is the contract-only request body for a non-mutating
// Steer route preview. It intentionally has no idempotency_key: preview performs
// no durable mutation and must create no agent receipt, command history, job,
// queue, global undo stack, or activity ledger.
type SteerPreviewRequest struct {
	Command   string    `json:"command"`
	ActorKind ActorKind `json:"actor_kind"`
	ActorID   string    `json:"actor_id"`
}

// SteerTarget identifies the concrete current-state row a reversible committed
// Steer action may affect. Target-specific undo is intentionally scoped to one
// source or one steering rule; it is not a global command-history stack.
type SteerTarget struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// SteerUndoHandle is an inline, nullable contract object for reversible Steer
// receipts/previews. target is null when there is no reversible target. The
// handle is provenance for one target-specific undo attempt only; it is not
// portable state, a command ledger, or an activity feed.
type SteerUndoHandle struct {
	RouteKind SteerRouteKind `json:"route_kind"`
	Target    *SteerTarget   `json:"target"`
	Revision  *int64         `json:"revision"`
}

// SteerPreview is the canonical non-mutating preview response shape for Steer.
// changed_rules is always present and empty when no policy rule would change;
// lexical_search_query and undo_handle are present as null when inapplicable.
// Preview may classify lexical search aliases, source additions, policy changes,
// /doctor, and invariant conflicts, but must not write SQLite state or receipts.
// WillMutate is scoped to the preview call itself, not a future commit: preview
// is read-only, so public preview responses must report will_mutate=false.
type SteerPreview struct {
	RouteKind          SteerRouteKind   `json:"route_kind"`
	InterpretedAs      string           `json:"interpreted_as"`
	ChangedRules       []SteerRule      `json:"changed_rules"`
	Message            string           `json:"message"`
	LexicalSearchQuery *SearchQueryEcho `json:"lexical_search_query"`
	UndoHandle         *SteerUndoHandle `json:"undo_handle"`
	WillMutate         bool             `json:"will_mutate"`
}

// SteerPreviewResult is the preview response envelope.
type SteerPreviewResult struct {
	Preview SteerPreview `json:"preview"`
}

// ActorKind distinguishes human, agent, and system provenance. It is not an
// authorization model; the owner token is the universal delegation boundary.
type ActorKind string

const (
	ActorKindHuman  ActorKind = "human"
	ActorKindAgent  ActorKind = "agent"
	ActorKindSystem ActorKind = "system"
)

// MutationRequestFields are required for retry-safe HTTP/MCP mutations.
type MutationRequestFields struct {
	ActorKind      ActorKind `json:"actor_kind"`
	ActorID        string    `json:"actor_id"`
	IdempotencyKey string    `json:"idempotency_key"`
}

// InspectRequest is the POST /api/items/{id}/inspect body.
type InspectRequest struct {
	MutationRequestFields
}

// InspectResult is shared by HTTP inspect and MCP mark_inspected.
type InspectResult struct {
	ItemID           string    `json:"item_id"`
	HumanInspectedAt time.Time `json:"human_inspected_at"`
	AlreadyApplied   bool      `json:"already_applied"`
}

// ResonanceRequest is the POST /api/items/{id}/resonance body.
type ResonanceRequest struct {
	Resonated bool `json:"resonated"`
	MutationRequestFields
}

// ResonanceResult is shared by HTTP resonance and MCP resonate_item.
type ResonanceResult struct {
	ItemID         string `json:"item_id"`
	IsResonated    bool   `json:"is_resonated"`
	AlreadyApplied bool   `json:"already_applied"`
}

// SteerRequest is the POST /api/steer body. Steering conflicts with safety,
// freshness, coverage, provenance, or minimalism invariants return a 200
// receipt with the closest allowed interpretation, not a disabled invariant.
type SteerRequest struct {
	Command string `json:"command"`
	MutationRequestFields
}

// SteeringReceipt is inline transparency, not a rule-management UI or portable
// activity ledger. The architecture contract keeps the committed /api/steer
// receipt to interpreted_as, changed_rules, and message; target-specific undo
// uses SteerUndoHandle/SteerUndoResult instead of expanding this into a command
// history or global undo stack.
type SteeringReceipt struct {
	InterpretedAs string      `json:"interpreted_as"`
	ChangedRules  []SteerRule `json:"changed_rules"`
	Message       string      `json:"message"`
}

// SteerResult is the canonical steering response envelope.
type SteerResult struct {
	Receipt    SteeringReceipt  `json:"receipt"`
	UndoHandle *SteerUndoHandle `json:"undo_handle,omitempty"`
}

// SteerUndoRequest is the target-specific undo request body. It is idempotent
// like other mutating operations and is bounded to the supplied undo_handle; it
// must not consult or append to a global undo stack or command history.
type SteerUndoRequest struct {
	// TargetKind/TargetID are the HTTP commit-undo request fields. Undo remains
	// target-specific and never consults a global command history. UndoHandle is
	// retained for existing MCP/protected contract compatibility and is normalized
	// to the flat target fields by HTTP/MCP callers.
	TargetKind string          `json:"target_kind,omitempty"`
	TargetID   string          `json:"target_id,omitempty"`
	UndoHandle SteerUndoHandle `json:"undo_handle,omitempty"`
	MutationRequestFields
}

// SteerUndoResult is the canonical target-specific undo response. restored_rule
// and restored_source are present as null when the undo target is of the other
// kind or when no state was restored; already_applied follows the live receipt
// replay boundary for the undo request idempotency key.
type SteerUndoResult struct {
	RouteKind      SteerRouteKind `json:"route_kind"`
	Target         *SteerTarget   `json:"target"`
	Undone         bool           `json:"undone"`
	RestoredRule   *SteerRule     `json:"restored_rule"`
	RestoredSource *Source        `json:"restored_source"`
	Message        string         `json:"message"`
	AlreadyApplied bool           `json:"already_applied"`
}

// DeleteSourceResult is the DELETE /api/sources/{id} response.
type DeleteSourceResult struct {
	SourceID string `json:"source_id"`
	Deleted  bool   `json:"deleted"`
	Revision int64  `json:"revision"`
}

// OPMLImportResult reports flattened OPML import results. Folders are not
// portable state and are ignored immediately.
type OPMLImportResult struct {
	Imported         int  `json:"imported"`
	Skipped          int  `json:"skipped"`
	FoldersFlattened bool `json:"folders_flattened"`
}

// RestoreResult is the state import response schema.
type RestoreResult struct {
	Restored RestoredCounts `json:"restored"`
}

// RestoredCounts reports restored portable rows.
type RestoredCounts struct {
	Sources        int `json:"sources"`
	SteerRules     int `json:"steer_rules"`
	ResonatedItems int `json:"resonated_items"`
}

// DeliveryReportResult is the MCP report_delivery output.
type DeliveryReportResult struct {
	ItemID             string    `json:"item_id"`
	ExternalSurfacedAt time.Time `json:"external_surfaced_at"`
	AlreadyApplied     bool      `json:"already_applied"`
}
