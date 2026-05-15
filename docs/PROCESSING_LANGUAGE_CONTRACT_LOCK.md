# Processing Language Contract Lock

Status: acceptance-only contract artifact. This file pins public shapes and non-goals before product behavior implementation. It does not authorize business logic, queues, dashboards, sync, semantic search, or alternate storage.

## Runtime metadata

- `runtime_metadata.processing_language`: string enum `en|zh`; absent means effective `en`; excluded from state export/import.
- `runtime_metadata.search_fts_stale_since`: optional RFC3339 UTC diagnostic marker; present only while FTS may be stale after reprocess begins or fails before the final rebuild; excluded from state export/import.
- `runtime_metadata` remains runtime-only. State bundles continue to include only active sources, active steering rules, and currently resonated items.

## HTTP schemas

- `GET /api/runtime/language` -> `{ "language": { "code": "en"|"zh", "label": "English"|"中文" } }`.
- `PUT /api/runtime/language` body -> `{ "language": "en"|"zh", "actor_kind": "human"|"agent", "actor_id": string, "idempotency_key": string }`; no query params; unknown body fields reject with `400 bad_request`.
- `POST /api/runtime/reprocess-library` body -> `{ "actor_kind": "human"|"agent", "actor_id": string, "idempotency_key": string }`; no query params; result envelope `{ "reprocess": ReprocessLibraryResult, "already_applied": boolean }`.
- `POST /api/items/{id}/delivery` body -> `{ "actor_kind": "human"|"agent", "actor_id": string, "delivered_at": RFC3339_UTC, "idempotency_key": string }`; result envelope `{ "item_id": string, "external_surfaced_at": RFC3339_UTC, "already_applied": boolean }`.
- `GET /api/search` response includes `query: SearchQueryEcho`; unknown or duplicate query params reject with `400 bad_request`.
- `GET /api/doctor` includes exactly one FTS status line: `search_fts: ok` when no marker exists, or `search_fts: stale since <RFC3339_UTC>` while stale.

## MCP parity

- Resource: `resofeed://runtime/language` -> `{ "language": ProcessingLanguageInfo }`.
- Tools: `get_processing_language`, `set_processing_language`, `reprocess_library`, `report_delivery`, and `search_items` reuse HTTP shapes and idempotency/query echo semantics.
- MCP has no per-call language override. It returns stored item/search/detail text as-is, with source identifiers preserved exactly.

## Receipts and fingerprints

- Live receipt TTL: 24 hours.
- Receipt-backed mutating operations that accept bodies compute `request_fingerprint` from the validated request.
- Same live key + same fingerprint replays the stored result snapshot with `already_applied: true` where present.
- Same live key + different fingerprint returns `bad_request` / MCP request-error equivalent with `reason: request_fingerprint_mismatch`.
- Expired rows are transactionally ignored, deleted, or replaced before accepting the reused key; expired rows must not cause uniqueness or fingerprint mismatch failures.
- Receipts remain live-only runtime idempotency/provenance and are not portable state, activity feeds, jobs, queues, or command history.

## Reprocess source and FTS contracts

- Reprocess source precedence: `items.canonical_url` if valid HTTP/HTTPS, then `items.url` if valid HTTP/HTTPS.
- Never use `sources.url`, `items.source_url`, public `provenance.source_url`, or existing stored target-language fields as source material.
- Reprocess preserves source identifiers exactly and rewrites only user-readable processed fields where source/model input is available.
- Final completion rebuilds or fully refreshes FTS. If the final rebuild does not complete, leave `search_fts_stale_since` set and report stale FTS through `/api/doctor`.

## Frontend obligations

- Language is a global processing state, not a per-item display toggle.
- The reprocess action is a terse bracket operation, not a wizard, progress dashboard, queue, or activity log.
- Source identifiers (`URL`, source title, source URL, canonical URL, original link) must not be translated, summarized, transliterated, beautified, or rewritten. DOM rendering must use `translate="no"` or equivalent.

## Explicit non-goals

- No settings dashboard, preference center, onboarding wizard, per-item translation selector, or side-by-side bilingual reader.
- No `translation_failed` status/copy/state.
- No durable reprocess job, queue, command history, activity ledger, sync/merge protocol, portable receipt, worker process, vector DB, embeddings, RAG, delivery-channel registry, or per-agent authorization registry.
