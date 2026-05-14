# ResoFeed Architecture Spec

Version: 1.2
Status: Implemented current contract
Source contracts: `docs/PRD.md`, `docs/DESIGN.md`

## 1. Decisions

Contract baseline: these decisions are anchored in the current product/design documents and user constraints.

1. **One deployable Go process.** ResoFeed is one binary started with `resofeed serve`. It serves the static SvelteKit app, JSON HTTP API, MCP Streamable HTTP at `/mcp`, and background ingestion loop. Rationale: the product is a single-tenant tool, not SaaS infrastructure. Fails if team/multi-tenant scale becomes product scope.
2. **CLI flags are the primary non-secret runtime configuration surface; LLM secrets are runtime inputs.** `serve` accepts flags for bind address, public URL, SQLite path, optional OpenRouter model, and optional owner token. OpenRouter API keys must be resolved at startup from runtime-only secret sources and must never be passed by CLI flag, persisted, exported, logged, or committed. Rationale: command-line flags are concrete and inspectable for non-secret configuration, while API keys must not be placed in shell history, process listings, or durable product state. Fails if deployment later requires a full config-file management surface or a centralized secret/config service.
3. **One SQLite database.** SQLite is the durable source of truth; FTS5 is the lexical index. Rationale: local ownership and operational simplicity matter more than distributed scale. Fails if multi-writer distributed deployment becomes required.
4. **Current state only.** Store the present state needed for feed display, search, import/export, agent idempotency, and provenance. Do not build event sourcing, JSONL runtime state, or a user-visible activity ledger. Fails if audit-grade historical reconstruction becomes a hard requirement.
5. **One backend package.** Product behavior lives in `internal/resofeed` as direct functions and SQL, not `app/domain/repository/service` layers. Rationale: there is one runtime and one database. Fails if multiple storage backends or independently deployed services become real requirements.
6. **Thin transports.** HTTP and MCP validate auth/payloads and call the same product operations. Rationale: humans and agents must share Inspect, Resonate, Steer, search, and retrieval semantics. Fails if MCP gets product concepts unavailable to humans.
7. **OpenRouter as the sole LLM backend.** LLM calls use OpenRouter chat completions for summaries and steering translation at `https://openrouter.ai/api/v1/chat/completions`. The model is a request/response JSON transformation and never owns durable state, orchestration, or direct database writes; Go validates every structured output before applying or saving it. Rationale: the user explicitly chose an OpenRouter-only migration while the PRD treats AI as utility infrastructure. Fails if a different provider becomes a product requirement.
8. **Lexical retrieval only.** Search uses SQLite FTS5 and metadata filters. No embeddings, vector DB, built-in RAG, or semantic answer engine. Rationale: explicitly forbidden by product constraints. Fails only by explicit product reversal.
9. **Single owner token with auto-generation and CLI-only offline reset.** Static web assets are public to load, but every `/api/*` route and every `/mcp` request requires one owner token. If `--owner-token` is omitted, ResoFeed reuses a stored token hash or generates a token, stores its hash, and prints the token once on first startup. If the plaintext token is lost and only the hash remains, recovery is impossible; reset is an offline DB command that deletes only the stored hash so the next `serve` startup can generate or accept a replacement. No accounts, OAuth, roles, teams, registration flow, HTTP reset endpoint, MCP reset tool, or Settings/UI reset control. Rationale: single-tenant tool with low-friction first run, clear offline credential recovery, and no ambiguous public API reads. Fails if shared/team use or online credential administration becomes product scope.

## 2. System Boundary

```text
Browser SPA (SvelteKit static)
        |
        | JSON HTTP
        v
+--------------------------+
| Go binary: resofeed      |
| - static asset server    |
| - JSON HTTP handlers     |
| - MCP Streamable HTTP    |
| - background ingest      |
| - SQLite migrations      |
+--------------------------+
   |             |        |
   v             v        v
SQLite+FTS5   RSS/Atom   OpenRouter API

External agents connect to the same Go binary through MCP Streamable HTTP at `/mcp`.
```

There are no internal services. Runtime components are the Go process, embedded static assets, one SQLite file, RSS/Atom sources, and OpenRouter as the external LLM API.

Runtime command contract:

```bash
resofeed serve \
  --addr 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --db ./data/resofeed.sqlite3 \
  --openrouter-model openai/gpt-4.1-mini
```

Required/recognized flags:

| Flag | Required? | Default | Purpose |
|---|---:|---|---|
| `--addr` | No | `127.0.0.1:8080` | Bind address for web UI, HTTP API, and MCP endpoint. |
| `--public-url` | No | derived from `--addr` for local use | Base URL external agents should use. If omitted and `--addr` is `HOST:PORT`, default to `http://HOST:PORT`; if host is `0.0.0.0`, default to `http://127.0.0.1:PORT`. |
| `--db` | No | `./data/resofeed.sqlite3` | SQLite database path. |
| `--openrouter-model` | No | empty / account default | Optional OpenRouter model. Empty or omitted means use the OpenRouter account default. Provided values are passed through unchanged with no startup network model validation. |
| `--owner-token` | No | reuse or auto-generate | Explicit owner token; omitted means reuse or auto-generate. |

When `--openrouter-model` is omitted or empty, diagnostics and startup/runtime status should refer to the configured model as `account_default`. If OpenRouter later returns a concrete resolved model in a response, `/doctor` may include that resolved model; absence of a resolved model is not a startup failure.

`serve` runs SQLite migrations during startup and then starts the web UI, HTTP API, MCP endpoint, and ingestion loop. No separate `migrate`, `worker`, `doctor`, `admin`, or `sync` process is part of the architecture.

Offline owner-token reset command contract:

```bash
resofeed owner-token reset \
  --db ./data/resofeed.sqlite3 \
  --confirm-reset
```

Rules:

- the command is CLI-only and must run while `serve` is stopped for that SQLite database;
- `--db` selects the SQLite database file and `--confirm-reset` is required;
- it deletes only `runtime_metadata.key='owner_token_sha256'`;
- it does not generate, print, accept, validate, or store a plaintext replacement token;
- after reset, the next `resofeed serve --db PATH` without `--owner-token` follows the existing first-run path: generate a new token, store only its hash, and print the plaintext once;
- alternatively, the next `resofeed serve --db PATH --owner-token TOKEN` sets an explicit replacement token through the existing startup path;
- do not add `serve --reset-owner-token`; reset must not be easy to persist accidentally in service startup arguments;
- do not expose reset through HTTP, MCP, Settings, or any browser UI.

Runtime OpenRouter LLM contract:

