# ResoFeed Usage Guide

Status: implemented usage contract

This document describes the implemented user-facing command, UI, HTTP API, and MCP usage contract. `docs/ARCHITECTURE.md` remains the canonical schema and boundary source.

## What ResoFeed Is

ResoFeed is a single-tenant RSS intelligence tool for one human owner and authorized delegated agents.

It helps you:

- read a fresh daily surface from configured RSS/Atom sources;
- inspect source-backed summaries and provenance;
- mark durable value with Resonate;
- steer future scoring and summaries in natural language;
- retrieve older items through lexical and metadata search;
- let external agents retrieve, deliver, and report item handoff through MCP.

ResoFeed is not an inbox-zero reader, read-it-later app, semantic chat product, RAG engine, team SaaS, settings dashboard, or notification-channel owner.

## Quick Start

### 1. Build

```bash
npm --prefix web install
npm --prefix web run build
mkdir -p ./bin
go build -o ./bin/resofeed ./cmd/resofeed
```

### 2. Configure the OpenRouter API key safely

ResoFeed resolves the OpenRouter API key at runtime. Prefer an OS environment variable or a local `.env` file; do not paste real API keys into commands that will be saved in shell history. A missing key does not prevent the server from binding, but OpenRouter-backed summaries and steering translation are unavailable until a key is configured. Live HTTP model listing is the explicit request-time secret-resolution exception, so it can reflect current OS environment or local `.env` configuration without persisting the secret.

Safe options:

- Set `OPENROUTER_KEY` through your OS, shell profile, service manager, or hosting platform secret manager without committing it to the repository.
- Create a local `.env` file with your editor or another secret-safe workflow:

```text
# .env is local-only; do not commit or print the real value.
OPENROUTER_KEY=<redacted-local-value>
```

The `.env` file is local runtime input only. Do not commit it, paste it into issue comments, include it in state exports, or print it in logs/evidence.

Secret-source precedence for OpenRouter is:

1. OS environment variable `OPENROUTER_KEY`;
2. local `.env` fallback.

`OPENROUTER_KEY` is the only documented OpenRouter API-key name. OpenRouter secrets must not be passed through CLI flags.

Explicit empty or whitespace-only values are invalid. Parser and validation errors must not include the secret value.

Local `.env` parsing is intentionally minimal: only `KEY=VALUE` lines are supported; blank lines and `#` comments are ignored. ResoFeed must not source shell scripts, expand variables, run commands, or evaluate command substitution from `.env`.

### 3. Run with OpenRouter

```bash
./bin/resofeed serve \
  --addr 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --db ./data/resofeed.sqlite3 \
  --first-fetch-limit 50 \
  --openrouter-model openai/gpt-4.1-mini
```

`--openrouter-model` is optional and non-secret. If it is omitted or empty, ResoFeed uses the OpenRouter account default and reports the configured model as `account_default`. Provided model strings are passed to OpenRouter unchanged; startup does not perform a network model validation check.

`--first-fetch-limit` caps how many items are stored on a brand-new source's first fetch. It defaults to `50`, may fall back to `RESOFEED_FIRST_FETCH_LIMIT` when the flag is omitted, allows `0` for unlimited, and has a maximum of `500`. Non-integer, negative, or greater-than-`500` values are invalid startup configuration and exit before binding with a safe stderr diagnostic. Incremental fetches after any item already exists are uncapped.

`serve` starts everything: web UI, JSON HTTP API, MCP Streamable HTTP at `/mcp`, background ingestion, SQLite open/migrate, and static asset serving.

There are intentionally no separate `migrate`, `worker`, `doctor`, `admin`, or `sync` processes. Migrations run during `serve`; diagnostics are exposed through Steer `/doctor` and `GET /api/doctor`.

Flags:

| Flag | Required? | Purpose |
|---|---:|---|
| `--addr` | No | Bind address for web UI, HTTP API, and MCP endpoint. Default: `127.0.0.1:8080`. |
| `--public-url` | No | Base URL external agents should use. Default derives from `--addr` for local use. |
| `--db` | No | SQLite database file path. Default: `./data/resofeed.sqlite3`. |
| `--openrouter-model` | No | Optional OpenRouter model. Empty or omitted means account default; provided values are passed through unchanged. |
| `--owner-token` | No | Explicit owner token. If omitted, ResoFeed generates or reuses one automatically. |
| `--first-fetch-limit` | No | Maximum items to store on a brand-new source's first fetch. Default: `50`; env fallback: `RESOFEED_FIRST_FETCH_LIMIT`; `0` means unlimited; max `500`. |

### 4. Owner token behavior

If `--owner-token` is provided, ResoFeed uses that plaintext token for this startup, stores only its SHA-256 hash as the current owner-token verifier, and never stores the plaintext token.

If `--owner-token` is omitted:

1. ResoFeed checks SQLite runtime metadata for an existing owner-token hash.
2. If one exists, it reuses that hash for verification.
3. If none exists, it generates a new random owner token, stores only its hash, and prints the plaintext token once in the startup log.

First-run startup output should include a line like:

```text
owner token generated: rfeed_<43 base64url characters>
```

