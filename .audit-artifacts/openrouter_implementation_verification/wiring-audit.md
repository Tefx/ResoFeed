# OpenRouter Wiring Audit Report

status: FAIL
verdict: FAIL

## Headline
OpenRouter is statically reachable from `cmd/resofeed` through `resofeed.Main` and the single `serve` runtime, and the runtime secret resolver is reused. Gate should not open because production runtime still constructs a Gemini-named concrete adapter (`geminiHTTPClient`) and retains production Gemini compatibility symbols in the live OpenRouter adapter file.

## Protocol Checklist
| Protocol | Result | Evidence |
|---|---|---|
| W13 Entry-to-Effect Trace | wired with residue | `cmd/resofeed/main.go:12-13` -> `internal/resofeed/db.go:31-62` -> `db.go:44-49` -> `db.go:190-198` -> `http.go:97-102` -> `http.go:145-150` / `ingest.go:333` |
| W1 Dead Export Scan | partial | `NewOpenRouterClient` runtime-called at `db.go:190`; `GeminiClient` alias in `gemini.go:23-25` has no runtime caller evidence |
| W2 Schema Field Trace | wired | `ServeConfig.OpenRouterKey/OpenRouterModel` in `types.go:24-25`; written in `db.go:49` and flag parse `db.go:82`; consumed in `db.go:190` |
| W3 CLI Param E2E Coverage | partial | `--openrouter-model` registered `db.go:82`; no OpenRouter API key flag in `parseServeFlags`; tests document behavior in `openrouter_cli_adapter_contract_test.go` |
| W4 CLI Command Registration | wired | single command guard `db.go:31-40`; `cmd/resofeed/main.go:12-13` delegates to `resofeed.Main` |
| W5 Contract Strength Scan | n/a | Go project; no `@pre/@post` contracts found in scoped source review |
| W6 Config Field Consumption | wired | key/model consumed by `NewOpenRouterClient(OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel})` at `db.go:190` |
| W7 Escape Hatch Concentration | pass | no `@invar:allow` found in relevant Go source review |
| W8 Dependency-Import Alignment | not fully audited | scope focused on OpenRouter wiring; no new dependency claim found from OpenRouter adapter beyond stdlib HTTP |
| W8b Undeclared Import Dependencies | not fully audited | no app/test execution or module dependency audit requested/run |
| W9 Transitive Entry-Point Reachability | wired | traced from `cmd/resofeed/main.go` through runtime startup to HTTP listen and ingest LLM call |
| W10 Protocol Shadow Detection | fail | `NewOpenRouterClient` returns `&geminiHTTPClient` in production (`gemini.go:33-45`), a legacy-shadow name in the live adapter |
| W11 Type Cast Authenticity | pass | `DoctorConfigFromLLM` only type-asserts non-secret status interface (`doctor.go:27-40`); no casts laundering stubs found |
| W12 Frontend Route-Render Integrity | n/a | task targets runtime LLM wiring, not frontend route render |

## Findings

### BLOCKER: Gemini-named concrete adapter remains in production serve path
- Severity: blocker
- Call Chain: `cmd/resofeed/main.go:12-13` -> `internal/resofeed/db.go:31-62` -> `db.go:190 NewOpenRouterClient(...)` -> `internal/resofeed/gemini.go:34-42 returns &geminiHTTPClient` -> `db.go:196-198 RunIngestLoop(... IngestConfig{LLM: llm})` -> `ingest.go:333 llm.SummarizeItem(...)`
- Evidence: `internal/resofeed/gemini.go:23-25` retains `GeminiClient`; `gemini.go:34-45` constructs `geminiHTTPClient`; `gemini.go:270-275` retains `geminiContent` / `geminiPart` in OpenRouter response parsing.
- Impact: violates gate language requiring no Gemini runtime wiring/residue. Even if endpoint is OpenRouter, the concrete production adapter and response-shape fallback still shadow Gemini naming/protocol.
- Smallest verification check: static grep for `Gemini|gemini` under non-test `internal/resofeed/*.go` must return none except explicitly documented non-runtime migration notes, and `NewOpenRouterClient` should return an OpenRouter-named concrete type only.

## Uncertainty Register
- Static-only audit; no tests/app execution per task constraints.
- `OPENROUTER_API_KEY` is mentioned in task as possibly applicable, but locked docs in this worktree state `OPENROUTER_KEY` only (`docs/ARCHITECTURE.md:73`, `docs/USAGE.md:54`).
- AGENTS.md was required if present/tracked but is absent in the isolated worktree root; `.agents/instructions.md` was read instead.

## Recommended Verification Checks
- `grep -R "Gemini\|gemini" internal/resofeed --include='*.go' | grep -v _test.go` after remediation.
- `go test ./internal/resofeed -run 'OpenRouter|RuntimeSecret|RuntimeWires'` by orchestrator/implementer after static blocker is fixed.
- `resofeed serve --help` with `OPENROUTER_KEY=<redacted>` should list `--openrouter-model` and not list any API-key or Gemini flags.
