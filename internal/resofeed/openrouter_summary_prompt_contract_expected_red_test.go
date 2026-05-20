package resofeed

// expected_result: red
// These tests define the next OpenRouter summary prompt/output validation
// contract before the production prompt and validators have been tightened.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSummaryPromptContractIncludesAntiFluffDensityAndProvenanceRules(t *testing.T) {
	ctx := context.Background()
	var prompt map[string]any
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPrompt, err := decodeOpenRouterSummaryPrompt(r)
		if err != nil {
			t.Errorf("decode summary prompt: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		prompt = capturedPrompt
		writeOpenRouterSummaryResponse(t, w, OpenRouterSummaryOutput{
			Title:         "中文标题",
			FeedExcerpt:   "中文来源摘录",
			ExtractedText: "中文全文摘录",
			Summary:       "中文摘要包含 OpenRouter、SQLite FTS5 和 2026 迁移细节。",
			CoreInsight:   "ResoFeed needs dense source-backed summaries.",
			ValueTier:     "high",
			ModelStatus:   modelStatusOK,
		})
	}))
	defer model.Close()

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: model.URL, client: model.Client()}
	if _, err := client.SummarizeItem(ctx, OpenRouterSummaryInput{
		ItemID:         "item_prompt_contract",
		Title:          "Prompt Contract",
		SourceTitle:    "Example Source",
		URL:            "https://example.test/post?utm_source=feed",
		AvailableText:  "OpenRouter migration uses SQLite FTS5 and keeps provenance literal.",
		TargetLanguage: ProcessingLanguageChinese,
	}); err != nil {
		t.Fatalf("SummarizeItem returned error: %v", err)
	}
	if prompt == nil {
		t.Fatal("OpenRouter summary prompt was not captured")
	}

	promptJSON, err := json.Marshal(prompt)
	if err != nil {
		t.Fatalf("marshal captured prompt: %v", err)
	}
	promptText := strings.ToLower(string(promptJSON))

	for _, want := range []string{"anti-fluff", "blogger", "no filler", "this article discusses", "the author notes"} {
		if !strings.Contains(promptText, want) {
			t.Errorf("summary prompt missing anti-fluff/anti-blogger rule %q; prompt=%s", want, promptJSON)
		}
	}
	for _, want := range []string{"factual density", "names", "numbers", "specifics", "fact units"} {
		if !strings.Contains(promptText, want) {
			t.Errorf("summary prompt missing factual-density guidance %q; prompt=%s", want, promptJSON)
		}
	}
	for _, want := range []string{"target_language", "urls", "source ids", "provenance", "literal"} {
		if !strings.Contains(promptText, want) {
			t.Errorf("summary prompt missing target-language/provenance preservation rule %q; prompt=%s", want, promptJSON)
		}
	}
}

func TestOpenRouterSummaryRejectsMultipleSentenceCoreInsight(t *testing.T) {
	ctx := context.Background()
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeOpenRouterSummaryResponse(t, w, OpenRouterSummaryOutput{
			Summary:     "Dense summary with concrete source-backed details.",
			CoreInsight: "First insight sentence. Second insight sentence.",
			ValueTier:   "high",
			ModelStatus: modelStatusOK,
		})
	}))
	defer model.Close()

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: model.URL, client: model.Client()}
	if out, err := client.SummarizeItem(ctx, minimalSummaryInput()); err == nil {
		t.Fatalf("SummarizeItem accepted multi-sentence core_insight %+v; want validation error or invalid model_status", out)
	}
}

func TestOpenRouterSummaryValueTierAllowsOnlyStableProductLabels(t *testing.T) {
	for _, tc := range []struct {
		name      string
		valueTier string
		wantErr   bool
	}{
		{name: "stable high label", valueTier: "high"},
		{name: "stable brief label", valueTier: "brief"},
		{name: "stable source claim label", valueTier: "source-claim"},
		{name: "rss agent emoji label rejected", valueTier: "💎 高价值", wantErr: true},
		{name: "unknown label rejected", valueTier: "viral", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				writeOpenRouterSummaryResponse(t, w, OpenRouterSummaryOutput{
					Summary:     "Dense summary with source-backed details.",
					CoreInsight: "One stable product insight.",
					ValueTier:   tc.valueTier,
					ModelStatus: modelStatusOK,
				})
			}))
			defer model.Close()

			client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: model.URL, client: model.Client()}
			out, err := client.SummarizeItem(ctx, minimalSummaryInput())
			if tc.wantErr {
				if err == nil {
					t.Fatalf("SummarizeItem accepted value_tier %q as %+v; want validation error or invalid model_status", tc.valueTier, out)
				}
				return
			}
			if err != nil {
				t.Fatalf("SummarizeItem rejected stable value_tier %q: %v", tc.valueTier, err)
			}
			if out.ValueTier != tc.valueTier {
				t.Fatalf("value_tier = %q, want stable label %q", out.ValueTier, tc.valueTier)
			}
		})
	}
}

func decodeOpenRouterSummaryPrompt(r *http.Request) (map[string]any, error) {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	var request openRouterChatRequest
	if err := json.Unmarshal(body, &request); err != nil {
		return nil, fmt.Errorf("decode chat request: %w", err)
	}
	if len(request.Messages) != 1 {
		return nil, fmt.Errorf("message count = %d, want 1", len(request.Messages))
	}
	var prompt map[string]any
	if err := json.Unmarshal([]byte(request.Messages[0].Content), &prompt); err != nil {
		return nil, fmt.Errorf("decode prompt content: %w", err)
	}
	return prompt, nil
}

func writeOpenRouterSummaryResponse(t *testing.T, w http.ResponseWriter, out OpenRouterSummaryOutput) {
	t.Helper()
	content, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal summary output: %v", err)
	}
	response := openRouterChatResponse{
		Model: "openrouter/fake-summary-contract",
		Choices: []struct {
			Message openRouterMessage `json:"message"`
		}{
			{Message: openRouterMessage{Role: "assistant", Content: string(content)}},
		},
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		t.Fatalf("encode summary response: %v", err)
	}
}

func minimalSummaryInput() OpenRouterSummaryInput {
	return OpenRouterSummaryInput{
		ItemID:         "item_summary_contract",
		Title:          "Summary Contract",
		SourceTitle:    "Contract Source",
		URL:            "https://example.test/summary-contract",
		AvailableText:  "ResoFeed summary validation should enforce stable model output before state mutation.",
		TargetLanguage: ProcessingLanguageEnglish,
	}
}
