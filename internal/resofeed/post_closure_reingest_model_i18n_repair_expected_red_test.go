package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// expected_result: red
// These tests pin the post-closure R2/R3/R4 repair contract before product
// implementation changes. Red is expected from missing HTTP route compatibility
// and request-shape drift, not from compile or harness failures.

func TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed(t *testing.T) {
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	routes := []string{"/api/runtime/openrouter-models", "/api/runtime/openrouter/models"}

	for _, route := range routes {
		t.Run("missing owner token "+route, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, route, nil))
			assertStatus(t, recorder, http.StatusUnauthorized)
		})

		t.Run("invalid owner token "+route, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, route, nil)
			req.Header.Set("Authorization", "Bearer wrong-owner-token")
			router.ServeHTTP(recorder, req)
			assertStatus(t, recorder, http.StatusUnauthorized)
		})

		t.Run("rejects query "+route, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, route+"?limit=1", nil))
			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), "limit")
		})

		t.Run("authorized all-model list "+route, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, route, nil))
			assertStatus(t, recorder, http.StatusOK)
			assertContentType(t, recorder, "application/json; charset=utf-8")

			var parsed OpenRouterModelsResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
				t.Fatalf("unmarshal model list response: %v; body=%s", err, recorder.Body.String())
			}
			if parsed.Models == nil {
				t.Fatalf("models response = %+v, want all-model listing array", parsed)
			}
		})
	}
}

func TestPostClosureModelListProviderFailureRedactionExpectedRed(t *testing.T) {
	providerPayload := `{"error":{"message":"OpenRouter upstream rejected key sk-or-provider-secret from /Users/owner/project/.env with owner-token owner-token-provider-leak"}}`
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, providerPayload, http.StatusUnauthorized)
	}))
	t.Cleanup(provider.Close)

	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-local-secret-from-env", Endpoint: provider.URL}})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/runtime/openrouter-models", nil))

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("model-list provider failure status = %d, want %d redacted service-unavailable error; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
	assertContentType(t, recorder, "application/json; charset=utf-8")
	var parsed ErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal model-list provider error: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Error.Code != "provider_unavailable" && parsed.Error.Code != "internal" {
		t.Fatalf("provider failure error.code = %q, want generic provider_unavailable/internal", parsed.Error.Code)
	}
	if strings.TrimSpace(parsed.Error.Message) == "" || strings.Contains(strings.ToLower(parsed.Error.Message), "openrouter") {
		t.Fatalf("provider failure message = %q, want generic redacted message", parsed.Error.Message)
	}
	assertResponseOmitsForbiddenSubstrings(t, recorder.Body.String(), []string{
		"OpenRouter upstream rejected", "sk-or-provider-secret", "sk-or-local-secret-from-env", ".env", "/Users/owner/project/.env", "owner-token-provider-leak", contractOwnerToken, providerPayload,
	})
}

func TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/models" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("Authorization"); !strings.HasPrefix(got, "Bearer ") || got == "Bearer " {
			http.Error(w, `{"error":{"message":"missing provider authorization"}}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"id":"openrouter/test-model","name":"Test Model"}]}`)
	}))
	t.Cleanup(provider.Close)
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-route-equivalence-secret", Endpoint: provider.URL}})
	canonical := "/api/runtime/openrouter-models"
	compat := "/api/runtime/openrouter/models"

	for _, tc := range []struct {
		name       string
		pathSuffix string
		authorized bool
		token      string
		wantStatus int
	}{
		{name: "missing token", wantStatus: http.StatusUnauthorized},
		{name: "invalid token", authorized: true, token: "wrong-owner-token", wantStatus: http.StatusUnauthorized},
		{name: "invalid query", pathSuffix: "?limit=1", authorized: true, token: contractOwnerToken, wantStatus: http.StatusBadRequest},
		{name: "success", authorized: true, token: contractOwnerToken, wantStatus: http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			left := exerciseModelListRoute(router, canonical+tc.pathSuffix, tc.authorized, tc.token)
			right := exerciseModelListRoute(router, compat+tc.pathSuffix, tc.authorized, tc.token)
			assertModelListRouteEquivalent(t, canonical, left, compat, right)
			if left.status != tc.wantStatus {
				t.Fatalf("%s %s status = %d, want %d; body=%s", tc.name, canonical, left.status, tc.wantStatus, left.body)
			}
			if tc.wantStatus == http.StatusBadRequest {
				assertNormalizedError(t, left.body, "bad_request", "bad request", "limit")
			}
			if tc.wantStatus == http.StatusOK {
				assertModelListSuccessShape(t, left.body)
			}
		})
	}

	failingProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"message":"OpenRouter raw provider leak sk-or-route-equivalence-secret /tmp/.env owner-token-route"}}`, http.StatusBadGateway)
	}))
	t.Cleanup(failingProvider.Close)
	failingRouter := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-route-equivalence-secret", Endpoint: failingProvider.URL}})
	left := exerciseModelListRoute(failingRouter, canonical, true, contractOwnerToken)
	right := exerciseModelListRoute(failingRouter, compat, true, contractOwnerToken)
	assertModelListRouteEquivalent(t, canonical, left, compat, right)
	if left.status != http.StatusServiceUnavailable {
		t.Fatalf("provider failure status = %d, want %d; body=%s", left.status, http.StatusServiceUnavailable, left.body)
	}
	assertResponseOmitsForbiddenSubstrings(t, left.body+right.body, []string{"OpenRouter raw provider leak", "sk-or-route-equivalence-secret", ".env", "owner-token-route"})
}

func TestPostClosureItemReingestPromptModelIdempotencyFingerprintExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	llm := &postClosureRecordingLLM{}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	canonicalBody := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-fingerprint","model":"  openrouter/test-model  ","prompt":"  tighten factual density  "}`
	first := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", canonicalBody)
	assertStatus(t, first, http.StatusOK)
	if llm.calls != 1 || llm.last.Model != "openrouter/test-model" || llm.last.Prompt != "tighten factual density" {
		t.Fatalf("first model call count/input = %d %+v, want one call with normalized model/prompt", llm.calls, llm.last)
	}

	replay := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", canonicalBody)
	assertStatus(t, replay, http.StatusOK)
	var replayBody ItemReingestResponse
	if err := json.Unmarshal(replay.Body.Bytes(), &replayBody); err != nil {
		t.Fatalf("unmarshal replay response: %v; body=%s", err, replay.Body.String())
	}
	if !replayBody.AlreadyApplied {
		t.Fatalf("same key/model/prompt replay = %+v, want already_applied", replayBody)
	}
	if llm.calls != 1 {
		t.Fatalf("same key/model/prompt replay called model again: calls=%d", llm.calls)
	}

	changedPrompt := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-fingerprint","model":"openrouter/test-model","prompt":"changed retry instruction"}`)
	assertStatus(t, changedPrompt, http.StatusBadRequest)
	assertErrorField(t, changedPrompt.Body.Bytes(), "idempotency_key")
	if llm.calls != 1 {
		t.Fatalf("changed prompt conflict called model: calls=%d", llm.calls)
	}

	changedModel := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-fingerprint","model":"openrouter/other-model","prompt":"tighten factual density"}`)
	assertStatus(t, changedModel, http.StatusBadRequest)
	assertErrorField(t, changedModel.Body.Bytes(), "idempotency_key")
	if llm.calls != 1 {
		t.Fatalf("changed model conflict called model: calls=%d", llm.calls)
	}
}

func TestPostClosureItemReingestCurrentOperationGuardConflictExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: &postClosureRecordingLLM{}})

	release, err := tryAcquireIngestGuardWithActor(ctx, "item_reingest", "item_reingest_01", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("hold item reingest guard: %v", err)
	}
	t.Cleanup(release)

	recorder := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-guard-conflict"}`)
	assertStatus(t, recorder, http.StatusConflict)
	var parsed ErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal guard conflict: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Error.Code != "conflict" || parsed.Error.Message != "operation already running" {
		t.Fatalf("guard conflict error = %+v, want conflict operation already running", parsed.Error)
	}
	assertHTTPConflictDetailsWithCurrentOperation(t, parsed.Error.Details, "item_reingest", "human")
}

func TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	llm := &postClosureRecordingLLM{}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	t.Run("missing owner token rejected", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/items/item_reingest_01/reingest", strings.NewReader(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-missing-auth"}`))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, req)
		assertStatus(t, recorder, http.StatusUnauthorized)
	})

	t.Run("invalid owner token rejected", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/items/item_reingest_01/reingest", strings.NewReader(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-invalid-auth"}`))
		req.Header.Set("Authorization", "Bearer wrong-owner-token")
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, req)
		assertStatus(t, recorder, http.StatusUnauthorized)
	})

	t.Run("canonical prompt fixture passes request scoped model and prompt", func(t *testing.T) {
		body := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-canonical-prompt","model":"openrouter/test-model","prompt":"Use one-time factual repair."}`
		recorder := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", body)
		assertStatus(t, recorder, http.StatusOK)
		if llm.last.Model != "openrouter/test-model" || llm.last.Prompt != "Use one-time factual repair." {
			t.Fatalf("summary input model/prompt = %q/%q, want request-scoped values", llm.last.Model, llm.last.Prompt)
		}
		assertNoPostClosurePromptModelRuntimeState(t, ctx, db, []string{"openrouter/test-model", "Use one-time factual repair."})
	})

	t.Run("documented compatibility extra_prompt fixture passes one-time prompt", func(t *testing.T) {
		// Exact external compatibility request shape from the repair contract.
		body := `{
  "actor_kind": "human",
  "actor_id": "owner-or-agent-id",
  "idempotency_key": "non-empty-key",
  "model": "openrouter/model-id",
  "extra_prompt": "one-time retry instruction"
}`
		recorder := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", body)
		assertStatus(t, recorder, http.StatusOK)
		if llm.last.Model != "openrouter/model-id" || llm.last.Prompt != "one-time retry instruction" {
			t.Fatalf("extra_prompt normalized to model/prompt = %q/%q, want compatibility values", llm.last.Model, llm.last.Prompt)
		}
		assertNoPostClosurePromptModelRuntimeState(t, ctx, db, []string{"openrouter/model-id", "one-time retry instruction"})
	})

	t.Run("conflicting prompt aliases are bad request and do not call model", func(t *testing.T) {
		before := llm.calls
		body := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-conflict-prompt","prompt":"first","extra_prompt":"second"}`
		recorder := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", body)
		assertStatus(t, recorder, http.StatusBadRequest)
		if llm.calls != before {
			t.Fatalf("conflicting prompt aliases called model: before=%d after=%d", before, llm.calls)
		}
	})

	t.Run("strict json rejects language without leaking prompt", func(t *testing.T) {
		body := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-language-field","prompt":"do not leak sk-post-closure-secret","language":"zh"}`
		recorder := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", body)
		assertStatus(t, recorder, http.StatusBadRequest)
		assertErrorField(t, recorder.Body.Bytes(), "language")
		if strings.Contains(recorder.Body.String(), "sk-post-closure-secret") {
			t.Fatalf("strict JSON error leaked prompt text: %s", recorder.Body.String())
		}
	})
}

