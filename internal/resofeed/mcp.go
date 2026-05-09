package resofeed

import (
	"bytes"
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// MCPConfig defines the Remote Streamable HTTP endpoint at /mcp. Every request
// requires Authorization: Bearer <OWNER_TOKEN>; missing/invalid auth returns
// HTTP 401 before tool/resource handling and creates no receipt or queue.
type MCPConfig struct {
	DB             *sql.DB
	OwnerToken     string
	OwnerTokenHash string
	Gemini         GeminiClient
}

// NewMCPHandler returns the /mcp Streamable HTTP handler. MCP exposes the same
// product concepts as HTTP/UI: inspect, resonate, steer, retrieve, and report
// delivery. It must not add per-agent registries or MCP-only product concepts.
func NewMCPHandler(cfg MCPConfig) http.Handler {
	return &mcpHandler{db: cfg.DB, ownerToken: cfg.OwnerToken, ownerTokenHash: cfg.OwnerTokenHash, gemini: cfg.Gemini}
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
	items, err := ListTodayFeed(ctx, db, RankingOptions{Limit: normalizeLimit(input.Limit, 20, 50)})
	if err != nil {
		return TodayFeedResponse{}, fmt.Errorf("list MCP candidate items: %w", err)
	}
	return TodayFeedResponse{Items: items}, nil
}

// SearchItemsForMCP applies lexical/metadata search; no embeddings, vector DB,
// RAG answers, or semantic chat surface are part of this contract.
func SearchItemsForMCP(ctx context.Context, db *sql.DB, input MCPSearchItemsInput) (TodayFeedResponse, error) {
	if input.Query == "" {
		return TodayFeedResponse{}, fieldError("query")
	}
	if err := validateDateRange(input.From, input.To); err != nil {
		return TodayFeedResponse{}, err
	}
	items, _, err := SearchItems(ctx, db, SearchQuery{Q: input.Query, Source: input.Source, From: input.From, To: input.To, Resonated: input.Resonated, Limit: normalizeLimit(input.Limit, 20, 50)})
	if err != nil {
		return TodayFeedResponse{}, fmt.Errorf("search MCP items: %w", err)
	}
	return TodayFeedResponse{Items: items}, nil
}

// ReadItemForMCP returns canonical item detail and provenance.
func ReadItemForMCP(ctx context.Context, db *sql.DB, input MCPReadItemInput) (ItemResponse, error) {
	if strings.TrimSpace(input.ItemID) == "" {
		return ItemResponse{}, fieldError("item_id")
	}
	if err := ensureItemExists(ctx, db, input.ItemID); err != nil {
		return ItemResponse{}, err
	}
	item, err := ReadItemDetail(ctx, db, input.ItemID)
	if err != nil {
		return ItemResponse{}, err
	}
	return ItemResponse{Item: item}, nil
}

// MarkInspectedForMCP forwards a human inspection from an external context.
func MarkInspectedForMCP(ctx context.Context, db *sql.DB, input MCPMarkInspectedInput) (InspectResult, error) {
	if err := validateItemMutationInput(input.ItemID, input.ActorID, input.IdempotencyKey); err != nil {
		return InspectResult{}, err
	}
	var result InspectResult
	req := InspectRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	applied, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "mark_inspected", input.ItemID, mutationFingerprintPayload(req.MutationRequestFields), &result, func() (InspectResult, error) {
		if err := ensureItemExists(ctx, db, input.ItemID); err != nil {
			return InspectResult{}, err
		}
		return MarkItemInspected(ctx, db, input.ItemID, req)
	})
	if err != nil {
		return InspectResult{}, err
	}
	if applied {
		result.AlreadyApplied = true
	}
	return result, nil
}

// ResonateItemForMCP forwards or toggles human-authorized resonance state.
func ResonateItemForMCP(ctx context.Context, db *sql.DB, input MCPResonateItemInput) (ResonanceResult, error) {
	if err := validateItemMutationInput(input.ItemID, input.ActorID, input.IdempotencyKey); err != nil {
		return ResonanceResult{}, err
	}
	var result ResonanceResult
	req := ResonanceRequest{Resonated: input.Resonated, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	applied, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "resonate_item", input.ItemID, struct {
		Resonated bool      `json:"resonated"`
		ActorKind ActorKind `json:"actor_kind"`
		ActorID   string    `json:"actor_id"`
	}{Resonated: req.Resonated, ActorKind: req.ActorKind, ActorID: req.ActorID}, &result, func() (ResonanceResult, error) {
		if err := ensureItemExists(ctx, db, input.ItemID); err != nil {
			return ResonanceResult{}, err
		}
		return SetItemResonance(ctx, db, input.ItemID, req)
	})
	if err != nil {
		return ResonanceResult{}, err
	}
	if applied {
		result.AlreadyApplied = true
	}
	return result, nil
}

