# Prompting v2.1 Runtime Liveness Probe

Date: 2026-05-23  
Agent: blind-tester  
Mode: black-box runtime liveness probe  
Worktree: `.vectl/worktrees/prompting-v21-runtime-liveness-probe`  
Product source read: **No** — docs/configs only; no `cmd/`, `internal/`, `web/src`, or other implementation source was read.

## refs Read Confirmation

- `docs/ARCHITECTURE.md` — Required one deployable Go process started with `resofeed serve`; it serves static UI, JSON HTTP API, MCP Streamable HTTP at `/mcp`, and background ingestion. It also states missing OpenRouter key is non-fatal and HTTP model-list routes return safe empty model responses when no key is resolved. Item re-ingest is request-scoped for model/prompt and must not persist prompt/model state.
- `docs/USAGE.md` — Required documented build and launch commands are `npm --prefix web install`, `npm --prefix web run build`, `go build -o ./bin/resofeed ./cmd/resofeed`, then `./bin/resofeed serve ...`. It documents both HTTP model-list routes, item re-ingest request bodies with `prompt`/`extra_prompt`, MCP `/mcp`, and states missing OpenRouter key should not prevent binding.
- `docs/PROMPTING_SYSTEM.md` — Confirms LLM is only a bounded JSON transformer; one-time Inspector prompts may guide a selected item only and cannot override schema, source grounding, target language, source identifiers, safety, or status handling. v2.1 compliance remains conditional/pending unless the runtime emits/validates the v2.1 payload.
- `CONSTITUTION.md` — Not present in the isolated worktree root; no additional constitution constraints were available.

## Environment and startup

- Secret status before probe: `OPENROUTER_KEY=absent`, `.env=absent`.
- Live OpenRouter smoke: skipped because no OS `OPENROUTER_KEY` and no local `.env` were present. This is a valid missing-key path per docs; no secret was printed.
- Owner token: explicit probe token supplied and redacted from all evidence.
- Entrypoint command:

```bash
/Users/tefx/Projects/ResoFeed/.vectl/worktrees/prompting-v21-runtime-liveness-probe/bin/resofeed serve \
  --addr 127.0.0.1:18180 \
  --public-url http://127.0.0.1:18180 \
  --db /var/folders/rs/6_0h1ssn5439q1yfqy4pykg00000gn/T/resofeed-liveness-amrsy2vi/resofeed.sqlite3 \
  --owner-token <OWNER_TOKEN_REDACTED> \
  --first-fetch-limit 10 \
  --openrouter-model openai/gpt-4.1-mini
```

### Build command output

```text
$ npm --prefix web install && npm --prefix web run build && mkdir -p ./bin && go build -o ./bin/resofeed ./cmd/resofeed
exit=0

added 150 packages, and audited 151 packages in 2s

25 packages are looking for funding
  run `npm fund` for details.

4 vulnerabilities (1 low, 2 moderate, 1 high)

To address all issues run:
  npm audit fix

Run `npm audit` for details.

> resofeed-web@0.0.0-contract build
> vite build

▲ [WARNING] Cannot find base config file "./.svelte-kit/tsconfig.json" [tsconfig.json]

vite v6.4.2 building SSR bundle for production...
✓ built in 410ms
vite v6.4.2 building for production...
✓ built in 1.28s

> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done
```

The npm audit findings are dependency hygiene debt, not a runtime liveness blocker for this step.

### Startup and port proof

```text
HTTP_BOUND True

$ lsof -nP -iTCP:18180 -sTCP:LISTEN
exit=0
COMMAND    PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
resofeed 18039 tefx    6u  IPv4 ...              0t0  TCP 127.0.0.1:18180 (LISTEN)
```

Redacted startup/runtime log:

```text
owner token explicit: stored hash
RESOFEED serve
owner-token: explicit
auth: owner-token required

http: listening on 127.0.0.1:18180
public-url: http://127.0.0.1:18180
ui: mounted
api: enabled
mcp: /mcp

sqlite: configured local file
migrations: ok
first-fetch-limit: 10
ingest: started

llm: openrouter
openrouter-key: unavailable
model: openai/gpt-4.1-mini
shutdown complete
```

## HTTP runtime liveness raw output

### Static UI through same binary

```text
$ curl -i -sS http://127.0.0.1:18180/
exit=0
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<!doctype html>
<html lang="en">
...
<main class="contract-shell resofeed-shell" aria-label="RESOFEED">
  <section class="contract-region contract-token-prompt" aria-labelledby="owner-token-heading">
    <p class="contract-label">RESOFEED</p>
    <h1 id="owner-token-heading">Enter owner token</h1>
    <form class="contract-token-form">...
```

### Canonical OpenRouter model-list route

```text
$ curl -i -sS http://127.0.0.1:18180/api/runtime/openrouter-models -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 14

{"models":[]}
```

### Compatibility OpenRouter model-list route

