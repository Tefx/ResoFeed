# Regression Frontend Surface Gate Evidence

headline: PASS_WITH_REG01_SUPERSESSION
verdict: PASS_FOR_REG03_REG05_REG07_REG08_REG09_REG01_SUPERSEDED
gate_open_allowed: true_for_non_reg01_scope
orchestrator_action_hint: USE_CURRENT_REG01_AUTHORITY
blockers: []

## Current Cleanup Note (2026-05-13)

This artifact is historical frontend gate evidence. Its original REG-01 conclusion used absence of Source Ledger `[RUN INGEST]` / `[FETCH]` controls as proof. That REG-01 basis is superseded by current Source Ledger authority.

Current rule: Source Ledger may expose lightweight `[RUN INGEST]` / `[INGESTING...]` and per-source `[FETCH]` / `[FETCHING...]` bracket actions, provided anti-dashboard guards remain in force. This artifact remains useful for REG-03/05/07/08/09 but must not be used as current REG-01 closure proof.

## Scope

Independent gate review for `regression-frontend-surface-gate`, limited to frontend regression closure for REG-2026-05-12-01, -03, -05, -07, -08, and -09. No product code was modified.

## Verification Run

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pwd && git status --short --branch` | 0 | Confirmed isolated worktree `/Users/tefx/Projects/ResoFeed/.vectl/worktrees/regression-frontend-surface-gate` on branch `vectl/step-regression-frontend-surface-gate`. |
| `npm run check && npx playwright test --config ./playwright.config.ts web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts --project=chromium-ci-safe` from `web/` | 0 | `svelte-check found 0 errors and 0 warnings`; production `vite build` completed; focused real API browser retest passed `1 passed (5.3s)`. |
| `npx playwright test --config ./playwright.config.ts web/tests/e2e/regression-audit-ui-expected-red.spec.ts --project=chromium-ci-safe` from `web/` | 0 | Production `vite build` completed; REG-01/03/05/07/08/09 expected-red remediation checks passed `6 passed (4.3s)` under the historical no-control REG-01 interpretation. Current REG-01 authority supersedes that no-control expectation. |
| Historical scoped escape-hatch and Source Ledger absence scan | 0 | No scoped escape hatches were found. The old manual-control absence scan is retained as historical context only and is not current Source Ledger acceptance evidence. |

## REG Mapping

| REG | Gate state | Evidence | Independent verdict |
| --- | --- | --- | --- |
| REG-01 | SUPERSEDED_FOR_REG_01 | Current `source-ledger-reg-01-adjudication.md`, updated contract matrix, `docs/DESIGN.md`, `docs/PRD.md`, `docs/UI_REGRESSION_CONTRACT.md`, and `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md` supersede this gate's old no-control proof. | Current Source Ledger boundary allows lightweight `[RUN INGEST]` / `[FETCH]` bracket actions and requires anti-dashboard guards. Do not use this artifact's rendered absence proof as current closure evidence. |
| REG-03 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:11`; `web/src/routes/components/SearchRetrieval.svelte:80-85`; Playwright REG-03 passed. | Search renders one visible submit affordance in desktop/mobile retrieval states. |
| REG-05 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:13`; `web/src/routes/+page.svelte:415-449`; Playwright REG-05 passed; real retest assertions at `web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts:139-144,212-222`. | Mobile utility routes set inactive Today feed `aria-hidden` and `inert`; Today list is not visible in active utility flow. |
| REG-07 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:15`; `web/src/routes/+page.svelte:194-198,393-399`; Playwright REG-07 passed. | Search retrieval receipts are contextual and clear when navigating away to Source Ledger, Today, or `/doctor`. |
| REG-08 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:16`; `web/src/routes/components/Feed.svelte:40-55`; `web/src/routes/components/item-anatomy.ts:88-105`; Playwright REG-08 passed. | Feed rows use compact extraction/provenance/value labels and do not foreground raw diagnostic model strings. |
| REG-09 | CLOSED | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:17`; `web/src/routes/components/Inspector.svelte:320-354`; Playwright REG-09 passed. | Inspector primary header/body excludes raw `model_status` / `model_latency_error`; source/provenance details remain calmly disclosed. |

## Behavioral Proof Register

