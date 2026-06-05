# ResoFeed Architecture Spec

Version: 1.2
Status: Core runtime implemented for the previously documented v2.1 path; Prompting System v2.2/content-contract redesign is the accepted target for generated content fields and re-ingest semantics
Source contracts: `docs/PRD.md`, `docs/DESIGN.md`, `docs/PROMPTING_SYSTEM.md` for prompt compilation, structured-output routing, and OpenRouter summary output schema

Status note: the core runtime, processing-language, reprocess, runtime metadata, FTS, delivery, UI language/split-scroll, Prompting System v2.1 dynamic `json_schema` routing, and MCP prompt/model parity contracts described here were implemented behavior as of the prior documentation sync. `docs/PROMPTING_SYSTEM.md` now defines the v2.2 generated-content contract. Runtime v2.2 compliance depends on emitting `schema_version: "resofeed.summarize.v2.2"`, using the v2.2 payload/output fields, routing structured output according to `docs/PROMPTING_SYSTEM.md`, and validating the v2.2 schema plus Go semantic boundary before persistence. Future changes must keep this file aligned with runtime behavior and clearly distinguish implemented behavior from accepted targets.

## 1. Decisions

Contract baseline: these decisions are anchored in the current product/design documents and user constraints.

1. **One deployable Go process.** ResoFeed is one binary started with `resofeed serve`. It serves the static SvelteKit app, JSON HTTP API, MCP Streamable HTTP at `/mcp`, and background ingestion loop. Rationale: the product is a single-tenant tool, not SaaS infrastructure. Fails if team/multi-tenant scale becomes product scope.
2. **CLI flags are the primary non-secret runtime configuration surface; LLM secrets are runtime inputs.** `serve` accepts flags for bind address, public URL, SQLite path, optional OpenRouter model, and optional owner token. OpenRouter API keys, when present, must be resolved from runtime-only secret sources and must never be passed by CLI flag, persisted, exported, logged, or committed. Normal model-backed processing uses startup/runtime secret configuration; HTTP model listing is the explicit request-time secret-resolution exception so safe env/`.env` changes can be reflected without making secrets durable state. A missing key is allowed as a provider-unavailable runtime state: the server may bind, while model-backed operations are unavailable and model listing returns the safe empty response. Rationale: command-line flags are concrete and inspectable for non-secret configuration, while API keys must not be placed in shell history, process listings, or durable product state. Fails if deployment later requires a full config-file management surface or a centralized secret/config service.
3. **One SQLite database.** SQLite is the durable source of truth; FTS5 is the lexical index. Rationale: local ownership and operational simplicity matter more than distributed scale. Fails if multi-writer distributed deployment becomes required.
4. **Current state only.** Store the present state needed for feed display, search, import/export, agent idempotency, and provenance. Do not build event sourcing, JSONL runtime state, or a user-visible activity ledger. Fails if audit-grade historical reconstruction becomes a hard requirement.
5. **One backend package.** Product behavior lives in `internal/resofeed` as direct functions and SQL, not `app/domain/repository/service` layers. Rationale: there is one runtime and one database. Fails if multiple storage backends or independently deployed services become real requirements.
6. **Thin transports.** HTTP and MCP validate auth/payloads and call the same product operations. Rationale: humans and agents must share Inspect, Resonate, Steer, search, and retrieval semantics. Fails if MCP gets product concepts unavailable to humans.
7. **OpenRouter as the sole LLM backend.** LLM calls use OpenRouter chat completions for summaries and steering translation at `https://openrouter.ai/api/v1/chat/completions`. The model is a request/response JSON transformation and never owns durable state, orchestration, or direct database writes; Go validates every structured output before applying or saving it. Rationale: the user explicitly chose an OpenRouter-only migration while the PRD treats AI as utility infrastructure. Fails if a different provider becomes a product requirement.
8. **Lexical retrieval only.** Search uses SQLite FTS5 and metadata filters. No embeddings, vector DB, built-in RAG, or semantic answer engine. Rationale: explicitly forbidden by product constraints. Fails only by explicit product reversal.
9. **Single owner token with auto-generation and CLI-only offline reset.** Static web assets are public to load, but every `/api/*` route and every `/mcp` request requires one owner token. If `--owner-token` is omitted, ResoFeed reuses a stored token hash or generates a token, stores its hash, and prints the token once on first startup. If the plaintext token is lost and only the hash remains, recovery is impossible; reset is an offline DB command that deletes only the stored hash so the next `serve` startup can generate or accept a replacement. No accounts, OAuth, roles, teams, registration flow, HTTP reset endpoint, MCP reset tool, or Settings/UI reset control. Rationale: single-tenant tool with low-friction first run, clear offline credential recovery, and no ambiguous public API reads. Fails if shared/team use or online credential administration becomes product scope.
10. **Persisted processing language is runtime state, not portable state.** ResoFeed stores one default processing language for the local owner runtime. Supported values are `en` and `zh`; absent metadata defaults to `en` to preserve existing behavior. Rationale: language controls article processing, UI chrome, search text, and MCP output, but it is not part of the strict portable-state bundle. Fails if product scope later requires cross-instance preference sync.
11. **One stored processed language per item.** User-readable item fields are stored in the current processing language rather than as original/translated pairs. Rationale: ResoFeed is an intelligence workbench optimized for summaries, analysis, and search, not a bilingual RSS reader. Trade-off: changing language does not automatically rewrite history; the original article remains available through the original link. Fails if side-by-side original/translation reading becomes a product requirement.
12. **Source identifiers are preservation anchors.** URLs, source titles, source URLs, canonical URLs, and original links remain unchanged by localization. Rationale: users and agents need exact provenance even when readable item content is processed in another language. Fails if source identity itself becomes user-editable display content.
13. **Existing library reprocess is explicit and non-durable.** Changing the default language affects future processing only. A user-triggered one-time reprocess may rewrite existing user-readable item content into the current language and rebuild FTS, but it must not introduce a durable job queue, activity ledger, sync protocol, or settings dashboard. Rationale: explicit migration preserves user control while keeping the one-process architecture. Fails if reprocess must continue across process restarts as a managed background job.
14. **Desktop split scroll is frontend containment, not behavioral state.** The feed and Inspector scroll independently on desktop, while mobile keeps a full-screen Inspector route. Rationale: independent scroll preserves triage context without adding persisted reading-position tracking. Fails if scroll depth becomes a ranking or analytics input, which is out of scope.
15. **Inspector item re-ingest is item-scoped, one-time, and non-durable.** The Inspector may expose a per-article re-ingest action that reprocesses exactly the selected item with an optional request-scoped OpenRouter model override and optional request-scoped extra prompt. The selected model and prompt must not be persisted, exported, reused as defaults, shown as history, or written to item metadata. Rationale: the owner needs a surgical retry/quality repair path without turning ResoFeed into a prompt-management, model-settings, or job-dashboard product. Fails if users require durable per-source/per-item model policies, reusable prompt templates, or multi-provider orchestration.
16. **Generated content uses a structured content contract.** Model-backed item content separates literal provenance (`source_item_title`, source/source URLs, source identifiers) from localized generated display content (`localized_title`, `summary`, `core_insight`, `key_points`, `value_tier`, and model semantic status). `key_points` is a first-class 3-5 item generated field for Inspector rendering, not Markdown embedded in summaries. Rationale: explicit fields remove title-localization ambiguity and give list-shaped user intent a safe schema slot. Fails if a future schema collapses source and localized titles back into one overloaded `title` or renders model-generated lists as raw Markdown.
17. **Re-ingest failures are attempt state, not destructive content state.** Successful re-ingest may atomically replace generated content fields and refresh selected FTS rows; failed provider/decode/schema/semantic attempts update only app-owned attempt diagnostics such as `last_reprocess_*` and must preserve existing valid generated content and `content_status`. Rationale: a failed repair attempt should not degrade a usable item. Trade-off: status modeling is more explicit because current content health and latest attempt outcome are separate. Fails if UI or transport hides current content solely because the latest attempt failed.
18. **Ingest acceleration is source-scoped and bounded.** Manual row fetch, manual all-source ingest, and background ingest share source-scoped in-process leases so unrelated sources may run concurrently while same-source duplicates still fail fast. Large-library speed comes from bounded source concurrency, bounded per-source item processing, and a global LLM concurrency cap, not from durable queues or multi-article prompt batching. Rationale: source identity is the smallest safe coordination unit for feed status/title/item writes, and bounded in-memory concurrency preserves the one-binary architecture. Trade-off: current-operation reporting becomes approximate for multi-source work. Fails if source attempts start mutating unprotected global state.

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
| `--first-fetch-limit` | No | `50` or `RESOFEED_FIRST_FETCH_LIMIT` when the flag is omitted | Maximum items to store on a brand-new source's first fetch; `0` means unlimited; maximum `500`. Incremental fetches after any item exists are uncapped. |

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
- Normal OpenRouter API-key resolution for model-backed processing happens through startup/runtime secret configuration before LLM client use; missing key means no usable LLM client for processing and OpenRouter-backed operations are unavailable, but startup may continue.
- `GET /api/runtime/openrouter-models` and its compatibility route are explicit request-time secret-resolution exceptions: they may re-read OS environment/local `.env` safely for that request so model-list changes can reflect current secret configuration without persisting the secret or its source.
- `OPENROUTER_KEY` is the only accepted OpenRouter API-key name for OS environment and local `.env` sources. CLI-passed API keys are forbidden for OpenRouter.
- Precedence is OS environment variable `OPENROUTER_KEY` first, then local `.env` fallback.
- Explicit empty or whitespace-only secret values from a recognized source are invalid and must fail startup before binding the server socket. If no key is resolved from OS environment or local `.env`, startup continues with OpenRouter unavailable.
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

Startup validation failures exit before binding the server socket and print a terse error to stderr. This applies to invalid `--addr`, invalid `--public-url`, unwritable `--db`, invalid `--first-fetch-limit`/`RESOFEED_FIRST_FETCH_LIMIT`, explicit empty/whitespace OpenRouter API key values, invalid `--owner-token`, and failed SQLite migrations. A missing OpenRouter key is not startup-fatal; it is reported as provider unavailable after binding.

Startup validation matrix:

| Input | Invalid when | Exit code | Stderr code/message | Binds socket? |
|---|---|---:|---|---|
| `--addr` | not `HOST:PORT`, missing host/port, port outside `1..65535` | `2` | `err: invalid_addr: expected HOST:PORT` | No |
| `--public-url` | not absolute `http`/`https`, missing host, has query/fragment, path not empty or `/` | `2` | `err: invalid_public_url: expected absolute http(s) URL without path/query/fragment` | No |
| omitted `--public-url` | N/A | N/A | derive from `--addr`; `0.0.0.0:PORT` derives to `http://127.0.0.1:PORT`; remove trailing slash | N/A |
| `--db` | parent directory cannot be created, path cannot be opened as SQLite | `2` | `err: invalid_db: cannot open sqlite database` | No |
| `--first-fetch-limit` / `RESOFEED_FIRST_FETCH_LIMIT` | non-integer, negative, or greater than `500`; flag value takes precedence over environment fallback | `2` | `err: invalid_first_fetch_limit: expected integer 0..500` | No |
| explicit OpenRouter API key value | empty or all whitespace after applying OS environment `OPENROUTER_KEY` > `.env` fallback precedence | `2` | `err: invalid_openrouter_key: value required` | No |
| missing OpenRouter API key | no usable `OPENROUTER_KEY` in OS environment or local `.env` | N/A | startup continues; runtime reports `openrouter-key: unavailable` and provider-backed operations are unavailable | Yes |
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
| Runtime metadata | `runtime_metadata` | No | Stores owner-token hash, local processing language, and optional runtime diagnostics; LLM API keys and secret-source metadata are runtime inputs and must not be stored. |
| Current operation snapshot | process memory (`currentOperationSnapshot` behind the ingest/reprocess guard) | No | Best-effort description of the guarded operation currently running in this Go process; cleared when the guard releases. |
| Generated item content | `items` generated-content columns | No by default | Current validated localized content contract for display/search; source provenance remains separate from generated display fields. |
| Last reprocess attempt | app-owned `last_reprocess_*` diagnostics on the affected item/result surface | No | Latest attempt outcome is operational diagnostics and must not overwrite valid current generated content after a failed attempt. |
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
- coordinate background ingest, all-source manual ingest, and per-source manual fetch through one in-process source-scoped concurrency coordinator owned by `ingest.go` or a small adjacent `ingest_coordinator.go` in `internal/resofeed`;
- treat source id as the normal ingest/fetch lock scope: the same source id must not be fetched/ingested twice at the same time, while different source ids may run concurrently within bounded in-memory limits;
- make `POST /api/ingest` and background ingest bounded in-request batches of source-scoped attempts rather than one global fetch lock; already-busy sources are skipped/reported, selected idle sources are drained through bounded workers, externally capacity-unavailable starts are skipped/reported, and no delayed work is persisted after the response/tick;
- keep true global operations such as processing-language writes, library reprocess, short unrepresented state import/restore, and currently-global item re-ingest mutually exclusive with active source leases;
- reject HTTP manual triggers with `409 conflict` when their requested source or global scope conflicts with an already-running operation; background ticks skip conflicting sources instead of waiting or queueing;
- expose current operation state as in-memory `CurrentOperationInfo`/source-fetch status for contextual UI/MCP conflict explanation only; for multi-source work it may be aggregate/best-effort and is not persisted; it is cleared when the relevant operation scope finishes or releases;
- do not persist ingest work as a queue, job table, command ledger, activity log, or portable receipt;
- use no event bus, plugin registry, DI container, service discovery, or repository interface layer.

### 3.4 Shared Types Rule

Shared structs belong in `types.go` only when used across HTTP, MCP, storage, ingestion, or frontend response boundaries. Expected shared structs: `Source`, `Item`, `ItemState`, `SteerRule`, and canonical fallback/status values. Keep helper functions file-local until repeated real use justifies moving them.

### 3.5 Architecture Basis: Processing Language and Split-Scroll Delta

This basis is authoritative for planning the persisted language, target-language storage/search, MCP parity, one-time reprocess, and desktop split-scroll change.

