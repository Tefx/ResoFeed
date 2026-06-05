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
  chrome: "500 14px/20px 'JetBrains Mono', 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
  metadata: "500 12px/16px 'JetBrains Mono', 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
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
  list-meta-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  metadata-token:
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
  compact-evidence-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
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
  inspector-title:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.inspector-title}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  inspector-frontmatter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.metadata}"
    padding: "{spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  inspector-frontmatter-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  inspector-frontmatter-value:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.metadata}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  inspector-reingest-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  inspector-section-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  inspector-core-insight:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.payload}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  inspector-key-points:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.payload}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  inspector-key-point-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.payload}"
    padding: "{spacing.xs} {spacing.none}"
    rounded: "{rounded.none}"
  inspector-reingest-attempt-failure:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  inspector-model-selector:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.sm}"
  inspector-extra-prompt:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.sm}"
  source-disclosure:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  source-ledger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  source-ledger-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.none} {spacing.none} {spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  source-ledger-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  source-ledger-status:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  source-ledger-status-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.chrome}"
    padding: "{spacing.none}"
    rounded: "{rounded.none}"
  current-operation-status:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  current-operation-conflict:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm} {spacing.none}"
    rounded: "{rounded.none}"
  utility-menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chrome}"
    padding: "{spacing.md}"
    rounded: "{rounded.none}"
  bracket-action:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  bracket-action-hover:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  bracket-action-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  bracket-action-focus:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
    rounded: "{rounded.none}"
  bracket-action-disabled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    padding: "{spacing.sm}"
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
- Inspector-only item re-ingest controls for one selected item, with temporary OpenRouter model and extra prompt inputs;
- Steer input for natural-language correction, RSS URL subscription, search command entry, and `/doctor` diagnostics;
- a discreet `RESOFEED` surface menu that may contain `TODAY` and `SOURCE LEDGER` rather than showing persistent top-level navigation links;
- flat Source Ledger for viewing/deleting sources, lightweight manual `[FETCH]` per source, lightweight manual `[RUN INGEST]` for all sources, current operation status when work is running or blocking an action, importing flattened OPML through `[IMPORT OPML]`, and reaching `[EXPORT STATE]` / `[IMPORT STATE]` actions;
- low-chrome `RESOFEED` utility menu for low-frequency global operations: processing language and guarded library reprocess;
- search and retrieval surfaces;
- agent receipt/provenance markers.

Density target is **dense but legible**: metadata is compact like an archival index; article content breathes. Repeated metadata labels are treated as waste in reader surfaces. Feed rows compress source/time/extraction/value into one flat metadata rail; Inspector provenance moves into a tight Frontmatter grid below the title so the reading payload begins higher. Emotional effect is precise, low-fatigue, and tool-like rather than friendly SaaS. Heavy-operation feedback is terminal-synchronous text and one current operation snapshot, never animated loading chrome, durable jobs, queues, history, or dashboard state. Assumption: the first implementation targets responsive web/mobile web; native shells may adapt platform chrome while preserving the same primitives.

Content contract target is **dense comprehension, not paragraph-only compression**. Feed rows remain compact scanning surfaces and MUST NOT render Key Points. Inspector is the structured reading surface and MUST render validated Chinese generated content as `摘要`, `核心洞察`, and `要点`, with `要点` rendered from a controlled 3–5 item structured list rather than raw Markdown. Generated/user-facing content and processing feedback should be Chinese-localized when the processing language is Chinese; URL, source, provenance, model ID, and quoted literal strings remain unchanged.

Product copy rule: internal design metaphors and principles are not user-visible slogans. Do not render “Analyst’s Workbench,” “Archival Index,” “low-fatigue,” “single-tenant,” or “no SaaS chrome” in the app UI. The product chrome should use only operational labels such as `RESOFEED`, `TODAY`, `YESTERDAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`, and raw status strings.

## Colors
The color system is nearly monochrome, but not literal terminal black-and-white. Low-fatigue neutrals carry almost every pixel. `primary`, `text`, `surface`, `background`, `muted`, and `border` form the base utility palette. `accent` is scarce and reserved for Resonate state. Implementation should normally show no more than two accent moments per screen.

- `background` / `surface`: stone-paper and zinc-paper neutrals for an analyst workbench feel, avoiding both pastel SaaS softness and eye-straining pure canvas colors.
- `text`: primary reading and chrome text; must meet 4.5:1 contrast on its paired background.
- `muted`: source, timestamp, extraction-status, and secondary command text; must meet at least 4.5:1 for small text. Contrast failures are not permitted, never below 3:1 for UI boundaries.
- `accent`: active Resonate star only; it is not a brand wash, button default, chart color, fetch color, or decoration.
- `focus`: accessible outline color; focus rings must be visible independent of accent state.
- `danger`, `warning`, `success`: status-only colors. Status must also use text labels or symbols, never color alone.

Use perceptually even ramps when extending tokens: think in OKLCH/HSL for contrast and step consistency, then serialize to sRGB hex in implementation. Avoid pure `#000000` / `#FFFFFF` as primary reading surfaces; diagnostic blocks may use stronger contrast because they are short operational output, not reading canvas.

Dark mode mirrors the same hierarchy: dark slate canvas, zinc surface, warm ash text, blue-steel focus, amber Resonate. No gradients, decorative blobs, or purple AI trust palettes.

Theme-root rule: [SHARP] light/dark mode must apply at the page canvas level (`html`, `body`, and app root), not only inside `.contract-shell` or component islands. Page gutters, safe-area bands, fixed command bars, top chrome, feed surfaces, and Inspector surfaces must all use the active theme's background/surface tokens. Dark mode must never expose light stone-paper gaps around a dark feed or command bar; separate surfaces with 1px muted rules rather than mismatched background bands.

If a future non-web shell is created, it should inherit semantic labels (`src:`, `agent:`, `text evidence: RSS excerpt only`, `source excerpt`, `error:`) and star shape changes (`☆` to `★`). These labels preserve text-evidence provenance separately from generated-summary provenance. `partial:` is an internal extraction condition, not a user-facing semantic label. This document does not define a separate terminal product surface.

## Typography

Typography separates payload from chrome.

- **Payload family:** `Newsreader, Georgia, 'Times New Roman', serif` for titles, summaries, and article body. This keeps the reading surface editorial without softening the tool.
- **Chrome family:** `JetBrains Mono`, with `IBM Plex Mono` or equivalent monospace fallback, for source pills, timestamps, Steer input, URLs, diagnostics, and Source Ledger rows. This should read as an archival index, not terminal cosplay. The 2026-06-01 Stitch checkpoint used JetBrains Mono in concrete screen HTML; local implementation may retain IBM Plex Mono only as a compatible fallback if font loading or bundle policy requires it.
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
- **Data-Ink Ratio:** Horizontal lines divide content. Full-width colored blocks or pill backgrounds are omitted wherever spacing + alignment can convey structure alone. Fixed chrome may use thin rules and low-contrast canvas continuity, but it must not create heavy horizontal color bands that compete with feed or reading content.
- **Metadata Compression:** Known fields in the Feed and Inspector are communicated by position, order, typography, and accessible names. Do not spend visual space on repeated `src:`, `来源标题:`, `条目 URL`, `来源 URL`, or `价值:` prefixes in the main reading flow.
- **Rhythm:** Feed rows use `12px` top padding, `11px` bottom padding, and a `1px` separator to cleanly add up to an exact `24px` vertical shift per item boundary, preserving the 8-point grid rhythm exactly.

Desktop layout:

- Shell has no persistent left navigation.
- Desktop shell is a responsive full-height workbench, not a narrow centered webpage. It should use the viewport with small controlled gutters: target `calc(100vw - 32px)` to `calc(100vw - 64px)` with an upper bound around `1440–1600px`. A hard `1216px` desktop cap is too small for split Feed + Inspector work.
- Desktop shell height should be full or near-full viewport height: prefer `100dvh` with `0–8px` vertical margin, not `32px` top/bottom margins. The goal is to maximize visible feed rows while preserving a thin archival frame.
- Top row contains the Steer input and minimal product label. Persistent top chrome must not permanently show `LANG: EN`, `LANG: ZH`, `[REPROCESS LIBRARY]`, or their localized equivalents.
- The product label may act as a discreet `RESOFEED` surface menu; `TODAY`, `SOURCE LEDGER`, processing language, and guarded `[REPROCESS LIBRARY]` are allowed to appear only after that menu opens. This is intentional low-chrome navigation/utility placement, not a missing-link regression.
- Feed text remains clamped for scan comfort even when the shell expands. Feed content should stay around `640–760px`; extra desktop width may become exterior shell gutter or controlled split structure, but must not stretch Feed line length past comfortable scanning.
- Inspector opens to the right at `420–760px` depending on available desktop width. Its outer pane owns scrolling and may grow, while the reading group keeps a measured line length and balanced left/right breathing room.
- Desktop Inspector reading groups may be horizontally balanced inside the pane, but they must not become floating scroll islands. The `.detail-pane` remains the pane, scrollport, and scrollbar owner.
- Selected item state must not alter feed item dimensions.

Mobile layout:

- Single-column feed uses **touch-safe compact** density: preserve the archival index scan pattern, but do not compress below comfortable thumb interaction or serif legibility.
- Mobile/narrow shell is full-bleed and full-height. It must not expose desktop-style outer margins or light page gutters around a dark surface.
- Steer input is sticky near the bottom or accessible via a fixed command affordance, respecting safe-area insets and the virtual keyboard. The fixed command affordance must be visually light: use the same canvas, a thin rule, and compact padding rather than a large opaque color block.
- Top operational chrome remains visible on TODAY even when the Steer input is moved to the bottom; `RESOFEED` menu access must not be visually clipped to a 1px hidden label. This top chrome must also stay visually light and must not form a heavy full-width banner.
- Feed metadata remains a flat inline monospace line; do not reintroduce bordered metadata pills on mobile feed rows.
- Mobile feed title uses `{typography.feed-title}` (18px/24px) identical to desktop. Feed summaries clamp to one line in the feed.
- Feed row padding should stay around 12px top, 11px bottom, and 10–12px left marker offset to preserve the exact 24px rhythm increment. Do not shrink independent controls to gain density.
- Inspector uses full-screen navigation with back behavior and preserved feed scroll. Mobile Inspector/detail view has one sticky top back row (`返回 TODAY` / `back to TODAY`) that remains visible while reading; it replaces the global `RESOFEED` banner on that route. The title uses `{typography.inspector-title}`, body uses `{typography.payload}`, with 20–24px horizontal padding.
- Mobile Inspector/detail routes are [SHARP] full-screen takeovers. They must cover global top chrome and the bottom Steer command area instead of leaving top or bottom color slabs visible behind the route. The back row is the route chrome; the global shell chrome must not show through as a second banner.
- Source Ledger opens as a flat full-screen utility surface on narrow layouts, reachable from the `RESOFEED` menu and optionally by Steer command text such as `source ledger`.
- Touch targets must be at least 44 CSS px on web/mobile web. Native shells may map this to platform points.
- Gestures: Support native OS edge-swipe to dismiss the Inspector (crucial for one-handed use). Feed rows are full-width tap targets (excluding the independent Resonate hit area). Double-tap in the Inspector reading body to toggle Resonate is encouraged as a power-user enhancement, provided the explicit star button remains visible.

Feed lifecycle:

- Group by soft inline time labels: Today, Yesterday, Earlier. Time dividers must not break the vertical grid rhythm of the feed. Place the time group string (e.g., `TODAY`) right-aligned inside the inline metadata row of the *first item* in that time group, rather than injecting a full-width divider row that disrupts the distance between item rules.
- Older items remain reachable via pagination or progressive loading.
- No completion badge, no queue-clear affordance, no mark-all-read action.

### Desktop Split Proximity and Gutter Contract
Desktop split view must preserve proximity by avoiding a separate phantom middle slab. Feed and Inspector are adjacent workbench panes: the Feed column owns Feed content, the Inspector pane owns the visible separator line and its internal reading padding. A separate grid `column-gap` between the panes SHOULD be `0`; if a browser/layout constraint forces one, it MUST stay at or below one spacing row (`12px`).

The visible split line belongs to the Inspector pane boundary. Any whitespace from that line to the Inspector reading group is Inspector internal breathing room and MUST be balanced against the trailing right-side breathing room. The two sides SHOULD differ by no more than one spacing row (`12px`) at common desktop widths.

The Feed column must anchor to the shell's left content edge. Do not center the Feed+Inspector grid inside a wider shell in a way that creates a large blank leading gutter before the Feed rows. Desktop Feed row text should start within roughly `32–48px` of the shell's inner left edge, including normal surface padding and any invisible rhythm gutter. A leading internal blank band wider than one spacing column (`64px`) is a layout bug.

On ultra-wide displays, constrain the shell or put extra width outside the shell. Extra width must not create a dead zone before the Feed, between Feed and Inspector, or between the Inspector reading group and the pane's right edge.

### Narrow Surface Canvas and Fixed Chrome Contract
On narrow layouts, fixed top navigation and bottom Steer chrome are allowed only when they are active, usable route chrome for the current surface. They must read as light rules on the same canvas as the adjacent surface, not as opaque top or bottom color slabs.

Feed/TODAY, Search, Source Ledger, and Doctor may keep global top/bottom chrome visible on narrow screens, but the chrome background, route-preview strip, shell padding area, and active surface canvas must visually match. Screenshots must not show a distinct full-width block below `RESOFEED`, above the Steer input, or between fixed chrome and feed rows.

Reserved space for fixed chrome must be minimal and accountable. The first feed row should begin after the top chrome plus normal content padding only; there must not be an extra blank banner. The bottom Steer region may reserve safe-area/input space, but it must not cover feed text with a separate color slab or leave a broad masked band above the input.

Inspector remains the exception: it is a full-screen takeover and MUST cover both global top navigation and bottom Steer chrome. Mobile Inspector must keep one sticky back row and should end with compact reading breathing room, not a viewport-sized empty block after collapsed source/details disclosures.

The active narrow utility/search surface owns its own scroll flow. Avoid fixed overlays with reserved `top`/`bottom` insets unless the visible chrome is intentionally still usable. If chrome remains usable, the content start/end spacing must be explained by the chrome height and safe-area needs, not by an extra background slab or hidden margin.

### Desktop Split Scroll and Processing Language Layout
Desktop shell must keep Feed and Inspector as independent vertical scroll regions. Global page scroll must not couple the two panes. Scrolling the Feed must not move the Inspector, and scrolling the Inspector must not move the Feed. Selecting a Feed item must keep Feed scroll position stable and reset the Inspector pane scroll to the top for the newly selected item.

The desktop Inspector scrollport contract is [SHARP]: the right `.detail-pane` owns Inspector vertical scrolling. The Inspector article/content column may constrain line length, but it MUST NOT become a nested vertical scroll container, MUST NOT place the scrollbar at the reading-column edge, and MUST NOT use a centered scroll island. The scrollbar belongs at the outer right edge of the Inspector pane.

Both desktop scroll regions MUST be focusable (e.g., `tabindex="0"`) with proper accessible names so keyboard users can scroll them independently. In desktop split view, prefer exactly one keyboard-scroll focus owner per pane: the Feed pane for feed rows and the `.detail-pane` for Inspector reading. Inner Inspector reading blocks may contain focusable controls and headings, but they must not compete as page-level scroll owners.

Mobile keeps the existing single-column behavior: Feed is the main surface and Inspector opens as a full-screen route with preserved Feed scroll.

Processing language is a global operational state, not a per-item display toggle. The language control lives in the `RESOFEED` utility menu under a `SYSTEM` / `系统` micro-heading, with an optional duplicate in `/doctor` raw utility output. It must not be persistent top chrome and must not become a settings dashboard, preference center, or onboarding wizard (see **Language Control** in the Components section for exact anatomy and ARIA rules).

### High-Density Acceptance and Mechanical Gates

These gates are [SHARP] because they preserve the dense reader optimization without sacrificing provenance or accessibility:

- Reader surfaces (Feed rows and compact Inspector Frontmatter) MUST NOT visually render repeated prefixes `src:`, `来源标题:`, `条目 URL`, `来源 URL`, or `价值:`. Source Ledger and diagnostics may render raw management labels because managing/verifying sources is their task.
- Raw visible URLs MUST NOT appear in Feed, Inspector reading sections, or compact Inspector Frontmatter. Raw visible URLs are reserved for Source Ledger source management and `/doctor`/diagnostic output.
- Feed rows MUST NOT render `key_points`, bullets, numbered lists, Markdown list strings, or inferred mini-lists; the Feed remains metadata, title, compact summary/core preview, and Resonate only.
- Inspector Frontmatter order is fixed: `ORIGINAL`, `LINKS`, `AI STATUS`, then `ATTEMPT` when present. Omit irrelevant rows rather than reordering them.
- Compact evidence links MUST keep visible text compact (`原文链接`, `来源链接`, `original link`, `feed link`) while the DOM uses a literal non-secret `href` and an accessible name that exposes destination/provenance.
- All independent controls and touch/click targets, including bracket actions and Resonate, MUST maintain at least 44 CSS px hit targets.
- Desktop Feed and Inspector MUST be independent bounded scroll containers with `overflow-y: auto` or equivalent, keyboard-focusable scroll regions (`tabindex="0"` or native focusability), and accessible names that distinguish Feed from Inspector.

## Elevation

Depth is conveyed by z-order, borders, type scale, indentation, and tonal selection—not shadows. Maximum elevation levels:

1. base canvas/feed;
2. selected row or active Steer input;
3. Inspector, Source Ledger overlay/page, or command popover;
4. destructive inline confirmation for Source Ledger deletion and State import.

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
### Primary Ink (`primary`)
- **Intent**: [SHARP] The hard editorial/chrome ink that anchors the ResoFeed workbench.
- **useFor**: Product wordmark, terminal-style diagnostic blocks, high-emphasis chrome, and dark-on-paper UI anchors.
- **avoidFor**: Large filled marketing panels, decorative backgrounds, unread emphasis, or priority/ranking decoration.

### Reading Text (`text`)
- **Intent**: [SHARP] Main reading color for titles, body prose, and inspector values.
- **useFor**: Feed titles, Inspector titles, structured reading payload, frontmatter values, and accessible action labels.
- **avoidFor**: Metadata texture, disabled text, status-only meaning, or decorative borders.

### Workbench Background (`background`)
- **Intent**: [SHARP] Warm paper canvas for low-fatigue scanning and reading.
- **useFor**: App shell, feed column, Steer input interior, and flat list rows.
- **avoidFor**: Filled callouts, selected-state meaning by itself, modal scrims, or dashboard cards.

### Paper Surface (`surface`)
- **Intent**: [FLEXIBLE] Slightly raised paper plane for Inspector, menus, ledger, and compact controls.
- **useFor**: Inspector pane, Source Ledger, RESOFEED menu, source disclosures, and star button rest state.
- **avoidFor**: Creating card mazes around every feed row, decorative tiles, or status severity.

### Active Surface (`surface-active`)
- **Intent**: [FLEXIBLE] Quiet tonal distinction for selected/focused compact regions.
- **useFor**: Selected feed row background on narrow layouts, focused Steer state, and temporary operation rows.
- **avoidFor**: Unread counts, priority/ranking emphasis, permanent panels, or hover effects that reduce contrast.

### Metadata Ink (`muted`)
- **Intent**: [SHARP] Dense archival metadata color that stays readable at 12px.
- **useFor**: Source names, times, extraction labels, frontmatter labels, link affordance text, and secondary command hints.
- **avoidFor**: Long-form body copy, disabled text below contrast threshold, placeholder-only explanations, or hiding provenance.

### Rule Line (`border`)
- **Intent**: [SHARP] Hairline separation that preserves information density without boxed cards.
- **useFor**: Feed row separators, Inspector frontmatter rules, Source Ledger row rules, and disclosure boundaries.
- **avoidFor**: Nested border mazes, thick outlines, decorative grids, or zebra-striping substitutes.

### Resonate Accent (`accent`)
- **Intent**: [SHARP] Scarce marker for the owner's explicit Resonate state.
- **useFor**: Active star/resonated item only, plus rare matching state text when directly tied to Resonate.
- **avoidFor**: Fetch buttons, generic primary buttons, AI magic, charts, alerts, selected rows, links, or decoration.

### Focus Ink (`focus`)
- **Intent**: [SHARP] Keyboard focus and navigational certainty independent of accent state.
- **useFor**: Focus-visible outlines, active command caret, and accessible selection markers where keyboard position must be clear.
- **avoidFor**: Brand accents, hover decoration, status color, or permanent selected-item styling.

### Status Colors (`danger`, `warning`, `success`)
- **Intent**: [SHARP] Terse operational severity with text labels, never color alone.
- **useFor**: Raw `err:` lines, extraction warnings, successful fetch/ingest timestamps, and guarded destructive/delete states.
- **avoidFor**: Decorative badges, confetti states, priority ranking, AI confidence, or replacing explicit status text.


### App Shell

Purpose: hold Steer, feed, and optional Inspector with no settings-sidebar bloat.

Anatomy: top command row, feed viewport, detail pane, and utility surfaces reachable through the `RESOFEED` surface menu. The menu may contain `TODAY` and `SOURCE LEDGER`; those labels do not need to be persistent visible links when the menu is closed. States: default, menu open, narrow, wide split, dark mode. Accessibility: landmarks for command, feed, detail; `RESOFEED` menu summary must be keyboard reachable; menu items must be real buttons/links with accessible names; skip-to-feed link may exist but should be visually quiet.

### Interaction State Taxonomy
- **Intent**: [SHARP] Make every interactive element communicate the same thing with the same visual state across Shell, Search, Inspector, Source Ledger, State Portability, and Owner Token flows.
- **useFor**: Navigation items, bracket commands, text/state toggles, disclosures, destructive/rewrite warnings, receipts, disabled/running controls, and focus-visible affordances.
- **avoidFor**: Component-local hover exceptions, background-filled navigation tabs, warning copy detached from the risky action, selected-command states, color-only semantics, SaaS primary buttons, animated loading indicators, or per-surface interaction styles.

State families are [SHARP]:

- **Navigation items** say where the user is. Examples: `TODAY`, `SOURCE LEDGER`. Rest uses muted text. Hover uses primary text only. Current uses primary text plus semantic `aria-current` or `aria-pressed`; it MUST NOT use terminal inversion, filled backgrounds, accent fill, pill tabs, or bracket-action styling. Focus-visible adds the shared focus outline without changing geometry.
- **Bracket commands** execute work. Examples: `[SEARCH]`, `[FETCH]`, `[IMPORT STATE]`, `[REPROCESS LIBRARY]`, `[REGENERATE]`, `[CANCEL]`. Rest uses muted monospace bracket text on transparent/inherited surface. Hover and focus-visible use immediate terminal-style inversion; focus-visible also keeps the shared outline. Running uses text replacement only and preserves the hitbox. Disabled keeps geometry, muted text, and no hover inversion.
- **State toggles/text actions** change a global state. Example: processing language. The current state is expressed by the label text (`LANG: EN`, `语言：中文`), not by a persistent selected background. Hover/focus may use the bracket-command interaction only if the control is styled as a command; persistent inversion is forbidden.
- **Disclosures** reveal secondary controls or evidence. Examples: `filters`, `Text evidence` / `文本证据`, `Source info` / `来源信息`, and source diagnostics. Rest uses low-chrome summary text. Hover may brighten text or underline. Open may use primary text. Disclosures MUST NOT become filled accordion cards or selected tabs.
- **Warnings/status lines** explain risk or outcome. Warning copy MUST sit adjacent to the action that causes the risk. Errors/conflicts use terse visible text and live regions. Receipts stay concise. Warnings MUST NOT float as unrelated menu prose or attach to a different control.

#### Operational Grammar v2

Operational grammar is [SHARP] because it prevents repeated copy and inconsistent visual weight:

- **Command**: executes work immediately. Commands use bracket syntax and the standard bracket-command interaction state. Use verbs: `[SEARCH]`, `[FETCH]`, `[REGENERATE]`, `[DELETE]`, `[REPROCESS LIBRARY]`, `[搜索]`, `[重新生成]`. Do not use bracket syntax for controls that only reveal hidden content.
- **Disclosure**: reveals secondary controls or evidence. Disclosures are not commands and MUST NOT use bracket syntax. Use terse nouns such as `Options` / `选项`, `Text evidence` / `文本证据`, `Source info` / `来源信息`, and `filters` / `筛选`. They use low-chrome disclosure styling with `aria-expanded` or native `<details>` semantics.
- **Status**: reports outcome or blockage. Status text is never a button label and never repeats the command. Use terse receipts such as `re-ingest complete · search refreshed` / `重处理完成 · 搜索已刷新` or raw `err:` diagnostics.
- **Section label**: names an information region, not the action inside it. Section labels use nouns and MUST NOT duplicate adjacent command text. If a section would contain only one command with the same visible text, omit the section label.

Risk confirmation taxonomy is [SHARP]: single selected-item, rerunnable operations such as Inspector item regenerate do not require a second confirmation. Batch rewrites such as library reprocess and destructive operations such as source deletion or State import keep inline confirmation. State import confirmation must happen before replacement begins, adjacent to `[IMPORT STATE]`, with `[CONFIRM IMPORT]` and `[CANCEL]` commands or equivalent inline bracket actions. Disclosures and filters never require confirmation.

Accent/fill rule: active Resonate is the only common control that may use filled accent treatment. Navigation current state and command hover/focus must not spend the accent token.
### RESOFEED Utility Menu (`utility-menu`)
- **Intent**: [SHARP] Keep low-frequency global navigation and system operations discoverable without occupying persistent top chrome.
- **useFor**: `TODAY`, `SOURCE LEDGER`, processing language control, guarded `[REPROCESS LIBRARY]`, and terse current-operation context when it affects utility actions.
- **avoidFor**: Settings dashboard, preference center, task/job dashboard, activity history, command ledger, onboarding wizard, decorative brand menu, unrelated feature links, or mixed navigation/command selected states.

Anatomy: the closed top chrome shows only the `RESOFEED` label/button and the Steer field. Opening `RESOFEED` reveals a flat menu/panel with two compact groups: `NAV` / `导航` for surface routes (`TODAY`, `SOURCE LEDGER`) and `SYSTEM` / `系统` for low-frequency global operations (`LANG: EN`/`LANG: ZH`, `语言：中文`, and guarded `[REPROCESS LIBRARY]` / `[重处理资料库]`). The panel uses `{components.utility-menu}`, stark 1px rules, no shadow, no blur, no icons, and no preference prose beyond action-scoped warnings. It may appear as a popover on desktop and as a flat full-width utility sheet on narrow screens.

State contract: `NAV` items are navigation items, not bracket commands. Current route uses primary text plus semantic `aria-current` or `aria-pressed`; it MUST NOT use background inversion, filled borders, accent fill, or bracket styling. `SYSTEM` actions follow the global interaction taxonomy: language is a state text action whose state is in the label, while library reprocess is a bracket command.