func TestPostClosureChineseReingestRequiresExplicitOperationExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	beforeSelected := readItemReingestText(t, ctx, db, "item_reingest_01")
	beforeOther := readItemReingestText(t, ctx, db, "item_reingest_other")
	if _, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{Language: ProcessingLanguageChinese, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "post-closure-set-zh"}}); err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}
	if afterLanguageChange := readItemReingestText(t, ctx, db, "item_reingest_01"); afterLanguageChange != beforeSelected {
		t.Fatalf("language change rewrote existing selected item without reingest: before=%+v after=%+v", beforeSelected, afterLanguageChange)
	}

	llm := &postClosureRecordingLLM{}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})
	recorder := postClosureAuthorizedJSON(router, http.MethodPost, "/api/items/item_reingest_01/reingest", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"post-closure-zh-reingest"}`)
	assertStatus(t, recorder, http.StatusOK)
	if llm.last.TargetLanguage != ProcessingLanguageChinese {
		t.Fatalf("reingest target language = %q, want zh", llm.last.TargetLanguage)
	}
	selected := readItemReingestText(t, ctx, db, "item_reingest_01")
	if selected.summary != "中文摘要 item_reingest_01" || selected.coreInsight != "中文洞察 item_reingest_01。" {
		t.Fatalf("selected item zh text = %+v, want zh model-backed summary/core", selected)
	}
	if other := readItemReingestText(t, ctx, db, "item_reingest_other"); other != beforeOther {
		t.Fatalf("selected-item reingest rewrote non-selected item: before=%+v after=%+v", beforeOther, other)
	}
}

func postClosureAuthorizedJSON(router http.Handler, method string, path string, body string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	req := authorizedRequest(method, path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	return recorder
}

type postClosureRouteResult struct {
	status      int
	contentType string
	body        string
	normalized  string
}

func exerciseModelListRoute(router http.Handler, path string, setToken bool, token string) postClosureRouteResult {
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if setToken {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	router.ServeHTTP(recorder, req)
	body := recorder.Body.String()
	return postClosureRouteResult{status: recorder.Code, contentType: recorder.Header().Get("Content-Type"), body: body, normalized: normalizeModelListRouteBody(body)}
}

func normalizeModelListRouteBody(body string) string {
	var value any
	if err := json.Unmarshal([]byte(body), &value); err != nil {
		return strings.TrimSpace(body)
	}
	normalized, err := json.Marshal(value)
	if err != nil {
		return strings.TrimSpace(body)
	}
	return string(normalized)
}

func assertModelListRouteEquivalent(t *testing.T, leftPath string, left postClosureRouteResult, rightPath string, right postClosureRouteResult) {
	t.Helper()
	if left.status != right.status {
		t.Fatalf("model-list route status drift: %s=%d body=%s; %s=%d body=%s", leftPath, left.status, left.body, rightPath, right.status, right.body)
	}
	if left.contentType != right.contentType {
		t.Fatalf("model-list route content-type drift: %s=%q; %s=%q", leftPath, left.contentType, rightPath, right.contentType)
	}
	if left.normalized != right.normalized {
		t.Fatalf("model-list route body drift:\n%s: %s\n%s: %s", leftPath, left.normalized, rightPath, right.normalized)
	}
}

func assertNormalizedError(t *testing.T, body string, wantCode string, wantMessage string, wantField string) {
	t.Helper()
	var parsed ErrorBody
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		t.Fatalf("unmarshal normalized error: %v; body=%s", err, body)
	}
	if parsed.Error.Code != wantCode || parsed.Error.Message != wantMessage {
		t.Fatalf("error = %+v, want code=%q message=%q", parsed.Error, wantCode, wantMessage)
	}
	if wantField != "" && parsed.Error.Details["field"] != wantField {
		t.Fatalf("error.details.field = %#v, want %q", parsed.Error.Details["field"], wantField)
	}
}

func assertModelListSuccessShape(t *testing.T, body string) {
	t.Helper()
	var parsed OpenRouterModelsResponse
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		t.Fatalf("unmarshal model-list success: %v; body=%s", err, body)
	}
	if len(parsed.Models) != 1 || parsed.Models[0].ID != "openrouter/test-model" || parsed.Models[0].Name != "Test Model" {
		t.Fatalf("model-list success = %+v, want normalized id/name model payload", parsed)
	}
}

func assertResponseOmitsForbiddenSubstrings(t *testing.T, body string, forbidden []string) {
	t.Helper()
	for _, marker := range forbidden {
		if marker == "" {
			continue
		}
		if strings.Contains(body, marker) {
			t.Fatalf("response leaked forbidden marker %q in body=%s", marker, body)
		}
	}
}

func assertHTTPConflictDetailsWithCurrentOperation(t *testing.T, details map[string]any, wantOperation string, wantActorKind string) {
	t.Helper()
	if details["operation_running"] != true || details["retry_allowed"] != true {
		t.Fatalf("guard details missing retryable operation flags: %+v", details)
	}
	if details["operation"] != wantOperation || details["actor_kind"] != wantActorKind {
		t.Fatalf("guard details operation/actor = %s/%s, want %s/%s; details=%+v", fmt.Sprint(details["operation"]), fmt.Sprint(details["actor_kind"]), wantOperation, wantActorKind, details)
	}
	current, ok := details["current_operation"].(map[string]any)
	if !ok {
		t.Fatalf("guard details current_operation = %#v, want object", details["current_operation"])
	}
	if current["running"] != true || current["kind"] != wantOperation || current["actor_kind"] != wantActorKind {
		t.Fatalf("current_operation = %+v, want running %s/%s", current, wantOperation, wantActorKind)
	}
}

func assertNoPostClosurePromptModelRuntimeState(t *testing.T, ctx context.Context, db *sql.DB, forbidden []string) {
	t.Helper()
	for _, value := range forbidden {
		var count int
		pattern := "%" + value + "%"
		if err := db.QueryRowContext(ctx, `select count(*) from runtime_metadata where value like ?`, pattern).Scan(&count); err != nil {
			t.Fatalf("query runtime_metadata for %q: %v", value, err)
		}
		if count != 0 {
			t.Fatalf("runtime_metadata persisted request-scoped prompt/model %q", value)
		}
	}
}

type postClosureRecordingLLM struct {
	last  OpenRouterSummaryInput
	calls int
}

func (l *postClosureRecordingLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.calls++
	l.last = input
	if input.TargetLanguage == ProcessingLanguageChinese {
		return OpenRouterSummaryOutput{LocalizedTitle: "中文本地名", Title: "中文本地名", Summary: "中文摘要 " + input.ItemID, CoreInsight: "中文洞察 " + input.ItemID + "。", FeedExcerpt: "中文摘录 " + input.ItemID, ExtractedText: "中文正文 " + input.ItemID, KeyPoints: []string{"中文要点一说明事实。", "中文要点二说明事实。", "中文要点三说明事实。"}, ValueTier: "high", ModelStatus: modelStatusOK}, nil
	}
	out := ccrTestSummaryOutput("English title "+input.ItemID, "English summary "+input.ItemID, "English insight "+input.ItemID+".", "high")
	out.FeedExcerpt = "English excerpt " + input.ItemID
	out.ExtractedText = "English body " + input.ItemID
	return out, nil
}

func (l *postClosureRecordingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}
