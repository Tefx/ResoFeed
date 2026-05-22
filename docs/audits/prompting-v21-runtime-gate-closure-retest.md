# Prompting v2.1 Runtime Gate Closure Retest

Auditor: gate-reviewer  
Step: `prompting-v21-runtime-gate-closure-retest`  
Date: 2026-05-23  
Verdict: **PASS**

## Headline

The failed `prompting-v21-runtime-gate` blockers B1 and B2 are independently proven closed in committed source at remediation commit `b760a6b5`. The downstream `selected-item-re-ingest-http-and-mcp-v2-1-parity` phase may advance only because both owned blocker rows are now positively proven by source evidence and deterministic green tests.

## Blocking Status

- Blockers: `[]`
- Gate open allowed: `true`
- Orchestrator action hint: `COMPLETE_CLOSURE_AND_ADVANCE`

## Proof-Gap Status

No B1/B2 proof gap remains for this closure retest scope. Generic test success was not used alone: B1 is tied to the selected-item durable-write caller and actual prompt context; B2 is tied to model normalizer source and a green pre-provider HTTP boundary test.

## refs Read Confirmation

- `CONSTITUTION.md` — Searched with `glob **/CONSTITUTION.md`; no file found in the isolated worktree, so no constitution fast-fail applies.
- `docs/PROMPTING_SYSTEM.md` — Lines 5 and 19-24 establish the LLM as a bounded JSON transformer with no durable state/orchestration and non-goals including no durable selected-item prompt/model state, no model-generated runtime status, and no model-generated receipt. Lines 236-260 define app-owned runtime status mapping and `decode_error` storage for exhausted validation failures. Lines 280-334 define deterministic Go validation, retry limits, and non-portable prompt receipts. Lines 336-340 state v2.1 compliance requires v2.1 payload, structured-output routing, strict schema validation, and semantic validation before persistence.
- `docs/ARCHITECTURE.md` — Lines 13-27 require one Go binary, SQLite-only state, Go-validated OpenRouter JSON transformation, and item-scoped selected-item re-ingest with request-scoped model/prompt that must not be persisted/exported/reused. Lines 97-111 require OpenRouter as the only LLM backend, Go validation before state mutation, and non-persistence/redaction of secrets/provider state.
- `docs/audits/prompting-v21-runtime-gate.md` — Lines 65-73 define B1: prior persistence validation used a synthetic default prompt context and needed actual item prompt context before `storeReprocessItem`. Lines 75-83 define B2: model visible/control-character validation needed implementation and green pre-OpenRouter test coverage. Lines 17-24 and 30-58 show the original fail basis and runtime-owned rows.
- `internal/resofeed/reprocess.go` — Lines 95-129 now normalize selected-item model values by trimming, accepting default/account-default as empty, rejecting >200 bytes, and allowing only visible model-id characters `[A-Za-z0-9._-/:]`. Lines 231-260 now build actual `OpenRouterSummaryInput`, compile the v2.1 prompt, and call `validateSummaryOutputForPersistenceWithPrompt(validationOut, compiled.UserPayload.Item)` before line 272 constructs a writable outcome and before line 183 can store it. Lines 261-267 map validation/model-status failures to stable app-owned failure outcomes instead of persisting invalid model content.
- `internal/resofeed/openrouter.go` — Lines 202-235 show OpenRouter client validation before returning success and one semantic repair path. Lines 241-289 implement persistence validation with caller-supplied prompt item context. Lines 267-289 enforce unavailable-source, language, and provenance checks; lines 292-319 enforce schema ceilings/enums; lines 390-404 restrict retryable validation failures.
- `internal/resofeed/http.go` — Lines 53-64 show one Go router serving static/API/MCP in-process. Lines 632-651 read selected-item `model`, `prompt`, and `extra_prompt` request fields, normalize optional strings, reject conflicting prompt aliases, and return request-scoped `ItemReingestRequest` without a persistence write in the HTTP layer.
- `internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go` — Lines 274-328 now run `TestPromptingV21R4StrictHTTPRequestModelBoundariesExpectedRed` without a parent skip and include deterministic checks that query params/content type are rejected before OpenRouter, a 200-byte model is passed request-scoped, a 201-byte model is rejected before OpenRouter, and `openrouter/bad\u0001model` is rejected before OpenRouter.
- `internal/resofeed/reprocess_test.go` — Lines 277-297 add `TestItemReingestPersistenceValidationUsesActualPromptContextBeforeWrite`, setting processing language to Chinese, using an LLM that returns English fields, expecting stable `decode_error`/FTS refresh, asserting cleared stored fields, and asserting the invalid English summary is absent from FTS.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| B1-contextless-persistence-validation | Failed gate lines 65-73: selected-item re-ingest must validate/saves using actual prompt context before durable write. | Source path proves actual compiled item prompt context is supplied to persistence validation before writable outcome/store, plus behavioral test proves context-invalid output does not persist. | `reprocess.go:231-260`, `reprocess.go:272`, `reprocess.go:182-184`; `reprocess_test.go:277-297`; targeted/full/race commands exit 0. | PROVEN | yes |
| PV21-VALIDATION-RETRY-RECEIPT | Prompting lines 280-334: validation before persistence, bounded repair, receipts are Go-owned/non-portable and not model output. | No persistence before valid output or app-owned stable failure; selected-item prompt/model remain request-scoped/non-portable. | `openrouter.go:202-235`, `openrouter.go:241-289`, `reprocess.go:255-267`, `reprocess.go:131-149`, `http.go:632-651`; tests exit 0. | PROVEN | yes |
| PV21-RUNTIME-STATUS | Prompting lines 236-260: Go owns provider/runtime statuses; exhausted validation maps to public/stored `decode_error`. | Selected-item validation failure maps to app-owned `decode_error` stable failure and no model-generated provider statuses are accepted as successful content. | `openrouter.go:308-312`, `reprocess.go:251-267`, `reprocess_test.go:290-296`; targeted/full/race commands exit 0. | PROVEN | yes |
| B2-model-visible-char-validation | Failed gate lines 75-83: non-default model must reject malformed/control-character visible IDs before OpenRouter. | Source normalizer rejects control characters and deterministic HTTP test proves no LLM call occurs. | `reprocess.go:110-129`; `prompting_v21_runtime_contract_expected_red_test.go:319-327`; targeted/full/race commands exit 0. | PROVEN | yes |

