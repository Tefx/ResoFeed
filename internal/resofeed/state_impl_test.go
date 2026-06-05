package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestOpenDBCreatesMissingParentAndOwnerTokenMetadataIsRuntimeOnly(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "nested", "resofeed.sqlite3")
	db, err := OpenDB(ctx, dbPath)
	if err != nil {
		t.Fatalf("OpenDB returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close db: %v", err)
		}
	})
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("RunMigrations returned error: %v", err)
	}

	resolution, err := ResolveOwnerToken(ctx, db, contractOwnerToken)
	if err != nil {
		t.Fatalf("ResolveOwnerToken explicit returned error: %v", err)
	}
	if !resolution.WasExplicit || resolution.TokenHash == "" || resolution.GeneratedPlaintextToken != "" {
		t.Fatalf("unexpected explicit token resolution: %+v", resolution)
	}

	var exported bytes.Buffer
	if err := ExportState(ctx, db, &exported); err != nil {
		t.Fatalf("ExportState returned error: %v", err)
	}
	if strings.Contains(exported.String(), "owner_token_sha256") || strings.Contains(exported.String(), "runtime_metadata") {
		t.Fatalf("export leaked runtime metadata: %s", exported.String())
	}
}

func TestImportStateRollsBackWhenTransactionFails(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	if _, err := ImportState(ctx, db, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[{"id":"keep","url":"https://keep.example/feed.xml","title":"Keep"}],"steer_rules":[],"resonated_items":[]}`)); err != nil {
		t.Fatalf("initial ImportState returned error: %v", err)
	}
	if _, err := db.ExecContext(ctx, `create trigger fail_new_active_source before insert on sources when new.id = 'new_active' begin select raise(abort, 'forced restore failure'); end`); err != nil {
		t.Fatalf("create failure trigger: %v", err)
	}

	_, err := ImportState(ctx, db, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[{"id":"new_active","url":"https://new.example/feed.xml","title":"New"}],"steer_rules":[],"resonated_items":[]}`))
	if err == nil {
		t.Fatal("ImportState succeeded despite forced transaction failure")
	}

	var isActive int
	if err := db.QueryRowContext(ctx, `select is_active from sources where id = 'keep'`).Scan(&isActive); err != nil {
		t.Fatalf("read original source after failed import: %v", err)
	}
	if isActive != 1 {
		t.Fatalf("original source is_active = %d, want 1 after rollback", isActive)
	}
}

func TestImportStateUsesGlobalGuardAndPreservesExistingStateOnConflict(t *testing.T) {
	resetIngestCoordinatorForTest(t)
	ctx := context.Background()
	db := newContractDB(t, ctx)

	if _, err := ImportState(ctx, db, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[{"id":"keep","url":"https://keep.example/feed.xml","title":"Keep"}],"steer_rules":[],"resonated_items":[]}`)); err != nil {
		t.Fatalf("initial ImportState returned error: %v", err)
	}

	release, err := tryAcquireIngestGuardWithActor(ctx, "fetch", "src_active_restore_blocker", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("hold active source guard: %v", err)
	}
	defer release()

	_, err = ImportState(ctx, db, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[{"id":"new_active","url":"https://new.example/feed.xml","title":"New"}],"steer_rules":[],"resonated_items":[]}`))
	if err == nil {
		t.Fatal("ImportState succeeded while source work was active")
	}
	if !errors.Is(err, errManualFetchConflict) {
		t.Fatalf("ImportState error = %v, want guard conflict", err)
	}
	details, ok := guardConflictDetails(err)
	if !ok || details.Reason != ingestConflictReasonGlobalOperationRunning {
		t.Fatalf("ImportState conflict details = %+v ok=%t, want reason=%s", details, ok, ingestConflictReasonGlobalOperationRunning)
	}

	var keptTitle string
	if err := db.QueryRowContext(ctx, `select title from sources where id = 'keep' and is_active = 1`).Scan(&keptTitle); err != nil {
		t.Fatalf("read original source after guarded import: %v", err)
	}
	if keptTitle != "Keep" {
		t.Fatalf("original source title = %q, want Keep", keptTitle)
	}
	var importedCount int
	if err := db.QueryRowContext(ctx, `select count(*) from sources where id = 'new_active'`).Scan(&importedCount); err != nil {
		t.Fatalf("count blocked import source: %v", err)
	}
	if importedCount != 0 {
		t.Fatalf("blocked import inserted %d new_active rows, want 0", importedCount)
	}
}

func TestResolveOwnerTokenRejectsInvalidWithoutReplacingStoredHash(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	resolution, err := ResolveOwnerToken(ctx, db, contractOwnerToken)
	if err != nil {
		t.Fatalf("ResolveOwnerToken explicit returned error: %v", err)
	}
	_, err = ResolveOwnerToken(ctx, db, " short-token-with-leading-space")
	if err == nil {
		t.Fatal("ResolveOwnerToken accepted invalid explicit token")
	}

	var stored string
	if err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = 'owner_token_sha256'`).Scan(&stored); err != nil && err != sql.ErrNoRows {
		t.Fatalf("read stored owner token hash: %v", err)
	}
	if stored != resolution.TokenHash {
		t.Fatalf("stored hash changed after invalid token: got %q want %q", stored, resolution.TokenHash)
	}
}
