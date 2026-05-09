# Spec Conformance Retest Report

**Headline**: PASS  
**Blocking Status**: CLOSED  
**Proof-Gap Status**: NONE  
**Verdict**: PASS  
**Blockers**: []  
**Orchestrator Action Hint**: COMPLETE

step_intent: retest_green  
expected_result: green  
observed_result: green  
failure_alignment: matches expected  
gate_open_allowed: true

## refs Read Confirmation
- `docs/ARCHITECTURE.md` — read startup validation matrix (`invalid_addr`, `invalid_public_url`, `invalid_openrouter_key`, `invalid_owner_token`), OpenRouter-only runtime contract, `/doctor` prefix/model rules, state portability exclusions, HTTP/MCP parity.
- `.audit-artifacts/openrouter_verification/spec-doc-state-conformance-audit.md` — read previous B1 failure: invalid `--addr bad` with no OpenRouter key returned `invalid_openrouter_key`; prior drift note for `.agents/instructions.md` Gemini wording.
- `.agents/instructions.md` — read current guidance; LLM utility, secret handling, and OpenRouter-only runtime now point to OpenRouter and `OPENROUTER_KEY`, no Gemini guidance remains.
- `docs/USAGE.md` — read OpenRouter key setup, no CLI secrets, `--openrouter-model` account default/no startup network validation, `/doctor`, state export/import, and MCP owner-token usage.
- relevant source/tests — read `cmd/resofeed/main.go`, `internal/resofeed/db.go`, `runtime_secret.go`, `openrouter.go`, `doctor.go`, `state.go`, `http.go`, `mcp.go`, and OpenRouter/startup/state/MCP tests.

## Requirements Register
| R# | Spec Section | Requirement | Level | Checkable? |
|---|---|---|---|---|
| R1 | `docs/ARCHITECTURE.md:11,67`; `cmd/resofeed/main.go:9-13` | Single `resofeed serve` runtime; no sidecar commands. | interface | yes |
| R2 | `docs/ARCHITECTURE.md:55-64`; `internal/resofeed/db.go:79-88` | Serve accepts only `--addr`, `--public-url`, `--db`, `--openrouter-model`, `--owner-token`; no CLI API-key/Gemini flags. | interface | yes |
| R3 | `docs/ARCHITECTURE.md:62,65,79`; `internal/resofeed/openrouter.go:152-160` | Empty model means account default; explicit model passed unchanged; no startup network model validation. | behavior | yes |
| R4 | `docs/ARCHITECTURE.md:69-83`; `internal/resofeed/runtime_secret.go:11-35` | OpenRouter is sole runtime LLM backend; `OPENROUTER_KEY` resolved OS env > `.env`, empty/whitespace rejected; key not printed/persisted. | behavior/side_effect | yes |
| R5 | `docs/ARCHITECTURE.md:84-90`; `internal/resofeed/runtime_secret.go:38-72` | `.env` parser is minimal `KEY=VALUE`, ignores comments/blanks, no shell evaluation; parser errors do not print values. | behavior/error | yes |
| R6 | `docs/ARCHITECTURE.md:92-104`; `internal/resofeed/db.go:44-65,123-135` | Deterministic local startup validation for `--addr`, `--public-url`, `--owner-token` precedes missing OpenRouter key where applicable; each exits 2 with specified terse stderr. | behavior/error | yes |
| R7 | `docs/ARCHITECTURE.md:101`; `internal/resofeed/db.go:172-180,239-270` | Unopenable SQLite DB fails `invalid_db` before binding. | behavior/error | yes |
| R8 | `docs/ARCHITECTURE.md:108-113`; `internal/resofeed/db.go:273-309` | Owner token explicit/reuse/generate behavior; store only hash and print generated token once. | behavior/side_effect | yes |
| R9 | `docs/ARCHITECTURE.md:76-82`; `internal/resofeed/doctor.go:20-24,112-122` | `/doctor` uses `openrouter:` prefix, reports configured/resolved model, never key/source/path/provider config. | interface/side_effect | yes |
| R10 | `docs/ARCHITECTURE.md:145-155,545-547`; `internal/resofeed/state.go:14-24,47-131,220-272` | Portable state includes only active sources, active steering rules, resonated items; excludes OpenRouter key/model/provider/source/runtime metadata and rejects unknown top-level fields. | schema/side_effect | yes |
| R11 | `docs/ARCHITECTURE.md:552-557,764-780`; `internal/resofeed/http.go:232-290` | All `/api/*` routes require owner token and expose specified product operations including doctor/state/search/steer/items/sources. | interface | yes |
| R12 | `docs/ARCHITECTURE.md:808-857`; `internal/resofeed/mcp.go:17-30,608-661` | MCP at `/mcp` requires owner token and exposes same product concepts/tools/resources with no per-agent registry. | interface | yes |
| R13 | `docs/ARCHITECTURE.md:923`; grep evidence | No provider abstraction layer/Gemini runtime surface beyond test naming debt. | non_goal | yes |
| R14 | `.agents/instructions.md:11,25-31` vs `docs/ARCHITECTURE.md:17,69-83` | Agent guidance must not mislead auditors back to Gemini or alternate provider runtime. | docs | yes |

## Evidence Table
| R# | Spec Section | Requirement | Implementation | Verdict | Notes |
|---|---|---|---|---|---|
| R1 | `ARCHITECTURE.md:11,67` | Single serve command | `main.go:9-13`; `db.go:31-39` | CONFORMS | Unknown commands return `unknown_command`; help lists serve only. |
| R2 | `ARCHITECTURE.md:55-64` | Exact runtime flags/no key flag | `db.go:79-88`; `openrouter_cli_adapter_contract_test.go:26-44` | CONFORMS | Gemini legacy flags rejected; docs tests forbid CLI secret examples. |
| R3 | `ARCHITECTURE.md:62,65,79` | Model semantics/no startup network validation | `openrouter.go:152-160`; tests `openrouter_cli_adapter_contract_test.go:99-116,119-167` | CONFORMS | Empty omits `model`; explicit model unchanged. |
| R4 | `ARCHITECTURE.md:69-83` | Secret resolution and safety | `runtime_secret.go:11-35`; tests `openrouter_cli_adapter_contract_test.go:46-117` | CONFORMS | OS env overrides `.env`; empty/whitespace fail redacted. |
| R5 | `ARCHITECTURE.md:84-90` | Minimal `.env` parser | `runtime_secret.go:38-72`; `docs_runtime_secret_contract_test.go:11-67` | CONFORMS | Static/runtime tests cover parser guidance and safety. |
| R6 | `ARCHITECTURE.md:92-104` | B1 local validation before missing key | `db.go:44-65,123-135`; `runtime_startup_test.go:94-137`; runtime evidence below | CONFORMS | Retested mixed-invalid cases pass. |
| R7 | `ARCHITECTURE.md:101` | invalid DB error before bind | `db.go:172-180,239-270`; `runtime_startup_test.go:52-64` | CONFORMS | Existing test asserts socket remains unbound. |
| R8 | `ARCHITECTURE.md:108-113` | Owner token hash/generate/reuse | `db.go:188-199,273-309`; `runtime_startup_test.go:139-160` | CONFORMS | Behavioral test covers generated/reused token path. |
| R9 | `ARCHITECTURE.md:82` | Doctor OpenRouter reporting | `doctor.go:20-24,112-122`; `openrouter_runtime_wiring_test.go:60-65,145-165` | CONFORMS | HTTP and MCP doctor proof includes configured/resolved model and forbids key/Gemini. |
| R10 | `ARCHITECTURE.md:145-155,545-547` | Portable state excludes runtime LLM config | `state.go:14-24,47-131,220-272`; `openrouter_product_integration_contract_test.go:152-252` | CONFORMS | Export excludes fake OpenRouter data; import rejects unknown top-level runtime fields. |
| R11 | `ARCHITECTURE.md:552-557,764-780` | HTTP owner-token operations | `http.go:232-290,293-307` | CONFORMS | Auth before routing; endpoints present. |
| R12 | `ARCHITECTURE.md:808-857` | MCP parity/auth/tools/resources | `mcp.go:17-30,608-661`; `openrouter_product_integration_contract_test.go:286-316` | CONFORMS | Tool/resource list and parity test pass. |
| R13 | `ARCHITECTURE.md:923` | No legacy/provider surface | grep found Gemini only in tests; `openrouter_product_integration_contract_test.go:318-324` | CONFORMS | Test naming debt remains non-product. |
| R14 | `.agents/instructions.md:11,25-31` | Guidance drift closed | `.agents/instructions.md:11,25-31`; grep `.agents` for Gemini returned no files | CONFORMS | Previous B1 doc drift resolved. |