- OpenRouter is the only LLM backend after this migration. Do not preserve prior provider runtime flags in the future runtime contract.
- OpenRouter API-key resolution happens during startup before LLM client construction.
- `OPENROUTER_KEY` is the only accepted OpenRouter API-key name for OS environment and local `.env` sources. CLI-passed API keys are forbidden for OpenRouter.
- Precedence is OS environment variable `OPENROUTER_KEY` first, then local `.env` fallback.
- Empty or whitespace-only secret values from any source are invalid and must fail startup before binding the server socket.
- LLM API keys are runtime input only. They must never be written to SQLite, `runtime_metadata`, migrations, state bundles, logs, `/doctor`, HTTP/MCP responses, frontend assets, test fixtures, docs examples, or committed artifacts.
- State export/import must never include LLM secret values, selected model, provider name, secret-source metadata, `.env` path, or provider configuration. Redacted evidence such as `OPENROUTER_KEY=<redacted>` or `source=os_env/.env` is acceptable; raw key values are not.
- Parser or validation errors must identify the field/source class tersely without including secret values.
- OpenRouter requests use JSON-in/JSON-out chat completions and should request structured JSON where the API supports it; Go remains responsible for validating model outputs before any state mutation.
- No OpenRouter attribution headers are sent for now.
- Live smoke checks must use `OPENROUTER_KEY` from the OS environment or local `.env` and capture redacted evidence only.
- `/doctor` OpenRouter diagnostics must use an `openrouter:` line prefix, include the configured model (`account_default` when omitted), include a resolved model only when available from runtime responses, and never include the API key, secret source, `.env` path, or raw provider configuration.

Local `.env` contract for runtime secret fallback:

- `.env` is a local runtime input only and must not be committed or exported.
- The parser is intentionally minimal: support only `KEY=VALUE` lines; ignore blank lines and lines whose first non-whitespace character is `#`.
- Do not source `.env` through a shell. Do not perform shell expansion, command substitution, variable interpolation, command execution, quoting semantics, includes, or multiline parsing.
- For `OPENROUTER_KEY`, trim surrounding whitespace for validation and use; values that are empty or whitespace-only after trimming are invalid.
- Parser and validation errors must not print the rejected value.

Startup validation failures exit before binding the server socket and print a terse error to stderr. This applies to invalid `--addr`, invalid `--public-url`, unwritable `--db`, missing/empty resolved OpenRouter API key, invalid `--owner-token`, and failed SQLite migrations.

Startup validation matrix:

| Input | Invalid when | Exit code | Stderr code/message | Binds socket? |
|---|---|---:|---|---|
| `--addr` | not `HOST:PORT`, missing host/port, port outside `1..65535` | `2` | `err: invalid_addr: expected HOST:PORT` | No |
| `--public-url` | not absolute `http`/`https`, missing host, has query/fragment, path not empty or `/` | `2` | `err: invalid_public_url: expected absolute http(s) URL without path/query/fragment` | No |
| omitted `--public-url` | N/A | N/A | derive from `--addr`; `0.0.0.0:PORT` derives to `http://127.0.0.1:PORT`; remove trailing slash | N/A |
| `--db` | parent directory cannot be created, path cannot be opened as SQLite | `2` | `err: invalid_db: cannot open sqlite database` | No |
| resolved OpenRouter API key | missing, empty, or all whitespace after applying OS environment `OPENROUTER_KEY` > `.env` fallback precedence | `2` | `err: invalid_openrouter_key: value required` | No |
| `--owner-token` | fewer than 32 visible non-whitespace characters or contains leading/trailing whitespace | `2` | `err: invalid_owner_token: expected at least 32 visible non-whitespace characters` | No |
| migrations | migration fails | `1` | `err: migration_failed: <migration id>` | No |

Database parent directories are created when possible. Explicit token hashes are computed from the exact raw UTF-8 token bytes; tokens are not trimmed or normalized.

Owner token behavior:

- if `--owner-token` is passed, validate the token, hash it, and store the hash;
- if omitted and a stored token hash exists, reuse it for verification;
- if omitted and no token hash exists, generate a random token, store only its hash in SQLite runtime metadata, and print the plaintext token once in startup logs;
- if a known explicit plaintext token should be rotated, pass a new valid `--owner-token` on `serve` startup;
- if the plaintext token is lost and only `owner_token_sha256` remains, the plaintext cannot be recovered from SQLite; use `resofeed owner-token reset --db PATH --confirm-reset` offline to remove the hash, then start `serve` to generate or set a replacement;
- deleting `localStorage['resofeed.ownerToken']` only forgets the browser-local copy and does not rotate, delete, or reset the server-side verifier;
- owner token runtime metadata is not part of Source Ledger/state export and is not an activity ledger.

In scope:

- responsive web/mobile web UI served by Go;
- RSS/Atom source ingestion;
- extraction, summarization, ranking metadata, search, source ledger, state import/export;
- authorized external-agent access through MCP Streamable HTTP at `/mcp`;
- deployment on an always-on host chosen by the owner, so mobile/agent workflows continue when a laptop sleeps.

Out of scope:

- multi-user accounts, SaaS tenancy, RBAC, OAuth, organization management;
- microservices, distributed queues/caches, external databases;
- folders, tags, settings dashboards, moderation consoles, archive workflows, notification-channel ownership;
- vector search, embeddings, built-in RAG, semantic answer chat;
- general activity ledgers or analytics from dwell time, scroll depth, or viewport tracking.

## 3. Backend Shape

### 3.1 Layers

| Layer | Owner | Responsibility | Must not own |
|---|---|---|---|
| Static UI | `web/` | Render `docs/DESIGN.md` surfaces and call JSON HTTP endpoints | Ranking rules, MCP-only concepts, storage decisions |
| Runtime shell | `cmd/resofeed` | Parse `serve` flags, open/migrate SQLite, resolve owner token, start/stop lifecycle | Product behavior beyond wiring |
| Product core | `internal/resofeed` | Source ledger, item state, ingestion, search, steering, state backup/restore, HTTP/MCP operations | Repositories, factories, plugins, alternate storage engines |
| Persistence | SQLite file | Durable current state, owner-token runtime metadata, and FTS index | Event log semantics or sync-server behavior |
| External IO | RSS/Atom + OpenRouter API | Inputs and transformations | Durable source of truth |

### 3.2 Source of Truth

| State | Source of truth | Export/import? | Rationale |
|---|---|---|---|
| Source Ledger | `sources` | Yes | User-owned subscription state. |
| Feed items | `items` | No by default | Re-fetchable/cache-like content. |
| Story grouping | fields on `items` | No by default | Transparent grouping without a second story domain. |
| Current steering policy | `steer_rules` | Yes | User-owned policy state. |
| Current attention state | `item_state` | Resonance state: yes; inspection/external-surface state: no | Stars are user-owned retrieval state; inspection/external-surface timestamps are operational state. |
| Agent idempotency receipts | `agent_receipts` | No by default | Required for retry safety/provenance, not a user-facing activity ledger. |
| Runtime credential metadata | `runtime_metadata` | No | Stores owner-token hash only; LLM API keys and secret-source metadata are runtime inputs and must not be stored. |
| Lexical index | `search_fts` | No | Derived from canonical rows. |
| Diagnostics | status/error fields on canonical rows | No | Raw operational truth for `/doctor`, not a dashboard. |

### 3.3 Lifecycle and Coordination

Startup order:

1. parse `resofeed serve` flags and resolve required OpenRouter secret configuration before LLM client construction;
2. open SQLite;
3. run migrations;
4. resolve owner token from `--owner-token`, stored runtime metadata, or first-run generation;
5. prepare FTS/search maintenance;
6. start HTTP static/API server and MCP endpoint;
7. start background ingestion after storage is ready.

Coordination rules:

- use direct function calls inside `internal/resofeed`;
- use SQLite transactions for state changes;
- keep state export/import as direct backup/restore transactions inside `internal/resofeed`; do not introduce a state merger, conflict resolver, sync coordinator, or receipt-portability module;
- isolate source-level ingestion failures;
- coordinate background ingest, global manual ingest, and per-source manual fetch through one in-process ingest concurrency guard owned by `ingest.go`;
- permit at most one ingest/fetch operation to run at a time across the process: background ingest, `POST /api/ingest`, and `POST /api/sources/{id}/fetch` must never overlap;
- reject HTTP manual triggers with `409 conflict` when the guard is already held; background ticks may be ignored/skipped while an ingest is already running;
- do not persist ingest work as a queue, job table, command ledger, activity log, or portable receipt;
- use no event bus, plugin registry, DI container, service discovery, or repository interface layer.

### 3.4 Shared Types Rule

Shared structs belong in `types.go` only when used across HTTP, MCP, storage, ingestion, or frontend response boundaries. Expected shared structs: `Source`, `Item`, `ItemState`, `SteerRule`, and canonical fallback/status values. Keep helper functions file-local until repeated real use justifies moving them.

## 4. SQLite Shape

The schema stores current state and small derived/cache fields. It is not an implementation SQL script.

### 4.1 `sources`

Purpose: flat Source Ledger and feed ingestion.

Required fields:

- stable text `id`;
- unique feed `url`;
- display `title`;
- creation timestamp;
- last fetch timestamp/status/error for `/doctor`;
- active/deleted flag for source removal;
- integer `revision` for local mutation responses.

Invariants:

- OPML folders are discarded on import;
- deleted sources do not appear in the Source Ledger;
- one source failure does not block other sources.

### 4.2 `items`

Purpose: canonical content cache and provenance.

Required fields:

- stable text `id`;
- `source_id`;
- original URL and normalized/canonical URL when available;
- title and feed excerpt;
- extracted text when available;
- dense summary and core insight when available;
- quality/value tier or equivalent priority category;
- published and first-seen timestamps;
- extraction/model fallback status;
- story grouping key and direct-duplicate pointer when known.

Invariants:

- original item provenance remains accessible when grouped;
- grouping never behaves like source suppression or hidden spam filtering;
- extraction/model failure never deletes the item.

### 4.3 `item_state`

Purpose: current attention state without an activity ledger.

Required fields:

- `item_id` primary key;
- resonance active flag;
- human-inspected timestamp;
- externally-surfaced timestamp;
- last actor kind/id when changed through an agent-mediated action.

Invariants:

- resonance makes items retrievable but never permanently pins daily attention;
- agent candidate evaluation does not mark human inspection;
- externally forwarded human actions update the same state as local UI actions.

### 4.4 `steer_rules`

Purpose: current steering policy.

Required fields:

- stable text `id`;
- human-readable `rule_text`;
- active flag;
- optional superseding rule reference;
- creation timestamp;
- integer `revision` for local mutation responses.

Invariants:

- only active rules affect ranking;
- inactive/superseded rows exist only for steering replacement safety;
- no settings-panel slider state exists.

### 4.5 `agent_receipts`

Purpose: minimal retry/idempotency/provenance for delegated-agent handoff.

Required fields:

- idempotency key;
- actor id;
- operation name;
- optional item id;
- creation timestamp;
- compact result snapshot.

Invariants:

- duplicate requests with the same key return the same result class;
- this table is not rendered as an activity feed;
- receipts exist only to prevent duplicate external surfacing and satisfy agent provenance requirements.

### 4.6 `search_fts`

Purpose: derived lexical index.

Indexed content:

- item title;
- source title/name;
- feed excerpt;
- summary;
- extracted text;
- provenance fields useful for verification.

Invariants:

- rebuildable from canonical rows;
- no embedding/vector columns;
- no generated answer surface.

### 4.7 `runtime_metadata`

Purpose: runtime-only metadata that is required to operate ResoFeed but is not user-owned portable state.

Required schema contract:

| Column | Type | Constraint |
|---|---|---|
| `key` | TEXT | primary key |
| `value` | TEXT | not null |
| `updated_at` | INTEGER | Unix timestamp, not null |

Required keys:

| Key | Value format | Export/import? | Purpose |
|---|---|---:|---|
| `owner_token_sha256` | lowercase hex SHA-256 digest | No | Verifies `Authorization: Bearer <OWNER_TOKEN>` without storing the plaintext token. |

Owner token contract:

- generated tokens use format `rfeed_` followed by 43 base64url characters generated from 32 random bytes;
- explicit `--owner-token` values must be at least 32 visible non-whitespace characters and are stored only as SHA-256 hex;
- explicit tokens are not trimmed; leading/trailing whitespace makes the token invalid;
- invalid or empty `--owner-token` exits before binding the server socket and prints a terse startup error;
- malformed, missing, or non-`Bearer` `Authorization` headers return `401` with the standard `unauthorized` error body;
- token hash comparison must avoid timing leaks;
- passing `--owner-token` replaces the stored `owner_token_sha256` value;
- if no stored token hash exists and `--owner-token` is omitted, startup generates a token, stores its hash, and prints the plaintext token once;
- `resofeed owner-token reset --db PATH --confirm-reset` deletes only `owner_token_sha256` while offline and leaves replacement generation or explicit setting to the next `serve` startup;
- browser-local token deletion, including clearing `localStorage['resofeed.ownerToken']`, changes only the browser client state and must not change SQLite runtime metadata;
- no HTTP endpoint, MCP tool/resource, Settings page, or UI action may reset the owner token;
- this table must never be included in Source Ledger/state export.

## 5. Operation Contracts

### 5.1 Ingestion

Responsibilities:

- fetch active sources independently;
- parse RSS/Atom entries;
- upsert item cache rows;
- extract article content when possible;
- request OpenRouter summary/metadata only after source text or fallback text exists;
- validate OpenRouter response JSON before saving;
- update diagnostic fields for failures.

Extraction semantics:

- article extraction is best-effort and remains inside the single Go runtime;
- extraction first selects readable source text from semantic HTML containers in this order: `<article>`, `itemprop="articleBody"`, `<main>`, common content containers such as `article-body`, `article-content`, `post-content`, `entry-content`, `story-body`, and `content-body`, then `<body>` as fallback;
- HTML block boundaries must be preserved before readable-text sanitation so one boilerplate paragraph does not discard valid article paragraphs;
- navigation, headers, footers, sidebars, forms, scripts, styles, JSON-LD metadata, diagnostic-token residue, and known readable boilerplate are removed before persistence;
- `extraction_status='full'` is valid only when non-empty cleaned article text is persisted in `extracted_text`;
- if linked-article extraction fails but RSS text exists, the item remains visible with `extraction_status='partial_extraction'` and source text understood as RSS excerpt text.

Runtime limits:

- background ingest interval default: 15 minutes;
- source fetch timeout: 20 seconds per source, including per-source manual fetches;
- OpenRouter request timeout: 45 seconds;
- OpenRouter retry policy: at most one retry for network/429/5xx failures;
- failed OpenRouter responses must not block item visibility.

Concurrency semantics:

- exactly one ingest/fetch operation may run at a time in the Go process;
- the same non-overlap rule applies to the background ingest loop, `POST /api/ingest`, and `POST /api/sources/{id}/fetch`;
- if an HTTP manual trigger arrives while ingestion is already running, it must return `409 conflict` and must not enqueue, persist, or retry the requested work;
- if a background ingest tick fires while another ingest/fetch is running, it may be ignored/skipped rather than queued;
- persistent queues, job tables, command-history rows, ingest ledgers, and cross-process schedulers are forbidden.

