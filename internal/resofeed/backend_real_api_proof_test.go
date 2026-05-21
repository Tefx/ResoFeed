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
	"time"
)

func TestBackendRealAPIProofThroughHTTPServer(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemReingestFixture(t, ctx, db)
	llm := &postClosureRecordingLLM{}

	api := httptest.NewServer(NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm}))
	t.Cleanup(api.Close)
	t.Logf("server_or_testserver_start_command: go test ./internal/resofeed -run TestBackendRealAPIProofThroughHTTPServer -count=1 -v (httptest server %s)", api.URL)

	validBody := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"real-api-reingest-success","model":"openrouter/real-api-proof-model","prompt":"one-time real API proof prompt"}`
	valid := realAPIRequest(t, http.MethodPost, api.URL+"/api/items/item_reingest_01/reingest", contractOwnerToken, "application/json", strings.NewReader(validBody))
	logHTTPProof(t, "curl/reingest valid owner token", fmt.Sprintf("curl -i -X POST %s/api/items/item_reingest_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '%s'", api.URL, validBody), valid)
	if valid.status != http.StatusOK {
		t.Fatalf("valid reingest status=%d body=%s", valid.status, valid.body)
	}
	if llm.calls != 1 || llm.last.Model != "openrouter/real-api-proof-model" || llm.last.Prompt != "one-time real API proof prompt" {
		t.Fatalf("LLM input after real HTTP reingest calls=%d last=%+v", llm.calls, llm.last)
	}
	var reingest ItemReingestResponse
	if err := json.Unmarshal([]byte(valid.body), &reingest); err != nil {
		t.Fatalf("decode reingest response: %v body=%s", err, valid.body)
	}
	if !reingest.Reingest.ItemUpdated || !reingest.Reingest.FTSUpdated || reingest.Reingest.Item == nil || valueOfStringPtr(reingest.Reingest.Item.Summary) != "English summary item_reingest_01" {
		t.Fatalf("reingest response did not prove updated item/FTS/refreshed detail: %+v", reingest.Reingest)
	}

	missingAuth := realAPIRequest(t, http.MethodPost, api.URL+"/api/items/item_reingest_01/reingest", "", "application/json", strings.NewReader(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"real-api-reingest-missing-auth"}`))
	logHTTPProof(t, "curl/reingest missing owner token", fmt.Sprintf("curl -i -X POST %s/api/items/item_reingest_01/reingest -H 'Content-Type: application/json' --data '{...}'", api.URL), missingAuth)
	if missingAuth.status != http.StatusUnauthorized {
		t.Fatalf("missing auth status=%d body=%s", missingAuth.status, missingAuth.body)
	}

	invalidAuth := realAPIRequest(t, http.MethodPost, api.URL+"/api/items/item_reingest_01/reingest", "wrong-owner-token", "application/json", strings.NewReader(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"real-api-reingest-invalid-auth"}`))
	logHTTPProof(t, "curl/reingest invalid owner token", fmt.Sprintf("curl -i -X POST %s/api/items/item_reingest_01/reingest -H 'Authorization: Bearer wrong-owner-token' -H 'Content-Type: application/json' --data '{...}'", api.URL), invalidAuth)
	if invalidAuth.status != http.StatusUnauthorized {
		t.Fatalf("invalid auth status=%d body=%s", invalidAuth.status, invalidAuth.body)
	}

	malformed := realAPIRequest(t, http.MethodPost, api.URL+"/api/items/item_reingest_01/reingest", contractOwnerToken, "application/json", strings.NewReader(`{"actor_kind":"human"`))
	logHTTPProof(t, "curl/reingest malformed JSON", fmt.Sprintf("curl -i -X POST %s/api/items/item_reingest_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{\"actor_kind\":\"human\"'", api.URL), malformed)
	if malformed.status != http.StatusBadRequest || strings.Contains(malformed.body, "one-time real API proof prompt") {
		t.Fatalf("malformed JSON did not return safe bad_request: status=%d body=%s", malformed.status, malformed.body)
	}

	wrongType := realAPIRequest(t, http.MethodPost, api.URL+"/api/items/item_reingest_01/reingest", contractOwnerToken, "application/json", strings.NewReader(`{"actor_kind":"human","actor_id":"owner","idempotency_key":"real-api-reingest-wrong-type","prompt":123}`))
	logHTTPProof(t, "curl/reingest wrong-type JSON", fmt.Sprintf("curl -i -X POST %s/api/items/item_reingest_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{...\"prompt\":123}'", api.URL), wrongType)
	if wrongType.status != http.StatusBadRequest || !strings.Contains(wrongType.body, "prompt") {
		t.Fatalf("wrong-type prompt did not return field-scoped bad_request: status=%d body=%s", wrongType.status, wrongType.body)
	}

	stateEvidence := runtimeMetadataCountEvidence(t, ctx, db, []string{"openrouter/real-api-proof-model", "one-time real API proof prompt"})
	t.Logf("no_durable_prompt_model_state_check: %s", stateEvidence)

	missingKeyAPI := httptest.NewServer(NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken}))
	t.Cleanup(missingKeyAPI.Close)
	t.Setenv("OPENROUTER_KEY", "")
	missingKey := realAPIRequest(t, http.MethodGet, missingKeyAPI.URL+"/api/runtime/openrouter-models", contractOwnerToken, "", nil)
	logHTTPProof(t, "curl/model-list missing API key canonical path", fmt.Sprintf("OPENROUTER_KEY= curl -i %s/api/runtime/openrouter-models -H 'Authorization: Bearer <owner-token>'", missingKeyAPI.URL), missingKey)
	if missingKey.status != http.StatusOK || !jsonBodiesEqual(missingKey.body, `{"models":[]}`) {
		t.Fatalf("missing API key model-list response status=%d body=%s", missingKey.status, missingKey.body)
	}

	var providerAuth string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		providerAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/api/v1/models" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"id":"openrouter/test-model","name":"Test Model"}]}`)
	}))
	t.Cleanup(provider.Close)
	modelAPI := httptest.NewServer(NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-real-api-proof", Endpoint: provider.URL}}))
	t.Cleanup(modelAPI.Close)
	canonical := realAPIRequest(t, http.MethodGet, modelAPI.URL+"/api/runtime/openrouter-models", contractOwnerToken, "", nil)
	compat := realAPIRequest(t, http.MethodGet, modelAPI.URL+"/api/runtime/openrouter/models", contractOwnerToken, "", nil)
	logHTTPProof(t, "curl/model-list canonical path", fmt.Sprintf("curl -i %s/api/runtime/openrouter-models -H 'Authorization: Bearer <owner-token>'", modelAPI.URL), canonical)
	logHTTPProof(t, "curl/model-list compatibility path", fmt.Sprintf("curl -i %s/api/runtime/openrouter/models -H 'Authorization: Bearer <owner-token>'", modelAPI.URL), compat)
	if canonical.status != http.StatusOK || compat.status != http.StatusOK || !jsonBodiesEqual(canonical.body, compat.body) || !jsonBodiesEqual(canonical.body, `{"models":[{"id":"openrouter/test-model","name":"Test Model"}]}`) {
		t.Fatalf("model route proof failed canonical=%d/%s compat=%d/%s", canonical.status, canonical.body, compat.status, compat.body)
	}
	if providerAuth != "Bearer sk-real-api-proof" {
		t.Fatalf("provider auth header = %q, want configured API key bearer", providerAuth)
	}
	failingProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/models" {
			http.NotFound(w, r)
			return
		}
		http.Error(w, `{"error":{"message":"raw provider leak sk-real-api-proof /tmp/.env owner-token-leak"}}`, http.StatusBadGateway)
	}))
	t.Cleanup(failingProvider.Close)
	failingAPI := httptest.NewServer(NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, OpenRouter: OpenRouterConfig{APIKey: "sk-real-api-proof", Endpoint: failingProvider.URL}}))
	t.Cleanup(failingAPI.Close)
	providerFailure := realAPIRequest(t, http.MethodGet, failingAPI.URL+"/api/runtime/openrouter-models", contractOwnerToken, "", nil)
	logHTTPProof(t, "curl/model-list provider failure redaction", fmt.Sprintf("curl -i %s/api/runtime/openrouter-models -H 'Authorization: Bearer <owner-token>'", failingAPI.URL), providerFailure)
	if providerFailure.status != http.StatusServiceUnavailable || strings.Contains(providerFailure.body, "sk-real-api-proof") || strings.Contains(providerFailure.body, ".env") || strings.Contains(providerFailure.body, "owner-token-leak") || strings.Contains(providerFailure.body, "raw provider leak") {
		t.Fatalf("provider failure was not safely redacted: status=%d body=%s", providerFailure.status, providerFailure.body)
	}
	unauthModels := realAPIRequest(t, http.MethodGet, modelAPI.URL+"/api/runtime/openrouter-models", "", "", nil)
	logHTTPProof(t, "curl/model-list missing owner token", fmt.Sprintf("curl -i %s/api/runtime/openrouter-models", modelAPI.URL), unauthModels)
	if unauthModels.status != http.StatusUnauthorized {
		t.Fatalf("unauthorized model-list status=%d body=%s", unauthModels.status, unauthModels.body)
	}

	t.Logf("network_or_server_logs: provider_path=/api/v1/models provider_auth_header=Bearer <redacted>; llm_calls=%d llm_last_model=%q llm_last_prompt=%q", llm.calls, llm.last.Model, llm.last.Prompt)
}

