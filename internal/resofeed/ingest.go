package resofeed

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	sourceStatusOK             = "ok"
	sourceStatusFetchError     = "rss_fetch_error"
	sourceStatusNotFetched     = "not_fetched"
	extractionStatusFull       = "full"
	extractionStatusPartial    = "partial_extraction"
	extractionStatusSummaryNA  = "summary_unavailable"
	extractionStatusOriginalNA = "original_unavailable"
	modelStatusOK              = "ok"
	modelStatusSummaryNA       = "summary_unavailable"
	modelStatusLatencyError    = "model_latency_error"
	modelStatusInvalidModel    = "invalid_model"
	modelStatusProviderError   = "provider_error"
	modelStatusRateLimited     = "rate_limited"
	modelStatusDecodeError     = "decode_error"
	modelStatusTimeout         = "timeout"
)

var ingestGuardState guardedOperationState

var errManualFetchConflict = errors.New("operation already running")

type guardedOperationState struct {
	mu            sync.Mutex
	holder        atomic.Value
	current       currentOperationSnapshot
	activeGlobal  operationGuardDetails
	activeFetches map[string]operationGuardDetails
}

type operationGuardDetails struct {
	Operation string
	Scope     any
	ActorKind string
}

type operationGuardConflictError struct {
	details operationGuardDetails
}

func (e operationGuardConflictError) Error() string { return errManualFetchConflict.Error() }

func (e operationGuardConflictError) Is(target error) bool {
	return target == errManualFetchConflict
}

func (e operationGuardConflictError) guardDetails() operationGuardDetails {
	return e.details
}

// IngestConfig defines the background ingestion loop inside the single Go
// process. Defaults are 15 minute loop interval, 20 second source timeout, and
// LLM limits owned by OpenRouterConfig.
type IngestConfig struct {
	Interval           time.Duration
	SourceFetchTimeout time.Duration
	LLM                LLMClient
	FirstFetchMaxItems int
	// FirstFetchMaxItemsSet distinguishes omitted IngestConfig{} (default 50)
	// from an explicit zero unlimited cap. It is only needed for direct in-process
	// callers because the CLI/env parser always materializes an explicit value.
	FirstFetchMaxItemsSet bool
}

// RunIngestLoop fetches active sources independently until ctx is canceled. One
// source failure must not block other sources, and extraction/model failure must
// not delete or hide the item.
func RunIngestLoop(ctx context.Context, db *sql.DB, cfg IngestConfig) error {
	interval := cfg.Interval
	if interval <= 0 {
		interval = 15 * time.Minute
	}
	if err := IngestOnce(ctx, db, cfg); err != nil {
		return err
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := IngestOnce(ctx, db, cfg); err != nil {
				return err
			}
		}
	}
}

// IngestOnce performs one ingestion pass over active sources.
func IngestOnce(ctx context.Context, db *sql.DB, cfg IngestConfig) (retErr error) {
	release, err := tryAcquireIngestGuardWithActor(ctx, "ingest", "background", "background")
	if err != nil {
		return nil
	}
	updateCurrentOperation("loading_sources", nil, "background ingest loading active sources")
	defer releaseGuardRecover(release, &retErr, "ingest once")
	_, err = ingestOnceUnlocked(ctx, db, cfg)
	return err
}

// ManualIngest triggers one user-requested ingestion pass. It shares the same
// in-process guard as background ingestion and never creates durable queue/job
// state when another operation is already running.
func ManualIngest(ctx context.Context, db *sql.DB, cfg IngestConfig) (ret ManualFetchResult, retErr error) {
	release, err := tryAcquireIngestGuardWithActor(ctx, "ingest", "all", string(ActorKindHuman))
	if err != nil {
		return ManualFetchResult{}, err
	}
	updateCurrentOperation("loading_sources", nil, "manual ingest loading active sources")
	defer releaseGuardRecover(release, &retErr, "manual ingest")
	return ingestOnceUnlocked(ctx, db, cfg)
}

// ManualFetchSource triggers one user-requested source fetch for an active
// source. Missing, deleted, and inactive sources are reported by the caller as
// not_found; operational RSS failures are source-level result entries.
func ManualFetchSource(ctx context.Context, db *sql.DB, cfg IngestConfig, sourceID string) (ret ManualFetchResult, retErr error) {
	release, err := tryAcquireIngestGuardWithActor(ctx, "fetch", sourceID, string(ActorKindHuman))
	if err != nil {
		return ManualFetchResult{}, err
	}
	updateCurrentOperation("loading_source", nil, "manual source fetch loading source")
	defer releaseGuardRecover(release, &retErr, "manual source fetch")

	source, err := loadActiveSource(ctx, db, sourceID)
	if err != nil {
		return ManualFetchResult{}, err
	}
	updateCurrentOperation("fetching_source", &CurrentOperationCount{Current: 0, Total: 1}, "manual source fetch running")
	result := ManualFetchResult{Operation: ManualFetchOperationSourceFetch, SourceID: &source.ID, Completed: true, SourcesTotal: 1, Errors: []ManualFetchSourceError{}}
	sourceResult, err := ingestSource(ctx, db, cfg, source)
	if err != nil {
		if updateErr := updateSourceFetch(ctx, db, source.ID, sourceStatusFetchError, err.Error(), ""); updateErr != nil {
			return ManualFetchResult{}, updateErr
		}
		result.Errors = append(result.Errors, ManualFetchSourceError{SourceID: source.ID, Code: sourceStatusFetchError, Message: err.Error()})
		return result, nil
	}
	if err := updateSourceFetch(ctx, db, source.ID, sourceStatusOK, "", sourceResult.sourceTitle); err != nil {
		return ManualFetchResult{}, err
	}
	result.SourcesFetched = 1
	result.ItemsDiscovered = sourceResult.itemsDiscovered
	result.ItemsUpserted = sourceResult.itemsUpserted
	updateCurrentOperation("source_complete", &CurrentOperationCount{Current: 1, Total: 1}, "manual source fetch complete")
	return result, nil
}

