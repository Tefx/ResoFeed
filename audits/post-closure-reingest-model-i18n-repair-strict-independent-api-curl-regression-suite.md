# Strict Independent API Curl Regression Suite

**step_id**: `post-closure-reingest-model-i18n-repair-strict-independent-retest.api-curl-regression-suite`
**agent**: `integration-verifier`
**date**: 2026-05-22
**verdict**: PASS

## refs Read Confirmation (MANDATORY)

- `docs/ARCHITECTURE.md` — READ. Key passage: ResoFeed is one deployable Go process serving static assets, JSON HTTP API, MCP, and ingest; HTTP/MCP transports validate auth/payloads and call the same product operations; selected item re-ingest is `POST /api/items/{id}/reingest`, uses request-scoped model/prompt, returns `{already_applied, reingest}`, refreshes only the selected item/FTS, and must not persist prompt/model/provider state.
- `docs/DESIGN.md` — READ. Key passage: Inspector Item Re-Ingest is an Inspector-only transient retry panel; `Default model` serializes as `model:null`, one-time prompt is transient and cleared on success/replay, failed/conflict submissions preserve transient prompt, and source identifiers remain literal provenance anchors.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — READ. Key passage: R2 requires canonical `GET /api/runtime/openrouter-models` plus compatibility `GET /api/runtime/openrouter/models` with identical owner-auth/strict-query semantics; R4 requires `prompt` canonical, `extra_prompt` compatibility alias, conflicting aliases rejected, `language`/unknown fields rejected, and prompt/model never persisted.
- `audits/post-closure-reingest-model-i18n-repair-batched-b1-b5-backend-api-gate.md` — READ. Key passage: backend proof input records `go test ./internal/resofeed -run 'TestPostClosure' -count=1 -v` exit 0, route parity/raw API stdout, prompt/extra_prompt tests, provider failure redaction, and no durable runtime metadata counts.
- `audits/post-closure-reingest-model-i18n-repair-batched-b1-b5-retest-gate.md` — READ. Key passage: frontend/UI/i18n B1-B5 gate closure records current PASS/OPEN, current UIUX validation PASS, committed browser artifact family, canonical + compatibility model-list network proof, extra_prompt proof, and no remaining blockers.
- `internal/resofeed/backend_real_api_proof_test.go` — READ. Key passage: existing proof test starts a real `httptest` HTTP server, performs public HTTP requests for positive/negative re-ingest, model list canonical/compatibility routes, provider failure redaction, and checks no durable runtime metadata state.
- `internal/resofeed/post_closure_backend_repair_test.go` — READ. Key passage: existing expected behaviors cover safe empty model list when no key, all-model listing via provider, malformed/wrong-type reingest JSON rejection, and OpenRouter prompt safety contract fields.
- `CONSTITUTION.md` — NOT READ: `**/CONSTITUTION.md` glob in this isolated worktree returned no files.

## Verification Report: strict independent API curl regression suite

**Headline**: PASS
**Blocking Status**: CLOSED
**Proof-Gap Status**: NONE
**Verdict**: PASS
**Blockers**: []
**Orchestrator Action Hint**: COMPLETE

### Commands Run

| Command | Exit | Raw Evidence |
|---|---:|---|
| `go build -o .audit-artifacts/api-curl-regression-suite-runtime/resofeed ./cmd/resofeed` | 0 | no stderr/stdout; binary built for runtime smoke. |
| `OPENROUTER_KEY=sk-runtime-regression-proof RESOFEED_E2E=1 RESOFEED_E2E_OPENROUTER_ENDPOINT=http://127.0.0.1:19081 .audit-artifacts/api-curl-regression-suite-runtime/resofeed serve --addr 127.0.0.1:19080 --public-url http://127.0.0.1:19080 --db .audit-artifacts/api-curl-regression-suite-runtime/resofeed.sqlite3 --owner-token owner-token-runtime-regression-1234567890` | process started/stopped cleanly | Probe returned `HTTP/1.1 401 Unauthorized` from `/api/runtime/openrouter-models`, proving actual API runtime bound and owner-token gate active. |
| `curl` public API regression suite below | 0 per request | See **API Curl/Runtime Evidence**. |
| `python3 scan sqlite for forbidden request-scoped prompt/model strings` | 0 | `{"one-time compat prompt": [], "one-time curl prompt": [], "openrouter/runtime-model-a": [], "openrouter/runtime-model-b": [], "请用中文重摄取": []}` |
| `go test ./internal/resofeed -run 'TestPostClosure\|TestBackendRealAPIProofThroughHTTPServer\|TestBackendReingestSuccessThroughPublicStateImportSetup' -count=1 -v` | 0 | PASS; included real HTTP proof tests, model route compatibility, prompt/extra_prompt owner-auth, idempotency fingerprint, guard conflict, provider redaction, and Chinese explicit reingest tests. |

