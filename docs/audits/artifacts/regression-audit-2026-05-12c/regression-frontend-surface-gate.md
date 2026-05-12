# Regression Frontend Surface Gate Evidence

headline: PASS
verdict: PASS
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
blockers: []

## Scope

Independent gate review for `regression-frontend-surface-gate`, limited to frontend regression closure for REG-2026-05-12-01, -03, -05, -07, -08, and -09. No product code was modified.

## Verification Run

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pwd && git status --short --branch` | 0 | Confirmed isolated worktree `/Users/tefx/Projects/ResoFeed/.vectl/worktrees/regression-frontend-surface-gate` on branch `vectl/step-regression-frontend-surface-gate`. |
| `npm run check && npx playwright test --config ./playwright.config.ts web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts --project=chromium-ci-safe` from `web/` | 0 | `svelte-check found 0 errors and 0 warnings`; production `vite build` completed; focused real API browser retest passed `1 passed (5.3s)`. |
| `npx playwright test --config ./playwright.config.ts web/tests/e2e/regression-audit-ui-expected-red.spec.ts --project=chromium-ci-safe` from `web/` | 0 | Production `vite build` completed; REG-01/03/05/07/08/09 expected-red remediation checks passed `6 passed (4.3s)`. |
| `rg -n '@invar:allow\|invar:allow' web/src web/tests docs/ARCHITECTURE.md docs/DESIGN.md docs/audits/regression-audit-2026-05-12*.md docs/audits/artifacts/regression-audit-2026-05-12c \|\| true; rg -n '\\[RUN INGEST\\]\\|\\[INGESTING\\.\\.\\.\\]\\|\\[FETCH\\]\\|\\[FETCHING\\.\\.\\.\\]' web/src/routes web/src/lib -g '!**/__tests__/**' \|\| true` | 0 | No output: no scoped escape hatches and no forbidden manual ingest/fetch labels in non-test frontend source. |

## REG Mapping

| REG | Gate state | Evidence | Independent verdict |
| --- | --- | --- | --- |
| REG-01 | CLOSED | `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md:7-31`; `web/src/routes/components/SourceLedger.svelte:107-145`; `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-forbidden-controls-absent.dom.txt`; Playwright REG-01 passed. | Canonical Source Ledger boundary preserved; `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]` absent from rendered source ledger and product source. |
| REG-03 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:11`; `web/src/routes/components/SearchRetrieval.svelte:80-85`; Playwright REG-03 passed. | Search renders one visible submit affordance in desktop/mobile retrieval states. |
| REG-05 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:13`; `web/src/routes/+page.svelte:415-449`; Playwright REG-05 passed; real retest assertions at `web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts:139-144,212-222`. | Mobile utility routes set inactive Today feed `aria-hidden` and `inert`; Today list is not visible in active utility flow. |
| REG-07 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:15`; `web/src/routes/+page.svelte:194-198,393-399`; Playwright REG-07 passed. | Search retrieval receipts are contextual and clear when navigating away to Source Ledger, Today, or `/doctor`. |
| REG-08 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:16`; `web/src/routes/components/Feed.svelte:40-55`; `web/src/routes/components/item-anatomy.ts:88-105`; Playwright REG-08 passed. | Feed rows use compact extraction/provenance/value labels and do not foreground raw diagnostic model strings. |
| REG-09 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:17`; `web/src/routes/components/Inspector.svelte:320-354`; Playwright REG-09 passed. | Inspector primary header/body excludes raw `model_status` / `model_latency_error`; source/provenance details remain calmly disclosed. |

## Behavioral Proof Register

