# Re-ingest HTTP/MCP Parity Gate

Date: 2026-05-23  
Step: `reingest-http-mcp-parity-gate`  
Reviewer: `gate-reviewer`

## Headline

[PASS] HTTP/MCP re-ingest and model-list parity is ready to proceed. The prior retest artifact contains raw runtime HTTP handler and MCP JSON-RPC output for each gate-critical behavior, and the referenced targeted tests were re-run in this isolated worktree with exit code 0. Full Go regression also passed.

## Blocking Status

CLOSED — no blocking gaps remain.

## Proof-Gap Status

NONE for this gate scope. A live external OpenRouter L3 smoke is intentionally excluded from the retest artifact; deterministic `httptest` provider evidence is sufficient for strict validation, negative/no-provider-call proofs, redaction, idempotency, and MCP/HTTP transport parity without exposing secrets.

## Verdict

PASS

## refs Read Confirmation

- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — R4 requires strict JSON `POST /api/items/{id}/reingest`, canonical `prompt`, compatibility `extra_prompt`, conflict rejection before OpenRouter, model limit 200 bytes after trimming, no unknown `language`, prompt/model in idempotency fingerprint but not persisted, and refreshed item in response (`lines 102-148`). R2 requires canonical and compatibility OpenRouter model-list routes with identical auth/query/shape/redaction semantics (`lines 45-71`).
- `docs/ARCHITECTURE.md` — HTTP and MCP are thin transports over the same product operations (`line 18`); selected item re-ingest is one-time and non-durable (`line 27`); canonical re-ingest response includes `fts_updated` and refreshed `item` (`lines 388, 1790-1807`); strict route/model/prompt/idempotency rules are defined at `lines 1746-1859`; MCP parity is allowed only when runtime DTO/config wiring is verified (`lines 2051-2070`).
- `docs/USAGE.md` — public HTTP docs require canonical/compat model-list routes and re-ingest examples with `prompt`/`extra_prompt`, unknown-field rejection, idempotency mismatch, and no prompt/model persistence (`lines 304-369`). It also documents older MCP prompt/model parity as pending (`lines 970-976, 1027-1040`), which conflicts with this gate’s step scope; the step description is authoritative for this gate, and runtime tests prove implementation now exposes the fields.
- `docs/audits/reingest-http-mcp-parity-retest.md` — independent retest reports PASS with raw HTTP and MCP runtime outputs: model-list route outputs (`lines 36-40`), re-ingest positive/FTS/refreshed item/idempotency/stable failure/non-persistence (`lines 46-55`), prompt/extra conflict no provider call (`lines 59-62`), model boundary (`lines 67-70`), strict negative HTTP evidence (`lines 76-82`), and MCP schema/tool outputs (`lines 87-95`).
- `internal/resofeed/reingest_http_result_idempotency_v21_test.go` — tests cover model-list auth/query/shape/redaction (`lines 17-100`), strict HTTP negatives including content-type/query/language/unknown/prompt conflict/model length with no LLM calls (`lines 102-181`), receipt/state export omission of raw prompt/model (`lines 242-268`), and storable failure vs timeout FTS/item behavior (`lines 183-225`).
- `internal/resofeed/mcp_reingest_model_prompt_parity_v21_test.go` — tests cover MCP provider-backed model list with missing-key and redacted failure behavior (`lines 13-71`) and MCP `reingest_item` schema/behavior for `model`, `prompt`, `extra_prompt`, language rejection, prompt conflict no LLM calls, idempotency replay/mismatch, and non-persistence (`lines 73-124`).

## Constitution Audit

