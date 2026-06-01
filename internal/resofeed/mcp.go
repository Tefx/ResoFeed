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
// HTTP 401 before JSON-RPC dispatch, tool/resource handling, receipt creation,
// or backend mutation.
type MCPConfig struct {
	DB                    *sql.DB
	PublicURL             string
	OwnerToken            string
	OwnerTokenHash        string
	LLM                   LLMClient
	OpenRouter            OpenRouterConfig
	FirstFetchMaxItems    int
	FirstFetchMaxItemsSet bool
}

// NewMCPHandler returns the /mcp Streamable HTTP handler. MCP exposes the same
// product concepts as HTTP/UI: inspect, resonate, steer, retrieve, and report
// delivery. It must not add per-agent registries or MCP-only product concepts.
// Live audit closure for MCP liveness must prove this handler through the single
// resofeed serve listener, not only through in-process handler invocation.
func NewMCPHandler(cfg MCPConfig) http.Handler {
	return &mcpHandler{db: cfg.DB, publicURL: normalizePublicURLForMetadata(cfg.PublicURL), ownerToken: cfg.OwnerToken, ownerTokenHash: cfg.OwnerTokenHash, llm: cfg.LLM, openRouter: cfg.OpenRouter, firstFetchMaxItems: cfg.FirstFetchMaxItems, firstFetchMaxItemsSet: cfg.FirstFetchMaxItemsSet}
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

type MCPSteerPreviewInput struct {
	Command string `json:"command"`
	ActorID string `json:"actor_id"`
}

type MCPSteerUndoInput struct {
	UndoHandle     SteerUndoHandle `json:"undo_handle"`
	TargetKind     string          `json:"target_kind"`
	TargetID       string          `json:"target_id"`
	ActorID        string          `json:"actor_id"`
	IdempotencyKey string          `json:"idempotency_key"`
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

// SearchItemsResponseForMCP applies the same lexical search operation as
// GET /api/search and preserves the normalized SearchQueryEcho envelope.
func SearchItemsResponseForMCP(ctx context.Context, db *sql.DB, input MCPSearchItemsInput) (SearchResponse, error) {
	if input.Query == "" {
		return SearchResponse{}, fieldError("query")
	}
	if err := validateDateRange(input.From, input.To); err != nil {
		return SearchResponse{}, err
	}
	items, echo, err := SearchItems(ctx, db, SearchQuery{Q: input.Query, Source: input.Source, From: input.From, To: input.To, Resonated: input.Resonated, Limit: normalizeLimit(input.Limit, 20, 50)})
	if err != nil {
		return SearchResponse{}, fmt.Errorf("search MCP items: %w", err)
	}
	return SearchResponse{Items: items, Query: echo}, nil
}

// GetProcessingLanguageForMCP returns the authenticated runtime language
// metadata without accepting per-call overrides.
func GetProcessingLanguageForMCP(ctx context.Context, db *sql.DB) (ProcessingLanguageResponse, error) {
	language, err := GetProcessingLanguage(ctx, db)
	if err != nil {
		return ProcessingLanguageResponse{}, err
	}
	return ProcessingLanguageResponse{Language: language}, nil
}

// SetProcessingLanguageForMCP maps the MCP schema onto the shared runtime
// language mutation used by HTTP.
func SetProcessingLanguageForMCP(ctx context.Context, db *sql.DB, input MCPSetProcessingLanguageInput) (ProcessingLanguageResponse, error) {
	req := SetProcessingLanguageRequest{Language: input.Language, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	return SetProcessingLanguage(ctx, db, req)
}

// ReprocessLibraryForMCP maps the MCP schema onto the shared explicit library
// reprocess operation used by HTTP.
func ReprocessLibraryForMCP(ctx context.Context, db *sql.DB, llm LLMClient, input MCPReprocessLibraryInput) (ReprocessLibraryResponse, error) {
	req := ReprocessLibraryRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	return ReprocessLibrary(ctx, db, llm, req)
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
func SteerForMCP(ctx context.Context, db *sql.DB, llm LLMClient, input MCPSteerInput) (SteerResult, error) {
	if strings.TrimSpace(input.Command) == "" || len(input.Command) > 4000 {
		return SteerResult{}, fieldError("command")
	}
	if err := validateActorAndKey(input.ActorID, input.IdempotencyKey); err != nil {
		return SteerResult{}, err
	}
	var result SteerResult
	req := SteerRequest{Command: input.Command, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	route := ClassifySteerRoute(req.Command)
	_, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "steer", "", steerFingerprintPayload(req, route), &result, func() (SteerResult, error) {
		return ApplySteering(ctx, db, llm, req)
	})
	if err != nil {
		return SteerResult{}, err
	}
	return result, nil
}

func PreviewSteerForMCP(ctx context.Context, db *sql.DB, llm LLMClient, input MCPSteerPreviewInput) (SteerPreviewResult, error) {
	if strings.TrimSpace(input.Command) == "" || len(input.Command) > 4000 {
		return SteerPreviewResult{}, fieldError("command")
	}
	if input.ActorID == "" || len(input.ActorID) > 128 {
		return SteerPreviewResult{}, fieldError("actor_id")
	}
	return PreviewSteering(ctx, db, llm, SteerPreviewRequest{Command: input.Command, ActorKind: ActorKindAgent, ActorID: input.ActorID})
}

func UndoSteerForMCP(ctx context.Context, db *sql.DB, input MCPSteerUndoInput) (SteerUndoResult, error) {
	if err := validateActorAndKey(input.ActorID, input.IdempotencyKey); err != nil {
		return SteerUndoResult{}, err
	}
	undoHandle, err := steerUndoHandleFromMCPInput(input)
	if err != nil {
		return SteerUndoResult{}, err
	}
	req := SteerUndoRequest{UndoHandle: undoHandle, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	var result SteerUndoResult
	replayed, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "undo_steer", "", struct {
		UndoHandle SteerUndoHandle `json:"undo_handle"`
		ActorKind  ActorKind       `json:"actor_kind"`
		ActorID    string          `json:"actor_id"`
	}{UndoHandle: undoHandle, ActorKind: ActorKindAgent, ActorID: input.ActorID}, &result, func() (SteerUndoResult, error) {
		return UndoSteering(ctx, db, req)
	})
	if err != nil {
		return SteerUndoResult{}, err
	}
	if replayed || (result.Target != nil && !result.Undone) {
		result.AlreadyApplied = true
	}
	return result, nil
}

func steerUndoHandleFromMCPInput(input MCPSteerUndoInput) (SteerUndoHandle, error) {
	if input.TargetKind != "" || input.TargetID != "" {
		if strings.TrimSpace(input.TargetKind) == "" {
			return SteerUndoHandle{}, fieldError("target_kind")
		}
		if strings.TrimSpace(input.TargetID) == "" {
			return SteerUndoHandle{}, fieldError("target_id")
		}
		routeKind, err := steerRouteKindForUndoTarget(input.TargetKind)
		if err != nil {
			return SteerUndoHandle{}, err
		}
		return SteerUndoHandle{RouteKind: routeKind, Target: &SteerTarget{Kind: input.TargetKind, ID: input.TargetID}}, nil
	}
	if input.UndoHandle.Target == nil {
		return SteerUndoHandle{}, fieldError("target_kind")
	}
	if strings.TrimSpace(input.UndoHandle.Target.Kind) == "" {
		return SteerUndoHandle{}, fieldError("target_kind")
	}
	if strings.TrimSpace(input.UndoHandle.Target.ID) == "" {
		return SteerUndoHandle{}, fieldError("target_id")
	}
	if _, err := steerRouteKindForUndoTarget(input.UndoHandle.Target.Kind); err != nil {
		return SteerUndoHandle{}, err
	}
	return input.UndoHandle, nil
}

func steerRouteKindForUndoTarget(targetKind string) (SteerRouteKind, error) {
	switch targetKind {
	case "steer_rule":
		return SteerRoutePolicy, nil
	case "source":
		return SteerRouteSource, nil
	default:
		return "", fieldError("target_kind")
	}
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
	req := DeliveryReportRequest{DeliveredAt: input.DeliveredAt.UTC(), MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}}
	applied, err := withMCPReceipt(ctx, db, input.IdempotencyKey, input.ActorID, "report_delivery", input.ItemID, struct {
		DeliveredAt time.Time `json:"delivered_at"`
		ActorKind   ActorKind `json:"actor_kind"`
		ActorID     string    `json:"actor_id"`
	}{DeliveredAt: req.DeliveredAt, ActorKind: req.ActorKind, ActorID: req.ActorID}, &result, func() (DeliveryReportResult, error) {
		return MarkItemDelivered(ctx, db, input.ItemID, req)
	})
	if err != nil {
		return DeliveryReportResult{}, err
	}
	if applied {
		result.AlreadyApplied = true
	}
	return result, nil
}

// MarkItemDelivered records external surfacing through the same core mutation
// used by HTTP delivery and MCP report_delivery. It creates no channel registry,
// queue, delivery ledger, or portable receipt.
func MarkItemDelivered(ctx context.Context, db *sql.DB, itemID string, req DeliveryReportRequest) (DeliveryReportResult, error) {
	if err := ensureItemExists(ctx, db, itemID); err != nil {
		return DeliveryReportResult{}, err
	}
	_, err := db.ExecContext(ctx, `
insert into item_state (item_id, is_resonated, external_surfaced_at, last_actor_kind, last_actor_id)
values (?, 0, ?, ?, ?)
on conflict(item_id) do update set
  external_surfaced_at = excluded.external_surfaced_at,
  last_actor_kind = excluded.last_actor_kind,
  last_actor_id = excluded.last_actor_id`, itemID, req.DeliveredAt.UTC().Format(time.RFC3339Nano), string(req.ActorKind), req.ActorID)
	if err != nil {
		return DeliveryReportResult{}, fmt.Errorf("report delivery: %w", err)
	}
	var stored string
	if err := db.QueryRowContext(ctx, `select external_surfaced_at from item_state where item_id = ?`, itemID).Scan(&stored); err != nil {
		return DeliveryReportResult{}, fmt.Errorf("read delivery state: %w", err)
	}
	externalAt, err := parseDBTime(stored)
	if err != nil {
		return DeliveryReportResult{}, fmt.Errorf("parse delivery timestamp: %w", err)
	}
	return DeliveryReportResult{ItemID: itemID, ExternalSurfacedAt: externalAt, AlreadyApplied: !externalAt.Equal(req.DeliveredAt.UTC())}, nil
}

type mcpHandler struct {
	db                    *sql.DB
	publicURL             string
	ownerToken            string
	ownerTokenHash        string
	llm                   LLMClient
	openRouter            OpenRouterConfig
	firstFetchMaxItems    int
	firstFetchMaxItemsSet bool
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
		return h.initializeResult(), nil
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

func (h *mcpHandler) initializeResult() map[string]any {
	serverInfo := map[string]any{"name": "resofeed", "version": "v0.1"}
	if h.publicURL != "" {
		serverInfo["publicUrl"] = h.publicURL
		serverInfo["mcpUrl"] = mcpEndpointFromPublicURL(h.publicURL)
	}
	return map[string]any{"protocolVersion": "2025-03-26", "serverInfo": serverInfo, "capabilities": map[string]any{"tools": map[string]any{}, "resources": map[string]any{}}}
}

func normalizePublicURLForMetadata(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

func mcpEndpointFromPublicURL(publicURL string) string {
	publicURL = normalizePublicURLForMetadata(publicURL)
	if publicURL == "" {
		return ""
	}
	return publicURL + "/mcp"
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
			if rules == nil {
				rules = []SteerRule{}
			}
			payload, err = json.Marshal(RulesResponse{Rules: rules})
		}
	case "resofeed://system/doctor":
		mimeType = "text/plain"
		var buf bytes.Buffer
		doctorCfg := DoctorConfigFromLLM(h.llm)
		doctorCfg.FirstFetchMaxItems = h.firstFetchMaxItems
		doctorCfg.FirstFetchMaxItemsSet = h.firstFetchMaxItemsSet
		err = WriteDoctorWithConfig(ctx, h.db, doctorCfg, &buf)
		payload = buf.Bytes()
	case "resofeed://sources":
		mimeType = "application/json"
		var sources []Source
		sources, err = listSourcesForMCP(ctx, h.db)
		if err == nil {
			payload, err = json.Marshal(SourcesResponse{Sources: sources})
		}
	case RuntimeLanguageMCPResourceURI:
		mimeType = "application/json"
		var language ProcessingLanguageResponse
		language, err = GetProcessingLanguageForMCP(ctx, h.db)
		if err == nil {
			payload, err = json.Marshal(language)
		}
	case RuntimeOperationMCPResourceURI:
		mimeType = "application/json"
		payload, err = json.Marshal(CurrentOperationResponse{Operation: currentOperationInfo()})
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
			result, err = SearchItemsResponseForMCP(ctx, h.db, input)
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
			result, err = SteerForMCP(ctx, h.db, h.llm, input)
		}
	case "preview_steer":
		if rawHasField(envelope.Arguments, "agent_name") {
			return nil, fieldError("agent_name")
		}
		if rawHasField(envelope.Arguments, "idempotency_key") {
			return nil, fieldError("idempotency_key")
		}
		var input MCPSteerPreviewInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = PreviewSteerForMCP(ctx, h.db, h.llm, input)
		}
	case "undo_steer":
		var input MCPSteerUndoInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = UndoSteerForMCP(ctx, h.db, input)
		}
	case "report_delivery":
		var input MCPReportDeliveryInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ReportDeliveryForMCP(ctx, h.db, input)
		}
	case "get_processing_language":
		var input MCPGetProcessingLanguageInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = GetProcessingLanguageForMCP(ctx, h.db)
		}
	case "set_processing_language":
		var input MCPSetProcessingLanguageInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = SetProcessingLanguageForMCP(ctx, h.db, input)
		}
	case "reprocess_library":
		var input MCPReprocessLibraryInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ReprocessLibraryForMCP(ctx, h.db, h.llm, input)
		}
	case "reingest_item":
		var input MCPReingestItemInput
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ReingestItemForMCP(ctx, h.db, h.llm, input)
		}
	case "list_openrouter_models":
		var input struct{}
		err = decodeRaw(envelope.Arguments, &input)
		if err == nil {
			result, err = ListOpenRouterModelsForMCP(ctx, h.openRouter)
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

func ListOpenRouterModelsForMCP(ctx context.Context, cfg OpenRouterConfig) (OpenRouterModelsResponse, error) {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		cfg.Endpoint = deterministicOpenRouterEndpointForE2E()
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		secret, err := ResolveOpenRouterRuntimeSecret()
		if err != nil || strings.TrimSpace(secret) == "" {
			return OpenRouterModelsResponse{Models: []OpenRouterModelInfo{}}, nil
		}
		cfg.APIKey = secret
	}
	models, err := ListOpenRouterModels(ctx, cfg)
	if err != nil {
		return OpenRouterModelsResponse{}, mcpProviderUnavailableError{}
	}
	if models.Models == nil {
		models.Models = []OpenRouterModelInfo{}
	}
	return models, nil
}

