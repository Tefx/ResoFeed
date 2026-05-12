# Regression Audit Focused Deep Review — regression-audit-focused-deep-review

headline: PASS_WITH_DEBT
verdict: PASS_WITH_DEBT
gate_open_allowed: true
orchestrator_action_hint: PROCEED_TO_FINAL_GATE
blocking_status: CLOSED
proof_gap_status: NON_BLOCKING
blockers: []
product_implementation_files_modified: false

## refs Read Confirmation (MANDATORY)

- `.agents/instructions.md` — read. Key passage: canonical docs are law; one Go binary, one SQLite DB, OpenRouter JSON transformer only, owner token boundary, no per-agent registry, no vector/RAG/sync/service-layer/folders/tags/unread/archive/settings creep.
- `docs/ARCHITECTURE.md` — read. Key passage: `resofeed serve` is the single runtime process serving static UI, JSON HTTP, MCP at `/mcp`, and background ingest; every `/api/*` and `/mcp` request requires one owner token; MCP resources/tools reuse HTTP product operations; state portability excludes receipts/history/sync; search is SQLite/FTS lexical only.
- `docs/PRD.md` — read. Key passage: Source management is Steer + flat Source Ledger; delegated agents use the same Inspect/Resonate/Steer/retrieve concepts; unauthorized agent action must fail at auth boundary without queues; fallback taxonomy places model/RSS operational errors in `/doctor`.
- `docs/DESIGN.md` — read. Key passage: Source Ledger anatomy is title, OPML import, flat rows, delete, and state export/import; URL subscription routes back to Steer; Search is lexical; `/doctor` is raw text, not a dashboard; feed rows and Inspector must stay dense, source-backed, and non-diagnostic.
- `docs/DESIGN_VISION.md` — read. Key passage: high-density analyst workbench; AI failure degrades plainly; Source Ledger is a barebones flat read/delete roster; no account/onboarding/folders/tags/settings/numeric inbox mechanics.
- `docs/USAGE.md` — read. Key passage: static UI may load unauthenticated, but `/api/*` and MCP require `Authorization: Bearer <OWNER_TOKEN>`; Source addition is Steer or OPML; `/doctor` must be raw diagnostics and redact OpenRouter secrets; MCP uses Streamable HTTP at `/mcp`.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-spec-conformance-review.md` — read. Key passage: prior spec conformance gate found REG-01..09 conforming, with only non-blocking REG-06 live-provider debt and product implementation files unmodified.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` — read. Key passage: full runtime retest passed Go tests, frontend checks, focused Playwright, real `bin/resofeed serve`, owner-token HTTP/MCP, empty MCP arrays, and `read_item`; REG-06 was honestly classified as provider/auth debt, not fallback success.
- `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json` — read. Key passage: unauthenticated `/api/sources` returned `401` canonical body; authorized MCP resources returned `{"sources":[]}` and `{"rules":[]}` with JSON MIME text content.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md` — read. Key passage: backend/MCP/LLM gate approved with non-blocking OpenRouter provider/account debt; real bound binary proof existed for `/api/doctor`, `/api/feed/today`, `/mcp read_item`, and MCP sources; no scoped `invar:allow` escape hatches.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json` — read. Key passage: probe status `PASS`, failures `[]`, `/api/doctor` and `/api/feed/today` status 200, `/mcp read_item` status 200 with full-text marker true, OpenRouter preflight status 404 classified `provider_or_auth`, raw secret absent.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-frontend-surface-gate.md` — read. Key passage: frontend gate passed REG-01/03/05/07/08/09 with Playwright and source evidence; no forbidden Source Ledger run/fetch controls and no scoped escape hatches.
- `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md` — read. Key passage: Source Ledger manual `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]` controls are explicitly forbidden; ledger remains visibility/delete/import/export/details only.

## Focused Deep Review Report

review_areas:
  wiring_completeness: PASS
  runtime_mcp_api: PASS
  ui_accessibility: PASS
  diagnostic_placement: PASS
  architecture_invariants: PASS

### Gate Decision

[PASS] with non-blocking debt. Gate may open for `regression-audit-final-gate` because no blocker-class systemic regression was found and the remaining proof gap is already isolated to external OpenRouter provider/account availability, not repo-owned wiring or fallback honesty.

### Verification Run (Command + Exit Code)

| Command | Exit | Evidence / interpretation |
| --- | ---: | --- |
| `git status --short --branch` | 0 | Confirmed isolated branch `vectl/step-regression-audit-focused-deep-review`; initial clean worktree. |
| `go test ./...` | 0 | `? resofeed/cmd/resofeed [no test files]`; `ok resofeed/internal/resofeed 0.743s`. Covers backend/MCP/idempotency contract tests including MCP auth, empty arrays, read_item detail, and idempotent retry paths. |
| `npm run check` before dependency bootstrap | 127 | Failed with `sh: svelte-kit: command not found`; this verified frontend dependencies were missing in the isolated worktree. |
| `npm ci && npm run check` | 0 | `npm ci` installed local transient dependencies; `svelte-check found 0 errors and 0 warnings`. `node_modules` not committed. |
| `npx playwright test --config ./playwright.config.ts web/tests/e2e/regression-audit-ui-expected-red.spec.ts --project=chromium-ci-safe` | 0 | Production Vite build completed; `6 passed (6.6s)` for REG-01, REG-03, REG-05, REG-07, REG-08, REG-09. Transient `.test-artifacts` output cleaned and not committed. |
| `rg -n '@invar:allow\|invar:allow' cmd internal web/src web/tests docs/ARCHITECTURE.md docs/PRD.md docs/DESIGN.md docs/DESIGN_VISION.md docs/USAGE.md .agents/instructions.md` | 1 | No output; no scoped source/ref escape hatches. |
| `rg -n '\[RUN INGEST\]\|\[INGESTING\.\.\.\]\|\[FETCH\]\|\[FETCHING\.\.\.\]' web/src/routes web/src/lib -g '!**/__tests__/**'` | 1 | No output; no forbidden Source Ledger manual ingest/fetch labels in non-test frontend source. |
| `rg -n 'OAuth\|RBAC\|account registration\|vector database\|vector DB\|embedding\|built-in RAG\|semantic answer\|sync coordinator\|state merger\|conflict resolver\|event bus\|service layer\|per-agent registry\|folders\|tags\|unread\|archive\|mark all read' cmd internal web/src web/tests docs/ARCHITECTURE.md docs/PRD.md docs/DESIGN.md docs/DESIGN_VISION.md docs/USAGE.md .agents/instructions.md` | 0 | Matches were either canonical negative requirements/docs/tests or benign implementation comments such as `Inspector.svelte` boilerplate stripping; no new product implementation feature surface found. |

### Review Area Findings

#### wiring_completeness: PASS

- Source Ledger is reachable from real rendered UI via surface menu in `web/src/routes/+page.svelte:384-389`, which exposes `TODAY` and `SOURCE LEDGER` buttons only.
- Source Ledger receives only `delete/import/export/import-state` callbacks in `web/src/routes/+page.svelte:438-445`; no manual ingest/fetch callbacks are passed.
- The rendered Source Ledger component exposes rows, URL, delete confirmation, diagnostics details, OPML import, and state portability in `web/src/routes/components/SourceLedger.svelte:107-145`.
- API client behavior still has owner-token headers on all product requests (`web/src/lib/api-client.ts:209-215`) and specific Source Ledger calls use `/api/sources`, `DELETE /api/sources/{id}`, `/api/sources/import-opml`, `/api/state/export`, and `/api/state/import` (`api-client.ts:149-163,187-197`). `runIngest`/`fetchSource` helpers exist (`api-client.ts:165-173`) but are not wired into Source Ledger UI; this is not a Source Ledger regression.
- Real rendered proof: focused Playwright REG suite passed 6/6; REG-01 explicitly asserts no Source Ledger buttons named `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, or `[FETCHING...]` (`web/tests/e2e/regression-audit-ui-expected-red.spec.ts:179-198`).

#### runtime_mcp_api: PASS

- `/mcp` auth is enforced before JSON-RPC dispatch by `internal/resofeed/mcp.go:311-324`; HTTP `/api/*` auth is enforced by `internal/resofeed/http.go:235-239,306-320`.
- Empty MCP resources are guarded in implementation: `rules` are forced to `[]` when nil (`mcp.go:363-372`) and sources are built from an initialized `[]Source{}` (`mcp.go:469-491`). Runtime artifact confirms `{"sources":[]}` and `{"rules":[]}` (`mcp_empty_resources_and_auth.json:12-20`).
- MCP `read_item` dispatch calls `ReadItemForMCP` (`mcp.go:423-428`) and tests assert canonical detail/provenance/extracted text (`internal/resofeed/mcp_integration_test.go:54-57`) plus a REG-04 guard against `extraction_status=full` without detail/fallback (`mcp_integration_test.go:99-145`). Runtime liveness report confirms `mcp_read_item_contains_full_text_marker: true` (`report.json:54-58`).
- Idempotency/receipt behavior remains covered by `withIdempotencyReceipt` fingerprint comparison and result snapshot replay (`internal/resofeed/idempotency.go:14-52`) and MCP integration tests for repeated `resonate_item` and `steer` calls (`mcp_integration_test.go:63-75,148-167`).
- Liveness/smoke evidence distinction: real runtime proof exists in supplied artifacts (`report.json:63-77`; `full-runtime-retest-evidence.md:90-105`), while fixture/component-only Playwright checks are not used as sole MCP/API proof.

#### ui_accessibility: PASS

- Mobile utility route containment is implemented with `aria-hidden` and `inert` on inactive feed/detail panes (`web/src/routes/+page.svelte:415-429`) and verified by focused Playwright (`regression-audit-ui-expected-red.spec.ts:215-233`).
- Search submit uniqueness is implemented as one visible `button type="submit"` in `SearchRetrieval.svelte:80-85`, with secondary filters under `<details>` and no duplicate submit. Focused Playwright asserts exactly one visible submit on desktop and mobile (`regression-audit-ui-expected-red.spec.ts:200-213`).
- Stale retrieval receipt scoping is implemented by clearing retrieval receipts on non-search navigation (`+page.svelte:194-198`) and rendering search receipts only on Search (`+page.svelte:393-399`); Playwright verifies Source Ledger/Today/doctor do not retain the search receipt (`regression-audit-ui-expected-red.spec.ts:235-254`).

#### diagnostic_placement: PASS

- Feed rows use compact labels, not raw model enum diagnostics (`web/src/routes/components/Feed.svelte:40-55`; `item-anatomy.ts:88-105`). The only model-dependent label is compressed to `model-backed` or `fallback` in `itemSummaryProvenanceLabel` (`item-anatomy.ts:94-99`).
- Inspector primary surface translates raw states into `full`, `partial`, `summary provenance: ...`, dense summary/core insight, and source details disclosure (`Inspector.svelte:282-299,320-354`); it filters operational diagnostic leakage from primary reading text (`Inspector.svelte:102-139,213-221`).
- `/doctor` is isolated to a raw `pre[role=log]` diagnostics region (`+page.svelte:451-457`) and is reached via `/doctor` command (`+page.svelte:269-275`), preserving raw diagnostics away from feed/Inspector.
- Playwright REG-08/09 passed, checking feed and Inspector do not foreground `model_status`/`model_latency_error` (`regression-audit-ui-expected-red.spec.ts:256-276`).

#### architecture_invariants: PASS

- No product implementation files were modified by this review.
- Scoped escape hatch audit found no `@invar:allow` or `invar:allow` in product source/tests/docs refs (exit 1, no output).
- Forbidden-scope scan found only canonical negative docs/tests/comments and benign boilerplate stripping; no accounts/OAuth/RBAC, vector/RAG, sync/merge, service-layer/event-bus, per-agent registry, folders/tags/unread/archive product surface was identified in reviewed implementation.
- Existing architecture remains one Go router mounting static UI, `/api/`, `/mcp`, and background ingest lifecycle (`internal/resofeed/http.go:55-60,100-130`).

### Issues

issues:
  - severity: should_fix
    description: "Live OpenRouter successful `model_status=ok` remains unproven in supplied liveness artifacts; provider/account/privacy guardrail returned 404 and runtime correctly classified fallback/error instead of faking success."
    related_finding: "REG-2026-05-12-06"
    gate_intersection: "Non-blocking for regression-audit-final-gate because repo-owned runtime, secret redaction, doctor/feed classification, and fallback honesty are proven; final gate should not require external provider state outside repo control unless the milestone definition changes."
    remediation_owner: "orchestrator / environment owner"
    verification: "Rerun liveness probe with an OpenRouter account/model that can produce a real response; require redacted proof of at least one live `model_status=ok` item."
  - severity: suggestion
    description: "Chromium is the only browser used for current focused UI/a11y runtime proof."
    related_finding: "cross-cutting UI/accessibility proof depth"
    gate_intersection: "Non-blocking because current gate asks for focused regression proof and Chromium Playwright directly covers the specified mobile utility/search/receipt/diagnostic regressions."
    remediation_owner: "frontend QA"
    verification: "Optional future cross-browser run for mobile utility route containment and Search submit uniqueness."
  - severity: tech_debt
    description: "Historical audit/harness artifacts still mention superseded manual Source Ledger fetch/run expectations, although current adjudication and tests reject them."
    related_finding: "REG-2026-05-12-01 historical drift"
    gate_intersection: "Non-blocking because current Source Ledger adjudication, implementation, and negative guards are aligned; risk is future copy/paste confusion."
    remediation_owner: "docs/audit maintainer"
    verification: "Keep `source-ledger-reg-01-adjudication.md` and negative tests active; optionally annotate stale artifacts as superseded."