Failure contract:

- feed failure affects only that source;
- per-source manual fetch failure returns a request-level error result for that source and also updates source diagnostics where applicable;
- global manual ingest may complete with source-level failures; source failures are reported in the response summary rather than aborting successful sources;
- extraction failure maps to `partial_extraction` or `original_unavailable` where appropriate;
- OpenRouter/model failure maps to `summary_unavailable`, `model_latency_error`, or `/doctor` model diagnostics;
- extraction status and model status are separate: an item may have model-backed summary metadata while source text is only an RSS excerpt;
- timeout of the 20-second source fetch limit maps to an RSS/source fetch diagnostic and leaves no persistent pending job;
- no failure path creates an elaborate UI degradation mode.

### 5.2 Ranking and Daily Feed

Responsibilities:

- preserve freshness before hoarding;
- apply active steering rules;
- keep resonated items retrievable without pinning;
- preserve source coverage without hidden rate-limiting;
- group duplicates/story siblings transparently.

Forbidden:

- inbox-zero counts;
- archive mechanics;
- hidden source throttling;
- dwell/scroll tracking as ranking input;
- user-facing ranking sliders.

#### 5.2.1 Ranking Contract

These are contract guardrails, not a scoring algorithm. Implementations may choose any internal scoring approach that satisfies them.

Definitions:

- `fresh candidate`: an active-source item whose `published_at` or first-seen ingestion time is within the last 48 hours;
- `memory candidate`: an older item retained for retrieval, including resonated items;
- `coverage candidate`: a fresh candidate from an active source that is not otherwise represented in the response;
- `new related development`: a fresh candidate with the same non-null `story_key` as an older inspected, externally surfaced, or resonated item.

Response guardrails for `GET /api/feed/today` and MCP `list_candidate_items`:

- if fresh candidates exist and `limit >= 10`, at least half of returned items, rounded down, must be fresh candidates unless fewer fresh candidates exist;
- older resonated memory candidates must not exceed 20% of returned items unless they are attached to a new related development or fresh candidates are exhausted;
- when `limit >= 10` and at least three active sources have fresh candidates, the response must include fresh candidates from at least three distinct sources unless fewer distinct sources are available;
- for `limit < 10`, the same scoring policy may apply but freshness and source-coverage quota assertions do not apply;
- externally surfaced items are suppressed from candidate lists unless a new related development exists; the resurfaced item may appear only with provenance explaining the new related development;
- direct duplicates may be grouped, but every original source item remains retrievable through item detail/provenance.

### 5.3 Steering

Responsibilities:

- accept natural-language commands from Steer UI and MCP;
- detect RSS URL subscription commands without a separate add-source wizard;
- translate policy changes through OpenRouter only when needed;
- apply rule changes in one SQLite transaction;
- return a terse steering receipt suitable for UI and MCP.

Invariants:

- OpenRouter proposes structured changes; Go validates and applies them;
- current active rules are the only rules used for ranking;
- inactive/superseded rows are steering replacement safety, not visible command history.

#### 5.3.1 Steering Conflict Contract

Steering conflict handling is deterministic at the contract boundary:

- safety, legality, freshness, source coverage, provenance, and minimalism invariants cannot be disabled by human or agent steering;
- when a steering command conflicts with an invariant, the receipt must say the requested change was not fully applied and must describe the closest allowed interpretation;
- if no safe/product-valid part of the command remains, the operation returns `200` with a receipt, an empty `changed_rules` array, and a terse `message` explaining the invariant conflict;
- human steering supersedes conflicting delegated-agent steering;
- delegated-agent steering that conflicts with active human steering returns `200` with a receipt, an empty `changed_rules` array, and a terse `message` explaining that human steering takes precedence;
- steering receipts are inline transparency records, not a rule-management UI or portable activity ledger.

### 5.4 Search

Responsibilities:

- support plain text, source, time, and resonance-status filters;
- explain enough provenance for result verification;
- include inspected/high-quality historical items where indexed.

Forbidden:

- semantic/vector retrieval;
- generated answer responses;
- a fourth top-level navigation tab unless `docs/DESIGN.md` changes.

### 5.5 State Portability

Portable state is a backup/restore contract, not a sync or multi-instance merge protocol.

Portable state bundle includes:

- active Source Ledger rows required to rebuild subscriptions;
- current active steering policy rules;
- currently resonated item state required to restore stars.

Portable state bundle excludes:

- deleted-source tombstones;
- inactive or superseded steering rows;
- agent receipts and idempotency records;
- derived search indexes;
- command history, reading history, activity logs, or sync metadata.

Import rules:

- validate `schema_version` and required field shapes before writing;
- reject unknown top-level fields and duplicate `id`/`item_id` values within `sources`, `steer_rules`, and `resonated_items`;
- execute as one transaction;
- restore the portable active state represented by the bundle;
- after successful import, active sources, active steering rules, and resonated items equal the bundle's portable state; local portable rows absent from the bundle are removed;
- do not merge against existing local rows;
- do not preserve deleted-source tombstones;
- rebuild FTS/search indexes after import if needed;
- ignore OPML folders/tags.

State bundle v1 field contract:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `schema_version` | string enum | Yes | No | Must be exactly `resofeed.state.v1`. |
| `exported_at` | RFC3339 UTC string | Yes | No | Export creation time. |
| `sources` | `SourceState[]` | Yes | No | Empty array when none. |
| `steer_rules` | `SteerRuleState[]` | Yes | No | Empty array when none. |
| `resonated_items` | `ResonatedItemState[]` | Yes | No | Empty array when none. |

`SourceState`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `id` | string | Yes | No | stable source id |
| `url` | string | Yes | No | RSS/Atom URL |
| `title` | string | Yes | No | display title |

`SteerRuleState`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `id` | string | Yes | No | stable rule id |
| `rule_text` | string | Yes | No | human-readable active policy text |

`ResonatedItemState`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `item_id` | string | Yes | No | stable item id |
| `url` | string | Yes | No | original item URL for restore matching |
| `source_url` | string | Yes | No | source URL for provenance matching |
| `title` | string | Yes | Yes | title at export time, null if unavailable |

```json
{
  "schema_version": "resofeed.state.v1",
  "exported_at": "2026-05-09T00:00:00Z",
  "sources": [
    {
      "id": "src_01",
      "url": "https://example.com/feed.xml",
      "title": "Example"
    }
  ],
  "steer_rules": [
    {
      "id": "rule_01",
      "rule_text": "Push more technical documents."
    }
  ],
  "resonated_items": [
    {
      "item_id": "item_01",
      "url": "https://example.com/article",
      "source_url": "https://example.com/feed.xml",
      "title": "Example article"
    }
  ]
}
```

Restore result schema:

```json
{
  "restored": {
    "sources": 1,
    "steer_rules": 1,
    "resonated_items": 1
  }
}
```

Invalid state bundles use the standard `400 bad_request` JSON error body from §6. State import does not return merge conflicts because it is not a merge protocol.

