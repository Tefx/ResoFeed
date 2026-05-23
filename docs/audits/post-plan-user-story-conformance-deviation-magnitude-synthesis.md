# Post-Plan User Story Conformance Deviation Magnitude Synthesis

Step: `post-plan-user-story-conformance-independent-review.deviation-magnitude-synthesis`
Agent: `gate-reviewer`
Date: 2026-05-24
Artifact type: decision artifact / deviation magnitude report / remediation ownership map.

## Headline

[REJECT] Gate remains closed. The consolidated evidence contains one product-code blocker/major deviation: frontend API contract enum/status drift for `ARCH-REINGEST-01`, `ARCH-HTTP-01`, and `LANG-LOCK-01`. Evidence-materialization gaps from the static and wiring read-only reviews are closed by tracked markdown artifacts, but those materialization closures do not repair the preserved product findings.

## Blocking Status

- **Blocking product deviation:** `B1` / `ARCH-REINGEST-01` / `ARCH-HTTP-01` / `LANG-LOCK-01` — frontend API contract enum/status drift.
- **Gate open allowed:** `false`.
- **Remediation required before gate open:** frontend repair plus post-repair spec/static/wiring/API parity retest covering the expanded safe status vocabulary.

## Proof-Gap Status

- `B2` and `ARTIFACT-NOT-CREATED` are **closed only as artifact-materialization gaps** by the materialized static and wiring artifacts. They are not product-code deviations and are not used to soften product findings.
- Runtime proof remains limited by absent `OPENROUTER_KEY` and uncontrolled live RSS fixture coverage for successful model-backed re-ingest, trustworthy model-backed summaries, duplicate/story grouping, old-resonated-vs-fresh ranking, multi-source coverage quotas, OPML file upload, and forced current-operation conflict.
- Black-box proof established representative public liveness but left richer ranking/grouping/full MCP parity as `NEEDS_TEST`.

## refs Read Confirmation

- `CONSTITUTION.md` — NOT READ: no `CONSTITUTION.md` found in the isolated worktree root via workspace glob. No constitution fast-fail clauses were available.
- `docs/PRD.md` — Read. Key insight: ResoFeed is a minimal single-tenant RSS intelligence loop where Today/Inspect/Resonate/Steer must work without folders, unread/archive pressure, settings dashboards, or delivery-channel setup; AC-1..AC-18 define freshness, search, state, diagnostics, agent, and manual fetch behavior.
- `docs/DESIGN.md` — Read. Key insight: implementation must keep dense but legible archival-index chrome, operational labels only, Source Ledger flat bracket controls, Inspector-scoped re-ingest, collapsed source evidence, raw `/doctor`, and no dashboards/spinners/toasts/settings/folders/tags/unread/archive.
- `docs/ui-preview.html` — Read. Key insight: static preview materializes intended desktop/search/Inspector/re-ingest/Source Ledger/doctor and mobile zh states; it is static design evidence, not runtime liveness evidence.
- `docs/ARCHITECTURE.md` — Read. Key insight: one Go binary serves static UI, JSON HTTP, MCP, and background ingest over SQLite/FTS5; OpenRouter is JSON transformer only; HTTP/MCP contracts require expanded model/reprocess status values and strict owner-token auth/validation.
- `docs/audits/post-plan-user-story-conformance-matrix.md` — Read. Key insight: authoritative matrix has 107 rows, zero orphan requirements, and downstream proof ownership across static, runtime browser, black-box user flow, wiring, API/MCP parity, UI design, and architecture boundary classes.
- `docs/audits/post-plan-user-story-conformance-black-box-review.md` — Read. Key insight: public runtime smoke passed for owner-token auth, state import/export, search, Inspector/provenance, inspect/resonate/delivery idempotency, `/doctor`, and MCP tool/resource exposure; remaining richer ranking/grouping/full parity proofs are marked `NEEDS_TEST`.
- `docs/audits/post-plan-user-story-conformance-runtime-user-flow-walkthrough.md` — Read. Key insight: real browser runtime launch passed owner prompt, first-use, Steer URL, ingest, feed, inspect, star, re-ingest UI, menu/language, Source Ledger fetch, state export, doctor, search, and search-result Inspector; OpenRouter/model-backed and controlled-corpus claims remain blocked/partial.
- `docs/audits/post-plan-user-story-conformance-ui-design-multimodal-audit.md` — Read. Key insight: multimodal UI audit approved named surfaces/states using screenshots/DOM/accessibility evidence with no design deviations.
- `docs/audits/post-plan-user-story-conformance-static-spec-code-review.md` — Read. Key insight: materialized static review preserves 31 scoped rows, 28 proven, and blocker `B1` against frontend enum/status drift; `B2` is materialization-only and now closed as an artifact gap.
- `docs/audits/post-plan-user-story-conformance-wiring-reachability-review.md` — Read. Key insight: materialized wiring review preserves static reachability proof and three open wiring deviations: `DEV-W1`, `DEV-W6`, and `DEV-W12`; `ARTIFACT-NOT-CREATED` is materialization-only and now closed as an artifact gap.

