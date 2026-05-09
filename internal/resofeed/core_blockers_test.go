package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestExportStateUsesCurrentCreationTimeAfterImport(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	importedAt := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	_, err := ImportState(ctx, db, strings.NewReader(`{"schema_version":"resofeed.state.v1","exported_at":"`+importedAt.Format(time.RFC3339)+`","sources":[],"steer_rules":[],"resonated_items":[]}`))
	if err != nil {
		t.Fatalf("ImportState returned error: %v", err)
	}
	before := time.Now().UTC().Add(-time.Second)
	var out bytes.Buffer
	if err := ExportState(ctx, db, &out); err != nil {
		t.Fatalf("ExportState returned error: %v", err)
	}
	var bundle StateBundle
	if err := json.Unmarshal(out.Bytes(), &bundle); err != nil {
		t.Fatalf("unmarshal exported bundle: %v", err)
	}
	if bundle.ExportedAt.Equal(importedAt) || bundle.ExportedAt.Before(before) {
		t.Fatalf("exported_at = %s, want current export creation time after %s and not imported %s", bundle.ExportedAt, before, importedAt)
	}
}

func TestIngestPersistsValueTierAndFreshSearchIndex(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body>fresh provenance body about sqlite verification</body></html>`)
	}))
	defer article.Close()
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Core Source</title><item><guid>one</guid><title>SQLite Provenance</title><link>`+article.URL+`/item</link><description>feed excerpt provenance</description><pubDate>Sat, 09 May 2026 12:00:00 +0000</pubDate></item></channel></rss>`)
	}))
	defer feed.Close()
	insertSource(t, ctx, db, "src_ingest", feed.URL+"/feed.xml", "Old Source")

	if err := IngestOnce(ctx, db, IngestConfig{Gemini: staticGemini{summary: "Dense sqlite summary", coreInsight: "Why sqlite matters", valueTier: "high"}}); err != nil {
		t.Fatalf("IngestOnce returned error: %v", err)
	}
	var valueTier string
	if err := db.QueryRowContext(ctx, `select value_tier from items where source_id = 'src_ingest'`).Scan(&valueTier); err != nil {
		t.Fatalf("read ingested value_tier: %v", err)
	}
	if valueTier != "high" {
		t.Fatalf("value_tier = %q, want high", valueTier)
	}
	items, _, err := SearchItems(ctx, db, SearchQuery{Q: "sqlite provenance", Limit: 10})
	if err != nil {
		t.Fatalf("SearchItems returned error: %v", err)
	}
	if len(items) != 1 || items[0].SourceTitle != "Core Source" || items[0].Title != "SQLite Provenance" {
		t.Fatalf("search items = %+v, want freshly indexed ingested item with source/title provenance", items)
	}
}

func TestImportRebuildsSearchIndexForRestoredResonatedProvenance(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	state := `{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[{"id":"src_restore","url":"https://restore.example/feed.xml","title":"Restore Source"}],"steer_rules":[],"resonated_items":[{"item_id":"item_restore","url":"https://restore.example/sqlite-provenance","source_url":"https://restore.example/feed.xml","title":"Restored SQLite Provenance"}]}`
	if _, err := ImportState(ctx, db, strings.NewReader(state)); err != nil {
		t.Fatalf("ImportState returned error: %v", err)
	}
	items, _, err := SearchItems(ctx, db, SearchQuery{Q: "sqlite provenance", Limit: 10})
	if err != nil {
		t.Fatalf("SearchItems returned error: %v", err)
	}
	if len(items) != 1 || !items[0].IsResonated || items[0].SourceTitle != "Restore Source" {
		t.Fatalf("search items = %+v, want restored resonated item searchable after import", items)
	}
}

