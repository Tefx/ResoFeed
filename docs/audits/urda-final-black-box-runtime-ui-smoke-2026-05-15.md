# URDA Final Black-Box Runtime UI Smoke

Date: 2026-05-15

Tester: `blind-tester`

Independence level: L3

Verdict: **PASS**

## Scope and Method

This audit performed a black-box runtime smoke of the repaired ResoFeed UI/runtime from public interfaces only. Product implementation source was not inspected. The live server was built and launched as the real `resofeed serve` binary with an isolated SQLite database and explicit owner token.

Required refs were read before testing:

- `docs/audits/ui-runtime-design-audit-2026-05-15.md`: prior failures centered on missing Source Ledger `[RUN INGEST]`, missing row `[FETCH]`, OPML import semantics, Search, Inspector original link, owner-token rejected state, `/doctor`, and mobile surfaces.
- `docs/ARCHITECTURE.md`: one Go binary via `resofeed serve`; documented flags `--addr`, `--public-url`, `--db`, `--openrouter-model`, `--owner-token`; no sidecar/worker/admin/manual-ingest CLI; all `/api/*` routes owner-token protected.
- `docs/DESIGN.md`: Source Ledger must expose `[RUN INGEST]`, per-source `[FETCH]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`; owner-token prompt must show `err: owner token rejected`; mobile feed/Inspector/Ledger must remain usable.
- `docs/USAGE.md`: build/run usage, owner-token behavior, Source Ledger manual refresh through UI, `/doctor`, and explicit prohibition on separate `migrate`, `worker`, `doctor`, `admin`, or `sync` processes.

## Commands and Runtime Evidence

Build and launch commands used:

```bash
npm --prefix web install
npm --prefix web run build
go build -o .test-artifacts/final-smoke/resofeed ./cmd/resofeed

OPENROUTER_KEY=<redacted> RESOFEED_E2E=1 \
  .test-artifacts/final-smoke/resofeed serve \
  --addr 127.0.0.1:18080 \
  --public-url http://127.0.0.1:18080 \
  --db .test-artifacts/final-smoke/runtime.sqlite3 \
  --owner-token <redacted>
```

Server liveness evidence:

```text
COMMAND    PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
resofeed 88432 tefx    6u  IPv4 ...    0t0      TCP 127.0.0.1:18080 (LISTEN)
```

Startup log excerpt:

```text
owner token explicit: stored hash
serving ResoFeed on 127.0.0.1:18080 (public-url http://127.0.0.1:18080)
```

HTTP liveness/auth evidence:

```text
GET /                           -> 200 text/html, 2260 bytes
GET /api/feed/today (no auth)   -> 401 application/json
GET /api/feed/today (owner)     -> 200 application/json, {"items":[]}
```

Unauthorized body:

```json
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

## CLI Surface Preservation Matrix

Root help listed exactly these command surfaces:

```text
Usage: resofeed <command>

Commands:
  serve    Start web UI, JSON HTTP API, MCP endpoint, SQLite, and background ingest.
  owner-token reset --db PATH --confirm-reset
           Offline command for deleting only the stored owner-token hash.

Run "resofeed serve --help" or "resofeed owner-token reset --help" for flags.
```

`resofeed serve --help` preserved the runtime flags:

```text
Usage: resofeed serve [flags]

Starts the single ResoFeed runtime: static UI, JSON HTTP API, MCP at /mcp,
SQLite migrations, owner-token auth, and background ingest.

Flags:
  -addr string
  -db string
  -openrouter-model string
  -owner-token string
  -public-url string
```

`resofeed owner-token reset --help` exited 0 and printed:

```text
Usage: resofeed owner-token reset --db PATH --confirm-reset

Runs the documented offline owner-token reset command. It
deletes only runtime_metadata.key='owner_token_sha256' while serve is stopped.
```

| Command | Surface Listed? | Handler Exists? | `--help` Works? | Smoke Test | Status |
|---|---:|---:|---:|---|---|
| `resofeed serve` | yes | yes | yes, exit 0 | real server bound `127.0.0.1:18080`; root HTML and authenticated API returned 200 | PASS |
| `resofeed owner-token reset` | yes | yes | yes, exit 0 | invalid DB smoke returned `err: invalid_db: cannot open sqlite database`, exit 2, not no-handler/unimplemented | PASS |

Parent `resofeed owner-token --help` returned `err: unknown_command: expected owner-token reset`, exit 2. This was not treated as a dangling listed command because root help lists the full `owner-token reset` command, not `owner-token` as a standalone command.

## Documented Flag Matrix

| Surface | Expected | Actual | Verdict |
|---|---|---|---|
| `resofeed serve` one process | one Go binary | one `resofeed` process served UI/API/MCP address; no sidecar observed or required | PASS |
| `--addr` | preserved | present in `serve --help`; used to bind `127.0.0.1:18080` | PASS |
| `--public-url` | preserved | present in `serve --help`; startup logged `http://127.0.0.1:18080` | PASS |
| `--db` | preserved | present in `serve --help`; isolated smoke DB used | PASS |
| `--owner-token` | preserved | present in `serve --help`; explicit token accepted and wrong browser token rejected | PASS |
| no new manual ingest/fetch CLI | preserved | manual ingest/fetch operated through Source Ledger UI and HTTP API; no extra CLI listed or required | PASS |

## Public Workflow Matrix

| Workflow | Public evidence | Network/API evidence | Verdict |
|---|---|---|---|
| Owner token rejected-token state | Browser prompt showed `RESOFEED`, `Enter owner token`; entering a wrong token showed `err: owner token rejected` and kept the input available | unauthenticated `/api/feed/today` returned 401 with canonical JSON error | PASS |
| Authenticate with owner token | Correct owner token loaded the live Today feed with Hacker News items | authenticated `/api/feed/today` returned 200 | PASS |
| Source Ledger `[RUN INGEST]` | Source Ledger showed `[RUN INGEST]`; click changed visible text to `[INGESTING...]`; settled state restored `[RUN INGEST]` and showed `last_ingest: 05:13:23` | `POST /api/ingest` returned `status:"completed"`, `sources_attempted:1`, `sources_succeeded:1`, `items_upserted:20` | PASS |
| Source Ledger row `[FETCH]` | source row showed `[FETCH]`; click changed visible text to `[FETCHING...]`; settled state restored `[FETCH]` and showed `last_fetch: 05:14:29` | `POST /api/sources/src_6a418c5313a09d59/fetch` returned `status:"completed"`, `sources_succeeded:1`, source `last_fetch_status:"ok"` | PASS |
| OPML import button focus/activation | Source Ledger exposed `[IMPORT OPML]` as a named button; upload imported an OPML fixture and rendered `imported 1 sources; folders flattened` plus new xkcd row | source list included `https://xkcd.com/rss.xml` after import | PASS |
| State export/import reachability | `[EXPORT STATE]` showed `exported state.json`; `[IMPORT STATE]` upload of exported bundle showed `import complete` | exported JSON included `schema_version:"resofeed.state.v1"`, two sources, empty rules/stars | PASS |
| Search | Steer command `search Claude` opened `SEARCH` surface with `2 results`, filters, `match: lexical index`, and `provenance: source-backed` | CDP network captured `/api/search?q=Claude` status 200; console logged `search status 200` | PASS |
| Feed | Today feed rendered multiple Hacker News rows with metadata, titles, excerpts, and stars | CDP network captured `/api/feed/today` status 200 and `/api/feed/today?limit=2` status 200 | PASS |
| Inspector original link | Opening a feed row rendered Inspector with selected item title and `original link` | CDP network captured `/api/items/item_ada8f7e2d7fd6a728db999fd53c23f1a` status 200 | PASS |
| `/doctor` | Steer command `/doctor` rendered raw diagnostics including `openrouter:` lines | `/api/doctor` returned text diagnostics; no API key was exposed | PASS |
| mobile feed | CDP viewport `390x844`, `mobile:true`; mobile feed text included `Today feed items`, source metadata, titles, excerpts, and star glyphs | live authenticated page under mobile emulation | PASS |
| mobile Inspector | mobile Inspector text included `back to TODAY`, `INSPECTOR`, star, selected title, and `original link` | live authenticated page under mobile emulation | PASS |
| mobile Source Ledger | mobile Source Ledger text included `[IMPORT OPML]`, `[RUN INGEST]`, per-row `[FETCH]`, `[DELETE]`, `[DETAILS]`, `[EXPORT STATE]`, `[IMPORT STATE]` | live authenticated page under mobile emulation | PASS |

## Key API Evidence

Source added through public Steer API:

```json
{"receipt":{"interpreted_as":"add_source","changed_rules":[],"message":"source added: hnrss.org; visible in SOURCE LEDGER; use [RUN INGEST] or row [FETCH] there for immediate refresh"}}
```

Manual ingest result:

```json
{
  "ingest": {
    "scope": "all",
    "source_id": null,
    "status": "completed",
    "sources_attempted": 1,
    "sources_succeeded": 1,
    "sources_failed": 0,
    "items_upserted": 20,
    "errors": []
  }
}
```

Manual row fetch result:

```json
{
  "ingest": {
    "scope": "source",
    "source_id": "src_6a418c5313a09d59",
    "status": "completed",
    "sources_attempted": 1,
    "sources_succeeded": 1,
    "sources_failed": 0,
    "items_upserted": 20,
    "errors": []
  },
  "source": {
    "id": "src_6a418c5313a09d59",
    "url": "https://hnrss.org/frontpage",
    "title": "Hacker News: Front Page",
    "last_fetch_status": "ok"
  }
}
```

State export shape:

```json
{
  "schema_version": "resofeed.state.v1",
  "sources": [
    {"id":"src_6a418c5313a09d59","url":"https://hnrss.org/frontpage","title":"Hacker News: Front Page"},
    {"id":"src_a106f58b1577ab5bef134dbfc8234953","url":"https://xkcd.com/rss.xml","title":"xkcd.com"}
  ],
  "steer_rules": [],
  "resonated_items": []
}
```

CDP network summary included these successful public responses:

```json
[
  {"status":200,"mimeType":"text/html","url":"http://127.0.0.1:18080/"},
  {"status":200,"mimeType":"application/json","url":"http://127.0.0.1:18080/api/sources"},
  {"status":200,"mimeType":"application/json","url":"http://127.0.0.1:18080/api/feed/today"},
  {"status":200,"mimeType":"application/json","url":"http://127.0.0.1:18080/api/steer/active"},
  {"status":200,"mimeType":"application/json","url":"http://127.0.0.1:18080/api/items/item_ada8f7e2d7fd6a728db999fd53c23f1a"},
  {"status":200,"mimeType":"application/json","url":"http://127.0.0.1:18080/api/feed/today?limit=2"},
  {"status":200,"mimeType":"application/json","url":"http://127.0.0.1:18080/api/search?q=Claude"}
]
```

Console evidence contained only expected test logs:

```text
feed status 200
search status 200
```

## Accessibility and Screenshot Inventory

Temporary full artifacts were written under `.test-artifacts/final-smoke/` during the run. The important inventory was:

- Desktop screenshots: token prompt, rejected token, authenticated feed, Source Ledger, run ingest, fetch settled, OPML imported, state exported, state imported, Search, `/doctor`, Inspector original link.
- Mobile screenshots: `mobile-feed.png`, `mobile-inspector.png`, `mobile-source-ledger.png` at `390x844` with `mobile:true`.
- Accessibility/state snapshots: `browser-state-*.txt` from browser-use and CDP AX snapshots for mobile feed, mobile Inspector, and mobile Source Ledger.
- Network/console evidence: CDP network summary and console event JSON.

Representative mobile text evidence:

```text
Today feed items
src: Hacker News: Front Page · 1h · full · fallback · quality: full
How Claude Code works in large codebases
☆
```

Representative mobile Inspector text evidence:

```text
back to TODAY
INSPECTOR
src: Hacker News: Front Page · full
☆
How Claude Code works in large codebases
original link
```

Representative mobile Source Ledger text evidence:

```text
SOURCE LEDGER
[IMPORT OPML]
[RUN INGEST]
src: Hacker News: Front Page
url: https://hnrss.org/frontpage
last_fetch: not_fetched
[FETCH]
[DELETE]
[DETAILS]
[EXPORT STATE]
[IMPORT STATE]
```

## Gaps and Non-Blocking Notes

- The isolated worktree did not initially contain installed web dependencies; `npm --prefix web install` was required before `npm --prefix web run build` could find `vite`.
- `npm install` reported 5 dependency vulnerabilities. This audit did not evaluate dependency remediation because the assigned scope was runtime UI smoke.
- `/doctor` showed OpenRouter timeout/fallback diagnostics because a dummy redacted OpenRouter key was used for local smoke. Feed ingestion, fallback display, Search, and UI workflows still operated through public surfaces.

## Final Verdict

PASS. The repaired runtime/UI satisfied the required black-box smoke: one real `resofeed serve` process launched, documented CLI flags remained available, no new manual ingest/fetch CLI or sidecar was required, owner-token auth worked, Source Ledger manual ingest/fetch controls were present and functional, OPML/state/Search/feed/Inspector/doctor/mobile surfaces were reachable, and public API/network evidence showed successful behavior without implementation-source inspection.
