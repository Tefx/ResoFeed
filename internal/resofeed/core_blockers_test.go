package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
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

	if err := IngestOnce(ctx, db, IngestConfig{LLM: staticGemini{summary: "Dense sqlite summary", coreInsight: "Why sqlite matters", valueTier: "high"}}); err != nil {
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
	if items[0].ValueTier == nil || *items[0].ValueTier != "high" {
		t.Fatalf("search item value_tier = %v, want high exposed on production read path", items[0].ValueTier)
	}
	detail, err := ReadItemDetail(ctx, db, items[0].ID)
	if err != nil {
		t.Fatalf("ReadItemDetail returned error: %v", err)
	}
	if detail.ValueTier == nil || *detail.ValueTier != "high" {
		t.Fatalf("detail value_tier = %v, want high exposed on production detail path", detail.ValueTier)
	}
}

func TestValueTierExposedThroughHTTPAndMCPReadPaths(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_value", "https://value.example/feed.xml", "Value")
	insertRankedItem(t, ctx, db, "item_value", "src_value", "Value tier story", now)
	_, err := db.ExecContext(ctx, `update items set value_tier = 'high' where id = 'item_value'`)
	if err != nil {
		t.Fatalf("update value_tier: %v", err)
	}

	server := httptest.NewServer(NewRouter(HTTPServerConfig{DB: db, OwnerToken: "owner-token-value-tier-0123456789"}))
	defer server.Close()
	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/feed/today?limit=10", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer owner-token-value-tier-0123456789")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http today: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var today TodayFeedResponse
	if err := json.NewDecoder(resp.Body).Decode(&today); err != nil {
		t.Fatalf("decode today: %v", err)
	}
	if len(today.Items) != 1 || today.Items[0].ValueTier == nil || *today.Items[0].ValueTier != "high" {
		t.Fatalf("HTTP today items = %+v, want value_tier high", today.Items)
	}

	mcp, err := ListCandidateItemsForMCP(ctx, db, MCPListCandidateItemsInput{Limit: 10})
	if err != nil {
		t.Fatalf("ListCandidateItemsForMCP returned error: %v", err)
	}
	if len(mcp.Items) != 1 || mcp.Items[0].ValueTier == nil || *mcp.Items[0].ValueTier != "high" {
		t.Fatalf("MCP items = %+v, want value_tier high", mcp.Items)
	}
}

func TestStrictFilterAndBoostSteeringExecuteOnRealFeedRanking(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_policy", "https://policy.example/feed.xml", "Policy")
	insertRankedItem(t, ctx, db, "item_rust", "src_policy", "Rust compiler release", now.Add(-1*time.Hour))
	insertRankedItem(t, ctx, db, "item_crypto", "src_policy", "Crypto token launch", now.Add(-30*time.Minute))
	insertRankedItem(t, ctx, db, "item_sqlite_policy", "src_policy", "SQLite storage analysis", now.Add(-2*time.Hour))

	if _, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Filter out crypto token coverage.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "filter-crypto"}}); err != nil {
		t.Fatalf("filter ApplySteering returned error: %v", err)
	}
	if _, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Push more sqlite storage analysis.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "boost-sqlite"}}); err != nil {
		t.Fatalf("boost ApplySteering returned error: %v", err)
	}
	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: 10, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) == 0 || items[0].ID != "item_sqlite_policy" {
		t.Fatalf("ranked items = %+v, want boosted sqlite item first", items)
	}
	for _, item := range items {
		if item.ID == "item_crypto" {
			t.Fatalf("ranked items = %+v, filtered crypto item should not be returned", items)
		}
	}
}