Architecture alignment note: broad `docs/DESIGN.md` wording such as “history” means only the minimal current-state bundle above when implemented. It does not permit a general command history, reading history, activity ledger, sync protocol, or conflict-resolution system.
## 6. HTTP Surface

The HTTP API is for the Svelte UI and authorized direct use. These path names and schemas are part of the interface contract.

Auth boundary:

- static UI assets (`/`, JS, CSS, fonts) are loadable without an owner token so the browser can display the token prompt;
- every `/api/*` route requires `Authorization: Bearer <OWNER_TOKEN>`;
- there are no anonymous API reads;
- invalid or missing API auth returns `401` with the standard JSON error body.

Content types:

- JSON endpoints return `application/json; charset=utf-8`;
- `GET /api/doctor` returns `text/plain; charset=utf-8`;
- OPML import accepts `application/xml` or `text/xml`;
- state import/export uses `application/json`.

Common JSON error body:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "owner token required",
    "details": {}
  }
}
```

Allowed error codes: `unauthorized`, `bad_request`, `not_found`, `conflict`, `internal`.

Canonical JSON type rules:

- timestamps are RFC3339 strings in UTC, e.g. `2026-05-09T00:00:00Z`;
- IDs are opaque strings and must not be parsed by clients;
- nullable fields are present with `null` rather than omitted unless otherwise noted;
- HTTP and MCP reuse the same JSON types unless a tool/resource explicitly overrides them.

`ErrorBody`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `error.code` | string enum | Yes | No | `unauthorized`, `bad_request`, `not_found`, `conflict`, `internal` |
| `error.message` | string | Yes | No | terse human-readable message |
| `error.details` | object | Yes | No | `{}` when no structured details exist |

`ItemSummary`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `id` | string | Yes | No | item id |
| `source_id` | string | Yes | No | source id |
| `source_title` | string | Yes | No | source display title |
| `url` | string | Yes | No | original item URL |
| `title` | string | Yes | No | item title |
| `summary` | string | Yes | Yes | `null` when unavailable |
| `core_insight` | string | Yes | Yes | `null` when unavailable |
| `value_tier` | string | Yes | Yes | terse quality/value category, e.g. `high`; `null` when unavailable |
| `published_at` | RFC3339 string | Yes | Yes | `null` when feed lacks date |
| `extraction_status` | string enum | Yes | No | `full`, `partial_extraction`, `summary_unavailable`, `original_unavailable` |
| `model_status` | string enum | Yes | No | `ok`, `summary_unavailable`, `model_latency_error` |
| `is_resonated` | boolean | Yes | No | current resonance state |
| `human_inspected_at` | RFC3339 string | Yes | Yes | `null` when not inspected |
| `external_surfaced_at` | RFC3339 string | Yes | Yes | `null` when not surfaced by agent |
| `story_key` | string | Yes | Yes | `null` when not grouped |
| `duplicate_of_item_id` | string | Yes | Yes | `null` when not direct duplicate |

`ItemDetail` is `ItemSummary` plus:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `feed_excerpt` | string | Yes | Yes | raw feed excerpt when available |
| `extracted_text` | string | Yes | Yes | full extracted text when available |
| `provenance` | object | Yes | No | source URL, canonical URL, grouping/duplicate context |

`Provenance`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `source_url` | string | Yes | No | RSS/Atom feed URL for the source |
| `canonical_url` | string | Yes | Yes | normalized canonical article URL when known |
| `original_url` | string | Yes | No | original item URL from the feed |
| `story_key` | string | Yes | Yes | grouping key, null when not grouped |
| `duplicate_of_item_id` | string | Yes | Yes | direct duplicate pointer, null when not duplicate |

`Source`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `id` | string | Yes | No | source id |
| `url` | string | Yes | No | RSS/Atom URL |
| `title` | string | Yes | No | display title |
| `last_fetch_at` | RFC3339 string | Yes | Yes | `null` before first fetch |
| `last_fetch_status` | string enum | Yes | No | `ok`, `rss_fetch_error`, `not_fetched` |
| `is_active` | boolean | Yes | No | false means deleted/inactive |
| `revision` | integer | Yes | No | monotonic local change value |

`SteerRule`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `id` | string | Yes | No | rule id |
| `rule_text` | string | Yes | No | human-readable active policy text |
| `is_active` | boolean | Yes | No | only active rules affect ranking |
| `superseded_by` | string | Yes | Yes | replacement rule id or null |
| `revision` | integer | Yes | No | monotonic local change value |
| `created_by_actor_kind` | string | No | No | present when needed for inline provenance; `human` or `agent` |
| `created_by_actor_id` | string | No | Yes | delegated agent name/id for concise correction receipts |

`RestoreResult`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `restored.sources` | integer | Yes | No | restored source rows |
| `restored.steer_rules` | integer | Yes | No | restored steering rows |
| `restored.resonated_items` | integer | Yes | No | restored resonance rows |

`SearchQueryEcho`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `q` | string | Yes | No | effective query string; empty string if omitted |
| `source` | string | Yes | Yes | source filter or null |
| `from` | `YYYY-MM-DD` string | Yes | Yes | inclusive date lower bound or null |
| `to` | `YYYY-MM-DD` string | Yes | Yes | inclusive date upper bound or null |
| `resonated` | boolean | Yes | Yes | resonance filter or null |
| `limit` | integer | Yes | No | effective limit after defaults/max validation |

Manual ingest request schemas:

`POST /api/ingest` request body:

```json
{}
```

`POST /api/sources/{id}/fetch` request body:

```json
{}
```

Manual ingest request rules:

- request bodies must be valid JSON objects;
- the only accepted body shape is an empty object `{}`;
- `idempotency_key` is intentionally not accepted because manual ingest triggers do not create durable command receipts, queues, or jobs;
- query parameters are not accepted on either endpoint.

`IngestErrorDetail`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `source_id` | string | Yes | Yes | source id when error is source-scoped; `null` for global trigger errors |
| `code` | string enum | Yes | No | `rss_fetch_error`, `timeout`, `internal` |
| `message` | string | Yes | No | terse diagnostic suitable for inline `err: <diagnostic>` display |

`IngestRunResult`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `scope` | string enum | Yes | No | `all` for `POST /api/ingest`, `source` for `POST /api/sources/{id}/fetch` |
| `source_id` | string | Yes | Yes | requested source id for source fetch; `null` for global ingest |
| `status` | string enum | Yes | No | `completed`, `completed_with_errors`, or `failed` |
| `started_at` | RFC3339 string | Yes | No | request execution start time |
| `completed_at` | RFC3339 string | Yes | No | request execution completion time |
| `duration_ms` | integer | Yes | No | elapsed request duration in milliseconds |
| `sources_attempted` | integer | Yes | No | number of sources attempted |
| `sources_succeeded` | integer | Yes | No | number of sources fetched successfully |
| `sources_failed` | integer | Yes | No | number of source fetch failures |
| `items_upserted` | integer | Yes | No | number of item rows inserted or updated |
| `errors` | array of `IngestErrorDetail` | Yes | No | empty array when no source-level errors occurred |

Manual ingest success response schemas:

Operational RSS fetch failures are successful HTTP requests whose ingest result records source-level failure. Network timeouts, RSS/Atom parse errors, upstream feed HTTP errors, and similar per-source fetch failures return HTTP `200 OK` with `status: "failed"` or `status: "completed_with_errors"` and a populated `errors` array. Only transport, authentication, request validation, missing/deleted/inactive source lookup, concurrency-guard, or unexpected runtime failures use the standard 4xx/5xx `ErrorBody` shape.

If `POST /api/ingest` runs when there are zero active sources, it returns HTTP `200 OK` immediately with `status: "completed"`, `sources_attempted: 0`, `sources_succeeded: 0`, `sources_failed: 0`, `items_upserted: 0`, and `errors: []`.

`POST /api/ingest` returns:

```json
{
  "ingest": {
    "scope": "all",
    "source_id": null,
    "status": "completed_with_errors",
    "started_at": "2026-05-09T14:00:00Z",
    "completed_at": "2026-05-09T14:00:12Z",
    "duration_ms": 12000,
    "sources_attempted": 12,
    "sources_succeeded": 11,
    "sources_failed": 1,
    "items_upserted": 37,
    "errors": [
      {
        "source_id": "src_02",
        "code": "rss_fetch_error",
        "message": "feed returned HTTP 502"
      }
    ]
  }
}
```

`POST /api/sources/{id}/fetch` returns:

```json
{
  "ingest": {
    "scope": "source",
    "source_id": "src_01",
    "status": "completed",
    "started_at": "2026-05-09T14:02:00Z",
    "completed_at": "2026-05-09T14:02:03Z",
    "duration_ms": 3000,
    "sources_attempted": 1,
    "sources_succeeded": 1,
    "sources_failed": 0,
    "items_upserted": 4,
    "errors": []
  },
  "source": {
    "id": "src_01",
    "url": "https://example.com/feed.xml",
    "title": "Example",
    "last_fetch_at": "2026-05-09T14:02:03Z",
    "last_fetch_status": "ok",
    "is_active": true,
    "revision": 2
  }
}
```

Manual ingest conflict response schema:

The ingest concurrency guard is global across background ingest, `POST /api/ingest`, and `POST /api/sources/{id}/fetch`; conflict responses therefore always report `details.scope: "all"`, including when the holder is the background ingest loop.

```json
{
  "error": {
    "code": "conflict",
    "message": "ingest already running",
    "details": {
      "ingest_running": true,
      "scope": "all",
      "retry_allowed": true
    }
  }
}
```

HTTP query validation contract:

- validation runs after API authentication and before backend reads;
- each endpoint accepts only the query parameters listed in its endpoint contract;
- unknown query parameters return `400 bad_request` with `details: { "field": "<query_param>" }`;
- duplicate query parameters return `400 bad_request` with `details: { "field": "<query_param>" }`;
- when multiple query parameters are invalid, the response reports one invalid field; clients must not depend on validation order.

`GET /api/feed/today` query rules:

| Parameter | Required | Default | Valid values | Invalid when |
|---|---:|---|---|---|
| `limit` | No | `50` | base-10 integer string from `1` through `100` | non-integer, below `1`, above `100`, duplicate |

`GET /api/search` query rules:

| Parameter | Required | Default | Valid values | Invalid when |
|---|---:|---|---|---|
| `q` | No | empty string | string up to `500` UTF-8 bytes after URL decoding | above `500` bytes after URL decoding, duplicate |
| `source` | No | `null` | non-empty string identifying source name or source id | duplicate |
| `from` | No | `null` | calendar date string in `YYYY-MM-DD` format | malformed date, impossible date, later than `to`, duplicate |
| `to` | No | `null` | calendar date string in `YYYY-MM-DD` format | malformed date, impossible date, duplicate |
| `resonated` | No | `null` | exactly `true` or `false` | any other value, duplicate |
| `limit` | No | `50` | base-10 integer string from `1` through `100` | non-integer, below `1`, above `100`, duplicate |

Query normalization rules:

- HTTP percent-decoding happens before query validation;
- query byte limits apply to decoded UTF-8 strings;
- omitted optional query parameters use the defaults above;
- empty `q` is allowed and echoes as `""`;
- non-empty `q` echoes the decoded string exactly; the API contract does not trim whitespace, fold case, normalize Unicode, or collapse internal whitespace;
- empty `source`, `from`, `to`, and `resonated` values are invalid because they obscure caller intent; omit the parameter to request `null`;
- `from` and `to` remain `YYYY-MM-DD` strings in the echo and are not expanded to timestamps;
- `resonated` echoes as a JSON boolean when provided and as `null` when omitted.

Field limits:

| Field/input | Limit |
|---|---:|
| Steer `command` | 4000 bytes |
| `idempotency_key` | 200 bytes |
| `actor_id` | 128 bytes |
| source URL | 2048 bytes |
| item/source title | 500 bytes |
| search `q` | 500 bytes |
| OPML import body | 10 MiB |
| state import body | 10 MiB |

Shared response shapes:

```json
{
  "item": {
    "id": "item_01",
    "source_id": "src_01",
    "source_title": "Example",
    "url": "https://example.com/article",
    "title": "Example article",
    "summary": "Dense factual summary.",
    "core_insight": "Why this matters.",
    "published_at": "2026-05-09T00:00:00Z",
    "extraction_status": "full",
    "model_status": "ok",
    "is_resonated": false,
    "human_inspected_at": null,
    "external_surfaced_at": null,
    "story_key": null,
    "duplicate_of_item_id": null
  }
}
```

```json
{
  "source": {
    "id": "src_01",
    "url": "https://example.com/feed.xml",
    "title": "Example",
    "last_fetch_at": "2026-05-09T00:00:00Z",
    "last_fetch_status": "ok",
    "is_active": true,
    "revision": 1
  }
}
```

Endpoint contracts:

| Method/path | Request | Success | Response |
|---|---|---:|---|
| `GET /api/feed/today` | optional query params listed in the feed/today query rules | `200` | `{ "items": [ItemSummary] }` |
| `GET /api/items/{id}` | path `id` | `200` | `{ "item": ItemDetail }` including extracted text and provenance |
| `POST /api/items/{id}/inspect` | JSON `{ "actor_kind": "human"|"agent", "actor_id": "owner", "idempotency_key": "..." }` | `200` | `{ "item_id": "...", "human_inspected_at": "...", "already_applied": false }` |
| `POST /api/items/{id}/resonance` | JSON `{ "resonated": true, "actor_kind": "human"|"agent", "actor_id": "owner", "idempotency_key": "..." }` | `200` | `{ "item_id": "...", "is_resonated": true, "already_applied": false }` |
| `POST /api/steer` | JSON `{ "command": "...", "actor_kind": "human"|"agent", "actor_id": "owner", "idempotency_key": "..." }`; `command` max `4000` bytes | `200` | `{ "receipt": { "interpreted_as": "...", "changed_rules": [SteerRule], "message": "..." } }` |
| `GET /api/sources` | none | `200` | `{ "sources": [Source] }` |
| `DELETE /api/sources/{id}` | path `id` | `200` | `{ "source_id": "...", "deleted": true, "revision": 2 }` |
| `POST /api/sources/import-opml` | `application/xml` OPML body, max `10 MiB` | `200` | `{ "imported": 12, "skipped": 0, "folders_flattened": true }` |
| `POST /api/ingest` | JSON `{}`; no query params | `200` | `{ "ingest": IngestRunResult }`; returns `409 conflict` if any ingest/fetch is already running |
| `POST /api/sources/{id}/fetch` | path `id`, JSON `{}`; no query params | `200` | `{ "ingest": IngestRunResult, "source": Source }`; returns `404 not_found` if the requested source is missing, deleted, or explicitly inactive; returns `409 conflict` if any ingest/fetch is already running |
| `GET /api/search` | optional query params listed in the search query rules | `200` | `{ "items": [ItemSummary], "query": SearchQueryEcho }` |
| `GET /api/steer/active` | none | `200` | `{ "rules": [SteerRule] }`; intended for inline steering receipts only, not a rule-management UI |
| `GET /api/state/export` | none | `200` | state bundle JSON (`schema_version: resofeed.state.v1`) |
| `POST /api/state/import` | state bundle JSON, max `10 MiB` | `200` | restore result schema |
| `GET /api/doctor` | none | `200` | `text/plain; charset=utf-8` raw diagnostic lines |

HTTP error matrix:

| Condition | Status | `error.code` | `details` rule |
|---|---:|---|---|
| missing `Authorization` header | `401` | `unauthorized` | `{}` |
| malformed/non-Bearer `Authorization` header | `401` | `unauthorized` | `{}` |
| invalid owner token | `401` | `unauthorized` | `{}` |
| malformed JSON body | `400` | `bad_request` | `{ "field": "body" }` |
| missing required field | `400` | `bad_request` | `{ "field": "<field_name>" }` |
| missing required `idempotency_key` | `400` | `bad_request` | `{ "field": "idempotency_key" }` |
| bad content type | `400` | `bad_request` | `{ "content_type": "..." }` |
| request body too large | `400` | `bad_request` | `{ "limit": "10 MiB" }` |
| invalid state bundle schema or field shape | `400` | `bad_request` | `{ "field": "<field_name>" }` |
| invalid query parameter | `400` | `bad_request` | `{ "field": "<query_param>" }` |
| missing item/source id | `404` | `not_found` | `{ "id": "..." }` |
| manual ingest/fetch requested while any ingest/fetch is already running | `409` | `conflict` | `{ "ingest_running": true, "scope": "all", "retry_allowed": true }` |
| unexpected runtime failure | `500` | `internal` | `{}`; raw detail belongs in `/doctor` |

Idempotency rules:

- item-state mutations and `POST /api/steer` require `idempotency_key`;
- source delete is idempotent by source id;
- OPML import is deduplicated by source URL;
- state import atomically restores the validated state bundle and does not require `idempotency_key`;
- manual ingest/fetch triggers do not use `idempotency_key` and must not create durable command receipts, queues, or job rows;
- retrying the same mutation with the same `idempotency_key` returns the original result class and `already_applied: true` when applicable;
- new idempotency keys represent new intended operations.

## 7. MCP Surface

MCP is required over Remote Streamable HTTP at `/mcp`. MCP tools/resources expose the same product concepts as the UI: inspect, resonate, steer, retrieve, and report delivery.

Auth boundary:

- every `/mcp` request/session requires `Authorization: Bearer <OWNER_TOKEN>`;
- read-only resources and tools are authenticated too;
- mutating tools additionally require `idempotency_key`.

Agent authorization contract:

- current scope has no per-agent delegation registry;
- possession of `OWNER_TOKEN` is sufficient authority for MCP and HTTP agent-mediated calls;
- missing, malformed, or invalid owner-token authority returns HTTP `401` before tool/resource handling and creates no receipt, queue, or pending review item;
- `actor_id` is attribution metadata, not an authorization lookup key;
- an empty, missing, or oversized required `actor_id` is a schema error for the tool or HTTP request, not an authorization denial;
- valid owner-token mutating calls write runtime `agent_receipts` only where required for retry/idempotency/provenance; receipts are not portable state.

Resources:

- `resofeed://feed/today` — JSON `{ "items": [ItemSummary] }`;
- `resofeed://rules/active` — JSON `{ "rules": [SteerRule] }`;
- `resofeed://system/doctor` — `text/plain` raw diagnostics;
- `resofeed://sources` — JSON `{ "sources": [Source] }`.

