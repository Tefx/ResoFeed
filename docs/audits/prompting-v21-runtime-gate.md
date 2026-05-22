# Prompting v2.1 Runtime Gate Review

Auditor: gate-reviewer  
Step: `prompting-v21-runtime-gate`  
Date: 2026-05-22  
Verdict: **FAIL**

## refs Read Confirmation

- `CONSTITUTION.md`: searched with `glob **/CONSTITUTION.md`; absent in isolated worktree.
- `docs/PROMPTING_SYSTEM.md`: read lines 1-353 covering exact system prompt, priority hierarchy, payload fields, output schema/ceilings, OpenRouter routing, runtime status, source normalization, validation/retry, receipts, adoption note, and required fixtures.
- `docs/ARCHITECTURE.md`: read/queried lines 1-240 and prompt/OpenRouter/re-ingest references including lines 4-7, 13-27, 97-111, 329-422, 747-762.
- `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md`: read lines 1-84 covering every PV21/R3/R4 row.
- `docs/audits/prompting-v21-runtime-retest.md`: read lines 1-74.
- Relevant implementation/tests read: `internal/resofeed/openrouter.go`, `prompting_v21_source_budget_test.go`, `openrouter_structured_output_routing_test.go`, `openrouter_validation_retry_test.go`, `prompting_v21_runtime_contract_expected_red_test.go`, `reprocess.go`, `http.go`, `types.go`, `runtime_metadata_receipts_test.go`, `post_closure_backend_repair_test.go`.

## Headline

Runtime v2.1 gate is **not open**. Automated tests pass, but positive proof fails at the selected-item re-ingest persistence boundary and R4 model validation boundary. The implementation can persist an output after validating it against a default English/fresh-text context instead of the actual item target language/source/provenance context, and the R4 visible-model-id character constraint is not implemented/proven.

## Blocking Status

- `BLOCKER B1`: `PV21-VALIDATION-RETRY-RECEIPT`, `PV21-RUNTIME-STATUS`, `PV21-FIELD-CONTRACTS`, and `PV21-HTTP-ITEM-REINGEST` are not positively proven at the durable write boundary.
- `BLOCKER B2`: `R4-MODEL-LENGTH-LIMIT` is not positively proven; non-default model visible-character validation is absent and the only direct control-character test remains skipped.

## Proof-Gap Status