## Orphan Requirements

- None in this closure retest scope. The owned requirement rows supplied by the step are all mapped above and in the behavioral proof register. Previously noted broader provenance warning remains non-blocking and does not intersect B1/B2 closure or the next parity phase gate-open decision.

## Blockers

[]

## Warnings

- `W1`: `validatePromptProvenance` still only hard-fails mutated URLs when URLs are referenced (`openrouter.go:371-375`). The original failed gate already identified broader source-title/source-id validation as warning-level. It does not block this closure retest because B1 required actual prompt context at the persistence boundary and B2 required visible model validation; both are proven. Future provenance-hardening work should remain tracked separately if product scope demands it.

## Notes

- Remediation commit inspected: `b760a6b5 [vectl] step-prompting-v21-runtime-gate-blocker-remediation completed`; changed files are `internal/resofeed/reprocess.go`, `internal/resofeed/reprocess_test.go`, and `internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go`.
- No product code was modified during this retest; this artifact is the only intended change.

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| B1-contextless-persistence-validation | Selected-item re-ingest validates model output using the actual selected item prompt context before any durable successful write. | A wrong-language/schema-shaped output for a Chinese selected item must map to stable `decode_error`, clear readable fields, refresh FTS, and not persist invalid English text. | `reprocess.go:231-260`; `reprocess_test.go:277-297`; `go test ./internal/resofeed -run 'PromptingV21\|Reingest\|RuntimeStatus\|OpenRouter'` exit 0. | PROVEN | Remediation compiles prompt context and calls `validateSummaryOutputForPersistenceWithPrompt(..., compiled.UserPayload.Item)` before outcome becomes writable/storable. | B1 closed; no B1 blocker remains. |
| PV21-VALIDATION-RETRY-RECEIPT | Runtime never treats the model as self-validator and does not persist selected-item prompt/model/receipt as portable durable state. | OpenRouter path validates before success; selected-item path validates again at persistence boundary and only fingerprints trimmed request fields for idempotency, not portable state. | `openrouter.go:202-235`; `reprocess.go:131-149`, `reprocess.go:255-267`; `http.go:632-651`; full test exit 0. | PROVEN | No durable prompt/model preference path observed in touched source; invalid outputs become app-owned stable failure. | Supports gate open for runtime closure. |
| PV21-RUNTIME-STATUS | Go-owned status mapping is preserved for successful and stable failure paths. | Model can only pass `ok`/`summary_unavailable`; validation failures map to `decode_error`; provider/runtime errors map through app code. | `openrouter.go:308-312`; `reprocess.go:251-267`; `reprocess_test.go:290-293`; race command exit 0. | PROVEN | Invalid actual-context output does not become model-owned success; it stores app-owned decode failure. | Runtime status closure proven. |
| B2-model-visible-char-validation | Malformed/control-character visible model identifiers are rejected deterministically before provider invocation. | HTTP selected-item re-ingest with `openrouter/bad\u0001model` returns 400 field `model` and does not increment LLM call counter. | `reprocess.go:110-129`; `prompting_v21_runtime_contract_expected_red_test.go:319-327`; targeted test exit 0. | PROVEN | The skipped-test blocker is closed because the parent test is active and green. | B2 closed; no model-boundary blocker remains. |

