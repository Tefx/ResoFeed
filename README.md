# ResoFeed

ResoFeed is a single-tenant RSS intelligence workbench for one human owner and authorized delegated agents. It runs as one Go binary, stores durable state in one SQLite database, uses OpenRouter as a JSON-in/JSON-out transformer, and exposes the same product operations through the web UI, JSON HTTP API, and MCP Streamable HTTP at `/mcp`.

## Quick start

```bash
npm --prefix web install
npm --prefix web run build
mkdir -p ./bin
go build -o ./bin/resofeed ./cmd/resofeed
```

Configure the OpenRouter API key as a runtime-only secret before using model-backed features. Prefer an OS environment variable, service-manager secret, hosting-platform secret, or a local `.env` file that is never committed. Do not paste real API keys into runnable commands, shell history, logs, issue comments, or state exports. If no key is configured, the server can still bind, but OpenRouter-backed operations are unavailable and model listing returns an empty list. HTTP model listing resolves secrets at request time as the explicit exception so safe env/`.env` changes can be reflected without persisting secrets.

Local `.env` fallback example:

```text
# .env is local-only; do not commit or print the real value.
OPENROUTER_KEY=<redacted-local-value>
```

```bash
./bin/resofeed serve \
  --addr 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --db ./data/resofeed.sqlite3 \
  --first-fetch-limit 50 \
  --openrouter-model openai/gpt-4.1-mini
```

`--openrouter-model` is optional and non-secret; omit it to use the OpenRouter account default. `--first-fetch-limit` caps a brand-new source's first stored items: default `50`, `RESOFEED_FIRST_FETCH_LIMIT` fallback when the flag is omitted, `0` means unlimited, and the maximum is `500`; non-integer, negative, or greater-than-`500` values fail startup before binding. OpenRouter API keys must come from the OS environment or local `.env`, not CLI flags.

If `--owner-token` is omitted, first startup generates an owner token, stores only its SHA-256 hash in SQLite runtime metadata, and prints the plaintext token once. Paste that token into the local owner-token prompt at `http://127.0.0.1:8080`.

## Runtime boundaries

- One deployable command: `resofeed serve`.
- No separate `migrate`, `worker`, `doctor`, `admin`, or `sync` processes.
- SQLite + FTS5 is the only durable storage/search backend.
- OpenRouter is used only for summaries and steering translation; it does not own state or orchestration.
- Runtime processing language is controlled through `GET/PUT /api/runtime/language` and MCP `get_processing_language` / `set_processing_language`; it is persisted as runtime metadata and excluded from portable state.
- Existing-library reprocess is an immediate owner-authorized operation through `POST /api/runtime/reprocess-library` and MCP `reprocess_library`; it rebuilds FTS and reports live receipt/idempotency status without durable jobs, queues, or activity logs.
- Delivery handoff is reported through `POST /api/items/{id}/delivery` and MCP `report_delivery`; it records `external_surfaced_at` with live idempotency/fingerprint protection, not a delivery registry.
- State export/import covers active sources, active steering rules, and currently resonated items only.
- No accounts, teams, OAuth, folders, tags, unread-count flows, archive bins, vector search, embeddings, built-in RAG, or notification-channel ownership.

## Docs

- Usage and API examples: [`docs/USAGE.md`](docs/USAGE.md)
- Technical contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Container packaging and runtime usage: [`docs/CONTAINER.md`](docs/CONTAINER.md)
- Non-core Tailscale deployment example: [`docs/examples/TAILSCALE_CONTAINER.md`](docs/examples/TAILSCALE_CONTAINER.md)
- Prompting contract: [`docs/PROMPTING_SYSTEM.md`](docs/PROMPTING_SYSTEM.md)
- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Visual/interaction contract: [`docs/DESIGN.md`](docs/DESIGN.md)
