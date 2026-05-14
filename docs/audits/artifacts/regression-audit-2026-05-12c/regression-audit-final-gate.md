# Regression Audit Final Gate — regression-audit-final-gate

Headline: PASS_WITH_DEBT_AND_REG01_SUPERSESSION
Blocking Status: CLOSED
Proof-Gap Status: NON_BLOCKING
Verdict: [PASS for non-REG-01 closure; REG-01 basis superseded]
Gate Open Allowed: true for non-superseded closure evidence
Orchestrator Action Hint: USE_CURRENT_REG01_AUTHORITY

## Current Cleanup Note (2026-05-13)

This artifact is historical final-gate evidence. Its original REG-01 conclusion used absence of Source Ledger `[RUN INGEST]` / `[FETCH]` controls as proof. That REG-01 basis is superseded by the current Source Ledger authority in `source-ledger-reg-01-adjudication.md`, `docs/DESIGN.md`, `docs/PRD.md`, `docs/UI_REGRESSION_CONTRACT.md`, and `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md`.

Current rule: Source Ledger may expose lightweight `[RUN INGEST]` / `[INGESTING...]` and per-source `[FETCH]` / `[FETCHING...]` bracket actions, provided they remain flat immediate controls and do not introduce dashboards, queues, jobs, activity ledgers, settings, sync/merge, source hierarchies, or second source-add fields.

## refs Read Confirmation (MANDATORY)

- `.agents/instructions.md` — read. Key passage: canonical docs are law; one Go binary, one SQLite DB, OpenRouter JSON transformer only, owner-token boundary, runtime secrets are redacted/runtime-only, and no settings/dashboard/product-creep surfaces.
- `docs/ARCHITECTURE.md` — read. Key passage: `resofeed serve` is the single process for static UI, JSON HTTP, `/mcp`, migrations, and background ingest; every `/api/*` and `/mcp` request needs the owner token; `POST /api/ingest` and `POST /api/sources/{id}/fetch` are immediate HTTP actions guarded by the in-process ingest concurrency guard, not persisted jobs/queues/ledgers.
- `docs/PRD.md` — read. Key passage: Inspect/Resonate/Steer/Retrieve are the primitives; Source Ledger may expose lightweight manual ingest/fetch bracket actions while forbidding dashboard drift; LLM fallback taxonomy must be honest and must not count fallback-only summaries as live model success.
- `docs/DESIGN.md` — read. Key passage: Source Ledger is the flat source roster and the only UI location for lightweight `[RUN INGEST]` / `[FETCH]` controls; those controls must remain terminal-synchronous bracket actions, not dashboards, queues, settings, or activity feeds.
- `docs/DESIGN_VISION.md` — read. Key passage: Source Ledger remains a barebones flat roster; AI failure degrades plainly; no folders/tags/settings/numeric inbox mechanics.
- `docs/USAGE.md` — read. Key passage: source addition is Steer or OPML; runtime lexical proof uses Steer + ingest + Search; `/api/*` and MCP require `Authorization: Bearer <OWNER_TOKEN>`; `/doctor` must redact OpenRouter secrets.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` — read. Key passage: full runtime retest passed Go, frontend, focused Playwright, real HTTP/MCP probes, MCP empty arrays, and `read_item`; only REG-06 external-provider debt remains.
- `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json` — read. Key passage: unauthenticated `/api/sources` returned 401, and MCP empty `sources`/`rules` serialized as `{"sources":[]}` and `{"rules":[]}`.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md` — read. Key passage: backend/MCP REG-02/04 closed; REG-06 accepted only as non-blocking external OpenRouter provider/account debt with fallback-not-success classification.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json` — read. Key passage: probe status `PASS`, failures `[]`, `/api/doctor`, `/api/feed/today`, `/mcp read_item`, and MCP sources resource returned 200; live OpenRouter preflight classified `provider_or_auth`.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_read_item.json` — read. Key passage: `read_item` response includes `extracted_text` marker `FULL EXTRACTION DETAIL TEXT -- REG-04 black-box proof`.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-frontend-surface-gate.md` — read. Key passage: historical frontend gate evidence for REG-01 is superseded by the 2026-05-13 Source Ledger authority update; REG-03/05/07/08/09 evidence remains useful.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-spec-conformance-review.md` — read. Key passage: historical spec-conformance review is superseded for REG-01 by the current Source Ledger authority; REG-06 remains non-blocking provider/account debt.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-doc-sync-check.md` — read. Key passage: docs must preserve Source Ledger flatness while treating stale `[RUN INGEST]`/`[FETCH]` absence expectations as superseded.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-focused-deep-review.md` — read. Key passage: wiring, runtime MCP/API, UI accessibility, diagnostic placement, and architecture invariants passed; final gate may open with non-blocking REG-06 debt.
- `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md` — read. Key passage: the prior ban on Source Ledger `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]` is superseded; tests must assert lightweight controls are present/reachable while no dashboard, job queue, activity ledger, source hierarchy, settings, sync/merge, or second add-source field appears.
- `docs/audits/regression-audit-2026-05-12.md` — read. Key passage: original REG-01 manual-control conflict is retained as historical evidence and superseded by current authority.
- `docs/audits/regression-audit-2026-05-12-contract-matrix.md` — read. Key passage: REG-01 now allows lightweight Source Ledger `[RUN INGEST]` and per-source `[FETCH]` bracket actions; old absence assertions must be replaced by positive control-reachability/state tests plus anti-dashboard negative guards.