Save this token. Use it for protected HTTP requests and MCP clients.

The generated owner token is runtime credential state. It is not part of Source Ledger export/import and is not a user-facing activity record.

Explicit `--owner-token` values must be at least 32 visible non-whitespace characters. Tokens are not trimmed; leading or trailing whitespace makes the token invalid.

If you still know a valid plaintext token and want to rotate it, start ResoFeed once with a new explicit token:

```bash
./bin/resofeed serve \
  --db ./data/resofeed.sqlite3 \
  --owner-token "rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"
```

This example can start without `OPENROUTER_KEY`, but OpenRouter-backed operations remain unavailable until the key is supplied through the OS environment or local `.env` fallback.

If the plaintext token is lost and only the SQLite hash remains, it cannot be recovered. Stop `serve`, delete only the server-side verifier with the offline reset command, then start `serve` again:

```bash
./bin/resofeed owner-token reset \
  --db ./data/resofeed.sqlite3 \
  --confirm-reset
```

The reset command is CLI-only and operates on the offline SQLite database. It deletes only `runtime_metadata.key='owner_token_sha256'`. It does not generate, print, accept, or store a replacement plaintext token.

After reset, either:

- run `./bin/resofeed serve --db ./data/resofeed.sqlite3` without `--owner-token` to let startup generate a new token and print it once; or
- run `serve` with a new explicit `--owner-token` to set the replacement through the normal startup path.

There is intentionally no HTTP API, MCP tool, Settings screen, or browser UI action for server-side token reset. Do not use or persist a `serve --reset-owner-token` style startup flag.

### 5. Open the UI

```text
http://127.0.0.1:8080
```

On first open, paste the owner token printed at startup or supplied with `--owner-token`. The browser stores it locally as `resofeed.ownerToken` and sends it as `Authorization: Bearer <OWNER_TOKEN>` for every `/api/*` request.

The top chrome stays sparse. Use the `RESOFEED` menu to reach utility surfaces such as `TODAY` and `SOURCE LEDGER`; those entries may be hidden while the menu is closed.

Deleting `localStorage['resofeed.ownerToken']` or clearing browser storage only forgets the browser-local copy. It does not rotate or reset the server-side owner token stored as a SQLite hash. If the browser has a stale token, the UI should prompt for the current owner token again after `401 unauthorized`.

### 6. Add sources

- Paste an RSS/Atom URL into Steer; or
- open `RESOFEED` → `SOURCE LEDGER` and import OPML.

OPML folders are ignored and flattened immediately. Source Ledger does not provide a second URL paste field; URL subscription remains a Steer action.

### 7. Let ingestion run

ResoFeed fetches sources, extracts content when possible, summarizes items with OpenRouter, indexes searchable text, and builds the Today surface. The default background ingest interval is 15 minutes.

If you want an immediate refresh, open `RESOFEED` → `SOURCE LEDGER` and use `[RUN INGEST]` for all active sources or `[FETCH]` on one source row. These are lightweight one-shot controls: they show terse pending/success/error text and do not create jobs, queues, or activity history.

Use an always-on host if mobile access or external-agent workflows should continue while your laptop sleeps.

### 8. Runtime processing language and reprocess

ResoFeed has one runtime processing language for the local owner runtime. It supports `en` and `zh`, defaults to `en` when unset, and is persisted as `runtime_metadata.processing_language`. This runtime metadata is not included in state export/import.

Changing language affects future ingestion and UI/MCP language metadata immediately, but it does not rewrite existing stored item text or rebuild FTS by itself. To rewrite existing stored readable item fields into the current language, use the explicit `[REPROCESS LIBRARY]` / `[重处理资料库]` action or the API/MCP operations documented below.

Reprocess is an immediate owner-authorized operation. It preserves source identifiers, rewrites stored readable item fields where source text is available, rebuilds FTS when completion reaches the final indexing step, and reports counts in the response. It does not create a durable job, queue, dashboard, retry panel, activity log, sync record, or portable receipt. If reprocess fails before the final FTS rebuild, `/api/doctor` reports `search_fts: stale since <RFC3339_UTC>` until a later successful rebuild clears the marker.

The web UI renders the control tersely as `LANG: EN`, `LANG: ZH`, `语言: 英文`, or `语言: 中文`; updates are announced through live status text and `<html lang>` follows `en` or `zh-CN`. Source identifiers such as URLs, source titles, source URLs, canonical URLs, and original links remain unchanged and are marked non-translatable in the DOM where rendered.

## Container Deployment

Container packaging is documented in [`docs/CONTAINER.md`](CONTAINER.md). The core container contract remains one `resofeed serve` process, one persistent SQLite volume, and one HTTP port that serves the UI, JSON HTTP API, and MCP at `/mcp`.

With the image `ENTRYPOINT`, pass ResoFeed CLI arguments to the container. Prefer these container command arguments:

```text
serve \
  --addr 0.0.0.0:8080 \
  --public-url http://<host>:8080 \
  --db /data/resofeed.sqlite3
```

