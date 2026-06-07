package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const ItemReingestHTTPPathPrefix = "/api/items/"

const ItemReingestHTTPPathSuffix = "/reingest"

// ReprocessLibrary rewrites existing user-readable item fields into the current
// runtime processing language and rebuilds FTS at the end. It is intentionally a
// one-time operation with no durable coordination artifacts.
func ReprocessLibrary(ctx context.Context, db *sql.DB, llm LLMClient, req ReprocessLibraryRequest) (ret ReprocessLibraryResponse, retErr error) {
	if err := validateMutationRequestFields(req.MutationRequestFields); err != nil {
		return ReprocessLibraryResponse{}, err
	}
	release, err := tryAcquireIngestGuardWithActor(ctx, "reprocess", "library", string(req.ActorKind))
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

// ReingestItem is a contract-only declaration for the Inspector selected-item
// re-ingest operation. The future implementation must re-fetch/reprocess exactly
// one item in the current processing language, refresh that item's FTS row, use
// idempotency receipts, and share the same guard/current-operation semantics as
// ingest/fetch/library reprocess without creating durable jobs or history.
func ReingestItem(ctx context.Context, db *sql.DB, llm LLMClient, itemID string, req ItemReingestRequest) (ItemReingestResponse, error) {
	if err := ctx.Err(); err != nil {
		return ItemReingestResponse{}, fmt.Errorf("reingest item: %w", err)
	}
	if db == nil {
		return ItemReingestResponse{}, errors.New("reingest item: db required")
	}
	itemID = strings.TrimSpace(itemID)
	if itemID == "" || strings.Contains(itemID, "/") {
		return ItemReingestResponse{}, fieldError("item_id")
	}
	if err := validateItemReingestRequest(req); err != nil {
		return ItemReingestResponse{}, err
	}
	release, err := tryAcquireIngestGuardWithActor(ctx, "item_reingest", itemID, string(req.ActorKind))
	if err != nil {
		return ItemReingestResponse{}, err
	}
	updateCurrentOperation("loading_item", &CurrentOperationCount{Current: 0, Total: 1}, "item reingest loading selected item")
	var retErr error
	defer releaseGuardRecover(release, &retErr, "reingest item")

	var response ItemReingestResponse
	applied, err := withIdempotencyReceiptFinalContext(ctx, db, req.IdempotencyKey, req.ActorID, "reingest_item", itemID, itemReingestFingerprintPayload(req), &response, func() (ItemReingestResponse, error) {
		return reingestItemUnlocked(ctx, db, llm, itemID, req)
	}, func() (context.Context, context.CancelFunc) {
		return context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	})
	if err != nil {
		return ItemReingestResponse{}, err
	}
	if applied {
		response.AlreadyApplied = true
	}
	return response, retErr
}

// ReingestItemForMCP maps the MCP contract shape onto the shared selected-item
// re-ingest declaration. It is intentionally a thin parity boundary.
func ReingestItemForMCP(ctx context.Context, db *sql.DB, llm LLMClient, input MCPReingestItemInput) (ItemReingestResponse, error) {
	req, err := itemReingestRequestFromInputs(MutationRequestFields{ActorKind: ActorKindAgent, ActorID: input.ActorID, IdempotencyKey: input.IdempotencyKey}, input.Model, input.Prompt, input.ExtraPrompt)
	if err != nil {
		return ItemReingestResponse{}, err
	}
	return ReingestItem(ctx, db, llm, input.ItemID, req)
}

func itemReingestRequestFromInputs(fields MutationRequestFields, model *string, prompt *string, extraPrompt *string) (ItemReingestRequest, error) {
	normalizedPrompt, err := normalizeItemReingestPromptInput("prompt", prompt)
	if err != nil {
		return ItemReingestRequest{}, err
	}
	normalizedExtraPrompt, err := normalizeItemReingestPromptInput("extra_prompt", extraPrompt)
	if err != nil {
		return ItemReingestRequest{}, err
	}
	if normalizedPrompt != nil && normalizedExtraPrompt != nil && *normalizedPrompt != *normalizedExtraPrompt {
		return ItemReingestRequest{}, fieldError("prompt")
	}
	if normalizedPrompt == nil {
		normalizedPrompt = normalizedExtraPrompt
	}
	return ItemReingestRequest{Model: normalizedOptionalString(model), Prompt: normalizedPrompt, MutationRequestFields: fields}, nil
}

func validateItemReingestRequest(req ItemReingestRequest) error {
	if err := validateMutationRequestFields(req.MutationRequestFields); err != nil {
		return err
	}
	if req.Model != nil {
		if _, err := normalizeItemReingestModel(*req.Model); err != nil {
			return fieldError("model")
		}
	}
	if req.Prompt != nil && len([]byte(strings.TrimSpace(*req.Prompt))) > 4000 {
		return fieldError("prompt")
	}
	if _, err := normalizeItemReingestPromptInput("prompt", req.Prompt); err != nil {
		return err
	}
	return nil
}

func normalizeItemReingestPromptInput(field string, value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}
	if len([]byte(trimmed)) > 4000 {
		return nil, fieldError(field)
	}
	for _, r := range trimmed {
		if r == 0 || (r < 0x20 && r != '\t' && r != '\n' && r != '\r') {
			return nil, fieldError(field)
		}
	}
	return &trimmed, nil
}