## gate_decision

```json
{
  "headline": "PASS_WITH_DEBT_AND_REG01_SUPERSESSION",
  "verdict": "PASS_FOR_NON_REG01_CLOSURE_REG01_SUPERSEDED",
  "gate_open_allowed": "true_for_non_superseded_closure_evidence",
  "orchestrator_action_hint": "USE_CURRENT_REG01_AUTHORITY",
  "blocking_status": "CLOSED",
  "proof_gap_status": "NON_BLOCKING",
  "blockers": []
}
```

## Final Gate Evidence

### Finding-by-finding decision table

| Finding | requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis | remaining_gaps |
|---|---|---|---|---|---|---|---|---|
| REG-2026-05-12-01 | `docs/DESIGN.md` Source Ledger manual-control anatomy; `source-ledger-reg-01-adjudication.md`; updated contract matrix line 9 | Source Ledger may expose global `[RUN INGEST]` / `[INGESTING...]` and per-source `[FETCH]` / `[FETCHING...]` only as lightweight flat bracket actions; no dashboard, queue, activity ledger, source hierarchy, settings, sync/merge, or second add-source field may appear. | Positive rendered-browser/control reachability proof plus anti-dashboard negative guards. | Current authority: updated adjudication, contract matrix, UI regression contract, and Playwright harness contract. The older negative-control scan in this historical final gate is superseded for REG-01 and must not be reused as current acceptance evidence. | SUPERSEDED_FOR_REG_01 | Use positive control-reachability/state tests plus anti-dashboard guards. | Canonical docs now resolve the conflict in favor of lightweight manual controls under the flat Source Ledger boundary. | Current REG-01 runtime proof must cite the updated positive-control tests, not this historical absence proof. |
| REG-2026-05-12-02 | `docs/ARCHITECTURE.md` MCP resources arrays; matrix line 10 | Empty MCP `sources` and `rules/active` serialize arrays as `[]`, not `null`. | Real MCP resource reads against empty DB. | `mcp_empty_resources_and_auth.json:12-20`; backend gate lines 36-40; full retest lines 72,113-115. | CLOSED | Cite existing MCP capability audit chain; do not duplicate implementation work. | Runtime artifact shows `{"sources":[]}` and `{"rules":[]}`; closure remains compatible with MCP capability chain. | None. |
| REG-2026-05-12-03 | `docs/DESIGN.md` Search retrieval; matrix line 11 | Search has exactly one visible submit control in desktop/mobile. | Chromium Playwright render. | Current Playwright expected-red suite `6 passed`; frontend gate line 27; full retest line 73. | CLOSED | Keep expected-red Search visible-submit test. | Real browser test passed and source evidence has one `button type=submit`. | None. |
| REG-2026-05-12-04 | `docs/ARCHITECTURE.md` `read_item` ItemDetail; matrix line 12 | MCP `read_item` returns detail text for full extraction or explicit downgrade/fallback reason. | Real `/mcp` tool call through bound binary. | `mcp_read_item.json:1`; `report.json:54-58`; backend gate line 39; full retest lines 74,115. | CLOSED | Keep MCP integration guard for full extraction detail/fallback. | Runtime `extracted_text` marker proves full-detail path; not handler-only evidence. | None. |
| REG-2026-05-12-05 | `docs/DESIGN.md` mobile utility behavior; matrix line 13 | Mobile Search/Source Ledger/doctor do not leak inactive Today feed visually or to a11y flow. | Chromium mobile Playwright assertions. | Current Playwright expected-red suite `6 passed`; frontend gate lines 28,42; full retest lines 75,118. | CLOSED | Keep `aria-hidden`/`inert` route containment assertions. | Rendered browser proof verifies Search, Ledger, and `/doctor`; Chromium-only is sufficient for current gate. | Optional future cross-browser a11y hardening only. |
| REG-2026-05-12-06 | `docs/PRD.md` fallback taxonomy; matrix line 14; OpenRouter runtime contract | Current/live LLM health is classified; fallback-only summaries do not count as live model success. | `/api/doctor`, feed sample, direct redacted OpenRouter preflight. | `doctor_after_live_probe.txt:3-13`; `live_feed_today.json:1`; `openrouter_live_preflight.json:1-7`; `report.json:17-18,27-34,71-74`; backend gate lines 23,40,94-96. | CLOSED_WITH_NON_BLOCKING_DEBT | Rerun live probe when provider/account privacy/model availability allows live `model_status=ok`; keep fallback-not-success assertion. | Repo-owned behavior is honest: `live_summary_successes=0`, fallback-only=1, feed item `model_latency_error`, preflight 404 classified `provider_or_auth`; limitation is external and non-intersecting with final repo closure. | No current live `model_status=ok`; non-blocking because failure is classified and not counted as success. |
| REG-2026-05-12-07 | Surface-state contract; matrix line 15 | Source Ledger/Today/doctor do not inherit stale Search receipt. | Chromium Playwright navigation proof. | Current Playwright expected-red suite `6 passed`; frontend gate line 29; full retest line 77. | CLOSED | Keep receipt scoping test. | Rendered proof shows receipt scoped to Search. | None. |
| REG-2026-05-12-08 | `docs/DESIGN.md` feed item anatomy; matrix line 16 | Feed row metadata is compact and does not foreground/repeat raw diagnostic model strings. | Chromium Playwright render + source mapping. | Current Playwright expected-red suite `6 passed`; frontend gate line 30; full retest lines 78,120. | CLOSED | Keep diagnostic-containment test. | Feed rows avoid `model_status`/`model_latency_error` primary leakage and compress fallback. | None. |
| REG-2026-05-12-09 | `docs/DESIGN.md` Inspector anatomy; matrix line 17 | Inspector primary header/body does not expose raw `model_status`. | Chromium Playwright render + source mapping. | Current Playwright expected-red suite `6 passed`; frontend gate line 31; full retest lines 79,120. | CLOSED | Keep Inspector diagnostic-containment test. | Inspector primary copy avoids raw model enum and keeps provenance/details calm. | None. |

