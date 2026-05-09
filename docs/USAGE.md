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

### 2. Run with Gemini

```bash
./bin/resofeed serve \
  --addr 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --db ./data/resofeed.sqlite3 \
  --gemini-api-key "<GEMINI_API_KEY>" \
  --gemini-model gemini-2.5-flash
```

`serve` starts everything: web UI, JSON HTTP API, MCP Streamable HTTP at `/mcp`, background ingestion, SQLite open/migrate, and static asset serving.

There are intentionally no separate `migrate`, `worker`, `doctor`, `admin`, or `sync` processes. Migrations run during `serve`; diagnostics are exposed through Steer `/doctor` and `GET /api/doctor`.

Flags:

| Flag | Required? | Purpose |
|---|---:|---|
| `--addr` | No | Bind address for web UI, HTTP API, and MCP endpoint. Default: `127.0.0.1:8080`. |
| `--public-url` | No | Base URL external agents should use. Default derives from `--addr` for local use. |
| `--db` | No | SQLite database file path. Default: `./data/resofeed.sqlite3`. |
| `--gemini-api-key` | Yes | Gemini API key used for summaries and steering translation. |
| `--gemini-model` | No | Gemini model. Default: `gemini-2.5-flash`. |
| `--owner-token` | No | Explicit owner token. If omitted, ResoFeed generates or reuses one automatically. |

### 3. Owner token behavior

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

To rotate or recover the token, start ResoFeed once with a new explicit token:

```bash
./bin/resofeed serve \
  --db ./data/resofeed.sqlite3 \
  --gemini-api-key "<GEMINI_API_KEY>" \
  --owner-token "rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"
```

### 4. Open the UI

```text
http://127.0.0.1:8080
```

On first open, paste the owner token printed at startup or supplied with `--owner-token`. The browser stores it locally as `resofeed.ownerToken` and sends it as `Authorization: Bearer <OWNER_TOKEN>` for every `/api/*` request.

### 5. Add sources

- Paste an RSS/Atom URL into Steer; or
- import OPML from the Source Ledger.

OPML folders are ignored and flattened immediately.

### 6. Let ingestion run

ResoFeed fetches sources, extracts content when possible, summarizes items with Gemini, indexes searchable text, and builds the Today surface. The default background ingest interval is 15 minutes.

Use an always-on host if mobile access or external-agent workflows should continue while your laptop sleeps.

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

With an explicit result cap:

```bash
curl -sS "http://127.0.0.1:8080/api/feed/today?limit=20" \
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
gemini: ok
ingest: last_run=2026-05-09T00:00:00Z
```

## First Useful Session

A first useful session should require only this loop:

1. Add or import sources.
2. Wait for enough items to process.
3. Scan `TODAY`.
4. Open one item to Inspect it.
5. Resonate with one item if it has durable value.
6. Optionally Steer future behavior.

You should not need folders, tags, archive rules, ranking sliders, delivery-channel configuration, or agent setup to get value.

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
- unavailable extraction or summary states remain visible instead of hiding the item.

## Inspector

The Inspector shows item detail.

It should expose:

- title;
- source;
- original link;
- summary and core insight when available;
- extracted text when available;
- provenance and extraction status;
- duplicate/story context when relevant;
- Resonate action.

Fallback labels should be direct and plain:

- `summary unavailable` — the model did not produce a usable summary;
- `partial extraction` — full article extraction was blocked or incomplete;
- `original unavailable` — source link is dead or malformed;
- `model latency/error` — visible through `/doctor`;
- `RSS fetch error` — visible through `/doctor`.

## Source Ledger and OPML

Source management uses Steer plus a flat Source Ledger.

### Add a source

Paste the RSS/Atom URL into Steer:

```text
https://example.com/feed.xml
```

There is no separate add-source wizard.

### Import OPML

Use the Source Ledger import action to import OPML.

Rules:

- folder structures are ignored;
- all feeds become one flat source list;
- no tags, categories, pause/resume toggles, drag ordering, or source scoring sliders are created.

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

`/doctor` is plain text. It is not a dashboard, chart surface, friendly remediation wizard, or settings page.

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
- `resofeed://sources` — flat Source Ledger.

### Tools

Target tools:

| Tool | Purpose |
|---|---|
| `list_candidate_items` | Retrieve eligible high-priority recent items for external evaluation. |
| `search_items` | Search the corpus using lexical/metadata search. |
| `read_item` | Retrieve item detail and provenance. |
| `mark_inspected` | Forward a human inspection from an external context. |
| `resonate_item` | Forward or toggle a human-authorized resonance action. |
| `steer` | Forward a natural-language steering instruction. |
| `report_delivery` | Report that an item was externally surfaced or delivered. |

Schema source of truth: `docs/ARCHITECTURE.md §7 MCP Surface` defines required fields, defaults, limits, and exact output schemas for all MCP resources and tools. Examples below are abridged.

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

Agent rules:

- silent candidate evaluation must not mark an item inspected;
- delivered/surfaced items should be reported so ResoFeed avoids duplicate resurfacing;
- repeated requests with the same idempotency key should not duplicate mutation effects;
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

- Run `/doctor` and check RSS fetch errors.
- Verify the source URL still serves RSS/Atom.
- Other sources should continue updating even if one source fails.

### Summary is missing or weak

- Check whether the item shows `summary unavailable` or `partial extraction`.
- Open the original link when extraction is blocked or paywalled.
- Run `/doctor` if many summaries fail at once.

### Search does not find an expected item

- Try exact words from the title/source/summary.
- Filter by source or resonance status if available.
- Remember that search is lexical/metadata based, not semantic chat.

### An external agent repeats an item

- Ensure the agent calls `report_delivery` after surfacing the item.
- Ensure mutating MCP calls include stable idempotency keys.
- Silent evaluation alone should not mark the item inspected.

## Related Documents

- Product requirements: `docs/PRD.md`
- Visual/interaction contract: `docs/DESIGN.md`
- Technical architecture: `docs/ARCHITECTURE.md`

State portability scope: `docs/ARCHITECTURE.md §5.5 State Portability` is authoritative for implementation. ResoFeed exports/imports the minimal current-state bundle, not history or activity-ledger data.