Positive proof is partial. The compiler/OpenRouter client has strong request-capture and validation tests, but the persistence caller for item re-ingest/library reprocess does not pass actual prompt context into validation before storing item fields.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| PV21-SYSTEM-PROMPT | matrix line 47; prompting lines 39-56 | exact separate system prompt for normal summarize and selected-item re-ingest | `openrouter.go:56-64`, `openrouter.go:920-922`, `prompting_v21_source_budget_test.go:15-67`, `prompting_v21_source_budget_test.go:137-188` | PROVEN | yes |
| PV21-PRIORITY-ORDER | matrix line 48; prompting lines 27-37 | hierarchy compiled and injection-resistant | `openrouter.go:802-827`, `prompting_v21_source_budget_test.go:100-135` | PROVEN | yes |
| PV21-FIELD-CONTRACTS | matrix line 49; prompting lines 154-163 | v2.1 payload, prompt trim/cap, provenance, target language, source enum/cap, request-only prompt/model | `openrouter.go:752-785`, `openrouter.go:788-800`, `prompting_v21_source_budget_test.go:15-98`, `types.go:195-204`; but persistence validation uses default context at `reprocess.go:224` | UNPROVEN | yes |
| PV21-FIELD-CEILINGS | matrix line 50; prompting lines 181-220 | schema and Go hard ceilings for all five fields | `openrouter.go:959-980`, `openrouter.go:292-319`, `openrouter_validation_retry_test.go:92-112` | PROVEN | yes |
| PV21-RUNTIME-STATUS | matrix line 51; prompting lines 236-260 | model status restricted to ok/summary_unavailable; app maps runtime status before persistence | `openrouter.go:308-312`, `openrouter_validation_retry_test.go:13-74`, `reprocess.go:220-231`; actual-context persistence validation gap at `reprocess.go:224` | UNPROVEN | yes |
| PV21-MIGRATION-TRUTH | matrix line 52; prompting lines 336-340; architecture lines 4-7 | no false v2.1 compliance claims before gates | docs read; static claim scan found v2.1 refs largely tests/docs; no runtime claim issue found | PROVEN | yes |
| PV21-CORE-SHELL | matrix line 53; architecture lines 206-215; prompting lines 280-313 | compiler/validator pure explicit-input core, no direct I/O/durable writes | `openrouter.go:752-903`, `openrouter.go:241-319`; static var scan | PROVEN_WITH_WARNING | yes |
| PV21-OPENROUTER-ROUTING | matrix line 54; prompting lines 222-235 | selected-model metadata, require_parameters, same-model downgrade, no silent downgrade | `openrouter.go:933-948`, `openrouter.go:983-1023`, `openrouter_structured_output_routing_test.go:12-173` | PROVEN | yes |
| PV21-SOURCE-NORMALIZATION | matrix line 55; prompting lines 269-279 | cleanup, 24000-rune cap, marker, metadata preservation | `openrouter.go:20-22`, `openrouter.go:876-903`, `prompting_v21_source_budget_test.go:69-98` | PROVEN | yes |
| PV21-VALIDATION-RETRY-RECEIPT | matrix line 56; prompting lines 280-334 | parse/shape/semantic validation with one repair; no persistence before valid; redacted non-portable receipts | Client path: `openrouter.go:202-235`; persistence caller gap: `reprocess.go:224`; receipt export exclusion: `runtime_metadata_receipts_test.go:62-90` | UNPROVEN | yes |
| PV21-HTTP-MODEL-LIST | matrix line 57 | auth/no query/safe empty/503 redacted/nonpersistent model list | `http.go:260-264`, `post_closure_backend_repair_test.go:13-46`, `openrouter.go:99-148` | PROVEN | yes |
| PV21-HTTP-ITEM-REINGEST | matrix line 58 | selected item only, prompt/model request scoped, stable failure persistence, FTS refresh, no prompt/model persistence | `reprocess.go:53-86`, `reprocess.go:129-174`, `types.go:195-204`; context validation gap at `reprocess.go:224` | UNPROVEN | yes |
| PV21-MCP-PARITY-CLASSIFICATION | matrix line 59 | pending-vs-implemented classification, no overclaim | matrix explicitly `EXCLUDED_OR_DEFERRED`; skipped MCP parity test at `prompting_v21_runtime_contract_expected_red_test.go:331-333` aligns pending status | EXCLUDED_WITH_AUTHORITY | no |
| PV21-INSPECTOR-UI-SURFACE | matrix line 60 | Inspector-only UI evidence | not runtime-owned for this gate; outside required runtime proof scope | EXCLUDED_WITH_AUTHORITY | no |
| R4-PROMPT-ALIAS-CONFLICT | matrix line 61 | differing prompt/extra_prompt rejects before OpenRouter | `http.go:632-651`; no prompt echo found in error path | PROVEN | yes |
| R4-MODEL-LENGTH-LIMIT | matrix line 62 | trim, accept default, reject >200 bytes or malformed visible chars before OpenRouter | Length only in `reprocess.go:99-100`; no visible-character check; skipped control-character test at `prompting_v21_runtime_contract_expected_red_test.go:309-328` is inside skipped parent at line 274 | UNPROVEN | yes |
| R4-STRICT-HTTP-REQUEST | matrix line 63 | strict JSON/content-type/auth/no query/reject unknown/language/no prompt echo | `http.go:325-329`, `http.go:632-651`, `http.go:1081-1099`, `post_closure_backend_repair_test.go:48-81` | PROVEN | yes |
| R3-ZH-UI-CHROME-STATUS | matrix line 64 | zh UI chrome/status | frontend/UI-owned; not runtime-owned here | EXCLUDED_WITH_AUTHORITY | no |
| R3-ZH-TARGET-CONTENT | matrix line 65 | target-language content changes only after processing | runtime language/reprocess not fully re-reviewed here; no new blocker beyond B1 | EXCLUDED_WITH_AUTHORITY | no |
| R3-LITERAL-SOURCE-IDENTIFIERS | matrix line 66 | literal provenance identifiers protected | runtime validator only checks mutated URLs at `openrouter.go:371-388`; source-title/source-id semantic proof not complete, included under B1 actual-context gap | UNPROVEN | yes |
| PV21-NON-PERSISTENCE-STATE-BOUNDARY | matrix line 67 | prompt/model/receipts/model list not portable/durable | `types.go:195-204`, `runtime_metadata_receipts_test.go:62-90`, `openrouter_product_integration_contract_test.go` grep evidence for export exclusions | PROVEN_WITH_WARNING | yes |
| PV21-HTTP-MCP-PARITY-GUARDRAIL | matrix line 68 | no MCP-only product concepts or overclaim | matrix EXCLUDED/DEFERRED and MCP skipped test documents pending | EXCLUDED_WITH_AUTHORITY | no |
| PV21-REGRESSION-FIXTURES | matrix line 69; prompting lines 342-353 | fixture inventory and expected results | `prompting_v21_runtime_contract_expected_red_test.go:366-392`; targeted tests cover many but not source-title/id provenance or B1 persistence boundary | UNPROVEN | yes |
| PV21-ARCHITECTURE-VERIFICATION-ADDITIONS | matrix line 70 | deterministic evidence for model-list, re-ingest strictness, one-item, non-persistence, FTS, conflicts, MCP pending, Inspector UI | retest report claims all, but B1/B2 leave runtime proof incomplete | UNPROVEN | yes |

