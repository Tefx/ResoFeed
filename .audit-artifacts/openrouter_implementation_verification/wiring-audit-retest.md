# OpenRouter Wiring Audit Retest

status: PASS
verdict: PASS
step_intent: retest_green
expected_result: green
observed_result: green
failure_alignment: n/a
gate_open_allowed: true
product_implementation_files_modified: false

## Headline
OpenRouter remediation is statically wired through the single `resofeed serve` binary. The prior blocker from `.audit-artifacts/openrouter_implementation_verification/wiring-audit.md` is resolved: production runtime no longer contains `GeminiClient`, `geminiHTTPClient`, `geminiContent`, or `geminiPart`, and `NewOpenRouterClient` constructs `openRouterHTTPClient`.

## Protocol Checklist
| Protocol | Result | Evidence |
|---|---|---|
| W13 Entry-to-Effect Trace | wired | `cmd/resofeed/main.go:12-13` -> `internal/resofeed/db.go:31-62` -> `db.go:44-49` runtime secret -> `db.go:190` OpenRouter adapter -> `db.go:196-198` HTTP+ingest runtime -> `http.go:97-102` real `net.Listen` and `ingest.go:333` LLM call. |
| W1 Dead Export Scan | pass | `NewOpenRouterClient` runtime-called at `db.go:190`; `LLMClient` consumed by HTTP/MCP/ingest/steering. |
| W2 Schema Field Trace | pass | `ServeConfig.OpenRouterKey/OpenRouterModel` in `types.go:24-25`; key assigned `db.go:49`; model flag `db.go:82`; both consumed `db.go:190`. |
| W3 CLI Param E2E Coverage | pass static | `--openrouter-model` registered as non-secret setting only; no CLI API-key flag declaration in `parseServeFlags`. Behavioral tests exist but were not executed by audit constraint. |
| W4 CLI Command Registration | pass | `cmd/resofeed/main.go:13` delegates to `resofeed.Main`; only `serve` accepted in `db.go:31-40`. |
| W5 Contract Strength Scan | n/a | Go project; no `@pre/@post` contracts in scoped source. |
| W6 Config Field Consumption | pass | OpenRouter key/model consumed by adapter construction at `db.go:190`; state export/import grep found tests guarding non-persistence. |
| W7 Escape Hatch Concentration | pass | No `@invar:allow` found in scoped source during previous/current static review. |
| W8 Dependency-Import Alignment | pass | OpenRouter adapter uses stdlib `net/http`; `go.mod` declares SQLite dependency used by runtime. |
| W8b Undeclared Import Dependencies | pass static | No new non-stdlib OpenRouter import found; no app/test execution run. |
| W9 Transitive Entry-Point Reachability | pass | One-hop and transitive chain reaches `net.Listen`, HTTP/MCP router, and `RunIngestLoop` from `cmd/resofeed`. |
| W10 Protocol Shadow Detection | pass | Production grep for Gemini legacy symbols and stub names returned none. |
| W11 Type Cast Authenticity | pass with note | `DoctorConfigFromLLM` type-asserts only non-secret status interface; no stub laundering found. |
| W12 Frontend Route-Render Integrity | n/a | Task targets OpenRouter runtime wiring, not frontend route render. |

## Required Checks

### 1. Export/reachability
Call chain: `cmd/resofeed/main.go:13` -> `resofeed.Main` -> `ResolveOpenRouterRuntimeSecret` -> `NewOpenRouterClient` -> `ServeHTTPAndIngestRuntime` and `RunIngestLoop` -> `llm.SummarizeItem`; HTTP/MCP steering uses the same `LLMClient` via `ApplySteering`.

### 2. CLI/env registration
`OPENROUTER_KEY` is the only locked runtime secret name in production resolver; `--openrouter-model` is retained as a non-secret setting; no required CLI API-key flag exists; Gemini flags are absent from flag registration.

### 3. Config consumption
`OpenRouterKey` and `OpenRouterModel` flow to `OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel}`. Static search found persistence/export references only in tests/docs guarding exclusion, not product state writes.

### 4. Contract consumption
Docs and tests use OpenRouter endpoint/model/env semantics: `docs/ARCHITECTURE.md:69-83`, `docs/USAGE.md:33-70`, and OpenRouter-specific contract tests under `internal/resofeed/*openrouter*_test.go`.

