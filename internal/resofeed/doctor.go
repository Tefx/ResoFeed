package resofeed

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"
)

// WriteDoctor writes raw text diagnostics for /api/doctor,
// resofeed://system/doctor, and the /doctor Steer command. It is a plain text
// operational surface, not a dashboard, chart, friendly remediation wizard, or
// settings page.
func WriteDoctor(ctx context.Context, db *sql.DB, w io.Writer) error {
	if w == nil {
		return fmt.Errorf("write doctor: writer required")
	}
	snapshot, err := ReadDoctorSnapshot(ctx, db)
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
	if db == nil {
		return DoctorSnapshot{}, fmt.Errorf("read doctor diagnostics: db required")
	}
	lines := []string{}
	rssLines, lastFetch, err := readRSSDiagnostics(ctx, db)
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, rssLines...)
	lines = append(lines, "openrouter: configured_model=account_default")
	modelLines, err := readItemStatusDiagnostics(ctx, db, "openrouter", "model_status", []string{modelStatusSummaryNA, modelStatusLatencyError})
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, modelLines...)
	extractionLines, err := readItemStatusDiagnostics(ctx, db, "extraction", "extraction_status", []string{extractionStatusPartial, extractionStatusOriginalNA, extractionStatusSummaryNA})
	if err != nil {
		return DoctorSnapshot{}, err
	}
	lines = append(lines, extractionLines...)
	if lastFetch.Valid && lastFetch.String != "" {
		lines = append(lines, "ingest: last_run="+lastFetch.String)
	} else {
		lines = append(lines, "ingest: last_run=never")
	}
	return DoctorSnapshot{Lines: lines}, nil
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
