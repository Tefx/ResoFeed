package resofeed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenRouterStructuredOutputRoutingUsesJSONSchemaWhenSelectedModelMetadataSupportsResponseFormat(t *testing.T) {
	ctx := context.Background()
	var captured promptingV21ChatRequest
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/models":
			writeOpenRouterModelsMetadata(t, w, "openrouter/schema-supported", "tools", "response_format")
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/chat/completions":
			var err error
			captured, err = decodePromptingV21ChatRequest(r)
			if err != nil {
				t.Errorf("decode chat request: %v", err)
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			writeOpenRouterSummaryResponse(t, w, validPromptingV21Output(nil))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(provider.Close)

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: provider.URL, client: provider.Client(), model: "openrouter/schema-supported"}
	if _, err := client.SummarizeItem(ctx, minimalSummaryInput()); err != nil {
		t.Fatalf("SummarizeItem returned error: %v", err)
	}

	if got := captured.ResponseFormat["type"]; got != "json_schema" {
		t.Fatalf("response_format.type = %#v, want json_schema", got)
	}
	jsonSchema, ok := captured.ResponseFormat["json_schema"].(map[string]any)
	if !ok || jsonSchema["name"] != "resofeed_summary" || jsonSchema["strict"] != true {
		t.Fatalf("json_schema = %#v, want named strict schema", captured.ResponseFormat["json_schema"])
	}
	if captured.Provider == nil || captured.Provider["require_parameters"] != true {
		t.Fatalf("provider = %#v, want require_parameters=true", captured.Provider)
	}
}

func TestOpenRouterStructuredOutputRoutingUsesJSONObjectWhenSelectedModelMetadataDoesNotSupportResponseFormat(t *testing.T) {
	ctx := context.Background()
	var captured promptingV21ChatRequest
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/models":
			writeOpenRouterModelsMetadata(t, w, "openrouter/no-schema", "tools")
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/chat/completions":
			var err error
			captured, err = decodePromptingV21ChatRequest(r)
			if err != nil {
				t.Errorf("decode chat request: %v", err)
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			writeOpenRouterSummaryResponse(t, w, validPromptingV21Output(nil))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(provider.Close)

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: provider.URL, client: provider.Client(), model: "openrouter/no-schema"}
	if _, err := client.SummarizeItem(ctx, minimalSummaryInput()); err != nil {
		t.Fatalf("SummarizeItem returned error: %v", err)
	}
	if got := captured.ResponseFormat["type"]; got != "json_object" {
		t.Fatalf("response_format.type = %#v, want json_object", got)
	}
	if captured.Provider != nil {
		t.Fatalf("provider = %#v, want nil for unsupported metadata path", captured.Provider)
	}
	if captured.Model != "openrouter/no-schema" {
		t.Fatalf("model = %q, want same selected model", captured.Model)
	}
}

func TestOpenRouterStructuredOutputRoutingDowngradesOnceBeforeGenerationUsingSameSelectedModel(t *testing.T) {
	ctx := context.Background()
	var seen []promptingV21ChatRequest
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/models":
			writeOpenRouterModelsMetadata(t, w, "openrouter/downgrade", "response_format")
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/chat/completions":
			request, err := decodePromptingV21ChatRequest(r)
			if err != nil {
				t.Errorf("decode chat request: %v", err)
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			seen = append(seen, request)
			if len(seen) == 1 {
				http.Error(w, `{"error":{"message":"response_format unsupported before generation"}}`, http.StatusBadRequest)
				return
			}
			writeOpenRouterSummaryResponse(t, w, validPromptingV21Output(nil))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(provider.Close)

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: provider.URL, client: provider.Client(), model: "openrouter/downgrade"}
	if _, err := client.SummarizeItem(ctx, minimalSummaryInput()); err != nil {
		t.Fatalf("SummarizeItem returned error: %v", err)
	}
	if len(seen) != 2 {
		t.Fatalf("attempts = %d, want exactly two", len(seen))
	}
	if seen[0].ResponseFormat["type"] != "json_schema" || seen[1].ResponseFormat["type"] != "json_object" {
		t.Fatalf("attempt modes = %q, %q; want json_schema then json_object", seen[0].ResponseFormat["type"], seen[1].ResponseFormat["type"])
	}
	if seen[0].Model != "openrouter/downgrade" || seen[1].Model != "openrouter/downgrade" {
		t.Fatalf("model changed across downgrade: %#v", seen)
	}
}

