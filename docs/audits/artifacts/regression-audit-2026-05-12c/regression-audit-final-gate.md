# Regression Audit Final Gate — regression-audit-final-gate

Headline: PASS_WITH_DEBT
Blocking Status: CLOSED
Proof-Gap Status: NON_BLOCKING
Verdict: [PASS]
Gate Open Allowed: true
Orchestrator Action Hint: COMPLETE

## refs Read Confirmation (MANDATORY)

- `.agents/instructions.md` — read. Key passage: canonical docs are law; one Go binary, one SQLite DB, OpenRouter JSON transformer only, owner-token boundary, runtime secrets are redacted/runtime-only, and no settings/dashboard/product-creep surfaces.
- `docs/ARCHITECTURE.md` — read. Key passage: `resofeed serve` is the single process for static UI, JSON HTTP, `/mcp`, migrations, and background ingest; every `/api/*` and `/mcp` request needs the owner token; Source Ledger/state portability/current-state and OpenRouter secret rules are explicit.
- `docs/PRD.md` — read. Key passage: Inspect/Resonate/Steer are the primitives; Source management is Steer + flat Ledger; LLM fallback taxonomy must be honest and must not count fallback-only summaries as live model success.
- `docs/DESIGN.md` — read. Key passage: Source Ledger is title/import/flat rows/delete/state export/import/details only; Search is lexical; feed rows and Inspector stay dense and non-diagnostic; `/doctor` owns raw diagnostics.
- `docs/DESIGN_VISION.md` — read. Key passage: Source Ledger is a barebones flat read/delete roster, AI failure degrades plainly, and no folders/tags/settings/numeric inbox mechanics are allowed.
- `docs/USAGE.md` — read. Key passage: source addition is Steer or OPML; runtime lexical proof uses Steer + background ingest + Search; `/api/*` and MCP require `Authorization: Bearer <OWNER_TOKEN>`; `/doctor` must redact OpenRouter secrets.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` — read. Key passage: full runtime retest passed Go, frontend, focused Playwright, real HTTP/MCP probes, MCP empty arrays, and `read_item`; only REG-06 external-provider debt remains.
- `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json` — read. Key passage: unauthenticated `/api/sources` returned 401, and MCP empty `sources`/`rules` serialized as `{"sources":[]}` and `{"rules":[]}`.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md` — read. Key passage: backend/MCP REG-02/04 closed; REG-06 accepted only as non-blocking external OpenRouter provider/account debt with fallback-not-success classification.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json` — read. Key passage: probe status `PASS`, failures `[]`, `/api/doctor`, `/api/feed/today`, `/mcp read_item`, and MCP sources resource returned 200; live OpenRouter preflight classified `provider_or_auth`.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_read_item.json` — read. Key passage: `read_item` response includes `extracted_text` marker `FULL EXTRACTION DETAIL TEXT -- REG-04 black-box proof`.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-frontend-surface-gate.md` — read. Key passage: frontend REG-01/03/05/07/08/09 passed with Playwright/browser evidence and no forbidden Source Ledger run/fetch controls.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-spec-conformance-review.md` — read. Key passage: 15 material requirements and all REG findings conform; REG-06 is non-blocking provider/account debt.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-doc-sync-check.md` — read. Key passage: docs now preserve Source Ledger boundary and mark stale `[RUN INGEST]`/`[FETCH]` expectations as superseded.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-focused-deep-review.md` — read. Key passage: wiring, runtime MCP/API, UI accessibility, diagnostic placement, and architecture invariants passed; final gate may open with non-blocking REG-06 debt.
- `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md` — read. Key passage: Source Ledger must preserve visibility/delete/import/export/details and must not reintroduce `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, or `[FETCHING...]` controls.
- `docs/audits/regression-audit-2026-05-12.md` — read. Key passage: original REG-01 manual-control expectation is explicitly retained only as historical evidence and superseded by current matrix/adjudication.
- `docs/audits/regression-audit-2026-05-12-contract-matrix.md` — read. Key passage: REG-01 forbids manual Source Ledger ingest/fetch; REG-02/04/06 are backend/MCP/LLM gate items; REG-03/05/07/08/09 are UI gate items.

## gate_decision

```json
{
  "headline": "PASS_WITH_DEBT",
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blocking_status": "CLOSED",
  "proof_gap_status": "NON_BLOCKING",
  "blockers": []
}
```

## Final Gate Evidence

### Finding-by-finding decision table

| Finding | requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis | remaining_gaps |
|---|---|---|---|---|---|---|---|---|
| REG-2026-05-12-01 | `docs/DESIGN.md` Source Ledger anatomy; `source-ledger-reg-01-adjudication.md:7-31`; matrix line 9 | Source Ledger has no `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]`; allowed rows/details/delete/import/export remain; source-add/background ingest guidance is accurate. | Rendered browser UI + negative source scan. | Frontend gate lines 24-31; full retest lines 71,83-86; current command `rg ... forbidden controls` exit 1. | CLOSED | Keep adjudication and negative tests active. | Canonical docs resolve conflict against historical audit/UI-preview; no forbidden controls in product source/rendered proof. | None. |
| REG-2026-05-12-02 | `docs/ARCHITECTURE.md` MCP resources arrays; matrix line 10 | Empty MCP `sources` and `rules/active` serialize arrays as `[]`, not `null`. | Real MCP resource reads against empty DB. | `mcp_empty_resources_and_auth.json:12-20`; backend gate lines 36-40; full retest lines 72,113-115. | CLOSED | Cite existing MCP capability audit chain; do not duplicate implementation work. | Runtime artifact shows `{"sources":[]}` and `{"rules":[]}`; closure remains compatible with MCP capability chain. | None. |
| REG-2026-05-12-03 | `docs/DESIGN.md` Search retrieval; matrix line 11 | Search has exactly one visible submit control in desktop/mobile. | Chromium Playwright render. | Current Playwright expected-red suite `6 passed`; frontend gate line 27; full retest line 73. | CLOSED | Keep expected-red Search visible-submit test. | Real browser test passed and source evidence has one `button type=submit`. | None. |
| REG-2026-05-12-04 | `docs/ARCHITECTURE.md` `read_item` ItemDetail; matrix line 12 | MCP `read_item` returns detail text for full extraction or explicit downgrade/fallback reason. | Real `/mcp` tool call through bound binary. | `mcp_read_item.json:1`; `report.json:54-58`; backend gate line 39; full retest lines 74,115. | CLOSED | Keep MCP integration guard for full extraction detail/fallback. | Runtime `extracted_text` marker proves full-detail path; not handler-only evidence. | None. |
| REG-2026-05-12-05 | `docs/DESIGN.md` mobile utility behavior; matrix line 13 | Mobile Search/Source Ledger/doctor do not leak inactive Today feed visually or to a11y flow. | Chromium mobile Playwright assertions. | Current Playwright expected-red suite `6 passed`; frontend gate lines 28,42; full retest lines 75,118. | CLOSED | Keep `aria-hidden`/`inert` route containment assertions. | Rendered browser proof verifies Search, Ledger, and `/doctor`; Chromium-only is sufficient for current gate. | Optional future cross-browser a11y hardening only. |
| REG-2026-05-12-06 | `docs/PRD.md` fallback taxonomy; matrix line 14; OpenRouter runtime contract | Current/live LLM health is classified; fallback-only summaries do not count as live model success. | `/api/doctor`, feed sample, direct redacted OpenRouter preflight. | `doctor_after_live_probe.txt:3-13`; `live_feed_today.json:1`; `openrouter_live_preflight.json:1-7`; `report.json:17-18,27-34,71-74`; backend gate lines 23,40,94-96. | CLOSED_WITH_NON_BLOCKING_DEBT | Rerun live probe when provider/account privacy/model availability allows live `model_status=ok`; keep fallback-not-success assertion. | Repo-owned behavior is honest: `live_summary_successes=0`, fallback-only=1, feed item `model_latency_error`, preflight 404 classified `provider_or_auth`; limitation is external and non-intersecting with final repo closure. | No current live `model_status=ok`; non-blocking because failure is classified and not counted as success. |
| REG-2026-05-12-07 | Surface-state contract; matrix line 15 | Source Ledger/Today/doctor do not inherit stale Search receipt. | Chromium Playwright navigation proof. | Current Playwright expected-red suite `6 passed`; frontend gate line 29; full retest line 77. | CLOSED | Keep receipt scoping test. | Rendered proof shows receipt scoped to Search. | None. |
| REG-2026-05-12-08 | `docs/DESIGN.md` feed item anatomy; matrix line 16 | Feed row metadata is compact and does not foreground/repeat raw diagnostic model strings. | Chromium Playwright render + source mapping. | Current Playwright expected-red suite `6 passed`; frontend gate line 30; full retest lines 78,120. | CLOSED | Keep diagnostic-containment test. | Feed rows avoid `model_status`/`model_latency_error` primary leakage and compress fallback. | None. |
| REG-2026-05-12-09 | `docs/DESIGN.md` Inspector anatomy; matrix line 17 | Inspector primary header/body does not expose raw `model_status`. | Chromium Playwright render + source mapping. | Current Playwright expected-red suite `6 passed`; frontend gate line 31; full retest lines 79,120. | CLOSED | Keep Inspector diagnostic-containment test. | Inspector primary copy avoids raw model enum and keeps provenance/details calm. | None. |

### REG-01 Source Ledger boundary closure proof

- Canonical adjudication: `source-ledger-reg-01-adjudication.md:7-10` rejects the old audit demand and states Source Ledger remains visibility/delete/import/export/details only, with source addition via Steer and refresh via background ingest.
- Required preserved behavior: rows, `src:`/status/last_fetch/url, `[DELETE]`, `[DETAILS]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]` are listed in adjudication lines 20-27 and browser proof in `full-runtime-retest-evidence.md:81-86`.
- Negative proof: current scoped scan command `rg -n '\[RUN INGEST\]|\[INGESTING\.\.\.\]|\[FETCH\]|\[FETCHING\.\.\.\]' web/src/routes web/src/lib -g '!**/__tests__/**'` exited 1 with no output; frontend Playwright REG-01 passed.
- Decision: REG-01 may open because the conflict is resolved against canonical docs and the forbidden controls are absent.

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
| Source Ledger forbidden controls absent | PROVEN | Adjudication lines 7-31; current `rg` exit 1; Playwright REG-01 pass. |
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
| W2 | Source Ledger wiring boundary | PASS | Frontend gate W2/W3 says no manual ingest/fetch props or callbacks; current forbidden-control scan exit 1. |
| W3 | HTTP/API and MCP parity | PASS | MCP `read_item`, sources resource, and API auth artifacts prove product operations through transport. |
| W4 | Frontend build/render | PASS | `npm ci && npm run check && npx playwright ... expected-red` exit 0; production Vite build; `6 passed`. |
| W5 | Real API browser retest | PASS | `npx playwright ... ui-remediation-r1-r8-browser-retest.spec.ts` exit 0; `1 passed`. |
| W6 | LLM classification | PASS_WITH_DEBT | `doctor_after_live_probe.txt` and `openrouter_live_preflight.json` classify external provider/account guardrail and do not count fallback as live success. |
| W7 | Escape hatches/secrets | PASS | Escape-hatch `rg` exit 1; raw-key scan `leak_count=0`. |
| W8 | Product invariants | PASS | No evidence of accounts/OAuth/RBAC, vector/RAG, sync/merge, folders/tags/unread/archive, settings dashboard, or source-run/fetch UI scope in reviewed closure. |

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
- Not introduced in reviewed closure: accounts/OAuth/RBAC, per-agent registry, vector database/embeddings/RAG, sync/merge/conflict resolver, activity ledger, folders/tags/unread/archive, settings dashboard, Source Ledger run/fetch controls, or notification-channel ownership.

### Blockers / Warnings / Notes

Blockers: none.

Warnings:
- REG-06 still lacks a successful live OpenRouter `model_status=ok` item. This is accepted as non-blocking debt only because the provider/account/privacy-policy limitation is explicitly classified, secret-redacted, and does not intersect repo-owned final closure.
- UI proof is Chromium-focused; no blocker because current regression criteria target Playwright Chromium evidence and durable artifacts.

Notes:
- Historical audit text continues to document superseded REG-01 expectations; current matrix/adjudication and negative tests are the controlling authority.
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
| Scoped Source Ledger forbidden-control `rg` | 0 wrapper / `rg_exit=1` | No forbidden manual ingest/fetch labels in non-test frontend source. |
| Secret artifact scan | 0 | External env/key present; 245 files scanned; leak count 0; raw key not printed. |
| `git restore -- .test-artifacts && git clean -fd -- .test-artifacts` | 0 | Removed transient Playwright artifact changes from tracked/untracked `.test-artifacts`. |

## Artifacts Modified

- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-final-gate.md`

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "gate_decision": {
    "headline": "PASS_WITH_DEBT",
    "verdict": "PASS",
    "gate_open_allowed": true,
    "orchestrator_action_hint": "COMPLETE",
    "blocking_status": "CLOSED",
    "proof_gap_status": "NON_BLOCKING",
    "blockers": []
  },
  "reg_verdicts": {
    "REG-2026-05-12-01": "CLOSED",
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
