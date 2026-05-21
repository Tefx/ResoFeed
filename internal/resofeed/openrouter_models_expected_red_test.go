package resofeed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// expected_result: red
// These tests lock the OpenRouter model listing contract before runtime support
// exists. Red must be caused by missing product behavior, not compile or harness
// failures.

func TestOpenRouterModelsContractListsModelsWithoutPersistingProviderState(t *testing.T) {
	ctx := context.Background()
	var requestedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath = r.URL.Path
		if got := r.Header.Get("Authorization"); got != "Bearer fake-openrouter-key" {
			t.Fatalf("Authorization header = %q, want bearer token sent only to OpenRouter", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "openai/gpt-4.1-mini", "name": "GPT 4.1 Mini"}}})
	}))
	t.Cleanup(server.Close)

	models, err := ListOpenRouterModels(ctx, OpenRouterConfig{APIKey: "fake-openrouter-key", Endpoint: server.URL})
	if err != nil {
		t.Fatalf("ListOpenRouterModels returned error: %v", err)
	}
	if requestedPath != "/api/v1/models" {
		t.Fatalf("OpenRouter models path = %q, want /api/v1/models", requestedPath)
	}
	if len(models.Models) != 1 || models.Models[0].ID != "openai/gpt-4.1-mini" || models.Models[0].Name != "GPT 4.1 Mini" {
		t.Fatalf("models response = %+v, want one model with id/name", models)
	}
}

func TestOpenRouterModelsContractRedactsProviderErrors(t *testing.T) {
	ctx := context.Background()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"message":"bad key sk-or-secret-from-provider"}}`, http.StatusUnauthorized)
	}))
	t.Cleanup(server.Close)

	_, err := ListOpenRouterModels(ctx, OpenRouterConfig{APIKey: "sk-local-secret", Endpoint: server.URL})
	if err == nil {
		t.Fatal("ListOpenRouterModels error = nil, want redacted provider failure")
	}
	message := err.Error()
	for _, forbidden := range []string{"sk-local-secret", "sk-or-secret-from-provider", ".env", "OPENROUTER_KEY="} {
		if strings.Contains(message, forbidden) {
			t.Fatalf("model listing error leaked %q in %q", forbidden, message)
		}
	}
}