```yaml
architecture_basis:
  system_layers:
    - layer: browser_spa
      responsibility: "Render localized chrome, expose language/reprocess controls, keep desktop feed and Inspector as independent scroll regions."
    - layer: http_api
      responsibility: "Authenticate owner token, expose language/reprocess contracts, and return canonical target-language item/search/detail JSON."
    - layer: mcp_surface
      responsibility: "Expose the same item/search/detail language behavior and equivalent language/reprocess operations to authorized agents."
    - layer: resofeed_core
      responsibility: "Own processing-language semantics, ingestion/reprocess orchestration, OpenRouter prompt inputs, validation, and item/FTS writes."
    - layer: sqlite
      responsibility: "Persist runtime language metadata, canonical target-language item rows, provenance identifiers, and rebuildable FTS5 index."
    - layer: openrouter
      responsibility: "Pure JSON transformer that receives target_language and returns validated structured item understanding."
  source_of_truth_matrix:
    default_processing_language: "runtime_metadata.processing_language; supported values en|zh; absent means en; excluded from state export/import."
    target_language_item_text: "items.title, items.summary, items.core_insight, items.feed_excerpt, items.extracted_text; each stores the only user-readable processed version."
    source_identifiers: "sources.url/title and item url/source_url/canonical_url/original_url; preserved unchanged and never localized destructively."
    searchable_text: "search_fts; rebuildable from current target-language item rows plus preserved provenance identifiers."
    ui_language: "frontend derives from authenticated runtime language API; html lang and chrome copy follow it."
    mcp_language: "MCP resources/tools read the same persisted processing language; no per-call language override in this contract."
    mcp_source_listing: "MCP source resources/listings expose the same canonical source title as HTTP. Manual ingest/fetch triggers are not MCP tools in this plan."
  service_catalog:
    language_read: "Authenticated read of current processing language."
    language_set: "Authenticated update of processing_language; affects future processing only."
    ingest_process_item: "Fetch/extract/source fallback then call OpenRouter with target_language and persist target-language item fields."
    reprocess_existing_library: "Explicit operation that reprocesses existing item readable fields into current language and rebuilds FTS."
    search: "Lexical FTS over currently stored target-language content."
    split_scroll_ui: "Frontend-only layout containment; no persisted reading-position state."
  runtime_contract:
    language_change: "Persists new processing language and updates UI/MCP output language for chrome/contracts; does not rewrite existing item rows."
    future_ingest: "Newly processed items use the current processing language."
    reprocess: "Only explicit user/authorized-agent action rewrites existing user-readable item fields; completion rebuilds FTS."
    failure_semantics: "Existing model/extraction status values remain authoritative; no translation_failed status is introduced."
    concurrency: "Reprocess must not run concurrently with active source-scoped ingest/fetch attempts or another global-exclusive operation and must not create durable jobs or queues."
  state_strata:
    portable_state: "Only active sources, active steering rules, and currently resonated items. Processing language remains excluded."
    runtime_metadata: "owner token hash, processing_language, and optional search_fts_stale_since diagnostic marker."
    derived_state: "search_fts and localized UI dictionaries; rebuildable or static."
    item_cache: "target-language readable item fields plus preserved provenance identifiers."
  transport_boundary_rules:
    http: "HTTP exposes language read/set and reprocess endpoints with strict body/query validation and owner-token auth."
    mcp: "MCP exposes equivalent language/reprocess operations and returns item/search/detail content in the persisted default language."
    frontend: "Frontend never sends arbitrary per-item language overrides; it changes the single runtime processing language."
    openrouter: "OpenRouter receives target_language as input; Go validates returned JSON before persistence."
  cross_cutting_governance:
    registries:
      - name: "runtime_metadata"
        owner_module: "internal/resofeed runtime/db code"
        write_policy: "only authenticated language-set and startup/runtime metadata paths write supported keys"
    lifecycle_ordering:
      - "Startup runs migrations before reading processing_language."
      - "Frontend loads owner token, then reads processing_language before rendering localized chrome that depends on API state."
      - "Reprocess acquires the global-exclusive guard before item rewrites and FTS rebuild; source-scoped ingest/fetch attempts use source leases instead of the global-exclusive path."
    coordination_mechanisms:
      - "Source-scoped in-process leases for ingest/fetch attempts plus a separate global-exclusive guard for language writes, library reprocess, state import/restore, and intentionally-global item re-ingest."
      - "SQLite transactions for language metadata writes and FTS rebuild consistency."
    wiring_strategy: "Explicit function calls inside internal/resofeed; no DI container, event bus, sidecar worker, or scheduler service."
    governance_owner: "internal/resofeed owns runtime language and reprocess; web owns presentation/scroll containment."
  shared_abstractions:
    shared_types:
      - name: "ProcessingLanguage"
        owner_module: "internal/resofeed/types.go or adjacent flat file"
        consumers: ["ingest", "http", "mcp", "doctor", "frontend api-contract"]
        rationale: "Appears in HTTP, MCP, OpenRouter input, and UI contracts; a shared enum prevents zh/en drift."
      - name: "ReprocessLibraryResult"
        owner_module: "internal/resofeed/types.go or adjacent flat file"
        consumers: ["http", "mcp", "doctor/frontend"]
        rationale: "HTTP and MCP must expose the same reprocess completion counts and failure summary."
    shared_protocols: "N/A: existing LLMClient interface remains the boundary; it is extended with target-language input rather than replaced."
    shared_utilities: "N/A: keep flat package helpers local until 3+ concrete consumers justify extraction."
    decision: "Share only language/result contracts crossing HTTP/MCP/LLM/frontend boundaries; keep layout scrolling and UI dictionaries frontend-local."
  module_split_recommendations:
    - module: "internal/resofeed runtime language functions"
      owner: "internal/resofeed"
      reason_to_change: "language persistence and validation"
      dependency_direction: "http/mcp/ingest depend on language functions; language functions do not depend on transports"
    - module: "internal/resofeed ingest/reprocess functions"
      owner: "internal/resofeed"
      reason_to_change: "item processing and FTS rebuild semantics"
      dependency_direction: "http/mcp call operations; operations call DB/LLM"
    - module: "web localization and split-scroll surfaces"
      owner: "web"
      reason_to_change: "UI copy, accessibility language, scroll containment"
      dependency_direction: "web consumes HTTP API; web does not own processing truth"
  ux_surfaces:
    - surface: "Desktop shell"
      scope: "independent feed/Inspector scroll, no coupled global page scroll"
    - surface: "Language control"
      scope: "terse LANG control inside opened RESOFEED SYSTEM menu, optional /doctor raw echo, no persistent chrome or settings dashboard"
    - surface: "Reprocess action"
      scope: "bracket-style explicit operation with warning, no progress dashboard"
    - surface: "MCP item/search/detail outputs"
      scope: "agent-facing language parity with HTTP/UI"
  open_questions:
    blocking: []
    non_blocking:
      - "Chinese locale for html lang defaults to zh-CN unless UIUX decides a narrower locale."
  readiness: READY
```


### 3.6 Architecture Basis: Inspector Item Re-ingest Delta

This basis is authoritative for planning the Inspector item re-ingest change. It is intentionally additive to the existing single-process architecture and does not authorize new services, persistent queues, provider abstractions, settings dashboards, or durable prompt/model state.

```yaml
architecture_basis:
  system_layers:
    browser_ui:
      owner: web/
      responsibility: Inspector controls, model-list presentation, extra-prompt entry, source-text disclosure, and refreshed current-item rendering.
    http_transport:
      owner: internal/resofeed/http.go
      responsibility: owner-token auth, strict JSON/query validation, idempotency, conflict serialization, and response shape for item re-ingest and OpenRouter model list.
    mcp_transport:
      owner: internal/resofeed/mcp.go
      responsibility: implemented parity tool/resource exposure for selected-item re-ingest and OpenRouter model listing when runtime DTO/config wiring supports the same HTTP product contract; MCP OpenRouter model listing uses the same provider-backed request-time model-list operation as HTTP and remains non-durable.
    application_core:
      owner: internal/resofeed/reprocess.go plus existing ingest helpers
      responsibility: item-scoped reprocess orchestration, source-text precedence, prompt/model request construction, result classification, and per-item FTS refresh.
    llm_boundary:
      owner: internal/resofeed/openrouter.go
      responsibility: OpenRouter chat-completions JSON transform, temporary model override, model-list fetch, failure classification, and no durable state writes.
    persistence:
      owner: SQLite via internal/resofeed/*
      responsibility: final item readable fields, provenance fields, item_state, search_fts, and transient idempotency receipts only.
  source_of_truth_matrix:
    item_readable_fields: SQLite items row for the selected item.
    provenance_identifiers: existing items/sources URL/title/canonical fields; never rewritten by model or UI chrome.
    search_index: search_fts row for the selected item, refreshed in the same successful item update path.
    processing_language: runtime_metadata.processing_language; global runtime state only.
    temporary_model_override: request body only; not a source of truth and not persisted.
    temporary_extra_prompt: request body only; not a source of truth and not persisted.
    provider_model_list: live OpenRouter response shaped as { models: [{ id, name }] }; no cache in the first implementation, never portable state.
    operation_status: process-local current-operation snapshot; not a durable job record.
    idempotency: agent_receipts live TTL snapshot for mutation replay only; not portable state.
  service_catalog:
    go_binary:
      deployable: cmd/resofeed
      surfaces: static UI, JSON HTTP, MCP Streamable HTTP, background ingest loop.
    sqlite:
      role: durable item/source/state/FTS store.
    openrouter:
      role: sole external model provider and JSON transformer.
    browser:
      role: authenticated owner UI; no independent durable state beyond owner token.
  runtime_contract:
    allowed_dependencies:
      - Go standard library and existing project dependencies
      - SQLite/FTS5
      - SvelteKit/static frontend stack already in web/
      - OpenRouter HTTP API
    forbidden_dependencies:
      - vector databases
      - embeddings/RAG frameworks
      - provider abstraction frameworks
      - job queues or sidecar workers
      - UI component libraries unless DESIGN.md changes explicitly
    operations:
      - GET /api/runtime/openrouter-models lists selectable OpenRouter model ids as { models: [{ id, name }] } without persisting them; GET /api/runtime/openrouter/models remains a compatibility path.
      - POST /api/items/{id}/reingest reprocesses exactly one selected item with optional request-scoped model and prompt.
      - MCP parity exposes equivalent agent-accessible product operations only if the HTTP operation is exposed to humans and the runtime DTO/config wiring has been verified for that operation.
    item_reingest_response_shape: "{ already_applied: boolean, reingest: { item_id, status, language, item_updated, fts_updated, error, item: ItemDetail|null } } is canonical across HTTP, MCP, and frontend tests."
    stable_openrouter_summary_schema: "OpenRouter output for the v2.2 content contract is localized_title, summary, core_insight, key_points, value_tier, and model_status; source_item_title is app/source-owned provenance, not model output. docs/PROMPTING_SYSTEM.md is canonical for prompt/schema details."
  state_strata:
    durable_product_state:
      - sources
      - items readable fields and provenance fields
      - item_state
      - steer_rules
      - search_fts
      - runtime_metadata.processing_language
    transient_runtime_state:
      - ingest/reprocess guard
      - current-operation snapshot
      - live idempotency receipts
      - live OpenRouter model-list response data during request handling only
    request_only_state:
      - item re-ingest model override
      - item re-ingest extra prompt
    forbidden_state:
      - saved per-item/per-source model preferences
      - saved prompt templates
      - operation history
      - model-list export/import
      - provider credentials in SQLite/UI responses
  transport_boundary_rules:
    http:
      - All /api/* routes require owner-token auth.
      - Unknown JSON fields and query parameters are rejected where the contract says no query params.
      - Model and prompt override fields are accepted only on item re-ingest request bodies.
      - Provider raw payloads, API keys, secret sources, and .env paths never cross the transport boundary.
    mcp:
      - MCP mutations require owner-token authority, actor_id, and idempotency_key.
      - MCP tools do not get product concepts unavailable to humans.
      - MCP conflict/error data mirrors canonical HTTP shapes.
      - MCP `list_openrouter_models` uses the same request-time provider-backed model-list operation as HTTP after runtime OpenRouter secret resolution.
    ui:
      - Inspector is the only human UI surface for item re-ingest.
      - Source Ledger remains source-level ingest/fetch only.
  cross_cutting_governance:
    registries:
      - name: operation_guard
        owner_module: internal/resofeed/ingest.go or adjacent ingest_coordinator.go
        write_policy: process-local source leases for background/manual ingest and source fetch; process-local global-exclusive guard only for language writes, library reprocess, state import/restore, and item re-ingest.
      - name: idempotency_receipts
        owner_module: internal/resofeed/idempotency path
        write_policy: live TTL mutation receipts only; not portable state.
    lifecycle_ordering:
      - item re-ingest acquires the global-exclusive guard before source fetch/model call/write.
      - provider model listing is read-only and does not acquire source leases or the global-exclusive guard.
      - item update and per-item FTS refresh commit together; no final library-wide FTS rebuild is required.
    coordination_mechanisms:
      - explicit function calls inside internal/resofeed
      - process-local guard/current-operation snapshot
      - SQLite transaction boundaries
    wiring_strategy:
      - http.go/mcp.go validate and call application functions directly.
      - OpenRouter-specific model listing and temporary model override stay in openrouter.go.
      - No DI container, event bus, plugin registry, sidecar worker, or provider registry.
    governance_owner: internal/resofeed owns runtime coordination; docs/ARCHITECTURE.md owns boundary decisions.
  shared_abstractions:
    shared_types:
      - name: ReprocessErrorCode
        owner_module: internal/resofeed/processing_language_contract.go
        consumers: [reprocess.go, http.go, mcp.go, frontend API contract]
        rationale: item re-ingest must reuse the existing safe diagnostic taxonomy rather than inventing UI-only statuses.
      - name: CurrentOperationInfo
        owner_module: internal/resofeed/current-operation contract
        consumers: [http.go, mcp.go, frontend Inspector conflict UI]
        rationale: conflicts must expose the same process-local operation fact across HTTP, MCP, and UI.
      - name: ItemDetail
        owner_module: internal/resofeed/types.go and frontend API contract mirror
        consumers: [GET /api/items/{id}, item re-ingest response, MCP read_item, Inspector]
        rationale: successful item re-ingest refreshes the current item through the existing detail contract.
    shared_protocols:
      - name: OpenRouterModelListing
        owner_module: internal/resofeed/openrouter.go
        consumers: [http.go, mcp.go, frontend model selector]
        rationale: model listing is the existing OpenRouter { models: [{ id, name }] } capability, not a generic provider abstraction.
      - name: ItemReingestOperation
        owner_module: internal/resofeed/reprocess.go
        consumers: [http.go, mcp.go]
        rationale: HTTP and MCP must share one product operation instead of duplicating item reprocess behavior.
    shared_utilities:
      - name: source_text_precedence
        owner_module: internal/resofeed/reprocess.go
        consumers: [library reprocess, item re-ingest]
        rationale: single-item re-ingest must preserve the already-approved fresh-fetch then stored-text fallback rules.
    decision: share only contracts that appear across HTTP, MCP, frontend, and item/library reprocess; keep UI state and prompt/model request values module-local and request-scoped.
  module_split_recommendations:
    - module: internal/resofeed/openrouter.go
      owner: OpenRouter transport and model listing
      reason_not_merged: external provider HTTP details and secret handling must remain isolated from item persistence.
    - module: internal/resofeed/reprocess.go
      owner: item/library reprocess application logic
      reason_not_merged: source-text precedence, model-call orchestration, and per-item FTS write logic are product operations, not HTTP serialization.
    - module: internal/resofeed/http.go
      owner: HTTP contracts
      reason_not_merged: route validation/idempotency/error mapping should not own reprocess internals.
    - module: internal/resofeed/mcp.go
      owner: MCP parity
      reason_not_merged: agent transport schema differs from HTTP but must call the same application operation.
    - module: web/src routes/lib
      owner: Inspector UI and typed API client contracts
      reason_not_merged: browser interaction state and accessibility belong to frontend only.
  ux_surfaces:
    - surface: Inspector controls
      scope: bracket action placement, model selector, extra prompt field, inline state text, focus behavior.
    - surface: Source text disclosure
      scope: collapsed-by-default source text/evidence with accessible expansion.
    - surface: HTTP/MCP API errors
      scope: terse stable diagnostics and conflict detail shapes.
  open_questions: []
  readiness: READY
```

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

Title semantics:

- `sources.title` is the canonical Source Ledger display name;
- before a source has been successfully fetched, `title` may be an OPML/import title or URL-derived fallback;
- after a successful RSS/Atom fetch, if the feed exposes a non-empty feed title, `sources.title` must be updated to that feed title and `revision` must be incremented;
- no `feed_title` storage column, HTTP/MCP response field, UI label, compatibility alias, or client fallback is allowed in this scope; any future dual-title feature must create a new authoritative contract before introducing one.

Invariants:

- OPML folders are discarded on import;
- deleted sources do not appear in the Source Ledger;
- one source failure does not block other sources;
- source display title changes are local source-row mutations, not portable reading history or activity records.

### 4.2 `items`

Purpose: canonical content cache and provenance.

Required fields:

- stable text `id`;
- `source_id`;
- original URL and normalized/canonical URL when available;
- literal source item title/provenance and localized generated display title as separate concepts; compatibility surfaces may still expose `title`, but architecture must preserve the split between source provenance and localized display output;
- persisted model-generated target-language generated fields when available, including summary, exactly-one-sentence core insight, and structured 3-5 item `key_points` for Inspector rendering;
- quality/value tier or equivalent priority category;
- current generated content status separate from latest reprocess attempt diagnostics;
- published and first-seen timestamps;
- extraction/model fallback status;
- story grouping key and direct-duplicate pointer when known.

Invariants:

