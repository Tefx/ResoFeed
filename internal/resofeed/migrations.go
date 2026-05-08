package resofeed

import (
	"context"
	"database/sql"
	"fmt"
)

// RunMigrations applies startup SQLite migrations before HTTP, MCP, or ingest
// begins. The schema is current-state storage only: sources, items, item_state,
// steer_rules, agent_receipts, search_fts, and runtime_metadata.
func RunMigrations(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return fmt.Errorf("run migrations: db required")
	}
	if _, err := db.ExecContext(ctx, `create table if not exists schema_migrations (id text primary key, applied_at integer not null)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migrations: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	for _, migration := range Migrations() {
		var seen int
		err := tx.QueryRowContext(ctx, `select 1 from schema_migrations where id = ?`, migration.ID).Scan(&seen)
		if err == nil {
			continue
		}
		if err != sql.ErrNoRows {
			return fmt.Errorf("check migration %s: %w", migration.ID, err)
		}
		if _, err := tx.ExecContext(ctx, migration.SQL); err != nil {
			return fmt.Errorf("apply migration %s: %w", migration.ID, err)
		}
		if _, err := tx.ExecContext(ctx, `insert into schema_migrations (id, applied_at) values (?, unixepoch())`, migration.ID); err != nil {
			return fmt.Errorf("record migration %s: %w", migration.ID, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migrations: %w", err)
	}
	return nil
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
	return []Migration{
		{
			ID: "001_current_state_schema",
			SQL: `
create table if not exists sources (
  id text primary key,
  url text not null unique,
  title text not null,
  created_at text not null,
  last_fetch_at text,
  last_fetch_status text not null default 'not_fetched',
  last_fetch_error text,
  is_active integer not null default 1 check (is_active in (0, 1)),
  revision integer not null default 1
);

create table if not exists items (
  id text primary key,
  source_id text not null,
  source_url text,
  url text not null,
  canonical_url text,
  title text not null,
  feed_excerpt text,
  extracted_text text,
  summary text,
  core_insight text,
  value_tier text,
  published_at text,
  first_seen_at text not null,
  extraction_status text not null default 'summary_unavailable',
  model_status text not null default 'summary_unavailable',
  story_key text,
  duplicate_of_item_id text
);

create table if not exists item_state (
  item_id text primary key,
  is_resonated integer not null default 0 check (is_resonated in (0, 1)),
  human_inspected_at text,
  external_surfaced_at text,
  last_actor_kind text,
  last_actor_id text
);

create table if not exists steer_rules (
  id text primary key,
  rule_text text not null,
  is_active integer not null default 1 check (is_active in (0, 1)),
  superseded_by text,
  created_at text not null,
  revision integer not null default 1
);

create table if not exists agent_receipts (
  idempotency_key text primary key,
  actor_id text not null,
  operation text not null,
  item_id text,
  created_at text not null,
  result_snapshot text not null
);

create table if not exists runtime_metadata (
  key text primary key,
  value text not null,
  updated_at integer not null
);

create virtual table if not exists search_fts using fts5(
  item_id unindexed,
  title,
  source_title,
  feed_excerpt,
  summary,
  extracted_text,
  provenance
);
`,
		},
	}
}