func normalizeItemReingestModel(model string) (string, error) {
	trimmed := strings.TrimSpace(model)
	if trimmed == "" || trimmed == "account_default" {
		return "", nil
	}
	if len([]byte(trimmed)) > 200 {
		return "", fieldError("model")
	}
	for _, r := range trimmed {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '.' || r == '_' || r == '-' || r == '/' || r == ':':
		default:
			return "", fieldError("model")
		}
	}
	return trimmed, nil
}

func itemReingestFingerprintPayload(req ItemReingestRequest) struct {
	ActorKind ActorKind `json:"actor_kind"`
	ActorID   string    `json:"actor_id"`
	Model     string    `json:"model,omitempty"`
	Prompt    string    `json:"prompt,omitempty"`
} {
	var model, prompt string
	if req.Model != nil {
		model, _ = normalizeItemReingestModel(*req.Model)
	}
	if req.Prompt != nil {
		prompt = strings.TrimSpace(*req.Prompt)
	}
	return struct {
		ActorKind ActorKind `json:"actor_kind"`
		ActorID   string    `json:"actor_id"`
		Model     string    `json:"model,omitempty"`
		Prompt    string    `json:"prompt,omitempty"`
	}{ActorKind: req.ActorKind, ActorID: req.ActorID, Model: model, Prompt: prompt}
}

func reingestItemUnlocked(ctx context.Context, db *sql.DB, llm LLMClient, itemID string, req ItemReingestRequest) (ItemReingestResponse, error) {
	language, err := readProcessingLanguage(ctx, db)
	if err != nil {
		return ItemReingestResponse{}, fmt.Errorf("reingest item: read processing language: %w", err)
	}
	activeRules, err := loadActiveSteerRules(ctx, db)
	if err != nil {
		return ItemReingestResponse{}, fmt.Errorf("reingest item: load active steering rules: %w", err)
	}
	item, err := loadReprocessItem(ctx, db, itemID)
	if err != nil {
		return ItemReingestResponse{}, err
	}
	updateCurrentOperation("processing_items", &CurrentOperationCount{Current: 0, Total: 1}, "item reingest processing selected item")
	outcome, err := processReprocessItemWithRequest(ctx, item, llm, language, req, compileActiveSteeringRulesForPrompt(activeRules), true)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			outcome = failedReprocessOutcome(fallbackReprocessSourceURL(item), ReprocessErrorTimeout, "item processing timed out", modelStatusTimeout)
			writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			if storeErr := storeReprocessItem(writeCtx, db, itemID, outcome); storeErr != nil {
				return ItemReingestResponse{}, storeErr
			}
			result := itemReingestErrorResult(itemID, language, ReprocessErrorTimeout, "item processing timed out")
			result.ItemUpdated = true
			detail, detailErr := ReadItemDetail(writeCtx, db, itemID)
			if detailErr != nil {
				return ItemReingestResponse{}, detailErr
			}
			result.Item = &detail
			return ItemReingestResponse{Reingest: result}, nil
		}
		return ItemReingestResponse{}, err
	}
	result := ItemReingestResult{ItemID: itemID, Status: ReprocessStatusCompleted, Language: language}
	if outcome.failed || outcome.unavailable || !outcome.writable() {
		result.Status = ReprocessStatusCompletedWithErrors
		code := outcome.errorCode
		if code == "" {
			code = ReprocessErrorSummaryUnavailable
		}
		message := outcome.errorMessage
		if strings.TrimSpace(message) == "" {
			message = string(code)
		}
		result.Error = &ReprocessErrorDetail{ItemID: &itemID, Code: code, Message: message}
	}
	writeCtx, cancelWrite := reingestNonDestructiveWriteContext(ctx, outcome)
	defer cancelWrite()
	if outcome.writable() || outcome.unavailable || outcome.storableFailure() {
		if err := storeReprocessItem(writeCtx, db, itemID, outcome); err != nil {
			return ItemReingestResponse{}, err
		}
		result.ItemUpdated = !outcome.preserveExisting
		result.FTSUpdated = outcome.writable()
	}
	if result.ItemUpdated || result.Status == ReprocessStatusCompletedWithErrors {
		detail, err := ReadItemDetail(writeCtx, db, itemID)
		if err != nil {
			return ItemReingestResponse{}, err
		}
		result.Item = &detail
	}
	updateCurrentOperation("complete", &CurrentOperationCount{Current: 1, Total: 1}, "item reingest complete")
	return ItemReingestResponse{Reingest: result}, nil
}

