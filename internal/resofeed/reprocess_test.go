package resofeed

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReprocessLibraryAccountingSourcePrecedenceAndFTS(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	requests := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests[r.URL.Path]++
		switch r.URL.Path {
		case "/canonical-success":
			_, _ = io.WriteString(w, `<html><body><article>canonical body for success</article></body></html>`)
		case "/canonical-miss", "/unavailable":
			http.NotFound(w, r)
		case "/original-fallback":
			_, _ = io.WriteString(w, `<html><body><article>original body after canonical miss</article></body></html>`)
		case "/failed":
			_, _ = io.WriteString(w, `<html><body><article>body for model failure</article></body></html>`)
		case "/feed.xml":
			t.Fatalf("reprocess must not fetch source/feed URL")
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_reprocess", server.URL+"/feed.xml", "Reprocess Source")
	seedReprocessItem(t, ctx, db, "item_success", "src_reprocess", server.URL+"/original-unused", server.URL+"/canonical-success")
	seedReprocessItem(t, ctx, db, "item_fallback", "src_reprocess", server.URL+"/original-fallback", server.URL+"/canonical-miss")
	seedReprocessItem(t, ctx, db, "item_unavailable", "src_reprocess", server.URL+"/unavailable", "")
	seedReprocessItem(t, ctx, db, "item_failed", "src_reprocess", server.URL+"/failed", "")

	llm := &reprocessMatrixLLM{failURLSubstring: "/failed"}
	resp, err := ReprocessLibrary(ctx, db, llm, ReprocessLibraryRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "reprocess-matrix"}})
	if err != nil {
		t.Fatalf("ReprocessLibrary returned error: %v", err)
	}
	result := resp.Reprocess
	if result.Status != ReprocessStatusCompletedWithErrors || !result.FTSRebuilt || result.ItemsIndexed != 4 {
		t.Fatalf("result status/indexing = %+v, want completed_with_errors with rebuilt FTS and 4 indexed", result)
	}
	if result.ItemsAttempted != 4 || result.ItemsUpdated != 2 || result.ItemsUnavailable != 1 || result.ItemsFailed != 1 {
		t.Fatalf("result counts = %+v, want attempted=4 updated=2 unavailable=1 failed=1", result)
	}
	if result.ItemsAttempted != result.ItemsUpdated+result.ItemsUnavailable+result.ItemsFailed {
		t.Fatalf("attempted invariant broken: %+v", result)
	}
	if requests["/canonical-success"] != 1 || requests["/original-unused"] != 0 || requests["/canonical-miss"] != 1 || requests["/original-fallback"] != 1 || requests["/feed.xml"] != 0 {
		t.Fatalf("unexpected fetch precedence requests: %#v", requests)
	}
	for _, available := range llm.availableTexts {
		if strings.Contains(available, "PRIOR") {
			t.Fatalf("prior stored target-language field was used as source text: %q", available)
		}
	}

	success := readStoredText(t, ctx, db, "item_success")
	if success.title != "processed "+server.URL+"/canonical-success" || success.coreInsight != "core insight canonical body for success" {
		t.Fatalf("success item text = %+v", success)
	}
	fallback := readStoredText(t, ctx, db, "item_fallback")
	if fallback.title != "processed "+server.URL+"/original-fallback" || fallback.summary != "summary original body after canonical miss" {
		t.Fatalf("fallback item text = %+v", fallback)
	}
	assertClearedReprocessFields(t, ctx, db, "item_unavailable", server.URL+"/unavailable", extractionStatusOriginalNA, modelStatusSummaryNA)
	assertClearedReprocessFields(t, ctx, db, "item_failed", server.URL+"/failed", extractionStatusOriginalNA, modelStatusLatencyError)

	var staleCount int
	if err := db.QueryRowContext(ctx, `select count(*) from runtime_metadata where key = ?`, RuntimeMetadataKeySearchFTSStaleSince).Scan(&staleCount); err != nil {
		t.Fatalf("query stale marker: %v", err)
	}
	if staleCount != 0 {
		t.Fatalf("stale marker remained after successful rebuild")
	}
	var ftsCount int
	if err := db.QueryRowContext(ctx, `select count(*) from search_fts where search_fts match ?`, `"core insight canonical body"`).Scan(&ftsCount); err != nil {
		t.Fatalf("query FTS: %v", err)
	}
	if ftsCount != 1 {
		t.Fatalf("FTS core_insight match count = %d, want 1", ftsCount)
	}
}