func TestHumanSteeringAffectsRankingAndSupersedesAgentSteering(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_rank", "https://rank.example/feed.xml", "Rank")
	insertRankedItem(t, ctx, db, "item_plain", "src_rank", "General update", now.Add(-time.Hour))
	insertRankedItem(t, ctx, db, "item_sqlite", "src_rank", "SQLite internals deep dive", now.Add(-2*time.Hour))
	_, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Push more sqlite internals.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "human-sqlite"}})
	if err != nil {
		t.Fatalf("human ApplySteering returned error: %v", err)
	}
	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: 2, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) == 0 || items[0].ID != "item_sqlite" {
		t.Fatalf("ranked items = %+v, want human-steered sqlite item first", items)
	}
	agentResult, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Push more unrelated briefings.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: "briefing-agent", IdempotencyKey: "agent-unrelated"}})
	if err != nil {
		t.Fatalf("agent ApplySteering returned error: %v", err)
	}
	if len(agentResult.Receipt.ChangedRules) != 0 || !strings.Contains(agentResult.Receipt.Message, "human steering") {
		t.Fatalf("agent receipt = %+v, want human precedence rejection", agentResult.Receipt)
	}
}

func TestDoctorReportsRawRSSGeminiAndExtractionFailures(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_bad", "https://bad.example/feed.xml", "Bad")
	_, err := db.ExecContext(ctx, `update sources set last_fetch_at = ?, last_fetch_status = 'rss_fetch_error', last_fetch_error = 'connection refused' where id = 'src_bad'`, time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC).Format(time.RFC3339))
	if err != nil {
		t.Fatalf("update source diagnostics: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, first_seen_at, extraction_status, model_status) values ('item_diag', 'src_bad', 'https://bad.example/feed.xml', 'https://bad.example/item', 'Diagnostic failure', ?, 'partial_extraction', 'model_latency_error')`, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert diagnostic item: %v", err)
	}
	var out bytes.Buffer
	if err := WriteDoctor(ctx, db, &out); err != nil {
		t.Fatalf("WriteDoctor returned error: %v", err)
	}
	text := out.String()
	for _, want := range []string{"rss: errors=1", "connection refused", "gemini: item=item_diag", "model_latency_error", "extraction: item=item_diag", "partial_extraction", "ingest: last_run=2026-05-09T12:00:00Z"} {
		if !strings.Contains(text, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, text)
		}
	}
}

func TestReadItemDetailKeepsDuplicateOriginalRetrievable(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_dup", "https://dup.example/feed.xml", "Dup")
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	story := "story_dup"
	insertRankedItem(t, ctx, db, "item_original", "src_dup", "Original", now)
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, first_seen_at, extraction_status, model_status, story_key, duplicate_of_item_id) values ('item_duplicate', 'src_dup', 'https://dup.example/feed.xml', 'https://dup.example/duplicate', 'https://dup.example/canonical', 'Duplicate', ?, 'full', 'ok', ?, 'item_original')`, now.Format(time.RFC3339), story)
	if err != nil {
		t.Fatalf("insert duplicate item: %v", err)
	}
	detail, err := ReadItemDetail(ctx, db, "item_duplicate")
	if err != nil {
		t.Fatalf("ReadItemDetail duplicate returned error: %v", err)
	}
	if detail.Provenance.OriginalURL != "https://dup.example/duplicate" || detail.Provenance.DuplicateOfItemID == nil || *detail.Provenance.DuplicateOfItemID != "item_original" || detail.Provenance.StoryKey == nil || *detail.Provenance.StoryKey != story {
		t.Fatalf("duplicate detail provenance = %+v", detail.Provenance)
	}
}

type staticGemini struct {
	summary     string
	coreInsight string
	valueTier   string
}

func (g staticGemini) SummarizeItem(context.Context, GeminiSummaryInput) (GeminiSummaryOutput, error) {
	return GeminiSummaryOutput{Summary: g.summary, CoreInsight: g.coreInsight, ValueTier: g.valueTier, ModelStatus: modelStatusOK}, nil
}

func (g staticGemini) TranslateSteering(context.Context, GeminiSteeringInput) (GeminiSteeringOutput, error) {
	return GeminiSteeringOutput{}, context.DeadlineExceeded
}

func insertSource(t *testing.T, ctx context.Context, db execDB, id string, sourceURL string, title string) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'ok', 1, 1)`, id, sourceURL, title, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert source %s: %v", id, err)
	}
}

func insertRankedItem(t *testing.T, ctx context.Context, db execDB, id string, sourceID string, title string, publishedAt time.Time) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'full', 'ok')`, id, sourceID, "https://rank.example/feed.xml", "https://rank.example/"+id, title, title+" summary", title+" insight", publishedAt.Format(time.RFC3339), publishedAt.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert item %s: %v", id, err)
	}
}

type execDB interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}