### Evidence Levels

| Level | Status | Evidence |
|---|---|---|
| L0 Static | PROVEN | Required refs and existing proof tests read. |
| L1 Contracts | PROVEN | Focused Go tests exit 0. |
| L2 Real Wiring | PROVEN | Actual `cmd/resofeed` binary served HTTP on `127.0.0.1:19080`; real `curl` requests exercised public API routes through owner auth, SQLite, extraction fetch, fake OpenRouter HTTP provider, and item/FTS mutation. |
| L3 Live Intelligence | NOT REQUIRED | External OpenRouter was not called; deterministic local OpenRouter-compatible HTTP provider was used to avoid secret/network dependency while proving runtime HTTP seam behavior. |

### Protocol Results

| Protocol | Result | Evidence | Gap |
|---|---|---|---|
| P1 Empty Room | PASS | Focused Go test collected and ran named tests; curl suite exercised live runtime. | none |
| P2 Fake Seam | PASS_WITH_NOTE | Curl suite used actual runtime/public HTTP + SQLite + HTTP fake OpenRouter endpoint. External OpenRouter was intentionally replaced by deterministic local endpoint; provider request logs prove model/prompt/target_language reached the HTTP seam. | no live external provider credential used |
| P4 Live External Service | NOT_APPLICABLE | No live OpenRouter credential required by assignment; local OpenRouter-compatible endpoint returned non-fixture request-dependent zh/en outputs. | none |
| P8 Caller Reachability | PASS | Public routes `/api/items/{id}/reingest`, `/api/runtime/openrouter-models`, `/api/runtime/openrouter/models`, `/api/runtime/language`, `/api/items/{id}` called by curl. | none |
| P9 Smoke/Liveness | PASS | Runtime process accepted HTTP and returned raw responses shown below. | none |

## Behavioral proof register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| R4 positive | `POST /api/items/{id}/reingest` succeeds with owner token, selected model, and one-time prompt. | HTTP 200 envelope with `status:completed`, `item_updated:true`, `fts_updated:true`, refreshed item; provider request includes model and prompt. | `reingest_positive_prompt`; provider extraction call 1: `request_model=openrouter/runtime-model-a`, `item_prompt=one-time curl prompt`, `target_language=en`. | PROVEN | n/a | PASS |
| R4 auth negatives | Missing and invalid owner token rejected. | HTTP 401 bodies. | `reingest_missing_owner_token`, `reingest_invalid_owner_token`. | PROVEN | n/a | PASS |
| R4 strict JSON negatives | Malformed JSON, wrong-type prompt, unknown `language`, conflicting aliases rejected safely. | HTTP 400 field-scoped bodies without leaking prompt secret. | `reingest_malformed_json`, `reingest_wrong_type_prompt`, `reingest_unknown_language_field`, `reingest_conflicting_prompt_aliases`. | PROVEN | n/a | PASS |
| R4 nonexistent item | Nonexistent selected item rejected. | HTTP 404 body with id. | `reingest_nonexistent_item`. | PROVEN | n/a | PASS |
| R4 prompt/extra_prompt compatibility | `prompt` canonical and `extra_prompt` compatibility both reach one-time prompt path; conflicting values rejected. | HTTP 200 for both accepted forms and provider log proves prompt/model; HTTP 400 for conflict. | `reingest_positive_prompt`, `reingest_extra_prompt_compat`, provider extraction calls 1-2, `reingest_conflicting_prompt_aliases`. | PROVEN | n/a | PASS |
| R4 no durable state | Request-scoped model/prompt are not persisted in durable DB state. | SQLite scan for exact request-scoped model/prompt strings returns no hits. | `no_durable_prompt_model_state_check`. | PROVEN | n/a | PASS |
| R2 canonical model list | Canonical model-list route requires auth, rejects query, and returns all listed provider models. | HTTP 200 body includes both provider models; 401 missing auth; 400 query. | `model_list_canonical`, `model_list_query_rejected`, `model_list_missing_owner_token`. | PROVEN | n/a | PASS |
| R2 compatibility route | Compatibility route has identical successful semantics. | HTTP 200 body identical to canonical route. | `model_list_compatibility`. | PROVEN | n/a | PASS |
| R3 zh explicit reingest | Chinese explicit reingest produces zh summary/core evidence when LLM returns zh content. | Set language zh, POST reingest returns `language:"zh"` and zh `summary`/`core_insight`; GET item detail confirms persistence. | `set_language_zh`, `reingest_zh_explicit`, `item_detail_after_zh`; provider call 3 target_language zh. | PROVEN | n/a | PASS |

