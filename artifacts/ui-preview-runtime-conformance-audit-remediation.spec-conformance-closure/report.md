# Spec Conformance Closure Report

Date: 2026-05-18

## refs Read Confirmation

- `docs/DESIGN.md`: READ. Key insight: design authority requires compact command-row chrome, flat Source Ledger with bracket actions, `/doctor` raw diagnostics, adjacent raw errors, backend-authoritative provenance/grouping, no dashboards/settings/account-like UI, and 44px mobile controls (notably lines 301-318, 370-399, 431-445, 511-531, 551-600, 649-655, 671-741).
- `docs/ui-preview.html`: READ. Key insight: preview authority shows compact `RESOFEED` command bar, language/reprocess strip, Source Ledger header/tools/list DOM, `/doctor` raw `<pre>`, and mobile feed/detail structure (notably lines 79-115, 392-487, 647-659, 733-786, 789-844).
- `docs/ARCHITECTURE.md`: READ. Key insight: architecture requires one Go binary, SQLite+FTS5 lexical retrieval, thin transports, no accounts/OAuth/service layers/sync queues, current-operation snapshot in memory only, and `/doctor` OpenRouter diagnostics without secrets (notably lines 13-21, 51-75, 173-211, 109).
- `AGENTS.md`: READ. Key insight: repository constraints mirror the architecture boundaries and forbid vector DB/RAG, sync/merge coordinators, accounts/OAuth/per-agent registries, settings dashboards, service/repository/DI layers, and forbidden UI concepts.
- `docs/audits/ui-preview-runtime-conformance-audit-2026-05-17.md`: READ. Key insight: this is an availability bridge; it points to the tracked F01-F25 remediation matrix and browser retest proof register as authoritative replacement artifacts, and locks design/architecture boundaries.
- `artifacts/ui-preview-runtime-conformance-audit-remediation.browser-render-retest/report.md`: READ. Key insight: browser retest records `npm --prefix web run check`, Playwright F01-F10/F13-F15/F20-F24, Vitest F16-F19/F25, and real single-binary `/api/doctor` liveness proof; all F01-F25 marked PROVEN.
- `CONSTITUTION.md`: NOT READ: no file found in isolated worktree.

## Spec Conformance Report

| ID | Verdict | Audit finding / authority | Implementation/test evidence |
|---|---|---|---|
| F01 | CONFORMS | Matrix F01 requires compact Steer-primary top chrome; DESIGN app shell and ui-preview command bar. | `+page.svelte` lines 852-899 renders compact menu; `app.css` lines 488-503 hides oversized brand; Playwright test lines 231-240 passed. |
| F02 | CONFORMS | Matrix F02 requires visible `NAV`/`OPERATIONS`; DESIGN app shell. | `+page.svelte` lines 857-873; Playwright lines 248-250 passed; retest report lines 56-58. |
| F03 | CONFORMS | Matrix F03 requires reprocess warning and source identifiers unchanged; DESIGN Reprocess. | `+page.svelte` lines 885-893; computed measurements lines 54-68; Playwright lines 251-252 passed. |
| F04 | CONFORMS | Matrix F04 requires 14px/20px command typography. | `app.css` lines 573-583; Playwright lines 254-256 passed; measurements lines 70-85. |
| F05 | CONFORMS | Matrix F05 requires keyboard open/focus/Escape behavior. | Playwright lines 241-263 passed; retest report lines 60-61. |
| F06 | CONFORMS | Matrix F06 requires compact Source Ledger title. | `SourceLedger.svelte` lines 259-263; `app.css` lines 162-167; Playwright lines 274-279 passed. |
| F07 | CONFORMS | Matrix F07 requires Source Ledger surface background. | `app.css` lines 145-151; Playwright lines 280-281 passed; measurements lines 118-125. |
| F08 | CONFORMS | Matrix F08 requires header title/status/run and separate tools row. | `SourceLedger.svelte` lines 259-267; Playwright lines 283-292 and 384-392 passed. |
| F09 | CONFORMS | Matrix F09 requires non-wrapping bracket actions. | `app.css` lines 257-271; Playwright lines 294-298 passed. |
| F10 | CONFORMS | Matrix F10 requires 14px/20px tabular status. | `app.css` lines 205-213; Playwright lines 300-302 passed. |
| F11 | CONFORMS | Matrix F11 requires errors in `/doctor` or adjacent surfaces, not persistent top strip. | `+page.svelte` lines 962-964, 1006-1014; render test lines 154-159 passed; retest real-runtime measurements `globalTopErrors: []`. |
| F12 | CONFORMS | Matrix F12 requires `/doctor` route/command raw diagnostics. | `+page.svelte` lines 1006-1014; render test lines 161-172 passed; retest `api-doctor.status=200` and ARIA proof lines 45-48. |
| F13 | CONFORMS | Matrix F13 requires submit only with text and bracket action. | Playwright lines 331-339 passed; measurements lines 102-117. |
| F14 | CONFORMS | Matrix F14 requires idle route preview zero/low height. | `app.css` lines 410-430; Playwright lines 341-342 passed. |
| F15 | CONFORMS | Matrix F15 requires first-use contract lines without `First use` a11y heading. | Playwright lines 327-330 passed; DESIGN lines 479-488. |
| F16 | CONFORMS | Matrix F16 forbids frontend same-source/title duplicate hiding. | `Feed.svelte` lines 15-18 sorts only; render test lines 174-190 passed. |
| F17 | CONFORMS | Matrix F17 forbids URL fallback grouping. | `Inspector.svelte` lines 305-327 groups only by backend fields/provenance; render test lines 192-208 passed. |
| F18 | CONFORMS | Matrix F18 forbids hard-coded quality claims. | `Inspector.svelte` lines 364-367 uses item `value_tier` only; render test lines 210-223 passed. |
| F19 | CONFORMS | Matrix F19 requires clean detail failure separation. | `Inspector.svelte` lines 407-409; render test lines 225-233 passed. |
| F20 | CONFORMS | Matrix F20 requires 44px mobile controls. | `app.css` lines 29-62; Playwright lines 368-374 passed. |
| F21 | CONFORMS | Matrix F21 requires metadata no star collision. | `Feed.svelte` lines 56-81; Playwright lines 351-360 passed. |
| F22 | CONFORMS | Matrix F22 requires one low-chrome search action. | Playwright lines 362-377 passed; computed measurements show `[SEARCH]`. |
| F23 | CONFORMS | Matrix F23 requires `[EXPORT STATE]`, `[IMPORT STATE]`, warning, no visible `Choose state JSON`. | `StatePortability.svelte` lines 60-65; Playwright lines 394-399 passed. |
| F24 | CONFORMS | Matrix F24 requires dense empty Source Ledger rhythm. | `SourceLedger.svelte` lines 272-274; Playwright lines 308-319 and 400-401 passed. |
| F25 | CONFORMS | Matrix F25 requires canonical `op:` copy and forbids `current operation:` / `msg:` / `started:` / `updated:`. | `+page.svelte` lines 306-329; `SourceLedger.svelte` lines 45-47, 262; render test lines 235-246 and Playwright lines 394-396 passed. Product-source search found no `current operation: ingest` in `web/src`. |

