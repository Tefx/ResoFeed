# Regression Audit Doc Sync Check — regression-audit-doc-sync-check

**Headline**: PASS_WITH_DEBT
**Verdict**: PASS
**Gate open allowed**: true
**Orchestrator action hint**: COMPLETE
**Blockers**: []

## Summary

Documentation now preserves the repaired Source Ledger boundary and does not turn stale `[RUN INGEST]` / `[FETCH]` audit expectations into implementation scope. The only documentation edits made by this step were:

- `docs/USAGE.md`: changed the runtime lexical liveness recipe to rely on Steer + background ingest + Search, not `POST /api/ingest` as a documented normal path.
- `docs/UI_REGRESSION_CONTRACT.md`: replaced stale Source Ledger source-fetch/run-ingest hit-target requirements with the repaired details/delete/import/export boundary and moved raw `model_status` out of the Inspector primary-header expectation.
- `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md`: replaced stale `[RUN INGEST]` / `[FETCH]` deterministic matrix cases with a negative Source Ledger boundary case and background-ingest refresh evidence.
- `docs/audits/prd-behavior-audit-2026-05-11.md`: added a staleness note so older `[RUN INGEST]` references cannot be copied into current Source Ledger scope.
- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md`: corrected an internal handoff line from `verdict: OPEN` to `verdict: PASS_WITH_DEBT` so it matches the same artifact's headline, gate decision JSON, and blocker-free status.

## Cross-reference conclusions

| Area | Doc status | Evidence |
| --- | --- | --- |
| Source Ledger boundary | Matches after Usage correction | `docs/DESIGN.md` defines Ledger as title, OPML import, flat rows, delete, state export/import, and diagnostic details; `docs/ui-preview.html` shows only import/export/import-state/delete and says refresh is background ingest. |
| Stale audit text | Properly flagged as stale/conflicting | `docs/audits/regression-audit-2026-05-12.md` retains the old run/fetch expectation only as historical evidence and says it is not authoritative. |
| MCP resources/read and `read_item` | Matches | `docs/ARCHITECTURE.md §7` lists `resources/read`, `resofeed://sources`, `resofeed://rules/active`, `resofeed://system/doctor`, and `read_item`; `internal/resofeed/mcp.go` implements those resource/tool paths. |
| LLM health and `/doctor` | Matches with non-blocking live-provider debt | `docs/ARCHITECTURE.md` and `docs/USAGE.md` require `openrouter:` lines, no secret output, fallback classification, and no fake live success; retest artifacts classify the remaining live-provider issue as non-blocking debt. |
| Search, mobile routes, feed metadata, Inspector metadata | Matches repaired behavior per cited artifacts | The contract matrix and full runtime retest record REG-03/05/08/09 as passed, with raw model status kept out of primary feed/Inspector copy and inactive Today hidden on utility routes. |
| Product invariants | Preserved | No new accounts/OAuth/RBAC, vector/RAG, sync/merge/event bus/service layer, folders/tags/unread/archive, or settings-dashboard scope was introduced. |

## Remaining debt

- Live OpenRouter `model_status=ok` proof remains unavailable because the provider/account guardrail returned a classified external/provider error. This is already documented as non-blocking debt and is not a documentation blocker.
- `internal/resofeed/manual_fetch_contract.go` still documents backend manual fetch endpoints in code. This review does not remove implemented backend/API behavior; it only prevents Source Ledger/UI/user-facing docs from presenting manual run/fetch as the normal product workflow.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "headline": "PASS_WITH_DEBT",
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blockers": [],
  "artifacts_modified": [
    "docs/USAGE.md",
    "docs/UI_REGRESSION_CONTRACT.md",
    "docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md",
    "docs/audits/prd-behavior-audit-2026-05-11.md",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md",
    "docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-doc-sync-check.md"
  ]
}
```