- Workspace search for `CONSTITUTION.md`: no file found under the isolated worktree, so no constitution clauses apply.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| R2-MODEL-LIST-HTTP | Repair contract R2 `GET /api/runtime/openrouter-models` plus compatibility `GET /api/runtime/openrouter/models` with same auth/query/shape/redaction. | Runtime route proof and passing tests for both routes. | Retest `http_model_list` raw outputs; `TestV21OpenRouterModelListRoutesShareStrictRedactedSemantics`; re-run targeted tests exit 0. | PROVEN | Yes |
| R4-HTTP-POSITIVE-REINGEST | Repair contract R4 selected-item re-ingest accepts model/prompt and returns refreshed item envelope. | Runtime raw POST output with `item_updated`, `fts_updated`, and `item`; test assertions. | Retest `http_reingest_positive`; HTTP test lines 152-181; targeted re-run exit 0. | PROVEN | Yes |
| R4-RESULT-SHAPE-FTS-ITEM | Architecture canonical response includes `fts_updated` and refreshed `item`. | Response body evidence and typed assertions. | Retest lines 47, 51, 67, 90; tests assert `FTSUpdated` and non-null `Item` for updated paths. | PROVEN | Yes |
| R4-STABLE-FAILURE-PERSISTENCE | Safe provider/model/decode failures update selected item and FTS; timeout does not degrade prior state. | Direct operation tests plus raw retest snippets. | Retest `stable_failure_fts_refreshed` and `non_persistence_timeout`; `TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem`. | PROVEN | Yes |
| R4-IDEMPOTENCY-FINGERPRINT | Normalized prompt/model participates in fingerprint; raw values excluded from receipt storage. | Replay/mismatch outputs and receipt/export omission assertions. | Retest `idempotency_replay`, `idempotency_mismatch`; `assertReceiptOmitsRawPromptModel`; `assertStateExportOmits`. | PROVEN | Yes |
| R4-PROMPT-ALIAS-CONFLICT | Different non-empty normalized `prompt`/`extra_prompt` returns 400 field prompt/extra_prompt and does not call OpenRouter. | Raw HTTP output with call delta 0 and test no-call assertion. | Retest `prompt_extra_prompt_conflict_provider_calls_delta=0`; HTTP test subtest `prompt_alias_conflict`; MCP test conflict. | PROVEN | Yes |
| R4-MODEL-LENGTH-LIMIT | Trimmed model <=200 bytes accepted; >200 rejected before OpenRouter. | Raw runtime outputs and LLM call delta. | Retest `model_length_200_trimmed`, `model_length_201_rejected`, `model_length_201_provider_calls_delta=0`; HTTP test lines 124, 152-158. | PROVEN | Yes |
| R4-STRICT-HTTP-REQUEST | Content-type, query-free mutation, language rejection, unknown-field rejection, and idempotency mismatch proven with raw negative HTTP evidence. | Raw negative HTTP outputs and passing subtests. | Retest `strict_negative_*` lines 76-82; HTTP subtests listed in re-run output. | PROVEN | Yes |
| R4-REDaction-NON-PERSISTENCE | Redaction/non-persistence covers prompt/provider/secret fields, not sampled. | Tests inject forbidden provider/key/env/owner-token strings and assert absence; receipt/export asserts prompt/model absence. | HTTP model-list failure test lines 78-99; MCP failure test lines 50-70; non-persistence helpers lines 242-268; MCP lines 122-123. | PROVEN | Yes |
| MCP-MODEL-LIST-PARITY | No pending MCP model-list target remains without proof. | MCP runtime tool output plus provider call count and redaction tests. | Retest `mcp_list_openrouter_models`; `TestV21MCPListOpenRouterModelsIsProviderBackedAndRedacted`; re-run targeted tests exit 0. | PROVEN | Yes |
| MCP-REINGEST-PROMPT-MODEL-PARITY | No pending MCP re-ingest prompt/model target remains without proof. | MCP tools/list schema includes fields; runtime call passes normalized model/prompt to shared operation; replay/mismatch proof. | Retest `mcp_reingest_item_schema`, `mcp_reingest_item_positive_extra_prompt`, `mcp_reingest_llm`; `TestV21MCPReingestItemAcceptsPromptModelAndUsesSharedOperation`. | PROVEN | Yes |
| REGRESSION-GO-SUITE | Unrelated Go systems not destabilized. | Full package regression. | `go test ./...` exit 0. | PROVEN | Yes |

## Orphan Requirements

None found for the gate-owned HTTP/MCP parity and R4 strict request scope.

## Gate Decision Basis