## Coverage Quantification

| metric | value | basis |
| --- | ---: | --- |
| total_matrix_rows | 107 | `post-plan-user-story-conformance-matrix.md` coverage summary. |
| proven_rows | 72 | Dedupe of rows explicitly `PROVEN` in consumed ledgers; excludes `PROVEN_PARTIAL`, `PROVEN_WITH_LIMITATION`, `NEEDS_TEST`, `BLOCKED_NON_BLOCKING`, and rows affected by open deviations. |
| unproven_rows | 35 | Matrix rows not positively proven by the consumed evidence at full required proof strength. |
| runtime_covered_rows | 41 | Rows with runtime/browser/black-box evidence at `PROVEN`, `PROVEN_PARTIAL`, or `PROVEN_WITH_*` strength across runtime walkthrough and black-box review. |
| design_covered_rows | 14 | UI design multimodal audit rows with visual/DOM/a11y proof. |
| blocked_by_env_rows | 7 | Rows whose runtime proof is explicitly blocked or materially limited by absent OpenRouter key or lack of deterministic fixtures. |
| materialized_artifact_gap_rows_closed | 2 | `B2` and `ARTIFACT-NOT-CREATED`; evidence gaps closed, not product findings. |
| open_product_deviation_count | 4 | `B1`, `DEV-W1`, `DEV-W6`, `DEV-W12`. |
| total_deviation_ledger_entries | 11 | Product deviations, artifact gaps, and non-blocking proof/test-environment gaps deduped by root cause. |
| deviation_density | 10.3% | 11 deduped ledger entries / 107 matrix rows. Product-only open density is 3.7% (4 / 107). |

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| MATRIX-TRACEABILITY | Matrix rows 166-201: 107 rows, proof class counts, zero orphan requirements. | Confirm authoritative row count and ownership. | Matrix artifact. | PROVEN | yes |
| STATIC-API-MCP-SCOPE | Static artifact lines 25-40: 31 scoped rows, 28 proven, forbidden concepts absent. | Preserve static/API-MCP scope and row counts. | Static materialized artifact. | PROVEN | yes |
| ARCH-REINGEST-01 | Architecture re-ingest/status contracts require `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, `timeout`. | Frontend accepts/renders full backend status vocabulary. | Static artifact `B1`; `web/src/lib/api-contract.ts` evidence cited by reviewer. | UNPROVEN | yes |
| ARCH-HTTP-01 | HTTP surface strict schema/error contracts and re-ingest result statuses. | Client API contract remains aligned with HTTP statuses. | Static artifact `B1`. | UNPROVEN | yes |
| LANG-LOCK-01 | Runtime language/reprocess failure taxonomy and metadata/HTTP contract. | Language/model statuses not narrowed by frontend-only enums. | Static artifact `B1`. | UNPROVEN | yes |
| WIRING-REACHABILITY | Wiring artifact lines 25-39: single binary, HTTP, MCP, static assets, ingest loop, source ledger, steering, re-ingest, doctor, owner token statically reachable. | Preserve wiring proof and caveats. | Wiring materialized artifact. | PROVEN_WITH_CAVEAT | no |
| RUNTIME-BROWSER-SURFACES | Runtime walkthrough table lines 55-75. | Real browser launch/render/interaction proof for core surfaces. | Runtime walkthrough artifacts. | PROVEN_WITH_LIMITATIONS | no |
| UI-DESIGN-SURFACES | UI design audit lines 8-40. | Visual/DOM/a11y evidence for named UI design surfaces. | UI multimodal audit. | PROVEN | no |
| BLACK-BOX-PUBLIC-LIVENESS | Black-box review lines 80-250 and 303-323. | Public API/UI/MCP smoke proof without source-code trust. | Black-box review. | PROVEN_WITH_LIMITATIONS | no |
| ARTIFACT-GAP-CLOSURE | Static `B2`; wiring `ARTIFACT-NOT-CREATED`. | Close read-only auditor artifact gaps with tracked evidence. | Materialized static and wiring artifacts. | PROVEN | no |

## Orphan Requirements

- None introduced by this synthesis. The matrix reports `orphan_requirement_count: 0`; this synthesis did not identify an additional source requirement lacking a matrix row.

## Deduplicated Deviation Ledger

| deviation_id | source | severity | magnitude | requirement_rows | repair_owner_hint | disposition | gate_intersection | closure_path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1-FRONTEND-STATUS-DRIFT | Static spec/code review `B1` | blocker | major | `ARCH-REINGEST-01`, `ARCH-HTTP-01`, `LANG-LOCK-01` | frontend | OPEN product deviation. Frontend contract narrows backend architecture status vocabulary. | Directly blocks API/MCP parity, re-ingest, language/reprocess, and runtime user-visible error/status gates. | Expand `web/src/lib/api-contract.ts` and affected UI formatters; add frontend/unit/integration fixtures for `invalid_model`, `provider_error`, `rate_limited`, `decode_error`, `timeout`; rerun static/spec, wiring, API/MCP, and browser status rendering retests. |
| B2-STATIC-MATERIALIZATION-GAP | Static spec/code review `B2` | note | none | `B2-MATERIALIZATION` | no_repair_needed | CLOSED as artifact-materialization gap only. Product findings preserved. | No remaining product-code gate intersection after tracked artifact creation. | No product repair. Keep artifact in `docs/audits/`; do not mark B1 closed through this disposition. |
| ARTIFACT-NOT-CREATED-WIRING | Wiring reachability review | note | none | `DEV-ARTIFACT-NOT-CREATED` | no_repair_needed | CLOSED as artifact-materialization gap only. Wiring findings preserved. | No remaining product-code gate intersection after tracked artifact creation. | No product repair. Keep artifact in `docs/audits/`; preserve DEV-W1/W6/W12. |
| DEV-W1-COMMITSTEERING-ORPHAN-EXPORT | Wiring reachability review `DEV-W1` | should_fix | moderate | `WIRING-DEV-W1`; intersects steering operation ownership | backend | OPEN. Exported `CommitSteering` wrapper appears unused while HTTP/MCP call `ApplySteering` directly. | Intersects API/MCP parity and steering ownership because orphan public wrappers can mislead future transport parity repairs. Not dismissed as pre-existing; evidence cites definition and production callers. | Remove wrapper, route transports through it if intended, or add authority-backed non-consumption note/tests; verify HTTP/MCP steering still share one operation. |
| DEV-W6-PUBLICURL-WEAK-CONSUMPTION | Wiring reachability review `DEV-W6` | tech_debt | minor | `WIRING-DEV-W6`; `ARCH-RUNTIME-01` | backend | OPEN low wiring debt. `--public-url` is parsed/validated/printed but no route/tool metadata consumption was traced. | Low intersection: architecture says `--public-url` is base URL external agents should use, but current API/MCP route metadata obligations in consumed matrix do not explicitly require emitting it. Non-intersection is limited to remaining UI/API/MCP parity gates unless an agent metadata contract is added. | Either expose/use `PublicURL` where architecture requires agent-visible metadata, or document authority-backed non-consumption in runtime/MCP docs and add a regression proving validation/printing remains intentional. |
| DEV-W12-STEER-PREVIEW-CLIENT-SHADOW | Wiring reachability review `DEV-W12` | tech_debt | minor | `WIRING-DEV-W12`; `PRD-STEER-01`, `ARCH-STEER-01` | frontend | OPEN low protocol shadow. UI computes preview locally despite backend `/api/steer/preview` and MCP `preview_steer`. | Low but real intersection with Steer/API/MCP parity. Non-intersection against remaining UI/API/MCP parity gates is acceptable only if local preview is explicitly declared presentation-only and not a product semantic preview. | Align UI preview wiring to backend `previewSteer`, or document authority-backed non-intersection and add tests that local preview cannot drift from backend/MCP semantics for product-affecting receipts. |
| ENV-OPENROUTER-UNAVAILABLE | Runtime walkthrough | suggestion | moderate | `PRD-AI-01`, `PRD-EXTRACT-01`, `ARCH-INGEST-01`, `DESIGN-INSPECTOR-01`, `PROMPT-04`, `REPAIR-R1` | planner | Non-product proof gap. Runtime ran with absent/redacted `OPENROUTER_KEY`; model-backed summary/model-list/successful re-ingest completion not proven. | Blocks only claims requiring live model-backed completion; does not negate UI/API liveness already proven. | Schedule live-key redacted smoke or fixture-backed model boundary proof before closing model-backed prompt/re-ingest claims. |
| FIXTURE-CORPUS-NOT-CONTROLLED | Runtime walkthrough + black-box review | suggestion | moderate | `PRD-DUP-01`, `PRD-AC-13`, `PRD-DAILY-01..03`, `ARCH-RANK-01`, policy/ranking AC rows | planner | Non-product proof gap. Live RSS corpus proved liveness but not deterministic ranking/grouping/coverage edge cases. | Intersects ranking/story/coverage gates; cannot approve those behavioral claims solely from live HN smoke. | Add deterministic black-box corpus with timestamps, resonance, grouping, multiple sources, delivery state, and conflicting steering. |
| DEV-BB-001-BUILD-HYGIENE | Black-box review `DEV-BB-001` | tech_debt | minor | Runtime/build hygiene | frontend | OPEN tech debt: npm audit findings and Vite missing base config warning; build completed. | No direct user-story gate blocker because runtime built and served; potential DX/maintenance intersection. | Track dependency/build hygiene separately; rerun build after dependency remediation. |
| DEV-BB-002-STATE-DOCS-FIXTURE-CLARITY | Black-box review `DEV-BB-002` | tech_debt | minor | `PRD-STEER-01`, `ARCH-PORT-01` | docs | OPEN docs clarity issue. Strict state import rejects `steer_rules[].is_active`; public abridged examples may be poor hand-authored fixtures. | Low intersection with state portability user docs; strictness is correct, examples need clarity. | Add complete portable state example for active steer rules if human-authored bundles are supported. |
| DEV-BB-003-RANKING-CORPUS-GAP | Black-box review `DEV-BB-003` | suggestion | minor | `PRD-DAILY-01`, `PRD-AC-07` | planner | OPEN proof suggestion. Smoke corpus too small to prove freshness/resonance/delivery ranking guardrails. | Intersects future ranking gate, not immediate runtime liveness. | Add documented corpus for freshness vs resonance vs delivery candidate behavior. |

## Remediation Ownership Map

| owner | deviations | required action |
| --- | --- | --- |
| frontend | `B1-FRONTEND-STATUS-DRIFT`, `DEV-W12-STEER-PREVIEW-CLIENT-SHADOW`, `DEV-BB-001-BUILD-HYGIENE` | Repair API contract/status rendering and decide preview-client alignment; address build hygiene separately. |
| backend | `DEV-W1-COMMITSTEERING-ORPHAN-EXPORT`, `DEV-W6-PUBLICURL-WEAK-CONSUMPTION` | Decide/remove/route orphan steering wrapper; decide/document or implement `PublicURL` consumption. |
| docs | `DEV-BB-002-STATE-DOCS-FIXTURE-CLARITY` | Clarify complete state bundle examples if hand-authored fixture workflows are expected. |
| planner | `ENV-OPENROUTER-UNAVAILABLE`, `FIXTURE-CORPUS-NOT-CONTROLLED`, `DEV-BB-003-RANKING-CORPUS-GAP` | Provide safe live-key or mock-equivalent contract proof plan and deterministic behavioral corpus. |
| no_repair_needed | `B2-STATIC-MATERIALIZATION-GAP`, `ARTIFACT-NOT-CREATED-WIRING` | Already closed as evidence-materialization gaps; preserve artifacts. |

## Blockers

1. `B1-FRONTEND-STATUS-DRIFT` — blocker/major. Frontend API contract narrows architecture-owned model/reprocess status vocabulary for `ARCH-REINGEST-01`, `ARCH-HTTP-01`, and `LANG-LOCK-01`.

## Warnings

- `DEV-W1-COMMITSTEERING-ORPHAN-EXPORT` remains should-fix/moderate until removed, routed, or authority-documented.
- Runtime/model-backed and deterministic ranking/grouping coverage are not proven at full proof strength.

## Notes

- `DEV-W6` and `DEV-W12` are classified as tech debt/minor rather than blockers because consumed evidence shows low direct intersection with remaining gates, but each still needs explicit owner disposition or tests to prevent future contract drift.
- No finding is dismissed as pre-existing or out-of-scope without non-intersection rationale.

## Verdict

[REJECT]

```yaml
verdict: FAIL
blockers:
  - B1-FRONTEND-STATUS-DRIFT
