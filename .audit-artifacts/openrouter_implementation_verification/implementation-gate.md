# OpenRouter Implementation Gate Review

step_intent: retest_green  
expected_result: green  
observed_result: green  
verdict: PASS  
headline: PASS_WITH_DEBT  
proof_gap_status: NONE  
blocking_status: CLOSED  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE

**Reviewer**: gate-reviewer (independent auditor)  
**Phase**: openrouter-llm-implementation

## Blocking Status

No blocker-class finding remains after independent artifact review, source sampling, all-Go test execution, CLI surface checks, and a real `./bin/resofeed serve` liveness probe against `/api/doctor`, `/`, and `/mcp`.

## Proof-Gap Status

None. Runtime proof includes real built entrypoint execution and HTTP response excerpts. Mock-heavy OpenRouter adapter tests are balanced by `serve-liveness-probe.md` and an independent liveness probe in this review.

## Non-blocking Debt / Warning

- `.agents/instructions.md` still contains stale Gemini-era operational guidance (Gemini secret precedence and transitional CLI secret flag language). This is not product code, not product docs, not CLI/runtime behavior, and is superseded by `docs/ARCHITECTURE.md` OpenRouter-only contract, but it should be refreshed to avoid future agent confusion.

## Evidence Summary

- `go test ./...` returned green: `ok resofeed/internal/resofeed 0.673s`; `cmd/resofeed` has no test files.
- `mkdir -p ./bin && go build -o ./bin/resofeed ./cmd/resofeed` succeeded.
- CLI surface check showed root help, serve help with `--openrouter-model`, `--owner-token`, `--addr`, `--public-url`, `--db`, and legacy `--gemini-api-key` rejected with exit code 2.
- Real liveness probe started `./bin/resofeed serve` with redacted `OPENROUTER_KEY`, reached authenticated `GET /api/doctor` HTTP 200 `text/plain`, UI root HTTP 200 HTML, and unauthenticated `/mcp` HTTP 401 JSON `owner token required`.
- Scoped non-test source/docs scan found no Gemini residue in product runtime code; remaining Gemini text is in `.agents/instructions.md` and tests only.
- Scoped escape-hatch scan of `cmd`, `internal/resofeed`, `web`, `docs`, `.agents`, and relevant audit artifacts found no source `@invar:allow`; only audit text states prior scan results.

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
|---|---|---|---|---|---|---|
| G1 expected-red tests green | OpenRouter CLI/adapter/product tests are green after implementation | `go test ./...` | reviewer command: `go test ./...` -> green; required tests in `internal/resofeed/*openrouter*_test.go` reviewed | PASS | none | all available Go tests pass |
| G2 wiring audit | Reachability, CLI/env registration, config consumption, contracts, stub detection, parity, secret resolver reuse, fingerprint closure are mapped | artifact plus source sampling | `wiring-audit-retest.md:15-57`; `db.go:44-49,75-83,190-198`; `openrouter.go:29-38`; `doctor.go:32-40` | PASS | none | W1-W8/W13 evidence present and sampled |
| G3 liveness | Actual `resofeed serve` starts and reaches runtime `/doctor` path | real entrypoint command | `serve-liveness-probe.md:56-80`; reviewer liveness command output | PASS | none | independent process bound TCP and served HTTP |
| G4 UI/UX visible output | `/doctor` output is terse text, OpenRouter-prefixed, no Gemini or secrets | runtime-visible excerpts | `uiux-doctor-diagnostics-audit-retest.md:25-57`; reviewer liveness doctor body | PASS | none | visible text matches DESIGN/ARCH contract |
| G5 Gemini removal | No Gemini CLI compatibility flag accepted; no runtime `gemini:` output | CLI rejection and scans | reviewer CLI check exit_code=2; non-test runtime scan no product code matches | PASS_WITH_WARNING | refresh stale `.agents` wording later | actual runtime/CLI compliant; stale agent guidance non-intersecting |
| G6 secret handling | OpenRouter key is runtime-only; not printed in logs/doctor or state export/import | logs/HTTP excerpts and tests | `runtime_secret.go:16-35`; `openrouter_product_integration_contract_test.go:152-252`; reviewer liveness redacted logs | PASS | none | no raw key or source metadata in observed output |
| G7 architecture boundaries | No provider registry, DI container, sidecar, repository layer, vector DB, RAG, OAuth/RBAC/accounts, sync/merge portability | scans and docs/source | `ARCHITECTURE.md:11-19,169-175`; reviewer boundary scan only found prohibition comments | PASS | none | sampled code preserves one binary/SQLite/lexical shape |
| G8 HTTP/MCP parity + owner token | HTTP and MCP share product operations and owner-token boundary | tests and live `/mcp` auth response | `openrouter_product_integration_contract_test.go:84-108,286-316`; reviewer `/mcp` 401 | PASS | none | parity tests pass; MCP is protected |

