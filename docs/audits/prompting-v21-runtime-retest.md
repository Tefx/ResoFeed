# Prompting v2.1 Runtime Green Retest

Auditor: integration-verifier  
Step: `prompting-v21-runtime-retest`  
Date: 2026-05-22

## refs Read Confirmation

- `docs/PROMPTING_SYSTEM.md` read: exact system prompt, priority order, field contracts, ceilings, OpenRouter routing, runtime status, validation, retry, receipt, adoption note, and regression fixture requirements reviewed.
- `docs/ARCHITECTURE.md` read: single-binary/SQLite/OpenRouter transformer boundaries, runtime metadata, prompting v2.1 ingestion binding, Inspector item re-ingest contract, and verification targets reviewed.
- `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` read: v2.1 requirement-to-checklist traceability reviewed.
- `docs/audits/prompting-v21-contract-gate.md` read: prior gate, behavioral register, and checklist receipt reviewed.
- Relevant implementation/tests read: `internal/resofeed/openrouter.go`, `prompting_v21_source_budget_test.go`, `openrouter_structured_output_routing_test.go`, `openrouter_validation_retry_test.go`, `runtime_metadata_receipts_test.go`.
- `CONSTITUTION.md` absent in this isolated worktree.

## Verification Run

| Command | Exit | Raw Evidence |
|---|---:|---|
| `go test ./internal/resofeed` | 0 | `ok   resofeed/internal/resofeed  1.435s` |
| `go test -race ./internal/resofeed -run 'PromptingV21\|OpenRouterStructuredOutput\|PromptValidation\|RuntimeStatus\|Receipt'` | 0 | `ok   resofeed/internal/resofeed  1.899s` |
| `go build -o "/var/folders/rs/6_0h1ssn5439q1yfqy4pykg00000gn/T/opencode/resofeed-prompting-v21-runtime-retest" ./cmd/resofeed` | 0 | no stdout/stderr; binary built outside repo |
| `go test -v ./internal/resofeed -run 'TestPromptingV21CompilerEmitsExactSystemAndDocumentedPayload\|TestPromptingV21SelectedItemReingestInputUsesSamePromptCompiler\|TestPromptingV21PriorityAndInjectionBoundariesAreCompiledDeterministically\|TestPromptingV21SourceCleanupBudgetAndMetadataPreservation\|TestPromptValidationFailureCodesAndPublicSafeMapping\|TestPromptValidationFieldCeilingsForAllGeneratedFields\|TestPromptValidationRetryOneNormalThenOneRepair\|TestPromptValidationSchemaDowngradeDoesNotConsumeSemanticRepairBudget\|TestOpenRouterStructuredOutputRouting'` | 0 | PASS lines observed for exact system/user payload, selected-item re-ingest compiler, priority/injection boundaries, source budget, all validation codes, all field ceilings, repair budget, and OpenRouter routing tests. |
| `go test -v ./internal/resofeed -run 'TestRuntimeMetadataStateExportImportExcludesMetadataAndReceipts\|TestRuntimeMetadataProcessingLanguageDefaultsAndValidation\|TestReceiptLiveTTLReplayMismatchAndExpiredReplacement\|TestOpenRouterStructuredOutputRouting\|TestPromptValidation\|TestPromptingV21'` | 0 | PASS lines observed for runtime metadata/receipt exclusion and v2.1 tests. Two downstream-owned tests were explicitly SKIP for R4 HTTP request validation and MCP parity fields. |
| `rg -n '^var\\s+\|var \\(...' internal/resofeed web docs/ARCHITECTURE.md docs/PROMPTING_SYSTEM.md` | 0 | Prompt/model compiler mutable package globals not found; prompt runtime uses constants and explicit inputs. Matches were immutable/error/guard/test vars or forbidden concepts in negative docs/tests. |

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| PV21-SYSTEM-PROMPT | Exact separate system prompt and v2.1 payload are sent for summarization and selected-item re-ingest-like calls. | Captured OpenRouter request messages. | `TestPromptingV21CompilerEmitsExactSystemAndDocumentedPayload`, `TestPromptingV21SelectedItemReingestInputUsesSamePromptCompiler` PASS. | PROVEN | None | Test captures assert system role/content and user payload schema. |
| PV21-PRIORITY-ORDER | One-time prompt is below contract and above active steering; quality/default guidance is advisory; available_text is untrusted. | Compiler fixture and injection guard assertions. | `TestPromptingV21PriorityAndInjectionBoundariesAreCompiledDeterministically` PASS. | PROVEN | None | Contract policy includes forbidden effects and untrusted source rules. |
| PV21-FIELD-CONTRACTS | Payload schema version, prompt trimming/request scope, metadata preservation, target language, available_text_source, and source cap hold. | Payload fixture/source normalization tests. | `TestPromptingV21CompilerEmitsExactSystemAndDocumentedPayload`, `TestPromptingV21SourceCleanupBudgetAndMetadataPreservation` PASS. | PROVEN | None | Tests compare documented fixture and metadata unchanged. |
| PV21-FIELD-CEILINGS | All five generated field hard ceilings fail validation. | Negative validation table. | `TestPromptValidationFieldCeilingsForAllGeneratedFields` PASS. | PROVEN | None | Subtests pass for title/feed_excerpt/extracted_text/summary/core_insight. |
| PV21-RUNTIME-STATUS | Model cannot own provider/runtime status; public mapping is app-owned. | Validation code table and runtime status rejection. | `TestPromptValidationFailureCodesAndPublicSafeMapping`, `TestPromptingV21ValidationRejectsRuntimeStatusCeilingsAndInjectionLeakageExpectedRed` PASS. | PROVEN | None | Provider status from model maps to validation/decode boundary. |
| PV21-OPENROUTER-ROUTING | json_schema/json_object routing, require_parameters, same-model downgrade, and repair budget hold. | Request capture sequence tests. | `TestOpenRouterStructuredOutputRouting*`, `TestPromptValidationSchemaDowngradeDoesNotConsumeSemanticRepairBudget` PASS. | PROVEN | None | Captures assert `provider.require_parameters=true`, same model, and downgrade sequence. |
| PV21-VALIDATION-RETRY-RECEIPT | Validation codes, one repair attempt, and receipt/non-portability boundaries hold. | Validation/retry tests plus export exclusion tests. | `TestPromptValidationFailureCodesAndPublicSafeMapping`, `TestPromptValidationRetryOneNormalThenOneRepair`, `TestRuntimeMetadataStateExportImportExcludesMetadataAndReceipts` PASS. | PROVEN | None | Runtime metadata and receipts excluded from state export. |
| PV21-CORE-SHELL | Compiler/validator are deterministic explicit-input core functions without direct durable I/O coupling. | Static read/audit of `openrouter.go`. | `compilePromptingV21SummaryPrompt`, `normalizePromptSourceText`, `validateSummaryOutputForPersistenceWithPrompt`; rg audit. | PROVEN | None | Compiler/validator use input structs and constants; HTTP calls are in shell methods. |
| PV21-MUTABLE-GLOBALS | No package-global mutable prompt/model/request state beyond constants. | Static `rg` audit. | No `var` prompt/model/request globals found in prompt compiler/runtime path; `openrouterHTTPClient` keeps per-client `resolvedModel` under mutex. | PROVEN | None | Mutable state is instance-local or unrelated guards/tests. |
| PV21-ARCHITECTURE | No forbidden architecture/product/persistence concepts appear in changed runtime behavior. | Build/test/static audit. | No product code changed in retest; grep matches were prohibitions/tests or allowed owner-token localStorage. | PROVEN | None | Report-only commit; no runtime behavior modified. |

