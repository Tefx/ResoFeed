# REG-2026-05-12-01 Source Ledger Authority Adjudication

Status: adjudicated; manual Source Ledger ingest/fetch controls remain forbidden.

## Decision

REG-2026-05-12-01 in `docs/audits/regression-audit-2026-05-12.md` incorrectly treated missing Source Ledger `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, and `[FETCHING...]` controls as a product regression. The canonical authority chain now rejects that requirement.

The Source Ledger must remain a dense flat roster for source visibility, diagnostic details, destructive delete, OPML import, and JSON state export/import. Source addition remains via Steer, and refresh is handled by the background ingest loop. Do not reintroduce manual Source Ledger run/fetch controls or wire that surface to manual ingestion HTTP actions.

## Authority

- `docs/ARCHITECTURE.md` lines 11, 67, and 181-189 define one Go process whose `serve` lifecycle starts the background ingestion loop; no source-management dashboard or side process is part of the architecture.
- `docs/ARCHITECTURE.md` lines 145-151 keeps settings dashboards, moderation consoles, folders, tags, and related management surfaces out of scope.
- `docs/DESIGN.md` lines 463-476 defines Source Ledger anatomy as title, OPML import action, flat source rows, delete action, terse State Portability links, URL subscription routed back to Steer, and optional last-fetch diagnostics; it does not include manual run/fetch actions.
- `docs/DESIGN_VISION.md` line 38 defines the Source Ledger as a barebones flat list, read/delete-only text roster, not a settings dashboard.
- `.agents/instructions.md` lines 37-41 requires dense archival workbench grammar and forbids settings-dashboard/product-creep controls.
- `docs/audits/regression-audit-2026-05-12-contract-matrix.md` line 9 is the adjudicating matrix: REG-01 canonical ledger grammar remains allowed, but Source Ledger must not expose manual ingestion controls including `[RUN INGEST]` or `[FETCH]`; negative assertions must remain active.

## Required UI Behavior Preserved

- Source list rows remain visible with `src:`, `status:`, `last_fetch:`, and URL values.
- `[DELETE]` remains available with a named destructive action and confirmation.
- `[DETAILS]` remains available for source diagnostics.
- `[IMPORT OPML]`, `[EXPORT STATE]`, and `[IMPORT STATE]` remain available from the ledger/footer without creating a settings dashboard.
- Source-add receipts should orient users toward Source Ledger visibility and background ingest, not manual Source Ledger controls.
- Search receipts must not leak into Source Ledger, Today, or `/doctor` surfaces.

## Forbidden Negative Guard

Tests must continue to assert that the rendered Source Ledger has no action controls named `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, or `[FETCHING...]`, and no role=button matching run-ingest/fetch wording.
