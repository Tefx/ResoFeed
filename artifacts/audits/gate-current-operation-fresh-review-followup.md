# Gate Review Report: current-operation fresh-review follow-up

Reviewer: gate-reviewer (independent of phase implementation)
Phase: ui-runtime-fresh-review-followup-repair
Verdict: FAIL

## Summary

The phase has strong green evidence for the three late follow-up blocker families (FR-02 time grouping, mobile same-URL Inspector disclosure, and mobile metadata proof), plus green Go/current-operation component checks. However, an in-scope current-operation browser contract still fails in `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts`: while a local long-running `[RUN INGEST]` request is pending, the opened `RESOFEED` menu does not expose the operation status; and the legacy/current placement spec for conflict-current-operation detail is not green. Under zero-trust gating, this is blocker-class because the gate explicitly requires current-operation visibility in Source Ledger and opened menu, plus no bypass of unresolved expected-red/browser proof.

## Verification

- `go test ./internal/resofeed -run 'TestCOSBackend|TestMCPSystemOperationResource|Test.*CurrentOperation'` — PASS (`ok resofeed/internal/resofeed 0.996s`).
- `npm run check` — PASS after verifying missing frontend deps and running `npm install`; `svelte-check found 0 errors and 0 warnings`.
- `npm run build` — PASS.
- `npm run test:render -- src/routes/components/__tests__/current-operation-utility-placement.test.ts src/routes/components/__tests__/ui-preview-runtime-provenance.expected-red.test.ts src/routes/components/__tests__/manual-rss-fetch-source-ledger.regression.test.ts` — PASS (`3 files / 21 tests`).
- `npm run test:e2e -- ui-runtime-fresh-review-remediation.spec.ts --project=chromium-ci-safe -g "FR-02|B1: mobile served-app Inspector|FR-09"` — PASS (`3 passed`).
- `npm run test:e2e -- --project=chromium-ci-safe current-operation-utility-placement.expected-red.spec.ts ui-runtime-fresh-review-followup.expected-red.spec.ts` — FAIL (`2 failed, 6 passed`).

## Blockers

1. `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:207` failed. The opened `RESOFEED` menu lacked operation status while `[RUN INGEST]` was held pending. Failure evidence snapshot shows menu contains `NAV`, `TODAY`, `SOURCE LEDGER`, `OPERATIONS`, `LANG: EN`, `[REPROCESS LIBRARY]`, but no `[INGESTING...]`/current-operation text; Source Ledger only shows `submitting ingest` and disabled `[INGESTING...]`. Missing verification step: make this in-scope browser proof green or explicitly retire/supersede the stale expected-red with a committed rationale and replacement coverage for local long-running operation visibility in the opened menu.
2. `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:231` failed. The test expects conflict status in `.source-ledger__header-actions .source-ledger__status` with current-operation detail. Runtime snapshot actually shows canonical text `err: ingest already running · op: library_reprocess · actor:human · phase:processing_items · 2/5 · library reprocess processing item · since 11:00:00` in the Source Ledger header, so this may be a stale selector/copy assertion; nevertheless, the in-repo expected-red browser contract is not green. Missing verification step: update/replace this stale spec and rerun green targeted browser evidence.

## Non-blocking notes

- `CONSTITUTION.md` was not present in the isolated worktree.
- Scoped `@invar:allow|invar:allow` scan over `cmd internal web/src web/tests docs/ARCHITECTURE.md docs/DESIGN.md docs/CURRENT_OPERATION_FRESH_FINDINGS_CONTRACT.md AGENTS.md` returned no matches (`rg_exit=1`).
- Forbidden concept scan hits were anti-feature comments/tests/contract lock terms, not introduced product surfaces.
