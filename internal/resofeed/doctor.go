package resofeed

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"
	"time"
)

// WriteDoctor writes raw text diagnostics for /api/doctor,
// resofeed://system/doctor, and the /doctor Steer command. It is a plain text
// operational surface, not a dashboard, chart, friendly remediation wizard, or
// settings page.
func WriteDoctor(ctx context.Context, db *sql.DB, w io.Writer) error {
	return WriteDoctorWithConfig(ctx, db, DoctorConfig{}, w)
}

// DoctorConfig carries non-secret runtime model labels into /doctor. It must not
// include API keys, secret source metadata, .env paths, or raw provider config.
type DoctorConfig struct {
	ConfiguredOpenRouterModel string
	ResolvedOpenRouterModel   string
	FirstFetchMaxItems        int
	FirstFetchMaxItemsSet     bool
}

type openRouterRuntimeStatus interface {
	ConfiguredModel() string
	ResolvedModel() string
}

func DoctorConfigFromLLM(llm LLMClient) DoctorConfig {
	status, ok := llm.(openRouterRuntimeStatus)
	if !ok || status == nil {
		return DoctorConfig{}
	}
	return DoctorConfig{
		ConfiguredOpenRouterModel: status.ConfiguredModel(),
		ResolvedOpenRouterModel:   status.ResolvedModel(),
	}
}

func WriteDoctorWithConfig(ctx context.Context, db *sql.DB, cfg DoctorConfig, w io.Writer) error {
	if w == nil {
		return fmt.Errorf("write doctor: writer required")
	}
	snapshot, err := ReadDoctorSnapshotWithConfig(ctx, db, cfg)
	if err != nil {
		return err
	}
	writer := bufio.NewWriter(w)
	for _, line := range snapshot.Lines {
		if _, err := writer.WriteString(line + "\n"); err != nil {
			return fmt.Errorf("write doctor line: %w", err)
		}
	}
	if err := writer.Flush(); err != nil {
		return fmt.Errorf("flush doctor diagnostics: %w", err)
	}
	return nil
}

// DoctorSnapshot is the internal raw diagnostic contract for RSS fetch errors,
// model latency/errors, extraction failures, and last ingestion run status.
type DoctorSnapshot struct {
	Lines []string
}

// ReadDoctorSnapshot gathers diagnostic lines without inventing a UI dashboard.
func ReadDoctorSnapshot(ctx context.Context, db *sql.DB) (DoctorSnapshot, error) {
	return ReadDoctorSnapshotWithConfig(ctx, db, DoctorConfig{})
}

func ReadDoctorSnapshotWithConfig(ctx context.Context, db *sql.DB, cfg DoctorConfig) (DoctorSnapshot, error) {
	if db == nil {
		return DoctorSnapshot{}, fmt.Errorf("read doctor diagnostics: db required")
	}
	lines := []string{}
	rssLines, lastFetch, err := readRSSDiagnostics(ctx, db)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, rssLines...)
	modelFailureStatuses := modelDiagnosticFailureStatuses()
	modelFailureCount, err := countItemStatusDiagnostics(ctx, db, "openrouter", "model_status", modelFailureStatuses)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	health, err := readOpenRouterHealthMetrics(ctx, db, time.Now().UTC())
	if err != nil {
		return DoctorSnapshot{}, err
	}
	if modelFailureCount == 0 && strings.TrimSpace(cfg.ResolvedOpenRouterModel) != "" {
		lines = append(lines, "openrouter: ok item_transform_failures=0")
	}
	lines = append(lines, openRouterProviderDoctorLine(cfg))
	lines = append(lines, openRouterModelDoctorLine(cfg))
	lines = append(lines, fmt.Sprintf("openrouter: item_transform_failures=%d", modelFailureCount))
	lines = append(lines, fmt.Sprintf("openrouter: current_item_transform_failures=%d historic_item_transform_failures=%d", health.CurrentFailures, health.HistoricFailures))
	lines = append(lines, fmt.Sprintf("openrouter: live_summary_successes=%d fallback_only_current_summaries=%d", health.CurrentLiveSuccesses, health.CurrentFallbackOnly))
	lines = append(lines, "openrouter: health_classification="+health.classification(cfg))
	if modelFailureCount == 0 {
		lines = append(lines, "fallback_provenance: item_transform_failures=0 summary=none")
	}
	modelLines, err := readItemStatusDiagnostics(ctx, db, "openrouter", "model_status", modelFailureStatuses)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	if hasFailureDiagnostics(modelLines) {
		lines = append(lines, modelLines...)
	}
	fallbackLines, err := readFallbackProvenanceDiagnostics(ctx, db)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, fallbackLines...)
	searchFTSLine, err := readSearchFTSStatusLine(ctx, db)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, searchFTSLine)
	extractionLines, err := readExtractionDiagnostics(ctx, db)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, extractionLines...)
	if lastFetch.Valid && lastFetch.String != "" {
		lines = append(lines, "ingest: last_run="+lastFetch.String)
	} else {
		lines = append(lines, "ingest: last_run=never")
	}
	lines = append(lines, "ingest: first_fetch_limit="+firstFetchLimitDisplay(effectiveDoctorFirstFetchMaxItems(cfg)))
	return DoctorSnapshot{Lines: lines}, nil
}

