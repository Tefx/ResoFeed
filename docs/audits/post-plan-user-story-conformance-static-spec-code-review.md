# Post-Plan User Story Conformance Static Spec/Code Review Artifact

Artifact type: preserved raw negative review evidence
Source stream: `static-spec-code-conformance-review`
Materialization step: `post-plan-user-story-conformance-independent-review.materialize-static-and-wiring-review-artifacts`
Scope: audit artifact only; no product code, tests, runtime config, generated UI artifacts, or completed evidence records modified.

## Verdict

verdict: `FAIL`
gate_open_allowed: `false`
orchestrator_action_hint: `DO_NOT_COMPLETE_REPAIR_PHASE_UNTIL_OWNED_DEVIATIONS_ARE_REPAIRED`
closure_status: evidence materialized; product deviations preserved, not softened.

## Reference Confirmation

- `docs/ARCHITECTURE.md:13-21` confirms one Go binary, thin HTTP/MCP transports sharing product operations, SQLite/FTS-only retrieval, no embeddings/vector DB/RAG, and single owner-token authorization.
- `docs/ARCHITECTURE.md:950-980` confirms processing language/reprocess contracts, including safe stable status vocabulary for invalid model/provider/rate/decode/timeout failures.
- `docs/ARCHITECTURE.md:1067-1089` confirms Inspector item re-ingest status/error contracts including `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, and `timeout`.
- `docs/PRD.md:138-149` confirms canonical fallback taxonomy and minimal degradation copy.
- `docs/PRD.md:226-252` confirms owner token is the delegation boundary and no separate per-agent authorization registry exists.
- `docs/PRD.md:264-276` confirms Source Ledger remains flat and OPML folders are flattened on import.
- `docs/PRD.md:422-434` confirms search is lexical/metadata-driven and must not become embeddings/RAG/vector search.

## Raw Evidence Summary Preserved

- 31 scoped rows reviewed: 4 `static_spec`, 27 `api_mcp_parity`.
- 28 rows proven.
- 3 deviation rows preserved as blockers/major findings.
- API/MCP parity claims cite both HTTP and MCP surfaces for:
  - feed candidates;
  - search;
  - item detail;
  - inspect/resonate/delivery;
  - language/reprocess/reingest/model-list.
- Architecture forbidden concepts checked absent:
  - no vector DB/embedding/RAG schema;
  - owner token only;
  - no durable operation queue/job/current-operation table;
  - source/OPML folders flattened only as import outcome/copy.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| STATIC-ROWS-COUNT | Raw static review evidence: 31 scoped rows, 28 proven, 3 deviations | Preserve row counts and review scope | This artifact §Raw Evidence Summary Preserved | PROVEN | yes |
| API-MCP-PARITY-SURFACES | Raw evidence: feed candidates, search, item detail, inspect/resonate/delivery, language/reprocess/reingest/model-list cite HTTP and MCP | Preserve parity surface list | This artifact §Raw Evidence Summary Preserved | PROVEN | yes |
| FORBIDDEN-CONCEPTS-ABSENT | `docs/ARCHITECTURE.md:13-21`, `:157-163`; `docs/PRD.md:422-434` | Preserve static absence claims | This artifact §Raw Evidence Summary Preserved | PROVEN | yes |
| ARCH-REINGEST-01 | `docs/ARCHITECTURE.md:978-980`, `:1067-1089` | Preserve full model/reprocess status vocabulary in frontend contract and UI handling | Finding B1 below | UNPROVEN | yes |
| ARCH-HTTP-01 | `docs/ARCHITECTURE.md:1103-1142` plus reingest table `:1067-1089` | HTTP status/error contracts remain aligned with frontend API types | Finding B1 below | UNPROVEN | yes |
| LANG-LOCK-01 | `docs/ARCHITECTURE.md:950-980` | Language/model status rows are not narrowed by client-only enums | Finding B1 below | UNPROVEN | yes |
| B2-MATERIALIZATION | Raw static review evidence: read-only agent could not create artifact | Preserve artifact gap as evidence issue | Finding B2 below | PROVEN | no |

## Blockers

### B1 — Frontend API enum/status blocker

severity: `blocker/major`
affected_rows: `ARCH-REINGEST-01`, `ARCH-HTTP-01`, `LANG-LOCK-01`
remediation_owner: `post-plan-user-story-conformance-repair-implementation.frontend-ui-runtime-repair-slot`

Evidence preserved from static review:

- `docs/ARCHITECTURE.md` requires expanded model/reprocess status values including `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, and `timeout` where documented.
- `docs/ARCHITECTURE.md:978-980` states invalid model/provider, provider error, rate-limit, decode/validation, and timeout failures must remain distinguishable through safe stable status/diagnostic paths such as `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, and `timeout`.
- `docs/ARCHITECTURE.md:1067-1089` defines Inspector item re-ingest failure/status contracts containing `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, and `timeout`.
- `web/src/lib/api-contract.ts` currently has `ModelStatus = 'ok'|'summary_unavailable'|'model_latency_error'`.
- `web/src/lib/api-contract.ts` currently has `ReprocessErrorCode` that omits `invalid_model`, `provider_error`, `rate_limited`, and `decode_error`.

Why this matters:

- The frontend narrows backend/architecture-owned status vocabulary and risks misrendering or rejecting legitimate HTTP/MCP results.
- The drift specifically intersects language/reprocess/re-ingest repair paths and user-visible status handling.

Required remediation:

- Expand frontend API contract types and UI handling to preserve architecture status vocabulary.
- Verify HTTP and MCP result fixtures covering `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, and `timeout` do not collapse into `model_latency_error` or an unknown/unreachable client state.

Verification required:

- Source diff in `web/src/lib/api-contract.ts` and affected UI formatters.
- Behavioral frontend/unit or integration tests proving the status/error vocabulary is accepted and rendered consistently.

## Evidence-Materialization Issues

### B2 — Static review artifact/materialization gap

severity: `materialization-gap`
product_code_pass_fail: `not applicable`
cause: read-only agent constraint prevented the negative review agent from creating a tracked audit artifact.

Preserved disposition:

- B2 is an evidence/materialization issue, not a product-code pass/fail concealment.
- This markdown file materializes the raw static review stream and preserves negative findings without changing product behavior.

## Warnings

- None beyond B1/B2 in the supplied raw static review evidence.

## Notes

- The forbidden-concept absence checks are preserved as static review claims only; this artifact does not independently rerun a full product-code audit.
- No product repair was attempted in this materialization step.

## Deviation Ledger

| id | severity | category | evidence | owner | required_next_action | status |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | blocker/major | frontend API enum/status drift | `docs/ARCHITECTURE.md:978-980`, `docs/ARCHITECTURE.md:1067-1089`, `web/src/lib/api-contract.ts` enum narrowing | `post-plan-user-story-conformance-repair-implementation.frontend-ui-runtime-repair-slot` | Repair frontend API contract and tests | OPEN |
| B2 | materialization-gap | audit artifact missing due to read-only agent | raw static review evidence stream | this materialization step | Create tracked artifact under `docs/audits/` | MATERIALIZED |

## Closure Fields

verdict: `FAIL`
blockers: `[B1]`
gate_open_allowed: `false`
orchestrator_action_hint: `DO_NOT_COMPLETE_REPAIR_PHASE_UNTIL_B1_REPAIRED`
deviation_ledger: see table above.

## Non-Mutation Statement

- product_code_changed: `NO`
- tests_changed: `NO`
- runtime_config_changed: `NO`
- generated_ui_artifacts_changed: `NO`
- completed_evidence_records_changed: `NO`
- audit_artifact_created: `YES`
