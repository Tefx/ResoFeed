# Re-ingest / Reprocess Failure Reason Confirmation — Obsolete Historical Evidence

## Current Governance Status

This artifact is retained only as historical context. It MUST NOT be used as positive evidence for current re-ingest, FTS freshness, or current production database counts.

The prior contents were produced in an isolated verifier worktree against a copied `data/resofeed.sqlite3` and recorded stale failed-state observations, including a stale `runtime_metadata.search_fts_stale_since` marker and failed `reprocess_library` receipt. Those observations are not a current disposable proof trail for this worktree.

## Replacement Proof Selection

Current positive proof for this remediation is the disposable browser/runtime test output produced by the `ccr-batched-regression-blocker-remediation` worktree, especially:

- `npx playwright test --config ./playwright.config.ts tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts tests/e2e/current-operation-utility-placement.expected-red.spec.ts tests/e2e/inspector-source-model-browser-proof.audit.spec.ts tests/e2e/azrct-audit-zh-repair.regression.spec.ts`
- `npx playwright test --config ./playwright.config.ts tests/e2e/current-operation-utility-placement.expected-red.spec.ts`

These current commands prove the browser-visible non-destructive re-ingest failure message and contextual operation-status behavior without treating the stale database/FTS failure snapshot as success evidence.

## Historical Counts

No current database counts are asserted here. If database-level FTS freshness or reprocess counts are required, they must be regenerated from a fresh disposable database/runtime proof trail in the relevant worktree.