## API Curl/Runtime Evidence

- runtime_start_command:

```text
OPENROUTER_KEY=sk-runtime-regression-proof RESOFEED_E2E=1 RESOFEED_E2E_OPENROUTER_ENDPOINT=http://127.0.0.1:19081 .audit-artifacts/api-curl-regression-suite-runtime/resofeed serve --addr 127.0.0.1:19080 --public-url http://127.0.0.1:19080 --db .audit-artifacts/api-curl-regression-suite-runtime/resofeed.sqlite3 --owner-token owner-token-runtime-regression-1234567890
probe: HTTP/1.1 401 Unauthorized body={"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

- reingest_positive_curl:

```text
$ curl --max-time 15 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-positive-prompt","model":"openrouter/runtime-model-a","prompt":"one-time curl prompt"}'
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"reingest":{"item_id":"runtime_item_01","status":"completed","language":"en","item_updated":true,"fts_updated":true,"error":null,"item":{"id":"runtime_item_01","source_id":"runtime_source","source_title":"Runtime Source Literal","url":"http://127.0.0.1:19081/article","title":"Runtime English Title","summary":"English summary proves selected reingest.","core_insight":"English core insight preserves evidence 42.","value_tier":"high","published_at":null,"extraction_status":"full","model_status":"ok","is_resonated":true,"human_inspected_at":null,"external_surfaced_at":null,"story_key":null,"duplicate_of_item_id":null,"feed_excerpt":"Runtime English excerpt 42","extracted_text":"Runtime English body evidence 42","provenance":{"source_url":"http://127.0.0.1:19081/feed.xml","canonical_url":null,"original_url":"http://127.0.0.1:19081/article","story_key":null,"duplicate_of_item_id":null,"grouped_source_items":[]}}},"already_applied":false}
```

- reingest_auth_negative_curl:

```text
$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-missing-auth"}'
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8

{"error":{"code":"unauthorized","message":"owner token required","details":{}}}

$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer wrong-token' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-invalid-auth"}'
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8