func ingestOnceUnlocked(ctx context.Context, db *sql.DB, cfg IngestConfig) (result ManualFetchResult, retErr error) {
	result = ManualFetchResult{Operation: ManualFetchOperationIngest, Completed: true, Errors: []ManualFetchSourceError{}}
	if db == nil {
		return result, errors.New("ingest once: db required")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title from sources where is_active = 1`)
	if err != nil {
		return result, fmt.Errorf("ingest once: query active sources: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("ingest once: close source rows: %w", closeErr)
		}
	}()

	var sources []Source
	for rows.Next() {
		var source Source
		if err := rows.Scan(&source.ID, &source.URL, &source.Title); err != nil {
			return result, fmt.Errorf("ingest once: scan source: %w", err)
		}
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return result, fmt.Errorf("ingest once: source rows: %w", err)
	}
	result.SourcesTotal = len(sources)
	updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: 0, Total: len(sources)}, "ingest fetching active sources")

	for index, source := range sources {
		updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: index, Total: len(sources)}, "ingest fetching source")
		sourceResult, err := ingestSource(ctx, db, cfg, source)
		if err != nil {
			if updateErr := updateSourceFetch(ctx, db, source.ID, sourceStatusFetchError, err.Error(), ""); updateErr != nil {
				return result, updateErr
			}
			result.Errors = append(result.Errors, ManualFetchSourceError{SourceID: source.ID, Code: sourceStatusFetchError, Message: err.Error()})
			continue
		}
		if err := updateSourceFetch(ctx, db, source.ID, sourceStatusOK, "", sourceResult.sourceTitle); err != nil {
			return result, err
		}
		result.SourcesFetched++
		result.ItemsDiscovered += sourceResult.itemsDiscovered
		result.ItemsUpserted += sourceResult.itemsUpserted
		updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: index + 1, Total: len(sources)}, "ingest source complete")
	}
	updateCurrentOperation("complete", &CurrentOperationCount{Current: len(sources), Total: len(sources)}, "ingest complete")
	return result, nil
}

// ImportOPML imports source URLs into the flat Source Ledger. OPML folders are
// ignored and flattened immediately; OPML is not complete state restore.
func ImportOPML(ctx context.Context, db *sql.DB, opml []byte) (OPMLImportResult, error) {
	if db == nil {
		return OPMLImportResult{}, errors.New("import opml: db required")
	}
	urls, err := parseOPMLFeedURLs(opml)
	if err != nil {
		return OPMLImportResult{}, err
	}
	result := OPMLImportResult{FoldersFlattened: true}
	for _, feedURL := range urls {
		id := stableID("src", feedURL)
		title := feedURL
		if parsed, err := url.Parse(feedURL); err == nil && parsed.Host != "" {
			title = parsed.Host
		}
		res, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, ?, 1, 1) on conflict(url) do nothing`, id, feedURL, title, time.Now().UTC().Format(time.RFC3339), sourceStatusNotFetched)
		if err != nil {
			return result, fmt.Errorf("import opml: insert source %q: %w", feedURL, err)
		}
		rows, err := res.RowsAffected()
		if err != nil {
			return result, fmt.Errorf("import opml: rows affected: %w", err)
		}
		if rows == 0 {
			result.Skipped++
			continue
		}
		result.Imported++
	}
	return result, nil
}

// ExportOPML writes active Source Ledger sources as flat OPML 2.0. It is a
// source-list exchange format only and intentionally omits portable state,
// steering rules, item state, resonance, receipts, folders, and tags.
func ExportOPML(ctx context.Context, db *sql.DB, w io.Writer) error {
	if db == nil {
		return errors.New("export opml: db required")
	}
	if w == nil {
		return errors.New("export opml: writer required")
	}
	sources, err := listSources(ctx, db)
	if err != nil {
		return fmt.Errorf("export opml: list sources: %w", err)
	}
	outlines := make([]opmlExportOutline, 0, len(sources))
	for _, source := range sources {
		outlines = append(outlines, opmlExportOutline{Type: "rss", Text: source.Title, Title: source.Title, XMLURL: source.URL})
	}
	doc := opmlExportDocument{
		Version: "2.0",
		Head:    opmlExportHead{Title: "ResoFeed Sources"},
		Body:    opmlExportBody{Outlines: outlines},
	}
	if _, err := io.WriteString(w, xml.Header); err != nil {
		return fmt.Errorf("export opml: write header: %w", err)
	}
	encoder := xml.NewEncoder(w)
	encoder.Indent("", "  ")
	if err := encoder.Encode(doc); err != nil {
		return fmt.Errorf("export opml: encode: %w", err)
	}
	if err := encoder.Flush(); err != nil {
		return fmt.Errorf("export opml: flush: %w", err)
	}
	return nil
}

type opmlExportDocument struct {
	XMLName xml.Name       `xml:"opml"`
	Version string         `xml:"version,attr"`
	Head    opmlExportHead `xml:"head"`
	Body    opmlExportBody `xml:"body"`
}

type opmlExportHead struct {
	Title string `xml:"title"`
}

type opmlExportBody struct {
	Outlines []opmlExportOutline `xml:"outline"`
}

type opmlExportOutline struct {
	Type   string `xml:"type,attr"`
	Text   string `xml:"text,attr"`
	Title  string `xml:"title,attr"`
	XMLURL string `xml:"xmlUrl,attr"`
}

