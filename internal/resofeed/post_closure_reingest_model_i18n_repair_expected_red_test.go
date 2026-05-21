package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
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
		return OpenRouterSummaryOutput{Title: "中文标题 " + input.ItemID, Summary: "中文摘要 " + input.ItemID, CoreInsight: "中文洞察 " + input.ItemID + "。", FeedExcerpt: "中文摘录 " + input.ItemID, ExtractedText: "中文正文 " + input.ItemID, ValueTier: "high", ModelStatus: modelStatusOK}, nil
	}
	return OpenRouterSummaryOutput{Title: "English title " + input.ItemID, Summary: "English summary " + input.ItemID, CoreInsight: "English insight " + input.ItemID + ".", FeedExcerpt: "English excerpt " + input.ItemID, ExtractedText: "English body " + input.ItemID, ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (l *postClosureRecordingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}
