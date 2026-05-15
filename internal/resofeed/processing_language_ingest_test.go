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
		capturedContent = req.Messages[0].Content
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"{\"summary\":\"摘要\",\"core_insight\":\"洞察\",\"value_tier\":\"high\",\"model_status\":\"ok\"}"}}]}`)
	}))
	t.Cleanup(server.Close)
	client := NewOpenRouterClient(OpenRouterConfig{APIKey: "sk-test-secret", Endpoint: server.URL})
	if _, err := client.SummarizeItem(ctx, OpenRouterSummaryInput{ItemID: "item", Title: "Title", SourceTitle: "Source", URL: "https://example.com/item", AvailableText: "body", TargetLanguage: ProcessingLanguageChinese}); err != nil {
		t.Fatalf("SummarizeItem: %v", err)
	}
	if !strings.Contains(capturedContent, `"target_language":"zh"`) {
		t.Fatalf("OpenRouter prompt missing target_language zh: %s", capturedContent)
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
		Title:         string(input.TargetLanguage) + " title " + input.Title,
		FeedExcerpt:   string(input.TargetLanguage) + " excerpt " + input.Title,
		ExtractedText: string(input.TargetLanguage) + " extracted " + input.Title,
		Summary:       string(input.TargetLanguage) + " summary " + input.Title,
		CoreInsight:   string(input.TargetLanguage) + " insight " + input.Title,
		ValueTier:     "high",
		ModelStatus:   modelStatusOK,
	}, nil
}

func (l *languageAwareLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
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
