package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// expected_result: red
// These tests define the Inspector selected-item re-ingest contract before the
// production path exists. They deliberately preserve the stable ResoFeed summary
// schema from docs/implementation-notes/item-reingest-prompt-schema-authority.yaml.

func TestItemReingestHTTPValidationResponseShapeAndLanguageExclusion(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: itemReingestLLM{}})

	unknown := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-unknown","language":"zh"}`)
	assertStatus(t, unknown, http.StatusBadRequest)
	assertErrorField(t, unknown.Body.Bytes(), "language")

	missingKey := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"human","actor_id":"owner"}`)
	assertStatus(t, missingKey, http.StatusBadRequest)
	assertErrorField(t, missingKey.Body.Bytes(), "idempotency_key")

	missingItem := postItemReingestRaw(t, router, "missing_item", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-missing"}`)
	assertStatus(t, missingItem, http.StatusNotFound)

	success := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-success"}`)
	assertStatus(t, success, http.StatusOK)
	var parsed ItemReingestResponse
	if err := json.Unmarshal(success.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal item reingest response: %v; body=%s", err, success.Body.String())
	}
	if parsed.AlreadyApplied || parsed.Reingest.ItemID != "item_reingest_01" || parsed.Reingest.Status != ReprocessStatusCompleted || !parsed.Reingest.ItemUpdated || !parsed.Reingest.FTSUpdated || parsed.Reingest.Item == nil {
		t.Fatalf("item reingest response = %+v, want completed item update with refreshed detail", parsed)
	}
}

func TestItemReingestCoreRefreshesOnlySelectedItemAndFTS(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	assertReprocessIndexReady(t, ctx, db)

	resp, err := ReingestItem(ctx, db, itemReingestLLM{}, "item_reingest_01", ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "core-reingest-001"}})
	if err != nil {
		t.Fatalf("ReingestItem returned error: %v", err)
	}
	if resp.Reingest.Status != ReprocessStatusCompleted || !resp.Reingest.ItemUpdated || !resp.Reingest.FTSUpdated || resp.AlreadyApplied {
		t.Fatalf("ReingestItem response = %+v, want fresh completed update", resp)
	}
	updated := readItemReingestText(t, ctx, db, "item_reingest_01")
	if updated.summary != "summary selected article body" || updated.coreInsight != "core selected article body" || updated.valueTier != "high" {
		t.Fatalf("selected item text = %+v, want stable schema rewrite", updated)
	}
	untouched := readItemReingestText(t, ctx, db, "item_reingest_other")
	if untouched.summary != "PRIOR summary other" || untouched.coreInsight != "PRIOR insight other" {
		t.Fatalf("non-selected item changed: %+v", untouched)
	}
	if count := reprocessFTSCount(t, ctx, db, "item_reingest_01", `"summary selected"`); count != 1 {
		t.Fatalf("selected item FTS count = %d, want refreshed selected row", count)
	}
	if count := reprocessFTSCount(t, ctx, db, "item_reingest_01", `"PRIOR summary selected"`); count != 0 {
		t.Fatalf("selected item FTS retained stale prior text count=%d", count)
	}
}

