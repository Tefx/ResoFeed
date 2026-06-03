package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestProcessingLanguageFutureIngestDoesNotRewriteHistoricalItems(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	var includeSecond atomic.Bool
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			items := `<item><guid>one</guid><title>One</title><link>http://` + r.Host + `/one</link><description>first excerpt</description></item>`
			if includeSecond.Load() {
				items += `<item><guid>two</guid><title>Two</title><link>http://` + r.Host + `/two</link><description>second excerpt</description></item>`
			}
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Literal Source</title>`+items+`</channel></rss>`)
		case "/one":
			_, _ = io.WriteString(w, `<html><body><article>first article body</article></body></html>`)
		case "/two":
			_, _ = io.WriteString(w, `<html><body><article>second article body</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)

	seedSource(t, ctx, db, "src_pl_ingest", feed.URL+"/feed.xml", "Literal Source")
	llm := &languageAwareLLM{}
	if err := IngestOnce(ctx, db, IngestConfig{LLM: llm}); err != nil {
		t.Fatalf("initial IngestOnce: %v", err)
	}
	firstID := itemIDByURL(t, ctx, db, feed.URL+"/one")
	firstBefore := readStoredText(t, ctx, db, firstID)
	if firstBefore.title != "en title One" || firstBefore.summary != "en summary One" || firstBefore.coreInsight != "en insight One" || firstBefore.feedExcerpt != "en excerpt One" || firstBefore.extractedText != "en extracted One" {
		t.Fatalf("initial English stored text = %+v", firstBefore)
	}

	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{Language: ProcessingLanguageChinese, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "set-zh"}}); err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}
	includeSecond.Store(true)
	if err := IngestOnce(ctx, db, IngestConfig{LLM: llm}); err != nil {
		t.Fatalf("second IngestOnce: %v", err)
	}

	if firstAfter := readStoredText(t, ctx, db, firstID); firstAfter != firstBefore {
		t.Fatalf("historical item was rewritten after language change: before=%+v after=%+v", firstBefore, firstAfter)
	}
	secondID := itemIDByURL(t, ctx, db, feed.URL+"/two")
	second := readStoredText(t, ctx, db, secondID)
	if second.title != "zh title Two" || second.summary != "zh summary Two" || second.coreInsight != "zh insight Two" || second.feedExcerpt != "zh excerpt Two" || second.extractedText != "zh extracted Two" {
		t.Fatalf("future Chinese stored text = %+v", second)
	}

	detail, err := ReadItemDetail(ctx, db, secondID)
	if err != nil {
		t.Fatalf("ReadItemDetail second: %v", err)
	}
	if detail.URL != feed.URL+"/two" || detail.Provenance.OriginalURL != feed.URL+"/two" || detail.Provenance.SourceURL != feed.URL+"/feed.xml" || detail.SourceTitle != "Literal Source" {
		t.Fatalf("provenance was changed by localization: detail=%+v provenance=%+v", detail, detail.Provenance)
	}
}

