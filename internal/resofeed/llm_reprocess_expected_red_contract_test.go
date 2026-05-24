package resofeed

// expected_result: red
// These tests define the next product contract for model-error classification
// and reprocess fallback text before the runtime implementation exists.

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestOpenRouterModelErrorStatusContractExpectedRed(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name       string
		expected   string
		handler    http.HandlerFunc
		clientTime time.Duration
	}{
		{
			name:     "invalid_model",
			expected: "invalid_model",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, `{"error":{"message":"model not found"}}`, http.StatusBadRequest)
			},
		},
		{
			name:     "provider_error",
			expected: "provider_error",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"error":{"message":"upstream provider returned an error"}}`)
			},
		},
		{
			name:     "rate_limited",
			expected: "rate_limited",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, `{"error":{"message":"rate limited"}}`, http.StatusTooManyRequests)
			},
		},
		{
			name:     "decode_error",
			expected: "decode_error",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{not-json`)
			},
		},
		{
			name:     "timeout",
			expected: "timeout",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				time.Sleep(75 * time.Millisecond)
				_, _ = io.WriteString(w, `{}`)
			},
			clientTime: 10 * time.Millisecond,
		},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(tc.handler)
			t.Cleanup(server.Close)

			httpClient := server.Client()
			if tc.clientTime > 0 {
				httpClient.Timeout = tc.clientTime
			}
			client := &openRouterHTTPClient{apiKey: "test-openrouter-key", model: "openrouter/test", endpoint: server.URL, client: httpClient}
			out, err := client.SummarizeItem(context.Background(), OpenRouterSummaryInput{ItemID: "item_" + tc.name, Title: "Title", SourceTitle: "Source", URL: "https://example.test/article", AvailableText: "article body", TargetLanguage: ProcessingLanguageEnglish})
			if err == nil {
				t.Fatalf("SummarizeItem error = nil, want classified provider/model error %q", tc.expected)
			}
			if out.ModelStatus == modelStatusLatencyError {
				t.Fatalf("SummarizeItem %s collapsed to %q; want safe stable diagnostic status %q", tc.name, out.ModelStatus, tc.expected)
			}
			if out.ModelStatus != tc.expected {
				t.Fatalf("SummarizeItem %s status = %q, want %q", tc.name, out.ModelStatus, tc.expected)
			}
		})
	}
}

func TestOpenRouterValidJSONInvalidSummaryFieldsMapsDecodeErrorExpectedRed(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"{\"summary\":\"Valid summary.\",\"core_insight\":\"First sentence. Second sentence.\",\"value_tier\":\"high\",\"model_status\":\"ok\"}"}}]}`)
	}))
	t.Cleanup(server.Close)

	client := &openRouterHTTPClient{apiKey: "test-openrouter-key", model: "openrouter/test", endpoint: server.URL, client: server.Client()}
	out, err := client.SummarizeItem(context.Background(), OpenRouterSummaryInput{ItemID: "item_invalid_structured_json", Title: "Title", SourceTitle: "Source", URL: "https://example.test/article", AvailableText: "article body", TargetLanguage: ProcessingLanguageEnglish})
	if err == nil {
		t.Fatalf("SummarizeItem error = nil, want decode_error for syntactically valid JSON with invalid fields")
	}
	if out.ModelStatus != modelStatusDecodeError {
		t.Fatalf("SummarizeItem model_status = %q, want %q", out.ModelStatus, modelStatusDecodeError)
	}
	for _, forbidden := range []string{"Valid summary.", "First sentence. Second sentence."} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("validation error leaked raw model payload fragment %q: %v", forbidden, err)
		}
	}
}

func TestModelFailureStatusClassificationForBuildAndReprocessExpectedRed(t *testing.T) {
	ctx := context.Background()
	llm := classifyingFailureLLM{err: errors.New("openrouter: invalid model")}
	source := Source{ID: "src_invalid_model", URL: "https://feed.example.test/rss.xml", Title: "Model Source"}
	entry := feedEntry{ID: "invalid-model-entry", Title: "Invalid Model Entry", URL: "not-a-real-url", Description: "stored RSS excerpt for build path"}

	item, err := buildItem(ctx, source, entry, llm, ProcessingLanguageEnglish)
	if err != nil {
		t.Fatalf("buildItem returned error: %v", err)
	}
	if item.ModelStatus == modelStatusLatencyError {
		t.Fatalf("buildItem model_status collapsed to %q; want invalid_model or equivalent safe status", item.ModelStatus)
	}
	if item.ModelStatus != "invalid_model" {
		t.Fatalf("buildItem model_status = %q, want invalid_model", item.ModelStatus)
	}

	db := newContractDB(t, ctx)
	article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>fresh source text for invalid model path</article></body></html>`)
	}))
	t.Cleanup(article.Close)
	seedSource(t, ctx, db, "src_invalid_reprocess", article.URL+"/feed.xml", "Invalid Reprocess")
	seedReprocessItem(t, ctx, db, "item_invalid_reprocess", "src_invalid_reprocess", article.URL+"/article", "")
	assertReprocessIndexReady(t, ctx, db)

	resp, err := reprocessLibraryFresh(ctx, db, llm)
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if len(resp.Reprocess.Errors) != 1 {
		t.Fatalf("reprocess errors = %+v, want one invalid_model error", resp.Reprocess.Errors)
	}
	if resp.Reprocess.Errors[0].Code == ReprocessErrorModelLatencyError {
		t.Fatalf("reprocess error code collapsed to %q; want invalid_model or equivalent safe status", resp.Reprocess.Errors[0].Code)
	}
	if resp.Reprocess.Errors[0].Code != ReprocessErrorCode("invalid_model") {
		t.Fatalf("reprocess error code = %q, want invalid_model", resp.Reprocess.Errors[0].Code)
	}
}