The effective process invocation is `/app/resofeed serve ...` in the documented image contract. Full Docker run examples are in [`docs/CONTAINER.md`](CONTAINER.md). `--db` is optional in the binary, but container deployments should use an explicit `/data` volume path. If `--owner-token` is omitted, the generated token is printed once to stdout and can be read from container logs. HTTPS and private-network access are deployment-layer choices; a non-core Tailscale example is available in [`docs/examples/TAILSCALE_CONTAINER.md`](examples/TAILSCALE_CONTAINER.md).

## HTTP Command Reference

All `/api/*` HTTP requests use the owner token from startup output or the explicit `--owner-token` value. Static UI assets can load without the token so the browser can show the token prompt.

Use this header:

```text
Authorization: Bearer <OWNER_TOKEN>
```

The examples below use the default local URL directly to avoid requiring environment variables. JSON examples are abridged for readability; `docs/ARCHITECTURE.md §6 HTTP Surface` is the canonical schema source.

Missing or invalid auth returns:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "owner token required",
    "details": {}
  }
}
```

### Add a source through Steer

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/steer" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"command":"https://example.com/feed.xml","actor_kind":"human","actor_id":"owner","idempotency_key":"steer-add-source-001"}'
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "receipt": {
    "interpreted_as": "add_source",
    "message": "source added",
    "changed_rules": []
  }
}
```

### Send a steering instruction

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/steer" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"command":"Push more technical documents about distributed systems.","actor_kind":"human","actor_id":"owner","idempotency_key":"steer-policy-001"}'
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "receipt": {
    "interpreted_as": "steering_policy_update",
    "message": "steering updated",
    "changed_rules": [
      {
        "id": "rule_01",
        "rule_text": "Push more technical documents about distributed systems.",
        "is_active": true,
        "revision": 1
      }
    ]
  }
}
```

### Read Today
```bash
curl -sS "http://127.0.0.1:8080/api/feed/today" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

With an explicit result cap and pagination offset:

```bash
curl -sS "http://127.0.0.1:8080/api/feed/today?limit=20&offset=20" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "items": []
}
```

Supported query parameters:

| Parameter | Meaning |
|---|---|
| `limit` | Result cap. Defaults to `50`; maximum `100`. |
| `offset` | Pagination offset. Defaults to `0`; accepts non-negative integer values through `10000` and may be combined with `limit`. |

Invalid, duplicate, or unknown query parameters return `400 bad_request` with the canonical JSON error body from `docs/ARCHITECTURE.md §6`.
### Read an item

```bash
curl -sS "http://127.0.0.1:8080/api/items/ITEM_ID" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "item": {
    "id": "ITEM_ID",
    "title": "Example article",
    "url": "https://example.com/article",
    "source_title": "Example",
    "summary": "Dense factual summary.",
    "core_insight": "Why this matters.",
    "extracted_text": "...",
    "extraction_status": "full",
    "model_status": "ok",
    "is_resonated": false
  }
}
```

### List OpenRouter models for one-time item re-ingest
The current provider-backed model-list path is HTTP `GET /api/runtime/openrouter-models`. A compatibility path, `GET /api/runtime/openrouter/models`, is also accepted with the same owner-token auth, query rejection, response shape, and redaction rules. These routes are for request-time model selector display only; model lists and selected model state are not persisted. MCP `list_openrouter_models` uses the same request-time OpenRouter model-list operation and returns the same `{ "models": [{ "id", "name" }] }` envelope, with `{ "models": [] }` when no runtime OpenRouter key is resolved.

```bash
curl -sS "http://127.0.0.1:8080/api/runtime/openrouter-models" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response:

```json
{
  "models": [
    { "id": "openai/gpt-4.1-mini", "name": "GPT-4.1 Mini" }
  ]
}
```

Both model-list paths accept no query parameters. Missing or invalid owner-token auth returns the standard `401 unauthorized` JSON error body.

If no OpenRouter key is resolved for the model-list request, both model-list paths return `200` with `{ "models": [] }`. Provider failures after a key is configured return the standard `503 provider_unavailable` JSON error body without raw provider details.

### Re-ingest one selected item

Use item re-ingest when the selected Inspector item needs one explicit retry with an optional request-scoped model and one-time prompt. The operation uses the current persisted processing language; it does not accept a per-call `language` field.

Prompting note: the `prompt` / `extra_prompt` value is one-time editorial guidance for this selected item only. It may affect emphasis, angle, and source-backed fact selection, but it cannot override the output schema, target language, source grounding, source identifier preservation, safety rules, provenance, runtime/provider status handling, or persistence boundaries. It must not be used to disclose secrets or to ask ResoFeed to echo hidden prompt text. The full prompting contract is [`docs/PROMPTING_SYSTEM.md`](PROMPTING_SYSTEM.md).

Canonical request body:

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/items/ITEM_ID/reingest" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-ITEM_ID-001","model":null,"prompt":"one-time retry instruction"}'
```