Tools:

| Tool | Input schema | Output schema | Mutation? | Equivalent operation |
|---|---|---|---|---|
| `list_candidate_items` | `{ "limit": 20 }`, default `20`, max `50` | `{ "items": [ItemSummary] }` | No | feed candidate query |
| `search_items` | `{ "query": "sqlite", "source": null, "from": null, "to": null, "resonated": null, "limit": 20 }` | `{ "items": [ItemSummary] }` | No | `GET /api/search` |
| `read_item` | `{ "item_id": "item_01" }` | `{ "item": ItemDetail }` | No | `GET /api/items/{id}` |
| `mark_inspected` | `{ "item_id": "item_01", "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "item_id": "item_01", "human_inspected_at": "...", "already_applied": false }` | Yes | `POST /api/items/{id}/inspect` |
| `resonate_item` | `{ "item_id": "item_01", "resonated": true, "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "item_id": "item_01", "is_resonated": true, "already_applied": false }` | Yes | `POST /api/items/{id}/resonance` |
| `steer` | `{ "command": "Push more technical documents.", "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "receipt": { "interpreted_as": "...", "changed_rules": [SteerRule], "message": "..." } }` | Yes | `POST /api/steer` |
| `report_delivery` | `{ "item_id": "item_01", "actor_id": "agent-name", "delivered_at": "2026-05-09T00:00:00Z", "idempotency_key": "..." }` | `{ "item_id": "item_01", "external_surfaced_at": "...", "already_applied": false }` | Yes | item state update + receipt |

