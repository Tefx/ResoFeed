# Post-Final Runtime Sentinel: Strict Runtime Mainline Proof

Date: 2026-05-23  
Agent: integration-verifier  
Step: `post-final-runtime-sentinel.strict-runtime-mainline-proof`  
Worktree: `.vectl/worktrees/post-final-runtime-sentinel.strict-runtime-mainline-proof`

## refs Read Confirmation

- `docs/ARCHITECTURE.md` — READ. Key passages: one deployable Go process started with `resofeed serve` serves static SvelteKit, JSON HTTP API, MCP `/mcp`, and background ingest (lines 13, 29-76); HTTP/MCP are thin transports over same product operations (line 18); missing OpenRouter key is non-fatal after bind and model list returns safe empty response while secrets must never be persisted/logged/exported (lines 97-112, 121-133, 1719-1755); selected-item re-ingest is item-scoped and request-scoped for prompt/model only, non-durable (line 27).
- `docs/USAGE.md` — READ. Key passages: build/run flow uses `npm --prefix web run build` and `go build -o ./bin/resofeed ./cmd/resofeed` (lines 24-31); `serve` starts UI, HTTP API, MCP Streamable HTTP at `/mcp`, background ingestion, SQLite migrations, and static serving with no sidecar processes (lines 60-77); HTTP model-list canonical and compatibility paths return `{ "models": [] }` without a key and are non-durable (lines 304-324); selected-item re-ingest accepts request-scoped `model`, `prompt`/`extra_prompt` and no per-call language (lines 328-369); MCP tools include `list_openrouter_models` and prompt/model-bearing `reingest_item` (lines 912-1047).
- `docs/PROMPTING_SYSTEM.md` — READ. Key passages: LLM is a bounded JSON transformer and cannot own durable state/runtime status (lines 3-7); v2.1 compliance requires exact `schema_version: "resofeed.summarize.v2.1"`, structured-output routing, and Go validation before persistence (lines 58-208, 222-260); one-time Inspector prompts cannot change schema/language/source identifiers/status and never persist as durable prompt/model state (lines 27-38, 154-164, 261-267); receipts must omit prompt text, provider payloads, API keys, owner tokens, and `.env` paths (lines 332-334).
- `docs/DESIGN.md` — READ. Key passages: source identifiers (URL, source title, source URL, canonical URL, original link) must render unchanged and use `translate="no"` or equivalent (lines 542-544); Inspector re-ingest is Inspector-only, selected-item scoped, with temporary model and prompt controls and non-persistence boundaries (lines 637-648); zh/source identifier behavior remains literal in Inspector (lines 673-683, 814-856).
- `docs/audits/prompting-v21-final-closure-retest-after-r21-proof.md` — READ. Key passage: closure fields are `verdict: PASS`, `blockers: []`, `gate_open_allowed: true`, `orchestrator_action_hint: OK_TO_COMPLETE_OR_OPEN_GATE` (lines 9-16); final matrix marks B1/B2/B3/R13/R21/artifact-write PROVEN (lines 37-46); raw Go/browser retests exited 0 (lines 57-112).
- `docs/audits/prompting-v21-r21-artifact-proof.md` — READ. Key passages: R21 artifact records exact generated artifact paths, raw command receipts, DOM excerpts, and continuity links (lines 17-21, 45-53); DOM excerpts show literal `translate="no"`, zh chrome/status, and zh post-reingest content (lines 55-98); requirement mapping marks R21 proof gap and translate-no PROVEN (lines 99-106).
- `docs/audits/inspector-prompting-v21-client-runtime-proof.md` — READ. Key passages: focused Playwright proof launched real app path with deterministic OpenRouter stub and passed 6/6 Chromium tests (lines 18-24); proof register marks authority copy, safe payload, non-persistence, and R21 source identifiers PROVEN with artifact paths (lines 25-32); verdict PASS (lines 61-63).
- `docs/audits/inspector-prompting-v21-gate.md` — READ. Key passages: gate opened with `verdict: PASS`, `blockers: []`, `gate_open_allowed: true`, and `OK_TO_COMPLETE_OR_OPEN_GATE` (lines 8-14); gate basis cites docs/design sync, targeted e2e, implementation, client runtime proof, and final closure retest as PROVEN (lines 30-41); post-final runtime sentinel had not run before this step (lines 72-74, 127).
- Runtime code/tests/harnesses — READ. `cmd/resofeed/main.go` is the single binary entrypoint delegating to `resofeed.Main`; `internal/resofeed/mcp_integration_test.go` shows JSON-RPC initialize/tools/call payloads and owner-token MCP auth; `internal/resofeed/item_reingest_contract_expected_red_test.go` shows selected-item fixture insert shape; `web/tests/e2e/inspector-reingest.expected-red.spec.ts` captures DOM/ARIA/PNG artifacts and asserts `html lang="zh-CN"`, `translate="no"`, zh post-reingest text, and no `language` field.
- `CONSTITUTION.md` — NOT READ: no `CONSTITUTION.md` exists in this isolated worktree (`glob **/CONSTITUTION.md` returned no files).

