package resofeed

import (
	"context"
	"database/sql"
	"io"
)

// Main is the CLI handoff for the single Go binary. It must recognize only the
// `serve` command and must not add migrate, worker, doctor, admin, or sync
// processes. Stubbed until runtime implementation.
func Main(args []string, stdout io.Writer, stderr io.Writer) int {
	panic("TODO contract stub: parse resofeed serve flags and start runtime")
}

// OpenDB opens the one SQLite database file used for durable current state,
// runtime credential metadata, and FTS5. No alternate storage engines or
// repository layers are part of the contract.
func OpenDB(ctx context.Context, path string) (*sql.DB, error) {
	panic("TODO contract stub: open SQLite database")
}

// ResolveOwnerToken enforces the owner-token contract: explicit tokens are at
// least 32 visible non-whitespace characters, stored only as SHA-256 hex, and
// not trimmed; omitted tokens reuse an existing hash or generate and print a
// one-time plaintext token. Runtime credential metadata is never exported.
func ResolveOwnerToken(ctx context.Context, db *sql.DB, token string) (OwnerTokenResolution, error) {
	panic("TODO contract stub: resolve owner token")
}

// OwnerTokenResolution reports runtime owner-token setup without exposing
// plaintext except for the first-run generated-token case.
type OwnerTokenResolution struct {
	GeneratedPlaintextToken string
	TokenHash               string
	WasGenerated            bool
	WasExplicit             bool
}