| requirement_ref | evidence_ref | status | gate_decision_basis |
| --- | --- | --- | --- |
| R4-PROMPT-ALIAS-CONFLICT | Retest lines 59-62; `TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/prompt_alias_conflict`; MCP conflict test lines 89-95 | PROVEN | HTTP and MCP both reject conflicting aliases with `bad_request`/field `prompt` and the call counters prove no OpenRouter/LLM boundary call. |
| R4-MODEL-LENGTH-LIMIT | Retest lines 67-70; HTTP test lines 124, 152-158 | PROVEN | Trimmed 200-byte model is accepted and reaches LLM as exactly 200 bytes; 201-byte model is rejected as `field=model` with provider call delta 0. |
| R4-STRICT-HTTP-REQUEST | Retest lines 76-82; re-run subtests for missing/wrong content type, query, language, unknown field, idempotency mismatch | PROVEN | Negative raw HTTP proof covers all requested strict request failures with `400 bad_request` and field/details. |

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| R2/model-list-http | Canonical and compatibility HTTP model-list routes share status/shape/redaction/auth/query semantics. | Runtime route invocations and targeted matrix test. | Retest `http_model_list`; `TestV21OpenRouterModelListRoutesShareStrictRedactedSemantics`; targeted re-run exit 0. | PROVEN | n/a | Both routes returned identical JSON shape; tests cover unauthorized, query rejection, missing-key empty array, provider call count, and provider failure redaction. |
| R4/reingest-result-fields | HTTP/MCP re-ingest responses include `fts_updated` and refreshed `item` when updated. | Raw runtime response and typed assertions. | Retest `http_reingest_positive`, `stable_failure_fts_refreshed`, `mcp_reingest_item_positive_extra_prompt`; tests assert `FTSUpdated` and non-null `Item`. | PROVEN | n/a | The result shape matches architecture lines 1790-1807 and contains `item_updated=true`, `fts_updated=true`, and `item`. |
| R4/stable-failure | Safe provider/model/decode failures persist stable selected-item state and refresh FTS; timeout does not write/degrade. | Direct operation and runtime output evidence. | Retest lines 51-52; `TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem`. | PROVEN | n/a | Storable failures commit stable error rows with refreshed FTS; timeout returns failed with no item/FTS mutation and fixture preserved. |
| R4/idempotency-non-persistence | Normalized prompt/model controls replay/mismatch; raw prompt/model not stored in receipts or state export. | Runtime replay/mismatch and DB/export assertions. | Retest lines 49-55; HTTP test lines 170-180 and helpers lines 242-268; MCP test lines 109-123. | PROVEN | n/a | Same normalized body replays; changed prompt mismatches; forbidden strings are checked against receipt fingerprint/snapshot and state export. |
| R4/prompt-extra-conflict | Conflicting non-empty normalized aliases reject before provider. | Raw route output and call count delta. | Retest lines 59-62; HTTP no-call assertion lines 126-148; MCP no-call assertion lines 89-95. | PROVEN | n/a | `400 bad_request` field `prompt`; LLM/provider call delta 0. |
| R4/model-boundary | Model length limit is enforced after trim and before provider on over-limit input. | Raw route output and call count delta. | Retest lines 67-70; HTTP test lines 124, 152-158. | PROVEN | n/a | Accepted path proves normalized 200-byte value; rejected path proves pre-provider rejection. |
| R4/strict-negative-http | Content-type, query, language, unknown-field, and idempotency mismatch have raw HTTP negative proof. | Raw HTTP outputs. | Retest lines 76-82; targeted re-run subtest output. | PROVEN | n/a | All listed failures return `400 bad_request` with expected field/details. |
| R4/redaction | Provider/secret fields are not exposed; prompt/model values are not persisted. | Forbidden-string assertions and raw redacted outputs. | HTTP test lines 78-99; MCP test lines 50-70; non-persistence helpers lines 242-268; retest notes lines 55, 95. | PROVEN | n/a | Tests intentionally inject raw provider detail, key, `.env`, owner token and fail on leaks; prompt/model forbidden values checked in receipts/export. |
| MCP/model-list | MCP `list_openrouter_models` is provider-backed and redacted. | Runtime MCP JSON-RPC output and targeted test. | Retest lines 87-88; MCP test lines 13-71; targeted re-run exit 0. | PROVEN | n/a | Tool returned OpenRouter models with provider call count 1 and redacted provider failure. |
| MCP/reingest-fields | MCP `reingest_item` exposes model/prompt/extra_prompt and rejects language. | Tools/list schema and targeted schema test. | Retest line 89; MCP test lines 79-87. | PROVEN | n/a | Schema has all parity fields, excludes `language`, and enforces no extra product concepts. |
| MCP/reingest-shared-operation | MCP re-ingest sends normalized model/prompt to shared operation and returns canonical response/replay/mismatch. | Runtime MCP tool calls and DB/export assertions. | Retest lines 90-93; MCP test lines 97-123. | PROVEN | n/a | LLM saw normalized values; response has item/FTS; replay and mismatch semantics match HTTP. |

## Risk Classification and Sampling

