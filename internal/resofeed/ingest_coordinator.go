package resofeed

const (
	DefaultIngestSourceConcurrency        = 8
	DefaultIngestItemConcurrencyPerSource = 4
	DefaultIngestGlobalLLMConcurrency     = 16
)

// ingestCoordinationScope names the in-process coordination concepts used by
// source attempts and true global-exclusive operations. These values are
// anchors for Go coordination only and are not SQLite schema or portable state.
type ingestCoordinationScope string

const (
	ingestCoordinationScopeSourceLease     ingestCoordinationScope = "source_lease"
	ingestCoordinationScopeSourceCapacity  ingestCoordinationScope = "source_capacity"
	ingestCoordinationScopeGlobalExclusive ingestCoordinationScope = "global_exclusive"
)

type ingestCoordinatorConfig struct {
	SourceConcurrency        int
	ItemConcurrencyPerSource int
	GlobalLLMConcurrency     int
}

func (cfg IngestConfig) coordinatorConfig() ingestCoordinatorConfig {
	return ingestCoordinatorConfig{
		SourceConcurrency:        cfg.SourceConcurrency,
		ItemConcurrencyPerSource: cfg.ItemConcurrencyPerSource,
		GlobalLLMConcurrency:     cfg.GlobalLLMConcurrency,
	}.withDefaults()
}

func (cfg ingestCoordinatorConfig) withDefaults() ingestCoordinatorConfig {
	if cfg.SourceConcurrency <= 0 {
		cfg.SourceConcurrency = DefaultIngestSourceConcurrency
	}
	if cfg.ItemConcurrencyPerSource <= 0 {
		cfg.ItemConcurrencyPerSource = DefaultIngestItemConcurrencyPerSource
	}
	if cfg.GlobalLLMConcurrency <= 0 {
		cfg.GlobalLLMConcurrency = DefaultIngestGlobalLLMConcurrency
	}
	return cfg
}
