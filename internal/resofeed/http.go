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
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const maxImportBodyBytes = 10 << 20
const maxRuntimeBodyBytes = 100 << 10

// HTTPServerConfig wires the static web UI, JSON API, and MCP endpoint into the
// single process. Static assets are public; every /api/* route requires
// Authorization: Bearer <OWNER_TOKEN> and returns the canonical JSON error body
// on auth failure.
type HTTPServerConfig struct {
	Addr                  string
	PublicURL             string
	DB                    *sql.DB
	OwnerToken            string
	OwnerTokenHash        string
	LLM                   LLMClient
	OpenRouter            OpenRouterConfig
	Lifecycle             RuntimeLifecycleRecorder
	FirstFetchMaxItems    int
	FirstFetchMaxItemsSet bool
}

type RuntimeLifecycleEvent string

const (
	RuntimeLifecycleBindReady    RuntimeLifecycleEvent = "bind/listen ready"
	RuntimeLifecycleHTTPMCPReady RuntimeLifecycleEvent = "HTTP/MCP readiness observable"
	RuntimeLifecycleIngestStart  RuntimeLifecycleEvent = "background ingest start"
)

type RuntimeLifecycleRecorder interface {
	RecordRuntimeLifecycleEvent(RuntimeLifecycleEvent)
}

// NewRouter returns the HTTP router for static assets, /api/* JSON, /api/doctor
// text/plain, and /mcp Streamable HTTP. Query validation must run after auth and
// before backend reads; unknown or duplicate query params return 400 bad_request.
// The MCP audit liveness contract is bound to this single-binary router: POST
// /mcp is reachable on the configured serve listener and rejects missing/invalid
// owner-token auth with HTTP 401 before JSON-RPC dispatch.
func NewRouter(cfg HTTPServerConfig) http.Handler {
	api := apiHandler{cfg: cfg}
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.Handle("/mcp", NewMCPHandler(MCPConfig{DB: cfg.DB, PublicURL: cfg.PublicURL, OwnerToken: cfg.OwnerToken, OwnerTokenHash: cfg.OwnerTokenHash, LLM: cfg.LLM, OpenRouter: cfg.OpenRouter, FirstFetchMaxItems: cfg.FirstFetchMaxItems, FirstFetchMaxItemsSet: cfg.FirstFetchMaxItemsSet}))
	mux.Handle("/", staticUIHandler())
	return mux
}