Compatibility body using `extra_prompt`:

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/items/ITEM_ID/reingest" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"reingest-ITEM_ID-compat-001","model":"openai/gpt-4.1-mini","extra_prompt":"one-time retry instruction"}'
```

Abridged example response:

```json
{
  "already_applied": false,
  "reingest": {
    "item_id": "ITEM_ID",
    "status": "completed",
    "item_updated": true,
    "fts_updated": true,
    "item": {
      "id": "ITEM_ID",
      "summary": "Updated target-language summary.",
      "core_insight": "Updated target-language core insight."
    }
  }
}
```

Rules: `prompt` is canonical; `extra_prompt` is a compatibility alias. Empty prompts normalize to no one-time prompt. `model: null`, omitted, empty, or whitespace-only means the account/runtime default for that call. Unknown fields, including `language`, are rejected. Reusing the same live idempotency key with changed prompt/model returns `400 bad_request`. Prompt and model are request-scoped only: they are not stored in runtime metadata, state export/import, browser localStorage, provider config, durable preferences, jobs, queues, or history.
### Mark inspected

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/items/ITEM_ID/inspect" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"inspect-ITEM_ID-001"}'
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "item_id": "ITEM_ID",
  "human_inspected_at": "2026-05-09T00:00:00Z",
  "already_applied": false
}
```

### Set resonance

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/items/ITEM_ID/resonance" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"resonated":true,"actor_kind":"human","actor_id":"owner","idempotency_key":"resonate-ITEM_ID-001"}'
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "item_id": "ITEM_ID",
  "is_resonated": true,
  "already_applied": false
}
```

### Report external delivery

Use delivery reporting when a human or authorized external agent actually surfaces an item outside the ResoFeed UI. This updates `external_surfaced_at` for duplicate-surfacing avoidance. It does not create a delivery-channel registry, delivery dashboard, job, queue, sync record, or activity ledger.

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/items/ITEM_ID/delivery" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T00:00:00Z","idempotency_key":"delivery-ITEM_ID-001"}'
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "item_id": "ITEM_ID",
  "external_surfaced_at": "2026-05-09T00:00:00Z",
  "already_applied": false
}
```

Reusing the same live `idempotency_key` with the same request fingerprint returns the stored result with `already_applied: true`. Reusing the same live key with a different fingerprint returns `400 bad_request` with `details.reason: "request_fingerprint_mismatch"`.

### List sources

```bash
curl -sS "http://127.0.0.1:8080/api/sources" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "sources": []
}
```

### Delete a source

```bash
curl -sS -X DELETE "http://127.0.0.1:8080/api/sources/SOURCE_ID" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "source_id": "SOURCE_ID",
  "deleted": true,
  "revision": 2
}
```

### Import OPML

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/sources/import-opml" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/xml" \
  --data-binary @subscriptions.opml
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "imported": 12,
  "skipped": 0,
  "folders_flattened": true
}
```

### Search

```bash
curl -sS "http://127.0.0.1:8080/api/search?q=sqlite&source=example&from=2026-01-01&to=2026-12-31&resonated=true" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "items": [],
  "query": {
    "q": "sqlite",
    "source": "example",
    "from": "2026-01-01",
    "to": "2026-12-31",
    "resonated": true,
    "limit": 50
  }
}
```

Supported query parameters:

| Parameter | Meaning |
|---|---|
| `q` | Plain text query. |
| `source` | Source name or source id filter. |
| `from` | Inclusive date filter, `YYYY-MM-DD`. |
| `to` | Inclusive date filter, `YYYY-MM-DD`. |
| `resonated` | `true` or `false`. |
| `limit` | Result cap. Defaults to `50`; maximum `100`. |

The response always includes a `query` echo envelope containing the effective `q`, `source`, `from`, `to`, `resonated`, and `limit` values. Invalid, duplicate, or unknown query parameters return `400 bad_request` with `details.field` naming the rejected parameter.

### Get or set runtime processing language

```bash
curl -sS "http://127.0.0.1:8080/api/runtime/language" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Example response:

```json
{
  "language": {
    "code": "en",
    "label": "English"
  },
  "already_applied": false
}
```

Set the runtime language for future processing:

```bash
curl -sS -X PUT "http://127.0.0.1:8080/api/runtime/language" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"language-zh-001"}'
```

Example response:

```json
{
  "language": {
    "code": "zh",
    "label": "中文"
  },
  "already_applied": false
}
```

Accepted language values are `en` and `zh`. The endpoint accepts no query parameters and rejects unknown body fields. Setting the runtime language is metadata-only and affects future processing or explicit reprocess rather than rewriting existing rows. It is blocked while background ingest, manual ingest, source fetch, library reprocess, or item re-ingest is running; the server returns `409 conflict` with shared current-operation details for the operation holding the guard. The language write itself is a short atomic metadata update and is not exposed as a `language_mutation` current-operation kind. Live idempotency replay uses request fingerprints: same key and same body returns `already_applied: true`; same key with a different body returns `400 bad_request` with `details.reason: "request_fingerprint_mismatch"`.

