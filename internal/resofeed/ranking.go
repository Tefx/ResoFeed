package resofeed

import (
	"context"
	"database/sql"
	"time"
)

// RankingOptions define feed candidate limits only. Contract guardrails are
// authoritative over any future scoring formula.
type RankingOptions struct {
	Limit int
	Now   time.Time
}

// ListTodayFeed returns candidates for GET /api/feed/today and MCP
// list_candidate_items. Ranking must protect freshness, cap older resonated
// memory candidates, preserve source coverage, suppress already externally
// surfaced items unless new related developments exist, and keep duplicates
// transparently retrievable.
func ListTodayFeed(ctx context.Context, db *sql.DB, opts RankingOptions) ([]ItemSummary, error) {
	panic("TODO contract stub: rank today feed")
}

// ApplySteering accepts natural-language steering and RSS URL subscription
// commands. Gemini may propose structured changes, but Go validates and applies
// them in one SQLite transaction.
func ApplySteering(ctx context.Context, db *sql.DB, gemini GeminiClient, req SteerRequest) (SteerResult, error) {
	panic("TODO contract stub: apply steering")
}

// MarkItemInspected records deliberate human attention. Agent silent evaluation
// must not call this contract.
func MarkItemInspected(ctx context.Context, db *sql.DB, itemID string, req InspectRequest) (InspectResult, error) {
	panic("TODO contract stub: mark item inspected")
}

// SetItemResonance toggles durable memory state. Resonance improves retrieval
// but must not permanently pin old items into daily attention.
func SetItemResonance(ctx context.Context, db *sql.DB, itemID string, req ResonanceRequest) (ResonanceResult, error) {
	panic("TODO contract stub: set item resonance")
}