func staticUIHandler() http.Handler {
	root := filepath.Join("web", "build")
	index := filepath.Join(root, "index.html")
	if info, err := os.Stat(index); err == nil && !info.IsDir() {
		fileServer := http.FileServer(http.Dir(root))
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			path := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
			if path == "." {
				path = "index.html"
			}
			candidate := filepath.Join(root, path)
			if rel, err := filepath.Rel(root, candidate); err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
				http.NotFound(w, r)
				return
			}
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
			http.ServeFile(w, r, index)
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>RESOFEED</title></head><body><main><h1>RESOFEED</h1><label>Enter owner token <input type="password" autocomplete="current-password"></label><p>Paste RSS URL in Steer or import OPML.</p><p>Inspect opens the item. Star preserves durable value. Steer is optional correction.</p></main></body></html>`)
	})
}

func ServeHTTPAndIngestRuntime(ctx context.Context, cfg HTTPServerConfig, runIngest func(context.Context) error) error {
	listener, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return fmt.Errorf("listen http runtime: %w", err)
	}
	return serveHTTPAndIngestRuntimeOnListener(ctx, cfg, listener, runIngest)
}

func serveHTTPAndIngestRuntimeOnListener(ctx context.Context, cfg HTTPServerConfig, listener net.Listener, runIngest func(context.Context) error) error {
	if runIngest == nil {
		return errors.New("run ingest function required")
	}
	runtimeCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan error, 2)
	go func() {
		errCh <- serveHTTPRuntimeOnListener(runtimeCtx, cfg, listener)
	}()

	if err := waitForHTTPMCPReadiness(runtimeCtx, listener.Addr().String()); err != nil {
		cancel()
		<-errCh
		return err
	}
	recordRuntimeLifecycle(cfg, RuntimeLifecycleHTTPMCPReady)

	go func() {
		recordRuntimeLifecycle(cfg, RuntimeLifecycleIngestStart)
		errCh <- runIngest(runtimeCtx)
	}()

	select {
	case <-ctx.Done():
		cancel()
		firstErr := <-errCh
		secondErr := <-errCh
		if firstErr != nil {
			return firstErr
		}
		return secondErr
	case err := <-errCh:
		cancel()
		<-errCh
		return err
	}
}

func serveHTTPRuntimeOnListener(ctx context.Context, cfg HTTPServerConfig, listener net.Listener) error {
	server := &http.Server{Handler: NewRouter(cfg)}
	errCh := make(chan error, 1)
	recordRuntimeLifecycle(cfg, RuntimeLifecycleBindReady)
	go func() {
		errCh <- server.Serve(listener)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown http runtime: %w", err)
		}
		err := <-errCh
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve http runtime: %w", err)
		}
		return nil
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve http runtime: %w", err)
		}
		return nil
	}
}

func recordRuntimeLifecycle(cfg HTTPServerConfig, event RuntimeLifecycleEvent) {
	if cfg.Lifecycle != nil {
		cfg.Lifecycle.RecordRuntimeLifecycleEvent(event)
	}
}

func waitForHTTPMCPReadiness(ctx context.Context, addr string) error {
	baseURL := "http://" + normalizeLocalHTTPAddr(addr)
	client := &http.Client{Timeout: 50 * time.Millisecond}
	deadline := time.NewTimer(2 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		apiReady := probeUnauthorized(ctx, client, baseURL+"/api/doctor")
		mcpReady := probeUnauthorized(ctx, client, baseURL+"/mcp")
		if apiReady && mcpReady {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			return errors.New("http/mcp readiness probe timed out")
		case <-ticker.C:
		}
	}
}

func probeUnauthorized(ctx context.Context, client *http.Client, url string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer func() { _ = resp.Body.Close() }()
	return resp.StatusCode == http.StatusUnauthorized
}

func normalizeLocalHTTPAddr(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	if host == "" || host == "::" || host == "[::]" || host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	return net.JoinHostPort(host, port)
}

type apiHandler struct {
	cfg HTTPServerConfig
}

func (h apiHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.authorized(r) {
		writeAPIError(w, http.StatusUnauthorized, "unauthorized", "owner token required", nil)
		return
	}

	switch {
	case r.Method == http.MethodPost && r.URL.Path == ManualIngestHTTPPath:
		if !rejectUnexpectedQuery(w, r) || !readManualFetchBody(w, r) {
			return
		}
		h.handleManualIngest(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/feed/today":
		h.handleToday(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/search":
		h.handleSearch(w, r)
	case r.Method == http.MethodGet && r.URL.Path == RuntimeLanguageHTTPPath:
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleGetRuntimeLanguage(w, r)
	case r.Method == http.MethodGet && (r.URL.Path == "/api/runtime/openrouter-models" || r.URL.Path == "/api/runtime/openrouter/models"):
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleOpenRouterModels(w, r)
	case r.Method == http.MethodPut && r.URL.Path == RuntimeLanguageHTTPPath:
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleSetRuntimeLanguage(w, r)
	case r.Method == http.MethodPost && r.URL.Path == RuntimeReprocessLibraryHTTPPath:
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleReprocessLibrary(w, r)
	case r.Method == http.MethodGet && r.URL.Path == RuntimeOperationHTTPPath:
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleCurrentOperation(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/sources":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleSources(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/sources/export-opml":
		if !rejectUnexpectedQuery(w, r) || !rejectRequestBody(w, r) {
			return
		}
		h.handleExportOPML(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/sources/import-opml":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleImportOPML(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/state/export":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleStateExport(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/state/import":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleStateImport(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/doctor":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleDoctor(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/steer/active":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleActiveSteeringRules(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/steer/preview":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleSteerPreview(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/steer/undo":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleSteerUndo(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/steer":
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleSteer(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/items/"):
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleItemPath(w, r)
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/sources/") && strings.HasSuffix(r.URL.Path, "/fetch"):
		if !rejectUnexpectedQuery(w, r) || !readManualFetchBody(w, r) {
			return
		}
		h.handleManualSourceFetch(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/sources/"):
		if !rejectUnexpectedQuery(w, r) {
			return
		}
		h.handleDeleteSource(w, r)
	default:
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": r.URL.Path})
	}
}

func (h apiHandler) handleSteerPreview(w http.ResponseWriter, r *http.Request) {
	var req SteerPreviewRequest
	if !readJSONBodyLimit(w, r, &req, maxRuntimeBodyBytes, "100 KB") {
		return
	}
	if req.ActorKind != ActorKindHuman && req.ActorKind != ActorKindAgent {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "actor_kind"})
		return
	}
	if req.ActorID == "" || len([]byte(req.ActorID)) > 128 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "actor_id"})
		return
	}
	if req.Command == "" || len([]byte(req.Command)) > 4000 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "command"})
		return
	}
	result, err := PreviewSteering(r.Context(), h.cfg.DB, h.cfg.LLM, req)
	if err != nil {
		writeRuntimeMutationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) authorized(r *http.Request) bool {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) || len(header) == len(prefix) {
		return false
	}
	token := strings.TrimPrefix(header, prefix)
	if h.cfg.OwnerToken != "" && subtle.ConstantTimeCompare([]byte(token), []byte(h.cfg.OwnerToken)) == 1 {
		return true
	}
	if h.cfg.OwnerTokenHash != "" && subtle.ConstantTimeCompare([]byte(ownerTokenHash(token)), []byte(h.cfg.OwnerTokenHash)) == 1 {
		return true
	}
	return false
}

func (h apiHandler) handleToday(w http.ResponseWriter, r *http.Request) {
	limit, offset, ok := parseFeedWindowQuery(w, r)
	if !ok {
		return
	}
	items, err := ListTodayFeed(r.Context(), h.cfg.DB, RankingOptions{Limit: limit, Offset: offset})
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, TodayFeedResponse{Items: items})
}

func parseFeedWindowQuery(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	values := r.URL.Query()
	for key, vals := range values {
		if (key != "limit" && key != "offset") || len(vals) != 1 {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": key})
			return 0, 0, false
		}
	}
	limit := defaultFeedLimit
	if vals, ok := values["limit"]; ok {
		parsed, valid := parseBase10Limit(vals[0], maxFeedLimit)
		if !valid {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "limit"})
			return 0, 0, false
		}
		limit = parsed
	}
	offset := 0
	if vals, ok := values["offset"]; ok {
		parsed, valid := parseBase10Offset(vals[0], maxFeedOffset)
		if !valid {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "offset"})
			return 0, 0, false
		}
		offset = parsed
	}
	return limit, offset, true
}

func (h apiHandler) handleSearch(w http.ResponseWriter, r *http.Request) {
	query, ok := parseSearchQuery(w, r)
	if !ok {
		return
	}
	items, echo, err := SearchItems(r.Context(), h.cfg.DB, query)
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, SearchResponse{Items: items, Query: echo})
}

func (h apiHandler) handleGetRuntimeLanguage(w http.ResponseWriter, r *http.Request) {
	language, err := GetProcessingLanguage(r.Context(), h.cfg.DB)
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, ProcessingLanguageResponse{Language: language})
}

func (h apiHandler) handleOpenRouterModels(w http.ResponseWriter, r *http.Request) {
	cfg, hasKey := h.openRouterModelsConfig()
	if !hasKey {
		writeJSON(w, http.StatusOK, OpenRouterModelsResponse{Models: []OpenRouterModelInfo{}})
		return
	}
	models, err := ListOpenRouterModels(r.Context(), cfg)
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "provider_unavailable", "models unavailable", nil)
		return
	}
	if models.Models == nil {
		models.Models = []OpenRouterModelInfo{}
	}
	writeJSON(w, http.StatusOK, models)
}

func (h apiHandler) openRouterModelsConfig() (OpenRouterConfig, bool) {
	cfg := h.cfg.OpenRouter
	if strings.TrimSpace(cfg.Endpoint) == "" {
		cfg.Endpoint = deterministicOpenRouterEndpointForE2E()
	}
	if strings.TrimSpace(cfg.APIKey) != "" {
		return cfg, true
	}
	secret, err := ResolveOpenRouterRuntimeSecret()
	if err != nil {
		return cfg, false
	}
	cfg.APIKey = secret
	return cfg, true
}

func (h apiHandler) handleSetRuntimeLanguage(w http.ResponseWriter, r *http.Request) {
	var req SetProcessingLanguageRequest
	if !readJSONBodyLimit(w, r, &req, maxRuntimeBodyBytes, "100 KB") || !validateMutationFields(w, req.MutationRequestFields) {
		return
	}
	response, err := SetProcessingLanguage(r.Context(), h.cfg.DB, req)
	if err != nil {
		if details, ok := guardConflictDetails(err); ok {
			writeGuardConflict(w, details)
			return
		}
		writeRuntimeMutationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h apiHandler) handleReprocessLibrary(w http.ResponseWriter, r *http.Request) {
	var req ReprocessLibraryRequest
	if !readJSONBodyLimit(w, r, &req, maxRuntimeBodyBytes, "100 KB") || !validateMutationFields(w, req.MutationRequestFields) {
		return
	}
	response, err := ReprocessLibrary(r.Context(), h.cfg.DB, h.cfg.LLM, req)
	if err != nil {
		if details, ok := guardConflictDetails(err); ok {
			writeGuardConflict(w, details)
			return
		}
		writeRuntimeMutationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h apiHandler) handleCurrentOperation(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, CurrentOperationResponse{Operation: currentOperationInfo()})
}

func writeGuardConflict(w http.ResponseWriter, details operationGuardDetails) {
	writeAPIError(w, http.StatusConflict, "conflict", "operation already running", guardConflictHTTPDetailMap(details))
}

func (h apiHandler) handleItemPath(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/items/")
	parts := strings.Split(trimmed, "/")
	if len(parts) == 1 && r.Method == http.MethodGet {
		itemID := parts[0]
		detail, err := ReadItemDetail(r.Context(), h.cfg.DB, itemID)
		if err != nil {
			writeNotFoundOrInternal(w, itemID, err)
			return
		}
		writeJSON(w, http.StatusOK, ItemResponse{Item: detail})
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "inspect" {
		var req InspectRequest
		if !readJSONBody(w, r, &req) || !validateMutationFields(w, req.MutationRequestFields) {
			return
		}
		if !h.itemExists(w, r, parts[0]) {
			return
		}
		var result InspectResult
		applied, err := withIdempotencyReceipt(r.Context(), h.cfg.DB, req.IdempotencyKey, req.ActorID, "mark_inspected", parts[0], mutationFingerprintPayload(req.MutationRequestFields), &result, func() (InspectResult, error) {
			return MarkItemInspected(r.Context(), h.cfg.DB, parts[0], req)
		})
		if err != nil {
			writeMutationError(w, parts[0], err)
			return
		}
		if applied {
			result.AlreadyApplied = true
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "reingest" {
		req, ok := readItemReingestRequest(w, r)
		if !ok || !validateMutationFields(w, req.MutationRequestFields) {
			return
		}
		response, err := ReingestItem(r.Context(), h.cfg.DB, h.cfg.LLM, parts[0], req)
		if err != nil {
			if details, ok := guardConflictDetails(err); ok {
				writeGuardConflict(w, details)
				return
			}
			writeItemReingestError(w, parts[0], err)
			return
		}
		writeJSON(w, http.StatusOK, response)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "resonance" {
		var req ResonanceRequest
		if !readJSONBody(w, r, &req) || !validateMutationFields(w, req.MutationRequestFields) {
			return
		}
		if !h.itemExists(w, r, parts[0]) {
			return
		}
		var result ResonanceResult
		applied, err := withIdempotencyReceipt(r.Context(), h.cfg.DB, req.IdempotencyKey, req.ActorID, "resonate_item", parts[0], struct {
			Resonated bool      `json:"resonated"`
			ActorKind ActorKind `json:"actor_kind"`
			ActorID   string    `json:"actor_id"`
		}{Resonated: req.Resonated, ActorKind: req.ActorKind, ActorID: req.ActorID}, &result, func() (ResonanceResult, error) {
			return SetItemResonance(r.Context(), h.cfg.DB, parts[0], req)
		})
		if err != nil {
			writeMutationError(w, parts[0], err)
			return
		}
		if applied {
			result.AlreadyApplied = true
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "delivery" {
		req, ok := readDeliveryReportBody(w, r)
		if !ok || !validateMutationFields(w, req.MutationRequestFields) {
			return
		}
		if !h.itemExists(w, r, parts[0]) {
			return
		}
		var result DeliveryReportResult
		applied, err := withIdempotencyReceipt(r.Context(), h.cfg.DB, req.IdempotencyKey, req.ActorID, "report_delivery", parts[0], struct {
			DeliveredAt time.Time `json:"delivered_at"`
			ActorKind   ActorKind `json:"actor_kind"`
			ActorID     string    `json:"actor_id"`
		}{DeliveredAt: req.DeliveredAt.UTC(), ActorKind: req.ActorKind, ActorID: req.ActorID}, &result, func() (DeliveryReportResult, error) {
			return MarkItemDelivered(r.Context(), h.cfg.DB, parts[0], req)
		})
		if err != nil {
			writeMutationError(w, parts[0], err)
			return
		}
		if applied {
			result.AlreadyApplied = true
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": r.URL.Path})
}

func readItemReingestRequest(w http.ResponseWriter, r *http.Request) (ItemReingestRequest, bool) {
	var wire struct {
		Model       *string `json:"model"`
		Prompt      *string `json:"prompt"`
		ExtraPrompt *string `json:"extra_prompt"`
		MutationRequestFields
	}
	if !readJSONBodyLimit(w, r, &wire, maxRuntimeBodyBytes, "100 KB") {
		return ItemReingestRequest{}, false
	}
	req, err := itemReingestRequestFromInputs(wire.MutationRequestFields, wire.Model, wire.Prompt, wire.ExtraPrompt)
	if err != nil {
		var fieldErr mcpFieldError
		if errors.As(err, &fieldErr) {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": fieldErr.field})
			return ItemReingestRequest{}, false
		}
		writeInternal(w)
		return ItemReingestRequest{}, false
	}
	return req, true
}

func normalizedOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func readDeliveryReportBody(w http.ResponseWriter, r *http.Request) (DeliveryReportRequest, bool) {
	var wire struct {
		DeliveredAt string `json:"delivered_at"`
		MutationRequestFields
	}
	if !readJSONBody(w, r, &wire) {
		return DeliveryReportRequest{}, false
	}
	if wire.DeliveredAt == "" {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "delivered_at"})
		return DeliveryReportRequest{}, false
	}
	deliveredAt, err := time.Parse(time.RFC3339, wire.DeliveredAt)
	if err != nil || deliveredAt.Location() != time.UTC || deliveredAt.Format(time.RFC3339) != wire.DeliveredAt {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "delivered_at"})
		return DeliveryReportRequest{}, false
	}
	return DeliveryReportRequest{DeliveredAt: deliveredAt, MutationRequestFields: wire.MutationRequestFields}, true
}

func (h apiHandler) itemExists(w http.ResponseWriter, r *http.Request, itemID string) bool {
	if itemID == "" || h.cfg.DB == nil {
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": itemID})
		return false
	}
	var exists int
	err := h.cfg.DB.QueryRowContext(r.Context(), `select 1 from items where id = ?`, itemID).Scan(&exists)
	if err == nil {
		return true
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": itemID})
		return false
	}
	writeInternal(w)
	return false
}

func (h apiHandler) handleSteer(w http.ResponseWriter, r *http.Request) {
	var req SteerRequest
	if !readJSONBodyLimit(w, r, &req, maxRuntimeBodyBytes, "100 KB") || !validateMutationFields(w, req.MutationRequestFields) {
		return
	}
	if req.Command == "" || len([]byte(req.Command)) > 4000 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "command"})
		return
	}
	route := ClassifySteerRoute(req.Command)
	var result SteerResult
	_, err := withIdempotencyReceipt(r.Context(), h.cfg.DB, req.IdempotencyKey, req.ActorID, "steer", "", steerFingerprintPayload(req, route), &result, func() (SteerResult, error) {
		return h.commitSteeringByRoute(r.Context(), req, route)
	})
	if err != nil {
		writeSteerMutationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) commitSteeringByRoute(ctx context.Context, req SteerRequest, route SteerRouteKind) (SteerResult, error) {
	command := strings.TrimSpace(req.Command)
	switch route {
	case SteerRouteDoctor:
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "doctor", ChangedRules: []SteerRule{}, Message: "not applied: use GET /api/doctor for read-only diagnostics"}}, nil
	case SteerRouteSearch:
		return ApplySteering(ctx, h.cfg.DB, h.cfg.LLM, req)
	case SteerRouteInvariantConflict:
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "invariant_conflict", ChangedRules: []SteerRule{}, Message: invariantConflictMessage()}}, nil
	case SteerRouteUnknown:
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "unknown", ChangedRules: []SteerRule{}, Message: "not applied: RSS URL required for add source"}}, nil
	case SteerRouteSource:
		sourceURL, ok := sourceURLFromSteerCommand(command)
		if !ok {
			return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "unknown", ChangedRules: []SteerRule{}, Message: "not applied: RSS URL required for add source"}}, nil
		}
		return applyHTTPSourceURLSteering(ctx, h.cfg.DB, sourceURL)
	case SteerRoutePolicy:
		return ApplySteering(ctx, h.cfg.DB, h.cfg.LLM, req)
	default:
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "unknown", ChangedRules: []SteerRule{}, Message: "not applied: no safe product-valid steering rule remained"}}, nil
	}
}

func applyHTTPSourceURLSteering(ctx context.Context, db *sql.DB, sourceURL string) (SteerResult, error) {
	if db == nil {
		return SteerResult{}, errors.New("apply http source steering: db is nil")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return SteerResult{}, fmt.Errorf("begin source steering transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	identity := sourceIdentity(sourceURL)
	var id string
	var active bool
	var revision int64
	err = tx.QueryRowContext(ctx, `select id, is_active, revision from sources where url = ?`, sourceURL).Scan(&id, &active, &revision)
	if err == nil {
		if active {
			if err := tx.Commit(); err != nil {
				return SteerResult{}, fmt.Errorf("commit active source no-op: %w", err)
			}
			return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "add_source", ChangedRules: []SteerRule{}, Message: "source already active: " + identity + "; no change"}}, nil
		}
		revision++
		if _, err := tx.ExecContext(ctx, `update sources set is_active = 1, revision = ? where id = ?`, revision, id); err != nil {
			return SteerResult{}, fmt.Errorf("reactivate source through steering: %w", err)
		}
	} else if errors.Is(err, sql.ErrNoRows) {
		id = stableTextID("src", sourceURL)
		revision = 1
		if _, err := tx.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'not_fetched', 1, 1)`, id, sourceURL, identity, now); err != nil {
			return SteerResult{}, fmt.Errorf("add source through steering: %w", err)
		}
	} else {
		return SteerResult{}, fmt.Errorf("read source by url: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return SteerResult{}, fmt.Errorf("commit source steering transaction: %w", err)
	}
	return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "add_source", ChangedRules: []SteerRule{}, Message: "source added: " + identity + "; visible in SOURCE LEDGER; use [RUN INGEST] or row [FETCH] there for immediate refresh"}, UndoHandle: &SteerUndoHandle{RouteKind: SteerRouteSource, Target: &SteerTarget{Kind: "source", ID: id}, Revision: &revision}}, nil
}

