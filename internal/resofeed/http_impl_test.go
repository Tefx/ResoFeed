package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestHTTPHandlersExerciseCorePaths(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	t.Run("auth failure", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/feed/today", nil))

		assertStatus(t, recorder, http.StatusUnauthorized)
		assertJSONFixture(t, recorder.Body.Bytes(), "error_unauthorized.json")
	})

	t.Run("feed today", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/feed/today?limit=1", nil))

		assertStatus(t, recorder, http.StatusOK)
		assertContentType(t, recorder, "application/json; charset=utf-8")
		var parsed TodayFeedResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal feed response: %v; body=%s", err, recorder.Body.String())
		}
		if len(parsed.Items) != 1 || parsed.Items[0].ID != "item_http_01" {
			t.Fatalf("feed items = %+v, want seeded item_http_01", parsed.Items)
		}
	})

	t.Run("search", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/search?q=sqlite&source=HTTP%20Source&from=2026-05-01&to=2026-05-31&resonated=false&limit=5", nil))

		assertStatus(t, recorder, http.StatusOK)
		var parsed SearchResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal search response: %v; body=%s", err, recorder.Body.String())
		}
		if parsed.Query.Q != "sqlite" || parsed.Query.Source == nil || *parsed.Query.Source != "HTTP Source" || parsed.Query.Resonated == nil || *parsed.Query.Resonated || parsed.Query.Limit != 5 {
			t.Fatalf("search query echo = %+v", parsed.Query)
		}
		if len(parsed.Items) != 1 || parsed.Items[0].ID != "item_http_01" {
			t.Fatalf("search items = %+v, want seeded item_http_01", parsed.Items)
		}
	})

	t.Run("search hyphenated no match is empty not internal", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/search?q=no-match-pbar-expected-red-zzzz&limit=5", nil))

		assertStatus(t, recorder, http.StatusOK)
		var parsed SearchResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal hyphenated no-match search response: %v; body=%s", err, recorder.Body.String())
		}
		if parsed.Query.Q != "no-match-pbar-expected-red-zzzz" || len(parsed.Items) != 0 {
			t.Fatalf("hyphenated no-match search items=%+v query=%+v, want stable empty result for submitted query", parsed.Items, parsed.Query)
		}
	})

	t.Run("feed today offset pages beyond first visible batch", func(t *testing.T) {
		for i := 0; i < 60; i++ {
			published := now.Add(time.Duration(i+1) * time.Minute).Format(time.RFC3339)
			id := "item_http_bulk_" + strconv.Itoa(i)
			_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text) values (?, 'src_http', 'https://http.example/feed.xml', ?, ?, 'bulk summary', 'bulk insight', ?, ?, 'full', 'ok', 'bulk excerpt', 'bulk text')`, id, "https://http.example/bulk/"+strconv.Itoa(i), "Bulk Feed Row "+strconv.Itoa(i), published, published)
			if err != nil {
				t.Fatalf("insert bulk feed item %d: %v", i, err)
			}
		}

		firstRecorder := httptest.NewRecorder()
		router.ServeHTTP(firstRecorder, authorizedRequest(http.MethodGet, "/api/feed/today?limit=50", nil))
		assertStatus(t, firstRecorder, http.StatusOK)
		var first TodayFeedResponse
		if err := json.Unmarshal(firstRecorder.Body.Bytes(), &first); err != nil {
			t.Fatalf("unmarshal first feed page: %v", err)
		}

		secondRecorder := httptest.NewRecorder()
		router.ServeHTTP(secondRecorder, authorizedRequest(http.MethodGet, "/api/feed/today?limit=50&offset=50", nil))
		assertStatus(t, secondRecorder, http.StatusOK)
		var second TodayFeedResponse
		if err := json.Unmarshal(secondRecorder.Body.Bytes(), &second); err != nil {
			t.Fatalf("unmarshal second feed page: %v", err)
		}
		if len(first.Items) != 50 || len(second.Items) == 0 {
			t.Fatalf("page sizes first=%d second=%d, want full first page and accessible second page", len(first.Items), len(second.Items))
		}
		seen := map[string]bool{}
		for _, item := range first.Items {
			seen[item.ID] = true
		}
		for _, item := range second.Items {
			if seen[item.ID] {
				t.Fatalf("second page repeated first-page item %s", item.ID)
			}
		}
	})

	t.Run("state export import", func(t *testing.T) {
		exportRecorder := httptest.NewRecorder()
		router.ServeHTTP(exportRecorder, authorizedRequest(http.MethodGet, "/api/state/export", nil))
		assertStatus(t, exportRecorder, http.StatusOK)

		importRecorder := httptest.NewRecorder()
		req := authorizedRequest(http.MethodPost, "/api/state/import", bytes.NewReader(exportRecorder.Body.Bytes()))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(importRecorder, req)

		assertStatus(t, importRecorder, http.StatusOK)
		var parsed RestoreResult
		if err := json.Unmarshal(importRecorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal import response: %v; body=%s", err, importRecorder.Body.String())
		}
		if parsed.Restored.Sources != 1 {
			t.Fatalf("restored sources = %d, want 1", parsed.Restored.Sources)
		}
	})

	t.Run("doctor", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/doctor", nil))

		assertStatus(t, recorder, http.StatusOK)
		assertContentType(t, recorder, "text/plain; charset=utf-8")
		if !strings.Contains(recorder.Body.String(), "rss:") || !strings.Contains(recorder.Body.String(), "ingest: last_run=") {
			t.Fatalf("doctor body = %q", recorder.Body.String())
		}
	})
}

func TestHTTPItemDetailDisclosesGroupedSourceItems(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_primary_story", "https://primary.example.test/rss.xml", "Primary Wire")
	insertSource(t, ctx, db, "src_duplicate_story", "https://duplicate.example.test/rss.xml", "Duplicate Ledger")
	storyKey := "story-shared-runtime-review"
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text, story_key, duplicate_of_item_id) values
		('item_today_primary_story', 'src_primary_story', 'https://primary.example.test/rss.xml', 'https://primary.example.test/story', 'https://primary.example.test/story', 'Primary grouped story keeps every source visible', 'primary summary', 'primary insight', 'high', ?, ?, 'full', 'ok', 'primary excerpt', 'primary text', ?, null),
		('item_today_duplicate_story', 'src_duplicate_story', 'https://duplicate.example.test/rss.xml', 'https://duplicate.example.test/story-copy', 'https://duplicate.example.test/story-copy', 'Duplicate source item for primary grouped story', 'duplicate summary', 'duplicate insight', 'source-claim', ?, ?, 'full', 'ok', 'duplicate excerpt', 'duplicate text', ?, 'item_today_primary_story')`, now.Format(time.RFC3339), now.Format(time.RFC3339), storyKey, now.Add(-30*time.Minute).Format(time.RFC3339), now.Add(-30*time.Minute).Format(time.RFC3339), storyKey); err != nil {
		t.Fatalf("insert grouped story items: %v", err)
	}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/items/item_today_primary_story", nil))

	assertStatus(t, recorder, http.StatusOK)
	var parsed ItemResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal item detail response: %v; body=%s", err, recorder.Body.String())
	}
	grouped := parsed.Item.Provenance.GroupedSourceItems
	if len(grouped) != 2 {
		t.Fatalf("grouped source items = %+v, want primary and duplicate", grouped)
	}
	wantByID := map[string]string{
		"item_today_primary_story":   "Primary Wire",
		"item_today_duplicate_story": "Duplicate Ledger",
	}
	for _, sourceItem := range grouped {
		wantTitle, ok := wantByID[sourceItem.ItemID]
		if !ok {
			t.Fatalf("unexpected grouped source item: %+v", sourceItem)
		}
		if sourceItem.SourceTitle != wantTitle || sourceItem.StoryKey == nil || *sourceItem.StoryKey != storyKey || sourceItem.SourceURL == "" || sourceItem.URL == "" {
			t.Fatalf("grouped source item provenance = %+v, want title %q story %q with urls", sourceItem, wantTitle, storyKey)
		}
	}
	if !grouped[0].IsSelectedItem || grouped[1].DuplicateOfItemID == nil || *grouped[1].DuplicateOfItemID != "item_today_primary_story" {
		t.Fatalf("grouped source ordering/duplicate pointer = %+v", grouped)
	}
}

