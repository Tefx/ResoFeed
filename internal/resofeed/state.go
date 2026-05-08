package resofeed

import (
	"context"
	"database/sql"
	"io"
	"time"
)

// StateBundle is the complete portable JSON state contract. It includes only
// active sources, active steering rules, and currently resonated items. It must
// reject unknown top-level fields and is not a sync, merge, conflict-resolution,
// activity-ledger, or portable-agent-receipt format.
type StateBundle struct {
	SchemaVersion  string               `json:"schema_version"`
	ExportedAt     time.Time            `json:"exported_at"`
	Sources        []SourceState        `json:"sources"`
	SteerRules     []SteerRuleState     `json:"steer_rules"`
	ResonatedItems []ResonatedItemState `json:"resonated_items"`
}

// SourceState is the portable active Source Ledger row shape.
type SourceState struct {
	ID    string `json:"id"`
	URL   string `json:"url"`
	Title string `json:"title"`
}

// SteerRuleState is the portable current active steering policy shape.
type SteerRuleState struct {
	ID       string `json:"id"`
	RuleText string `json:"rule_text"`
}

// ResonatedItemState is the portable current resonance shape.
type ResonatedItemState struct {
	ItemID    string  `json:"item_id"`
	URL       string  `json:"url"`
	SourceURL string  `json:"source_url"`
	Title     *string `json:"title"`
}

// ExportState writes the validated current-state bundle as JSON. It must not
// include runtime_metadata, agent_receipts, deleted tombstones, inactive rules,
// search indexes, command history, reading history, or sync metadata.
func ExportState(ctx context.Context, db *sql.DB, w io.Writer) error {
	panic("TODO contract stub: export portable state bundle")
}

// ImportState validates the JSON state bundle before writing and then replaces
// local portable active state in one transaction. It must not merge, preserve
// absent portable rows, or return conflict results.
func ImportState(ctx context.Context, db *sql.DB, r io.Reader) (RestoreResult, error) {
	panic("TODO contract stub: import portable state bundle")
}

// ValidateStateBundle enforces schema_version, required field shapes, duplicate
// id/item_id rejection, and unknown top-level-field rejection before import.
func ValidateStateBundle(r io.Reader) (StateBundle, error) {
	panic("TODO contract stub: validate portable state bundle")
}
