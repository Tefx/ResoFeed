# Live OpenRouter Smoke Evidence Retry

step_intent: retest_green
expected_result: green
observed_result: green
failure_alignment: matches expected
verdict: PASS
blockers: []
product_implementation_files_modified: false
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
headline: PASS
proof_gap_status: NONE
blocking_status: CLOSED

**Tester**: blind-tester
**Independence Level**: L3

## refs Read Confirmation

- AGENTS.md — NOT READ: no tracked `AGENTS.md` exists at isolated worktree root (`git ls-files -- AGENTS.md` returned no file).
- .agents/instructions.md — Read lines 8-35 and 25-31: one `cmd/resofeed` binary, one SQLite DB, OpenRouter runtime-only secret handling, `OPENROUTER_KEY` OS/local `.env` precedence, no CLI secret flags, owner-token auth, and strict HTTP validation.
- docs/ARCHITECTURE.md — Read lines 11-19 and 69-82: `resofeed serve` is the single runtime; OpenRouter is sole LLM backend; omitted model means `account_default`; OpenRouter key must resolve from OS env or local `.env` and must not be logged, persisted, exported, or exposed by `/doctor`.
- docs/DESIGN.md — Read lines 247-263 and 159-177: UI must show operational chrome (`RESOFEED`, `TODAY`, `SOURCE LEDGER`, `/doctor`), owner-token prompt, first-use empty state, state portability, and diagnostic output surfaces.
- docs/USAGE.md — Read lines 24-74, 139-239, 336-443, and 648-741: build/run command, no CLI OpenRouter key, auth header, feed/search validation, OPML import, state export, `/api/doctor`, and MCP `/mcp` resources/tools.

## Secret Handling

- `.env`/OPENROUTER_KEY value was not printed: only key presence was checked; captured outputs were scanned for the actual key without emitting it.
- `.env` was not committed or staged: pre-commit status showed `.env` as untracked and it was not added.
- Owner token value redacted: the non-secret test token was scanned for and excluded from committed artifacts/evidence.
- Commands run without shell tracing secrets: no `set -x`; no CLI OpenRouter key flag; server was started with `OPENROUTER_KEY`/`OPENROUTER_API_KEY` removed from OS env so local `.env` fallback was exercised without sourcing or printing `.env`.

## Commands Executed

```text
git status --short && git branch --show-current && git ls-files -- AGENTS.md .agents/instructions.md .env
python3 <presence check for .env OPENROUTER_KEY without printing values>
go build -o .audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/resofeed ./cmd/resofeed
go run ./cmd/resofeed --help
.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/resofeed serve --help
env -u OPENROUTER_KEY -u OPENROUTER_API_KEY <artifact-binary> serve --addr 127.0.0.1:<PORT> --public-url http://127.0.0.1:<PORT> --db <artifact-temp-db> --owner-token <OWNER_TOKEN_REDACTED>
GET /api/feed/today without Authorization
GET /api/feed/today with Authorization: Bearer <OWNER_TOKEN_REDACTED>
GET /api/search?unknown=1 with Authorization: Bearer <OWNER_TOKEN_REDACTED>
GET /api/search?q=x&q=y with Authorization: Bearer <OWNER_TOKEN_REDACTED>
GET /api/search?q=sqlite&limit=5 with Authorization: Bearer <OWNER_TOKEN_REDACTED>
GET /api/doctor with Authorization: Bearer <OWNER_TOKEN_REDACTED>
GET /api/state/export with Authorization: Bearer <OWNER_TOKEN_REDACTED>
POST /api/sources/import-opml with Authorization: Bearer <OWNER_TOKEN_REDACTED>
POST /api/steer with Authorization: Bearer <OWNER_TOKEN_REDACTED>
POST /mcp initialize, tools/list, resources/list, tools/call steer with Authorization: Bearer <OWNER_TOKEN_REDACTED>
GET / UI smoke without Authorization
python3 <artifact scan for actual OpenRouter key and owner-token leakage without printing values>
git status --short
```

## Actual Redacted Output