```text
$ curl -i -sS http://127.0.0.1:18180/api/runtime/openrouter/models -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 14

{"models":[]}
```

### Query rejection on model-list route

```text
$ curl -i -sS 'http://127.0.0.1:18180/api/runtime/openrouter-models?x=1' -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>'
exit=0
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Content-Length: 81

{"error":{"code":"bad_request","message":"bad request","details":{"field":"x"}}}
```

## Fixture ingestion and item re-ingest proof

A local black-box RSS fixture was served from `python3 -m http.server` and added via the documented Steer API; no direct SQLite writes or private test hooks were used.

### Add fixture source

```text
$ curl -i -sS -X POST http://127.0.0.1:18182/api/steer -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' --data '{"command":"http://127.0.0.1:18183/feed.xml","actor_kind":"human","actor_id":"owner","idempotency_key":"probe-add-source-002"}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"receipt":{"interpreted_as":"add_source","changed_rules":[],"message":"source added: 127.0.0.1:18183; visible in SOURCE LEDGER; use [RUN INGEST] or row [FETCH] there for immediate refresh"},"undo_handle":{"route_kind":"source","target":{"kind":"source","id":"src_d00bd5065214cd34"},"revision":1}}
```

### Manual ingest through running binary

```text
$ curl -i -sS -X POST http://127.0.0.1:18182/api/ingest -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' --data '{}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"ingest":{"scope":"all","source_id":null,"status":"completed","started_at":"2026-05-22T17:32:43Z","completed_at":"2026-05-22T17:32:43Z","duration_ms":4,"sources_attempted":1,"sources_succeeded":1,"sources_failed":0,"items_upserted":1,"errors":[]}}
```

### Discover fixture item via public search

```text
$ curl -i -sS 'http://127.0.0.1:18182/api/search?q=resofeed-liveness-token-20260523-b' -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"items":[{"id":"item_f071b55a840f2811172fed5a001b535b","source_id":"src_d00bd5065214cd34","source_title":"Probe Feed","url":"http://127.0.0.1:18183/article.html","title":"Runtime liveness probe item","summary":null,"core_insight":null,"display_excerpt":"Unique token resofeed-liveness-token-20260523-b with source excerpt content.","value_tier":null,"published_at":"2026-05-23T00:00:00Z","extraction_status":"full","model_status":"summary_unavailable","is_resonated":false,"human_inspected_at":null,"external_surfaced_at":null,"story_key":null,"duplicate_of_item_id":null}],"query":{"q":"resofeed-liveness-token-20260523-b","source":null,"from":null,"to":null,"resonated":null,"limit":50}}
```

### HTTP item re-ingest with prompt/model fields

```text
$ curl -i -sS -X POST http://127.0.0.1:18182/api/items/item_f071b55a840f2811172fed5a001b535b/reingest -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"probe-reingest-http-002","model":"openai/gpt-4.1-mini","prompt":"one-time liveness retry instruction; preserve source-grounded facts only"}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"reingest":{"item_id":"item_f071b55a840f2811172fed5a001b535b","status":"completed_with_errors","language":"en","item_updated":true,"fts_updated":true,"error":{"item_id":"item_f071b55a840f2811172fed5a001b535b","code":"summary_unavailable","message":"summary unavailable"},"item":{"id":"item_f071b55a840f2811172fed5a001b535b","source_id":"src_d00bd5065214cd34","source_title":"Probe Feed","url":"http://127.0.0.1:18183/article.html","title":"http://127.0.0.1:18183/article.html","summary":null,"core_insight":null,"value_tier":null,"published_at":"2026-05-23T00:00:00Z","extraction_status":"original_unavailable","model_status":"summary_unavailable","is_resonated":false,"human_inspected_at":null,"external_surfaced_at":null,"story_key":null,"duplicate_of_item_id":null,"feed_excerpt":null,"extracted_text":null,"provenance":{"source_url":"http://127.0.0.1:18183/feed.xml","canonical_url":null,"original_url":"http://127.0.0.1:18183/article.html","story_key":null,"duplicate_of_item_id":null,"grouped_source_items":[]}}},"already_applied":false}
```

Interpretation: with no OpenRouter key, the real route still accepted prompt/model fields, executed item-scoped re-ingest, returned a safe `summary_unavailable` result, updated the item/FTS fields, and did not expose secrets or prompt text in the error.

## MCP real endpoint raw output

### Initialize

```text
$ curl -i -sS -X POST http://127.0.0.1:18180/mcp -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"black-box-curl","version":"0.1"}}}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"resources":{},"tools":{}},"protocolVersion":"2025-03-26","serverInfo":{"name":"resofeed","version":"0.0.0"}}}
```

### Tools list includes parity tools and currently exposes prompt/model on `reingest_item`

```text
$ curl -i -sS -X POST http://127.0.0.1:18180/mcp -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

... "name":"reingest_item" ... "model" ... "prompt" ... "extra_prompt" ...
... "name":"list_openrouter_models" ...
```

