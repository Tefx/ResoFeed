package resofeed

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

// Main is the CLI handoff for the single Go binary. It must recognize only the
// `serve` command and must not add migrate, worker, doctor, admin, or sync
// processes.
func Main(args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" || args[0] == "help" {
		printRootHelp(stdout)
		return 0
	}
	if args[0] != "serve" {
		_, _ = fmt.Fprintf(stderr, "err: unknown_command: %s\n", args[0])
		return 2
	}
	cfg, exitCode, ok := parseServeFlags(args[1:], stdout, stderr)
	if !ok {
		return exitCode
	}
	if cfg.PublicURL == "" {
		publicURL, err := derivePublicURL(cfg.Addr)
		if err != nil {
			_, _ = io.WriteString(stderr, "err: invalid_addr: expected HOST:PORT\n")
			return 2
		}
		cfg.PublicURL = publicURL
	}
	if err := validateServeConfigBeforeSecret(cfg); err != nil {
		_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
		return 2
	}
	openRouterKey, err := ResolveOpenRouterRuntimeSecret()
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
		return 2
	}
	cfg.OpenRouterKey = openRouterKey
	if err := validateServeConfig(cfg); err != nil {
		_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
		return 2
	}
	return runServe(cfg, stdout, stderr)
}

func printRootHelp(w io.Writer) {
	_, _ = io.WriteString(w, `Usage: resofeed <command>

Commands:
  serve    Start web UI, JSON HTTP API, MCP endpoint, SQLite, and background ingest.

Run "resofeed serve --help" for serve flags.
`)
}

func parseServeFlags(args []string, stdout io.Writer, stderr io.Writer) (ServeConfig, int, bool) {
	cfg := ServeConfig{Addr: DefaultAddr, DBPath: DefaultDBPath}
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&cfg.Addr, "addr", DefaultAddr, "bind address for web UI, HTTP API, and MCP endpoint")
	fs.StringVar(&cfg.PublicURL, "public-url", "", "public base URL for external agents")
	fs.StringVar(&cfg.DBPath, "db", DefaultDBPath, "SQLite database path")
	fs.StringVar(&cfg.OpenRouterModel, "openrouter-model", "", "optional OpenRouter model (empty uses account default)")
	fs.StringVar(&cfg.OwnerToken, "owner-token", "", "explicit owner token")
	fs.Usage = func() {
		_, _ = io.WriteString(stdout, `Usage: resofeed serve [flags]

Starts the single ResoFeed runtime: static UI, JSON HTTP API, MCP at /mcp,
SQLite migrations, owner-token auth, and background ingest.

Flags:
`)
		fs.SetOutput(stdout)
		fs.PrintDefaults()
		fs.SetOutput(stderr)
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return ServeConfig{}, 0, false
		}
		return ServeConfig{}, 2, false
	}
	if fs.NArg() != 0 {
		_, _ = fmt.Fprintf(stderr, "err: unexpected_argument: %s\n", fs.Arg(0))
		return ServeConfig{}, 2, false
	}
	return cfg, 0, true
}

func validateServeConfig(cfg ServeConfig) error {
	if err := validateServeConfigBeforeSecret(cfg); err != nil {
		return err
	}
	if strings.TrimSpace(cfg.OpenRouterKey) == "" {
		return errors.New("invalid_openrouter_key: value required")
	}
	return nil
}

func validateServeConfigBeforeSecret(cfg ServeConfig) error {
	if err := validateAddr(cfg.Addr); err != nil {
		return err
	}
	if err := validatePublicURL(cfg.PublicURL); err != nil {
		return err
	}
	if cfg.OwnerToken != "" {
		if err := validateOwnerToken(cfg.OwnerToken); err != nil {
			return fmt.Errorf("invalid_owner_token: expected at least 32 visible non-whitespace characters")
		}
	}
	return nil
}

func validateAddr(addr string) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil || host == "" || port == "" {
		return errors.New("invalid_addr: expected HOST:PORT")
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return errors.New("invalid_addr: expected HOST:PORT")
	}
	return nil
}

func derivePublicURL(addr string) (string, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil || host == "" || port == "" {
		return "", err
	}
	if host == "0.0.0.0" || host == "::" || host == "[::]" {
		host = "127.0.0.1"
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}
	return "http://" + net.JoinHostPort(strings.Trim(host, "[]"), port), nil
}

func validatePublicURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || !parsed.IsAbs() || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return errors.New("invalid_public_url: expected absolute http(s) URL without path/query/fragment")
	}
	return nil
}

func runServe(cfg ServeConfig, stdout io.Writer, stderr io.Writer) int {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := OpenDB(ctx, cfg.DBPath)
	if err != nil {
		_, _ = io.WriteString(stderr, "err: invalid_db: cannot open sqlite database\n")
		return 2
	}
	defer func() { _ = db.Close() }()

	if err := RunMigrations(ctx, db); err != nil {
		_, _ = fmt.Fprintf(stderr, "err: migration_failed: %v\n", err)
		return 1
	}

	resolution, err := ResolveOwnerToken(ctx, db, cfg.OwnerToken)
	if err != nil {
		_, _ = io.WriteString(stderr, "err: invalid_owner_token: expected at least 32 visible non-whitespace characters\n")
		return 2
	}
	if resolution.WasGenerated {
		_, _ = fmt.Fprintf(stdout, "owner token generated: %s\n", resolution.GeneratedPlaintextToken)
	} else if resolution.WasExplicit {
		_, _ = io.WriteString(stdout, "owner token explicit: stored hash\n")
	} else {
		_, _ = io.WriteString(stdout, "owner token reused: stored hash\n")
	}

	llm := NewOpenRouterClient(OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel, Endpoint: deterministicOpenRouterEndpointForE2E()})
	runtimeCfg := HTTPServerConfig{Addr: cfg.Addr, PublicURL: strings.TrimRight(cfg.PublicURL, "/"), DB: db, OwnerToken: activePlaintextToken(cfg, resolution), OwnerTokenHash: resolution.TokenHash, LLM: llm}
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	errCh := make(chan error, 1)
	go func() {
		errCh <- ServeHTTPAndIngestRuntime(runCtx, runtimeCfg, func(ctx context.Context) error {
			return RunIngestLoop(ctx, db, IngestConfig{LLM: llm})
		})
	}()

	_, _ = fmt.Fprintf(stdout, "serving ResoFeed on %s (public-url %s)\n", cfg.Addr, runtimeCfg.PublicURL)
	select {
	case <-ctx.Done():
		cancel()
		if err := <-errCh; err != nil {
			_, _ = fmt.Fprintf(stderr, "err: shutdown_failed: %v\n", err)
			return 1
		}
		_, _ = io.WriteString(stdout, "shutdown complete\n")
		return 0
	case err := <-errCh:
		cancel()
		if err != nil {
			_, _ = fmt.Fprintf(stderr, "err: runtime_failed: %v\n", err)
			return 1
		}
		return 0
	}
}

func deterministicOpenRouterEndpointForE2E() string {
	if os.Getenv("RESOFEED_E2E") != "1" {
		return ""
	}
	return strings.TrimSpace(os.Getenv("RESOFEED_E2E_OPENROUTER_ENDPOINT"))
}

func activePlaintextToken(cfg ServeConfig, resolution OwnerTokenResolution) string {
	if cfg.OwnerToken != "" {
		return cfg.OwnerToken
	}
	return resolution.GeneratedPlaintextToken
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