- original item provenance remains accessible when grouped;
- source item title/provenance is never localized or rewritten by the LLM;
- `key_points` is stored and transported as a structured array, not raw Markdown;
- failed item re-ingest attempts preserve existing generated content and update only attempt diagnostics;
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
- request fingerprint for mutating operations that accept request bodies;
- optional item id;
- creation timestamp;
- compact result snapshot.

Invariants:

- `idempotency_key` uniqueness is enforced among live receipts across receipt-backed HTTP and MCP mutating operations;
- a live receipt is one whose row exists and whose `created_at + 24h` has not elapsed;
- before accepting a reused key after TTL expiration, the implementation must transactionally ignore, delete, or replace the expired receipt row;
- expired rows must not cause `request_fingerprint_mismatch` or uniqueness failure;
- for receipt-backed mutating operations that accept request bodies, `request_fingerprint` is required and is computed from the validated operation request so same-key retries can distinguish replay from caller error;
- while a live receipt exists, the same `idempotency_key` with the same `request_fingerprint` returns the stored result snapshot with `already_applied: true` where the response shape includes that field;
- while a live receipt exists, the same `idempotency_key` with a different `request_fingerprint` returns HTTP `400 bad_request` or the MCP schema/request-error equivalent;
- after TTL expiration or crash-loss of the receipt row, the same key may be accepted as a fresh operation if the request is otherwise valid and operation guards allow it;
- this table is not rendered as an activity feed;
- receipts exist only to prevent duplicate external surfacing and satisfy agent provenance requirements; they are not a durable job ledger, command history, activity ledger, or portable state.

### 4.6 `search_fts`

Purpose: derived lexical index.

Indexed content:

- item title;
- source title/name;
- feed excerpt;
- summary;
- model-generated target-language representative `extracted_text`;
- core insight;
- provenance fields useful for verification.

`search_fts` must include the current localized display title, source item/source title provenance, `items.feed_excerpt` or compatibility excerpt text where still exposed, `items.summary`, `items.extracted_text` or compatibility detail text where still exposed, `items.core_insight`, structured `key_points` flattened only for indexing, and provenance identifiers useful for verification. `value_tier` is filterable/searchable through ordinary SQL metadata matching when needed; it is not required to be copied into the FTS table.

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

Recognized keys and presence rules:

| Key | Value format | Export/import? | Purpose |
|---|---|---:|---|
| `owner_token_sha256` | lowercase hex SHA-256 digest | No | Verifies `Authorization: Bearer <OWNER_TOKEN>` without storing the plaintext token. |
| `processing_language` | string enum: `en` or `zh` | No | Default language for future item processing, UI chrome, search text, and MCP output. If missing, the effective language is `en`; implementation may persist `en` on first authenticated read or first write. |
| `search_fts_stale_since` | RFC3339 UTC string | No | Optional diagnostic key. Present only while FTS is stale after reprocess begins or fails before final rebuild; cleared after successful FTS rebuild. Exposed in `/doctor` diagnostics. |

`runtime_metadata` must never be included in state export/import. `processing_language` is runtime-local even when persisted, and `search_fts_stale_since` is a diagnostic marker rather than portable state.

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

### 4.8 Processing Language, Localized Item Text, and FTS

Processing language and FTS status are runtime metadata:

| Key | Value format | Export/import? | Purpose |
|---|---|---:|---|
| `processing_language` | string enum: `en` or `zh` | No | Default language for future item processing, UI chrome, search text, and MCP output. If missing, effective language is `en`; implementation may persist `en` on first authenticated read or first write. |
| `search_fts_stale_since` | RFC3339 UTC string | No | Optional diagnostic marker present only while FTS is stale after reprocess begins or fails before rebuild completion; cleared after successful rebuild and exposed in `/doctor`. |

Localized item storage contract:

- `items.title`, `items.summary`, `items.core_insight`, `items.feed_excerpt`, and `items.extracted_text` are user-readable processed text fields in the active processing language at the time of item processing or explicit reprocess;
- ResoFeed stores only one processed language version per item and does not store original/translated pairs;
- original item access remains available through `url` / `provenance.original_url`;
- source identifiers are not localized destructively: `sources.title`, source URL, item URL, canonical URL, original URL, and source provenance identifiers remain exact provenance anchors;
- changing `processing_language` does not rewrite existing item rows.

FTS contract:

- `search_fts` indexes the currently stored target-language item text (`title`, `feed_excerpt`, `summary`, `extracted_text`, `core_insight`), source title, and preserved provenance identifiers;
- `value_tier` may be matched through ordinary SQL metadata/LIKE behavior where exposed, but is not required to be part of FTS;
- one-time library reprocess must rebuild or fully refresh FTS after rewriting item text;
- state import may rebuild FTS as already allowed by the state portability contract, but processing language itself remains excluded from state bundles;
- no vector, embedding, semantic-answer, or dual-language index is introduced.
## 5. Operation Contracts

### 5.1 Ingestion

Responsibilities:

- fetch active sources independently;
- parse RSS/Atom feed metadata and entries;
- update `sources.title` from the parsed feed title after successful fetch when the feed title is non-empty;
- upsert item cache rows;
- extract article content when possible;
- request OpenRouter summary/metadata only after source text or fallback text exists;
- validate OpenRouter response JSON before saving;
- update diagnostic fields for failures.

Extraction semantics:

- article extraction is best-effort and remains inside the single Go runtime;
- extraction first selects readable source text from semantic HTML containers in this order: `<article>`, `itemprop="articleBody"`, `<main>`, common content containers such as `article-body`, `article-content`, `post-content`, `entry-content`, `story-body`, and `content-body`, then `<body>` as fallback;
- HTML block boundaries must be preserved before readable-text sanitation so one boilerplate paragraph does not discard valid article paragraphs;
- navigation, headers, footers, sidebars, forms, scripts, styles, JSON-LD metadata, diagnostic-token residue, and known readable boilerplate are removed before model processing or RSS/source fallback use;
- `extraction_status='full'` means linked-article source acquisition and model processing had non-empty cleaned article evidence available; it does not require raw cleaned article text to be persisted in `items.extracted_text`;
- if linked-article extraction fails but RSS text exists, the item remains visible with `extraction_status='partial_extraction'` and source text understood as RSS excerpt text.

Runtime limits:

- background ingest interval default: 15 minutes;
- source fetch timeout: 20 seconds per source, including per-source manual fetches;
- OpenRouter request timeout: 45 seconds;
- OpenRouter retry policy: at most one retry for network/429/5xx failures;
- failed OpenRouter responses must not block item visibility;
- source-level parallelism must be bounded inside the process; implementations must not spawn unbounded goroutines or create external workers;
- fast-mode default limits are source concurrency `8`, per-source item concurrency `4`, and global LLM concurrency `16` unless implementation evidence forces lower safe defaults;
- source concurrency capacity is fail-fast for external contention, not a durable queue: a manual source fetch that cannot obtain a source-capacity slot returns `409 conflict` with reason `source_capacity_exhausted`; all-source manual/background ingest drains selected idle sources through bounded in-request workers, so `source_capacity_exhausted` applies only to sources blocked by external active source work, not to idle sources waiting behind the same run's own worker limit.

Concurrency semantics:

- normal ingest/fetch coordination is source-scoped: a source id may have only one active source attempt at a time;
- manual per-source fetches may overlap only when their source ids differ;
- a second `POST /api/sources/{id}/fetch` for the same source while that source is already fetching/ingesting must return `409 conflict` and must not enqueue, persist, or retry the duplicate request;
- `POST /api/ingest` may overlap unrelated in-flight source fetches; it skips already-busy sources, drains every selected idle active source through bounded in-request workers, reports externally capacity-unavailable sources as skipped source-level conflicts, and never persists work after the response;
- background ingest ticks skip already-busy sources, drain every selected idle active source through bounded in-request workers, report externally capacity-unavailable sources as skipped source-level conflicts, and never persist work after the tick returns;
- true global operations such as processing-language writes, library reprocess, short unrepresented state import/restore, and currently-global item re-ingest remain mutually exclusive with active source work and with each other;
- persistent queues, job tables, command-history rows, ingest ledgers, durable progress records, and cross-process schedulers are forbidden.

Failure contract:

- feed failure affects only that source;
- per-source manual fetch failure returns a request-level error result for that source and also updates source diagnostics where applicable;
- global manual ingest may complete with source-level failures; source failures are reported in the response summary rather than aborting successful sources;
- extraction failure maps to `partial_extraction` or `original_unavailable` where appropriate;
- OpenRouter/model failure maps to a safe stable status/diagnostic code. Timeouts remain `model_latency_error`/`timeout` where the existing surface requires it, but invalid model/provider responses, provider errors, rate limits, and decode/validation failures must not all collapse to `model_latency_error`; implementations must expose a constrained code such as `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, or `timeout` through item status, reprocess errors, and/or `/doctor` diagnostics without leaking raw provider payloads, API keys, secret source metadata, `.env` paths, owner tokens, or raw runtime provider configuration;
- extraction status and model status are separate: an item may have model-backed summary metadata while source text is only an RSS excerpt;
- timeout of the 20-second source fetch limit maps to an RSS/source fetch diagnostic and leaves no persistent pending job;
- no failure path creates an elaborate UI degradation mode.

#### 5.1.1 Prompting System v2.2

Prompting is part of the ingestion contract because the LLM is a bounded JSON transformer, not an orchestrator, state holder, validator, or database writer. The canonical prompting contract is now maintained in [`docs/PROMPTING_SYSTEM.md`](PROMPTING_SYSTEM.md).

Architecture-level binding summary:

- use a short system prompt plus a versioned JSON user payload;
- compile prompts through a single prompt compiler contract rather than ad hoc string assembly;
- prefer OpenRouter native `json_schema` structured outputs with strict schema when Go determines before the summarization call that the selected model/provider supports it;
- fall back to `json_object` plus the same Go validation when schema support is unknown, unavailable, or the support check fails; do not silently switch the selected model solely to gain schema support;
- keep Inspector one-time prompts above durable steering/default style, but below schema, source grounding, target language, safety, and source-identifier preservation;
- field-scope Inspector one-time prompts and active Steer effects: they may affect emphasis, source-backed fact selection, `summary`, `core_insight` angle, `key_points` focus/order, and value judgment, but must not alter schema, status values, provenance fields, target language, or `core_insight` shape;
- keep top input global-only; per-item one-time prompting belongs only to the selected Inspector re-ingest control;
- treat RSS-agent density alignment as prompt guidance only, except for the explicit v2.2 content-contract schema fields maintained in `docs/PROMPTING_SYSTEM.md`;
- keep runtime/provider errors, persistence decisions, validation, and retry policy owned by Go.

Implementers must read `docs/PROMPTING_SYSTEM.md` before changing OpenRouter prompt compilation, summary output fields, source-text normalization, one-time prompt behavior, structured-output routing, or prompt-related regression fixtures.

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
### 5.6 Processing Language and Existing Library Reprocess

Processing language responsibilities:

- maintain one persisted default processing language for the local runtime;
- support exactly `en` and `zh` in the current contract;
- pass the current language into item understanding/summary prompts as target-language instruction;
- validate OpenRouter JSON as before; language does not create a second translation pipeline;
- keep existing extraction/model failure semantics (`summary_unavailable`, `model_latency_error`, `original_unavailable`, etc.) and do not introduce `translation_failed`.

Language change behavior:

- setting a new processing language persists the runtime setting and affects future ingestion/reprocess only;
- existing item rows and FTS are not automatically rewritten when language changes;
- language mutation uses the same process-local global-exclusive check/write so it cannot begin while any source-scoped ingest/fetch attempt or global-exclusive operation is running;
- language mutation does not publish its own `CurrentOperationInfo.kind`, does not appear as `language_mutation`, and does not create a long-running current-operation snapshot; requests racing with the short language write serialize on the lock and then observe either the persisted language or a representable running operation;
- UI chrome and MCP language metadata may reflect the new language immediately, but item text remains whatever is stored until future ingest or explicit reprocess updates it.

Existing library reprocess behavior:

- reprocess is explicit and owner-authorized;
- it rewrites existing user-readable item fields into the current processing language where source text is available;
- it preserves source identifiers exactly;
- it rebuilds or fully refreshes FTS after item text rewrites;
- it returns terse counts for attempted, updated, failed/unavailable, and indexed items, where `items_updated` counts successful target-language rewrites only;
- it must not create durable job rows, queues, sync state, command history, activity ledgers, retry dashboards, or settings panels;
- it must not run concurrently with any source-scoped ingest/fetch attempt or another global-exclusive operation.

Failure contract:

- per-item OpenRouter or extraction failures use the same status taxonomy as ingestion. Invalid model/provider, provider error, rate-limit, decode/validation, and timeout failures must remain distinguishable through a safe stable status/diagnostic path such as `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, and `timeout`, rather than collapsing every non-timeout provider/model/decode failure to `model_latency_error`;
- per-item failures are returned as HTTP `200` with `reprocess.status` of `completed_with_errors` or `completed` according to the result counts;
- if a fresh fetch succeeds but OpenRouter fails, all of the item's processed readable fields (`summary`, `core_insight`, `extracted_text`, `feed_excerpt`) must be set to `null` because they cannot be reliably provided in the target language. To satisfy the non-null `title` schema requirement without mixing languages, `title` must fall back to the URL or a generic 'Untitled' label. Old prior-language fields are fully overwritten;
- failure to process one item must not destroy that item's existing provenance identifiers;
- if reprocess partially succeeds, FTS must still reflect the final stored item rows after the operation's completion path;
- operation timeout returns HTTP `200` with `reprocess.status: "failed"`, `fts_rebuilt: false`, and a global error with `code: "timeout"`, unless the server cannot serialize a response;
- fatal SQLite or invariant errors before result construction return HTTP `500 internal`;
- raw diagnostics belong in `/doctor`, not a new reprocess dashboard.

Existing library reprocess transaction and recovery contract:

- the reprocess operation processes items in batches;
- each item's processing is its own SQLite transaction that updates `title`, `summary`, `core_insight`, `feed_excerpt`, and `extracted_text`;
- the operation timeout is 10 minutes. If the HTTP/MCP client disconnects before completion, processing continues until completed, timed out, or crashed;
- if the process crashes, encounters an unrecoverable SQLite error, or times out mid-run, already-committed item transactions remain stored in the new processing language;
- FTS rebuild runs in one transaction at the end of the operation;
- if the operation fails before FTS rebuild succeeds, the system does not automatically recover on startup; the user must trigger the reprocess operation again to process remaining items and rebuild FTS. During this stale interim period or during an active reprocess operation, search queries (`GET /api/search` and MCP `search_items`) continue to execute but may return a mix of languages based on the outdated FTS rows. The stale FTS state must be exposed as a clear diagnostic status in `/doctor`;
- if the server returns a fatal reprocess result, `items_attempted` counts only items whose processing began; unvisited items are not attempted. When the final FTS rebuild does not complete, `fts_rebuilt` is `false`, and `items_indexed` is the number of rows indexed in the successful final rebuild transaction, usually `0`. A crash may produce no HTTP/MCP response; recovery visibility is only the `/doctor` stale FTS diagnostic.
- unavailable items whose processed readable fields are cleared and whose title falls back to a URL or generic label count in `items_unavailable`, not `items_updated`; `items_attempted` must equal `items_updated` + `items_unavailable` + `items_failed`.

Reprocess input source precedence:

