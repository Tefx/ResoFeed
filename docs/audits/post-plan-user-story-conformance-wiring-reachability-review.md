# Post-Plan User Story Conformance Wiring Reachability Review Artifact

Artifact type: preserved raw negative review evidence
Source stream: `wiring-reachability-review`
Materialization step: `post-plan-user-story-conformance-independent-review.materialize-static-and-wiring-review-artifacts`
Scope: audit artifact only; no product code, tests, runtime config, generated UI artifacts, or completed evidence records modified.

## Verdict

verdict: `FAIL`
gate_open_allowed: `false`
orchestrator_action_hint: `DO_NOT_COMPLETE_REPAIR_PHASE_UNTIL_OWNED_WIRING_DEVIATIONS_ARE_DECIDED_OR_REPAIRED`
closure_status: evidence materialized; wiring warnings preserved, not softened.

## Reference Confirmation

- `docs/ARCHITECTURE.md:13-18` confirms one deployable Go process, thin transports, and shared product operations across HTTP and MCP.
- `docs/ARCHITECTURE.md:63-76` confirms runtime flags including `--public-url` and one `serve` process starting static UI, HTTP API, MCP, and ingestion loop.
- `docs/ARCHITECTURE.md:204-215` confirms direct function calls, one in-process concurrency guard, and no queues/jobs/ledgers.
- `docs/ARCHITECTURE.md:950-980` confirms language/reprocess behavior and no durable job rows, queues, sync state, command history, activity ledgers, retry dashboards, or settings panels.
- `docs/PRD.md:111-116` confirms humans and agents operate on the same Inspect, Resonate, and Steer product concepts.
- `docs/PRD.md:264-276` confirms Source Ledger flatness, manual controls as operational commands, and no job/dashboard surfaces.
- `docs/PRD.md:436-439` confirms MCP compatibility for authorized agents while exact surfaces remain architecture-owned.

## Raw Evidence Summary Preserved

| wiring requirement | preserved status |
| --- | --- |
| single_binary_runtime | PROVEN_STATIC |
| http_api_auth_and_routes | PROVEN_STATIC |
| mcp_tool_resource_registration | PROVEN_STATIC |
| static_asset_serving | PROVEN_STATIC |
| background_ingest_loop_start | PROVEN_STATIC |
| source_ledger_operations | PROVEN_STATIC |
| steering_operations | PROVEN_STATIC_WITH_PREVIEW_CAVEAT |
| inspector_reingest | PROVEN_STATIC |
| doctor_surface | PROVEN_STATIC |
| owner_token_boundary | PROVEN_STATIC |

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| WIRING-SINGLE-BINARY | `docs/ARCHITECTURE.md:13-18`, `:63-76` | Single binary/runtime surfaces statically reachable | Raw wiring evidence: `single_binary_runtime: PROVEN_STATIC` | PROVEN | yes |
| WIRING-HTTP-AUTH-ROUTES | `docs/ARCHITECTURE.md:1107-1112` | HTTP API auth/routes statically reachable | Raw wiring evidence: `http_api_auth_and_routes: PROVEN_STATIC` | PROVEN | yes |
| WIRING-MCP-REGISTRATION | `docs/PRD.md:436-439`; `docs/ARCHITECTURE.md:18` | MCP tools/resources registered | Raw wiring evidence: `mcp_tool_resource_registration: PROVEN_STATIC` | PROVEN | yes |
| WIRING-STATIC-ASSETS | `docs/ARCHITECTURE.md:13`, `:1107-1109` | Static assets served by Go binary | Raw wiring evidence: `static_asset_serving: PROVEN_STATIC` | PROVEN | yes |
| WIRING-INGEST-LOOP | `docs/ARCHITECTURE.md:76`, `:194-202` | Background ingest loop starts after storage/server prep | Raw wiring evidence: `background_ingest_loop_start: PROVEN_STATIC` | PROVEN | yes |
| WIRING-SOURCE-LEDGER | `docs/PRD.md:264-276` | Source Ledger operations reachable | Raw wiring evidence: `source_ledger_operations: PROVEN_STATIC` | PROVEN | yes |
| WIRING-STEERING | `docs/PRD.md:197-217`, `:408-420` | Steering operations reachable | Raw wiring evidence: `steering_operations: PROVEN_STATIC_WITH_PREVIEW_CAVEAT`; DEV-W12 below | PROVEN_WITH_CAVEAT | no |
| WIRING-REINGEST | `docs/ARCHITECTURE.md:1015-1091` | Inspector re-ingest reachable | Raw wiring evidence: `inspector_reingest: PROVEN_STATIC` | PROVEN | yes |
| WIRING-DOCTOR | `docs/PRD.md:138-149`, `docs/ARCHITECTURE.md:1116-1118` | `/doctor` reachable | Raw wiring evidence: `doctor_surface: PROVEN_STATIC` | PROVEN | yes |
| WIRING-OWNER-TOKEN | `docs/ARCHITECTURE.md:21`, `:139-147`, `:1107-1112` | Owner token boundary statically enforced | Raw wiring evidence: `owner_token_boundary: PROVEN_STATIC` | PROVEN | yes |
| DEV-ARTIFACT-NOT-CREATED | Raw wiring evidence: read-only auditor could not create artifact | Preserve artifact gap as evidence issue | Finding ARTIFACT-NOT-CREATED below | PROVEN | no |
| WIRING-DEV-W1 | raw wiring evidence | Decide/remove/route orphan wrapper or document non-consumption with authority | DEV-W1 below | UNPROVEN | no |
| WIRING-DEV-W6 | raw wiring evidence; `docs/ARCHITECTURE.md:63-76` | Determine whether runtime metadata must consume PublicURL | DEV-W6 below | UNPROVEN | no |
| WIRING-DEV-W12 | raw wiring evidence; `docs/PRD.md:408-420` | Decide/align UI preview client wiring or record non-intersection | DEV-W12 below | UNPROVEN | no |

