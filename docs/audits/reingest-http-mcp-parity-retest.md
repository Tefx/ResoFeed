# Re-ingest HTTP/MCP Parity Retest

Date: 2026-05-23
Step: `reingest-http-mcp-parity-retest`
Tester: `integration-verifier`

## Verification Report: HTTP and MCP selected-item re-ingest/model-list parity

**Headline**: PASS  
**Blocking Status**: CLOSED  
**Proof-Gap Status**: NONE  
**Verdict**: PASS  
**Blockers**: []  
**Orchestrator Action Hint**: COMPLETE

## refs Read Confirmation

- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — R2 requires canonical `GET /api/runtime/openrouter-models` plus compatibility `GET /api/runtime/openrouter/models` with same auth/query/shape/redaction semantics; R4 requires strict JSON selected-item re-ingest with request-scoped nullable `model`, canonical `prompt`, compatibility `extra_prompt`, conflict rejection before OpenRouter, model length limit 200 bytes, prompt length 4000 bytes, idempotency fingerprinting over normalized prompt/model, no durable persistence, and strict content-type/query/unknown-field rejection.
- `docs/ARCHITECTURE.md` — ResoFeed is one Go binary serving JSON HTTP and MCP Streamable HTTP; HTTP and MCP are thin transports over the same product operations; owner token gates `/api/*` and `/mcp`; OpenRouter is JSON-in/JSON-out only; selected item re-ingest is item-scoped, one-time, and non-durable; item re-ingest response shape is canonical across HTTP/MCP/frontend; canonical HTTP model-list and compatibility routes are documented.
- `docs/USAGE.md` — Public usage documents owner-token auth, canonical model-list route and compatibility path, selected-item re-ingest examples with `prompt` and `extra_prompt`, and MCP `list_openrouter_models` / `reingest_item` as external agent operations. Note: older passages describe MCP prompt/model parity as pending; the step description is authoritative for this retest and requires unconditional MCP parity evidence.
- `docs/PROMPTING_SYSTEM.md` — One-time prompt priority is below schema/source grounding/target-language boundaries and above active steering; `guidance.one_time_prompt` is trimmed, max 4000 UTF-8 bytes, request-scoped, and must never be persisted as prompt/preference/provenance/portable state; the LLM remains a bounded JSON transformer with Go-owned validation.

## Commands Run

| Command | Exit | Raw Evidence |
|---|---:|---|
| `go test -v ./internal/resofeed -run 'TestV21(OpenRouterModelListRoutesShareStrictRedactedSemantics\|ItemReingestStrictHTTPModelPromptAndReceiptSemantics\|ItemReingestStorableFailureRefreshesSelectedFTSAndItem\|MCPListOpenRouterModelsIsProviderBackedAndRedacted\|MCPReingestItemAcceptsPromptModelAndUsesSharedOperation)$'` | 0 | Collected and ran 5 named tests with non-empty subtests. Output ended `PASS` and `ok resofeed/internal/resofeed 0.540s`; no skips. |
| temporary runtime proof probe `go test -v ./internal/resofeed -run '^TestRetestProofArtifactRuntimeOutputs$'` | 0 | Exercised real `NewRouter` HTTP handlers and `NewMCPHandler` runtime tool paths; selected raw outputs quoted below. Temporary probe file was deleted and is not committed. |

## Retest Evidence

### HTTP model-list route matrix

Raw route outputs from runtime HTTP handler probe:

```text
http_model_list /api/runtime/openrouter-models status=200 content_type="application/json; charset=utf-8" body={"models":[{"id":"openrouter/retest-model","name":"Retest Model"}]}
http_model_list /api/runtime/openrouter/models status=200 content_type="application/json; charset=utf-8" body={"models":[{"id":"openrouter/retest-model","name":"Retest Model"}]}
provider_call_count_after_http_model_list=2
```

Targeted matrix tests additionally covered unauthorized `401`, query rejection `400`, identical shape/body semantics, missing-key empty model array, and provider failure redaction.

