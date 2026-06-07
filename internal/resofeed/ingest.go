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

var (
	ingestGuardState guardedOperationState
	sqliteMutationMu sync.Mutex
)

var errManualFetchConflict = errors.New("operation already running")

// guardedOperationState is the process-memory coordinator state for source
// leases, source capacity accounting, and global-exclusive runtime occupancy.
// It is intentionally not stored in SQLite or exported as portable state.
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
	Reason    string
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

// IngestConfig defines ingest runtime settings inside the single Go process.
// Defaults are 15 minute loop interval, 20 second source timeout, 8 concurrent
// source attempts, 4 concurrent item attempts per source, and 16 global LLM
// attempts.
type IngestConfig struct {
	Interval                 time.Duration
	SourceFetchTimeout       time.Duration
	LLM                      LLMClient
	SourceConcurrency        int
	ItemConcurrencyPerSource int
	GlobalLLMConcurrency     int
	llmSemaphore             *ingestLLMSemaphore
	FirstFetchMaxItems       int
	// FirstFetchMaxItemsSet distinguishes omitted IngestConfig{} (default 50)
	// from an explicit zero unlimited cap. It is only needed for direct in-process
	// callers because the CLI/env parser always materializes an explicit value.
	FirstFetchMaxItemsSet bool
}

type ingestLLMSemaphore struct {
	mu     sync.Mutex
	tokens chan struct{}
	limit  int
	active int
}

var processLLMSemaphore ingestLLMSemaphore

func newIngestLLMSemaphore(limit int) *ingestLLMSemaphore {
	if limit <= 0 {
		limit = DefaultIngestGlobalLLMConcurrency
	}
	processLLMSemaphore.configure(limit)
	return &processLLMSemaphore
}

func (s *ingestLLMSemaphore) configure(limit int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tokens == nil || (s.active == 0 && len(s.tokens) == 0) || s.limit <= 0 {
		s.tokens = make(chan struct{}, limit)
		s.limit = limit
	}
}

func (s *ingestLLMSemaphore) acquire(ctx context.Context) (func(), error) {
	if s == nil {
		return func() {}, nil
	}
	s.mu.Lock()
	if s.tokens == nil {
		s.tokens = make(chan struct{}, DefaultIngestGlobalLLMConcurrency)
		s.limit = DefaultIngestGlobalLLMConcurrency
	}
	tokens := s.tokens
	s.mu.Unlock()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case tokens <- struct{}{}:
	}
	s.mu.Lock()
	s.active++
	s.mu.Unlock()
	released := false
	return func() {
		if released {
			return
		}
		released = true
		<-tokens
		s.mu.Lock()
		s.active--
		s.mu.Unlock()
	}, nil
}

func (cfg IngestConfig) withLLMSemaphore(coordCfg ingestCoordinatorConfig) IngestConfig {
	if cfg.llmSemaphore == nil {
		cfg.llmSemaphore = newIngestLLMSemaphore(coordCfg.withDefaults().GlobalLLMConcurrency)
	}
	return cfg
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

// IngestOnce performs one background ingestion pass over active sources. The
// pass skips already-busy sources, drains selected idle sources through a bounded
// in-request goroutine batch, and never leaves delayed work after the tick returns.
func IngestOnce(ctx context.Context, db *sql.DB, cfg IngestConfig) (retErr error) {
	if backgroundIngestBlockedByGlobalOperation() {
		return nil
	}
	ingestGuardState.current.start("ingest", "background", "background")
	defer ingestGuardState.current.clearIfKind("background_ingest")
	_, err := ingestOnceBackgroundBounded(ctx, db, cfg)
	return err
}

func backgroundIngestBlockedByGlobalOperation() bool {
	ingestGuardState.mu.Lock()
	defer ingestGuardState.mu.Unlock()
	return ingestGuardState.activeGlobal.Operation != ""
}

// ManualIngest triggers one user-requested ingestion pass. It shares the same
// in-process guard as background ingestion and never creates durable deferred-work
// state when another operation is already running.
func ManualIngest(ctx context.Context, db *sql.DB, cfg IngestConfig) (ManualFetchResult, error) {
	return ingestOnceBounded(ctx, db, cfg, boundedIngestOptions{
		actorKind:            string(ActorKindHuman),
		aggregateCurrent:     true,
		aggregateScope:       "all",
		loadMessage:          "manual ingest loading active sources",
		fetchMessage:         "manual ingest fetching active sources",
		skipMessage:          "manual ingest source skipped",
		completeMessage:      "manual ingest complete",
		globalBusyAsConflict: true,
	})
}

// ManualFetchSource triggers one user-requested source fetch for an active
// source. Missing, deleted, and inactive sources are reported by the caller as
// not_found; operational RSS failures are source-level result entries.
func ManualFetchSource(ctx context.Context, db *sql.DB, cfg IngestConfig, sourceID string) (ret ManualFetchResult, retErr error) {
	coordCfg := cfg.coordinatorConfig()
	cfg = cfg.withLLMSemaphore(coordCfg)
	release, err := tryAcquireIngestGuardWithConfig(ctx, coordCfg, "fetch", sourceID, string(ActorKindHuman))
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
	sourceResult, err := ingestSourceWithOptions(ctx, db, cfg, source, ingestSourceOptions{attemptExistingItems: true})
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
	result.Errors = appendItemProcessingErrors(result.Errors, source.ID, sourceResult.itemFailures)
	updateCurrentOperation("source_complete", &CurrentOperationCount{Current: 1, Total: 1}, "manual source fetch complete")
	return result, nil
}

func ingestOnceUnlocked(ctx context.Context, db *sql.DB, cfg IngestConfig) (result ManualFetchResult, retErr error) {
	cfg = cfg.withLLMSemaphore(cfg.coordinatorConfig())
	result = ManualFetchResult{Operation: ManualFetchOperationIngest, Completed: true, Errors: []ManualFetchSourceError{}}
	sources, err := loadActiveSources(ctx, db)
	if err != nil {
		return result, err
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
		result.Errors = appendItemProcessingErrors(result.Errors, source.ID, sourceResult.itemFailures)
		updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: index + 1, Total: len(sources)}, "ingest source complete")
	}
	updateCurrentOperation("complete", &CurrentOperationCount{Current: len(sources), Total: len(sources)}, "ingest complete")
	return result, nil
}

func ingestOnceBackgroundBounded(ctx context.Context, db *sql.DB, cfg IngestConfig) (ManualFetchResult, error) {
	return ingestOnceBounded(ctx, db, cfg, boundedIngestOptions{
		actorKind:        "background",
		aggregateCurrent: true,
		aggregateScope:   "background",
		loadMessage:      "background ingest loading active sources",
		fetchMessage:     "background ingest fetching active sources",
		skipMessage:      "background ingest source skipped",
		completeMessage:  "background ingest complete",
	})
}

type boundedIngestOptions struct {
	actorKind            string
	aggregateCurrent     bool
	aggregateScope       any
	loadMessage          string
	fetchMessage         string
	skipMessage          string
	completeMessage      string
	globalBusyAsConflict bool
}

func ingestOnceBounded(ctx context.Context, db *sql.DB, cfg IngestConfig, opts boundedIngestOptions) (ManualFetchResult, error) {
	result := ManualFetchResult{Operation: ManualFetchOperationIngest, Completed: true, Errors: []ManualFetchSourceError{}}
	if opts.actorKind == "" {
		opts.actorKind = string(ActorKindHuman)
	}
	if opts.loadMessage == "" {
		opts.loadMessage = "ingest loading active sources"
	}
	if opts.fetchMessage == "" {
		opts.fetchMessage = "ingest fetching active sources"
	}
	if opts.skipMessage == "" {
		opts.skipMessage = "ingest source skipped"
	}
	if opts.completeMessage == "" {
		opts.completeMessage = "ingest complete"
	}

	updateCurrentOperation("loading_sources", nil, opts.loadMessage)
	sources, err := loadActiveSources(ctx, db)
	if err != nil {
		return result, err
	}
	updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: 0, Total: len(sources)}, opts.fetchMessage)

	coordCfg := cfg.coordinatorConfig()
	cfg = cfg.withLLMSemaphore(coordCfg)
	capacity := snapshotSourceRunCapacity(coordCfg)
	if capacity.globalBusy {
		if opts.globalBusyAsConflict {
			return result, operationGuardConflictError{details: conflictDetailsWithReason(capacity.globalDetails, ingestConflictReasonGlobalOperationRunning)}
		}
		for _, source := range sources {
			result.Errors = append(result.Errors, ManualFetchSourceError{SourceID: source.ID, Code: IngestErrorCodeSourceBusy, Message: "global operation running"})
		}
		updateCurrentOperation("complete", &CurrentOperationCount{Current: 0, Total: len(sources)}, opts.completeMessage)
		return result, nil
	}
	if len(sources) == 0 {
		updateCurrentOperation("complete", &CurrentOperationCount{Current: 0, Total: 0}, opts.completeMessage)
		return result, nil
	}

	completed := 0
	idleSources := make([]Source, 0, len(sources))
	for _, source := range sources {
		if capacity.isSourceBusy(source.ID) {
			result.Errors = append(result.Errors, ManualFetchSourceError{SourceID: source.ID, Code: IngestErrorCodeSourceBusy, Message: "source already fetching"})
			completed++
			continue
		}
		idleSources = append(idleSources, source)
	}
	if len(idleSources) == 0 {
		updateCurrentOperation("complete", &CurrentOperationCount{Current: completed, Total: len(sources)}, opts.completeMessage)
		return result, nil
	}
	if capacity.availableSlots <= 0 {
		for _, source := range idleSources {
			result.Errors = append(result.Errors, ManualFetchSourceError{SourceID: source.ID, Code: IngestErrorCodeSourceCapacityExhausted, Message: "source capacity exhausted"})
			completed++
		}
		updateCurrentOperation("complete", &CurrentOperationCount{Current: completed, Total: len(sources)}, opts.completeMessage)
		return result, nil
	}

	parallelSlots := minInt(capacity.availableSlots, len(idleSources))
	sourceCh := make(chan Source)
	var wg sync.WaitGroup
	var resultMu sync.Mutex
	var firstErr error

	recordFatal := func(err error) {
		if err == nil {
			return
		}
		resultMu.Lock()
		if firstErr == nil {
			firstErr = err
		}
		resultMu.Unlock()
	}
	recordSourceAttemptStarted := func() {
		resultMu.Lock()
		result.SourcesTotal++
		resultMu.Unlock()
	}
	recordSourceError := func(sourceID string, code string, message string) {
		resultMu.Lock()
		result.Errors = append(result.Errors, ManualFetchSourceError{SourceID: sourceID, Code: code, Message: message})
		completed++
		current := completed
		resultMu.Unlock()
		updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: current, Total: len(sources)}, opts.skipMessage)
	}
	recordSourceSuccess := func(source Source, sourceResult ingestSourceResult) {
		resultMu.Lock()
		result.SourcesFetched++
		result.ItemsDiscovered += sourceResult.itemsDiscovered
		result.ItemsUpserted += sourceResult.itemsUpserted
		result.Errors = appendItemProcessingErrors(result.Errors, source.ID, sourceResult.itemFailures)
		completed++
		current := completed
		resultMu.Unlock()
		updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: current, Total: len(sources)}, opts.fetchMessage)
	}

	for i := 0; i < parallelSlots; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for source := range sourceCh {
				release, err := tryAcquireIngestGuardWithConfig(ctx, coordCfg, "fetch", source.ID, opts.actorKind)
				if err != nil {
					if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
						recordFatal(err)
						continue
					}
					code, message := skippedSourceErrorFromGuard(err)
					recordSourceError(source.ID, code, message)
					continue
				}
				recordSourceAttemptStarted()
				if opts.aggregateCurrent {
					resultMu.Lock()
					current := completed
					resultMu.Unlock()
					ingestGuardState.current.start("ingest", opts.aggregateScope, opts.actorKind)
					updateCurrentOperation("fetching_sources", &CurrentOperationCount{Current: current, Total: len(sources)}, opts.fetchMessage)
				}
				sourceResult, sourceErr := ingestSourceWithRelease(ctx, db, cfg, source, release)
				if sourceErr != nil {
					if updateErr := updateSourceFetch(ctx, db, source.ID, sourceStatusFetchError, sourceErr.Error(), ""); updateErr != nil {
						recordFatal(updateErr)
						continue
					}
					recordSourceError(source.ID, sourceStatusFetchError, sourceErr.Error())
					continue
				}
				if err := updateSourceFetch(ctx, db, source.ID, sourceStatusOK, "", sourceResult.sourceTitle); err != nil {
					recordFatal(err)
					continue
				}
				recordSourceSuccess(source, sourceResult)
			}
		}()
	}

sendLoop:
	for _, source := range idleSources {
		select {
		case <-ctx.Done():
			recordFatal(ctx.Err())
			break sendLoop
		case sourceCh <- source:
		}
	}
	close(sourceCh)
	wg.Wait()

	resultMu.Lock()
	defer resultMu.Unlock()
	updateCurrentOperation("complete", &CurrentOperationCount{Current: completed, Total: len(sources)}, opts.completeMessage)
	return result, firstErr
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
	return tryAcquireIngestGuardWithConfig(ctx, (IngestConfig{}).coordinatorConfig(), operation, scope, actorKind)
}

func tryAcquireIngestGuardWithConfig(ctx context.Context, cfg ingestCoordinatorConfig, operation string, scope any, actorKind string) (func(), error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	cfg = cfg.withDefaults()
	details := operationGuardDetails{Operation: operation, Scope: scope, ActorKind: actorKind}
	ingestGuardState.mu.Lock()
	if conflict, ok := ingestGuardState.conflictLocked(details, cfg.SourceConcurrency); ok {
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
		if hasRemaining {
			ingestGuardState.current.start(remaining.Operation, remaining.Scope, remaining.ActorKind)
		} else {
			ingestGuardState.current.clear()
		}
	}, nil
}

func (s *guardedOperationState) conflictLocked(details operationGuardDetails, sourceCapacity int) (operationGuardDetails, bool) {
	if s.activeGlobal.Operation != "" {
		return conflictDetailsWithReason(s.activeGlobal, ingestConflictReasonGlobalOperationRunning), true
	}
	if details.Operation != "fetch" {
		if existing, ok := s.anyLocked(); ok {
			return conflictDetailsWithReason(existing, ingestConflictReasonGlobalOperationRunning), true
		}
		return operationGuardDetails{}, false
	}
	key := sourceFetchGuardKey(details.Scope)
	if key == "source" {
		if existing, ok := s.anyLocked(); ok {
			return conflictDetailsWithReason(existing, ingestConflictReasonSourceBusy), true
		}
		return operationGuardDetails{}, false
	}
	if existing, ok := s.activeFetches["source"]; ok {
		return conflictDetailsWithReason(existing, ingestConflictReasonSourceBusy), true
	}
	if existing, ok := s.activeFetches[key]; ok {
		return conflictDetailsWithReason(existing, ingestConflictReasonSourceBusy), true
	}
	if sourceCapacity <= 0 {
		sourceCapacity = DefaultIngestSourceConcurrency
	}
	if len(s.activeFetches) >= sourceCapacity {
		return operationGuardDetails{Operation: "fetch", Scope: ingestCoordinationScopeSourceCapacity, ActorKind: details.ActorKind, Reason: ingestConflictReasonSourceCapacityExhausted}, true
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

func conflictDetailsWithReason(details operationGuardDetails, reason string) operationGuardDetails {
	details.Reason = reason
	return details
}

type sourceRunCapacitySnapshot struct {
	globalBusy     bool
	globalDetails  operationGuardDetails
	busySources    map[string]struct{}
	availableSlots int
}

func (s sourceRunCapacitySnapshot) isSourceBusy(sourceID string) bool {
	if _, ok := s.busySources["source"]; ok {
		return true
	}
	_, ok := s.busySources[sourceFetchGuardKey(sourceID)]
	return ok
}

func snapshotSourceRunCapacity(cfg ingestCoordinatorConfig) sourceRunCapacitySnapshot {
	cfg = cfg.withDefaults()
	snapshot := sourceRunCapacitySnapshot{busySources: map[string]struct{}{}, availableSlots: cfg.SourceConcurrency}
	ingestGuardState.mu.Lock()
	defer ingestGuardState.mu.Unlock()
	if ingestGuardState.activeGlobal.Operation != "" {
		snapshot.globalBusy = true
		snapshot.globalDetails = ingestGuardState.activeGlobal
		snapshot.availableSlots = 0
		return snapshot
	}
	for key := range ingestGuardState.activeFetches {
		snapshot.busySources[key] = struct{}{}
	}
	snapshot.availableSlots = cfg.SourceConcurrency - len(ingestGuardState.activeFetches)
	if snapshot.availableSlots < 0 {
		snapshot.availableSlots = 0
	}
	return snapshot
}

func skippedSourceErrorFromGuard(err error) (string, string) {
	if details, ok := guardConflictDetails(err); ok {
		if details.Reason == ingestConflictReasonSourceCapacityExhausted || sourceFetchGuardKey(details.Scope) == string(ingestCoordinationScopeSourceCapacity) {
			return IngestErrorCodeSourceCapacityExhausted, "source capacity exhausted"
		}
		if details.Reason == ingestConflictReasonGlobalOperationRunning {
			return IngestErrorCodeSourceBusy, "global operation running"
		}
	}
	return IngestErrorCodeSourceBusy, "source already fetching"
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
	currentOperation, represented := currentOperationFromGuardDetails(details)
	var operation any
	var actorKind any
	var currentOperationValue any
	if represented {
		if currentOperation.Kind != nil {
			operation = *currentOperation.Kind
		}
		if currentOperation.ActorKind != nil {
			actorKind = *currentOperation.ActorKind
		}
		currentOperationValue = currentOperation
	}
	reason := details.Reason
	if reason == "" {
		reason = conflictReasonForGuardDetails(details)
	}
	return map[string]any{
		"operation_running": true,
		"operation":         operation,
		"actor_kind":        actorKind,
		"retry_allowed":     true,
		"reason":            reason,
		"current_operation": currentOperationValue,
	}
}

func guardConflictHTTPDetailMap(details operationGuardDetails) map[string]any {
	return guardConflictDetailMap(details)
}

func currentOperationFromGuardDetails(details operationGuardDetails) (CurrentOperationInfo, bool) {
	if current := currentOperationInfo(); current.Running {
		if current.Kind == nil {
			return CurrentOperationInfo{}, false
		}
		if _, ok := representedOperationKind(*current.Kind, nil); !ok {
			return CurrentOperationInfo{}, false
		}
		return current, true
	}
	kind, ok := representedOperationKind(details.Operation, details.Scope)
	if !ok {
		return CurrentOperationInfo{}, false
	}
	now := time.Now().UTC()
	phase := "starting"
	message := currentOperationStartMessage(kind)
	actorKind := details.ActorKind
	if actorKind == "" {
		actorKind = string(ActorKindHuman)
	}
	return CurrentOperationInfo{
		Running:   true,
		Kind:      stringPtr(kind),
		ActorKind: stringPtr(canonicalOperationActorKind(actorKind)),
		Phase:     stringPtr(phase),
		Message:   stringPtr(message),
		StartedAt: timePtr(now),
		UpdatedAt: timePtr(now),
	}, true
}

func releaseGuardRecover(release func(), retErr *error, label string) {
	release()
	if recovered := recover(); recovered != nil {
		*retErr = fmt.Errorf("%s: recovered failure: %v", label, recovered)
	}
}

func ingestSourceWithRelease(ctx context.Context, db *sql.DB, cfg IngestConfig, source Source, release func()) (ret ingestSourceResult, retErr error) {
	defer releaseGuardRecover(release, &retErr, "background ingest source")
	return ingestSource(ctx, db, cfg, source)
}

func loadActiveSources(ctx context.Context, db *sql.DB) (sources []Source, retErr error) {
	if db == nil {
		return nil, errors.New("load active sources: db required")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title from sources where is_active = 1`)
	if err != nil {
		return nil, fmt.Errorf("load active sources: query: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("load active sources: close rows: %w", closeErr)
		}
	}()

	for rows.Next() {
		var source Source
		if err := rows.Scan(&source.ID, &source.URL, &source.Title); err != nil {
			return nil, fmt.Errorf("load active sources: scan: %w", err)
		}
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load active sources: rows: %w", err)
	}
	return sources, nil
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
	itemFailures    []ingestItemFailure
}

type ingestSourceOptions struct {
	attemptExistingItems bool
}

type ingestItemFailure struct {
	itemID  string
	message string
}

func ingestSource(ctx context.Context, db *sql.DB, cfg IngestConfig, source Source) (ingestSourceResult, error) {
	return ingestSourceWithOptions(ctx, db, cfg, source, ingestSourceOptions{})
}

func ingestSourceWithOptions(ctx context.Context, db *sql.DB, cfg IngestConfig, source Source, opts ingestSourceOptions) (ingestSourceResult, error) {
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
	return processSourceItems(ctx, db, cfg, effectiveSource, itemsToProcess, len(feed.Items), language, activeSteeringRules, opts, result)
}

type ingestItemTask struct {
	entry    feedEntry
	existing bool
}

func processSourceItems(ctx context.Context, db *sql.DB, cfg IngestConfig, source Source, entries []feedEntry, totalItems int, language ProcessingLanguage, activeSteeringRules []string, opts ingestSourceOptions, result ingestSourceResult) (ingestSourceResult, error) {
	cfg = cfg.withLLMSemaphore(cfg.coordinatorConfig())
	processed := 0
	pending := make([]ingestItemTask, 0, len(entries))
	for _, entry := range entries {
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: processed, Total: totalItems}, "processing feed items")
		itemID := ingestedItemID(source, entry)
		exists, err := itemExists(ctx, db, itemID)
		if err != nil {
			return result, err
		}
		if exists && !opts.attemptExistingItems {
			processed++
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: processed, Total: totalItems}, "processed feed item")
			continue
		}
		pending = append(pending, ingestItemTask{entry: entry, existing: exists})
	}
	if len(pending) == 0 {
		return result, nil
	}

	slotCount := minInt(cfg.coordinatorConfig().ItemConcurrencyPerSource, len(pending))
	taskCh := make(chan ingestItemTask)
	var wg sync.WaitGroup
	var resultMu sync.Mutex
	var fatalErr error

	recordFatal := func(err error) {
		if err == nil {
			return
		}
		resultMu.Lock()
		if fatalErr == nil {
			fatalErr = err
		}
		resultMu.Unlock()
	}
	recordItemFailure := func(task ingestItemTask, err error) {
		if err == nil {
			return
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			recordFatal(err)
			return
		}
		resultMu.Lock()
		result.itemFailures = append(result.itemFailures, ingestItemFailure{itemID: ingestedItemID(source, task.entry), message: err.Error()})
		resultMu.Unlock()
	}
	recordDone := func(inserted bool) {
		resultMu.Lock()
		if inserted {
			result.itemsUpserted++
		}
		processed++
		current := processed
		resultMu.Unlock()
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: current, Total: totalItems}, "processed feed item")
	}

	for i := 0; i < slotCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range taskCh {
				item, err := buildItemWithActiveSteeringAndSemaphore(ctx, source, task.entry, cfg.LLM, language, activeSteeringRules, cfg.llmSemaphore)
				if err != nil {
					recordItemFailure(task, err)
					recordDone(false)
					continue
				}
				stored := false
				if task.existing {
					stored, err = updateExistingIngestedItemAttempt(ctx, db, item)
				} else {
					stored, err = upsertIngestedItem(ctx, db, item)
				}
				if err != nil {
					recordItemFailure(task, err)
					recordDone(false)
					continue
				}
				recordDone(stored)
			}
		}()
	}

sendLoop:
	for _, task := range pending {
		select {
		case <-ctx.Done():
			recordFatal(ctx.Err())
			break sendLoop
		case taskCh <- task:
		}
	}
	close(taskCh)
	wg.Wait()

	resultMu.Lock()
	defer resultMu.Unlock()
	return result, fatalErr
}

func appendItemProcessingErrors(errors []ManualFetchSourceError, sourceID string, failures []ingestItemFailure) []ManualFetchSourceError {
	if len(failures) == 0 {
		return errors
	}
	return append(errors, ManualFetchSourceError{SourceID: sourceID, Code: IngestErrorCodeItemProcessingError, Message: formatItemProcessingFailureMessage(failures)})
}

func formatItemProcessingFailureMessage(failures []ingestItemFailure) string {
	if len(failures) == 0 {
		return ""
	}
	const maxDetails = 3
	details := make([]string, 0, minInt(len(failures), maxDetails))
	for i, failure := range failures {
		if i >= maxDetails {
			break
		}
		message := strings.TrimSpace(failure.message)
		if message == "" {
			message = "item processing failed"
		}
		details = append(details, fmt.Sprintf("%s: %s", failure.itemID, message))
	}
	suffix := ""
	if remaining := len(failures) - len(details); remaining > 0 {
		suffix = fmt.Sprintf("; +%d more", remaining)
	}
	return fmt.Sprintf("%d item(s) failed during processing: %s%s", len(failures), strings.Join(details, "; "), suffix)
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
	err := retrySQLiteRead(ctx, func() error {
		return db.QueryRowContext(ctx, `select count(*) from items where source_id = ?`, sourceID).Scan(&count)
	})
	if err != nil {
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
	return buildItemWithActiveSteeringAndSemaphore(ctx, source, entry, llm, targetLanguage, activeSteeringRules, nil)
}

func buildItemWithActiveSteeringAndSemaphore(ctx context.Context, source Source, entry feedEntry, llm LLMClient, targetLanguage ProcessingLanguage, activeSteeringRules []string, llmSemaphore *ingestLLMSemaphore) (Item, error) {
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
	selection := selectNormalIngestSourceEvidence(ctx, entry.URL, entry.Description, generatedFallbackURL)
	item.ExtractionStatus = selection.extractionStatus
	item.ExtractionSource = selection.extractionSource
	item.SourceEvidenceText = selection.sourceEvidenceText
	if selection.extractionSource == extractionSourceLocalReadable {
		item.ExtractedText = nullableString(selection.text)
	}
	available := selection.text
	availableTextSource := selection.availableTextSource
	if !selection.ok() {
		item.ExtractionStatus = selection.extractionStatus
		if strings.TrimSpace(item.ExtractionStatus) == "" {
			item.ExtractionStatus = extractionStatusOriginalNA
		}
		item.ExtractionSource = extractionSourceNone
		item.SourceEvidenceText = nil
		item.ModelStatus = modelStatusSummaryNA
		if strings.TrimSpace(selection.failureStatus) != "" {
			item.ModelStatus = mapModelStatus(selection.failureStatus)
		}
		item.ContentStatus = item.ModelStatus
		setNormalAttemptFailureDiagnostics(&item, normalAttemptSelectionErrorCode(selection), "")
		sanitizeReadableItem(&item)
		return item, nil
	}
	if llm == nil {
		item.ModelStatus = modelStatusSummaryNA
		sanitizeReadableItem(&item)
		return item, nil
	}
	releaseLLM, err := llmSemaphore.acquire(ctx)
	if err != nil {
		return Item{}, fmt.Errorf("build item: acquire llm semaphore: %w", err)
	}
	out, err := llm.SummarizeItem(ctx, OpenRouterSummaryInput{ItemID: item.ID, Title: item.SourceItemTitle, SourceTitle: item.SourceTitle, URL: item.URL, AvailableTextSource: availableTextSource, AvailableText: available, TargetLanguage: targetLanguage, ActiveSteeringRules: activeSteeringRules})
	releaseLLM()
	if err != nil {
		item.ModelStatus = classifyModelFailureStatus(err, out.ModelStatus)
		item.ContentStatus = item.ModelStatus
		code := reprocessErrorCodeForModelStatus(item.ModelStatus)
		message := string(code)
		if code == ReprocessErrorDecodeError {
			message = safePromptValidationDiagnostic(err)
		}
		setNormalAttemptFailureDiagnostics(&item, code, message)
		sanitizeReadableItem(&item)
		return item, nil
	}
	compiled, compileErr := compilePromptingV21SummaryPrompt(OpenRouterSummaryInput{ItemID: item.ID, Title: item.SourceItemTitle, SourceTitle: item.SourceTitle, URL: item.URL, AvailableTextSource: availableTextSource, AvailableText: available, TargetLanguage: targetLanguage, ActiveSteeringRules: activeSteeringRules})
	if compileErr != nil {
		item.ModelStatus = modelStatusDecodeError
		item.ContentStatus = modelStatusDecodeError
		if item.ExtractionStatus == extractionStatusFull || item.ExtractionStatus == extractionStatusPartial {
			item.ExtractionStatus = extractionStatusSummaryNA
		}
		setNormalAttemptFailureDiagnostics(&item, ReprocessErrorDecodeError, safePromptValidationDiagnostic(compileErr))
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
		setNormalAttemptFailureDiagnostics(&item, ReprocessErrorDecodeError, safePromptValidationDiagnostic(err))
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
		setNormalAttemptFailureDiagnostics(&item, reprocessErrorCodeForModelStatus(item.ModelStatus), "")
	}
	sanitizeReadableItem(&item)
	return item, nil
}

func normalAttemptSelectionErrorCode(selection selectedSourceEvidence) ReprocessErrorCode {
	if selection.failureCode != "" {
		return selection.failureCode
	}
	if selection.unavailableCode != "" {
		return selection.unavailableCode
	}
	return ReprocessErrorOriginalUnavailable
}

func setNormalAttemptFailureDiagnostics(item *Item, code ReprocessErrorCode, message string) {
	if item == nil || code == "" {
		return
	}
	message = strings.TrimSpace(message)
	if message == "" {
		message = string(code)
	}
	now := time.Now().UTC()
	item.LastReprocessStatus = stringPtr("failed")
	item.LastReprocessErrorCode = stringPtr(string(code))
	item.LastReprocessErrorMessage = stringPtr(message)
	item.LastReprocessAt = timePtr(now)
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
	if strings.TrimSpace(cleaned) == "" || isUnusableReadablePayload(cleaned) || isLowInformationReadablePayload(cleaned) {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	return cleaned, extractionStatusFull
}

func itemExists(ctx context.Context, db *sql.DB, itemID string) (bool, error) {
	var exists int
	err := retrySQLiteRead(ctx, func() error {
		return db.QueryRowContext(ctx, `select 1 from items where id = ? limit 1`, itemID).Scan(&exists)
	})
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
	item.ExtractionSource = normalizeExtractionSource(item.ExtractionSource)
	if item.ExtractionSource == extractionSourceFeedExcerpt || item.ExtractionSource == extractionSourceNone {
		item.SourceEvidenceText = nil
	}
	keyPointsJSON, marshalErr := json.Marshal(item.KeyPoints)
	if marshalErr != nil {
		return false, fmt.Errorf("ingest item %q: marshal key points: %w", item.ID, marshalErr)
	}
	res, err := execSQLiteMutation(ctx, db, `insert into items (id, source_id, source_url, url, title, source_item_title, localized_title, summary, core_insight, key_points, value_tier, content_status, last_reprocess_status, last_reprocess_error_code, last_reprocess_error_message, last_reprocess_at, published_at, first_seen_at, extraction_status, extraction_source, source_evidence_text, model_status, feed_excerpt, extracted_text, canonical_url, story_key, duplicate_of_item_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do nothing`, item.ID, item.SourceID, item.Provenance.SourceURL, item.URL, item.Title, item.SourceItemTitle, item.LocalizedTitle, item.Summary, item.CoreInsight, string(keyPointsJSON), item.ValueTier, item.ContentStatus, item.LastReprocessStatus, item.LastReprocessErrorCode, item.LastReprocessErrorMessage, formatTimePtr(item.LastReprocessAt), formatTimePtr(item.PublishedAt), time.Now().UTC().Format(time.RFC3339), item.ExtractionStatus, item.ExtractionSource, item.SourceEvidenceText, item.ModelStatus, item.FeedExcerpt, item.ExtractedText, item.Provenance.CanonicalURL, item.StoryKey, item.DuplicateOfItemID)
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

func updateExistingIngestedItemAttempt(ctx context.Context, db *sql.DB, item Item) (bool, error) {
	sanitizeReadableItem(&item)
	item.ExtractionSource = normalizeExtractionSource(item.ExtractionSource)
	if item.ExtractionSource == extractionSourceFeedExcerpt || item.ExtractionSource == extractionSourceNone {
		item.SourceEvidenceText = nil
	}
	if item.ModelStatus != modelStatusOK || item.ContentStatus != modelStatusOK {
		if item.LastReprocessErrorCode == nil || strings.TrimSpace(*item.LastReprocessErrorCode) == "" {
			return false, nil
		}
		status := "failed"
		message := stringValue(item.LastReprocessErrorMessage)
		if strings.TrimSpace(message) == "" {
			message = stringValue(item.LastReprocessErrorCode)
		}
		attemptAt := time.Now().UTC().Format(time.RFC3339)
		if item.LastReprocessAt != nil {
			attemptAt = item.LastReprocessAt.UTC().Format(time.RFC3339)
		}
		_, err := execSQLiteMutation(ctx, db, `update items set last_reprocess_status = ?, last_reprocess_error_code = ?, last_reprocess_error_message = ?, last_reprocess_at = ? where id = ?`, status, stringValue(item.LastReprocessErrorCode), message, attemptAt, item.ID)
		if err != nil {
			return false, fmt.Errorf("ingest item %q: update latest-attempt diagnostics: %w", item.ID, err)
		}
		return false, nil
	}
	keyPointsJSON, marshalErr := json.Marshal(item.KeyPoints)
	if marshalErr != nil {
		return false, fmt.Errorf("ingest item %q: marshal key points for update: %w", item.ID, marshalErr)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("ingest item %q: begin update: %w", item.ID, err)
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(ctx, `update items set title = ?, source_item_title = ?, localized_title = ?, summary = ?, core_insight = ?, key_points = ?, value_tier = ?, content_status = ?, last_reprocess_status = null, last_reprocess_error_code = null, last_reprocess_error_message = null, last_reprocess_at = ?, published_at = coalesce(?, published_at), extraction_status = ?, extraction_source = ?, source_evidence_text = ?, model_status = ?, feed_excerpt = ?, extracted_text = ? where id = ?`, item.Title, item.SourceItemTitle, item.LocalizedTitle, item.Summary, item.CoreInsight, string(keyPointsJSON), item.ValueTier, item.ContentStatus, time.Now().UTC().Format(time.RFC3339), formatTimePtr(item.PublishedAt), item.ExtractionStatus, item.ExtractionSource, item.SourceEvidenceText, item.ModelStatus, item.FeedExcerpt, item.ExtractedText, item.ID)
	if err != nil {
		return false, fmt.Errorf("ingest item %q: update: %w", item.ID, err)
	}
	if err := refreshSearchIndexForItemTx(ctx, tx, item.ID); err != nil {
		return false, fmt.Errorf("ingest item %q: refresh search index after update: %w", item.ID, err)
	}
	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("ingest item %q: commit update: %w", item.ID, err)
	}
	return true, nil
}

func upsertSearchIndex(ctx context.Context, db *sql.DB, item Item) error {
	keyPointsJSON, marshalErr := json.Marshal(item.KeyPoints)
	if marshalErr != nil {
		return fmt.Errorf("refresh search index %q: marshal key points: %w", item.ID, marshalErr)
	}
	provenance := strings.Join([]string{item.Provenance.SourceURL, item.Provenance.OriginalURL, derefString(item.Provenance.CanonicalURL), derefString(item.StoryKey), derefString(item.DuplicateOfItemID)}, " ")
	_, err := execSQLiteMutation(ctx, db, `delete from search_fts where item_id = ?`, item.ID)
	if err != nil {
		return fmt.Errorf("refresh search index %q: delete old row: %w", item.ID, err)
	}
	_, err = execSQLiteMutation(ctx, db, `insert into search_fts (item_id, title, source_item_title, localized_title, source_title, feed_excerpt, summary, core_insight, key_points, extracted_text, provenance) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.ID, item.Title, item.SourceItemTitle, stringValue(item.LocalizedTitle), item.SourceTitle, stringValue(item.FeedExcerpt), stringValue(item.Summary)+" "+stringValue(item.ValueTier), stringValue(item.CoreInsight), string(keyPointsJSON), stringValue(item.ExtractedText), provenance+" "+stringValue(item.ValueTier))
	if err != nil {
		return fmt.Errorf("refresh search index %q: insert row: %w", item.ID, err)
	}
	return nil
}

func updateSourceFetch(ctx context.Context, db *sql.DB, sourceID string, status string, rawErr string, parsedTitle string) error {
	fetchedTitle := strings.TrimSpace(parsedTitle)
	if fetchedTitle == "" {
		_, err := execSQLiteMutation(ctx, db, `update sources set last_fetch_at = ?, last_fetch_status = ?, last_fetch_error = ?, revision = revision + 1 where id = ?`, time.Now().UTC().Format(time.RFC3339), status, nullableString(rawErr), sourceID)
		if err != nil {
			return fmt.Errorf("update source fetch %q: %w", sourceID, err)
		}
		return nil
	}
	_, err := execSQLiteMutation(ctx, db, `update sources set title = ?, last_fetch_at = ?, last_fetch_status = ?, last_fetch_error = ?, revision = revision + 1 where id = ?`, fetchedTitle, time.Now().UTC().Format(time.RFC3339), status, nullableString(rawErr), sourceID)
	if err != nil {
		return fmt.Errorf("update source fetch %q: %w", sourceID, err)
	}
	return nil
}

func execSQLiteMutation(ctx context.Context, db *sql.DB, query string, args ...any) (sql.Result, error) {
	sqliteMutationMu.Lock()
	defer sqliteMutationMu.Unlock()

	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		result, err := db.ExecContext(ctx, query, args...)
		if !isSQLiteContention(err) {
			return result, err
		}
		lastErr = err
		if err := waitSQLiteRetry(ctx, attempt); err != nil {
			return nil, err
		}
	}
	return nil, lastErr
}

func retrySQLiteRead(ctx context.Context, read func() error) error {
	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		err := read()
		if !isSQLiteContention(err) {
			return err
		}
		lastErr = err
		if err := waitSQLiteRetry(ctx, attempt); err != nil {
			return err
		}
	}
	return lastErr
}

func waitSQLiteRetry(ctx context.Context, attempt int) error {
	wait := time.NewTimer(time.Duration(attempt+1) * 10 * time.Millisecond)
	select {
	case <-ctx.Done():
		if !wait.Stop() {
			<-wait.C
		}
		return ctx.Err()
	case <-wait.C:
		return nil
	}
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
	return cleanReadableHTMLFragmentText(readableHTMLFragment(value))
}

func cleanReadableHTMLFragmentText(value string) string {
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

type readableFragmentCandidate struct {
	fragment string
	priority int
}

func readableHTMLFragment(value string) string {
	candidates := make([]readableFragmentCandidate, 0, 8)
	appendMatches := func(pattern *regexp.Regexp, priority int) {
		for _, match := range pattern.FindAllStringSubmatch(value, -1) {
			if len(match) == 2 && strings.TrimSpace(match[1]) != "" {
				candidates = append(candidates, readableFragmentCandidate{fragment: match[1], priority: priority})
			}
		}
	}
	appendMatches(articleTagRE, 500)
	appendMatches(articleBodyItempropRE, 450)
	appendMatches(mainTagRE, 350)
	appendMatches(contentContainerRE, 250)
	appendMatches(bodyTagRE, 0)
	candidates = append(candidates, readableFragmentCandidate{fragment: value, priority: -100})

	best := value
	bestScore := readableFragmentScore(value, -100)
	for _, candidate := range candidates {
		score := readableFragmentScore(candidate.fragment, candidate.priority)
		if score > bestScore {
			best = candidate.fragment
			bestScore = score
		}
	}
	return best
}

func readableFragmentScore(fragment string, priority int) int {
	text := cleanReadableHTMLFragmentText(fragment)
	cleaned, _ := sanitizeReadablePayloadText(text)
	words := strings.Fields(cleaned)
	if len(words) == 0 || isUnusableReadablePayload(cleaned) {
		return -10000 + priority
	}
	lineCount := 0
	for _, line := range strings.Split(cleaned, "\n") {
		if strings.TrimSpace(line) != "" {
			lineCount++
		}
	}
	score := len(words)*10 + lineCount*3 + priority
	if len(words) < 12 {
		score -= 1000
	}
	return score
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
