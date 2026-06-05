package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRuntimeMetadataProcessingLanguageDefaultsAndValidation(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	info, err := GetProcessingLanguage(ctx, db)
	if err != nil {
		t.Fatalf("GetProcessingLanguage default: %v", err)
	}
	if info.Code != ProcessingLanguageEnglish || info.Label != "English" {
		t.Fatalf("default language = %+v, want en/English", info)
	}

	response, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{
		Language: ProcessingLanguageChinese,
		MutationRequestFields: MutationRequestFields{
			ActorKind:      ActorKindHuman,
			ActorID:        "owner",
			IdempotencyKey: "runtime-language-set-zh",
		},
	})
	if err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}
	if response.AlreadyApplied || response.Language.Code != ProcessingLanguageChinese || response.Language.Label != "中文" {
		t.Fatalf("set language response = %+v, want fresh zh/中文", response)
	}

	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{
		Language:              "",
		MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "runtime-language-invalid"},
	}); !isFieldError(err, "language", "") {
		t.Fatalf("invalid/empty language err = %v, want language field error", err)
	}

	if err := setSearchFTSStaleSince(ctx, db, time.Date(2026, 5, 9, 14, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("set stale marker: %v", err)
	}
	if err := clearSearchFTSStaleSince(ctx, db); err != nil {
		t.Fatalf("clear stale marker: %v", err)
	}
	var marker string
	err = db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, RuntimeMetadataKeySearchFTSStaleSince).Scan(&marker)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("stale marker after clear err=%v value=%q, want sql.ErrNoRows", err, marker)
	}
}

func TestRuntimeMetadataStateExportImportExcludesMetadataAndReceipts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_export_runtime', 'https://runtime.example/feed.xml', 'Runtime Export', ?, 'ok', 1, 1)`, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("seed source: %v", err)
	}
	if err := storeRuntimeMetadata(ctx, db, RuntimeMetadataKeyProcessingLanguage, string(ProcessingLanguageChinese)); err != nil {
		t.Fatalf("store language metadata: %v", err)
	}
	if err := setSearchFTSStaleSince(ctx, db, time.Date(2026, 5, 9, 14, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("store stale marker: %v", err)
	}
	var receiptTarget map[string]string
	if _, err := withIdempotencyReceipt(ctx, db, "export-runtime-receipt", "owner", "test_export", "", map[string]string{"request": "one"}, &receiptTarget, func() (map[string]string, error) {
		return map[string]string{"result": "stored"}, nil
	}); err != nil {
		t.Fatalf("seed receipt: %v", err)
	}

	var exported bytes.Buffer
	if err := ExportState(ctx, db, &exported); err != nil {
		t.Fatalf("ExportState: %v", err)
	}
	for _, forbidden := range []string{"runtime_metadata", RuntimeMetadataKeyProcessingLanguage, RuntimeMetadataKeySearchFTSStaleSince, "agent_receipts", "request_fingerprint", "export-runtime-receipt"} {
		if strings.Contains(exported.String(), forbidden) {
			t.Fatalf("state export leaked %q: %s", forbidden, exported.String())
		}
	}
}

func TestSetProcessingLanguageUsesGlobalGuardWhileHeavyOperationsRemainGuarded(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	release, err := tryAcquireIngestGuard(ctx, "ingest", "all")
	if err != nil {
		t.Fatalf("precondition: operation guard already held: %v", err)
	}
	guardHeld := true
	t.Cleanup(func() {
		if guardHeld {
			release()
		}
	})

	req := SetProcessingLanguageRequest{
		Language: ProcessingLanguageChinese,
		MutationRequestFields: MutationRequestFields{
			ActorKind:      ActorKindHuman,
			ActorID:        "owner",
			IdempotencyKey: "language-blocked-by-active-operation",
		},
	}
	if _, err := ManualIngest(ctx, db, IngestConfig{}); !errors.Is(err, errManualFetchConflict) {
		t.Fatalf("ManualIngest while guard held err=%v, want conflict", err)
	}
	if _, err := ManualFetchSource(ctx, db, IngestConfig{}, "src_missing"); !errors.Is(err, errManualFetchConflict) {
		t.Fatalf("ManualFetchSource while guard held err=%v, want conflict", err)
	}
	if _, err := reprocessLibraryFresh(ctx, db, nil); !errors.Is(err, errManualFetchConflict) {
		t.Fatalf("reprocessLibraryFresh while guard held err=%v, want conflict", err)
	}
	if _, err := SetProcessingLanguage(ctx, db, req); !errors.Is(err, errManualFetchConflict) {
		t.Fatalf("SetProcessingLanguage while guard held err=%v, want conflict", err)
	}
	var stored string
	err = db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, RuntimeMetadataKeyProcessingLanguage).Scan(&stored)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("processing language while operation guard held value=%q err=%v, want no write", stored, err)
	}

	release()
	guardHeld = false
	resp, err := SetProcessingLanguage(ctx, db, req)
	if err != nil {
		t.Fatalf("SetProcessingLanguage after guard release: %v", err)
	}
	if resp.Language.Code != ProcessingLanguageChinese || resp.AlreadyApplied {
		t.Fatalf("SetProcessingLanguage after guard release response=%+v, want fresh zh", resp)
	}
	resp, err = SetProcessingLanguage(ctx, db, req)
	if err != nil {
		t.Fatalf("SetProcessingLanguage replay after successful write: %v", err)
	}
	if resp.Language.Code != ProcessingLanguageChinese || !resp.AlreadyApplied {
		t.Fatalf("SetProcessingLanguage replay after successful write response=%+v, want replayed zh", resp)
	}
}

