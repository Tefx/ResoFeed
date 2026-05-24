package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCCRBackendInitialIngestPersistsV22FieldsAndIndexesCommittedRows(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<article>来源正文说明 Manus 收购、监管约束、退出预期和估值判断。</article>`))
	}))
	defer server.Close()

	source := Source{ID: "src_ccr_initial", URL: server.URL + "/feed.xml", Title: "TLDR AI Feed"}
	insertCCRSource(t, ctx, db, source)
	entry := feedEntry{Title: "Manus acquisition blocked by regulator", URL: server.URL + "/item", Description: "RSS excerpt", PublishedAt: ccrTimePtr(time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC))}

	item, err := buildItem(ctx, source, entry, ccrValidLLM{}, ProcessingLanguageChinese)
	if err != nil {
		t.Fatalf("buildItem: %v", err)
	}
	inserted, err := upsertIngestedItem(ctx, db, item)
	if err != nil {
		t.Fatalf("upsertIngestedItem: %v", err)
	}
	if !inserted {
		t.Fatalf("upsertIngestedItem inserted=false")
	}

	var sourceItemTitle, localizedTitle, keyPointsJSON, contentStatus string
	if err := db.QueryRowContext(ctx, `select source_item_title, coalesce(localized_title, ''), coalesce(key_points, ''), coalesce(content_status, '') from items where id = ?`, item.ID).Scan(&sourceItemTitle, &localizedTitle, &keyPointsJSON, &contentStatus); err != nil {
		t.Fatalf("read item content-contract fields: %v", err)
	}
	if sourceItemTitle != entry.Title || localizedTitle != "中文标题说明监管影响" || contentStatus != modelStatusOK {
		t.Fatalf("persisted fields = source_item_title=%q localized_title=%q content_status=%q", sourceItemTitle, localizedTitle, contentStatus)
	}
	var points []string
	if err := json.Unmarshal([]byte(keyPointsJSON), &points); err != nil {
		t.Fatalf("key_points JSON: %v", err)
	}
	if len(points) != 3 || points[0] != "Manus 交易因监管约束受阻，显示跨境 AI 并购存在实质门槛。" {
		t.Fatalf("key_points=%#v", points)
	}

	if !searchFTSColumnContains(t, ctx, db, item.ID, "localized_title", "监管影响") {
		t.Fatalf("search_fts.localized_title missing committed localized_title")
	}
	if !searchFTSColumnContains(t, ctx, db, item.ID, "source_item_title", "Manus acquisition blocked") {
		t.Fatalf("search_fts.source_item_title missing committed source title")
	}
	if !searchFTSColumnContains(t, ctx, db, item.ID, "key_points", "跨境 AI 并购") {
		t.Fatalf("search_fts.key_points missing committed key_points JSON")
	}
	for _, query := range []string{"Manus", "acquisition", "AI"} {
		if !searchFTSHasItem(t, ctx, db, item.ID, query) {
			t.Fatalf("search_fts missing committed query %q for item %s", query, item.ID)
		}
	}
	if searchFTSHasItem(t, ctx, db, item.ID, "FAILED_CANDIDATE_NEVER_INDEX") {
		t.Fatalf("search_fts contains failed candidate marker for initially committed item")
	}
}

func TestCCRBackendValidationRejectsLegacyStructOutputs(t *testing.T) {
	legacy := OpenRouterSummaryOutput{Title: "Legacy title", FeedExcerpt: "Legacy excerpt", ExtractedText: "Legacy text", Summary: "Legacy summary with facts.", CoreInsight: "Legacy insight.", ValueTier: "high", ModelStatus: modelStatusOK}
	_, err := validateSummaryOutputForPersistenceWithPrompt(legacy, promptingV21Item{SourceItemTitle: "Legacy title", SourceTitle: "Feed", URL: "https://example.test/item", AvailableTextSource: "fresh_full_text", AvailableText: "Legacy source text with facts.", TargetLanguage: ProcessingLanguageEnglish})
	var validationErr PromptValidationError
	if !errors.As(err, &validationErr) || validationErr.Code != PromptValidationSchemaInvalid {
		t.Fatalf("validation error = %T %[1]v, want schema_invalid for missing localized_title/key_points", err)
	}
}

func TestCCRBackendReingestRejectsNonOpenRouterLegacyOutputAndPreservesCommittedContent(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("来源正文说明监管约束和估值风险。"))
	}))
	defer server.Close()

	source := Source{ID: "src_ccr_reingest", URL: server.URL + "/feed.xml", Title: "Reingest Feed"}
	insertCCRSource(t, ctx, db, source)
	itemID := "item_ccr_reingest"
	originalPoints := []string{"原始要点一说明监管约束。", "原始要点二说明估值风险。", "原始要点三说明退出预期。"}
	originalPointsJSON, err := json.Marshal(originalPoints)
	if err != nil {
		t.Fatalf("marshal original points: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, source_item_title, localized_title, summary, core_insight, key_points, value_tier, content_status, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, 'full', 'ok', ?, ?)`, itemID, source.ID, source.URL, server.URL+"/item", "原始标题", "Literal Source Title", "原始标题", "原始摘要保留内容。", "原始洞察保留内容。", string(originalPointsJSON), "high", time.Now().UTC().Format(time.RFC3339), "原始摘录", "原始正文")
	if err != nil {
		t.Fatalf("insert original item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("refresh original FTS: %v", err)
	}

	resp, err := ReingestItem(ctx, db, ccrLegacyCandidateLLM{}, itemID, ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "ccr-reingest-legacy-1"}})
	if err != nil {
		t.Fatalf("ReingestItem: %v", err)
	}
	if resp.Reingest.Status != ReprocessStatusCompletedWithErrors || resp.Reingest.FTSUpdated {
		t.Fatalf("reingest status=%q fts_updated=%v, want completed_with_errors and no failed-candidate FTS refresh", resp.Reingest.Status, resp.Reingest.FTSUpdated)
	}

	var title, summary, keyPointsJSON, contentStatus, lastStatus, lastCode string
	if err := db.QueryRowContext(ctx, `select title, coalesce(summary, ''), coalesce(key_points, ''), coalesce(content_status, ''), coalesce(last_reprocess_status, ''), coalesce(last_reprocess_error_code, '') from items where id = ?`, itemID).Scan(&title, &summary, &keyPointsJSON, &contentStatus, &lastStatus, &lastCode); err != nil {
		t.Fatalf("read preserved item: %v", err)
	}
	if title != "原始标题" || summary != "原始摘要保留内容。" || keyPointsJSON != string(originalPointsJSON) || contentStatus != modelStatusOK {
		t.Fatalf("failed candidate overwrote content: title=%q summary=%q key_points=%q content_status=%q", title, summary, keyPointsJSON, contentStatus)
	}
	if lastStatus != "failed" || lastCode != string(ReprocessErrorDecodeError) {
		t.Fatalf("attempt status=(%q,%q), want failed/decode_error", lastStatus, lastCode)
	}
	if searchFTSHasItem(t, ctx, db, itemID, "FAILED_CANDIDATE_NEVER_INDEX") {
		t.Fatalf("failed candidate polluted FTS")
	}
	if !searchFTSHasItem(t, ctx, db, itemID, "原始要点一说明监管约束") {
		t.Fatalf("preserved committed key_points missing from FTS")
	}
}