func TestInvalidStructuredLLMOutputMapsDecodeErrorForBuildAndReprocessExpectedRed(t *testing.T) {
	ctx := context.Background()
	llm := invalidStructuredSummaryLLM{}
	source := Source{ID: "src_invalid_structured", URL: "https://feed.example.test/rss.xml", Title: "Structured Source"}
	entry := feedEntry{ID: "invalid-structured-entry", Title: "Invalid Structured Entry", URL: "not-a-real-url", Description: "stored RSS excerpt for invalid structured path"}

	item, err := buildItem(ctx, source, entry, llm, ProcessingLanguageEnglish)
	if err != nil {
		t.Fatalf("buildItem returned error: %v", err)
	}
	if item.ModelStatus != modelStatusDecodeError {
		t.Fatalf("buildItem model_status = %q, want %q for valid JSON with invalid fields", item.ModelStatus, modelStatusDecodeError)
	}
	if item.Summary != nil || item.CoreInsight != nil {
		t.Fatalf("buildItem persisted invalid structured summary/core: summary=%v core=%v", item.Summary, item.CoreInsight)
	}

	db := newContractDB(t, ctx)
	article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>fresh source text for invalid structured path</article></body></html>`)
	}))
	t.Cleanup(article.Close)
	seedSource(t, ctx, db, "src_invalid_structured_reprocess", article.URL+"/feed.xml", "Invalid Structured Reprocess")
	seedReprocessItem(t, ctx, db, "item_invalid_structured_reprocess", "src_invalid_structured_reprocess", article.URL+"/article", "")
	assertReprocessIndexReady(t, ctx, db)

	resp, err := reprocessLibraryFresh(ctx, db, llm)
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if resp.Reprocess.ItemsFailed != 1 || resp.Reprocess.ItemsUnavailable != 0 {
		t.Fatalf("reprocess counts = %+v, want one failed decode_error and no summary_unavailable", resp.Reprocess)
	}
	assertReprocessErrorCode(t, resp.Reprocess.Errors, "item_invalid_structured_reprocess", ReprocessErrorDecodeError)
	assertPreservedOriginalFields(t, ctx, db, "item_invalid_structured_reprocess", string(ReprocessErrorDecodeError), "PRIOR summary item_invalid_structured_reprocess", "PRIOR insight item_invalid_structured_reprocess")
}

func TestReprocessFallbackTextContractExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	requests := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests[r.URL.Path]++
		switch r.URL.Path {
		case "/feed.xml":
			t.Fatalf("reprocess must not fetch source/feed URL for article text")
		case "/extracted-unavailable", "/excerpt-unavailable", "/no-fallback-unavailable":
			http.NotFound(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	seedSource(t, ctx, db, "src_reprocess_fallback_contract", server.URL+"/feed.xml", "Fallback Source")
	seedReprocessReadableFallbackItem(t, ctx, db, "item_extracted_fallback", "src_reprocess_fallback_contract", server.URL+"/extracted-unavailable", "persisted extracted text for rewrite", "persisted feed excerpt should be secondary")
	seedReprocessReadableFallbackItem(t, ctx, db, "item_feed_excerpt_fallback", "src_reprocess_fallback_contract", server.URL+"/excerpt-unavailable", "", "persisted feed excerpt for rewrite")
	seedReprocessReadableFallbackItem(t, ctx, db, "item_no_readable_fallback", "src_reprocess_fallback_contract", server.URL+"/no-fallback-unavailable", "", "")
	assertReprocessIndexReady(t, ctx, db)

	llm := &capturingReprocessLLM{}
	resp, err := reprocessLibraryFresh(ctx, db, llm)
	if err != nil {
		t.Fatalf("reprocessLibraryFresh returned error: %v", err)
	}
	if resp.Reprocess.ItemsUpdated != 2 || resp.Reprocess.ItemsUnavailable != 1 || resp.Reprocess.ItemsFailed != 0 {
		t.Fatalf("reprocess fallback result = %+v, want extracted_text and feed_excerpt fallback items updated and no-readable item original_unavailable", resp.Reprocess)
	}
	if requests["/feed.xml"] != 0 {
		t.Fatalf("reprocess fetched source/feed URL %d times", requests["/feed.xml"])
	}

	extracted := llm.inputs["item_extracted_fallback"]
	if extracted.AvailableText != "persisted extracted text for rewrite" {
		t.Fatalf("extracted fallback LLM available_text = %q, want persisted extracted_text", extracted.AvailableText)
	}
	if extracted.URL != server.URL+"/extracted-unavailable" {
		t.Fatalf("extracted fallback LLM URL = %q, want original article URL", extracted.URL)
	}
	feedExcerpt := llm.inputs["item_feed_excerpt_fallback"]
	if feedExcerpt.AvailableText != "persisted feed excerpt for rewrite" {
		t.Fatalf("feed excerpt fallback LLM available_text = %q, want persisted feed_excerpt", feedExcerpt.AvailableText)
	}
	if feedExcerpt.URL != server.URL+"/excerpt-unavailable" {
		t.Fatalf("feed excerpt fallback LLM URL = %q, want original article URL", feedExcerpt.URL)
	}
	if _, ok := llm.inputs["item_no_readable_fallback"]; ok {
		t.Fatalf("no-readable item was sent to LLM; content must not be invented")
	}
	assertReprocessErrorCode(t, resp.Reprocess.Errors, "item_no_readable_fallback", ReprocessErrorOriginalUnavailable)
}

type classifyingFailureLLM struct {
	err error
}

type invalidStructuredSummaryLLM struct{}

func (invalidStructuredSummaryLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{Summary: "Valid summary.", CoreInsight: "First sentence. Second sentence.", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (invalidStructuredSummaryLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l classifyingFailureLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, l.err
}

func (l classifyingFailureLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, l.err
}

type capturingReprocessLLM struct {
	inputs map[string]OpenRouterSummaryInput
}

func (l *capturingReprocessLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	if l.inputs == nil {
		l.inputs = map[string]OpenRouterSummaryInput{}
	}
	l.inputs[input.ItemID] = input
	clean := strings.TrimSpace(input.AvailableText)
	out := ccrTestSummaryOutput("rewritten "+input.ItemID, "summary "+clean, "insight "+clean, "high")
	out.FeedExcerpt = "excerpt " + clean
	out.ExtractedText = "extracted " + clean
	return out, nil
}

func (l *capturingReprocessLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func seedReprocessReadableFallbackItem(t *testing.T, ctx context.Context, db execDB, id string, sourceID string, itemURL string, extractedText string, feedExcerpt string) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, feed_excerpt, extracted_text, first_seen_at, extraction_status, model_status) values (?, ?, (select url from sources where id = ?), ?, ?, ?, ?, ?, 'partial_extraction', 'summary_unavailable')`, id, sourceID, sourceID, itemURL, "Stored title "+id, nullableString(feedExcerpt), nullableString(extractedText), now)
	if err != nil {
		t.Fatalf("seed fallback item %s: %v", id, err)
	}
}

func assertReprocessErrorCode(t *testing.T, errors []ReprocessErrorDetail, itemID string, code ReprocessErrorCode) {
	t.Helper()
	for _, detail := range errors {
		if detail.ItemID != nil && *detail.ItemID == itemID {
			if detail.Code != code {
				t.Fatalf("reprocess error for %s = %q, want %q", itemID, detail.Code, code)
			}
			return
		}
	}
	t.Fatalf("reprocess errors %+v missing item %s with code %q", errors, itemID, code)
}
