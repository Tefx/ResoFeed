package resofeed

import (
	"context"
	"database/sql"
	"net/http"
)

// HTTPServerConfig wires the static web UI, JSON API, and MCP endpoint into the
// single process. Static assets are public; every /api/* route requires
// Authorization: Bearer <OWNER_TOKEN> and returns the canonical JSON error body
// on auth failure.
type HTTPServerConfig struct {
	Addr       string
	PublicURL  string
	DB         *sql.DB
	OwnerToken string
	Gemini     GeminiClient
}

// NewRouter returns the HTTP router for static assets, /api/* JSON, /api/doctor
// text/plain, and /mcp Streamable HTTP. Query validation must run after auth and
// before backend reads; unknown or duplicate query params return 400 bad_request.
func NewRouter(cfg HTTPServerConfig) http.Handler {
	panic("TODO contract stub: construct HTTP and MCP router")
}

// ServeHTTPRuntime starts the HTTP/MCP/static server and exits on context
// cancellation. It must not start a second deployable process.
func ServeHTTPRuntime(ctx context.Context, cfg HTTPServerConfig) error {
	panic("TODO contract stub: serve HTTP runtime")
}

// TodayFeedResponse is GET /api/feed/today and resofeed://feed/today.
type TodayFeedResponse struct {
	Items []ItemSummary `json:"items"`
}

// ItemResponse is GET /api/items/{id} and MCP read_item.
type ItemResponse struct {
	Item ItemDetail `json:"item"`
}

// SourcesResponse is GET /api/sources and resofeed://sources.
type SourcesResponse struct {
	Sources []Source `json:"sources"`
}

// SearchResponse is GET /api/search.
type SearchResponse struct {
	Items []ItemSummary   `json:"items"`
	Query SearchQueryEcho `json:"query"`
}

// RulesResponse is resofeed://rules/active.
type RulesResponse struct {
	Rules []SteerRule `json:"rules"`
}
