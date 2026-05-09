# OpenRouter red-test gate retest evidence

Reviewer: gate-reviewer
Step: `openrouter-llm-contract-and-red-tests.retest-red-test-gate-gaps`
Worktree branch: `vectl/step-openrouter-llm-contract-and-red-tests.retest-red-test-gate-gaps`

## Verdict

PASS: gate blockers are closed for the remediation retest. The OpenRouter contract tests are explicitly marked `expected_result: red`, compile cleanly, targeted red failures are product migration gaps rather than syntax/build failures, state import/export secrecy coverage is present and green, docs/public contract test is green, and no `.env` contents or real OpenRouter key were read/printed/committed.

## Closure fields

- gate_open_allowed: true
- blocker_1_expected_result_red_metadata: PROVEN
- blocker_2_state_import_secrecy_coverage: PROVEN
- docs_public_contract_clean: PROVEN
- secret_safety: PROVEN
- downstream_openrouter_implementation_unblocked: true
- product_implementation_files_modified: false

## Commands run

```text
grep -n "expected_result: red" internal/resofeed/*openrouter*contract_test.go
go test ./internal/resofeed -run '^$'
go test ./internal/resofeed -run 'TestOpenRouter' -count=1
grep -n -E "TestState(Export|Import)|openrouter_key|openrouter_model|provider|secret_source|runtime_config|assertNoImportedOpenRouterRuntimeState" internal/resofeed/openrouter_product_integration_contract_test.go
go test ./internal/resofeed -run 'TestState(ExportExcludesOpenRouterRuntimeConfigAndSecrets|ImportRejectsOpenRouterRuntimeConfigAndSecrets)' -count=1
go test ./internal/resofeed -run 'TestOpenRouterDocsRuntimeSecretContract' -count=1
git status --short && git ls-files .env '.env*'
git diff -- docs/ARCHITECTURE.md docs/DESIGN.md internal/resofeed/openrouter_cli_adapter_contract_test.go internal/resofeed/openrouter_product_integration_contract_test.go .agents/instructions.md
```

## Reviewed refs

- `docs/ARCHITECTURE.md`: lines 11-18, 69-83, 145-153 establish one binary, OpenRouter-only LLM backend, runtime-only secrets, and state export/import exclusion of LLM secrets/model/provider/config.
- `docs/DESIGN.md`: lines 141-158 define state portability UI/warning component contract; lines 177-188 define diagnostic output/error styling relevant to safe runtime errors.
- `internal/resofeed/openrouter_product_integration_contract_test.go`: lines 3-5 mark expected-red; lines 152-194 cover export secrecy; lines 196-284 cover import rejection/non-persistence for OpenRouter secret/model/provider/secret-source/runtime config.
- `internal/resofeed/openrouter_cli_adapter_contract_test.go`: lines 3-5 mark expected-red; lines 226-250 cover public docs/runtime secret contract.
- `.agents/instructions.md`: lines 25-31 require runtime-only secret handling and redacted evidence.

## Risk notes

- Targeted `TestOpenRouter` currently fails as expected on legacy Gemini/openrouter migration gaps: legacy Gemini flags still accepted/required in some paths, `--openrouter-model` not wired, adapter still uses Gemini `:generateContent` path without bearer auth/JSON mode, ingest summary remains nil, and Gemini-named injection surfaces remain. These are intended downstream product implementation failures, not gate/remediation failures.
- No product implementation or docs files were modified by this audit; only this scoped audit artifact was added.