### Reprocess existing library

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/runtime/reprocess-library" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"reprocess-library-001"}'
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "reprocess": {
    "status": "completed",
    "language": "zh",
    "items_attempted": 12,
    "items_updated": 12,
    "items_indexed": 12,
    "items_unavailable": 0,
    "items_failed": 0,
    "fts_rebuilt": true,
    "errors": []
  },
  "already_applied": false
}
```

Reprocess accepts no query parameters, uses the current persisted processing language, and shares the same global operation guard as manual ingest/fetch. A conflicting ingest/fetch/reprocess returns `409 conflict`; a duplicate key during an active run also returns conflict. After completion, same-key/same-fingerprint replay returns the stored result with `already_applied: true`; same-key/different-fingerprint replay returns `400 bad_request` with `details.reason: "request_fingerprint_mismatch"`. Timeout results that can be serialized return HTTP `200` with `reprocess.status: "failed"`, `fts_rebuilt: false`, and an error code of `timeout`.

### Export state

```bash
curl -sS "http://127.0.0.1:8080/api/state/export" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -o resofeed-state.json
```

Abridged example file shape; canonical schema is in `docs/ARCHITECTURE.md §5.5`:

```json
{
  "schema_version": "resofeed.state.v1",
  "exported_at": "2026-05-09T00:00:00Z",
  "sources": [],
  "steer_rules": [],
  "resonated_items": []
}
```

### Import state
```bash
curl -sS -X POST "http://127.0.0.1:8080/api/state/import" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data-binary @resofeed-state.json
```

Abridged example response; canonical schema is in `docs/ARCHITECTURE.md §6`:

```json
{
  "restored": {
    "sources": 0,
    "steer_rules": 0,
    "resonated_items": 0
  }
}
```

Invalid state bundles fail before writing and return `400 bad_request` with the canonical JSON error body from `docs/ARCHITECTURE.md §6`.
### Diagnostics

```bash
curl -sS "http://127.0.0.1:8080/api/doctor" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

Abridged example response: `text/plain`, canonical contract is in `docs/ARCHITECTURE.md §6`:

```text
rss: ok
openrouter: provider_reachable=unknown configured_model=account_default
openrouter: model_resolved=false resolved_model=unknown
openrouter: item_transform_failures=0
fallback_provenance: item_transform_failures=0 summary=none
search_fts: ok
ingest: last_run=2026-05-09T00:00:00Z
```

### Runtime lexical liveness proof

To prove a newly added source is searchable through public runtime surfaces, use
the same owner-token protected path as the UI:

1. Add a fixture RSS/Atom URL through `POST /api/steer` with the URL as the
   `command`.
2. Let the `resofeed serve` background ingest loop fetch active sources.
3. Query the known fixture token with `GET /api/search?q=<known-token>`.

This path uses the documented Steer, background ingest, and Search surfaces. It
does not require direct SQLite writes, private test hooks, sidecar workers,
Source Ledger run/fetch controls, or manual UI-only actions.

## First Useful Session

A first useful session should require only this loop:

1. Add or import sources.
2. Either wait for the background ingest loop or use Source Ledger `[RUN INGEST]` / `[FETCH]` for an immediate lightweight refresh.
3. Scan `TODAY`.
4. Open one item to Inspect it.
5. Resonate with one item if it has durable value.
6. Optionally Steer future behavior.

You should not need folders, tags, archive rules, ranking sliders, delivery-channel configuration, job dashboards, or agent setup to get value.

## The Three Core Actions

ResoFeed has exactly three primary user-visible primitives: Inspect, Resonate, and Steer.

### Inspect

Inspect means you deliberately allocated attention to an item.

Use it by opening an item in the Inspector. Inspecting an item helps ResoFeed and authorized agents avoid repeatedly surfacing the same item.

Inspect is not endorsement. It must not be treated as agreement, durable preference, or a like/dislike signal.

Agent note: silent agent evaluation does not count as Inspect. An item counts as externally inspected/surfaced only when an authorized agent actually delivered or presented it to the human.

### Resonate

Resonate means the item has durable value worth preserving.

Use it by toggling the star on an item.

Resonate:

- improves future retrieval;
- may influence future relevance;
- is reversible;
- does not mean agreement;
- does not pin old items permanently into the daily feed.

Freshness still matters. Old resonated items should not dominate Today solely because they were starred.

### Steer

Steer is the natural-language command surface for correcting future behavior.

Use Steer to:

- add a source by pasting an RSS/Atom URL;
- adjust future scoring or summaries;
- run `/doctor`, which the web UI dispatches to `GET /api/doctor` and renders as raw text;
- enter `search <query>` to open the lexical search surface in the current web UI.

Examples:

```text
https://example.com/feed.xml
```

```text
Reduce low-signal funding announcements.
```

```text
Push more technical documents about distributed systems.
```

```text
Do not treat inspection of opposing views as agreement.
```

```text
/doctor
```

After a steering instruction is accepted, ResoFeed should return a terse receipt that explains what changed and leaves the correction path obvious.

When a delegated agent submits steering through MCP, the next UI load may show a terse inline receipt such as `agent:briefing-agent steering active: ... · correct in Steer`. This is provenance, not a per-agent account system or activity ledger.

Steer must not become a rule-management product. There is no manual rule builder, weight editor, per-rule CRUD dashboard, or complex policy document for the user to maintain.

## Reading the Feed

The main feed is a unified daily attention surface.

Use it to:

- scan fresh and relevant items;
- see concise summaries and source/provenance markers;
- open items in the Inspector;
- identify grouped duplicates or story siblings without losing original source access;
- Resonate with items worth preserving.

Important behavior:

- repeated versions of the same article should not appear as separate equal-priority items;
- multiple reports of one story may be grouped, but each original source item remains accessible;
- high-volume sources are not silently suppressed unless you explicitly steer behavior;
- unavailable extraction or summary states remain visible instead of hiding the item;
- `source excerpt` in a feed row means the source text came from the RSS excerpt, not necessarily that LLM summary generation failed.

## Inspector

The Inspector shows item detail.

It should expose:

- title;
- source;
- original link;
- source-text status;
- summary provenance;
- summary and core insight when available;
- extracted text when available;
- provenance and extraction status;
- duplicate/story context when relevant;
- Resonate action.

Fallback and provenance labels should be direct and plain:

- `source text: RSS excerpt only` — linked-article extraction was blocked or incomplete, but RSS excerpt text was available;
- `summary provenance: model-backed` — OpenRouter produced validated summary fields, even if the source text was only an RSS excerpt;
- `summary provenance: feed excerpt fallback` — no model-backed summary/core insight is available and the UI is showing source excerpt text;
- `summary unavailable` — the model did not produce a usable summary;
- `original unavailable` — source link is dead or malformed;
- `model latency/error` — visible through `/doctor`;
- `RSS fetch error` — visible through `/doctor`.

## Source Ledger and OPML

Source management uses Steer plus a flat Source Ledger. Open it from the `RESOFEED` menu.

### Add a source

Paste the RSS/Atom URL into Steer:

```text
https://example.com/feed.xml
```

There is no separate add-source wizard and no second URL paste field inside Source Ledger.

### Import OPML

Use the Source Ledger `[IMPORT OPML]` action to import OPML.

Rules:

- folder structures are ignored;
- all feeds become one flat source list;
- no tags, categories, pause/resume toggles, drag ordering, or source scoring sliders are created.

### Refresh sources manually

Use `[RUN INGEST]` in the Source Ledger header to fetch all active sources, or `[FETCH]` on a single source row.

Rules:

- only one ingest/fetch operation runs at a time;
- conflicts return terse raw feedback such as `err: ingest already running`;
- pending states use text replacement (`[INGESTING...]`, `[FETCHING...]`), not spinners or progress dashboards;
- source errors appear as raw `err: <diagnostic>` text and in `/doctor` diagnostics;
- no jobs, queues, retry dashboards, command histories, activity ledgers, or sync/merge state are created.

### Delete a source

Use the delete action on a Source Ledger row.

Deletion should require a terse confirmation. After deletion, the source no longer appears in the ledger or contributes new items.

## Search

Search is for retrieval, not chat.

You can search by:

- keyword/plain text;
- source;
- time;
- resonance status.

Search covers indexed title, summary, source, provenance, and extracted text where available.

Search results should show enough provenance to verify why a result matched.

Search must not use:

- embeddings;
- vector databases;
- built-in RAG;
- semantic answer generation;
- chat history workflows.

RAG-grade retrieval is out of scope for ResoFeed search.

## State Export and Import

ResoFeed must let you move your active state without vendor lock-in.

Export includes at minimum:

- Source Ledger;
- current active steering policy rules;
- currently resonated items.

Import replaces that portable active state with the bundle. Local portable rows absent from the bundle are removed.

Rules:

- export/import is current-state based;
- no event-sourced activity ledger is created;
- source OPML import remains flat; OPML export is not part of the current HTTP/UI contract and is not complete state portability;
- import should fail cleanly rather than partially corrupt state;
- derived search indexes may be rebuilt after import.

The UI for export/import should remain terse. It must not become a cloud backup dashboard, account system, sync service, or privacy/security product surface.

Architecture note: if older design wording mentions steering or resonance “history,” treat that as this current-state bundle only. ResoFeed does not export or maintain a general command history, reading history, or activity ledger.

## Diagnostics: `/doctor`

Type `/doctor` into Steer to see raw operational health.

Expected diagnostic content includes:

- RSS fetch errors;
- model latency or model errors;
- extraction failures;
- last ingestion run information;
- other raw status lines useful for debugging.
- `search_fts: ok` or `search_fts: stale since <RFC3339_UTC>` after reprocess begins or fails before final FTS rebuild.

`/doctor` is plain text. It is not a dashboard, chart surface, friendly remediation wizard, or settings page.

Diagnostics and live-smoke evidence must redact LLM API keys. Acceptable evidence says a key was resolved from `os_env` or `.env` and shows `OPENROUTER_KEY=<redacted>`; it must not show the actual value. `/doctor` OpenRouter lines use the `openrouter:` prefix, include the configured model (`account_default` when omitted), include a resolved model only when available, and never print keys, secret-source metadata, `.env` paths, or provider configuration.

## OpenRouter Configuration Contract

OpenRouter is the sole LLM backend. ResoFeed sends JSON-in/JSON-out requests to the OpenRouter chat completions endpoint:

```text
https://openrouter.ai/api/v1/chat/completions
```

Prompt construction, structured-output routing, source-text handling, one-time prompt priority, and summary output boundaries are governed by [`docs/PROMPTING_SYSTEM.md`](PROMPTING_SYSTEM.md). This usage guide covers runtime configuration and public API examples only.

