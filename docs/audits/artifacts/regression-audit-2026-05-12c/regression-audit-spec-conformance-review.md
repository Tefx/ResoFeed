# Regression Audit Spec Conformance Review — regression-audit-spec-conformance-review

**Headline**: PASS_WITH_DEBT
**Blocking Status**: CLOSED
**Proof-Gap Status**: NON_BLOCKING
**Verdict**: PASS
**Blockers**: []
**Orchestrator Action Hint**: COMPLETE

headline: PASS_WITH_DEBT
verdict: PASS
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
blockers: []
product_implementation_files_modified: false

## refs Read Confirmation (MANDATORY)

- `.agents/instructions.md` — read. Key passage: canonical docs are law; one Go binary, one SQLite DB, OpenRouter JSON transformer only, owner-token boundary, no settings/dashboard/product-creep surfaces.
- `docs/ARCHITECTURE.md` — read. Key passage: `resofeed serve` is the single runtime process; SQLite/FTS5 only; `/api/*` and `/mcp` require owner-token auth; MCP resources/tools include `sources`, `rules/active`, `read_item`; `/doctor` owns raw OpenRouter diagnostics; no vector/RAG/sync/service layers.
- `docs/PRD.md` — read. Key passage: Source management is Steer + flat Ledger; Source Ledger supports viewing/deleting/importing OPML with folders flattened; delegated agents use same Inspect/Resonate/Steer/retrieval concepts; live LLM fallback must not be confused with successful model summaries.
- `docs/DESIGN.md` — read. Key passage: Source Ledger anatomy is title, OPML import, flat rows, delete, and state export/import; Search is lexical; feed rows are compact triage surfaces; raw provider/model details belong in `/doctor` or secondary disclosure, not primary feed/Inspector header.
- `docs/DESIGN_VISION.md` — read. Key passage: Source Ledger is barebones flat read/delete text roster, not a settings dashboard; AI failure degrades plainly; no folders/tags/settings/numeric inbox mechanics.
- `docs/USAGE.md` — read. Key passage: static UI loads unauthenticated but `/api/*` and MCP require `Authorization: Bearer <OWNER_TOKEN>`; source addition is via Steer or OPML; MCP exposes `sources`, `rules/active`, `read_item`; Search is lexical, not RAG.
- `docs/audits/regression-audit-2026-05-12.md` — read. Key passage: REG-01 is explicitly retained as historical but superseded; acceptance status requires no Source Ledger `[RUN INGEST]`/`[FETCH]`, mobile containment, MCP empty arrays, LLM classification, and MCP `read_item` detail closure.
- `docs/audits/regression-audit-2026-05-12-contract-matrix.md` — read. Key passage: REG-01 forbids manual Source Ledger ingest/fetch controls; REG-02/04/06 are backend/MCP/LLM gates; REG-03/05/07/08/09 are UI gate items.
- `docs/audits/artifacts/regression-audit-2026-05-12c/source-ledger-reg-01-adjudication.md` — read. Key passage: canonical authority rejects `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]` in Source Ledger and requires negative guards.
- `docs/audits/artifacts/regression-audit-2026-05-12c/regression-frontend-surface-gate.md` — read. Key passage: frontend REG-01/03/05/07/08/09 gate passed with Playwright evidence and no forbidden controls in source/rendered DOM.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md` — read. Key passage: backend/MCP REG-02/04 closed; REG-06 closed with non-blocking external OpenRouter provider/auth debt; no fallback counted as live success.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` — read. Key passage: full runtime retest passed all REG items, with only non-blocking live-provider debt for REG-06 and no product implementation edits.
- `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json` — read. Key passage: unauthenticated `/api/sources` returns 401; MCP empty `sources` and `rules` serialize as `[]`.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json` — read. Key passage: probe status PASS, `/api/doctor`, `/api/feed/today`, `/mcp read_item`, and MCP sources resource returned 200; live OpenRouter classified `provider_or_auth`.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/openrouter_live_preflight.json` — read. Key passage: attempted direct OpenRouter call returned 404 provider/data-policy restriction with redacted key.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_read_item.json` — read. Key passage: `read_item` response includes `extracted_text` marker for full extraction detail.
- `docs/ui-preview.html` — read as subordinate preview evidence. Key passage/insight: no `[RUN INGEST]`/`[FETCH]` text found in preview; if future preview text conflicts with Architecture/Design, treat it as subordinate/stale.

## Spec Conformance Report

### Requirements Register

| ID | Requirement quote / source | Type | Priority | Verification method | Verdict |
| --- | --- | --- | --- | --- | --- |
| R1 | “One deployable Go process… serves static app, JSON HTTP API, MCP… and background ingestion loop” — `docs/ARCHITECTURE.md:11,67` | behavior | P0 | Runtime retest + code/docs inspection | CONFORMS |
| R2 | “One SQLite database… FTS5… No embeddings, vector DB… RAG” — `docs/ARCHITECTURE.md:13,18,306-323,950-969` | side_effect | P0 | Code grep + retest artifact | CONFORMS |
| R3 | “OpenRouter… JSON transformation and never owns durable state…” — `docs/ARCHITECTURE.md:17,88-101` | behavior | P0 | Liveness artifacts + secret redaction evidence | CONFORMS |
| R4 | “Every `/api/*` route and every `/mcp` request requires one owner token” — `docs/ARCHITECTURE.md:19,577-582,837-850` | interface/error | P0 | Runtime auth artifact | CONFORMS |
| R5 | “HTTP and MCP validate auth/payloads and call the same product operations” — `docs/ARCHITECTURE.md:16,833-870` | interface | P0 | MCP tool/resource inspection + retest | CONFORMS |
| R6 | Source Ledger anatomy “title, OPML import action, flat source rows, delete action… state export/import… URL subscription routes back to Steer” — `docs/DESIGN.md:463-480` | interface | P0 | Frontend gate + source inspection | CONFORMS |
| R7 | Source Ledger forbidden: “folders, tags, pause/resume toggles, drag ordering, scoring sliders…” — `docs/DESIGN.md:474` and REG-01 adjudication forbids run/fetch controls | non_goal | P0 | Negative source/rendered tests | CONFORMS |
| R8 | Mobile utility routes must not leave inactive feed visible/accessibility-active — derived from `docs/DESIGN.md:322-331,433,461` and matrix REG-05 | behavior | P1 | Browser-rendered Playwright proof | CONFORMS |
| R9 | Search is lexical/retrieval, not RAG; rendered form must avoid duplicate submit controls — `docs/DESIGN.md:491-497`; matrix REG-03 | interface | P1 | Source inspection + Playwright proof | CONFORMS |
| R10 | Feed rows use compact metadata; detailed fallback/model diagnostics belong in Inspector/disclosure/doctor — `docs/DESIGN.md:413-418,483-489` | interface | P1 | Frontend source + Playwright proof | CONFORMS |
| R11 | Inspector primary metadata includes source/provenance/title/original/extraction/summary/full text; no raw model enum foregrounding — `docs/DESIGN.md:451-459` | interface | P1 | Frontend source + Playwright proof | CONFORMS |
| R12 | MCP resources `resofeed://sources` and `resofeed://rules/active` are JSON array shapes — `docs/ARCHITECTURE.md:852-857` | schema | P0 | Runtime MCP artifact | CONFORMS |
| R13 | MCP `read_item` returns `{ item: ItemDetail }` including extracted text and provenance — `docs/ARCHITECTURE.md:641-658,861-866` | schema | P0 | Runtime MCP artifact | CONFORMS |
| R14 | Fallback taxonomy: `model latency/error` and RSS fetch errors exposed through `/doctor`; fallback-only must not count as live LLM success — `docs/PRD.md:138-149`; REG-06 contract | behavior | P1 | Runtime liveness + preflight classification | CONFORMS_WITH_DEBT |
| R15 | Product creep prohibited: no accounts/OAuth/RBAC, vector/RAG, sync/merge, service layers, sidecars, folders/tags/unread/archive — `.agents/instructions.md:8-41`; `docs/ARCHITECTURE.md:145-151,948-969`; `docs/DESIGN.md:523-535` | non_goal | P0 | Scoped inspection and existing gates | CONFORMS |

### Behavioral Proof Ledger

| Behavior | Required runtime proof | Available evidence | Missing proof | Allowed verdict |
| --- | --- | --- | --- | --- |
| Owner token rejects unauthenticated API/MCP access | 401 before resource/tool handling | `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json:2-20` | None | CONFORMS |
| Empty MCP arrays serialize as `[]`, not null | Real MCP resource read on empty DB | `mcp_empty_resources_and_auth.json:12-20` | None | CONFORMS |
| MCP `read_item` full extraction includes detail text | Real `/mcp` tool call through bound binary | `mcp_read_item.json:1`; `report.json:54-58` | None | CONFORMS |
| Mobile utility surfaces remove inactive Today from visual/a11y flow | Browser runtime assertions for Search/Ledger/doctor | `full-runtime-retest-evidence.md:75,118`; `regression-frontend-surface-gate.md:28,42` | None beyond Chromium-only coverage | CONFORMS |
| Search receipt is scoped away from Source Ledger/Today/doctor | Browser runtime assertion after navigation | `full-runtime-retest-evidence.md:77`; `regression-frontend-surface-gate.md:29,43` | None beyond Chromium-only coverage | CONFORMS |
| Feed/Inspector avoid raw model enum foregrounding | Browser runtime assertions and source inspection | `full-runtime-retest-evidence.md:78-79,120`; `item-anatomy.ts:88-105`; `Inspector.svelte:320-354` | None beyond Chromium-only coverage | CONFORMS |
| Live OpenRouter success classification | Direct live preflight + doctor/feed sample, no fallback counted as success | `openrouter_live_preflight.json:1-7`; `report.json:17-18,27-34,71-74`; `full-runtime-retest-evidence.md:76,119,126` | No live `model_status=ok` item due provider/account guardrail | CONFORMS_WITH_DEBT |

### Evidence Table with 7-Verdict Model

| REG | Finding | Verdict | Evidence | Closure path / risk |
| --- | --- | --- | --- | --- |
| REG-2026-05-12-01 | Source Ledger manual ingest/fetch controls authority conflict | CONFORMS | Audit itself says historical expectation is superseded (`regression-audit-2026-05-12.md:45-50`); adjudication forbids controls (`source-ledger-reg-01-adjudication.md:7-31`); `SourceLedger.svelte:107-145` renders delete/details/import/state only; frontend gate REG-01 passed. | Keep negative guards; do not reintroduce `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]`. |
| REG-2026-05-12-02 | MCP empty resources serialize arrays as null | CONFORMS | Runtime artifact shows `{"sources":[]}` and `{"rules":[]}` (`mcp_empty_resources_and_auth.json:12-20`); `mcp.go:363-383,469-491` initializes empty arrays. | None. |
| REG-2026-05-12-03 | Search duplicate visible submit controls | CONFORMS | `SearchRetrieval.svelte:80-85` has one visible `search` submit; Playwright REG-03 passed (`full-runtime-retest-evidence.md:73`). | None. |
| REG-2026-05-12-04 | MCP `read_item` lacks extracted detail for full item | CONFORMS | `mcp_read_item.json:1` contains `extracted_text` marker; `report.json:54-58` says marker present; `full-runtime-retest-evidence.md:74,115`. | None. |
| REG-2026-05-12-05 | Mobile utility surfaces leak inactive Today feed | CONFORMS | `+page.svelte:415-449` applies `aria-hidden` and `inert` when inactive; Playwright REG-05 passed (`full-runtime-retest-evidence.md:75,118`). | Chromium-only proof is acceptable for this gate; cross-browser a11y can be later hardening. |
| REG-2026-05-12-06 | Live LLM path not healthy | CONFORMS_WITH_DEBT | Runtime honestly classifies fallback/error: `report.json:17-18,27-34,71-74`; OpenRouter preflight provider/auth 404 redacted (`openrouter_live_preflight.json:1-7`); full retest says fallback not counted as live success (`full-runtime-retest-evidence.md:76,119,126`). | Non-blocking external provider/account debt; closure to get true live `model_status=ok` requires OpenRouter account/privacy/model availability, not code changes proven by current artifacts. |
| REG-2026-05-12-07 | Source Ledger inherits stale Search receipt | CONFORMS | `+page.svelte:393-399` scopes retrieval receipts to Search; Playwright REG-07 passed (`full-runtime-retest-evidence.md:77`). | None. |
| REG-2026-05-12-08 | Feed row metadata overly diagnostic | CONFORMS | `item-anatomy.ts:88-105` maps raw statuses to compact `full/partial/excerpt/fallback`; Playwright REG-08 passed (`full-runtime-retest-evidence.md:78,120`). | None. |
| REG-2026-05-12-09 | Inspector exposes model status in primary header | CONFORMS | `Inspector.svelte:320-354` primary copy uses provenance/extraction/summary-provenance and source details; Playwright REG-09 passed (`full-runtime-retest-evidence.md:79,120`). | None. |

### REG-01 Authority / Conflict Disposition

REG-01's original product-failure conclusion is stale. Canonical `docs/DESIGN.md:463-480` and `docs/ARCHITECTURE.md:11,67,181-189` define Source Ledger/background-ingest boundaries without manual Ledger run/fetch controls, and `source-ledger-reg-01-adjudication.md:7-31` explicitly supersedes the old audit/UI-preview expectation. The correct conformance rule is negative: Source Ledger may show view/delete/import/export/details/diagnostics, but must not show `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, or `[FETCHING...]`. Current implementation and browser proof conform.

### Invariant / Product-Creep Audit

- No product implementation files were modified by this verifier; only this audit artifact was added.
- Reviewed evidence does not show accounts/OAuth/RBAC, per-agent auth registries, vector DB/embeddings/RAG, sync/merge, sidecars, folders/tags/unread/archive, settings sliders, or activity-ledger surfaces in the repaired regression scope.
- Note: backend manual fetch endpoints exist in `internal/resofeed/manual_fetch_contract.go` and `docs/USAGE.md:467-479`, but the scoped REG-01 decision forbids exposing those controls in Source Ledger. This is not treated as a gate blocker because current Source Ledger/UI proof preserves the canonical surface boundary.

### Top Risks and Closure Paths

1. **REG-06 live-provider debt** — risk: no current live OpenRouter `model_status=ok` proof. Closure: rerun live liveness after provider/account privacy/model availability is fixed; retain redaction and fallback-not-success assertions.
2. **Historical artifact drift** — risk: old audit prose may be copied into future work. Closure: keep contract matrix/adjudication as the gate authority and keep negative UI tests active.
3. **Chromium-only UI runtime proof** — risk: accessibility containment was proven in Chromium. Closure: optional future cross-browser/a11y-tree validation; not blocking current gate because required proof from full runtime retest exists.

### Coverage Summary

- Requirements enumerated: 15 material requirements.
- REG findings covered: 9/9.
- Blocking divergences: 0.
- NEEDS_TEST/UNPROVEN/PARTIAL items: 0 blocking; REG-06 carries non-blocking external live-provider debt with explicit closure path.
- Gate open allowed: true.

## behavioral_proof_register

| behavior | proof_status | evidence |
| --- | --- | --- |
| Owner-token auth boundary for API/MCP | PROVEN | `mcp_empty_resources_and_auth.json:2-20` |
| MCP empty resources return arrays | PROVEN | `mcp_empty_resources_and_auth.json:12-20` |
| MCP `read_item` returns full detail text | PROVEN | `mcp_read_item.json:1`; `report.json:54-58` |
| Source Ledger forbidden controls absent | PROVEN | `source-ledger-reg-01-adjudication.md:7-31`; `SourceLedger.svelte:107-145`; frontend gate |
| Mobile inactive feed excluded from active flow | PROVEN | `+page.svelte:415-449`; full runtime retest REG-05 |
| Feed/Inspector diagnostic containment | PROVEN | `item-anatomy.ts:88-105`; `Inspector.svelte:320-354`; full runtime retest REG-08/09 |
| Live LLM success is not faked by fallback-only output | PROVEN | `report.json:17-18,27-34,71-74`; `openrouter_live_preflight.json:1-7` |
| Actual live OpenRouter success with `model_status=ok` | UNPROVEN | Non-blocking provider/account/privacy debt documented in full runtime retest |

## Uncertainty Sources

- Live OpenRouter provider/account policy prevents proving a successful live model-backed item in current artifacts.
- Historical audit and subordinate preview expectations around Source Ledger manual controls are stale; adjudication resolves them for this gate.
- UI runtime evidence is Chromium-focused.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "headline": "PASS_WITH_DEBT",
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blockers": [],
  "proof_gap_status": "NON_BLOCKING",
  "product_implementation_files_modified": false,
  "reg_verdicts": {
    "REG-2026-05-12-01": "CONFORMS",
    "REG-2026-05-12-02": "CONFORMS",
    "REG-2026-05-12-03": "CONFORMS",
    "REG-2026-05-12-04": "CONFORMS",
    "REG-2026-05-12-05": "CONFORMS",
    "REG-2026-05-12-06": "CONFORMS_WITH_DEBT",
    "REG-2026-05-12-07": "CONFORMS",
    "REG-2026-05-12-08": "CONFORMS",
    "REG-2026-05-12-09": "CONFORMS"
  },
  "artifacts_modified": [
    "docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-spec-conformance-review.md"
  ]
}
```
