package resofeed

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"
)

func TestDoctorReportsEmbeddedUIWithoutSecretBearingModelLabels(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	t.Setenv("OPENROUTER_KEY", "doctor-test-environment-secret")

	configured := "doctor-configured-secret\nui_assets=forged"
	resolved := "doctor-resolved-secret\r\nOPENROUTER_KEY=forged"
	var output bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{
		ConfiguredOpenRouterModel: configured,
		ResolvedOpenRouterModel:   resolved,
	}, &output); err != nil {
		t.Fatalf("WriteDoctorWithConfig: %v", err)
	}

	text := output.String()
	for _, line := range []string{"ui_assets=ready", "ui_asset_source=embedded"} {
		if count := strings.Count(text, line+"\n"); count != 1 {
			t.Errorf("doctor line %q count=%d, want 1", line, count)
		}
	}
	for _, forbidden := range []string{
		configured,
		resolved,
		"doctor-test-environment-secret",
		"ui_assets=forged",
		"OPENROUTER_KEY=forged",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("doctor output leaked %q", forbidden)
		}
	}
	for _, safe := range []string{
		"openrouter: configured_model=invalid",
		"openrouter: model_resolved=false resolved_model=invalid",
	} {
		if !strings.Contains(text, safe+"\n") {
			t.Errorf("doctor output missing safe line %q", safe)
		}
	}
}

func TestDoctorRedactsFailedSourceURLCredentials(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	const sourceURL = "https://doctor-user:doctor-password@feeds.example.test/private/feed.xml?api_key=doctor-query-secret&cursor=doctor-cursor-secret#doctor-fragment-secret"
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, last_fetch_error, is_active, revision) values (?, ?, ?, ?, ?, ?, 1, 1)`,
		"src_doctor_credentials", sourceURL, "Credential-bearing source", time.Now().UTC().Format(time.RFC3339), sourceStatusFetchError, "upstream timeout for "+sourceURL); err != nil {
		t.Fatalf("seed failed source: %v", err)
	}

	var output bytes.Buffer
	if err := WriteDoctor(ctx, db, &output); err != nil {
		t.Fatalf("WriteDoctor: %v", err)
	}
	text := output.String()
	const safeLine = "rss: source=src_doctor_credentials status=rss_fetch_error url=https://feeds.example.test/private/feed.xml error=upstream timeout for https://feeds.example.test/private/feed.xml"
	if !strings.Contains(text, safeLine+"\n") {
		t.Fatalf("doctor output missing sanitized failed-source line %q:\n%s", safeLine, text)
	}
	for _, forbidden := range []string{
		"doctor-user",
		"doctor-password",
		"api_key",
		"doctor-query-secret",
		"doctor-cursor-secret",
		"doctor-fragment-secret",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("doctor output leaked failed-source URL credential %q", forbidden)
		}
	}
	t.Log("RF_BUG_003_FAILED_SOURCE_URL_CREDENTIAL_REDACTION=complete")
}

func TestDoctorPreservesSafeOpenRouterModelLabels(t *testing.T) {
	cfg := DoctorConfig{
		ConfiguredOpenRouterModel: "openai/gpt-4.1-mini",
		ResolvedOpenRouterModel:   "openrouter/auto:online",
	}
	if got := openRouterConfiguredModelDoctorLine(cfg); got != "openrouter: configured_model=openai/gpt-4.1-mini" {
		t.Fatalf("configured model line=%q", got)
	}
	if got := openRouterModelDoctorLine(cfg); got != "openrouter: model_resolved=true resolved_model=openrouter/auto:online" {
		t.Fatalf("resolved model line=%q", got)
	}
}
