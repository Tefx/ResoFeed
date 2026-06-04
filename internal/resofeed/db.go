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
	"sync"
	"syscall"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

// Main is the CLI handoff for the single Go binary. It recognizes the runtime
// `serve` command plus the documented offline owner-token reset grammar. It
// must not add migrate, worker, doctor, admin, or sync processes.
func Main(args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" || args[0] == "help" {
		printRootHelp(stdout)
		return 0
	}
	switch args[0] {
	case "serve":
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
		openRouterSecret, hasOpenRouterSecret, err := ResolveOpenRouterRuntimeSecretOptional()
		if err != nil {
			_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
			return 2
		}
		if hasOpenRouterSecret {
			cfg.OpenRouterKey = openRouterSecret.Value
			cfg.OpenRouterKeySource = openRouterSecret.Source
		}
		if err := validateServeConfig(cfg); err != nil {
			_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
			return 2
		}
		return runServe(cfg, stdout, stderr)
	case "owner-token":
		cfg, exitCode, ok := parseOwnerTokenResetFlags(args[1:], stdout, stderr)
		if !ok {
			return exitCode
		}
		return runOwnerTokenReset(cfg, stderr)
	default:
		_, _ = fmt.Fprintf(stderr, "err: unknown_command: %s\n", args[0])
		return 2
	}
}

func printRootHelp(w io.Writer) {
	_, _ = io.WriteString(w, `Usage: resofeed <command>

Commands:
  serve    Start web UI, JSON HTTP API, MCP endpoint, SQLite, and background ingest.
  owner-token reset --db PATH --confirm-reset
           Offline command for deleting only the stored owner-token hash.

Run "resofeed serve --help" or "resofeed owner-token reset --help" for flags.
`)
}

// OwnerTokenResetConfig pins the offline CLI grammar for deleting only
// runtime_metadata key owner_token_sha256 from the selected offline SQLite DB.
type OwnerTokenResetConfig struct {
	DBPath       string
	ConfirmReset bool
}

func parseOwnerTokenResetFlags(args []string, stdout io.Writer, stderr io.Writer) (OwnerTokenResetConfig, int, bool) {
	if len(args) == 0 || args[0] != "reset" {
		_, _ = io.WriteString(stderr, "err: unknown_command: expected owner-token reset\n")
		return OwnerTokenResetConfig{}, 2, false
	}
	cfg := OwnerTokenResetConfig{}
	fs := flag.NewFlagSet("owner-token reset", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&cfg.DBPath, "db", "", "required offline SQLite database path")
	fs.BoolVar(&cfg.ConfirmReset, "confirm-reset", false, "required confirmation for deleting only owner_token_sha256")
	fs.Usage = func() {
		_, _ = io.WriteString(stdout, `Usage: resofeed owner-token reset --db PATH --confirm-reset

Runs the documented offline owner-token reset command. It
deletes only runtime_metadata.key='owner_token_sha256' while serve is stopped.

It must not start serve, bind HTTP/MCP, run UI, generate, print, accept, or
store a replacement plaintext token. Replacement token setup remains solely in
the existing serve startup paths.

Flags:
`)
		fs.SetOutput(stdout)
		fs.PrintDefaults()
		fs.SetOutput(stderr)
	}
	if err := fs.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return OwnerTokenResetConfig{}, 0, false
		}
		return OwnerTokenResetConfig{}, 2, false
	}
	if fs.NArg() != 0 {
		_, _ = fmt.Fprintf(stderr, "err: unexpected_argument: %s\n", fs.Arg(0))
		return OwnerTokenResetConfig{}, 2, false
	}
	if cfg.DBPath == "" {
		_, _ = io.WriteString(stderr, "err: invalid_owner_token_reset: --db is required\n")
		return OwnerTokenResetConfig{}, 2, false
	}
	if !cfg.ConfirmReset {
		_, _ = io.WriteString(stderr, "err: invalid_owner_token_reset: --confirm-reset is required\n")
		return OwnerTokenResetConfig{}, 2, false
	}
	return cfg, 0, true
}

func runOwnerTokenReset(cfg OwnerTokenResetConfig, stderr io.Writer) int {
	ctx := context.Background()
	if err := resetOwnerTokenHash(ctx, cfg.DBPath); err != nil {
		_, _ = io.WriteString(stderr, "err: invalid_db: cannot open sqlite database\n")
		return 2
	}
	return 0
}

