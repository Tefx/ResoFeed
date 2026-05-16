# srde2e E2E Contract Adjudication

Step: `srde2e-e2e-contract-adjudication`  
Date: 2026-05-16  
Mode: authority adjudication / read-only product-source investigation

## Re-anchor

This report adjudicates the residual full-plan E2E failures after the salvaged srde2e commits. It does not change product code, test code, fixtures, docs, or plan state. Its output is a remediation contract for `srde2e-full-plan-e2e-blockers-fix`.

## refs Read Confirmation

- `docs/DESIGN.md` — read and cited. Key passages: primary surfaces include a discreet `RESOFEED` menu containing `TODAY` and `SOURCE LEDGER` and a flat Source Ledger with `[FETCH]`, `[RUN INGEST]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]` (lines 303-318); Layout says `TODAY` and `SOURCE LEDGER` may appear only after opening `RESOFEED`, not as persistent links (lines 370-388); App Shell requires the `RESOFEED` menu summary to be keyboard reachable and entries to be real buttons/links with accessible names (lines 431-435); Desktop Split Scroll requires selecting a Feed item to keep Feed scroll stable (lines 397-399); Source Ledger OPML/fetch states and stable 44px controls are defined at lines 569-627; Resonate is a 44px target, duplicated in Inspector only on mobile route, not desktop split pane (lines 535-559).
- `docs/UI_REGRESSION_CONTRACT.md` — read and cited. Key passages: hit-target tests must use real pointer/topmost-element checks (lines 15-24); menu trigger and menu entries are `RESOFEED`, `TODAY`, `SOURCE LEDGER` targets (lines 26-30); `[RUN INGEST]`, `[FETCH]`, OPML import, diagnostics and row status are explicit regression targets (lines 36-39); keyboard contract says Tab reaches Steer, `RESOFEED`, opened `TODAY`/`SOURCE LEDGER`, feed controls, Source Ledger controls, OPML, state actions (lines 43-68); dirty corpus requirements and negative assertions cover raw payload suppression, hit targets, no layout shift, fixture labels (lines 107-123, 145-170).
- `docs/ARCHITECTURE.md` — read and cited. Key passages: one deployable Go process with background ingest and one SQLite DB (lines 13-16, 75); source-of-truth and lifecycle use SQLite transactions and a single in-process ingest guard (lines 173-209); Source Ledger source rows have unique feed URL and `last_fetch_at/status/error`, OPML folders discarded, one source failure isolated (lines 321-343); `Source` API allows `last_fetch_status` values `ok`, `rss_fetch_error`, `not_fetched` and `last_fetch_at: null` before first fetch (lines 902-914); OPML import endpoint returns counts only, manual ingest/fetch endpoints are separate and guarded (lines 947-1055, 1159-1175); OPML import deduplicates by source URL (lines 1218-1225); frontend must expose `TODAY`/`SOURCE LEDGER` through `RESOFEED`, flat ledger controls, and no dashboards/queues (lines 1500-1528).

## Current-Main E2E Inventory

**Command run:**

```text
npm --prefix web run test:e2e
```

First attempt failed before execution because `playwright` was absent. After verifying `web/node_modules/.bin/playwright` was missing, `npm --prefix web ci` installed declared lockfile dependencies. Full E2E then ran and produced:

```text
7 failed
  [chromium-ci-safe] › tests/e2e/full-ui-design-conformance.expected-red.spec.ts:179:1 › expected-red UI/design conformance matrix covers findings F1-F47 on the real app
  [chromium-ci-safe] › tests/e2e/hit-target-clickability.spec.ts:162:1 › hit-target clickability: SOURCE LEDGER, TODAY, Steer submit, star, Inspector links, /doctor, and OPML import controls
  [chromium-ci-safe] › tests/e2e/inspector-dirty-corpus.spec.ts:114:1 › dirty corpus inspector primary hierarchy hides raw feed payloads and provenance
  [chromium-ci-safe] › tests/e2e/inspector-readable-content-regression.spec.ts:84:1 › Inspector primary body hides screenshot-family raw source, navigation, and diagnostic garbage
  [chromium-ci-safe] › tests/e2e/prd-inspector-preview-conformance.expected-red.spec.ts:249:1 › expected-red PRD Inspector fields and ui-preview desktop parity are visible in the real rendered app
  [chromium-ci-safe] › tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts:182:1 › R1-R8 Inspector browser retest preserves R1 prose while keeping dirty payloads out of primary reading copy
  [chromium-ci-safe] › tests/e2e/ui-runtime-fresh-review-remediation.spec.ts:350:3 › ui-runtime fresh review contract expected-red coverage › FR-01/FR-10: RESOFEED surface menu is closed by default, keyboard reachable, and toggles TODAY/SOURCE LEDGER on desktop and mobile
2 skipped
64 passed (1.7m)
```

**Additional isolated probe:**

```text
npm --prefix web run test:e2e -- --project=chromium-ci-safe inspector-dirty-corpus.spec.ts
```

Result: the isolated dirty-corpus spec still failed on the fetch-button selector. Therefore that specific failure is not solely accumulated full-run state; it also contains selector/accessibility-name contract drift.

## Authority Matrix

| Failure | Assertion | DESIGN.md authority | UI_REGRESSION_CONTRACT.md authority | ARCHITECTURE.md authority |
|---|---|---|---|---|
| `full-ui-design-conformance.expected-red` | Steer command `source ledger` did not expose `SOURCE LEDGER` heading | `RESOFEED` menu may hold `SOURCE LEDGER`; Source Ledger is flat utility surface (303-318, 431-435, 569-573) | Source Ledger surface/heading and active-panel semantics are required (28-30, 52) | Frontend may route through Steer and must expose flat Source Ledger; no special service/process (1500-1509) |
| `hit-target-clickability` | Row bounding box `y` changed from 2698 to 574 after Inspect/open | Selected item must not alter dimensions; desktop selection keeps Feed scroll position stable (377, 397-399, 523) | Real hit-target proof; row inspect must open Inspector with no layout shift; selected/focus states no translation/layout shift (17-24, 33, 78-83, 150-166) | Desktop split scroll is frontend containment; selecting item must not move feed scroll (27, 1500-1528) |
| `inspector-dirty-corpus` | Fetch button named `Fetch source Dirty Inspector Corpus` or `[FETCHING...]` not found | Source Ledger rows have `[FETCH]` on same row and source names visible; stable 44px controls (571-602) | `[FETCH]` / `[FETCHING...]` or accessible label `Fetch source <name>` is accepted; dirty corpus fixtures required (37, 107-123) | OPML import dedupes by URL; Source row status may be `not_fetched`; source failure isolated (902-914, 1173, 1223) |
| `inspector-readable-content-regression` | Expected `status: ok · last_fetch:` for dynamic fixture source; not visible | Source fetch complete updates `last_fetch`; failed fetch shows raw `err:` adjacent to source (588-598) | Manual fetch/ingest coverage includes source-level error feedback and timestamp update, not only success (36-39, 165) | Ingest source failures return HTTP 200 with failed/completed_with_errors and errors; one source failure does not block others (341-343, 992-995) |
| `prd-inspector-preview-conformance` | Desktop Inspector star target measured `0x0` | Resonate target is 44px; Inspector duplicates Resonate only on mobile route, not desktop split pane (535-559) | Star target is required in feed; mobile Inspector star only when route mode (32) | Frontend desktop split has feed + Inspector; no desktop Inspector duplicate star required (1527-1528) |
| `ui-remediation-r1-r8-browser-retest` | First source title `Dirty Inspector Corpus` had `rss_fetch_error` despite another imported Dirty source | Source Ledger may show raw source-level errors; duplicate/story grouping must preserve source access (527, 588-598) | Fixture/test contract must use fresh data/fixture labels; manual fetch coverage includes source-level error feedback (126, 165) | OPML import deduplicates by URL, not title; one source failure isolated; source statuses include `rss_fetch_error` (341-343, 902-914, 1223) |
| `ui-runtime-fresh-review-remediation FR-01/FR-10` | `RESOFEED` summary not focused after Tab; snapshot shows `summary tabindex="-1"` | `RESOFEED` menu summary must be keyboard reachable; entries appear after menu opens (374, 431-435) | Tab reaches `RESOFEED` trigger and opened `TODAY`/`SOURCE LEDGER`; trigger named `RESOFEED` (47-60) | Frontend must expose low-chrome `RESOFEED` menu; persistent links not required (1506-1508) |