## B1 Runtime/Test Evidence
- Targeted tests: `env -u OPENROUTER_KEY -u GEMINI_API_KEY go test ./internal/resofeed -run 'TestServeStartupValidationOrdersLocalConfigBeforeMissingOpenRouterKey|TestOpenRouterRuntimeSecretSourceAndModelFlags|TestOpenRouterAdapterRequestContractWithFakeServer|TestDoctorUsesOpenRouterPrefixAndNoGeminiRuntimeText|TestStateExportExcludesOpenRouterRuntimeConfigAndSecrets|TestStateImportRejectsOpenRouterRuntimeConfigAndSecrets|TestHTTPAndMCPTransportParityForCoreOperations' -count=1 -v` — PASS.
- Full suite: `env -u OPENROUTER_KEY -u GEMINI_API_KEY go test ./...` — PASS (`resofeed/internal/resofeed 0.406s`).
- Runtime build: `go build -o /var/.../opencode/resofeed-audit ./cmd/resofeed` — PASS.
- invalid `--addr` with no `OPENROUTER_KEY`/`GEMINI_API_KEY`: `env -u OPENROUTER_KEY -u GEMINI_API_KEY /var/.../resofeed-audit serve --addr bad --db :memory: --owner-token rfeed_...` -> `err: invalid_addr: expected HOST:PORT`, `exit=2` — PASS.
- `--public-url` mixed-invalid ordering: same redacted binary/env with `--public-url http://127.0.0.1:8080/path` -> `err: invalid_public_url: expected absolute http(s) URL without path/query/fragment`, `exit=2` — PASS.
- `--owner-token` mixed-invalid ordering: same redacted binary/env with `--owner-token short` -> `err: invalid_owner_token: expected at least 32 visible non-whitespace characters`, `exit=2` — PASS.
- missing OpenRouter key baseline after valid local config: same redacted binary/env valid local config -> `err: invalid_openrouter_key: value required`, `exit=2` — PASS.

## Coverage Summary
- Total requirements: 14
- CONFORMS: 14
- DIVERGES/PARTIAL: 0
- NEEDS_TEST/NOT_FOUND/AMBIGUOUS_SPEC: 0
- Unchecked sections: No material OpenRouter gate sections unchecked; broader UI visual design was out of scope except docs-adjacent microcopy.

## Behavioral Proof Register
- proof: B1 local validation order
  evidence: `runtime_startup_test.go:94-137`; runtime commands above
  result: PASS
  notes: Invalid local flags now mask missing OpenRouter key as required.
- proof: OpenRouter model semantics/no startup network validation
  evidence: `openrouter_cli_adapter_contract_test.go:99-167`; `openrouter.go:152-160`
  result: PASS
  notes: Empty model omitted; configured model passed unchanged.
- proof: Doctor OpenRouter reporting across HTTP/MCP
  evidence: `openrouter_runtime_wiring_test.go:60-65,145-165`; `doctor.go:112-122`
  result: PASS
  notes: No key/Gemini leakage in tested output.
- proof: Portable state excludes runtime LLM config
  evidence: `openrouter_product_integration_contract_test.go:152-252`; `state.go:47-131,220-272`
  result: PASS
  notes: Export/import tests use fake secrets only and assert non-persistence.
- proof: Transport parity
  evidence: `openrouter_product_integration_contract_test.go:286-316`; `mcp.go:608-661`; `http.go:232-290`
  result: PASS
  notes: HTTP endpoints and MCP tools/resources cover core operations.

## Issues Found
| Severity | Description | Location | Reproduction | Gate Intersection |
|---|---|---|---|---|
| Low | Test helper names and comments still contain Gemini-era names. Production/runtime grep did not find Gemini surfaces; `.agents` guidance drift is closed. | `_test.go` files from grep, e.g. `ingest_gemini_test.go`, `mcp_integration_test.go` | `grep Gemini/gemini internal/resofeed` | Non-blocking; does not intersect OpenRouter final gate because production code/docs and runtime outputs conform. |

## Artifact
- `.audit-artifacts/openrouter_verification/spec-doc-state-conformance-audit-retest.md`
