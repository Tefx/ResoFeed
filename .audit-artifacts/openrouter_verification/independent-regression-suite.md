# Independent OpenRouter Regression Suite Verification

step_intent: retest_green  
expected_result: green  
observed_result: green  
verdict: PASS  
headline: PASS_WITH_DEBT  
proof_gap_status: NON_BLOCKING  
blocking_status: CLOSED  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE

## Commands Run

```text
go test -count=1 -v ./...
rg -n -- '--gemini-api-key|--gemini-model|GEMINI_API_KEY|gemini:' 'docs/ARCHITECTURE.md' 'docs/USAGE.md' 'README.md' 'internal/resofeed' 'cmd' 'web' '.agents/instructions.md'
rg -n -- '--gemini-api-key|--gemini-model|GEMINI_API_KEY|gemini:' 'docs/ARCHITECTURE.md' 'docs/USAGE.md' 'README.md'; test $? -eq 1
rg -n -- 'OPENROUTER_KEY|--openrouter-model|openrouter:' 'docs/ARCHITECTURE.md' 'docs/USAGE.md' 'README.md'
```

## Raw Evidence Excerpts

```text
?   	resofeed/cmd/resofeed	[no test files]
--- PASS: TestOpenRouterCLIRejectsLegacyGeminiFlags (0.00s)
--- PASS: TestOpenRouterRuntimeSecretSourceAndModelFlags (0.01s)
--- PASS: TestOpenRouterAdapterRequestContractWithFakeServer (0.00s)
--- PASS: TestOpenRouterAdapterRetryAndSafeErrorMapping (0.00s)
--- PASS: TestOpenRouterDocsRuntimeSecretContract (0.00s)
--- PASS: TestOpenRouterChatCompletionSummaryResponseValidatesAndPersists (0.00s)
--- PASS: TestOpenRouterModelFailureKeepsItemVisibleWithSafeStatus (0.00s)
--- PASS: TestSteeringHTTPAndMCPUseSharedOpenRouterPathWithRetrySafety (0.00s)
--- PASS: TestInvalidOpenRouterSteeringProposalRejectedWithoutBreakingHumanPrecedence (0.00s)
--- PASS: TestDoctorUsesOpenRouterPrefixAndNoGeminiRuntimeText (0.00s)
--- PASS: TestStateExportExcludesOpenRouterRuntimeConfigAndSecrets (0.00s)
--- PASS: TestStateImportRejectsOpenRouterRuntimeConfigAndSecrets (0.00s)
--- PASS: TestHTTPAndMCPTransportParityForCoreOperations (0.00s)
--- PASS: TestOpenRouterMigrationRemovesGeminiNamedRuntimeInjectionSurfaces (0.00s)
openrouter_runtime_wiring_test.go:62: HTTP /api/doctor output:
    rss: ok
    openrouter: ok configured_model=openrouter/configured-runtime resolved_model=openrouter/resolved-runtime
    extraction: failures=1
    ingest: last_run=2026-05-09T18:55:17Z
openrouter_runtime_wiring_test.go:65: MCP resofeed://system/doctor output:
    rss: ok
    openrouter: ok configured_model=openrouter/configured-runtime resolved_model=openrouter/resolved-runtime
    extraction: failures=1
    ingest: last_run=2026-05-09T18:55:17Z
PASS
ok  	resofeed/internal/resofeed	0.635s
```

Docs-only Gemini-flag search returned no output and exit 0 after `test $? -eq 1`, proving no matches in `docs/ARCHITECTURE.md`, `docs/USAGE.md`, or `README.md` for the forbidden patterns. The broader scoped residue search found stale non-product guidance in `.agents/instructions.md`, expected test references, and a legacy expected-red frontend test fixture.

## Coverage Matrix

| Area | Evidence | Result | Notes |
|---|---|---|---|
| CLI flags | `TestOpenRouterCLIRejectsLegacyGeminiFlags`; `TestOpenRouterRuntimeSecretSourceAndModelFlags` | PASS | Legacy Gemini flags rejected; OpenRouter key required; optional/empty model accepted; no startup model network validation behavior covered by bind-failure harness. |
| Adapter httptest | `TestOpenRouterAdapterRequestContractWithFakeServer`; `TestOpenRouterAdapterRetryAndSafeErrorMapping` | PASS | Fake OpenRouter verifies `/api/v1/chat/completions`, bearer header, JSON response_format, empty-model omission, unchanged model, one retry for 429/5xx, invalid JSON/provider errors safe. |
| Ingest | `TestOpenRouterChatCompletionSummaryResponseValidatesAndPersists`; `TestOpenRouterModelFailureKeepsItemVisibleWithSafeStatus` | PASS | OpenRouter-shaped chat response persisted; model failure leaves item visible with safe status. |
| Steering HTTP/MCP | `TestSteeringHTTPAndMCPUseSharedOpenRouterPathWithRetrySafety`; `TestInvalidOpenRouterSteeringProposalRejectedWithoutBreakingHumanPrecedence`; `TestHTTPAndMCPTransportParityForCoreOperations` | PASS | Shared LLMClient path and idempotent no-recall behavior covered; unsafe proposal rejected. |
| Doctor | `TestDoctorUsesOpenRouterPrefixAndNoGeminiRuntimeText`; `TestServeRuntimeWiresOpenRouterThroughIngestHTTPMCPDoctor` | PASS | HTTP and MCP doctor output contain `openrouter:` and configured/resolved model; no Gemini text or fake key observed. |
| State export/import | `TestStateExportExcludesOpenRouterRuntimeConfigAndSecrets`; `TestStateImportRejectsOpenRouterRuntimeConfigAndSecrets`; `TestStatePortabilityExcludesRuntimeLLMSecretConfiguration` | PASS | Portable state excludes OpenRouter key/model/provider/source metadata and rejects tainted import safely. |
| Docs/search | `TestOpenRouterDocsRuntimeSecretContract`; docs-only `rg` checks | PASS_WITH_DEBT | ARCHITECTURE/USAGE/README no longer promise Gemini flags; `.agents/instructions.md` still has stale Gemini guidance outside product docs. |

## Issues Found

| Severity | Description | Location | Gate Intersection |
|---|---|---|---|
| tech_debt | Stale agent instructions still mention Gemini secret precedence and `GEMINI_API_KEY`. This is non-product guidance, not ARCHITECTURE/USAGE, and does not affect runtime tests. | `.agents/instructions.md:27,30` | Non-blocking for OpenRouter final gate; could confuse future agents. |
| tech_debt | Legacy `gemini: ok` appears in a frontend expected-red fixture. Runtime Go doctor tests prove current `/doctor` output is OpenRouter-prefixed; this fixture was not part of the Go regression gate. | `web/src/routes/components/__tests__/rendering-expected-red.test.ts:175` | Non-blocking unless frontend expected-red suite is promoted to gate. |

## Secret Safety

- Did not read, print, or commit `.env` contents.
- No real `OPENROUTER_KEY` value was used or printed. Test keys in output are fake/local fixtures and no raw real secrets appear in this artifact.

## Product Modification Statement

- Product implementation files modified: false.
- Only this scoped verification artifact was added.
