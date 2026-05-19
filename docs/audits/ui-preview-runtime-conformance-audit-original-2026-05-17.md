# ResoFeed UI Preview Runtime Conformance Audit

Date: 2026-05-17

Scope:

- Compared the live UI at `http://127.0.0.1:8080` against `docs/DESIGN.md`.
- Compared live UI behavior and computed layout against `docs/ui-preview.html`.
- Used Browser automation for live DOM snapshots, screenshots, interaction, and CSS measurements.
- Used Computer Use to inspect the visible Arc browser tab for `127.0.0.1:8080`.
- Attempted Chrome plugin automation because the audit request named `@chrome`; Chrome automation was not available in this session.
- No code changes were made during the audit.

Owner token used for reproduction:

```text
<redacted owner token>
```

## Evidence

Primary sources:

- `docs/DESIGN.md`
- `docs/ui-preview.html`
- `web/src/app.css`
- `web/src/routes/+page.svelte`
- `web/src/routes/components/Feed.svelte`
- `web/src/routes/components/Inspector.svelte`
- `web/src/routes/components/SourceLedger.svelte`
- `web/src/routes/components/SearchRetrieval.svelte`
- `web/src/routes/components/FirstUseEmptyState.svelte`

Captured screenshots from the audit session:

- `/private/tmp/resofeed-ui-audit/resofeed-first-use.png`
- `/private/tmp/resofeed-ui-audit/resofeed-utility-menu.png`
- `/private/tmp/resofeed-ui-audit/resofeed-source-ledger-doctor-error.png`

Chrome plugin status:

```text
agent.browsers.get("extension")
=> Browser is not available: extension
```

Read-only extension checks found Google Chrome installed, the Codex Chrome Extension installed and enabled, and the native host manifest correct. The failure was a browser automation backend availability issue, not a ResoFeed UI result. Computer Use was used successfully against Arc and confirmed the visible `127.0.0.1:8080` tab state.

## Reproduction Method

1. Start or use an existing ResoFeed server at:

```text
http://127.0.0.1:8080
```

2. Open the app in a browser.

3. If the Owner Token Prompt appears, enter:

```text
<redacted owner token>
```

4. Compare the rendered app against `docs/ui-preview.html` at a desktop viewport close to `1280x720`.

5. Open the `RESOFEED` menu and inspect the menu panel.

6. Open `SOURCE LEDGER` from the menu.

7. Type `/doctor` in Steer and click the visible submit/apply control.

8. Use a narrow viewport around `390x844` to check mobile/narrow behavior.

9. Inspect computed styles and DOM for the selectors named in the findings below.

Notes:

- Browser automation could not directly open `file:///Users/tefx/Projects/ResoFeed/docs/ui-preview.html` because the Browser URL policy blocks `file://` access. The preview comparison below uses the checked-in preview source and runtime measurements.
- Terminal `curl` from the sandbox could not connect to `127.0.0.1:8080`, while browser surfaces could render the app. Browser-visible UI evidence is therefore authoritative for this audit.

## Severity

- P0: Product/design contract break that blocks or corrupts a primary workflow.
- P1: Major visible UI divergence from `DESIGN.md` or `ui-preview.html`.
- P2: Accessibility, geometry, density, or consistency issue.
- P3: Lower-risk documentation/preview drift or polish issue.

## Findings

### F01: Top chrome uses an oversized masthead instead of preview command-bar hierarchy

Severity: P1

Expected:

- `docs/DESIGN.md` says desktop top row contains the Steer input and minimal product label.
- `docs/ui-preview.html` models `.command-bar` with the Steer control as the primary horizontal element and a small right-side `RESOFEED` menu trigger.

Actual:

- The live app renders a 32px serif `RESOFEED` heading at the left of the command row.
- Measured runtime layout: `.contract-brand` was about `210px` wide and `40px` high; Steer input started around x=284 in a 1280px viewport.
- This makes the brand visually dominate the command surface.

Source:

- `web/src/routes/+page.svelte` renders `<h1 class="contract-brand">RESOFEED</h1>`.
- `web/src/app.css` styles `.contract-brand` with `var(--rf-typography-display)`.

Reproduce:

1. Open `http://127.0.0.1:8080`.
2. Authenticate if needed.
3. Observe the top command row.
4. Compare against `docs/ui-preview.html` `.command-bar`.

### F02: `RESOFEED` utility menu lacks `NAV` and `OPERATIONS` micro-headings