### HTTP re-ingest positive/refreshed item/FTS/idempotency/stable failure/non-persistence

```text
http_reingest_positive status=200 content_type="application/json; charset=utf-8" body={"reingest":{"item_id":"item_reingest_01","status":"completed","language":"en","item_updated":true,"fts_updated":true,"error":null,"item":{"id":"item_reingest_01","source_id":"src_item_reingest","source_title":"Item Reingest Source","url":"http://127.0.0.1:64690/selected","title":"V21 title","summary":"V21 summary from selected article body","core_insight":"V21 insight.","value_tier":"high","published_at":null,"extraction_status":"full","model_status":"ok","is_resonated":false,"human_inspected_at":null,"external_surfaced_at":null,"story_key":null,"duplicate_of_item_id":null,"feed_excerpt":"V21 excerpt","extracted_text":"V21 extracted","provenance":{"source_url":"http://127.0.0.1:64690/feed.xml","canonical_url":"http://127.0.0.1:64690/selected","original_url":"http://127.0.0.1:64690/selected","story_key":null,"duplicate_of_item_id":null,"grouped_source_items":[]}}},"already_applied":false}
llm_after_positive calls=1 model="openrouter/retest-model" prompt="tighten facts"
idempotency_replay status=200 content_type="application/json; charset=utf-8" body={..."already_applied":true}
idempotency_mismatch status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"idempotency_key","reason":"request_fingerprint_mismatch"}}}
stable_failure_fts_refreshed {"reingest":{"item_id":"item_reingest_01","status":"completed_with_errors","language":"en","item_updated":true,"fts_updated":true,"error":{"item_id":"item_reingest_01","code":"decode_error","message":"decode_error"},"item":{"id":"item_reingest_01",..."model_status":"decode_error",...}},"already_applied":false}
non_persistence_timeout {"reingest":{"item_id":"item_reingest_01","status":"failed","language":"en","item_updated":false,"fts_updated":false,"error":{"item_id":"item_reingest_01","code":"timeout","message":"item processing timed out"},"item":null},"already_applied":false}
```

The targeted tests also asserted receipt/state export omit raw prompt/model values and that timeout preserves the prior item/FTS state.

### Prompt/extra_prompt conflict: 400 and no provider call

```text
prompt_extra_prompt_conflict status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"prompt"}}}
prompt_extra_prompt_conflict_provider_calls_delta=0
```

### Model length boundary

```text
model_length_200_trimmed status=200 content_type="application/json; charset=utf-8" body={"reingest":{"item_id":"item_reingest_01","status":"completed","language":"en","item_updated":true,"fts_updated":true,"error":null,"item":{...}},"already_applied":false}
model_length_200_llm model_bytes=200 calls=2
model_length_201_rejected status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"model"}}}
model_length_201_provider_calls_delta=0
```

### Strict request negative raw HTTP evidence

```text
strict_negative_missing_content_type status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"content_type":""}}}
strict_negative_wrong_content_type status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"content_type":"text/plain"}}}
strict_negative_query_parameter status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"trace"}}}
strict_negative_language_rejection status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"language"}}}
strict_negative_unknown_field status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"durable_prompt"}}}
idempotency_mismatch status=400 content_type="application/json; charset=utf-8" body={"error":{"code":"bad_request","message":"bad request","details":{"field":"idempotency_key","reason":"request_fingerprint_mismatch"}}}
```

### MCP parity tool outputs