gate_open_allowed: false
orchestrator_action_hint: DO_NOT_COMPLETE
artifact: docs/audits/post-plan-user-story-conformance-deviation-magnitude-synthesis.md
coverage:
  total_matrix_rows: 107
  proven_rows: 72
  unproven_rows: 35
  runtime_covered_rows: 41
  design_covered_rows: 14
  blocked_by_env_rows: 7
  deviation_density: 10.3%
deviation_ledger:
  - B1-FRONTEND-STATUS-DRIFT
  - B2-STATIC-MATERIALIZATION-GAP
  - ARTIFACT-NOT-CREATED-WIRING
  - DEV-W1-COMMITSTEERING-ORPHAN-EXPORT
  - DEV-W6-PUBLICURL-WEAK-CONSUMPTION
  - DEV-W12-STEER-PREVIEW-CLIENT-SHADOW
  - ENV-OPENROUTER-UNAVAILABLE
  - FIXTURE-CORPUS-NOT-CONTROLLED
  - DEV-BB-001-BUILD-HYGIENE
  - DEV-BB-002-STATE-DOCS-FIXTURE-CLARITY
  - DEV-BB-003-RANKING-CORPUS-GAP
```

## Orchestrator Action Hint

`DO_NOT_COMPLETE` this gate as open. Dispatch frontend repair for `B1` first; then dispatch backend/frontend owner decisions for `DEV-W1`, `DEV-W6`, and `DEV-W12`, plus targeted post-repair retests. Evidence-only gaps `B2` and `ARTIFACT-NOT-CREATED` may be marked closed as materialized artifact gaps.
