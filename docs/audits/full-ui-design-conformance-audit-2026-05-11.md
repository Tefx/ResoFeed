# ResoFeed Full UI Design Conformance Audit

Date: 2026-05-11

Scope:

- Compared the live app at `http://127.0.0.1:8080/` against `docs/DESIGN.md`.
- Compared the implementation against `docs/ui-preview.html`.
- Used authenticated live UI review with a user-provided owner token.
- Reviewed relevant Svelte/CSS implementation files for structural causes.

Primary evidence surfaces:

- `docs/DESIGN.md`
- `docs/ui-preview.html`
- `web/src/routes/+page.svelte`
- `web/src/app.css`
- `web/src/routes/components/Feed.svelte`
- `web/src/routes/components/Inspector.svelte`
- `web/src/routes/components/SourceLedger.svelte`
- `web/src/routes/components/StatePortability.svelte`
- `web/src/routes/components/SearchRetrieval.svelte`
- `web/src/routes/components/OwnerTokenPrompt.svelte`

## Executive Summary

The current UI diverges materially from the design contract. The largest problems are not small color or spacing drifts; they are structural:

- The shell has accumulated document-like masthead chrome, a persistent surface nav, and extra route controls that are not in the workbench model.
- The feed is missing compact age metadata and useful summaries, so the primary triage surface has low information density.
- The Inspector reads like a raw scrape/debug view rather than a deliberate editorial payload.
- Source Ledger does not follow the required DOM, action labels, bracket-action styling, or row geometry.
- State Portability has become a separate settings-like section instead of terse Source Ledger actions.
- `/doctor` and Search surfaces break mobile/narrow layout expectations.
- `docs/ui-preview.html` is close in spirit, but it is not itself a perfect golden artifact.

Recommended repair order:

1. Feed metadata, summaries, time grouping, and row rhythm.
2. Inspector content cleaning, information hierarchy, and original-link behavior.
3. Source Ledger DOM/action contract and State Portability placement.
4. Shell chrome and responsive breakpoint correction.
5. Search and `/doctor` narrow-screen layout.
6. Preview document cleanup so it can serve as a reliable visual reference.

## Severity Legend

- P0: Breaks a core design/product contract or primary workflow.
- P1: Major UX/design mismatch visible in normal use.
- P2: Important polish, accessibility, or consistency issue.
- P3: Preview/documentation drift or lower-risk refinement.

## Shell / Chrome

### 1. Extra masthead chrome above the actual workbench

Severity: P1

Live UI shows a large `RESOFEED` masthead and `SOURCE LEDGER / DOCTOR / INSPECTOR` subtitle above the command/feed surface. The design says the app shell should have no persistent left navigation and that the top row should contain the Steer input plus a minimal product label. The masthead makes the app feel like a preview/document page rather than a dense analyst workbench.

Evidence:

- `web/src/routes/+page.svelte` renders `<header class="shell-masthead">`.
- `web/src/app.css` styles `.shell-masthead h1` with display typography.

Expected:

- First functional row should be the Steer command row with minimal `RESOFEED` label.
- Product-positioning subtitles should not render in the application chrome.

### 2. Persistent surface navigation is not part of the design model

Severity: P1

The live UI renders a full nav strip with `TODAY`, `SOURCE LEDGER`, `/doctor`, and `INSPECTOR` buttons. The design treats Inspect, Resonate, and Steer as the primary primitives; Source Ledger and `/doctor` are operational surfaces, not a SaaS-style tab bar. The nav consumes vertical space and changes the product feel from an archival workbench to a dashboard.

Evidence:

- `web/src/routes/+page.svelte` renders `<nav class="surface-nav">`.
- Live screenshots show the nav directly under the masthead.

Expected:

- Keep chrome terse and operational.
- Avoid persistent dashboard/tab navigation unless explicitly defined by `docs/DESIGN.md`.

### 3. Mobile/narrow shell keeps too much desktop chrome

Severity: P1

At a narrow viewport, the live UI still shows masthead, subtitle, nav row, feed heading, and bottom Steer area. This leaves much less space for feed triage and weakens the touch-safe compact mobile layout.

Expected:

- Mobile structure should be single-column feed, compact metadata, one-line abstracts, and Steer sticky near bottom or accessible through a fixed command affordance.
- Mobile should avoid preview/document chrome.

### 4. Responsive breakpoint is too narrow

Severity: P0