func TestBackendReingestSuccessThroughPublicStateImportSetup(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &postClosureRecordingLLM{}

	article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/article" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, `<article><h1>Public seeded article</h1><p>Article text available through HTTP for blind re-ingest setup.</p></article>`)
	}))
	t.Cleanup(article.Close)

	api := httptest.NewServer(NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm}))
	t.Cleanup(api.Close)

	bundle := StateBundle{
		SchemaVersion: StateSchemaVersionV1,
		ExportedAt:    time.Now().UTC(),
		Sources:       []SourceState{{ID: "public_setup_source", URL: article.URL + "/feed.xml", Title: "Public Setup Source"}},
		SteerRules:    []SteerRuleState{},
		ResonatedItems: []ResonatedItemState{{
			ItemID:    "public_setup_item",
			URL:       article.URL + "/article",
			SourceURL: article.URL + "/feed.xml",
			Title:     stringPtr("Public Setup Item"),
		}},
	}
	bundleJSON, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("marshal public setup state bundle: %v", err)
	}

	imported := realAPIRequest(t, http.MethodPost, api.URL+"/api/state/import", contractOwnerToken, "application/json", bytes.NewReader(bundleJSON))
	logHTTPProof(t, "curl/public setup state import", fmt.Sprintf("curl -i -X POST %s/api/state/import -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data @public-reingest-state.json", api.URL), imported)
	if imported.status != http.StatusOK {
		t.Fatalf("public state import setup status=%d body=%s", imported.status, imported.body)
	}

	reingestBody := `{"actor_kind":"human","actor_id":"owner","idempotency_key":"public-setup-reingest-success","extra_prompt":"public setup proof"}`
	reingest := realAPIRequest(t, http.MethodPost, api.URL+"/api/items/public_setup_item/reingest", contractOwnerToken, "application/json", strings.NewReader(reingestBody))
	logHTTPProof(t, "curl/reingest after public setup", fmt.Sprintf("curl -i -X POST %s/api/items/public_setup_item/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '%s'", api.URL, reingestBody), reingest)
	if reingest.status != http.StatusOK {
		t.Fatalf("reingest after public setup status=%d body=%s", reingest.status, reingest.body)
	}
	if llm.calls != 1 || llm.last.ItemID != "public_setup_item" || llm.last.Prompt != "public setup proof" {
		t.Fatalf("public setup LLM proof calls=%d last=%+v", llm.calls, llm.last)
	}
	var response ItemReingestResponse
	if err := json.Unmarshal([]byte(reingest.body), &response); err != nil {
		t.Fatalf("decode public setup reingest response: %v body=%s", err, reingest.body)
	}
	if !response.Reingest.ItemUpdated || response.Reingest.Item == nil || valueOfStringPtr(response.Reingest.Item.Summary) != "English summary public_setup_item" {
		t.Fatalf("public setup reingest did not return refreshed item: %+v", response.Reingest)
	}
}

