# Full Runtime Retest Evidence — regression-audit-full-runtime-retest

status/headline: PASS_WITH_DEBT
verdict: PASS
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
blockers: []
step_intent: retest_green
expected_result: green
observed_result: green with non-blocking live-provider debt
failure_alignment: No blocker-class REG-01..REG-09 finding reproduced. REG-06 still lacks live `model_status=ok`, but the run explicitly classified the live provider/account/privacy-policy failure and did not count fallback-only summaries as live success.
product_implementation_files_modified: false

## refs Read Confirmation (MANDATORY)

- `.agents/instructions.md` — read. Key passage: ResoFeed is one Go binary, one SQLite DB, OpenRouter is a JSON transformer only, owner token is the universal boundary, and runtime secrets must be redacted and never persisted/logged/committed.
- `docs/ARCHITECTURE.md` — read. Key passage: `resofeed serve` starts static UI, JSON HTTP, `/mcp`, SQLite migrations, and background ingest in one process; OpenRouter key is runtime-only; `/api/*` and `/mcp` require owner-token auth; no vector/RAG/sync/service-layer scope.
- `docs/PRD.md` — read. Key passage: core primitives are Inspect/Resonate/Steer; delegated agents share the same product operations; fallback taxonomy distinguishes `summary unavailable`, `partial extraction`, `model latency/error`, RSS fetch errors, and does not permit fake LLM success.
- `docs/DESIGN.md` — read. Key passage: Source Ledger is a flat source/state-portability surface; `/doctor` is raw diagnostics; UI must stay dense and avoid settings/onboarding/dashboard bloat.
- `docs/DESIGN_VISION.md` — read. Key passage: Source Ledger is a barebones flat read/delete text roster, not a settings dashboard; AI failures degrade plainly rather than pretending success.
- `docs/USAGE.md` — read. Key passage: OpenRouter key is loaded from OS env or local `.env` only, never CLI flags; static UI can load unauthenticated but every `/api/*` and MCP call needs `Authorization: Bearer <OWNER_TOKEN>`; source addition is through Steer/OPML and ingest runs in the runtime.

Additional prior audit refs read/cited: `docs/audits/regression-audit-2026-05-12.md`, `docs/audits/regression-audit-2026-05-12-contract-matrix.md`, `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md`, `docs/audits/artifacts/regression-audit-2026-05-12c/regression-frontend-surface-gate.md`, `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md`.

## Verification Report: regression-audit-full-runtime-retest

**Headline**: PASS_WITH_DEBT
**Blocking Status**: CLOSED
**Proof-Gap Status**: NON_BLOCKING
**Verdict**: PASS
**Blockers**: []
**Orchestrator Action Hint**: COMPLETE

### Commands Run

| Command | Exit | Raw Evidence |
|---|---:|---|
| `pwd && git status --short --branch` | 0 | `/Users/tefx/Projects/ResoFeed/.vectl/worktrees/regression-audit-full-runtime-retest`; branch `vectl/step-regression-audit-full-runtime-retest`; initial untracked `.venv/` only. |
| `test -x .venv/bin/python && .venv/bin/python --version` | 0 | `Python 3.12.12`; reused orchestrator-provided worktree venv. |
| `go test ./... && mkdir -p bin && go build -o ./bin/resofeed ./cmd/resofeed && .venv/bin/python tests/repro/regression_backend_mcp_llm_liveness_probe.py` | 0 | `? resofeed/cmd/resofeed [no test files]`; `ok resofeed/internal/resofeed 0.731s`; probe JSON `status: PASS`, `failures: []`, real `bin/resofeed serve` bound on a temp port, `/api/doctor` 200, `/api/feed/today` 200, `/mcp` `read_item` 200 and `mcp_read_item_contains_full_text_marker: true`; OpenRouter preflight classified `provider_or_auth` 404 with redacted key. |
| `test -d node_modules ...` | 1 | No stdout because `web/node_modules` was missing. Follow-up check printed `node_modules_missing` and `playwright_missing`; this justified one dependency bootstrap. |
| `npm ci && npm run check && npx playwright test --config ./playwright.config.ts web/tests/e2e/regression-audit-ui-expected-red.spec.ts --project=chromium-ci-safe && npx playwright test --config ./playwright.config.ts web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts --project=chromium-ci-safe` from `web/` | 0 | `npm ci` added 150 packages; `svelte-check found 0 errors and 0 warnings`; production `vite build` ran before both Playwright suites; REG expected-red suite: `6 passed (6.7s)`; real API browser retest: `1 passed (4.0s)`. |
| `npx playwright test --config ./playwright.config.ts web/tests/e2e/regression-audit-ui-expected-red.spec.ts --project=chromium-ci-safe` from `web/` | 0 | Reran focused REG UI guard after real-API suite; production `vite build`; `6 passed (4.4s)`. Transient Playwright output was not committed; durable browser artifacts from the already-committed closure chain are cited below. |
| `.venv/bin/python - <<'PY' ... empty MCP resources/auth probe ... PY` | 0 | Printed `{ "status": "PASS", "artifact": ".audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json", "unauthorized_status": 401, "empty_sources": "[]", "empty_rules": "[]" }`; artifact contains actual HTTP/MCP response bodies. |
| `.venv/bin/python - <<'PY' ... raw-key artifact scan ... PY` | 0 | `{'external_env_exists': True, 'openrouter_key_present': True, 'files_scanned': 243, 'leak_count': 0}`. |

### Artifact Paths

Browser/rendered proof:
- Current rerun browser proof: Playwright command output above shows REG-01/03/05/07/08/09 all passed on Chromium with production build. Transient `.test-artifacts` output was intentionally not committed.
- Durable desktop Source Ledger proof: `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-forbidden-controls-absent.png`, `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-forbidden-controls-absent.dom.txt`.
- Durable desktop Search: `docs/audits/artifacts/regression-audit-2026-05-12c/regression-ui-containment/search-visible-submit.png`, `.dom.txt`.
- Durable feed/Inspector: `docs/audits/artifacts/regression-audit-2026-05-12c/regression-ui-containment/feed-row-metadata.png`, `inspector-header.png`, corresponding `.dom.txt` files.
- Durable mobile Search/Source Ledger/doctor: `docs/audits/artifacts/regression-audit-2026-05-12c/regression-ui-containment/mobile-search-containment.png`, `mobile-source-ledger-containment.png`, `mobile-doctor-containment.png`, corresponding `.dom.txt` files.
- Real local API rendered proof from already-committed retest chain: `docs/audits/artifacts/regression-audit-2026-05-12c/real-api-proof/real-api-reg-01-03-05-07-08-09.png`, `.dom.txt`, `-state.json`.

HTTP/MCP proof:
- Empty resources + auth boundary: `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json`.
- Liveness/probe report: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json`.
- MCP `read_item`: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_read_item.json`.
- MCP `sources` resource on populated runtime: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_sources_resource.json`.
- `/api/doctor`: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/doctor_after_live_probe.txt` and `doctor.txt`.
- `/api/feed/today`: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_feed_today.json`, `feed_today.json`.
- Source fetch/import: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_source_fetch.json`, `live_opml_import.json`, `live_sources.json`.
- OpenRouter live preflight classification: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/openrouter_live_preflight.json`.

### REG Finding Verdict Table

| REG | Verdict | Evidence | Proof type |
|---|---|---|---|
| REG-2026-05-12-01 Source Ledger boundary | PASS | Focused Playwright REG-01 passed; durable DOM/screenshot show allowed ledger row/import/delete/details and no forbidden controls; adjudication lines 7-31 forbids `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]`. | Browser-rendered proof + citation. |
| REG-2026-05-12-02 MCP empty arrays | PASS | Empty-resource runtime artifact body has `"text":"{\"sources\":[]}"` and `"text":"{\"rules\":[]}"`; existing chain cited in gate reviewer confirms integration tests own this closure. | Real integration proof + citation. |
| REG-2026-05-12-03 Search one visible submit | PASS | Focused Playwright REG-03 passed for desktop and mobile; durable screenshot `search-visible-submit.png`. | Browser-rendered proof. |
| REG-2026-05-12-04 MCP `read_item` detail/fallback | PASS | Probe artifact `mcp_read_item.json` includes `extracted_text` with `FULL EXTRACTION DETAIL TEXT -- REG-04 black-box proof`; report line shows `mcp_read_item_contains_full_text_marker: true`. | Real integration proof. |
| REG-2026-05-12-05 Mobile inactive Today exclusion | PASS | Focused Playwright REG-05 passed; assertions require `#today-feed` `aria-hidden="true"`, `inert`, and hidden Today list on Source Ledger, Search, and `/doctor`; durable mobile screenshots/DOM cited. | Browser-rendered proof. |
| REG-2026-05-12-06 LLM health classification | PASS_WITH_DEBT | `/api/doctor` reports `live_summary_successes=0`, `fallback_only_current_summaries=1`, `health_classification=openrouter_client_timeout_or_error`; live feed item `model_status":"model_latency_error"`; OpenRouter preflight 404 classified `provider_or_auth`. Fallback-only was not counted as live model success. | Real integration proof + live external classification. |
| REG-2026-05-12-07 Source Ledger stale receipt | PASS | Focused Playwright REG-07 passed; real-API retest command passed. | Browser-rendered proof. |
| REG-2026-05-12-08 Feed row metadata compact/non-repetitive | PASS | Focused Playwright REG-08 passed; real-API retest checked no `model_status`/`model_latency_error` in row and exactly one `summary unavailable`; durable feed-row screenshot/DOM cited. | Browser-rendered proof. |
| REG-2026-05-12-09 Inspector header avoids raw `model_status` | PASS | Focused Playwright REG-09 passed; real-API retest checked Inspector visible text lacks `model_status`/`model_latency_error`; durable inspector screenshot/DOM cited. | Browser-rendered proof. |

