package resofeed

import (
	"context"
	"database/sql"
)

// SearchQuery is lexical/metadata retrieval input. It intentionally excludes
// embeddings, vector-search knobs, generated answer requests, and chat history.
type SearchQuery struct {
	Q         string
	Source    *string
	From      *string
	To        *string
	Resonated *bool
	Limit     int
}

// SearchItems searches SQLite FTS5 and metadata filters. Results must include
// enough provenance for verification and may favor resonated items when relevant
// without becoming semantic/RAG retrieval.
func SearchItems(ctx context.Context, db *sql.DB, query SearchQuery) ([]ItemSummary, SearchQueryEcho, error) {
	panic("TODO contract stub: lexical search")
}

// RebuildSearchIndex rebuilds the derived FTS index from canonical rows after
// migrations or state import. It must not create embedding/vector indexes.
func RebuildSearchIndex(ctx context.Context, db *sql.DB) error {
	panic("TODO contract stub: rebuild SQLite FTS index")
}