// SteerForMCP applies natural-language steering with owner-token authority,
// actor attribution, idempotency, and human-over-agent precedence.
func SteerForMCP(ctx context.Context, db *sql.DB, gemini GeminiClient, input MCPSteerInput) (SteerResult, error) {
	if strings.TrimSpace(input.Command) == "" || len(input.Command) > 4000 {
		return SteerResult{}, fieldError("command")
	}
	if err := validateActorAndKey(input.ActorID, input.IdempotencyKey); err != nil {
		return SteerResult{}, err
	}
	var result SteerResult
	req := SteerRequest{Command: input.Command, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	_, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "steer", "", struct {
		Command   string    `json:"command"`
		ActorKind ActorKind `json:"actor_kind"`
		ActorID   string    `json:"actor_id"`
	}{Command: req.Command, ActorKind: req.ActorKind, ActorID: req.ActorID}, &result, func() (SteerResult, error) {
		return ApplySteering(ctx, db, gemini, req)
	})
	if err != nil {
		return SteerResult{}, err
	}
	return result, nil
}

// ReportDeliveryForMCP records external surfacing for duplicate-loop
// prevention. Receipts are runtime idempotency/provenance only, not portable
// state or a delivery-channel ownership system.
func ReportDeliveryForMCP(ctx context.Context, db *sql.DB, input MCPReportDeliveryInput) (DeliveryReportResult, error) {
	if err := validateItemMutationInput(input.ItemID, input.ActorID, input.IdempotencyKey); err != nil {
		return DeliveryReportResult{}, err
	}
	if input.DeliveredAt.IsZero() {
		return DeliveryReportResult{}, fieldError("delivered_at")
	}
	var result DeliveryReportResult
	applied, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "report_delivery", input.ItemID, struct {
		DeliveredAt time.Time `json:"delivered_at"`
		ActorKind   ActorKind `json:"actor_kind"`
		ActorID     string    `json:"actor_id"`
	}{DeliveredAt: input.DeliveredAt.UTC(), ActorKind: ActorKindAgent, ActorID: input.ActorID}, &result, func() (DeliveryReportResult, error) {
		if err := ensureItemExists(ctx, db, input.ItemID); err != nil {
			return DeliveryReportResult{}, err
		}
		_, err := db.ExecContext(ctx, `
insert into item_state (item_id, is_resonated, external_surfaced_at, last_actor_kind, last_actor_id)
values (?, 0, ?, ?, ?)
on conflict(item_id) do update set
  external_surfaced_at = coalesce(item_state.external_surfaced_at, excluded.external_surfaced_at),
  last_actor_kind = excluded.last_actor_kind,
  last_actor_id = excluded.last_actor_id`, input.ItemID, input.DeliveredAt.UTC().Format(time.RFC3339Nano), string(ActorKindAgent), input.ActorID)
		if err != nil {
			return DeliveryReportResult{}, fmt.Errorf("report MCP delivery: %w", err)
		}
		var stored string
		if err := db.QueryRowContext(ctx, `select external_surfaced_at from item_state where item_id = ?`, input.ItemID).Scan(&stored); err != nil {
			return DeliveryReportResult{}, fmt.Errorf("read delivery state: %w", err)
		}
		externalAt, err := parseDBTime(stored)
		if err != nil {
			return DeliveryReportResult{}, fmt.Errorf("parse delivery timestamp: %w", err)
		}
		return DeliveryReportResult{ItemID: input.ItemID, ExternalSurfacedAt: externalAt, AlreadyApplied: !externalAt.Equal(input.DeliveredAt.UTC())}, nil
	})
	if err != nil {
		return DeliveryReportResult{}, err
	}
	if applied {
		result.AlreadyApplied = true
	}
	return result, nil
}

type mcpHandler struct {
	db             *sql.DB
	ownerToken     string
	ownerTokenHash string
	gemini         GeminiClient
}

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *mcpError       `json:"error,omitempty"`
}

type mcpError struct {
	Code    int            `json:"code"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data,omitempty"`
}

type mcpContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpResourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text"`
}