MCP schema rules:

- missing/invalid auth on `/mcp` returns HTTP `401` before MCP tool/resource handling;
- resource content types are exactly those listed above (`application/json` or `text/plain`);
- resource JSON bodies reuse canonical HTTP types;
- unknown tools/resources return MCP tool/resource not found errors, not HTTP `404` after session establishment;
- `search_items.query` is required even though HTTP search `q` is optional; MCP clients that want empty-feed browsing should use `list_candidate_items`;
- `actor_id`, when required, is a non-empty string with max length `128`;
- `idempotency_key`, when required, is a non-empty string with max length `200`;
- `item_id` is a required non-empty string for item-specific tools;
- `command` max length is `4000` bytes;
- `limit` defaults and maximums are fixed by the tool table.

Tool required fields:

| Tool | Required fields | Optional fields |
|---|---|---|
| `list_candidate_items` | none | `limit` |
| `search_items` | `query` | `source`, `from`, `to`, `resonated`, `limit` |
| `read_item` | `item_id` | none |
| `mark_inspected` | `item_id`, `actor_id`, `idempotency_key` | none |
| `resonate_item` | `item_id`, `resonated`, `actor_id`, `idempotency_key` | none |
| `steer` | `command`, `actor_id`, `idempotency_key` | none |
| `report_delivery` | `item_id`, `actor_id`, `delivered_at`, `idempotency_key` | none |

MCP invariants:

- read/evaluate calls do not mutate human-visible inspection status;
- all calls require owner-token authority;
- mutating calls require idempotency keys;
- tool responses include enough provenance for agents to avoid duplicate loops;
- MCP does not add delivery-channel ownership such as Telegram, Slack, or email.

## 8. Frontend Boundary

Frontend implementation lives in `web/` and must preserve `docs/DESIGN.md`.

State-portability scope: frontend export/import surfaces must follow `docs/ARCHITECTURE.md §5.5 State Portability`. They expose only the minimal current-state bundle defined there and must not become history or activity-ledger features.

Responsibilities:

- render the dense-but-legible feed and Inspector;
- show an owner-token prompt on first open before calling `/api/*`;
- store the owner token in browser-local storage as `resofeed.ownerToken` and send it as `Authorization: Bearer <OWNER_TOKEN>` on every `/api/*` request;
- keep Steer as the primary command surface for URL subscription, steering, search command entry, and `/doctor`; the current web UI routes `/doctor` to `GET /api/doctor` rather than posting it to `/api/steer`;
- expose `TODAY` and `SOURCE LEDGER` through a discreet `RESOFEED` surface menu when the design chooses low-chrome navigation; persistent visible top-level links are not required;
- expose flat Source Ledger without folders/tags/settings-dashboard behavior;
- expose lightweight Source Ledger manual controls for `POST /api/ingest` and `POST /api/sources/{id}/fetch` as immediate bracket actions only; these controls must not create durable jobs, queues, command histories, activity ledgers, retry dashboards, sync/merge concepts, or additional source-management surfaces;
- expose state export/import as terse actions, not backup-management UI;
- show fallback/status labels plainly.

Forbidden:

- Tailwind or component UI libraries unless the design contract changes;
- visual concepts not in `docs/DESIGN.md`;
- extra dashboard surfaces for diagnostics, source management, manual ingest/fetch, or settings;
- UI state models that imply persisted ingest jobs, queued retries, activity feeds, or portable manual-ingest receipts.

## 9. Minimal File Shape

Start with this shape and split only after file size, test locality, or repeated change pressure justifies it:

```text
cmd/resofeed/main.go
internal/resofeed/db.go
internal/resofeed/migrations.go
internal/resofeed/types.go
internal/resofeed/ingest.go
internal/resofeed/ranking.go
internal/resofeed/search.go
internal/resofeed/state.go
internal/resofeed/llm.go
internal/resofeed/http.go
internal/resofeed/mcp.go
internal/resofeed/doctor.go
web/
```

Module ownership rules:

- `internal/resofeed/ingest.go` owns RSS/Atom fetch orchestration, per-source fetch execution, source-level ingest diagnostics, the in-process ingest concurrency guard, and the non-overlap semantics for background/manual ingestion.
- `internal/resofeed/http.go` owns HTTP routing, owner-token enforcement, request validation, response serialization, and mapping `ingest.go` outcomes to the `POST /api/ingest` and `POST /api/sources/{id}/fetch` contracts.
- `http.go` must not own ingest business logic, queues, job lifecycle, retry scheduling, or source fetch state beyond request/response translation.
- `ingest.go` must not own HTTP status codes or JSON wire formatting beyond exposing typed outcomes that `http.go` can translate.
- `state.go` owns only state bundle validation plus transactional backup/restore. It must not own merging, conflict resolution, sync orchestration, or portable agent receipts.

Do not introduce repositories, factories, DI containers, event buses, plugin registries, service catalogs, storage interfaces, state mergers, conflict resolvers, sync coordinators, provider abstraction layers, persistent ingest queues, or job tables without a new architecture decision and a real second implementation.

## 10. Verification Targets

Implementation is architecture-conformant when:

- `resofeed serve` is the single runtime command;
- `resofeed serve` accepts `--addr`, `--public-url`, `--db`, optional `--openrouter-model`, and optional `--owner-token`; it does not require CLI API-key flags in the future runtime contract;
- OpenRouter startup secret resolution follows OS `OPENROUTER_KEY` > local `.env` fallback, rejects empty/whitespace values, and never persists, exports, logs, prints, or commits raw secrets;
- omitting `--owner-token` reuses a stored token or generates, stores, and prints a first-run token;
- one Go process serves static UI, HTTP API, MCP endpoint, and ingest loop;
- no separate `migrate`, `worker`, `doctor`, `admin`, or `sync` process exists;
- OpenRouter is used as the sole LLM backend for summaries and steering translation;
- only SQLite is required for durable state;
- HTTP and MCP mutations produce equivalent state changes;
- MCP Streamable HTTP works from a non-local agent client at `/mcp`;
- FTS search works without embeddings/vector storage;
- state export/import restores sources, steering, and resonance state without a sync server;
- state import replaces portable active state with the validated bundle rather than merging or resolving conflicts;
- duplicate/story grouping preserves every original source item;
- `/doctor` reports RSS/OpenRouter/extraction failures as raw text with an `openrouter:` prefix and never prints keys;
- no folders, tags, settings dashboard, archive flow, notification ownership, or RAG surface appears.

Runnable verification commands after implementation:

```bash
npm --prefix web install
npm --prefix web run build
mkdir -p ./bin
go build -o ./bin/resofeed ./cmd/resofeed
go test ./...
```

First-run token generation check:

Assumes `OPENROUTER_KEY` is already available from the OS environment, service manager, hosting secret, or local non-committed `.env`; do not include API-key values in the command line or captured evidence.

```bash
./bin/resofeed serve --db ./data/test.sqlite3
# expect startup log line: owner token generated: rfeed_...
```

HTTP auth failure/success checks:

```bash
curl -i http://127.0.0.1:8080/api/feed/today
# expect 401 JSON error

curl -i http://127.0.0.1:8080/api/feed/today \
  -H "Authorization: Bearer <OWNER_TOKEN>"
# expect 200 JSON body: {"items":[...]}
```

Diagnostics check:

```bash
curl -i http://127.0.0.1:8080/api/doctor \
  -H "Authorization: Bearer <OWNER_TOKEN>"
# expect 200 text/plain
```

Manual ingest checks:

```bash
curl -i -X POST http://127.0.0.1:8080/api/ingest \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# expect 200 JSON body: {"ingest":{"scope":"all",...}}

curl -i -X POST http://127.0.0.1:8080/api/sources/src_01/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# expect 200 JSON body: {"ingest":{"scope":"source",...},"source":{...}}
```

Manual ingest conflict check:

Run the first command in a separate terminal or against a deliberately slow source to easily reproduce this.

```bash
curl -i -X POST http://127.0.0.1:8080/api/ingest \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'

curl -i -X POST http://127.0.0.1:8080/api/sources/src_01/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# when the first request is still running, expect 409 JSON error:
# {"error":{"code":"conflict","message":"ingest already running",...}}
```

State roundtrip check:

```bash
curl -sS http://127.0.0.1:8080/api/state/export \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -o resofeed-state.json

curl -i -X POST http://127.0.0.1:8080/api/state/import \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data-binary @resofeed-state.json
# expect 200 restore result schema
```

MCP connection check:

```text
Connect an MCP Streamable HTTP client to http://127.0.0.1:8080/mcp
with header Authorization: Bearer <OWNER_TOKEN>.
Read resofeed://system/doctor and expect text/plain diagnostics.
```

## 11. Open Questions

None blocking.

Alignment note: if `docs/DESIGN.md` language implies exporting broad command or signal history, implementation should interpret that as the minimal current-state bundle needed for portability, not as permission to build a general activity ledger.