## Wiring Audit Results (W1-W8)

- W1 Reachability/dead export: PASS — `NewOpenRouterClient` is runtime-called from `db.go:190` and consumed by ingest/HTTP/MCP paths.
- W2 CLI/env registration: PASS — `--openrouter-model` registered in `db.go:82`; no OpenRouter CLI API-key flag; `OPENROUTER_KEY` resolver in `runtime_secret.go:11-27`.
- W3 Config consumption: PASS — resolved key and optional model flow into `OpenRouterConfig{APIKey: cfg.OpenRouterKey, Model: cfg.OpenRouterModel}` at `db.go:190`.
- W4 Contract consumption: PASS — docs and tests encode OpenRouter endpoint/model/env/doctor/state rules.
- W5 Stub detection: PASS — retest artifact reports no production `_Runtime`, `_Stub`, `_Placeholder`, Gemini legacy symbols, or fake runtime keys.
- W6 HTTP/MCP parity: PASS — `/api/steer` and MCP `steer` use shared `ApplySteering`; doctor shared via `WriteDoctorWithConfig`.
- W7 Secret resolver reuse: PASS — startup resolves `OPENROUTER_KEY` before adapter construction and does not persist source metadata.
- W8 Remediation fingerprint closure: PASS — previous `geminiHTTPClient`/`GeminiClient` blocker closed; product runtime source scan found no Gemini matches.

## CLI Surface Preservation Matrix

| Command/Flag Surface | Surface Listed? | Handler Exists? | --help Works? | Smoke Test | Status |
|---|---|---|---|---|---|
| `resofeed --help` | yes | yes, `Main` root help | yes | printed only `serve` command | PASS |
| `resofeed serve --help` | yes | yes, `parseServeFlags` | yes | listed `--addr`, `--public-url`, `--db`, `--openrouter-model`, `--owner-token` | PASS |
| `resofeed serve` | yes | yes, `runServe` | n/a | bound `127.0.0.1:18118` and served `/api/doctor` | PASS |
| `--openrouter-model` | yes | yes | yes | help listed non-secret optional model | PASS |
| legacy `--gemini-api-key` | no | no | n/a | rejected with exit code 2, value not echoed | PASS |
| legacy `--gemini-model` | no | no | n/a | contract test covers rejection; help omits it | PASS |

## Runnable Surface / Liveness Evidence

Independent reviewer command built `./bin/resofeed` from `./cmd/resofeed`, then started the real process:

```text
started_port=True
doctor_status=200
doctor_content_type=text/plain; charset=utf-8
doctor_body=
rss: ok
openrouter: ok configured_model=account_default resolved_model=unknown
extraction: ok
ingest: last_run=never

/ status=200 content_type=text/html; charset=utf-8
/mcp status=401 content_type=application/json; charset=utf-8 body_excerpt='{"error":{"code":"unauthorized","message":"owner token required","details":{}}}\n'
process_exit=0
stdout=
owner token explicit: stored hash
serving ResoFeed on 127.0.0.1:18118 (public-url http://127.0.0.1:18118)
shutdown complete
```

## Real Integration vs Fixture Evidence