func TestHTTPQueryValidationRejectsUnknownAndDuplicateParameters(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name  string
		path  string
		field string
	}{
		{name: "feed unknown", path: "/api/feed/today?topic=sqlite", field: "topic"},
		{name: "feed duplicate", path: "/api/feed/today?limit=1&limit=2", field: "limit"},
		{name: "feed invalid offset", path: "/api/feed/today?limit=1&offset=-1", field: "offset"},
		{name: "search unknown", path: "/api/search?semantic=true", field: "semantic"},
		{name: "search duplicate", path: "/api/search?q=a&q=b", field: "q"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, tc.path, nil))

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), tc.field)
		})
	}
}

func TestHTTPNoQueryEndpointsRejectUnknownAfterAuthBeforeBackend(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name   string
		method string
		path   string
	}{
		{name: "sources", method: http.MethodGet, path: "/api/sources?trace=1"},
		{name: "source opml export", method: http.MethodGet, path: "/api/sources/export-opml?trace=1"},
		{name: "state export", method: http.MethodGet, path: "/api/state/export?trace=1"},
		{name: "doctor", method: http.MethodGet, path: "/api/doctor?trace=1"},
		{name: "active steering", method: http.MethodGet, path: "/api/steer/active?trace=1"},
		{name: "item detail", method: http.MethodGet, path: "/api/items/item_http_01?trace=1"},
		{name: "inspect mutation", method: http.MethodPost, path: "/api/items/item_http_01/inspect?trace=1"},
		{name: "resonance mutation", method: http.MethodPost, path: "/api/items/item_http_01/resonance?trace=1"},
		{name: "delivery mutation", method: http.MethodPost, path: "/api/items/item_http_01/delivery?trace=1"},
		{name: "steer mutation", method: http.MethodPost, path: "/api/steer?trace=1"},
		{name: "opml import mutation", method: http.MethodPost, path: "/api/sources/import-opml?trace=1"},
		{name: "state import mutation", method: http.MethodPost, path: "/api/state/import?trace=1"},
		{name: "source delete mutation", method: http.MethodDelete, path: "/api/sources/src_http?trace=1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, authorizedRequest(tc.method, tc.path, nil))

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), "trace")
		})
	}
}