Warning placement: rewrite warning copy such as `Existing readable item content will be rewritten. Source identifiers remain unchanged.` / `已有可读内容将被重写。来源标识保持不变。` belongs to `[REPROCESS LIBRARY]` / `[重处理资料库]` only. It MUST NOT visually attach to the language control. The warning may be visible directly under the reprocess action or shown on focus/confirming, but it must remain adjacent to the reprocess action and smaller/lower-priority than the command.

Keyboard and accessibility: the `RESOFEED` trigger is a real button with `aria-haspopup="menu"` or equivalent disclosure semantics and `aria-expanded`. Opening the menu moves focus to the first item; `Escape` closes it and returns focus to `RESOFEED`; tab order remains linear. Menu status/error text uses visible inline text and `aria-live` as specified by each contained operation. Do not hide language/reprocess exclusively behind hover.
### Current Operation Status (`current-operation-status`)
- **Intent**: [SHARP] Explain in-memory heavy work that blocks a requested operation, without turning fetch/ingest into durable jobs.
- **useFor**: Visible running status near Source Ledger/operational utility surfaces; conflict details after blocked `[RUN INGEST]`, duplicate same-source `[FETCH]`, source-capacity-exhausted `[FETCH]`, `[REPROCESS LIBRARY]`, Inspector `[REGENERATE]`, or language mutation; best-effort phase/count text from `GET /api/runtime/operation`, row-local fetch state, or matching MCP/UI current-operation data.
- **avoidFor**: Durable jobs, queues, task dashboards, activity/history ledgers, retry panels, progress timelines, command history, sync status, or persisted audit records.

Anatomy: a single terse line or two-line block, hidden while idle unless it explains a disabled/blocked operation. Canonical text shape is `op: <kind> · actor:<actor> · phase:<phase> · <counts/message> · since <time>`. Allowed operation kinds are `background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, and `item_reingest`. Allowed actors are `background`, `human`, and `agent`. Scope may appear as `scope: all sources`, `scope: source:<name>`, `scope: N source fetches`, `scope: library`, or `scope: item:<title-or-id>`. Counts are best-effort and must not imply durable completion guarantees.

Placement: [SHARP] show running current-operation status in the Source Ledger header/status area, in the opened `RESOFEED` utility menu, or adjacent to the Inspector re-ingest action only when relevant. Row-level source fetches may show state directly on the affected rows instead of forcing every active source fetch into one global status line. The status must not appear as a persistent global top strip when idle. If a feed-level background ingest is running but no action is blocked, Source Ledger may show the line; the feed itself should remain calm.

States: idle hidden, running, blocked conflict, completed transient receipt, failed raw error. Running state uses `{components.current-operation-status}` and text replacement only. Conflict state uses `{components.current-operation-conflict}` and includes the current operation detail; it must not show only `err: operation already running`.

Conflict copy examples:

- `err: operation already running — op: background_ingest · actor:background · phase:fetch · 17/128 sources · since 14:05:11`
- `err: fetch already running — op: source_fetch · actor:human · scope: source:simonwillison · phase:fetching · since 14:06:02`
- `warn: ingest skipped 3 busy sources — op: manual_ingest · actor:human · scope: all sources · phase:complete · since 14:06:02`
- `err: reprocess blocked — op: source_fetch · actor:human · scope: source:simonwillison · phase:fetching · since 14:06:02`
- `err: re-ingest blocked — op: item_reingest · actor:human · scope: item:item_01 · phase:processing · since 14:07:33`

Keyboard and accessibility: status lines are visible text. Running updates use `aria-live="polite"` and should update no more frequently than useful phase/count changes. Conflict/errors use `aria-live="assertive"`. When a user triggers a blocked action, keep focus on the trigger if it remains actionable, or move focus to the adjacent conflict line with `tabindex="-1"` and then restore predictable tab order. Do not use spinner-only or color-only status.

### Language Control
- **Intent**: [SHARP] Expose the persisted processing language as a terse global pipeline state.
- **useFor**: Switching future processing language from the `RESOFEED` utility menu when no source-scoped ingest/fetch attempt or global-exclusive operation is running; optional `/doctor` raw utility echo; announcing language update success/failure/conflict.
- **avoidFor**: Persistent top-chrome badge, selected tab, filled toggle, per-item translation toggle, settings panel, preference center, language wizard, automatic existing-library rewrite, or mixed-language batch creation.

Anatomy: a compact text control using `{typography.chrome}` such as `LANG: EN` or `LANG: ZH`, or localized equivalents `语言：英文` / `语言：中文`. It lives in the opened `RESOFEED` utility menu under `SYSTEM` / `系统`, with an optional raw `/doctor` utility echo. The current language is expressed by the label text itself. It must not use persistent background inversion or warning copy to communicate state. Hover/focus may use the same terminal-style interaction as bracket commands only while the control is being interacted with.

Behavior boundary: language switching changes future processing language only. It MUST NOT imply that existing readable content will be rewritten. The library rewrite warning belongs to `[REPROCESS LIBRARY]` / `[重处理资料库]`, not to the language control.

States: English, Chinese, updating, conflict, failed. Updating keeps dimensions stable and uses terse text only. Conflict uses the Current Operation Status pattern, e.g. `err: language blocked — op: item_reingest · actor:human · phase:processing`. Failure uses raw `err: <diagnostic>` copy and the existing feedback-line style.

Keyboard and accessibility: language control is a real button/control with an accessible name that announces the current processing language and the target action. The document `<html lang>` must reflect the active UI language (`en` or `zh-CN` unless a narrower Chinese locale is chosen later). Successful, blocked, or failed language updates MUST be announced via an `aria-live="polite"` terse status line for success and `aria-live="assertive"` for conflict/failure.
### Reprocess Library Action
- **Intent**: [SHARP] Explicitly rewrite existing stored user-readable item content into the current processing language and rebuild search indexing.
- **useFor**: Low-frequency guarded library reprocess from the `RESOFEED` utility menu; conflict feedback that references the shared current-operation snapshot.
- **avoidFor**: Persistent top chrome, language-control warning copy, automatic language-change side effect, progress dashboard, durable job, task history, queue, or background sync flow.

Anatomy: a terse operational bracket command, preferably `[REPROCESS LIBRARY]` / `[重处理资料库]`, inside the `RESOFEED` utility menu under `SYSTEM` / `系统`. Rewrite warning copy belongs directly with this action: `Existing readable item content will be rewritten. Source identifiers remain unchanged.` / `已有可读内容将被重写。来源标识保持不变。` It may appear directly below the idle reprocess action, on focus, or in confirming state, but it MUST NOT appear between the language control and the reprocess command as if language switching caused the rewrite.

States: default, confirming, running, complete, conflict, failed. Running state uses text replacement only, e.g. `[REPROCESSING...]`, plus the Current Operation Status line when available; no spinner, progress bar, wizard, dashboard, queue view, or activity log is allowed. Confirming state replaces the default action with two bracket commands: `[CONFIRM REPROCESS]` and `[CANCEL]`, and keeps the rewrite warning adjacent to those commands. Conflict state uses terse copy with current operation detail, e.g. `err: reprocess blocked — op: background_ingest · actor:background · phase:fetch · 17/128 sources`.

Keyboard and accessibility: the action must expose its destructive/operational meaning, e.g. `Reprocess existing library and rebuild search index`. The warning must be in the action's accessible description when visible or relevant.
Focus management across states:
- `confirming`: keep/place focus on the `[CONFIRM REPROCESS]` action;
- `running`: use `aria-disabled="true"` instead of the native `disabled` attribute to disable the action without losing keyboard focus;
- `conflict`, `complete` or `failed`: return focus predictably to the trigger or adjacent text, and announce result via an `aria-live` region.
Completion/failure messages use live regions and remain terse.
### Source Identifiers

Purpose: preserve trust anchors when item-readable content is processed in another language.

The following identifiers must render unchanged and must not be translated, summarized, transliterated, beautified, or rewritten: URL, source title, source URL, canonical URL, and original link.

Accessibility: source identifiers MUST use `translate="no"` (or equivalent implementation) and remain screen-reader readable as literal provenance anchors.

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

### List Meta Row (`list-meta-row`)
- **Intent**: [SHARP] One-line machine-texture metadata rail for high-density scanning.
- **useFor**: Source display name, relative age, extraction availability, optional agent receipt, value tier, and inline time-group badge.
- **avoidFor**: Verbose `key: value` labels, raw URLs, original source title, multi-line provenance, chips with borders, or any metadata that pushes the title downward.

Rules: The list metadata row is a flat inline flex row using `{typography.metadata}`, `{colors.muted}`, and dot separators. It MUST render known fields by value and position, not by repeated prefixes: use `TLDR AI FEED · 1m · 全文 · 模型支持 · 高价值`, not `src: TLDR AI Feed · 来源标题: ... · 价值：高价值`. Source labels are accessible via `aria-label`, not visual prefixes. The row wraps only at narrow widths; before wrapping, less important tokens drop in this order: value tier, model provenance, extraction label, source title. `TODAY`, `YESTERDAY`, and `EARLIER` may occupy the far-right slot on the first row in each group without adding vertical height.

### Metadata Token (`metadata-token`)
- **Intent**: [FLEXIBLE] Atomic metadata text value inside a flat row or frontmatter value.
- **useFor**: Short source names, `1m`, `全文`, `来源摘录`, `模型支持`, `高价值`, `简报`, `agent:delivery-bot`, or a concise quality phrase where a qualifier is genuinely needed.
- **avoidFor**: Pills, badges, navigation, long labels, URLs, translated/laundered source identifiers, or repeated field prefixes in reader surfaces.

Rules: Metadata tokens are text atoms; use spacing, order, and separators to communicate meaning. Use explicit words only when the value would be ambiguous without them. In Chinese Inspector Frontmatter, value-tier quality should be localized as compact text such as `质量：高价值` or `质量：简报`; Feed rows still show values by position and MUST NOT render `价值:` / `quality:` prefixes.

### Feed Item
- **Intent**: [SHARP] Compact scan row for triage, not the full structured reading payload.
- **useFor**: Source/time/provenance metadata, localized display title when available, 1–2 line core-insight-first Chinese preview, value/text-evidence token when space allows, selected state, and Resonate action.
- **avoidFor**: `src:`/`来源标题:`/`价值:` visual prefixes, raw URLs, original source title duplication, Key Points, multi-bullet lists, full article body, text evidence disclosure, re-ingest controls, duplicate Summary + Core Insight blocks, standalone left-edge color markers, or miniature article-card treatment.

Purpose: scan one RSS-derived item with maximum data-ink efficiency.

Anatomy: `List Meta Row` → localized feed title → clamped core-insight-first preview → independent 44x44 Resonate action. The metadata row renders values by position and separator, not repeated labels: `TLDR AI FEED · 1m · 全文 · 模型支持 · 高价值` is correct; `src: TLDR AI Feed · 来源标题: ... · 价值：高价值` is not. Source/title/provenance meaning remains available through accessible names and the Inspector Frontmatter, not through redundant visual prefixes in every row.

Feed rows are triage surfaces, not miniature article cards. Title uses `{typography.feed-title}` on desktop and mobile. The preview line uses `{typography.feed-summary}` but its content priority is `core_insight` first, then `summary`, then source-backed fallback text when generated content is unavailable. This is intentional: the title already says what the item is about; the preview should answer why it matters or why it may deserve inspection. The preview clamps to two lines on desktop and one line on narrow/mobile previews. The text stack must stay continuous: metadata, title, and preview sit in one column with 4px title-to-preview separation. The independent 44x44 Resonate action may sit in a side column, but it must not force a blank row or enlarge the title-to-preview rhythm. Full summary, raw excerpt, full body, source title, original link, and provenance audit belong in the Inspector. Bordered source pills are allowed in the ledger and low-frequency utility contexts, but the feed must use flat monospace metadata with separators to preserve vertical density.

Preview source rule: [SHARP] Feed rows MUST NOT show both `summary` and `core_insight`. Prefer `core_insight` when present because Feed is a decision surface. Use `summary` only as fallback when `core_insight` is missing or unusable. Use RSS/source excerpt only when model-backed generated preview is unavailable.

Key Points exclusion: [SHARP] Feed rows MUST NOT show `key_points`, bullets, numbered lists, Markdown list strings, or inferred mini-lists. If `key_points` exists on the item, the Feed still shows only the compact title/core-insight-first preview and leaves the 3–5 point structure to the Inspector. This preserves scan speed while still supporting high-density comprehension after Inspect.

States:

- default;
- hover/focus: tonal shift or outline only, no translation, no gutter strip;
- selected: no standalone colored left marker, vertical strip, gutter chip, pseudo-element block, or other isolated color block. Selected state may use a non-layout-shifting whole-row tonal treatment only when it stays as quiet as surrounding rules, or it may rely on `aria-current` plus the visible Inspector context. Selected state means "currently open in Inspector," not keyboard focus, importance, recommendation, unread, or priority. Use focus rings only for true keyboard focus;
- externally surfaced: add compact `agent:<name>` marker only when the item was actually delivered by an external agent;
- RSS-excerpt text evidence: text marker `来源摘录` / `source excerpt` with warning color and explanation in Inspector;
- raw fallback: show feed excerpt when core-insight-first generated preview is unavailable;
- grouped duplicate/story: transparent grouping must preserve access to every source item and provenance, and may appear only when the backend item data includes authoritative grouping (`story_key` or `duplicate_of_item_id`). The frontend must not infer a group by stripping URL fragments, collapsing synthetic feed-entry URLs, or comparing host/path alone.

No unseen/bold state. No numeric count. No hidden spam collapsing. No user-facing density mode unless future accessibility research proves one is necessary; compact feed density is the product default while touch targets stay minimum 44 CSS px. On mobile, density is achieved through clamping, flat metadata, and restrained padding—not by reducing tap targets or making the whole surface feel like a spreadsheet.

Time-group labels inside the feed (`TODAY`, `YESTERDAY`, `EARLIER`) must feel anchored without breaking the grid. Use uppercase monospace metadata styling and align them to the far right inside the metadata row of the first item belonging to that group. They should consume zero extra vertical height, preserving a mathematically consistent rhythm between feed row separators.

Keyboard and accessibility: feed items are reachable in reading order; `Enter` or `Space` opens Inspector, arrow-key roving focus is allowed only if normal `Tab` order still works. Source, agent, text-evidence, grouped markers, age tokens, and time-group markers need accessible names, e.g. `Source: TLDR AI Feed`, `Age: 1 minute ago`, `Time group: TODAY`, `Extraction: full`, `Grouped story with 4 source items`. The grouped marker must be absent when `story_key` and `duplicate_of_item_id` are both `null`.
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

### Compact Evidence Link (`compact-evidence-link`)
- **Intent**: [SHARP] Short text link to source-backed provenance without exposing raw URL strings in the reading flow.
- **useFor**: `原文链接`, `来源链接`, `original link`, `feed link`, and other explicit source/provenance link anchors.
- **avoidFor**: Displaying full `https://...` strings, decorative outbound icons, generic `click here`, or replacing raw URLs inside Source Ledger where URL management is the task.

Rules: Reader and Inspector surfaces MUST NOT show raw URLs unless the source-management task itself requires URL editing or verification. Keep the literal URL in the DOM target and accessible name; show a compact anchor in visible text.


### Inspector Frontmatter (`inspector-frontmatter`)
- **Intent**: [SHARP] Compact provenance table that keeps the Inspector reading-first while preserving auditability.
- **useFor**: Original source title, compact article/feed links, AI/model status, extraction/source-depth status, quality/value tier, and latest attempt state.
- **avoidFor**: Full URLs, duplicate top metadata strips, repeated status/provenance lines below the grid, raw paragraph blocks before the title, dashboard status, provider settings, or replacing the structured reading sections.

Rules: Render as a semantic `<dl>` or equivalent accessible key/value grid directly below the Inspector title. Labels are uppercase metadata texture (`ORIGINAL`, `LINKS`, `AI STATUS`, `ATTEMPT`) and values are concise. The grid MUST be visually smaller than the title and reading sections. It replaces the previous repeated blocks (`src:`, `来源标题:`, `条目 URL`, `来源 URL`, and raw article/feed URL rows) with a 2-column compact structure.

Information ownership: `AI STATUS` is the canonical visible row for model/summary provenance, extraction/source depth, and quality/value tier. OK/model-backed items MUST NOT repeat those same facts in a second visible line such as `原文不可用 · 摘要/核心洞察可用` or `文本证据：仅 RSS 摘录 · 摘要来源：模型支持`. Generated-content availability is proven by the actual `摘要` / `核心洞察` / `要点` sections. Only fallback or model-failure states may add one low-chrome processing line below Frontmatter.

### Inspector Frontmatter Label (`inspector-frontmatter-label`)
- **Intent**: [SHARP] Right-aligned metadata key for fast visual parsing.
- **useFor**: `ORIGINAL`, `LINKS`, `AI STATUS`, `ATTEMPT`, `SOURCES`, or localized equivalents when UI language is Chinese.
- **avoidFor**: Sentence-length explanations, raw backend field names, decorative captions, or body section labels such as `摘要`.

### Inspector Frontmatter Value (`inspector-frontmatter-value`)
- **Intent**: [SHARP] Concise provenance payload paired with a frontmatter label.
- **useFor**: Source title, `原文链接 · 来源链接`, `模型支持 · 全文 · 质量：高价值`, `模型支持 · 来源摘录 · 质量：简报`, `失败 · 已保留现有摘要和要点`, and other short audit values.
- **avoidFor**: Long paragraphs, raw URLs, full article excerpts, Key Points, duplicate explanatory status lines, or re-ingest form controls.

Rules: Frontmatter values must remain metadata-sized and single-purpose. If a value names a source-depth or quality fact, do not repeat the same fact again in a nearby visible paragraph.

### Inspector Pane
- **Intent**: [SHARP] Deliberate Inspect surface for detail reading, verification, and one-time selected-item re-ingest.
- **useFor**: Selected item detail, compact provenance Frontmatter, Chinese structured generated content (`摘要`, `核心洞察`, `要点`), 3–5 controlled Key Point list items, fallback text evidence, grouped-source disclosure, collapsed Text evidence, and inline `[REGENERATE]` / `[重新生成]` controls scoped to this item only.
- **avoidFor**: Duplicate top metadata strips, duplicate status/provenance paragraphs, full raw URLs, global ingest controls, Source Ledger operations, provider settings, provider tabs, marketplace UI, durable model/prompt preferences, modals, toasts, dashboards, job history, related-content modules, or client-inferred source grouping.

Purpose: deliberate Inspect surface for detail reading and verification.

Anatomy: localized title first, then `Inspector Frontmatter`, then at most one fallback/failure processing line when needed, then structured reading sections, item-scoped re-ingest panel, collapsed Text evidence disclosure, and source-list disclosure for grouped stories. Ordinary configured-source RSS items MUST NOT show a generic `why: fresh from configured source` / `为什么：来自已配置来源的新条目` line; a why-this-appeared line is allowed only when the source path is non-obvious, such as external agent surfacing, authoritative grouped stories, or another exceptional provenance reason. The title must begin above the fold; metadata audit must not occupy the dominant vertical band. The previous verbose metadata block (`src: ...`, `来源标题: ...`, `条目 URL`, `来源 URL`, raw article/feed URL rows) is replaced by the Frontmatter grid.

Inspector Frontmatter rows are [SHARP]:

- `ORIGINAL`: the original source title only when it differs from the display title or is needed for provenance.
- `LINKS`: compact evidence anchors such as `原文链接 · 来源链接`; raw URL strings are forbidden in the reading flow.
- `AI STATUS`: the sole visible owner of summary provenance, extraction/source-depth status, and quality/value tier for OK/model-backed items, e.g. `模型支持 · 全文 · 质量：高价值`, `模型支持 · 来源摘录 · 质量：简报`, or `模型支持 · 原文不可用 · 质量：高价值`.
- `ATTEMPT`: latest item re-ingest attempt only when relevant, e.g. `失败 · 已保留现有摘要和要点`.

The structured reading order is [SHARP]: `摘要` section, `核心洞察` section, then `要点` section. `核心洞察` is exactly one concise Chinese sentence; multi-point requests route into `要点`. `要点` is a semantic `<ul>`/list control with 3–5 Chinese `<li>` items from the structured `key_points` array, not a Markdown blob, not generated HTML, and not copied into the Feed.

States: empty/no-selection (minimal placeholder indicating no item is selected), loading raw detail, OK model-backed Chinese content, latest re-ingest attempt failed while preserved content remains visible, RSS-excerpt Text evidence, unavailable original, grouped-story sources, externally surfaced receipt, and item re-ingest states listed below. OK/model-backed states do not need a second visible availability line; fallback/model-failure states keep exactly one useful processing line.

#### Initial selection and stable transitions

On desktop TODAY, if feed items exist and no explicit item route is active, the first feed item MUST be selected automatically after owner-token hydration and feed load complete. The right Inspector pane should only be empty when there are no feed items, the owner token is not accepted, or the app is still loading.

Switching from one selected item to another MUST NOT collapse, blank, or visibly tear down the Inspector layout. Keep the previous Inspector structure mounted until the new item detail is ready, then replace content in place. A terse low-chrome loading line is acceptable, but it must not shift the title/frontmatter/body geometry or flash a blank pane.

#### Desktop split alignment
On desktop split view, the Inspector reading group (title, Frontmatter, reading sections, points, and item-scoped controls) belongs to the right pane, not to a floating inner scroll surface. These elements MUST share one coherent horizontal measure and a consistent left edge inside that measure.

Inspector whitespace balance is [SHARP]. The perceived blank space from the visible split line to the reading group and from the reading group to the right pane edge should look balanced; the two sides SHOULD differ by no more than one spacing row (`12px`) at common desktop widths. Do not allow the middle gutter plus Inspector padding to stack into a visibly heavier left-side void.

Readable measure is [FLEXIBLE] but scroll ownership is [SHARP]. Inspector text sections may keep a max-width for legibility, and the measured reading group may be horizontally balanced inside the pane. That max-width only controls line length and horizontal rhythm. It does not define pane width, scrollbar position, or scroll ownership. The outer Inspector surface still spans the pane, and the `.detail-pane` remains the scrollport.

Extra horizontal width is absorbed in this order: outside the capped workbench shell, then a capped middle gutter that does not distort Inspector left/right balance, then balanced breathing room around the Inspector reading group. A vertical scrollbar between the reading group and a trailing empty gutter is a layout bug because it makes the reading group, not the pane, read as the scroll surface.

#### Inspector divider and content measure
Inspector divider lines are [SHARP] content-measure artifacts, not independent decorative rules. Title row, Frontmatter borders, processing/status lines, Summary/Core/Key Points sections, item re-ingest panel, Text Evidence disclosure, Source Info disclosure, grouped-source disclosure, and story/provenance footnotes MUST share the same horizontal measure and left/right edges inside the Inspector reading group.

Do not mix `68ch`, `76ch`, `600px`, and unconstrained detail blocks in the same Inspector route unless they are wrapped by one shared reading group that makes their visible borders align. A divider line that starts or ends at a different x-coordinate from adjacent Inspector dividers is a layout bug.

This applies to desktop split and narrow Inspector routes. Mobile may use a pixel cap for the whole reading group, but every visible divider inside that group must still align to that mobile measure.

### Inspector Summary (`摘要`)
- **Intent**: [SHARP] Chinese contextual explanation of the selected item.
- **useFor**: Model-backed `summary` text, localized to Chinese when processing language is Chinese, placed before `核心洞察` and `要点` in Inspector.
- **avoidFor**: Feed-row Key Points, raw Markdown lists, source/provenance literals, fallback ghost text when summary is unavailable, or a catch-all container for schema-changing prompt requests.

### Inspector Core Insight (`核心洞察`)
- **Intent**: [SHARP] One concise Chinese sentence answering why the selected item matters.
- **useFor**: Validated `core_insight` only; a single sentence displayed as prose below `摘要`.
- **avoidFor**: Bullet lists, numbered lists, multi-sentence paragraphs, Markdown, field labels, source identifiers, or any user prompt request to “分点” that should instead populate `key_points`.

### Inspector Key Points (`要点`)
- **Intent**: [SHARP] High-density structured comprehension for the selected item without bloating Feed rows.
- **useFor**: Rendering `key_points` as exactly 3–5 Chinese, source-grounded list items in Inspector using controlled list semantics such as `<section aria-label="要点"><ul><li>…</li></ul></section>`.
- **avoidFor**: Feed rows, raw Markdown strings, generated HTML, decorative bullets without data backing, generic filler, duplicate copies of `核心洞察`, fewer than 3 items, more than 5 items, or source/provenance literals translated into Chinese.

### Inspector Item Re-ingest (`inspector-reingest-panel`)
- **Intent**: [SHARP] Re-run model processing for exactly the currently inspected item as a one-time operation.
- **useFor**: one visible direct command `[REGENERATE]` / `[重新生成]`, an `Options` / `选项` disclosure for temporary OpenRouter model selection loaded from canonical `GET /api/runtime/openrouter-models` (with `GET /api/runtime/openrouter/models` compatibility-only) and optional extra prompt text, and result/conflict/error text for `POST /api/items/{id}/reingest` or matching MCP `reingest_item`.
- **avoidFor**: Saving default models, saving prompt templates, changing global processing language, reprocessing the library, re-ingesting a source/feed/all items, provider marketplace, provider abstraction UI, provider tabs, settings dashboard, modal confirmation, toast notification, spinner, progress bar, animated ellipsis, or durable job/status history.

Placement: [SHARP] the re-ingest affordance appears inside the Inspector only, after provenance/processing metadata and before the Text evidence disclosure or long reading body. It must not appear in global chrome, Feed rows, Source Ledger, the `RESOFEED` utility menu, `/doctor`, or search controls. Desktop uses the right Inspector scroll container; mobile uses the full-screen Inspector route.

Anatomy and copy: idle state shows one short visible bracket command, `[REGENERATE]` or `[重新生成]`, and an adjacent disclosure labelled `Options` / `选项` only when advanced model/prompt controls are available. The panel SHOULD omit a visible section label; if a label is needed for accessibility or grouping, it must be a non-redundant noun and must not repeat the command. It MUST NOT render `重新生成` above `[重新生成]`, `本文重处理` beside `[重新处理本文]`, or any equivalent title/button duplicate. Clicking `[REGENERATE]` runs immediately with current advanced values; there is no second `[CONFIRM]` / `[确认]` step for this single selected item. Model selector and extra prompt are advanced controls, collapsed by default inside `Options` / `选项`, not part of the quick default path. The model list is OpenRouter-only; label it as `model:` / `模型：` without provider tabs. The selector's first/default option is a local UI option such as `default: account_default` / `默认：账户默认模型`; selecting it sends `model: null` or omits `model`, never the literal `account_default` as a provider model ID. Extra prompt label must make non-persistence explicit, e.g. `extra prompt (one-time, not saved)` / `额外提示（仅本次，不保存）`.

Model-list diagnostic: [SHARP] availability text is helper metadata inside advanced options, not reading content. It MUST use `{typography.metadata}` / muted ink, not `{typography.payload}`. Keep the visible line short, e.g. `342 个 OpenRouter 模型可选` or `模型：342 个可选`; do not render a large paragraph such as `模型列表：342 个 OpenRouter 模型可用`.

One-time prompt authority copy: [SHARP] the extra prompt is guidance only for the selected item. Because the textarea is hidden until advanced options open, visible helper text adjacent to the textarea may be terse metadata-sized copy such as `guidance only; cannot override schema, language, source identifiers, safety, status, or persistence` / `仅作指导；不能覆盖结构、语言、来源标识、安全、状态或持久化边界。`. If the longer fact-selection boundary is needed, keep it in hidden/accessibility help rather than a large visible paragraph: `只能在有来源支持的事实中改变重点、角度或事实选择。` Do not echo prompt text in receipts, errors, diagnostics, screenshots intended as logs, or source/provenance copy.

Persistence boundary: [SHARP] selected model and extra prompt are temporary UI state for the active Inspector item. They are cleared when the panel is cancelled, when another item opens, after completion/failure acknowledgement, or when the Inspector route unmounts. The UI must not store them in local storage, settings, state export, source records, steering receipts, item provenance, or any durable preference.

States:

- idle: visible `[REGENERATE]` / `[重新生成]` direct command, optional `Options` / `选项` disclosure collapsed, no title/button duplicate;
- options-open: model selector, short model-list diagnostic, optional prompt field, and prompt authority copy are visible below the disclosure; the direct `[REGENERATE]` command remains the only execution control;
- model-list-loading: advanced selector row shows `models: loading` with text replacement only;
- model-list-unavailable: advanced selector row shows raw `err: models unavailable`; default-model re-ingest remains available by sending `model: null`; no fallback marketplace or manual provider setup UI;
- running: command text becomes `[RE-INGESTING ITEM...]` / `[正在重新生成...]` or a similarly direct running label with `aria-disabled="true"`; no spinner, progress bar, animated ellipsis, toast, modal, or dashboard;
- complete: terse inline receipt such as `re-ingest complete · search refreshed`; refreshed item content appears when available;
- conflict: raw current-operation conflict detail, e.g. `err: re-ingest blocked — op: item_reingest · actor:human · scope:item_01 · phase:processing · since 14:00:00`;
- failed: [SHARP] non-destructive localized attempt-failure line adjacent to the panel while existing localized title, summary, core insight, and 3–5 Key Points remain visible. Canonical Chinese shape: `上次重处理失败 · 解码错误 · 已保留现有摘要和要点`. The UI must not replace preserved content with a URL-like title, raw error, empty Summary/Core, or fallback source excerpt solely because the latest re-ingest attempt failed. Raw diagnostic detail may remain available to developers where already supported, but user-facing failure text is localized and attempt-scoped.

Accessibility and focus: the direct `[REGENERATE]` / `[重新生成]` command is reachable in normal tab order and executes immediately. Advanced model/prompt controls are available through the `Options` / `选项` disclosure with `aria-expanded` or native `<details>` semantics and an accessible region label. Loading/unavailable/complete/failed messages use visible text and `aria-live="polite"`; conflict/errors use `aria-live="assertive"`. Running uses `aria-disabled="true"` rather than removing focus from the trigger. Completion returns focus to the refreshed Inspector heading or the re-ingest trigger. The panel must not trap focus like a modal.

### Text Evidence Disclosure (`source-disclosure`)
- **Intent**: [SHARP] Keep real source-backed text evidence available while making every newly opened Inspector item begin with Text evidence collapsed and visually secondary to model-backed reading content.
- **useFor**: Raw RSS excerpt, extracted article text, source-backed Text evidence, and grouped-source provenance lists inside Inspector.
- **avoidFor**: Hiding provenance permanently, making Text evidence look like model-backed Summary/Core, showing generated Summary/Core as if it were Text evidence, collapsing model-backed Summary/Core, decorative accordions, lazy-loading spinners, duplicate summary-provenance banners, or client-inferred source grouping.

Definition: `摘要` is synthesized, target-language reading content produced by the model from available evidence. `Text evidence` / `文本证据` is raw or cleaned evidence from the feed/article used to verify what the model summarized. Summary answers “what should I understand?”; Text evidence answers “what did this come from?”. `Source info` / `来源信息` is source/feed metadata and must not be confused with source-backed text evidence.

Text-evidence truth rule: [SHARP] Text evidence MUST be source-backed evidence only. It may use cleaned `extracted_text`, `feed_excerpt`, or `display_excerpt` when those fields represent source material. It MUST NOT fall back to `summary`, `core_insight`, `key_points`, model-backed reading body, or any generated target-language text. If no usable source-backed text exists, do not render a text-evidence body; rely on the compact `原文链接` / `original link` in Inspector Frontmatter and, if needed, a muted one-line unavailable note. Do not fabricate “real source text” from generated content.

Default state: [SHARP] Text evidence is collapsed by default for every newly opened Inspector item. Use accessible disclosure semantics (`<details>`/`<summary>` or equivalent button with `aria-expanded`, `aria-controls`, and labelled region). The visible summary line should be terse and non-duplicative, preferably `Text evidence` / `文本证据`; it may include provenance such as `RSS excerpt only` only when the disclosure itself needs disambiguation. Source/feed metadata disclosure should use `Source info` / `来源信息`, not an adjacent `Source details` / `来源详情` label that creates a second source-prefixed disclosure beside `Text evidence` / `文本证据`. Opening a new item resets the disclosure to collapsed. User expansion state is ephemeral navigation/UI state only and must not be saved.

Visual hierarchy: [SHARP] text evidence body must not use the same visual treatment as Summary/Core reading paragraphs. When expanded, text evidence uses muted evidence styling: smaller metadata/chrome-sized type or a bordered low-chrome evidence block, preserved line wrapping, and no section-title rhythm. Summary/Core keep payload typography. This prevents raw evidence from competing with synthesized reading content.

Necessity: Text evidence remains useful as an audit/evidence affordance, especially when the model output looks suspicious, the article was only partially extracted, the original is unavailable, or the user wants to verify grounding without leaving the app. The primary path for reading the original article is still the compact original link. Text evidence is not primary reading content and should never be open by default for normal model-backed items.

Grouped-source disclosure contract: Inspector may show a source-list disclosure only for authoritative backend grouping: non-null `story_key`, non-null `duplicate_of_item_id`, or non-empty backend `provenance.grouped_source_items` on the selected item/detail. It must list backend-provided source items/provenance without merging client-side identities. It must not compute groups by stripping URL fragments, by treating URLs that differ only by a synthetic feed-entry fragment as identical, or by host/path fallback. If authoritative grouping fields are absent, show the selected item as a standalone item even if URL normalization would make unrelated items look similar. This protects feeds whose entry URLs intentionally use fragments to identify distinct source items. When authoritative grouping exists, `.contract-grouped-sources` is intentionally open by default so the source roster is immediately auditable; this exception does not change the [SHARP] default-collapsed rule for ordinary Text evidence details.

Fallback Text-evidence contract: If target-language/model processing has not produced model-backed summary or core insight, Inspector must not render ghost Summary or Core sections. It shows exactly one low-chrome processing state line below title/original-link/provenance metadata, then one collapsed text evidence disclosure only if a source excerpt exists. Recommended copy is `target-language processing incomplete · summary/core unavailable · showing source excerpt` / `中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录`, followed by a disclosure summary such as `Text evidence: RSS excerpt` / `文本证据：RSS 摘录` and the raw RSS excerpt inside the controlled region. Model latency/error states use the same one-line pattern with `failed`/`失败`. Fallback source excerpt is provenance evidence, not completed synthesized target-language reading content. Source identifiers, original link, and source title remain literal.

OK model-backed contract: If model-backed summary/core/key_points exist, Inspector renders `摘要`, `核心洞察`, and `要点` as available. `AI STATUS` already owns the visible source-depth and summary-provenance facts, so the Inspector MUST NOT add a second visible line such as `text evidence: RSS excerpt only · summary provenance: model-backed`, `文本证据：仅 RSS 摘录 · 摘要来源：模型支持`, or `原文不可用 · 摘要/核心洞察可用`. Text evidence remains available behind the default-collapsed disclosure only when real source-backed text exists and is not merely generated summary/core text. If full article text is unavailable but RSS excerpt text exists, show that depth in `AI STATUS` and/or the disclosure summary, not as a duplicate banner. Key Points remain a controlled Inspector list even when text evidence is RSS-excerpt-only; they are not a Markdown fallback.

Note on Resonate Action: To maintain a clean, low-fatigue interface, the Inspector only duplicates the Resonate action when presented as a single-column mobile route (where the feed is hidden). In desktop split-pane mode, the Inspector does not show a star; the user relies on the permanently visible star on the selected feed item to their left.

Inspector must not include related-content carousels, recommendation modules, ads, banners, modal retries, toasts, or decorative error illustrations. It may expose source provenance and original links plainly.

Keyboard and accessibility: opening Inspector moves focus to the detail heading; closing/back returns focus to the originating feed item and preserves scroll. Original links, grouped sources, processing state, Text evidence, text-evidence status, summary provenance, and provenance labels must be screen-reader readable without repeating the same fact multiple times.

Processing-language addendum: Inspector title, model-backed dense summary, model-backed core insight, and reading body render stored target-language item content. Original link and source identifiers remain unchanged and visually/semantically act as provenance anchors. Inspector must not show AI-magic translation badges, side-by-side original/translation comparison, or a separate translation failure panel; the single processing line plus Text evidence is the trust model for fallback states.

On desktop, the Inspector is its own scroll container. Opening a different item resets the Inspector scroll position to the top without moving the Feed scroll. On mobile, Inspector remains a full-screen route.

### Source Ledger
- **Intent**: [SHARP] Flat source management and operational context without settings-dashboard behavior.
- **useFor**: Source rows, OPML source-list import/export, state export/import, manual `[RUN INGEST]`, per-source `[FETCH]`, and visible current operation status when work is running or blocks an action.
- **avoidFor**: Settings dashboard, durable job list, operation history, task queue, retry dashboard, command ledger, sync/merge controls, source hierarchy, tags, or a second URL-add field.

Anatomy: title, global ingest/current-operation status, global `[RUN INGEST]` action, a visually grouped Source List action cluster, a visually grouped Portable State action cluster, one terse muted helper line, flat source rows, source-level `[FETCH]` actions, `[DELETE]` action, and a low-chrome `source info` diagnostic disclosure. URL subscription must route users back to Steer; the Ledger does not provide a second manual URL paste field. Row fields are [SHARP]: source name, source URL, adjacent local-time last fetch timestamp or raw error diagnostic, and a right-aligned action block. The source name is backend `source.title`: after successful RSS/Atom fetch this should be the parsed feed title when available; before first successful fetch, URL-derived or OPML-imported fallback text is acceptable. Normal `status: ok` / `status: not_fetched` text is diagnostic detail, not primary row copy; show it in `source info`, `title`, or accessible text. Only error states such as `err: rss_fetch_error` should replace the timestamp/status slot visibly.

Action grouping is [SHARP]:

- `SOURCE LIST`: `[IMPORT OPML]` and `[EXPORT OPML]`. OPML is source-list exchange only: feed URLs and feed/source titles for interop with other RSS readers. OPML import/export must not imply steering rules, stars/resonance, reading history, or full app restore.
- `PORTABLE STATE`: `[EXPORT STATE]` and `[IMPORT STATE]`. State is ResoFeed JSON backup/restore for active sources, active steering rules, and currently resonated/starred items. State import is the destructive replace operation and MUST enter an adjacent inline confirmation state before replacement starts.

In Chinese mode, ordinary group labels should localize to `来源列表` and `状态迁移`; the exact bracket action tokens remain English. Source Ledger row labels may use localized `来源:` / `URL:` or omit prefixes through column rhythm. Literal source titles and URLs remain untranslated.

The toolbar shows at most one visible helper line: `OPML = 来源列表；State = 来源 + 规则 + 星标，导入会替换。` / `OPML = source list; State = sources + rules + stars, import replaces.` Do not also render a second always-visible State warning line. `[IMPORT STATE]` must still expose the destructive replacement warning through its accessible description and may show an inline warning only when the import control is focused, opening, confirming, or failed.

Source Ledger bracket command labels are [SHARP] exact English tokens across locales: `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]`, `[IMPORT OPML]`, `[IMPORTING OPML...]`, `[EXPORT OPML]`, `[EXPORTING OPML...]`, `[EXPORT STATE]`, `[EXPORTING STATE...]`, `[IMPORT STATE]`, `[IMPORTING STATE...]`, and `[DELETE]`. Localize surrounding prose and accessible names, not these visible Source Ledger bracket tokens. UI text must not render lowercase command variants such as `import opml`, `export opml`, `export state`, or `import state`, and must not render localized Source Ledger bracket command labels such as `[导入 OPML]`, `[导出 OPML]`, `[导出状态]`, or `[导入状态]` unless this contract is explicitly revised. Source row diagnostics are a disclosure, not a command; use low-chrome `source info` / `来源信息`, not `[DETAILS]`.

Manual ingestion boundary: `[RUN INGEST]` and `[FETCH]` are immediate operational commands, not durable jobs. They must not create a queue, job table, activity ledger, command history, sync primitive, or settings dashboard. They reuse the in-process current-operation/concurrency coordinator described in `docs/ARCHITECTURE.md`; conflict feedback is raw, terse, and includes current operation detail rather than only `err: operation already running`.

Parallel source ingest boundary: per-source `[FETCH]` is row-scoped, and `[RUN INGEST]` is a bounded in-request batch of source-scoped attempts. Different source rows may show `[FETCHING...]` at the same time when their fetch requests are running concurrently. A row already fetching keeps only that row's `[FETCHING...]` disabled state; unrelated rows may remain actionable until source capacity is exhausted. `[RUN INGEST]` may run while unrelated rows are fetching; it drains selected idle sources through bounded workers, while busy or externally capacity-unavailable sources are skipped/reported tersely rather than queued after the response. Do not add progress bars, spinners, job lists, queue labels, retry panels, or operation history to explain parallel ingest/fetches.

States:

- empty: `No sources. Paste RSS URL in Steer.`;
- OPML import default: `[IMPORT OPML]` in the `SOURCE LIST` action group;
- OPML import active: `[IMPORTING OPML...]`, disabled, no spinner, no progress animation;
- OPML import complete: revert to `[IMPORT OPML]` and show `imported N sources; OPML outlines flattened`;
- OPML import failed: revert to `[IMPORT OPML]` and show raw `err: <diagnostic>` text;
- OPML export default: `[EXPORT OPML]` in the `SOURCE LIST` action group;
- OPML export active: `[EXPORTING OPML...]`, disabled, no spinner, no progress animation;
- OPML export complete: revert to `[EXPORT OPML]` and show `exported sources.opml`;
- OPML export failed: revert to `[EXPORT OPML]` and show raw `err: <diagnostic>` text;
- global ingest default: `[RUN INGEST]` in the Ledger header/action bar;
- global ingest active: `[INGESTING...]`, disabled, no spinner, no progress animation; show `op: manual_ingest · actor:human · phase:<phase> · <counts/message> · since HH:MM:SS <timezone>` in the header status line when available;
- global ingest conflict: revert to `[RUN INGEST]` and show raw `err: operation already running — op: <kind> · actor:<actor> · phase:<phase> · <counts/message>` conflict text only for true global-exclusive blockers; busy or capacity-unavailable source rows are summarized as skipped source-level conflicts;
- global ingest complete: revert to `[RUN INGEST]` and update `last_ingest: HH:MM:SS <timezone>`;
- source fetch default: `[FETCH]` on the same row as the source;
- source fetch active: `[FETCHING...]`, disabled only for the affected row, no spinner, no progress animation; multiple different rows may show `[FETCHING...]` at the same time;
- source fetch conflict: revert to `[FETCH]` and show raw current-operation conflict text adjacent to the source, including same-source duplicate or `source_capacity_exhausted` capacity cases;
- source fetch complete: revert to `[FETCH]` and update `HH:MM:SS <timezone>` in the row timestamp slot;
- source fetch failed: revert to `[FETCH]` and show raw `err: <diagnostic>` text in the row timestamp/status slot;
- delete confirmation: terse confirmation for destructive removal;
- deletion error: raw line.

Timestamp rule is [SHARP]: `last_fetch` and `last_ingest` are UI display-only formatting derived from backend RFC3339 UTC fields and rendered in the viewer's browser local timezone by default. The visible timestamp must remove timezone ambiguity by including a short local hint when space allows, e.g. `上次抓取: 17:20:28 本地`, `17:20:28 本地`, `last_fetch: 17:20:28 local`, or `17:20:28 local`. If a non-local deployment timezone is intentionally used, the UI must label that timezone explicitly. The UI must not silently show UTC clock strings without a `UTC` label, and must not invent, persist, or send display clock strings back as canonical state; canonical API data remains RFC3339 UTC.

Raw diagnostic strings (`err: <diagnostic>`) must not break Source Ledger geometry. Show one line adjacent to the affected source on desktop, clamp visually at approximately 80 characters with an ellipsis, and expose the full diagnostic through the element `title` or an accessible details disclosure. On narrow/mobile layouts, allow wrapping to at most two lines before truncation. Preserve the literal `err:` prefix and never replace raw diagnostics with friendly copy.

Forbidden: folders, tags, pause/resume toggles, drag ordering, scoring sliders, source categories, job dashboards, durable progress surfaces, retry panels, ingest queues, activity ledgers, operation histories, command histories, sync/merge controls, backup-management UI, and a second URL subscription field.

Keyboard and accessibility: source rows are list items; action groups expose accessible group names such as `Source list actions` and `Portable state actions`; `[RUN INGEST]`, `[FETCH]`, `[IMPORT OPML]`, `[EXPORT OPML]`, `[EXPORT STATE]`, and `[IMPORT STATE]` are named buttons or keyboard-reachable file controls with stable 44px minimum hit targets; active states keep the same hitbox; delete is a named button (`Delete source: <name>`) and requires a terse confirmation before destructive removal; State import follows the State Portability inline confirmation sequence before destructive replacement. Current operation status uses `aria-live="polite"`; conflict details use `aria-live="assertive"` and remain visible near the blocked action. Timestamps should expose machine-readable `datetime` where feasible and accessible text clarifying local timezone. Focus returns to the triggering action or adjacent conflict line after a blocked command, and to the next row or Ledger heading after deletion.

Required DOM contract for manual ingest and portability controls:

```html
<section class="source-ledger" aria-labelledby="source-ledger-title">
  <header class="source-ledger__header">
    <h1 id="source-ledger-title">SOURCE LEDGER</h1>
    <span class="source-ledger__status" aria-live="polite">last_ingest: 14:00:00 local</span>
    <button class="bracket-action bracket-action--run-ingest" type="button">[RUN INGEST]</button>
  </header>
  <div class="source-ledger__tools" aria-label="Ledger actions">
    <div class="source-ledger__action-group" aria-label="Source list actions">
      <span class="source-ledger__group-label">SOURCE LIST</span>
      <button class="bracket-action bracket-action--import-opml" type="button">[IMPORT OPML]</button>
      <button class="bracket-action bracket-action--export-opml" type="button">[EXPORT OPML]</button>
    </div>
    <div class="source-ledger__action-group" aria-label="Portable state actions">
      <span class="source-ledger__group-label">PORTABLE STATE</span>
      <button class="bracket-action bracket-action--export-state" type="button">[EXPORT STATE]</button>
      <button class="bracket-action bracket-action--import-state" type="button" aria-describedby="state-import-risk">[IMPORT STATE]</button>
      <span id="state-import-risk" class="visually-hidden">Import State replaces active sources, rules, and stars.</span>
    </div>
    <span class="source-ledger__tools-helper">OPML = source list; State = sources + rules + stars, import replaces.</span>
  </div>
  <ul class="source-ledger__list">
    <li class="source-ledger__row">
      <span class="source-ledger__name">NYT</span>
      <span class="source-ledger__url">https://nyt.com/rss</span>
      <span class="source-ledger__status" aria-live="polite">14:02:05 local</span>
      <span class="source-ledger__actions">
        <button class="bracket-action bracket-action--fetch" type="button" aria-label="Fetch source NYT">[FETCH]</button>
        <button class="source-ledger__info-toggle" type="button" aria-expanded="false" aria-label="Source info NYT">source info</button>
        <button class="bracket-action bracket-action--delete" type="button" aria-label="Delete source NYT">[DELETE]</button>
      </span>
    </li>
  </ul>
</section>
```

CSS usage contract: `.source-ledger` uses `{components.source-ledger}`. `.source-ledger__header` uses `{components.source-ledger-header}` and must align `last_ingest` plus `.bracket-action--run-ingest` to the right side of the header. `.source-ledger__tools` groups `SOURCE LIST` and `PORTABLE STATE` actions using spacing or a thin divider; it must not make the groups look like settings cards. `.source-ledger__action-group` is an inline/flex group with an accessible label and compact `source-ledger__group-label`. `.source-ledger__tools-helper` is metadata-sized muted text and must not add a second warning-colored line. `.source-ledger__row` uses `{components.source-ledger-row}` and must use grid or flex columns that keep source name and URL stable while `.source-ledger__actions` is right-aligned; `[FETCHING...]`, `[INGESTING...]`, `[IMPORTING OPML...]`, `[EXPORTING OPML...]`, `[EXPORTING STATE...]`, and `[IMPORTING STATE...]` expand leftward and must not push source metadata. `.source-ledger__status` uses `{components.source-ledger-status}` with `font-variant-numeric: tabular-nums`; error variants use `.source-ledger__status--error` and `{components.source-ledger-status-error}`. `.source-ledger__status--error` and standalone `.raw-error-line` must clamp/wrap according to the `err: <diagnostic>` constraint above.

`.bracket-action` uses `{components.bracket-action}` and must render as a text-only `<button>` or keyboard-reachable file-control trigger with strict monospace typography, transparent background, no border, no radius, no shadow, no icon, no pill fill, no transform, and no transition. `.bracket-action:focus-visible` uses `{components.bracket-action-focus}` and must include a visible `{colors.focus}` outline independent of inversion. `.bracket-action[disabled]` uses `{components.bracket-action-disabled}`, keeps the same hitbox dimensions, suppresses hover/focus inversion, preserves opacity at `1`, and shows raw active text such as `[FETCHING...]`, `[INGESTING...]`, `[IMPORTING OPML...]`, `[EXPORTING OPML...]`, `[EXPORTING STATE...]`, or `[IMPORTING STATE...]`. Invisible hitbox enlargement is mandatory: use generous transparent padding (`0.5rem` / `{spacing.sm}` minimum) plus equal negative margin when needed so the click target grows without increasing Source Ledger row height or disrupting baseline alignment. Hover/focus must feel terminal-like: either invert colors immediately (`background: current text color`, `text: paired background color`) or apply an equally stark instantaneous highlight. Do not use soft fades, drop shadows, scale/translate lifts, opacity fades, or animated underlines for bracket actions.

#### Source Ledger density and empty-state geometry

Source Ledger is an operational ledger, not a landing page. Header, action groups, helper text, empty-state copy, and source rows should cluster near the top using the normal 4px/8px spacing scale. Empty state MUST remain compact (`No sources. Paste RSS URL in Steer.` / `暂无来源。在导向栏粘贴 RSS URL。`) and must not center large labels across the viewport or create large empty vertical bands. The `RESOFEED` utility menu may expose `TODAY` and `SOURCE LEDGER`, but it must remain compact menu chrome rather than a sparse full-screen dashboard.

### State Portability
Purpose: satisfy active state export/import without adding a settings dashboard.

Anatomy: two terse bracket actions in the Source Ledger `PORTABLE STATE` action group: `[EXPORT STATE]` and `[IMPORT STATE]`. Export includes active Source Ledger rows, active steering policy rules, and currently resonated/starred items. Import accepts the same portable state bundle and replaces local portable active state with it only after inline confirmation. This is intentionally different from OPML: OPML moves source lists only; State restores ResoFeed's portable active state through a destructive replace. The normal toolbar should use the single Source Ledger helper line rather than a second always-visible State warning. `[IMPORT STATE]` must expose `Import State replaces active sources, rules, and stars.` / `导入 State 会替换活动来源、规则和星标。` through accessible description; it may show that warning visibly only during focus/opening/confirming/failure, and confirming state must keep the warning adjacent to `[CONFIRM IMPORT]` and `[CANCEL]`. A future `/doctor` shortcut may point to the same actions, but the implemented surface is Source Ledger only. It must not expose raw command history, superseded steering state, resonance signal history, sync controls, portable receipts, account setup, cloud sync, privacy, or backup-management UI.

States:

- state export default: `[EXPORT STATE]`;
- state export active: `[EXPORTING STATE...]`, disabled, no spinner, no progress animation;
- state export complete: revert to `[EXPORT STATE]` and show `exported state.json`;
- state export failed: revert to `[EXPORT STATE]` and show raw `err: <diagnostic>` text;
- state import default: `[IMPORT STATE]`;
- state import opening: keep `[IMPORT STATE]` geometry stable while invoking the file picker or inline confirmation surface;
- state import confirming: after a candidate state file is selected and validated enough to identify it as an import attempt, do not replace data yet; show the destructive replace warning adjacent to inline `[CONFIRM IMPORT]` and `[CANCEL]` actions, keep the surface compact, and focus `[CONFIRM IMPORT]`;
- state import active: `[IMPORTING STATE...]`, disabled, no spinner, no progress animation only after the user confirms and import is actually running;
- state import cancelled: revert fully to `[IMPORT STATE]`, clear selected file/transient validation text, clear pressed/loading/malformed visual state, remove the confirmation controls, and return focus to `[IMPORT STATE]`;
- state import complete: revert to `[IMPORT STATE]` and show `imported state.json` or `import complete`;
- state import failed: revert to `[IMPORT STATE]` and show raw `err: <diagnostic>` text.

Interaction reset is [SHARP]: cancel, Escape, backdrop dismissal, confirmation cancellation, or native file-picker cancellation must restore the invoking `[IMPORT STATE]` control to its idle size, bracket glyph alignment, color, focus treatment, and label. No `pressed`, `loading`, `disabled`, focus-error, clipped bracket, confirmation-control, or ghost-control residue may remain after cancellation. Focus should return to `[IMPORT STATE]` unless the browser file picker never moved focus; in either case the visible button shape must match the idle button.

Feedback is raw text. Long `err: <diagnostic>` state-portability messages follow the same one-line desktop, two-line mobile truncation/accessibility constraint as Source Ledger diagnostics.

Keyboard and accessibility: export/import actions are buttons or keyboard-reachable file-control triggers with explicit names. Completion and failure messages use live regions. File inputs must remain reachable by keyboard while staying visually hidden. `[IMPORT STATE]` must expose the destructive replace warning through accessible description and announce the inline confirming state before replacement; `[IMPORT OPML]` and `[EXPORT OPML]` must not inherit that warning.

### Diagnostics Output

Purpose: `/doctor` output for power-user operational truth.

Anatomy: monospace block with RSS fetch errors, model latency, last run time, extraction failures. States: default output, command running, command failed. It is text, not a dashboard. No charts, health badges, or friendly remediation cards.

Accessibility: diagnostics output uses a labelled `status`/`log` region. Long lines wrap; no horizontal-only scrolling on mobile.

### Search and Retrieval
Purpose: retrieve corpus by keyword/plain text, source, time, and resonance status. This surface is not a RAG chat or semantic answer engine.

Anatomy: query field may reuse Steer chrome or a dedicated search field if implementation separates modes; results use compact feed-item anatomy with an extra match/provenance line. Search uses exactly one submit affordance in the active form; it is a low-chrome bracket action with an accessible name equivalent to `submit search` even when the visible label is localized. States: empty query, loading, no results, partial results, error. Results must explain enough provenance to verify the match.

Desktop layout: [SHARP] desktop Search is a full-height left workflow slice paired with the normal right Inspector pane. It must not render as a short 260px widget inside the feed column. The search form remains compact at the top; the result list owns the remaining left-pane scroll area and uses the same dense feed-row rhythm as Today: metadata line, title, one-line core-insight-first preview/fallback, and a 44px Resonate target. Selected result state must be marker/low-chrome like Feed selection, not a giant filled card, modal, or tall blank block.

Search result click/Inspector contract:

- Desktop search is a filtered workflow slice, not a navigation-away mode. Clicking or keyboard-activating a search result MUST keep the search surface and result list visible, preserve the current query/filter fields, preserve the search-result scroll position, mark only the selected result with the same low-chrome neutral state as a selected feed item, and open or update the desktop Inspector pane with that item. The selected state means `currently open in Inspector`; it is not a recommendation, unread, priority, or focus state.
- Mobile/narrow search keeps the single-column route model. Tapping a search result drills into the full-screen Inspector/detail route. Browser/app Back MUST return to the same search surface with the same query/filter values, same result set, same selected item indication where practical, and the prior search-result scroll position. This restoration is ephemeral navigation state only; it must not create reading history, command history, analytics, or a new product concept.
- URL/history state SHOULD preserve query and selection where practical with ordinary URL/search/history primitives. Acceptable examples include a search query parameter plus selected item route state or equivalent history state. This must remain implementation state for returning to the filtered slice, not a durable saved-search feature, tab system, or activity ledger.
- Empty query, loading, no-results, partial results, and error/fallback states remain explicit: show plain `0 results`, `no results`, `searching`, or raw `err: <diagnostic>` text as applicable. Empty/no-results states must not auto-open the Inspector and must not replace fallback text-evidence semantics.
- Inspector fallback text evidence remains authoritative from the Inspector contract: search selection must not regress the one-line fallback processing state, `Text evidence` / `文本证据` disclosure, literal source identifiers, or the prohibition on ghost Summary/Core sections when model-backed text is unavailable.

Localization: [SHARP] ordinary Search UI chrome localizes with the active processing language. In Chinese mode use `搜索`, `词汇搜索`, `纯文本查询`, `筛选`, `搜索结果`, `检查搜索结果`, and localized result-count copy. Literal source titles, source URLs, model names, and exact bracket action tokens remain unchanged. Search must not show English-only labels such as `Search and Retrieval`, `filters`, `match: lexical index`, or `provenance: source-backed` in visible zh-CN chrome unless they are preserved source/provider literals.

Keyboard and accessibility: search results follow normal feed item focus behavior; each result activation target is a real button or link and supports `Enter` and `Space`. The selected result MUST expose `aria-selected="true"` on an option/listbox pattern or `aria-current="true"` on a list/listitem pattern, with the attribute absent/false on unselected rows. Focus rings remain distinct from selected state. Result count, if present, is plain text inside the results region, not a badge or queue indicator.

Forbidden search-detail patterns: no modal detail views, accordions-as-detail, recommendation rails, generated answer panels, immersive reader mode, complex tabs, folders/tags/unread concepts, settings sliders, onboarding/account prompts, flashy highlight effects, animated selection, accent-color selection, short fixed-height desktop widgets, or selected-result cards that visually overpower the list.

#### Search filter disclosure and controls
Search filters are [SHARP] progressive disclosure. The filter details control is collapsed by default in every processing language, including Chinese. The default Search surface is query-first: one plain query field, one bracket submit action, then a compact `筛选` / `filters` disclosure. Filters must not render as a settings dashboard or a permanently expanded form block.

The disclosure summary is [SHARP] text-sized chrome with a touch-safe hit target. It must not occupy the full row width or make blank space to its right clickable. Its visible and clickable width should be only the marker/text plus compact padding, while preserving at least `44px` height for touch and keyboard access. Hover/open/focus treatment follows the global disclosure state contract: low-chrome text change or underline only, no filled accordion header.

Filter component types are [SHARP]:

- `Source` uses a low-chrome native select populated from active sources, with an all-sources empty option. Do not use a free-text source field when the active source list is available; source identity is selected, not typed.
- `Start date` and `End date` use plain text inputs with `YYYY-MM-DD` placeholders. Do not use native `type="date"` controls because the browser/OS calendar popup is visually uncontrolled and clashes with the dark archival workbench.
- `Resonated` / `已标星` is one flex-aligned checkbox label. The checkbox and label text must share a visual baseline/center and remain a single 44px-minimum hit target.
- `Result limit` remains a low-chrome select. It belongs after the semantic filters, not between date endpoints.

Filter layout is [SHARP]: keep a compact, wrapping control grid with stable minimum widths for date fields so placeholders do not clip. Labels and controls should read as pairs, not as a six-column spreadsheet. The summary, expanded grid, status line, and first result must keep clear proximity: inner gaps within the Search form should be smaller than the outer gap before the first result, and no collapsed or expanded filter row may create a visually unrelated blank band.

Submission remains deliberate: changing a filter does not automatically run a new search. The user submits with the single `[SEARCH]` / `[搜索]` bracket command. `[SEARCH]` follows the same bracket-command rest/hover/focus/disabled treatment as Source Ledger, State Portability, and Inspector re-ingest; Search MUST NOT define a local hover/focus exception that makes the button behave unlike other bracket commands.
#### Search auto-selection and stale Inspector prevention

Executing a desktop Search invalidates any previous TODAY/feed selection as the visible Inspector context. When a search returns one or more results, the first result MUST be selected automatically and the desktop Inspector MUST update to that result. This keeps the left Search results and right Inspector in the same information context without requiring an extra click.

If a search returns zero results or fails, the desktop Inspector MUST NOT continue showing a stale item from a previous TODAY/feed context as if it belonged to the Search results. Show the explicit no-results/error Search state and either hide the Inspector pane or show the normal minimal no-selection Inspector placeholder.

### Feedback Lines

Purpose: raw system strings for errors, empty states, imports, text-evidence provenance, and AI utility failures.

Examples: `no new items`, `err: summary unavailable`, `text evidence: RSS excerpt only`, `summary provenance: feed excerpt fallback`, `doctor: model latency 842ms`. No cute illustrations, skeleton characters, confetti, or apology copy.

## Do's and Don'ts
Do:

- Do keep Inspect, Resonate, and Steer as the only primary primitives.
- Do use Steer for RSS URL paste, correction, search command entry, and `/doctor` commands.
- [SHARP] Do allow `SOURCE LEDGER`, `TODAY`, language, and reprocess to live inside a discreet `RESOFEED` surface menu instead of persistent top-level links.
- Do keep Source Ledger flat: view source rows, delete, details, OPML import/export, state export/import, and lightweight manual ingest/fetch only.
- [SHARP] Do group Source Ledger portability actions by meaning: `SOURCE LIST` for `[IMPORT OPML]` / `[EXPORT OPML]`, and `PORTABLE STATE` for `[EXPORT STATE]` / `[IMPORT STATE]`.
- [SHARP] Do make the UI distinction explicit: OPML is source-list exchange only; State backs up/restores active sources, active steering rules, and currently resonated/starred items.
- [SHARP] Do render Source Ledger `last_fetch` and `last_ingest` in the viewer's local timezone by default, with visible timezone ambiguity removed (`local`, `本地时间`, or an explicit UTC offset/zone label).
- [SHARP] Do require `[IMPORT STATE]` to show an adjacent inline destructive confirmation (`[CONFIRM IMPORT]` and `[CANCEL]` or equivalent bracket actions) before any replace begins, and make cancel/escape/file-picker dismissal restore the control to idle geometry, label, color, and focus treatment.
- [SHARP] Do place manual ingest controls only in Source Ledger: `[RUN INGEST]` in the header and `[FETCH]` per source row.
- [SHARP] Do represent heavy operation work with text replacement and the shared current-operation snapshot only: `[INGESTING...]`, `[FETCHING...]`, `[REPROCESSING...]`, `op: <kind>`, updated timestamps, conflict text, or raw `err:` diagnostics.
- [SHARP] Do include current operation detail when an action is blocked; users must not see only `err: operation already running`.
- [SHARP] Do make bracket actions (`[FETCH]`, `[RUN INGEST]`, `[IMPORT OPML]`, `[EXPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`, `[DELETE]`, `[REPROCESS LIBRARY]`, `[REGENERATE]`, or non-Source-Ledger localized equivalents explicitly defined in their component sections) monospace buttons with invisible enlarged hitboxes and terminal-style instantaneous hover/focus treatment. Source Ledger visible bracket tokens stay exact English across locales. Rest/active/disabled bracket-action tokens use `{colors.surface}` as the explicit accessible paired background for `{colors.muted}` text; implementations may render optical transparency only when the inherited warm surface preserves the same contrast and does not resolve to transparent black.
- Do expose active state export/import as terse text actions covering active sources, active steering rules, and currently resonated items.
- Do show steering receipts as concise inline evidence, not as a policy roster.
- Do show raw provenance, extraction limits, source names, and original links.
- [SHARP] Do render successful Chinese generated content in Inspector as `摘要`, `核心洞察`, and `要点`, with `要点` as a controlled 3–5 item list sourced from structured `key_points`.
- [SHARP] Do preserve existing localized title, summary, core insight, and Key Points after a failed re-ingest attempt, while showing localized attempt-scoped failure copy such as `上次重处理失败 · 解码错误 · 已保留现有摘要和要点`.
- [SHARP] Do keep generated/user-facing content and failure/status text Chinese-localized when processing language is Chinese, while preserving URL/source/provenance/model literals unchanged.
- [SHARP] Do keep item re-ingest controls inside Inspector only, scoped to the selected item, and presented as a direct standard bracket command `[REGENERATE]` / `[重新生成]`, with default-collapsed `Options` / `选项`, temporary OpenRouter model, and optional one-time prompt inputs.
- [SHARP] Do label Inspector extra prompt as one-time guidance only: it may affect emphasis, angle, and source-backed fact selection, but never schema, source grounding, target language, source identifiers, safety, provenance, runtime/provider status, or persistence boundaries.
- [SHARP] Do collapse Text evidence by default for every newly opened Inspector item while preserving accessible disclosure semantics and literal provenance.
- Do preserve persistent feed access through time groups and pagination.
- Do keep the left feed compact by default: flat metadata, 18px serif titles, clamped 1–2 line abstracts, and horizontal rules rather than roomy cards.
- [SHARP] Do strip visual metadata prefixes in reader surfaces: source names, time, extraction status, model support, and value tier belong in `list-meta-row` order, while full provenance belongs in `inspector-frontmatter`.
- [SHARP] Do convert original/article/feed/source URLs into compact evidence links (`原文链接`, `来源链接`, `original link`, `feed link`) in the Inspector; raw URL strings are reserved for Source Ledger management and diagnostics.
- Do keep accent scarce: Resonate and one active command/focus moment at most.
- Do enforce minimum 44 CSS px touch targets on mobile web surfaces.
- Do support keyboard navigation for every action.
- Do keep exported state human-readable.
- Do keep product labels operational and terse: `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`.

Don't:

- Don't add account registration, profile, password-reset, or onboarding wizard surfaces; the owner-token prompt is a local access gate, not account login.
- [SHARP] Don't add folders, tags, source hierarchy, ranking sliders, or settings dashboards.
- [SHARP] Don't turn Source Ledger manual controls or current-operation status into a job dashboard, retry panel, queue, command ledger, activity feed, operation history, sync/merge control, durable progress UI, or backup-management UI.
- Don't add a second URL paste/add-source field in Source Ledger; source addition remains through Steer.
- Don't make OPML sound like full backup/restore; it is source-list import/export only.
- Don't attach State import's destructive replace warning to OPML actions.
- Don't silently render UTC clock strings as if they were local time.
- Don't leave `[IMPORT STATE]` or any bracket action stuck in a pressed/loading/malformed visual state after cancel.
- Don't hide high-volume feeds behind paternalistic auto-collapsing.
- Don't use unread counts, mark-all-read, queue-clearing, or archive workflows.
- Don't create moderation consoles, hidden review queues, or extensive activity ledgers.
- Don't communicate errors with cute empty-state art, ghosts, mascots, or apologetic SaaS copy.
- Don't use decorative gradients, purple AI trust palettes, random blobs, or Memphis filler.
- [SHARP] Don't use spinners, loaders, pulsing dots, animated ellipses, toast notifications, or background progress fills for ingest/fetch/process/reprocess.
- Don't spend the `accent` token on Source Ledger fetch actions; reserve it for Resonate.
- Don't make bracket actions look like SaaS buttons: no filled pills at rest, no shadows, no transform lifts, no fades, no tiny text-only click targets.
- Don't use emoji as structural icons; use text, professional SVG icons, or plain glyphs.
- Don't display internal design-positioning phrases such as “Analyst’s Workbench,” “Archival Index,” “low-fatigue,” “single-tenant,” or “no SaaS chrome” as product UI copy.
- Don't solve feed density with settings bloat, unread states, sortable spreadsheet columns, zebra striping, or monospace-only titles.
- [SHARP] Don't display `src:`, `来源标题:`, `原文链接`, `条目 URL`, `来源 URL`, or `价值:` as repeated visual prefixes in Feed rows or the compact Inspector header.
- [SHARP] Don't let metadata blocks occupy more vertical space than the Inspector title before the first reading section; Frontmatter is compact audit texture, not a preface.
- [SHARP] Don't show Key Points in Feed rows; Feed remains title, compact summary/core preview, metadata, and Resonate only.
- [SHARP] Don't render Key Points from raw Markdown, generated HTML, paragraph text split heuristics, or bullets inferred by the client; use the structured `key_points` array only.
- [SHARP] Don't let a failed re-ingest attempt hide, erase, or visually demote preserved title/summary/core/key_points content.
- [SHARP] Don't put re-ingest in Feed rows, Source Ledger, persistent global chrome, `/doctor`, provider settings, or a marketplace/provider abstraction surface.
- [SHARP] Don't save the Inspector re-ingest model or extra prompt as defaults, preferences, steering state, item provenance, local storage, exportable state, or reusable templates.
- [SHARP] Don't imply that the Inspector extra prompt can request schema changes, a different processing language, translated source identifiers, unsupported facts, provider/runtime status changes, prompt/secrets disclosure, or durable prompt/model state.
- [SHARP] Don't use modals, toasts, spinners, progress bars, animated ellipses, dashboards, queues, or history surfaces for Inspector item re-ingest.

Language and reprocessing guardrails:

Do:

- [SHARP] Do treat language as a global processing state, not a cosmetic per-item display toggle.
- [SHARP] Do keep language controls terse and low-chrome inside the `RESOFEED` utility menu: `LANG: EN`, `LANG: ZH`, `语言: 英文`, or `语言: 中文`.
- [SHARP] Do explain blocked language changes with the shared current-operation conflict pattern when ingest/fetch/reprocess work is running; language remains global processing state and must not create mixed-language batches.
- Do localize UI chrome, accessibility labels, and user-readable item content for supported languages.
- Do preserve source identifiers exactly and mark them as non-translatable where possible.
- [SHARP] Do expose existing-library reprocess as a terse bracket-style operational action in the `RESOFEED` utility menu, not persistent top chrome.
- Do state plainly that reprocess rewrites stored readable content and rebuilds search indexing.

Don't:

- [SHARP] Don't add a settings dashboard, preference center, wizard, progress dashboard, durable progress UI, operation history, command history, or activity log for language or reprocess.
- Don't add per-item original/translation toggles or side-by-side bilingual reading surfaces.
- Don't translate, summarize, beautify, or transliterate URLs, source titles, source URLs, canonical URLs, or original links.
- Don't introduce `translation_failed` copy or visual state; use existing extraction/model failure semantics.
- Don't automatically rewrite existing items merely because the user changed language.

## Micro-interactions & Motion

Motion is functional, brief, and optional.

- Hover/focus transitions: 120–150ms ease-out for color/border only, except bracket actions.
- Resonate activation: 150ms ease-out star fill/shape change; no bounce.
- Pane transitions: 150–220ms ease-out for Inspector on desktop; mobile route transitions may use platform defaults.
- Loading: raw text states only, or clearly labelled non-skeleton static text placeholders; no skeleton loaders, shimmer or static, under this contract. Manual Source Ledger ingest uses only `[INGESTING...]`, `[FETCHING...]`, timestamps, and raw `err:` strings.
- Inspector item re-ingest loading uses only text replacement such as `[RE-INGESTING ITEM...]` / `[正在重新生成...]`, `models: loading`, current-operation conflict text, or raw `err:` strings.
- Reduced motion: disable transitions beyond immediate state changes.
- No layout shift: hover, focus, selected, loading, error, and receipt states must keep component bounds stable.
- No CSS animations or transitions are permitted on `.bracket-action`, `.source-ledger__status`, or manual ingest controls.
- Bracket actions use immediate terminal feedback: transparent enlarged hitbox at rest, stark color inversion or equivalent hard highlight on hover/focus, strict monospace text, and zero transform/shadow/fade behavior.

### Escape Navigation Contract
Purpose: `Escape` is a keyboard escape hatch back to ResoFeed's neutral state, not a command system or configurable shortcut layer.

Rules are [SHARP]:

- Resolve `Escape` from the innermost active state outward.
- If focus is inside an input, textarea, editable field, select, or the Steer input with unsent text, `Escape` MUST NOT navigate. It may blur the field, close browser/IME affordances, or clear unsent Steer text according to the Steer Input contract.
- If a transient surface is open, `Escape` closes only that surface first: utility menu, Source Ledger panel affordances, re-ingest configuration, popover, confirmation, or similar local UI.
- If the `RESOFEED` utility menu is open, `Escape` closes the menu and restores focus to the invoking control.
- On mobile/narrow Inspector route, `Escape` returns to `TODAY` and preserves the feed scroll position, matching the visible back behavior.
- On Source Ledger, `/doctor`, Search, or any other non-`TODAY` utility surface, `Escape` returns to `TODAY` only when no focused input, transient panel, confirmation, or in-flight submit owns the key.
- Returning from Search to `TODAY` MUST clear the Search surface state, Search receipt, and Search route/query by semantic state, not by matching localized visible copy such as `retrieval:` or `检索：词汇搜索`.
- Returning from Search to `TODAY` MUST also clear the Search-selected item context before feed reconciliation. The desktop Inspector must re-sync to the first visible TODAY item when feed items exist, or show the normal empty Inspector only when TODAY has no items. It must never keep displaying an orphaned Search result after Search is exited.
- Search filters are ephemeral Search surface state. `Escape` from Search clears the query and filters; it does not create saved searches, durable filter profiles, reading history, or command history.
- On desktop `TODAY` with a selected item visible in the split Inspector, `Escape` MUST NOT clear the selected item, blank the right pane, or close the Inspector solely because the page is in the selected-item state. This is option C: `TODAY` is already the neutral workbench surface; `Escape` only handles nested/transient UI there.
- If focus is inside the desktop split Inspector and no transient Inspector control owns `Escape`, the key may move focus back to the Feed list, but the selected item and right pane remain visible.
- Moving focus back to the Feed list MUST use a low-chrome focus treatment. Keyboard focus must remain perceivable, but it must not render as a bright full-height cyan strip, a selected-item marker, or any accent-heavy bar that can be mistaken for selection.
- If a submit/fetch/re-ingest operation is in flight, `Escape` MUST NOT force route navigation or cancel durable work unless an explicit cancellable operation exists. Prefer ignoring the key or closing only non-destructive local chrome.

Visual rule: visible back/close controls remain mandatory on touch surfaces. On narrow Inspector routes, the back row stays sticky at the top while reading; `Escape` is a power-user accelerator, never the only way out.

## Low-Fidelity Wireframe
```text
+--------------------------------------------------------------------------------+
| > Steer or paste RSS URL...                                        RESOFEED    |
+--------------------------------------------------------------------------------+
| TLDR AI FEED · 1m · 全文 · 模型支持 · 高价值              TODAY | INSPECTOR  |
| Agent Judge：针对生产级 AI 代理的长上下文评估方案       [☆]    | Agent Judge：针对生产级 AI 代理... |
| 生产级代理评估需要可验证的长上下文证据链，而不是一次性模型判断。  | ---------------------------------- |
| ---------------------------------------------------------------- | ORIGINAL  Agent Judge: Solving... |
| TLDR AI FEED · 1m · 来源摘录 · 高价值                           | LINKS     原文链接 · 来源链接     |
| 波士顿咨询公司（BCG）首席执行官：人工智能正在...         [☆]    | AI STATUS 模型支持 · 全文 · 质量：高价值 |
| ---------------------------------------------------------------- | ATTEMPT   失败 · 已保留现有摘要和要点 |
| MINIMAX · 1m · 摘录 · 简报                                      | ---------------------------------- |
| MiniMax 预告 M3 模型：引入稀疏注意力机制...             [☆]     | 摘要                              |
| 开源权重模型的关键价值在于让长上下文能力进入可复审的本地工作流。  | 随着长周期自主 AI 代理的应用日益普及，|
|                                                                    | 传统的单一 LLM 作为评估判断者已显现局限。|
|                                                                    |                                  |
|                                                                    | 核心洞察                          |
|                                                                    | 评估生产级代理需要可验证的长上下文证据链。|
|                                                                    |                                  |
|                                                                    | 要点                              |
|                                                                    | • 长代理轨迹超过普通上下文窗口。        |
|                                                                    | • 外部系统状态修改必须被验证。          |
|                                                                    | • 评估准则会随模型和工具迭代而变化。      |
|                                                                    | [重新生成]                         |
|                                                                    | 文本证据：全文 ▸                    |
+--------------------------------------------------------------------------------+
| Source Ledger may show literal URLs because it manages sources; reader surfaces |
| replace raw URLs with compact evidence links and accessible labels.             |
+--------------------------------------------------------------------------------+
```

Mobile structure: Steer command at bottom, feed as a touch-safe compact single column with inline metadata and one-line core-insight-first previews; item tap opens a full-screen Inspector route where title appears first, Frontmatter stays compact, and the reading sections regain generous prose rhythm; Source Ledger opens as a flat full-screen list.
## Stitch Design Checkpoint — 2026-06-01
Latest Stitch source project: `projects/16485408683705488556` (`ResoFeed Design Improvement`). Durable ingestion record: [`docs/audits/stitch-design-ingestion-2026-06-01.md`](audits/stitch-design-ingestion-2026-06-01.md). The accepted concrete-screen set for local contract alignment is:

| Stitch screen | Role in local contract | Local disposition |
| --- | --- | --- |
| `0363936b97974a199e9a559c939d46fc` — `ResoFeed Workbench - Main Workspace (Refined)` | Desktop feed + Inspector split-pane visual exploration. | Accept split-pane rhythm, warm archival palette, JetBrains Mono chrome, and 44px star target. Reject persistent top navigation/counts, Material-symbol structural icons, shadowed sticky header, and `[INGEST FEED]` global shortcut as canonical UI. |
| `2e38d6a81f764f2f911477eab184daac` — `ResoFeed State Matrix — Auth, Empty, Menu, Operation States` | Owner token, first-use empty state, utility menu, and current-operation state exploration. | Accept terse state coverage. Reject overlay/menu shadow, warning icon dependency, and `[AUTHENTICATE]` copy; canonical token action remains `[SUBMIT]` and raw `err:` lines. |
| `38c91458d5f942f0a885e1e46f4747fd` — `SOURCE LEDGER — State Matrix` | Source Ledger roster and operational state exploration. | Accept flat table/list density and operation cluster. Reject `[RETRY]`, `syncing...`, `animate-pulse`, persistent operations nav, and second-order job/retry semantics. Canonical command actions remain `[RUN INGEST]`, `[FETCH]`, `[IMPORT OPML]`, `[EXPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`, `[DELETE]`; diagnostics use low-chrome `source info` / `来源信息`, not bracket command styling. |
| `7e4d3cf967da4a34b476c4f656e57045` — `ResoFeed - Bilingual + Responsive Matrix` | Responsive/bilingual state coverage. | Accept as visual coverage input only when it preserves Feed/Inspector separation, Chinese generated content, literal source identifiers, and touch-safe mobile behavior. |
| `0945e90ac2ce4b408576a0d3b063228f` — `ResoFeed Workbench - Editorial Atlas` | Broad editorial atlas board. | Reference for overall mood only; local component, navigation, and runtime constraints remain stricter than this atlas. |
| `116c49ba79224f2fb04f1c0dbde52c09` — `ResoFeed Atlas Specification` | Stitch-generated inventory of page families. | Accept page-family inventory as non-authoritative summary: TODAY + INSPECTOR, SOURCE LEDGER, SEARCH RETRIEVAL, FULL INSPECTOR, OWNER TOKEN, FIRST USE EMPTY, RESOFEED MENU, CURRENT OPERATION. |

This checkpoint is an input artifact, not a schema override. `docs/PRD.md`, `CONSTITUTION.md`, `docs/ARCHITECTURE.md`, this `docs/DESIGN.md`, and active contracts remain authoritative. If Stitch concrete screens conflict with constitutional constraints, this document adopts only the conforming design intent and records the rest as rejected drift.

## Trend / Platform Evidence

The design inherits `docs/DESIGN_VISION.md` rather than trend-chasing. Relevant conventions are durable: archival index metadata for source-heavy work, broadsheet typography for long reading, split-pane readers for desktop, and single-column detail routes on mobile. ResoFeed rejects consumer SaaS softness in favor of sovereign utility: raw strings, visible provenance, no coaching copy, no settings maze.

## Contract Self-Critique

- Philosophy: 5/5 — low-fatigue single-tenant analyst workbench, not SaaS.
- Hierarchy: 4/5 — Steer, feed, Inspector, Source Ledger are distinct; final implementation must preserve selected-item clarity.
- Execution: 4/5 — tokens, typography, spacing, and states are specified; lint and implementation audit remain required.
- Specificity: 4/5 — empty, loading, error, partial extraction, selected, disabled, mobile, and diagnostics states are covered.
- Restraint: 5/5 — no dashboards, onboarding, hidden queues, decorative AI styling, or feature creep.
