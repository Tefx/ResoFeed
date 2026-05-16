# Blind Liveness Probe: srde2e-final-closure-gate-rerun-blind-liveness

Date: 2026-05-16
Worktree: `.vectl/worktrees/srde2e-final-closure-gate-rerun-blind-liveness`
Branch: `vectl/step-srde2e-final-closure-gate-rerun-blind-liveness`

## Verdict

- Headline: PASS
- Verdict: PASS
- Gate open allowed: true
- Blockers: []

## Public Surfaces Exercised

- Built documented single Go binary via `npm --prefix web install`, `npm --prefix web run build`, and `go build -o ./bin/resofeed ./cmd/resofeed`.
- Started documented `./bin/resofeed serve` command with public flags on `127.0.0.1:18080` using an isolated SQLite DB and explicit owner token.
- Verified network liveness with `lsof -nP -iTCP:18080 -sTCP:LISTEN`.
- Fetched static UI root `/`: HTTP `200 text/html`; visible text sample `RESOFEED Enter owner token Owner token [SUBMIT]`; 2 interactive controls; owner-token prompt present.
- Verified owner-token gate: unauthenticated `GET /api/feed/today` returned HTTP `401` with `unauthorized` error body.
- Verified JSON HTTP: authenticated `GET /api/feed/today?limit=2` returned HTTP `200` with `{"items":[]}`.
- Verified strict query validation: authenticated `GET /api/feed/today?bogus=1` returned HTTP `400` with `details.field: "bogus"`.
- Verified Source Ledger / Steer liveness: authenticated `POST /api/steer` with `https://example.com/feed.xml` returned HTTP `200`, `interpreted_as: add_source`; authenticated `GET /api/sources` then returned one active source row.
- Verified lexical search surface: authenticated `GET /api/search?q=sqlite&limit=3` returned HTTP `200`, `items: []`, and query echo `q: sqlite`, `limit: 3`.
- Verified `/api/doctor`: authenticated request returned HTTP `200 text/plain` with `search_fts: ok`, `ingest: last_run=never`, and redacted/no-secret OpenRouter status lines.
- Verified MCP owner-token gate: unauthenticated `POST /mcp` returned HTTP `401` with `unauthorized` error body.
- Verified MCP liveness and parity: authenticated JSON-RPC `initialize` returned HTTP `200`; authenticated `tools/list` returned tool declarations including `list_candidate_items`, `search_items`, `read_item`, `mark_inspected`, and `resonate_item`; authenticated `tools/call get_processing_language` returned `en`; authenticated `tools/call search_items {query:"sqlite",limit:3}` returned the same empty result/query echo as HTTP search.

## Real Integration vs Fixture Data

This was a real single-binary liveness probe: the documented Svelte build and Go binary were built, the binary bound a TCP port, served static UI, enforced auth, opened/migrated a real isolated SQLite file, and handled HTTP/MCP requests over the network. Fixture data was limited to an inert public RSS URL (`https://example.com/feed.xml`) added through the public Steer endpoint; no direct SQLite writes, private hooks, implementation imports, or mocked transports were used. No real OpenRouter call was attempted; startup used a non-secret placeholder `OPENROUTER_KEY` because docs state startup requires a resolved non-empty key and does not validate the model over the network.

## Behavioral Proof Register

- Single binary binds documented HTTP/MCP/UI address: PROVEN
- Static UI renders visible owner-token prompt and interactive controls: PROVEN
- `/api/*` owner-token gate rejects missing token: PROVEN
- Authenticated JSON HTTP feed/source/search/doctor surfaces respond: PROVEN
- Strict unknown query rejection on `/api/feed/today`: PROVEN
- Source Ledger mutation via public Steer and source listing: PROVEN
- Lexical search endpoint returns query echo and no semantic/RAG answer envelope: PROVEN
- MCP endpoint owner-token gate rejects missing token: PROVEN
- MCP search/tool parity with HTTP search: PROVEN
- Live RSS ingestion and OpenRouter summarization: NOT RUN (out of scope for bounded liveness; no real external secret/network dependency used)

## Gaps / Notes

- `npm --prefix web install` reported 5 npm audit vulnerabilities (3 low, 1 moderate, 1 high). This is dependency hygiene debt, not a blocker-class liveness failure for this probe.
- The first probe command emitted a zsh no-match warning while clearing optional prior artifact files; the server still started and all liveness probes completed.
