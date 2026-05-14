# REG-2026-05-12-01 Source Ledger Authority Adjudication

Status: superseded by the 2026-05-13 product decision allowing lightweight Source Ledger manual ingest/fetch controls.

## Supersession Decision

The prior REG-2026-05-12-01 adjudication rejected Source Ledger `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]` controls because the then-current authority treated Source Ledger as view/delete/import/export/details only and delegated refresh to background ingest.

That ban is now superseded. Source Ledger may expose lightweight manual controls:

- global `[RUN INGEST]` / `[INGESTING...]` for all active sources;
- per-source `[FETCH]` / `[FETCHING...]` for one source row;
- terse `last_ingest: HH:MM:SS`, `last_fetch: HH:MM:SS`, raw `err: <diagnostic>`, and conflict feedback.

## Preserved Boundary

The supersession does not authorize a source-management dashboard. Source Ledger remains a dense flat roster for source visibility, diagnostic details, destructive delete, OPML import, JSON state export/import, and lightweight manual ingest/fetch only.

Still forbidden:

- folders, tags, source hierarchy, pause/resume toggles, drag ordering, ranking/scoring sliders;
- settings dashboards, job dashboards, retry panels, persistent queues, job tables, command histories, activity ledgers;
- sync/merge controls, portable manual-ingest receipts, or additional source-management surfaces;
- a second URL subscription field inside Source Ledger. Source addition remains via Steer.

## Current Authority

- `docs/DESIGN.md` defines Source Ledger manual controls as bracket actions with terminal-synchronous text replacement and no dashboard behavior.
- `docs/ARCHITECTURE.md` defines `POST /api/ingest` and `POST /api/sources/{id}/fetch` as immediate HTTP actions guarded by one in-process ingest concurrency guard; no queues/jobs/ledgers are permitted.
- `docs/PRD.md` AC-18 permits lightweight manual fetch controls and explicitly forbids persistent jobs, queues, activity entries, and dashboard drift.
- `docs/UI_REGRESSION_CONTRACT.md` and `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md` now treat `[RUN INGEST]` and `[FETCH]` as positive contract targets while preserving anti-dashboard negative assertions.

## Test Contract Consequence

Tests must no longer assert that `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, or `[FETCHING...]` are absent from Source Ledger.

Tests must instead assert:

- controls are present, reachable, and stable;
- pending/success/error/conflict states remain terse text replacement;
- source row geometry and 44px hit targets do not shift;
- no dashboard, job queue, activity ledger, source hierarchy, settings, sync/merge, or second add-source field appears.
