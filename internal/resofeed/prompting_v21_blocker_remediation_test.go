package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

func TestPromptingV21ActiveSteeringPayloadAndPriority(t *testing.T) {
	compiled, err := compilePromptingV21SummaryPrompt(OpenRouterSummaryInput{
		ItemID:              "item_steering_priority",
		Title:               "Steering Priority",
		SourceTitle:         "Source",
		URL:                 "https://example.test/steering-priority",
		AvailableText:       "The source discusses PostgreSQL migrations and rollback plans.",
		AvailableTextSource: "fresh_full_text",
		TargetLanguage:      ProcessingLanguageEnglish,
		Prompt:              "For this selected item, emphasize rollback plans when source-backed.",
		ActiveSteeringRules: []string{"  steer_02: prefer Kubernetes details  ", "", "steer_01: prefer database reliability", "steer_01: prefer database reliability"},
	})
	if err != nil {
		t.Fatalf("compile prompt: %v", err)
	}
	if compiled.UserPayload.Guidance.OneTimePrompt == nil || *compiled.UserPayload.Guidance.OneTimePrompt != "For this selected item, emphasize rollback plans when source-backed." {
		t.Fatalf("one-time prompt not preserved above active steering: %+v", compiled.UserPayload.Guidance)
	}
	wantRules := []string{"steer_02: prefer Kubernetes details", "steer_01: prefer database reliability"}
	if !reflect.DeepEqual(compiled.UserPayload.Guidance.ActiveSteeringRules, wantRules) {
		t.Fatalf("active steering rules = %#v, want %#v", compiled.UserPayload.Guidance.ActiveSteeringRules, wantRules)
	}
	if compiled.UserPayload.Contract.OneTimePromptPolicy.Priority != "below contract, above active_steering_rules" {
		t.Fatalf("one-time policy priority = %q", compiled.UserPayload.Contract.OneTimePromptPolicy.Priority)
	}
	if compiled.UserPayload.QualityProfile.ProfileID == "" {
		t.Fatal("quality profile missing; active steering must outrank, not replace, default style guidance")
	}
}

func TestPromptingV21ReingestHTTPOutgoingOpenRouterCapture(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	seedActivePromptSteerRule(t, ctx, db, "steer_reingest", "Prefer database reliability unless one-time prompt asks for another source-backed angle.", 7)

	var captured promptingV21ChatRequest
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/models":
			writeOpenRouterModelsMetadata(t, w, "openrouter/request-scoped-v21", "response_format")
		case "/api/v1/chat/completions":
			request, err := decodePromptingV21ChatRequest(r)
			if err != nil {
				t.Fatalf("decode OpenRouter chat request: %v", err)
			}
			captured = request
			writeOpenRouterSummaryResponse(t, w, validPromptingV21Output(func(out *OpenRouterSummaryOutput) {
				out.Summary = "Selected item source-backed summary from re-ingest."
				out.CoreInsight = "Selected source-backed re-ingest insight."
			}))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(provider.Close)

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: NewOpenRouterClient(OpenRouterConfig{APIKey: "sk-or-test", Endpoint: provider.URL, Model: "openrouter/account-default"})})
	recorder := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-e2e-openrouter-capture","model":"openrouter/request-scoped-v21","prompt":"For this selected item only, emphasize rollback plans."}`)
	assertStatus(t, recorder, http.StatusOK)

	if captured.Model != "openrouter/request-scoped-v21" {
		t.Fatalf("captured model = %q, want request-scoped override", captured.Model)
	}
	if len(captured.Messages) != 2 || captured.Messages[0].Role != "system" || captured.Messages[0].Content != promptingV21SystemPrompt || captured.Messages[1].Role != "user" {
		t.Fatalf("captured messages = %+v, want exact separate system and v2.1 user", captured.Messages)
	}
	if got := captured.ResponseFormat["type"]; got != "json_schema" {
		t.Fatalf("response_format type = %v, want json_schema", got)
	}
	if captured.Provider["require_parameters"] != true {
		t.Fatalf("provider routing = %+v, want require_parameters=true", captured.Provider)
	}
	var payload promptingV21UserPayload
	if err := json.Unmarshal([]byte(captured.Messages[1].Content), &payload); err != nil {
		t.Fatalf("decode captured v2.1 user payload: %v", err)
	}
	if payload.SchemaVersion != PromptingV21SchemaVersion || payload.Guidance.OneTimePrompt == nil || *payload.Guidance.OneTimePrompt != "For this selected item only, emphasize rollback plans." {
		t.Fatalf("captured payload lost schema/prompt: %+v", payload)
	}
	wantRules := []string{"steer_reingest: Prefer database reliability unless one-time prompt asks for another source-backed angle."}
	if !reflect.DeepEqual(payload.Guidance.ActiveSteeringRules, wantRules) {
		t.Fatalf("captured active steering = %#v, want %#v", payload.Guidance.ActiveSteeringRules, wantRules)
	}
}

func TestPromptingV21SourceGroundingRejectsUnsupportedPromptInventedFacts(t *testing.T) {
	_, err := validateSummaryOutputForPersistenceWithPrompt(validPromptingV21Output(func(out *OpenRouterSummaryOutput) {
		out.Summary = "The source-backed summary claims revenue grew 99% after launch."
		out.CoreInsight = "Revenue rose 99% after launch."
	}), promptingV21Item{
		SourceItemTitle:     "Launch notes",
		SourceTitle:         "Example Source",
		URL:                 "https://example.test/launch",
		AvailableTextSource: "fresh_full_text",
		AvailableText:       "The launch notes mention customer interviews and packaging updates, with no numeric revenue claims.",
		TargetLanguage:      ProcessingLanguageEnglish,
	})
	if err == nil {
		t.Fatal("validation passed unsupported invented 99% claim")
	}
	var validationErr PromptValidationError
	if !errors.As(err, &validationErr) || validationErr.Code != PromptValidationPromptInjectionLeakage || validationErr.Field != "source_grounding" {
		t.Fatalf("validation err = %T %[1]v, want source_grounding prompt_injection_leakage", err)
	}
}

func seedActivePromptSteerRule(t *testing.T, ctx context.Context, db *sql.DB, id string, text string, revision int64) {
	t.Helper()
	if _, err := db.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, revision, created_by_actor_kind, created_by_actor_id) values (?, ?, 1, ?, ?, 'human', 'owner')`, id, text, time.Now().UTC().Format(time.RFC3339Nano), revision); err != nil {
		t.Fatalf("seed active steer rule %s: %v", id, err)
	}
}
