package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestV21OpenRouterModelListRoutesShareStrictRedactedSemantics(t *testing.T) {
	withUnsetOpenRouterKey(t)
	routerMissingKey := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken})
	for _, path := range []string{"/api/runtime/openrouter-models", "/api/runtime/openrouter/models"} {
		recorder := httptest.NewRecorder()
		routerMissingKey.ServeHTTP(recorder, authorizedRequest(http.MethodGet, path, nil))
		assertStatus(t, recorder, http.StatusOK)
		var parsed OpenRouterModelsResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal missing-key model list %s: %v; body=%s", path, err, recorder.Body.String())
		}
		if parsed.Models == nil || len(parsed.Models) != 0 {
			t.Fatalf("missing-key model list %s = %+v, want empty models array", path, parsed)
		}
	}

	providerCalls := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		providerCalls++
		if r.URL.Path != "/api/v1/models" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-or-v21-model-list" {
			http.Error(w, `{"error":"raw auth leak sk-or-v21-model-list /tmp/.env"}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"id":"openrouter/v21-model","name":"V21 Model"}]}`)
	}))
	t.Cleanup(provider.Close)
	router := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-v21-model-list", Endpoint: provider.URL}})

	var successBodies []string
	for _, path := range []string{"/api/runtime/openrouter-models", "/api/runtime/openrouter/models"} {
		unauth := httptest.NewRecorder()
		router.ServeHTTP(unauth, httptest.NewRequest(http.MethodGet, path, nil))
		assertStatus(t, unauth, http.StatusUnauthorized)

		query := httptest.NewRecorder()
		router.ServeHTTP(query, authorizedRequest(http.MethodGet, path+"?trace=1", nil))
		assertStatus(t, query, http.StatusBadRequest)
		assertErrorField(t, query.Body.Bytes(), "trace")

		success := httptest.NewRecorder()
		router.ServeHTTP(success, authorizedRequest(http.MethodGet, path, nil))
		assertStatus(t, success, http.StatusOK)
		assertContentType(t, success, "application/json; charset=utf-8")
		var parsed OpenRouterModelsResponse
		if err := json.Unmarshal(success.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal success model list %s: %v; body=%s", path, err, success.Body.String())
		}
		if len(parsed.Models) != 1 || parsed.Models[0].ID != "openrouter/v21-model" || parsed.Models[0].Name != "V21 Model" {
			t.Fatalf("success model list %s = %+v", path, parsed)
		}
		successBodies = append(successBodies, normalizeModelListRouteBody(success.Body.String()))
	}
	if successBodies[0] != successBodies[1] || providerCalls != 2 {
		t.Fatalf("model-list route drift bodies=%v providerCalls=%d", successBodies, providerCalls)
	}

	failingProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `OpenRouter raw provider detail sk-or-v21-failure /Users/owner/project/.env owner-token-leak`, http.StatusBadGateway)
	}))
	t.Cleanup(failingProvider.Close)
	failingRouter := NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-or-v21-failure", Endpoint: failingProvider.URL}})
	for _, path := range []string{"/api/runtime/openrouter-models", "/api/runtime/openrouter/models"} {
		failure := httptest.NewRecorder()
		failingRouter.ServeHTTP(failure, authorizedRequest(http.MethodGet, path, nil))
		assertStatus(t, failure, http.StatusServiceUnavailable)
		var parsed ErrorBody
		if err := json.Unmarshal(failure.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("unmarshal provider failure %s: %v; body=%s", path, err, failure.Body.String())
		}
		if parsed.Error.Code != "provider_unavailable" || parsed.Error.Message != "models unavailable" || len(parsed.Error.Details) != 0 {
			t.Fatalf("provider failure %s error = %+v, want redacted provider_unavailable", path, parsed.Error)
		}
		for _, forbidden := range []string{"OpenRouter raw provider detail", "sk-or-v21-failure", ".env", "owner-token-leak", contractOwnerToken} {
			if strings.Contains(failure.Body.String(), forbidden) {
				t.Fatalf("provider failure response leaked %q: %s", forbidden, failure.Body.String())
			}
		}
	}
}

func TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	assertReprocessIndexReady(t, ctx, db)
	llm := &v21RecordingReingestLLM{}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	for _, tc := range []struct {
		name        string
		body        string
		contentType string
		pathSuffix  string
		field       string
	}{
		{name: "missing content-type", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-missing-ct"}`, contentType: "", field: "content_type"},
		{name: "wrong content-type", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-wrong-ct"}`, contentType: "text/plain", field: "content_type"},
		{name: "query rejected", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-query"}`, contentType: "application/json", pathSuffix: "?trace=1", field: "trace"},
		{name: "language rejected", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-language","language":"zh"}`, contentType: "application/json", field: "language"},
		{name: "unknown rejected", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-unknown","durable_prompt":"no"}`, contentType: "application/json", field: "durable_prompt"},
		{name: "prompt alias conflict", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-prompt-conflict","prompt":"first","extra_prompt":"second"}`, contentType: "application/json", field: "prompt"},
		{name: "invalid model syntax", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-invalid-model","model":"bad model"}`, contentType: "application/json", field: "model"},
		{name: "model over 200 bytes", body: `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-long-model","model":"` + strings.Repeat("a", 201) + `"}`, contentType: "application/json", field: "model"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := llm.calls
			recorder := httptest.NewRecorder()
			req := authorizedRequest(http.MethodPost, "/api/items/item_reingest_01/reingest"+tc.pathSuffix, bytes.NewReader([]byte(tc.body)))
			if tc.contentType != "" {
				req.Header.Set("Content-Type", tc.contentType)
			}
			router.ServeHTTP(recorder, req)
			assertStatus(t, recorder, http.StatusBadRequest)
			if tc.field == "content_type" {
				var parsed ErrorBody
				if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
					t.Fatalf("unmarshal content-type error: %v; body=%s", err, recorder.Body.String())
				}
				if _, ok := parsed.Error.Details["content_type"]; !ok {
					t.Fatalf("content-type error details = %+v", parsed.Error.Details)
				}
			} else {
				assertErrorField(t, recorder.Body.Bytes(), tc.field)
			}
			if llm.calls != before {
				t.Fatalf("%s called OpenRouter boundary: before=%d after=%d", tc.name, before, llm.calls)
			}
		})
	}

	model200 := strings.Repeat("a", 200)
	acceptedBody := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-model-200","model":"  ` + model200 + `  ","extra_prompt":"  tighten facts  "}`
	accepted := postItemReingestRaw(t, router, "item_reingest_01", acceptedBody)
	assertStatus(t, accepted, http.StatusOK)
	if llm.last.Model != model200 || llm.last.Prompt != "tighten facts" {
		t.Fatalf("normalized accepted model/prompt = %q/%q", llm.last.Model, llm.last.Prompt)
	}

	replay := postItemReingestRaw(t, router, "item_reingest_01", acceptedBody)
	assertStatus(t, replay, http.StatusOK)
	var replayBody ItemReingestResponse
	if err := json.Unmarshal(replay.Body.Bytes(), &replayBody); err != nil {
		t.Fatalf("unmarshal reingest replay: %v; body=%s", err, replay.Body.String())
	}
	if !replayBody.AlreadyApplied {
		t.Fatalf("same normalized model/prompt replay = %+v, want already_applied", replayBody)
	}

	mismatch := postItemReingestRaw(t, router, "item_reingest_01", `{"actor_kind":"human","actor_id":"owner","idempotency_key":"v21-model-200","model":"`+model200+`","prompt":"different"}`)
	assertStatus(t, mismatch, http.StatusBadRequest)
	var mismatchBody ErrorBody
	if err := json.Unmarshal(mismatch.Body.Bytes(), &mismatchBody); err != nil {
		t.Fatalf("unmarshal mismatch: %v; body=%s", err, mismatch.Body.String())
	}
	if mismatchBody.Error.Details["field"] != "idempotency_key" || mismatchBody.Error.Details["reason"] != "request_fingerprint_mismatch" {
		t.Fatalf("mismatch details = %+v", mismatchBody.Error.Details)
	}
	assertReceiptOmitsRawPromptModel(t, ctx, db, "v21-model-200", []string{model200, "tighten facts", "different"})
	assertStateExportOmits(t, ctx, db, []string{model200, "tighten facts", "different"})
}

func TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem(t *testing.T) {
	ctx := context.Background()
	for _, tc := range []struct {
		name       string
		llm        LLMClient
		wantCode   ReprocessErrorCode
		wantStatus string
	}{
		{name: "provider invalid model", llm: v21FailingReingestLLM{err: classifiedOpenRouterError(modelStatusInvalidModel, errors.New("provider invalid model"))}, wantCode: ReprocessErrorInvalidModel, wantStatus: modelStatusInvalidModel},
		{name: "provider unavailable", llm: v21FailingReingestLLM{err: classifiedOpenRouterError(modelStatusProviderError, errors.New("provider unavailable"))}, wantCode: ReprocessErrorProviderError, wantStatus: modelStatusProviderError},
		{name: "decode schema semantic exhausted", llm: v21DecodeInvalidReingestLLM{}, wantCode: ReprocessErrorDecodeError, wantStatus: modelStatusDecodeError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := newContractDB(t, ctx)
			seedItemReingestFixture(t, ctx, db)
			assertReprocessIndexReady(t, ctx, db)
			assertStaleReadableFTS(t, ctx, db, "item_reingest_01")

			resp, err := ReingestItem(ctx, db, tc.llm, "item_reingest_01", ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "v21-storable-" + tc.name}})
			if err != nil {
				t.Fatalf("ReingestItem %s returned error: %v", tc.name, err)
			}
			if resp.Reingest.Status != ReprocessStatusCompletedWithErrors || resp.Reingest.Error == nil || resp.Reingest.Error.Code != tc.wantCode || !resp.Reingest.ItemUpdated || !resp.Reingest.FTSUpdated || resp.Reingest.Item == nil {
				t.Fatalf("reingest %s result = %+v, want storable failure with refreshed item/FTS", tc.name, resp.Reingest)
			}
			assertPreservedOriginalFields(t, ctx, db, "item_reingest_01", tc.wantStatus, "PRIOR summary selected", "PRIOR insight selected")
			assertNoStaleReadableFTS(t, ctx, db, "item_reingest_01", true)
		})
	}

	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	assertReprocessIndexReady(t, ctx, db)
	resp, err := ReingestItem(ctx, db, v21CanceledReingestLLM{}, "item_reingest_01", ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "v21-timeout"}})
	if err != nil {
		t.Fatalf("timeout ReingestItem returned error: %v", err)
	}
	if resp.Reingest.Status != ReprocessStatusFailed || resp.Reingest.Error == nil || resp.Reingest.Error.Code != ReprocessErrorTimeout || resp.Reingest.ItemUpdated || resp.Reingest.FTSUpdated || resp.Reingest.Item != nil {
		t.Fatalf("timeout reingest result = %+v, want failed without selected row/FTS write", resp.Reingest)
	}
	assertPreservedItemReingestFixtureFields(t, ctx, db, "item_reingest_01")
	assertStaleReadableFTS(t, ctx, db, "item_reingest_01")
}