### REG-01 Source Ledger authority supersession note

- Current canonical adjudication: `source-ledger-reg-01-adjudication.md` states that the prior ban on `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]` is superseded.
- Current preserved behavior: Source Ledger may include lightweight manual controls, but only as flat bracket actions with terse pending/success/error/conflict text and without dashboard, queue, job, activity-ledger, hierarchy, settings, sync/merge, or second add-source-field drift.
- Historical evidence caveat: this final gate originally used a negative source scan and rendered absence proof for REG-01. That evidence is retained only as historical context and is no longer a valid current closure basis.
- Current decision rule: REG-01 closure must cite positive control presence/reachability/state tests plus anti-dashboard negative assertions.

### REG-02 MCP overlap closure citation

- Matrix line 10 delegates REG-02 to the existing MCP capability chain rather than duplicate implementation work.
- Backend gate line 38 cites `internal/resofeed/mcp_integration_test.go:78-97` as the existing empty-resource closure.
- Runtime compatibility proof is `mcp_empty_resources_and_auth.json:12-20`, where `resofeed://sources` and `resofeed://rules/active` bodies contain `[]` arrays.

### Runtime proof vs fixture/citation distinction

- Real runtime proof: `go test ./...` exit 0; Playwright expected-red `6 passed`; real API browser retest `1 passed`; MCP auth/empty resources/read_item artifacts from bound runtime; `/api/doctor` and `/api/feed/today` artifacts.
- Fixture/citation proof: browser expected-red suite includes fixture-driven contract assertions for UI regressions; cited screenshots/DOM under `docs/audits/artifacts/...` are durable prior artifacts, not current command output.
- Gate basis: backend/MCP/LLM claims use real HTTP/MCP artifacts, not fixture-only evidence. UI claims use current browser commands plus durable screenshots/DOM.

### behavioral_proof_register

