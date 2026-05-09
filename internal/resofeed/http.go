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
	"strconv"
	"strings"
	"time"
)

const maxImportBodyBytes = 10 << 20

// HTTPServerConfig wires the static web UI, JSON API, and MCP endpoint into the
// single process. Static assets are public; every /api/* route requires
// Authorization: Bearer <OWNER_TOKEN> and returns the canonical JSON error body
// on auth failure.
type HTTPServerConfig struct {
	Addr           string
	PublicURL      string
	DB             *sql.DB
	OwnerToken     string
	OwnerTokenHash string
	Gemini         GeminiClient
}

// NewRouter returns the HTTP router for static assets, /api/* JSON, /api/doctor
// text/plain, and /mcp Streamable HTTP. Query validation must run after auth and
// before backend reads; unknown or duplicate query params return 400 bad_request.
func NewRouter(cfg HTTPServerConfig) http.Handler {
	api := apiHandler{cfg: cfg}
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.Handle("/mcp", NewMCPHandler(MCPConfig{DB: cfg.DB, OwnerToken: cfg.OwnerToken, OwnerTokenHash: cfg.OwnerTokenHash}))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(w, "RESOFEED\n")
	})
	return mux
}

// ServeHTTPRuntime starts the HTTP/MCP/static server and exits on context
// cancellation. It must not start a second deployable process.
func ServeHTTPRuntime(ctx context.Context, cfg HTTPServerConfig) error {
	server := &http.Server{Addr: cfg.Addr, Handler: NewRouter(cfg)}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
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

type apiHandler struct {
	cfg HTTPServerConfig
}

func (h apiHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.authorized(r) {
		writeAPIError(w, http.StatusUnauthorized, "unauthorized", "owner token required", nil)
		return
	}

	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/api/feed/today":
		h.handleToday(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/search":
		h.handleSearch(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/sources":
		h.handleSources(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/sources/import-opml":
		h.handleImportOPML(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/state/export":
		h.handleStateExport(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/state/import":
		h.handleStateImport(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/doctor":
		h.handleDoctor(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/steer":
		h.handleSteer(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/items/"):
		h.handleItemPath(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/sources/"):
		h.handleDeleteSource(w, r)
	default:
		writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": r.URL.Path})
	}
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
	limit, ok := parseLimitQuery(w, r, map[string]bool{"limit": true}, defaultFeedLimit, maxFeedLimit)
	if !ok {
		return
	}
	items, err := ListTodayFeed(r.Context(), h.cfg.DB, RankingOptions{Limit: limit})
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, TodayFeedResponse{Items: items})
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
		result, err := MarkItemInspected(r.Context(), h.cfg.DB, parts[0], req)
		if err != nil {
			writeNotFoundOrInternal(w, parts[0], err)
			return
		}
		writeJSON(w, http.StatusOK, result)
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
		result, err := SetItemResonance(r.Context(), h.cfg.DB, parts[0], req)
		if err != nil {
			writeNotFoundOrInternal(w, parts[0], err)
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	writeAPIError(w, http.StatusNotFound, "not_found", "not found", map[string]any{"id": r.URL.Path})
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
	if !readJSONBody(w, r, &req) || !validateMutationFields(w, req.MutationRequestFields) {
		return
	}
	if req.Command == "" || len([]byte(req.Command)) > 4000 {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "command"})
		return
	}
	result, err := ApplySteering(r.Context(), h.cfg.DB, h.cfg.Gemini, req)
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) handleSources(w http.ResponseWriter, r *http.Request) {
	sources, err := listSources(r.Context(), h.cfg.DB)
	if err != nil {
		writeInternal(w)
		return
	}
	writeJSON(w, http.StatusOK, SourcesResponse{Sources: sources})
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
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": stateErrorField(err)})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h apiHandler) handleDoctor(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if err := WriteDoctor(r.Context(), h.cfg.DB, w); err != nil {
		return
	}
}

func parseLimitQuery(w http.ResponseWriter, r *http.Request, allowed map[string]bool, defaultValue int, maxValue int) (int, bool) {
	values := r.URL.Query()
	for key, vals := range values {
		if !allowed[key] || len(vals) != 1 {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": key})
			return 0, false
		}
	}
	limit := defaultValue
	if raw := values.Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > maxValue {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "limit"})
			return 0, false
		}
		limit = parsed
	}
	return limit, true
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
		parsed, err := strconv.Atoi(vals[0])
		if err != nil || parsed < 1 || parsed > maxSearchLimit {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "limit"})
			return SearchQuery{}, false
		}
		query.Limit = parsed
	}
	return query, true
}

func validDate(value string) bool {
	if value == "" {
		return false
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func readJSONBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if !requireContentType(w, r, map[string]bool{"application/json": true}) {
		return false
	}
	body, ok := readLimitedBody(w, r, maxImportBodyBytes)
	if !ok {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
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
	reader := http.MaxBytesReader(w, r.Body, limit)
	defer func() { _ = reader.Close() }()
	body, err := io.ReadAll(reader)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"limit": "10 MiB"})
			return nil, false
		}
		writeAPIError(w, http.StatusBadRequest, "bad_request", "bad request", map[string]any{"field": "body"})
		return nil, false
	}
	return body, true
}

func listSources(ctx context.Context, db *sql.DB) ([]Source, error) {
	if db == nil {
		return nil, errors.New("list sources: db required")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title, last_fetch_at, last_fetch_status, is_active, revision from sources where is_active = 1 order by id`)
	if err != nil {
		return nil, fmt.Errorf("list sources: %w", err)
	}
	defer func() { _ = rows.Close() }()
	sources := []Source{}
	for rows.Next() {
		var source Source
		var lastFetch sql.NullString
		if err := rows.Scan(&source.ID, &source.URL, &source.Title, &lastFetch, &source.LastFetchStatus, &source.IsActive, &source.Revision); err != nil {
			return nil, fmt.Errorf("scan source: %w", err)
		}
		source.LastFetchAt = timePtrFromNull(lastFetch)
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sources: %w", err)
	}
	return sources, nil
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

func writeInternal(w http.ResponseWriter) {
	writeAPIError(w, http.StatusInternalServerError, "internal", "internal error", nil)
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