## Orphan Requirements

- None found in the matrix rows reviewed; unresolved rows are reported above rather than orphaned.

## Blockers

### B1 — Persistence validation does not use actual prompt/item context

- id: `B1-contextless-persistence-validation`
- expert/phase: E1 Spec Alignment / E4 Production Quality
- severity: BLOCKER
- evidence: `internal/resofeed/reprocess.go:208-224` builds `OpenRouterSummaryInput` with actual item URL/source text/language and calls `llm.SummarizeItem`; then `reprocess.go:224` calls `validateSummaryOutputForPersistence(out)`, which `openrouter.go:237-239` validates against a synthetic `promptingV21Item{AvailableTextSource:"fresh_full_text", AvailableText:"source text", TargetLanguage: ProcessingLanguageEnglish}` instead of the actual selected item context.
- why it matters: Prompting v2.1 requires Go validation before persistence for target language, unavailable-source semantics, and literal provenance. A persistence boundary that validates against default English/fresh-text context cannot positively prove that invalid outputs cannot persist outside authorized stable failure rules if an `LLMClient` implementation or future path returns schema-shaped but context-invalid output.
- remediation: Change the persistence validation call to pass the actual item prompt context (`target_language`, `available_text_source`, normalized `available_text`, URL/source identifiers/title) into `validateSummaryOutputForPersistenceWithPrompt` before `storeReprocessItem` can run. Add a behavioral test where a selected-item re-ingest returns a schema-shaped output in the wrong target language / mutated provenance and prove no item write occurs except the authorized stable failure state.
- verification: Add/run focused tests for re-ingest persistence boundary plus `go test ./internal/resofeed` and race subset.

### B2 — R4 non-default model visible-character validation is absent/unproven