func itemReingestErrorResult(itemID string, language ProcessingLanguage, code ReprocessErrorCode, message string) ItemReingestResult {
	return ItemReingestResult{ItemID: itemID, Status: ReprocessStatusFailed, Language: language, Error: &ReprocessErrorDetail{ItemID: &itemID, Code: code, Message: message}}
}

func reingestNonDestructiveWriteContext(ctx context.Context, outcome reprocessItemOutcome) (context.Context, context.CancelFunc) {
	if ctx.Err() == nil || outcome.writable() {
		return ctx, func() {}
	}
	return context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
}

func loadReprocessItem(ctx context.Context, db *sql.DB, itemID string) (reprocessItem, error) {
	row := db.QueryRowContext(ctx, `select i.id, coalesce(s.title, ''), coalesce(i.source_item_title, ''), i.title, i.url, i.canonical_url, i.feed_excerpt, i.extracted_text, i.extraction_source, i.source_evidence_text from items i left join sources s on s.id = i.source_id where i.id = ?`, itemID)
	var item reprocessItem
	if err := row.Scan(&item.id, &item.sourceTitle, &item.sourceItemTitle, &item.title, &item.url, &item.canonicalURL, &item.feedExcerpt, &item.extractedText, &item.extractionSource, &item.sourceEvidenceText); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return reprocessItem{}, notFoundError("item", itemID)
		}
		return reprocessItem{}, fmt.Errorf("reingest item: load selected item: %w", err)
	}
	return item, nil
}

