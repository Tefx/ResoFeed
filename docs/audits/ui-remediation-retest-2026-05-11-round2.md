# ResoFeed UI Remediation Retest Audit - Round 2

Date: 2026-05-11
Target: `http://127.0.0.1:8080/`
Scope: second post-remediation UI/UX retest against `docs/DESIGN.md`, the previous retest report, and live browser behavior with real feed data.

## Verdict

Round 2 fixes several important residual UI issues from the previous audit, but the app is still not a clean pass.

The strongest improvements are metadata grammar, Inspector provenance de-duplication, desktop Source Ledger structure, and Search layout. The remaining blockers are real-data Inspector sanitation, a `/doctor` route regression, and mobile Source Ledger route containment. Automated fixture coverage passed, but live The Verge content still exposes boilerplate/recommendation text that the fixture test did not catch.

## Evidence Captured

Screenshots and a machine-readable observation log were captured into:

- [artifact directory](artifacts/ui-remediation-retest-2026-05-11-round2)
- [round2 observations JSON](artifacts/ui-remediation-retest-2026-05-11-round2/round2-observations.json)

Key screenshots:

- [desktop feed](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-feed.png)
- [desktop inspector](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-inspector.png)
- [desktop source ledger](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-ledger.png)
- [desktop doctor attempt](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-doctor.png)
- [desktop search](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-search.png)
- [mobile feed](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-feed.png)
- [mobile inspector](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-inspector.png)
- [mobile inspector content](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-inspector-content.png)
- [mobile inspector tail](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-inspector-tail.png)
- [mobile source ledger](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-ledger.png)
- [mobile search](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-search.png)

## Confirmed Improvements Since Round 1

### Metadata grammar

Status: materially improved.

Feed metadata now renders in the intended lower-case grammar, e.g. `src: The Verge · 14m · full`, rather than the prior forced `SRC: THE VERGE` style.

Remaining caveat: mobile Search still truncates metadata too aggressively.

Evidence:

- [desktop feed](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-feed.png)
- [mobile feed](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-feed.png)

### Inspector provenance line

Status: fixed.

The prior duplicate `full · full` Inspector state is gone. The current Inspector renders `full · source-backed`, which is a cleaner single provenance/extraction phrase.

Evidence:

- [desktop inspector](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-inspector.png)
- [mobile inspector](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-inspector.png)

### Desktop Source Ledger

Status: mostly fixed.

Desktop Source Ledger now follows the intended flat shape more closely:

- visible `SOURCE LEDGER` surface;
- source row includes `src:`, `status:`, `last_fetch:`, and `url:`;
- bracket actions render as `[RUN INGEST]`, `[FETCH]`, `[DELETE]`, `[IMPORT OPML]`, `[EXPORT STATE]`, and `[IMPORT STATE]`;
- State Portability actions are now visually part of the Ledger action cluster.

Evidence:

- [desktop source ledger](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-ledger.png)

### Search layout

Status: improved.

Search now has a stable form layout on desktop and mobile, with result count and result rows using the feed-like anatomy. The prior mobile form collision is fixed.

Evidence:

- [desktop search](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-search.png)
- [mobile search](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-search.png)

### Stale retrieval receipt on Today

Status: fixed in this sample.

The mobile Today feed no longer showed the prior stale `retrieval: lexical search` receipt after a clean page load.

Evidence:

- [mobile feed](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-feed.png)

## Remaining / New Findings

### R2-1. Inspector still leaks real-source boilerplate and recommendation tail

Severity: P1
Status: still failing with real data
Design reference: `docs/DESIGN.md` -> `Inspector Pane`

Live The Verge content still leaks non-reading payload into the Inspector body. The most obvious remaining pollution appears near the article tail:

- `Follow topics and authors from this story...`;
- author/topic tail text such as `Jess Weatherbed Creators News Tech`;
- unrelated related-story title text such as `TikTok flagship laptop is a MacBook Pro clone gone horribly wrong`.

The first desktop viewport also still blends author/date/profile-like material into the main reading payload after the summary/core insight.

This is especially important because the targeted E2E dirty-corpus fixture passed. The fixture coverage is useful, but it does not yet cover this real-source pattern.

Evidence:

- [desktop inspector](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-inspector.png)
- [mobile inspector content](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-inspector-content.png)
- [mobile inspector tail](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-inspector-tail.png)

Required correction:

Extend sanitation to remove real-source follow prompts, topic/author follow copy, author taxonomy tails, and related-story titles. Add a fixture covering this exact tail pattern so the automated R1/R8 test fails before the live UI does.

### R2-2. `/doctor` route regressed to Today/Inspector

Severity: P1
Status: new regression
Design reference: `docs/DESIGN.md` -> `Diagnostics Output`

Navigating to `/doctor` on the authenticated live app did not render a doctor diagnostic surface. The screenshot captured from `/doctor` shows the regular Today feed and Inspector split pane instead.

HTTP returned the app shell for `/doctor`, but authenticated client rendering did not expose visible `DOCTOR` or diagnostic output content.

Evidence:

- [desktop doctor attempt](artifacts/ui-remediation-retest-2026-05-11-round2/desktop-doctor.png)

Required correction:

Restore `/doctor` as a distinct operational diagnostic route/surface. It should not silently fall back to Today/Inspector after authentication.

### R2-3. Mobile Source Ledger route still exposes feed content below the Ledger

Severity: P2
Status: new/residual route containment issue
Design reference: `docs/DESIGN.md` -> `Source Ledger`, `Layout & Spacing`

The mobile Source Ledger top section is much improved and now preserves `src:`, `status:`, `last_fetch:`, and `url:` in readable form. However, the full-page mobile screenshot shows the Today feed continuing underneath the Ledger. This makes the Ledger behave like a short inserted panel rather than a clean route/overlay.

Evidence:

- [mobile source ledger](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-ledger.png)

Required correction:

On mobile/narrow layouts, Source Ledger should occupy a clean route/surface and not scroll directly into feed rows. If the product chooses overlay semantics, the underlying feed should not become part of the page reading flow.

### R2-4. Mobile Search metadata still truncates into low-information fragments

Severity: P2
Status: residual
Design reference: `docs/DESIGN.md` -> `Feed Item`, `Search and Retrieval`

The casing issue is fixed, but mobile Search result metadata still compresses to fragments like `src: The V... · 1... · f...`. This preserves the rhythm visually but loses useful source and extraction information.

Evidence:

- [mobile search](artifacts/ui-remediation-retest-2026-05-11-round2/mobile-search.png)

Required correction:

Prioritize readable source and age on narrow Search rows. Extraction provenance can wrap to the match/provenance line or truncate only after the source and age remain meaningful.

### R2-5. Live 8080 and automated fixture coverage now disagree

Severity: P2
Status: test coverage gap

The targeted E2E test passes against the dirty-corpus fixture, but the live 8080 retest still finds Inspector boilerplate in real feed content. The test suite is therefore not yet protecting the exact content-shape that remains broken.

Required correction:

Add a regression fixture from the observed The Verge tail pattern:

- follow/topics prompt;
- author/topic taxonomy tail;
- related-story title after article conclusion.

## Automated Test Results

### Passed

Command:

```bash
npm --prefix web run test:e2e -- ui-remediation-r1-r8-browser-retest.spec.ts --project=chromium-ci-safe
```

Result:

- 1 test passed.
- The production build completed during global setup.

Command:

```bash
npm --prefix web run check
```

Result:

- `svelte-check found 0 errors and 0 warnings`.

### Failed

Command:

```bash
go test ./...
```

Result:

- `resofeed/cmd/resofeed`: no test files.
- `resofeed/internal/resofeed`: failed.

Failure:

```text
--- FAIL: TestMCPDeliverySuppressesCandidateUntilFreshRelatedDevelopment
core_blockers_test.go:212: MCP candidates = [{ID:item_related ... Title:Delivery story related development ...}], want delivered item resurfaced with fresh related development
```

This appears outside the visual UI layer, but it is a real repository health regression until proven unrelated.

## Browser / Tooling Notes

The Codex in-app browser surface was unavailable during this run (`No active Codex browser pane available`). Arc was available through Computer Use and showed the live app at `127.0.0.1:8080`, while automated screenshot capture used local browser automation against the same URL.

No implementation files were intentionally changed by this audit. This report and its screenshots are the only audit artifacts added by this retest.