func TestHTTPSourceOPMLExportActiveSourcesOnly(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_export_alpha", "https://alpha.example.test/feed.xml", "Alpha & Friends")
	insertSource(t, ctx, db, "src_export_beta", "https://beta.example.test/rss.xml", "Beta Source")
	insertSource(t, ctx, db, "src_export_inactive", "https://inactive.example.test/feed.xml", "Inactive Source")
	if _, err := db.ExecContext(ctx, `update sources set is_active = 0 where id = 'src_export_inactive'`); err != nil {
		t.Fatalf("mark inactive source: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, revision) values ('rule_export_forbidden', 'Do not export me', 1, ?, 1)`, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("insert steer rule: %v", err)
	}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/sources/export-opml", nil))

	assertStatus(t, recorder, http.StatusOK)
	assertContentType(t, recorder, "application/xml; charset=utf-8")
	if got := recorder.Header().Get("Content-Disposition"); got != `attachment; filename="sources.opml"` {
		t.Fatalf("Content-Disposition = %q, want sources.opml attachment", got)
	}
	body := recorder.Body.String()
	for _, forbidden := range []string{"inactive.example.test", "Do not export me", "steer_rules", "resonated_items", "item_state", "agent_receipts", "folders", "tags"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("OPML export leaked forbidden content %q: %s", forbidden, body)
		}
	}

	var parsed struct {
		XMLName xml.Name `xml:"opml"`
		Version string   `xml:"version,attr"`
		Head    struct {
			Title string `xml:"title"`
		} `xml:"head"`
		Body struct {
			Outlines []struct {
				Type   string `xml:"type,attr"`
				Text   string `xml:"text,attr"`
				Title  string `xml:"title,attr"`
				XMLURL string `xml:"xmlUrl,attr"`
			} `xml:"outline"`
		} `xml:"body"`
	}
	if err := xml.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal OPML export: %v; body=%s", err, body)
	}
	if parsed.XMLName.Local != "opml" || parsed.Version != "2.0" || parsed.Head.Title != "ResoFeed Sources" {
		t.Fatalf("OPML metadata = root:%s version:%s title:%s", parsed.XMLName.Local, parsed.Version, parsed.Head.Title)
	}
	if len(parsed.Body.Outlines) != 2 {
		t.Fatalf("OPML outlines = %+v, want two active sources", parsed.Body.Outlines)
	}
	want := map[string]string{
		"https://alpha.example.test/feed.xml": "Alpha & Friends",
		"https://beta.example.test/rss.xml":   "Beta Source",
	}
	for _, outline := range parsed.Body.Outlines {
		wantTitle, ok := want[outline.XMLURL]
		if !ok {
			t.Fatalf("unexpected OPML outline: %+v", outline)
		}
		if outline.Type != "rss" || outline.Text != wantTitle || outline.Title != wantTitle {
			t.Fatalf("OPML outline = %+v, want rss text/title %q", outline, wantTitle)
		}
		delete(want, outline.XMLURL)
	}
	if len(want) != 0 {
		t.Fatalf("missing OPML source URLs: %+v", want)
	}
}