func TestIngestSkipsExistingItems(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	var articleFetches atomic.Int64
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Skip Source</title><item><guid>stable-one</guid><title>One</title><link>http://`+r.Host+`/one</link><description>first excerpt</description></item></channel></rss>`)
		case "/one":
			articleFetches.Add(1)
			_, _ = io.WriteString(w, `<html><body><article>first article body</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)

	seedSource(t, ctx, db, "src_skip_existing", feed.URL+"/feed.xml", "Skip Source")
	llm := &countingSummaryLLM{}
	if err := IngestOnce(ctx, db, IngestConfig{LLM: llm}); err != nil {
		t.Fatalf("initial IngestOnce: %v", err)
	}
	if articleFetches.Load() != 1 || llm.calls.Load() != 1 {
		t.Fatalf("initial ingest fetches=%d llm_calls=%d, want 1 each", articleFetches.Load(), llm.calls.Load())
	}

	if err := IngestOnce(ctx, db, IngestConfig{LLM: llm}); err != nil {
		t.Fatalf("second IngestOnce: %v", err)
	}
	if articleFetches.Load() != 1 {
		t.Fatalf("second ingest fetched existing article; article fetches=%d, want 1", articleFetches.Load())
	}
	if llm.calls.Load() != 1 {
		t.Fatalf("second ingest summarized existing item; llm calls=%d, want 1", llm.calls.Load())
	}
}

func TestIngestUsesFetchedFeedTitleForSourceLedgerAndNewItems(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Fetched Channel Source</title><item><guid>one</guid><title>One</title><link>http://`+r.Host+`/one</link><description>first excerpt</description></item></channel></rss>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)

	seedSource(t, ctx, db, "src_channel_title", feed.URL+"/feed.xml", "Imported OPML Label")
	if err := IngestOnce(ctx, db, IngestConfig{}); err != nil {
		t.Fatalf("IngestOnce: %v", err)
	}

	var sourceTitle string
	if err := db.QueryRowContext(ctx, `select title from sources where id = 'src_channel_title'`).Scan(&sourceTitle); err != nil {
		t.Fatalf("read source title: %v", err)
	}
	if sourceTitle != "Fetched Channel Source" {
		t.Fatalf("source title = %q, want fetched channel title", sourceTitle)
	}

	itemID := itemIDByURL(t, ctx, db, feed.URL+"/one")
	detail, err := ReadItemDetail(ctx, db, itemID)
	if err != nil {
		t.Fatalf("ReadItemDetail: %v", err)
	}
	if detail.SourceTitle != "Fetched Channel Source" {
		t.Fatalf("item source title = %q, want fetched channel title", detail.SourceTitle)
	}
}

func TestIngestUsesHTTPGUIDAsURLWhenRSSLinkIsEmpty(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>GUID Source</title><item><guid>http://`+r.Host+`/article-guid</guid><title>GUID Article</title><link></link><description>guid excerpt</description></item></channel></rss>`)
		case "/article-guid":
			_, _ = io.WriteString(w, `<html><body><article>guid article body</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)

	seedSource(t, ctx, db, "src_guid_fallback", feed.URL+"/feed.xml", "GUID Source")
	if err := IngestOnce(ctx, db, IngestConfig{}); err != nil {
		t.Fatalf("IngestOnce: %v", err)
	}

	itemURL := feed.URL + "/article-guid"
	itemID := itemIDByURL(t, ctx, db, itemURL)
	text := readStoredText(t, ctx, db, itemID)
	if text.title != "GUID Article" || text.feedExcerpt != "guid excerpt" {
		t.Fatalf("stored text = %+v, want title and feed excerpt from RSS item", text)
	}
	var syntheticCount int
	if err := db.QueryRowContext(ctx, `select count(*) from items where source_id = ? and url like ?`, "src_guid_fallback", feed.URL+"/feed.xml#entry_%").Scan(&syntheticCount); err != nil {
		t.Fatalf("query synthetic URL count: %v", err)
	}
	if syntheticCount != 0 {
		t.Fatalf("stored %d synthetic feed-fragment URLs, want 0", syntheticCount)
	}
}

func TestChineseModelBackedIngestPreservesSourceEvidenceWhenModelOmitsReadableBody(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{Language: ProcessingLanguageChinese, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "set-zh-blank-body-ingest"}}); err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}

	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>TLDR AI</title><item><guid>one</guid><title>OpenAI launches agent</title><link>http://`+r.Host+`/one</link><description>This is the original English RSS excerpt that should not remain visible.</description></item></channel></rss>`)
		case "/one":
			_, _ = io.WriteString(w, `<html><body><article>This is the original English article body that should not remain visible.</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)

	seedSource(t, ctx, db, "src_zh_blank_ingest", feed.URL+"/feed.xml", "TLDR AI")
	if err := IngestOnce(ctx, db, IngestConfig{LLM: emptySourceEvidenceZHLLM{}}); err != nil {
		t.Fatalf("IngestOnce: %v", err)
	}

	itemID := itemIDByURL(t, ctx, db, feed.URL+"/one")
	text := readStoredText(t, ctx, db, itemID)
	if text.summary != "中文摘要说明来源事实" || text.coreInsight != "中文洞察说明来源事实。" || !strings.Contains(text.feedExcerpt, "original English RSS excerpt") || !strings.Contains(text.extractedText, "original English article body") {
		t.Fatalf("stored text = %+v, want Chinese model fields plus preserved source evidence", text)
	}
	detail, err := ReadItemDetail(ctx, db, itemID)
	if err != nil {
		t.Fatalf("ReadItemDetail: %v", err)
	}
	if detail.FeedExcerpt == nil || !strings.Contains(*detail.FeedExcerpt, "original English RSS excerpt") || detail.ExtractedText == nil || !strings.Contains(*detail.ExtractedText, "original English article body") {
		t.Fatalf("detail source evidence not preserved: feed_excerpt=%v extracted_text=%v", detail.FeedExcerpt, detail.ExtractedText)
	}
	if detail.SourceTitle != "TLDR AI" || detail.URL != feed.URL+"/one" || detail.Provenance.SourceURL != feed.URL+"/feed.xml" {
		t.Fatalf("source identifiers changed: detail=%+v provenance=%+v", detail, detail.Provenance)
	}
	if count := reprocessFTSCount(t, ctx, db, itemID, `"original English"`); count != 1 {
		t.Fatalf("FTS source evidence phrase count = %d, want 1", count)
	}
}

func TestChineseModelBackedIngestPreservesOnlyRSSExcerptWhenArticleUnavailable(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{Language: ProcessingLanguageChinese, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "set-zh-rss-only-ingest"}}); err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}

	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>RSS Only</title><item><guid>rss-only</guid><title>RSS Only Item</title><link>http://`+r.Host+`/missing</link><description>RSS-only source-backed excerpt remains available.</description></item></channel></rss>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)

	seedSource(t, ctx, db, "src_zh_rss_only", feed.URL+"/feed.xml", "RSS Only")
	if err := IngestOnce(ctx, db, IngestConfig{LLM: emptySourceEvidenceZHLLM{}}); err != nil {
		t.Fatalf("IngestOnce: %v", err)
	}

	itemID := itemIDByURL(t, ctx, db, feed.URL+"/missing")
	text := readStoredText(t, ctx, db, itemID)
	if text.feedExcerpt != "RSS-only source-backed excerpt remains available." || text.extractedText != "" {
		t.Fatalf("stored evidence = feed:%q extracted:%q, want RSS excerpt only", text.feedExcerpt, text.extractedText)
	}
	var status string
	if err := db.QueryRowContext(ctx, `select extraction_status from items where id = ?`, itemID).Scan(&status); err != nil {
		t.Fatalf("read extraction status: %v", err)
	}
	if status != extractionStatusPartial {
		t.Fatalf("extraction_status = %q, want %q", status, extractionStatusPartial)
	}
}

func TestChineseIngestNoSourceDoesNotFabricateSourceEvidence(t *testing.T) {
	ctx := context.Background()
	item, err := buildItemWithActiveSteering(ctx, Source{ID: "src_no_source", URL: "https://nosource.example/feed.xml", Title: "No Source"}, feedEntry{ID: "no-source", Title: "No Source Item", URL: "not a url"}, emptySourceEvidenceZHLLM{}, ProcessingLanguageChinese, nil)
	if err != nil {
		t.Fatalf("buildItemWithActiveSteering: %v", err)
	}
	if item.FeedExcerpt != nil || item.ExtractedText != nil {
		t.Fatalf("source evidence was fabricated: feed_excerpt=%v extracted_text=%v", item.FeedExcerpt, item.ExtractedText)
	}
	if item.Summary != nil || item.CoreInsight != nil || item.ModelStatus != modelStatusSummaryNA || item.ExtractionStatus != extractionStatusOriginalNA {
		t.Fatalf("no-source item = %+v, want unavailable without model-generated source evidence", item)
	}
}

func TestProcessingLanguageSearchFTSIncludesCoreInsight(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSource(t, ctx, db, "src_fts_pl", "https://fts.example/feed.xml", "FTS Source")
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, feed_excerpt, extracted_text, first_seen_at, extraction_status, model_status) values ('item_fts_pl', 'src_fts_pl', 'https://fts.example/feed.xml', 'https://fts.example/item', 'title', 'summary', '核心洞察唯一短语', 'excerpt', 'extracted', ?, 'full', 'ok')`, now); err != nil {
		t.Fatalf("insert FTS item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuildSearchIndex: %v", err)
	}
	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from search_fts where search_fts match ?`, `"核心洞察唯一短语"`).Scan(&count); err != nil {
		t.Fatalf("query FTS core insight: %v", err)
	}
	if count != 1 {
		t.Fatalf("FTS core insight matches = %d, want 1", count)
	}
}

func TestOpenRouterSummaryRequestIncludesTargetLanguageWithoutPersistingSecret(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	var capturedAuth string
	var capturedContent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		var req openRouterChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode OpenRouter request: %v", err)
		}
		if len(req.Messages) == 0 {
			t.Fatalf("OpenRouter request has no messages")
		}
		if len(req.Messages) < 2 {
			t.Fatalf("OpenRouter summary request messages = %+v, want system+user", req.Messages)
		}
		capturedContent = req.Messages[1].Content
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"{\"localized_title\":\"标题\",\"summary\":\"摘要\",\"core_insight\":\"洞察\",\"key_points\":[\"中文要点一说明来源事实。\",\"中文要点二说明来源事实。\",\"中文要点三说明来源事实。\"],\"value_tier\":\"high\",\"model_status\":\"ok\"}"}}]}`)
	}))
	t.Cleanup(server.Close)
	client := NewOpenRouterClient(OpenRouterConfig{APIKey: "sk-test-secret", Endpoint: server.URL})
	if _, err := client.SummarizeItem(ctx, OpenRouterSummaryInput{ItemID: "item", Title: "Title", SourceTitle: "Source", URL: "https://example.com/item", AvailableText: "body", TargetLanguage: ProcessingLanguageChinese}); err != nil {
		t.Fatalf("SummarizeItem: %v", err)
	}
	if !strings.Contains(capturedContent, `"target_language":"zh"`) {
		t.Fatalf("OpenRouter prompt missing target_language zh: %s", capturedContent)
	}
	if !strings.Contains(capturedContent, "Write generated user-readable fields in item.target_language") || !strings.Contains(capturedContent, "Keep URLs, source identifiers") {
		t.Fatalf("OpenRouter prompt missing explicit target-language output rule: %s", capturedContent)
	}
	if capturedAuth != "Bearer sk-test-secret" {
		t.Fatalf("OpenRouter Authorization header not set for request")
	}
	var leaked int
	if err := db.QueryRowContext(ctx, `select count(*) from runtime_metadata where value like '%sk-test-secret%'`).Scan(&leaked); err != nil {
		t.Fatalf("query runtime metadata secret leak: %v", err)
	}
	if leaked != 0 {
		t.Fatalf("OpenRouter secret persisted to runtime_metadata")
	}
}