func (h *mcpHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.authorized(r) {
		writeMCPHTTPError(w, http.StatusUnauthorized, "unauthorized", "owner token required", nil)
		return
	}
	if r.Method != http.MethodPost {
		writeMCPHTTPError(w, http.StatusBadRequest, "bad_request", "POST required", map[string]any{"field": "method"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeMCPHTTPError(w, http.StatusBadRequest, "bad_request", "invalid request body", map[string]any{"field": "body"})
		return
	}
	var req mcpRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeMCPJSONRPC(w, mcpResponse{JSONRPC: "2.0", Error: &mcpError{Code: -32700, Message: "parse error"}})
		return
	}
	result, rpcErr := h.dispatch(r.Context(), req)
	resp := mcpResponse{JSONRPC: "2.0", ID: req.ID, Result: result, Error: rpcErr}
	writeMCPJSONRPC(w, resp)
}

func (h *mcpHandler) authorized(r *http.Request) bool {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return false
	}
	token := strings.TrimPrefix(header, "Bearer ")
	if h.ownerToken != "" && subtle.ConstantTimeCompare([]byte(token), []byte(h.ownerToken)) == 1 {
		return true
	}
	if h.ownerTokenHash != "" && subtle.ConstantTimeCompare([]byte(ownerTokenHash(token)), []byte(h.ownerTokenHash)) == 1 {
		return true
	}
	return false
}

func (h *mcpHandler) dispatch(ctx context.Context, req mcpRequest) (any, *mcpError) {
	switch req.Method {
	case "initialize":
		return map[string]any{"protocolVersion": "2025-03-26", "serverInfo": map[string]any{"name": "resofeed", "version": "0.0.0"}, "capabilities": map[string]any{"tools": map[string]any{}, "resources": map[string]any{}}}, nil
	case "tools/list":
		return map[string]any{"tools": mcpToolList()}, nil
	case "resources/list":
		return map[string]any{"resources": mcpResourceList()}, nil
	case "resources/read":
		result, err := h.readResource(ctx, req.Params)
		return result, mcpErrFromError(err)
	case "tools/call":
		result, err := h.callTool(ctx, req.Params)
		return result, mcpErrFromError(err)
	default:
		return nil, &mcpError{Code: -32601, Message: "method not found"}
	}
}

func (h *mcpHandler) readResource(ctx context.Context, params json.RawMessage) (any, error) {
	var input struct {
		URI string `json:"uri"`
	}
	if err := decodeRaw(params, &input); err != nil {
		return nil, err
	}
	var mimeType string
	var payload []byte
	var err error
	switch input.URI {
	case "resofeed://feed/today":
		mimeType = "application/json"
		var feed TodayFeedResponse
		feed, err = ListCandidateItemsForMCP(ctx, h.db, MCPListCandidateItemsInput{Limit: 50})
		if err == nil {
			payload, err = json.Marshal(feed)
		}
	case "resofeed://rules/active":
		mimeType = "application/json"
		var rules []SteerRule
		rules, err = loadActiveSteerRules(ctx, h.db)
		if err == nil {
			payload, err = json.Marshal(RulesResponse{Rules: rules})
		}
	case "resofeed://system/doctor":
		mimeType = "text/plain"
		var buf bytes.Buffer
		err = WriteDoctor(ctx, h.db, &buf)
		payload = buf.Bytes()
	case "resofeed://sources":
		mimeType = "application/json"
		var sources []Source
		sources, err = listSourcesForMCP(ctx, h.db)
		if err == nil {
			payload, err = json.Marshal(SourcesResponse{Sources: sources})
		}
	default:
		return nil, notFoundError("resource", input.URI)
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"contents": []mcpResourceContent{{URI: input.URI, MimeType: mimeType, Text: string(payload)}}}, nil
}

func (h *mcpHandler) callTool(ctx context.Context, params json.RawMessage) (any, error) {
	var envelope struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := decodeRaw(params, &envelope); err != nil {
		return nil, err
	}
	if len(envelope.Arguments) == 0 || string(envelope.Arguments) == "null" {
		envelope.Arguments = []byte(`{}`)
	}
	var result any
	var err error
	switch envelope.Name {
	case "list_candidate_items":
		var input MCPListCandidateItemsInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ListCandidateItemsForMCP(ctx, h.db, input)
		}
	case "search_items":
		if !rawHasField(envelope.Arguments, "query") {
			return nil, fieldError("query")
		}
		var input MCPSearchItemsInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = SearchItemsForMCP(ctx, h.db, input)
		}
	case "read_item":
		var input MCPReadItemInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ReadItemForMCP(ctx, h.db, input)
		}
	case "mark_inspected":
		var input MCPMarkInspectedInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = MarkInspectedForMCP(ctx, h.db, input)
		}
	case "resonate_item":
		if !rawHasField(envelope.Arguments, "resonated") {
			return nil, fieldError("resonated")
		}
		var input MCPResonateItemInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ResonateItemForMCP(ctx, h.db, input)
		}
	case "steer":
		var input MCPSteerInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = SteerForMCP(ctx, h.db, h.gemini, input)
		}
	case "report_delivery":
		var input MCPReportDeliveryInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ReportDeliveryForMCP(ctx, h.db, input)
		}
	default:
		return nil, notFoundError("tool", envelope.Name)
	}
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal MCP tool result: %w", err)
	}
	return map[string]any{"content": []mcpContent{{Type: "text", Text: string(data)}}}, nil
}