func TestOpenRouterStructuredOutputRoutingDoesNotDowngradeAfterGeneratedResponseFailure(t *testing.T) {
	ctx := context.Background()
	var seen []promptingV21ChatRequest
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/models":
			writeOpenRouterModelsMetadata(t, w, "openrouter/generated-failure", "response_format")
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/chat/completions":
			request, err := decodePromptingV21ChatRequest(r)
			if err != nil {
				t.Fatalf("decode chat request: %v", err)
			}
			seen = append(seen, request)
			response := openRouterChatResponse{Model: "openrouter/generated-failure", Choices: []struct {
				Message openRouterMessage `json:"message"`
			}{{Message: openRouterMessage{Role: "assistant", Content: `not-json`}}}}
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(response); err != nil {
				t.Fatalf("encode response: %v", err)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(provider.Close)

	client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: provider.URL, client: provider.Client(), model: "openrouter/generated-failure"}
	_, err := client.SummarizeItem(ctx, minimalSummaryInput())
	if err == nil {
		t.Fatal("SummarizeItem returned nil error for generated invalid JSON")
	}
	if len(seen) != 2 {
		t.Fatalf("attempts = %d, want one normal attempt plus one semantic repair attempt", len(seen))
	}
	for i, request := range seen {
		if request.ResponseFormat["type"] != "json_schema" {
			t.Fatalf("attempt %d response_format = %q, want json_schema (no generated-response downgrade)", i+1, request.ResponseFormat["type"])
		}
	}
	for _, forbidden := range []string{"fake-openrouter-key", "response_format unsupported before generation", "OPENROUTER_KEY", ".env"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("error leaked %q in %q", forbidden, err.Error())
		}
	}
}

func TestOpenRouterListShapedOneTimePromptsRouteToKeyPoints(t *testing.T) {
	for _, tc := range []struct {
		name   string
		prompt string
	}{
		{name: "chinese split core insight", prompt: "核心洞察要分点"},
		{name: "english list risks", prompt: "List the implementation risks as bullets."},
		{name: "english key takeaways", prompt: "Give me the top takeaways as a numbered list."},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			var captured promptingV21UserPayload
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodGet && r.URL.Path == "/api/v1/models":
					writeOpenRouterModelsMetadata(t, w, "openrouter/list-routing", "response_format")
				case r.Method == http.MethodPost && r.URL.Path == "/api/v1/chat/completions":
					request, err := decodePromptingV21ChatRequest(r)
					if err != nil {
						t.Fatalf("decode chat request: %v", err)
					}
					if len(request.Messages) != 2 {
						t.Fatalf("messages len = %d, want system+user", len(request.Messages))
					}
					if err := json.Unmarshal([]byte(request.Messages[1].Content), &captured); err != nil {
						t.Fatalf("decode user payload: %v", err)
					}
					writeOpenRouterSummaryResponse(t, w, validPromptingV21Output(func(out *OpenRouterSummaryOutput) {
						out.CoreInsight = "List-shaped guidance is routed into structured key points."
						out.KeyPoints = []string{
							"Source-backed implementation risk point one.",
							"Source-backed implementation risk point two.",
							"Source-backed implementation risk point three.",
						}
					}))
				default:
					http.NotFound(w, r)
				}
			}))
			t.Cleanup(provider.Close)

			client := &openRouterHTTPClient{apiKey: "fake-openrouter-key", endpoint: provider.URL, client: provider.Client(), model: "openrouter/list-routing"}
			out, err := client.SummarizeItem(ctx, OpenRouterSummaryInput{
				ItemID:         "item_list_routing",
				Title:          "List Routing",
				SourceTitle:    "Contract Source",
				URL:            "https://example.test/list-routing",
				AvailableText:  "The source describes implementation risks, rollback plans, and operational takeaways.",
				TargetLanguage: ProcessingLanguageEnglish,
				Prompt:         tc.prompt,
			})
			if err != nil {
				t.Fatalf("SummarizeItem returned error: %v", err)
			}
			if captured.Guidance.OneTimePrompt == nil || *captured.Guidance.OneTimePrompt != tc.prompt {
				t.Fatalf("one-time prompt not field-scoped in payload: %+v", captured.Guidance)
			}
			contractJSON, err := json.Marshal(captured.Contract)
			if err != nil {
				t.Fatalf("marshal contract: %v", err)
			}
			for _, want := range []string{"key_points", "one sentence", "schema", "target language", "provenance", "model_status"} {
				if !strings.Contains(string(contractJSON), want) {
					t.Fatalf("compiled contract missing %q for list routing: %s", want, contractJSON)
				}
			}
			if len(out.KeyPoints) != 3 {
				t.Fatalf("key_points len = %d, want 3; out=%+v", len(out.KeyPoints), out)
			}
			if !isSingleSentenceCoreInsight(out.CoreInsight) || isListLikeText(out.CoreInsight) {
				t.Fatalf("core_insight shape invalid after list prompt: %q", out.CoreInsight)
			}
		})
	}
}
