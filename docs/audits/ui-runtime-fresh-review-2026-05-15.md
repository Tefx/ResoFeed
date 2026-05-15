# ResoFeed Fresh Runtime UI Review - 2026-05-15

## Scope

Fresh review after the reported fixes. This pass did not limit itself to the previous findings. It rebuilt and served the project, used a clean runtime database plus deterministic local RSS/OpenRouter fixtures, and exercised the product through real browser UI flows only. No unit tests were used for this review.

Canonical comparison sources:

- `docs/DESIGN.md`
- `docs/ui-preview.html`
- Real served app at `http://127.0.0.1:18081`
- Empty first-use instance at `http://127.0.0.1:18082`

Artifacts:

- Screenshots: `.test-artifacts/ui-fresh-review-2026-05-15/*.png`
- Metrics: `.test-artifacts/ui-fresh-review-2026-05-15/fresh-ui-review-metrics.json`
- Exported state sample: `.test-artifacts/ui-fresh-review-2026-05-15/state-export.json`

Tool coverage:

- Browser Use: used successfully for owner-token rejection, first-use, feed reload, and live DOM review.
- Computer Use: verified local Chrome app state; Chrome was running and visible to the OS.
- Chrome plugin: extension backend still returned `Browser is not available: extension`. Follow-up checks showed Google Chrome running, the Codex Chrome Extension installed/enabled, and the native host manifest correct. Per Chrome plugin workflow, the next remediation step requires permission to open a Chrome window for the selected profile and retry.
- Playwright browser automation: used only as real UI/browser measurement, screenshot capture, and interaction automation.

## Covered User Stories

Covered and observed:

- Owner Token Prompt: empty, rejected, accepted; rejected state kept focus on the token input.
- First-Use Empty State: required four lines rendered in the normal shell.
- Today feed: dense feed rows, selected row, star state, time labels, fallback summaries, agent steering receipt.
- Inspector: desktop split and mobile route, partial extraction evidence, original link, source details, grouped-story disclosure path.
- Resonate: active and inactive star glyphs, 44px targets, no desktop Inspector duplicate star.
- Source Ledger: `[IMPORT OPML]`, `[RUN INGEST]`, per-source `[FETCH]`, raw error rows, `[DETAILS]`, delete confirmation, state export/import controls.
- Manual ingestion: real `[FETCH]` succeeded against a local RSS fixture; `[RUN INGEST]` exercised ok/error sources and updated `/doctor`.
- State portability: exported state contained active sources/rules/resonated items and did not expose runtime/receipt/sync/token keys.
- Search/Retrieval: `search sqlite` and `search duplicate`, lexical match/provenance lines, result count.
- `/doctor`: raw `<pre>` diagnostics, no charts/badges/dashboard.
- Mobile: feed, Inspector, Source Ledger, Search at `390x844`.

## Findings

### FR-01 P1 - `RESOFEED` Surface Menu Is Permanently Open And Not Keyboard-Reachable

Design requires a discreet product label menu where `TODAY` and `SOURCE LEDGER` appear only after opening the menu (`docs/DESIGN.md:372-374`, `docs/DESIGN.md:633`). App Shell accessibility also requires the `RESOFEED` menu summary to be keyboard reachable.

Actual:

- `.surface-nav` is rendered with `open`.
- The `summary` has `tabindex="-1"`.
- Click is prevented on the summary.
- `TODAY` and `SOURCE LEDGER` are visible immediately on desktop and mobile.

Evidence:

- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/02-desktop-feed-inspector.png`
- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/13-mobile-feed.png`
- Metrics: `surfaceNavOpen: true`, `visibleNavButtons: ["TODAY", "SOURCE LEDGER"]`, `summaryTabIndex: "-1"`
- Code: `web/src/routes/+page.svelte:396-397`

Reproduction:

1. Start the app and accept the owner token.
2. Observe the top command row before any menu action.
3. `TODAY` and `SOURCE LEDGER` are already visible.
4. Press `Tab`; focus does not reach the `RESOFEED` summary.

Expected:

- `RESOFEED` should be a reachable/toggleable menu summary or equivalent button.
- `TODAY` and `SOURCE LEDGER` should not be persistent top-level visible controls before the menu is open.

### FR-02 P1 - Feed Time Labels Repeat Out Of Chronological Group Order