- CRITICAL: `internal/resofeed/reingest_http_result_idempotency_v21_test.go` and `internal/resofeed/mcp_reingest_model_prompt_parity_v21_test.go` because they define auth, strict transport, idempotency, persistence, and MCP/HTTP parity obligations. Reviewed 100% of public test coverage and assertion intent.
- CRITICAL: `docs/audits/reingest-http-mcp-parity-retest.md` because it is the required proof artifact. Reviewed the complete artifact.
- STANDARD: `docs/ARCHITECTURE.md` and `docs/USAGE.md` scoped sections. Reviewed the relevant HTTP/MCP/persistence/redaction sections and conflict/pending notes.
- Anomaly scan: no `TODO`, `FIXME`, `t.Skip`, panic, `@invar:allow`, or test-body pass/stub patterns found in the two required v2.1 parity test files. Use of `map[string]any` in MCP tests is normal JSON schema/test plumbing and does not affect gate confidence.

## Blockers

None.

## Warnings

- Documentation drift warning: `docs/USAGE.md` and parts of `docs/ARCHITECTURE.md` still phrase MCP prompt/model parity as pending. The gate step is authoritative and runtime tests prove parity, so this is not a blocker for this gate, but a later docs-sync should remove stale pending wording to prevent operator confusion.

## Notes

- No `CONSTITUTION.md` exists in the isolated worktree.
- This gate artifact modified documentation only; no product code was changed.

## Verification Commands

### Targeted parity tests

Command:

```bash
go test -v ./internal/resofeed -run 'TestV21(OpenRouterModelListRoutesShareStrictRedactedSemantics|ItemReingestStrictHTTPModelPromptAndReceiptSemantics|ItemReingestStorableFailureRefreshesSelectedFTSAndItem|MCPListOpenRouterModelsIsProviderBackedAndRedacted|MCPReingestItemAcceptsPromptModelAndUsesSharedOperation)$'
```

Exit code: `0`

Raw output:

```text
=== RUN   TestV21MCPListOpenRouterModelsIsProviderBackedAndRedacted
--- PASS: TestV21MCPListOpenRouterModelsIsProviderBackedAndRedacted (0.00s)
=== RUN   TestV21MCPReingestItemAcceptsPromptModelAndUsesSharedOperation
--- PASS: TestV21MCPReingestItemAcceptsPromptModelAndUsesSharedOperation (0.01s)
=== RUN   TestV21OpenRouterModelListRoutesShareStrictRedactedSemantics
--- PASS: TestV21OpenRouterModelListRoutesShareStrictRedactedSemantics (0.00s)
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/missing_content-type
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/wrong_content-type
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/query_rejected
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/language_rejected
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/unknown_rejected
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/prompt_alias_conflict
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/invalid_model_syntax
=== RUN   TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/model_over_200_bytes
--- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics (0.01s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/missing_content-type (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/wrong_content-type (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/query_rejected (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/language_rejected (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/unknown_rejected (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/prompt_alias_conflict (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/invalid_model_syntax (0.00s)
    --- PASS: TestV21ItemReingestStrictHTTPModelPromptAndReceiptSemantics/model_over_200_bytes (0.00s)
=== RUN   TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem
=== RUN   TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem/provider_invalid_model
=== RUN   TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem/provider_unavailable
=== RUN   TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem/decode_schema_semantic_exhausted
--- PASS: TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem (0.02s)
    --- PASS: TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem/provider_invalid_model (0.01s)
    --- PASS: TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem/provider_unavailable (0.00s)
    --- PASS: TestV21ItemReingestStorableFailureRefreshesSelectedFTSAndItem/decode_schema_semantic_exhausted (0.00s)
PASS
ok  	resofeed/internal/resofeed	0.628s
```

### Full Go regression

Command:

```bash
go test ./...
```

Exit code: `0`

Raw output:

```text
?   	resofeed/cmd/resofeed	[no test files]
ok  	resofeed/internal/resofeed	1.185s
```

## Checklist Receipt

- every-row-reviewed: DONE — Positive Requirement Coverage Ledger maps each material requirement row to concrete evidence.
- open-positive-proof-core: DONE — Model list, result fields, stable failure persistence, idempotency/non-persistence, and MCP parity all `PROVEN` in the ledger.
- prompt-extra-conflict-no-openrouter: DONE — Retest lines 59-62 and targeted tests prove `400 bad_request` and zero provider/LLM calls.
- model-boundary-pre-provider: DONE — Retest lines 67-70 prove 200-byte accept and 201-byte pre-provider rejection.
- strict-negative-raw-http: DONE — Retest lines 76-82 include raw HTTP evidence for content-type, query, language, unknown field, and idempotency mismatch.
- blocked-if-pending: DONE — Runtime MCP model-list and re-ingest parity tests prove no pending MCP target remains for this gate scope.
- rejects-missing-raw-redaction-proof: DONE — This gate relies on raw route/tool output plus redaction/non-persistence tests, not generic claims.

## Decision

verdict: PASS  
blockers: []  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE
