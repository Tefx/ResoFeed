# ResoFeed Regression Audit - 2026-05-12

Status: historical failed audit. Current cleanup status: superseded/closed where later closure artifacts provide proof.

This document records the post-fix regression audit run on 2026-05-12. It is a new audit artifact and intentionally does not update `docs/audits/prd-behavior-audit-2026-05-11.md`.

## Current Cleanup Note (2026-05-13)

This document is historical evidence from the 2026-05-12 regression run. Do not treat its original failure summary or acceptance blockers as current state without checking later closure artifacts.

- REG-2026-05-12-01 Source Ledger manual controls: the earlier no-control/ban interpretation is superseded. Current authority allows lightweight `[RUN INGEST]` / `[INGESTING...]` and per-source `[FETCH]` / `[FETCHING...]` bracket actions when anti-dashboard guards hold.
- REG-2026-05-12-02 MCP empty resources: the historical `null` array finding is closed by later runtime proof showing `{"sources":[]}` and `{"rules":[]}`. See `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json`, `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md`, and `docs/audits/mcp-capability-audit-2026-05-12.md`.

Sections below retain original audit observations for traceability; closure status is superseded where explicitly noted.

## Scope

- Current server: `http://127.0.0.1:8080` / `http://localhost:8080`, authenticated with the owner token supplied for this round. The token is redacted from this document and artifacts.
- Isolated destructive test server: real `cmd/resofeed` binary with a temporary SQLite database, a local RSS fixture feed, and a deterministic OpenRouter-compatible stub.
- Browser coverage: browser-use/Playwright user-path automation plus a supplemental Computer Use pass in Chrome. The in-app Browser pane could not be attached during the final manual spot-check (`No active Codex browser pane available`), so Chrome Computer Use was used to confirm visible current-server behavior.
- MCP coverage: real authenticated HTTP `/mcp` calls, including auth failure, `tools/list`, `resources/read`, `search_items`, `read_item`, `resonate_item` idempotency, and schema-error paths.
- No unit-test or in-process handler bypass was used as acceptance evidence.

Primary artifacts:

- `docs/audits/artifacts/regression-audit-2026-05-12c/observations.json`
- `docs/audits/artifacts/regression-audit-2026-05-12c/01-current-feed.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/02-current-direct-doctor.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/05-current-source-ledger.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/10-isolated-feed-after-ingest.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/11-isolated-search-sqlite.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/16-isolated-mobile-search.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/17-isolated-mobile-source-ledger.png`
- `docs/audits/artifacts/regression-audit-2026-05-12c/18-isolated-mobile-doctor.png`

## Result Summary

Automated user-path checks: 38 total, 27 passed, 11 failed.

Confirmed working:

- Current owner token authenticates `/api/feed/today`, `/api/doctor`, and `/mcp tools/list`.
- Current Today feed renders, `/doctor` direct route renders, Steer search opens Search, and no-match Search stays stable without an internal error.
- First-use owner-token prompt and first-use empty state pass on isolated server.
- Adding a new feed by pasting an RSS URL into Steer works on isolated server.
- Isolated backend ingest succeeds when triggered directly for continuation after the UI manual ingest controls are found missing.
- Isolated OpenRouter-compatible summary path and natural-language Steer translation path both execute and render clean receipts.
- Isolated Search finds the fixture item and excludes unrelated rows.
- Isolated Inspector renders source-backed content without obvious source-furniture pollution.
- MCP auth failure, `tools/list`, `search_items`, `resonate_item` idempotent replay, and invalid-params rejection pass.

## Findings

### REG-2026-05-12-01 - Source Ledger manual ingest and fetch controls authority conflict

Adjudication status: updated. The 2026-05-12 ban on Source Ledger `[RUN INGEST]` / `[FETCH]` controls is superseded by the 2026-05-13 product decision recorded in `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md`, `docs/DESIGN.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/UI_REGRESSION_CONTRACT.md`, and `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md`.

Current authoritative guidance: Source Ledger may expose lightweight manual controls, but only as flat bracket actions. `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]` are allowed when they remain immediate operational commands backed by the documented ingest/fetch HTTP paths. They must not create dashboards, queues, job tables, retry panels, command histories, activity ledgers, sync/merge controls, source hierarchies, settings panels, or a second source URL paste field.

