# Retest: B1 dirty JSON-LD Inspector blocker

Tester: blind-tester
Worktree: `.vectl/worktrees/retest-blind-dirty-jsonld-inspector`
Branch: `vectl/step-retest-blind-dirty-jsonld-inspector`

## Commands

```sh
npm --prefix web ci
npm --prefix web run check
npm --prefix web run test:e2e -- inspector-dirty-corpus.spec.ts --project=chromium-ci-safe
npm --prefix web run test:e2e -- design-artifact-negative-ux.spec.ts --project=chromium-ci-safe --grep "negative UX assertions"
npm --prefix web run test:e2e -- inspector-dirty-corpus.spec.ts --project=chromium-ci-safe
```

## Result

- `npm --prefix web run check`: `svelte-check found 0 errors and 0 warnings`
- dirty corpus Playwright: `1 passed`; covers `Readable dirty-content article` with inline JSON-LD in fetched article HTML.
- negative UX Playwright: `1 passed`; asserts primary feed/Inspector/search text excludes `{ "@context"`, `"@type"`, script/style leftovers, and huge JSON blobs; also checks forbidden UX/product-copy drift.

## Key after-state artifact

- `.test-artifacts/playwright/screenshots/inline-json-ld-inspector-fixed.png`

Observed Inspector primary body for `Readable dirty-content article`:

```text
Stubbed OpenRouter transport stayed outside product authority.

Readable lead paragraph that should remain primary.
More readable body after dirty payload.

why: fresh from configured source

▸ raw provenance diagnostics
```

Raw JSON-LD tokens that were visible in prior blocker evidence (`{ "@context"`, `"@type":"NewsArticle"`, `"tracking"`) were not visible as primary reading text in the after-state screenshot/test run. Raw/provenance material is represented as labelled collapsed secondary diagnostic material (`raw provenance diagnostics`).

## Blind constraint note

The task requested reading `web/src/routes/components/Inspector.svelte`; that file is implementation source and was not read under blind-tester constraints. Browser behavior and public test harness artifacts were used as closure proof instead.