func (h apiHandler) handleSteerUndo(w http.ResponseWriter, r *http.Request) {
	var req SteerUndoRequest
	if !readJSONBodyLimit(w, r, &req, maxRuntimeBodyBytes, "100 KB") || !validateMutationFields(w, req.MutationRequestFields) {
		return
	}
	if !normalizeSteerUndoRequest(w, &req) {
		return
	}
	var result SteerUndoResult
	replayed, err := withIdempotencyReceipt(r.Context(), h.cfg.DB, req.IdempotencyKey, req.ActorID, "undo_steer", "", struct {
		TargetKind string    `json:"target_kind"`
		TargetID   string    `json:"target_id"`
		ActorKind  ActorKind `json:"actor_kind"`
		ActorID    string    `json:"actor_id"`
	}{TargetKind: req.TargetKind, TargetID: req.TargetID, ActorKind: req.ActorKind, ActorID: req.ActorID}, &result, func() (SteerUndoResult, error) {
		return UndoSteering(r.Context(), h.cfg.DB, req)
	})
	if err != nil {
		writeSteerMutationError(w, err)
		return
	}
	if replayed || (result.Target != nil && !result.Undone) {
		result.AlreadyApplied = true
	}
	writeJSON(w, http.StatusOK, result)
}

func normalizeSteerUndoRequest(w http.ResponseWriter, req *SteerUndoRequest) bool {
	if req.TargetKind == "" && req.TargetID == "" && req.UndoHandle.Target != nil {
		req.TargetKind = req.UndoHandle.Target.Kind
		req.TargetID = req.UndoHandle.Target.ID
	}
	if req.TargetKind == "" {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "target_kind"})
		return false
	}
	if req.TargetID == "" {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "target_id"})
		return false
	}
	if req.TargetKind != "source" && req.TargetKind != "steer_rule" {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "target_kind"})
		return false
	}
	req.UndoHandle.Target = &SteerTarget{Kind: req.TargetKind, ID: req.TargetID}
	if req.TargetKind == "source" {
		req.UndoHandle.RouteKind = SteerRouteSource
	} else {
		req.UndoHandle.RouteKind = SteerRoutePolicy
	}
	return true
}