| Claim | Proof status | Evidence | Uncertainty / limits |
| --- | --- | --- | --- |
| REG-01 has authority adjudication and rendered proof preserving canonical boundary. | PROVEN | Adjudication artifact lines 7-31; contract matrix line 9; static scan no forbidden controls in non-test frontend source; REG-01 Playwright pass; existing DOM proof `source-ledger-forbidden-controls-absent.dom.txt`. | Historical audit/docs still contain superseded `[RUN INGEST]` expectations; adjudication explicitly supersedes them for Source Ledger. |
| Source Ledger allowed behavior remains intact: view/delete/import/export/details/diagnostics visibility. | PROVEN | `SourceLedger.svelte:107-145` renders rows, `[DELETE]`, `[DETAILS]`, `[IMPORT OPML]`, and `StatePortability`; real API DOM proof shows source row, `[DELETE]`, `[DETAILS]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`. | This gate did not retest destructive delete confirmation end-to-end; source code and rendered DOM preserve the control. |
| Source-add receipt/background-ingest guidance is accurate and does not point to forbidden controls. | PROVEN | `+page.svelte:216-220` returns backend add-source receipt detail without injecting Source Ledger run/fetch guidance; `ui-remediation-r1-r8-browser-retest.spec.ts:79-91` imports/adds source, waits for real API/background ingest lifecycle, and confirms fetched rows. | Backend receipt wording is trusted only as delivered by API in test path; no backend changes audited. |
| REG-03/05/07/08/09 have rendered evidence and independent retest verdicts. | PROVEN | Focused Playwright run: `6 passed`; existing artifacts under `docs/audits/artifacts/regression-audit-2026-05-12c/regression-ui-containment/` and `real-api-proof/`. | Existing docs artifact screenshots are static; current retest supplies dynamic confirmation. |
| uiux-auditor reviewed real visual/spatial artifacts and produced parseable handoff. | PROVEN | `.audit-artifacts/uiux-audit-report.md:11-17` lists screenshots/role-label artifacts; lines 59-96 include parseable `headline: PASS`, `verdict: PASS`, `blockers: []`, `gate_open_allowed: true`, JSON handoff. | UIUX report notes mobile breakpoint was not recaptured for that audit; this gate separately retested mobile utility containment via Playwright. |
| Mobile utility routes exclude inactive Today feed from visual and accessibility flow. | PROVEN | `+page.svelte:415-449`; Playwright REG-05 pass; real retest checks `aria-hidden`, `inert`, and not-visible list on Source Ledger, Search, and `/doctor`. | Browser automation covers Chromium only. |
| Search receipts and raw diagnostics are scoped to proper surfaces. | PROVEN | `+page.svelte:194-198,393-399,451-457`; Playwright REG-07 pass; `/doctor` diagnostics only render inside `.doctor-surface` `pre[role=log]`. | Does not audit backend diagnostic content semantics. |
| ResoFeed UI/product invariants remain intact. | PROVEN | Source Ledger lacks manual run/fetch product controls; Source Ledger remains flat roster with OPML/state portability; Search copy says lexical/source-backed; no top-level SEARCH/STATE peer nav per `.audit-artifacts/uiux-audit-report.md:24-41`. | Historical docs like `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md` and old `.audit-artifacts/manual-rss-fetch/*` still describe superseded manual fetch controls; treated as stale, not current authority. |

## Wiring Audit (W1-W8)

| ID | Check | Result | Evidence |
| --- | --- | --- | --- |
| W1 | Route/surface state maps canonical utility surfaces only. | PASS | `+page.svelte:16,60-71,186-200,384-389`; peer menu contains TODAY and SOURCE LEDGER only. |
| W2 | Source Ledger component has no manual ingest/fetch props or event wiring. | PASS | `SourceLedger.svelte:6-12` props are delete/import/export/import-state only; no run/fetch handlers. |
| W3 | API wiring cannot call manual ingest/fetch from Source Ledger. | PASS | `+page.svelte:300-318,438-445` passes delete/import/export/import-state only. |
| W4 | Search retrieval has one submit and contextual status. | PASS | `SearchRetrieval.svelte:80-109`; REG-03 retest passed. |
| W5 | Mobile inactive Today feed removed from visual/a11y flow. | PASS | `+page.svelte:415-416`; REG-05 retest passed. |
| W6 | Diagnostic strings contained away from primary feed/inspector copy. | PASS | `item-anatomy.ts:88-105`; `Inspector.svelte:102-138,320-354`; REG-08/09 retests passed. |
| W7 | Escape hatch concentration. | PASS | Scoped `rg` found no `@invar:allow` / `invar:allow`. |
| W8 | Runtime target authenticity / fixture distinction. | PASS | `regression-audit-ui-expected-red.spec.ts` is fixture-driven contract retest; `ui-remediation-r1-r8-browser-retest.spec.ts:38-76,146-168,182-232` exercises real local API/server lifecycle and saves proof artifacts. |

## Findings

### Blockers

None.

### Warnings

- W-HISTORICAL-DOC-DRIFT: Several historical audit/harness artifacts still mention `[RUN INGEST]` / `[FETCH]` as old Source Ledger expectations. Current adjudication and contract matrix supersede them, and current product source/rendered tests enforce absence. No final-acceptance intersection found.

### Notes

- Real integration evidence and fixture-injected evidence are distinct: `regression-audit-ui-expected-red.spec.ts` is contract/fixture coverage; `ui-remediation-r1-r8-browser-retest.spec.ts` uses local HTTP dirty-corpus fixture plus product API `/api/ingest`, `/api/sources`, `/api/feed/today`, `/api/search`, and `/api/doctor`.
- PASS_WITH_DEBT not used; no debt item intersects final closure criteria.

## Final Gate Decision

[PASS] Frontend regression repair may proceed to final closure. Remaining risk is acceptable and limited to stale historical artifacts that are explicitly superseded by current adjudication and negative guards.

```json
{
  "headline": "PASS",
  "verdict": "PASS",
  "blockers": [],
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "reg_mapping": {
    "REG-01": "CLOSED",
    "REG-03": "CLOSED",
    "REG-05": "CLOSED",
    "REG-07": "CLOSED",
    "REG-08": "CLOSED",
    "REG-09": "CLOSED"
  },
  "artifacts_modified": [
    "docs/audits/artifacts/regression-audit-2026-05-12c/regression-frontend-surface-gate.md"
  ]
}
```