OpenRouter setup and live-smoke docs must use OS environment variables or local `.env` files with redacted evidence only. Do not add examples that paste real API keys into command lines or shell history. ResoFeed does not send OpenRouter attribution headers for now.
## External Agent Usage Through MCP

Authorized external agents use MCP Streamable HTTP at `/mcp`.

ResoFeed itself does not own Telegram, Slack, email, or any other delivery channel. Those systems may be built outside ResoFeed and connect through MCP.

Endpoint:

```text
<public-url>/mcp
```

Local example when started with `--public-url http://127.0.0.1:8080`:

```text
http://127.0.0.1:8080/mcp
```

Production example when started with `--public-url https://resofeed.example.com`:

```text
https://resofeed.example.com/mcp
```

Canonical MCP client connection values:

```json
{
  "type": "streamable-http",
  "url": "https://resofeed.example.com/mcp",
  "headers": {
    "Authorization": "Bearer <OWNER_TOKEN>"
  }
}
```

If a client uses a different config file shape, keep the same URL and authorization header.

### Authentication

External agents must use the owner-authorized access path. Mutating tools require authorization and idempotency keys so retries do not duplicate user-visible effects.

Use the generated startup token or the explicit token passed through `--owner-token`.

### Resources

Target resources:

- `resofeed://feed/today` — current eligible feed view;
- `resofeed://rules/active` — current steering policy;
- `resofeed://system/doctor` — raw diagnostics;
- `resofeed://system/operation` — current in-memory runtime operation snapshot;
- `resofeed://sources` — flat Source Ledger;
- `resofeed://runtime/language` — current runtime processing language.

### Tools
Target tools:

| Tool | Purpose |
|---|---|
| `list_candidate_items` | Retrieve eligible high-priority recent items for external evaluation. |
| `search_items` | Search the corpus using lexical/metadata search. |
| `read_item` | Retrieve item detail and provenance. |
| `list_openrouter_models` | Lists selectable OpenRouter model IDs with the same provider-backed model-list operation as HTTP `GET /api/runtime/openrouter-models`; missing runtime key returns an empty model list. |
| `reingest_item` | Explicitly reprocess one selected item with MCP parity for request-scoped `model`, canonical `prompt`, and compatibility `extra_prompt` fields. |
| `mark_inspected` | Forward a human inspection from an external context. |
| `resonate_item` | Forward or toggle a human-authorized resonance action. |
| `preview_steer` | Preview how a natural-language steering/search command would be interpreted without mutation. |
| `steer` | Forward a natural-language steering instruction. |
| `undo_steer` | Undo a previous steering-created source or steer rule with idempotent mutation semantics. |
| `report_delivery` | Report that an item was externally surfaced or delivered. |
| `get_processing_language` | Read the persisted runtime processing language. |
| `set_processing_language` | Set the runtime processing language for future processing. |
| `reprocess_library` | Explicitly reprocess existing library items in the current runtime language and rebuild FTS on successful completion. |

Schema source of truth: `docs/ARCHITECTURE.md §7 MCP Surface` defines required fields, defaults, limits, exact output schemas, and implemented MCP parity notes. Examples below are abridged current implemented usage.

Example tool calls and responses:

```json
{
  "tool": "list_candidate_items",
  "arguments": {
    "limit": 20
  }
}
```

```json
{
  "items": []
}
```

```json
{
  "tool": "read_item",
  "arguments": {
    "item_id": "ITEM_ID"
  }
}
```

```json
{
  "item": {
    "id": "ITEM_ID",
    "title": "Example article",
    "url": "https://example.com/article",
    "summary": "Dense factual summary.",
    "is_resonated": false
  }
}
```

MCP item re-ingest with request-scoped prompt/model fields:

```json
{
  "tool": "reingest_item",
  "arguments": {
    "item_id": "ITEM_ID",
    "actor_id": "briefing-agent",
    "idempotency_key": "briefing-agent-reingest-ITEM_ID-001",
    "model": "openai/gpt-4.1-mini",
    "prompt": "one-time retry instruction"
  }
}
```

`model`, `prompt`, and `extra_prompt` follow the same request-scoped selected-item rules as HTTP `POST /api/items/{id}/reingest`: `prompt` is canonical, `extra_prompt` is a compatibility alias, empty/default model values use the runtime/account default, unknown fields such as `language` are rejected, and prompt/model values are not persisted.

```json
{
  "already_applied": false,
  "reingest": {
    "item_id": "ITEM_ID",
    "status": "completed",
    "item_updated": true,
    "fts_updated": true,
    "item": {
      "id": "ITEM_ID",
      "summary": "Updated target-language summary."
    }
  }
}
```

```json
{
  "tool": "resonate_item",
  "arguments": {
    "item_id": "ITEM_ID",
    "resonated": true,
    "actor_id": "briefing-agent",
    "idempotency_key": "briefing-agent-resonate-ITEM_ID-001"
  }
}
```

```json
{
  "item_id": "ITEM_ID",
  "is_resonated": true,
  "already_applied": false
}
```