func (h apiHandler) handleActiveSteeringRules(w http.ResponseWriter, r *http.Request) {
	rules, err := loadActiveSteerRules(r.Context(), h.cfg.DB)
	if err != nil {
		writeInternal(w)
		return
	}
	if rules == nil {
		rules = []SteerRule{}
	}
	writeJSON(w, http.StatusOK, RulesResponse{Rules: rules})
}

func (h apiHandler) handleSources(w http.ResponseWriter, r *http.Request) {
	sources, err := listSources(r.Context(), h.cfg.DB)
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, SourcesResponse{Sources: sources})
}

func (h apiHandler) handleManualIngest(w http.ResponseWriter, r *http.Request) {
	started := time.Now().UTC()
	result, err := ManualIngest(r.Context(), h.cfg.DB, IngestConfig{LLM: h.cfg.LLM, FirstFetchMaxItems: h.cfg.FirstFetchMaxItems, FirstFetchMaxItemsSet: h.cfg.FirstFetchMaxItemsSet})
	if err != nil {
		writeManualFetchError(w, "", err)
		return
	}
	writeJSON(w, ManualFetchHTTPStatusOK, IngestResponse{Ingest: newIngestRunResult(result, "all", nil, started, time.Now().UTC())})
}

func (h apiHandler) handleManualSourceFetch(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/sources/")
	sourceID := strings.TrimSuffix(trimmed, "/fetch")
	if sourceID == "" || sourceID == trimmed || strings.Contains(sourceID, "/") {
		writeAPIError(w, ManualFetchHTTPStatusNotFound, ManualFetchErrorCodeNotFound, "not found", map[string]any{"id": r.URL.Path})
		return
	}
	started := time.Now().UTC()
	result, err := ManualFetchSource(r.Context(), h.cfg.DB, IngestConfig{LLM: h.cfg.LLM, FirstFetchMaxItems: h.cfg.FirstFetchMaxItems, FirstFetchMaxItemsSet: h.cfg.FirstFetchMaxItemsSet}, sourceID)
	if err != nil {
		writeManualFetchError(w, sourceID, err)
		return
	}
	source, err := loadSourceForResponse(r.Context(), h.cfg.DB, sourceID)
	if err != nil {
		writeManualFetchError(w, sourceID, err)
		return
	}
	writeJSON(w, ManualFetchHTTPStatusOK, IngestResponse{Ingest: newIngestRunResult(result, "source", &sourceID, started, time.Now().UTC()), Source: &source})
}

