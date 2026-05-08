package resofeed

import (
	"context"
	"database/sql"
	"time"
)

// IngestConfig defines the background ingestion loop inside the single Go
// process. Defaults are 15 minute loop interval, 20 second source timeout, and
// Gemini limits owned by GeminiConfig.
type IngestConfig struct {
	Interval           time.Duration
	SourceFetchTimeout time.Duration
	Gemini             GeminiClient
}

// RunIngestLoop fetches active sources independently until ctx is canceled. One
// source failure must not block other sources, and extraction/model failure must
// not delete or hide the item.
func RunIngestLoop(ctx context.Context, db *sql.DB, cfg IngestConfig) error {
	panic("TODO contract stub: run background ingest loop")
}

// IngestOnce performs one ingestion pass over active sources.
func IngestOnce(ctx context.Context, db *sql.DB, cfg IngestConfig) error {
	panic("TODO contract stub: ingest active sources once")
}

// ImportOPML imports source URLs into the flat Source Ledger. OPML folders are
// ignored and flattened immediately; OPML is not complete state restore.
func ImportOPML(ctx context.Context, db *sql.DB, opml []byte) (OPMLImportResult, error) {
	panic("TODO contract stub: import flattened OPML")
}

// DeleteSource marks a source inactive/deleted so it no longer appears in the
// Source Ledger or contributes new items.
func DeleteSource(ctx context.Context, db *sql.DB, sourceID string) (DeleteSourceResult, error) {
	panic("TODO contract stub: delete source")
}
