# pbar-frontend-gate-retest-proof current run pointer

- generated_at: 2026-05-11T17:58:38.690Z
- worktree: `.vectl/worktrees/pbar-frontend-gate-retest-proof`
- branch: `vectl/step-pbar-frontend-gate-retest-proof`
- render command: `cd web && npm run test:render` -> exit 0; 6 files / 39 tests passed
- e2e command: `cd web && npm run test:e2e -- --project=chromium-ci-safe ui-remediation-r1-r8-browser-retest.spec.ts full-ui-design-conformance.expected-red.spec.ts` -> exit 0; 3 passed
- escape hatch scan: `cd web && grep -R -n -E '@invar:allow|invar:allow' src || true` -> no output
- current Playwright proof source: command stdout captured in the retest report (`3 passed`, exit 0). The heavy generated `.test-artifacts/playwright/` bundle was not committed because it rewrites unrelated tracked evidence bundles outside this retest scope.
- current frontend-gate artifacts: `.audit-artifacts/frontend-gate/render-proof.json`, `current-populated-desktop-full.png`, `current-mobile-feed.png`, `current-mobile-inspector.png`, `current-mobile-source-ledger.png`
- current proof register: `.audit-artifacts/frontend-gate/pbar-frontend-gate-retest-proof-register.yaml`

Note: existing `web/test-results/ui-remediation/playwright-results/results.json` contains stale paths from a different worktree and is not used as gate evidence for this retest. The current command evidence is the console output plus the regenerated frontend-gate artifacts and proof register above.