func processReprocessItemWithRequest(ctx context.Context, item reprocessItem, llm LLMClient, language ProcessingLanguage, req ItemReingestRequest, activeSteeringRules []string, sourceTimeoutAsOutcome bool) (reprocessItemOutcome, error) {
	var selection selectedSourceEvidence
	var err error
	if sourceTimeoutAsOutcome {
		selection, err = selectSelectedReingestSourceEvidence(ctx, item)
	} else {
		selection, err = selectLibraryReprocessSourceEvidence(ctx, item)
	}
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			if sourceTimeoutAsOutcome {
				return failedReprocessOutcome(fallbackReprocessSourceURL(item), ReprocessErrorTimeout, "item processing timed out", modelStatusTimeout), nil
			}
			return reprocessItemOutcome{}, err
		}
		return reprocessItemOutcome{}, err
	}
	if selection.failureCode != "" {
		outcome := failedReprocessOutcome(selection.url, selection.failureCode, string(selection.failureCode), selection.failureStatus)
		outcome.preserveExisting = sourceTimeoutAsOutcome
		return outcome, nil
	}
	if selection.unavailableCode != "" || !selection.ok() {
		code := selection.unavailableCode
		if code == "" {
			code = ReprocessErrorOriginalUnavailable
		}
		outcome := unavailableReprocessOutcome(selection.url, code, "original unavailable")
		outcome.preserveExisting = sourceTimeoutAsOutcome
		return outcome, nil
	}
	sourceURL, sourceText, availableTextSource := selection.url, selection.text, selection.availableTextSource
	if llm == nil {
		return unavailableReprocessOutcome(sourceURL, ReprocessErrorSummaryUnavailable, "summary unavailable"), nil
	}
	input := OpenRouterSummaryInput{ItemID: item.id, Title: reprocessInputTitle(item), SourceTitle: item.sourceTitle, URL: sourceURL, AvailableTextSource: availableTextSource, AvailableText: sourceText, TargetLanguage: language, ActiveSteeringRules: activeSteeringRules}
	if req.Model != nil {
		model, err := normalizeItemReingestModel(*req.Model)
		if err != nil {
			return reprocessItemOutcome{}, err
		}
		input.Model = model
	}
	if req.Prompt != nil {
		input.Prompt = strings.TrimSpace(*req.Prompt)
	}
	compiled, err := compilePromptingV21SummaryPrompt(input)
	if err != nil {
		return reprocessItemOutcome{}, fmt.Errorf("reprocess item: compile v2.1 prompt context: %w", err)
	}
	out, err := llm.SummarizeItem(ctx, input)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return reprocessItemOutcome{}, err
		}
		status := classifyModelFailureStatus(err, out.ModelStatus)
		code := reprocessErrorCodeForModelStatus(status)
		errorMessage := string(code)
		if code == ReprocessErrorDecodeError {
			if diagnostic := safePromptValidationDiagnostic(err); diagnostic != string(ReprocessErrorDecodeError) {
				errorMessage = diagnostic
			}
		}
		return failedReprocessOutcome(sourceURL, code, errorMessage, status), nil
	}
	validationOut := out
	if isUnusableReprocessOutputTitle(validationOut.Title) {
		validationOut.Title = reprocessInputTitle(item)
	}
	out, err = validateSummaryOutputForPersistenceWithPrompt(validationOut, compiled.UserPayload.Item)
	if err != nil {
		return failedReprocessOutcome(sourceURL, ReprocessErrorDecodeError, safePromptValidationDiagnostic(err), modelStatusDecodeError), nil
	}
	modelStatus := mapModelStatus(out.ModelStatus)
	if modelStatus != modelStatusOK {
		code := reprocessErrorCodeForModelStatus(modelStatus)
		return unavailableReprocessOutcome(sourceURL, code, string(code)), nil
	}
	title := strings.TrimSpace(generatedTitle(out))
	if isUnusableReprocessOutputTitle(title) {
		title = reprocessInputTitle(item)
	}
	result := reprocessItemOutcome{title: title, localizedTitle: nullableString(generatedTitle(out)), keyPoints: out.KeyPoints, summary: nullableString(out.Summary), coreInsight: nullableString(out.CoreInsight), feedExcerpt: sourceEvidenceString(out.FeedExcerpt, item.feedExcerpt, availableTextSource == availableTextSourceRSSExcerpt, sourceText), extractedText: sourceEvidenceString(out.ExtractedText, item.extractedText, availableTextSource == availableTextSourceFreshFull || availableTextSource == availableTextSourceStoredExtracted || availableTextSource == availableTextSourceExternalTavily, sourceText), valueTier: nullableString(out.ValueTier), extractStatus: selection.extractionStatus, extractionSource: selection.extractionSource, sourceEvidenceText: selection.sourceEvidenceText, modelStatus: modelStatusOK}
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
	activeRules, err := loadActiveSteerRules(ctx, db)
	if err != nil {
		return ReprocessLibraryResponse{}, fmt.Errorf("reprocess library: load active steering rules: %w", err)
	}
	activeSteeringRules := compileActiveSteeringRulesForPrompt(activeRules)
	started := time.Now().UTC()
	result := ReprocessLibraryResult{Status: ReprocessStatusCompleted, Language: language, StartedAt: started, Errors: []ReprocessErrorDetail{}}

	if err := setSearchFTSStaleSince(ctx, db, started); err != nil {
		return ReprocessLibraryResponse{}, fmt.Errorf("reprocess library: set stale FTS marker: %w", err)
	}

	items, err := loadReprocessItems(ctx, db)
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	updateCurrentOperation("processing_items", &CurrentOperationCount{Current: 0, Total: len(items)}, "library reprocess processing items")
	if err := processReprocessLibraryItems(ctx, db, llm, language, activeSteeringRules, items, &result); err != nil {
		return ReprocessLibraryResponse{}, err
	}
	if err := ctx.Err(); err != nil {
		result.Status = ReprocessStatusFailed
		appendReprocessError(&result, nil, ReprocessErrorTimeout, reprocessContextFailureMessage(err))
		result.CompletedAt = time.Now().UTC()
		result.FTSStale = true
		return ReprocessLibraryResponse{Reprocess: result}, nil
	}
	updateCurrentOperation("rebuilding_search", &CurrentOperationCount{Current: len(items), Total: len(items)}, "library reprocess rebuilding search index")
	indexed, err := rebuildSearchIndexAndClearStale(ctx, db)
	if err != nil {
		return ReprocessLibraryResponse{}, err
	}
	result.ItemsIndexed = indexed
	result.FTSRebuilt = true
	result.FTSStale = false
	result.CompletedAt = time.Now().UTC()
	if result.ItemsFailed > 0 || result.ItemsUnavailable > 0 {
		result.Status = ReprocessStatusCompletedWithErrors
	}
	updateCurrentOperation("complete", &CurrentOperationCount{Current: len(items), Total: len(items)}, "library reprocess complete")
	return ReprocessLibraryResponse{Reprocess: result}, nil
}

type reprocessLibraryTask struct {
	index int
	item  reprocessItem
}

