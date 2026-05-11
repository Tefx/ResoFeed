# UI Remediation R1 Second Focused Browser Retest — 2026-05-11

Tester: integration-verifier
Worktree: `.vectl/worktrees/ui-remediation-retest-closure.urrc-r1-second-focused-browser-retest`

## Commands

- `npm run test:e2e -- --project=chromium-ci-safe ui-remediation-r1-r8-browser-retest.spec.ts` from `web/` — exit 0; `1 passed (3.4s)` on final focused run.
- Baseline command from `web/`: `npm run test:e2e -- --project=chromium-ci-safe full-ui-design-conformance.expected-red.spec.ts real-server-ui.spec.ts inspector-readable-content-regression.spec.ts inspector-dirty-corpus.spec.ts` — exit 0; `11 passed (10.2s)`.

## R1 Attachment Evidence

Decoded `r1-primary-inspector-text.txt` from `.test-artifacts/playwright/results/results.json`:

```text
Follow prompt cleanup preserves readable article prose original link full · source-backed summary: Second readable paragraph confirms the body is not empty after bounded cleanup. core insight: Second readable paragraph confirms the body is not empty after bounded cleanup. Second readable paragraph confirms the body is not empty after bounded cleanup.
```

Forbidden strings checked by the focused test and absent from the decoded primary text:

- `Follow us on Twitter for more newsletters`
- `summary-like lead repeated by the site`

Readable prose obligation present:

- `Second readable paragraph confirms the body is not empty after bounded cleanup.`

## Verdict

PASS: R1 is proven by focused browser runtime evidence. R2-R8 are retained by the same focused test plus fresh baseline browser evidence.
