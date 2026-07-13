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

type rfbug002ParityLLM struct {
	calls      int
	lastItemID string
}

func (l *rfbug002ParityLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.calls++
	l.lastItemID = input.ItemID
	return OpenRouterSummaryOutput{
		LocalizedTitle: "Parity title " + input.ItemID,
		Title:          "Parity title " + input.ItemID,
		FeedExcerpt:    "Parity excerpt " + input.ItemID,
		ExtractedText:  "Parity text " + input.ItemID,
		Summary:        "Parity summary " + input.ItemID,
		CoreInsight:    "HTTP and MCP preserve the same selected item identifier.",
		KeyPoints: []string{
			"The canonical HTTP token decodes before item lookup.",
			"MCP accepts the same opaque item identifier directly.",
			"Both transports share receipt and persistence semantics.",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (*rfbug002ParityLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func TestRFBUG002CanonicalHTTPMCPParity(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSource(t, ctx, db, "src_rfbug002_parity", "https://parity.example.test/feed.xml", "Token parity")

	invalidSegments := []struct {
		name    string
		segment string
	}{
		{name: "raw", segment: "raw-item-contract"},
		{name: "padded", segment: "~cmF3LWl0ZW0="},
		{name: "malformed", segment: "~***"},
		{name: "noncanonical", segment: "~wyg"},
		{name: "fatal_utf8", segment: "~_w"},
	}
	canonicalItemID := "parity/项目%?# +~_-."
	articleServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if _, err := fmt.Fprint(w, `<!doctype html><html><head><title>Token parity article</title></head><body><article>Canonical route tokens must decode into exactly the same opaque selected-item identifier that MCP accepts directly. The HTTP and MCP transports must share validation, idempotency target, receipt replay, result identity, SQLite persistence, FTS refresh, and safe error semantics. This deterministic article body drives the real selected-item re-ingest source-fetch and LLM seam without any external service.</article></body></html>`); err != nil {
			t.Errorf("write parity article fixture: %v", err)
		}
	}))
	t.Cleanup(articleServer.Close)

	itemIDs := make([]string, 0, len(invalidSegments)+1)
	for _, candidate := range invalidSegments {
		itemIDs = append(itemIDs, candidate.segment)
	}
	itemIDs = append(itemIDs, canonicalItemID)
	for index, itemID := range itemIDs {
		now := time.Date(2026, 7, 13, 8, index, 0, 0, time.UTC).Format(time.RFC3339)
		itemURL := fmt.Sprintf("https://parity.example.test/items/%d", index)
		if itemID == canonicalItemID {
			itemURL = articleServer.URL + "/article"
		}
		_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, key_points, feed_excerpt, extracted_text, value_tier, first_seen_at, extraction_status, model_status) values (?, 'src_rfbug002_parity', 'https://parity.example.test/feed.xml', ?, ?, ?, ?, ?, '["one","two","three"]', ?, ?, 'high', ?, 'full', 'ok')`,
			itemID,
			itemURL,
			itemURL,
			"Parity seed title "+itemID,
			"Parity seed summary "+itemID,
			"Parity seed insight "+itemID,
			"Parity seed excerpt "+itemID,
			"Parity source text "+itemID,
			now,
		)
		if err != nil {
			t.Fatalf("seed parity item %q: %v", itemID, err)
		}
	}

	llm := &rfbug002ParityLLM{}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})
	operations := []struct {
		name   string
		method string
		suffix string
		extra  string
		readID func(map[string]any) string
	}{
		{name: "detail", method: http.MethodGet, readID: func(body map[string]any) string { return nestedString(body, "item", "id") }},
		{name: "inspect", method: http.MethodPost, suffix: "/inspect", readID: func(body map[string]any) string { return stringField(body, "item_id") }},
		{name: "resonance", method: http.MethodPost, suffix: "/resonance", extra: `,"resonated":true`, readID: func(body map[string]any) string { return stringField(body, "item_id") }},
		{name: "delivery", method: http.MethodPost, suffix: "/delivery", extra: `,"delivered_at":"2026-07-13T09:00:00Z"`, readID: func(body map[string]any) string { return stringField(body, "item_id") }},
		{name: "reingest", method: http.MethodPost, suffix: "/reingest", extra: `,"model":null,"prompt":null`, readID: func(body map[string]any) string { return nestedString(body, "reingest", "item_id") }},
	}

	var rejectionViolations []string
	for _, candidate := range invalidSegments {
		for _, operation := range operations {
			path := "/api/items/" + candidate.segment + operation.suffix
			body := strings.NewReader("")
			if operation.method == http.MethodPost {
				body = strings.NewReader(mutationBody(operation.name, candidate.name+"-"+candidate.segment, operation.extra))
			}
			request := httptest.NewRequest(operation.method, path, body)
			request.Header.Set("Authorization", "Bearer "+contractOwnerToken)
			if operation.method == http.MethodPost {
				request.Header.Set("Content-Type", "application/json")
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)

			var errorBody ErrorBody
			decodeErr := json.Unmarshal(recorder.Body.Bytes(), &errorBody)
			id, _ := errorBody.Error.Details["id"].(string)
			if recorder.Code != http.StatusNotFound || decodeErr != nil || errorBody.Error.Code != "not_found" || errorBody.Error.Message != "not found" || id != candidate.segment {
				rejectionViolations = append(rejectionViolations, fmt.Sprintf("%s/%s status=%d code=%q message=%q id=%q decode_error=%v", candidate.name, operation.name, recorder.Code, errorBody.Error.Code, errorBody.Error.Message, id, decodeErr))
			}
		}
	}
	t.Log("RF_BUG_002_CANONICAL_HTTP_REJECTION=complete")
	if len(rejectionViolations) > 0 {
		t.Log("RF-BUG-002_CANONICAL_HTTP_REJECTION_ASSERTION")
		t.Errorf("authenticated noncanonical item routes reached lookup or returned a noncanonical error: %s", strings.Join(rejectionViolations, "; "))
	}

	canonicalToken := "~" + base64.RawURLEncoding.EncodeToString([]byte(canonicalItemID))
	sharedKey := "rfbug002-http-mcp-shared-reingest"
	actorID := "rfbug002-parity-agent"
	var httpReingest ItemReingestResponse
	var parityViolations []string
	for _, operation := range operations {
		path := "/api/items/" + canonicalToken + operation.suffix
		body := strings.NewReader("")
		if operation.method == http.MethodPost {
			payload := mutationBody(operation.name, canonicalItemID, operation.extra)
			if operation.name == "reingest" {
				payload = fmt.Sprintf(`{"actor_kind":"agent","actor_id":%q,"idempotency_key":%q,"model":null,"prompt":null}`, actorID, sharedKey)
			}
			body = strings.NewReader(payload)
		}
		request := httptest.NewRequest(operation.method, path, body)
		request.Header.Set("Authorization", "Bearer "+contractOwnerToken)
		if operation.method == http.MethodPost {
			request.Header.Set("Content-Type", "application/json")
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			parityViolations = append(parityViolations, fmt.Sprintf("canonical HTTP %s status=%d body=%s", operation.name, recorder.Code, strings.TrimSpace(recorder.Body.String())))
			continue
		}
		var response map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			parityViolations = append(parityViolations, fmt.Sprintf("canonical HTTP %s invalid JSON: %v", operation.name, err))
			continue
		}
		if got := operation.readID(response); got != canonicalItemID {
			parityViolations = append(parityViolations, fmt.Sprintf("canonical HTTP %s item_id bytes=%q want=%q", operation.name, got, canonicalItemID))
		}
		if operation.name == "reingest" {
			if err := json.Unmarshal(recorder.Body.Bytes(), &httpReingest); err != nil {
				parityViolations = append(parityViolations, fmt.Sprintf("decode canonical HTTP reingest: %v", err))
			}
		}
	}

	callsAfterHTTP := llm.calls
	var receiptItemID, receiptActorID, receiptOperation string
	if err := db.QueryRowContext(ctx, `select item_id, actor_id, operation from agent_receipts where idempotency_key = ?`, sharedKey).Scan(&receiptItemID, &receiptActorID, &receiptOperation); err != nil {
		parityViolations = append(parityViolations, fmt.Sprintf("read shared HTTP receipt: %v", err))
	} else if receiptItemID != canonicalItemID || receiptActorID != actorID || receiptOperation != "reingest_item" {
		parityViolations = append(parityViolations, fmt.Sprintf("HTTP receipt target=%q actor=%q operation=%q", receiptItemID, receiptActorID, receiptOperation))
	}
	var titleBeforeMCP, ftsTitleBeforeMCP string
	if err := db.QueryRowContext(ctx, `select title from items where id = ?`, canonicalItemID).Scan(&titleBeforeMCP); err != nil {
		parityViolations = append(parityViolations, fmt.Sprintf("read persisted HTTP item: %v", err))
	}
	if err := db.QueryRowContext(ctx, `select title from search_fts where item_id = ?`, canonicalItemID).Scan(&ftsTitleBeforeMCP); err != nil {
		parityViolations = append(parityViolations, fmt.Sprintf("read persisted HTTP FTS item: %v", err))
	}

	mcpHandler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})
	mcpResponse := mcpCall(t, mcpHandler, "reingest_item", map[string]any{
		"item_id":         canonicalItemID,
		"actor_id":        actorID,
		"idempotency_key": sharedKey,
		"model":           nil,
		"prompt":          nil,
	})
	if mcpResponse.Error != nil {
		parityViolations = append(parityViolations, fmt.Sprintf("MCP rejected canonical HTTP decoded item ID %q: %+v", canonicalItemID, mcpResponse.Error))
	} else {
		var mcpReingest ItemReingestResponse
		if err := json.Unmarshal([]byte(mcpToolText(t, mcpResponse, "reingest_item")), &mcpReingest); err != nil {
			parityViolations = append(parityViolations, fmt.Sprintf("decode MCP shared reingest: %v", err))
		} else {
			if !mcpReingest.AlreadyApplied {
				parityViolations = append(parityViolations, "MCP did not replay the HTTP receipt for the same decoded item ID and fingerprint")
			}
			if mcpReingest.Reingest.ItemID != canonicalItemID || httpReingest.Reingest.ItemID != canonicalItemID {
				parityViolations = append(parityViolations, fmt.Sprintf("HTTP/MCP result item IDs HTTP=%q MCP=%q want=%q", httpReingest.Reingest.ItemID, mcpReingest.Reingest.ItemID, canonicalItemID))
			}
			if mcpReingest.Reingest.Status != httpReingest.Reingest.Status || mcpReingest.Reingest.ItemUpdated != httpReingest.Reingest.ItemUpdated || mcpReingest.Reingest.FTSUpdated != httpReingest.Reingest.FTSUpdated {
				parityViolations = append(parityViolations, fmt.Sprintf("HTTP/MCP result semantics HTTP=%+v MCP=%+v", httpReingest.Reingest, mcpReingest.Reingest))
			}
		}
	}

	var titleAfterMCP, ftsTitleAfterMCP string
	if err := db.QueryRowContext(ctx, `select title from items where id = ?`, canonicalItemID).Scan(&titleAfterMCP); err != nil {
		parityViolations = append(parityViolations, fmt.Sprintf("read persisted MCP item: %v", err))
	}
	if err := db.QueryRowContext(ctx, `select title from search_fts where item_id = ?`, canonicalItemID).Scan(&ftsTitleAfterMCP); err != nil {
		parityViolations = append(parityViolations, fmt.Sprintf("read persisted MCP FTS item: %v", err))
	}
	if titleBeforeMCP != titleAfterMCP || ftsTitleBeforeMCP != ftsTitleAfterMCP || llm.calls != callsAfterHTTP || llm.lastItemID != canonicalItemID {
		parityViolations = append(parityViolations, fmt.Sprintf("HTTP/MCP persistence diverged title=%q/%q fts=%q/%q calls=%d/%d last_item_id=%q", titleBeforeMCP, titleAfterMCP, ftsTitleBeforeMCP, ftsTitleAfterMCP, callsAfterHTTP, llm.calls, llm.lastItemID))
	}

	missingItemID := "missing/项目%"
	missingToken := "~" + base64.RawURLEncoding.EncodeToString([]byte(missingItemID))
	missingKey := "rfbug002-http-mcp-missing"
	missingBody := fmt.Sprintf(`{"actor_kind":"agent","actor_id":%q,"idempotency_key":%q,"model":null,"prompt":null}`, actorID, missingKey)
	missingRequest := httptest.NewRequest(http.MethodPost, "/api/items/"+missingToken+"/reingest", strings.NewReader(missingBody))
	missingRequest.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	missingRequest.Header.Set("Content-Type", "application/json")
	missingRecorder := httptest.NewRecorder()
	router.ServeHTTP(missingRecorder, missingRequest)
	var httpMissing ErrorBody
	if err := json.Unmarshal(missingRecorder.Body.Bytes(), &httpMissing); err != nil || missingRecorder.Code != http.StatusNotFound || httpMissing.Error.Code != "not_found" || httpMissing.Error.Message != "not found" || httpMissing.Error.Details["id"] != missingItemID {
		parityViolations = append(parityViolations, fmt.Sprintf("HTTP missing-item semantics status=%d error=%+v body=%s", missingRecorder.Code, err, strings.TrimSpace(missingRecorder.Body.String())))
	}
	mcpMissing := mcpCall(t, mcpHandler, "reingest_item", map[string]any{"item_id": missingItemID, "actor_id": actorID, "idempotency_key": missingKey, "model": nil, "prompt": nil})
	if mcpMissing.Error == nil {
		parityViolations = append(parityViolations, "MCP missing opaque item unexpectedly succeeded")
	} else {
		inner, _ := mcpMissing.Error.Data["error"].(map[string]any)
		details, _ := inner["details"].(map[string]any)
		if mcpMissing.Error.Code != -32004 || inner["code"] != httpMissing.Error.Code || inner["message"] != httpMissing.Error.Message || details["id"] != missingItemID {
			parityViolations = append(parityViolations, fmt.Sprintf("HTTP/MCP missing-item error semantics HTTP=%+v MCP=%+v", httpMissing.Error, mcpMissing.Error))
		}
	}

	if len(parityViolations) > 0 {
		t.Log("RF-BUG-002_HTTP_MCP_REINGEST_PARITY_ASSERTION")
		t.Errorf("HTTP/MCP selected-item re-ingest parity violations: %s", strings.Join(parityViolations, "; "))
	}
}
