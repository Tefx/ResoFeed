package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRFBUG001ConcurrentFirstRunInspectionNoSQLiteBusy(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db := newContractDB(t, ctx)
	seedRFBUG001InspectionItems(t, ctx, db)

	var journalMode string
	if err := db.QueryRowContext(ctx, `pragma journal_mode`).Scan(&journalMode); err != nil {
		t.Fatalf("read journal mode: %v", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("journal mode = %q, want wal", journalMode)
	}

	// Keep the first large detail read transaction open while the same fresh
	// database serves two detail reads and two inspection writes. This models the
	// real first-run Inspector seam without timing sleeps or contention retries.
	readTx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatalf("begin long detail read: %v", err)
	}
	defer func() { _ = readTx.Rollback() }()
	var largeDetail string
	if err := readTx.QueryRowContext(ctx, `select extracted_text from items where id = 'item_rfbug001_a'`).Scan(&largeDetail); err != nil {
		t.Fatalf("read large first detail: %v", err)
	}
	if len(largeDetail) < 4_000_000 {
		t.Fatalf("large detail bytes = %d, want at least 4000000", len(largeDetail))
	}

	const ownerToken = "rfbug001-owner-token-32-characters-minimum"
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: ownerToken})
	requests := []*http.Request{
		rfbug001Request(t, ctx, ownerToken, http.MethodGet, "item_rfbug001_a", "", nil),
		rfbug001Request(t, ctx, ownerToken, http.MethodPost, "item_rfbug001_a", "/inspect", []byte(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"rfbug001-inspect-a"}`)),
		rfbug001Request(t, ctx, ownerToken, http.MethodGet, "item_rfbug001_b", "", nil),
		rfbug001Request(t, ctx, ownerToken, http.MethodPost, "item_rfbug001_b", "/inspect", []byte(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"rfbug001-inspect-b"}`)),
	}

	start := make(chan struct{})
	statuses := make([]int, len(requests))
	bodies := make([]string, len(requests))
	var wg sync.WaitGroup
	for i, req := range requests {
		wg.Add(1)
		go func(index int, request *http.Request) {
			defer wg.Done()
			<-start
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			statuses[index] = recorder.Code
			bodies[index] = recorder.Body.String()
		}(i, req)
	}
	close(start)
	wg.Wait()

	for i, status := range statuses {
		if status != http.StatusOK {
			t.Fatalf("response %d status = %d body=%s, want 200 without SQLite contention", i+1, status, bodies[i])
		}
	}
	if err := readTx.Commit(); err != nil {
		t.Fatalf("commit long detail read: %v", err)
	}

	var inspected, receipts int
	if err := db.QueryRowContext(ctx, `select count(*) from item_state where item_id in ('item_rfbug001_a', 'item_rfbug001_b') and human_inspected_at is not null`).Scan(&inspected); err != nil {
		t.Fatalf("count inspection state: %v", err)
	}
	if err := db.QueryRowContext(ctx, `select count(*) from agent_receipts where idempotency_key in ('rfbug001-inspect-a', 'rfbug001-inspect-b')`).Scan(&receipts); err != nil {
		t.Fatalf("count inspection receipts: %v", err)
	}
	if inspected != 2 || receipts != 2 {
		t.Fatalf("inspection state=%d receipts=%d, want 2 and 2", inspected, receipts)
	}
}

func seedRFBUG001InspectionItems(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Date(2026, 7, 17, 6, 0, 0, 0, time.UTC).Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_rfbug001', 'https://rfbug001.example.test/feed.xml', 'RF BUG Source', ?, 'ok', 1, 1)`, now); err != nil {
		t.Fatalf("seed source: %v", err)
	}
	for _, itemID := range []string{"item_rfbug001_a", "item_rfbug001_b"} {
		detail := "Readable detail " + itemID
		if itemID == "item_rfbug001_a" {
			detail += " " + strings.Repeat("A", 4_000_000)
		}
		if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, extracted_text, first_seen_at, extraction_status, model_status) values (?, 'src_rfbug001', 'https://rfbug001.example.test/feed.xml', ?, ?, ?, ?, ?, ?, ?, 'full', 'ok')`, itemID, "https://rfbug001.example.test/"+itemID, "https://rfbug001.example.test/"+itemID, "RF BUG "+itemID, "Readable summary "+itemID, "Readable insight "+itemID, detail, now); err != nil {
			t.Fatalf("seed item %s: %v", itemID, err)
		}
	}
}

func rfbug001Request(t *testing.T, ctx context.Context, ownerToken string, method string, itemID string, suffix string, body []byte) *http.Request {
	t.Helper()
	token := "~" + base64.RawURLEncoding.EncodeToString([]byte(itemID))
	req, err := http.NewRequestWithContext(ctx, method, "/api/items/"+token+suffix, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create %s request for %s: %v", method, itemID, err)
	}
	req.Header.Set("Authorization", "Bearer "+ownerToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req
}