```json
{
  "tool": "report_delivery",
  "arguments": {
    "item_id": "ITEM_ID",
    "actor_id": "briefing-agent",
    "delivered_at": "2026-05-09T00:00:00Z",
    "idempotency_key": "briefing-agent-delivery-ITEM_ID-001"
  }
}
```

```json
{
  "item_id": "ITEM_ID",
  "external_surfaced_at": "2026-05-09T00:00:00Z",
  "already_applied": false
}
```

```json
{
  "tool": "search_items",
  "arguments": {
    "query": "sqlite",
    "source": null,
    "from": null,
    "to": null,
    "resonated": null,
    "limit": 20
  }
}
```

```json
{
  "items": [],
  "query": {
    "q": "sqlite",
    "source": null,
    "from": null,
    "to": null,
    "resonated": null,
    "limit": 20
  }
}
```

```json
{
  "tool": "get_processing_language",
  "arguments": {}
}
```

```json
{
  "language": {
    "code": "en",
    "label": "English"
  },
  "already_applied": false
}
```

```json
{
  "tool": "set_processing_language",
  "arguments": {
    "language": "zh",
    "actor_id": "briefing-agent",
    "idempotency_key": "briefing-agent-language-zh-001"
  }
}
```

```json
{
  "language": {
    "code": "zh",
    "label": "中文"
  },
  "already_applied": false
}
```

```json
{
  "tool": "reprocess_library",
  "arguments": {
    "actor_id": "briefing-agent",
    "idempotency_key": "briefing-agent-reprocess-001"
  }
}
```

```json
{
  "reprocess": {
    "status": "completed",
    "language": "zh",
    "items_attempted": 12,
    "items_updated": 12,
    "items_indexed": 12,
    "items_unavailable": 0,
    "items_failed": 0,
    "fts_rebuilt": true,
    "errors": []
  },
  "already_applied": false
}
```

Agent rules:

- silent candidate evaluation must not mark an item inspected;
- delivered/surfaced items should be reported so ResoFeed avoids duplicate resurfacing;
- repeated requests with the same idempotency key should not duplicate mutation effects;
- repeated requests with the same live idempotency key but different request fingerprints fail with `bad_request` / `request_fingerprint_mismatch` rather than overwriting the stored receipt result;
- human corrections take precedence over agent-mediated signals.
## What ResoFeed Deliberately Does Not Do

ResoFeed intentionally excludes:

- account registration;
- onboarding wizards;
- multi-user/team SaaS features;
- unread counts and inbox-zero mechanics;
- archive workflows;
- save-for-later as a separate primitive;
- folders, tags, source categories, and ranking sliders;
- settings dashboards;
- manual-ingest job queues, retry dashboards, command histories, activity ledgers, or sync/merge controls;
- moderation consoles or holding queues;
- built-in Telegram/Slack/email ownership;
- dwell-time, viewport, or scroll-depth tracking as preference signals;
- agree/disagree or like/dislike controls;
- vector search, embeddings, built-in RAG, or semantic chat.

## Troubleshooting

### Feed is empty

- Add at least one source by pasting an RSS/Atom URL into Steer.
- If importing OPML, verify that the file contains feed URLs.
- Run `/doctor` to inspect fetch errors.

### A source is not updating

- Open `RESOFEED` → `SOURCE LEDGER` and try `[FETCH]` on the affected source, or `[RUN INGEST]` for all active sources.
- If the control reports a conflict, wait for the current ingest/fetch operation to finish and retry later.
- Run `/doctor` and check RSS fetch errors.
- Verify the source URL still serves RSS/Atom.
- Other sources should continue updating even if one source fails.

### Summary is missing or weak

- Check whether the item shows `summary unavailable`, `summary provenance: feed excerpt fallback`, or `source text: RSS excerpt only`.
- `source text: RSS excerpt only` means full article extraction was unavailable; it can still appear with `summary provenance: model-backed` when OpenRouter successfully summarized the RSS excerpt.
- Open the original link when full extraction is blocked or paywalled.
- Run `/doctor` if many summaries fail at once.

### Search does not find an expected item

- Try exact words from the title/source/summary.
- Filter by source or resonance status if available.
- Remember that search is lexical/metadata based, not semantic chat.
- Run `/doctor` and check whether it reports `search_fts: stale since ...`; if so, a reprocess run failed before the final FTS rebuild and search may reflect stale indexed rows until a later successful reprocess clears the marker.

### An external agent repeats an item

- Ensure the agent calls `report_delivery` after surfacing the item.
- Ensure mutating MCP calls include stable idempotency keys.
- Silent evaluation alone should not mark the item inspected.

## Related Documents

- Product requirements: [`docs/PRD.md`](PRD.md)
- Visual/interaction contract: [`docs/DESIGN.md`](DESIGN.md)
- Technical architecture: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- Container packaging and runtime usage: [`docs/CONTAINER.md`](CONTAINER.md)
- Non-core Tailscale deployment example: [`docs/examples/TAILSCALE_CONTAINER.md`](examples/TAILSCALE_CONTAINER.md)

State portability scope: `docs/ARCHITECTURE.md §5.5 State Portability` is authoritative for implementation. ResoFeed exports/imports the minimal current-state bundle, not history or activity-ledger data.
