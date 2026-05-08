# ResoFeed Architecture Spec

Version: 1.0
Status: Approved

## 1. Guiding Principles

This architecture strictly enforces extreme KISS (Keep It Simple, Stupid) and minimalism. Performative complexity—such as Event Sourcing, CQRS, Vector Databases, and microservices—is explicitly rejected.

1. **Single Runtime:** One Go binary containing both the backend API and the static frontend assets.
2. **Single Database:** One embedded SQLite file. No external databases, no distributed caching.
3. **Current State Only:** We store the *present reality*. No append-only intent logs or activity ledgers.
4. **Thin Adapters:** MCP and HTTP are transport protocols, not separate business logic engines. They route to the same underlying App Use Cases.
5. **Dumb AI:** LLMs are treated as pure functions (Input -> Transformation -> Output) invoked via standard HTTP POST. The LLM does not orchestrate loops, hold state, or write directly to the database without schema-enforced boundaries.
6. **Logical Clocks for Merge:** Cross-device/import state merging relies on a monotonic integer (`revision`) rather than wall-clock timestamps (`updated_at`), immunizing the system against clock drift.

## 2. System Boundaries

```text
[ Web UI (Svelte Static) ] <----( HTTP )----\
                                            |
[ AI Agent (Claude, etc) ] <----( MCP )-----+----> [ Go Application Core ]
                                            |           |       |       |
[ Admin CLI / Scripts    ] <----( HTTP )----/           v       v       v
                                                    [SQLite] [LLM API] [RSS Feeds]
```

## 3. Core Modules (Go)

The Go backend avoids "Clean Architecture" bloat (no `IItemRepositoryImpl` interfaces for single implementations) but enforces clear boundaries.

*   `cmd/resofeed`: Main entry point. Wires up configuration, DB connection, and starts the HTTP/MCP servers.
*   `internal/app`: The "Shared Use-Case Layer". All business logic (e.g., `ResonateItem`, `AddSource`, `SearchItems`, `ExportState`). This is the only layer allowed to orchestrate the DB and LLM.
*   `internal/store`: The SQLite wrapper. Raw SQL queries using `database/sql` or `sqlc`. Enforces schema and transactions.
*   `internal/ingest`: Scheduled worker (using a simple Go `time.Ticker`). Fetches RSS, extracts text, calls the LLM for summarization, and saves to the store.
*   `internal/llm`: HTTP client wrapper for OpenAI/DeepSeek/Anthropic APIs. Responsible for retries, schema validation of JSON outputs, and translating errors into the canonical Fallback Taxonomy.
*   `internal/api`: The transport layer.
    *   `http_handler.go`: REST endpoints for the Svelte UI. Serves the static `/web/dist` directory.
    *   `mcp_adapter.go`: Implements the Model Context Protocol over remote Streamable HTTP (SSE). Translates MCP Tool Calls into `internal/app` use cases.

## 4. Frontend (SvelteKit)

*   **Framework:** SvelteKit configured with `@sveltejs/adapter-static`.
*   **Output:** Generates a folder of HTML/CSS/JS that is embedded into the Go binary using `go:embed`.
*   **Styling:** Vanilla CSS mapped 1:1 to `docs/DESIGN.md` tokens via CSS Custom Properties (`var(--font-metadata)`). No Tailwind, no UI libraries.
*   **Routing:** Client-side routing to support the desktop split-pane (Feed + Inspector) and the mobile full-screen Inspector route smoothly without page reloads.

## 5. Database Schema (SQLite)

The schema avoids soft-deletes where possible, preferring hard deletes to keep the database lean, except where `revision` tracking requires a tombstone for import merges.

*   **`sources`**
    *   `id` (TEXT/UUID, PK)
    *   `url` (TEXT, UNIQUE)
    *   `name` (TEXT)
    *   `revision` (INTEGER) - Monotonic counter for LWW merge.
*   **`items`**
    *   `id` (TEXT/UUID, PK)
    *   `source_id` (FK)
    *   `url` (TEXT, UNIQUE)
    *   `title` (TEXT)
    *   `summary` (TEXT)
    *   `extracted_text` (TEXT)
    *   `extraction_status` (TEXT) - `full`, `partial`, `failed`.
    *   `published_at` (INTEGER) - Unix timestamp from RSS.
*   **`steer_rules`**
    *   `id` (TEXT/UUID, PK)
    *   `rule_text` (TEXT)
    *   `is_active` (INTEGER) - 1 or 0 (soft delete needed for merging rule removals).
    *   `revision` (INTEGER) - Monotonic counter.
*   **`resonances`**
    *   `item_id` (FK, PK)
    *   `created_at` (INTEGER)
*   **`search_fts`**
    *   Virtual Table (FTS5) using the Porter stemmer or simple tokenizer. Indexes `items.title`, `items.summary`, `items.extracted_text`, and `sources.name`.

## 6. Merging & State Portability (CRDT-lite)

To satisfy the PRD's requirement for State Portability without a central sync server or event sourcing:

1.  **Export:** Generates a JSON file containing the `sources`, `steer_rules`, and `resonances` tables.
2.  **Import:** Reads the JSON file and executes SQLite `UPSERT` commands.
3.  **Conflict Resolution:** Uses Last-Write-Wins (LWW) based on the `revision` integer, **not** timestamps, avoiding device clock drift bugs.
    ```sql
    INSERT INTO steer_rules (id, rule_text, is_active, revision)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        rule_text = excluded.rule_text,
        is_active = excluded.is_active,
        revision = excluded.revision
    WHERE excluded.revision > steer_rules.revision;
    ```

## 7. LLM Operations

LLM operations are strictly scoped and synchronous where possible:

1.  **Item Summarization (Async):** The `internal/ingest` worker fetches the full HTML, cleans it, and POSTs to the LLM to generate a `summary` and `core_insight`. The output is strictly JSON validated against a schema before being saved to SQLite. If it fails, the `extraction_status` is updated according to the Fallback Taxonomy.
2.  **Steering Translation (Sync):** User inputs raw text: *"Less tech news"*. The Go backend POSTs to the LLM alongside the current `steer_rules`. The LLM returns a structured JSON payload dictating which rule IDs to soft-delete and what new rules to insert. The backend executes this as a single SQLite transaction and bumps the `revision`.

## 8. Agent Integration (MCP)

Agents connect to ResoFeed via a Remote Streamable HTTP (SSE) endpoint. The Go server exposes:

*   **Resources:** `resofeed://feed/today`, `resofeed://rules/active`, `resofeed://system/doctor`
*   **Tools:**
    *   `search_items(query string)` -> Returns FTS5 results.
    *   `read_item(id string)` -> Returns full extracted text and provenance.
    *   `resonate(id string)` -> Toggles the star.
    *   `steer(command string)` -> Translates natural language into rule updates.

Both the Web UI (via REST) and the Agent (via MCP) trigger the exact same `internal/app` functions, guaranteeing absolute behavioral parity.