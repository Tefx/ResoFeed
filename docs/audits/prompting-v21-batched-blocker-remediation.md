# Prompting v2.1 Batched Blocker Remediation Evidence

Date: 2026-05-23
Step: `prompting-v21-batched-blocker-remediation`

## Verdict

verdict: PASS
blockers: []
gate_open_allowed: false
orchestrator_action_hint: COMPLETE

`gate_open_allowed` intentionally remains `false` for this implementation slice; the independent closure retest owns gate opening.

## Blocker Closure Ledger

| blocker | status | implementation evidence | deterministic proof |
|---|---|---|---|
| B1/R3/R7/R22 active steering payload and priority | CLOSED | `OpenRouterSummaryInput.ActiveSteeringRules`; `compileActiveSteeringRulesForPrompt`; active rule loading in normal ingest, library reprocess, and selected-item re-ingest | `TestPromptingV21ActiveSteeringPayloadAndPriority`; `TestPromptingV21ReingestHTTPOutgoingOpenRouterCapture` |
| B2/R5/R18 selected-item reingest outgoing OpenRouter capture | CLOSED | `POST /api/items/{id}/reingest` through `NewRouter` uses `NewOpenRouterClient` and captures provider request | `TestPromptingV21ReingestHTTPOutgoingOpenRouterCapture` proves separate system/user messages, `schema_version=resofeed.summarize.v2.1`, request-scoped model/prompt, `json_schema`, and `provider.require_parameters=true` |
| B3/R2/R19 MCP docs/runtime truthfulness | CLOSED | `docs/USAGE.md`, `docs/ARCHITECTURE.md`, and `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` now document implemented prompt/model MCP parity | grep proof for absence of stale pending-MCP claims plus existing runtime DTO/schema tests (`mcp_reingest_model_prompt_parity_v21_test.go`) |
| R13 residual source-grounding/invented facts | CLOSED | `validatePromptSourceGrounding` rejects deterministic unsupported numeric claims in generated fields when not present in title/source/url/available_text | `TestPromptingV21SourceGroundingRejectsUnsupportedPromptInventedFacts` |
| R21 residual frontend zh/source identifier proof linkage | CLOSED_BY_LINKAGE | No frontend edit required; existing UI gate artifact already records rendered zh/source proof | `docs/audits/inspector-ui-v21-gate.md` rows `R3-ZH-UI-CHROME-STATUS`, `R3-ZH-TARGET-CONTENT`, `R3-LITERAL-SOURCE-IDENTIFIERS`; behavioral rows `R3-ZH-CHROME`, `R3-ZH-TARGET-CONTENT`, `R3-LITERAL-SOURCES`; gate rows cite `.test-artifacts/.../inspector-zh-before-reingest-red.dom.html` and `.test-artifacts/.../inspector-zh-after-reingest-red.dom.html` plus source/test line anchors |

## B3 Before/After Truthfulness Passages

Before this remediation, `docs/USAGE.md` described MCP `list_openrouter_models` as provider-backed equivalence pending runtime config verification and `reingest_item` prompt/model fields as pending; `docs/ARCHITECTURE.md` similarly said prompt/model MCP parity was pending and optional fields were not currently admitted. The failed audit recorded this contradiction in `docs/audits/prompting-v21-spec-conformance-audit.md` row R19: runtime code/tests exposed prompt/model fields while USAGE still told callers not to send them.

After this remediation:

- `docs/USAGE.md` states MCP `list_openrouter_models` uses the same request-time OpenRouter model-list operation and MCP `reingest_item` accepts request-scoped `model`, canonical `prompt`, and compatibility `extra_prompt` with the same non-persistence rules as HTTP.
- `docs/ARCHITECTURE.md` status and §Inspector Item Re-ingest MCP Parity state prompt/model MCP parity is implemented, list-openrouter-models is provider-backed parity after runtime key resolution, and `reingest_item` optional fields are `model`, `prompt`, and `extra_prompt`.
- `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` updates `PV21-MCP-PARITY-CLASSIFICATION` from deferred/pending to included implemented parity.

## Residual Limits

The new source-grounding check is deterministic and intentionally conservative: it rejects generated numeric claims absent from app-owned source context. It does not attempt broad LLM-as-validator fact checking, preserving the prompting-system boundary that subjective density/style and non-deterministic grounding remain outside hard validation unless deterministic.