type reprocessLibraryProcessedItem struct {
	index   int
	item    reprocessItem
	outcome reprocessItemOutcome
	err     error
}

func processReprocessLibraryItems(ctx context.Context, db *sql.DB, llm LLMClient, language ProcessingLanguage, activeSteeringRules []string, items []reprocessItem, result *ReprocessLibraryResult) error {
	if len(items) == 0 {
		return nil
	}
	slotCount := minInt(DefaultIngestItemConcurrencyPerSource, len(items))
	if slotCount < 1 {
		slotCount = 1
	}
	tasks := make(chan reprocessLibraryTask)
	processedItems := make(chan reprocessLibraryProcessedItem, len(items))
	var wg sync.WaitGroup
	for slot := 0; slot < slotCount; slot++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range tasks {
				if err := ctx.Err(); err != nil {
					processedItems <- reprocessLibraryProcessedItem{index: task.index, item: task.item, err: err}
					continue
				}
				outcome, err := processReprocessItem(ctx, task.item, llm, language, activeSteeringRules)
				processedItems <- reprocessLibraryProcessedItem{index: task.index, item: task.item, outcome: outcome, err: err}
			}
		}()
	}
	go func() {
		defer close(tasks)
		for index, item := range items {
			select {
			case <-ctx.Done():
				return
			case tasks <- reprocessLibraryTask{index: index, item: item}:
			}
		}
	}()
	go func() {
		wg.Wait()
		close(processedItems)
	}()

	completed := 0
	for processed := range processedItems {
		result.ItemsAttempted++
		if processed.err != nil {
			if errors.Is(processed.err, context.DeadlineExceeded) || errors.Is(processed.err, context.Canceled) {
				result.ItemsFailed++
				appendReprocessError(result, &processed.item.id, ReprocessErrorTimeout, reprocessContextFailureMessage(processed.err))
			} else {
				result.ItemsFailed++
				appendReprocessError(result, &processed.item.id, ReprocessErrorRSSFetchError, processed.err.Error())
			}
			completed++
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: completed, Total: len(items)}, "library reprocess item failed")
			continue
		}
		if processed.outcome.failed {
			result.ItemsFailed++
			appendReprocessError(result, &processed.item.id, processed.outcome.errorCode, processed.outcome.errorMessage)
			if processed.outcome.storableFailure() {
				result.ItemsPreservedFailures++
				if err := storeReprocessItem(ctx, db, processed.item.id, processed.outcome); err != nil {
					return err
				}
			}
			completed++
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: completed, Total: len(items)}, "library reprocess item failed")
			continue
		}
		if processed.outcome.unavailable {
			result.ItemsUnavailable++
			appendReprocessError(result, &processed.item.id, processed.outcome.errorCode, processed.outcome.errorMessage)
			if err := storeReprocessItem(ctx, db, processed.item.id, processed.outcome); err != nil {
				return err
			}
			completed++
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: completed, Total: len(items)}, "library reprocess item unavailable")
			continue
		}
		if !processed.outcome.writable() {
			result.ItemsUnavailable++
			appendReprocessError(result, &processed.item.id, ReprocessErrorSummaryUnavailable, "summary unavailable")
			completed++
			updateCurrentOperation("processing_items", &CurrentOperationCount{Current: completed, Total: len(items)}, "library reprocess item unavailable")
			continue
		}
		if err := storeReprocessItem(ctx, db, processed.item.id, processed.outcome); err != nil {
			return err
		}
		result.ItemsUpdated++
		completed++
		updateCurrentOperation("processing_items", &CurrentOperationCount{Current: completed, Total: len(items)}, "library reprocess item processed")
	}
	return nil
}

func reprocessContextFailureMessage(err error) string {
	if errors.Is(err, context.Canceled) {
		return "operation canceled"
	}
	return "operation timed out"
}

type reprocessItem struct {
	id                 string
	sourceTitle        string
	sourceItemTitle    string
	title              string
	url                string
	canonicalURL       sql.NullString
	feedExcerpt        sql.NullString
	extractedText      sql.NullString
	extractionSource   sql.NullString
	sourceEvidenceText sql.NullString
}

type reprocessItemOutcome struct {
	title              string
	summary            *string
	coreInsight        *string
	feedExcerpt        *string
	extractedText      *string
	localizedTitle     *string
	keyPoints          []string
	valueTier          *string
	extractStatus      string
	extractionSource   string
	sourceEvidenceText *string
	modelStatus        string
	unavailable        bool
	failed             bool
	preserveExisting   bool
	errorCode          ReprocessErrorCode
	errorMessage       string
}

