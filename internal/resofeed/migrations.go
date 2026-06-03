package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
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
	if err := repairPersistedReadableText(ctx, db); err != nil {
		return fmt.Errorf("repair persisted readable text: %w", err)
	}
	return nil
}

func repairPersistedReadableText(ctx context.Context, db *sql.DB) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("readable text repair: %w", err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin readable text repair: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	rows, err := tx.QueryContext(ctx, `
select id, feed_excerpt, extracted_text, summary, core_insight, key_points
from items
where instr(coalesce(feed_excerpt, '') || coalesce(extracted_text, '') || coalesce(summary, '') || coalesce(core_insight, ''), '\n') > 0
   or instr(coalesce(feed_excerpt, '') || coalesce(extracted_text, '') || coalesce(summary, '') || coalesce(core_insight, ''), '\r') > 0
   or instr(coalesce(key_points, ''), '\\n') > 0
   or instr(coalesce(key_points, ''), '\\r') > 0`)
	if err != nil {
		return fmt.Errorf("query readable text repair rows: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	type readableRepairRow struct {
		id            string
		feedExcerpt   sql.NullString
		extractedText sql.NullString
		summary       sql.NullString
		coreInsight   sql.NullString
		keyPoints     sql.NullString
	}
	var pending []readableRepairRow
	for rows.Next() {
		var row readableRepairRow
		if err := rows.Scan(&row.id, &row.feedExcerpt, &row.extractedText, &row.summary, &row.coreInsight, &row.keyPoints); err != nil {
			return fmt.Errorf("scan readable text repair row: %w", err)
		}
		pending = append(pending, row)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate readable text repair rows: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close readable text repair rows: %w", err)
	}

	anyChanged := false
	for _, row := range pending {
		feedExcerpt, feedChanged := sanitizeReadableSQLString(row.feedExcerpt, sanitizeReadablePayloadPointer)
		extractedText, extractedChanged := sanitizeReadableSQLString(row.extractedText, sanitizeReadablePayloadPointer)
		summary, summaryChanged := sanitizeReadableSQLString(row.summary, sanitizeReadablePayloadPointer)
		coreInsight, coreChanged := sanitizeReadableSQLString(row.coreInsight, sanitizeReadableInsightPointer)
		keyPoints, keyPointsChanged := sanitizeReadableKeyPointsJSONString(row.keyPoints)
		if !feedChanged && !extractedChanged && !summaryChanged && !coreChanged && !keyPointsChanged {
			continue
		}
		if _, err := tx.ExecContext(ctx, `update items set feed_excerpt = ?, extracted_text = ?, summary = ?, core_insight = ?, key_points = ? where id = ?`, feedExcerpt, extractedText, summary, coreInsight, keyPoints, row.id); err != nil {
			return fmt.Errorf("update readable text repair row %s: %w", row.id, err)
		}
		anyChanged = true
	}
	if anyChanged {
		if err := rebuildSearchIndexTx(ctx, tx); err != nil {
			return fmt.Errorf("rebuild readable text repair search index: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit readable text repair: %w", err)
	}
	return nil
}

func sanitizeReadableSQLString(value sql.NullString, sanitize func(*string) (*string, bool)) (any, bool) {
	if !value.Valid {
		return nil, false
	}
	cleaned, changed := sanitize(&value.String)
	if cleaned == nil {
		return nil, changed
	}
	return *cleaned, changed
}

func sanitizeReadableKeyPointsJSONString(value sql.NullString) (any, bool) {
	if !value.Valid {
		return nil, false
	}
	var points []string
	if err := json.Unmarshal([]byte(value.String), &points); err != nil {
		return value.String, false
	}
	changed := false
	cleaned := make([]string, 0, len(points))
	for _, point := range points {
		point := point
		cleanedPoint, pointChanged := sanitizeReadablePayloadPointer(&point)
		changed = changed || pointChanged
		if cleanedPoint == nil {
			continue
		}
		cleaned = append(cleaned, *cleanedPoint)
	}
	if !changed {
		return value.String, false
	}
	encoded, err := json.Marshal(cleaned)
	if err != nil {
		return value.String, false
	}
	return string(encoded), true
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
  created_by_actor_kind text not null default 'human',
  created_by_actor_id text,
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
  core_insight,
  extracted_text,
  provenance
);
`,
		},
		{
			ID:  "002_agent_receipts_request_fingerprint",
			SQL: `alter table agent_receipts add column request_fingerprint text;`,
		},
		{
			ID: "003_search_fts_core_insight",
			SQL: `
drop table if exists search_fts;
create virtual table search_fts using fts5(
  item_id unindexed,
  title,
  source_title,
  feed_excerpt,
  summary,
  core_insight,
  extracted_text,
  provenance
);
insert into search_fts (item_id, title, source_title, feed_excerpt, summary, core_insight, extracted_text, provenance)
select i.id, i.title, coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, '') || ' ' || coalesce(i.value_tier, ''), coalesce(i.core_insight, ''), coalesce(i.extracted_text, ''),
       coalesce(i.source_url, s.url, '') || ' ' || coalesce(i.url, '') || ' ' || coalesce(i.canonical_url, '') || ' ' || coalesce(i.story_key, '') || ' ' || coalesce(i.duplicate_of_item_id, '') || ' ' || coalesce(i.value_tier, '')
from items i
left join sources s on s.id = i.source_id;
`,
		},
		{
			ID: "004_content_contract_redesign_fields",
			SQL: `
alter table items add column source_item_title text;
alter table items add column localized_title text;
alter table items add column key_points text;
alter table items add column content_status text;
alter table items add column last_reprocess_status text;
alter table items add column last_reprocess_error_code text;
alter table items add column last_reprocess_error_message text;
alter table items add column last_reprocess_at text;
update items
set source_item_title = coalesce(source_item_title, title),
    localized_title = coalesce(localized_title, title),
    key_points = coalesce(key_points, '[]'),
    content_status = coalesce(content_status, model_status);
drop table if exists search_fts;
create virtual table search_fts using fts5(
  item_id unindexed,
  title,
  source_item_title,
  localized_title,
  source_title,
  feed_excerpt,
  summary,
  core_insight,
  key_points,
  extracted_text,
  provenance
);
insert into search_fts (item_id, title, source_item_title, localized_title, source_title, feed_excerpt, summary, core_insight, key_points, extracted_text, provenance)
select i.id, i.title, coalesce(i.source_item_title, i.title, ''), coalesce(i.localized_title, i.title, ''), coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, '') || ' ' || coalesce(i.value_tier, ''), coalesce(i.core_insight, ''), coalesce(i.key_points, ''), coalesce(i.extracted_text, ''),
       coalesce(i.source_url, s.url, '') || ' ' || coalesce(i.url, '') || ' ' || coalesce(i.canonical_url, '') || ' ' || coalesce(i.story_key, '') || ' ' || coalesce(i.duplicate_of_item_id, '') || ' ' || coalesce(i.value_tier, '')
from items i
left join sources s on s.id = i.source_id;
`,
		},
	}
}
