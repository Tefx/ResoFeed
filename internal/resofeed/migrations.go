package resofeed

import (
	"context"
	"database/sql"
)

// RunMigrations applies startup SQLite migrations before HTTP, MCP, or ingest
// begins. The schema is current-state storage only: sources, items, item_state,
// steer_rules, agent_receipts, search_fts, and runtime_metadata.
func RunMigrations(ctx context.Context, db *sql.DB) error {
	panic("TODO contract stub: run SQLite migrations")
}

// Migration identifies one SQLite migration contract artifact.
type Migration struct {
	ID  string
	SQL string
}

// Migrations returns the ordered migration declarations. Bodies are contract
// placeholders; implementation must not invent vector columns, sync ledgers, or
// account/agent-registry schemas.
func Migrations() []Migration {
	panic("TODO contract stub: declare SQLite migrations")
}