## Strict Runtime Sentinel Report

| runtime_obligation | status | command_or_artifact | raw_receipt_ref | real_runtime_or_fixture |
| --- | --- | --- | --- | --- |
| RTS-FINAL-ARTIFACT-CONTINUITY | PROVEN | `python3` token check on `docs/audits/prompting-v21-final-closure-retest-after-r21-proof.md` | Raw Command Output §1 | artifact |
| RTS-STARTUP | PROVEN | `npm --prefix web ci && npm --prefix web run build && go build -o ./bin/resofeed ./cmd/resofeed`; `env -u OPENROUTER_KEY ./bin/resofeed serve --addr 127.0.0.1:18082 ...` | Raw Command Output §2-3; server logs at `artifacts/runtime-sentinel/server.log` | real runtime |
| RTS-HTTP | PROVEN | Real curl probes against `127.0.0.1:18082` for `/`, `/api/runtime/openrouter-models`, `/api/runtime/openrouter/models`, and `POST /api/items/item_runtime_sentinel_01/reingest` | Raw Command Output §3 | real runtime, with one explicit SQLite fixture row for selected item |
| RTS-MCP | PROVEN | Real curl JSON-RPC probes against `/mcp`: `initialize`, `tools/list`, `tools/call list_openrouter_models`, and `tools/call reingest_item` | Raw Command Output §3-4 | real runtime, with one explicit SQLite fixture row for selected item |
| RTS-CLIENT-R21 | PROVEN | `npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/inspector-reingest.expected-red.spec.ts -g "expected-red browser zh chrome and post-reingest item text proof"`; DOM/PNG/ARIA artifacts under `.test-artifacts/playwright/test-output/...` | Raw Command Output §5 | rendered client runtime with deterministic route fixtures/OpenRouter stub |

## Raw Command Output

### 1. Final artifact continuity

```text
$ python3 - <<'PY'
from pathlib import Path
p=Path('docs/audits/prompting-v21-final-closure-retest-after-r21-proof.md')
text=p.read_text()
need=['verdict: PASS','blockers: []','gate_open_allowed: true','OK_TO_COMPLETE_OR_OPEN_GATE']
print('path_exists', p.exists(), 'size', p.stat().st_size)
for n in need:
 print(n, text.find(n))
PY
path_exists True size 16811
verdict: PASS 247
blockers: [] 263
gate_open_allowed: true 278
OK_TO_COMPLETE_OR_OPEN_GATE 330
Exit code: 0
```

### 2. Build receipt

```text
$ npm --prefix web run build && mkdir -p bin artifacts/runtime-sentinel && go build -o ./bin/resofeed ./cmd/resofeed
> resofeed-web@0.0.0-contract build
> vite build
sh: vite: command not found
Exit code: non-zero

$ npm --prefix web ci && npm --prefix web run build && mkdir -p bin artifacts/runtime-sentinel && go build -o ./bin/resofeed ./cmd/resofeed
added 150 packages, and audited 151 packages in 3s
4 vulnerabilities (1 low, 2 moderate, 1 high)
> resofeed-web@0.0.0-contract build
> vite build
✓ 155 modules transformed.
✓ 167 modules transformed.
✓ built in 1.12s
✓ built in 3.17s
> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done
Exit code: 0
```

### 3. One-binary startup, HTTP probes, and MCP initialize/tools-list

