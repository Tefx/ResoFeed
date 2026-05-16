package resofeed

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const reprocessLibraryTimeout = 10 * time.Minute

// ReprocessLibrary rewrites existing user-readable item fields into the current
// runtime processing language and rebuilds FTS at the end. It is intentionally a
// one-time operation with no durable coordination artifacts.
func ReprocessLibrary(ctx context.Context, db *sql.DB, llm LLMClient, req ReprocessLibraryRequest) (ret ReprocessLibraryResponse, retErr error) {
	if err := validateMutationRequestFields(req.MutationRequestFields); err != nil {
		return ReprocessLibraryResponse{}, err
	}
	release, err := tryAcquireIngestGuard(ctx, "reprocess", "library")
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	updateCurrentOperation("preparing", nil, "library reprocess preparing")
	defer releaseGuardRecover(release, &retErr, "reprocess library")

	var response ReprocessLibraryResponse
	applied, err := withIdempotencyReceipt(ctx, db, req.IdempotencyKey, req.ActorID, "reprocess_library", "", reprocessFingerprintPayload(req), &response, func() (ReprocessLibraryResponse, error) {
		return reprocessLibraryUnlocked(ctx, db, llm)
	})
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	if applied {
		response.AlreadyApplied = true
	}
	return response, nil
}

func reprocessLibraryFresh(ctx context.Context, db *sql.DB, llm LLMClient) (ret ReprocessLibraryResponse, retErr error) {
	release, err := tryAcquireIngestGuard(ctx, "reprocess", "library")
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	updateCurrentOperation("preparing", nil, "library reprocess preparing")
	defer releaseGuardRecover(release, &retErr, "reprocess library")

	return reprocessLibraryUnlocked(ctx, db, llm)
}

func reprocessLibraryUnlocked(ctx context.Context, db *sql.DB, llm LLMClient) (ReprocessLibraryResponse, error) {
	if db == nil {
		return ReprocessLibraryResponse{}, errors.New("reprocess library: db required")
	}
	language, err := readProcessingLanguage(ctx, db)
	if err != nil {
		return ReprocessLibraryResponse{}, fmt.Errorf("reprocess library: read processing language: %w", err)
	}
	started := time.Now().UTC()
	result := ReprocessLibraryResult{Status: ReprocessStatusCompleted, Language: language, StartedAt: started, Errors: []ReprocessErrorDetail{}}

	if err := setSearchFTSStaleSince(ctx, db, started); err != nil {
		return ReprocessLibraryResponse{}, fmt.Errorf("reprocess library: set stale FTS marker: %w", err)
	}

	runCtx, cancel := context.WithTimeout(ctx, reprocessLibraryTimeout)
	defer cancel()

	items, err := loadReprocessItems(runCtx, db)
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	updateCurrentOperation("processing_items", &CurrentOperationCount{Current: 0, Total: len(items)}, "library reprocess processing items")
	for index, item := range items {
		if err := runCtx.Err(); err != nil {
			result.Status = ReprocessStatusFailed
			appendReprocessError(&result, nil, ReprocessErrorTimeout, "operation timed out")
			result.CompletedAt = time.Now().UTC()
			return ReprocessLibraryResponse{Reprocess: result}, nil
		}
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: index, Total: len(items)}, "library reprocess processing item")
		result.ItemsAttempted++
		outcome, err := processReprocessItem(runCtx, item, llm, language)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
				outcome = failedReprocessOutcome(fallbackReprocessSourceURL(item), ReprocessErrorTimeout, "item processing timed out")
				if storeErr := storeReprocessItem(context.WithoutCancel(ctx), db, item.id, outcome); storeErr != nil {
					return ReprocessLibraryResponse{}, storeErr
				}
				result.ItemsFailed++
				appendReprocessError(&result, &item.id, ReprocessErrorTimeout, "item processing timed out")
				continue
			}
			result.ItemsFailed++
			appendReprocessError(&result, &item.id, ReprocessErrorRSSFetchError, err.Error())
			continue
		}
		if err := storeReprocessItem(runCtx, db, item.id, outcome); err != nil {
			return ReprocessLibraryResponse{}, err
		}
		if outcome.failed {
			result.ItemsFailed++
			appendReprocessError(&result, &item.id, outcome.errorCode, outcome.errorMessage)
			continue
		}
		if outcome.unavailable {
			result.ItemsUnavailable++
			appendReprocessError(&result, &item.id, outcome.errorCode, outcome.errorMessage)
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: index + 1, Total: len(items)}, "library reprocess item unavailable")
			continue
		}
		result.ItemsUpdated++
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: index + 1, Total: len(items)}, "library reprocess item processed")
	}

	if err := runCtx.Err(); err != nil {
		result.Status = ReprocessStatusFailed
		appendReprocessError(&result, nil, ReprocessErrorTimeout, "operation timed out")
		result.CompletedAt = time.Now().UTC()
		return ReprocessLibraryResponse{Reprocess: result}, nil
	}
	updateCurrentOperation("rebuilding_search", &CurrentOperationCount{Current: len(items), Total: len(items)}, "library reprocess rebuilding search index")
	indexed, err := rebuildSearchIndexAndClearStale(runCtx, db)
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	result.ItemsIndexed = indexed
	result.FTSRebuilt = true
	result.CompletedAt = time.Now().UTC()
	if result.ItemsFailed > 0 || result.ItemsUnavailable > 0 {
		result.Status = ReprocessStatusCompletedWithErrors
	}
	updateCurrentOperation("complete", &CurrentOperationCount{Current: len(items), Total: len(items)}, "library reprocess complete")
	return ReprocessLibraryResponse{Reprocess: result}, nil
}

type reprocessItem struct {
	id           string
	sourceTitle  string
	url          string
	canonicalURL sql.NullString
}

type reprocessItemOutcome struct {
	title         string
	summary       *string
	coreInsight   *string
	feedExcerpt   *string
	extractedText *string
	valueTier     *string
	extractStatus string
	modelStatus   string
	unavailable   bool
	failed        bool
	errorCode     ReprocessErrorCode
	errorMessage  string
}

func loadReprocessItems(ctx context.Context, db *sql.DB) ([]reprocessItem, error) {
	rows, err := db.QueryContext(ctx, `select i.id, coalesce(s.title, ''), i.url, i.canonical_url from items i join sources s on s.id = i.source_id where s.is_active = 1 order by i.id`)
	if err != nil {
		return nil, fmt.Errorf("reprocess library: query items: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := []reprocessItem{}
	for rows.Next() {
		var item reprocessItem
		if err := rows.Scan(&item.id, &item.sourceTitle, &item.url, &item.canonicalURL); err != nil {
			return nil, fmt.Errorf("reprocess library: scan item: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reprocess library: iterate items: %w", err)
	}
	return items, nil
}

func processReprocessItem(ctx context.Context, item reprocessItem, llm LLMClient, language ProcessingLanguage) (reprocessItemOutcome, error) {
	sourceURL, sourceText, err := fetchReprocessSourceText(ctx, item)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return reprocessItemOutcome{}, err
		}
		return unavailableReprocessOutcome(item.url, ReprocessErrorOriginalUnavailable, "original unavailable"), nil
	}
	if llm == nil {
		return unavailableReprocessOutcome(sourceURL, ReprocessErrorSummaryUnavailable, "summary unavailable"), nil
	}
	out, err := llm.SummarizeItem(ctx, OpenRouterSummaryInput{ItemID: item.id, Title: sourceURL, SourceTitle: item.sourceTitle, URL: sourceURL, AvailableText: sourceText, TargetLanguage: language})
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return reprocessItemOutcome{}, err
		}
		return failedReprocessOutcome(sourceURL, ReprocessErrorModelLatencyError, "model latency error"), nil
	}
	modelStatus := mapModelStatus(out.ModelStatus)
	if modelStatus != modelStatusOK {
		code := ReprocessErrorSummaryUnavailable
		if modelStatus == modelStatusLatencyError {
			code = ReprocessErrorModelLatencyError
		}
		return unavailableReprocessOutcome(sourceURL, code, string(code)), nil
	}
	title := strings.TrimSpace(out.Title)
	if title == "" {
		title = fallbackReprocessTitle(sourceURL)
	}
	result := reprocessItemOutcome{title: title, summary: nullableString(out.Summary), coreInsight: nullableString(out.CoreInsight), feedExcerpt: nullableString(out.FeedExcerpt), extractedText: nullableString(out.ExtractedText), valueTier: nullableString(out.ValueTier), extractStatus: extractionStatusFull, modelStatus: modelStatusOK}
	if result.extractedText == nil {
		result.extractedText = nullableString(sourceText)
	}
	itemForSanitize := Item{Title: result.title, Summary: result.summary, CoreInsight: result.coreInsight, FeedExcerpt: result.feedExcerpt, ExtractedText: result.extractedText, ValueTier: result.valueTier, ExtractionStatus: result.extractStatus, ModelStatus: result.modelStatus}
	sanitizeReadableItem(&itemForSanitize)
	result.title = itemForSanitize.Title
	result.summary = itemForSanitize.Summary
	result.coreInsight = itemForSanitize.CoreInsight
	result.feedExcerpt = itemForSanitize.FeedExcerpt
	result.extractedText = itemForSanitize.ExtractedText
	result.valueTier = itemForSanitize.ValueTier
	return result, nil
}

func fetchReprocessSourceText(ctx context.Context, item reprocessItem) (string, string, error) {
	for _, candidate := range reprocessCandidateURLs(item) {
		text, err := fetchArticleReadableText(ctx, candidate)
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return "", "", err
		}
		if err != nil {
			continue
		}
		return candidate, text, nil
	}
	return "", "", errors.New("no reprocess source text available")
}

func reprocessCandidateURLs(item reprocessItem) []string {
	candidates := []string{}
	if item.canonicalURL.Valid && isHTTPArticleURL(item.canonicalURL.String) {
		candidates = append(candidates, strings.TrimSpace(item.canonicalURL.String))
	}
	if isHTTPArticleURL(item.url) {
		trimmed := strings.TrimSpace(item.url)
		if len(candidates) == 0 || candidates[len(candidates)-1] != trimmed {
			candidates = append(candidates, trimmed)
		}
	}
	return candidates
}

func fallbackReprocessSourceURL(item reprocessItem) string {
	candidates := reprocessCandidateURLs(item)
	if len(candidates) > 0 {
		return candidates[0]
	}
	return item.url
}

func isHTTPArticleURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return false
	}
	return parsed.Scheme == "http" || parsed.Scheme == "https"
}

func fetchArticleReadableText(ctx context.Context, articleURL string) (text string, retErr error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, articleURL, nil)
	if err != nil {
		return "", fmt.Errorf("reprocess fetch: create request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("reprocess fetch: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("reprocess fetch: close body: %w", closeErr)
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", fmt.Errorf("reprocess fetch: status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", fmt.Errorf("reprocess fetch: read body: %w", err)
	}
	text = textFromHTML(string(body))
	text, _ = sanitizeReadablePayloadText(text)
	if strings.TrimSpace(text) == "" {
		return "", errors.New("reprocess fetch: empty article text")
	}
	return text, nil
}

func unavailableReprocessOutcome(rawURL string, code ReprocessErrorCode, message string) reprocessItemOutcome {
	return reprocessItemOutcome{title: fallbackReprocessTitle(rawURL), extractStatus: extractionStatusOriginalNA, modelStatus: modelStatusSummaryNA, unavailable: true, errorCode: code, errorMessage: message}
}

func failedReprocessOutcome(rawURL string, code ReprocessErrorCode, message string) reprocessItemOutcome {
	return reprocessItemOutcome{title: fallbackReprocessTitle(rawURL), extractStatus: extractionStatusOriginalNA, modelStatus: modelStatusLatencyError, failed: true, errorCode: code, errorMessage: message}
}

func fallbackReprocessTitle(rawURL string) string {
	if strings.TrimSpace(rawURL) != "" {
		return strings.TrimSpace(rawURL)
	}
	return "Untitled"
}

func storeReprocessItem(ctx context.Context, db *sql.DB, itemID string, outcome reprocessItemOutcome) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("reprocess item %q: begin transaction: %w", itemID, err)
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(ctx, `update items set title = ?, summary = ?, core_insight = ?, feed_excerpt = ?, extracted_text = ?, value_tier = ?, extraction_status = ?, model_status = ? where id = ?`, outcome.title, outcome.summary, outcome.coreInsight, outcome.feedExcerpt, outcome.extractedText, outcome.valueTier, outcome.extractStatus, outcome.modelStatus, itemID)
	if err != nil {
		return fmt.Errorf("reprocess item %q: update: %w", itemID, err)
	}
	if err := refreshSearchIndexForItemTx(ctx, tx, itemID); err != nil {
		return fmt.Errorf("reprocess item %q: refresh FTS: %w", itemID, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("reprocess item %q: commit: %w", itemID, err)
	}
	return nil
}

func refreshSearchIndexForItemTx(ctx context.Context, tx *sql.Tx, itemID string) error {
	if _, err := tx.ExecContext(ctx, `delete from search_fts where item_id = ?`, itemID); err != nil {
		return fmt.Errorf("clear search index row: %w", err)
	}
	_, err := tx.ExecContext(ctx, `
insert into search_fts (item_id, title, source_title, feed_excerpt, summary, core_insight, extracted_text, provenance)
select i.id, i.title, coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, '') || ' ' || coalesce(i.value_tier, ''), coalesce(i.core_insight, ''), coalesce(i.extracted_text, ''),
       coalesce(i.source_url, s.url, '') || ' ' || coalesce(i.url, '') || ' ' || coalesce(i.canonical_url, '') || ' ' || coalesce(i.story_key, '') || ' ' || coalesce(i.duplicate_of_item_id, '') || ' ' || coalesce(i.value_tier, '')
from items i
left join sources s on s.id = i.source_id
where i.id = ?`, itemID)
	if err != nil {
		return fmt.Errorf("populate search index row: %w", err)
	}
	return nil
}

func rebuildSearchIndexAndClearStale(ctx context.Context, db *sql.DB) (int, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("reprocess library: begin FTS rebuild: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := rebuildSearchIndexTx(ctx, tx); err != nil {
		return 0, err
	}
	var indexed int
	if err := tx.QueryRowContext(ctx, `select count(*) from search_fts`).Scan(&indexed); err != nil {
		return 0, fmt.Errorf("reprocess library: count rebuilt FTS rows: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `delete from runtime_metadata where key = ?`, RuntimeMetadataKeySearchFTSStaleSince); err != nil {
		return 0, fmt.Errorf("reprocess library: clear stale FTS marker: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("reprocess library: commit FTS rebuild: %w", err)
	}
	return indexed, nil
}

func appendReprocessError(result *ReprocessLibraryResult, itemID *string, code ReprocessErrorCode, message string) {
	if result == nil || len(result.Errors) >= 50 {
		return
	}
	message = strings.TrimSpace(message)
	if len(message) > 200 {
		message = message[:200]
	}
	if message == "" {
		message = string(code)
	}
	result.Errors = append(result.Errors, ReprocessErrorDetail{ItemID: itemID, Code: code, Message: message})
}

func validateMutationRequestFields(fields MutationRequestFields) error {
	if fields.ActorKind != ActorKindHuman && fields.ActorKind != ActorKindAgent {
		return fieldError("actor_kind")
	}
	if fields.ActorID == "" || len([]byte(fields.ActorID)) > 128 {
		return fieldError("actor_id")
	}
	if fields.IdempotencyKey == "" || len([]byte(fields.IdempotencyKey)) > 200 {
		return fieldError("idempotency_key")
	}
	return nil
}

func reprocessFingerprintPayload(req ReprocessLibraryRequest) struct {
	ActorKind ActorKind `json:"actor_kind"`
	ActorID   string    `json:"actor_id"`
} {
	return struct {
		ActorKind ActorKind `json:"actor_kind"`
		ActorID   string    `json:"actor_id"`
	}{ActorKind: req.ActorKind, ActorID: req.ActorID}
}
