# ResoFeed UI Fresh Review - 2026-05-18

This is a fresh review after the latest fixes. It is not limited to the previous audit list. Scope covered:

- `docs/DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ui-preview.html`
- current frontend/runtime source under `web/src/`
- Browser inspection of `http://127.0.0.1:8080/`
- Computer Use check of the currently open desktop browser state

## Review Notes

- Recheck update: `http://127.0.0.1:8080/` was re-opened directly and confirmed as the ResoFeed shell (`main[aria-label="RESOFEED"]`, Steer input, Feed, Source Ledger DOM present). Earlier environment confusion is not counted as a product finding.
- Attempting to render the local `docs/ui-preview.html` through a browser `data:` URL was blocked by Browser Use policy, so preview-page findings are based on static source review plus the live ResoFeed runtime checks.

## Findings

### FR-01 P1 - Mobile `RESOFEED` utility menu opens off-screen

**Observed**

At a 390 x 844 mobile viewport on the ResoFeed `/source-ledger` state, tapping `RESOFEED` moves focus to `TODAY`, but the menu panel is almost entirely below the viewport. Browser measurement:

- `.surface-nav-menu`: `x=0`, `y=839`, `w=374`, `h=18`
- `.surface-operation-status`: `y=988`
- `.runtime-language-warning`: `y=1048`

Only a thin strip at the bottom is visible, so `TODAY`, `SOURCE LEDGER`, language, and reprocess controls are effectively unreachable visually.

**Expected**

`docs/DESIGN.md:461-463` requires a flat full-width utility sheet on narrow screens, visible menu items, focus moving to the first item, and Escape returning focus to `RESOFEED`.

**Likely cause**

The mobile override is less specific than the desktop rule:

- `web/src/app.css:546-559` defines `details.surface-nav .surface-nav-menu` with desktop absolute positioning.
- `web/src/app.css:1130-1133` defines `.surface-nav-menu` mobile positioning, but the selector loses specificity, so the desktop `inset-block-start` still wins.

**Reproduce**

1. Use a mobile viewport around `390 x 844`.
2. Navigate to the ResoFeed `/source-ledger` state.
3. Tap `RESOFEED`.
4. Observe focus moves to `TODAY` while the menu content renders below the bottom command bar.

### FR-02 P1 - Current-operation API/UI shape diverges from architecture and design

**Observed**

Captured runtime text:

`[INGESTING...] · op: ingest/all · actor:owner · phase:processing_items · 88/426 · processing feed items · since 18:19:16`

This does not match the design's canonical operation copy. The implementation also omits `actor_kind` from the frontend/backend contract:

- `docs/ARCHITECTURE.md:1028-1037` requires `actor_kind` in `CurrentOperationInfo`.
- `internal/resofeed/current_operation.go:15-23` has no `ActorKind` field.
- `web/src/lib/api-contract.ts:8-24` has no `actor_kind` field and only supports `ingest | fetch | reprocess`.
- `web/src/routes/+page.svelte:310-318` hard-codes `actor:owner` and formats `op: ingest/all`.

**Expected**

`docs/DESIGN.md:470` requires visible text shaped like:

`op: <kind> · actor:<actor> · phase:<phase> · <counts/message> · since <time>`

Allowed display kinds are `background_ingest`, `manual_ingest`, `source_fetch`, and `library_reprocess`; allowed actors are `background`, `human`, and `agent`.

**Reproduce**

1. Have a background ingest or manual ingest running.
2. Open the `RESOFEED` utility menu or Source Ledger.
3. Observe `op: ingest/all · actor:owner` instead of the canonical kind/actor vocabulary.

### FR-03 P1 - Source Ledger shows an ingest running, but `[RUN INGEST]` remains enabled/default

**Observed**

During an active current operation, the Source Ledger header status showed `[INGESTING...]`, but the adjacent global ingest button still rendered `[RUN INGEST]` and `disabled=false`.

Relevant implementation:

- `web/src/routes/components/SourceLedger.svelte:34` tracks only local `isRunningIngest`.
- `web/src/routes/components/SourceLedger.svelte:149-156` sets active state only after this button is clicked locally.
- `web/src/routes/components/SourceLedger.svelte:263` disables the button only from `isRunningIngest`, not from the shared current operation passed by the parent.
- `web/src/routes/+page.svelte:1004-1013` passes `currentOperationStatusText` but no structured running/disabled state.

**Expected**

`docs/DESIGN.md:636-638` says global ingest active state is `[INGESTING...]`, disabled, with current-operation detail in the header. `docs/ui-preview.html:797-800` models the same state with `[INGESTING...]`.

**Reproduce**

1. Let background ingest run, or open Source Ledger while `GET /api/runtime/operation` reports a running ingest.
2. Observe Source Ledger header status shows ingest running.
3. Observe the global button still says `[RUN INGEST]` and remains enabled.

### FR-04 P2 - Source Ledger bracket action hitboxes are still 36px high, below the 44px contract

**Observed**

Browser measurements on Source Ledger:

- `[RUN INGEST]`: `121 x 36`
- `[IMPORT OPML]`: `129 x 36`
- `[FETCH]`: `77 x 36`

CSS source:

- `web/src/app.css:257-263` sets `.bracket-action { min-height: 20px; padding: 8px; margin: -8px; }`.

The border box remains 36px high; negative margins do not create a 44px clickable area.

**Expected**

`docs/DESIGN.md:654` requires Source Ledger action buttons to keep stable 44px minimum hit targets. `docs/DESIGN.md:679` requires invisible hitbox enlargement without disrupting row height.

**Reproduce**

1. Open Source Ledger on desktop.
2. Inspect `.bracket-action--run-ingest`, `.bracket-action--import-opml`, or `.bracket-action--fetch`.
3. Compare `getBoundingClientRect().height` with the required 44px minimum.

### FR-05 P2 - Current-operation status is formatted too small and truncates useful detail

**Observed**

The utility menu current-operation line uses metadata typography and nowrap:

- `web/src/app.css:657-661`: `.surface-operation-status` uses `var(--rf-typography-metadata)` and `white-space: nowrap`.

On mobile Source Ledger, the visible status truncated before useful phase/count detail:

`[INGESTING...] · op: ingest/all · actor:owner...`

**Expected**

`docs/DESIGN.md:470-481` defines current-operation status as visible operational text using the `current-operation-status` component, including phase/count/message where available. The token in `docs/DESIGN.md` frontmatter sets current-operation status to chrome typography, not metadata typography.

**Reproduce**

1. Open the `RESOFEED` menu while an ingest is running.
2. Compare `.surface-operation-status` computed font to `var(--rf-typography-chrome)`.
3. Open Source Ledger at mobile width and observe the status truncates before phase/count.

### FR-06 P2 - Running current-operation status is only refreshed opportunistically

**Observed**

The frontend reads current operation once during shell load:

- `web/src/routes/+page.svelte:336-343` defines `refreshCurrentOperationIfAvailable`.
- `web/src/routes/+page.svelte:372` calls it once and does not await/poll.

During review, reload changed the observed count from `88/426` to `137/426`, showing the underlying operation was moving while the visible UI depended on reload/navigation for updated data.

**Expected**

`docs/DESIGN.md:481` says running updates use `aria-live="polite"` and should update no more frequently than useful phase/count changes. That implies the visible status should refresh while a long operation is running, without requiring a full page reload.

**Reproduce**

1. Start or wait for a long ingest.
2. Open the `RESOFEED` menu or Source Ledger and note the count.
3. Wait while the backend operation progresses.
4. Observe the status does not update until a reload or another explicit refresh path occurs.

### FR-07 P2 - `docs/ui-preview.html` embeds non-canonical "scenario" copy inside status components

**Observed**

`docs/ui-preview.html` puts preview-only labels inside operational status text:

- `docs/ui-preview.html:717`: `scenario running: op: background_ingest ...`
- `docs/ui-preview.html:718`: `scenario blocked after [REPROCESS LIBRARY]: err: reprocess blocked ...`
- `docs/ui-preview.html:798`: Source Ledger status also starts with `scenario running:`.
- `docs/ui-preview.html:821`: row conflict starts with `scenario blocked on [FETCH]:`.

**Expected**

`docs/DESIGN.md:470-479` defines canonical status/conflict copy without scenario prefixes. If the preview needs scenario annotations, they should be outside the component's user-visible operational text.

**Reproduce**

1. Open `docs/ui-preview.html` source.
2. Search for `scenario running` or `scenario blocked`.
3. Compare those strings with the canonical examples in `docs/DESIGN.md:478-479`.

### FR-08 P3 - `docs/ui-preview.html` Source Ledger DOM differs from the required DOM contract

**Observed**

`docs/ui-preview.html:797` renders the Source Ledger title as:

```html
<h2 class="source-ledger__title" id="source-ledger-title">SOURCE LEDGER</h2>
```

The required DOM contract in `docs/DESIGN.md:659-664` uses:

```html
<h1 id="source-ledger-title">SOURCE LEDGER</h1>
```

Also, `docs/ui-preview.html:799` uses `aria-disabled="true"` for `[INGESTING...]`, while the Source Ledger CSS usage contract in `docs/DESIGN.md:679` explicitly describes `.bracket-action[disabled]` for active Source Ledger actions.

**Expected**

The preview file should model the same DOM contract it declares as canonical, especially because it is used as a visual/implementation reference.

**Reproduce**

1. Open `docs/ui-preview.html`.
2. Inspect the Source Ledger header around `source-ledger-title`.
3. Compare it to `docs/DESIGN.md:656-679`.

## Non-Findings Rechecked

The fresh pass did not re-report several older issues because current source shows they were addressed:

- Utility menu now includes `NAV` and `OPERATIONS`.
- Reprocess warning copy is visible in the menu.
- Feed no longer performs source/title client-side deduplication; it sorts current items.
- Inspector fallback grouping now uses `story_key` and `duplicate_of_item_id`, not URL normalization.
- Mobile search controls now declare 44px minimum heights.
