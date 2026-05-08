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

The Go backend violently rejects "Clean Architecture" bloat (no `internal/app`, no `internal/domain`, no `IItemRepository` interfaces). We use an extremely flat, file-oriented package structure.

*   `cmd/resofeed`: The only `main` package. Parses configuration, opens the SQLite file, runs migrations, starts the ingest loop, and starts the HTTP/MCP servers.
*   `internal/resofeed`: The single application package containing all logic, separated by file rather than by abstract layers.
    *   `types.go`: Canonical structs (`Source`, `Item`, `SteerRule`, `Resonance`).
    *   `db.go`: Direct SQLite wrappers (`*sql.DB` or `sqlc` generated code). No generic repository interfaces.
    *   `migrations.go`: Embedded SQL schema migrations.
    *   `llm.go`: Dumb HTTP client wrapper for OpenAI/Anthropic APIs. Handles retries and schema validation.
    *   `feeds.go`: RSS/Atom fetching and parsing.
    *   `extract.go`: HTML-to-text extraction.
    *   `ingest.go`: The background scheduler (using a simple Go `time.Ticker`). Orchestrates `feeds` -> `extract` -> `llm` -> `db`.
    *   `http.go`: REST endpoints for the Svelte UI. Serves the static `/web/dist` directory.
    *   `mcp.go`: Implements the Model Context Protocol over remote Streamable HTTP (SSE). Translates MCP Tool Calls into the exact same DB/LLM functions used by `http.go`.

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

1.  **Item Summarization (Async):** The `ingest.go` worker fetches the full HTML, cleans it, and POSTs to the LLM to generate a `summary` and `core_insight`. The output is strictly JSON validated against a schema before being saved to SQLite. If it fails, the `extraction_status` is updated according to the Fallback Taxonomy.
2.  **Steering Translation (Sync):** User inputs raw text: *"Less tech news"*. The Go backend POSTs to the LLM alongside the current `steer_rules`. The LLM returns a structured JSON payload dictating which rule IDs to soft-delete and what new rules to insert. The backend executes this as a single SQLite transaction and bumps the `revision`.

## 8. Agent Integration (MCP)

Agents connect to ResoFeed via a Remote Streamable HTTP (SSE) endpoint. The Go server exposes:

*   **Resources:** `resofeed://feed/today`, `resofeed://rules/active`, `resofeed://system/doctor`
*   **Tools:**
    *   `search_items(query string)` -> Returns FTS5 results.
    *   `read_item(id string)` -> Returns full extracted text and provenance.
    *   `resonate(id string)` -> Toggles the star.
    *   `steer(command string)` -> Translates natural language into rule updates.

Both the Web UI (via `http.go`) and the Agent (via `mcp.go`) trigger the exact same package-level functions in `internal/resofeed`, guaranteeing absolute behavioral parity.