package resofeed

import (
	"bytes"
	"context"
	"strings"
	"testing"
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