```text
$ env -u OPENROUTER_KEY ./bin/resofeed serve --addr 127.0.0.1:18082 --public-url http://127.0.0.1:18082 --db artifacts/runtime-sentinel/runtime.sqlite3 --owner-token <redacted>
launch_pid=21731
server_ready=true bound_address=127.0.0.1:18082

## static ui
HTTP/1.1 200 OK
Content-Length: 2259
Content-Type: text/html; charset=utf-8
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="./_app/immutable/entry/start.Ws2bshHy.js" rel="modulepreload">

## model list canonical
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 14
{"models":[]}

## model list compat
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 14
{"models":[]}

## seed selected item fixture
seeded item_runtime_sentinel_01 rows 1

## reingest missing key safe path
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 1064
{"reingest":{"item_id":"item_runtime_sentinel_01","status":"completed_with_errors","language":"en","item_updated":true,"fts_updated":true,"error":{"item_id":"item_runtime_sentinel_01","code":"summary_unavailable","message":"summary unavailable"},"item":{"id":"item_runtime_sentinel_01","source_id":"src_runtime_sentinel","source_title":"Runtime Sentinel Source","url":"https://news.example.test/runtime-sentinel","title":"https://news.example.test/runtime-sentinel","summary":null,"core_insight":null,"value_tier":null,"extraction_status":"original_unavailable","model_status":"summary_unavailable","provenance":{"source_url":"https://feed.example.test/rss.xml","canonical_url":"https://news.example.test/runtime-sentinel","original_url":"https://news.example.test/runtime-sentinel","grouped_source_items":[]}}},"already_applied":false}

## db non-persistence check
{"item_text": [null, null], "runtime_metadata_openrouter_or_prompt_rows": 0, "receipts_with_raw_prompt_model": 0}

## mcp initialize
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"resources":{},"tools":{}},"protocolVersion":"2025-03-26","serverInfo":{"name":"resofeed","version":"0.0.0"}}}

## mcp tools-list excerpt
TOOL_NAMES ['list_candidate_items', 'search_items', 'read_item', 'mark_inspected', 'resonate_item', 'preview_steer', 'steer', 'undo_steer', 'report_delivery', 'get_processing_language', 'set_processing_language', 'reprocess_library', 'reingest_item', 'list_openrouter_models']
TOOL_SCHEMA reingest_item ... "properties": {"actor_id": ..., "extra_prompt": {"default": null, "description": "Compatibility alias for prompt; rejected when it conflicts with prompt."}, "idempotency_key": ..., "item_id": ..., "model": {"default": null, "description": "Optional request-scoped OpenRouter model override; null, empty, or account_default means runtime/account default."}, "prompt": {"default": null, "description": "Optional canonical one-time prompt for this item only; max 4000 bytes after trimming."}} ...
TOOL_SCHEMA list_openrouter_models {"description": "List available OpenRouter models without persisting provider state.", "inputSchema": {"additionalProperties": false, "properties": {}, "type": "object"}, "name": "list_openrouter_models"}

## server log excerpt before shutdown
owner token explicit: stored hash
RESOFEED serve
owner-token: explicit
auth: owner-token required
http: listening on 127.0.0.1:18082
public-url: http://127.0.0.1:18082
ui: mounted
api: enabled
mcp: /mcp
sqlite: configured local file
migrations: ok
first-fetch-limit: 50
ingest: started
llm: openrouter
openrouter-key: unavailable
model: account default
server_exit_status=0
process_still_running=false pid=21731
Exit code: 0
```

### 4. MCP tool call probes