### Source Ledger Boundary Proof and Product-Creep Check

- Forbidden Source Ledger controls absent: `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]` assertions passed in both fixture-driven REG-01 and real-API retest.
- Allowed behavior remains present: Source rows, `src:`/status/last_fetch/url diagnostics, `[DELETE]`, `[DETAILS]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]` are covered by the existing durable Source Ledger DOM and the real-API proof chain.
- Source-add/background-ingest guidance remains accurate: real-API retest imports/adds a source, waits for fetched rows through runtime APIs, and asserts no manual ledger controls are presented as the next action.
- Product-creep check: no implementation files were modified; no folders/tags/unread/archive/settings-dashboard/user-account/vector/RAG/sync behavior was added by this verification.

### Evidence Levels

| Level | Status | Evidence |
|---|---|---|
| L0 Static | PASS | Mandatory refs and adjudication/matrix read; no product implementation edits. |
| L1 Contracts | PASS | `go test ./...`; `npm run check`; production `vite build` in Playwright setup. |
| L2 Real Wiring | PASS | Real `bin/resofeed serve`, temp SQLite, owner-token HTTP/MCP, `/api/doctor`, `/api/feed/today`, `/api/sources/*`, `/mcp` probes. |
| L3 Live Intelligence | PASS_WITH_DEBT | Allowed `.env` key present and used only redacted; direct OpenRouter preflight attempted and classified `provider_or_auth`; no fallback counted as live success. |

### Protocol Results

| Protocol | Result | Evidence | Gap |
|---|---|---|---|
| P1 Empty Room | PASS | Go tests included real package tests; Playwright suites collected 6 and 1 tests respectively. | `cmd/resofeed` has no test files, acceptable because runtime probe covers binary. |
| P2 Fake Seam | PASS_WITH_DEBT | UI expected-red is fixture-driven, but real-API browser retest and backend probes exercise real runtime seams. | UI fixture suite is not sole evidence. |
| P4 Live External Service | PASS_WITH_DEBT | OpenRouter preflight attempted with redacted key and classified 404 provider/account/privacy policy. | No live `model_status=ok`; non-blocking because classification is explicit. |
| P8 Caller Reachability | PASS | `bin/resofeed serve` handled HTTP/MCP and browser surfaces. | None. |
| P9 Smoke/Liveness | PASS | Server bound, port live, HTTP/MCP responses captured. | None. |
| P10 Frontend Render | PASS | Production build plus Chromium-rendered screenshots/DOM and Playwright assertions. | Chromium only. |