```text
mcp_list_openrouter_models {"jsonrpc":"2.0","id":1,"result":{"content":[{"text":"{\"models\":[{\"id\":\"openrouter/mcp-retest\",\"name\":\"MCP Retest\"}]}","type":"text"}]}}
mcp_model_list_provider_call_count=1
mcp_reingest_item_schema {"description":"Re-ingest exactly one selected item using the current runtime language with optional request-scoped OpenRouter model and one-time prompt.","inputSchema":{"additionalProperties":false,"properties":{"actor_id":...,"extra_prompt":{"default":null,...},"idempotency_key":...,"item_id":...,"model":{"default":null,...},"prompt":{"default":null,...}},"required":["item_id","actor_id","idempotency_key"],"type":"object"},"name":"reingest_item"}
mcp_reingest_item_positive_extra_prompt {"jsonrpc":"2.0","id":1,"result":{"content":[{"text":"{\"reingest\":{\"item_id\":\"item_reingest_01\",\"status\":\"completed\",\"language\":\"en\",\"item_updated\":true,\"fts_updated\":true,\"error\":null,\"item\":{...}},\"already_applied\":false}","type":"text"}]}}
mcp_reingest_llm calls=1 model="openrouter/mcp-request" prompt="mcp tighten"
mcp_reingest_item_replay_prompt {"jsonrpc":"2.0","id":1,"result":{"content":[{"text":"{...\"already_applied\":true}","type":"text"}]}}
```

Targeted MCP tests additionally verified schema has `model`, `prompt`, `extra_prompt`, rejects `language`, `prompt`/`extra_prompt` conflict returns field `prompt` with zero LLM calls, idempotency mismatch returns `idempotency_key`, provider failure is redacted, and receipts/state export omit raw prompt/model.

## Evidence Levels

| Level | Status | Evidence |
|---|---|---|
| L0 Static | PROVEN | Required refs read; test files define runtime handler/tool parity checks. |
| L1 Contracts | PROVEN | Targeted Go tests passed with non-empty collection and no skips. |
| L2 Real Wiring | PROVEN | Runtime `NewRouter` and `NewMCPHandler` invocations returned route/tool payloads and provider call counts. |
| L3 Live Intelligence | EXCLUDED_OR_DEFERRED | Provider is httptest OpenRouter boundary, not live OpenRouter; this retest required runtime handler/tool parity and no secret-dependent live OpenRouter call. |

## Protocol Results