```text
env_file_present=True
openrouter_key_present=True
openrouter_api_key_alias_present=False

Usage: resofeed <command>
Commands:
  serve    Start web UI, JSON HTTP API, MCP endpoint, SQLite, and background ingest.

Usage: resofeed serve [flags]
Flags:
  -addr string
  -db string
  -openrouter-model string     optional OpenRouter model (empty uses account default)
  -owner-token string
  -public-url string

Server start: pid=<pid>, root_status=200, tcp_connect=True
Auth/feed: unauth=401 auth=200 auth_body={"items":[]}
Search: unknown=400 duplicate=400 valid=200 valid_body={"items":[],"query":{"q":"sqlite","source":null,"from":null,"to":null,"resonated":null,"limit":5}}
Doctor: rss: ok
openrouter: ok configured_model=account_default resolved_model=unknown
extraction: ok
State export: schema_version=resofeed.state.v1, sources=[], steer_rules=[], resonated_items=[], leaks=[]
OPML import: status=200 body={"imported":1,"skipped":0,"folders_flattened":true}
HTTP steer: status=200 body={"receipt":{"interpreted_as":"add_source","changed_rules":[],"message":"source added"}}
MCP: init=200 tools=200 resources=200 steer=200 missing=[]; observed list_candidate_items, search_items, read_item, resonate_item, steer, resofeed://feed/today, resofeed://system/doctor
UI documented root: status=200 content-type=text/html; visible text includes RESOFEED / Enter owner token / Paste RSS URL in Steer; interactive_count=1
Secret/log scan: key_leak=False owner_leak=False visible_bad=[]
```

## Smoke Matrix

| Surface | Operation | Expected | Observed | Status |
|---|---|---|---|---|
| Build | `cmd/resofeed` | binary builds | `go build -o ... ./cmd/resofeed` exited 0 | PASS |
| Server | `resofeed serve` | starts using `.env`/OS key, no CLI API-key flag, omitted model | started on temp port, TCP connect ok, root returned 200; `OPENROUTER_KEY` OS env removed to exercise `.env` fallback | PASS |
| Auth | unauth/auth | unauth rejected; owner accepted | `/api/feed/today` unauth 401, authorized 200 | PASS |
| Feed | `/api/feed/today` | reachable | `200 {"items":[]}` | PASS |
| Search | `/api/search` | strict validation | unknown param 400, duplicate `q` 400, valid search 200 | PASS |
| Doctor | `/api/doctor` | `openrouter:` no secrets; account default when model omitted | `openrouter: ok configured_model=account_default resolved_model=unknown`; no key/source/path/provider config | PASS |
| State | `/api/state/export` | no runtime config | exported portable state only; no OpenRouter key, env source, `.env` path, model/provider config, or secret fields | PASS |
| OPML | import path | not portable state restore | OPML import returned `imported:1`, `folders_flattened:true`; response not state restore | PASS |
| MCP | initialize/tools/resources/steer | parity | initialize/tools/list/resources/list/tools/call steer all 200; tools/resources cover candidate feed, search, read, resonate, steer, doctor/source resources | PASS |
| UI | page load | nonblank | documented root returned HTML with visible `RESOFEED`/owner-token/first-use text and an input; `/doctor` is a Steer/API diagnostic, not a documented frontend route | PASS |
| Live-visible provider cleanup | logs/help/UI/API/MCP | no Gemini and no CLI-secret instructions | captured help/log/API/MCP/UI artifacts contained no `gemini`, no CLI API-key flag, and no OpenRouter key/owner token | PASS |

## Issues Found

| Severity | Description | Location | Reproduction | Gate Intersection |
|---|---|---|---|---|
| Non-blocking note | The first UI smoke script also probed `/doctor` as a frontend route and received 404. Docs define `/doctor` as a Steer command and `/api/doctor` endpoint, while the documented UI URL is `/`; a corrected documented-route recheck passed. | `.audit-artifacts/.../smoke-results.json` and `ui-recheck.json` | Compare raw smoke script route list with `docs/USAGE.md` lines 118-124 and 430-443. | Does not block OpenRouter gate; root UI and `/api/doctor` passed. |

## Artifact

- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test-retry.md`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/doctor.txt`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/mcp-snippets.txt`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/server.log`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/smoke-results.json`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/state-export.json`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/ui.html`
- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test/ui-recheck.json`
- Commit: pending before commit creation.