type realAPIHTTPResult struct {
	status      int
	statusText  string
	contentType string
	body        string
}

func realAPIRequest(t *testing.T, method, url, token, contentType string, body io.Reader) realAPIHTTPResult {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatalf("create request %s %s: %v", method, url, err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("perform request %s %s: %v", method, url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response %s %s: %v", method, url, err)
	}
	return realAPIHTTPResult{status: resp.StatusCode, statusText: resp.Status, contentType: resp.Header.Get("Content-Type"), body: string(bytes.TrimSpace(respBody))}
}

func logHTTPProof(t *testing.T, label, command string, result realAPIHTTPResult) {
	t.Helper()
	t.Logf("%s command: %s", label, command)
	t.Logf("%s raw_status_body: HTTP/1.1 %s Content-Type=%s body=%s", label, result.statusText, result.contentType, result.body)
}

func runtimeMetadataCountEvidence(t *testing.T, ctx context.Context, db *sql.DB, forbidden []string) string {
	t.Helper()
	parts := make([]string, 0, len(forbidden))
	for _, value := range forbidden {
		var count int
		if err := db.QueryRowContext(ctx, `select count(*) from runtime_metadata where value like ?`, "%"+value+"%").Scan(&count); err != nil {
			t.Fatalf("query runtime metadata for %q: %v", value, err)
		}
		if count != 0 {
			t.Fatalf("runtime_metadata persisted request-scoped value %q count=%d", value, count)
		}
		parts = append(parts, fmt.Sprintf("runtime_metadata value LIKE %q count=%d", "%"+value+"%", count))
	}
	return strings.Join(parts, "; ")
}

func jsonBodiesEqual(left, right string) bool {
	var l any
	var r any
	if err := json.Unmarshal([]byte(left), &l); err != nil {
		return false
	}
	if err := json.Unmarshal([]byte(right), &r); err != nil {
		return false
	}
	lb, _ := json.Marshal(l)
	rb, _ := json.Marshal(r)
	return string(lb) == string(rb)
}

func valueOfStringPtr(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
