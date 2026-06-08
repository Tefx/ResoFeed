package resofeed

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDoctorClassifiesEmptyConfiguredOpenRouterStartupAsNoItemsProcessedYet(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &openRouterHTTPClient{apiKey: "test-openrouter-token-placeholder", model: "openai/gpt-4.1-mini"}

	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/doctor", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("/api/doctor status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	assertEmptyConfiguredOpenRouterDoctor(t, recorder.Body.String())

	mcpDoctor := mcpResourceText(t, NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm}), "resofeed://system/doctor")
	assertEmptyConfiguredOpenRouterDoctor(t, mcpDoctor)
	t.Logf("raw /api/doctor response:\n%s", recorder.Body.String())
	t.Logf("raw MCP doctor response:\n%s", mcpDoctor)
}

func assertEmptyConfiguredOpenRouterDoctor(t *testing.T, body string) {
	t.Helper()
	assertDoctorHasNoSameLineDuplicateKeys(t, body)
	for _, want := range []string{
		"openrouter: configured_model=openai/gpt-4.1-mini",
		"openrouter: model_resolved=false resolved_model=unknown",
		"openrouter: item_transform_failures=0",
		"openrouter: current_item_transform_failures=0 historic_item_transform_failures=0",
		"openrouter: live_summary_successes=0 fallback_only_current_summaries=0",
		"openrouter: health_classification=no_items_processed_yet",
		"fallback_provenance: item_transform_failures=0 summary=none",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("empty configured OpenRouter doctor output missing %q:\n%s", want, body)
		}
	}
	for _, forbidden := range []string{"unresolved_product_regression", "test-openrouter-token-placeholder", "sk-or", "Authorization", ".env", "secret-source", "choices", "raw provider"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("empty configured OpenRouter doctor output leaked or confused forbidden text %q:\n%s", forbidden, body)
		}
	}
}

func assertDoctorHasNoSameLineDuplicateKeys(t *testing.T, body string) {
	t.Helper()
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		seen := map[string]bool{}
		for _, field := range strings.Fields(line) {
			key, ok := doctorLineFieldKey(field)
			if !ok {
				continue
			}
			if seen[key] {
				t.Fatalf("doctor line duplicated diagnostic key %q: %s\nfull output:\n%s", key, line, body)
			}
			seen[key] = true
		}
	}
}

func doctorLineFieldKey(field string) (string, bool) {
	field = strings.TrimSpace(field)
	if field == "" || strings.HasSuffix(field, ":") {
		return "", false
	}
	if before, _, ok := strings.Cut(field, "="); ok && before != "" {
		return strings.TrimSuffix(before, ":"), true
	}
	if before, _, ok := strings.Cut(field, ":"); ok && before != "" {
		return before, true
	}
	return "", false
}

func TestREG2026051206DoctorClassifiesStalePriorFailuresSeparatelyFromCurrentLiveSuccess(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_llm_health", "https://llm-health.example/feed.xml", "LLM Health")

	old := time.Now().UTC().Add(-(freshWindow + time.Hour)).Format(time.RFC3339)
	recent := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
insert into items (id, source_id, source_url, url, title, feed_excerpt, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status)
values
('old_model_failure', 'src_llm_health', 'https://llm-health.example/feed.xml', 'https://llm-health.example/old', 'Old model failure', 'old fallback excerpt', null, null, null, ?, ?, 'partial_extraction', 'model_latency_error'),
('current_model_success', 'src_llm_health', 'https://llm-health.example/feed.xml', 'https://llm-health.example/current', 'Current model success', 'current feed excerpt', 'Live-backed summary.', 'Live-backed insight.', 'high', ?, ?, 'full', 'ok')`, old, old, recent, recent)
	if err != nil {
		t.Fatalf("insert health items: %v", err)
	}

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "openrouter/configured", ResolvedOpenRouterModel: "openrouter/resolved"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	body := out.String()
	assertDoctorHasNoSameLineDuplicateKeys(t, body)
	for _, want := range []string{
		"openrouter: item_transform_failures=1",
		"openrouter: current_item_transform_failures=0 historic_item_transform_failures=1",
		"openrouter: live_summary_successes=1 fallback_only_current_summaries=0",
		"openrouter: health_classification=stale_database_prior_failures",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, body)
		}
	}
}

func TestDoctorClassifiesOnlyOriginalUnavailableFailuresAsSourceUnavailable(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_source_unavailable", "https://source-unavailable.example/feed.xml", "Source Unavailable")

	old := time.Now().UTC().Add(-(freshWindow + time.Hour)).Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
insert into items (id, source_id, source_url, url, title, feed_excerpt, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status)
values
('source_unavailable_only', 'src_source_unavailable', 'https://source-unavailable.example/feed.xml', 'https://x.example/unavailable', 'Original unavailable', null, null, null, null, ?, ?, 'original_unavailable', 'summary_unavailable'),
('partial_but_model_ok', 'src_source_unavailable', 'https://source-unavailable.example/feed.xml', 'https://example.com/partial-ok', 'Partial but model ok', 'rss excerpt', 'Live-backed summary.', 'Live-backed insight.', 'brief', ?, ?, 'partial_extraction', 'ok')`, old, old, old, old)
	if err != nil {
		t.Fatalf("insert source-unavailable item: %v", err)
	}

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "account_default", ResolvedOpenRouterModel: "openrouter/resolved"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	body := out.String()
	assertDoctorHasNoSameLineDuplicateKeys(t, body)
	for _, want := range []string{
		"openrouter: item_transform_failures=1",
		"openrouter: current_item_transform_failures=0 historic_item_transform_failures=1",
		"openrouter: health_classification=source_unavailable_only",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "health_classification=unresolved_product_regression") || strings.Contains(body, "health_classification=openrouter_client_timeout_or_error") {
		t.Fatalf("doctor misclassified source-only failure:\n%s", body)
	}
	if strings.Contains(body, "extraction: item=partial_but_model_ok") {
		t.Fatalf("doctor reported content-ok partial extraction as extraction failure:\n%s", body)
	}
}