## Requirement-to-Proof Mapping

| requirement_id | proof | status |
| --- | --- | --- |
| B1-contextless-persistence-validation | Actual context compile and validation before store: `reprocess.go:231-260`; durable write only after outcome decision: `reprocess.go:182-184`, `reprocess.go:272`; deterministic regression: `reprocess_test.go:277-297`; targeted/full/race tests exit 0. | PROVEN |
| PV21-VALIDATION-RETRY-RECEIPT | Prompt validation and retry: `openrouter.go:202-235`, `openrouter.go:241-289`; request-scoped model/prompt normalization/fingerprint only: `reprocess.go:95-149`, `http.go:632-651`; no portable receipt expansion in this remediation; tests exit 0. | PROVEN |
| PV21-RUNTIME-STATUS | Schema/status validation and app-owned mapping: `openrouter.go:292-319`, `reprocess.go:251-267`; B1 regression asserts `decode_error` stable failure: `reprocess_test.go:290-293`; tests exit 0. | PROVEN |
| B2-model-visible-char-validation | Normalizer rejects non-visible chars: `reprocess.go:110-129`; green HTTP pre-provider test: `prompting_v21_runtime_contract_expected_red_test.go:319-327`; targeted/full/race tests exit 0. | PROVEN |

## Verification Commands

| Command | Exit Code | Raw Output |
| --- | ---: | --- |
| `go test ./internal/resofeed -run 'PromptingV21\|Reingest\|RuntimeStatus\|OpenRouter'` | 0 | `ok   resofeed/internal/resofeed 1.265s` |
| `go test ./internal/resofeed` | 0 | `ok   resofeed/internal/resofeed 8.255s` |
| `go test -race ./internal/resofeed -run 'PromptingV21\|OpenRouterStructuredOutput\|PromptValidation\|RuntimeStatus\|Receipt\|Reingest'` | 0 | `ok   resofeed/internal/resofeed 4.327s` |
| `git show --stat --oneline b760a6b && git show --name-only --format=fuller b760a6b` | 0 | Remediation commit `b760a6b5` changed only `internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go`, `internal/resofeed/reprocess.go`, and `internal/resofeed/reprocess_test.go`. |

## Checklist Receipt

- refs-confirmation: DONE — See `## refs Read Confirmation`.
- targeted-prompting-reingest-runtime-openrouter-output: DONE — Targeted command exit 0 in `## Verification Commands`.
- full-go-test-output: DONE — Full package command exit 0 in `## Verification Commands`.
- race-focused-output: DONE — Focused race command exit 0 in `## Verification Commands`.
- b1-closure-audit: DONE — `B1-contextless-persistence-validation` ledger/register rows are `PROVEN` with `reprocess.go:231-260` and `reprocess_test.go:277-297`.
- b2-closure-audit: DONE — `B2-model-visible-char-validation` ledger/register rows are `PROVEN` with `reprocess.go:110-129` and `prompting_v21_runtime_contract_expected_red_test.go:319-327`.
- closure-fields-present: DONE — This artifact includes `verdict`, `blockers`, `gate_open_allowed`, and `orchestrator_action_hint` under `## Blocking Status`.
- blocked-if-unproven: DONE — All owned B1/B2/PV21 rows are `PROVEN`; no `UNPROVEN`, `NEEDS_TEST`, or `BLOCKED` owned row remains.
- downstream-advance-statement-if-pass: DONE — Headline states downstream `selected-item-re-ingest-http-and-mcp-v2-1-parity` may advance only because B1/B2 are closed.

## Verdict

`PASS`

## Gate Fields

```yaml
verdict: PASS
blockers: []
gate_open_allowed: true
orchestrator_action_hint: COMPLETE_CLOSURE_AND_ADVANCE
```

## Orchestrator Action Hint

COMPLETE_CLOSURE_AND_ADVANCE