### Behavioral Proof Register

| Behavior | Proof status | Evidence | Proof distinction |
|---|---|---|---|
| Real `cmd/resofeed` binary serves authenticated HTTP and MCP on temp SQLite. | PROVEN | Liveness report `serve_command`, `port_bound: true`, `/api/doctor` 200, `/api/feed/today` 200, `/mcp` 200. | Real integration proof. |
| Owner-token boundary rejects unauthenticated API requests. | PROVEN | `mcp_empty_resources_and_auth.json` `/api/sources` status 401 body `owner token required`. | Real integration proof. |
| Empty MCP `sources` and `rules/active` serialize arrays as `[]`. | PROVEN | `mcp_empty_resources_and_auth.json` bodies contain `{\"sources\":[]}` and `{\"rules\":[]}`. | Real integration proof. |
| MCP `read_item` returns detail text for full extraction. | PROVEN | `mcp_read_item.json` contains `extracted_text` marker; probe report says full marker present. | Real integration proof. |
| Source Ledger preserves corrected authority boundary. | PROVEN | REG-01 Playwright rerun passed; durable Source Ledger DOM/screenshot; adjudication forbids manual run/fetch controls. | Browser-rendered proof + citation. |
| Search has one visible submit control. | PROVEN | REG-03 Playwright passed; Search screenshot/DOM cited. | Browser-rendered proof. |
| Mobile Search, Source Ledger, and doctor exclude inactive Today feed from visual/a11y flow. | PROVEN | REG-05 Playwright passed; durable mobile screenshots/DOM cited. | Browser-rendered proof. |
| Live LLM success is not faked by fallback-only summaries. | PROVEN | Doctor reports 0 live successes and 1 fallback-only; live feed item `model_latency_error`; preflight classified provider/auth. | Real integration + live external classification. |
| Feed rows and Inspector keep raw model status out of primary copy. | PROVEN | REG-08/09 Playwright passed; real-API retest passed; durable screenshots/DOM cited. | Browser-rendered proof. |
| Deterministic/stub LLM behavior can exercise fallback classification without claiming live success. | PROVEN | Probe fixture item `summary_unavailable` and live item `model_latency_error` are both classified separately. | Deterministic/stub proof. |

### Findings

- Blockers: none.
- Non-blocking debt: REG-06 has no live successful OpenRouter model response (`provider_or_auth` 404); this remains classified external/provider/account availability debt, not a repo blocker, because fallback-only current summaries are explicitly not counted as live model success.
- Secret redaction confirmation: owner tokens and OpenRouter key values are redacted in commands/artifacts; raw-key artifact scan found `leak_count: 0`; `.env` was read only from the permitted main workspace path and not copied.
- Artifacts modified: audit artifacts under `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/` were refreshed, and `.audit-artifacts/regression_audit_full_runtime_retest/` was added. No product implementation files were modified.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "headline": "PASS_WITH_DEBT",
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blockers": [],
  "step_intent": "retest_green",
  "expected_result": "green",
  "observed_result": "green_with_non_blocking_live_provider_debt",
  "failure_alignment": "no blocker-class REG finding reproduced; REG-06 live success unavailable but classified and not counted as fallback success",
  "product_implementation_files_modified": false,
  "reg_verdicts": {
    "REG-2026-05-12-01": "PASS",
    "REG-2026-05-12-02": "PASS",
    "REG-2026-05-12-03": "PASS",
    "REG-2026-05-12-04": "PASS",
    "REG-2026-05-12-05": "PASS",
    "REG-2026-05-12-06": "PASS_WITH_DEBT",
    "REG-2026-05-12-07": "PASS",
    "REG-2026-05-12-08": "PASS",
    "REG-2026-05-12-09": "PASS"
  },
  "artifacts_modified": [
    ".audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md",
    ".audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/doctor.txt",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/doctor_after_live_probe.txt",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/feed_today.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_feed_today.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_source_fetch.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_sources.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_sources_resource.json"
  ]
}
```