func listSourcesForMCP(ctx context.Context, db *sql.DB) ([]Source, error) {
	if db == nil {
		return nil, errors.New("list MCP sources: db is nil")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title, last_fetch_at, last_fetch_status, is_active, revision from sources where is_active = 1 order by id`)
	if err != nil {
		return nil, fmt.Errorf("list MCP sources: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var sources []Source
	for rows.Next() {
		var source Source
		var lastFetch sql.NullString
		if err := rows.Scan(&source.ID, &source.URL, &source.Title, &lastFetch, &source.LastFetchStatus, &source.IsActive, &source.Revision); err != nil {
			return nil, fmt.Errorf("scan MCP source: %w", err)
		}
		source.LastFetchAt = timePtrFromNull(lastFetch)
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate MCP sources: %w", err)
	}
	return sources, nil
}

func ensureItemExists(ctx context.Context, db *sql.DB, itemID string) error {
	var exists int
	err := db.QueryRowContext(ctx, `select 1 from items where id = ?`, itemID).Scan(&exists)
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return notFoundError("item", itemID)
	}
	return fmt.Errorf("check MCP item exists: %w", err)
}

func withMCPReceipt[T any](ctx context.Context, db *sql.DB, key string, actorID string, operation string, itemID string, fingerprintPayload any, target *T, apply func() (T, error)) (bool, error) {
	return withIdempotencyReceipt(ctx, db, key, actorID, operation, itemID, fingerprintPayload, target, apply)
}

func validateItemMutationInput(itemID string, actorID string, key string) error {
	if strings.TrimSpace(itemID) == "" {
		return fieldError("item_id")
	}
	return validateActorAndKey(actorID, key)
}

func validateActorAndKey(actorID string, key string) error {
	if actorID == "" || len(actorID) > 128 {
		return fieldError("actor_id")
	}
	if key == "" || len(key) > 200 {
		return fieldError("idempotency_key")
	}
	return nil
}

func validateDateRange(from *string, to *string) error {
	var fromTime, toTime time.Time
	var err error
	if from != nil {
		fromTime, err = time.Parse("2006-01-02", *from)
		if err != nil {
			return fieldError("from")
		}
	}
	if to != nil {
		toTime, err = time.Parse("2006-01-02", *to)
		if err != nil {
			return fieldError("to")
		}
	}
	if from != nil && to != nil && fromTime.After(toTime) {
		return fieldError("from")
	}
	return nil
}

type mcpFieldError struct{ field string }

func (e mcpFieldError) Error() string { return "invalid MCP field: " + e.field }

type mcpNotFoundError struct {
	kind string
	id   string
}

func (e mcpNotFoundError) Error() string { return e.kind + " not found: " + e.id }

func fieldError(field string) error { return mcpFieldError{field: field} }

func notFoundError(kind string, id string) error { return mcpNotFoundError{kind: kind, id: id} }

func mcpErrFromError(err error) *mcpError {
	if err == nil {
		return nil
	}
	var fieldErr mcpFieldError
	if errors.As(err, &fieldErr) {
		return &mcpError{Code: -32602, Message: "invalid params", Data: map[string]any{"field": fieldErr.field}}
	}
	var notFound mcpNotFoundError
	if errors.As(err, &notFound) {
		return &mcpError{Code: -32004, Message: notFound.kind + " not found", Data: map[string]any{"id": notFound.id}}
	}
	return &mcpError{Code: -32603, Message: "internal error"}
}

func decodeRaw(data json.RawMessage, target any) error {
	if len(data) == 0 {
		data = []byte(`{}`)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fieldError("body")
	}
	return nil
}

func rawHasField(data json.RawMessage, field string) bool {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return false
	}
	_, ok := raw[field]
	return ok
}

func writeMCPHTTPError(w http.ResponseWriter, status int, code string, message string, details map[string]any) {
	if details == nil {
		details = map[string]any{}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorBody{Error: APIError{Code: code, Message: message, Details: details}})
}

func writeMCPJSONRPC(w http.ResponseWriter, resp mcpResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func mcpToolList() []map[string]any {
	return []map[string]any{
		{"name": "list_candidate_items", "description": "Retrieve eligible feed candidates.", "inputSchema": objectSchema(nil, map[string]any{"limit": integerSchema("Result limit. Defaults to 20; maximum 50.", 1, 50, 20)})},
		{"name": "search_items", "description": "Lexical and metadata item search. query is required for MCP; use list_candidate_items for empty-feed browsing.", "inputSchema": objectSchema([]string{"query"}, map[string]any{"query": stringSchema("Plain text lexical query; required for MCP search_items.", 1, 500), "source": nullableStringSchema("Optional source name or source id filter."), "from": nullableDateSchema("Optional inclusive lower calendar date, YYYY-MM-DD."), "to": nullableDateSchema("Optional inclusive upper calendar date, YYYY-MM-DD."), "resonated": nullableBoolSchema("Optional resonance filter."), "limit": integerSchema("Result limit. Defaults to 20; maximum 50.", 1, 50, 20)})},
		{"name": "read_item", "description": "Read item detail and provenance.", "inputSchema": objectSchema([]string{"item_id"}, map[string]any{"item_id": stringSchema("Required non-empty item id.", 1, 0)})},
		{"name": "mark_inspected", "description": "Forward human inspection from an external context.", "inputSchema": objectSchema([]string{"item_id", "actor_id", "idempotency_key"}, map[string]any{"item_id": stringSchema("Required non-empty item id.", 1, 0), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "resonate_item", "description": "Set resonance state.", "inputSchema": objectSchema([]string{"item_id", "resonated", "actor_id", "idempotency_key"}, map[string]any{"item_id": stringSchema("Required non-empty item id.", 1, 0), "resonated": map[string]any{"type": "boolean", "description": "Required target resonance state."}, "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "steer", "description": "Apply natural-language steering.", "inputSchema": objectSchema([]string{"command", "actor_id", "idempotency_key"}, map[string]any{"command": stringSchema("Required natural-language steering command, max 4000 bytes.", 1, 4000), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "report_delivery", "description": "Record external surfacing.", "inputSchema": objectSchema([]string{"item_id", "actor_id", "delivered_at", "idempotency_key"}, map[string]any{"item_id": stringSchema("Required non-empty item id.", 1, 0), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "delivered_at": map[string]any{"type": "string", "format": "date-time", "description": "Required RFC3339 time the item was externally surfaced."}, "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
	}
}

func objectSchema(required []string, properties map[string]any) map[string]any {
	schema := map[string]any{"type": "object", "additionalProperties": false, "properties": properties}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func stringSchema(description string, minLength int, maxLength int) map[string]any {
	schema := map[string]any{"type": "string", "description": description}
	if minLength > 0 {
		schema["minLength"] = minLength
	}
	if maxLength > 0 {
		schema["maxLength"] = maxLength
	}
	return schema
}

func integerSchema(description string, minimum int, maximum int, defaultValue int) map[string]any {
	return map[string]any{"type": "integer", "description": description, "minimum": minimum, "maximum": maximum, "default": defaultValue}
}

func nullableStringSchema(description string) map[string]any {
	return map[string]any{"type": []string{"string", "null"}, "description": description, "default": nil}
}

func nullableDateSchema(description string) map[string]any {
	return map[string]any{"type": []string{"string", "null"}, "format": "date", "description": description, "default": nil}
}

func nullableBoolSchema(description string) map[string]any {
	return map[string]any{"type": []string{"boolean", "null"}, "description": description, "default": nil}
}

func mcpResourceList() []map[string]string {
	return []map[string]string{
		{"uri": "resofeed://feed/today", "name": "Today feed", "mimeType": "application/json"},
		{"uri": "resofeed://rules/active", "name": "Active steering rules", "mimeType": "application/json"},
		{"uri": "resofeed://system/doctor", "name": "Doctor diagnostics", "mimeType": "text/plain"},
		{"uri": "resofeed://sources", "name": "Sources", "mimeType": "application/json"},
	}
}

func nullableStringValue(value string) any {
	if value == "" {
		return nil
	}
	return value
}