func TestHTTPSourceOPMLExportRejectsRequestBody(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/sources/export-opml", bytes.NewReader([]byte("<opml/>"))))

	assertStatus(t, recorder, http.StatusBadRequest)
	assertErrorField(t, recorder.Body.Bytes(), "body")
}

func TestHTTPAuthRunsBeforeQueryValidationDetails(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/sources?trace=1", nil))

	assertStatus(t, recorder, http.StatusUnauthorized)
	assertJSONFixture(t, recorder.Body.Bytes(), "error_unauthorized.json")
}

func TestHTTPFeedTodayRejectsEmptyLimit(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/feed/today?limit=", nil))

	assertStatus(t, recorder, http.StatusBadRequest)
	assertErrorField(t, recorder.Body.Bytes(), "limit")
}

func TestHTTPMutationUnknownQueryRejectsBeforeStateWrite(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPost, "/api/items/item_http_01/resonance?trace=1", bytes.NewReader([]byte(`{"resonated":true,"actor_kind":"human","actor_id":"owner","idempotency_key":"query-reject-001"}`)))
	req.Header.Set("Content-Type", "application/json")

	router.ServeHTTP(recorder, req)

	assertStatus(t, recorder, http.StatusBadRequest)
	assertErrorField(t, recorder.Body.Bytes(), "trace")
	var stateRows int
	if err := db.QueryRowContext(ctx, `select count(*) from item_state where item_id = 'item_http_01'`).Scan(&stateRows); err != nil {
		t.Fatalf("count item_state after rejected mutation: %v", err)
	}
	if stateRows != 0 {
		t.Fatalf("item_state rows after rejected mutation = %d, want 0", stateRows)
	}
	assertReceiptCount(t, ctx, db, "query-reject-001", 0)
}