func (h apiHandler) handleDeleteSource(w http.ResponseWriter, r *http.Request) {
	sourceID := strings.TrimPrefix(r.URL.Path, "/api/sources/")
	if sourceID == "" || strings.Contains(sourceID, "/") {
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": sourceID})
		return
	}
	result, err := DeleteSource(r.Context(), h.cfg.DB, sourceID)
	if err != nil {
		writeNotFoundOrInternal(w, sourceID, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) handleImportOPML(w http.ResponseWriter, r *http.Request) {
	if !requireContentType(w, r, map[string]bool{"application/xml": true, "text/xml": true}) {
		return
	}
	body, ok := readLimitedBody(w, r, maxImportBodyBytes)
	if !ok {
		return
	}
	result, err := ImportOPML(r.Context(), h.cfg.DB, body)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) handleExportOPML(w http.ResponseWriter, r *http.Request) {
	var buf bytes.Buffer
	if err := ExportOPML(r.Context(), h.cfg.DB, &buf); err != nil {
		writeInternal(w)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="sources.opml"`)
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(buf.Bytes()); err != nil {
		return
	}
}

func (h apiHandler) handleStateExport(w http.ResponseWriter, r *http.Request) {
	var buf bytes.Buffer
	if err := ExportState(r.Context(), h.cfg.DB, &buf); err != nil {
		writeInternal(w)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}

func (h apiHandler) handleStateImport(w http.ResponseWriter, r *http.Request) {
	if !requireContentType(w, r, map[string]bool{"application/json": true}) {
		return
	}
	body, ok := readLimitedBody(w, r, maxImportBodyBytes)
	if !ok {
		return
	}
	result, err := ImportState(r.Context(), h.cfg.DB, bytes.NewReader(body))
	if err != nil {
		if details, ok := guardConflictDetails(err); ok {
			writeGuardConflict(w, details)
			return
		}
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": stateErrorField(err)})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) handleDoctor(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	doctorCfg := DoctorConfigFromLLM(h.cfg.LLM)
	doctorCfg.FirstFetchMaxItems = h.cfg.FirstFetchMaxItems
	doctorCfg.FirstFetchMaxItemsSet = h.cfg.FirstFetchMaxItemsSet
	if err := WriteDoctorWithConfig(r.Context(), h.cfg.DB, doctorCfg, w); err != nil {
		return
	}
}

func parseSearchQuery(w http.ResponseWriter, r *http.Request) (SearchQuery, bool) {
	allowed := map[string]bool{"q": true, "source": true, "from": true, "to": true, "resonated": true, "limit": true}
	values := r.URL.Query()
	for key, vals := range values {
		if !allowed[key] || len(vals) != 1 {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": key})
			return SearchQuery{}, false
		}
	}
	query := SearchQuery{Limit: defaultSearchLimit}
	if vals, ok := values["q"]; ok {
		query.Q = vals[0]
		if len([]byte(query.Q)) > 500 {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "q"})
			return SearchQuery{}, false
		}
	}
	if vals, ok := values["source"]; ok {
		if vals[0] == "" {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "source"})
			return SearchQuery{}, false
		}
		query.Source = &vals[0]
	}
	if vals, ok := values["from"]; ok {
		if !validDate(vals[0]) {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "from"})
			return SearchQuery{}, false
		}
		query.From = &vals[0]
	}
	if vals, ok := values["to"]; ok {
		if !validDate(vals[0]) {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "to"})
			return SearchQuery{}, false
		}
		query.To = &vals[0]
	}
	if query.From != nil && query.To != nil && *query.From > *query.To {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "from"})
		return SearchQuery{}, false
	}
	if vals, ok := values["resonated"]; ok {
		switch vals[0] {
		case "true":
			value := true
			query.Resonated = &value
		case "false":
			value := false
			query.Resonated = &value
		default:
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "resonated"})
			return SearchQuery{}, false
		}
	}
	if vals, ok := values["limit"]; ok {
		parsed, valid := parseBase10Limit(vals[0], maxSearchLimit)
		if !valid {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "limit"})
			return SearchQuery{}, false
		}
		query.Limit = parsed
	}
	return query, true
}

func rejectUnexpectedQuery(w http.ResponseWriter, r *http.Request) bool {
	for key := range r.URL.Query() {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": key})
		return false
	}
	return true
}

func rejectRequestBody(w http.ResponseWriter, r *http.Request) bool {
	if r.ContentLength > 0 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
		return false
	}
	return true
}

func parseBase10Limit(raw string, maxValue int) (int, bool) {
	if raw == "" {
		return 0, false
	}
	for _, char := range raw {
		if char < '0' || char > '9' {
			return 0, false
		}
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 1 || parsed > maxValue {
		return 0, false
	}
	return parsed, true
}

func parseBase10Offset(raw string, maxValue int) (int, bool) {
	if raw == "" {
		return 0, false
	}
	for _, char := range raw {
		if char < '0' || char > '9' {
			return 0, false
		}
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 0 || parsed > maxValue {
		return 0, false
	}
	return parsed, true
}

func validDate(value string) bool {
	if value == "" {
		return false
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func readJSONBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	return readJSONBodyLimit(w, r, dst, maxImportBodyBytes, "10 MiB")
}

func readJSONBodyLimit(w http.ResponseWriter, r *http.Request, dst any, limit int64, limitLabel string) bool {
	if !requireContentType(w, r, map[string]bool{"application/json": true}) {
		return false
	}
	body, ok := readLimitedBodyLabel(w, r, limit, limitLabel)
	if !ok {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": jsonDecodeErrorField(err)})
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
		return false
	}
	return true
}

func readManualFetchBody(w http.ResponseWriter, r *http.Request) bool {
	if !requireContentType(w, r, map[string]bool{"application/json": true}) {
		return false
	}
	body, ok := readLimitedBody(w, r, maxImportBodyBytes)
	if !ok {
		return false
	}
	if string(bytes.TrimSpace(body)) != ManualFetchRequestBody {
		writeAPIError(w, ManualFetchHTTPStatusBadRequest, ManualFetchErrorCodeBadRequest, "bad request", map[string]any{"field": "body"})
		return false
	}
	return true
}

func validateMutationFields(w http.ResponseWriter, fields MutationRequestFields) bool {
	if fields.ActorKind != ActorKindHuman && fields.ActorKind != ActorKindAgent {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "actor_kind"})
		return false
	}
	if fields.ActorID == "" || len([]byte(fields.ActorID)) > 128 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "actor_id"})
		return false
	}
	if fields.IdempotencyKey == "" || len([]byte(fields.IdempotencyKey)) > 200 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "idempotency_key"})
		return false
	}
	return true
}

func requireContentType(w http.ResponseWriter, r *http.Request, allowed map[string]bool) bool {
	raw := r.Header.Get("Content-Type")
	media := strings.ToLower(strings.TrimSpace(strings.Split(raw, ";")[0]))
	if !allowed[media] {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"content_type": raw})
		return false
	}
	return true
}

func readLimitedBody(w http.ResponseWriter, r *http.Request, limit int64) ([]byte, bool) {
	return readLimitedBodyLabel(w, r, limit, "10 MiB")
}

func readLimitedBodyLabel(w http.ResponseWriter, r *http.Request, limit int64, limitLabel string) ([]byte, bool) {
	reader := http.MaxBytesReader(w, r.Body, limit)
	defer func() { _ = reader.Close() }()
	body, err := io.ReadAll(reader)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"limit": limitLabel})
			return nil, false
		}
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
		return nil, false
	}
	return body, true
}

func jsonDecodeErrorField(err error) string {
	const prefix = "json: unknown field "
	message := err.Error()
	if strings.HasPrefix(message, prefix) {
		return strings.Trim(message[len(prefix):], `"`)
	}
	const structFieldMarker = " into Go struct field ."
	if idx := strings.Index(message, structFieldMarker); idx >= 0 {
		field := message[idx+len(structFieldMarker):]
		if end := strings.Index(field, " "); end >= 0 {
			return field[:end]
		}
	}
	return "body"
}

func writeRuntimeMutationError(w http.ResponseWriter, err error) {
	var fieldErr mcpFieldError
	if errors.As(err, &fieldErr) {
		writeFieldError(w, fieldErr)
		return
	}
	writeInternal(w)
}

func writeSteerMutationError(w http.ResponseWriter, err error) {
	var fieldErr mcpFieldError
	if errors.As(err, &fieldErr) {
		writeFieldError(w, fieldErr)
		return
	}
	var notFound mcpNotFoundError
	if errors.As(err, &notFound) {
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": notFound.id})
		return
	}
	writeInternal(w)
}

func listSources(ctx context.Context, db *sql.DB) ([]Source, error) {
	if db == nil {
		return nil, errors.New("list sources: db required")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title, last_fetch_at, last_fetch_status, last_fetch_error, is_active, revision from sources where is_active = 1 order by id`)
	if err != nil {
		return nil, fmt.Errorf("list sources: %w", err)
	}
	defer func() { _ = rows.Close() }()
	sources := []Source{}
	for rows.Next() {
		var source Source
		var lastFetch sql.NullString
		var lastFetchError sql.NullString
		if err := rows.Scan(&source.ID, &source.URL, &source.Title, &lastFetch, &source.LastFetchStatus, &lastFetchError, &source.IsActive, &source.Revision); err != nil {
			return nil, fmt.Errorf("scan source: %w", err)
		}
		source.LastFetchAt = timePtrFromNull(lastFetch)
		source.LastFetchError = stringPtrFromNull(lastFetchError)
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sources: %w", err)
	}
	return sources, nil
}

func loadSourceForResponse(ctx context.Context, db *sql.DB, sourceID string) (Source, error) {
	if db == nil {
		return Source{}, errors.New("load source response: db required")
	}
	var source Source
	var lastFetch sql.NullString
	var lastFetchError sql.NullString
	err := db.QueryRowContext(ctx, `select id, url, title, last_fetch_at, last_fetch_status, last_fetch_error, is_active, revision from sources where id = ? and is_active = 1`, sourceID).Scan(&source.ID, &source.URL, &source.Title, &lastFetch, &source.LastFetchStatus, &lastFetchError, &source.IsActive, &source.Revision)
	if err != nil {
		return Source{}, fmt.Errorf("load source response %q: %w", sourceID, err)
	}
	source.LastFetchAt = timePtrFromNull(lastFetch)
	source.LastFetchError = stringPtrFromNull(lastFetchError)
	return source, nil
}

func newIngestRunResult(result ManualFetchResult, scope string, sourceID *string, started time.Time, completed time.Time) IngestRunResult {
	ingestErrors := make([]IngestErrorDetail, 0, len(result.Errors))
	sourcesFailed := 0
	sourcesSkipped := 0
	itemFailures := 0
	for _, sourceErr := range result.Errors {
		id := sourceErr.SourceID
		ingestErrors = append(ingestErrors, IngestErrorDetail{SourceID: &id, Code: sourceErr.Code, Message: sourceErr.Message})
		if isSkippedIngestErrorCode(sourceErr.Code) {
			sourcesSkipped++
			continue
		}
		if isItemLevelIngestErrorCode(sourceErr.Code) {
			itemFailures++
			continue
		}
		sourcesFailed++
	}
	status := deriveIngestRunStatus(scope, sourcesFailed, sourcesSkipped)
	if itemFailures > 0 && status == IngestRunStatusCompleted {
		status = IngestRunStatusCompletedWithErrors
	}
	duration := completed.Sub(started).Milliseconds()
	if duration < 0 {
		duration = 0
	}
	return IngestRunResult{
		Scope:            scope,
		SourceID:         sourceID,
		Status:           status,
		StartedAt:        started.Format(time.RFC3339),
		CompletedAt:      completed.Format(time.RFC3339),
		DurationMS:       int(duration),
		SourcesAttempted: result.SourcesTotal,
		SourcesSucceeded: result.SourcesFetched,
		SourcesFailed:    sourcesFailed,
		SourcesSkipped:   sourcesSkipped,
		ItemsUpserted:    result.ItemsUpserted,
		Errors:           ingestErrors,
	}
}

func stateErrorField(err error) string {
	message := err.Error()
	if start := strings.Index(message, "field \""); start >= 0 {
		field := message[start+7:]
		if end := strings.Index(field, "\""); end >= 0 {
			return field[:end]
		}
	}
	return "body"
}

func writeNotFoundOrInternal(w http.ResponseWriter, id string, err error) {
	if strings.Contains(strings.ToLower(err.Error()), "not found") || strings.Contains(strings.ToLower(err.Error()), "no rows") {
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": id})
		return
	}
	writeInternal(w)
}

func writeMutationError(w http.ResponseWriter, id string, err error) {
	var fieldErr mcpFieldError
	if errors.As(err, &fieldErr) {
		writeFieldError(w, fieldErr)
		return
	}
	writeNotFoundOrInternal(w, id, err)
}

func writeItemReingestError(w http.ResponseWriter, id string, err error) {
	var fieldErr mcpFieldError
	if errors.As(err, &fieldErr) {
		writeFieldError(w, fieldErr)
		return
	}
	var notFound mcpNotFoundError
	if errors.As(err, &notFound) {
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": notFound.id})
		return
	}
	writeNotFoundOrInternal(w, id, err)
}

func writeManualFetchError(w http.ResponseWriter, id string, err error) {
	if errors.Is(err, errManualFetchConflict) {
		details, _ := guardConflictDetails(err)
		writeGuardConflict(w, details)
		return
	}
	if errors.Is(err, sql.ErrNoRows) || strings.Contains(strings.ToLower(err.Error()), "no rows") {
		writeAPIError(w, ManualFetchHTTPStatusNotFound, ManualFetchErrorCodeNotFound, "not found", map[string]any{"id": id})
		return
	}
	writeInternal(w)
}

func writeInternal(w http.ResponseWriter) {
	writeAPIError(w, http.StatusInternalServerError, "internal", "internal error", nil)
}

func writeFieldError(w http.ResponseWriter, fieldErr mcpFieldError) {
	details := map[string]any{"field": fieldErr.field}
	if fieldErr.reason != "" {
		details["reason"] = fieldErr.reason
	}
	writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", details)
}

func writeAPIError(w http.ResponseWriter, status int, code string, message string, details map[string]any) {
	if details == nil {
		details = map[string]any{}
	}
	writeJSON(w, status, ErrorBody{Error: APIError{Code: code, Message: message, Details: details}})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	if err := encoder.Encode(value); err != nil {
		return
	}
}

// TodayFeedResponse is GET /api/feed/today and resofeed://feed/today.
type TodayFeedResponse struct {
	Items []ItemSummary `json:"items"`
}

// ItemResponse is GET /api/items/{id} and MCP read_item.
type ItemResponse struct {
	Item           ItemDetail `json:"item"`
	FallbackReason string     `json:"fallback_reason,omitempty"`
}

// SourcesResponse is GET /api/sources and resofeed://sources. Empty result sets
// are contractually encoded as {"sources":[]} rather than {"sources":null};
// response constructors must initialize an empty slice when no rows exist.
type SourcesResponse struct {
	Sources []Source `json:"sources"`
}

// IngestResponse is the architecture envelope for POST /api/ingest and
// POST /api/sources/{id}/fetch. Source is present only for source-scoped fetches.
type IngestResponse struct {
	Ingest IngestRunResult `json:"ingest"`
	Source *Source         `json:"source,omitempty"`
}

// IngestRunResult summarizes one synchronous manual ingest/fetch operation.
type IngestRunResult struct {
	Scope            string              `json:"scope"`
	SourceID         *string             `json:"source_id"`
	Status           string              `json:"status"`
	StartedAt        string              `json:"started_at"`
	CompletedAt      string              `json:"completed_at"`
	DurationMS       int                 `json:"duration_ms"`
	SourcesAttempted int                 `json:"sources_attempted"`
	SourcesSucceeded int                 `json:"sources_succeeded"`
	SourcesFailed    int                 `json:"sources_failed"`
	SourcesSkipped   int                 `json:"sources_skipped"`
	ItemsUpserted    int                 `json:"items_upserted"`
	Errors           []IngestErrorDetail `json:"errors"`
}

// IngestErrorDetail is a source-scoped operational failure detail suitable for
// raw Source Ledger err: rendering without friendly-copy translation.
type IngestErrorDetail struct {
	SourceID *string `json:"source_id"`
	Code     string  `json:"code"`
	Message  string  `json:"message"`
}

// SearchResponse is GET /api/search.
type SearchResponse struct {
	Items []ItemSummary   `json:"items"`
	Query SearchQueryEcho `json:"query"`
}

// RulesResponse is resofeed://rules/active. Empty result sets are contractually
// encoded as {"rules":[]} rather than {"rules":null}; response constructors
// must initialize an empty slice when no active rules exist.
type RulesResponse struct {
	Rules []SteerRule `json:"rules"`
}