The design says Inspector becomes a route/full-screen detail view below 1080px. The implementation uses `max-width: 760px`, leaving a broad 761-1079px range where the split-pane layout can remain active despite being below the contract breakpoint.

Evidence:

- `web/src/routes/+page.svelte` uses `window.matchMedia('(max-width: 760px)')`.
- `web/src/app.css` uses `@media (max-width: 760px)`.
- `docs/ui-preview.html` uses `@media (max-width: 1079px)` for hiding Inspector.

Expected:

- Use the design breakpoint: below 1080px, Inspector should become a route/full-screen detail view.

### 5. Redundant `RESOFEED` brand text appears below mobile Steer

Severity: P2

In the live narrow UI, `RESOFEED` appears as a small line beneath the bottom Steer input. This reads like accidental footer text and adds chrome where mobile should be compact.

Evidence:

- `web/src/routes/+page.svelte` renders `<span class="contract-label">RESOFEED</span>` inside `.shell-command`.
- Mobile CSS changes `.shell-command` to one column, which pushes the label below the form.

Expected:

- Keep one minimal product label in the command row on desktop.
- Hide or reposition the label on mobile so it does not become a footer-like extra line.

## Owner Token Prompt

### 6. Owner Token Prompt includes extra explanatory copy

Severity: P2

The live prompt includes `Token stays in this browser as resofeed.ownerToken and is sent to local /api/* requests.` The design defines a terse owner-token gate: product label, `Enter owner token`, token input, submit action, and raw invalid-token line. The extra note is not part of the required anatomy and makes the gate feel like a login help screen.

Evidence:

- `web/src/routes/components/OwnerTokenPrompt.svelte` renders `owner-token-accessibility-note`.

Expected:

- Remove visible explanatory copy unless there is an accessibility-only reason.
- Keep the prompt terse and local, not account/login-like.

### 7. Submit control reads like a generic form button

Severity: P2

The disabled submit is a wide filled/disabled rectangular button. It does not match the workbench's text-action/bracket-action language and adds login-form weight to a local token gate.

Expected:

- Use terse action treatment consistent with the rest of the shell.
- Preserve accessibility and 44px hit targets without adding SaaS-like form weight.

## Feed

### 8. Feed has an extra standalone `TODAY` heading

Severity: P0

The design explicitly says time-group labels must be inline in the metadata row of the first item in a time group and must consume zero extra vertical height. The implementation renders a `TODAY` heading above the list and also renders `TODAY` inside the first item's metadata row.

Evidence:

- `web/src/routes/components/Feed.svelte` renders `<h2 id="feed-heading">TODAY</h2>`.
- First item conditionally renders `<span class="contract-time-label">TODAY</span>`.

Expected:

- Remove visible standalone group heading from the feed content.
- Keep `TODAY`, `YESTERDAY`, and `EARLIER` as inline right-aligned metadata labels on group-leading rows.

### 9. Feed metadata omits item age/time

Severity: P0

Live feed metadata shows `SRC: THE VERGE · FULL`. The design requires a compact line like `src: <host> · <age> · <full|partial|excerpt> · agent:<name>`. Missing age makes the feed less scannable and breaks the archival-index model.

Evidence:

- `web/src/routes/components/Feed.svelte` includes source and extraction status but not `published_at` or computed age.

Expected:

- Include compact age/time in every feed row.
- Use tabular/metadata typography.

### 10. Feed metadata is uppercased by styling

Severity: P2

The live UI shows metadata as `SRC: THE VERGE · FULL`. The design examples and preview use lower-case semantic labels such as `src:` and raw source host/title. All-caps metadata makes the index harsher and less like the specified archival metadata line.

Evidence:

- `.contract-label` applies `text-transform: uppercase`.
- Feed metadata uses `contract-label contract-feed-meta`.

Expected:

- Do not use `.contract-label` for feed metadata.
- Preserve lower-case semantic prefixes such as `src:` and `agent:`.

### 11. Feed summaries show `summary unavailable` even when detail data has usable text

Severity: P0

Authenticated feed rows all show `summary unavailable`, while the Inspector for the first item has summary and extracted detail. This severely reduces feed information density and prevents triage.

Evidence:

- Live feed shows repeated `summary unavailable`.
- Live Inspector shows a summary for the selected item.
- `Feed.svelte` falls back to `summary` or `core_insight`, but not to available detail/excerpt.

Expected:

- Feed rows should show a dense summary/core insight when available.
- If LLM summary fails, use cleaned feed excerpt or a terse raw fallback rather than a repeated unavailable line.