| Behavior | Proof status | Evidence |
|---|---|---|
| Owner-token auth rejects unauthenticated API | PROVEN | `mcp_empty_resources_and_auth.json:2-5` 401 canonical body. |
| Empty MCP resources serialize arrays | PROVEN | `mcp_empty_resources_and_auth.json:12-20`. |
| MCP `read_item` provides full extraction detail | PROVEN | `mcp_read_item.json:1`; `report.json:54-58`. |
| Source Ledger manual-control absence proof from this gate | SUPERSEDED | The prior negative proof is historical only; current authority requires lightweight `[RUN INGEST]` / `[FETCH]` bracket controls with anti-dashboard guards. |
| Search one visible submit | PROVEN | Current Playwright expected-red suite `6 passed`; frontend gate line 27. |
| Mobile inactive Today feed excluded | PROVEN | Current Playwright expected-red suite `6 passed`; frontend gate line 28. |
| Search receipt does not leak | PROVEN | Current Playwright expected-red suite `6 passed`; frontend gate line 29. |
| Feed/Inspector diagnostic containment | PROVEN | Current Playwright expected-red suite `6 passed`; frontend gate lines 30-31. |
| Live LLM success is not faked | PROVEN | Doctor `live_summary_successes=0`, fallback-only=1; live feed item `model_latency_error`; preflight `provider_or_auth`. |
| Raw OpenRouter key absent from reviewed artifacts | PROVEN | Secret scan over `.audit-artifacts` and `docs/audits/artifacts`: `files_scanned=245`, `leak_count=0`. |

### W1-W8 wiring audit

| ID | Area | Result | Evidence |
|---|---|---|---|
| W1 | Single runtime / target authenticity | PASS | Go tests passed; supplied full retest records real `bin/resofeed serve` and HTTP/MCP liveness. |
| W2 | Source Ledger manual-control authority | SUPERSEDED_FOR_REG_01 | This gate's old no-run/fetch wiring check is no longer current acceptance evidence. Current wiring must expose lightweight bracket actions only through immediate HTTP ingest/fetch paths and preserve anti-dashboard guards. |
| W3 | HTTP/API and MCP parity | PASS | MCP `read_item`, sources resource, and API auth artifacts prove product operations through transport. |
| W4 | Frontend build/render | PASS | `npm ci && npm run check && npx playwright ... expected-red` exit 0; production Vite build; `6 passed`. |
| W5 | Real API browser retest | PASS | `npx playwright ... ui-remediation-r1-r8-browser-retest.spec.ts` exit 0; `1 passed`. |
| W6 | LLM classification | PASS_WITH_DEBT | `doctor_after_live_probe.txt` and `openrouter_live_preflight.json` classify external provider/account guardrail and do not count fallback as live success. |
| W7 | Escape hatches/secrets | PASS | Escape-hatch `rg` exit 1; raw-key scan `leak_count=0`. |
| W8 | Product invariants | PASS | No evidence of accounts/OAuth/RBAC, vector/RAG, sync/merge, folders/tags/unread/archive, settings dashboard, or dashboard-style source job/activity surfaces. Lightweight Source Ledger ingest/fetch bracket actions are allowed by current authority. |

### Escape hatch audit

- Command: `rg -n '@invar:allow|invar:allow' cmd internal web/src web/tests docs/ARCHITECTURE.md docs/PRD.md docs/DESIGN.md docs/DESIGN_VISION.md docs/USAGE.md .agents/instructions.md; code=$?; printf 'rg_exit=%s\n' "$code"; exit 0`
- Exit: 0 wrapper; `rg_exit=1`.
- Result: no scoped `@invar:allow` / `invar:allow` escape hatches found.

### Secret redaction audit

- Reviewed OpenRouter/live artifacts contain redacted markers only (`<redacted-openrouter-key>` in `report.json` and `openrouter_live_preflight.json`).
- Command read `/Users/tefx/Projects/ResoFeed/.env` only to locate `OPENROUTER_KEY`, did not print it, and scanned `.audit-artifacts` plus `docs/audits/artifacts`.
- Output: `{'external_env_exists': True, 'openrouter_key_present': True, 'files_scanned': 245, 'leak_count': 0}`.

### Product invariant audit

- Preserved: one Go binary, one SQLite/FTS5 storage boundary, OpenRouter as utility transformer only, single owner-token auth boundary, Source Ledger flatness, lexical Search, current-state portability.
- Not introduced in reviewed closure: accounts/OAuth/RBAC, per-agent registry, vector database/embeddings/RAG, sync/merge/conflict resolver, activity ledger, folders/tags/unread/archive, settings dashboard, notification-channel ownership, persistent source jobs, source hierarchy, or settings-style source controls.
- Current Source Ledger authority permits only lightweight `[RUN INGEST]` / `[FETCH]` bracket actions backed by immediate HTTP ingest/fetch paths; those controls are not product-creep when they remain flat, terse, and non-persistent.