- reprocess must not use existing stored target-language interpretation fields (`title`, `summary`, `core_insight`) as source text to avoid double-translation;
- reprocess input must fetch fresh source text using canonical storage fields first, in exact order of precedence: `items.canonical_url` if present and valid HTTP/HTTPS, then `items.url` (exposed publicly as both top-level `url` and `provenance.original_url`) if valid HTTP/HTTPS. If a fetch fails (e.g., timeout, 404, refusal), it proceeds to the next candidate in the precedence list;
- `sources.url`, `items.source_url`, and public `provenance.source_url` must NOT be used to fetch article text for reprocess, as they point to the RSS/Atom feed rather than the specific item;
- if all fresh fetches fail, reprocess may use already persisted readable target-language fallback text as narrow source-like evidence, in order: non-empty `items.extracted_text`, then non-empty `items.feed_excerpt`. `items.extracted_text` remains the previously generated target-language representative text, not raw fulltext. This fallback is reprocess-specific; it does not weaken normal ingestion/source-fetch provenance rules, does not permit fetching `sources.url`/`items.source_url` as article text, and does not permit invented content. The LLM input URL/provenance remains the original article URL (`items.url`, or the canonical article URL only when that is the selected article candidate), never the RSS/Atom feed URL;
- if all fresh fetches fail and no readable fallback remains, reprocess must mark the item as `original_unavailable` and set its processed readable fields (`summary`, `core_insight`, `feed_excerpt`, `extracted_text`) to `null`. To satisfy the non-null `title` schema requirement, `title` must fall back to the URL or a generic 'Untitled' label. The FTS index will then only include the item's preserved provenance identifiers;
- this ensures individual item results do not invent content, preserve source identifiers, and avoid durable queues, jobs, retry dashboards, settings dashboards, or additional state-management surfaces.

Concurrency and background ingest:

- the global-exclusive guard applies to reprocess and conflicts with active source-scoped ingest/fetch attempts;
- if a background ingest tick fires while a reprocess operation holds the global-exclusive guard, the tick is ignored/skipped rather than queued.


### 5.7 Inspector Item Re-ingest
Inspector item re-ingest is a selected-item operation, not a library job and not a source-fetch control. It exists to let the owner retry or refine processing for the article currently open in the Inspector. Product/UI language says "re-ingest"; backend implementation may reuse the item-scoped reprocess machinery, but the transport operation is `item_reingest`.

Responsibilities:

- reprocess exactly one existing item row selected by item ID;
- use the same source-text precedence as library reprocess: fresh article fetch from `items.canonical_url` when valid, then `items.url`, then narrow persisted target-language fallback evidence from non-empty `items.extracted_text`, then non-empty `items.feed_excerpt`;
- pass the current global processing language into OpenRouter exactly like normal ingest/reprocess;
- optionally pass a request-scoped OpenRouter model override for this call only;
- optionally pass a request-scoped prompt for this call only (`prompt` canonical, `extra_prompt` compatibility);
- validate OpenRouter JSON before any item-field update;
- on successful validation, update the selected item's generated content fields and refresh only that item's `search_fts` row in the same write path;
- on provider/decode/schema/semantic failure, preserve existing generated content and update only safe latest-attempt diagnostics such as `last_reprocess_*`;
- return the refreshed `ItemDetail` when the selected item row was committed.

Non-responsibilities:

- does not ingest other items from the same source;
- does not rewrite the library;
- does not persist model choice, prompt text, model-list data, prompt templates, or provider settings;
- does not create durable jobs, queues, operation histories, retry dashboards, activity ledgers, or sync metadata;
- does not introduce provider switching or a provider abstraction layer;
- does not change the global processing language.

Temporary model override rules:

- `null`, empty, omitted, or exact `account_default` means use the existing runtime configured OpenRouter model, including account default when no runtime model is configured; this default sentinel is not sent to OpenRouter as a model ID;
- before validation, trim surrounding Unicode whitespace;
- after trimming, non-default model overrides must be at most `200` bytes, contain no control characters, and use only visible model-id characters: ASCII letters, digits, `.`, `_`, `-`, `/`, and `:`;
- malformed model override syntax returns `400 bad_request` with `details.field: "model"` and does not call OpenRouter;
- syntactically valid but unknown/unavailable model IDs are passed to OpenRouter; provider rejection maps to the existing safe diagnostic taxonomy, especially `invalid_model`, without leaking raw provider payloads;
- UI model selection should come from the OpenRouter model-list endpoint, but backend correctness must not depend on the browser having fetched a fresh model list first.

Temporary extra prompt rules:

- `prompt` is canonical and `extra_prompt` is a compatibility alias normalized to the same one-time prompt semantic value;
- if both fields are present with different non-empty normalized values, validation fails before any OpenRouter call;
- extra prompt is subordinate to the fixed JSON output, provenance, source-grounding, and target-language contracts;
- extra prompt may refine emphasis, source-backed fact selection, `summary` emphasis, `core_insight` angle, and `key_points` focus/order for the selected item, but it cannot override required fields, content/model-status values, source identifier preservation, target language, `core_insight` single-sentence shape, or safety/secret redaction rules;
- extra prompt is request-only and must not be persisted, exported, imported, logged as history, copied into item metadata, or reused after the request;
- before validation, trim surrounding Unicode whitespace;
- omitted, `null`, or empty after trimming means no extra prompt;
- non-empty extra prompt must be at most `4000` bytes after trimming and must not contain NUL/control characters other than tab/newline/carriage return;
- oversized or malformed prompt input is a `400 bad_request` transport validation failure with `details.field: "prompt"` or `"extra_prompt"` as applicable.

Concurrency semantics:

- item re-ingest remains a process-local global-exclusive operation for now and does not overlap active source-scoped ingest/fetch attempts, the short processing-language mutation check/write, library reprocess, or another item re-ingest;
- the canonical current-operation kind for this operation is `item_reingest`;
- if another guarded operation is running, item re-ingest returns the standard conflict shape with current-operation details when available;
- if a background ingest tick fires while item re-ingest holds the guard, the tick is skipped rather than queued;
- provider model listing is read-only and does not acquire this guard.

Failure/status contract:

| Condition | HTTP status | `reingest.status` | Top-level `ErrorBody.error.code` | `reingest.error.code` | Persistence/FTS outcome |
|---|---:|---|---|---|---|
| malformed JSON, unknown fields, invalid `model`, invalid `extra_prompt`, invalid actor/idempotency fields | `400` | N/A | `bad_request` | N/A | no item write, no FTS write |
| missing item ID or item not found | `404` | N/A | `not_found` | N/A | no item write, no FTS write |
| any guarded operation already running | `409` | N/A | `conflict` | N/A | no queued work |
| fresh source succeeds or stored fallback succeeds and OpenRouter returns valid `ok` output | `200` | `completed` | N/A | `null` | selected item readable fields updated; selected FTS row refreshed; `item_updated: true`; `fts_updated: true`; `item` present and non-null unless fatal serialization/internal failure prevents detail reload |
| fresh source fails but stored fallback succeeds and OpenRouter returns valid `ok` output | `200` | `completed` | N/A | `null` | selected item readable fields updated from fallback input; selected FTS row refreshed; `item_updated: true`; `fts_updated: true`; `item` present and non-null unless fatal serialization/internal failure prevents detail reload |
| all source/fallback text unavailable | `200` | `completed_with_errors` | N/A | `original_unavailable` | no destructive generated-content rewrite; latest-attempt diagnostics record unavailable source; existing valid content and selected FTS row are preserved unless there was no prior valid generated content to preserve |
| syntactically valid model rejected by provider | `200` | `completed_with_errors` | N/A | `invalid_model` | no generated-content rewrite; `last_reprocess_*` records the safe invalid-model attempt result; existing `content_status` and selected FTS row are preserved |
| provider error, rate limit, or provider timeout after source text selection | `200` | `completed_with_errors` | N/A | `provider_error`, `rate_limited`, or `timeout` | no generated-content rewrite; `last_reprocess_*` records the safe attempt result; existing `content_status` and selected FTS row are preserved |
| OpenRouter decode/schema/semantic validation failure after the allowed repair attempt is exhausted | `200` | `completed_with_errors` | N/A | `decode_error` | no generated-content rewrite; `last_reprocess_*` records the safe validation/decode attempt result; existing `content_status` and selected FTS row are preserved |
| valid model output reports `summary_unavailable` for app-owned unavailable source | `200` | `completed_with_errors` | N/A | `summary_unavailable` | no destructive generated-content rewrite when valid prior content exists; latest-attempt diagnostics record unavailable semantics; existing selected FTS row is preserved unless there was no prior valid generated content to preserve |
| operation timeout/context cancellation before stable item write | `200` | `failed` | N/A | `timeout` | no queued work; `item_updated: false`; `fts_updated: false` unless a stable row was already committed; `item` present and non-null if a stable row was committed and detail reload succeeds |
| fatal SQLite/invariant failure before result serialization | `500` | N/A | `internal` | N/A | no queued recovery work; committed transaction state, if any, remains authoritative |

Additional failure rules:

- source fetch failure falls back to stored readable text using the approved reprocess fallback order;
- model/provider/decode/rate-limit/timeout failures use the same safe diagnostic taxonomy as ingestion and library reprocess;
- prompt validation failures use `docs/PROMPTING_SYSTEM.md` `PromptValidationFailureCode` internally; after retry exhaustion all prompt validation failures map to public `ReprocessErrorDetail.code: "decode_error"` unless the source was app-owned unavailable and the model returned a valid `summary_unavailable`;
- failed item re-ingest attempts are non-destructive: they must not clear `localized_title`, `source_item_title`, `summary`, `core_insight`, `key_points`, `value_tier`, or current `content_status`; they update only latest-attempt diagnostics and response error details;
- raw provider payloads, API keys, `.env` paths, owner tokens, secret-source metadata, and prompt text must not appear in diagnostics, `/doctor`, UI result lines, or MCP error data;
- successful completion or storable item-level failure leaves `search_fts` consistent with the final selected item row;
- fatal SQLite or invariant errors before response construction return canonical internal errors and do not create queued recovery work.

Provider model-list behavior:

- model listing is an OpenRouter capability, not a generic provider registry;
- the list endpoint returns the canonical implemented shape `{ "models": [{ "id": "...", "name": "..." }] }` without configured/default model context or provider status fields;
- when no resolved `OPENROUTER_KEY` exists, the public model-list routes return `200` with `{ "models": [] }`; explicit empty/whitespace secret values remain startup-invalid as described in the startup validation matrix;
- successful provider response with no usable models returns `200` with `{ "models": [] }`;
- provider request failure, provider timeout, provider `401/403`, provider `429`, provider `5xx`, unreadable provider body, or provider JSON decode failure returns the standard HTTP error body with status `503` and `error.code: "provider_unavailable"`, message `"models unavailable"`, and no raw provider details;
- `models[]` contains provider model IDs only and must not include `account_default`; the Inspector may add a local default option that sends `model: null`;
- first implementation should not add a model-list cache; any future in-memory cache requires an explicit TTL/size/invalidation contract and must still remain non-durable;
- model-list responses must not expose API keys, account secrets, raw provider errors, pricing dashboards, provider configuration, or secret-source metadata.
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

Allowed error codes: `unauthorized`, `bad_request`, `not_found`, `conflict`, `provider_unavailable`, `internal`.

Canonical JSON type rules:

- timestamps are RFC3339 strings in UTC, e.g. `2026-05-09T00:00:00Z`;
- IDs are opaque strings and must not be parsed by clients;
- nullable fields are present with `null` rather than omitted unless otherwise noted;
- HTTP and MCP reuse the same JSON types unless a tool/resource explicitly overrides them.

Global JSON request body validation rule: for every JSON request body schema in this contract, unknown fields are rejected with HTTP `400 bad_request` and `details: { "field": "<field_name>" }`. This preserves strict contract-test behavior and prevents silent expansion of mutating commands.

`ErrorBody`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `error.code` | string enum | Yes | No | `unauthorized`, `bad_request`, `not_found`, `conflict`, `provider_unavailable`, `internal`; `provider_unavailable` is limited to redacted upstream provider/model-list failures such as OpenRouter model-list unavailability |
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
| `model_status` | string enum | Yes | No | `ok`, `summary_unavailable`, `model_latency_error`, `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, `timeout` |
| `is_resonated` | boolean | Yes | No | current resonance state |
| `human_inspected_at` | RFC3339 string | Yes | Yes | `null` when not inspected |
| `external_surfaced_at` | RFC3339 string | Yes | Yes | `null` when not surfaced by agent |
| `story_key` | string | Yes | Yes | `null` when not grouped |
| `duplicate_of_item_id` | string | Yes | Yes | `null` when not direct duplicate |

`ItemDetail` is `ItemSummary` plus:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `feed_excerpt` | string | Yes | Yes | processed feed excerpt when available |
| `extracted_text` | string | Yes | Yes | persisted model-generated target-language representative excerpt/detail text when available; not app-owned raw source extraction |
| `provenance` | object | Yes | No | source URL, canonical URL, grouping/duplicate context |

`Provenance`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `source_url` | string | Yes | No | RSS/Atom feed URL for the source |
| `canonical_url` | string | Yes | Yes | normalized canonical article URL when known |
| `original_url` | string | Yes | No | original item URL from the feed |
| `story_key` | string | Yes | Yes | grouping key, null when not grouped |
| `duplicate_of_item_id` | string | Yes | Yes | direct duplicate pointer, null when not duplicate |

Public provenance field mapping: `provenance.canonical_url` maps to `items.canonical_url`; `provenance.original_url` maps to `items.url`; `provenance.source_url` maps to the item/source feed URL stored as `items.source_url` where present or `sources.url` for the associated source.

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

Revision contract: `revision` is response metadata only. HTTP and MCP clients do not send `revision`, `If-Match`, or `expected_revision`; there is no current client-visible CAS API. Local mutations execute inside SQLite transactions and return the post-mutation revision. Client-visible conflicts are limited to documented operation-guard conflicts, not stale-revision errors.

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

`CurrentOperationInfo`:

This type is the authoritative HTTP/MCP shape for the process-local current-operation snapshot. It is a best-effort in-memory runtime fact, not durable state. When no long-running source-scoped ingest/fetch attempt, library reprocess, or item re-ingest operation is running, every nullable field is present as `null` and `running` is `false`. While one or more representable operations are running, `running` is `true`; `kind`, `actor_kind`, `phase`, `message`, `started_at`, and `updated_at` are present with non-null values when known; `count` is `null` until a measurable phase exists and then is an object with `current` and `total` integer members. For multi-source ingest/fetch work, the snapshot may report aggregate/best-effort status rather than every active source lease. Processing-language mutation and state import/restore are intentionally excluded from this enum: they use the global-exclusive check/write only for short atomic mutations and never publish `language_mutation`, `state_import`, or `state_restore` as current-operation kinds. Clients must tolerate `count: null` during startup/transition phases and must not infer durable progress history from the values. `actor_id` remains provenance/idempotency metadata on mutating requests; it is not part of the current-operation snapshot and is never an authorization input.

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `running` | boolean | Yes | No | `true` only while a representable source-scoped ingest/fetch attempt or global-exclusive operation is active. |
| `kind` | string enum | Yes | Yes | Canonical display/runtime values: `background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, or `item_reingest`; `null` when idle. |
| `actor_kind` | string enum | Yes | Yes | `background`, `human`, or `agent`; `null` when idle. Owner-token auth remains separate from actor provenance. |
| `phase` | string | Yes | Yes | Terse phase such as `starting`, `loading_sources`, `fetching_sources`, `fetching_feed`, `processing_items`, `source_complete`, or `complete`; `null` when idle or unknown. |
| `count` | object | Yes | Yes | `null` when no measurable count is available; otherwise `{ "current": integer, "total": integer }` with non-negative integers. |
| `count.current` | integer | Yes when `count` is non-null | No | Current completed or attempted unit for the active phase. |
| `count.total` | integer | Yes when `count` is non-null | No | Total known units for the active phase. |
| `message` | string | Yes | Yes | Terse diagnostic/status text for inline UI/MCP explanation; `null` when idle or unknown. |
| `started_at` | RFC3339 string | Yes | Yes | UTC timestamp for the guard acquisition/start of current operation; `null` when idle. |
| `updated_at` | RFC3339 string | Yes | Yes | UTC timestamp for the latest snapshot update; `null` when idle. |

`GET /api/runtime/operation` returns the current operation envelope:

```json
{
  "operation": {
    "running": false,
    "kind": null,
    "actor_kind": null,
    "phase": null,
    "count": null,
    "message": null,
    "started_at": null,
    "updated_at": null
  }
}
```

Example running response:

```json
{
  "operation": {
    "running": true,
    "kind": "manual_ingest",
    "actor_kind": "human",
    "phase": "fetching_sources",
    "count": { "current": 3, "total": 12 },
    "message": "ingest fetching source",
    "started_at": "2026-05-09T14:00:00Z",
    "updated_at": "2026-05-09T14:00:04Z"
  }
}
```

Current-operation negative semantics:

- the snapshot exists only in process memory and is cleared on guard release, process exit, or crash;
- it must not be written to SQLite, `runtime_metadata`, state export/import bundles, OPML, `agent_receipts`, or any portable state surface;
- it must not create durable jobs, queues, task tables, command histories, activity ledgers, job dashboards, retry dashboards, sidecar workers, sync/merge semantics, or portable operation receipts;
- it is allowed only for contextual inline status and conflict explanation in the current runtime.

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
| `code` | string enum | Yes | No | `rss_fetch_error`, `timeout`, `source_busy`, `source_capacity_exhausted`, `internal` |
| `message` | string | Yes | No | terse diagnostic suitable for inline `err: <diagnostic>` or skipped-source summary display |

`source_busy` is used only inside an all-source ingest result when a source-scoped lease is already active for that source. `source_capacity_exhausted` is used when a source attempt could not start because external active source work leaves no source-concurrency slot available. For all-source manual/background runs, `source_concurrency` limits simultaneous source attempts, not the total number of selected idle sources attempted by the run; idle sources waiting behind the run's own bounded worker batch are not reported as capacity-exhausted. Neither code is durable pending state, neither means RSS failure, and neither may create a retry job.

`IngestRunResult`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `scope` | string enum | Yes | No | `all` for `POST /api/ingest`, `source` for `POST /api/sources/{id}/fetch` |
| `source_id` | string | Yes | Yes | requested source id for source fetch; `null` for global ingest |
| `status` | string enum | Yes | No | `completed`, `completed_with_errors`, or `failed` |
| `started_at` | RFC3339 string | Yes | No | request execution start time |
| `completed_at` | RFC3339 string | Yes | No | request execution completion time |
| `duration_ms` | integer | Yes | No | elapsed request duration in milliseconds |
| `sources_attempted` | integer | Yes | No | number of source fetch attempts actually started; busy/skipped sources are not counted here |
| `sources_succeeded` | integer | Yes | No | number of sources fetched successfully |
| `sources_failed` | integer | Yes | No | number of source fetch failures after an attempt started; excludes busy/skipped sources |
| `sources_skipped` | integer | Yes | No | number of sources skipped before fetch because their source-scoped lease was busy or source capacity was unavailable |
| `items_upserted` | integer | Yes | No | number of item rows inserted or updated |
| `errors` | array of `IngestErrorDetail` | Yes | No | empty array when no source-level errors or skipped-source entries occurred |

`IngestRunResult.status` is derived deterministically:

| Scope/case | Required status |
|---|---|
| zero active sources: `sources_attempted=0`, `sources_skipped=0`, `errors=[]` | `completed` |
| all started source attempts succeeded and no sources were skipped | `completed` |
| one or more started source attempts succeeded, and at least one source failed or was skipped | `completed_with_errors` |
| all sources were skipped before fetch because they were busy or capacity-unavailable: `sources_attempted=0`, `sources_skipped>0` | `completed_with_errors` |
| all started source attempts failed, with or without skipped sources, but the request could still serialize a normal result | `completed_with_errors` |
| single-source `POST /api/sources/{id}/fetch` started but RSS/source fetch failed | `failed` |
| fatal runtime, invariant, or SQLite failure prevents normal per-source aggregation/serialization | standard `5xx` `ErrorBody` rather than an `IngestRunResult`, unless a response has already safely committed to a normal result |

Manual ingest success response schemas:

Operational RSS fetch failures are successful HTTP requests whose ingest result records source-level failure. Network timeouts, RSS/Atom parse errors, upstream feed HTTP errors, and similar per-source fetch failures return HTTP `200 OK` with `status: "failed"` or `status: "completed_with_errors"` and a populated `errors` array. Busy or capacity-skipped sources in an all-source ingest return HTTP `200 OK` with `source_busy` or `source_capacity_exhausted` entries, increment `sources_skipped`, do not increment `sources_attempted` or `sources_failed`, and do not enqueue work. Only transport, authentication, request validation, missing/deleted/inactive source lookup, same-source manual source-fetch conflict, source-capacity conflict for a single manual source fetch, true global-exclusive conflict, or unexpected runtime failures use the standard 4xx/5xx `ErrorBody` shape.