## Decision Matrix

| Failure | Classification | Remediation owner | Exact remediation instruction | Allowed test deviation | Blocking disposition |
|---|---|---|---|---|---|
| `full-ui-design-conformance.expected-red` Source Ledger via Steer | mixed | UI implementation + test maintainer | Prefer contract path through `RESOFEED` menu for Source Ledger navigation assertions. If Steer command remains supported, ensure `source ledger` deterministically activates `.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel` and heading. Do not add persistent nav tabs. | Allowed: replace Steer-only navigation helper with menu helper, because docs make the menu authoritative and Steer optional for Source Ledger on narrow layouts. | Blocking until either menu-path test is used or Steer activation is made reliable. |
| `hit-target-clickability` row `y` changed after inspect | mixed | Test maintainer primarily; UI owner secondarily | Do not compare viewport-relative `y` before/after `scrollIntoView` or focus-induced browser scrolling. Assert width/height/x invariance and feed scroll container `scrollTop` stability instead. If implementation changes are needed, ensure Inspector focus does not scroll the Feed container and selected state changes no row dimensions. | Allowed: change row-bounds assertion to geometry dimensions + feed scroll container invariance; viewport `y` is stale after Playwright/focus scroll. | Blocking as test contract bug; still keep UI no-layout-shift checks. |
| `inspector-dirty-corpus` missing `Fetch source Dirty Inspector Corpus` | mixed | Test maintainer + UI a11y owner | Scope fetch lookup to `.source-ledger__row` containing the exact source title and accept `[FETCH]`/`[FETCHING...]`; separately fix generic accessible labels like `Fetch source source title` to use actual source display title when an aria-label is emitted. | Allowed: selector may accept row-scoped visible `[FETCH]`; docs permit `[FETCH]` as the button name. Do not require only `Fetch source <title>`. | Blocking; isolated probe confirms not only shared-state. |
| `inspector-readable-content-regression` requiring `ok` | stale_test / fixture_shared_state_issue | Test maintainer | After OPML import + global ingest, assert the source row exists and reaches any terminal documented state: `ok` with `last_fetch`, or `rss_fetch_error` with raw `err:` and no raw-primary leak. For tests that require readable content, use per-source fetch while fixture server is alive and assert by source URL/id, not by display-title-only. | Allowed: post-import status may be `not_fetched`, `ok`, or `rss_fetch_error`; `ok` is stale unless the test controls per-source fetch success. | Blocking test expectation; no app change required unless source fetch success is impossible under controlled live fixture. |
| `prd-inspector-preview-conformance` desktop Inspector star `0x0` | stale_test | Test maintainer | On desktop split pane, measure `.contract-resonate` in the selected feed row, not inside Inspector. Only require Inspector duplicate star in mobile route mode. | Allowed: remove desktop Inspector-star requirement; docs explicitly say Inspector duplicates Resonate only on mobile/single-column route. | Blocking stale expectation. |
| `ui-remediation-r1-r8-browser-retest` first Dirty source `rss_fetch_error` | fixture_shared_state_issue | Test maintainer | Do not select `sources.find(title === 'Dirty Inspector Corpus')` in accumulated DB. Use the imported OPML feed URL, source id from `/api/sources`, or unique per-test source title; delete imported sources after test or isolate DB per fixture family. Treat old refused-port rows as expected accumulated full-run contamination, not app failure. | Allowed: same title may appear more than once when feed URLs differ; OPML dedupe is by URL, not title. | Blocking fixture isolation issue. |
| `ui-runtime-fresh-review-remediation FR-01/FR-10` `RESOFEED` trigger not focusable | implementation_bug, with legacy-test conflict resolved | UI implementation | Make `details.surface-nav > summary` or equivalent `RESOFEED` trigger normally keyboard focusable; remove `tabindex="-1"`; Enter/Space opens menu; opened menu exposes real `TODAY` and `SOURCE LEDGER` controls. Do not put hidden entries into normal Tab order while menu is closed. | Allowed: legacy tests expecting Tab from Steer directly to `TODAY` are stale; update to Tab to `RESOFEED`, open menu, then reach `TODAY`/`SOURCE LEDGER`. | Blocking implementation bug. |

## Mandatory Topic Dispositions

- **Focus order:** Winning expectation is `Steer -> RESOFEED trigger -> opened menu entries`, not `Steer -> TODAY` while menu is closed. Rationale: DESIGN says the product label may act as the menu and `TODAY`/`SOURCE LEDGER` may appear only after it opens; App Shell requires the `RESOFEED` summary to be keyboard reachable. UI_REGRESSION_CONTRACT says Tab reaches the `RESOFEED` trigger and opened entries. Current `summary tabindex="-1"` is an implementation bug; legacy direct-TODAY Tab tests are stale.
- **Nav visible text:** Winning expectation is visible operational labels `RESOFEED`, `TODAY`, and `SOURCE LEDGER` when the menu is open. Visible `T` / `SL` shortcuts are not docs-backed replacements for the menu item text. If abbreviations remain as visual glyphs, they must not be the only visible label for the opened entries; tests may still use accessible names, but docs/UI regression selectors explicitly cite `button:has-text("TODAY")` and `button:has-text("SOURCE LEDGER")`. Classification: implementation bug for current visible abbreviation behavior, not a permitted stale-test deviation.
- **OPML import/ingest `last_fetch`:** OPML import itself returns counts and deduplicates by URL; it does not guarantee a durable `not_fetched` observation window. Because the runtime has a background ingest loop and Source status enum is `not_fetched|ok|rss_fetch_error`, real-server tests may assert post-import source existence plus one of: `not_fetched` with null/no timestamp before first fetch, `ok` with `last_fetch_at`, or `rss_fetch_error` with `last_fetch_at`/raw error. A test that needs successful content must trigger controlled per-source fetch or global ingest while the fixture server remains alive and assert the resulting terminal state explicitly.
- **Duplicate rows/shared DB state:** Full E2E uses one global setup DB for the whole run (`global-setup.ts` creates one `dbPath` and all specs share it). Error snapshots show multiple `Dirty Inspector Corpus` rows with different localhost feed URLs/ports and different statuses, including stale refused-port rows and fresh `not_fetched` rows. Architecture allows this: source URL is unique and OPML dedupe is by URL, not title. Tests must not select by title alone in accumulated state. Fixture isolation, unique titles, cleanup, URL/id targeting, or per-spec DB isolation are the correct remediation; app idempotency by title would violate source identity.
- **Hit-target scroll geometry:** The failing `y` delta is viewport-relative movement after Playwright/focus scroll into a row far down the accumulated feed (`y:2698 -> 574`), not proof that selected styling changed dimensions (`height`, `width`, `x` stayed stable). Remediation belongs in test scroll expectations first: assert row dimensions and feed scroll-container stability, not absolute viewport `y` across a browser scroll. UI must still preserve selected row dimensions and feed container scroll when opening Inspector.

## Next-Step Instruction Packet for `srde2e-full-plan-e2e-blockers-fix`

1. **Fix RESOFEED keyboard trigger and visible menu labels.** Likely files: `web/src/routes/+page.svelte` and/or navigation component styles. Remove `tabindex="-1"` from the `summary`/trigger; ensure Enter/Space opens; when open, render visible `TODAY` and `SOURCE LEDGER` text or docs-equivalent visible labels. Forbidden shortcut: do not add persistent top-level tabs or a sidebar.
2. **Normalize navigation helpers in E2E tests.** Likely files: `web/tests/e2e/full-ui-design-conformance.expected-red.spec.ts`, `ui-runtime-fresh-review-remediation.spec.ts`, `source-ledger-navigation-regression.expected-red.spec.ts`, `hit-target-clickability.spec.ts`. Use the authoritative `RESOFEED` menu path for surface switching. Treat Steer route commands as optional/additional coverage, not the only route to Source Ledger.
3. **Repair Source Ledger fetch selector/a11y contract.** Likely files: Source Ledger Svelte component and tests using imported dynamic source rows. UI should not emit `Fetch source source title` for dynamic OPML sources; if aria-label is provided, use the actual source display title. Tests must scope `[FETCH]` to the source row and may accept visible `[FETCH]`/`[FETCHING...]` per UI_REGRESSION_CONTRACT.
4. **Make dynamic fixture tests URL/id based and terminal-state aware.** Likely files: `inspector-dirty-corpus.spec.ts`, `inspector-readable-content-regression.spec.ts`, `ui-remediation-r1-r8-browser-retest.spec.ts`, fixture helpers. Capture the OPML feed URL/source id after import, not just title. Accept documented `not_fetched|ok|rss_fetch_error` immediately after import; require `ok` only after a controlled fetch against a live fixture server. Forbidden shortcut: do not change app dedupe to title-based or hide duplicate source titles.
5. **Fix shared-state ordering.** Choose one: per-spec DB isolation for dynamic fixture families, deterministic cleanup/delete by source URL after each dynamic fixture test, or unique source titles with exact URL targeting. Do not rely on global DB ordering or `Array.find(title)`.
6. **Adjust hit-target geometry assertion.** In `hit-target-clickability.spec.ts`, compare stable dimensions and source scroll container offset instead of viewport-relative `y` after row focus/scroll. Keep all real hit-target/topmost checks. Forbidden shortcut: do not remove no-layout-shift coverage entirely.
7. **Fix stale desktop Inspector star check.** In `prd-inspector-preview-conformance.expected-red.spec.ts`, audit the selected feed-row star on desktop and Inspector star only in mobile route mode. Forbidden shortcut: do not add a duplicate desktop Inspector star; DESIGN forbids that except mobile/single-column route.
8. **Post-fix gate:** rerun `npm --prefix web run test:e2e -- --project=chromium-ci-safe` and then full `npm --prefix web run test:e2e`. If failures remain, classify by the matrix above rather than re-litigating the contracts.

## Verification

- Commands run:
  - `npm --prefix web run test:e2e` — initial dependency failure: `sh: playwright: command not found`.
  - `test -d web/node_modules && test -x web/node_modules/.bin/playwright` — exit status confirmed Playwright missing.
  - `npm --prefix web ci` — installed declared web lockfile dependencies; no source edits intended.
  - `npm --prefix web run test:e2e` — 7 failed, 64 passed, 2 skipped.
  - `npm --prefix web run test:e2e -- --project=chromium-ci-safe inspector-dirty-corpus.spec.ts` — isolated probe still failed on fetch-button selector.
- Product source/test/docs modifications: none intentionally made. Generated `.test-artifacts` and build/test output were produced during verification and restored/cleaned before commit.
- Open questions: none blocking for the next remediation attempt. Non-blocking: whether maintainers prefer per-spec DB isolation or dynamic fixture cleanup for long-term E2E hygiene.