| Claim | Proof status | Evidence | Uncertainty / limits |
| --- | --- | --- | --- |
| REG-01 no-control proof in this artifact is superseded. | SUPERSEDED | Current adjudication and contract matrix state that the prior no-control interpretation is superseded. | Use updated positive Source Ledger manual-control tests and anti-dashboard assertions for current REG-01 closure. |
| Source Ledger allowed behavior remains flat and bounded. | PROVEN_BY_CURRENT_DOCS | Current authority permits rows, `[DELETE]`, `[DETAILS]`, OPML/state actions, and lightweight `[RUN INGEST]` / `[FETCH]` bracket actions. | This historical gate did not retest the updated manual controls; cite later/current proof for implementation state. |
| Source-add receipt/background-ingest guidance remains separate from Source Ledger dashboard drift. | PROVEN | `+page.svelte:216-220` returns backend add-source receipt detail without adding dashboard behavior; `ui-remediation-r1-r8-browser-retest.spec.ts:79-91` imports/adds source, waits for real API/background ingest lifecycle, and confirms fetched rows. | Backend receipt wording is trusted only as delivered by API in test path; no backend changes audited. |
| REG-03/05/07/08/09 have rendered evidence and independent retest verdicts. | PROVEN | Focused Playwright run: `6 passed`; existing artifacts under `docs/audits/artifacts/regression-audit-2026-05-12c/regression-ui-containment/` and `real-api-proof/`. | Existing docs artifact screenshots are static; current retest supplies dynamic confirmation. |
| uiux-auditor reviewed real visual/spatial artifacts and produced parseable handoff. | PROVEN | `.audit-artifacts/uiux-audit-report.md:11-17` lists screenshots/role-label artifacts; lines 59-96 include parseable `headline: PASS`, `verdict: PASS`, `blockers: []`, `gate_open_allowed: true`, JSON handoff. | UIUX report notes mobile breakpoint was not recaptured for that audit; this gate separately retested mobile utility containment via Playwright. |
| Mobile utility routes exclude inactive Today feed from visual and accessibility flow. | PROVEN | `+page.svelte:415-449`; Playwright REG-05 pass; real retest checks `aria-hidden`, `inert`, and not-visible list on Source Ledger, Search, and `/doctor`. | Browser automation covers Chromium only. |
| Search receipts and raw diagnostics are scoped to proper surfaces. | PROVEN | `+page.svelte:194-198,393-399,451-457`; Playwright REG-07 pass; `/doctor` diagnostics only render inside `.doctor-surface` `pre[role=log]`. | Does not audit backend diagnostic content semantics. |
| ResoFeed UI/product invariants remain intact. | PROVEN | Search copy says lexical/source-backed; no top-level SEARCH/STATE peer nav per `.audit-artifacts/uiux-audit-report.md:24-41`; current docs allow only flat Source Ledger ingest/fetch bracket actions and forbid dashboard drift. | Historical no-control evidence is not current REG-01 proof. |

## Wiring Audit (W1-W8)

| ID | Check | Result | Evidence |
| --- | --- | --- | --- |
| W1 | Route/surface state maps canonical utility surfaces only. | PASS | `+page.svelte:16,60-71,186-200,384-389`; peer menu contains TODAY and SOURCE LEDGER only. |
| W2 | Historical Source Ledger no-control wiring check. | SUPERSEDED_FOR_REG_01 | Current authority permits lightweight manual controls; this old no-props/no-handlers check is not current acceptance evidence. |
| W3 | Current Source Ledger manual-control wiring boundary. | REQUIRED_BY_CURRENT_AUTHORITY | Current implementation proof must show `[RUN INGEST]` and `[FETCH]` connect only to immediate HTTP ingest/fetch actions and do not create jobs, queues, dashboards, ledgers, settings, or sync/merge surfaces. |
| W4 | Search retrieval has one submit and contextual status. | PASS | `SearchRetrieval.svelte:80-109`; REG-03 retest passed. |
| W5 | Mobile inactive Today feed removed from visual/a11y flow. | PASS | `+page.svelte:415-416`; REG-05 retest passed. |
| W6 | Diagnostic strings contained away from primary feed/inspector copy. | PASS | `item-anatomy.ts:88-105`; `Inspector.svelte:102-138,320-354`; REG-08/09 retests passed. |
| W7 | Escape hatch concentration. | PASS | Scoped `rg` found no `@invar:allow` / `invar:allow`. |
| W8 | Runtime target authenticity / fixture distinction. | PASS | `regression-audit-ui-expected-red.spec.ts` is fixture-driven contract retest; `ui-remediation-r1-r8-browser-retest.spec.ts:38-76,146-168,182-232` exercises real local API/server lifecycle and saves proof artifacts. |

## Findings

### Blockers

None.

### Warnings

- W-HISTORICAL-DOC-DRIFT: This artifact's original REG-01 no-control conclusion is superseded. Current docs require lightweight `[RUN INGEST]` / `[FETCH]` controls plus anti-dashboard guards. REG-03/05/07/08/09 closure evidence remains usable.

### Notes

- Real integration evidence and fixture-injected evidence are distinct: `regression-audit-ui-expected-red.spec.ts` is contract/fixture coverage; `ui-remediation-r1-r8-browser-retest.spec.ts` uses local HTTP dirty-corpus fixture plus product API `/api/ingest`, `/api/sources`, `/api/feed/today`, `/api/search`, and `/api/doctor`.
- PASS_WITH_DEBT not used for non-REG-01 criteria; REG-01 itself is superseded by current Source Ledger authority and requires updated positive-control proof.

## Final Gate Decision

[PASS_WITH_REG01_SUPERSESSION] Frontend regression repair evidence remains valid for REG-03/05/07/08/09. REG-01's original no-control basis is superseded and must be re-evaluated under the current lightweight manual-control contract.

```json
{
  "headline": "PASS_WITH_REG01_SUPERSESSION",
  "verdict": "PASS_WITH_REG01_SUPERSESSION",
  "blockers": [],
  "gate_open_allowed_for_non_reg01_scope": true,
  "orchestrator_action_hint": "USE_CURRENT_REG01_AUTHORITY",
  "reg_mapping": {
    "REG-01": "SUPERSEDED_BY_CURRENT_SOURCE_LEDGER_AUTHORITY",
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