- id: `B2-model-visible-char-validation`
- expert/phase: E1 Spec Alignment / E4 Production Quality
- severity: BLOCKER
- evidence: `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md:61-63` requires non-default model values to be visible model-id chars only and rejected before OpenRouter. Implementation `internal/resofeed/reprocess.go:95-105` validates only length for model and prompt. The direct control-character negative test exists at `prompting_v21_runtime_contract_expected_red_test.go:309-328` but is inside a skipped test function (`prompting_v21_runtime_contract_expected_red_test.go:274-275`).
- why it matters: The gate explicitly blocks sampled/generic proof and requires R4 strict HTTP/model boundary proof. Without a visible-character validator and green negative test, malformed model identifiers can reach runtime request-scoped routing.
- remediation: Implement model ID character validation consistent with the R4 contract and add a green HTTP or core test proving malformed/control-character model values return `400 bad_request` before OpenRouter.
- verification: Run the new negative test, `go test ./internal/resofeed`, and focused race subset.

## Warnings

- `W1`: `validatePromptProvenance` currently checks mutated URLs only (`openrouter.go:371-388`). Matrix language also names source id/source title/literal provenance. This may be covered by prompt payload policy, but hard validation proof is not complete for all provenance classes.
- `W2`: Source HTML cleanup uses basic regex removal (`openrouter.go:876-890`). Tests cover scripts/styles/nav/header/footer/aside, but not a broad realistic boilerplate corpus. This is warning-level because the budget/cap invariant is proven.

## Notes

- Required commands passed; passing tests do not override the blocker-level proof gaps above.
- No `CONSTITUTION.md` was present, so no constitution fast-fail applies.
- Static mutable-global scan found package globals, but not mutable prompt/model runtime globals in the v2.1 compiler/validator path; globals observed are runtime guards, regexes, test state, or error variables.

## Mandatory Gate Checks

- system_prompt_capture_and_injection_resistance: PROVEN
- priority_conflict_fixture_matrix: PROVEN
- field_contract_test_table: UNPROVEN (blocked by B1 at persistence boundary)
- field_ceiling_validation_table: PROVEN
- runtime_status_mapping_table: UNPROVEN (blocked by B1 at persistence boundary)
- v21_claim_audit: PROVEN
- purity_and_effect_boundary_audit: PROVEN_WITH_WARNING
- mutable_global_audit: PROVEN

## Commands

| Command | Exit Code | Evidence |
| --- | ---: | --- |
| `go test ./internal/resofeed` | 0 | `ok resofeed/internal/resofeed 1.625s` |
| `go test -race ./internal/resofeed -run 'PromptingV21\|OpenRouterStructuredOutput\|PromptValidation\|RuntimeStatus\|Receipt\|Reingest'` | 0 | `ok resofeed/internal/resofeed 2.379s` |
| `go build -o "/var/folders/rs/6_0h1ssn5439q1yfqy4pykg00000gn/T/opencode/resofeed-prompting-v21-runtime-gate" ./cmd/resofeed` | 0 | binary built outside repo |
| `rg -n '^var\\s+\|^var\\s+\\(' internal/resofeed && rg -n 'schema_version\|resofeed\\.summarize\\.v2\\.1\|v2\\.1-compliant\|compliant' internal/resofeed docs web || true && rg -n 'prompt\|extra_prompt\|model' internal/resofeed/*.go web/src || true` | 0 | static scan output saved by tool due length; reviewed for globals, claims, prompt/model persistence surfaces |

## Checklist Receipt

- [x] Gate decision basis reviews every runtime-owned row from the phase matrix and retest proof register.
- [ ] OPEN allowed only when all required rows are PROVEN. Not satisfied: B1/B2.
- [ ] Positive proof that source/prompt/steering/available_text cannot override schema/grounding/language/provenance/safety/status. Not satisfied at persistence boundary: B1.
- [x] Compiler/validator paths are mostly explicit-input core functions with no direct SQLite/HTTP/localStorage writes.
- [x] BLOCKED/FAIL applied for UNPROVEN rows without explicit non-intersection evidence.
- [x] Gate rejects sampled evidence and missing request/receipt redaction proof where material.

## Orchestrator Action Hint

DO_NOT_COMPLETE. Remediate B1 and B2, then rerun this gate.