Severity: P1

Expected:

- `docs/DESIGN.md` defines two compact utility menu groups: `NAV` and `OPERATIONS`.
- `docs/ui-preview.html` renders `.utility-label` nodes for `NAV` and `OPERATIONS`.

Actual:

- The live menu shows only `TODAY`, `SOURCE LEDGER`, `LANG: EN`, and `[REPROCESS LIBRARY]`.
- There are no visible group labels.

Source:

- `web/src/routes/+page.svelte` renders `.surface-nav-menu` buttons directly and does not render `NAV` / `OPERATIONS` labels.

Reproduce:

1. Open the app.
2. Click the `RESOFEED` summary/menu trigger.
3. Compare the opened menu with `docs/ui-preview.html` lines around the `.utility-menu` markup.

### F03: Reprocess warning copy is visually hidden in the utility menu

Severity: P1

Expected:

- `docs/DESIGN.md` requires visible warning copy near `[REPROCESS LIBRARY]`: existing readable item content will be rewritten and source identifiers remain unchanged.
- `docs/ui-preview.html` shows this warning as visible `.runtime-warning` text.

Actual:

- The live `.runtime-language-warning` is clipped to `1px x 1px` with `clip: rect(0, 0, 0, 0)` and `overflow: hidden`.
- Runtime text exists in the accessibility/DOM text but is not visible to sighted users.

Source:

- `web/src/routes/+page.svelte` renders `.runtime-language-warning`.
- `web/src/app.css` hides `.runtime-language-warning`.

Reproduce:

1. Open the `RESOFEED` menu.
2. Look for the required reprocess warning under `OPERATIONS`.
3. Inspect `.runtime-language-warning`; verify it is visually clipped.

### F04: Utility menu typography is smaller than preview chrome

Severity: P2

Expected:

- The preview menu uses 14px/20px chrome typography for actions.

Actual:

- Runtime menu buttons measured as 12px/16px metadata typography.
- This makes the menu feel like dense metadata rather than the preview's operational utility panel.

Source:

- `web/src/app.css` styles `details.surface-nav button` with `var(--rf-typography-metadata)`.

Reproduce:

1. Open the `RESOFEED` menu.
2. Inspect computed style for `.surface-nav-menu button`.
3. Compare with `.utility-menu` / `.bracket-action` styles in `docs/ui-preview.html`.

### F05: Utility menu focus behavior is not visibly aligned to the design contract

Severity: P2

Expected:

- Opening the menu should move focus to the first item.
- `Escape` should close the menu and return focus to `RESOFEED`.

Actual:

- The implementation uses native `<details>` disclosure and tab index toggling, but no explicit focus movement to first item is visible in `+page.svelte`.

Source:

- `web/src/routes/+page.svelte` menu `ontoggle` only syncs `surfaceMenuOpen`.

Reproduce:

1. Focus `RESOFEED` with keyboard.
2. Open the menu.
3. Check whether focus moves to `TODAY`.
4. Press `Escape` and verify whether focus returns to `RESOFEED`.

### F06: Source Ledger heading is visually oversized and off-token

Severity: P1

Expected:

- `docs/DESIGN.md` Source Ledger uses chrome typography.
- `docs/ui-preview.html` uses compact `.source-ledger__title`: `14px/20px`, weight 500, letter-spacing `0.08em`.

Actual:

- Runtime Source Ledger heading measured as `700 28px / 20px` IBM Plex Mono.
- The title appears as a large block heading rather than a compact ledger title.

Source:

- `web/src/routes/components/SourceLedger.svelte` renders an `h1`.
- Global heading rules affect `.source-ledger__title`.

Reproduce:

1. Open `SOURCE LEDGER`.
2. Inspect `#source-ledger-title`.
3. Compare computed style against `docs/ui-preview.html` `.source-ledger__title`.

### F07: Source Ledger surface background is transparent instead of `surface`

Severity: P1

Expected:

- `docs/DESIGN.md` Source Ledger component background is `{colors.surface}`.
- `docs/ui-preview.html` Source Ledger is a surface panel.

Actual:

- Runtime `.source-ledger` measured `background: rgba(0, 0, 0, 0)`.
- The surface blends into the base canvas and loses panel hierarchy.

Source:

- `web/src/app.css` lacks a surface background on `.source-ledger` / `.contract-source-ledger`.

Reproduce:

1. Open Source Ledger.
2. Inspect `.source-ledger`.
3. Compare computed background to token `#FBF8EF`.

### F08: Source Ledger header layout does not match preview/tool row structure

Severity: P1

Expected:

- Preview has a Source Ledger header with title, status, `[RUN INGEST]`.
- Preview puts `[IMPORT OPML]`, `[EXPORT STATE]`, and `[IMPORT STATE]` in a separate `.source-ledger__tools` action row.

Actual:

- Runtime puts `[IMPORT OPML]` in the header action cluster beside `[RUN INGEST]`.
- `[EXPORT STATE]` / `[IMPORT STATE]` are in footer, not the preview-style tool strip.

Source:

- `web/src/routes/components/SourceLedger.svelte` header includes `[IMPORT OPML]`; footer includes state portability.

Reproduce:

1. Open Source Ledger.
2. Compare action placement to `docs/ui-preview.html` `.source-ledger__header` and `.source-ledger__tools`.

### F09: `[RUN INGEST]` and `[IMPORT OPML]` wrap into two visual lines

Severity: P1

Expected:

- Bracket actions should be stable, monospace, text-only controls with fixed hitboxes.
- The labels should remain readable and not break their own geometry.

Actual:

- At 1280px desktop, `[RUN INGEST]` appears split as `[RUN` / `INGEST]`.
- `[IMPORT OPML]` appears split as `[IMPORT` / `OPML]`.

Source:

- `web/src/app.css` sets narrow fixed widths: `.bracket-action--run-ingest { width: 15ch; }`, `.bracket-action--import-opml { width: 16ch; }`, combined with 12px uppercase letter spacing and button padding.

Reproduce:

1. Open Source Ledger at about `1280x720`.
2. Observe the top-right actions.
3. Inspect `.bracket-action--run-ingest` and `.bracket-action--import-opml` bounding boxes.

### F10: Source Ledger status typography is too small

Severity: P2

Expected:

- `components.source-ledger-status` uses chrome typography: 14px/20px.

Actual:

- Runtime `.source-ledger__status` uses metadata-scale styling and measured about 12px/16px.

Source:

- `web/src/app.css` sets `.source-ledger__status` to `var(--rf-typography-metadata)`.

Reproduce:

1. Open Source Ledger.
2. Inspect `last_ingest: not_run`.
3. Compare computed font to `docs/DESIGN.md` component token.

### F11: Global API errors render as persistent top strips

Severity: P1

Expected:

- `docs/DESIGN.md` says raw diagnostics belong in `/doctor` or adjacent affected surfaces.
- Current operation/error state should not become a persistent global dashboard strip.

Actual:

- Runtime shows `err: internal: unexpected api error` directly under the command row.
- Submitting `/doctor` duplicated the same error line.

Source:

- `web/src/routes/+page.svelte` renders `apiError` and steer errors as `.shell-status` near the top of the shell.

Reproduce:

1. Open the app with the same runtime state used in the audit.
2. Observe `err: internal: unexpected api error` below the command row.
3. Type `/doctor` in Steer and click `apply`.
4. Observe duplicate error lines.

### F12: `/doctor` command fails to open the diagnostics surface in the audited runtime

Severity: P0

Expected:

- `/doctor` should route to a raw diagnostics surface and render text/plain diagnostic output.

Actual:

- Typing `/doctor` showed the route preview.
- Clicking `apply` did not render `.doctor-surface`.
- URL remained on `/source-ledger`, and another `err: internal: unexpected api error` appeared.

Source:

- `web/src/routes/+page.svelte` `/doctor` branch depends on successful `apiClient().doctor()` before rendering doctor state.

Reproduce:

1. Open Source Ledger.
2. Type `/doctor` in Steer.
3. Click `apply`.
4. Verify no `/doctor` diagnostics panel appears and the global error repeats.

### F13: Steer submit affordance uses lowercase generic button copy

Severity: P2

Expected:

- Steer submit affordance appears only when text exists, but should fit the low-chrome/bracket-action language.

Actual:

- The live submit button reads `apply` in lowercase and uses a generic bordered button style.
- Route preview separately shows `[APPLY]`, creating two different apply controls.

Source:

- `web/src/routes/+page.svelte` renders `{steerFeedback.kind === 'submitting' ? 'applying' : 'apply'}` for the form submit button.

Reproduce:

1. Type any command in Steer.
2. Observe the new submit button next to the input.
3. Compare to bracket actions in Source Ledger and preview.

### F14: Route preview creates an extra command strip while typing

Severity: P2

Expected:

- Idle route preview should not reserve visible height.
- Active preview should remain terse and not feel like a persistent top status band.

Actual:

- Typing `/doctor` creates a full-width 44px strip below the command row.
- Combined with global error strips, this pushes primary content down and makes the shell feel status-heavy.

Source:

- `web/src/app.css` `.steer-route-preview` uses `min-height: 44px` when active.

Reproduce:

1. Type `/doctor` or an RSS URL in Steer.
2. Observe the full-width preview strip.
3. Compare with low-chrome preview anatomy.

### F15: First-use empty state includes a visible `First use` heading in accessibility snapshot

Severity: P3

Expected:

- The first-use empty state should show only the four specified plain-language lines in the normal shell.

Actual:

- Visual screenshot showed the four lines, but the Browser accessibility snapshot exposed `First use` as a heading.
- This is lower risk because it is visually hidden, but it adds a concept not present in the user-visible contract.

Source:

- `web/src/routes/components/FirstUseEmptyState.svelte` renders visually hidden `h2` with text `First use`.

Reproduce:

1. Open an empty/no-source runtime.
2. Capture an accessibility snapshot or inspect DOM.
3. Note hidden heading `First use`.

### F16: Feed performs client-side item deduplication

Severity: P1

Expected:

- `docs/DESIGN.md` says grouped duplicate/story UI may appear only from authoritative backend grouping fields.
- The frontend must not infer grouping or hide source items by client-side heuristics.

Actual:

- `Feed.svelte` filters visible items by `source_id + title`.
- This can hide distinct RSS items with the same title from the same source.

Source:

- `web/src/routes/components/Feed.svelte` function `dedupeVisibleItems()`.

Reproduce:

1. Provide two API feed items with the same `source_id` and `title`, but different IDs/URLs and no `story_key` or `duplicate_of_item_id`.
2. Load Today feed.
3. Observe only one rendered row.

### F17: Inspector infers grouping via normalized URL fallback

Severity: P1

Expected:

- Inspector grouped-source disclosure must rely only on backend `story_key`, `duplicate_of_item_id`, or `provenance.grouped_source_items`.
- URL normalization, fragment stripping, and host/path fallback grouping are forbidden.

Actual:

- `sameRuntimeGroup()` compares normalized selected URLs and candidate URLs.
- It strips search and often hash fragments, except synthetic `#entry_` fragments.

Source:

- `web/src/routes/components/Inspector.svelte` functions `normalizedGroupingUrl()` and `sameRuntimeGroup()`.

Reproduce:

1. Provide two item summaries with related URLs but no authoritative grouping fields.
2. Select one item.
3. Inspector can infer grouped source items from URL similarity.

### F18: Inspector renders a hard-coded quality claim

Severity: P1

Expected:

- Inspector evidence should be based on item data/provenance.
- Product must not invent source quality claims.

Actual:

- Inspector always renders: `quality: source quality is high; complete, attributed, and extracted`.
- This is hard-coded and not tied to backend item facts.

Source:

- `web/src/routes/components/Inspector.svelte` hard-coded quality paragraph.

Reproduce:

1. Select any item in the Inspector.
2. Observe the quality line.
3. Repeat with an item whose `value_tier` or extraction status does not justify the claim.

### F19: Inspector mixes detail API failure with readable payload

Severity: P1

Expected:

- Detail loading/failure should be cleanly separated from item content.
- Raw error should not pollute the reading hierarchy.

Actual:

- In the audited runtime, Inspector displayed `err: internal: unexpected api error` and still rendered title/summary payload.
- This creates a confusing hierarchy: a failed detail request appears beside apparently valid reading content.

Source:

- `web/src/routes/+page.svelte` keeps `selectedItemSummary` as fallback and passes `inspectorError` to `Inspector`.
- `Inspector.svelte` renders `error` and `item` content in the same pane.

Reproduce:

1. Use an item list where `GET /api/feed/today` succeeds but `GET /api/items/{id}` fails.
2. Select the item.
3. Observe error plus content rendered together.

### F20: Mobile search controls shrink below 44 CSS px touch target

Severity: P1

Expected:

- `docs/DESIGN.md` requires touch targets at least 44 CSS px on web/mobile web.

Actual:

- In mobile CSS, search secondary filter summary is `min-height: 36px`.
- Search secondary inputs/selects are also set to `min-height: 36px`.

Source:

- `web/src/app.css` mobile rules for `.search-secondary-filters summary`, `.search-secondary-grid input`, and `.search-secondary-grid select`.

Reproduce:

1. Set viewport to about `390x844`.
2. Open search.
3. Inspect secondary filter summary and controls.
4. Verify their computed min-height is 36px.

### F21: Mobile feed metadata can overflow into the 44px Resonate hit area

Severity: P1

Expected:

- Feed metadata should remain flat and one-line without colliding with the independent 44px star column.

Actual:

- Mobile CSS intentionally sets `.contract-feed-meta` and child spans to `overflow: visible` and `white-space: normal`.
- Long source names can extend beyond the text column and into the star column.

Source:

- `web/src/app.css` mobile `.contract-feed-meta` deviation block.

Reproduce:

1. Set viewport to about `390x844`.
2. Render a feed item with a very long source title.
3. Inspect whether the metadata visual box reaches the star column.

### F22: Search surface uses duplicate generic submit controls

Severity: P2

Expected:

- Search/retrieval surface should stay aligned with ResoFeed's low-chrome action language.

Actual:

- Search renders a lowercase `search` submit button and an additional `submit search` alias button.
- The duplicate controls read like generic form UI, not the preview's terse operational chrome.

Source:

- `web/src/routes/components/SearchRetrieval.svelte` renders both buttons in `.search-primary-row`.

Reproduce:

1. Open Search via Steer command such as `search sqlite`.
2. Observe the search form primary row.

### F23: State import exposes `Choose state JSON` as visible form UI

Severity: P2

Expected:

- State portability is two terse actions `[EXPORT STATE]` and `[IMPORT STATE]` plus the warning `import replaces active sources, rules, and stars`.
- It should not feel like a file-management/settings form.

Actual:

- Source Ledger footer shows `Choose state JSON` next to state actions.
- This adds visible file-form language not present in the preview.

Source:

- State portability component rendered in Source Ledger footer. Inspect `web/src/routes/components/StatePortability.svelte`.

Reproduce:

1. Open Source Ledger.
2. Inspect the footer state portability controls.
3. Observe visible `Choose state JSON`.

### F24: Source Ledger empty state and panel density diverge from preview

Severity: P2

Expected:

- Source Ledger should be dense but legible, with header/tools/list/footer maintaining archival ledger rhythm.

Actual:

- Empty Source Ledger occupies a wide, mostly blank surface.
- The huge title, wrapped header actions, footer actions, and transparent panel combine into a sparse page rather than the preview's compact ledger panel.

Source:

- `web/src/routes/components/SourceLedger.svelte`
- `web/src/app.css`

Reproduce:

1. Open Source Ledger with no active sources.
2. Compare the first viewport to `docs/ui-preview.html` Source Ledger preview.

### F25: Current operation text shape does not match canonical copy

Severity: P2

Expected:

- Canonical operation copy shape: `op: <kind> · actor:<actor> · phase:<phase> · <counts/message> · since <time>`.

Actual:

- Runtime formatter emits `current operation: ingest/all · phase: ... · msg: ...`.
- It omits canonical `op:` and `actor:` shape.

Source:

- `web/src/routes/+page.svelte` functions `operationDetails()` and `formatContextualOperation()`.

Reproduce:

1. Trigger manual ingest or reprocess pending/conflict state.
2. Observe the operation status text.
3. Compare to `docs/DESIGN.md` Current Operation Status section.

## Summary

The largest gaps are concentrated in four areas:

1. Top chrome and utility menu hierarchy drift from `docs/ui-preview.html`.
2. Source Ledger geometry and typography are off-token, especially heading size, action wrapping, surface background, and tool placement.
3. Runtime error and `/doctor` handling currently create persistent global error strips and fail to render the expected diagnostics surface in the audited state.
4. Feed/Inspector still contain behavior that violates authoritative grouping/provenance rules: client-side dedupe, URL-fallback grouping, and a hard-coded quality claim.

Recommended remediation order:

1. Fix `/doctor` and global error placement first, because it affects operational truth and repeatability.
2. Align Source Ledger with preview anatomy and typography.
3. Rework the top command row and utility menu to match preview grouping.
4. Remove client-side dedupe, URL-fallback grouping, and hard-coded Inspector quality copy.
5. Repair mobile touch target and metadata/star collision risks.