Design requires soft inline time groups `TODAY`, `YESTERDAY`, `EARLIER`; labels should mark the first item in each group without disrupting the feed rhythm (`docs/DESIGN.md:491`).

Actual sequence from the fresh review fixture:

```text
TODAY > YESTERDAY > TODAY > EARLIER
```

This happened when a first-seen-only item was ranked after a yesterday item. The UI labels each transition, so the feed appears to reopen `TODAY` after `YESTERDAY`.

Evidence:

- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/02-desktop-feed-inspector.png`
- Metrics: `.checks.desktop_feed.timeLabels`
- Code: label insertion in `web/src/routes/components/Feed.svelte:49-50`
- Code: adjacent-item comparison in `web/src/routes/components/item-anatomy.ts:108-110`

Reproduction:

1. Seed items with mixed `published_at` and `first_seen_at` dates.
2. Open Today feed.
3. Observe `YESTERDAY`, followed later by another `TODAY` label.

Expected:

- Feed rows should either be ordered so groups are contiguous, or labels should be generated from an explicit grouped feed model.

### FR-05 P1 - Source-Level `[FETCH]` Buttons Lack Contextual Accessible Names

Design requires `[FETCH]` to be a named button, and the DOM contract gives `aria-label="Fetch source NYT"` as the expected shape (`docs/DESIGN.md:558`, `docs/DESIGN.md:575`).

Actual:

```json
["[FETCH]", "[FETCH]", "[FETCH]", "[FETCH]"]
```

All per-source fetch buttons expose the same accessible name. Screen-reader users cannot distinguish which source will be fetched.

Evidence:

- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/05-source-ledger-desktop.png`
- Metrics: `.checks.ledger.fetchNames`
- Code: `web/src/routes/components/SourceLedger.svelte:236`

Reproduction:

1. Open `SOURCE LEDGER`.
2. Inspect accessible names for `.bracket-action--fetch`.
3. Every source fetch action is named only `[FETCH]`.

Expected:

- Keep visible text `[FETCH]`, but add a contextual accessible name such as `aria-label="Fetch source: Fresh Runtime Feed"`.

### FR-04 P2 - Grouped Duplicate Source Item Is Searchable But Not Exposed From The Primary Story Surface

Design says grouped duplicate/story handling must preserve access to every source item and provenance (`docs/DESIGN.md:487`). Inspector anatomy also calls for a source-list disclosure for grouped stories (`docs/DESIGN.md:515`).

Actual:

- The duplicate item existed in storage and was retrievable via `search duplicate`.
- The primary feed/Inspector path did not expose the duplicate source item as a source list.

Evidence:

- Search screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/04-search-duplicate.png`
- Metrics: `duplicateVisibleInFeed: 0`, `searchFound: true`

Reproduction:

1. Seed two items with the same `story_key`, one with `duplicate_of_item_id`.
2. Open the primary story in Today/Inspector.
3. The grouped duplicate source is not listed there.
4. Run `search duplicate`; the item appears as a separate result.

Expected:

- The primary story Inspector should disclose grouped source items, not require search to discover them.

### FR-06 P2 - Source Ledger Rows Are Inflated By Always-Visible `[DETAILS]` Line

Design calls for a dense, flat Source Ledger row containing source name, URL, adjacent status, and right-aligned actions (`docs/DESIGN.md:529`). Raw diagnostics should not break Source Ledger geometry (`docs/DESIGN.md:554`), and invisible hitbox expansion should not increase row height (`docs/DESIGN.md:583`).

Actual:

- Collapsed `[DETAILS]` renders as a full-width second grid row for every source.
- Desktop row heights measured `97px`.
- Mobile row heights measured between `197px` and `301px`.

Evidence:

- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/05-source-ledger-desktop.png`
- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/15-mobile-ledger.png`
- Metrics: `.checks.ledger.rows[].rect.height`, `.checks.mobile_ledger.rowHeights`
- Code: `web/src/routes/components/SourceLedger.svelte:243-246`
- Code: grid/action sizing in `web/src/app.css:159-205`

Reproduction:

1. Open `SOURCE LEDGER` at 1280px or 390px width.
2. Measure each `.source-ledger-row`.
3. The collapsed diagnostic disclosure consumes a separate full-width line.

Expected:

- `[DETAILS]` should fit the row/action anatomy or use a compact disclosure pattern that does not inflate every row by default.

### FR-07 P2 - Source Ledger DOM Contract ID Differs From Design Contract

The manual ingest DOM contract pins:

```html
<section class="source-ledger" aria-labelledby="source-ledger-title">
  <h1 id="source-ledger-title">SOURCE LEDGER</h1>