### 5. Stub detection
Production grep found no `_Runtime*`, `_Stub*`, `_Placeholder*`, `GeminiClient`, `geminiHTTPClient`, `geminiContent`, or `geminiPart` symbols in non-test serve path.

### 6. Transport parity
HTTP route `/api/steer` and MCP `steer` both call `ApplySteering` with the shared `LLMClient`; `/api/doctor` and `resofeed://system/doctor` both call `WriteDoctorWithConfig(... DoctorConfigFromLLM(...))`.

### 7. Secret foundation reuse
Runtime startup uses `ResolveOpenRouterRuntimeSecret()` before adapter construction; resolver centralizes OS env > `.env` fallback.

### 8. Retest fingerprint
Prior blocker resolved: production non-test grep for Gemini runtime residue returned no matches; `NewOpenRouterClient` now returns `&openRouterHTTPClient`.

## Evidence excerpts
```text
ENTRY_TO_EFFECT
cmd/resofeed/main.go:12:func main() {
internal/resofeed/runtime_secret.go:16:func ResolveOpenRouterRuntimeSecret() (string, error) {
internal/resofeed/db.go:31:func Main(args []string, stdout io.Writer, stderr io.Writer) int {
internal/resofeed/db.go:44: openRouterKey, err := ResolveOpenRouterRuntimeSecret()
internal/resofeed/db.go:190: llm := NewOpenRouterClient(OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel})
internal/resofeed/db.go:196: errCh <- ServeHTTPAndIngestRuntime(runCtx, runtimeCfg, func(ctx context.Context) error {
internal/resofeed/db.go:197: return RunIngestLoop(ctx, db, IngestConfig{LLM: llm})
internal/resofeed/http.go:97:func ServeHTTPAndIngestRuntime(ctx context.Context, cfg HTTPServerConfig, runIngest func(context.Context) error) error {
internal/resofeed/http.go:98: listener, err := net.Listen("tcp", cfg.Addr)
internal/resofeed/ingest.go:333: out, err := llm.SummarizeItem(ctx, OpenRouterSummaryInput{...})
internal/resofeed/ranking.go:114: translated, err := llm.TranslateSteering(ctx, OpenRouterSteeringInput{...})
```

```text
CLI_FLAG_DECLS
internal/resofeed/db.go:77: fs := flag.NewFlagSet("serve", flag.ContinueOnError)
internal/resofeed/db.go:79: fs.StringVar(&cfg.Addr, "addr", DefaultAddr, ...)
internal/resofeed/db.go:80: fs.StringVar(&cfg.PublicURL, "public-url", "", ...)
internal/resofeed/db.go:81: fs.StringVar(&cfg.DBPath, "db", DefaultDBPath, ...)
internal/resofeed/db.go:82: fs.StringVar(&cfg.OpenRouterModel, "openrouter-model", "", "optional OpenRouter model (empty uses account default)")
internal/resofeed/db.go:83: fs.StringVar(&cfg.OwnerToken, "owner-token", "", "explicit owner token")
```

```text
GEMINI_PROD
<none found by rg -n 'GeminiClient|geminiHTTPClient|geminiContent|geminiPart|Gemini|gemini' cmd internal/resofeed --glob '*.go' --glob '!**/*_test.go'>

GEMINI_FALLBACK_PROD
<none found by rg -n 'GEMINI_API_KEY|gemini-2|googleapis|generativelanguage|Gemini' cmd internal/resofeed --glob '*.go' --glob '!**/*_test.go'>

STUB_PROD
<none found by rg -n '_Runtime|_Stub|_Placeholder|Stub|Placeholder|hardcoded model|fake runtime|fake-openrouter-runtime-key' cmd internal/resofeed --glob '*.go' --glob '!**/*_test.go'>
```

## Uncertainty Register
- Static-only audit per instruction; no `go test`, `go build`, or app execution performed.
- `OPENROUTER_API_KEY` appears only as future/optional language in instructions/prior artifact and a negative test assertion; locked docs in this worktree accept only `OPENROUTER_KEY`.
- Test helper/type names still contain Gemini in `_test.go` files; task fingerprint only forbids non-test runtime symbols.

## Recommended Verification Checks
- Orchestrator/implementer may run `go test ./...` after this static retest.
- A runtime smoke with redacted `OPENROUTER_KEY=<redacted>` should verify startup and `/api/doctor` `openrouter:` status without printing secrets.