func TestREG2026051206DoctorClassifiesCurrentLiveSummaryWithResolvedModelAsHealthy(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_llm_healthy", "https://llm-healthy.example/feed.xml", "LLM Healthy")

	recent := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
insert into items (id, source_id, source_url, url, title, feed_excerpt, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status)
values ('current_model_success_only', 'src_llm_healthy', 'https://llm-healthy.example/feed.xml', 'https://llm-healthy.example/current', 'Current model success', 'current feed excerpt', 'Live-backed summary.', 'Live-backed insight.', 'high', ?, ?, 'full', 'ok')`, recent, recent)
	if err != nil {
		t.Fatalf("insert healthy item: %v", err)
	}

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "openrouter/configured", ResolvedOpenRouterModel: "openrouter/resolved"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	body := out.String()
	assertDoctorHasNoSameLineDuplicateKeys(t, body)
	for _, want := range []string{
		"openrouter: configured_model=openrouter/configured",
		"openrouter: model_resolved=true resolved_model=openrouter/resolved",
		"openrouter: current_item_transform_failures=0 historic_item_transform_failures=0",
		"openrouter: live_summary_successes=1 fallback_only_current_summaries=0",
		"openrouter: health_classification=openrouter_live_summary_ok",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, body)
		}
	}
}

func TestREG2026060801DoctorClassifiesZeroFailureResolvedHistoricLibraryAsHealthy(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_llm_historic_healthy", "https://llm-historic-healthy.example/feed.xml", "LLM Historic Healthy")

	old := time.Now().UTC().Add(-(freshWindow + time.Hour)).Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
insert into items (id, source_id, source_url, url, title, feed_excerpt, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status)
values ('historic_model_success_only', 'src_llm_historic_healthy', 'https://llm-historic-healthy.example/feed.xml', 'https://llm-historic-healthy.example/old', 'Historic model success', 'historic feed excerpt', 'Historic-backed summary.', 'Historic-backed insight.', 'high', ?, ?, 'full', 'ok')`, old, old)
	if err != nil {
		t.Fatalf("insert historic healthy item: %v", err)
	}

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "account_default", ResolvedOpenRouterModel: "openrouter/resolved"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	body := out.String()
	assertDoctorHasNoSameLineDuplicateKeys(t, body)
	for _, want := range []string{
		"openrouter: model_resolved=true resolved_model=openrouter/resolved",
		"openrouter: current_item_transform_failures=0 historic_item_transform_failures=0",
		"openrouter: live_summary_successes=0 fallback_only_current_summaries=0",
		"openrouter: health_classification=openrouter_live_summary_ok",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "health_classification=unresolved_product_regression") {
		t.Fatalf("doctor misclassified zero-failure resolved historic library:\n%s", body)
	}
}

func TestREG2026051206DoctorDoesNotCountFallbackOnlyCurrentSummaryAsLiveSuccess(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_llm_fallback", "https://llm-fallback.example/feed.xml", "LLM Fallback")

	recent := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
insert into items (id, source_id, source_url, url, title, feed_excerpt, published_at, first_seen_at, extraction_status, model_status)
values ('current_fallback_only', 'src_llm_fallback', 'https://llm-fallback.example/feed.xml', 'https://llm-fallback.example/current', 'Current fallback only', 'raw RSS excerpt only', ?, ?, 'partial_extraction', 'model_latency_error')`, recent, recent)
	if err != nil {
		t.Fatalf("insert fallback item: %v", err)
	}

	var out bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{ConfiguredOpenRouterModel: "account_default"}, &out); err != nil {
		t.Fatalf("WriteDoctorWithConfig returned error: %v", err)
	}
	body := out.String()
	for _, want := range []string{
		"openrouter: current_item_transform_failures=1 historic_item_transform_failures=0",
		"openrouter: live_summary_successes=0 fallback_only_current_summaries=1",
		"openrouter: health_classification=openrouter_client_timeout_or_error",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, body)
		}
	}
}