func withUnsetOpenRouterKey(t *testing.T) {
	t.Helper()
	old, ok := os.LookupEnv(openRouterKeyEnvName)
	if err := os.Unsetenv(openRouterKeyEnvName); err != nil {
		t.Fatalf("unset OPENROUTER_KEY: %v", err)
	}
	t.Cleanup(func() {
		if ok {
			_ = os.Setenv(openRouterKeyEnvName, old)
			return
		}
		_ = os.Unsetenv(openRouterKeyEnvName)
	})
}

func assertReceiptOmitsRawPromptModel(t *testing.T, ctx context.Context, db *sql.DB, key string, forbidden []string) {
	t.Helper()
	var snapshot, fingerprint string
	if err := db.QueryRowContext(ctx, `select result_snapshot, request_fingerprint from agent_receipts where idempotency_key = ?`, key).Scan(&snapshot, &fingerprint); err != nil {
		t.Fatalf("read receipt %s: %v", key, err)
	}
	combined := snapshot + "\n" + fingerprint
	for _, value := range forbidden {
		if strings.Contains(combined, value) {
			t.Fatalf("receipt %s persisted raw prompt/model %q in %s", key, value, combined)
		}
	}
}

func assertStateExportOmits(t *testing.T, ctx context.Context, db *sql.DB, forbidden []string) {
	t.Helper()
	var buf bytes.Buffer
	if err := ExportState(ctx, db, &buf); err != nil {
		t.Fatalf("export state: %v", err)
	}
	body := buf.String()
	for _, value := range forbidden {
		if strings.Contains(body, value) {
			t.Fatalf("state export leaked %q in %s", value, body)
		}
	}
}

func assertPreservedItemReingestFixtureFields(t *testing.T, ctx context.Context, db *sql.DB, itemID string) {
	t.Helper()
	var title, summary, coreInsight, feedExcerpt, extractedText, valueTier, extractionStatus, modelStatus string
	if err := db.QueryRowContext(ctx, `select title, coalesce(summary, ''), coalesce(core_insight, ''), coalesce(feed_excerpt, ''), coalesce(extracted_text, ''), coalesce(value_tier, ''), extraction_status, model_status from items where id = ?`, itemID).Scan(&title, &summary, &coreInsight, &feedExcerpt, &extractedText, &valueTier, &extractionStatus, &modelStatus); err != nil {
		t.Fatalf("read preserved reingest fixture item %s: %v", itemID, err)
	}
	if title != "PRIOR title "+itemID || summary != "PRIOR summary selected" || coreInsight != "PRIOR insight selected" || feedExcerpt != "PRIOR excerpt "+itemID || extractedText != "PRIOR extracted "+itemID || valueTier != "brief" || extractionStatus != extractionStatusFull || modelStatus != modelStatusOK {
		t.Fatalf("item %s was degraded: title:%q summary:%q core:%q feed:%q extracted:%q tier:%q extraction:%q model:%q", itemID, title, summary, coreInsight, feedExcerpt, extractedText, valueTier, extractionStatus, modelStatus)
	}
}

type v21RecordingReingestLLM struct {
	last  OpenRouterSummaryInput
	calls int
}

func (l *v21RecordingReingestLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.calls++
	l.last = input
	return OpenRouterSummaryOutput{Title: "V21 title", Summary: "V21 summary from " + input.AvailableText, CoreInsight: "V21 insight.", FeedExcerpt: "V21 excerpt", ExtractedText: "V21 extracted", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (l *v21RecordingReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type v21FailingReingestLLM struct{ err error }

func (l v21FailingReingestLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, l.err
}

func (l v21FailingReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type v21DecodeInvalidReingestLLM struct{}

func (v21DecodeInvalidReingestLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{Title: "", Summary: "", CoreInsight: "", FeedExcerpt: "", ExtractedText: "", ValueTier: "invalid", ModelStatus: modelStatusOK}, nil
}

func (v21DecodeInvalidReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type v21CanceledReingestLLM struct{}

func (v21CanceledReingestLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, context.DeadlineExceeded
}

func (v21CanceledReingestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}
