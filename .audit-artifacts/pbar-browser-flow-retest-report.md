# pbar-browser-flow-retest evidence

- step_id: pbar-browser-flow-retest
- tester: integration-verifier
- refs: No refs for this step. Voluntarily read `web/tests/e2e/prd-pbar-expected-red-browser-gaps.spec.ts`, `web/tests/e2e/real-server-ui.spec.ts`, `.audit-artifacts/frontend-gate/pbar-frontend-gate-retest-proof-register.yaml`, and `web/test-results/ui-remediation/pbar-frontend-gate-retest-proof-current.md`.
- precondition_confirmed: yes; orchestrator stated `pbar-browser-flow-failure-remediation` complete and provided green mainline final-state commands.
- product_implementation_files_modified: false

## Commands

```sh
npm --prefix web install
# Exit 0; installed missing local web dependencies after `playwright: command not found` proved baseline node deps incomplete.

npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/prd-pbar-expected-red-browser-gaps.spec.ts
# First run exit 0: 5 passed (14.3s)

npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/real-server-ui.spec.ts
# Exit 0: 8 passed (11.5s)

npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/prd-pbar-expected-red-browser-gaps.spec.ts
# Final artifact-preserving run exit 0: 5 passed (11.7s)
```

## Raw output excerpts

```text
Running 5 tests using 1 worker
✓ B1/B2/B3/B11/B13/U1 expected-red: Search UI executes real lexical query and has compact accessible mobile anatomy
✓ B4/B5/B14/B15/B23/U2 expected-red: Steer receipts expose interpretation and source-add orientation across surfaces
✓ B9/B20/U4 expected-red: direct /doctor route renders scan-readable raw diagnostics without Today chrome
✓ B6/B7/B8/B19/B21/B22 expected-red: feed and Inspector expose fallback/provenance, sanitation, resonate state, and value metadata
✓ B10/B12/U3/U5 expected-red: mobile non-feed surfaces contain inactive feed, focus, full errors, and stable ledger rows
5 passed (11.7s)
```

```text
Running 8 tests using 1 worker
✓ ci-safe real server/UI boot uses the Go binary and owner-token gate
✓ ci-safe harness records required artifact paths and sanitized runtime notes
✓ ci-safe browser-led source import, manual fetch, feed, inspect, retrieve, and search
✓ @parity browser-led API/MCP parity probes share one real server fixture
✓ @llm-deterministic ci-safe missing and invalid OPENROUTER_KEY startup paths exit before browser binding
✓ @llm-deterministic browser-led steering uses deterministic OpenRouter transport and exposes terse receipt
✓ @llm-deterministic browser-led accepted steering changes ranking, filtering, and fresh model-health proof
✓ @llm-deterministic invalid OPENROUTER_KEY browser path fails gracefully with sanitized diagnostics
8 passed (11.5s)
```

## Key rendered evidence

- U1: `.contract-search-form` height assertion `<= 170` and first result y `< 620` passed in real Chromium at mobile viewport 390x844; exact pixel values are not emitted by the existing test. Artifact: `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-7166e-t-accessible-mobile-anatomy-chromium-ci-safe/mobile-search-result-anatomy.png` plus `.dom.txt`.
- B5/U2 rendered receipt text from DOM snapshot: `applied: source added: 127.0.0.1:58123; run ingest in SOURCE LEDGER` and ledger row `src: ResoFeed E2E Local Source ... url: http://127.0.0.1:58123/e2e-feed.xml`.
- B12 full diagnostic affordance count: test assertion `toHaveCount(1)` passed. A11y snapshot contains one `button` with class `source-diagnostic-action` and aria-label `diagnostic details for ResoFeed E2E Local Source: status ok; last fetch ...; full error none`.
- Invalid `OPENROUTER_KEY` browser path: `real-server-ui.spec.ts` line assertion passed: `await expect(page.getByRole('alert')).toHaveText('err: internal: internal error')`; suite exit 0 with test `@llm-deterministic invalid OPENROUTER_KEY browser path fails gracefully with sanitized diagnostics` passed.

## Artifact paths

- Desktop screenshots/snapshots:
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-7166e-t-accessible-mobile-anatomy-chromium-ci-safe/desktop-search-command-seeded.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-7166e-t-accessible-mobile-anatomy-chromium-ci-safe/desktop-search-command-seeded.dom.txt`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-7166e-t-accessible-mobile-anatomy-chromium-ci-safe/desktop-search-no-match.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-c28c7-ostics-without-Today-chrome-chromium-ci-safe/desktop-direct-doctor-route.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-4d584-te-state-and-value-metadata-chromium-ci-safe/desktop-feed-presentation.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-4d584-te-state-and-value-metadata-chromium-ci-safe/desktop-inspector-presentation.png`
- Mobile screenshots/snapshots:
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-7166e-t-accessible-mobile-anatomy-chromium-ci-safe/mobile-search-result-anatomy.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-9e8ae-rors-and-stable-ledger-rows-chromium-ci-safe/mobile-source-ledger-surface.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-9e8ae-rors-and-stable-ledger-rows-chromium-ci-safe/mobile-search-surface-containment.png`
  - `.test-artifacts/playwright/test-output/prd-pbar-expected-red-brow-9e8ae-rors-and-stable-ledger-rows-chromium-ci-safe/mobile-doctor-surface-containment.png`

## B16/B17/B18 proof

- B16: PROVEN by direct real-browser test `@llm-deterministic browser-led accepted steering changes ranking, filtering, and fresh model-health proof`: source URL add receipt, manual ingest, accepted steering, filtered crypto item absent, SQLite item ranked first, `/doctor` model-health keys visible.
- B17: PROVEN/non-intersecting browser gate by real-server startup path test: missing/blank `OPENROUTER_KEY` exits before browser binding with sanitized `invalid_openrouter_key: value required`; this is intentionally pre-browser startup safety.
- B18: PROVEN by direct real-browser invalid key path: role=alert rendered exact `err: internal: internal error` and logs redact invalid sentinel, owner token, and Authorization header.

## Finding closure map

- B1: PROVEN; search command executes real lexical query, 1 result.
- B2: PROVEN; no-match search returns 0 results and clears stale rows without generic internal error.
- B3: PROVEN; submit search accessible name visible.
- B4: PROVEN; steer receipts include interpreted/applied/rejected specificity rather than generic internal error.
- B5: PROVEN; RSS URL add receipt includes host/source identity and SOURCE LEDGER ingest orientation.
- B6: PROVEN; Inspector exposes fallback/partial/excerpt provenance.
- B7: PROVEN; Inspector dirty source furniture/related-story copy absent.
- B8: PROVEN; Resonate aria-pressed false then true after click.
- B9: PROVEN; direct `/doctor` route renders diagnostics and not active Today list.
- B10: PROVEN; mobile inactive feed has inert containment.
- B11: PROVEN; mobile search result exposes match/provenance metadata.
- B12: PROVEN; Source Ledger row has one keyboard/AT diagnostic detail affordance.
- B13: PROVEN; mobile search result has no competing inline time label in metadata.
- B14: PROVEN; steering receipt exposes normalized/applied/rejected details.
- B15: PROVEN; rejected unsafe steering path is specific and not generic internal error.
- B16: PROVEN; browser accepted steering changes ranking/filtering and `/doctor` model-health proof.
- B17: PROVEN_NON_INTERSECTING; startup invalid/missing key exits before browser binding by design.
- B18: PROVEN; invalid key browser path surfaces role=alert exact internal error while redacting secrets.
- B19: PROVEN; feed/Inspector sanitation and provenance assertions passed.
- B20: PROVEN; `/doctor` diagnostics include provider/model/item-transform keys.
- B21: PROVEN; feed rows expose value/quality/tier metadata.
- B22: PROVEN; Inspector core insight is clean/unavailable/fallback and no boilerplate leaks.
- B23: PROVEN; Enter/apply submissions complete from feed, Inspector, Search, and Ledger.
- U1: PROVEN; mobile Search compactness and first-screen result assertions passed.
- U2: PROVEN; source-add receipt has source identity and ingest orientation.
- U3: PROVEN; ledger row grammar includes src/status/last_fetch/url/actions anchors.
- U4: PROVEN; `/doctor` raw diagnostics are scan-readable.
- U5: PROVEN; mobile surface focus/containment assertions passed for Ledger/Search/Doctor.

## Behavioral proof register

| behavior | proof_status | evidence |
|---|---|---|
| Inspect | PROVEN | real-server UI test opened Inspector and pbar Inspector screenshot/DOM captured |
| Resonate | PROVEN | pbar aria-pressed transition and real-server Remove resonance assertion passed |
| Search command | PROVEN | pbar search command seeded 1 lexical result |
| Search submit | PROVEN | pbar no-match and mobile submit paths passed |
| Natural-language Steer accepted | PROVEN | real-server deterministic accepted steering receipt/ranking/filtering passed |
| Natural-language Steer rejected/invalid | PROVEN | pbar safe rejection/generic-error absence plus invalid key browser alert passed |
| RSS URL add receipt | PROVEN | DOM receipt includes `source added`, host, SOURCE LEDGER ingest orientation |
| Manual ingest | PROVEN | real-server and pbar ledger ingest status ok passed |
| /doctor direct route | PROVEN | pbar direct route diagnostics screenshot/DOM and assertions passed |
| /doctor via Steer | PROVEN | real-server `/doctor` via apply passed |
| Source Ledger diagnostics | PROVEN | B12 one diagnostic affordance assertion and a11y snapshot passed |
| State-portability restore safety | PROVEN | real-server export/import round trip shows `import complete`; pbar ledger footer warns `import replaces active sources, rules, and stars` |
| Top-nav/surface switching | PROVEN | steer-driven Today/Ledger/Search/Doctor transitions passed; no persistent tab expansion was added |
| Enter/apply submissions from feed/Inspector/Search/Ledger | PROVEN | pbar B23 loop passed across all four surfaces |

## Gate semantic reporting

- step_intent: retest_green
- expected_result: green
- observed_result: green; exact mandated commands exited 0; 5/5 and 8/8 tests passed; artifact-preserving pbar rerun also exited 0.
- failure_alignment: previously failing U1, B5/U2, B12, and invalid `OPENROUTER_KEY` role=alert path are now green by browser/runtime assertions.
- verdict: PASS
- blockers: []
- product_implementation_files_modified: false
- gate_open_allowed: true
- orchestrator_action_hint: COMPLETE
- explicit_uncertainty_sources: [`U1 exact search-form pixel height not printed by existing test output; assertion passed but numeric height was not logged.`]