// DeleteSource marks a source inactive/deleted so it no longer appears in the
// Source Ledger or contributes new items.
func DeleteSource(ctx context.Context, db *sql.DB, sourceID string) (DeleteSourceResult, error) {
	if db == nil {
		return DeleteSourceResult{}, errors.New("delete source: db required")
	}
	if strings.TrimSpace(sourceID) == "" {
		return DeleteSourceResult{}, errors.New("delete source: source id required")
	}
	res, err := db.ExecContext(ctx, `update sources set is_active = 0, revision = revision + 1 where id = ?`, sourceID)
	if err != nil {
		return DeleteSourceResult{}, fmt.Errorf("delete source: update %q: %w", sourceID, err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return DeleteSourceResult{}, fmt.Errorf("delete source: rows affected: %w", err)
	}
	if rows == 0 {
		return DeleteSourceResult{}, fmt.Errorf("delete source: %q not found", sourceID)
	}
	var revision int64
	if err := db.QueryRowContext(ctx, `select revision from sources where id = ?`, sourceID).Scan(&revision); err != nil {
		return DeleteSourceResult{}, fmt.Errorf("delete source: read revision %q: %w", sourceID, err)
	}
	return DeleteSourceResult{SourceID: sourceID, Deleted: true, Revision: revision}, nil
}

func tryAcquireIngestGuard(ctx context.Context, operation string, scope any) (func(), error) {
	return tryAcquireIngestGuardWithActor(ctx, operation, scope, string(ActorKindHuman))
}

func tryAcquireIngestGuardWithActor(ctx context.Context, operation string, scope any, actorKind string) (func(), error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	details := operationGuardDetails{Operation: operation, Scope: scope, ActorKind: actorKind}
	ingestGuardState.mu.Lock()
	if conflict, ok := ingestGuardState.conflictLocked(details); ok {
		ingestGuardState.mu.Unlock()
		return nil, operationGuardConflictError{details: conflict}
	}
	ingestGuardState.addLocked(details)
	ingestGuardState.holder.Store(details)
	ingestGuardState.mu.Unlock()
	ingestGuardState.current.start(operation, scope, actorKind)
	released := false
	return func() {
		if released {
			return
		}
		released = true
		ingestGuardState.mu.Lock()
		ingestGuardState.removeLocked(details)
		remaining, hasRemaining := ingestGuardState.anyLocked()
		if hasRemaining {
			ingestGuardState.holder.Store(remaining)
		} else {
			ingestGuardState.holder.Store(operationGuardDetails{})
		}
		ingestGuardState.mu.Unlock()
		if !hasRemaining {
			ingestGuardState.current.clear()
		}
	}, nil
}

func (s *guardedOperationState) conflictLocked(details operationGuardDetails) (operationGuardDetails, bool) {
	if s.activeGlobal.Operation != "" {
		return s.activeGlobal, true
	}
	if details.Operation != "fetch" {
		if existing, ok := s.anyLocked(); ok {
			return existing, true
		}
		return operationGuardDetails{}, false
	}
	key := sourceFetchGuardKey(details.Scope)
	if key == "source" {
		if existing, ok := s.anyLocked(); ok {
			return existing, true
		}
		return operationGuardDetails{}, false
	}
	if existing, ok := s.activeFetches["source"]; ok {
		return existing, true
	}
	if existing, ok := s.activeFetches[key]; ok {
		return existing, true
	}
	return operationGuardDetails{}, false
}

func (s *guardedOperationState) addLocked(details operationGuardDetails) {
	if details.Operation != "fetch" {
		s.activeGlobal = details
		return
	}
	if s.activeFetches == nil {
		s.activeFetches = map[string]operationGuardDetails{}
	}
	s.activeFetches[sourceFetchGuardKey(details.Scope)] = details
}

func (s *guardedOperationState) removeLocked(details operationGuardDetails) {
	if details.Operation != "fetch" {
		s.activeGlobal = operationGuardDetails{}
		return
	}
	delete(s.activeFetches, sourceFetchGuardKey(details.Scope))
}

func (s *guardedOperationState) anyLocked() (operationGuardDetails, bool) {
	if s.activeGlobal.Operation != "" {
		return s.activeGlobal, true
	}
	for _, details := range s.activeFetches {
		return details, true
	}
	return operationGuardDetails{}, false
}

func sourceFetchGuardKey(scope any) string {
	if value, ok := scope.(string); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return fmt.Sprint(scope)
}

func (s *guardedOperationState) snapshot() operationGuardDetails {
	s.mu.Lock()
	defer s.mu.Unlock()
	if details, ok := s.anyLocked(); ok {
		return details
	}
	if holder, ok := s.holder.Load().(operationGuardDetails); ok && holder.Operation != "" {
		return holder
	}
	return operationGuardDetails{Operation: "ingest", Scope: "all", ActorKind: string(ActorKindHuman)}
}

func guardConflictDetails(err error) (operationGuardDetails, bool) {
	var conflict interface{ guardDetails() operationGuardDetails }
	if errors.As(err, &conflict) {
		return conflict.guardDetails(), true
	}
	if errors.Is(err, errManualFetchConflict) {
		return operationGuardDetails{Operation: "ingest", Scope: "all"}, true
	}
	return operationGuardDetails{}, false
}

func guardConflictDetailMap(details operationGuardDetails) map[string]any {
	currentOperation := currentOperationFromGuardDetails(details)
	operation := "operation"
	actorKind := string(ActorKindHuman)
	if currentOperation.Kind != nil {
		operation = *currentOperation.Kind
	}
	if currentOperation.ActorKind != nil {
		actorKind = *currentOperation.ActorKind
	}
	return map[string]any{
		"operation_running": true,
		"operation":         operation,
		"actor_kind":        actorKind,
		"retry_allowed":     true,
		"current_operation": currentOperation,
	}
}

func guardConflictHTTPDetailMap(details operationGuardDetails) map[string]any {
	return guardConflictDetailMap(details)
}

func currentOperationFromGuardDetails(details operationGuardDetails) CurrentOperationInfo {
	if current := currentOperationInfo(); current.Running {
		return current
	}
	now := time.Now().UTC()
	phase := "starting"
	message := currentOperationStartMessage(canonicalOperationKind(details.Operation, details.Scope))
	actorKind := details.ActorKind
	if actorKind == "" {
		actorKind = string(ActorKindHuman)
	}
	return CurrentOperationInfo{
		Running:   true,
		Kind:      stringPtr(canonicalOperationKind(details.Operation, details.Scope)),
		ActorKind: stringPtr(canonicalOperationActorKind(actorKind)),
		Phase:     stringPtr(phase),
		Message:   stringPtr(message),
		StartedAt: timePtr(now),
		UpdatedAt: timePtr(now),
	}
}

func releaseGuardRecover(release func(), retErr *error, label string) {
	release()
	if recovered := recover(); recovered != nil {
		*retErr = fmt.Errorf("%s: recovered failure: %v", label, recovered)
	}
}

func loadActiveSource(ctx context.Context, db *sql.DB, sourceID string) (Source, error) {
	if db == nil {
		return Source{}, errors.New("load active source: db required")
	}
	if strings.TrimSpace(sourceID) == "" || strings.Contains(sourceID, "/") {
		return Source{}, sql.ErrNoRows
	}
	var source Source
	err := db.QueryRowContext(ctx, `select id, url, title from sources where id = ? and is_active = 1`, sourceID).Scan(&source.ID, &source.URL, &source.Title)
	if err != nil {
		return Source{}, fmt.Errorf("load active source %q: %w", sourceID, err)
	}
	return source, nil
}

type ingestSourceResult struct {
	itemsDiscovered int
	itemsUpserted   int
	sourceTitle     string
}

func ingestSource(ctx context.Context, db *sql.DB, cfg IngestConfig, source Source) (ingestSourceResult, error) {
	updateCurrentOperation("fetching_feed", nil, "fetching RSS source")
	language, err := readProcessingLanguage(ctx, db)
	if err != nil {
		return ingestSourceResult{}, fmt.Errorf("ingest source: read processing language: %w", err)
	}
	activeRules, err := loadActiveSteerRules(ctx, db)
	if err != nil {
		return ingestSourceResult{}, fmt.Errorf("ingest source: load active steering rules: %w", err)
	}
	activeSteeringRules := compileActiveSteeringRulesForPrompt(activeRules)
	timeout := cfg.SourceFetchTimeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	sourceCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	feed, err := fetchFeed(sourceCtx, source.URL)
	if err != nil {
		return ingestSourceResult{}, err
	}
	effectiveSource := source
	if feed.Title != "" {
		effectiveSource.Title = feed.Title
	}
	result := ingestSourceResult{itemsDiscovered: len(feed.Items), sourceTitle: feed.Title}
	itemsToProcess, err := applyFirstFetchLimit(ctx, db, cfg, source.ID, feed.Items)
	if err != nil {
		return result, err
	}
	for index, entry := range itemsToProcess {
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: index, Total: len(feed.Items)}, "processing feed items")
		itemID := ingestedItemID(effectiveSource, entry)
		exists, err := itemExists(ctx, db, itemID)
		if err != nil {
			return result, err
		}
		if exists {
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: index + 1, Total: len(feed.Items)}, "processed feed item")
			continue
		}
		item, err := buildItemWithActiveSteering(ctx, effectiveSource, entry, cfg.LLM, language, activeSteeringRules)
		if err != nil {
			return result, err
		}
		inserted, err := upsertIngestedItem(ctx, db, item)
		if err != nil {
			return result, err
		}
		if inserted {
			result.itemsUpserted++
		}
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: index + 1, Total: len(feed.Items)}, "processed feed item")
	}
	return result, nil
}

func applyFirstFetchLimit(ctx context.Context, db *sql.DB, cfg IngestConfig, sourceID string, items []feedEntry) ([]feedEntry, error) {
	limit := effectiveFirstFetchMaxItems(cfg)
	if limit == 0 || len(items) <= limit {
		return items, nil
	}
	count, err := countPersistedItemsForSource(ctx, db, sourceID)
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return items, nil
	}
	return items[:limit], nil
}

func effectiveFirstFetchMaxItems(cfg IngestConfig) int {
	if cfg.FirstFetchMaxItemsSet {
		return cfg.FirstFetchMaxItems
	}
	if cfg.FirstFetchMaxItems > 0 {
		return cfg.FirstFetchMaxItems
	}
	return DefaultFirstFetchMaxItems
}

func countPersistedItemsForSource(ctx context.Context, db *sql.DB, sourceID string) (int, error) {
	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from items where source_id = ?`, sourceID).Scan(&count); err != nil {
		return 0, fmt.Errorf("ingest source: count persisted items for source %q: %w", sourceID, err)
	}
	return count, nil
}

type parsedFeed struct {
	Title string
	Items []feedEntry
}

type feedEntry struct {
	ID          string
	Title       string
	URL         string
	Description string
	PublishedAt *time.Time
}

func fetchFeed(ctx context.Context, feedURL string) (feed parsedFeed, retErr error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return parsedFeed{}, fmt.Errorf("rss fetch: create request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return parsedFeed{}, fmt.Errorf("rss fetch: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("rss fetch: close body: %w", closeErr)
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return parsedFeed{}, fmt.Errorf("rss fetch: status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return parsedFeed{}, fmt.Errorf("rss fetch: read body: %w", err)
	}
	parsed, err := parseFeed(body)
	if err != nil {
		return parsedFeed{}, err
	}
	if len(parsed.Items) == 0 {
		return parsedFeed{}, errors.New("rss parse: no items")
	}
	return parsed, nil
}

func parseFeed(data []byte) (parsedFeed, error) {
	var root struct {
		XMLName xml.Name
		Channel struct {
			Title string `xml:"title"`
			Items []struct {
				GUID        string `xml:"guid"`
				Title       string `xml:"title"`
				Link        string `xml:"link"`
				Description string `xml:"description"`
				PubDate     string `xml:"pubDate"`
			} `xml:"item"`
		} `xml:"channel"`
		Title   string `xml:"title"`
		Entries []struct {
			ID      string `xml:"id"`
			Title   string `xml:"title"`
			Summary string `xml:"summary"`
			Content string `xml:"content"`
			Updated string `xml:"updated"`
			Link    []struct {
				Href string `xml:"href,attr"`
				Rel  string `xml:"rel,attr"`
			} `xml:"link"`
		} `xml:"entry"`
	}
	if err := xml.Unmarshal(data, &root); err != nil {
		return parsedFeed{}, fmt.Errorf("rss parse: %w", err)
	}
	switch strings.ToLower(root.XMLName.Local) {
	case "rss", "rdf":
		feed := parsedFeed{Title: strings.TrimSpace(root.Channel.Title)}
		for _, item := range root.Channel.Items {
			published := parseFeedTime(item.PubDate)
			guid := strings.TrimSpace(item.GUID)
			link := strings.TrimSpace(item.Link)
			if link == "" && isHTTPArticleURL(guid) {
				link = guid
			}
			feed.Items = append(feed.Items, feedEntry{ID: guid, Title: strings.TrimSpace(item.Title), URL: link, Description: textFromHTML(item.Description), PublishedAt: published})
		}
		return feed, nil
	case "feed":
		feed := parsedFeed{Title: strings.TrimSpace(root.Title)}
		for _, entry := range root.Entries {
			link := ""
			for _, candidate := range entry.Link {
				if candidate.Rel == "" || candidate.Rel == "alternate" {
					link = strings.TrimSpace(candidate.Href)
					break
				}
			}
			description := entry.Summary
			if description == "" {
				description = entry.Content
			}
			feed.Items = append(feed.Items, feedEntry{ID: strings.TrimSpace(entry.ID), Title: strings.TrimSpace(entry.Title), URL: link, Description: textFromHTML(description), PublishedAt: parseFeedTime(entry.Updated)})
		}
		return feed, nil
	default:
		return parsedFeed{}, fmt.Errorf("rss parse: unsupported root %q", root.XMLName.Local)
	}
}

func buildItem(ctx context.Context, source Source, entry feedEntry, llm LLMClient, targetLanguage ProcessingLanguage) (Item, error) {
	return buildItemWithActiveSteering(ctx, source, entry, llm, targetLanguage, nil)
}

func buildItemWithActiveSteering(ctx context.Context, source Source, entry feedEntry, llm LLMClient, targetLanguage ProcessingLanguage, activeSteeringRules []string) (Item, error) {
	if err := validateProcessingLanguage(targetLanguage); err != nil {
		return Item{}, fmt.Errorf("build item: target language: %w", err)
	}
	generatedFallbackURL := false
	if strings.TrimSpace(entry.URL) == "" {
		entry.URL = source.URL + "#" + stableID("entry", entry.Title+entry.Description)
		generatedFallbackURL = true
	}
	item := Item{
		ID:              stableID("item", source.ID+"|"+entryIdentity(entry)),
		SourceID:        source.ID,
		SourceTitle:     source.Title,
		URL:             entry.URL,
		Title:           entry.Title,
		SourceItemTitle: entry.Title,
		PublishedAt:     entry.PublishedAt,
		FeedExcerpt:     nullableString(entry.Description),
		Provenance:      Provenance{SourceURL: source.URL, OriginalURL: entry.URL},
		ModelStatus:     modelStatusSummaryNA,
		ContentStatus:   modelStatusSummaryNA,
	}
	if item.Title == "" {
		item.Title = entry.URL
	}
	if strings.TrimSpace(item.SourceItemTitle) == "" {
		item.SourceItemTitle = item.Title
	}
	sanitizeReadableItem(&item)
	extracted := ""
	extractionStatus := extractionStatusOriginalNA
	if generatedFallbackURL {
		if strings.TrimSpace(entry.Description) != "" {
			extractionStatus = extractionStatusPartial
		}
	} else {
		extracted, extractionStatus = extractArticleText(ctx, entry.URL, entry.Description)
	}
	item.ExtractedText = nullableString(extracted)
	item.ExtractionStatus = extractionStatus
	available := extracted
	availableTextSource := "fresh_full_text"
	if strings.TrimSpace(available) == "" {
		available = stringValue(item.FeedExcerpt)
		availableTextSource = "rss_excerpt"
	}
	available, _ = sanitizeReadablePayloadText(available)
	if strings.TrimSpace(available) == "" {
		item.ExtractionStatus = extractionStatusOriginalNA
		item.ModelStatus = modelStatusSummaryNA
		sanitizeReadableItem(&item)
		return item, nil
	}
	if llm == nil {
		item.ModelStatus = modelStatusSummaryNA
		sanitizeReadableItem(&item)
		return item, nil
	}
	out, err := llm.SummarizeItem(ctx, OpenRouterSummaryInput{ItemID: item.ID, Title: item.SourceItemTitle, SourceTitle: item.SourceTitle, URL: item.URL, AvailableTextSource: availableTextSource, AvailableText: available, TargetLanguage: targetLanguage, ActiveSteeringRules: activeSteeringRules})
	if err != nil {
		item.ModelStatus = classifyModelFailureStatus(err, out.ModelStatus)
		sanitizeReadableItem(&item)
		return item, nil
	}
	compiled, compileErr := compilePromptingV21SummaryPrompt(OpenRouterSummaryInput{ItemID: item.ID, Title: item.SourceItemTitle, SourceTitle: item.SourceTitle, URL: item.URL, AvailableTextSource: availableTextSource, AvailableText: available, TargetLanguage: targetLanguage, ActiveSteeringRules: activeSteeringRules})
	if compileErr != nil {
		item.ModelStatus = modelStatusDecodeError
		if item.ExtractionStatus == extractionStatusFull || item.ExtractionStatus == extractionStatusPartial {
			item.ExtractionStatus = extractionStatusSummaryNA
		}
		sanitizeReadableItem(&item)
		return item, nil
	}
	out, err = validateSummaryOutputForPersistenceWithPrompt(out, compiled.UserPayload.Item)
	if err != nil {
		item.ModelStatus = modelStatusDecodeError
		item.ContentStatus = modelStatusDecodeError
		if item.ExtractionStatus == extractionStatusFull || item.ExtractionStatus == extractionStatusPartial {
			item.ExtractionStatus = extractionStatusSummaryNA
		}
		sanitizeReadableItem(&item)
		return item, nil
	}
	item.ModelStatus = mapModelStatus(out.ModelStatus)
	item.ContentStatus = item.ModelStatus
	if item.ModelStatus == modelStatusOK {
		if strings.TrimSpace(out.LocalizedTitle) != "" {
			item.LocalizedTitle = nullableString(out.LocalizedTitle)
			item.Title = out.LocalizedTitle
		} else if strings.TrimSpace(out.Title) != "" {
			item.LocalizedTitle = nullableString(out.Title)
			item.Title = out.Title
		}
		item.KeyPoints = append([]string(nil), out.KeyPoints...)
		if strings.TrimSpace(out.FeedExcerpt) != "" {
			item.FeedExcerpt = nullableString(out.FeedExcerpt)
		}
		if strings.TrimSpace(out.ExtractedText) != "" {
			item.ExtractedText = nullableString(out.ExtractedText)
		}
		item.Summary = nullableString(out.Summary)
		item.CoreInsight = nullableString(out.CoreInsight)
		item.ValueTier = nullableString(out.ValueTier)
	} else if item.ExtractionStatus == extractionStatusFull || item.ExtractionStatus == extractionStatusPartial {
		item.ExtractionStatus = extractionStatusSummaryNA
	}
	sanitizeReadableItem(&item)
	return item, nil
}

func ingestedItemID(source Source, entry feedEntry) string {
	if strings.TrimSpace(entry.URL) == "" {
		entry.URL = source.URL + "#" + stableID("entry", entry.Title+entry.Description)
	}
	return stableID("item", source.ID+"|"+entryIdentity(entry))
}

func extractArticleText(ctx context.Context, itemURL string, fallback string) (text string, status string) {
	parsed, err := url.Parse(itemURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, itemURL, nil)
	if err != nil {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			if strings.TrimSpace(fallback) != "" {
				text, status = "", extractionStatusPartial
				return
			}
			text, status = "", extractionStatusOriginalNA
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	if !isReadableTextContentType(resp.Header.Get("Content-Type")) {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	if looksLikeBinaryReadablePayload(body) {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	extracted := textFromHTML(string(body))
	if extracted == "" {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	cleaned, _ := sanitizeReadablePayloadText(extracted)
	if strings.TrimSpace(cleaned) == "" || isUnusableReadablePayload(cleaned) {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	return cleaned, extractionStatusFull
}

func itemExists(ctx context.Context, db *sql.DB, itemID string) (bool, error) {
	var exists int
	err := db.QueryRowContext(ctx, `select 1 from items where id = ? limit 1`, itemID).Scan(&exists)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return false, fmt.Errorf("ingest item %q: check existing: %w", itemID, err)
}

func upsertIngestedItem(ctx context.Context, db *sql.DB, item Item) (bool, error) {
	sanitizeReadableItem(&item)
	keyPointsJSON, marshalErr := json.Marshal(item.KeyPoints)
	if marshalErr != nil {
		return false, fmt.Errorf("ingest item %q: marshal key points: %w", item.ID, marshalErr)
	}
	res, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, source_item_title, localized_title, summary, core_insight, key_points, value_tier, content_status, last_reprocess_status, last_reprocess_error_code, last_reprocess_error_message, last_reprocess_at, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text, canonical_url, story_key, duplicate_of_item_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do nothing`, item.ID, item.SourceID, item.Provenance.SourceURL, item.URL, item.Title, item.SourceItemTitle, item.LocalizedTitle, item.Summary, item.CoreInsight, string(keyPointsJSON), item.ValueTier, item.ContentStatus, item.LastReprocessStatus, item.LastReprocessErrorCode, item.LastReprocessErrorMessage, formatTimePtr(item.LastReprocessAt), formatTimePtr(item.PublishedAt), time.Now().UTC().Format(time.RFC3339), item.ExtractionStatus, item.ModelStatus, item.FeedExcerpt, item.ExtractedText, item.Provenance.CanonicalURL, item.StoryKey, item.DuplicateOfItemID)
	if err != nil {
		return false, fmt.Errorf("ingest item %q: %w", item.ID, err)
	}
	inserted, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("ingest item %q: rows affected: %w", item.ID, err)
	}
	if inserted == 0 {
		return false, nil
	}
	if err := upsertSearchIndex(ctx, db, item); err != nil {
		return false, err
	}
	return true, nil
}