func modelDiagnosticFailureStatuses() []string {
	return []string{modelStatusSummaryNA, modelStatusLatencyError, modelStatusInvalidModel, modelStatusProviderError, modelStatusRateLimited, modelStatusDecodeError, modelStatusTimeout}
}

func effectiveDoctorFirstFetchMaxItems(cfg DoctorConfig) int {
	if !cfg.FirstFetchMaxItemsSet && cfg.FirstFetchMaxItems == 0 {
		return DefaultFirstFetchMaxItems
	}
	return cfg.FirstFetchMaxItems
}

func firstFetchLimitDisplay(limit int) string {
	if limit == 0 {
		return "unlimited"
	}
	return fmt.Sprintf("%d", limit)
}

func readSearchFTSStatusLine(ctx context.Context, db *sql.DB) (string, error) {
	var staleSince string
	err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, RuntimeMetadataKeySearchFTSStaleSince).Scan(&staleSince)
	if err == nil {
		return DoctorSearchFTSStaleLinePrefix + staleSince, nil
	}
	if err != sql.ErrNoRows {
		return "", fmt.Errorf("read search FTS stale marker: %w", err)
	}
	return DoctorSearchFTSOKLinePrefix, nil
}

type openRouterHealthMetrics struct {
	TotalItems                int
	CurrentFailures           int
	HistoricFailures          int
	CurrentLiveSuccesses      int
	CurrentFallbackOnly       int
	SourceUnavailableFailures int
}

func (m openRouterHealthMetrics) classification(cfg DoctorConfig) string {
	if m.TotalItems == 0 && strings.TrimSpace(cfg.ConfiguredOpenRouterModel) != "" {
		return "no_items_processed_yet"
	}
	totalFailures := m.CurrentFailures + m.HistoricFailures
	if totalFailures > 0 && totalFailures == m.SourceUnavailableFailures {
		return "source_unavailable_only"
	}
	if m.CurrentFailures > 0 {
		return "openrouter_client_timeout_or_error"
	}
	if m.HistoricFailures > 0 && m.CurrentLiveSuccesses > 0 {
		return "stale_database_prior_failures"
	}
	if m.CurrentLiveSuccesses > 0 && m.HistoricFailures == 0 && strings.TrimSpace(cfg.ResolvedOpenRouterModel) != "" {
		return "openrouter_live_summary_ok"
	}
	if m.CurrentLiveSuccesses == 0 && strings.TrimSpace(cfg.ConfiguredOpenRouterModel) == "" && strings.TrimSpace(cfg.ResolvedOpenRouterModel) == "" {
		return "missing_live_model_configuration"
	}
	return "unresolved_product_regression"
}

func readOpenRouterHealthMetrics(ctx context.Context, db *sql.DB, now time.Time) (openRouterHealthMetrics, error) {
	cutoff := now.Add(-freshWindow).Format(time.RFC3339)
	var metrics openRouterHealthMetrics
	row := db.QueryRowContext(ctx, `
select
	  count(*),
  coalesce(sum(case when model_status != ? and coalesce(published_at, first_seen_at) >= ? then 1 else 0 end), 0),
  coalesce(sum(case when model_status != ? and coalesce(published_at, first_seen_at) < ? then 1 else 0 end), 0),
  coalesce(sum(case when model_status = ? and coalesce(summary, '') != '' and coalesce(core_insight, '') != '' and coalesce(value_tier, '') != '' and coalesce(published_at, first_seen_at) >= ? then 1 else 0 end), 0),
  coalesce(sum(case when model_status != ? and coalesce(summary, '') = '' and coalesce(core_insight, '') = '' and coalesce(feed_excerpt, '') != '' and coalesce(published_at, first_seen_at) >= ? then 1 else 0 end), 0),
  coalesce(sum(case when model_status != ? and extraction_status = ? then 1 else 0 end), 0)
from items`, modelStatusOK, cutoff, modelStatusOK, cutoff, modelStatusOK, cutoff, modelStatusOK, cutoff, modelStatusOK, extractionStatusOriginalNA)
	if err := row.Scan(&metrics.TotalItems, &metrics.CurrentFailures, &metrics.HistoricFailures, &metrics.CurrentLiveSuccesses, &metrics.CurrentFallbackOnly, &metrics.SourceUnavailableFailures); err != nil {
		return openRouterHealthMetrics{}, fmt.Errorf("read openrouter health metrics: %w", err)
	}
	return metrics, nil
}

func hasFailureDiagnostics(lines []string) bool {
	if len(lines) == 0 {
		return false
	}
	return !strings.HasSuffix(lines[0], ": ok")
}

func openRouterProviderDoctorLine(cfg DoctorConfig) string {
	configured := strings.TrimSpace(cfg.ConfiguredOpenRouterModel)
	if configured == "" {
		configured = "account_default"
	}
	providerReachable := "unknown"
	if strings.TrimSpace(cfg.ResolvedOpenRouterModel) != "" {
		providerReachable = "true"
	}
	return "openrouter: provider_reachable=" + providerReachable + " configured_model=" + configured
}

func openRouterModelDoctorLine(cfg DoctorConfig) string {
	resolved := strings.TrimSpace(cfg.ResolvedOpenRouterModel)
	modelResolved := "true"
	if resolved == "" {
		resolved = "unknown"
		modelResolved = "false"
	}
	return "openrouter: model_resolved=" + modelResolved + " resolved_model=" + resolved
}

func countItemStatusDiagnostics(ctx context.Context, db *sql.DB, label string, column string, failingStatuses []string) (int, error) {
	if column != "model_status" && column != "extraction_status" {
		return 0, fmt.Errorf("count %s diagnostics: unsupported status column %q", label, column)
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(failingStatuses)), ",")
	args := make([]any, 0, len(failingStatuses))
	for _, status := range failingStatuses {
		args = append(args, status)
	}
	query := fmt.Sprintf(`select count(*) from items where %s in (`+placeholders+`)`, column)
	var count int
	if err := db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0, fmt.Errorf("count %s diagnostics: %w", label, err)
	}
	return count, nil
}

func readFallbackProvenanceDiagnostics(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
select id, model_status, extraction_status,
       case when coalesce(summary, '') = '' and coalesce(core_insight, '') = '' and coalesce(feed_excerpt, '') != '' then 'excerpt' else 'model' end
from items
where model_status != ? or extraction_status != ?
order by first_seen_at desc, id asc
limit 25`, modelStatusOK, extractionStatusFull)
	if err != nil {
		return nil, fmt.Errorf("read fallback provenance diagnostics: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var lines []string
	for rows.Next() {
		var id, modelStatus, extractionStatus, summarySource string
		if err := rows.Scan(&id, &modelStatus, &extractionStatus, &summarySource); err != nil {
			return nil, fmt.Errorf("scan fallback provenance diagnostics: %w", err)
		}
		lines = append(lines, fmt.Sprintf("fallback_provenance: item=%s summary=%s model_status=%s extraction_status=%s", id, summarySource, modelStatus, extractionStatus))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate fallback provenance diagnostics: %w", err)
	}
	return lines, nil
}

func readRSSDiagnostics(ctx context.Context, db *sql.DB) ([]string, sql.NullString, error) {
	rows, err := db.QueryContext(ctx, `select id, url, last_fetch_status, last_fetch_error, last_fetch_at from sources where is_active = 1 order by id`)
	if err != nil {
		return nil, sql.NullString{}, fmt.Errorf("read rss diagnostics: %w", err)
	}
	defer func() { _ = rows.Close() }()
	lines := []string{}
	var lastFetch sql.NullString
	failures := 0
	for rows.Next() {
		var id, sourceURL, status string
		var rawErr, fetchedAt sql.NullString
		if err := rows.Scan(&id, &sourceURL, &status, &rawErr, &fetchedAt); err != nil {
			return nil, sql.NullString{}, fmt.Errorf("scan rss diagnostics: %w", err)
		}
		if fetchedAt.Valid && (!lastFetch.Valid || fetchedAt.String > lastFetch.String) {
			lastFetch = fetchedAt
		}
		if status != sourceStatusOK {
			failures++
			line := fmt.Sprintf("rss: source=%s status=%s url=%s", id, status, sourceURL)
			if rawErr.Valid && rawErr.String != "" {
				line += " error=" + sanitizeDoctorField(rawErr.String)
			}
			lines = append(lines, line)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, sql.NullString{}, fmt.Errorf("iterate rss diagnostics: %w", err)
	}
	if failures == 0 {
		lines = append([]string{"rss: ok"}, lines...)
	} else {
		lines = append([]string{fmt.Sprintf("rss: errors=%d", failures)}, lines...)
	}
	return lines, lastFetch, nil
}

func readExtractionDiagnostics(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
select id, source_id, title, extraction_status
from items
where extraction_status in (?, ?)
   or (extraction_status = ? and model_status != ?)
order by first_seen_at desc, id asc
limit 25`, extractionStatusOriginalNA, extractionStatusSummaryNA, extractionStatusPartial, modelStatusOK)
	if err != nil {
		return nil, fmt.Errorf("read extraction diagnostics: %w", err)
	}
	defer func() { _ = rows.Close() }()
	lines := []string{}
	for rows.Next() {
		var id, sourceID, title, status string
		if err := rows.Scan(&id, &sourceID, &title, &status); err != nil {
			return nil, fmt.Errorf("scan extraction diagnostics: %w", err)
		}
		lines = append(lines, fmt.Sprintf("extraction: item=%s source=%s status=%s title=%s", id, sourceID, status, sanitizeDoctorField(title)))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate extraction diagnostics: %w", err)
	}
	if len(lines) == 0 {
		return []string{"extraction: ok"}, nil
	}
	return append([]string{fmt.Sprintf("extraction: failures=%d", len(lines))}, lines...), nil
}

func readItemStatusDiagnostics(ctx context.Context, db *sql.DB, label string, column string, failingStatuses []string) ([]string, error) {
	if column != "model_status" && column != "extraction_status" {
		return nil, fmt.Errorf("read %s diagnostics: unsupported status column %q", label, column)
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(failingStatuses)), ",")
	args := make([]any, 0, len(failingStatuses))
	for _, status := range failingStatuses {
		args = append(args, status)
	}
	query := fmt.Sprintf(`select id, source_id, title, %s from items where %s in (`+placeholders+`) order by first_seen_at desc, id asc limit 25`, column, column)
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("read %s diagnostics: %w", label, err)
	}
	defer func() { _ = rows.Close() }()
	lines := []string{}
	for rows.Next() {
		var id, sourceID, title, status string
		if err := rows.Scan(&id, &sourceID, &title, &status); err != nil {
			return nil, fmt.Errorf("scan %s diagnostics: %w", label, err)
		}
		lines = append(lines, fmt.Sprintf("%s: item=%s source=%s status=%s title=%s", label, id, sourceID, status, sanitizeDoctorField(title)))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate %s diagnostics: %w", label, err)
	}
	if len(lines) == 0 {
		return []string{label + ": ok"}, nil
	}
	return append([]string{fmt.Sprintf("%s: failures=%d", label, len(lines))}, lines...), nil
}

func sanitizeDoctorField(value string) string {
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "\r", " ")
	return strings.TrimSpace(value)
}