### Blockers / Warnings / Notes

Blockers: none for the historical final gate. REG-01's absence-based proof is superseded for current Source Ledger authority and must not be reused as current closure evidence.

Warnings:
- REG-06 still lacks a successful live OpenRouter `model_status=ok` item. This is accepted as non-blocking debt only because the provider/account/privacy-policy limitation is explicitly classified, secret-redacted, and does not intersect repo-owned final closure.
- UI proof is Chromium-focused; no blocker because current regression criteria target Playwright Chromium evidence and durable artifacts.

Notes:
- Historical audit text that treated `[RUN INGEST]` / `[FETCH]` as forbidden is superseded by current matrix/adjudication. Current tests should assert lightweight controls are present/reachable and should separately guard against dashboard/job/activity/settings drift.
- Transient `node_modules`, Playwright output, `.test-artifacts`, and built binaries are not committed.

## Verification Run (Command + Exit Code)

| Command | Exit | Summary |
|---|---:|---|
| `pwd && git status --short --branch` | 0 | Confirmed isolated worktree `/Users/tefx/Projects/ResoFeed/.vectl/worktrees/regression-audit-final-gate` on branch `vectl/step-regression-audit-final-gate`; initial untracked `.venv/` only. |
| `go test ./...` | 0 | `? resofeed/cmd/resofeed [no test files]`; `ok resofeed/internal/resofeed 0.725s`. |
| `npm run check` before install | 127 | `sh: svelte-kit: command not found`; verified frontend `node_modules` missing in isolated worktree. |
| `test -f package-lock.json && test -f package.json && test -d node_modules ...` | 0 | `pkg_lock=0 package=0 node_modules=1`; justified dependency bootstrap. |
| `npm ci && npm run check && npx playwright test --config ./playwright.config.ts web/tests/e2e/regression-audit-ui-expected-red.spec.ts --project=chromium-ci-safe` | 0 | `npm ci` installed transient deps; `svelte-check found 0 errors and 0 warnings`; production Vite build; `6 passed (6.4s)`. |
| `npx playwright test --config ./playwright.config.ts web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts --project=chromium-ci-safe` | 0 | Production Vite build; real API browser retest `1 passed (3.8s)`. |
| Scoped escape-hatch `rg` | 0 wrapper / `rg_exit=1` | No scoped escape-hatch matches. |
| Historical Source Ledger absence scan | 0 wrapper / `rg_exit=1` | Historical-only result from the old REG-01 interpretation. Current authority supersedes this as closure evidence; use positive control presence/state tests plus anti-dashboard guards instead. |
| Secret artifact scan | 0 | External env/key present; 245 files scanned; leak count 0; raw key not printed. |
| `git restore -- .test-artifacts && git clean -fd -- .test-artifacts` | 0 | Removed transient Playwright artifact changes from tracked/untracked `.test-artifacts`. |

## Artifacts Modified

- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-final-gate.md`

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "gate_decision": {
    "headline": "PASS_WITH_DEBT_AND_REG01_SUPERSESSION",
    "verdict": "PASS_FOR_NON_REG01_CLOSURE_REG01_SUPERSEDED",
    "gate_open_allowed": "true_for_non_superseded_closure_evidence",
    "orchestrator_action_hint": "USE_CURRENT_REG01_AUTHORITY",
    "blocking_status": "CLOSED",
    "proof_gap_status": "NON_BLOCKING",
    "blockers": []
  },
  "reg_verdicts": {
    "REG-2026-05-12-01": "SUPERSEDED_BY_CURRENT_SOURCE_LEDGER_AUTHORITY",
    "REG-2026-05-12-02": "CLOSED",
    "REG-2026-05-12-03": "CLOSED",
    "REG-2026-05-12-04": "CLOSED",
    "REG-2026-05-12-05": "CLOSED",
    "REG-2026-05-12-06": "CLOSED_WITH_NON_BLOCKING_DEBT",
    "REG-2026-05-12-07": "CLOSED",
    "REG-2026-05-12-08": "CLOSED",
    "REG-2026-05-12-09": "CLOSED"
  },
  "debt": [
    {
      "id": "REG-2026-05-12-06-live-openrouter-success",
      "severity": "non_blocking",
      "non_intersection_reason": "External provider/account/privacy-policy guardrail prevents live model success; repo-owned runtime, redaction, fallback taxonomy, HTTP/MCP, and UI regression closures are proven and fallback-only summaries are not counted as live success."
    }
  ],
  "artifacts_modified": [
    "docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-final-gate.md"
  ]
}
```