{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

- reingest_malformed_json_curl:

```text
$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human"'
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error":{"code":"bad_request","message":"bad request","details":{"field":"body"}}}
```

- reingest_nonexistent_item_curl:

```text
$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/no_such_item/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-no-such"}'
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":{"code":"not_found","message":"not found","details":{"id":"no_such_item"}}}
```

- prompt/extra_prompt compatibility and error-safe wrapping evidence:

```text
$ curl --max-time 15 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-extra-prompt","model":"openrouter/runtime-model-b","extra_prompt":"one-time compat prompt"}'
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"reingest":{"item_id":"runtime_item_01","status":"completed","language":"en","item_updated":true,"fts_updated":true,"error":null,"item":{"summary":"English summary proves selected reingest.","core_insight":"English core insight preserves evidence 42.","feed_excerpt":"Runtime English excerpt 42","extracted_text":"Runtime English body evidence 42", ...}},"already_applied":false}

$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-conflict-prompt","prompt":"alpha","extra_prompt":"beta"}'
HTTP/1.1 400 Bad Request
{"error":{"code":"bad_request","message":"bad request","details":{"field":"prompt"}}}

$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-language-field","prompt":"do not leak sk-secret-value","language":"zh"}'
HTTP/1.1 400 Bad Request
{"error":{"code":"bad_request","message":"bad request","details":{"field":"language"}}}

$ curl --max-time 10 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-wrong-type","prompt":123}'
HTTP/1.1 400 Bad Request
{"error":{"code":"bad_request","message":"bad request","details":{"field":"prompt"}}}
```

- provider seam proof for request-scoped model/prompt:

```json
{"call":1,"item_id":"runtime_item_01","item_model":"openrouter/runtime-model-a","item_prompt":"one-time curl prompt","request_model":"openrouter/runtime-model-a","target_language":"en"}
{"call":2,"item_id":"runtime_item_01","item_model":"openrouter/runtime-model-b","item_prompt":"one-time compat prompt","request_model":"openrouter/runtime-model-b","target_language":"en"}
{"call":3,"item_id":"runtime_item_01","item_model":null,"item_prompt":"请用中文重摄取","request_model":null,"target_language":"zh"}
```

- model_list_canonical_curl:

```text
$ curl --max-time 10 -sS -i http://127.0.0.1:19080/api/runtime/openrouter-models -H 'Authorization: Bearer <owner-token>'
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"models":[{"id":"openrouter/runtime-model-a","name":"Runtime Model A"},{"id":"openrouter/runtime-model-b","name":"Runtime Model B"}]}
```

- model_list_compatibility_curl:

```text
$ curl --max-time 10 -sS -i http://127.0.0.1:19080/api/runtime/openrouter/models -H 'Authorization: Bearer <owner-token>'
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"models":[{"id":"openrouter/runtime-model-a","name":"Runtime Model A"},{"id":"openrouter/runtime-model-b","name":"Runtime Model B"}]}

$ curl --max-time 10 -sS -i 'http://127.0.0.1:19080/api/runtime/openrouter-models?x=1' -H 'Authorization: Bearer <owner-token>'
HTTP/1.1 400 Bad Request
{"error":{"code":"bad_request","message":"bad request","details":{"field":"x"}}}

$ curl --max-time 10 -sS -i http://127.0.0.1:19080/api/runtime/openrouter-models
HTTP/1.1 401 Unauthorized
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

- no_durable_state_check:

```text
$ python3 scan sqlite for forbidden request-scoped prompt/model strings
{"one-time compat prompt": [], "one-time curl prompt": [], "openrouter/runtime-model-a": [], "openrouter/runtime-model-b": [], "请用中文重摄取": []}
```

- zh_reingest_content_evidence:

```text
$ curl --max-time 10 -sS -i -X PUT http://127.0.0.1:19080/api/runtime/language -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-set-zh"}'
HTTP/1.1 200 OK
{"language":{"code":"zh","label":"中文"},"already_applied":false}

$ curl --max-time 15 -sS -i -X POST http://127.0.0.1:19080/api/items/runtime_item_01/reingest -H 'Authorization: Bearer <owner-token>' -H 'Content-Type: application/json' --data '{"actor_kind":"human","actor_id":"owner","idempotency_key":"api-curl-zh-reingest","extra_prompt":"请用中文重摄取"}'
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"reingest":{"item_id":"runtime_item_01","status":"completed","language":"zh","item_updated":true,"fts_updated":true,"error":null,"item":{"title":"运行时中文标题","summary":"中文摘要证明显式重摄取写入。","core_insight":"中文核心洞察保留证据 42。","feed_excerpt":"运行时中文摘录 42","extracted_text":"运行时中文正文包含证据 42", ...}},"already_applied":false}

$ curl --max-time 10 -sS -i http://127.0.0.1:19080/api/items/runtime_item_01 -H 'Authorization: Bearer <owner-token>'
HTTP/1.1 200 OK
{"item":{"title":"运行时中文标题","summary":"中文摘要证明显式重摄取写入。","core_insight":"中文核心洞察保留证据 42。","feed_excerpt":"运行时中文摘录 42","extracted_text":"运行时中文正文包含证据 42", ...}}
```

## Findings

- No blockers found.
- No product files modified.
- Safe-unavailable model-list behavior was additionally covered by the focused Go proof test output: missing OpenRouter key returns `HTTP/1.1 200 OK ... body={"models":[]}` and provider failure redacts raw provider/API-key/env/owner-token detail with `503 provider_unavailable`.

## Closure Fields

verdict: PASS
headline: PASS
proof_gap_status: NONE
blocking_status: CLOSED
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
uncertainty_sources: []
blockers: []

## checklist_receipt

```yaml
"Evidence includes real curl/API commands with raw status and body, not summaries.":
  checked: true
  proof_artifacts:
    - "API Curl/Runtime Evidence: curl commands and HTTP status/body blocks"
  basis: "Each required route was exercised through the actual runtime binary and recorded with raw HTTP status/body."