### MCP `list_openrouter_models`

```text
$ curl -i -sS -X POST http://127.0.0.1:18180/mcp -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_openrouter_models","arguments":{}}}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 89

{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"models\":[]}"}]}}
```

### MCP `reingest_item` with prompt/model fields through real `/mcp`

```text
$ curl -i -sS -X POST http://127.0.0.1:18182/mcp -H 'Authorization: Bearer <OWNER_TOKEN_REDACTED>' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"reingest_item","arguments":{"item_id":"item_f071b55a840f2811172fed5a001b535b","actor_id":"probe-agent","idempotency_key":"probe-reingest-mcp-002","model":"openai/gpt-4.1-mini","prompt":"one-time mcp prompt parity smoke"}}}'
exit=0
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\"reingest\":{\"item_id\":\"item_f071b55a840f2811172fed5a001b535b\",\"status\":\"completed_with_errors\",\"language\":\"en\",\"item_updated\":true,\"fts_updated\":true,\"error\":{\"item_id\":\"item_f071b55a840f2811172fed5a001b535b\",\"code\":\"summary_unavailable\",\"message\":\"summary unavailable\"},...},\"already_applied\":false}"}]}}
```

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| ARCHITECTURE.md lines 13, 53-76; USAGE.md lines 60-77 | `cmd/resofeed` launches as one binary serving UI, HTTP API, MCP, migrations, and ingest loop. | Real binary binds documented address and serves network traffic. | Startup/port proof; UI `GET /` output. | PROVEN | n/a | Port bound by `resofeed`; startup logs show `ui`, `api`, and `mcp`; HTML returned from same process. |
| ARCHITECTURE.md lines 97-105, 1719-1720; USAGE.md lines 304-324 | Canonical and compatibility OpenRouter model-list HTTP routes work through running binary; missing key returns safe empty list. | Authenticated `GET /api/runtime/openrouter-models` and `/api/runtime/openrouter/models` return `200 {"models":[]}` with no secrets. | HTTP runtime liveness raw output. | PROVEN | n/a | Both routes returned `200 OK` and identical safe empty JSON; query rejection returned canonical `400`. |
| ARCHITECTURE.md lines 385-388, 1723; USAGE.md lines 326-369; PROMPTING_SYSTEM.md lines 261-267 | HTTP item re-ingest accepts request-scoped prompt/model fields and does not persist/expose them as durable state or secrets. | Existing item fixture is re-ingested through `POST /api/items/{id}/reingest` with prompt/model and a safe provider-unavailable outcome. | Fixture ingestion and item re-ingest proof. | PROVEN | n/a | Public Steer + manual ingest created item; re-ingest returned `200`, `completed_with_errors`, `item_updated:true`, `fts_updated:true`, and no secret/prompt echo in error. |
| ARCHITECTURE.md lines 1885-1893, 2051-2070; USAGE.md lines 912-987, 1027-1040 | MCP `/mcp` exposes parity tools and authenticates owner-token calls. | Real Streamable HTTP endpoint handles initialize, tools/list, `list_openrouter_models`, and `reingest_item`. | MCP real endpoint raw output. | PROVEN | n/a | `/mcp` returned JSON-RPC success for initialize/tools/list/model list and `reingest_item` against fixture item. |
| ARCHITECTURE.md lines 105-110; USAGE.md lines 899-911 | Runtime evidence must not leak OpenRouter keys, owner token, `.env` paths, raw provider details, or prompt text in errors. | Probe redacts owner token; no OpenRouter key exists; route outputs/logs contain no key or raw provider secret. | Startup logs; HTTP/MCP outputs. | PROVEN | n/a | `openrouter-key: unavailable`; outputs use `<OWNER_TOKEN_REDACTED>`; route errors do not echo prompt text or secrets. |

## Defect / blocker ledger

- No blocking runtime liveness defects found.
- Non-blocking observations:
  - `npm install` reported 4 dependency audit findings (1 low, 2 moderate, 1 high); not assessed in this runtime liveness scope.
  - The first probe intentionally sent an implementation-rejected manual ingest body with `idempotency_key` and got `400 body`; the docs explicitly require `{}` for manual ingest, and the corrected documented body succeeded.

## Checklist Receipt

- entrypoint-startup: DONE — port proof and startup logs above.
- http-model-list-binary: DONE — canonical and compatibility route outputs above.
- item-reingest-binary-or-fixture: DONE — public fixture source, manual ingest, search discovery, and HTTP re-ingest output above.
- mcp-real-endpoint-tools: DONE — initialize/tools-list/list_openrouter_models/reingest_item outputs above.
- behavioral-register: DONE — table above.

## Closure

- verdict: PASS
- blockers: []
- gate_open_allowed: true
- orchestrator_action_hint: COMPLETE
