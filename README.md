# ResoFeed

ResoFeed is a single-tenant RSS intelligence workbench for one human owner and authorized delegated agents. It runs as one Go binary, stores durable state in one SQLite database, uses Gemini as a JSON-in/JSON-out transformer, and exposes the same product operations through the web UI, JSON HTTP API, and MCP Streamable HTTP at `/mcp`.

## Quick start

```bash
npm --prefix web install
npm --prefix web run build
mkdir -p ./bin
go build -o ./bin/resofeed ./cmd/resofeed
```

Configure the Gemini API key as a runtime-only secret before starting ResoFeed. Prefer an OS environment variable, service-manager secret, hosting-platform secret, or a local `.env` file that is never committed. Do not paste real API keys into runnable commands, shell history, logs, issue comments, or state exports.

Local `.env` fallback example:

```text
# .env is local-only; do not commit or print the real value.
GEMINI_API_KEY=<redacted-local-value>
```

```bash
./bin/resofeed serve \
  --addr 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --db ./data/resofeed.sqlite3 \
  --gemini-model gemini-2.5-flash
```

The transitional `--gemini-api-key` compatibility flag is intentionally not shown in quick-start commands because CLI secrets can be captured by shell history and process listings.

If `--owner-token` is omitted, first startup generates an owner token, stores only its SHA-256 hash in SQLite runtime metadata, and prints the plaintext token once. Paste that token into the local owner-token prompt at `http://127.0.0.1:8080`.

## Runtime boundaries

- One deployable command: `resofeed serve`.
- No separate `migrate`, `worker`, `doctor`, `admin`, or `sync` processes.
- SQLite + FTS5 is the only durable storage/search backend.
- Gemini is used only for summaries and steering translation; it does not own state or orchestration.
- State export/import covers active sources, active steering rules, and currently resonated items only.
- No accounts, teams, OAuth, folders, tags, unread-count flows, archive bins, vector search, embeddings, built-in RAG, or notification-channel ownership.

## Docs

- Usage and API examples: [`docs/USAGE.md`](docs/USAGE.md)
- Technical contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Visual/interaction contract: [`docs/DESIGN.md`](docs/DESIGN.md)