- Real serve/HTTP/MCP: `serve-liveness-probe.md` and this review both ran the built `resofeed serve` entrypoint, bound TCP, served `/api/doctor`, served static `/`, and exposed `/mcp` behind owner-token auth.
- Runtime integration test: `openrouter_runtime_wiring_test.go` starts `serveHTTPAndIngestRuntimeOnListener`, ingests through a fake model server, then reads HTTP and MCP doctor surfaces.
- Fixture/fake-server tests: adapter request/retry/response validation in `openrouter_cli_adapter_contract_test.go` and product behavior in `openrouter_product_integration_contract_test.go` use `httptest`/fake LLMs; acceptable because liveness evidence covers the real process path.

## Escape Hatch Audit

No source `@invar:allow` annotations found in scoped product/docs/web scan. Matches in relevant audit artifacts only describe prior no-match scan results and are not implementation escape hatches.

## Execution Review

| Step ID | Status | Evidence Quality | Concerns |
|---|---|---|---|
| serve-liveness-probe | PASS | Strong: built binary, real `resofeed serve`, HTTP `/api/doctor`, `/`, `/mcp`, redaction checks | initial cold web build needed install; non-blocking |
| uiux-doctor-diagnostics-audit-retest | PASS | Strong: runtime-visible `/api/doctor`, auth error, startup validation excerpts | none blocking |
| wiring-audit-retest | PASS | Strong static trace with W mapping and remediation fingerprint closure | static-only, but balanced by liveness/tests |
| implementation-gate | PASS_WITH_DEBT | Strong: independent tests/build/CLI/liveness/scans | stale `.agents` Gemini guidance warning |

## Gate Decision

- OPEN or BLOCKED: OPEN
- Rationale: all blocker-class runtime, secret, state, Gemini-removal, UIUX, CLI surface, liveness, architecture, and HTTP/MCP parity obligations are proven by artifacts plus independent commands. Remaining `.agents` wording debt does not intersect product runtime or the next live-smoke gate.

## Blocking Checks

- Gemini compatibility/text residue: PASS_WITH_WARNING — actual CLI rejects legacy flag and runtime output/scoped product source scan has no Gemini; `.agents/instructions.md` stale non-product guidance remains.
- Secret persistence/export/printing: PASS — tests and runtime logs/doctor excerpts show no raw key/source metadata; state tests guard export/import.
- Runnable surface evidence: PASS — real entrypoint `./bin/resofeed serve` bound and served `/api/doctor`, `/`, `/mcp`.
- Architecture boundary: PASS — no sidecar/registry/vector/RAG/OAuth/sync implementation found in sampled product source.
- HTTP/MCP parity and owner-token boundary: PASS — tests cover parity and liveness showed `/mcp` 401 without auth.
- UIUX visible-output compliance: PASS — retest and reviewer liveness show raw terse `/doctor`, one OpenRouter line, no secrets.

## Commands Run

```text
git -C .vectl/worktrees/openrouter-llm-implementation.implementation-gate status --short --branch
go test ./...                         # PASS
mkdir -p ./bin && go build -o ./bin/resofeed ./cmd/resofeed  # PASS
./bin/resofeed --help                  # PASS
./bin/resofeed serve --help            # PASS
OPENROUTER_KEY=<redacted> ./bin/resofeed serve --gemini-api-key <redacted> ... # exit_code=2 PASS
OPENROUTER_KEY=<redacted> ./bin/resofeed serve --addr 127.0.0.1:18118 ...     # PASS, /api/doctor 200
rg scans for Gemini residue, escape hatches, architecture boundary terms, secret persistence terms # PASS/WARN as described
```

## Issues Found

| Severity | Description | Location | Reproduction |
|---|---|---|---|
| Warning | Stale agent instruction text still describes Gemini secret precedence and transitional Gemini CLI flag policy despite OpenRouter-only product docs/runtime. Non-blocking because it is not product code/docs/runtime output and is superseded by `docs/ARCHITECTURE.md`. | `.agents/instructions.md:25-31` | `rg -n 'Gemini|GEMINI_API_KEY|--gemini' .agents/instructions.md` |

## Programmatic Closure

```json
{"verdict":"PASS","headline":"PASS_WITH_DEBT","proof_gap_status":"NONE","blocking_status":"CLOSED","gate_open_allowed":true,"orchestrator_action_hint":"COMPLETE","product_implementation_files_modified":false,"artifacts_modified":[".audit-artifacts/openrouter_implementation_verification/implementation-gate.md"]}
```