```

See `docs/DESIGN.md:563-565`.

Actual:

```html
<section ... aria-labelledby="source-ledger-heading">
  <h2 id="source-ledger-heading">
```

Evidence:

- Metrics: `actual: "source-ledger-heading"`, `expected: "source-ledger-title"`
- Code: `web/src/routes/components/SourceLedger.svelte:204-206`

Reproduction:

1. Open `SOURCE LEDGER`.
2. Inspect `.source-ledger`.
3. `aria-labelledby` points to `source-ledger-heading`, not the design contract ID.

Expected:

- Match the documented DOM contract unless the design document is intentionally updated.

### FR-09 P2 - Mobile Feed Metadata Wraps Instead Of Staying A Flat Inline Line

Mobile design requires feed metadata to remain a flat inline monospace line (`docs/DESIGN.md:383`) and says mobile density should come from clamping, flat metadata, and restrained padding (`docs/DESIGN.md:489`).

Actual at `390x844`:

- First item metadata measured as a 48px-tall block.
- Child y positions were `[132, 148, 148, 148, 164, 164]`, proving three metadata lines.
- CSS explicitly wraps metadata and forces source onto its own line.

Evidence:

- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/13-mobile-feed.png`
- Metrics: `.checks.mobile_feed.metaChildYs`
- Code: `web/src/app.css:852-867`

Reproduction:

1. Set viewport to `390x844`.
2. Open Today feed.
3. Inspect the first row metadata; it wraps across multiple y positions.

Expected:

- Preserve a flat inline metadata line using truncation/ellipsis rather than multi-line wrapping.

### FR-10 P2 - Mobile `RESOFEED` Menu Is Also Permanently Open

This is the mobile manifestation of FR-01. The fixed bottom command bar shows `TODAY` and `SOURCE LEDGER` persistently instead of exposing them through a discreet menu.

Evidence:

- Screenshot: `.test-artifacts/ui-fresh-review-2026-05-15/13-mobile-feed.png`
- Metrics: `surfaceNavOpen: true`, `visibleNavButtons: ["TODAY", "SOURCE LEDGER"]`
- Code: `web/src/routes/+page.svelte:396-410`

Reproduction:

1. Set viewport to `390x844`.
2. Open app after token acceptance.
3. Observe `TODAY` and `SOURCE LEDGER` in the fixed command bar before any menu action.

Expected:

- Mobile should preserve the same low-chrome menu principle as desktop.

## Passes / Regressions Not Observed

- Owner token copy and raw rejection line match the design.
- First-use empty state renders the required static loop copy.
- Desktop Inspector did not duplicate the Resonate star.
- Active star uses both color and glyph change.
- Resonate hitboxes measured 44x44.
- Inspector partial extraction correctly shows `source text: RSS excerpt only` and `summary provenance: model-backed`.
- JSON-LD/script text from the source fixture did not leak into visible reading UI.
- Source Ledger did not expose a second visible URL paste field.
- Real `[FETCH]` and `[RUN INGEST]` flows executed against local fixtures; active labels appeared and results updated.
- OPML import completed with `folders flattened`.
- State export did not include receipt, runtime, sync, token, or OpenRouter metadata keys.
- Search results showed `match: lexical index` and `provenance: source-backed`.
- `/doctor` rendered raw `<pre>` diagnostics and no chart/badge/dashboard elements.
- Mobile Inspector used the full-screen route and included the explicit star action.
- No horizontal overflow was measured on mobile Source Ledger or mobile Search.

## Suggested Fix Order

1. Fix the `RESOFEED` menu interaction first. It is both a visible design miss and a keyboard accessibility regression.
2. Fix feed grouping/order before styling tweaks; repeated time labels undermine scan accuracy.
3. Add contextual `aria-label`s to per-source `[FETCH]` buttons.
4. Rework Source Ledger row/details anatomy to recover density.
5. Restore mobile feed metadata to a single flat inline line.
6. Decide whether to match the exact Source Ledger DOM contract or update `docs/DESIGN.md`.