func TestInspectionOfControversialItemDoesNotCreateDurablePreference(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_controversy", "https://controversy.example/feed.xml", "Controversy")
	insertRankedItem(t, ctx, db, "item_old_opposing", "src_controversy", "Opposing controversial view inspected", now.Add(-24*time.Hour))
	insertRankedItem(t, ctx, db, "item_new_neutral", "src_controversy", "Neutral policy update", now.Add(-30*time.Minute))
	insertRankedItem(t, ctx, db, "item_new_opposing", "src_controversy", "Opposing controversial follow up", now.Add(-2*time.Hour))
	if _, err := MarkItemInspected(ctx, db, "item_old_opposing", InspectRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "inspect-opposing"}}); err != nil {
		t.Fatalf("MarkItemInspected returned error: %v", err)
	}
	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: 10, Now: now})
	if err != nil {
		t.Fatalf("ListTodayFeed returned error: %v", err)
	}
	if len(items) < 2 {
		t.Fatalf("ranked items = %+v, want at least two candidates", items)
	}
	if items[0].ID == "item_new_opposing" {
		t.Fatalf("ranked items = %+v, inspected opposing topic should not outrank fresher neutral item as durable preference", items)
	}
}

func TestMCPDeliverySuppressesCandidateUntilFreshRelatedDevelopment(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_mcp_delivery", "https://delivery.example/feed.xml", "Delivery")
	story := "story_delivery"
	insertRankedItem(t, ctx, db, "item_delivered", "src_mcp_delivery", "Delivery story original", now.Add(-72*time.Hour))
	_, err := db.ExecContext(ctx, `update items set story_key = ? where id = 'item_delivered'`, story)
	if err != nil {
		t.Fatalf("set delivered story key: %v", err)
	}
	_, err = ReportDeliveryForMCP(ctx, db, MCPReportDeliveryInput{ItemID: "item_delivered", ActorID: "briefing-agent", DeliveredAt: now.Add(-30 * time.Minute), IdempotencyKey: "delivery-1"})
	if err != nil {
		t.Fatalf("ReportDeliveryForMCP returned error: %v", err)
	}
	withoutRelated, err := ListCandidateItemsForMCP(ctx, db, MCPListCandidateItemsInput{Limit: 10})
	if err != nil {
		t.Fatalf("ListCandidateItemsForMCP without related returned error: %v", err)
	}
	for _, item := range withoutRelated.Items {
		if item.ID == "item_delivered" {
			t.Fatalf("MCP candidates = %+v, delivered item should be suppressed without fresh related development", withoutRelated.Items)
		}
	}
	insertRankedItem(t, ctx, db, "item_related", "src_mcp_delivery", "Delivery story related development", now.Add(30*time.Minute))
	_, err = db.ExecContext(ctx, `update items set story_key = ? where id = 'item_related'`, story)
	if err != nil {
		t.Fatalf("set related story key: %v", err)
	}
	withRelated, err := ListCandidateItemsForMCP(ctx, db, MCPListCandidateItemsInput{Limit: 10})
	if err != nil {
		t.Fatalf("ListCandidateItemsForMCP with related returned error: %v", err)
	}
	seenDelivered := false
	seenRelated := false
	for _, item := range withRelated.Items {
		seenDelivered = seenDelivered || item.ID == "item_delivered"
		seenRelated = seenRelated || item.ID == "item_related"
	}
	if !seenDelivered || !seenRelated {
		t.Fatalf("MCP candidates = %+v, want delivered item resurfaced with fresh related development", withRelated.Items)
	}
}