func (o reprocessItemOutcome) writable() bool {
	return !o.failed && !o.unavailable && o.modelStatus == modelStatusOK
}

func (o reprocessItemOutcome) storableFailure() bool {
	return o.failed && strings.TrimSpace(o.modelStatus) != ""
}

func loadReprocessItems(ctx context.Context, db *sql.DB) ([]reprocessItem, error) {
	rows, err := db.QueryContext(ctx, `select i.id, coalesce(s.title, ''), coalesce(i.source_item_title, ''), i.title, i.url, i.canonical_url, i.feed_excerpt, i.extracted_text, i.extraction_source, i.source_evidence_text from items i join sources s on s.id = i.source_id where s.is_active = 1 order by case when i.last_reprocess_at is null then 0 else 1 end, i.last_reprocess_at, i.id`)
	if err != nil {
		return nil, fmt.Errorf("reprocess library: query items: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := []reprocessItem{}
	for rows.Next() {
		var item reprocessItem
		if err := rows.Scan(&item.id, &item.sourceTitle, &item.sourceItemTitle, &item.title, &item.url, &item.canonicalURL, &item.feedExcerpt, &item.extractedText, &item.extractionSource, &item.sourceEvidenceText); err != nil {
			return nil, fmt.Errorf("reprocess library: scan item: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reprocess library: iterate items: %w", err)
	}
	return items, nil
}

func processReprocessItem(ctx context.Context, item reprocessItem, llm LLMClient, language ProcessingLanguage, activeSteeringRules []string) (reprocessItemOutcome, error) {
	return processReprocessItemWithRequest(ctx, item, llm, language, ItemReingestRequest{}, activeSteeringRules, false)
}

func reprocessStoredTextFallback(item reprocessItem) (string, string, string, bool) {
	extractionSource := extractionSourceNone
	if item.extractionSource.Valid {
		extractionSource = normalizeExtractionSource(item.extractionSource.String)
	}

	// Rows produced after the source-evidence migration identify their evidence
	// origin explicitly. If local/Tavily source-backed evidence is missing, the
	// generated display fields are ambiguous and must not be promoted back into
	// source evidence or content input. Legacy rows with extraction_source='none'
	// keep the older best-effort fallback behavior so existing libraries can
	// still be reprocessed.
	switch extractionSource {
	case extractionSourceLocalReadable, extractionSourceExternalTavily:
		return "", "", "", false
	case extractionSourceFeedExcerpt:
		if item.feedExcerpt.Valid {
			if text := strings.TrimSpace(item.feedExcerpt.String); text != "" {
				return fallbackReprocessSourceURL(item), text, availableTextSourceRSSExcerpt, true
			}
		}
		return "", "", "", false
	}

	if item.extractedText.Valid {
		if text := strings.TrimSpace(item.extractedText.String); text != "" {
			if !isUnusableReadablePayload(text) && !isLowInformationReadablePayload(text) {
				return fallbackReprocessSourceURL(item), text, availableTextSourceStoredExtracted, true
			}
		}
	}
	if item.feedExcerpt.Valid {
		if text := strings.TrimSpace(item.feedExcerpt.String); text != "" {
			return fallbackReprocessSourceURL(item), text, availableTextSourceRSSExcerpt, true
		}
	}
	return "", "", "", false
}

func sourceEvidenceString(modelValue string, stored sql.NullString, sourceTextApplies bool, sourceText string) *string {
	if strings.TrimSpace(modelValue) != "" {
		return nullableString(modelValue)
	}
	if sourceTextApplies && strings.TrimSpace(sourceText) != "" {
		return nullableString(sourceText)
	}
	if stored.Valid {
		storedText := strings.TrimSpace(stored.String)
		if storedText != "" && !isUnusableReadablePayload(storedText) && !isLowInformationReadablePayload(storedText) {
			return nullableString(storedText)
		}
	}
	return nil
}

func reprocessExtractionStatusForSource(source string) string {
	switch source {
	case "fresh_full_text", "stored_extracted_text", "external_tavily":
		return extractionStatusFull
	case "rss_excerpt":
		return extractionStatusPartial
	default:
		return extractionStatusSummaryNA
	}
}

func safePromptValidationDiagnostic(err error) string {
	var validationErr PromptValidationError
	if !errors.As(err, &validationErr) || validationErr.Code == "" {
		return string(ReprocessErrorDecodeError)
	}
	field := safePromptValidationField(validationErr.Field)
	if field == "" {
		return fmt.Sprintf("%s:%s", ReprocessErrorDecodeError, validationErr.Code)
	}
	return fmt.Sprintf("%s:%s:%s", ReprocessErrorDecodeError, validationErr.Code, field)
}

func safePromptValidationField(field string) string {
	field = strings.TrimSpace(field)
	if field == "" {
		return ""
	}
	field = regexp.MustCompile(`\[\d+\]`).ReplaceAllString(field, "")
	field = strings.NewReplacer(".", "_", "-", "_").Replace(field)
	var b strings.Builder
	for _, r := range field {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_' {
			b.WriteRune(r)
		}
	}
	return strings.ToLower(b.String())
}

func reprocessErrorCodeForModelStatus(status string) ReprocessErrorCode {
	switch mapModelStatus(status) {
	case modelStatusInvalidModel:
		return ReprocessErrorInvalidModel
	case modelStatusProviderError:
		return ReprocessErrorProviderError
	case modelStatusRateLimited:
		return ReprocessErrorRateLimited
	case modelStatusDecodeError:
		return ReprocessErrorDecodeError
	case modelStatusTimeout:
		return ReprocessErrorTimeout
	case modelStatusLatencyError:
		return ReprocessErrorModelLatencyError
	default:
		return ReprocessErrorSummaryUnavailable
	}
}

func fetchReprocessSourceText(ctx context.Context, item reprocessItem) (string, string, string, error) {
	candidates := reprocessCandidateURLs(item)
	for _, candidate := range candidates {
		text, err := fetchArticleReadableText(ctx, candidate)
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return "", "", "", err
		}
		if err != nil {
			continue
		}
		return candidate, text, "fresh_full_text", nil
	}
	for _, candidate := range tavilyReprocessCandidateURLs(item) {
		text, err := tryTavilyExtractArticleText(ctx, candidate)
		if err == nil {
			return candidate, text, "external_tavily", nil
		}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return "", "", "", err
		}
		if errors.Is(err, errTavilyKeyMissing) || errors.Is(err, errTavilyURLIneligible) {
			continue
		}
		return "", "", "", err
	}
	return "", "", "", errors.New("no reprocess source text available")
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

func tavilyReprocessCandidateURLs(item reprocessItem) []string {
	canonicalURL := ""
	if item.canonicalURL.Valid {
		canonicalURL = item.canonicalURL.String
	}
	return tavilyEligibleArticleURLCandidates(canonicalURL, item.url)
}

func fallbackReprocessSourceURL(item reprocessItem) string {
	candidates := reprocessCandidateURLs(item)
	if len(candidates) > 0 {
		return candidates[0]
	}
	return item.url
}

func reprocessInputTitle(item reprocessItem) string {
	if title := strings.TrimSpace(item.sourceItemTitle); title != "" {
		return title
	}
	if title := strings.TrimSpace(item.title); title != "" {
		return title
	}
	return fallbackReprocessTitle(fallbackReprocessSourceURL(item))
}

func isUnusableReprocessOutputTitle(title string) bool {
	title = strings.TrimSpace(title)
	if title == "" || isHTTPArticleURL(title) {
		return true
	}
	if strings.HasPrefix(strings.ToLower(title), "http://") || strings.HasPrefix(strings.ToLower(title), "https://") {
		return true
	}
	switch strings.ToLower(title) {
	case "untitled", "unavailable", "summary unavailable", "summary_unavailable", "original unavailable", "original_unavailable", "model latency error", "model_latency_error":
		return true
	default:
		return false
	}
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
	if !isReadableTextContentType(resp.Header.Get("Content-Type")) {
		return "", fmt.Errorf("reprocess fetch: unsupported readable content type %q", resp.Header.Get("Content-Type"))
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", fmt.Errorf("reprocess fetch: read body: %w", err)
	}
	if looksLikeBinaryReadablePayload(body) {
		return "", errors.New("reprocess fetch: binary article payload")
	}
	text = textFromHTML(string(body))
	text, _ = sanitizeReadablePayloadText(text)
	if strings.TrimSpace(text) == "" || isUnusableReadablePayload(text) || isLowInformationReadablePayload(text) {
		return "", errors.New("reprocess fetch: unusable article text")
	}
	return text, nil
}

func unavailableReprocessOutcome(rawURL string, code ReprocessErrorCode, message string) reprocessItemOutcome {
	return reprocessItemOutcome{title: fallbackReprocessTitle(rawURL), extractStatus: extractionStatusOriginalNA, modelStatus: modelStatusSummaryNA, unavailable: true, errorCode: code, errorMessage: message}
}

func failedReprocessOutcome(rawURL string, code ReprocessErrorCode, message string, modelStatus ...string) reprocessItemOutcome {
	status := modelStatusLatencyError
	if len(modelStatus) > 0 && strings.TrimSpace(modelStatus[0]) != "" {
		status = mapModelStatus(modelStatus[0])
	}
	return reprocessItemOutcome{title: fallbackReprocessTitle(rawURL), extractStatus: extractionStatusSummaryNA, modelStatus: status, failed: true, errorCode: code, errorMessage: message}
}

func fallbackReprocessTitle(rawURL string) string {
	if strings.TrimSpace(rawURL) != "" {
		return strings.TrimSpace(rawURL)
	}
	return "Untitled"
}

func storeReprocessItem(ctx context.Context, db *sql.DB, itemID string, outcome reprocessItemOutcome) error {
	outcome.extractionSource = normalizeExtractionSource(outcome.extractionSource)
	if outcome.extractionSource == extractionSourceFeedExcerpt || outcome.extractionSource == extractionSourceNone {
		outcome.sourceEvidenceText = nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("reprocess item %q: begin transaction: %w", itemID, err)
	}
	defer func() { _ = tx.Rollback() }()

	destructiveUnavailable := outcome.unavailable && !outcome.preserveExisting && outcome.errorCode == ReprocessErrorOriginalUnavailable
	if outcome.failed || (outcome.unavailable && !destructiveUnavailable) {
		_, err = tx.ExecContext(ctx, `update items set last_reprocess_status = 'failed', last_reprocess_error_code = ?, last_reprocess_error_message = ?, last_reprocess_at = ? where id = ?`, outcome.errorCode, outcome.errorMessage, time.Now().UTC().Format(time.RFC3339), itemID)
		if err != nil {
			return fmt.Errorf("reprocess item %q: update failed status: %w", itemID, err)
		}
	} else if destructiveUnavailable {
		keyPointsJSON, marshalErr := json.Marshal([]string{})
		if marshalErr != nil {
			return fmt.Errorf("reprocess item %q: marshal unavailable key points: %w", itemID, marshalErr)
		}
		_, err = tx.ExecContext(ctx, `update items set title = ?, localized_title = null, summary = null, core_insight = null, key_points = ?, feed_excerpt = null, extracted_text = null, value_tier = null, extraction_status = ?, extraction_source = ?, source_evidence_text = null, model_status = ?, content_status = ?, last_reprocess_status = 'failed', last_reprocess_error_code = ?, last_reprocess_error_message = ?, last_reprocess_at = ? where id = ?`, outcome.title, string(keyPointsJSON), outcome.extractStatus, outcome.extractionSource, outcome.modelStatus, outcome.modelStatus, outcome.errorCode, outcome.errorMessage, time.Now().UTC().Format(time.RFC3339), itemID)
		if err != nil {
			return fmt.Errorf("reprocess item %q: update unavailable state: %w", itemID, err)
		}
	} else {
		keyPointsJSON, marshalErr := json.Marshal(outcome.keyPoints)
		if marshalErr != nil {
			return fmt.Errorf("reprocess item %q: marshal key points: %w", itemID, marshalErr)
		}
		_, err = tx.ExecContext(ctx, `update items set title = ?, localized_title = ?, summary = ?, core_insight = ?, key_points = ?, feed_excerpt = ?, extracted_text = ?, value_tier = ?, extraction_status = ?, extraction_source = ?, source_evidence_text = ?, model_status = ?, content_status = ?, last_reprocess_status = 'ok', last_reprocess_error_code = null, last_reprocess_error_message = null, last_reprocess_at = ? where id = ?`, outcome.title, outcome.localizedTitle, outcome.summary, outcome.coreInsight, string(keyPointsJSON), outcome.feedExcerpt, outcome.extractedText, outcome.valueTier, outcome.extractStatus, outcome.extractionSource, outcome.sourceEvidenceText, outcome.modelStatus, outcome.modelStatus, time.Now().UTC().Format(time.RFC3339), itemID)
		if err != nil {
			return fmt.Errorf("reprocess item %q: update: %w", itemID, err)
		}
	}

	if !outcome.failed && (!outcome.unavailable || destructiveUnavailable) {
		if err := refreshSearchIndexForItemTx(ctx, tx, itemID); err != nil {
			return fmt.Errorf("reprocess item %q: refresh FTS: %w", itemID, err)
		}
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
insert into search_fts (item_id, title, source_item_title, localized_title, source_title, feed_excerpt, summary, core_insight, key_points, extracted_text, provenance)
select i.id, i.title, coalesce(i.source_item_title, i.title, ''), coalesce(i.localized_title, i.title, ''), coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, '') || ' ' || coalesce(i.value_tier, ''), coalesce(i.core_insight, ''), coalesce(i.key_points, ''), coalesce(i.extracted_text, ''),
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