### 12. Desktop feed summary does not clamp to two lines

Severity: P1

The design requires feed summaries to clamp to two lines on desktop and one line on narrow/mobile. Current CSS only defines the one-line clamp inside the mobile media query. Desktop summaries can expand row height.

Evidence:

- `.contract-feed-summary` has typography/color only outside media.
- `-webkit-line-clamp: 1` appears only under `@media (max-width: 760px)`.

Expected:

- Desktop: two-line clamp.
- Narrow/mobile: one-line clamp.

### 13. Title-summary spacing is too loose

Severity: P2

The design requires a `4px` title-to-summary gap. Global paragraph margins produce a larger visual gap in feed rows, reducing density and breaking the specified proximity relationship.

Evidence:

- `.contract-region h1, h2, h3, p { margin-block: 0 var(--rf-space-sm); }`
- Feed title/summary do not override that margin to `4px`.

Expected:

- Override feed title and summary margins to match the design rhythm.

### 14. Row rhythm is not mathematically stable

Severity: P1

The design targets exact row rhythm with `12px` top padding, `11px` bottom padding, and a `1px` separator. In the live UI, repeated `summary unavailable`, multiline titles, global margins, and focus/route controls create visibly inconsistent row heights.

Expected:

- Keep feed item internal spacing tightly scoped.
- Ensure selected, hover, summary, and title wrapping do not add unintended layout shifts.

### 15. Time grouping only handles the first item

Severity: P1

The implementation only adds `TODAY` to the first item and does not calculate `YESTERDAY` or `EARLIER` group leaders. The design requires grouped feed lifecycle labels.

Evidence:

- `Feed.svelte` checks `items.findIndex(...) === 0`.

Expected:

- Compute time groups from item timestamps.
- Add right-aligned labels to each group-leading row.

### 16. Search results do not reuse feed item anatomy

Severity: P1

The design says Search and Retrieval results use feed-item anatomy with an extra match/provenance line. Current results are plain articles with headings and paragraphs, no selected/inspect behavior, no resonate action, and no feed metadata rhythm.

Evidence:

- `web/src/routes/components/SearchRetrieval.svelte` renders `.contract-search-result`, not `Feed`/feed-item anatomy.

Expected:

- Reuse the feed item structure for search results.
- Add match/provenance information without creating a separate visual grammar.

## Inspector

### 17. Inspector heading focus ring is visually too heavy

Severity: P2

On mobile/narrow Inspector, the heading receives a thick focus outline that looks like an error or selected field. The design requires focus to move to the detail heading for accessibility, but the visual treatment should not dominate the reading hierarchy.

Evidence:

- Global focus rule applies `outline: 3px solid`.
- Inspector heading has `tabindex="-1"` and receives focus.

Expected:

- Use a quieter heading focus style, or only show strong outline for keyboard-visible focus if appropriate.

### 18. Inspector exposes model status in the visible header

Severity: P1

Live Inspector metadata displays `model_latency_error`. This is operational diagnostic text, not a primary reading/provenance label. It belongs in `/doctor`, raw diagnostics, or a terse warning state, not the article header.

Evidence:

- `Inspector.svelte` renders `Model status: {item.model_status}` in the visible metadata row.

Expected:

- Keep Inspector header to source, extraction status, original link/provenance, and material user-facing labels.
- Move model diagnostics out of the primary reading header.

### 19. Inspector reading payload contains raw site boilerplate and ads

Severity: P0

The live first item's detail contains site nav/category text, author bio, commerce blocks, Related, Most Popular, and Advertiser Content. The design calls for editorial reading payload, verification, and provenance; the current content is a raw scrape dump.

Evidence:

- Live Inspector paragraph contains `Most Popular`, `Advertiser Content`, product price snippets, related links, and page boilerplate.

Expected:

- Clean extracted text before rendering as primary reading body.
- Keep raw payload available only in disclosure/debug surfaces.

### 20. Inspector information hierarchy is overloaded

Severity: P1

The Inspector renders `summary:`, `core insight:`, full extracted text, `why:`, `priority:`, `quality:`, `searchable text:`, duplicate/story provenance, and raw diagnostics. This reads like a model/debug report rather than a calm reading surface.

Evidence:

- `Inspector.svelte` renders priority, quality, searchable text, raw diagnostics, and multiple summary/detail blocks.

Expected:

- Primary flow: provenance header, title, original link/status, dense summary, readable body/excerpt, concise why-this-appeared when useful.
- Hide or remove internal ranking/search fields from the primary Inspector.

### 21. `original link` is visibly present but navigation is suppressed

Severity: P0

The Inspector renders an `original link`, but click/mouse/key handlers prevent navigation. This violates the design requirement that original links be plainly exposed.

Evidence:

- `Inspector.svelte` has `suppressOriginalNavigation`, `suppressOriginalNavigationKey`, and `keepOriginalLinkInApp`.

Expected:

- Let the original link open normally, preferably in a safe external/new tab behavior if desired.
- Do not replace the URL with `/#original-link`.

### 22. Mobile Inspector star is not visible in the first viewport

Severity: P1

The design says the Inspector duplicates the Resonate action only in mobile/single-column route where the feed star is hidden. In the live mobile Inspector, the star appears after the long content and is not visible in the first viewport.

Evidence:

- `Inspector.svelte` renders the mobile-route star after all content.

Expected:

- Put the mobile Inspector Resonate action near the header/top action row.

### 23. Raw provenance disclosure copy is too diagnostic-heavy

Severity: P2

`raw provenance diagnostics` is exposed as a visible disclosure. While raw provenance can exist, the current label and placement contribute to the debug-panel feel.

Expected:

- Use a calmer provenance/source disclosure if needed.
- Keep raw diagnostics out of the main reading path.

## Source Ledger

### 24. Source Ledger does not follow the required DOM contract

Severity: P0

`docs/DESIGN.md` provides a required DOM contract for manual ingest controls with `.source-ledger`, `.source-ledger__header`, `.source-ledger__list`, `.source-ledger__row`, `.source-ledger__actions`, and canonical bracket actions. The implementation uses different class names and row structure.

Evidence:

- `SourceLedger.svelte` uses `.source-ledger-head`, `.source-ledger-row`, `.source-ledger-copy`, `.manual-fetch-action`, and `.source-ledger-delete`.

Expected:

- Implement the required Source Ledger DOM contract unless there is a documented architecture/spec reason not to.

### 25. Manual ingest actions look like bordered buttons

Severity: P1

`[RUN INGEST]` and `[FETCH]` render with visible borders and boxed button styling. The design requires bracket actions to be transparent text buttons with enlarged invisible hitboxes, no border, no radius, no shadow, and terminal-like immediate inversion on hover/focus.

Evidence:

- `.manual-fetch-action` has `border-color`, `padding: 0 10px`, and visible button box.

Expected:

- Use `.bracket-action` styling from the design contract.

### 26. Delete action is `x` instead of `[DELETE]`

Severity: P0

The Source Ledger delete action renders as a red `x`. The design defines canonical uppercase bracket label `[DELETE]` and explicitly lists Source Ledger deletion as a terse bracket action.

Evidence:

- `SourceLedger.svelte` renders `>x</button>`.

Expected:

- Render `[DELETE]` with accessible label `Delete source: <name>`.

### 27. Import/export actions are lowercase and not bracket actions

Severity: P0

The footer renders `import OPML`, `export state`, and `import state`. The design requires canonical labels `[IMPORT OPML]`, `[EXPORT STATE]`, and `[IMPORT STATE]`.

Evidence:

- `SourceLedger.svelte` footer uses lowercase label/link text.

Expected:

- Use uppercase bracket labels exactly.
- Render as text buttons/links consistent with bracket-action styling.

### 28. Source Ledger shows a false imported status by default

Severity: P0

The live Source Ledger initially shows `imported 3 sources; folders flattened`, while the ledger has one source. This is incorrect user feedback and looks like stale fixture text.

Evidence:

- `SourceLedger.svelte` initializes `statusText = 'imported 3 sources; folders flattened'`.

Expected:

- Default status should be empty unless a real import occurred.
- Completion feedback should reflect actual result.

### 29. Source rows omit a stable URL column

Severity: P1

The live ledger row shows `The Verge · ok · last fetch: 16:46:31`. The design requires row fields: source name, URL, adjacent last fetch status/raw diagnostic, and right-aligned action block. URL is essential for source verification.

Evidence:

- `SourceLedger.svelte` compresses source data into `sourceLedgerSummary`.

Expected:

- Separate source name, URL, status, and actions into stable columns.

### 30. `last fetch` / `last ingest` labels are not canonical

Severity: P2

The design specifies UI display strings `last_fetch: HH:MM:SS` and `last_ingest: HH:MM:SS`. The live UI uses `last fetch:` with a space and sometimes does not show `last_ingest` in the header location.

Expected:

- Use exact canonical labels.

### 31. File input leaves a visible/occupied artifact

Severity: P1

In the live Source Ledger screenshot, a faint `Choose...` artifact appears near `import OPML`. The hidden file input still occupies visual space and leaks browser control text.

Evidence:

- `.source-ledger-file` uses `opacity: 0.01`, width/height 44px, and remains in layout.

Expected:

- Keep file input accessible without visible artifacts or layout pollution.

### 32. Disabled/active manual controls use filled disabled backgrounds

Severity: P1

Design requires disabled bracket actions to preserve transparent background, suppress hover/focus inversion, preserve opacity at `1`, and show raw active text. Current disabled controls inherit filled disabled button styling.

Evidence:

- Global `button:disabled` sets background to `surface-active`.
- `.manual-fetch-action:disabled` also sets background to `surface-active`.

Expected:

- Bracket-action disabled style should remain transparent.

### 33. Source Ledger action block baseline is unstable

Severity: P2

In the live narrow view, `[RUN INGEST]` floats high/right relative to the title and `[FETCH]` sits as a boxed element separated from row text. The visual geometry does not match the flat row contract.

Expected:

- Header should align title, last ingest, and run ingest action predictably.
- Row actions should align to the right and expand leftward when text changes.

## State Portability

### 34. State Portability is a settings-like separate section

Severity: P0

The design says State Portability is exposed through terse `[EXPORT STATE]` and `[IMPORT STATE]` actions reachable from Source Ledger. The implementation renders a separate `State Portability` section with heading, warning, explanatory copy, and filled buttons.

Evidence:

- `StatePortability.svelte` renders a standalone `<section>`.
- `+page.svelte` places it after `SourceLedger`.

Expected:

- Integrate export/import as terse actions in the Source Ledger action cluster/footer.
- Avoid settings-dashboard presentation.

### 35. State Portability action labels are lowercase and filled

Severity: P1

The live UI shows black filled buttons `export state` and `import state`. This violates the canonical bracket action labels and shape/style language.

Expected:

- `[EXPORT STATE]`
- `[IMPORT STATE]`
- transparent text/bracket action treatment.

### 36. Default State Portability explanatory copy is too verbose

Severity: P2

The implementation shows `bundle contains active Source Ledger rows, active steering policy rules, and currently resonated items only`. This is documentation-like copy and adds settings-panel weight.

Expected:

- Keep only required warning before import: `import replaces active sources, rules, and stars`.
- Use terse completion/error feedback.

## `/doctor`

### 37. `/doctor` long lines overflow/crop on narrow viewport

Severity: P0

The live `/doctor` output has long `openrouter:` lines clipped at the right edge of the dark diagnostic block. The design requires long lines to wrap and no horizontal-only loss on mobile.

Evidence:

- Live `/doctor` screenshot shows clipped `resolved_model=unk...` and source/id lines.

Expected:

- `white-space: pre-wrap` plus `overflow-wrap: anywhere` should apply reliably.
- The diagnostic block must not crop text.

### 38. `/doctor` renders above feed instead of as a clean operational surface

Severity: P1

After activating `/doctor`, the feed remains immediately below the diagnostic block. This feels like an inserted status panel rather than a distinct operational surface. It also pushes bottom Steer and feed into awkward partial visibility.

Expected:

- `/doctor` should be a raw diagnostic output surface with clear boundaries.
- Avoid mixing a long diagnostic output and feed list in the same narrow viewport unless explicitly designed.

### 39. `/doctor` item IDs are visually overwhelming

Severity: P2

Raw item/source ids are useful diagnostics, but the current formatting presents huge unwrapped IDs in a dense block. The output is technically raw, but hard to scan.

Expected:

- Preserve raw strings while wrapping and grouping lines readably.
- Do not create badges/charts, but maintain operational readability.

## Search

### 40. Search form breaks at narrow width

Severity: P0

At the live narrow viewport, labels and controls wrap into broken multi-column fragments: `Source filter`, `From date`, `To date`, checkbox, and result limit collide visually. It does not become a coherent single-column form.

Evidence:

- Live search screenshot shows label/control misalignment.
- `SearchRetrieval.svelte` has no dedicated responsive layout contract.

Expected:

- On narrow/mobile, form controls should stack in a predictable single column.
- Text must not collide or wrap into ambiguous labels.

### 41. Search title is document-like

Severity: P2

The visible title `Search and Retrieval` mirrors the design section name rather than operational product chrome. The design favors terse labels and raw task surfaces.

Expected:

- Use a shorter operational label such as `SEARCH` or a Steer-derived retrieval surface label, if the product keeps a dedicated search surface.

### 42. Search results lack Inspect/Resonate affordances

Severity: P1

Search results should follow feed item focus/open behavior and include enough provenance to verify a match. Current search results are static text articles with no visible Inspect or Resonate action.

Expected:

- Reuse feed item anatomy and behavior.

### 43. Search result dates use raw RFC3339

Severity: P2

Results display `2026-05-10T16:33:18Z`, while the feed uses compact time/age semantics. This is inconsistent with the feed's archival metadata style.

Expected:

- Use compact metadata formatting while preserving source-backed provenance.

### 44. Search results also show `summary unavailable`

Severity: P1

As with the feed, search results provide little match verification because summaries are unavailable for every result.

Expected:

- Use cleaned excerpt/core insight fallback.
- Show match/provenance line without sacrificing useful result text.

## Design Token / Styling Consistency

### 45. Global button styling conflicts with component contracts

Severity: P1

Global `button` and `button:disabled` styles impose filled primary/disabled button behavior across controls. This conflicts with bracket actions, Source Ledger controls, and low-chrome text actions.

Evidence:

- `web/src/app.css` global `button` rule.
- `button:disabled` rule.

Expected:

- Use component-specific button styling.
- Avoid global filled button defaults that leak into bracket-action surfaces.

### 46. Global focus rule is too broad and too strong

Severity: P2

Global focus applies 3px outline to buttons, inputs, links, and `[tabindex]`, including programmatically focused Inspector headings. This creates heavy visual artifacts.

Expected:

- Preserve accessible focus while tailoring non-interactive/programmatically focused headings.

### 47. Accent/focus color appears more often than intended

Severity: P2

Focus blue appears in heavy outlines and action text across the UI. The design says accent is scarce and focus should be accessible but not become a decorative palette.

Expected:

- Reserve accent for active Resonate.
- Keep focus visible but visually disciplined.

## `docs/ui-preview.html` Drift

### 48. Preview uses non-token hard-coded surface color

Severity: P3

`docs/ui-preview.html` uses `#fffdf5` for Inspector and mobile Steer background. This color is not in `docs/DESIGN.md` tokens.

Evidence:

- `.inspector { background: #fffdf5; }`
- `.mobile-steer { background: #fffdf5; }`

Expected:

- Use defined tokens, likely `surface` or `background`.

### 49. Preview mobile Inspector title size differs from design

Severity: P3

Preview mobile Inspector title is `24px/32px`, but the design says mobile Inspector/detail title uses `typography.inspector-title`, which is `28px/32px`.

Evidence:

- `.mobile-detail h2` in `docs/ui-preview.html`.

Expected:

- Use `28px/32px` for mobile Inspector title.

### 50. Preview mobile headers include explanatory labels

Severity: P3

Preview mobile cards show `mobile feed` and `mobile inspector`. These are useful for the preview artifact, but they should not be interpreted as product chrome.

Expected:

- If the preview remains a reference artifact, annotate this as preview-only or remove labels from the visual golden state.

### 51. Preview feed marker/padding model is slightly off-token

Severity: P3

Preview feed rows use `padding: 12px 0 11px 12px` with a `3px` border-left marker. The component token says feed item padding is `12px 12px 11px 0`, with marker handled without layout shift.

Expected:

- Align preview geometry with the design contract.

### 52. Preview Source Ledger heading level differs from required DOM example

Severity: P3

The required DOM contract in `docs/DESIGN.md` shows `<h1 id="source-ledger-title">SOURCE LEDGER</h1>`, while `docs/ui-preview.html` uses `h2`.

Expected:

- Decide whether the DOM contract should require `h1` or whether nested surfaces may use `h2`, then align preview and implementation.

## Notes On Confirmed Good Direction

- The palette broadly uses the intended stone/zinc neutrals.
- The active Resonate star uses the correct amber accent and star shape change.
- Feed rows use horizontal rules rather than cards.
- The First-Use Empty State text matches the required plain-language lines.
- `/doctor` is raw text rather than a dashboard, though wrapping/layout need repair.
- Search remains lexical/metadata-oriented and does not introduce semantic/RAG behavior.