## Architecture Boundary Check

- CONFORMS: no product-source evidence of vector DB/RAG implementation, accounts/OAuth/per-agent registries, settings dashboard, sync/merge coordinator, durable ingest job dashboard, or service/repository/DI layering was introduced in the audited changed surfaces.
- Evidence: `AGENTS.md` lines 11-36 and `ARCHITECTURE.md` lines 13-21/200-211 define the boundary; audited implementation remains frontend component/CSS plus existing one-binary runtime contract. `web/src` product-source search found no forbidden `current operation: ingest` copy.
- Note: historical tests/artifacts still contain old forbidden strings as assertions/archival output; these are not product UI source and are superseded by the targeted passing F25 tests.

## Behavioral Proof Register

| Behavior | Proof status | Evidence |
|---|---|---|
| Browser top chrome/menu/Source Ledger/search/mobile behavior F01-F10/F13-F15/F20-F24/F25 | PROVEN | Playwright `ui-preview-runtime-conformance-audit.expected-red.spec.ts`: 5 passed in this audit run. |
| Provenance/grouping and detail failure behavior F16-F19/F25 | PROVEN | Vitest `ui-preview-runtime-provenance.expected-red.test.ts`: 7 passed in this audit run. |
| Real `/doctor` single-binary liveness | PROVEN | Retest report lines 23-48: `resofeed serve`, HTTP 200 `/api/doctor`, browser/ARIA screenshots. |
| Architecture boundary | PROVEN | Static audit of required docs and changed surfaces; no contradictory product-source evidence found. |

## Verification Commands

- `npm --prefix web run check` — PASS, `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run test:render -- src/routes/components/__tests__/ui-preview-runtime-provenance.expected-red.test.ts` — PASS, 1 file / 7 tests.
- `npm --prefix web run test:e2e -- --project=chromium-ci-safe ui-preview-runtime-conformance-audit.expected-red.spec.ts` — PASS, 5 tests.

## Coverage Summary

- Requirements covered: F01-F25, 25/25 CONFORMS.
- Blocking rows: none.
- NEEDS_TEST/PARTIAL rows: none.
- Product files modified by this verification: no.

## Top Risks

- Stale non-target current-operation tests/artifacts still contain pre-repair copy, but the scoped F25 product-source implementation and targeted runtime/render tests now conform.