Severity: P1 historical finding; current closure condition changed from “controls absent” to “lightweight controls present without dashboard drift.”

Historical evidence:

- `05-current-source-ledger.png`
- `09-isolated-source-ledger-after-add.png`
- `17-isolated-mobile-source-ledger.png`
- `observations.json` failures:
  - `Current Source Ledger exposes global [RUN INGEST] control`
  - `Current Source Ledger exposes per-source [FETCH] control`
  - `Isolated Source Ledger exposes global [RUN INGEST] control`
  - `Isolated Source Ledger exposes per-source [FETCH] control`

Historical audit rationale, now accepted under a narrower boundary:

- `docs/PRD.md` requires Source Ledger to expose lightweight manual ingestion controls, one global and one per source.
- `docs/PRD.md` AC-18 defines global manual ingest and per-source manual fetch behavior.
- `docs/DESIGN.md` defines Source Ledger as the only UI location for these manual controls, with canonical labels `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]`.
- `docs/ARCHITECTURE.md` defines the corresponding HTTP actions and non-overlap guard while forbidding persisted jobs/queues/ledgers.

Impact:

- A user can add a new feed through Steer and then explicitly trigger ingest/fetch from Source Ledger without waiting for the background loop.
- The implementation must still preserve the flat ledger boundary and avoid settings/dashboard behavior.

Current required fix:

- Reinstate Source Ledger props/actions for `runIngest` and per-source `fetchSource`.
- Render `[RUN INGEST]` with `last_ingest` status.
- Render per-source `[FETCH]`, `[FETCHING...]`, raw `err: <diagnostic>`, and updated `last_fetch` state without row layout shift.
- Replace old negative tests that required these controls to be absent with positive reachability/state tests plus anti-dashboard negative assertions.

### REG-2026-05-12-02 - MCP empty resources serialized arrays as null during the historical audit

Severity: P2 historical; current status: CLOSED_BY_LATER_RUNTIME_PROOF.

During the 2026-05-12 isolated audit, empty MCP resource reads returned `null` for array fields:

- `resofeed://sources` returned `{ "sources": null }`
- `resofeed://rules/active` returned `{ "rules": null }`

Evidence from the historical run:

- `observations.json` failures:
  - `Isolated MCP empty sources resource returns [] not null`
  - `Isolated MCP empty active rules resource returns [] not null`
- Historical code path cited at the time: `internal/resofeed/mcp.go` initialized `var sources []Source`; `internal/resofeed/ranking.go` initialized `var rules []SteerRule`.

Why this violated the contract at the time:

- `docs/ARCHITECTURE.md` defines `resofeed://sources` as JSON `{ "sources": [Source] }`.
- `docs/ARCHITECTURE.md` defines `resofeed://rules/active` as JSON `{ "rules": [SteerRule] }`.

Impact at the time:

- Authorized agents had to handle `null` and `[]` as different shapes even though the resource schema says arrays.
- This weakened HTTP/MCP parity and created avoidable client branching.

Closure evidence:

- `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json` records empty MCP resources as `{"sources":[]}` and `{"rules":[]}`.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` records REG-2026-05-12-02 as closed by real integration proof.
- `docs/audits/mcp-capability-audit-2026-05-12.md` now marks the related MCP-2 finding `CLOSED_BY_LATER_RUNTIME_PROOF`.

Historical expected fix, now closed:

- Initialize empty slices before marshaling resource responses.

### REG-2026-05-12-03 - Search exposes duplicate visible submit controls

Severity: P2.

The isolated Search surface renders both `search` and `submit search` as visible controls.

Evidence:

- `11-isolated-search-sqlite.png`
- `observations.json` failure: `Search submit accessible naming is unique among visible controls`
- Failure detail: one visible `search` button and one visible `submit search` button.

Impact:

- Keyboard and screen-reader users encounter duplicate submit actions.
- The UI feels like implementation scaffolding rather than a single clean retrieval surface.

Expected fix:

- Keep one visible submit control.
- If a secondary a11y-only submit exists, ensure it is actually visually hidden and does not enter the visible control set.

### REG-2026-05-12-04 - MCP `read_item` can return a full item without extracted detail text

Severity: P2.

The isolated MCP `read_item` call returns provenance, summary, and item metadata, but the audited full source-backed fixture has no `extracted_text`.

Evidence:

- `observations.json` failure: `Isolated MCP read_item returns provenance and detail text`
- Failure detail shows `hasExtracted: false` for `SQLite transport parity regression`.
- The same isolated run fetched `/articles/sqlite` and recorded `extraction_status=full`.

Impact:

- Authorized agents can search and read the item, but do not receive the expected full detail text for a full extraction item.
- This weakens parity with the Inspect workflow and undercuts retrieval requirements for indexed/extracted-text fields.

Expected fix:

- Ensure article extraction stores non-empty `extracted_text` when `extraction_status=full`.
- If full extraction legitimately produces no detail text, downgrade status or expose a clear fallback reason.

### REG-2026-05-12-05 - Mobile utility surfaces still leak inactive Today feed into the page/accessibility flow

Severity: P1/P2.

Mobile Search, Source Ledger, and `/doctor` still report the inactive feed as visible or present in the active flow.

Evidence:

- `16-isolated-mobile-search.png`
- `17-isolated-mobile-source-ledger.png`
- `18-isolated-mobile-doctor.png`
- `observations.json` failures:
  - `Isolated mobile Search hides inactive feed and shows result in first screen`
  - `Isolated mobile Source Ledger hides inactive feed and preserves row grammar`
  - `Isolated mobile /doctor hides inactive feed`

Failure details:

- `mobileSearchFeedVisible: true`
- `mobileLedgerFeedVisible: true`
- `mobileDoctorFeedVisible: true`

Impact:

- Narrow/mobile utility surfaces are not clean single-surface routes.
- Users and assistive technology can encounter inactive Today feed content while operating Search, Ledger, or `/doctor`.

Expected fix:

- On narrow/mobile utility routes, hide or unmount inactive feed panels.
- Apply `inert`, `aria-hidden`, or equivalent state so the inactive feed is not in the reading or accessibility flow.

### REG-2026-05-12-06 - Current live LLM path is not healthy

Severity: P1 for the current running instance, P2 as a product regression until root cause is classified.

The current 8080 server accepts the new owner token, but its live data shows model fallback behavior rather than successful LLM summaries.

Evidence:

- `01-current-feed.png` shows feed rows with `fallback: excerpt-only` and `quality: fallback: excerpt-only`.
- `02-current-direct-doctor.png` reports provider/model uncertainty and many item transform failures.
- `observations.json` `currentFeedItems` list shows top current items with `model_status: model_latency_error` and `value_tier: null`.

Important distinction:

- The isolated deterministic OpenRouter-compatible path passes: summary generation requests were sent, fixture items rendered clean model-backed summaries, and natural-language Steer translation succeeded.
- The live current server still presents a degraded LLM experience, so this remains visible to the user even if the application wiring works under the stub.

Expected fix:

- Determine whether the current server is missing live model configuration, using a stale database with prior failures, or still timing out in the OpenRouter client path.
- Keep fallback taxonomy visible, but avoid counting fallback-only current summaries as a successful live LLM summary path.

### REG-2026-05-12-07 - Source Ledger inherits stale Search receipt

Severity: P3.

After Search navigation, the current Source Ledger screenshot still shows `retrieval: lexical search` above the Ledger.

Evidence:

- `05-current-source-ledger.png`

Impact:

- Ledger is an operational source-management surface, but it carries a retrieval receipt from another surface.
- This confuses the surface boundary and makes the page look state-leaky.

Expected fix:

- Scope retrieval receipts to the Search surface.
- Clear or hide Search receipts when navigating to Source Ledger, Today, or `/doctor`.

### REG-2026-05-12-08 - Feed row metadata is overly diagnostic

Severity: P3.

Current feed rows show repeated internal fallback labels such as `fallback: excerpt-only` and `quality: fallback: excerpt-only`.

Evidence:

- `01-current-feed.png`
- `browser-use-current-authenticated-state.txt`

Why this is design drift:

- `docs/DESIGN.md` defines feed rows as triage surfaces with compact metadata: source, age, extraction, and terse value/quality markers.
- Longer provenance and model/fallback details belong in Inspector, disclosure, or `/doctor`.

Impact:

- The feed reads more like a diagnostic dump than a dense archival index.
- The same fallback concept is repeated twice in the metadata row.

Expected fix:

- Use a compact marker such as `excerpt` or `fallback` once in the feed row.
- Move detailed model/fallback explanation to Inspector or `/doctor`.

### REG-2026-05-12-09 - Inspector exposes model status in the primary reading header

Severity: P3.

Inspector currently shows `model_status` in the main metadata/header area.

Evidence:

- `01-current-feed.png`
- `10-isolated-feed-after-ingest.png`

Impact:

- Inspector becomes visibly diagnostic even when the user is reading item detail.
- `/doctor` is the correct primary surface for raw provider/model diagnostics.

Expected fix:

- Keep Inspector primary metadata focused on source, extraction status, summary provenance, title, original link, summary, core insight, full text/excerpt, and why-this-appeared.
- Move raw model status into `/doctor` or a source/details disclosure.

## MCP Capability Notes

Historical tested MCP operations in this audit run:

- Missing auth returned HTTP 401: pass.
- `tools/list` exposed expected tools: pass.
- Empty resources shape failed at the time for `sources` and `rules` because arrays serialized as `null`.
- `search_items` found the ingested fixture: pass.
- `read_item` returned provenance but lacked expected extracted detail text for the audited full fixture: fail.
- `resonate_item` mutated and replayed idempotently: pass.
- `search_items` missing query rejected with invalid params: pass.

Current closure status:

- Empty MCP resource arrays are closed by later runtime proof showing `{"sources":[]}` and `{"rules":[]}`.
- MCP `read_item` detail parity is closed by later runtime proof with an `extracted_text` marker.

Historical MCP blockers from this section are therefore not current blockers unless a later regression reopens them.

## UX Review Addendum

An additional UI/UX review was performed against the audit screenshots. It identified these open design issues:

- Source Ledger manual `[RUN INGEST]` and `[FETCH]` controls are now accepted under the lightweight bracket-action boundary; implement them without dashboard/job/activity drift.
- Mobile utility surfaces still need stricter inactive-panel containment.
- Search should have one visible submit action.
- Current feed metadata is too diagnostic and repetitive.
- Inspector should not foreground raw `model_status`.
- Source Ledger should not display stale Search receipts.

Lower-priority polish:

- Search filters can be tighter and more clearly grouped on desktop.
- Mobile Search results can reduce metadata height to preserve first-screen result density.
- Mobile Source Ledger should group destructive `[DELETE]` after safer row actions such as `[FETCH]` and `[DETAILS]`.
- Mobile `/doctor` is correctly raw, but repeated diagnostics could be formatted into cleaner key/value lines without turning it into a dashboard.

Appears fixed or improved compared with earlier rounds:

- Feed shell is now closer to a dense archival workbench.
- Feed row casing and age markers are more scannable.
- Search title has been reduced to `SEARCH` and results reuse feed-like anatomy.
- Mobile Source Ledger row grammar is readable.
- Direct `/doctor` renders as an independent raw diagnostic surface.

## Acceptance Status

Historical status at the time of the 2026-05-12 run: this round was not green. The list below preserves the original priority order for traceability, with current cleanup status added:

1. Restore lightweight Source Ledger `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]` controls under the flat bracket-action boundary, and replace old absence assertions with anti-dashboard assertions. **Current status: superseded into current authority / expected behavior.**
2. Fix mobile inactive panel containment for Search, Source Ledger, and `/doctor`. **Current status: closed by later UI regression closure artifacts.**
3. Normalize MCP empty resource arrays. **Current status: CLOSED_BY_LATER_RUNTIME_PROOF via `mcp_empty_resources_and_auth.json`.**
4. Investigate current live LLM failures and avoid counting fallback-only current summaries as live LLM success. **Current status: repo-owned fallback honesty closed; live provider success remains non-blocking external/provider debt.**
5. Fix MCP `read_item` extracted detail behavior for full items. **Current status: closed by later MCP `read_item` runtime proof.**

Do not treat this historical acceptance section as current blocker state without consulting the later closure artifacts named in the Current Cleanup Note.