func listSourcesForMCP(ctx context.Context, db *sql.DB) ([]Source, error) {
	if db == nil {
		return nil, errors.New("list MCP sources: db is nil")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title, last_fetch_at, last_fetch_status, last_fetch_error, is_active, revision from sources where is_active = 1 order by id`)
	if err != nil {
		return nil, fmt.Errorf("list MCP sources: %w", err)
	}
	defer func() { _ = rows.Close() }()
	sources := []Source{}
	for rows.Next() {
		var source Source
		var lastFetch sql.NullString
		var lastFetchError sql.NullString
		if err := rows.Scan(&source.ID, &source.URL, &source.Title, &lastFetch, &source.LastFetchStatus, &lastFetchError, &source.IsActive, &source.Revision); err != nil {
			return nil, fmt.Errorf("scan MCP source: %w", err)
		}
		source.LastFetchAt = timePtrFromNull(lastFetch)
		source.LastFetchError = stringPtrFromNull(lastFetchError)
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

type mcpFieldError struct {
	field  string
	reason string
}

func (e mcpFieldError) Error() string { return "invalid MCP field: " + e.field }

type mcpNotFoundError struct {
	kind string
	id   string
}

type mcpProviderUnavailableError struct{}

func (mcpProviderUnavailableError) Error() string { return "models unavailable" }

func (e mcpNotFoundError) Error() string { return e.kind + " not found: " + e.id }

func fieldError(field string) error { return mcpFieldError{field: field} }

func fieldErrorReason(field string, reason string) error {
	return mcpFieldError{field: field, reason: reason}
}

func notFoundError(kind string, id string) error { return mcpNotFoundError{kind: kind, id: id} }

func mcpErrFromError(err error) *mcpError {
	if err == nil {
		return nil
	}
	var fieldErr mcpFieldError
	if errors.As(err, &fieldErr) {
		details := map[string]any{"field": fieldErr.field}
		if fieldErr.reason != "" {
			details["reason"] = fieldErr.reason
		}
		message := "bad request"
		if fieldErr.reason == "request_fingerprint_mismatch" {
			message = "idempotency key reused with different request"
		}
		return &mcpError{Code: -32602, Message: "invalid request", Data: nestedMCPErrorData("bad_request", message, details)}
	}
	if details, ok := guardConflictDetails(err); ok {
		return &mcpError{Code: -32000, Message: "operation already running", Data: nestedMCPErrorData("conflict", "operation already running", guardConflictHTTPDetailMap(details))}
	}
	var notFound mcpNotFoundError
	if errors.As(err, &notFound) {
		return &mcpError{Code: -32004, Message: notFound.kind + " not found", Data: nestedMCPErrorData("not_found", "not found", map[string]any{"id": notFound.id})}
	}
	var providerUnavailable mcpProviderUnavailableError
	if errors.As(err, &providerUnavailable) {
		return &mcpError{Code: -32000, Message: "models unavailable", Data: nestedMCPErrorData("provider_unavailable", "models unavailable", nil)}
	}
	return &mcpError{Code: -32603, Message: "internal error"}
}

func nestedMCPErrorData(code string, message string, details map[string]any) map[string]any {
	if details == nil {
		details = map[string]any{}
	}
	return map[string]any{"error": map[string]any{"code": code, "message": message, "details": details}}
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
		{"name": "preview_steer", "description": "Preview Steer route classification without mutation.", "inputSchema": objectSchema([]string{"command", "actor_id"}, map[string]any{"command": stringSchema("Required natural-language steering command, max 4000 bytes.", 1, 4000), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128)})},
		{"name": "steer", "description": "Apply natural-language steering.", "inputSchema": objectSchema([]string{"command", "actor_id", "idempotency_key"}, map[string]any{"command": stringSchema("Required natural-language steering command, max 4000 bytes.", 1, 4000), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "undo_steer", "description": "Undo one target-specific Steer target.", "inputSchema": objectSchema([]string{"target_kind", "target_id", "actor_id", "idempotency_key"}, map[string]any{"target_kind": map[string]any{"type": "string", "enum": []string{"steer_rule", "source"}, "description": "Required target kind from a Steer undo handle; no global undo stack is consulted."}, "target_id": stringSchema("Required target id from a Steer undo handle.", 1, 0), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "report_delivery", "description": "Record external surfacing.", "inputSchema": objectSchema([]string{"item_id", "actor_id", "delivered_at", "idempotency_key"}, map[string]any{"item_id": stringSchema("Required non-empty item id.", 1, 0), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "delivered_at": map[string]any{"type": "string", "format": "date-time", "description": "Required RFC3339 time the item was externally surfaced."}, "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "get_processing_language", "description": "Read the runtime processing language.", "inputSchema": objectSchema(nil, map[string]any{})},
		{"name": "set_processing_language", "description": "Set the runtime processing language for future processing.", "inputSchema": objectSchema([]string{"language", "actor_id", "idempotency_key"}, map[string]any{"language": map[string]any{"type": "string", "enum": []string{"en", "zh"}}, "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "reprocess_library", "description": "Explicitly reprocess existing library items in the current runtime language.", "inputSchema": objectSchema([]string{"actor_id", "idempotency_key"}, map[string]any{"actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200)})},
		{"name": "reingest_item", "description": "Re-ingest exactly one selected item using the current runtime language with optional request-scoped OpenRouter model and one-time prompt.", "inputSchema": objectSchema([]string{"item_id", "actor_id", "idempotency_key"}, map[string]any{"item_id": stringSchema("Required selected item id.", 1, 0), "actor_id": stringSchema("Attribution actor id; required, non-empty, max 128 characters. Not an authorization lookup.", 1, 128), "idempotency_key": stringSchema("Required retry idempotency key, max 200 characters.", 1, 200), "model": nullableStringSchema("Optional request-scoped OpenRouter model override; null, empty, or account_default means runtime/account default."), "prompt": nullableStringSchema("Optional canonical one-time prompt for this item only; max 4000 bytes after trimming."), "extra_prompt": nullableStringSchema("Compatibility alias for prompt; rejected when it conflicts with prompt.")})},
		{"name": "list_openrouter_models", "description": "List available OpenRouter models without persisting provider state.", "inputSchema": objectSchema(nil, map[string]any{})},
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
		{"uri": RuntimeOperationMCPResourceURI, "name": "Current runtime operation", "mimeType": "application/json"},
		{"uri": "resofeed://sources", "name": "Sources", "mimeType": "application/json"},
		{"uri": RuntimeLanguageMCPResourceURI, "name": "Runtime processing language", "mimeType": "application/json"},
	}
}

func nullableStringValue(value string) any {
	if value == "" {
		return nil
	}
	return value
}