func TestReceiptLiveTTLReplayMismatchAndExpiredReplacement(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	var applied int32
	var first map[string]any
	replayed, err := withIdempotencyReceipt(ctx, db, "receipt-live-ttl", "owner", "test_op", "", map[string]string{"value": "one"}, &first, func() (map[string]any, error) {
		atomic.AddInt32(&applied, 1)
		return map[string]any{"value": "one"}, nil
	})
	if err != nil || replayed {
		t.Fatalf("first receipt replayed=%v err=%v", replayed, err)
	}
	var replay map[string]any
	replayed, err = withIdempotencyReceipt(ctx, db, "receipt-live-ttl", "owner", "test_op", "", map[string]string{"value": "one"}, &replay, func() (map[string]any, error) {
		atomic.AddInt32(&applied, 1)
		return map[string]any{"value": "unexpected"}, nil
	})
	if err != nil || !replayed || replay["value"] != "one" || atomic.LoadInt32(&applied) != 1 {
		t.Fatalf("live replay replayed=%v err=%v replay=%v applied=%d", replayed, err, replay, applied)
	}

	var mismatch map[string]any
	_, err = withIdempotencyReceipt(ctx, db, "receipt-live-ttl", "owner", "test_op", "", map[string]string{"value": "two"}, &mismatch, func() (map[string]any, error) {
		atomic.AddInt32(&applied, 1)
		return map[string]any{"value": "two"}, nil
	})
	if !isFieldError(err, "idempotency_key", "request_fingerprint_mismatch") || atomic.LoadInt32(&applied) != 1 {
		t.Fatalf("mismatch err=%v applied=%d, want fingerprint mismatch without apply", err, applied)
	}

	if _, err := db.ExecContext(ctx, `update agent_receipts set created_at = ? where idempotency_key = ?`, time.Now().UTC().Add(-ReceiptLiveTTL-time.Minute).Format(time.RFC3339), "receipt-live-ttl"); err != nil {
		t.Fatalf("expire receipt: %v", err)
	}
	var replacement map[string]any
	replayed, err = withIdempotencyReceipt(ctx, db, "receipt-live-ttl", "owner", "test_op", "", map[string]string{"value": "two"}, &replacement, func() (map[string]any, error) {
		atomic.AddInt32(&applied, 1)
		return map[string]any{"value": "two"}, nil
	})
	if err != nil || replayed || replacement["value"] != "two" || atomic.LoadInt32(&applied) != 2 {
		t.Fatalf("expired replacement replayed=%v err=%v replacement=%v applied=%d", replayed, err, replacement, applied)
	}
	assertReceiptCount(t, ctx, db, "receipt-live-ttl", 1)
}

func TestReceiptConcurrentReuseSerializesSingleApply(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	var applied int32
	const callers = 8
	var wg sync.WaitGroup
	errs := make(chan error, callers)
	replays := make(chan bool, callers)

	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var target map[string]int32
			replayed, err := withIdempotencyReceipt(ctx, db, "receipt-concurrent", "agent", "test_concurrent", "", map[string]string{"value": "same"}, &target, func() (map[string]int32, error) {
				value := atomic.AddInt32(&applied, 1)
				return map[string]int32{"applied": value}, nil
			})
			if err != nil {
				errs <- err
				return
			}
			if target["applied"] != 1 {
				errs <- errors.New("concurrent receipt returned non-canonical snapshot")
				return
			}
			replays <- replayed
		}()
	}
	wg.Wait()
	close(errs)
	close(replays)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent receipt error: %v", err)
		}
	}
	var replayCount int
	for replayed := range replays {
		if replayed {
			replayCount++
		}
	}
	if atomic.LoadInt32(&applied) != 1 || replayCount != callers-1 {
		t.Fatalf("concurrent apply count=%d replayCount=%d, want 1/%d", applied, replayCount, callers-1)
	}
	assertReceiptCount(t, ctx, db, "receipt-concurrent", 1)
}

func isFieldError(err error, field string, reason string) bool {
	var fieldErr mcpFieldError
	if !errors.As(err, &fieldErr) {
		return false
	}
	return fieldErr.field == field && fieldErr.reason == reason
}