func TestItemReingestIdempotencyAndConflictContract(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: itemReingestLLM{}})

	release, err := tryAcquireIngestGuardWithActor(ctx, "item_reingest", "item_reingest_01", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("hold item reingest guard: %v", err)
	}
	conflict := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-conflict"}`)
	assertStatus(t, conflict, http.StatusConflict)
	var conflictBody ErrorBody
	if err := json.Unmarshal(conflict.Body.Bytes(), &conflictBody); err != nil {
		t.Fatalf("unmarshal conflict: %v", err)
	}
	assertConflictDetailsWithCurrentOperation(t, conflictBody.Error.Details, "item_reingest", "human")
	release()

	body := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-idempotent"}`
	first := postItemReingestRaw(t, router, "item_reingest_01", body)
	assertStatus(t, first, http.StatusOK)
	second := postItemReingestRaw(t, router, "item_reingest_01", body)
	assertStatus(t, second, http.StatusOK)
	var replay ItemReingestResponse
	if err := json.Unmarshal(second.Body.Bytes(), &replay); err != nil {
		t.Fatalf("unmarshal replay: %v; body=%s", err, second.Body.String())
	}
	if !replay.AlreadyApplied {
		t.Fatalf("second reingest response = %+v, want already_applied replay", replay)
	}
	mismatch := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"agent","actor_id":"agent-1","idempotency_key":"reingest-idempotent"}`)
	assertStatus(t, mismatch, http.StatusBadRequest)
	assertErrorField(t, mismatch.Body.Bytes(), "idempotency_key")
}

func TestItemReingestConsumesStablePromptSchemaAuthority(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	llm := &schemaRecordingReingestLLM{}

	_, err := ReingestItem(ctx, db, llm, "item_reingest_01", ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "schema-authority-reingest"}})
	if err != nil {
		t.Fatalf("ReingestItem returned error: %v", err)
	}
	if llm.seen.ItemID != "item_reingest_01" || llm.seen.TargetLanguage != ProcessingLanguageEnglish || strings.TrimSpace(llm.seen.AvailableText) == "" {
		t.Fatalf("summary input = %+v, want selected item id/current language/source text", llm.seen)
	}
	for _, forbidden := range []string{"article_id", "score", "tags", "insight", "key_points"} {
		if outputKeysContainForbiddenSchemaField(llm.outputKeys, forbidden) {
			t.Fatalf("reingest schema consumed forbidden rss-agent field %q in keys %q", forbidden, llm.outputKeys)
		}
	}
}

func outputKeysContainForbiddenSchemaField(outputKeys string, forbidden string) bool {
	for _, key := range strings.Fields(strings.ToLower(outputKeys)) {
		if key == forbidden {
			return true
		}
	}
	return false
}

func postItemReingestRaw(t *testing.T, router http.Handler, itemID string, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPost, "/api/items/"+itemID+"/reingest", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	return recorder
}

func seedItemReingestFixture(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Date(2026, 5, 21, 10, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/selected":
			_, _ = io.WriteString(w, `<html><body><article>selected article body</article></body></html>`)
		case "/other":
			_, _ = io.WriteString(w, `<html><body><article>other article body</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	seedSource(t, ctx, db, "src_item_reingest", server.URL+"/feed.xml", "Item Reingest Source")
	for _, row := range []struct{ id, path, summary, insight string }{
		{id: "item_reingest_01", path: "/selected", summary: "PRIOR summary selected", insight: "PRIOR insight selected"},
		{id: "item_reingest_other", path: "/other", summary: "PRIOR summary other", insight: "PRIOR insight other"},
	} {
		_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, feed_excerpt, extracted_text, value_tier, first_seen_at, extraction_status, model_status) values (?, 'src_item_reingest', ?, ?, ?, ?, ?, ?, ?, ?, 'brief', ?, 'full', 'ok')`, row.id, server.URL+"/feed.xml", server.URL+row.path, server.URL+row.path, "PRIOR title "+row.id, row.summary, row.insight, "PRIOR excerpt "+row.id, "PRIOR extracted "+row.id, now.Format(time.RFC3339))
		if err != nil {
			t.Fatalf("insert item reingest fixture %s: %v", row.id, err)
		}
	}
}

type itemReingestText struct{ summary, coreInsight, valueTier string }

func readItemReingestText(t *testing.T, ctx context.Context, db *sql.DB, itemID string) itemReingestText {
	t.Helper()
	var text itemReingestText
	if err := db.QueryRowContext(ctx, `select coalesce(summary, ''), coalesce(core_insight, ''), coalesce(value_tier, '') from items where id = ?`, itemID).Scan(&text.summary, &text.coreInsight, &text.valueTier); err != nil {
		t.Fatalf("read item text %s: %v", itemID, err)
	}
	return text
}

type itemReingestLLM struct{}

func (itemReingestLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	if strings.TrimSpace(input.AvailableText) == "" {
		return OpenRouterSummaryOutput{}, errors.New("available text required")
	}
	out := ccrTestSummaryOutput("title "+input.ItemID, "summary "+input.AvailableText, "core "+input.AvailableText, "high")
	out.FeedExcerpt = "excerpt " + input.AvailableText
	out.ExtractedText = "extracted " + input.AvailableText
	return out, nil
}

func (itemReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type schemaRecordingReingestLLM struct {
	seen       OpenRouterSummaryInput
	outputKeys string
}

func (l *schemaRecordingReingestLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.seen = input
	l.outputKeys = "title feed_excerpt extracted_text summary core_insight value_tier model_status"
	return itemReingestLLM{}.SummarizeItem(context.Background(), input)
}

func (l *schemaRecordingReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}