```text
$ env -u OPENROUTER_KEY ./bin/resofeed serve --addr 127.0.0.1:18083 ...
launch_pid=21872 port=18083
server_ready=1
seeded mcp rows 1

## mcp list_openrouter_models call
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 89
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"models\":[]}"}]}}

## mcp reingest_item missing-key safe path
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 1271
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\"reingest\":{\"item_id\":\"item_runtime_sentinel_mcp_01\",\"status\":\"completed_with_errors\",\"language\":\"en\",\"item_updated\":true,\"fts_updated\":true,\"error\":{\"item_id\":\"item_runtime_sentinel_mcp_01\",\"code\":\"summary_unavailable\",\"message\":\"summary unavailable\"},\"item\":{\"id\":\"item_runtime_sentinel_mcp_01\",\"source_id\":\"src_runtime_sentinel\",\"source_title\":\"Runtime Sentinel Source\",\"url\":\"https://news.example.test/runtime-sentinel-mcp\",\"title\":\"https://news.example.test/runtime-sentinel-mcp\",\"summary\":null,\"core_insight\":null,\"extraction_status\":\"original_unavailable\",\"model_status\":\"summary_unavailable\",\"provenance\":{\"source_url\":\"https://feed.example.test/rss.xml\",\"canonical_url\":\"https://news.example.test/runtime-sentinel-mcp\",\"original_url\":\"https://news.example.test/runtime-sentinel-mcp\"}}},\"already_applied\":false}"}]}}

## mcp db non-persistence check
{"mcp_item_text": [null, null], "runtime_metadata_openrouter_or_prompt_rows": 0, "receipts_with_raw_mcp_prompt_model": 0}
server_exit_status=0
process_still_running=false pid=21872
Exit code: 0
```

### 5. Client R21 runtime proof

```text
$ npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/inspector-reingest.expected-red.spec.ts -g "expected-red browser zh chrome and post-reingest item text proof"
> resofeed-web@0.0.0-contract test:e2e
> playwright test --config ./playwright.config.ts --project=chromium-ci-safe web/tests/e2e/inspector-reingest.expected-red.spec.ts -g expected-red browser zh chrome and post-reingest item text proof
> resofeed-web@0.0.0-contract build
> vite build
✓ 155 modules transformed.
✓ 167 modules transformed.
> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done
Running 1 test using 1 worker
✓  1 [chromium-ci-safe] › tests/e2e/inspector-reingest.expected-red.spec.ts:408:1 › expected-red browser zh chrome and post-reingest item text proof (1.0s)
1 passed (9.1s)
Exit code: 0

$ python3 DOM artifact verifier
dom_count 2
.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.dom.html
  检查器: 4754
  语言: 中文: 1446
  来源标识保持不变: 1562
  translate="no": 1547
  Source: Literal Source Identifier: 3166
  original link: 5359
  显式重处理后的中文摘要。: 4114
  显式重处理后的核心洞察。: 5864
  translate_no_count: 6
.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.dom.html
  检查器: 4765
  语言: 中文: 1446
  来源标识保持不变: 1562
  translate="no": 1547
  Source: Literal Source Identifier: 3166
  original link: 5370
  translate_no_count: 6
Exit code: 0
```

Client artifact paths:

- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.dom.html`
- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.dom.html`
- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.png`
- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.png`
- `.test-artifacts/playwright/results/results.json`

## Behavioral Proof Register

| behavior | proof_status | evidence |
| --- | --- | --- |
| Mainline one-binary build and launch | PROVEN | Build exited 0 after worktree-local npm dependency bootstrap; `./bin/resofeed serve` bound `127.0.0.1:18082`, logged `ui: mounted`, `api: enabled`, `mcp: /mcp`, `ingest: started`, and cleaned up with `server_exit_status=0`. |
| Static UI route serves browser assets | PROVEN | Real curl to `/` returned `HTTP/1.1 200 OK` and SvelteKit HTML/modulepreload assets. |
| OpenRouter model-list HTTP safe path | PROVEN | Real curl to canonical and compatibility routes returned `HTTP/1.1 200 OK` with `{"models":[]}` under `env -u OPENROUTER_KEY` and no `.env`. |
| Selected-item HTTP re-ingest no-key/missing-key safe path | PROVEN | Real HTTP POST against a fixture selected item returned canonical `completed_with_errors`/`summary_unavailable`; DB check showed prompt/model not in runtime metadata or receipt fingerprints. |
| MCP initialize/tools/list and model/prompt-bearing surfaces | PROVEN | Real `/mcp` JSON-RPC `initialize` returned server capabilities; `tools/list` exposed `reingest_item` schema with `model`, `prompt`, `extra_prompt` and `list_openrouter_models`; tool calls returned safe empty models and selected-item reingest safe path. |
| Inspector zh/source identifier rendered client runtime | PROVEN | Focused Chromium Playwright test passed; DOM artifacts contain `检查器`, `语言: 中文`, `Source: Literal Source Identifier`, `original link`, `translate="no"` count 6, and post-reingest zh summary/core text. |
| Final closure artifact continuity | PROVEN | Token check found required PASS/no blockers/gate-open/action-hint tokens in final closure artifact. |

