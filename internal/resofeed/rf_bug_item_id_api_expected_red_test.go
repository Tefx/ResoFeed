package resofeed

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const rfbug002OwnerToken = "rfeed_rfbug002_opaque_item_contract_owner_token"

type rfbug002LLM struct{}

func (rfbug002LLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{
		LocalizedTitle: "Opaque route title " + input.ItemID,
		Title:          "Opaque route title " + input.ItemID,
		FeedExcerpt:    "Opaque route excerpt " + input.ItemID,
		ExtractedText:  "Opaque route text " + input.ItemID,
		Summary:        "Opaque route summary " + input.ItemID,
		CoreInsight:    "Opaque route insight remains byte-identical.",
		KeyPoints: []string{
			"Opaque identifiers are application data.",
			"Route tokens preserve every identifier byte.",
			"All item operations resolve the same row.",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (rfbug002LLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func TestRFBUG002OpaqueItemIDAPIPaths(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSource(t, ctx, db, "src_rfbug002_opaque", "https://opaque.example.test/feed.xml", "Opaque IDs")

	itemIDs := []string{
		"item/segment",
		"item%percent",
		"项目/百分号%",
		"item?query#fragment",
		"item+plus space",
		"~already-token-like_-.",
	}
	for index, itemID := range itemIDs {
		now := time.Date(2026, 7, 12, 8, index, 0, 0, time.UTC).Format(time.RFC3339)
		_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, key_points, feed_excerpt, extracted_text, value_tier, first_seen_at, extraction_status, model_status) values (?, 'src_rfbug002_opaque', 'https://opaque.example.test/feed.xml', ?, ?, ?, ?, ?, '["one","two","three"]', ?, ?, 'high', ?, 'full', 'ok')`,
			itemID,
			fmt.Sprintf("https://opaque.example.test/items/%d", index),
			fmt.Sprintf("https://opaque.example.test/items/%d", index),
			"Opaque title "+itemID,
			"Opaque summary "+itemID,
			"Opaque insight "+itemID,
			"Opaque excerpt "+itemID,
			"Opaque source text "+itemID,
			now,
		)
		if err != nil {
			t.Fatalf("seed opaque item %q: %v", itemID, err)
		}
	}

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: rfbug002OwnerToken, LLM: rfbug002LLM{}})
	operations := []struct {
		name   string
		method string
		suffix string
		body   func(itemID string) string
		readID func(map[string]any) string
	}{
		{name: "detail", method: http.MethodGet, readID: func(body map[string]any) string { return nestedString(body, "item", "id") }},
		{name: "inspect", method: http.MethodPost, suffix: "/inspect", body: func(itemID string) string {
			return mutationBody("inspect", itemID, "")
		}, readID: func(body map[string]any) string { return stringField(body, "item_id") }},
		{name: "resonance", method: http.MethodPost, suffix: "/resonance", body: func(itemID string) string {
			return mutationBody("resonance", itemID, `,"resonated":true`)
		}, readID: func(body map[string]any) string { return stringField(body, "item_id") }},
		{name: "delivery", method: http.MethodPost, suffix: "/delivery", body: func(itemID string) string {
			return mutationBody("delivery", itemID, `,"delivered_at":"2026-07-12T09:00:00Z"`)
		}, readID: func(body map[string]any) string { return stringField(body, "item_id") }},
		{name: "reingest", method: http.MethodPost, suffix: "/reingest", body: func(itemID string) string {
			return mutationBody("reingest", itemID, `,"model":null,"prompt":null`)
		}, readID: func(body map[string]any) string { return nestedString(body, "reingest", "item_id") }},
	}

	t.Logf("RF_BUG_002_API_SUBTESTS=%d", len(itemIDs)*len(operations))
	for itemIndex, itemID := range itemIDs {
		for _, operation := range operations {
			operation := operation
			t.Run(fmt.Sprintf("%02d_%s", itemIndex+1, operation.name), func(t *testing.T) {
				token := "~" + base64.RawURLEncoding.EncodeToString([]byte(itemID))
				path := "/api/items/" + token + operation.suffix
				var body *strings.Reader
				if operation.body == nil {
					body = strings.NewReader("")
				} else {
					body = strings.NewReader(operation.body(itemID))
				}
				request := httptest.NewRequest(operation.method, path, body)
				request.Header.Set("Authorization", "Bearer "+rfbug002OwnerToken)
				if operation.body != nil {
					request.Header.Set("Content-Type", "application/json")
				}
				recorder := httptest.NewRecorder()
				router.ServeHTTP(recorder, request)

				var response map[string]any
				if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
					t.Errorf("%s %s expected byte-identical item ID %q; status=%d invalid JSON: %v; body=%s", operation.method, path, itemID, recorder.Code, err, recorder.Body.String())
					return
				}
				if recorder.Code != http.StatusOK {
					t.Errorf("%s %s expected byte-identical item ID %q; status=%d body=%s", operation.method, path, itemID, recorder.Code, recorder.Body.String())
					return
				}
				if got := operation.readID(response); got != itemID {
					t.Errorf("%s %s expected byte-identical item ID %q, got %q; body=%s", operation.method, path, itemID, got, recorder.Body.String())
				}
			})
		}
	}
}

func mutationBody(operation string, itemID string, extra string) string {
	return fmt.Sprintf(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"rfbug002-%s-%s"%s}`,
		operation,
		base64.RawURLEncoding.EncodeToString([]byte(itemID)),
		extra,
	)
}

func stringField(body map[string]any, key string) string {
	value, _ := body[key].(string)
	return value
}

func nestedString(body map[string]any, object string, key string) string {
	nested, _ := body[object].(map[string]any)
	return stringField(nested, key)
}