func TestHTTPMutationIdempotencyReplaysInspectResonanceAndSteer(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)
	llm := &recordingSteeringGemini{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prioritize replicated storage papers."}, Message: "openrouter steering updated"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	t.Run("inspect replay returns stored timestamp and no duplicate receipt", func(t *testing.T) {
		body := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"http-inspect-001"}`
		first := postHTTPJSON[InspectResult](t, router, "/api/items/item_http_01/inspect", body, http.StatusOK)
		if first.ItemID != "item_http_01" || first.AlreadyApplied {
			t.Fatalf("first inspect = %+v, want fresh application", first)
		}
		second := postHTTPJSON[InspectResult](t, router, "/api/items/item_http_01/inspect", body, http.StatusOK)
		if second.ItemID != first.ItemID || !second.AlreadyApplied || !second.HumanInspectedAt.Equal(first.HumanInspectedAt) {
			t.Fatalf("second inspect = %+v, want replay of %+v with already_applied", second, first)
		}
		assertReceiptCount(t, ctx, db, "http-inspect-001", 1)
	})

	t.Run("resonance replay preserves first target and rejects incompatible reuse", func(t *testing.T) {
		body := `{"resonated":true,"actor_kind":"human","actor_id":"owner","idempotency_key":"http-resonance-001"}`
		first := postHTTPJSON[ResonanceResult](t, router, "/api/items/item_http_01/resonance", body, http.StatusOK)
		if !first.IsResonated || first.AlreadyApplied {
			t.Fatalf("first resonance = %+v, want resonated application", first)
		}
		second := postHTTPJSON[ResonanceResult](t, router, "/api/items/item_http_01/resonance", body, http.StatusOK)
		if !second.IsResonated || !second.AlreadyApplied {
			t.Fatalf("second resonance = %+v, want replay already_applied", second)
		}
		incompatible := `{"resonated":false,"actor_kind":"human","actor_id":"owner","idempotency_key":"http-resonance-001"}`
		postHTTPJSON[ErrorBody](t, router, "/api/items/item_http_01/resonance", incompatible, http.StatusBadRequest)
		var resonated bool
		if err := db.QueryRowContext(ctx, `select is_resonated from item_state where item_id = 'item_http_01'`).Scan(&resonated); err != nil {
			t.Fatalf("read resonance state: %v", err)
		}
		if !resonated {
			t.Fatalf("incompatible idempotency reuse changed resonance state to false")
		}
		assertReceiptCount(t, ctx, db, "http-resonance-001", 1)
	})

	t.Run("steer replay returns first receipt and skips OpenRouter duplicate", func(t *testing.T) {
		body := `{"command":"Push more replicated storage papers.","actor_kind":"human","actor_id":"owner","idempotency_key":"http-steer-001"}`
		first := postHTTPJSON[SteerResult](t, router, "/api/steer", body, http.StatusOK)
		if first.Receipt.InterpretedAs != "openrouter_policy_update" || len(first.Receipt.ChangedRules) != 1 {
			t.Fatalf("first steer = %+v, want OpenRouter-backed rule", first)
		}
		if got := llm.calls(); got != 1 {
			t.Fatalf("OpenRouter calls after first steer = %d, want 1", got)
		}
		second := postHTTPJSON[SteerResult](t, router, "/api/steer", body, http.StatusOK)
		if second.Receipt.InterpretedAs != first.Receipt.InterpretedAs || len(second.Receipt.ChangedRules) != 1 || second.Receipt.ChangedRules[0].ID != first.Receipt.ChangedRules[0].ID {
			t.Fatalf("second steer = %+v, want stored first receipt %+v", second, first)
		}
		if got := llm.calls(); got != 1 {
			t.Fatalf("OpenRouter calls after idempotent steer replay = %d, want still 1", got)
		}
		incompatible := `{"command":"Push more battery chemistry papers.","actor_kind":"human","actor_id":"owner","idempotency_key":"http-steer-001"}`
		postHTTPJSON[ErrorBody](t, router, "/api/steer", incompatible, http.StatusBadRequest)
		if got := llm.calls(); got != 1 {
			t.Fatalf("OpenRouter calls after incompatible key reuse = %d, want still 1", got)
		}
		assertReceiptCount(t, ctx, db, "http-steer-001", 1)
	})
}

func TestHTTPDeliveryRouteValidationIdempotencyAndCoreState(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	seedHTTPHandlerCorpus(t, ctx, db, now)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	path := "/api/items/item_http_01/delivery"

	unknown := postHTTPJSON[ErrorBody](t, router, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T00:00:00Z","idempotency_key":"http-delivery-unknown","channel":"telegram"}`, http.StatusBadRequest)
	if unknown.Error.Details["field"] != "channel" {
		t.Fatalf("unknown delivery field details = %#v, want channel", unknown.Error.Details)
	}
	badTime := postHTTPJSON[ErrorBody](t, router, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T01:00:00+01:00","idempotency_key":"http-delivery-bad-time"}`, http.StatusBadRequest)
	if badTime.Error.Details["field"] != "delivered_at" {
		t.Fatalf("bad delivery timestamp details = %#v, want delivered_at", badTime.Error.Details)
	}

	body := `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T00:00:00Z","idempotency_key":"http-delivery-001"}`
	first := postHTTPJSON[DeliveryReportResult](t, router, path, body, http.StatusOK)
	if first.ItemID != "item_http_01" || first.AlreadyApplied || !first.ExternalSurfacedAt.Equal(time.Date(2026, 5, 9, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("first delivery = %+v, want fresh delivery timestamp", first)
	}
	replay := postHTTPJSON[DeliveryReportResult](t, router, path, body, http.StatusOK)
	if !replay.AlreadyApplied || !replay.ExternalSurfacedAt.Equal(first.ExternalSurfacedAt) {
		t.Fatalf("delivery replay = %+v, want stored timestamp %+v with already_applied", replay, first.ExternalSurfacedAt)
	}
	mismatch := postHTTPJSON[ErrorBody](t, router, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-10T00:00:00Z","idempotency_key":"http-delivery-001"}`, http.StatusBadRequest)
	if mismatch.Error.Details["field"] != "idempotency_key" || mismatch.Error.Details["reason"] != "request_fingerprint_mismatch" {
		t.Fatalf("delivery mismatch details = %#v", mismatch.Error.Details)
	}
	var storedAt, actorKind, actorID string
	if err := db.QueryRowContext(ctx, `select external_surfaced_at, last_actor_kind, last_actor_id from item_state where item_id = 'item_http_01'`).Scan(&storedAt, &actorKind, &actorID); err != nil {
		t.Fatalf("read delivery state: %v", err)
	}
	if storedAt != "2026-05-09T00:00:00Z" || actorKind != "agent" || actorID != "briefing-agent" {
		t.Fatalf("delivery state = %q %q %q", storedAt, actorKind, actorID)
	}
}

func TestStaticRootServesHTMLAccessGate(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	assertStatus(t, recorder, http.StatusOK)
	contentType := recorder.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", contentType)
	}
	body := recorder.Body.String()
	if strings.TrimSpace(body) == "RESOFEED" || !strings.Contains(body, "RESOFEED") || !strings.Contains(strings.ToLower(body), "owner token") {
		t.Fatalf("root body did not expose HTML owner-token access gate; body=%q", body)
	}
}

func seedHTTPHandlerCorpus(t *testing.T, ctx context.Context, db *sql.DB, now time.Time) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, is_active, revision) values ('src_http', 'https://http.example/feed.xml', 'HTTP Source', ?, ?, 'ok', 1, 1)`, now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert http source: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text) values ('item_http_01', 'src_http', 'https://http.example/feed.xml', 'https://http.example/sqlite', 'SQLite HTTP Handler', 'sqlite summary', 'sqlite insight', ?, ?, 'full', 'ok', 'sqlite excerpt', 'sqlite text')`, now.Format(time.RFC3339), now.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert http item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild search index: %v", err)
	}
}

func postHTTPJSON[T any](t *testing.T, router http.Handler, path string, body string, wantStatus int) T {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPost, path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	assertStatus(t, recorder, wantStatus)
	var parsed T
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal %s response: %v; body=%s", path, err, recorder.Body.String())
	}
	return parsed
}

func assertReceiptCount(t *testing.T, ctx context.Context, db *sql.DB, key string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRowContext(ctx, `select count(*) from agent_receipts where idempotency_key = ?`, key).Scan(&got); err != nil {
		t.Fatalf("count receipts for %s: %v", key, err)
	}
	if got != want {
		t.Fatalf("receipt count for %s = %d, want %d", key, got, want)
	}
}

func assertContentType(t *testing.T, recorder *httptest.ResponseRecorder, want string) {
	t.Helper()
	if got := recorder.Header().Get("Content-Type"); got != want {
		t.Fatalf("Content-Type = %q, want %q", got, want)
	}
}
