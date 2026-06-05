# ResoFeed

ResoFeed is a self-hosted RSS intelligence workbench for one owner and trusted agents. It turns RSS/Atom feeds into a searchable daily briefing, keeps source provenance visible, and exposes the same operations through a web UI, JSON HTTP API, and MCP endpoint.

It is intentionally small in shape: one Go binary, one SQLite database, one web UI, and OpenRouter as a bounded JSON transformer.

## Who it is for

Use ResoFeed if you want to:

- follow many RSS/Atom sources without building an inbox-zero reader;
- get source-grounded summaries, key points, and search over your own feed corpus;
- steer future feed emphasis in natural language;
- let local or delegated agents inspect, search, resonate, and report delivery through MCP;
- run the whole thing on an always-on host you control.

ResoFeed is not a team SaaS, OAuth app, notification system, folder/tag reader, vector search product, RAG chatbot, or activity-dashboard platform.

## What you get

- **TODAY** — a dense daily surface for fresh feed items.
- **INSPECTOR** — source-backed detail view with provenance, original links, generated summaries, key points, and item-level re-ingest.
- **SOURCE LEDGER** — active sources, OPML import/export, manual source fetch, and all-source ingest.
- **Steer** — natural-language source add/search/policy commands.
- **SQLite FTS5 search** — lexical search with metadata filters; no embeddings or vector database.
- **Runtime language** — `en` / `zh` processing language for future ingest, plus explicit library reprocess for existing content.
- **MCP at `/mcp`** — agent access to the same product operations available to humans.
- **Portable state export/import** — active sources, active steering rules, and resonated items only.

## Fastest start with Docker

The published image is:

```text
tefx/resofeed:latest
```

If Docker reports a platform/manifest mismatch on your host, build the image locally from this repository with the Dockerfile and use that local tag instead.

Create a local runtime secret file. Do not commit it.

```text
# .env
OPENROUTER_KEY=<your-openrouter-key>
```

Run ResoFeed with persistent SQLite state:

```bash
docker volume create resofeed-data

docker run --rm -it \
  --name resofeed \
  --env-file .env \
  -p 8080:8080 \
  -v resofeed-data:/data \
  tefx/resofeed:latest \
  serve \
  --addr 0.0.0.0:8080 \
  --public-url http://127.0.0.1:8080 \
  --db /data/resofeed.sqlite3
```

On first startup, if `--owner-token` is omitted, ResoFeed generates an owner token, stores only its SHA-256 hash in SQLite, and prints the plaintext token once. Open `http://127.0.0.1:8080` and paste that token into the owner-token prompt.

If `OPENROUTER_KEY` is missing, the server can still start, but model-backed summaries, steering translation, re-ingest, and model listing are unavailable until the key is configured.

For production-style container notes, persistent volumes, Caddy examples, and Tailscale examples, see [`docs/CONTAINER.md`](docs/CONTAINER.md) and [`deploy/resofeed-caddy/`](deploy/resofeed-caddy/).

## Build from source

Requirements:

- Go compatible with `go.mod` (`go 1.22` or approved newer toolchain)
- Node/npm for the web build
- SQLite with FTS5 through the bundled Go driver

Build:

```bash
npm --prefix web install
npm --prefix web run build
mkdir -p ./bin
go build -o ./bin/resofeed ./cmd/resofeed
```

Run locally:

```bash
./bin/resofeed serve \
  --addr 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --db ./data/resofeed.sqlite3 \
  --first-fetch-limit 50 \
  --openrouter-model openai/gpt-4.1-mini
```

`--openrouter-model` is optional and non-secret. Omit it to use the OpenRouter account default. OpenRouter API keys must come from `OPENROUTER_KEY` in the OS environment or a local `.env` file, not CLI flags.

## First-use path

1. Start the server.
2. Copy the generated owner token from startup logs, or provide your own with `--owner-token`.
3. Open the UI and paste the token.
4. Add sources by pasting an RSS/Atom URL into Steer, or import OPML from Source Ledger.
5. Let background ingest run, or use Source Ledger `[RUN INGEST]` / row `[FETCH]` for immediate work.
6. Use Steer, Search, Resonate, and Inspector to curate what matters.

If you lose the plaintext owner token, stop the server and run the offline reset command against the SQLite database:

```bash
./bin/resofeed owner-token reset \
  --db ./data/resofeed.sqlite3 \
  --confirm-reset
```

Then start `serve` again to generate or set a replacement token. There is intentionally no HTTP, MCP, or browser UI reset path.

## Runtime boundaries

ResoFeed keeps the operational model deliberately narrow:

- one deployable command: `resofeed serve`;
- one SQLite database plus FTS5 as durable storage/search;
- one owner token for all `/api/*` and `/mcp` requests;
- OpenRouter as request/response JSON transformation only;
- no vector DB, embeddings, built-in RAG, semantic answer engine, queues, sidecars, background job services, teams, accounts, OAuth, folders, tags, unread-count workflows, or activity ledgers.

Existing-library reprocess is explicit and non-durable. It can take a long time for large libraries, runs as a bounded in-process operation, and does not become a job dashboard or persistent queue. If the hosting layer cancels the request or stops the process, rerun reprocess; ResoFeed prioritizes never/oldest-processed items first.

## HTTP and MCP

Static UI assets are public so the token prompt can load. Product operations require:

```text
Authorization: Bearer <OWNER_TOKEN>
```

Useful endpoints include:

- `GET /api/feed/today`
- `GET /api/sources`
- `POST /api/steer`
- `GET /api/search`
- `GET /api/runtime/operation`
- `GET/PUT /api/runtime/language`
- `POST /api/runtime/reprocess-library`
- `POST /api/items/{id}/reingest`
- `GET /api/doctor`
- `/mcp` for Streamable HTTP MCP

See [`docs/USAGE.md`](docs/USAGE.md) for examples and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the canonical contract.

## Documentation map

- [`docs/USAGE.md`](docs/USAGE.md) — practical commands, UI flow, HTTP examples, MCP examples.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime boundaries, state model, API contracts.
- [`docs/CONTAINER.md`](docs/CONTAINER.md) — container design and deployment contract.
- [`docs/DESIGN.md`](docs/DESIGN.md) — visual and interaction grammar.
- [`docs/PROMPTING_SYSTEM.md`](docs/PROMPTING_SYSTEM.md) — OpenRouter prompting and structured-output contract.
- [`docs/PRD.md`](docs/PRD.md) — product requirements and scope.

## Development checks

```bash
go test ./...
npm --prefix web test
```

The web test command runs Svelte checking and render tests. Browser/e2e tests live under `web/tests/e2e` for focused runtime proof when UI behavior changes.