## checklist_receipt

- item: `refs confirmation cites key passages from every ref, especially runtime startup, HTTP/MCP parity, R21 source identifier rules, and final closure artifact tokens.`
  checked: true
  evidence: `refs Read Confirmation` cites all required docs/audit refs plus runtime code/tests/harnesses and notes absent `CONSTITUTION.md`.
- item: `Mainline artifact continuity proof shows docs/audits/prompting-v21-final-closure-retest-after-r21-proof.md exists and contains verdict: PASS, blockers: [], gate_open_allowed: true, and OK_TO_COMPLETE_OR_OPEN_GATE.`
  checked: true
  evidence: Raw Command Output §1 shows path exists and token offsets for all required strings.
- item: `One-binary runtime proof includes exact build/launch command, process lifecycle evidence, bound address/port, and clean shutdown evidence or explicit cleanup.`
  checked: true
  evidence: Raw Command Output §2-3 includes build, launch command, PID 21731, bound address `127.0.0.1:18082`, server log, `server_exit_status=0`, and `process_still_running=false`; §4 includes second MCP call server cleanup.
- item: `HTTP runtime proof includes raw request/response receipts for static UI reachability, model-list route(s), and a safe selected-item re-ingest no-key/missing-key path with redaction/non-persistence notes.`
  checked: true
  evidence: Raw Command Output §3 contains HTTP 200 static UI, both model-list responses, reingest response, and DB non-persistence check with zero prompt/model metadata/receipt matches; owner token is redacted and OpenRouter key is unset.
- item: `MCP runtime proof includes raw initialize/tools/list or equivalent harness output proving prompt/model-bearing reingest_item and model-list surfaces are reachable.`
  checked: true
  evidence: Raw Command Output §3 has initialize and tools/list schemas; §4 has tools/call for `list_openrouter_models` and `reingest_item`.
- item: `Client runtime proof includes rendered browser/DOM/terminal artifacts for Inspector zh/source identifier behavior with literal source identifiers and translate="no" or equivalent; exact artifact paths must be provided.`
  checked: true
  evidence: Raw Command Output §5 gives Playwright pass, DOM verifier output, and exact DOM/PNG/results paths.
- item: `Real-runtime-vs-fixture distinction is explicit for every command; fixture-only proof cannot satisfy runtime obligations.`
  checked: true
  evidence: Strict Runtime Sentinel Report labels server/curl/MCP as real runtime; selected item rows are explicitly SQLite fixture rows only; browser proof is rendered runtime with deterministic route fixtures/OpenRouter stub.
- item: `Closure fields are present and consistent: PASS requires verdict: PASS, blockers: [], gate_open_allowed: true, and orchestrator_action_hint: OK_TO_COMPLETE_OR_OPEN_GATE; FAIL requires blocker list and DO_NOT_COMPLETE.`
  checked: true
  evidence: Closure Fields below are PASS with no blockers, gate open allowed, and OK action hint.

## Closure Fields

step_intent: runtime_sentinel_green  
expected_result: green  
verdict: PASS  
blockers: []  
gate_open_allowed: true  
orchestrator_action_hint: OK_TO_COMPLETE_OR_OPEN_GATE

## Evidence Cleanup Receipt

- `artifacts/runtime-sentinel/server.log` and `artifacts/runtime-sentinel/server-mcp-call.log` are committed bounded text runtime startup/shutdown receipts.
- The transient SQLite runtime database `artifacts/runtime-sentinel/runtime.sqlite3` was removed before cleanup commit because it is generated fixture/runtime state and the audit artifact embeds the required HTTP/MCP request/response and non-persistence receipts.
- No external uncommitted runtime evidence is required to evaluate this proof.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "verdict": "PASS",
  "blockers": [],
  "gate_open_allowed": true,
  "orchestrator_action_hint": "OK_TO_COMPLETE_OR_OPEN_GATE",
  "artifact_path": "docs/audits/post-final-runtime-sentinel-strict-runtime-mainline-proof.md",
  "runtime_ports": [18082, 18083],
  "client_artifacts": [
    ".test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.dom.html",
    ".test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.dom.html"
  ]
}
```