### Behavioral Proof Register

| Behavior | Proof status | Proof type | Evidence |
| --- | --- | --- | --- |
| Source Ledger controls reachable from real rendered UI | PROVEN | Real browser render + source wiring | `+page.svelte:384-389,438-445`; `SourceLedger.svelte:107-145`; Playwright 6 passed. |
| Source Ledger has no manual run/fetch controls | PROVEN | Static scan + rendered negative assertions | Forbidden control `rg` exit 1; `regression-audit-ui-expected-red.spec.ts:193-196`; adjudication lines 7-31. |
| UI client sends owner-token auth on API calls | PROVEN | Source inspection | `api-client.ts:199-215`; static UI auth prompt source `+page.svelte:358-360`. |
| `/mcp` owner-token boundary rejects unauthenticated calls | PROVEN | Runtime artifact + tests + source | `mcp_empty_resources_and_auth.json:2-5`; `mcp.go:311-324`; `mcp_integration_test.go:25-28`. |
| Empty MCP `sources` and `rules` arrays serialize as `[]` | PROVEN | Real MCP resource proof | `mcp_empty_resources_and_auth.json:12-20`; `mcp.go:363-383,478-491`. |
| MCP `read_item` detail parity includes extracted/provenance detail | PROVEN | Real `/mcp` artifact + tests | `report.json:54-58`; `mcp_integration_test.go:54-57,99-145`. |
| Idempotency/receipt retry safety not regressed | PROVEN | Behavioral tests + implementation | `idempotency.go:14-52`; `mcp_integration_test.go:63-75,148-167`. |
| Mobile utility routes contain inactive feed visually and in a11y flow | PROVEN | Real browser Playwright | `+page.svelte:415-429`; REG-05 Playwright passed. |
| Search has one visible submit control | PROVEN | Real browser Playwright + source | `SearchRetrieval.svelte:80-85`; REG-03 Playwright passed. |
| Stale Search receipt scoped to Search only | PROVEN | Real browser Playwright + source | `+page.svelte:194-198,393-399`; REG-07 Playwright passed. |
| Feed/Inspector primary surfaces stay non-diagnostic | PROVEN | Real browser Playwright + source | `Feed.svelte:40-55`; `item-anatomy.ts:88-105`; `Inspector.svelte:282-354`; REG-08/09 Playwright passed. |
| `/doctor` remains raw diagnostic placement | PROVEN | Source + supplied runtime doctor artifacts | `+page.svelte:451-457`; `report.json:6-15`; `gate-reviewer-final-gate.md:53-55`. |
| No forbidden architecture scope creep in reviewed implementation | PROVEN_WITH_NOTES | Scoped scans + source review | Escape scan no matches; invariant scan only negative docs/tests/comments and benign boilerplate stripping. |
| Live OpenRouter success with model-backed item | UNPROVEN_NON_BLOCKING | Live external probe attempted | `report.json:17-18,27-34,71-74`; full retest lines 123-127. |

### Uncertainty Sources

- Live OpenRouter success remains unavailable due provider/account/privacy/model guardrail; current artifacts prove honest classification but not a successful external model-backed item.
- UI runtime evidence is Chromium-focused.
- The supplied `report.json` liveness paths point to main workspace absolute paths in `serve_command`; the later full runtime retest artifact separately records isolated-worktree execution and is therefore the stronger evidence for worktree isolation.
- A broad exploratory scan accidentally surfaced orchestrator `plan.yaml` matches; that output was discarded as approval evidence and no plan/orchestrator state was modified.

### Blockers / Warnings / Notes

Blockers: none.

Warnings:
- REG-06 live success is still debt; final gate should preserve the distinction between real runtime proof and live external-provider success.

Notes:
- Runtime/API/MCP readiness is supported by supplied real-bound-server artifacts and current Go tests; component-only or fixture-only proof was not accepted as sole evidence for backend claims.
- Frontend Playwright output and `node_modules` were transient and intentionally not committed.

### Artifacts Modified

- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-focused-deep-review.md` only.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "headline": "PASS_WITH_DEBT",
  "verdict": "PASS_WITH_DEBT",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "PROCEED_TO_FINAL_GATE",
  "blocking_status": "CLOSED",
  "proof_gap_status": "NON_BLOCKING",
  "blockers": [],
  "review_areas": {
    "wiring_completeness": "PASS",
    "runtime_mcp_api": "PASS",
    "ui_accessibility": "PASS",
    "diagnostic_placement": "PASS",
    "architecture_invariants": "PASS"
  },
  "product_implementation_files_modified": false,
  "artifacts_modified": [
    "docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-focused-deep-review.md"
  ]
}
```