func resetOwnerTokenHash(ctx context.Context, dbPath string) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("reset owner token hash: %w", err)
	}
	if dbPath == "" {
		return fmt.Errorf("reset owner token hash: db path required")
	}
	info, err := os.Stat(dbPath)
	if err != nil {
		return fmt.Errorf("stat sqlite database: %w", err)
	}
	if info.IsDir() {
		return fmt.Errorf("stat sqlite database: path is directory")
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("open sqlite database: %w", err)
	}
	defer func() { _ = db.Close() }()
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping sqlite database: %w", err)
	}
	if _, err := db.ExecContext(ctx, `delete from runtime_metadata where key = 'owner_token_sha256'`); err != nil {
		return fmt.Errorf("delete owner token hash: %w", err)
	}
	return nil
}

func parseServeFlags(args []string, stdout io.Writer, stderr io.Writer) (ServeConfig, int, bool) {
	firstFetchLimit, err := firstFetchLimitFromEnv()
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
		return ServeConfig{}, 2, false
	}
	cfg := ServeConfig{Addr: DefaultAddr, DBPath: DefaultDBPath, FirstFetchMaxItems: firstFetchLimit}
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&cfg.Addr, "addr", DefaultAddr, "bind address for web UI, HTTP API, and MCP endpoint")
	fs.StringVar(&cfg.PublicURL, "public-url", "", "public base URL for external agents")
	fs.StringVar(&cfg.DBPath, "db", DefaultDBPath, "SQLite database path")
	fs.StringVar(&cfg.OpenRouterModel, "openrouter-model", "", "optional OpenRouter model (empty uses account default)")
	fs.StringVar(&cfg.OwnerToken, "owner-token", "", "explicit owner token")
	fs.Var((*firstFetchLimitFlag)(&cfg.FirstFetchMaxItems), "first-fetch-limit", "maximum items to store on a brand-new source's first fetch; 0 means unlimited")
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
		if strings.Contains(err.Error(), "first-fetch-limit") {
			_, _ = fmt.Fprintf(stderr, "err: %s\n", err.Error())
		}
		return ServeConfig{}, 2, false
	}
	if fs.NArg() != 0 {
		_, _ = fmt.Fprintf(stderr, "err: unexpected_argument: %s\n", fs.Arg(0))
		return ServeConfig{}, 2, false
	}
	return cfg, 0, true
}

type firstFetchLimitFlag int

func (f *firstFetchLimitFlag) String() string {
	if f == nil {
		return strconv.Itoa(DefaultFirstFetchMaxItems)
	}
	return strconv.Itoa(int(*f))
}

func (f *firstFetchLimitFlag) Set(raw string) error {
	value, err := parseFirstFetchLimitValue(raw, "first-fetch-limit")
	if err != nil {
		return err
	}
	*f = firstFetchLimitFlag(value)
	return nil
}

func firstFetchLimitFromEnv() (int, error) {
	raw, ok := os.LookupEnv("RESOFEED_FIRST_FETCH_LIMIT")
	if !ok {
		return DefaultFirstFetchMaxItems, nil
	}
	return parseFirstFetchLimitValue(raw, "RESOFEED_FIRST_FETCH_LIMIT")
}

func parseFirstFetchLimitValue(raw string, source string) (int, error) {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, fmt.Errorf("invalid_first_fetch_limit: %s must be an integer from 0 to %d", source, MaxFirstFetchMaxItems)
	}
	if value < 0 || value > MaxFirstFetchMaxItems {
		return 0, fmt.Errorf("invalid_first_fetch_limit: %s must be between 0 and %d", source, MaxFirstFetchMaxItems)
	}
	return value, nil
}