If `POST /api/ingest` runs when there are zero active sources, it returns HTTP `200 OK` immediately with `status: "completed"`, `sources_attempted: 0`, `sources_succeeded: 0`, `sources_failed: 0`, `sources_skipped: 0`, `items_upserted: 0`, and `errors: []`.

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
    "sources_attempted": 11,
    "sources_succeeded": 10,
    "sources_failed": 1,
    "sources_skipped": 1,
    "items_upserted": 37,
    "errors": [
      {
        "source_id": "src_02",
        "code": "rss_fetch_error",
        "message": "feed returned HTTP 502"
      },
      {
        "source_id": "src_09",
        "code": "source_busy",
        "message": "source already fetching"
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
    "sources_skipped": 0,
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

Manual ingest/fetch conflict response schema:

The source-scoped coordinator returns request-level `409 conflict` only when the requested manual source fetch targets a source id that is already active, when no source-concurrency slot is available for that immediate manual fetch, or when a true global-exclusive operation blocks the request. `POST /api/ingest` does not fail merely because unrelated source fetches are active; it skips busy/capacity-unavailable sources inside the `IngestRunResult` as `source_busy` or `source_capacity_exhausted` entries. Conflict responses indicate the representable current operation holding the conflicting source/global/capacity scope. When the in-memory snapshot reports `running: true`, `details.current_operation` is included and uses the exact `CurrentOperationInfo` shape above. This object is the same current-operation fact exposed by `GET /api/runtime/operation` and MCP `resofeed://system/operation`; it is not a durable job record. `PUT /api/runtime/language` can be blocked by a representable running operation, but it does not itself publish a `language_mutation` current-operation kind.

```json
{
  "error": {
    "code": "conflict",
    "message": "operation already running",
    "details": {
      "operation_running": true,
      "operation": "manual_ingest",
      "actor_kind": "human",
      "retry_allowed": true,
      "reason": "source_busy",
      "current_operation": {
        "running": true,
        "kind": "manual_ingest",
        "actor_kind": "human",
        "phase": "fetching_sources",
        "count": { "current": 3, "total": 12 },
        "message": "ingest fetching source",
        "started_at": "2026-05-09T14:00:00Z",
        "updated_at": "2026-05-09T14:00:04Z"
      }
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
| `offset` | No | `0` | base-10 integer string from `0` through `10000` | non-integer, below `0`, above `10000`, duplicate |

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
| `POST /api/items/{id}/delivery` | JSON `{ "actor_kind": "human"|"agent", "actor_id": "owner", "delivered_at": "2026-05-09T00:00:00Z", "idempotency_key": "..." }` | `200` | `{ "item_id": "...", "external_surfaced_at": "...", "already_applied": false }` |
| `POST /api/steer/preview` | JSON `{ "command": "...", "actor_kind": "human"|"agent", "actor_id": "owner" }`; no `idempotency_key`; `command` max `4000` bytes | `200` | `{ "preview": { "route_kind": "policy"|"source"|"search"|"doctor"|"invariant_conflict"|"unknown", "interpreted_as": "...", "will_mutate": false, "changed_rules": [SteerRule], "message": "..." } }`; read-only classification, no receipts or state writes |
| `POST /api/steer` | JSON `{ "command": "...", "actor_kind": "human"|"agent", "actor_id": "owner", "idempotency_key": "..." }`; `command` max `4000` bytes | `200` | `{ "receipt": { "interpreted_as": "...", "changed_rules": [SteerRule], "message": "..." } }` |
| `POST /api/steer/undo` | JSON `{ "target_kind": "steer_rule"|"source", "target_id": "...", "actor_kind": "human"|"agent", "actor_id": "owner", "idempotency_key": "..." }` | `200` | `SteerUndoResult`; target-specific undo only, no global undo stack or command history |
| `GET /api/sources` | none | `200` | `{ "sources": [Source] }` |
| `DELETE /api/sources/{id}` | path `id` | `200` | `{ "source_id": "...", "deleted": true, "revision": 2 }` |
| `POST /api/sources/import-opml` | `application/xml` OPML body, max `10 MiB` | `200` | `{ "imported": 12, "skipped": 0, "folders_flattened": true }` |
| `POST /api/ingest` | JSON `{}`; no query params | `200` | `{ "ingest": IngestRunResult }`; starts a bounded all-source source-attempt batch, skips/reports already-busy or externally capacity-unavailable sources, drains selected idle sources through bounded in-request workers, and returns `409 conflict` only when a true global-exclusive operation blocks the run |
| `POST /api/sources/{id}/fetch` | path `id`, JSON `{}`; no query params | `200` | `{ "ingest": IngestRunResult, "source": Source }`; returns `404 not_found` if the requested source is missing, deleted, or explicitly inactive; returns `409 conflict` if the same source id, source capacity, or a true global-exclusive operation is already running |
| `GET /api/search` | optional query params listed in the search query rules | `200` | `{ "items": [ItemSummary], "query": SearchQueryEcho }` |
| `GET /api/steer/active` | none | `200` | `{ "rules": [SteerRule] }`; intended for inline steering receipts only, not a rule-management UI |
| `GET /api/state/export` | none | `200` | state bundle JSON (`schema_version: resofeed.state.v1`) |
| `POST /api/state/import` | state bundle JSON, max `10 MiB` | `200` | restore result schema; short unrepresented global-exclusive mutation that returns `409 conflict` with reason `global_operation_running` when active source/global work prevents a stable restore |
| `GET /api/doctor` | none | `200` | `text/plain; charset=utf-8` raw diagnostic lines |
| `GET /api/runtime/operation` | none; no query params | `200` | `{ "operation": CurrentOperationInfo }`; in-memory contextual snapshot only, not durable state |

`POST /api/items/{id}/delivery` contract:

- marks that an authorized human or agent surfaced the item outside the ResoFeed UI by setting `item_state.external_surfaced_at` to the required RFC3339 `delivered_at` value;
- requires owner-token authorization like every `/api/*` route; `actor_id` is provenance/idempotency metadata only and is not an authorization lookup key;
- accepts only `actor_kind`, `actor_id`, `delivered_at`, and `idempotency_key` in the JSON body; unknown fields return `400 bad_request`;
- requires `delivered_at` to be an RFC3339 UTC timestamp; malformed timestamps return `400 bad_request` with `details: { "field": "delivered_at" }`;
- returns `404 not_found` with `details: { "id": "..." }` when the item id is absent or does not identify an existing item;
- uses the same live `agent_receipts` request-fingerprint rules as other receipt-backed item-state mutations: same live key and same request fingerprint returns the stored response with `already_applied: true`, while same live key and different request fingerprint returns `400 bad_request` with `details: { "field": "idempotency_key", "reason": "request_fingerprint_mismatch" }`;
- does not create a delivery-channel registry, activity ledger, portable receipt, sync record, queue, or job.

`GET /api/doctor` stale FTS diagnostic contract:

- when `runtime_metadata.search_fts_stale_since` is set, diagnostics include the line `search_fts: stale since <RFC3339_UTC>`;
- when no stale marker exists, diagnostics include the line `search_fts: ok`;
- diagnostics must not include item text, source text, API keys, or raw model output.

`GET /api/doctor` OpenRouter health classification contract:

- a configured OpenRouter runtime with an empty item table and no resolved live model reports `openrouter: health_classification=no_items_processed_yet`; this is a safe startup/non-regression state and does not prove live provider reachability;
- current item transform failures remain `openrouter_client_timeout_or_error`;
- stale prior failures plus a current live model-backed summary remain `stale_database_prior_failures`;
- a current model-backed summary with a resolved model and no failures remains `openrouter_live_summary_ok`;
- diagnostics must continue to distinguish provider reachability, model resolution, item-transform failures, and fallback-only summaries without leaking API keys, secret source metadata, `.env` paths, owner tokens, or raw provider payloads.

HTTP error matrix:

| Condition | Status | `error.code` | `details` rule |
|---|---:|---|---|
| missing `Authorization` header | `401` | `unauthorized` | `{}` |
| malformed/non-Bearer `Authorization` header | `401` | `unauthorized` | `{}` |
| invalid owner token | `401` | `unauthorized` | `{}` |
| malformed JSON body | `400` | `bad_request` | `{ "field": "body" }` |
| missing required field | `400` | `bad_request` | `{ "field": "<field_name>" }` |
| missing required `idempotency_key` | `400` | `bad_request` | `{ "field": "idempotency_key" }` |
| unknown JSON request body field | `400` | `bad_request` | `{ "field": "<field_name>" }` |
| live idempotency receipt exists for same key with different request fingerprint | `400` | `bad_request` | `{ "field": "idempotency_key", "reason": "request_fingerprint_mismatch" }` |
| bad content type | `400` | `bad_request` | `{ "content_type": "..." }` |
| request body too large | `400` | `bad_request` | `{ "limit": "10 MiB" }` (or `100 KB` for processing language/reprocess endpoints) |
| invalid state bundle schema or field shape | `400` | `bad_request` | `{ "field": "<field_name>" }` |
| invalid query parameter | `400` | `bad_request` | `{ "field": "<query_param>" }` |
| missing item/source id | `404` | `not_found` | `{ "id": "..." }` |
| manual source fetch requested for an already-active source id, manual source fetch requested when source capacity is exhausted, or any source/global operation requested while a true global-exclusive operation is running | `409` | `conflict` | `{ "operation_running": true, "operation": "background_ingest"|"manual_ingest"|"source_fetch"|"library_reprocess"|"item_reingest"|null, "actor_kind": "background"|"human"|"agent"|null, "retry_allowed": true, "current_operation": CurrentOperationInfo|null, "reason": "source_busy"|"source_capacity_exhausted"|"global_operation_running" }` when available. Short unrepresented operations such as language write or state import/restore may use `operation:null` and `current_operation:null`. |
| OpenRouter model-list provider failure, provider timeout, provider auth/rate/decode failure, or unreadable provider response | `503` | `provider_unavailable` | `{}`; no raw provider details, account metadata, or secrets |
| unexpected runtime failure | `500` | `internal` | `{}`; raw detail belongs in `/doctor` |

Idempotency rules:

- item-state mutations (`inspect`, `resonance`, and `delivery`) and `POST /api/steer` require `idempotency_key`;
- receipt-backed mutating operations that accept request bodies store a request fingerprint with the receipt and use the global `idempotency_key` scope defined by `agent_receipts`;
- source delete is idempotent by source id;
- OPML import is deduplicated by source URL;
- state import atomically restores the validated state bundle and does not require `idempotency_key`;
- manual ingest/fetch triggers do not use `idempotency_key` and must not create durable command receipts, queues, or job rows;
- retrying the same mutation with the same live `idempotency_key` and same request fingerprint returns the stored result and `already_applied: true` when applicable;
- retrying with the same live `idempotency_key` but a different request fingerprint returns `400 bad_request`;
- new idempotency keys represent new intended operations.

### OPML Export HTTP Addendum

`GET /api/sources/export-opml` exports the active Source Ledger source list as OPML XML. It is the symmetric source-list counterpart to `POST /api/sources/import-opml`; it is not state export.

Contract:

- requires owner-token authorization like every `/api/*` route;
- accepts no request body and no query parameters;
- returns `200 OK` with `application/xml; charset=utf-8`;
- may include `Content-Disposition: attachment; filename="sources.opml"`;
- includes active sources only, using source title and feed URL;
- omits inactive/deleted sources, steering rules, resonated items, item state, reading history, command history, receipts, runtime operation state, and sync metadata;
- does not recreate OPML folders/tags because imported OPML is flattened by design;
- uses the standard JSON error body for auth/internal failures.

Minimal response shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>ResoFeed Sources</title></head>
  <body>
    <outline type="rss" text="Example" title="Example" xmlUrl="https://example.com/feed.xml" />
  </body>
</opml>
```

Failure condition: this endpoint is wrong if it exports portable State JSON fields, embeds steering/resonance data, restores OPML folder hierarchy, or requires a settings/backup-management surface.


### Processing Language and Reprocess HTTP Addendum

`ProcessingLanguageInfo`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `code` | string enum | Yes | No | `en` or `zh` |
| `label` | string | Yes | No | Human-readable label for the current language. `en` maps to `English` and `zh` maps to `中文`. |

`GET /api/runtime/language` returns:

```json
{
  "language": {
    "code": "en",
    "label": "English"
  },
  "already_applied": false
}
```

`PUT /api/runtime/language` request body:

```json
{
  "language": "zh",
  "actor_kind": "human",
  "actor_id": "owner",
  "idempotency_key": "..."
}
```

Rules:

- request body must be a JSON object with `language`, `actor_kind`, `actor_id`, and `idempotency_key` fields;
- JSON body payload is limited to `100 KB`;
- accepted values for `language` are `en` and `zh` only;
- no query parameters are accepted;
- success persists the runtime default and returns the same response shape as `GET /api/runtime/language` with `already_applied: false`;
- setting language does not rewrite existing item rows and does not rebuild FTS;
- if any source-scoped ingest/fetch attempt or global-exclusive operation is already running, setting language returns `409 conflict` to avoid mixed-language batches; representable blockers include canonical current-operation detail, while short unrepresented blockers such as state import/restore may return `operation: null`, `actor_kind: null`, `current_operation: null`, and `reason: "global_operation_running"`;
- `PUT /api/runtime/language` itself is a short atomic write and never returns or exposes `language_mutation` as an `operation`/`kind` value;
- retrying with the same idempotency key while a live receipt exists returns the same response with `already_applied: true` when the request fingerprint matches. Retrying with the same key but a different request fingerprint while the live receipt exists returns `400 bad_request` with `details: { "field": "idempotency_key", "reason": "request_fingerprint_mismatch" }`. Idempotency is maintained by storing the result snapshot and request fingerprint in `agent_receipts` for a TTL of up to 24 hours. After a crash or TTL expiration, idempotency state may be lost; if the same key is no longer recognized, the request is otherwise valid, and the operation guard is free, the server accepts it as a fresh operation with `already_applied: false` rather than rejecting it solely because the key was previously used.

Duplicate idempotency examples for `PUT /api/runtime/language`:

- live receipt replay: same key + same body/fingerprint returns the stored language response with `already_applied: true`;
- caller error: same key + different language/body fingerprint returns `400 bad_request` with `details.reason: "request_fingerprint_mismatch"`;
- expired or lost receipt: same valid body/key after TTL expiration or crash-loss is accepted as a fresh operation with `already_applied: false` if the operation guard is free.

`ReprocessErrorDetail`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `item_id` | string | Yes | Yes | `null` for global operation failures, otherwise item ID. |
| `code` | string enum | Yes | No | `rss_fetch_error`, `model_latency_error`, `summary_unavailable`, `original_unavailable`, `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, `timeout`, `internal`. |
| `message` | string | Yes | No | Terse diagnostic max 200 chars. |

`ReprocessLibraryResult`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `status` | string enum | Yes | No | `failed` on fatal error, `completed_with_errors` if `items_failed` > 0 or `items_unavailable` > 0, otherwise `completed`. |
| `language` | string enum | Yes | No | Processing language used for the operation. |
| `started_at` | RFC3339 string | Yes | No | Start time. |
| `completed_at` | RFC3339 string | Yes | No | Completion time. |
| `items_attempted` | integer | Yes | No | Items whose processing began. On completed non-fatal runs this normally equals all items in the `items` table excluding tombstoned items from deleted sources; on fatal timeout/error it excludes unvisited items. `items_attempted` must equal `items_updated` + `items_unavailable` + `items_failed`. |
| `items_updated` | integer | Yes | No | Items whose stored readable content was successfully rewritten in the target language. Unavailable items that are cleared or fallback-titled count in `items_unavailable`, not here. |
| `items_indexed` | integer | Yes | No | Rows indexed in the successful final FTS rebuild transaction. If the final rebuild did not complete, this is normally `0`. |
| `items_unavailable` | integer | Yes | No | Items left without target-language readable output because source/model input was unavailable. |
| `items_failed` | integer | Yes | No | Items that encountered operational processing failure. |
| `fts_rebuilt` | boolean | Yes | No | `true` only when the final FTS rebuild transaction succeeds; `false` for timeout/fatal outcomes before rebuild completion. |
| `errors` | array of `ReprocessErrorDetail` | Yes | No | Max 50 errors returned. Empty when none. |

`POST /api/runtime/reprocess-library` request body:

```json
{
  "actor_kind": "human",
  "actor_id": "owner",
  "idempotency_key": "..."
}
```

Rules:

- request bodies must be valid JSON objects with `actor_kind`, `actor_id`, and `idempotency_key` fields;
- JSON body payload is limited to `100 KB`;
- query parameters are not accepted;
- the operation uses the current persisted processing language;
- it returns `{ "reprocess": ReprocessLibraryResult, "already_applied": false }` on completion;
- per-item failures return HTTP `200` with `reprocess.status` set to `completed_with_errors` or `completed` according to the counts;
- operation timeout returns HTTP `200` with `reprocess.status: "failed"`, `fts_rebuilt: false`, and a global `errors[]` entry whose `code` is `timeout`, unless the server cannot serialize a response;
- fatal SQLite or invariant failures before result construction return HTTP `500 internal`;
- if committed item transactions exist but the final FTS rebuild does not complete, `runtime_metadata.search_fts_stale_since` remains set and `/api/doctor` reports stale FTS;
- if any source-scoped ingest/fetch attempt or global-exclusive operation is already running, return `409 conflict` using the standard conflict shape with `details.operation_running: true`, `details.reason: "global_operation_running"`, `details.operation: "background_ingest"|"manual_ingest"|"source_fetch"|"library_reprocess"|"item_reingest"|null`, `details.actor_kind: "background"|"human"|"agent"|null`, `details.retry_allowed: true`, and `details.current_operation: CurrentOperationInfo|null` whenever available. Short unrepresented global-exclusive blockers may use null operation/current-operation fields. Conflict details must not expose the legacy internal `kind`/`scope` pair as canonical contract state;
- the endpoint must not create durable jobs, queues, command histories, activity rows, or sync metadata;
- retrying with the same idempotency key while the operation is still running returns `409 conflict`; retrying after completion while a live receipt exists returns the completed result with `already_applied: true` when the request fingerprint matches. Retrying with the same key but a different request fingerprint while the live receipt exists returns `400 bad_request` with `details: { "field": "idempotency_key", "reason": "request_fingerprint_mismatch" }`. Idempotency is maintained by storing the result snapshot and request fingerprint in `agent_receipts` for a TTL of up to 24 hours. After a crash or TTL expiration, idempotency state may be lost; if the same request body and key are submitted again, the request is otherwise valid, and the operation guard is free, the server accepts it as a fresh operation with `already_applied: false` rather than returning `400` solely because the key was previously used.

Duplicate idempotency examples for `POST /api/runtime/reprocess-library`:

- live receipt replay after completion: same key + same body/fingerprint returns the stored `{ "reprocess": ReprocessLibraryResult, "already_applied": true }` response;
- caller error: same key + different body fingerprint returns `400 bad_request` with `details.reason: "request_fingerprint_mismatch"`;
- expired or lost receipt: same valid body/key after TTL expiration or crash-loss is accepted as a fresh operation with `already_applied: false` if the operation guard is free.

`GET /api/runtime/operation` rules:

- no request body and no query parameters are accepted;
- success always returns `{ "operation": CurrentOperationInfo }` with all nullable fields present;
- idle response is `running: false` with `kind`, `actor_kind`, `phase`, `count`, `message`, `started_at`, and `updated_at` all `null`;
- running response reflects the same process-local snapshot used in conflict details and MCP `resofeed://system/operation`;
- it is read-only and must not create or update receipts, jobs, queues, history rows, dashboards, sync records, or portable state.

Endpoint additions:

| Method/path | Request | Success | Response |
|---|---|---:|---|
| `GET /api/runtime/language` | none | `200` | `{ "language": ProcessingLanguageInfo, "already_applied": false }` |
| `GET /api/runtime/operation` | none; no query params | `200` | `{ "operation": CurrentOperationInfo }` |
| `GET /api/runtime/openrouter-models` | none; no query params | `200` | `{ "models": [{ "id": "...", "name": "..." }] }` |
| `GET /api/runtime/openrouter/models` | compatibility route; none; no query params | `200` | identical semantics and response shape to `GET /api/runtime/openrouter-models` |
| `PUT /api/runtime/language` | JSON `{ "language": "en"|"zh", "actor_kind": ..., "actor_id": ..., "idempotency_key": ... }`; no query params | `200` | `{ "language": ProcessingLanguageInfo, "already_applied": boolean }` |
| `POST /api/runtime/reprocess-library` | JSON `{ "actor_kind": ..., "actor_id": ..., "idempotency_key": ... }`; no query params | `200` | `{ "reprocess": ReprocessLibraryResult, "already_applied": boolean }`; returns `409 conflict` if any source-scoped ingest/fetch attempt or global-exclusive operation is already running |
| `POST /api/items/{id}/reingest` | JSON `{ "actor_kind": ..., "actor_id": ..., "idempotency_key": ..., "model": null|string, "prompt": null|string }`; no query params | `200` | `{ "already_applied": boolean, "reingest": ItemReingestResult }`; returns `409 conflict` if a guarded operation is already running |

Canonical item response language rule:

- `GET /api/feed/today`, `GET /api/items/{id}`, and `GET /api/search` return the stored item text as-is;
- callers must not infer that every historical item matches the current processing language unless it was processed after the latest language change or explicit reprocess;
- source identifier fields remain exact provenance values and are not localized.

### Inspector Item Re-ingest HTTP Addendum

`OpenRouterModelOption`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `id` | string | Yes | No | OpenRouter provider model identifier suitable for request-scoped selection. Must not be `account_default`. |
| `name` | string | Yes | No | Human-readable name; may equal `id` if no better provider name is available. |

`OpenRouterModelsResponse`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `models` | array of `OpenRouterModelOption` | Yes | No | Provider model IDs only; empty when no key is resolved or when a provider response succeeds but yields no usable/selectable models; provider failures after a key is configured are not encoded as an empty array and instead use `503 provider_unavailable`; never includes the default sentinel `account_default`. |

OpenRouter model-list route rules:

- `GET /api/runtime/openrouter-models` is the canonical model-list path for the frontend model selector;
- `GET /api/runtime/openrouter/models` is a compatibility path with identical owner-token auth, query rejection, response shape, and failure semantics;
- owner-token authorization is required like every `/api/*` route;
- no request body and no query parameters are accepted on either route;
- success returns `OpenRouterModelsResponse` with selectable `{ "id", "name" }` model entries;
- when no resolved `OPENROUTER_KEY` exists, the public route returns `200` with `{ "models": [] }`; explicit empty/whitespace secret values remain startup-invalid as described in the startup validation matrix;
- successful provider response with no usable models returns `200` with `{ "models": [] }`;
- provider request failure, provider timeout, provider `401/403`, provider `429`, provider `5xx`, unreadable provider body, or provider JSON decode failure returns the standard HTTP error body with status `503` and `error.code: "provider_unavailable"`, message `"models unavailable"`, and no raw provider details;
- first implementation should not add a model-list cache; any future in-memory cache requires an explicit TTL/size/invalidation contract and must still remain non-durable;
- HTTP transport or invariant failures that prevent serialization return canonical errors;
- the endpoint is read-only and creates no receipts, jobs, queues, history rows, model caches in SQLite, or portable state;
- the endpoint must never expose OpenRouter API keys, secret source, `.env` paths, raw provider JSON, provider account metadata, or pricing/configuration dashboards.

`ItemReingestRequest`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `actor_kind` | string enum | Yes | No | `human` or `agent`. |
| `actor_id` | string | Yes | No | Non-empty, max 128 bytes; provenance/idempotency only. |
| `idempotency_key` | string | Yes | No | Non-empty, max 200 bytes. |
| `model` | string | No | Yes | Optional request-scoped OpenRouter model override. `null`, empty, omitted, or exact `account_default` means configured runtime model/account default and is not sent as a provider model ID. |
| `prompt` | string | No | Yes | Canonical optional request-scoped one-time instruction, max 4000 bytes after trimming. |
| `extra_prompt` | string | No | Yes | Compatibility alias for `prompt`, normalized to the same one-time prompt value. |

Model validation rules:

- trim surrounding Unicode whitespace before validation;
- `null`, empty after trimming, omitted, or exact `account_default` is normalized to default behavior and does not send a provider model ID override;
- non-default model overrides must be at most `200` bytes, contain no control characters, and use only ASCII letters, digits, `.`, `_`, `-`, `/`, and `:`;
- malformed model override syntax returns `400 bad_request` with `details.field: "model"` and does not call OpenRouter;
- syntactically valid but unknown/unavailable model IDs are sent to OpenRouter; provider rejection is represented as `invalid_model` in the item re-ingest result.

Extra prompt validation rules:

- trim surrounding Unicode whitespace before validation;
- `prompt` is canonical; `extra_prompt` is accepted as a compatibility alias normalized to the same one-time prompt semantic value;
- if both `prompt` and `extra_prompt` are present with different non-empty normalized values, return `400 bad_request` without calling OpenRouter;
- omitted, `null`, or empty after trimming means no extra prompt;
- non-empty extra prompt must be at most `4000` bytes and must not contain NUL/control characters other than tab/newline/carriage return;
- invalid prompt input returns `400 bad_request` with `details.field: "prompt"` or `"extra_prompt"` as applicable;
- response/error bodies must not echo prompt text from either field.

`ItemReingestResult`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `status` | string enum | Yes | No | `completed`, `completed_with_errors`, or `failed`. |
| `item_id` | string | Yes | No | Selected item ID. |
| `language` | string enum | Yes | No | Processing language used for the operation. |
| `item_updated` | boolean | Yes | No | True when the selected item row's generated content was successfully replaced, or when only latest-attempt diagnostics were committed for a failed attempt; false when no selected item row mutation was committed. |
| `fts_updated` | boolean | Yes | No | True when selected-item `search_fts` reflects the final item row. |
| `error` | `ReprocessErrorDetail` | Yes | Yes | Null on clean completion; otherwise safe terse diagnostic for this item/global failure. |
| `item` | `ItemDetail` | Yes | Yes | Refreshed selected item detail or `null`. Present in the JSON object. Must be non-null whenever `item_updated: true`; `null` is allowed only when no selected item row mutation was committed, or when detail production failed due to fatal/internal serialization failure. |

`ItemReingestResponse`:

| Field | Type | Required | Nullable | Notes |
|---|---|---:|---:|---|
| `reingest` | `ItemReingestResult` | Yes | No | Result summary for the selected item. |
| `already_applied` | boolean | Yes | No | Idempotency replay marker. |

`POST /api/items/{id}/reingest` request body example:

```json
{
  "actor_kind": "human",
  "actor_id": "owner",
  "idempotency_key": "...",
  "model": "openai/gpt-4.1-mini",
  "prompt": "Emphasize concrete product and pricing facts."
}
```

Compatibility prompt alias example:

```json
{
  "actor_kind": "human",
  "actor_id": "owner",
  "idempotency_key": "...",
  "model": "openai/gpt-4.1-mini",
  "extra_prompt": "Emphasize concrete product and pricing facts."
}
```

Default-model request example:

```json
{
  "actor_kind": "human",
  "actor_id": "owner",
  "idempotency_key": "...",
  "model": null,
  "prompt": null
}
```

Rules:

- path `id` is required and must identify an existing item;
- request body must be a JSON object with required mutation fields and optional `model`, canonical `prompt`, and compatibility `extra_prompt` only;
- JSON body payload is limited to `100 KB`; field-level limits above also apply;
- `language` and any other unknown fields are rejected; selected-item re-ingest uses the persisted runtime processing language and has no per-call language override;
- no query parameters are accepted;
- success returns `{ "already_applied": false, "reingest": ItemReingestResult }`, with `reingest.item` present and non-null whenever `item_updated: true`;
- if any source-scoped ingest/fetch attempt or global-exclusive operation is already running, return `409 conflict` with canonical current-operation details and no queued work;
- same live idempotency key plus same fingerprint replays the stored response with `already_applied: true` after completion;
- same live idempotency key plus different fingerprint returns `400 bad_request` with `details.reason: "request_fingerprint_mismatch"`;
- duplicate key during an active item re-ingest returns `409 conflict`;
- after crash-loss or receipt TTL expiration, the same valid body/key may be accepted as a fresh request if the operation guard is free;
- the normalized selected `model` and normalized prompt value are part of the request fingerprint/digest calculation, but raw prompt text and raw model override values are not persisted in receipt storage. The live receipt stores only the fingerprint/digest/result snapshot needed for replay and must not become user-visible history;
- response/error bodies must not echo prompt text from either field.

Status/error mapping:

| Condition | HTTP status | `reingest.status` | Top-level `ErrorBody.error.code` | `reingest.error.code` | Persistence/FTS outcome |
|---|---:|---|---|---|---|
| malformed JSON, unknown fields, invalid `model`, invalid `prompt`/`extra_prompt`, invalid actor/idempotency fields | `400` | N/A | `bad_request` | N/A | no item write, no FTS write |
| item not found | `404` | N/A | `not_found` | N/A | no item write, no FTS write |
| any guarded operation already running | `409` | N/A | `conflict` | N/A | no queued work |
| source/fallback text available and OpenRouter returns valid `ok` output | `200` | `completed` | N/A | `null` | readable fields updated; selected FTS row refreshed; `item_updated: true`; `fts_updated: true`; `item` present and non-null unless fatal serialization/internal failure prevents detail reload |
| all source/fallback text unavailable | `200` | `completed_with_errors` | N/A | `original_unavailable` | no destructive generated-content rewrite; latest-attempt diagnostics record unavailable source; existing valid content and selected FTS row are preserved unless there was no prior valid generated content to preserve |
| syntactically valid model rejected by provider | `200` | `completed_with_errors` | N/A | `invalid_model` | no generated-content rewrite; `last_reprocess_*` records the safe invalid-model attempt result; existing `content_status` and selected FTS row are preserved |
| provider error, rate limit, or provider timeout after source text selection | `200` | `completed_with_errors` | N/A | `provider_error`, `rate_limited`, or `timeout` | no generated-content rewrite; `last_reprocess_*` records the safe attempt result; existing `content_status` and selected FTS row are preserved |
| OpenRouter decode/schema/semantic validation failure after the allowed repair attempt is exhausted | `200` | `completed_with_errors` | N/A | `decode_error` | no generated-content rewrite; `last_reprocess_*` records the safe validation/decode attempt result; existing `content_status` and selected FTS row are preserved |
| valid model output reports `summary_unavailable` for app-owned unavailable source | `200` | `completed_with_errors` | N/A | `summary_unavailable` | no destructive generated-content rewrite when valid prior content exists; latest-attempt diagnostics record unavailable semantics; existing selected FTS row is preserved unless there was no prior valid generated content to preserve |
| timeout/context cancellation before stable item write | `200` | `failed` | N/A | `timeout` | no queued work; `item_updated: false`; `fts_updated: false` unless a stable row already committed; `item` present and non-null if a stable row was committed and detail reload succeeds |
| fatal SQLite/invariant failure before result serialization | `500` | N/A | `internal` | N/A | no queued recovery work; committed transaction state, if any, remains authoritative |

Endpoint additions:

| Method/path | Request | Success | Response |
|---|---|---:|---|
| `GET /api/runtime/openrouter-models` | none; no query params | `200` | `OpenRouterModelsResponse` |
| `GET /api/runtime/openrouter/models` | compatibility route; none; no query params | `200` | identical semantics and response shape to `GET /api/runtime/openrouter-models` |
| `POST /api/items/{id}/reingest` | `ItemReingestRequest`; no query params; see `ItemReingestRequest` above for compatibility `extra_prompt` alias | `200` | `ItemReingestResponse`; returns `409 conflict` if any source-scoped ingest/fetch attempt or global-exclusive operation is already running |

## 7. MCP Surface

Read-item audit envelope: `read_item` may include optional top-level `fallback_reason` when the returned `ItemDetail.extraction_status` is `full` but no raw `extracted_text` is persisted. This reason is transport/audit metadata only; it MUST NOT downgrade `extraction_status`, create durable state, or imply that model-backed content is unavailable. Rationale: `full` records successful source acquisition/model grounding, while raw source text persistence is optional under the ingestion contract.


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
- `resofeed://system/operation` — JSON `{ "operation": CurrentOperationInfo }`, the same in-memory current-operation snapshot as `GET /api/runtime/operation`;
- `resofeed://sources` — JSON `{ "sources": [Source] }`.

Tools:

| Tool | Input schema | Output schema | Mutation? | Equivalent operation |
|---|---|---|---|---|
| `list_candidate_items` | `{ "limit": 20 }`, default `20`, max `50` | `{ "items": [ItemSummary] }` | No | feed candidate query |
| `search_items` | `{ "query": "sqlite", "source": null, "from": null, "to": null, "resonated": null, "limit": 20 }` | `{ "items": [ItemSummary], "query": SearchQueryEcho }` | No | `GET /api/search` |
| `read_item` | `{ "item_id": "item_01" }` | `{ "item": ItemDetail }` | No | `GET /api/items/{id}` |
| `mark_inspected` | `{ "item_id": "item_01", "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "item_id": "item_01", "human_inspected_at": "...", "already_applied": false }` | Yes | `POST /api/items/{id}/inspect` |
| `resonate_item` | `{ "item_id": "item_01", "resonated": true, "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "item_id": "item_01", "is_resonated": true, "already_applied": false }` | Yes | `POST /api/items/{id}/resonance` |
| `preview_steer` | `{ "command": "find sqlite", "actor_id": "agent-name" }`; no `idempotency_key` | `{ "preview": SteerPreview }` | No | `POST /api/steer/preview` |
| `steer` | `{ "command": "Push more technical documents.", "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "receipt": { "interpreted_as": "...", "changed_rules": [SteerRule], "message": "..." } }` | Yes | `POST /api/steer` |
| `undo_steer` | `{ "target_kind": "steer_rule"|"source", "target_id": "...", "actor_id": "agent-name", "idempotency_key": "..." }` | `SteerUndoResult` | Yes | `POST /api/steer/undo` |
| `report_delivery` | `{ "item_id": "item_01", "actor_id": "agent-name", "delivered_at": "2026-05-09T00:00:00Z", "idempotency_key": "..." }` | `{ "item_id": "item_01", "external_surfaced_at": "...", "already_applied": false }` | Yes | `POST /api/items/{id}/delivery` |

MCP schema rules:

- missing/invalid auth on `/mcp` returns HTTP `401` before MCP tool/resource handling;
- resource content types are exactly those listed above (`application/json` or `text/plain`);
- resource JSON bodies reuse canonical HTTP types;
- `resofeed://system/operation` is read-only, authenticated, and exposes only the current in-memory guard snapshot; it must not imply a durable job, queue, history, dashboard, sidecar, sync/merge primitive, or portable operation receipt;
- unknown tools/resources return MCP tool/resource not found errors, not HTTP `404` after session establishment;
- `search_items.query` is required even though HTTP search `q` is optional; MCP clients that want empty-feed browsing should use `list_candidate_items`;
- `actor_id`, when required, is a non-empty string with max length `128`;
- `idempotency_key`, when required, is a non-empty string with max length `200`;
- `item_id` is a required non-empty string for item-specific tools;
- `command` max length is `4000` bytes;
- `limit` defaults and maximums are fixed by the tool table.
- `report_delivery` reuses the `POST /api/items/{id}/delivery` JSON response contract and idempotency semantics; MCP supplies `actor_id`, `delivered_at`, and `idempotency_key`, while owner-token authorization remains the only authorization boundary.

Tool required fields:

| Tool | Required fields | Optional fields |
|---|---|---|
| `list_candidate_items` | none | `limit` |
| `search_items` | `query` | `source`, `from`, `to`, `resonated`, `limit` |
| `read_item` | `item_id` | none |
| `mark_inspected` | `item_id`, `actor_id`, `idempotency_key` | none |
| `resonate_item` | `item_id`, `resonated`, `actor_id`, `idempotency_key` | none |
| `preview_steer` | `command`, `actor_id` | none |
| `steer` | `command`, `actor_id`, `idempotency_key` | none |
| `undo_steer` | `target_kind`, `target_id`, `actor_id`, `idempotency_key` | none |
| `report_delivery` | `item_id`, `actor_id`, `delivered_at`, `idempotency_key` | none |
| `get_processing_language` | none | none |
| `set_processing_language` | `language`, `actor_id`, `idempotency_key` | none |
| `reprocess_library` | `actor_id`, `idempotency_key` | none |

MCP invariants:

- read/evaluate calls do not mutate human-visible inspection status;
- all calls require owner-token authority;
- mutating calls require idempotency keys;
- tool responses include enough provenance for agents to avoid duplicate loops;
- MCP does not add delivery-channel ownership such as Telegram, Slack, or email.

### Processing Language MCP Parity

MCP item/search/detail resources and tools return the same stored historical item text as HTTP, which may differ from the current runtime processing language if the item was processed before a language change. MCP does not get a per-call language override in this contract; it follows the persisted runtime processing language for new operations.

Additional resource:

- `resofeed://runtime/language` — JSON `{ "language": ProcessingLanguageInfo, "already_applied": false }`.

Additional tools:

| Tool | Input schema | Output schema | Mutation? | Equivalent operation |
|---|---|---|---|---|
| `get_processing_language` | `{}` | `{ "language": ProcessingLanguageInfo, "already_applied": false }` | No | `GET /api/runtime/language` |
| `set_processing_language` | `{ "language": "en"|"zh", "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "language": ProcessingLanguageInfo, "already_applied": boolean }` | Yes | `PUT /api/runtime/language` |
| `reprocess_library` | `{ "actor_id": "agent-name", "idempotency_key": "..." }` | `{ "reprocess": ReprocessLibraryResult, "already_applied": boolean }` | Yes | `POST /api/runtime/reprocess-library` |

Rules:

- mutating language/reprocess tools require owner-token authority, `actor_id`, and `idempotency_key` like other mutating MCP tools;
- setting language through MCP affects future processing only and does not rewrite existing item rows;
- `reprocess_library` is explicit, uses the current persisted language, and must not create durable jobs, queues, or activity feeds;
- `list_candidate_items`, `search_items`, and `read_item` return stored historical item text as-is, which may differ from the current runtime processing language if the item was processed before a language change; source identifiers remain exact provenance anchors;
- guarded-operation conflicts in MCP tool calls return a JSON-RPC error whose `data.error.code` is `conflict` and whose `data.error.details` matches the HTTP conflict detail shape, including `current_operation: CurrentOperationInfo` whenever the same in-memory snapshot is running: `{ "operation_running": true, "operation": "background_ingest"|"manual_ingest"|"source_fetch"|"library_reprocess"|"item_reingest"|null, "actor_kind": "background"|"human"|"agent"|null, "retry_allowed": true, "reason": "source_busy"|"source_capacity_exhausted"|"global_operation_running", "current_operation": CurrentOperationInfo|null }`;
- `set_processing_language` conflicts when a representable source/global operation or short unrepresented global-exclusive mutation is running; it does not publish or return `language_mutation`, `state_import`, or `state_restore` as a current-operation value;
- `set_processing_language` MCP idempotency behavior: while a live receipt exists, same key + same request fingerprint returns the stored language response with `already_applied: true`; same key + different request fingerprint returns an MCP schema/request error equivalent to HTTP `400 bad_request`; after crash-loss or TTL expiration, the same valid body/key is accepted as a fresh operation with `already_applied: false` if the operation guard is free;
- `reprocess_library` MCP idempotency behavior: a duplicate key during an active run returns the JSON-RPC conflict error described above; a duplicate key after completion while a live receipt exists returns the same `ReprocessLibraryResult` payload with `already_applied: true` when the request fingerprint matches. Retrying with the same key but a different request fingerprint while the live receipt exists returns an MCP schema/request error equivalent to HTTP `400 bad_request`. Idempotency is maintained by storing the result snapshot and request fingerprint in `agent_receipts` for a TTL of up to 24 hours, which is permitted as transient runtime state. After a crash or TTL expiration, idempotency state may be lost; if the same request body and key are submitted again, the request is otherwise valid, and the operation guard is free, the tool accepts it as a fresh operation with `already_applied: false` rather than rejecting it solely because the key was previously used.

MCP JSON-RPC error examples:

Guarded-operation conflict:

```json
{
  "error": {
    "code": -32000,
    "message": "operation already running",
    "data": {
      "error": {
        "code": "conflict",
        "message": "operation already running",
        "details": {
          "operation_running": true,
          "operation": "library_reprocess",
          "actor_kind": "agent",
          "retry_allowed": true,
          "reason": "global_operation_running",
          "current_operation": {
            "running": true,
            "kind": "library_reprocess",
            "actor_kind": "agent",
            "phase": "processing_items",
            "count": { "current": 40, "total": 200 },
            "message": "reprocess running",
            "started_at": "2026-05-09T14:00:00Z",
            "updated_at": "2026-05-09T14:01:20Z"
          }
        }
      }
    }
  }
}
```

Same key with different request fingerprint:

```json
{
  "error": {
    "code": -32602,
    "message": "invalid request",
    "data": {
      "error": {
        "code": "bad_request",
        "message": "idempotency key reused with different request",
        "details": {
          "field": "idempotency_key",
          "reason": "request_fingerprint_mismatch"
        }
      }
    }
  }
}
```

### Inspector Item Re-ingest MCP Parity

MCP exposes the same item re-ingest product concept as HTTP so authorized agents can repair one selected item without receiving product capabilities unavailable to the human UI. Runtime DTO/schema wiring now exposes and validates request-scoped `model`, canonical `prompt`, and compatibility `extra_prompt` fields for `reingest_item`; these fields are implemented parity with HTTP and remain non-durable request-only inputs.

Additional tools:

| Tool | Input schema | Output schema | Mutation? | Equivalent operation |
|---|---|---|---|---|
| `list_openrouter_models` | `{}` | `OpenRouterModelsResponse` | No | Provider-backed parity with `GET /api/runtime/openrouter-models`; missing runtime key returns `{ "models": [] }` |
| `reingest_item` | `{ "item_id": "item_01", "actor_id": "agent-name", "idempotency_key": "...", "model": null, "prompt": null, "extra_prompt": null }` | `ItemReingestResponse` | Yes | `POST /api/items/{id}/reingest` |

Rules:

- `list_openrouter_models` is an authenticated, read-only parity operation and must create no receipts, durable cache, provider registry, or portable state;
- current MCP `list_openrouter_models` runtime behavior uses the same OpenRouter model-list function as HTTP after request-time secret resolution, returns `{ "models": [] }` when no key is resolved, and redacts provider errors;
- `reingest_item` requires owner-token authority, `item_id`, `actor_id`, and `idempotency_key`;
- `model`, canonical `prompt`, and compatibility `extra_prompt` are optional implemented MCP parity fields with the same validation, alias, idempotency fingerprint, and non-persistence rules as HTTP selected-item re-ingest;
- `reingest_item` uses the current persisted processing language and does not accept a per-call language override;
- `reingest_item` must call the same application operation as HTTP item re-ingest;
- guarded-operation conflicts return a JSON-RPC error whose `data.error.code` is `conflict` and whose `data.error.details` matches the HTTP conflict detail shape, including `current_operation: CurrentOperationInfo` when available;
- same-key idempotency replay/mismatch/active-run semantics match `POST /api/items/{id}/reingest`;
- MCP responses and errors must not echo prompt text from either prompt field, raw provider payloads, OpenRouter API keys, secret source metadata, `.env` paths, or owner tokens.

Tool required fields:

| Tool | Required fields | Optional fields |
|---|---|---|
| `list_openrouter_models` | none | none |
| `reingest_item` | `item_id`, `actor_id`, `idempotency_key` | `model`, `prompt`, `extra_prompt` |

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
- render Source Ledger source rows with `sources.title` as the primary source label and the feed URL as secondary provenance text;
- allow multiple row-level `[FETCH]` actions to show independent `[FETCHING...]` state when different sources are fetching concurrently; do not block all row fetch actions merely because one unrelated source is fetching;
- keep `[RUN INGEST]` available during unrelated row fetches unless a true global-exclusive operation blocks ingest; when run during active row fetches, show terse skipped-source feedback for busy rows rather than queueing delayed work;
- render current-operation status only as contextual inline feedback while an operation is running or a conflict is being explained; do not add a persistent idle top-chrome operation strip, job-management dashboard, or historical operation surface;
- expose state export/import as terse actions, not backup-management UI;
- show fallback/status labels plainly.

Forbidden:

- Tailwind or component UI libraries unless the design contract changes;
- visual concepts not in `docs/DESIGN.md`;
- extra dashboard surfaces for diagnostics, source management, manual ingest/fetch, or settings;
- UI state models that imply persisted ingest jobs, queued retries, activity feeds, or portable manual-ingest receipts.

Processing-language and split-scroll responsibilities:

- read the persisted processing language after owner-token acceptance and render UI chrome/accessibility labels for `en` or `zh`;
- set `<html lang>` to `en` or `zh-CN` according to the active UI language unless `docs/DESIGN.md` specifies a narrower locale;
- expose language as a terse operational control, not a settings dashboard;
- expose one-time library reprocess as a terse operational/bracket action, not a wizard, progress dashboard, queue, or activity surface;
- mark source identifiers such as URLs, source titles, source URLs, canonical URLs, and original links as literal provenance anchors and avoid translating or beautifying them; DOM rendering must use `translate="no"` or an equivalent implementation for these source identifier spans/links;
- keep desktop feed and Inspector as independent vertical scroll regions; selecting an item must not move the feed scroll, while the Inspector reading container resets to top for a newly selected item;
- keep mobile Inspector as the existing full-screen route with preserved feed scroll.

Inspector item re-ingest frontend responsibilities:

- expose item re-ingest only inside the currently selected Inspector, not global chrome, Source Ledger, or a settings/dashboard surface;
- load OpenRouter model choices through the typed API client from canonical `GET /api/runtime/openrouter-models` (with `GET /api/runtime/openrouter/models` as compatibility) and keep default-model re-ingest available when model listing is unavailable;
- send optional model and canonical one-time `prompt` only in the `POST /api/items/{id}/reingest` request body, while accepting `extra_prompt` only as a compatibility alias;
- clear temporary model/prompt UI state on cancel, completion, item change, or Inspector close;
- never persist model/prompt values to local storage, state export/import, item metadata, source settings, or runtime defaults;
- refresh the current item detail from the item re-ingest response and update any visible feed/search row for that item without creating history;
- show running, completion, conflict, and failure states as inline text replacement/live-region feedback; no spinner, toast, modal retry, progress dashboard, or operation history;
- render source text/source evidence as collapsed by default for each newly opened Inspector item while preserving accessible disclosure semantics and the fallback/source-evidence contract.

## 9. Minimal File Shape

Start with this shape and split only after file size, test locality, or repeated change pressure justifies it:

```text
cmd/resofeed/main.go
internal/resofeed/db.go
internal/resofeed/migrations.go
internal/resofeed/types.go
internal/resofeed/ingest.go
internal/resofeed/reprocess.go
internal/resofeed/ranking.go
internal/resofeed/search.go
internal/resofeed/state.go
internal/resofeed/openrouter.go
internal/resofeed/http.go
internal/resofeed/mcp.go
internal/resofeed/doctor.go
web/
```

Module ownership rules:

- `internal/resofeed/ingest.go` owns RSS/Atom fetch orchestration, per-source fetch execution, source-level ingest diagnostics, the in-process ingest concurrency guard, source-scoped same-source non-overlap, and bounded all-source batch drain/skip semantics for background/manual ingestion.
- `internal/resofeed/reprocess.go` owns library reprocess and Inspector item re-ingest application behavior: source-text precedence, item-scoped model call orchestration, safe result classification, item readable-field updates, and per-item FTS refresh. It must not own HTTP/MCP serialization or UI state.
- `internal/resofeed/openrouter.go` owns OpenRouter chat-completions transport, temporary per-call model override handling, provider model listing, resolved/configured model reporting, and safe provider error classification. It must not persist model selections, prompt templates, or provider account metadata.
- `internal/resofeed/http.go` owns HTTP routing, owner-token enforcement, request validation, response serialization, idempotency mapping, and mapping ingest/reprocess outcomes to HTTP contracts.
- `internal/resofeed/mcp.go` owns MCP schema/resource/tool parity and must call the same application operations as HTTP.
- `http.go` and `mcp.go` must not own ingest/reprocess business logic, queues, job lifecycle, retry scheduling, provider model caching in SQLite, or source fetch state beyond request/response translation.
- `ingest.go` and `reprocess.go` must not own HTTP status codes or JSON wire formatting beyond exposing typed outcomes that transports can translate.
- `state.go` owns only state bundle validation plus transactional backup/restore. It must not own merging, conflict resolution, sync orchestration, portable agent receipts, model settings, or prompt templates.
- Frontend files under `web/` own Inspector interaction state, model selector presentation, extra-prompt input state, and source-text disclosure state. They must not persist request-scoped model/prompt values.

Do not introduce repositories, factories, DI containers, event buses, plugin registries, service catalogs, storage interfaces, state mergers, conflict resolvers, sync coordinators, provider abstraction layers, persistent ingest queues, or job tables without a new architecture decision and a real second implementation.

## 10. Verification Targets

Implementation is architecture-conformant when:

- `resofeed serve` is the single runtime command;
- `resofeed serve` accepts `--addr`, `--public-url`, `--db`, optional `--openrouter-model`, optional `--owner-token`, and optional `--first-fetch-limit` (`50` default, `RESOFEED_FIRST_FETCH_LIMIT` fallback when the flag is omitted, `0` unlimited, maximum `500`); it does not require CLI API-key flags in the future runtime contract;
- OpenRouter startup secret resolution follows OS `OPENROUTER_KEY` > local `.env` fallback, rejects explicit empty/whitespace values, allows a missing key as provider-unavailable runtime state, and never persists, exports, logs, prints, or commits raw secrets;
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

Manual ingest/fetch conflict checks:

Use deliberately slow sources to make overlap observable.

```bash
curl -i -X POST http://127.0.0.1:8080/api/sources/src_01/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'

curl -i -X POST http://127.0.0.1:8080/api/sources/src_01/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# while src_01 is already fetching, expect 409 JSON error with details.reason="source_busy".

curl -i -X POST http://127.0.0.1:8080/api/sources/src_02/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# while src_01 is already fetching, an unrelated source fetch may return 200 if src_02 is idle and source capacity is available.
# If all source-concurrency slots are occupied by external work, expect 409 JSON error with details.reason="source_capacity_exhausted".

curl -i -X POST http://127.0.0.1:8080/api/ingest \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# while src_01 is already fetching, expect 200 JSON with ingest.sources_skipped incremented and an errors[] entry for src_01 with code="source_busy".
# Other selected idle active sources are drained through bounded in-request workers; no delayed work is persisted after the response.
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
Read resofeed://system/doctor and expect text/plain diagnostics; read
resofeed://system/operation and expect JSON {"operation": CurrentOperationInfo}.
```

Processing-language and split-scroll verification additions:

- `runtime_metadata.processing_language` persists `en` or `zh`, defaults to `en` when absent, and is not included in state export/import;
- `runtime_metadata.search_fts_stale_since` is absent when FTS is current, set while/after reprocess fails before final rebuild, and cleared after successful rebuild;
- `PUT /api/runtime/language` changes future processing language without rewriting existing item rows or rebuilding FTS;
- future ingest sends target language to OpenRouter and persists user-readable item text in that target language;
- source identifiers remain unchanged after language changes and reprocess;
- source identifier DOM nodes/links use `translate="no"` or equivalent so browser/page translation does not localize provenance anchors;
- `POST /api/runtime/reprocess-library` explicitly rewrites existing readable item text in the current language and rebuilds FTS without creating durable jobs, queues, or activity ledgers;
- if a reprocess receipt expires or is lost after restart, resubmitting the same request body and `idempotency_key` while the concurrency guard is free is accepted as a fresh request with `already_applied: false`, not rejected as `400` solely because the key was previously used;
- operation guard conflicts across manual ingest, source fetch, library reprocess, item re-ingest, and language changes blocked by those representable operations use `409 conflict` details with `operation_running`, canonical `operation`, `actor_kind`, `retry_allowed`, `reason` (`source_busy`, `source_capacity_exhausted`, or `global_operation_running`), and `current_operation` when the in-memory snapshot is running; MCP returns the matching JSON-RPC error data shape;
- timeout reprocess outcomes return `reprocess.status: "failed"`, `fts_rebuilt: false`, and error `code: "timeout"` when the server can serialize the response; fatal pre-result SQLite/invariant failures return `500 internal`;
- `GET /api/search` searches the stored target-language FTS content after reprocess;
- `GET /api/doctor` reports `search_fts: stale since <RFC3339_UTC>` when the stale marker is set, otherwise `search_fts: ok`, and never includes item text, source text, API keys, or raw model output;
- MCP `list_candidate_items`, `search_items`, and `read_item` return the same stored target-language item text as HTTP;
- UI chrome and accessible labels render in English and Chinese, and source identifiers are not translated;
- desktop feed and Inspector scroll independently; selecting a new item leaves feed scroll stable and resets Inspector scroll to top;
- mobile Inspector remains a full-screen route.

Processing-language smoke checks:

```bash
curl -i http://127.0.0.1:8080/api/runtime/language \
  -H "Authorization: Bearer <OWNER_TOKEN>"
# expect 200 JSON body: {"language":{"code":"en",...}} unless changed

curl -i -X PUT http://127.0.0.1:8080/api/runtime/language \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"smoke-test-1"}'
# expect 200 JSON body: {"language":{"code":"zh",...},"already_applied":false}

curl -i -X POST http://127.0.0.1:8080/api/runtime/reprocess-library \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"smoke-test-2"}'
# expect 200 JSON body: {"reprocess":{"language":"zh","fts_rebuilt":true,...},"already_applied":false}
```


### Source title and bounded source-fetch parallelism verification additions

- successful manual source fetch updates `sources.title` from the RSS/Atom feed title when the parsed title is non-empty and increments the source `revision`;
- Source Ledger HTTP/MCP source listings expose the updated `title` without adding a separate `feed_title` field;
- two `POST /api/sources/{id}/fetch` requests for different active source ids may run concurrently and both return source-scoped results;
- a duplicate `POST /api/sources/{id}/fetch` for the same source id while that source is already fetching returns `409 conflict` and does not enqueue work;
- `POST /api/ingest` while an unrelated manual source fetch is running starts idle sources, reports the busy source as `source_busy`, increments `sources_skipped`, and does not enqueue work;
- a manual `POST /api/sources/{id}/fetch` when all source-concurrency slots are occupied returns `409 conflict` with reason `source_capacity_exhausted` and does not enqueue work;
- `POST /api/ingest` under external source-capacity pressure drains selected idle sources through any slot it owns, reports only externally capacity-unavailable starts as `source_capacity_exhausted`, increments `sources_skipped`, and does not persist work after the response;
- background ingest ticks skip already-busy sources, drain selected idle sources through bounded workers, report only externally capacity-unavailable starts, and never persist work after the tick returns;
- no implementation creates a durable queue, job table, activity ledger, worker process, event bus, or settings/dashboard surface for the parallel fetch behavior;
- Source Ledger row UI can show `[FETCHING...]` independently for multiple source rows while allowing `[RUN INGEST]` during unrelated row fetches and summarizing busy sources tersely.

Suggested smoke check shape:

```bash
curl -i -X POST http://127.0.0.1:8080/api/sources/src_a/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'

curl -i -X POST http://127.0.0.1:8080/api/sources/src_b/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# if both upstream feeds are slow and different source ids, both requests may be in flight together.

curl -i -X POST http://127.0.0.1:8080/api/sources/src_a/fetch \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# while src_a is already fetching, expect 409 conflict with current-operation detail.

curl -i -X POST http://127.0.0.1:8080/api/ingest \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{}'
# while src_a is busy and src_b is idle, expect 200 with src_a reported as source_busy/sources_skipped and src_b attempted; no queued work.
```

### Inspector item re-ingest verification additions

- canonical `GET /api/runtime/openrouter-models` and compatibility `GET /api/runtime/openrouter/models` require owner-token authorization, reject query parameters, return OpenRouter model-list response data, and never leak API keys, secret source metadata, `.env` paths, raw provider JSON, or provider account configuration;
- model-list provider failure produces a safe unavailable state that still allows default-model re-ingest in the Inspector;
- `POST /api/items/{id}/reingest` requires owner-token authorization, strict JSON body validation, `actor_kind`, `actor_id`, and `idempotency_key`;
- item re-ingest processes exactly one selected item and does not fetch/process other source items or library rows;
- optional `model`, canonical `prompt`, and compatibility `extra_prompt` affect only the single request and are not persisted in SQLite, local storage, exported state, item metadata, source settings, runtime defaults, `/doctor`, logs, or user-visible history;
- extra prompt is subordinate to the fixed JSON/provenance/target-language contract and cannot cause source identifiers to be translated or rewritten;
- item re-ingest uses the same source-text precedence as library reprocess and never fetches `sources.url`/`items.source_url` as article text;
- selected-item readable fields and selected-item `search_fts` row are refreshed consistently after successful or storable failure outcomes;
- conflicts across source-scoped ingest/fetch attempts, library reprocess, item re-ingest, and language changes blocked by active source/global-exclusive operations use canonical `409 conflict` current-operation details with item re-ingest reported as `item_reingest`; no work is queued;
- MCP `list_openrouter_models` uses the same provider-backed model-list function as HTTP after runtime OpenRouter config resolution, and `reingest_item` exposes request-scoped `model`, canonical `prompt`, and compatibility `extra_prompt` fields through the runtime DTO/schema;
- Inspector renders item re-ingest as inline bracket-action controls only, with no modal, toast, spinner, settings dashboard, queue, progress dashboard, or operation history;
- Inspector Source Text/Source Evidence is collapsed by default for every newly opened item while preserving accessible disclosure semantics and fallback/source-evidence rules.

Inspector item re-ingest smoke checks:

```bash
curl -i http://127.0.0.1:8080/api/runtime/openrouter-models \
  -H "Authorization: Bearer <OWNER_TOKEN>"
# expect 200 JSON body: {"models":[{"id":"...","name":"..."}]}; no resolved key or a successful provider response with no usable models may return {"models":[]}; provider failures after a key is configured return a standard 503 provider_unavailable error body

curl -i -X POST http://127.0.0.1:8080/api/items/item_01/reingest \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"item-reingest-smoke-1","model":null,"prompt":"Prefer concrete source facts."}'
# expect 200 JSON body: {"already_applied":false,"reingest":{"item_id":"item_01",...}}
# captured evidence must not echo prompt text, API keys, provider raw payloads, or secret-source metadata
```

## 11. Open Questions

None blocking.

Alignment note: if `docs/DESIGN.md` language implies exporting broad command or signal history, implementation should interpret that as the minimal current-state bundle needed for portability, not as permission to build a general activity ledger.