func TestHumanSteeringSupersedesPriorAgentRuleWithSupersededBy(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Push more robotics briefings.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: "briefing-agent", IdempotencyKey: "agent-robotics"}}); err != nil {
		t.Fatalf("agent ApplySteering returned error: %v", err)
	}
	humanResult, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Push more climate analysis.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "human-climate"}})
	if err != nil {
		t.Fatalf("human ApplySteering returned error: %v", err)
	}
	if len(humanResult.Receipt.ChangedRules) != 1 {
		t.Fatalf("human receipt = %+v, want one changed rule", humanResult.Receipt)
	}
	var isActive bool
	var supersededBy sql.NullString
	if err := db.QueryRowContext(ctx, `select is_active, superseded_by from steer_rules where created_by_actor_kind = 'agent'`).Scan(&isActive, &supersededBy); err != nil {
		t.Fatalf("read superseded agent rule: %v", err)
	}
	if isActive || !supersededBy.Valid || supersededBy.String != humanResult.Receipt.ChangedRules[0].ID {
		t.Fatalf("agent rule active=%v superseded_by=%v, want inactive superseded by %s", isActive, supersededBy, humanResult.Receipt.ChangedRules[0].ID)
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
	if len(agentResult.Receipt.ChangedRules) != 1 || strings.Contains(agentResult.Receipt.Message, "human steering") {
		t.Fatalf("agent receipt = %+v, want non-conflicting delegated-agent steering accepted", agentResult.Receipt)
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
	for _, want := range []string{"rss: errors=1", "connection refused", "openrouter: item=item_diag", "model_latency_error", "extraction: item=item_diag", "partial_extraction", "ingest: last_run=2026-05-09T12:00:00Z"} {
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

func TestReadItemDetailPreservesFullStatusWithoutRawSourceText(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 12, 9, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_full_no_raw", "https://full-no-raw.example/feed.xml", "Full No Raw")
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, 'full', 'ok')`, "item_full_no_raw", "src_full_no_raw", "https://full-no-raw.example/feed.xml", "https://full-no-raw.example/item", "https://full-no-raw.example/item", "Model-backed detail without raw source text", "model-backed summary from acquired article evidence", "model-backed insight from acquired article evidence", "high", now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert full no raw item: %v", err)
	}

	detail, err := ReadItemDetail(ctx, db, "item_full_no_raw")
	if err != nil {
		t.Fatalf("ReadItemDetail returned error: %v", err)
	}
	if detail.ExtractionStatus != extractionStatusFull {
		t.Fatalf("detail extraction_status = %q, want %q", detail.ExtractionStatus, extractionStatusFull)
	}
	if strings.TrimSpace(derefString(detail.FeedExcerpt)) != "" || strings.TrimSpace(derefString(detail.ExtractedText)) != "" {
		t.Fatalf("detail raw source fields = feed_excerpt:%q extracted_text:%q, want empty", derefString(detail.FeedExcerpt), derefString(detail.ExtractedText))
	}
}

func TestDeliverySharedApplicationOperationPreservesHTTPMCPParity(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	itemID := "delivery/shared%opaque"
	insertSource(t, ctx, db, "src_delivery_shared", "https://delivery-shared.example/feed.xml", "Shared delivery")
	insertRankedItem(t, ctx, db, itemID, "src_delivery_shared", "Shared delivery operation", time.Date(2026, 7, 16, 8, 0, 0, 0, time.UTC))

	const ownerToken = "delivery-shared-owner-token-0123456789"
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: ownerToken})
	token := "~" + base64.RawURLEncoding.EncodeToString([]byte(itemID))
	path := "/api/items/" + token + "/delivery"
	postDelivery := func(path string, body string) *httptest.ResponseRecorder {
		t.Helper()
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer "+ownerToken)
		request.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, request)
		return recorder
	}
	decodeDelivery := func(recorder *httptest.ResponseRecorder) DeliveryReportResult {
		t.Helper()
		var result DeliveryReportResult
		if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
			t.Fatalf("decode delivery response: %v; body=%s", err, recorder.Body.String())
		}
		return result
	}

	httpBody := `{"actor_kind":"agent","actor_id":"shared-agent","delivered_at":"2026-07-16T09:00:00Z","idempotency_key":"delivery-http-mcp-shared"}`
	httpFirstRecorder := postDelivery(path, httpBody)
	if httpFirstRecorder.Code != http.StatusOK {
		t.Fatalf("HTTP first delivery status=%d body=%s", httpFirstRecorder.Code, httpFirstRecorder.Body.String())
	}
	httpFirst := decodeDelivery(httpFirstRecorder)
	wantHTTPAt := time.Date(2026, 7, 16, 9, 0, 0, 0, time.UTC)
	if httpFirst.ItemID != itemID || httpFirst.AlreadyApplied || !httpFirst.ExternalSurfacedAt.Equal(wantHTTPAt) {
		t.Fatalf("HTTP first delivery=%+v, want fresh canonical-token result for %q at %s", httpFirst, itemID, wantHTTPAt)
	}

	httpReplayRecorder := postDelivery(path, httpBody)
	if httpReplayRecorder.Code != http.StatusOK {
		t.Fatalf("HTTP replay status=%d body=%s", httpReplayRecorder.Code, httpReplayRecorder.Body.String())
	}
	httpReplay := decodeDelivery(httpReplayRecorder)
	if !httpReplay.AlreadyApplied || httpReplay.ItemID != itemID || !httpReplay.ExternalSurfacedAt.Equal(wantHTTPAt) {
		t.Fatalf("HTTP replay=%+v, want stored result with already_applied", httpReplay)
	}

	httpMismatch := postDelivery(path, `{"actor_kind":"agent","actor_id":"shared-agent","delivered_at":"2026-07-16T09:30:00Z","idempotency_key":"delivery-http-mcp-shared"}`)
	if httpMismatch.Code != http.StatusBadRequest {
		t.Fatalf("HTTP mismatched replay status=%d body=%s", httpMismatch.Code, httpMismatch.Body.String())
	}
	var httpMismatchBody ErrorBody
	if err := json.Unmarshal(httpMismatch.Body.Bytes(), &httpMismatchBody); err != nil {
		t.Fatalf("decode HTTP mismatch: %v", err)
	}
	if httpMismatchBody.Error.Details["field"] != "idempotency_key" || httpMismatchBody.Error.Details["reason"] != "request_fingerprint_mismatch" {
		t.Fatalf("HTTP mismatch details=%#v", httpMismatchBody.Error.Details)
	}

	plusTwo := time.FixedZone("UTC+2", 2*60*60)
	mcpReplay, err := ReportDeliveryForMCP(ctx, db, MCPReportDeliveryInput{
		ItemID:         itemID,
		ActorID:        "shared-agent",
		DeliveredAt:    time.Date(2026, 7, 16, 11, 0, 0, 0, plusTwo),
		IdempotencyKey: "delivery-http-mcp-shared",
	})
	if err != nil {
		t.Fatalf("MCP cross-transport replay returned error: %v", err)
	}
	if !mcpReplay.AlreadyApplied || mcpReplay.ItemID != itemID || !mcpReplay.ExternalSurfacedAt.Equal(wantHTTPAt) {
		t.Fatalf("MCP cross-transport replay=%+v, want HTTP receipt snapshot", mcpReplay)
	}

	mcpAt := time.Date(2026, 7, 16, 10, 0, 0, 0, time.UTC)
	mcpInput := MCPReportDeliveryInput{ItemID: itemID, ActorID: "mcp-agent", DeliveredAt: mcpAt, IdempotencyKey: "delivery-mcp-fresh"}
	mcpFirst, err := ReportDeliveryForMCP(ctx, db, mcpInput)
	if err != nil {
		t.Fatalf("MCP fresh delivery returned error: %v", err)
	}
	if mcpFirst.AlreadyApplied || mcpFirst.ItemID != itemID || !mcpFirst.ExternalSurfacedAt.Equal(mcpAt) {
		t.Fatalf("MCP fresh delivery=%+v", mcpFirst)
	}
	mcpReplay, err = ReportDeliveryForMCP(ctx, db, mcpInput)
	if err != nil {
		t.Fatalf("MCP replay returned error: %v", err)
	}
	if !mcpReplay.AlreadyApplied || !mcpReplay.ExternalSurfacedAt.Equal(mcpAt) {
		t.Fatalf("MCP replay=%+v, want stored result with already_applied", mcpReplay)
	}
	mcpInput.DeliveredAt = mcpAt.Add(time.Hour)
	_, err = ReportDeliveryForMCP(ctx, db, mcpInput)
	var mismatchField mcpFieldError
	if !errors.As(err, &mismatchField) || mismatchField.field != "idempotency_key" || mismatchField.reason != "request_fingerprint_mismatch" {
		t.Fatalf("MCP mismatched replay error=%v field=%q reason=%q", err, mismatchField.field, mismatchField.reason)
	}

	var storedAt, actorKind, actorID string
	if err := db.QueryRowContext(ctx, `select external_surfaced_at, last_actor_kind, last_actor_id from item_state where item_id = ?`, itemID).Scan(&storedAt, &actorKind, &actorID); err != nil {
		t.Fatalf("read shared delivery state: %v", err)
	}
	if storedAt != mcpAt.Format(time.RFC3339Nano) || actorKind != string(ActorKindAgent) || actorID != "mcp-agent" {
		t.Fatalf("shared delivery state at=%q actor_kind=%q actor_id=%q", storedAt, actorKind, actorID)
	}

	missingID := "missing/delivery%opaque"
	missingToken := "~" + base64.RawURLEncoding.EncodeToString([]byte(missingID))
	httpMissing := postDelivery("/api/items/"+missingToken+"/delivery", `{"actor_kind":"agent","actor_id":"shared-agent","delivered_at":"2026-07-16T09:00:00Z","idempotency_key":"delivery-http-missing"}`)
	if httpMissing.Code != http.StatusNotFound {
		t.Fatalf("HTTP missing delivery status=%d body=%s", httpMissing.Code, httpMissing.Body.String())
	}
	var httpMissingBody ErrorBody
	if err := json.Unmarshal(httpMissing.Body.Bytes(), &httpMissingBody); err != nil {
		t.Fatalf("decode HTTP missing: %v", err)
	}
	if httpMissingBody.Error.Code != "not_found" || httpMissingBody.Error.Details["id"] != missingID {
		t.Fatalf("HTTP missing response=%+v", httpMissingBody)
	}
	_, err = ReportDeliveryForMCP(ctx, db, MCPReportDeliveryInput{ItemID: missingID, ActorID: "mcp-agent", DeliveredAt: mcpAt, IdempotencyKey: "delivery-mcp-missing"})
	var missingErr mcpNotFoundError
	if !errors.As(err, &missingErr) || missingErr.kind != "item" || missingErr.id != missingID {
		t.Fatalf("MCP missing delivery error=%v", err)
	}

	validRequest := DeliveryReportRequest{DeliveredAt: mcpAt, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: "mcp-agent", IdempotencyKey: "delivery-core-error"}}
	if _, err := ReportDelivery(ctx, nil, itemID, validRequest); err == nil || !strings.Contains(err.Error(), "db is nil") {
		t.Fatalf("core nil DB error=%v", err)
	}
	if _, err := ReportDelivery(ctx, db, missingID, validRequest); !errors.As(err, &missingErr) {
		t.Fatalf("core missing item error=%v", err)
	}

	var receiptCount int
	if err := db.QueryRowContext(ctx, `select count(*) from agent_receipts where operation = 'report_delivery'`).Scan(&receiptCount); err != nil {
		t.Fatalf("count delivery receipts: %v", err)
	}
	if receiptCount != 2 {
		t.Fatalf("delivery receipt count=%d, want only successful HTTP-shared and MCP-fresh receipts", receiptCount)
	}
	var durableDeliveryTables int
	if err := db.QueryRowContext(ctx, `select count(*) from sqlite_master where type = 'table' and name like 'delivery_%'`).Scan(&durableDeliveryTables); err != nil {
		t.Fatalf("inspect delivery persistence tables: %v", err)
	}
	if durableDeliveryTables != 0 {
		t.Fatalf("durable delivery table count=%d, want current item_state only", durableDeliveryTables)
	}
}

type staticGemini struct {
	summary     string
	coreInsight string
	valueTier   string
}

func (g staticGemini) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	out := ccrTestSummaryOutput(input.Title, g.summary, g.coreInsight, g.valueTier)
	out.FeedExcerpt = "Static sqlite excerpt."
	out.ExtractedText = "Static sqlite extracted text."
	return out, nil
}

func (g staticGemini) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, context.DeadlineExceeded
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