func validateServeConfig(cfg ServeConfig) error {
	if err := validateServeConfigBeforeSecret(cfg); err != nil {
		return err
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
	if cfg.FirstFetchMaxItems < 0 || cfg.FirstFetchMaxItems > MaxFirstFetchMaxItems {
		return fmt.Errorf("invalid_first_fetch_limit: first-fetch-limit must be between 0 and %d", MaxFirstFetchMaxItems)
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

	var llm LLMClient
	if strings.TrimSpace(cfg.OpenRouterKey) != "" {
		llm = NewOpenRouterClient(OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel, Endpoint: deterministicOpenRouterEndpointForE2E()})
	}
	runtimeCfg := HTTPServerConfig{Addr: cfg.Addr, PublicURL: strings.TrimRight(cfg.PublicURL, "/"), DB: db, OwnerToken: activePlaintextToken(cfg, resolution), OwnerTokenHash: resolution.TokenHash, LLM: llm, OpenRouter: OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel, Endpoint: deterministicOpenRouterEndpointForE2E()}, FirstFetchMaxItems: cfg.FirstFetchMaxItems, FirstFetchMaxItemsSet: true}
	runtimeCfg.Lifecycle = &serveStartupConsoleLifecycle{stdout: stdout, cfg: cfg, publicURL: runtimeCfg.PublicURL, resolution: resolution}
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	errCh := make(chan error, 1)
	go func() {
		errCh <- ServeHTTPAndIngestRuntime(runCtx, runtimeCfg, func(ctx context.Context) error {
			return RunIngestLoop(ctx, db, IngestConfig{LLM: llm, FirstFetchMaxItems: cfg.FirstFetchMaxItems, FirstFetchMaxItemsSet: true})
		})
	}()

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

type serveStartupConsoleLifecycle struct {
	stdout     io.Writer
	cfg        ServeConfig
	publicURL  string
	resolution OwnerTokenResolution
	once       sync.Once
}

func (l *serveStartupConsoleLifecycle) RecordRuntimeLifecycleEvent(event RuntimeLifecycleEvent) {
	if event != RuntimeLifecycleIngestStart {
		return
	}
	l.once.Do(func() {
		printServeStartupConsole(l.stdout, l.cfg, l.publicURL, l.resolution)
	})
}

func printServeStartupConsole(w io.Writer, cfg ServeConfig, publicURL string, resolution OwnerTokenResolution) {
	ownerStatus := "reused"
	if resolution.WasExplicit {
		ownerStatus = "explicit"
	} else if resolution.WasGenerated {
		ownerStatus = "generated"
	}
	model := strings.TrimSpace(cfg.OpenRouterModel)
	if model == "" {
		model = "account default"
	}

	_, _ = io.WriteString(w, "RESOFEED serve\n")
	_, _ = fmt.Fprintf(w, "owner-token: %s\n", ownerStatus)
	_, _ = io.WriteString(w, "auth: owner-token required\n\n")
	_, _ = fmt.Fprintf(w, "http: listening on %s\n", cfg.Addr)
	_, _ = fmt.Fprintf(w, "public-url: %s\n", publicURL)
	_, _ = io.WriteString(w, "ui: mounted\n")
	_, _ = io.WriteString(w, "api: enabled\n")
	_, _ = io.WriteString(w, "mcp: /mcp\n")
	if endpoint := mcpEndpointFromPublicURL(publicURL); endpoint != "" {
		_, _ = fmt.Fprintf(w, "mcp-public-url: %s\n", endpoint)
	}
	_, _ = io.WriteString(w, "\n")
	_, _ = fmt.Fprintf(w, "sqlite: %s\n", safeSQLiteStartupLabel(cfg.DBPath))
	_, _ = io.WriteString(w, "migrations: ok\n")
	_, _ = fmt.Fprintf(w, "first-fetch-limit: %s\n", firstFetchLimitDisplay(cfg.FirstFetchMaxItems))
	_, _ = io.WriteString(w, "ingest: started\n\n")
	_, _ = io.WriteString(w, "llm: openrouter\n")
	if strings.TrimSpace(cfg.OpenRouterKey) == "" {
		_, _ = io.WriteString(w, "openrouter-key: unavailable\n")
	} else {
		_, _ = io.WriteString(w, "openrouter-key: configured\n")
	}
	_, _ = fmt.Fprintf(w, "model: %s\n", model)
	if strings.TrimSpace(cfg.OpenRouterModel) == "" {
		_, _ = io.WriteString(w, "model-note: no --openrouter-model supplied; OpenRouter account default will be used\n")
	}
}

func safeSQLiteStartupLabel(dbPath string) string {
	if dbPath == ":memory:" {
		return "memory"
	}
	return "configured local file"
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