func TestReprocessLibraryTimeoutLeavesStaleMarker(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(150 * time.Millisecond)
		_, _ = io.WriteString(w, `<html><body><article>too slow</article></body></html>`)
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_reprocess_timeout", server.URL+"/feed.xml", "Timeout Source")
	seedReprocessItem(t, ctx, db, "item_timeout", "src_reprocess_timeout", server.URL+"/slow", "")
	runCtx, cancel := context.WithTimeout(ctx, 20*time.Millisecond)
	defer cancel()
	resp, err := reprocessLibraryFresh(runCtx, db, &reprocessMatrixLLM{})
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if resp.Reprocess.Status != ReprocessStatusFailed || resp.Reprocess.FTSRebuilt || resp.Reprocess.ItemsIndexed != 0 || resp.Reprocess.ItemsFailed != 1 {
		t.Fatalf("timeout result = %+v, want failed without FTS rebuild and one failed item", resp.Reprocess)
	}
	var staleSince string
	if err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, RuntimeMetadataKeySearchFTSStaleSince).Scan(&staleSince); err != nil {
		t.Fatalf("read stale marker after timeout: %v", err)
	}
	if _, err := time.Parse(time.RFC3339, staleSince); err != nil {
		t.Fatalf("stale marker is not RFC3339 UTC: %q", staleSince)
	}
}

type reprocessMatrixLLM struct {
	failURLSubstring string
	availableTexts   []string
}

func (l *reprocessMatrixLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	if l.failURLSubstring != "" && strings.Contains(input.URL, l.failURLSubstring) {
		return OpenRouterSummaryOutput{}, errors.New("synthetic model failure")
	}
	l.availableTexts = append(l.availableTexts, input.AvailableText)
	return OpenRouterSummaryOutput{Title: "processed " + input.URL, Summary: "summary " + input.AvailableText, CoreInsight: "core insight " + input.AvailableText, FeedExcerpt: "excerpt " + input.AvailableText, ExtractedText: "extracted " + input.AvailableText, ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (l *reprocessMatrixLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func seedReprocessItem(t *testing.T, ctx context.Context, db *sql.DB, id string, sourceID string, itemURL string, canonicalURL string) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, feed_excerpt, extracted_text, value_tier, first_seen_at, extraction_status, model_status) values (?, ?, (select url from sources where id = ?), ?, ?, ?, ?, ?, ?, ?, 'prior-tier', ?, 'full', 'ok')`, id, sourceID, sourceID, itemURL, nullableString(canonicalURL), "PRIOR title "+id, "PRIOR summary "+id, "PRIOR insight "+id, "PRIOR excerpt "+id, "PRIOR extracted "+id, now)
	if err != nil {
		t.Fatalf("seed reprocess item %s: %v", id, err)
	}
}

func assertClearedReprocessFields(t *testing.T, ctx context.Context, db *sql.DB, itemID string, wantTitle string, wantExtractionStatus string, wantModelStatus string) {
	t.Helper()
	var title, extractionStatus, modelStatus string
	var summary, coreInsight, feedExcerpt, extractedText sql.NullString
	if err := db.QueryRowContext(ctx, `select title, summary, core_insight, feed_excerpt, extracted_text, extraction_status, model_status from items where id = ?`, itemID).Scan(&title, &summary, &coreInsight, &feedExcerpt, &extractedText, &extractionStatus, &modelStatus); err != nil {
		t.Fatalf("read cleared item %s: %v", itemID, err)
	}
	if title != wantTitle || summary.Valid || coreInsight.Valid || feedExcerpt.Valid || extractedText.Valid || extractionStatus != wantExtractionStatus || modelStatus != wantModelStatus {
		t.Fatalf("cleared item %s = title:%q summary:%v core:%v feed:%v extracted:%v extraction:%q model:%q, want title %q and null readable fields", itemID, title, summary.Valid, coreInsight.Valid, feedExcerpt.Valid, extractedText.Valid, extractionStatus, modelStatus, wantTitle)
	}
}

func Example_reprocessAttemptInvariant() {
	result := ReprocessLibraryResult{ItemsUpdated: 2, ItemsUnavailable: 1, ItemsFailed: 1}
	result.ItemsAttempted = result.ItemsUpdated + result.ItemsUnavailable + result.ItemsFailed
	fmt.Println(result.ItemsAttempted)
	// Output: 4
}
