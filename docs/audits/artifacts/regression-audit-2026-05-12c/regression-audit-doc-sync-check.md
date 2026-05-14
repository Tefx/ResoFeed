# Regression Audit Doc Sync Check — regression-audit-doc-sync-check

**Headline**: PASS_WITH_DEBT
**Verdict**: PASS
**Gate open allowed**: true
**Orchestrator action hint**: COMPLETE
**Blockers**: []

## Summary

Current cleanup update: this doc-sync artifact itself is historical. Its original conclusion tried to keep Source Ledger free of `[RUN INGEST]` / `[FETCH]` controls. That conclusion is superseded by the current Source Ledger authority: lightweight `[RUN INGEST]` / `[INGESTING...]` and per-source `[FETCH]` / `[FETCHING...]` bracket actions are allowed/expected, with anti-dashboard guards.

The documentation cleanup chain now preserves two facts:

- Current docs may describe Source Ledger manual controls as normal product behavior when they remain flat, immediate, and non-persistent.
- Older artifacts that treated those controls as forbidden/absent are historical only and must not be used as current acceptance evidence.

Original edits from this historical step remain traceable below but are superseded wherever they imply a negative Source Ledger manual-control rule.

## Cross-reference conclusions

| Area | Current doc status | Evidence |
| --- | --- | --- |
| Source Ledger boundary | Matches current authority | `docs/DESIGN.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/UI_REGRESSION_CONTRACT.md`, and `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md` allow lightweight `[RUN INGEST]` / `[FETCH]` bracket actions while forbidding dashboards, persistent jobs/queues/activity ledgers, source hierarchy, settings, sync/merge, and duplicate source-add fields. |
| Stale audit text | Properly flagged as historical/superseded | `docs/audits/regression-audit-2026-05-12.md`, the updated contract matrix, and `source-ledger-reg-01-adjudication.md` identify the old no-control rule as historical and superseded. |
| MCP resources/read and `read_item` | Matches | `docs/ARCHITECTURE.md §7` lists `resources/read`, `resofeed://sources`, `resofeed://rules/active`, `resofeed://system/doctor`, and `read_item`; runtime artifacts show empty arrays and `read_item` detail closure. |
| LLM health and `/doctor` | Matches with non-blocking live-provider debt | `docs/ARCHITECTURE.md` and `docs/USAGE.md` require `openrouter:` lines, no secret output, fallback classification, and no fake live success; retest artifacts classify the remaining live-provider issue as non-blocking debt. |
| Search, mobile routes, feed metadata, Inspector metadata | Matches repaired behavior per cited artifacts | The contract matrix and full runtime retest record REG-03/05/08/09 as passed, with raw model status kept out of primary feed/Inspector copy and inactive Today hidden on utility routes. |
| Product invariants | Preserved | No new accounts/OAuth/RBAC, vector/RAG, sync/merge/event bus/service layer, folders/tags/unread/archive, settings dashboards, persistent source jobs, or source activity ledgers are authorized. |

## Remaining debt

- Live OpenRouter `model_status=ok` proof remains unavailable because the provider/account guardrail returned a classified external/provider error. This is already documented as non-blocking debt and is not a documentation blocker.
- Historical artifacts from the temporary no-control interpretation remain in the repository. They are acceptable only when explicitly marked superseded and must not be copied as current Source Ledger requirements.

## Programmatic Handoff

```json
{
  "status": "SUCCESS_WITH_HISTORICAL_SUPERSESSION",
  "headline": "PASS_WITH_REG01_SUPERSESSION",
  "verdict": "PASS_FOR_CURRENT_DOC_CLEANUP_CONTEXT",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "USE_CURRENT_SOURCE_LEDGER_AUTHORITY",
  "blockers": [],
  "superseded_scope": "Original doc-sync conclusion that Source Ledger manual ingest/fetch controls should be absent",
  "artifacts_modified": [
    "docs/audits/artifacts/regression-audit-2026-05-12c/regression-audit-doc-sync-check.md"
  ]
}
```