type ccrValidLLM struct{}

func (ccrValidLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{
		LocalizedTitle: "中文标题说明监管影响",
		Summary:        "中文摘要说明 Manus 交易、监管约束和估值判断均来自来源正文。",
		CoreInsight:    "监管约束正在改变 AI 初创公司的退出确定性。",
		KeyPoints: []string{
			"Manus 交易因监管约束受阻，显示跨境 AI 并购存在实质门槛。",
			"该事件会影响 AI 初创公司的退出预期，因为买方意愿不再等同于交易确定性。",
			"读者可以据此判断 AI 公司估值时需要同时考虑技术、资本和监管。",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (ccrValidLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type ccrLegacyCandidateLLM struct{}

func (ccrLegacyCandidateLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{Title: "FAILED_CANDIDATE_NEVER_INDEX", FeedExcerpt: "FAILED_CANDIDATE_NEVER_INDEX", ExtractedText: "FAILED_CANDIDATE_NEVER_INDEX", Summary: "FAILED_CANDIDATE_NEVER_INDEX", CoreInsight: "FAILED_CANDIDATE_NEVER_INDEX", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (ccrLegacyCandidateLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func insertCCRSource(t *testing.T, ctx context.Context, db *sql.DB, source Source) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'ok', 1, 1)`, source.ID, source.URL, source.Title, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert source: %v", err)
	}
}

func searchFTSHasItem(t *testing.T, ctx context.Context, db *sql.DB, itemID string, query string) bool {
	t.Helper()
	fts := ftsQuery(query)
	if strings.TrimSpace(fts) == "" {
		return false
	}
	var got string
	err := db.QueryRowContext(ctx, `select item_id from search_fts where search_fts match ? and item_id = ? limit 1`, fts, itemID).Scan(&got)
	if errors.Is(err, sql.ErrNoRows) {
		return false
	}
	if err != nil {
		t.Fatalf("query search_fts %q: %v", query, err)
	}
	return got == itemID
}

func searchFTSColumnContains(t *testing.T, ctx context.Context, db *sql.DB, itemID string, column string, want string) bool {
	t.Helper()
	var value string
	err := db.QueryRowContext(ctx, `select `+column+` from search_fts where item_id = ?`, itemID).Scan(&value)
	if err != nil {
		t.Fatalf("read search_fts.%s: %v", column, err)
	}
	return strings.Contains(value, want)
}

func ccrTimePtr(value time.Time) *time.Time { return &value }

func ccrTestSummaryOutput(title string, summary string, coreInsight string, valueTier string) OpenRouterSummaryOutput {
	if strings.TrimSpace(title) == "" {
		title = "Contract test title"
	}
	if strings.TrimSpace(summary) == "" {
		summary = "Contract test summary with source-backed facts."
	}
	if strings.TrimSpace(coreInsight) == "" {
		coreInsight = "Contract test insight."
	}
	if strings.TrimSpace(valueTier) == "" {
		valueTier = "high"
	}
	return OpenRouterSummaryOutput{
		LocalizedTitle: title,
		Title:          title,
		FeedExcerpt:    "Excerpt for " + title,
		ExtractedText:  "Extracted text for " + title,
		Summary:        summary,
		CoreInsight:    coreInsight,
		KeyPoints: []string{
			"Specific source-backed point one for " + title + ".",
			"Specific source-backed point two for " + title + ".",
			"Specific source-backed point three for " + title + ".",
		},
		ValueTier:   valueTier,
		ModelStatus: modelStatusOK,
	}
}
