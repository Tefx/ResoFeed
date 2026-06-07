package resofeed

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTavilySourceEvidenceMigrationColumnsDefaultAndCheck(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	columns := readMigrationColumnInfo(t, ctx, db, "items")
	extractionSource, ok := columns["extraction_source"]
	if !ok {
		t.Fatal("items.extraction_source column missing")
	}
	if strings.ToLower(extractionSource.typ) != "text" || extractionSource.notNull != 1 || extractionSource.defaultValue != "'none'" {
		t.Fatalf("items.extraction_source pragma = type:%q notnull:%d default:%q, want text not null default 'none'", extractionSource.typ, extractionSource.notNull, extractionSource.defaultValue)
	}
	sourceEvidence, ok := columns["source_evidence_text"]
	if !ok {
		t.Fatal("items.source_evidence_text column missing")
	}
	if strings.ToLower(sourceEvidence.typ) != "text" || sourceEvidence.notNull != 0 || sourceEvidence.defaultValue != "" {
		t.Fatalf("items.source_evidence_text pragma = type:%q notnull:%d default:%q, want nullable text with no default", sourceEvidence.typ, sourceEvidence.notNull, sourceEvidence.defaultValue)
	}

	seedSource(t, ctx, db, "src_tavily_schema_default", "https://tavily-schema.example/feed.xml", "Tavily Schema Source")
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, feed_excerpt, extracted_text, first_seen_at, extraction_status, model_status) values ('item_tavily_schema_default', 'src_tavily_schema_default', 'https://tavily-schema.example/feed.xml', 'https://tavily-schema.example/item', 'Tavily schema default', 'legacy RSS excerpt must not drive default', 'legacy generated text must not drive default', ?, 'full', 'ok')`, now); err != nil {
		t.Fatalf("insert item without source evidence columns: %v", err)
	}

	var source string
	var evidenceNil int
	if err := db.QueryRowContext(ctx, `select extraction_source, case when source_evidence_text is null then 1 else 0 end from items where id = 'item_tavily_schema_default'`).Scan(&source, &evidenceNil); err != nil {
		t.Fatalf("read default source evidence columns: %v", err)
	}
	if source != "none" || evidenceNil != 1 {
		t.Fatalf("default source evidence columns = source:%q evidence_nil:%d, want none/null", source, evidenceNil)
	}

	if _, err := db.ExecContext(ctx, `update items set extraction_source = 'stored_extracted_text' where id = 'item_tavily_schema_default'`); err == nil {
		t.Fatal("invalid extraction_source update succeeded, want CHECK constraint failure")
	}
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, first_seen_at, extraction_status, model_status, extraction_source) values ('item_tavily_schema_invalid', 'src_tavily_schema_default', 'https://tavily-schema.example/feed.xml', 'https://tavily-schema.example/invalid', 'Invalid source', ?, 'full', 'ok', 'legacy_generated')`, now); err == nil {
		t.Fatal("invalid extraction_source insert succeeded, want CHECK constraint failure")
	}
}

func TestTavilySourceEvidenceMigrationBackfillsOldRowsConservatively(t *testing.T) {
	ctx := context.Background()
	db, err := OpenDB(ctx, filepath.Join(t.TempDir(), "old-tavily-source-evidence.sqlite3"))
	if err != nil {
		t.Fatalf("OpenDB old schema: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close old db: %v", err)
		}
	})

	if _, err := db.ExecContext(ctx, `create table schema_migrations (id text primary key, applied_at integer not null)`); err != nil {
		t.Fatalf("create old schema_migrations: %v", err)
	}
	for _, migration := range Migrations()[:4] {
		if _, err := db.ExecContext(ctx, migration.SQL); err != nil {
			t.Fatalf("apply old migration %s: %v", migration.ID, err)
		}
		if _, err := db.ExecContext(ctx, `insert into schema_migrations (id, applied_at) values (?, unixepoch())`, migration.ID); err != nil {
			t.Fatalf("record old migration %s: %v", migration.ID, err)
		}
	}

	seedSource(t, ctx, db, "src_tavily_old_schema", "https://tavily-old.example/feed.xml", "Tavily Old Source")
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, source_item_title, localized_title, summary, core_insight, key_points, feed_excerpt, extracted_text, value_tier, content_status, first_seen_at, extraction_status, model_status) values ('item_tavily_old_schema', 'src_tavily_old_schema', 'https://tavily-old.example/feed.xml', 'https://tavily-old.example/item', 'Old generated title', 'Old RSS title', 'Old generated title', 'Old generated summary must not become source evidence', 'Old generated insight must not become source evidence', '[]', 'Old RSS excerpt must not become source evidence', 'Old generated extracted text must not become source evidence', 'brief', 'ok', ?, 'full', 'ok')`, now); err != nil {
		t.Fatalf("seed old-schema item: %v", err)
	}

	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("RunMigrations old schema: %v", err)
	}

	var source string
	var sourceEvidence sql.NullString
	if err := db.QueryRowContext(ctx, `select extraction_source, source_evidence_text from items where id = 'item_tavily_old_schema'`).Scan(&source, &sourceEvidence); err != nil {
		t.Fatalf("read migrated source evidence columns: %v", err)
	}
	if source != "none" || sourceEvidence.Valid {
		t.Fatalf("migrated source evidence columns = source:%q evidence:%v, want none/null with no inference from legacy text", source, sourceEvidence)
	}
}

type migrationColumnInfo struct {
	typ          string
	notNull      int
	defaultValue string
}

func readMigrationColumnInfo(t *testing.T, ctx context.Context, db *sql.DB, table string) map[string]migrationColumnInfo {
	t.Helper()
	rows, err := db.QueryContext(ctx, `pragma table_info(`+table+`)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", table, err)
	}
	defer func() { _ = rows.Close() }()

	columns := make(map[string]migrationColumnInfo)
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan table_info(%s): %v", table, err)
		}
		columns[name] = migrationColumnInfo{typ: typ, notNull: notNull, defaultValue: defaultValue.String}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table_info(%s): %v", table, err)
	}
	return columns
}