| Protocol | Result | Evidence | Gap |
|---|---|---|---|
| P1 Empty Room | PASS | Targeted command ran 5 named tests plus subtests; no `collected 0`, no skips. | None |
| P2 Fake Seam | PASS_WITH_DEBT | Tests use httptest provider/LLM stubs to make failure modes deterministic, but route and MCP handler code paths are real. | No live OpenRouter L3 proof. |
| P8 Caller Reachability | PASS | HTTP routes and MCP tool calls invoked runtime handlers directly. | None |
| P9 Smoke/Liveness | PASS | Route/tool invocations returned substantive JSON responses and provider call counts. | None |

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| R2/model-list-http | Canonical and compatibility HTTP model-list routes share status/shape/redaction/auth/query semantics. | HTTP route invocations and targeted matrix tests. | `http_model_list` raw outputs; `TestV21OpenRouterModelListRoutesShareStrictRedactedSemantics`. | PROVEN | n/a | Both routes returned identical JSON shape and provider calls; tests cover auth/query/redaction. |
| R4/reingest-positive | HTTP selected-item re-ingest accepts model/prompt and returns refreshed item with FTS updated. | Runtime POST handler output. | `http_reingest_positive`; `llm_after_positive`. | PROVEN | n/a | Response has `status=completed`, `item_updated=true`, `fts_updated=true`, refreshed item, normalized model/prompt. |
| R4/stable-failure | Storable provider/validation failures refresh selected FTS/item; timeout does not persist/degrade. | Direct operation and targeted tests. | `stable_failure_fts_refreshed`; `non_persistence_timeout`; `TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem`. | PROVEN | n/a | Decode error wrote safe stable row and FTS; timeout produced `item_updated=false`, `fts_updated=false`, `item=null`. |
| R4/idempotency | Same normalized prompt/model replays; same key changed prompt/model mismatches. | Runtime POST handler outputs. | `idempotency_replay`; `idempotency_mismatch`. | PROVEN | n/a | Replay `already_applied=true`; mismatch `400 bad_request` field `idempotency_key`, reason `request_fingerprint_mismatch`. |
| R4/conflict | Different non-empty normalized `prompt`/`extra_prompt` returns `400 bad_request` with no OpenRouter call. | Runtime POST handler output plus call count delta. | `prompt_extra_prompt_conflict`; `provider_calls_delta=0`. | PROVEN | n/a | Error field `prompt`, LLM calls unchanged. |
| R4/model-boundary | Trimmed model <=200 bytes accepted; >200 rejected before OpenRouter. | Runtime POST handler output plus call count. | `model_length_200_trimmed`; `model_length_201_rejected`. | PROVEN | n/a | 200-byte model reached LLM as 200 bytes; 201 rejected `field=model`, call delta 0. |
| R4/strict-request | Re-ingest enforces content-type, query-free URL, no `language`, no unknown fields. | Raw HTTP handler negative outputs. | `strict_negative_*`. | PROVEN | n/a | All negatives returned `400 bad_request` with expected field/details. |
| R4/non-persistence | Raw prompt/model not persisted to receipts/state export. | Targeted assertions. | `TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics`; `TestV21MCPReingestItemAcceptsPromptModelAndUsesSharedOperation`. | PROVEN | n/a | Tests assert receipt/export omit raw prompt/model strings. |
| MCP/model-list | MCP `list_openrouter_models` is provider-backed and redacted. | Runtime MCP tool call plus targeted test. | `mcp_list_openrouter_models`; `TestV21MCPListOpenRouterModelsIsProviderBackedAndRedacted`. | PROVEN | n/a | Tool returned `{models:[...]}` and provider call count 1; redaction failure test passed. |
| MCP/reingest-fields | MCP `reingest_item` exposes and accepts `model`, `prompt`, and `extra_prompt`; rejects `language`. | Tools/list schema and tool calls. | `mcp_reingest_item_schema`; targeted schema assertions. | PROVEN | n/a | Schema includes all three fields and `additionalProperties:false`; targeted test rejects language. |
| MCP/reingest-positive | MCP `reingest_item` passes normalized model and prompt/extra_prompt to shared operation and returns canonical response/replay. | Runtime MCP tool calls. | `mcp_reingest_item_positive_extra_prompt`; `mcp_reingest_llm`; `mcp_reingest_item_replay_prompt`. | PROVEN | n/a | LLM saw normalized `model` and prompt; response has completed item/FTS and replay already_applied. |

## Checklist Receipt

- http-model-list-matrix: DONE — HTTP route raw outputs plus targeted model-list matrix test.
- http-reingest-green: DONE — positive, stable failure, FTS refresh, refreshed item, idempotency replay/mismatch, non-persistence assertions all green.
- prompt-extra-conflict-no-provider: DONE — `400 bad_request`, field `prompt`, provider/LLM call delta 0.
- model-boundary: DONE — 200-byte trimmed model accepted/reached LLM; 201-byte model rejected before LLM.
- strict-request-negative-evidence: DONE — content-type, query parameter, language, unknown-field, idempotency mismatch raw handler outputs captured.
- mcp-parity-runtime-tool-calls: DONE — `list_openrouter_models` and `reingest_item` runtime MCP tool calls captured; `model`, `prompt`, `extra_prompt` present/verified.
- behavioral-register: DONE — register above maps every owned row to `PROVEN` or `EXCLUDED_OR_DEFERRED` with basis.
- actual-route-tool-output: DONE — artifact includes actual runtime HTTP handler outputs and MCP tool JSON-RPC outputs, not only unit summaries.

## Findings

- No blocking defects found.
- Debt/risk: the proof uses deterministic local httptest provider/LLM rather than live OpenRouter credentials; this is appropriate for R4 rejection/no-call/idempotency proofs and avoids secret exposure, but it is L2 not L3 live external service proof.

## Closure Fields

verdict: PASS  
blockers: []  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE
