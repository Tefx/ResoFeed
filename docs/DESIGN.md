---
version: alpha
name: ResoFeed Analyst Workbench System
description: "Single-tenant RSS intelligence interface: low-fatigue archival workbench, editorial reading payload, lightweight Steer input, durable local feed access, flat Source Ledger."
colors:
  primary: "#24231E"
  background: "#F3F0E7"
  background-dark: "#171A18"
  surface: "#FBF8EF"
  surface-active: "#ECE6D8"
  surface-dark: "#20231F"
  text: "#24231E"
  text-dark: "#E8E2D4"
  muted: "#68645B"
  muted-dark: "#B8B1A2"
  border: "#D7D0C0"
  border-dark: "#3B3E37"
  accent: "#7A4600"
  accent-contrast: "#FFF2D0"
  focus: "#2F6F7E"
  focus-dark: "#8ED1DD"
  danger: "#9E2A20"
  warning: "#7E5B00"
  success: "#276749"
typography:
  chrome: "500 14px/20px 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
  metadata: "500 12px/16px 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
  feed-title: "600 18px/24px Newsreader, Georgia, 'Times New Roman', serif"
  feed-summary: "400 14px/20px Newsreader, Georgia, 'Times New Roman', serif"
  payload: "400 18px/28px Newsreader, Georgia, 'Times New Roman', serif"
  section-title: "600 24px/32px Newsreader, Georgia, 'Times New Roman', serif"
  inspector-title: "600 28px/32px Newsreader, Georgia, 'Times New Roman', serif"
  display: "700 32px/40px Newsreader, Georgia, 'Times New Roman', serif"
rounded:
  none: "0px"
  xs: "2px"
  sm: "4px"
  md: "8px"
  pill: "999px"
spacing:
  none: "0px"
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  row: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  column: "64px"
components:
  app-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.chrome}"
    width: "100%"
    rounded: "{rounded.none}"
  steer-input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: "44px"
  steer-input-focused:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    rounded: "{rounded.sm}"
  steer-input-submitting:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    rounded: "{rounded.sm}"
  feed-item:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.feed-title}"
    padding: "{spacing.row} {spacing.row} 11px 0"
    rounded: "{rounded.none}"
  feed-item-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.feed-title}"
    padding: "{spacing.row} {spacing.row} 11px 0"
    rounded: "{rounded.none}"
  feed-item-focused:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.text}"
    typography: "{typography.feed-title}"
    padding: "{spacing.row} {spacing.row} 11px 0"
    rounded: "{rounded.none}"
  feed-item-selected:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.text}"
    typography: "{typography.feed-title}"
    padding: "{spacing.row} {spacing.row} 11px 0"
    rounded: "{rounded.none}"
  feed-summary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.feed-summary}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  feed-metadata-line:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  source-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
    rounded: "{rounded.xs}"
    padding: "{spacing.xs}"
  resonate-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    rounded: "{rounded.none}"
    size: "44px"
  resonate-button-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-contrast}"
    typography: "{typography.chrome}"
    rounded: "{rounded.none}"
    size: "44px"
  inspector-pane:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.payload}"
    padding: "{spacing.xl}"
    rounded: "{rounded.none}"
  source-ledger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  state-portability:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  state-portability-importing:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  state-portability-warning:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  owner-token-prompt:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.xl}"
    rounded: "{rounded.none}"
  first-use-empty:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.xl}"
    rounded: "{rounded.none}"
  steering-receipt:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.xs}"
  diagnostic-output:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-dark}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  raw-error-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  feedback-error-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  raw-warning-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  raw-success-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  app-shell-dark:
    backgroundColor: "{colors.background-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.chrome}"
    width: "100%"
    rounded: "{rounded.none}"
  dark-panel:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.muted-dark}"
    typography: "{typography.metadata}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  rule-line:
    backgroundColor: "{colors.border}"
    textColor: "{colors.text}"
    typography: "{typography.metadata}"
    height: "1px"
  dark-rule-line:
    backgroundColor: "{colors.border-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.metadata}"
    height: "1px"
  dark-focus-marker:
    backgroundColor: "{colors.focus}"
    textColor: "{colors.surface}"
    typography: "{typography.metadata}"
    height: "3px"
  focus-marker-dark:
    backgroundColor: "{colors.focus-dark}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    height: "3px"
  display-empty:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.display}"
    padding: "{spacing.xxl}"
    rounded: "{rounded.none}"
---

## Overview
ResoFeed is a single-tenant RSS intelligence tool for one human owner and delegated agents. The interface is an analyst's workbench: archival index chrome around a calm editorial payload. It does not protect the user from their own subscriptions, does not create queue-clearing rituals, and does not hide high-volume sources behind paternalistic automation.

Primary surfaces covered by this contract:

- owner-token prompt before API calls;
- first-use empty state inside the standard shell;
- unified time-grouped feed;
- right-side or full-screen Inspector for item detail;
- Steer input for natural-language correction, RSS URL subscription, and `/doctor` diagnostics;
- flat Source Ledger for viewing/deleting sources, importing flattened OPML, and reaching state export/import actions;
- search and retrieval surfaces;
- agent receipt/provenance markers.

Density target is **dense but legible**: metadata is compact like an archival index; article content breathes. Emotional effect is precise, low-fatigue, and tool-like rather than friendly SaaS. Assumption: the first implementation targets responsive web/mobile web; native shells may adapt platform chrome while preserving the same primitives.

Product copy rule: internal design metaphors and principles are not user-visible slogans. Do not render “Analyst’s Workbench,” “Archival Index,” “low-fatigue,” “single-tenant,” or “no SaaS chrome” in the app UI. The product chrome should use only operational labels such as `RESOFEED`, `TODAY`, `YESTERDAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`, and raw status strings.
## Colors

The color system is nearly monochrome, but not literal terminal black-and-white. Low-fatigue neutrals carry almost every pixel. `primary`, `text`, `surface`, `background`, `muted`, and `border` form the base utility palette. `accent` is scarce and reserved for Resonate state or one active command affordance per view. Implementation should normally show no more than two accent moments per screen.

- `background` / `surface`: stone-paper and zinc-paper neutrals for an analyst workbench feel, avoiding both pastel SaaS softness and eye-straining pure canvas colors.
- `text`: primary reading and chrome text; must meet 4.5:1 contrast on its paired background.
- `muted`: source, timestamp, extraction-status, and secondary command text; must meet at least 4.5:1 for small text. Contrast failures are not permitted, never below 3:1 for UI boundaries.
- `accent`: active Resonate star only; it is not a brand wash, button default, chart color, or decoration.
- `focus`: accessible outline color; focus rings must be visible independent of accent state.
- `danger`, `warning`, `success`: status-only colors. Status must also use text labels or symbols, never color alone.

Use perceptually even ramps when extending tokens: think in OKLCH/HSL for contrast and step consistency, then serialize to sRGB hex in implementation. Avoid pure `#000000` / `#FFFFFF` as primary reading surfaces; diagnostic blocks may use stronger contrast because they are short operational output, not reading canvas.

Dark mode mirrors the same hierarchy: dark slate canvas, zinc surface, warm ash text, blue-steel focus, amber Resonate. No gradients, decorative blobs, or purple AI trust palettes.

If a future non-web shell is created, it should inherit semantic labels (`src:`, `agent:`, `partial:`, `err:`) and star shape changes (`☆` to `★`). This document does not define a separate terminal product surface.

## Typography

Typography separates payload from chrome.

- **Payload family:** `Newsreader, Georgia, 'Times New Roman', serif` for titles, summaries, and article body. This keeps the reading surface editorial without softening the tool.
- **Chrome family:** `IBM Plex Mono` or equivalent monospace for source pills, timestamps, Steer input, URLs, diagnostics, and Source Ledger rows. This should read as an archival index, not terminal cosplay.
- **System fallback:** system sans may appear only for browser/platform controls that cannot reasonably use the chrome stack.

Scale uses a strictly mathematical modular rhythm tied to the 4px/8px vertical grid. Line heights are explicitly calculated to hit exact pixel multiples (16, 20, 24, 28, 32, 40) ensuring vertical rhythm across the UI:

| Role | Size | Weight | Line-height | Tracking | Use |
| --- | ---: | ---: | ---: | ---: | --- |
| metadata | 12px | 500 | 16px | 0.02em | source, time, agent receipt |
| command | 14px | 500 | 20px | 0.02em | Steer, ledger, diagnostics |
| feed-summary | 14px | 400 | 20px | 0 | compact feed abstract |
| feed-title | 18px | 600 | 24px | -0.01em | left-feed index title |
| reading | 18px | 400 | 28px | 0 | Inspector article text |
| section-title | 24px | 600 | 32px | -0.01em | secondary page headings |
| inspector-title | 28px | 600 | 32px | -0.02em | selected item heading |
| display | 32px | 700 | 40px | -0.02em | rare empty/source-ledger title |

All-caps labels must use 0.08em tracking and remain short. Body copy line length should stay around 50–75 characters. Use tabular numerals for timestamps, diagnostics, and source counts. Hostile RSS strings must wrap or truncate deterministically: metadata/source rows can ellipsize after one line; feed titles clamp at two lines by default and three lines only when narrow titles would become ambiguous; feed summaries clamp at two lines on desktop and one line on narrow/mobile previews. Titles and summaries wrap fully in the Inspector.

Font loading must use swap behavior and stable fallbacks to avoid layout shift. If custom fonts are unavailable, Georgia + system monospace is acceptable.

## Layout & Spacing

Spacing uses a strict 4px/8px mathematical scale: `0, 2, 4, 8, 12, 16, 24, 32, 48, 64`.

- **Proximity (Gestalt):** Elements that belong together must have inner margins smaller than outer margins. E.g., Title and Summary (`4px` gap) vs Metadata and Title (`8px` gap).
- **Data-Ink Ratio:** Horizontal lines divide content. Full-width colored blocks or pill backgrounds are omitted wherever spacing + alignment can convey structure alone.
- **Rhythm:** Feed rows use `12px` top padding, `11px` bottom padding, and a `1px` separator to cleanly add up to an exact `24px` vertical shift per item boundary, preserving the 8-point grid rhythm exactly.

Desktop layout:

- Shell has no persistent left navigation.
- Top row contains the Steer input and minimal product label.
- Feed column occupies the left/center and should remain scannable at 640–760px; compact density is the default rather than a settings preference.
- Inspector opens to the right at 420–560px. If width is below 1080px, Inspector becomes a route/full-screen detail view.
- Selected item state must not alter feed item dimensions.

Mobile layout:

- Single-column feed uses **touch-safe compact** density: preserve the archival index scan pattern, but do not compress below comfortable thumb interaction or serif legibility.
- Steer input is sticky near the bottom or accessible via a fixed command affordance, respecting safe-area insets and the virtual keyboard.
- Feed metadata remains a flat inline monospace line; do not reintroduce bordered metadata pills on mobile feed rows.
- Mobile feed title uses `{typography.feed-title}` (18px/24px) identical to desktop. Feed summaries clamp to one line in the feed.
- Feed row padding should stay around 12px top, 11px bottom, and 10–12px left marker offset to preserve the exact 24px rhythm increment. Do not shrink independent controls to gain density.
- Inspector uses full-screen navigation with back behavior and preserved feed scroll. Mobile Inspector/detail view returns to reading density: title uses `{typography.inspector-title}`, body uses `{typography.payload}`, with 20–24px horizontal padding.
- Touch targets must be at least 44 CSS px on web/mobile web. Native shells may map this to platform points.
- Gestures: Support native OS edge-swipe to dismiss the Inspector (crucial for one-handed use). Feed rows are full-width tap targets (excluding the independent Resonate hit area). Double-tap in the Inspector reading body to toggle Resonate is encouraged as a power-user enhancement, provided the explicit star button remains visible.

Feed lifecycle:

- Group by soft inline time labels: Today, Yesterday, Earlier. Time dividers must not break the vertical grid rhythm of the feed. Place the time group string (e.g., `TODAY`) right-aligned inside the inline metadata row of the *first item* in that time group, rather than injecting a full-width divider row that disrupts the distance between item rules.
- Older items remain reachable via pagination or progressive loading.
- No completion badge, no queue-clear affordance, no mark-all-read action.

## Elevation

Depth is conveyed by z-order, borders, type scale, indentation, and tonal selection—not shadows. Maximum elevation levels:

1. base canvas/feed;
2. selected row or active Steer input;
3. Inspector, Source Ledger overlay/page, or command popover;
4. destructive confirmation for Source Ledger deletion only.

Do not use soft drop shadows or glass blur. Use stark 1px rules and focus outlines. Overlays must be flat panels with clear boundaries. Motion must not imply hierarchy that the layout does not support.

## Shapes

Shape language is utilitarian and square. Default radius is `0px` to `4px`.

- Feed items: no card radius; use horizontal rules, compact vertical padding, and a non-layout-shifting left marker.
- Steer input: 4px radius for hit-area clarity.
- Source/agent pills: 2px radius, not rounded candy tags. In the left feed, provenance should usually flatten into an inline metadata line rather than bordered pills; Inspector and Source Ledger may retain pills where discrete verification is useful.
- Resonate button: square 44px target with centered star glyph.
- Inspector and Source Ledger: rectangular panels.
- Progress bars, if needed for import, may use 2px radius.

Pills are exceptions for compact provenance only. They must not inflate left-feed row height. Avatars, decorative blobs, Memphis shapes, and random accent-sidebars are forbidden.

## Components

### App Shell

Purpose: hold Steer, feed, and optional Inspector with no settings-sidebar bloat.

Anatomy: top command row, feed viewport, detail pane, optional Source Ledger route/overlay. States: default, narrow, wide split, dark mode. Accessibility: landmarks for command, feed, detail; skip-to-feed link may exist but should be visually quiet.

### Owner Token Prompt

Purpose: gate API access with the local owner token without creating account, login, or onboarding semantics.

Anatomy: product label, one terse line (`Enter owner token`), token input, submit action, and raw invalid-token line (`err: owner token rejected`). It appears before the app calls `/api/*`; after acceptance, the token is stored as `resofeed.ownerToken` according to architecture. It must not use registration, account, profile, password-reset, or cloud-auth language.

States: empty, focused, submitting, accepted, rejected. Rejected state keeps the input focused and uses `feedback-error-line` styling.

Keyboard and accessibility: token input receives initial focus, submit is reachable by keyboard, rejection uses `aria-live="assertive"`, and accepted state moves focus to the Steer input or first feed item.

### First-Use Empty State

Purpose: explain the Inspect / Resonate / Steer loop inside the normal shell without a tour or wizard.

Anatomy: a terse empty feed block with these plain-language lines: `Paste RSS URL in Steer or import OPML.`, `Inspect opens the item.`, `Star preserves durable value.`, `Steer is optional correction.` No carousel, checklist, celebratory art, or setup-progress tracker.

States: no token, no sources, sources added but no items, feed temporarily empty. The no-token state uses Owner Token Prompt, not this empty state.

Keyboard and accessibility: the first actionable control remains Steer or OPML import; explanatory text is static and not focusable unless it is an action.
### Steer Input

Purpose: lightweight intent entry for natural-language correction, RSS URL subscription, `/doctor`, and source commands.

Anatomy: prompt marker (`>`), text field, submit affordance only when text exists. States:

- default: placeholder `Steer or paste RSS URL...`;
- focused: 2px focus outline;
- submitting: disable duplicate submit, keep dimensions fixed, show terse `...` or `applying` text;
- applied: one-line receipt near input, e.g. `applied: less celebrity coverage`;
- rejected/unknown: raw string, e.g. `err: could not apply`;
- disabled: only when the app cannot accept local input.

No chat transcript, no multi-turn clarification, no rule builder. Receipt text should be concise and reversible where product state allows: `undo` may appear as a text action but must not open a management panel.

Keyboard and accessibility: `Tab` reaches the Steer field first, `Enter` submits, `Escape` clears only unsent text. Applied/rejected receipts use `aria-live="polite"`; raw errors use `aria-live="assertive"` only when the command failed.

### Steering Receipt
Purpose: expose the minimum product-required steering transparency without creating a rule-management UI.

Anatomy: raw command excerpt, interpreted summary, actor (`human` or delegated agent name), and terse `undo` or `correct` text action when reversible. Timestamp and superseded marker render only when already present in the API response or local transient UI state; the design does not require new persistent receipt fields. States: applied, superseded, agent-applied, rejected, failed. Receipts are inline near Steer or the affected feed item; they must not accumulate into a dedicated activity ledger.
### Feed Item

Purpose: scan one RSS-derived item.

Anatomy: compact metadata line (`src: <host> · <age> · <full|partial|excerpt> · agent:<name>` when needed), serif feed title, 1–2 line dense summary/core insight, provenance/extraction marker, Resonate action. Required item-understanding outputs are compressed into visible microcopy rather than dashboards: quality/value tier may appear as a terse label (`high`, `brief`, `source-claim`), source-quality provenance appears as `full`, `partial`, or `excerpt`, and reported fact/source claim/model interpretation distinctions appear in Inspector copy when material.

Feed rows are triage surfaces, not miniature article cards. Title uses `{typography.feed-title}` on desktop and mobile; summary uses `{typography.feed-summary}` and clamps to two lines on desktop, one line on narrow/mobile previews. The text stack must stay continuous: metadata, title, and summary sit in one column with 4px title-to-summary separation. The independent 44x44 Resonate action may sit in a side column, but it must not force a blank row or enlarge the title-to-summary rhythm. Full summary, raw excerpt, and full body belong in the Inspector. Bordered source pills are allowed in the Inspector and ledger, but the feed should prefer flat monospace metadata with separators to preserve vertical density.

States:

- default;
- hover/focus: tonal shift or outline only, no translation;
- selected: non-layout-shifting 3px left marker only by default; optional `surface-active` tonal background is reserved for compact/narrow layouts where it does not create large empty color blocks. Selected state means "currently open in Inspector," not keyboard focus, importance, recommendation, unread, or priority. Use focus rings only for true keyboard focus;
- externally surfaced: add compact `agent:<name>` marker;
- partial extraction: text marker `partial` with warning color and explanation in Inspector;
- raw fallback: show feed excerpt when AI summary is unavailable;
- grouped duplicate/story: transparent grouping must preserve access to every source item and provenance.

No unseen/bold state. No numeric count. No hidden spam collapsing. No user-facing density mode unless future accessibility research proves one is necessary; compact feed density is the product default while touch targets stay minimum 44 CSS px. On mobile, density is achieved through clamping, flat metadata, and restrained padding—not by reducing tap targets or making the whole surface feel like a spreadsheet.

Time-group labels inside the feed (`TODAY`, `YESTERDAY`, `EARLIER`) must feel anchored without breaking the grid. Use uppercase monospace metadata styling and align them to the far right inside the metadata row of the first item belonging to that group. They should consume zero extra vertical height, preserving a mathematically consistent rhythm between feed row separators.

Keyboard and accessibility: feed items are reachable in reading order; `Enter` or `Space` opens Inspector, arrow-key roving focus is allowed only if normal `Tab` order still works. Source, agent, partial, and grouped markers need accessible names, e.g. `Source: NYT`, `Extraction: partial`, `Grouped story with 4 source items`.

### Resonate Button

Purpose: preserve durable value and provide positive preference signal.

Anatomy: star glyph, accessible label, 44px target. Because monospace font metrics often place the glyph flush with the baseline, the star requires optical centering (e.g., setting line-height to 1 and adding bottom padding) to sit visually in the middle of the 44px box. States:

- default: `☆`, muted;
- hover/focus: outline plus label;
- active: `★`, accent;
- submitting: dimensions fixed, glyph may remain pending;
- rollback/error: raw inline text `err: star failed`, then return to last known state.

Non-color semantics are mandatory: star shape changes in addition to color.

Keyboard and accessibility: `Space` or `Enter` toggles. Label must announce state: `Resonate item` / `Remove resonance`. The active star cannot rely on color alone.

### Inspector Pane

Purpose: deliberate Inspect surface for detail reading and verification.

Anatomy: source/provenance header, Resonate action (mobile/single-column route only), title, original link, extraction status, dense summary, full text/excerpt, why-this-appeared line when useful, and source-list disclosure for grouped stories. States: empty/no-selection (shows minimal placeholder text indicating no item is selected), loading raw detail, partial extraction, unavailable original, grouped-story sources, externally surfaced receipt.

Note on Resonate Action: To maintain a clean, low-fatigue interface, the Inspector only duplicates the Resonate action when presented as a single-column mobile route (where the feed is hidden). In desktop split-pane mode, the Inspector does not show a star; the user relies on the permanently visible star on the selected feed item to their left.

Inspector must not include related-content carousels, recommendation modules, or ads. It may expose source provenance and original links plainly.

Keyboard and accessibility: opening Inspector moves focus to the detail heading; closing/back returns focus to the originating feed item and preserves scroll. Original links, grouped sources, and provenance labels must be screen-reader readable.

### Source Ledger
Purpose: flat source management without settings-dashboard behavior.

Anatomy: title, OPML import action, flat source rows, delete action, and terse links to the State Portability `export state` / `import state` actions. URL subscription must route users back to Steer; the Ledger does not provide a second manual URL paste field. Row fields: source name, URL, optional last fetch status if needed for diagnostics. States:

- empty: `No sources. Paste RSS URL in Steer.`;
- import pending: raw progress line;
- import complete: `imported N sources; folders flattened`;
- delete confirmation: terse confirmation for destructive removal;
- deletion error: raw line.

Forbidden: folders, tags, pause/resume toggles, drag ordering, scoring sliders, source categories.

Keyboard and accessibility: source rows are list items; delete is a named button (`Delete source: <name>`) and requires a terse confirmation before destructive removal. Focus returns to the next row or Ledger heading after deletion.
### State Portability
Purpose: satisfy active state export/import without adding a settings dashboard.

Anatomy: two terse text actions reachable from the Source Ledger footer: `export state` and `import state`. Export includes active Source Ledger rows, active steering policy rules, and currently resonated items. Import accepts the same portable state bundle and replaces local portable active state with it. Before file selection or final submit, show the warning text `import replaces active sources, rules, and stars`. A future `/doctor` shortcut may point to the same actions, but the implemented surface is Source Ledger only. It must not expose raw command history, superseded steering state, resonance signal history, sync controls, portable receipts, account setup, cloud sync, privacy, or backup-management UI. States: idle, exporting, export complete, importing, import complete, import failed. Feedback is raw text (`exported state.json`, `err: import failed`).

Keyboard and accessibility: export/import actions are buttons or links with explicit names. Completion and failure messages use live regions. File inputs must remain reachable by keyboard.
### Diagnostics Output

Purpose: `/doctor` output for power-user operational truth.

Anatomy: monospace block with RSS fetch errors, model latency, last run time, extraction failures. States: default output, command running, command failed. It is text, not a dashboard. No charts, health badges, or friendly remediation cards.

Accessibility: diagnostics output uses a labelled `status`/`log` region. Long lines wrap; no horizontal-only scrolling on mobile.

### Search and Retrieval

Purpose: retrieve corpus by keyword/plain text, source, time, and resonance status. This surface is not a RAG chat or semantic answer engine.

Anatomy: query field may reuse Steer chrome or a dedicated search field if implementation separates modes; results use feed-item anatomy with extra match/provenance line. States: empty query, loading, no results, partial results, error. Results must explain enough provenance to verify the match.

Keyboard and accessibility: search results follow normal feed item focus behavior; result count, if present, is plain text inside the results region, not a badge or queue indicator.

### Feedback Lines

Purpose: raw system strings for errors, empty states, imports, and AI utility failures.

Examples: `no new items`, `err: summary unavailable`, `partial: excerpt only`, `doctor: model latency 842ms`. No cute illustrations, skeleton characters, confetti, or apology copy.

## Do's and Don'ts

Do:

- Do keep Inspect, Resonate, and Steer as the only primary primitives.
- Do use Steer for RSS URL paste, correction, and `/doctor` commands.
- Do keep Source Ledger flat and delete-only beyond import/export.
- Do expose active state export/import as terse text actions covering active sources, active steering rules, and currently resonated items.
- Do show steering receipts as concise inline evidence, not as a policy roster.
- Do show raw provenance, extraction limits, source names, and original links.
- Do preserve persistent feed access through time groups and pagination.
- Do keep the left feed compact by default: flat metadata, 18px serif titles, clamped 1–2 line abstracts, and horizontal rules rather than roomy cards.
- Do keep accent scarce: Resonate and one active command/focus moment at most.
- Do enforce minimum 44 CSS px touch targets on mobile web surfaces.
- Do support keyboard navigation for every action.
- Do keep exported state human-readable.
- Do keep product labels operational and terse: `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`.

