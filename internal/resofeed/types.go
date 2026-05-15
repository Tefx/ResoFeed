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
)

// ServeConfig is the CLI contract for `resofeed serve`. CLI flags are the
// primary non-secret runtime configuration surface: --addr, --public-url,
// --db, --openrouter-model, and optional --owner-token.
type ServeConfig struct {
	Addr            string
	PublicURL       string
	DBPath          string
	OpenRouterKey   string
	OpenRouterModel string
	OwnerToken      string
}

// ErrorBody is the canonical JSON error envelope for HTTP API failures.
// Allowed error codes are unauthorized, bad_request, not_found, and internal.
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
	ID                 string
	SourceID           string
	SourceTitle        string
	URL                string
	Title              string
	Summary            *string
	CoreInsight        *string
	ValueTier          *string
	PublishedAt        *time.Time
	ExtractionStatus   string
	ModelStatus        string
	IsResonated        bool
	HumanInspectedAt   *time.Time
	ExternalSurfacedAt *time.Time
	StoryKey           *string
	DuplicateOfItemID  *string
	FeedExcerpt        *string
	ExtractedText      *string
	Provenance         Provenance
}

// ItemSummary is the canonical HTTP/MCP list, search, and candidate item shape.
// It intentionally excludes raw feed_excerpt, extracted_text, and provenance;
// those fields belong only on ItemDetail. Display fallback fields are derived
// from canonical item columns for compact list/search rendering.
type ItemSummary struct {
	ID                 string     `json:"id"`
	SourceID           string     `json:"source_id"`
	SourceTitle        string     `json:"source_title"`
	URL                string     `json:"url"`
	Title              string     `json:"title"`
	Summary            *string    `json:"summary"`
	CoreInsight        *string    `json:"core_insight"`
	DisplayExcerpt     *string    `json:"display_excerpt,omitempty"`
	ValueTier          *string    `json:"value_tier"`
	PublishedAt        *time.Time `json:"published_at"`
	FirstSeenAt        *time.Time `json:"first_seen_at,omitempty"`
	ExtractionStatus   string     `json:"extraction_status"`
	ModelStatus        string     `json:"model_status"`
	IsResonated        bool       `json:"is_resonated"`
	HumanInspectedAt   *time.Time `json:"human_inspected_at"`
	ExternalSurfacedAt *time.Time `json:"external_surfaced_at"`
	StoryKey           *string    `json:"story_key"`
	DuplicateOfItemID  *string    `json:"duplicate_of_item_id"`
}

// ItemDetail is the canonical HTTP/MCP inspect/read item shape. Nullable fields
// are present as null when unavailable; provenance is always present as an
// object so original source context remains accessible.
type ItemDetail struct {
	ID                 string     `json:"id"`
	SourceID           string     `json:"source_id"`
	SourceTitle        string     `json:"source_title"`
	URL                string     `json:"url"`
	Title              string     `json:"title"`
	Summary            *string    `json:"summary"`
	CoreInsight        *string    `json:"core_insight"`
	ValueTier          *string    `json:"value_tier"`
	PublishedAt        *time.Time `json:"published_at"`
	ExtractionStatus   string     `json:"extraction_status"`
	ModelStatus        string     `json:"model_status"`
	IsResonated        bool       `json:"is_resonated"`
	HumanInspectedAt   *time.Time `json:"human_inspected_at"`
	ExternalSurfacedAt *time.Time `json:"external_surfaced_at"`
	StoryKey           *string    `json:"story_key"`
	DuplicateOfItemID  *string    `json:"duplicate_of_item_id"`
	FeedExcerpt        *string    `json:"feed_excerpt"`
	ExtractedText      *string    `json:"extracted_text"`
	Provenance         Provenance `json:"provenance"`
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

// SteeringReceipt is inline transparency, not a rule-management UI or
// portable activity ledger.
type SteeringReceipt struct {
	InterpretedAs string      `json:"interpreted_as"`
	ChangedRules  []SteerRule `json:"changed_rules"`
	Message       string      `json:"message"`
}

// SteerResult is the canonical steering response envelope.
type SteerResult struct {
	Receipt SteeringReceipt `json:"receipt"`
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