## Evidence-Materialization Issues

### ARTIFACT-NOT-CREATED — Wiring review artifact gap

severity: `materialization-gap`
product_code_pass_fail: `not applicable`
cause: read-only wiring-auditor constraint prevented creating a tracked artifact.

Preserved disposition:

- `DEV-ARTIFACT-NOT-CREATED` is an evidence/materialization issue, not a product-code pass/fail concealment.
- This markdown file materializes the raw wiring review stream and preserves negative findings without changing product behavior.

## Warnings

### DEV-W1 — CommitSteering orphan export/dead wrapper

severity: `medium`
category: orphan export / dead wrapper
owned_requirement: `WIRING-DEV-W1`
remediation_owner: `post-plan-user-story-conformance-repair-implementation.backend-api-mcp-storage-repair-slot`

Evidence preserved from wiring review:

- `CommitSteering` is defined at `internal/resofeed/steer_intent.go:97-99`.
- Production HTTP and MCP call `ApplySteering` directly at `internal/resofeed/http.go:731,743` and `internal/resofeed/mcp.go:230`.

Why this matters:

- A public/exported wrapper that is not consumed by production transports can confuse interface ownership and future repair/audit work.

Required remediation or disposition:

- Decide and remove/route the orphan wrapper, or document authoritative non-consumption.
- Verify HTTP/MCP continue to share the intended steering operation after any change.

### DEV-W6 — PublicURL parsed config weakly consumed

severity: `low`
category: parsed config weak consumption
owned_requirement: `WIRING-DEV-W6`
remediation_owner: `post-plan-user-story-conformance-repair-implementation.backend-api-mcp-storage-repair-slot`

Evidence preserved from wiring review:

- `--public-url` is parsed/derived at `internal/resofeed/db.go:43-50`.
- `--public-url` is validated at `internal/resofeed/db.go:276-321`.
- `--public-url` is printed at `internal/resofeed/db.go:419-420`.
- No traced route/tool returns or uses it for agent metadata.

Why this matters:

- Architecture recognizes `--public-url` as the base URL external agents should use. Weak consumption may be intentional, but the contract intersection needs an explicit decision.

Required remediation or disposition:

- Determine whether runtime metadata or agent-visible output must consume `PublicURL`; repair if documentation requires it, or record authoritative non-intersection.

### DEV-W12 — Steer preview client shadow / partial client wiring

severity: `low`
category: protocol shadow / partial client wiring
owned_requirement: `WIRING-DEV-W12`
remediation_owner: `post-plan-user-story-conformance-repair-implementation.frontend-ui-runtime-repair-slot`

Evidence preserved from wiring review:

- Backend `/api/steer/preview` route exists at `internal/resofeed/http.go:310-314`.
- MCP `preview_steer` exists at `internal/resofeed/mcp.go:587-598`.
- UI computes route preview locally in `web/src/routes/+page.svelte:278-301`.
- `submitSteer` does not call `apiClient().previewSteer`.

Why this matters:

- Local-only preview can drift from HTTP/MCP preview semantics even while backend preview protocols exist.

Required remediation or disposition:

- Decide and align UI preview client wiring with backend preview, or record authoritative non-intersection and keep tests/proofs aligned with that decision.

## Blockers

- No product-code blockers were preserved in the raw wiring review evidence. The overall artifact verdict remains `FAIL` because owned wiring deviations remain `UNPROVEN` pending repair/disposition and because this step is an evidence-preservation step, not a repair closure.

## Notes

- Static reachability statuses are preserved as static evidence only; this artifact does not claim runtime liveness.
- `steering_operations` is specifically preserved as `PROVEN_STATIC_WITH_PREVIEW_CAVEAT`, not as an unconditional pass.
- No product repair was attempted in this materialization step.

## Deviation Ledger

| id | severity | category | evidence | owner | required_next_action | status |
| --- | --- | --- | --- | --- | --- | --- |
| DEV-ARTIFACT-NOT-CREATED | materialization-gap | audit artifact missing due to read-only agent | raw wiring review evidence stream | this materialization step | Create tracked artifact under `docs/audits/` | MATERIALIZED |
| DEV-W1 | medium | orphan export/dead wrapper | `internal/resofeed/steer_intent.go:97-99`; `internal/resofeed/http.go:731,743`; `internal/resofeed/mcp.go:230` | backend repair slot | Remove/route wrapper or document non-consumption | OPEN |
| DEV-W6 | low | parsed config weak consumption | `internal/resofeed/db.go:43-50`, `:276-321`, `:419-420` | backend repair slot | Repair PublicURL consumption if docs require or record non-intersection | OPEN |
| DEV-W12 | low | protocol shadow / partial client wiring | `internal/resofeed/http.go:310-314`; `internal/resofeed/mcp.go:587-598`; `web/src/routes/+page.svelte:278-301`; `submitSteer` not calling `apiClient().previewSteer` | frontend repair slot | Align preview client wiring or document non-intersection | OPEN |

## Closure Fields

verdict: `FAIL`
blockers: `[]`
gate_open_allowed: `false`
orchestrator_action_hint: `DO_NOT_COMPLETE_REPAIR_PHASE_UNTIL_DEV_W1_DEV_W6_DEV_W12_ARE_DECIDED_OR_REPAIRED`
deviation_ledger: see table above.

## Non-Mutation Statement

- product_code_changed: `NO`
- tests_changed: `NO`
- runtime_config_changed: `NO`
- generated_ui_artifacts_changed: `NO`
- completed_evidence_records_changed: `NO`
- audit_artifact_created: `YES`