Don't:

- Don't add account registration, profile, password-reset, or onboarding wizard surfaces; the owner-token prompt is a local access gate, not account login.
- Don't add folders, tags, source hierarchy, ranking sliders, or settings dashboards.
- Don't hide high-volume feeds behind paternalistic auto-collapsing.
- Don't use unread counts, mark-all-read, queue-clearing, or archive workflows.
- Don't create moderation consoles, hidden review queues, or extensive activity ledgers.
- Don't communicate errors with cute empty-state art, ghosts, mascots, or apologetic SaaS copy.
- Don't use decorative gradients, purple AI trust palettes, random blobs, or Memphis filler.
- Don't use emoji as structural icons; use text, professional SVG icons, or plain glyphs.
- Don't display internal design-positioning phrases such as “Analyst’s Workbench,” “Archival Index,” “low-fatigue,” “single-tenant,” or “no SaaS chrome” as product UI copy.
- Don't solve feed density with settings bloat, unread states, sortable spreadsheet columns, zebra striping, or monospace-only titles.

## Micro-interactions & Motion

Motion is functional, brief, and optional.

- Hover/focus transitions: 120–150ms ease-out for color/border only.
- Resonate activation: 150ms ease-out star fill/shape change; no bounce.
- Pane transitions: 150–220ms ease-out for Inspector on desktop; mobile route transitions may use platform defaults.
- Loading: raw text states only, or clearly labelled non-skeleton static text placeholders; no skeleton loaders, shimmer or static, under this contract.
- Reduced motion: disable transitions beyond immediate state changes.
- No layout shift: hover, focus, selected, loading, error, and receipt states must keep component bounds stable.

## Low-Fidelity Wireframe

```text
+--------------------------------------------------------------------------------+
| > Steer or paste RSS URL...                                        RESOFEED    |
+--------------------------------------------------------------------------------+
| src: nyt · 2h · fresh                                    TODAY | INSPECTOR     |
| The Main Headline Goes Here        [☆]    | [src: nyt] [partial]               |
| Dense factual summary, clamped to         | The Main Headline Goes Here        |
| two lines in the index row.               | ---------------------------------- |
| ----------------------------------------- | Full extracted text, raw excerpt,  |
| src: hn · 4h · agent:delivery-bot         | provenance, original link.         |
| Secondary Story                     [★]   |                                    |
| ----------------------------------------- | why: fresh from configured source  |
| src: blog.example · 1d · partial                     YESTERDAY |                                    |
| Older item remains reachable.       [☆]   |                                    |
+--------------------------------------------------------------------------------+
| /doctor is raw text; Source Ledger is flat; export/import are terse JSON actions |
+--------------------------------------------------------------------------------+
```

Mobile structure: Steer command at bottom, feed as a touch-safe compact single column with inline metadata and one-line abstracts; item tap opens a full-screen Inspector route that becomes generous again for reading; Source Ledger opens as a flat full-screen list.

## Trend / Platform Evidence

The design inherits `docs/DESIGN_VISION.md` rather than trend-chasing. Relevant conventions are durable: archival index metadata for source-heavy work, broadsheet typography for long reading, split-pane readers for desktop, and single-column detail routes on mobile. ResoFeed rejects consumer SaaS softness in favor of sovereign utility: raw strings, visible provenance, no coaching copy, no settings maze.

## Contract Self-Critique

- Philosophy: 5/5 — low-fatigue single-tenant analyst workbench, not SaaS.
- Hierarchy: 4/5 — Steer, feed, Inspector, Source Ledger are distinct; final implementation must preserve selected-item clarity.
- Execution: 4/5 — tokens, typography, spacing, and states are specified; lint and implementation audit remain required.
- Specificity: 4/5 — empty, loading, error, partial extraction, selected, disabled, mobile, and diagnostics states are covered.
- Restraint: 5/5 — no dashboards, onboarding, hidden queues, decorative AI styling, or feature creep.
