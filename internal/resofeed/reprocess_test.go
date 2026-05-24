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
	assertReprocessIndexReady(t, ctx, db)

	llm := &reprocessMatrixLLM{failURLSubstring: "/failed"}
	resp, err := ReprocessLibrary(ctx, db, llm, ReprocessLibraryRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "reprocess-matrix"}})
	if err != nil {
		t.Fatalf("ReprocessLibrary returned error: %v", err)
	}
	result := resp.Reprocess
	if result.Status != ReprocessStatusCompletedWithErrors || !result.FTSRebuilt || result.ItemsIndexed != 4 {
		t.Fatalf("result status/indexing = %+v, want completed_with_errors with rebuilt FTS and 4 indexed", result)
	}
	if result.ItemsAttempted != 4 || result.ItemsUpdated != 3 || result.ItemsUnavailable != 0 || result.ItemsFailed != 1 {
		t.Fatalf("result counts = %+v, want attempted=4 updated=3 unavailable=0 failed=1", result)
	}
	if result.ItemsAttempted != result.ItemsUpdated+result.ItemsUnavailable+result.ItemsFailed {
		t.Fatalf("attempted invariant broken: %+v", result)
	}
	if requests["/canonical-success"] != 1 || requests["/original-unused"] != 0 || requests["/canonical-miss"] != 1 || requests["/original-fallback"] != 1 || requests["/feed.xml"] != 0 {
		t.Fatalf("unexpected fetch precedence requests: %#v", requests)
	}
	for _, available := range llm.availableTexts {
		if strings.Contains(available, "PRIOR summary") || strings.Contains(available, "PRIOR insight") || strings.Contains(available, "PRIOR title") {
			t.Fatalf("prior stored interpretation field was used as source text: %q", available)
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
	assertNoStaleReadableFTS(t, ctx, db, "item_success", false)
	assertNoStaleReadableFTS(t, ctx, db, "item_fallback", false)
	if count := reprocessFTSCount(t, ctx, db, "item_unavailable", `"PRIOR extracted item_unavailable"`); count != 1 {
		t.Fatalf("FTS for item_unavailable did not reflect stored extracted_text fallback rewrite; count=%d", count)
	}
	assertPreservedOriginalFields(t, ctx, db, "item_failed", modelStatusLatencyError, "PRIOR summary item_failed", "PRIOR insight item_failed")
	assertNoStaleReadableFTS(t, ctx, db, "item_failed", true)

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

func TestReprocessLibraryTimeoutPreservesReadableFieldsAndItemFTS(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(150 * time.Millisecond)
		_, _ = io.WriteString(w, `<html><body><article>too slow</article></body></html>`)
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_reprocess_timeout", server.URL+"/feed.xml", "Timeout Source")
	seedReprocessItem(t, ctx, db, "item_timeout", "src_reprocess_timeout", server.URL+"/slow", "")
	assertReprocessIndexReady(t, ctx, db)
	assertStaleReadableFTS(t, ctx, db, "item_timeout")
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
	assertPreservedReprocessFields(t, ctx, db, "item_timeout")
	assertStaleReadableFTS(t, ctx, db, "item_timeout")
}

func TestReprocessLibraryCanceledFetchPreservesReadableFieldsAndItemFTS(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cancel()
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_reprocess_canceled", server.URL+"/feed.xml", "Canceled Source")
	seedReprocessItem(t, ctx, db, "item_canceled", "src_reprocess_canceled", server.URL+"/blocked", "")
	assertReprocessIndexReady(t, ctx, db)
	assertStaleReadableFTS(t, ctx, db, "item_canceled")

	resp, err := reprocessLibraryFresh(runCtx, db, &reprocessMatrixLLM{})
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if resp.Reprocess.Status != ReprocessStatusFailed || resp.Reprocess.FTSRebuilt || resp.Reprocess.ItemsIndexed != 0 || resp.Reprocess.ItemsFailed != 1 {
		t.Fatalf("canceled result = %+v, want failed without FTS rebuild and one failed item", resp.Reprocess)
	}
	assertPreservedReprocessFields(t, ctx, db, "item_canceled")
	assertStaleReadableFTS(t, ctx, db, "item_canceled")
}

func TestReprocessLibraryPreservesReadableFieldsWhenLLMUnavailableOrNonOK(t *testing.T) {
	ctx := context.Background()
	for _, tc := range []struct {
		name            string
		llm             LLMClient
		wantUnavailable bool
	}{
		{name: "nil_llm", llm: nil, wantUnavailable: true},
		{name: "summary_unavailable", llm: reprocessStatusLLM{status: modelStatusSummaryNA}},
		{name: "latency_status", llm: reprocessStatusLLM{status: modelStatusLatencyError}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := newContractDB(t, ctx)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.WriteString(w, `<html><body><article>available body for non ok model</article></body></html>`)
			}))
			t.Cleanup(server.Close)

			seedSource(t, ctx, db, "src_"+tc.name, server.URL+"/feed.xml", "Source "+tc.name)
			seedReprocessItem(t, ctx, db, "item_"+tc.name, "src_"+tc.name, server.URL+"/article", "")
			assertReprocessIndexReady(t, ctx, db)

			resp, err := reprocessLibraryFresh(ctx, db, tc.llm)
			if err != nil {
				t.Fatalf("reprocessLibraryFresh returned error: %v", err)
			}
			if tc.wantUnavailable {
				if resp.Reprocess.Status != ReprocessStatusCompletedWithErrors || resp.Reprocess.ItemsAttempted != 1 || resp.Reprocess.ItemsUpdated != 0 || resp.Reprocess.ItemsUnavailable != 1 || resp.Reprocess.ItemsFailed != 0 || !resp.Reprocess.FTSRebuilt {
					t.Fatalf("result = %+v, want one unavailable item with rebuilt FTS", resp.Reprocess)
				}
				assertPreservedOriginalFields(t, ctx, db, "item_"+tc.name, modelStatusSummaryNA, "PRIOR summary item_"+tc.name, "PRIOR insight item_"+tc.name)
			} else {
				if resp.Reprocess.Status != ReprocessStatusCompletedWithErrors || resp.Reprocess.ItemsAttempted != 1 || resp.Reprocess.ItemsUpdated != 0 || resp.Reprocess.ItemsUnavailable != 0 || resp.Reprocess.ItemsFailed != 1 || !resp.Reprocess.FTSRebuilt {
					t.Fatalf("result = %+v, want one validation-failed item with rebuilt FTS", resp.Reprocess)
				}
				assertPreservedOriginalFields(t, ctx, db, "item_"+tc.name, modelStatusDecodeError, "PRIOR summary item_"+tc.name, "PRIOR insight item_"+tc.name)
			}
			assertNoStaleReadableFTS(t, ctx, db, "item_"+tc.name, true)
		})
	}
}

func TestReprocessLibraryUsesStoredTitleAndPreservesItForURLLikeModelTitle(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>English article body for Chinese rewrite</article></body></html>`)
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_reprocess_title", server.URL+"/feed.xml", "TLDR Feed")
	seedReprocessItem(t, ctx, db, "item_url_title", "src_reprocess_title", server.URL+"/url-title", "")
	seedReprocessItem(t, ctx, db, "item_real_title", "src_reprocess_title", server.URL+"/real-title", "")
	assertReprocessIndexReady(t, ctx, db)

	llm := &reprocessTitleLLM{}
	resp, err := reprocessLibraryFresh(ctx, db, llm)
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if resp.Reprocess.Status != ReprocessStatusCompleted || resp.Reprocess.ItemsUpdated != 2 || resp.Reprocess.ItemsFailed != 0 || resp.Reprocess.ItemsUnavailable != 0 {
		t.Fatalf("result = %+v, want two updated items", resp.Reprocess)
	}
	if got := llm.inputTitles["item_url_title"]; got != "PRIOR title item_url_title" {
		t.Fatalf("LLM title input for URL-title item = %q, want stored title", got)
	}
	if got := llm.inputTitles["item_real_title"]; got != "PRIOR title item_real_title" {
		t.Fatalf("LLM title input for real-title item = %q, want stored title", got)
	}

	urlTitle := readStoredText(t, ctx, db, "item_url_title")
	if urlTitle.title != "PRIOR title item_url_title" || urlTitle.summary != "中文摘要：保留标题" || urlTitle.coreInsight != "中文洞察：保留标题" {
		t.Fatalf("URL-like title item text = %+v, want preserved title with updated Chinese fields", urlTitle)
	}
	realTitle := readStoredText(t, ctx, db, "item_real_title")
	if realTitle.title != "真正的中文标题" || realTitle.summary != "中文摘要：更新标题" || realTitle.coreInsight != "中文洞察：更新标题" {
		t.Fatalf("real title item text = %+v, want genuine model title applied", realTitle)
	}
}

func TestChineseReprocessDoesNotFallbackToRawEnglishExtractedTextWhenModelOmitsReadableBody(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{Language: ProcessingLanguageChinese, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "set-zh-blank-body-reprocess"}}); err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>Original English TLDR article body should not be surfaced after Chinese reprocess.</article></body></html>`)
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_zh_blank_reprocess", server.URL+"/feed.xml", "TLDR AI")
	seedReprocessItem(t, ctx, db, "item_zh_blank_reprocess", "src_zh_blank_reprocess", server.URL+"/article", "")
	assertReprocessIndexReady(t, ctx, db)

	resp, err := reprocessLibraryFresh(ctx, db, blankReadableBodyLLM{})
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if resp.Reprocess.Status != ReprocessStatusCompleted || resp.Reprocess.ItemsUpdated != 1 || resp.Reprocess.ItemsFailed != 0 || resp.Reprocess.ItemsUnavailable != 0 {
		t.Fatalf("result = %+v, want one updated item", resp.Reprocess)
	}
	text := readStoredText(t, ctx, db, "item_zh_blank_reprocess")
	if text.summary != "中文摘要" || text.coreInsight != "中文洞察" || strings.Contains(text.feedExcerpt, "Original English") || strings.Contains(text.extractedText, "Original English") {
		t.Fatalf("stored text = %+v, want Chinese model fields and no raw English body/excerpt", text)
	}
	if count := reprocessFTSCount(t, ctx, db, "item_zh_blank_reprocess", `"Original English"`); count != 0 {
		t.Fatalf("FTS retained raw English source text with count %d", count)
	}
	if count := reprocessFTSCount(t, ctx, db, "item_zh_blank_reprocess", `"PRIOR extracted"`); count != 0 {
		t.Fatalf("FTS retained stale prior body/excerpt text with count %d", count)
	}
}

func TestItemReingestPersistenceValidationUsesActualPromptContextBeforeWrite(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{Language: ProcessingLanguageChinese, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "set-zh-actual-context-validation"}}); err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}
	assertReprocessIndexReady(t, ctx, db)

	resp, err := ReingestItem(ctx, db, actualContextInvalidReingestLLM{}, "item_reingest_01", ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "actual-context-validation"}})
	if err != nil {
		t.Fatalf("ReingestItem returned error: %v", err)
	}
	if resp.Reingest.Status != ReprocessStatusCompletedWithErrors || resp.Reingest.Error == nil || resp.Reingest.Error.Code != ReprocessErrorDecodeError || !resp.Reingest.ItemUpdated || !resp.Reingest.FTSUpdated {
		t.Fatalf("reingest result = %+v, want stable decode_error failure with selected FTS refresh", resp.Reingest)
	}
	assertPreservedOriginalFields(t, ctx, db, "item_reingest_01", modelStatusDecodeError, "PRIOR summary selected", "PRIOR insight selected")
	if count := reprocessFTSCount(t, ctx, db, "item_reingest_01", `"English summary that should fail Chinese validation"`); count != 0 {
		t.Fatalf("FTS persisted actual-context-invalid English summary, count=%d", count)
	}
}

func TestFetchArticleReadableTextRejectsPDFPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = w.Write([]byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj"))
	}))
	t.Cleanup(server.Close)

	text, err := fetchArticleReadableText(context.Background(), server.URL)
	if err == nil {
		t.Fatalf("fetchArticleReadableText pdf error = nil, text %q", text)
	}
	if text != "" {
		t.Fatalf("fetchArticleReadableText pdf text = %q, want empty", text)
	}
}

func TestFetchArticleReadableTextRejectsSniffedBinaryPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte{'%', 'P', 'D', 'F', '-', '1', '.', '7', '\n', 0, 1, 2})
	}))
	t.Cleanup(server.Close)

	text, err := fetchArticleReadableText(context.Background(), server.URL)
	if err == nil {
		t.Fatalf("fetchArticleReadableText sniffed binary error = nil, text %q", text)
	}
	if text != "" {
		t.Fatalf("fetchArticleReadableText sniffed binary text = %q, want empty", text)
	}
}

type reprocessMatrixLLM struct {
	failURLSubstring string
	availableTexts   []string
}

type reprocessTitleLLM struct {
	inputTitles map[string]string
}

type reprocessStatusLLM struct {
	status string
}

type actualContextInvalidReingestLLM struct{}

func (actualContextInvalidReingestLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{Title: "English title", Summary: "English summary that should fail Chinese validation.", CoreInsight: "English insight.", FeedExcerpt: "English excerpt", ExtractedText: "English extracted text", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (actualContextInvalidReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l reprocessStatusLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{Title: "Fallback title", Summary: "Fallback summary.", CoreInsight: "Fallback insight.", ValueTier: "high", ModelStatus: l.status}, nil
}

func (l reprocessStatusLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l *reprocessMatrixLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	if l.failURLSubstring != "" && strings.Contains(input.URL, l.failURLSubstring) {
		return OpenRouterSummaryOutput{}, errors.New("synthetic model failure")
	}
	l.availableTexts = append(l.availableTexts, input.AvailableText)
	return OpenRouterSummaryOutput{Title: "processed " + input.URL, Summary: "summary " + input.AvailableText, CoreInsight: "core insight " + input.AvailableText, FeedExcerpt: "excerpt " + input.AvailableText, ExtractedText: "extracted " + input.AvailableText, ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (l *reprocessTitleLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	if l.inputTitles == nil {
		l.inputTitles = map[string]string{}
	}
	l.inputTitles[input.ItemID] = input.Title
	if input.ItemID == "item_url_title" {
		return OpenRouterSummaryOutput{Title: "https://github.com/raindrop-ai/workshop?utm_source=tldrai", Summary: "中文摘要：保留标题", CoreInsight: "中文洞察：保留标题", FeedExcerpt: "中文摘录：保留标题", ExtractedText: "中文全文：保留标题", ValueTier: "high", ModelStatus: modelStatusOK}, nil
	}
	return OpenRouterSummaryOutput{Title: "真正的中文标题", Summary: "中文摘要：更新标题", CoreInsight: "中文洞察：更新标题", FeedExcerpt: "中文摘录：更新标题", ExtractedText: "中文全文：更新标题", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (l *reprocessTitleLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
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

func assertPreservedReprocessFields(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	var title, summary, coreInsight, feedExcerpt, extractedText, valueTier, extractionStatus, modelStatus string
	if err := db.QueryRowContext(ctx, `select title, coalesce(summary, ''), coalesce(core_insight, ''), coalesce(feed_excerpt, ''), coalesce(extracted_text, ''), coalesce(value_tier, ''), extraction_status, model_status from items where id = ?`, itemID).Scan(&title, &summary, &coreInsight, &feedExcerpt, &extractedText, &valueTier, &extractionStatus, &modelStatus); err != nil {
		t.Fatalf("read preserved item %s: %v", itemID, err)
	}
	if title != "PRIOR title "+itemID || summary != "PRIOR summary "+itemID || coreInsight != "PRIOR insight "+itemID || feedExcerpt != "PRIOR excerpt "+itemID || extractedText != "PRIOR extracted "+itemID || valueTier != "prior-tier" || extractionStatus != extractionStatusFull || modelStatus != modelStatusOK {
		t.Fatalf("item %s was degraded: title:%q summary:%q core:%q feed:%q extracted:%q tier:%q extraction:%q model:%q", itemID, title, summary, coreInsight, feedExcerpt, extractedText, valueTier, extractionStatus, modelStatus)
	}
}

func assertPreservedOriginalFields(t *testing.T, ctx context.Context, db *sql.DB, itemID string, modelStatus string, expectedSummary string, expectedCoreInsight string) {
	t.Helper()
	var title, summary, coreInsight, feedExcerpt, extractedText, valueTier, extractionStatus, storedModelStatus string
	if err := db.QueryRowContext(ctx, `select title, coalesce(summary, ''), coalesce(core_insight, ''), coalesce(feed_excerpt, ''), coalesce(extracted_text, ''), coalesce(value_tier, ''), extraction_status, model_status from items where id = ?`, itemID).Scan(&title, &summary, &coreInsight, &feedExcerpt, &extractedText, &valueTier, &extractionStatus, &storedModelStatus); err != nil {
		t.Fatalf("read preserved item %s: %v", itemID, err)
	}
	if title != "PRIOR title "+itemID || summary != expectedSummary || coreInsight != expectedCoreInsight || feedExcerpt != "PRIOR excerpt "+itemID || extractedText != "PRIOR extracted "+itemID || storedModelStatus != modelStatus {
		t.Fatalf("item %s was degraded: title:%q summary:%q core:%q feed:%q extracted:%q tier:%q extraction:%q model:%q", itemID, title, summary, coreInsight, feedExcerpt, extractedText, valueTier, extractionStatus, storedModelStatus)
	}
}

func assertReprocessIndexReady(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild initial search index: %v", err)
	}
}

func assertStaleReadableFTS(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	if count := reprocessFTSCount(t, ctx, db, itemID, "PRIOR"); count == 0 {
		t.Fatalf("precondition: FTS for %s did not contain prior readable text", itemID)
	}
}

func assertNoStaleReadableFTS(t *testing.T, ctx context.Context, db *sql.DB, itemID string, expectStale bool) {
	t.Helper()
	for _, query := range []string{"PRIOR"} {
		if count := reprocessFTSCount(t, ctx, db, itemID, query); (count != 0) != expectStale {
			t.Fatalf("FTS for %s retained stale query %q with count %d", itemID, query, count)
		}
	}
}

func reprocessFTSCount(t *testing.T, ctx context.Context, db *sql.DB, itemID string, query string) int {
	t.Helper()
	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from search_fts where item_id = ? and search_fts match ?`, itemID, query).Scan(&count); err != nil {
		t.Fatalf("query FTS for %s/%q: %v", itemID, query, err)
	}
	return count
}

func Example_reprocessAttemptInvariant() {
	result := ReprocessLibraryResult{ItemsUpdated: 2, ItemsUnavailable: 1, ItemsFailed: 1}
	result.ItemsAttempted = result.ItemsUpdated + result.ItemsUnavailable + result.ItemsFailed
	fmt.Println(result.ItemsAttempted)
	// Output: 4
}