## Required Evidence Fields

- system_prompt_capture_and_injection_resistance: verbose tests passed for exact system prompt capture, selected re-ingest capture, priority/injection boundaries, prompt injection leakage rejection.
- priority_conflict_fixture_matrix: `TestPromptingV21PriorityAndInjectionBoundariesAreCompiledDeterministically` and prior expected-red fixture inventory passed.
- field_contract_test_table: exact documented payload fixture and source metadata preservation tests passed.
- field_ceiling_validation_table: all five field ceiling subtests passed.
- runtime_status_mapping_table: validation failure code/public mapping and provider-status rejection tests passed.
- v21_claim_audit: adoption/truthfulness refs reviewed; runtime tests names now pass as implemented. No runtime labels modified by this retest.
- purity_and_effect_boundary_audit: compiler/validator static review shows deterministic explicit-input functions; HTTP/OpenRouter and SQLite/export behavior remain shell functions/tests.
- mutable_global_audit: static audit found no package-global mutable prompt/model/request state in v2.1 compiler/validator path.

## Checklist Receipt

- [x] Targeted tests for exact system prompt capture and prompt payload/source budget pass green with raw stdout.
- [x] Targeted tests prove summarization and selected-item re-ingest both send the system prompt and v2.1 user payload.
- [x] Targeted injection tests prove source/prompt/steering/available_text cannot override schema, grounding, target language, provenance, safety, or runtime status ownership.
- [x] Targeted priority tests prove one-time prompt vs active steering precedence, quality_profile advisory status, default style priority, and available_text untrusted treatment.
- [x] Targeted tests cover input field contracts, hard field ceilings, and app-owned runtime/public status mapping.
- [x] Targeted tests for json_schema/json_object routing, provider.require_parameters, same-model downgrade, and semantic repair budget pass green with request captures.
- [x] Targeted tests for validation codes, repair policy, and receipt redaction/non-portability pass green.
- [x] Core/shell purity evidence proves compiler/validator are deterministic explicit-input functions and do not directly read/write SQLite, HTTP, OpenRouter, localStorage, or durable runtime metadata.
- [x] Mutable-state evidence proves no package-global mutable prompt/model/request state exists beyond immutable constants.
- [x] Behavioral proof register marks every runtime-owned v2.1 obligation PROVEN or provides explicit blocker closure paths.
- [x] No forbidden architecture/product/persistence concepts appear in changed runtime behavior.

## Verdict

- status: SUCCESS
- verdict: PASS
- blockers: []
- gate_open_allowed: true
- orchestrator_action_hint: COMPLETE
- risk_level: LOW; no live OpenRouter L3 check was required or performed, but request-capture integration tests exercise runtime routing and validation seams.
