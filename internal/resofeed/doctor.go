package resofeed

import (
	"context"
	"database/sql"
	"io"
)

// WriteDoctor writes raw text diagnostics for /api/doctor,
// resofeed://system/doctor, and the /doctor Steer command. It is a plain text
// operational surface, not a dashboard, chart, friendly remediation wizard, or
// settings page.
func WriteDoctor(ctx context.Context, db *sql.DB, w io.Writer) error {
	panic("TODO contract stub: write doctor diagnostics")
}

// DoctorSnapshot is the internal raw diagnostic contract for RSS fetch errors,
// model latency/errors, extraction failures, and last ingestion run status.
type DoctorSnapshot struct {
	Lines []string
}

// ReadDoctorSnapshot gathers diagnostic lines without inventing a UI dashboard.
func ReadDoctorSnapshot(ctx context.Context, db *sql.DB) (DoctorSnapshot, error) {
	panic("TODO contract stub: read doctor diagnostics")
}