"Re-ingest positive and negative cases are proven.":
  checked: true
  proof_artifacts:
    - "reingest_positive_prompt"
    - "reingest_missing_owner_token"
    - "reingest_invalid_owner_token"
    - "reingest_malformed_json"
    - "reingest_nonexistent_item"
    - "reingest_unknown_language_field"
    - "reingest_wrong_type_prompt"
  basis: "Positive returned completed item update; auth/body/item negatives returned expected 401/400/404 field-scoped errors."
"prompt/extra_prompt compatibility is proven exactly as contract requires.":
  checked: true
  proof_artifacts:
    - "reingest_positive_prompt"
    - "reingest_extra_prompt_compat"
    - "provider seam proof calls 1-2"
    - "reingest_conflicting_prompt_aliases"
  basis: "prompt and extra_prompt both reached OpenRouter-compatible provider as item.prompt; conflict returned 400 field prompt."
"No durable selected model or extra prompt state remains after the request.":
  checked: true
  proof_artifacts:
    - "no_durable_prompt_model_state_check"
  basis: "SQLite scan across text columns found no exact request-scoped model/prompt strings."
"Model-list route compatibility and all-model/safe-unavailable semantics are proven.":
  checked: true
  proof_artifacts:
    - "model_list_canonical_curl"
    - "model_list_compatibility_curl"
    - "model_list_query_rejected"
    - "model_list_missing_owner_token"
    - "focused Go proof test missing-key/provider-failure logs"
  basis: "Canonical and compatibility routes returned identical two-model provider list; query/auth negatives and safe-unavailable missing-key/provider-failure semantics were covered."
"Chinese post-reingest summary/core proof is present.":
  checked: true
  proof_artifacts:
    - "set_language_zh"
    - "reingest_zh_explicit"
    - "item_detail_after_zh"
    - "provider seam proof call 3"
  basis: "Explicit zh re-ingest returned and persisted zh title/summary/core/feed/body fields with language zh."
"Any UNPROVEN/blocker row has a closure path and blocks final gate.":
  checked: true
  proof_artifacts:
    - "Behavioral proof register"
    - "Closure Fields"
  basis: "No UNPROVEN/blocker rows remain; if any had remained, gate_open_allowed would be false."
```

## Commit Hashes

- Filled in final handoff after commit.

## Action Summary

Read all mandated references, built and started the actual `cmd/resofeed` runtime in the isolated worktree, ran a deterministic OpenRouter-compatible HTTP provider, seeded state through public `/api/state/import`, exercised required public API routes with real `curl`, scanned SQLite for durable prompt/model leakage, ran focused Go proof tests, and added this audit report only.

## Verification Run

- Runtime build: `go build -o .audit-artifacts/api-curl-regression-suite-runtime/resofeed ./cmd/resofeed` — exit 0.
- Runtime start: actual binary bound `127.0.0.1:19080`; unauthenticated probe returned raw `401`.
- Curl/API suite: all curl invocations exited 0 and returned expected status/body.
- Focused Go proof tests: `go test ./internal/resofeed -run 'TestPostClosure|TestBackendRealAPIProofThroughHTTPServer|TestBackendReingestSuccessThroughPublicStateImportSetup' -count=1 -v` — exit 0.

## Artifacts Modified

- `audits/post-closure-reingest-model-i18n-repair-strict-independent-api-curl-regression-suite.md` (this verification report)
- Product files modified: none

## Programmatic Handoff

```json
{"verdict":"PASS","headline":"PASS","blocking_status":"CLOSED","proof_gap_status":"NONE","gate_open_allowed":true,"orchestrator_action_hint":"COMPLETE","blockers":[],"uncertainty_sources":[],"verification_exit_codes":{"go_build_runtime":0,"curl_suite":0,"sqlite_durable_state_scan":0,"focused_go_test":0},"artifacts_modified":["audits/post-closure-reingest-model-i18n-repair-strict-independent-api-curl-regression-suite.md"],"product_files_modified":false}
```