func upsertSearchIndex(ctx context.Context, db *sql.DB, item Item) error {
	keyPointsJSON, marshalErr := json.Marshal(item.KeyPoints)
	if marshalErr != nil {
		return fmt.Errorf("refresh search index %q: marshal key points: %w", item.ID, marshalErr)
	}
	provenance := strings.Join([]string{item.Provenance.SourceURL, item.Provenance.OriginalURL, derefString(item.Provenance.CanonicalURL), derefString(item.StoryKey), derefString(item.DuplicateOfItemID)}, " ")
	_, err := db.ExecContext(ctx, `delete from search_fts where item_id = ?`, item.ID)
	if err != nil {
		return fmt.Errorf("refresh search index %q: delete old row: %w", item.ID, err)
	}
	_, err = db.ExecContext(ctx, `insert into search_fts (item_id, title, source_item_title, localized_title, source_title, feed_excerpt, summary, core_insight, key_points, extracted_text, provenance) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.ID, item.Title, item.SourceItemTitle, stringValue(item.LocalizedTitle), item.SourceTitle, stringValue(item.FeedExcerpt), stringValue(item.Summary)+" "+stringValue(item.ValueTier), stringValue(item.CoreInsight), string(keyPointsJSON), stringValue(item.ExtractedText), provenance+" "+stringValue(item.ValueTier))
	if err != nil {
		return fmt.Errorf("refresh search index %q: insert row: %w", item.ID, err)
	}
	return nil
}

func updateSourceFetch(ctx context.Context, db *sql.DB, sourceID string, status string, rawErr string, parsedTitle string) error {
	fetchedTitle := strings.TrimSpace(parsedTitle)
	if fetchedTitle == "" {
		_, err := execSourceMutation(ctx, db, `update sources set last_fetch_at = ?, last_fetch_status = ?, last_fetch_error = ?, revision = revision + 1 where id = ?`, time.Now().UTC().Format(time.RFC3339), status, nullableString(rawErr), sourceID)
		if err != nil {
			return fmt.Errorf("update source fetch %q: %w", sourceID, err)
		}
		return nil
	}
	_, err := execSourceMutation(ctx, db, `update sources set title = ?, last_fetch_at = ?, last_fetch_status = ?, last_fetch_error = ?, revision = revision + case when title <> ? then 2 else 1 end where id = ?`, fetchedTitle, time.Now().UTC().Format(time.RFC3339), status, nullableString(rawErr), fetchedTitle, sourceID)
	if err != nil {
		return fmt.Errorf("update source fetch %q: %w", sourceID, err)
	}
	return nil
}

func execSourceMutation(ctx context.Context, db *sql.DB, query string, args ...any) (sql.Result, error) {
	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		result, err := db.ExecContext(ctx, query, args...)
		if !isSQLiteContention(err) {
			return result, err
		}
		lastErr = err
		wait := time.NewTimer(time.Duration(attempt+1) * 10 * time.Millisecond)
		select {
		case <-ctx.Done():
			if !wait.Stop() {
				<-wait.C
			}
			return nil, ctx.Err()
		case <-wait.C:
		}
	}
	return nil, lastErr
}

func isSQLiteContention(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "database is locked") || strings.Contains(message, "database table is locked") || strings.Contains(message, "database is busy")
}

func parseOPMLFeedURLs(data []byte) ([]string, error) {
	var doc struct {
		Outlines []opmlOutline `xml:"body>outline"`
	}
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("import opml: parse: %w", err)
	}
	seen := map[string]bool{}
	var urls []string
	var walk func([]opmlOutline)
	walk = func(outlines []opmlOutline) {
		for _, outline := range outlines {
			feedURL := strings.TrimSpace(outline.XMLURL)
			if feedURL != "" && !seen[feedURL] {
				seen[feedURL] = true
				urls = append(urls, feedURL)
			}
			walk(outline.Outlines)
		}
	}
	walk(doc.Outlines)
	return urls, nil
}

type opmlOutline struct {
	XMLURL   string        `xml:"xmlUrl,attr"`
	Outlines []opmlOutline `xml:"outline"`
}

func parseFeedTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, time.RFC822Z, time.RFC822} {
		if parsed, err := time.Parse(layout, value); err == nil {
			utc := parsed.UTC()
			return &utc
		}
	}
	return nil
}

func entryIdentity(entry feedEntry) string {
	for _, value := range []string{entry.ID, entry.URL, entry.Title + entry.Description} {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func stableID(prefix string, value string) string {
	h := fnv.New128a()
	_, _ = h.Write([]byte(value))
	return prefix + "_" + hex.EncodeToString(h.Sum(nil))
}

var articleTagRE = regexp.MustCompile(`(?is)<article\b[^>]*>([\s\S]*?)</article>`)
var articleBodyItempropRE = regexp.MustCompile(`(?is)<(?:div|section|main|article)\b[^>]*\bitemprop\s*=\s*["']?articleBody["']?[^>]*>([\s\S]*?)</(?:div|section|main|article)>`)
var mainTagRE = regexp.MustCompile(`(?is)<main\b[^>]*>([\s\S]*?)</main>`)
var contentContainerRE = regexp.MustCompile(`(?is)<(?:div|section|main)\b[^>]*\b(?:id|class)\s*=\s*["'][^"']*(?:article-body|article-content|post-content|entry-content|story-body|content-body)[^"']*["'][^>]*>([\s\S]*?)</(?:div|section|main)>`)
var bodyTagRE = regexp.MustCompile(`(?is)<body\b[^>]*>([\s\S]*?)</body>`)
var executableHTMLRE = regexp.MustCompile(`(?is)<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?</(?:script|style|noscript|svg)>`)
var structuralBoilerplateHTMLRE = regexp.MustCompile(`(?is)<(?:nav|header|footer|aside|form)\b[^>]*>[\s\S]*?</(?:nav|header|footer|aside|form)>`)
var htmlBlockBoundaryRE = regexp.MustCompile(`(?is)<\s*/?\s*(?:address|article|blockquote|br|dd|details|dialog|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>`)
var htmlTagRE = regexp.MustCompile(`<[^>]+>`)
var whitespaceRE = regexp.MustCompile(`\s+`)
var diagnosticTokenRE = regexp.MustCompile(`(?i)\b(?:model_latency_error|summary_unavailable|partial_extraction|original_unavailable)\b`)
var cssCustomPropertyRE = regexp.MustCompile(`(?i)(?:^|\s)--[a-z0-9-]+\s*:[^;{}]+;?`)

func textFromHTML(value string) string {
	value = readableHTMLFragment(value)
	value = removeEnclosureMetadata(value)
	value = executableHTMLRE.ReplaceAllString(value, " ")
	value = structuralBoilerplateHTMLRE.ReplaceAllString(value, " ")
	value = htmlBlockBoundaryRE.ReplaceAllString(value, "\n")
	value = htmlTagRE.ReplaceAllString(value, " ")
	value = decodeHTMLEntities(value)
	value = executableHTMLRE.ReplaceAllString(value, " ")
	value = htmlBlockBoundaryRE.ReplaceAllString(value, "\n")
	value = htmlTagRE.ReplaceAllString(value, " ")
	value = removeJSONLDObjects(value)
	value = cssCustomPropertyRE.ReplaceAllString(value, " ")
	value = removePollutedSentences(value)
	return normalizeReadableTextLines(value)
}

func normalizeReadableTextLines(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	lines := strings.Split(value, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(whitespaceRE.ReplaceAllString(line, " "))
		if line == "" {
			continue
		}
		kept = append(kept, line)
	}
	return strings.Join(kept, "\n")
}

func removeEnclosureMetadata(value string) string {
	return regexp.MustCompile(`(?is)\benclosure:\s+url=\S+\s+type=\S+\s+length=\S+(?:\s+image=\S+)?`).ReplaceAllString(value, " ")
}

func removeJSONLDObjects(value string) string {
	var clean strings.Builder
	cursor := 0
	for cursor < len(value) {
		match := regexp.MustCompile(`(?is)\{\s*"@context"`).FindStringIndex(value[cursor:])
		if match == nil {
			clean.WriteString(value[cursor:])
			break
		}
		start := cursor + match[0]
		end := jsonObjectEnd(value, start)
		if end < 0 {
			clean.WriteString(value[cursor:])
			break
		}
		clean.WriteString(value[cursor:start])
		clean.WriteByte(' ')
		cursor = end
	}
	return clean.String()
}

func jsonObjectEnd(value string, start int) int {
	depth := 0
	inString := false
	escaped := false
	for index := start; index < len(value); index++ {
		char := value[index]
		if escaped {
			escaped = false
			continue
		}
		if char == '\\' {
			escaped = true
			continue
		}
		if char == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if char == '{' {
			depth++
		}
		if char == '}' {
			depth--
			if depth == 0 {
				return index + 1
			}
		}
	}
	return -1
}

func readableHTMLFragment(value string) string {
	if match := articleTagRE.FindStringSubmatch(value); len(match) == 2 {
		return match[1]
	}
	if match := articleBodyItempropRE.FindStringSubmatch(value); len(match) == 2 {
		return match[1]
	}
	if match := mainTagRE.FindStringSubmatch(value); len(match) == 2 {
		return match[1]
	}
	if match := contentContainerRE.FindStringSubmatch(value); len(match) == 2 {
		return match[1]
	}
	if match := bodyTagRE.FindStringSubmatch(value); len(match) == 2 {
		return match[1]
	}
	return value
}

func decodeHTMLEntities(value string) string {
	return strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'", "&#x27;", "'").Replace(value)
}

func removePollutedSentences(value string) string {
	value = strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\r", "\n")
	lines := strings.Split(value, "\n")
	if len(lines) > 1 {
		cleanLines := make([]string, 0, len(lines))
		for _, line := range lines {
			cleaned := removePollutedSentencesLine(line)
			if strings.TrimSpace(cleaned) != "" {
				cleanLines = append(cleanLines, cleaned)
			}
		}
		return strings.Join(cleanLines, "\n")
	}
	return removePollutedSentencesLine(value)
}

func removePollutedSentencesLine(value string) string {
	parts := regexp.MustCompile(`(?m)([^.!?]+[.!?]?)`).FindAllString(value, -1)
	if len(parts) == 0 {
		if diagnosticTokenRE.MatchString(value) {
			return ""
		}
		return value
	}
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" || diagnosticTokenRE.MatchString(trimmed) {
			continue
		}
		clean = append(clean, trimmed)
	}
	return strings.Join(clean, " ")
}

func nullableString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func formatTimePtr(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format(time.RFC3339)
}

func mapModelStatus(status string) string {
	switch strings.TrimSpace(status) {
	case modelStatusOK:
		return modelStatusOK
	case modelStatusLatencyError:
		return modelStatusLatencyError
	case modelStatusInvalidModel:
		return modelStatusInvalidModel
	case modelStatusProviderError:
		return modelStatusProviderError
	case modelStatusRateLimited:
		return modelStatusRateLimited
	case modelStatusDecodeError:
		return modelStatusDecodeError
	case modelStatusTimeout:
		return modelStatusTimeout
	default:
		return modelStatusSummaryNA
	}
}
