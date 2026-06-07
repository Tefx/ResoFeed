# Processing Language Contract Lock

Status: implemented contract artifact. This file pins public shapes and non-goals for the runtime language, reprocess, delivery, and query echo behavior. It does not authorize business logic, queues, dashboards, sync, semantic search, or alternate storage.

## Runtime metadata

- `runtime_metadata.processing_language`: string enum `en|zh`; absent means effective `en`; excluded from state export/import.
- `runtime_metadata.search_fts_stale_since`: optional RFC3339 UTC diagnostic marker; present only while FTS may be stale after reprocess begins or fails before the final rebuild; excluded from state export/import.
- `runtime_metadata` remains runtime-only. State bundles continue to include only active sources, active steering rules, and currently resonated items.

## HTTP schemas

- `GET /api/runtime/language` -> `{ "language": { "code": "en"|"zh", "label": "English"|"中文" }, "already_applied": false }`.
- `PUT /api/runtime/language` body -> `{ "language": "en"|"zh", "actor_kind": "human"|"agent", "actor_id": string, "idempotency_key": string }`; no query params; unknown body fields reject with `400 bad_request`.
- `POST /api/runtime/reprocess-library` body -> `{ "actor_kind": "human"|"agent", "actor_id": string, "idempotency_key": string }`; no query params; result envelope `{ "reprocess": ReprocessLibraryResult, "already_applied": boolean }`.
- `POST /api/items/{id}/delivery` body -> `{ "actor_kind": "human"|"agent", "actor_id": string, "delivered_at": RFC3339_UTC, "idempotency_key": string }`; result envelope `{ "item_id": string, "external_surfaced_at": RFC3339_UTC, "already_applied": boolean }`.
- `GET /api/search` response includes `query: SearchQueryEcho`; unknown or duplicate query params reject with `400 bad_request`.
- `GET /api/doctor` includes exactly one FTS status line: `search_fts: ok` when no marker exists, or `search_fts: stale since <RFC3339_UTC>` while stale.

## MCP parity

- Resource/tool read: `resofeed://runtime/language` and `get_processing_language` -> `{ "language": ProcessingLanguageInfo, "already_applied": false }`.
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
- Never use `sources.url`, `items.source_url`, public `provenance.source_url`, or existing stored target-language interpretation fields (`title`, `summary`, `core_insight`) as source material.
- Narrow reprocess-only stored fallback exception: if every fresh article fetch candidate fails, reprocess may use already persisted source-backed fallback text from `items.source_evidence_text` only; if unavailable or low-information and `TAVILY_API_KEY` is configured for an eligible article URL, reprocess then attempts Tavily source-text recovery before final per-item classification. Tavily timeout or provider/network/HTTP/schema/unreadable-body failure maps to per-item `timeout` or `provider_error` and counts in `items_failed`; missing key, no eligible Tavily candidate, or sanitized unusable Tavily evidence maps to `original_unavailable` and counts in `items_unavailable`. Generated `items.extracted_text` and processed/display `items.feed_excerpt` are target-language item text and must not be used as source evidence. This exception is limited to existing library reprocess and selected item re-ingest, does not apply to normal ingest/source fetch, does not permit invented content, does not permit source feed URL article fetches, and does not permit broad reuse of stored summaries, core insights, key points, generated extracted text, feed display text, or titles as source material. The LLM input URL/provenance remains the original article URL or selected canonical article URL, never the RSS/Atom feed URL.
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
