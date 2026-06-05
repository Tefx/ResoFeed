package resofeed

import "testing"

func TestIngestConfigCoordinatorDefaults(t *testing.T) {
	cfg := (IngestConfig{}).coordinatorConfig()
	if cfg.SourceConcurrency != DefaultIngestSourceConcurrency {
		t.Fatalf("SourceConcurrency = %d, want %d", cfg.SourceConcurrency, DefaultIngestSourceConcurrency)
	}
	if cfg.ItemConcurrencyPerSource != DefaultIngestItemConcurrencyPerSource {
		t.Fatalf("ItemConcurrencyPerSource = %d, want %d", cfg.ItemConcurrencyPerSource, DefaultIngestItemConcurrencyPerSource)
	}
	if cfg.GlobalLLMConcurrency != DefaultIngestGlobalLLMConcurrency {
		t.Fatalf("GlobalLLMConcurrency = %d, want %d", cfg.GlobalLLMConcurrency, DefaultIngestGlobalLLMConcurrency)
	}
}

func TestCoordinatorConfigPreservesExplicitLimits(t *testing.T) {
	cfg := IngestConfig{
		SourceConcurrency:        2,
		ItemConcurrencyPerSource: 3,
		GlobalLLMConcurrency:     5,
	}.coordinatorConfig()
	if cfg.SourceConcurrency != 2 || cfg.ItemConcurrencyPerSource != 3 || cfg.GlobalLLMConcurrency != 5 {
		t.Fatalf("coordinator config = %+v, want explicit limits 2/3/5", cfg)
	}
}

func TestCoordinatorContractNamesEphemeralScopes(t *testing.T) {
	if ingestCoordinationScopeSourceLease != "source_lease" {
		t.Fatalf("source lease scope = %q", ingestCoordinationScopeSourceLease)
	}
	if ingestCoordinationScopeSourceCapacity != "source_capacity" {
		t.Fatalf("source capacity scope = %q", ingestCoordinationScopeSourceCapacity)
	}
	if ingestCoordinationScopeGlobalExclusive != "global_exclusive" {
		t.Fatalf("global exclusive scope = %q", ingestCoordinationScopeGlobalExclusive)
	}
}
