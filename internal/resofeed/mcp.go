package resofeed

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

// MCPConfig defines the Remote Streamable HTTP endpoint at /mcp. Every request
// requires Authorization: Bearer <OWNER_TOKEN>; missing/invalid auth returns
// HTTP 401 before tool/resource handling and creates no receipt or queue.
type MCPConfig struct {
	DB         *sql.DB
	OwnerToken string
}

// NewMCPHandler returns the /mcp Streamable HTTP handler. MCP exposes the same
// product concepts as HTTP/UI: inspect, resonate, steer, retrieve, and report
// delivery. It must not add per-agent registries or MCP-only product concepts.
func NewMCPHandler(cfg MCPConfig) http.Handler {
	panic("TODO contract stub: construct MCP Streamable HTTP handler")
}

// MCPListCandidateItemsInput is the list_candidate_items input schema.
type MCPListCandidateItemsInput struct {
	Limit int `json:"limit"`
}

// MCPSearchItemsInput is the search_items input schema. query is required for
// MCP even though HTTP q is optional.
type MCPSearchItemsInput struct {
	Query     string  `json:"query"`
	Source    *string `json:"source"`
	From      *string `json:"from"`
	To        *string `json:"to"`
	Resonated *bool   `json:"resonated"`
	Limit     int     `json:"limit"`
}

// MCPReadItemInput is the read_item input schema.
type MCPReadItemInput struct {
	ItemID string `json:"item_id"`
}

// MCPMarkInspectedInput is the mark_inspected input schema.
type MCPMarkInspectedInput struct {
	ItemID         string `json:"item_id"`
	ActorID        string `json:"actor_id"`
	IdempotencyKey string `json:"idempotency_key"`
}

// MCPResonateItemInput is the resonate_item input schema.
type MCPResonateItemInput struct {
	ItemID         string `json:"item_id"`
	Resonated      bool   `json:"resonated"`
	ActorID        string `json:"actor_id"`
	IdempotencyKey string `json:"idempotency_key"`
}

// MCPSteerInput is the steer tool input schema.
type MCPSteerInput struct {
	Command        string `json:"command"`
	ActorID        string `json:"actor_id"`
	IdempotencyKey string `json:"idempotency_key"`
}

// MCPReportDeliveryInput is the report_delivery input schema.
type MCPReportDeliveryInput struct {
	ItemID         string    `json:"item_id"`
	ActorID        string    `json:"actor_id"`
	DeliveredAt    time.Time `json:"delivered_at"`
	IdempotencyKey string    `json:"idempotency_key"`
}

// ListCandidateItemsForMCP applies the same ranking contract as GET
// /api/feed/today. Silent candidate evaluation must not mark inspection.
func ListCandidateItemsForMCP(ctx context.Context, db *sql.DB, input MCPListCandidateItemsInput) (TodayFeedResponse, error) {
	panic("TODO contract stub: list MCP candidate items")
}

// SearchItemsForMCP applies lexical/metadata search; no embeddings, vector DB,
// RAG answers, or semantic chat surface are part of this contract.
func SearchItemsForMCP(ctx context.Context, db *sql.DB, input MCPSearchItemsInput) (TodayFeedResponse, error) {
	panic("TODO contract stub: search MCP items")
}

// ReadItemForMCP returns canonical item detail and provenance.
func ReadItemForMCP(ctx context.Context, db *sql.DB, input MCPReadItemInput) (ItemResponse, error) {
	panic("TODO contract stub: read MCP item")
}

// MarkInspectedForMCP forwards a human inspection from an external context.
func MarkInspectedForMCP(ctx context.Context, db *sql.DB, input MCPMarkInspectedInput) (InspectResult, error) {
	panic("TODO contract stub: mark MCP item inspected")
}

// ResonateItemForMCP forwards or toggles human-authorized resonance state.
func ResonateItemForMCP(ctx context.Context, db *sql.DB, input MCPResonateItemInput) (ResonanceResult, error) {
	panic("TODO contract stub: resonate MCP item")
}

// SteerForMCP applies natural-language steering with owner-token authority,
// actor attribution, idempotency, and human-over-agent precedence.
func SteerForMCP(ctx context.Context, db *sql.DB, input MCPSteerInput) (SteerResult, error) {
	panic("TODO contract stub: steer through MCP")
}

// ReportDeliveryForMCP records external surfacing for duplicate-loop
// prevention. Receipts are runtime idempotency/provenance only, not portable
// state or a delivery-channel ownership system.
func ReportDeliveryForMCP(ctx context.Context, db *sql.DB, input MCPReportDeliveryInput) (DeliveryReportResult, error) {
	panic("TODO contract stub: report MCP delivery")
}