type languageAwareLLM struct{}

func (l *languageAwareLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{
		LocalizedTitle: string(input.TargetLanguage) + " title " + input.Title,
		Title:          string(input.TargetLanguage) + " title " + input.Title,
		FeedExcerpt:    string(input.TargetLanguage) + " excerpt " + input.Title,
		ExtractedText:  string(input.TargetLanguage) + " extracted " + input.Title,
		Summary:        string(input.TargetLanguage) + " summary " + input.Title,
		CoreInsight:    string(input.TargetLanguage) + " insight " + input.Title,
		KeyPoints:      []string{string(input.TargetLanguage) + " point one for " + input.Title, string(input.TargetLanguage) + " point two for " + input.Title, string(input.TargetLanguage) + " point three for " + input.Title},
		ValueTier:      "high",
		ModelStatus:    modelStatusOK,
	}, nil
}

func (l *languageAwareLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type countingSummaryLLM struct {
	calls atomic.Int64
}

func (l *countingSummaryLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.calls.Add(1)
	out := ccrTestSummaryOutput("title "+input.Title, "summary "+input.Title, "insight "+input.Title, "high")
	out.FeedExcerpt = "excerpt " + input.Title
	out.ExtractedText = "extracted " + input.Title
	return out, nil
}

func (l *countingSummaryLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type emptySourceEvidenceZHLLM struct{}

func (emptySourceEvidenceZHLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{LocalizedTitle: "中文标题", Title: "中文标题", Summary: "中文摘要说明来源事实", CoreInsight: "中文洞察说明来源事实。", KeyPoints: []string{"中文要点一说明来源事实。", "中文要点二说明来源事实。", "中文要点三说明来源事实。"}, ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (emptySourceEvidenceZHLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type storedText struct {
	title         string
	summary       string
	coreInsight   string
	feedExcerpt   string
	extractedText string
}

func seedSource(t *testing.T, ctx context.Context, db *sql.DB, id string, sourceURL string, title string) {
	t.Helper()
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'not_fetched', 1, 1)`, id, sourceURL, title, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("insert source %s: %v", id, err)
	}
}

func itemIDByURL(t *testing.T, ctx context.Context, db *sql.DB, itemURL string) string {
	t.Helper()
	var id string
	if err := db.QueryRowContext(ctx, `select id from items where url = ?`, itemURL).Scan(&id); err != nil {
		t.Fatalf("read item id by URL %s: %v", itemURL, err)
	}
	return id
}

func readStoredText(t *testing.T, ctx context.Context, db *sql.DB, itemID string) storedText {
	t.Helper()
	var text storedText
	if err := db.QueryRowContext(ctx, `select title, coalesce(summary, ''), coalesce(core_insight, ''), coalesce(feed_excerpt, ''), coalesce(extracted_text, '') from items where id = ?`, itemID).Scan(&text.title, &text.summary, &text.coreInsight, &text.feedExcerpt, &text.extractedText); err != nil {
		t.Fatalf("read stored text %s: %v", itemID, err)
	}
	return text
}
