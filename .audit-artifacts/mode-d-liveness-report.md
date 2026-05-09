# Blind Tester Mode D Liveness Report

## Refs confirmation

- `docs/USAGE.md:24-30` documents the build contract: `npm --prefix web install`, `npm --prefix web run build`, `go build -o ./bin/resofeed ./cmd/resofeed`.
- `docs/USAGE.md:35-43` documents `resofeed serve` and that one process starts web UI, JSON HTTP API, MCP `/mcp`, background ingestion, SQLite migration, and static assets.
- `docs/USAGE.md:58-79` documents explicit owner-token behavior, hash-only storage, protected HTTP/MCP usage, and minimum 32-character explicit tokens.
- `docs/USAGE.md:89-95` documents UI first open: paste owner token, stored as `resofeed.ownerToken`, sent as `Authorization: Bearer <OWNER_TOKEN>` for `/api/*`.
- `docs/USAGE.md:183-210`, `326-414`, and `633-700` document `/api/feed/today`, `/api/search`, state export/import, `/api/doctor`, and MCP Streamable HTTP at `/mcp`.
- `docs/ARCHITECTURE.md:19` and `529-535` require static UI assets to load unauthenticated, while every `/api/*` and every `/mcp` request requires the owner token and returns `401` on missing/invalid auth.
- `docs/ARCHITECTURE.md:741-757` defines endpoint success contracts for feed, search, state export/import, and doctor.
- `docs/ARCHITECTURE.md:785-854` defines MCP resources/tools, auth boundary, and read-only tools/resources.
- `docs/DESIGN.md:371-389` defines the owner token prompt and first-use empty state copy.
- `docs/PRD.md:559-581` defines AC-12 unauthorized agent action, AC-16 state portability, and AC-17 diagnostics output.

## Commands and observed outputs

```text
$ pwd && git branch --show-current
/Users/tefx/Projects/ResoFeed/.vectl/worktrees/end-to-end-integration.end-to-end-gate-blind-mode-d
vectl/step-end-to-end-integration.end-to-end-gate-blind-mode-d

$ npm --prefix web install && npm --prefix web run build && go build -o ./bin/resofeed ./cmd/resofeed
added 150 packages, and audited 151 packages in 1s
vite build completed; static site written to web/build; Go binary built at ./bin/resofeed

$ ./bin/resofeed serve --addr 127.0.0.1:18080 --public-url http://127.0.0.1:18080 --db ./.audit-artifacts/mode-d.sqlite3 --gemini-api-key dummy-gemini-key-for-liveness --gemini-model gemini-2.5-flash --owner-token rfeed_blind_mode_d_0123456789abcdef
server log: owner token explicit: stored hash; serving ResoFeed on 127.0.0.1:18080

$ lsof -nP -iTCP:18080 -sTCP:LISTEN
resofeed listening on 127.0.0.1:18080
```

### UI / first-use

```text
GET / -> 200 text/html; charset=utf-8
SSR visible text: RESOFEED Enter owner token Owner token submit Token stays in this browser as resofeed.ownerToken and is sent to local /api/* requests.
SSR interactive elements: 2

Browser with localStorage resofeed.ownerToken set:
visible text: skip to feed Steer or paste RSS URL > RESOFEED TODAY SOURCE LEDGER First use Paste RSS URL in Steer or import OPML. Inspect opens the item. Star preserves durable value. Steer is optional correction. INSPECTOR
interactive elements: 16
first-use required lines: all present
forbidden visible terms checked: accounts/login/sync/cloud/RAG/vector/SEARCH/STATE top-level peers: none found
```

### Auth boundary

```text
GET /api/feed/today without Authorization -> 401 application/json; charset=utf-8
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}

POST /mcp without Authorization -> 401 application/json; charset=utf-8
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

### Authenticated HTTP surfaces

```text
GET /api/feed/today -> 200 application/json; charset=utf-8
{"items":[]}

GET /api/search?q=sqlite&limit=20 -> 200 application/json; charset=utf-8
{"items":[],"query":{"q":"sqlite","source":null,"from":null,"to":null,"resonated":null,"limit":20}}

GET /api/doctor -> 200 text/plain; charset=utf-8
rss: ok
gemini: ok
extraction: ok
ingest: last_run=never

GET /api/state/export -> 200 application/json; charset=utf-8
schema_version=resofeed.state.v1; sources=[]; steer_rules=[]; resonated_items=[]

POST /api/state/import with exported bundle -> 200 application/json; charset=utf-8
{"restored":{"sources":0,"steer_rules":0,"resonated_items":0}}
```

### Authenticated MCP

```text
POST /mcp initialize -> 200 application/json; charset=utf-8
capabilities include resources and tools; protocolVersion=2025-03-26; serverInfo.name=resofeed

POST /mcp tools/list -> 200 application/json; charset=utf-8
tools include list_candidate_items, search_items, read_item, mark_inspected, resonate_item, steer, report_delivery

POST /mcp resources/list -> 200 application/json; charset=utf-8
resources include resofeed://feed/today, resofeed://rules/active, resofeed://system/doctor, resofeed://sources

POST /mcp tools/call list_candidate_items {"limit":5} -> 200 application/json; charset=utf-8
content text: {"items":[]}
```

Note: a best-effort `notifications/initialized` POST returned JSON-RPC `method not found`; this did not block initialize, resources/list, tools/list, or a read-only tool call through the public MCP endpoint.

## Verdict

ALIVE. Network port bound, static UI served HTML, token prompt and first-use empty state reachable, required auth boundaries enforced, authenticated HTTP endpoints live, state export/import roundtrip live, and MCP initialize/list/read-only call live.

## Blockers

None.
