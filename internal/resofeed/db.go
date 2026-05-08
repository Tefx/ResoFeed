package resofeed

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite"
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
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	if path == "" {
		return nil, fmt.Errorf("open sqlite database: path required")
	}
	if path != ":memory:" {
		dir := filepath.Dir(path)
		if dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("create sqlite parent directory: %w", err)
			}
		}
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	if _, err := db.ExecContext(ctx, `pragma foreign_keys = on`); err != nil {
		closeErr := db.Close()
		return nil, errors.Join(fmt.Errorf("enable sqlite foreign keys: %w", err), closeErr)
	}
	if err := db.PingContext(ctx); err != nil {
		closeErr := db.Close()
		return nil, errors.Join(fmt.Errorf("ping sqlite database: %w", err), closeErr)
	}
	return db, nil
}

// ResolveOwnerToken enforces the owner-token contract: explicit tokens are at
// least 32 visible non-whitespace characters, stored only as SHA-256 hex, and
// not trimmed; omitted tokens reuse an existing hash or generate and print a
// one-time plaintext token. Runtime credential metadata is never exported.
func ResolveOwnerToken(ctx context.Context, db *sql.DB, token string) (OwnerTokenResolution, error) {
	if db == nil {
		return OwnerTokenResolution{}, fmt.Errorf("resolve owner token: db required")
	}
	if token != "" {
		if err := validateOwnerToken(token); err != nil {
			return OwnerTokenResolution{}, err
		}
		hash := ownerTokenHash(token)
		if err := storeRuntimeMetadata(ctx, db, "owner_token_sha256", hash); err != nil {
			return OwnerTokenResolution{}, fmt.Errorf("store owner token hash: %w", err)
		}
		return OwnerTokenResolution{TokenHash: hash, WasExplicit: true}, nil
	}

	var existing string
	err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = 'owner_token_sha256'`).Scan(&existing)
	if err == nil && existing != "" {
		return OwnerTokenResolution{TokenHash: existing}, nil
	}
	if err != nil && err != sql.ErrNoRows {
		return OwnerTokenResolution{}, fmt.Errorf("read owner token hash: %w", err)
	}

	generated, err := generateOwnerToken()
	if err != nil {
		return OwnerTokenResolution{}, err
	}
	hash := ownerTokenHash(generated)
	if err := storeRuntimeMetadata(ctx, db, "owner_token_sha256", hash); err != nil {
		return OwnerTokenResolution{}, fmt.Errorf("store generated owner token hash: %w", err)
	}
	return OwnerTokenResolution{GeneratedPlaintextToken: generated, TokenHash: hash, WasGenerated: true}, nil
}

func validateOwnerToken(token string) error {
	if utf8.RuneCountInString(token) < 32 {
		return fmt.Errorf("invalid owner token: expected at least 32 visible non-whitespace characters")
	}
	for _, r := range token {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return fmt.Errorf("invalid owner token: expected visible non-whitespace characters")
		}
	}
	return nil
}

func ownerTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func generateOwnerToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate owner token: %w", err)
	}
	return "rfeed_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func storeRuntimeMetadata(ctx context.Context, db *sql.DB, key string, value string) error {
	_, err := db.ExecContext(ctx, `insert into runtime_metadata (key, value, updated_at) values (?, ?, unixepoch())
		on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`, key, value)
	if err != nil {
		return fmt.Errorf("upsert runtime metadata %q: %w", key, err)
	}
	return nil
}

// OwnerTokenResolution reports runtime owner-token setup without exposing
// plaintext except for the first-run generated-token case.
type OwnerTokenResolution struct {
	GeneratedPlaintextToken string
	TokenHash               string
	WasGenerated            bool
	WasExplicit             bool
}
