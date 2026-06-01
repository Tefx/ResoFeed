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

If a future non-web shell is created, it should inherit semantic labels (`src:`, `agent:`, `source text: RSS excerpt only`, `source excerpt`, `error:`) and star shape changes (`☆` to `★`). These labels preserve source-text provenance separately from generated-summary provenance. `partial:` is an internal extraction condition, not a user-facing semantic label. This document does not define a separate terminal product surface.

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
- **Data-Ink Ratio:** Horizontal lines divide content. Full-width colored blocks or pill backgrounds are omitted wherever spacing + alignment can convey structure alone.
- **Metadata Compression:** Known fields in the Feed and Inspector are communicated by position, order, typography, and accessible names. Do not spend visual space on repeated `src:`, `来源标题:`, `条目 URL`, `来源 URL`, or `价值:` prefixes in the main reading flow.
- **Rhythm:** Feed rows use `12px` top padding, `11px` bottom padding, and a `1px` separator to cleanly add up to an exact `24px` vertical shift per item boundary, preserving the 8-point grid rhythm exactly.

Desktop layout:

- Shell has no persistent left navigation.
- Top row contains the Steer input and minimal product label. Persistent top chrome must not permanently show `LANG: EN`, `LANG: ZH`, `[REPROCESS LIBRARY]`, or their localized equivalents.
- The product label may act as a discreet `RESOFEED` surface menu; `TODAY`, `SOURCE LEDGER`, processing language, and guarded `[REPROCESS LIBRARY]` are allowed to appear only after that menu opens. This is intentional low-chrome navigation/utility placement, not a missing-link regression.
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
- Source Ledger opens as a flat full-screen utility surface on narrow layouts, reachable from the `RESOFEED` menu and optionally by Steer command text such as `source ledger`.
- Touch targets must be at least 44 CSS px on web/mobile web. Native shells may map this to platform points.
- Gestures: Support native OS edge-swipe to dismiss the Inspector (crucial for one-handed use). Feed rows are full-width tap targets (excluding the independent Resonate hit area). Double-tap in the Inspector reading body to toggle Resonate is encouraged as a power-user enhancement, provided the explicit star button remains visible.

Feed lifecycle:

- Group by soft inline time labels: Today, Yesterday, Earlier. Time dividers must not break the vertical grid rhythm of the feed. Place the time group string (e.g., `TODAY`) right-aligned inside the inline metadata row of the *first item* in that time group, rather than injecting a full-width divider row that disrupts the distance between item rules.
- Older items remain reachable via pagination or progressive loading.
- No completion badge, no queue-clear affordance, no mark-all-read action.

### Desktop Split Scroll and Processing Language Layout

Desktop shell must keep Feed and Inspector as independent vertical scroll regions. Global page scroll must not couple the two panes. Scrolling the Feed must not move the Inspector, and scrolling the Inspector must not move the Feed. Selecting a Feed item must keep Feed scroll position stable and reset the Inspector reading container to the top for the newly selected item. Both scroll regions MUST be focusable (e.g., `tabindex="0"`) with proper accessible names so keyboard users can scroll them independently.

Mobile keeps the existing single-column behavior: Feed is the main surface and Inspector opens as a full-screen route with preserved Feed scroll.

Processing language is a global operational state, not a per-item display toggle. The language control lives in the `RESOFEED` utility menu under an `OPERATIONS` micro-heading, with an optional duplicate in `/doctor` raw utility output. It must not be persistent top chrome and must not become a settings dashboard, preference center, or onboarding wizard (see **Language Control** in the Components section for exact anatomy and ARIA rules).

### High-Density Acceptance and Mechanical Gates

These gates are [SHARP] because they preserve the dense reader optimization without sacrificing provenance or accessibility:

- Reader surfaces (Feed rows and compact Inspector Frontmatter) MUST NOT visually render repeated prefixes `src:`, `来源标题:`, `条目 URL`, `来源 URL`, or `价值:`. Source Ledger and diagnostics may render raw management labels because managing/verifying sources is their task.
- Raw visible URLs MUST NOT appear in Feed, Inspector reading sections, or compact Inspector Frontmatter. Raw visible URLs are reserved for Source Ledger source management and `/doctor`/diagnostic output.
- Feed rows MUST NOT render `key_points`, bullets, numbered lists, Markdown list strings, or inferred mini-lists; the Feed remains metadata, title, compact summary/core preview, and Resonate only.
- Inspector Frontmatter order is fixed: `ORIGINAL`, `LINKS`, `AI STATUS`, then `ATTEMPT` when present. Omit irrelevant rows rather than reordering them.
- Compact evidence links MUST keep visible text compact (`原文 ↗`, `条目 ↗`, `来源 ↗`, `Article ↗`, `Feed ↗`) while the DOM uses a literal non-secret `href` and an accessible name that exposes destination/provenance.
- All independent controls and touch/click targets, including bracket actions and Resonate, MUST maintain at least 44 CSS px hit targets.
- Desktop Feed and Inspector MUST be independent bounded scroll containers with `overflow-y: auto` or equivalent, keyboard-focusable scroll regions (`tabindex="0"` or native focusability), and accessible names that distinguish Feed from Inspector.

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

### RESOFEED Utility Menu (`utility-menu`)
- **Intent**: [SHARP] Keep low-frequency global navigation and operations discoverable without occupying persistent top chrome.
- **useFor**: `TODAY`, `SOURCE LEDGER`, processing language control, guarded `[REPROCESS LIBRARY]`, and terse current operation context when it affects utility actions.
- **avoidFor**: Settings dashboard, preference center, task/job dashboard, activity history, command ledger, onboarding wizard, decorative brand menu, or any unrelated product feature.

Anatomy: the closed top chrome shows only the `RESOFEED` label/button and the Steer field. Opening `RESOFEED` reveals a flat menu/panel with two compact groups: `NAV` for `TODAY` and `SOURCE LEDGER`, and `OPERATIONS` for `LANG: EN`/`LANG: ZH` plus guarded `[REPROCESS LIBRARY]`. The panel uses `{components.utility-menu}`, stark 1px rules, no shadow, no blur, no icons, and no preference prose beyond the required reprocess warning. It may appear as a popover on desktop and as a flat full-width utility sheet on narrow screens.

Keyboard and accessibility: the `RESOFEED` trigger is a real button with `aria-haspopup="menu"` or equivalent disclosure semantics and `aria-expanded`. Opening the menu moves focus to the first item; `Escape` closes it and returns focus to `RESOFEED`; tab order remains linear. Menu status/error text uses visible inline text and `aria-live` as specified by each contained operation. Do not hide language/reprocess exclusively behind hover.

### Current Operation Status (`current-operation-status`)
- **Intent**: [SHARP] Explain one in-memory heavy operation currently occupying the ingest/process/reprocess guard.
- **useFor**: Visible running status near Source Ledger/operational utility surfaces; conflict details after blocked `[RUN INGEST]`, `[FETCH]`, `[REPROCESS LIBRARY]`, `[RE-INGEST ITEM]`, or language mutation; best-effort phase/count text from the shared `GET /api/runtime/operation` HTTP snapshot or matching MCP/UI current-operation data.
- **avoidFor**: Durable jobs, queues, task dashboards, activity/history ledgers, retry panels, progress timelines, command history, sync status, or persisted audit records.

Anatomy: a single terse line or two-line block, hidden while idle unless it explains a disabled/blocked operation. Canonical text shape is `op: <kind> · actor:<actor> · phase:<phase> · <counts/message> · since <time>`. Allowed operation kinds are `background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, and `item_reingest`. Allowed actors are `background`, `human`, and `agent`. Scope may appear as `scope: all sources`, `scope: source:<name>`, `scope: library`, or `scope: item:<title-or-id>`. Counts are best-effort (`17/128 fetched`, `42 items processed`) and must not imply durable completion guarantees.

Placement: [SHARP] show running current-operation status in the Source Ledger header/status area, in the opened `RESOFEED` utility menu, or adjacent to the Inspector re-ingest action only when relevant. The status must not appear as a persistent global top strip when idle. If a feed-level background ingest is running but no action is blocked, Source Ledger may show the line; the feed itself should remain calm.

States: idle hidden, running, blocked conflict, completed transient receipt, failed raw error. Running state uses `{components.current-operation-status}` and text replacement only. Conflict state uses `{components.current-operation-conflict}` and includes the current operation detail; it must not show only `err: operation already running`.

Conflict copy examples:

- `err: operation already running — op: background_ingest · actor:background · phase:fetch · 17/128 sources · since 14:05:11`
- `err: reprocess blocked — op: source_fetch · actor:human · scope: simonwillison · phase:fetching · since 14:06:02`
- `err: re-ingest blocked — op: item_reingest · actor:human · scope: item:item_01 · phase:processing · since 14:07:33`

Keyboard and accessibility: status lines are visible text. Running updates use `aria-live="polite"` and should update no more frequently than useful phase/count changes. Conflict/errors use `aria-live="assertive"`. When a user triggers a blocked action, keep focus on the trigger if it remains actionable, or move focus to the adjacent conflict line with `tabindex="-1"` and then restore predictable tab order. Do not use spinner-only or color-only status.

### Language Control

- **Intent**: [SHARP] Expose the persisted processing language as a terse global pipeline state.
- **useFor**: Switching future processing language from the `RESOFEED` utility menu when no guarded ingest/fetch/reprocess operation is running; optional `/doctor` raw utility echo; announcing language update success/failure/conflict.
- **avoidFor**: Persistent top-chrome badge, per-item translation toggle, settings panel, preference center, language wizard, automatic existing-library rewrite, or mixed-language batch creation.

Anatomy: a compact text control using `{typography.chrome}` such as `LANG: EN` or `LANG: ZH`, or localized equivalents `语言: 英文` / `语言: 中文`. It lives in the opened `RESOFEED` utility menu under `OPERATIONS`, with an optional raw `/doctor` utility echo. It must reuse the `bracket-action` token set or equivalent low-chrome text-action styles. It must not open a settings dashboard, preference panel, onboarding wizard, or per-item translation selector. Language switching is guarded: if ingest/fetch/library reprocess/item re-ingest is running, it uses the shared current-operation conflict pattern and does not create a mixed-language batch.

States: English, Chinese, updating, conflict, failed. Updating keeps dimensions stable and uses terse text only. Conflict uses the Current Operation Status pattern, e.g. `err: language blocked — op: item_reingest · actor:human · phase:processing`. Failure uses raw `err: <diagnostic>` copy and the existing feedback-line style.

Keyboard and accessibility: language control is a real button/control with an accessible name that announces the current processing language and the target action. The document `<html lang>` must reflect the active UI language (`en` or `zh-CN` unless a narrower Chinese locale is chosen later). Successful, blocked, or failed language updates MUST be announced via an `aria-live="polite"` terse status line for success and `aria-live="assertive"` for conflict/failure.

### Reprocess Library Action

- **Intent**: [SHARP] Explicitly rewrite existing stored user-readable item content into the current processing language and rebuild search indexing.
- **useFor**: Low-frequency guarded library reprocess from the `RESOFEED` utility menu; conflict feedback that references the shared current operation snapshot.
- **avoidFor**: Persistent top chrome, automatic language-change side effect, progress dashboard, durable job, task history, queue, or background sync flow.

Anatomy: a terse operational bracket action, preferably `[REPROCESS LIBRARY]` / `[重处理资料库]`, inside the `RESOFEED` utility menu under `OPERATIONS`, with warning copy such as `Existing readable item content will be rewritten.` / `已存可读内容将被重写。` and `Source identifiers remain unchanged.` / `来源标识保持不变。`

States: default, confirming, running, complete, conflict, failed. Running state uses text replacement only, e.g. `[REPROCESSING...]`, plus the Current Operation Status line when available; no spinner, progress bar, wizard, dashboard, queue view, or activity log is allowed. Confirming state replaces the default action with two bracket actions: `[CONFIRM REPROCESS]` and `[CANCEL]`. Conflict state uses terse copy with current operation detail, e.g. `err: reprocess blocked — op: background_ingest · actor:background · phase:fetch · 17/128 sources`.

Keyboard and accessibility: the action must expose its destructive/operational meaning, e.g. `Reprocess existing library and rebuild search index`.
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

Rules: The list metadata row is a flat inline flex row using `{typography.metadata}`, `{colors.muted}`, and dot separators. It MUST render known fields by value and position, not by repeated prefixes: use `TLDR AI FEED · 1m · 全文 · 模型支持 · high`, not `src: TLDR AI Feed · 来源标题: ... · 价值: high`. Source labels are accessible via `aria-label`, not visual prefixes. The row wraps only at narrow widths; before wrapping, less important tokens drop in this order: value tier, model provenance, extraction label, source title. `TODAY`, `YESTERDAY`, and `EARLIER` may occupy the far-right slot on the first row in each group without adding vertical height.

### Metadata Token (`metadata-token`)
- **Intent**: [FLEXIBLE] Atomic metadata text value inside a flat row or frontmatter value.
- **useFor**: Short source names, `1m`, `全文`, `来源摘录`, `模型支持`, `high`, `brief`, `agent:delivery-bot`, or `quality: high` where a qualifier is genuinely needed.
- **avoidFor**: Pills, badges, navigation, long labels, URLs, or translated/laundered source identifiers.

Rules: Metadata tokens are text atoms; use spacing, order, and separators to communicate meaning. Use explicit words only when the value would be ambiguous without them, e.g. `quality: high` inside Inspector frontmatter is acceptable, but `价值: high` in the feed is not.


### Feed Item
- **Intent**: [SHARP] Compact scan row for triage, not the full structured reading payload.
- **useFor**: Source/time/provenance metadata, localized display title when available, 1–2 line Chinese summary/core preview, value/source marker when space allows, selected state, and Resonate action.
- **avoidFor**: `src:`/`来源标题:`/`价值:` visual prefixes, raw URLs, original source title duplication, Key Points, multi-bullet lists, full article body, source text disclosure, re-ingest controls, or miniature article-card treatment.

Purpose: scan one RSS-derived item with maximum data-ink efficiency.

Anatomy: `List Meta Row` → localized feed title → clamped summary/core preview → independent 44x44 Resonate action. The metadata row renders values by position and separator, not repeated labels: `TLDR AI FEED · 1m · 全文 · 模型支持 · high` is correct; `src: TLDR AI Feed · 来源标题: ... · 价值: high` is not. Source/title/provenance meaning remains available through accessible names and the Inspector Frontmatter, not through redundant visual prefixes in every row.

Feed rows are triage surfaces, not miniature article cards. Title uses `{typography.feed-title}` on desktop and mobile; summary uses `{typography.feed-summary}` and clamps to two lines on desktop, one line on narrow/mobile previews. The text stack must stay continuous: metadata, title, and summary sit in one column with 4px title-to-summary separation. The independent 44x44 Resonate action may sit in a side column, but it must not force a blank row or enlarge the title-to-summary rhythm. Full summary, raw excerpt, full body, source title, original link, and provenance audit belong in the Inspector. Bordered source pills are allowed in the ledger and low-frequency utility contexts, but the feed must use flat monospace metadata with separators to preserve vertical density.

Key Points exclusion: [SHARP] Feed rows MUST NOT show `key_points`, bullets, numbered lists, Markdown list strings, or inferred mini-lists. If `key_points` exists on the item, the Feed still shows only the compact title/summary/core preview and leaves the 3–5 point structure to the Inspector. This preserves scan speed while still supporting high-density comprehension after Inspect.

States:

- default;
- hover/focus: tonal shift or outline only, no translation;
- selected: non-layout-shifting 3px left marker only by default; optional `surface-active` tonal background is reserved for compact/narrow layouts where it does not create large empty color blocks. Selected state means "currently open in Inspector," not keyboard focus, importance, recommendation, unread, or priority. Use focus rings only for true keyboard focus;
- externally surfaced: add compact `agent:<name>` marker only when the item was actually delivered by an external agent;
- RSS-excerpt source text: text marker `来源摘录` / `source excerpt` with warning color and explanation in Inspector;
- raw fallback: show feed excerpt when AI summary is unavailable;
- grouped duplicate/story: transparent grouping must preserve access to every source item and provenance, and may appear only when the backend item data includes authoritative grouping (`story_key` or `duplicate_of_item_id`). The frontend must not infer a group by stripping URL fragments, collapsing synthetic feed-entry URLs, or comparing host/path alone.

No unseen/bold state. No numeric count. No hidden spam collapsing. No user-facing density mode unless future accessibility research proves one is necessary; compact feed density is the product default while touch targets stay minimum 44 CSS px. On mobile, density is achieved through clamping, flat metadata, and restrained padding—not by reducing tap targets or making the whole surface feel like a spreadsheet.

Time-group labels inside the feed (`TODAY`, `YESTERDAY`, `EARLIER`) must feel anchored without breaking the grid. Use uppercase monospace metadata styling and align them to the far right inside the metadata row of the first item belonging to that group. They should consume zero extra vertical height, preserving a mathematically consistent rhythm between feed row separators.

Keyboard and accessibility: feed items are reachable in reading order; `Enter` or `Space` opens Inspector, arrow-key roving focus is allowed only if normal `Tab` order still works. Source, agent, source-text, and grouped markers need accessible names, e.g. `Source: TLDR AI Feed`, `Extraction: full`, `Grouped story with 4 source items`. The grouped marker must be absent when `story_key` and `duplicate_of_item_id` are both `null`.

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
- **Intent**: [SHARP] Short text link to source evidence without exposing raw URL strings in the reading flow.
- **useFor**: `原文 ↗`, `条目 ↗`, `来源 ↗`, `Article ↗`, `Feed ↗`, and other explicit source/provenance link anchors.
- **avoidFor**: Displaying full `https://...` strings, decorative outbound icons, generic `click here`, or replacing raw URLs inside Source Ledger where URL management is the task.

Rules: Reader and Inspector surfaces MUST NOT show raw URLs unless the source-management task itself requires URL editing or verification. Keep the literal URL in the DOM target and accessible name; show a compact anchor in visible text.


### Inspector Frontmatter (`inspector-frontmatter`)
- **Intent**: [SHARP] Compact provenance table that keeps the Inspector reading-first while preserving auditability.
- **useFor**: Original source title, compact article/feed links, extraction availability, summary provenance, quality/value tier, grouped-source count, and latest attempt state.
- **avoidFor**: Full URLs, duplicate top metadata strips, raw paragraph blocks before the title, dashboard status, provider settings, or replacing the structured reading sections.

Rules: Render as a semantic `<dl>` or equivalent accessible key/value grid directly below the Inspector title. Labels are uppercase metadata texture (`ORIGINAL`, `LINKS`, `AI STATUS`, `ATTEMPT`) and values are concise. The grid MUST be visually smaller than the title and reading sections. It replaces the previous repeated blocks (`src:`, `来源标题:`, `原文链接`, `条目 URL`, `来源 URL`) with a 2-column compact structure.

### Inspector Frontmatter Label (`inspector-frontmatter-label`)
- **Intent**: [SHARP] Right-aligned metadata key for fast visual parsing.
- **useFor**: `ORIGINAL`, `LINKS`, `AI STATUS`, `ATTEMPT`, `SOURCES`, or localized equivalents when UI language is Chinese.
- **avoidFor**: Sentence-length explanations, raw backend field names, decorative captions, or body section labels such as `摘要`.

### Inspector Frontmatter Value (`inspector-frontmatter-value`)
- **Intent**: [SHARP] Concise provenance payload paired with a frontmatter label.
- **useFor**: Source title, `原文 ↗ · 来源 ↗`, `模型支持 · quality: high`, `失败 · 已保留现有摘要和要点`, and other short audit values.
- **avoidFor**: Long paragraphs, raw URLs, full article excerpts, Key Points, or re-ingest form controls.


### Inspector Pane
- **Intent**: [SHARP] Deliberate Inspect surface for detail reading, verification, and one-time selected-item re-ingest.
- **useFor**: Selected item detail, compact provenance Frontmatter, Chinese structured generated content (`摘要`, `核心洞察`, `要点`), 3–5 controlled Key Point list items, fallback/source evidence, grouped-source disclosure, collapsed source text, and inline `[RE-INGEST ITEM]` / `[重新处理本文]` controls scoped to this item only.
- **avoidFor**: Duplicate top metadata strips, full raw URLs, global ingest controls, Source Ledger operations, provider settings, provider tabs, marketplace UI, durable model/prompt preferences, modals, toasts, dashboards, job history, related-content modules, or client-inferred source grouping.

Purpose: deliberate Inspect surface for detail reading and verification.

Anatomy: localized title first, then `Inspector Frontmatter`, then structured reading sections, item-scoped re-ingest panel, collapsed source text/source evidence disclosure, why-this-appeared line when useful, and source-list disclosure for grouped stories. The title must begin above the fold; metadata audit must not occupy the dominant vertical band. The previous verbose metadata block (`src: ...`, `来源标题: ...`, `原文链接`, `条目 URL`, `来源 URL`) is replaced by the Frontmatter grid.

Inspector Frontmatter rows are [SHARP]:

- `ORIGINAL`: the original source title only when it differs from the display title or is needed for provenance.
- `LINKS`: compact evidence anchors such as `原文 ↗ · 来源 ↗`; raw URL strings are forbidden in the reading flow.
- `AI STATUS`: summary provenance, extraction status, and quality/value tier, e.g. `模型支持 · 全文 · quality: high`.
- `ATTEMPT`: latest item re-ingest attempt only when relevant, e.g. `失败 · 已保留现有摘要和要点`.

The structured reading order is [SHARP]: `摘要` section, `核心洞察` section, then `要点` section. `核心洞察` is exactly one concise Chinese sentence; multi-point requests route into `要点`. `要点` is a semantic `<ul>`/list control with 3–5 Chinese `<li>` items from the structured `key_points` array, not a Markdown blob, not generated HTML, and not copied into the Feed.

States: empty/no-selection (minimal placeholder indicating no item is selected), loading raw detail, OK model-backed Chinese content, latest re-ingest attempt failed while preserved content remains visible, RSS-excerpt source evidence, unavailable original, grouped-story sources, externally surfaced receipt, and item re-ingest states listed below.

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
- **useFor**: `[RE-INGEST ITEM]` / `[重新处理本文]`, temporary OpenRouter model selection loaded from canonical `GET /api/runtime/openrouter-models` (with `GET /api/runtime/openrouter/models` compatibility-only), optional extra prompt text, `[CONFIRM RE-INGEST]` / `[确认重新处理]`, `[CANCEL]` / `[取消]`, and result/conflict/error text for `POST /api/items/{id}/reingest` or matching MCP `reingest_item`.
- **avoidFor**: Saving default models, saving prompt templates, changing global processing language, reprocessing the library, re-ingesting a source/feed/all items, provider marketplace, provider abstraction UI, provider tabs, settings dashboard, modal confirmation, toast notification, spinner, progress bar, animated ellipsis, or durable job/status history.

Placement: [SHARP] the re-ingest affordance appears inside the Inspector only, after provenance/processing metadata and before the source-text disclosure or long reading body. It must not appear in global chrome, Feed rows, Source Ledger, the `RESOFEED` utility menu, `/doctor`, or search controls. Desktop uses the right Inspector scroll container; mobile uses the full-screen Inspector route.

Anatomy and copy: idle state shows one bracket action, `[RE-INGEST ITEM]` or `[重新处理本文]`. Configuring state expands inline into a flat panel using `{components.inspector-reingest-panel}` with a model selector using `{components.inspector-model-selector}`, optional extra prompt textarea using `{components.inspector-extra-prompt}`, and confirm/cancel bracket actions. English UI uses `[CONFIRM RE-INGEST]` plus `[CANCEL]`; Chinese UI may use deterministic localized equivalents `[确认重新处理]` plus `[取消]`. The model list is OpenRouter-only; label it as `model:` / `模型：` without provider tabs. The selector's first/default option is a local UI option such as `default: account_default`; selecting it sends `model: null` or omits `model`, never the literal `account_default` as a provider model ID. Extra prompt label must make non-persistence explicit, e.g. `extra prompt (one-time, guidance only, not saved)` / `额外提示（仅本次指导，不保存）`.

One-time prompt authority copy: [SHARP] the extra prompt is guidance only for the selected item. Helper text adjacent to the textarea must state that it may change emphasis, angle, or fact selection only among source-backed facts, and that it cannot override schema, source grounding, target language, source identifiers, safety, provenance, runtime/provider status, or persistence boundaries. Suggested terse copy: `guidance only; cannot override schema, language, source identifiers, safety, status, or persistence` / `仅作指导；不能覆盖结构、语言、来源标识、安全、状态或持久化边界`. Do not echo prompt text in receipts, errors, diagnostics, screenshots intended as logs, or source/provenance copy.

Persistence boundary: [SHARP] selected model and extra prompt are temporary UI state for the active Inspector item. They are cleared when the panel is cancelled, when another item opens, after completion/failure acknowledgement, or when the Inspector route unmounts. The UI must not store them in local storage, settings, state export, source records, steering receipts, item provenance, or any durable preference.

States:

- idle: `[RE-INGEST ITEM]` / `[重新处理本文]` only;
- configuring: inline panel with `model: <select>` and optional prompt field; preview docs may show this expanded state without also implying idle is active;
- confirming: `[CONFIRM RE-INGEST]` / `[CANCEL]` visible in the same inline panel for English UI; `[确认重新处理]` / `[取消]` are the authorized deterministic zh-CN equivalents;
- model-list-loading: selector row shows `models: loading` with text replacement only;
- model-list-unavailable: selector row shows raw `err: models unavailable`; default-model re-ingest remains available by sending `model: null`; no fallback marketplace or manual provider setup UI;
- running: action text becomes `[RE-INGESTING ITEM...]` / `[正在重新处理本文...]` with `aria-disabled="true"`; no spinner, progress bar, animated ellipsis, toast, modal, or dashboard;
- complete: terse inline receipt such as `re-ingest complete · search refreshed`; refreshed item content appears when available;
- conflict: raw current-operation conflict detail, e.g. `err: re-ingest blocked — op: item_reingest · actor:human · scope:item_01 · phase:processing · since 14:00:00`;
- failed: [SHARP] non-destructive localized attempt-failure line adjacent to the panel while existing localized title, summary, core insight, and 3–5 Key Points remain visible. Canonical Chinese shape: `上次重处理失败 · 解码错误 · 已保留现有摘要和要点`. The UI must not replace preserved content with a URL-like title, raw error, empty Summary/Core, or fallback source excerpt solely because the latest re-ingest attempt failed. Raw diagnostic detail may remain available to developers where already supported, but user-facing failure text is localized and attempt-scoped.

Accessibility and focus: opening configuring state keeps focus inside the inline panel on the model selector or first available model. Loading/unavailable/complete/failed messages use visible text and `aria-live="polite"`; conflict/errors use `aria-live="assertive"`. Running uses `aria-disabled="true"` rather than removing focus from the trigger. `[CANCEL]` or `[取消]` returns focus to `[RE-INGEST ITEM]` or `[重新处理本文]`; completion returns focus to the refreshed Inspector heading or the re-ingest trigger. The panel must be reachable in normal tab order and must not trap focus like a modal.

### Source Text Disclosure (`source-disclosure`)
- **Intent**: [SHARP] Keep raw/source evidence available while making every newly opened Inspector item begin with the source text collapsed.
- **useFor**: Raw RSS excerpt, extracted article text, source evidence, and grouped-source evidence sections inside Inspector.
- **avoidFor**: Hiding provenance permanently, collapsing model-backed Summary/Core, decorative accordions, lazy-loading spinners, or client-inferred source grouping.

Default state: [SHARP] source text/source evidence is collapsed by default for every newly opened Inspector item. Use accessible disclosure semantics (`<details>`/`<summary>` or equivalent button with `aria-expanded`, `aria-controls`, and labelled region). The summary line should be terse, e.g. `Source text (collapsed)` / `来源文本（已折叠）`, and may include provenance such as `RSS excerpt only`. Opening a new item resets the disclosure to collapsed. User expansion state is ephemeral navigation/UI state only and must not be saved.

Grouped-source disclosure contract: Inspector may show a source-list disclosure only for authoritative backend grouping: non-null `story_key`, non-null `duplicate_of_item_id`, or non-empty backend `provenance.grouped_source_items` on the selected item/detail. It must list backend-provided source items/provenance without merging client-side identities. It must not compute groups by stripping URL fragments, by treating URLs that differ only by a synthetic feed-entry fragment as identical, or by host/path fallback. If authoritative grouping fields are absent, show the selected item as a standalone item even if URL normalization would make unrelated items look similar. This protects feeds whose entry URLs intentionally use fragments to identify distinct source items.

Fallback/source-evidence contract: If target-language/model processing has not produced model-backed summary or core insight, Inspector must not render ghost Summary or Core sections. It shows exactly one low-chrome processing state line below title/original-link/provenance metadata, then one collapsed source evidence disclosure only if a source excerpt exists. Recommended copy is `target-language processing incomplete · summary/core unavailable · showing source excerpt` / `中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录`, followed by a disclosure summary such as `Source evidence (collapsed): RSS excerpt` / `出处记录（已折叠）：RSS 摘录` and the raw RSS excerpt inside the controlled region. Model latency/error states use the same one-line pattern with `failed`/`失败`; original-unavailable states use one unavailable line. Fallback source excerpt is provenance evidence, not completed synthesized target-language reading content. Source identifiers, original link, and source title remain literal.

OK model-backed contract: If model-backed summary/core/key_points exist, Inspector renders processing/provenance normally and shows `摘要`, `核心洞察`, and `要点` as available, with Source text available behind the default-collapsed disclosure. Source-text status and summary provenance remain evidence, not warning banners. If full article text is unavailable but RSS excerpt text exists and the model still produced validated summary fields, Inspector may say `source text: RSS excerpt only` / `来源文本：仅 RSS 摘录` while separately saying `summary provenance: model-backed` / `摘要出处：模型支持`. Key Points remain a controlled Inspector list even when source text is RSS-excerpt-only; they are not a Markdown fallback.

Note on Resonate Action: To maintain a clean, low-fatigue interface, the Inspector only duplicates the Resonate action when presented as a single-column mobile route (where the feed is hidden). In desktop split-pane mode, the Inspector does not show a star; the user relies on the permanently visible star on the selected feed item to their left.

Inspector must not include related-content carousels, recommendation modules, ads, banners, modal retries, toasts, or decorative error illustrations. It may expose source provenance and original links plainly.

Keyboard and accessibility: opening Inspector moves focus to the detail heading; closing/back returns focus to the originating feed item and preserves scroll. Original links, grouped sources, processing state, source evidence, source-text status, summary provenance, and provenance labels must be screen-reader readable.

Processing-language addendum: Inspector title, model-backed dense summary, model-backed core insight, and reading body render stored target-language item content. Original link and source identifiers remain unchanged and visually/semantically act as provenance anchors. Inspector must not show AI-magic translation badges, side-by-side original/translation comparison, or a separate translation failure panel; the single processing line plus source evidence is the trust model for fallback states.

On desktop, the Inspector is its own scroll container. Opening a different item resets the Inspector scroll position to the top without moving the Feed scroll. On mobile, Inspector remains a full-screen route.

### Source Ledger
- **Intent**: [SHARP] Flat source management and operational context without settings-dashboard behavior.
- **useFor**: Source rows, OPML import, state export/import, manual `[RUN INGEST]`, per-source `[FETCH]`, and visible current operation status when work is running or blocks an action.
- **avoidFor**: Settings dashboard, durable job list, operation history, task queue, retry dashboard, command ledger, sync/merge controls, source hierarchy, tags, or a second URL-add field.

Anatomy: title, global ingest/current-operation status, global `[RUN INGEST]` action, `[IMPORT OPML]` action, flat source rows, source-level `[FETCH]` actions, `[DELETE]` action, diagnostic `[DETAILS]`, and terse links to the State Portability `[EXPORT STATE]` / `[IMPORT STATE]` actions. URL subscription must route users back to Steer; the Ledger does not provide a second manual URL paste field. Row fields: source name, URL, adjacent last fetch status or raw diagnostic text, and a right-aligned action block. Source Ledger bracket action labels are [SHARP] exact English tokens across locales: `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]`, `[IMPORT OPML]`, `[IMPORTING OPML...]`, `[EXPORT STATE]`, `[EXPORTING STATE...]`, `[IMPORT STATE]`, `[IMPORTING STATE...]`, `[DELETE]`, and `[DETAILS]`. Localize surrounding prose and accessible names, not these visible Source Ledger bracket tokens. UI text must not render lowercase variants such as `import opml`, `export state`, or `import state`, and must not render localized Source Ledger bracket labels such as `[导入 OPML]`, `[导出状态]`, or `[导入状态]` unless this contract is explicitly revised.

Manual ingestion boundary: `[RUN INGEST]` and `[FETCH]` are immediate operational commands, not durable jobs. They must not create a queue, job table, activity ledger, command history, sync primitive, or settings dashboard. They reuse the in-process current-operation guard described in `docs/ARCHITECTURE.md`; conflict feedback is raw, terse, and includes current operation detail rather than only `err: operation already running`.

States:

- empty: `No sources. Paste RSS URL in Steer.`;
- OPML import default: `[IMPORT OPML]` in the Ledger header/footer action cluster;
- OPML import active: `[IMPORTING OPML...]`, disabled, no spinner, no progress animation;
- OPML import complete: revert to `[IMPORT OPML]` and show `imported N sources; folders flattened`;
- OPML import failed: revert to `[IMPORT OPML]` and show raw `err: <diagnostic>` text;
- global ingest default: `[RUN INGEST]` in the Ledger header/action bar;
- global ingest active: `[INGESTING...]`, disabled, no spinner, no progress animation; show `op: manual_ingest · actor:human · phase:<phase> · <counts/message> · since HH:MM:SS` in the header status line when available;
- global ingest conflict: revert to `[RUN INGEST]` and show raw `err: operation already running — op: <kind> · actor:<actor> · phase:<phase> · <counts/message>` conflict text;
- global ingest complete: revert to `[RUN INGEST]` and update `last_ingest: HH:MM:SS`;
- source fetch default: `[FETCH]` on the same row as the source;
- source fetch active: `[FETCHING...]`, disabled, no spinner, no progress animation; show `op: source_fetch · actor:human · scope: source:<name> · phase:<phase> · since HH:MM:SS` in the source row or Ledger status line;
- source fetch conflict: revert to `[FETCH]` and show raw current-operation conflict text adjacent to the source;
- source fetch complete: revert to `[FETCH]` and update `last_fetch: HH:MM:SS`;
- source fetch failed: revert to `[FETCH]` and show raw `err: <diagnostic>` text adjacent to the source;
- delete confirmation: terse confirmation for destructive removal;
- deletion error: raw line.

`last_fetch: HH:MM:SS` and `last_ingest: HH:MM:SS` are UI display-only formatting derived from backend RFC3339 UTC fields. The UI must not invent, persist, or send these clock strings back as canonical state; canonical API data remains RFC3339 UTC.

Raw diagnostic strings (`err: <diagnostic>`) must not break Source Ledger geometry. Show one line adjacent to the affected source on desktop, clamp visually at approximately 80 characters with an ellipsis, and expose the full diagnostic through the element `title` or an accessible details disclosure. On narrow/mobile layouts, allow wrapping to at most two lines before truncation. Preserve the literal `err:` prefix and never replace raw diagnostics with friendly copy.

Forbidden: folders, tags, pause/resume toggles, drag ordering, scoring sliders, source categories, job dashboards, durable progress surfaces, retry panels, ingest queues, activity ledgers, operation histories, command histories, sync/merge controls, and a second URL subscription field.

Keyboard and accessibility: source rows are list items; `[RUN INGEST]` and `[FETCH]` are named buttons with stable 44px minimum hit targets; active states keep the same hitbox; delete is a named button (`Delete source: <name>`) and requires a terse confirmation before destructive removal. Current operation status uses `aria-live="polite"`; conflict details use `aria-live="assertive"` and remain visible near the blocked action. Focus returns to the triggering action or adjacent conflict line after a blocked command, and to the next row or Ledger heading after deletion.

Required DOM contract for manual ingest controls:

```html
<section class="source-ledger" aria-labelledby="source-ledger-title">
  <header class="source-ledger__header">
    <h1 id="source-ledger-title">SOURCE LEDGER</h1>
    <span class="source-ledger__status" aria-live="polite">last_ingest: 14:00:00</span>
    <button class="bracket-action bracket-action--run-ingest" type="button">[RUN INGEST]</button>
  </header>
  <ul class="source-ledger__list">
    <li class="source-ledger__row">
      <span class="source-ledger__name">src: nyt</span>
      <span class="source-ledger__url">https://nyt.com/rss</span>
      <span class="source-ledger__status" aria-live="polite">last_fetch: 14:02:05</span>
      <span class="source-ledger__actions">
        <button class="bracket-action bracket-action--fetch" type="button" aria-label="Fetch source NYT">[FETCH]</button>
        <button class="bracket-action bracket-action--details" type="button" aria-label="Source details NYT">[DETAILS]</button>
        <button class="bracket-action bracket-action--delete" type="button" aria-label="Delete source NYT">[DELETE]</button>
      </span>
    </li>
  </ul>
</section>
```

CSS usage contract: `.source-ledger` uses `{components.source-ledger}`. `.source-ledger__header` uses `{components.source-ledger-header}` and must align `last_ingest` plus `.bracket-action--run-ingest` to the right side of the header. `.source-ledger__row` uses `{components.source-ledger-row}` and must use grid or flex columns that keep source name and URL stable while `.source-ledger__actions` is right-aligned; `[FETCHING...]`, `[INGESTING...]`, `[IMPORTING OPML...]`, `[EXPORTING STATE...]`, and `[IMPORTING STATE...]` expand leftward and must not push source metadata. `.source-ledger__status` uses `{components.source-ledger-status}` with `font-variant-numeric: tabular-nums`; error variants use `.source-ledger__status--error` and `{components.source-ledger-status-error}`. `.source-ledger__status--error` and standalone `.raw-error-line` must clamp/wrap according to the `err: <diagnostic>` constraint above. `.bracket-action` uses `{components.bracket-action}` and must render as a text-only `<button>` with strict monospace typography, transparent background, no border, no radius, no shadow, no icon, no pill fill, no transform, and no transition. `.bracket-action:focus-visible` uses `{components.bracket-action-focus}` and must include a visible `{colors.focus}` outline independent of inversion. `.bracket-action[disabled]` uses `{components.bracket-action-disabled}`, keeps the same hitbox dimensions, suppresses hover/focus inversion, preserves opacity at `1`, and shows raw active text such as `[FETCHING...]`, `[INGESTING...]`, `[IMPORTING OPML...]`, `[EXPORTING STATE...]`, or `[IMPORTING STATE...]`. Invisible hitbox enlargement is mandatory: use generous transparent padding (`0.5rem` / `{spacing.sm}` minimum) plus equal negative margin when needed so the click target grows without increasing Source Ledger row height or disrupting baseline alignment. Hover/focus must feel terminal-like: either invert colors immediately (`background: current text color`, `text: paired background color`) or apply an equally stark instantaneous highlight. Do not use soft fades, drop shadows, scale/translate lifts, opacity fades, or animated underlines for bracket actions.

### State Portability
Purpose: satisfy active state export/import without adding a settings dashboard.

Anatomy: two terse bracket actions reachable from the Source Ledger footer: `[EXPORT STATE]` and `[IMPORT STATE]`. Export includes active Source Ledger rows, active steering policy rules, and currently resonated items. Import accepts the same portable state bundle and replaces local portable active state with it. Before file selection or final submit, show the warning text `import replaces active sources, rules, and stars`. A future `/doctor` shortcut may point to the same actions, but the implemented surface is Source Ledger only. It must not expose raw command history, superseded steering state, resonance signal history, sync controls, portable receipts, account setup, cloud sync, privacy, or backup-management UI.

States:

- state export default: `[EXPORT STATE]`;
- state export active: `[EXPORTING STATE...]`, disabled, no spinner, no progress animation;
- state export complete: revert to `[EXPORT STATE]` and show `exported state.json`;
- state export failed: revert to `[EXPORT STATE]` and show raw `err: <diagnostic>` text;
- state import default: `[IMPORT STATE]`;
- state import active: `[IMPORTING STATE...]`, disabled, no spinner, no progress animation;
- state import complete: revert to `[IMPORT STATE]` and show `imported state.json` or `import complete`;
- state import failed: revert to `[IMPORT STATE]` and show raw `err: <diagnostic>` text.

Feedback is raw text. Long `err: <diagnostic>` state-portability messages follow the same one-line desktop, two-line mobile truncation/accessibility constraint as Source Ledger diagnostics.

Keyboard and accessibility: export/import actions are buttons or links with explicit names. Completion and failure messages use live regions. File inputs must remain reachable by keyboard.

### Diagnostics Output

Purpose: `/doctor` output for power-user operational truth.

Anatomy: monospace block with RSS fetch errors, model latency, last run time, extraction failures. States: default output, command running, command failed. It is text, not a dashboard. No charts, health badges, or friendly remediation cards.

Accessibility: diagnostics output uses a labelled `status`/`log` region. Long lines wrap; no horizontal-only scrolling on mobile.

### Search and Retrieval

Purpose: retrieve corpus by keyword/plain text, source, time, and resonance status. This surface is not a RAG chat or semantic answer engine.

Anatomy: query field may reuse Steer chrome or a dedicated search field if implementation separates modes; results use feed-item anatomy with extra match/provenance line. Search uses exactly one submit affordance in the active form; it is a low-chrome bracket action with an accessible name equivalent to `submit search` even when the visible label is localized. States: empty query, loading, no results, partial results, error. Results must explain enough provenance to verify the match.

Search result click/Inspector contract:

- Desktop search is a filtered workflow slice, not a navigation-away mode. Clicking or keyboard-activating a search result MUST keep the search surface and result list visible, preserve the current query/filter fields, preserve the search-result scroll position, mark only the selected result with the same low-chrome neutral state as a selected feed item, and open or update the desktop Inspector pane with that item. The selected state means `currently open in Inspector`; it is not a recommendation, unread, priority, or focus state.
- Mobile/narrow search keeps the single-column route model. Tapping a search result drills into the full-screen Inspector/detail route. Browser/app Back MUST return to the same search surface with the same query/filter values, same result set, same selected item indication where practical, and the prior search-result scroll position. This restoration is ephemeral navigation state only; it must not create reading history, command history, analytics, or a new product concept.
- URL/history state SHOULD preserve query and selection where practical with ordinary URL/search/history primitives. Acceptable examples include a search query parameter plus selected item route state or equivalent history state. This must remain implementation state for returning to the filtered slice, not a durable saved-search feature, tab system, or activity ledger.
- Empty query, loading, no-results, partial results, and error/fallback states remain explicit: show plain `0 results`, `no results`, `searching`, or raw `err: <diagnostic>` text as applicable. Empty/no-results states must not auto-open the Inspector and must not replace fallback source evidence semantics.
- Inspector fallback/source evidence remains authoritative from the Inspector contract: search selection must not regress the one-line fallback processing state, `Source evidence:` section, literal source identifiers, or the prohibition on ghost Summary/Core sections when model-backed text is unavailable.

Keyboard and accessibility: search results follow normal feed item focus behavior; each result activation target is a real button or link and supports `Enter` and `Space`. The selected result MUST expose `aria-selected="true"` on an option/listbox pattern or `aria-current="true"` on a list/listitem pattern, with the attribute absent/false on unselected rows. Focus rings remain distinct from selected state. Result count, if present, is plain text inside the results region, not a badge or queue indicator.

Forbidden search-detail patterns: no modal detail views, accordions-as-detail, recommendation rails, generated answer panels, immersive reader mode, complex tabs, folders/tags/unread concepts, settings sliders, onboarding/account prompts, flashy highlight effects, animated selection, or accent-color selection. Search selection reuses feed-item selected chrome and Inspector detail only.

### Feedback Lines

Purpose: raw system strings for errors, empty states, imports, source-text provenance, and AI utility failures.

Examples: `no new items`, `err: summary unavailable`, `source text: RSS excerpt only`, `summary provenance: feed excerpt fallback`, `doctor: model latency 842ms`. No cute illustrations, skeleton characters, confetti, or apology copy.

## Do's and Don'ts

Do:

- Do keep Inspect, Resonate, and Steer as the only primary primitives.
- Do use Steer for RSS URL paste, correction, search command entry, and `/doctor` commands.
- [SHARP] Do allow `SOURCE LEDGER`, `TODAY`, language, and reprocess to live inside a discreet `RESOFEED` surface menu instead of persistent top-level links.
- Do keep Source Ledger flat: view source rows, delete, details, OPML import, state export/import, and lightweight manual ingest/fetch only.
- [SHARP] Do place manual ingest controls only in Source Ledger: `[RUN INGEST]` in the header and `[FETCH]` per source row.
- [SHARP] Do represent heavy operation work with text replacement and the shared current-operation snapshot only: `[INGESTING...]`, `[FETCHING...]`, `[REPROCESSING...]`, `op: <kind>`, updated timestamps, conflict text, or raw `err:` diagnostics.
- [SHARP] Do include current operation detail when an action is blocked; users must not see only `err: operation already running`.
- [SHARP] Do make bracket actions (`[FETCH]`, `[RUN INGEST]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`, `[DELETE]`, `[REPROCESS LIBRARY]`, or non-Source-Ledger localized equivalents explicitly defined in their component sections) monospace buttons with invisible enlarged hitboxes and terminal-style instantaneous hover/focus treatment. Source Ledger visible bracket tokens stay exact English across locales. Rest/active/disabled bracket-action tokens use `{colors.surface}` as the explicit accessible paired background for `{colors.muted}` text; implementations may render optical transparency only when the inherited warm surface preserves the same contrast and does not resolve to transparent black.
- Do expose active state export/import as terse text actions covering active sources, active steering rules, and currently resonated items.
- Do show steering receipts as concise inline evidence, not as a policy roster.
- Do show raw provenance, extraction limits, source names, and original links.
- [SHARP] Do render successful Chinese generated content in Inspector as `摘要`, `核心洞察`, and `要点`, with `要点` as a controlled 3–5 item list sourced from structured `key_points`.
- [SHARP] Do preserve existing localized title, summary, core insight, and Key Points after a failed re-ingest attempt, while showing localized attempt-scoped failure copy such as `上次重处理失败 · 解码错误 · 已保留现有摘要和要点`.
- [SHARP] Do keep generated/user-facing content and failure/status text Chinese-localized when processing language is Chinese, while preserving URL/source/provenance/model literals unchanged.
- [SHARP] Do keep item re-ingest controls inside Inspector only, scoped to the selected item, and presented as `[RE-INGEST ITEM]` / `[重新处理本文]` with temporary OpenRouter model and optional one-time prompt inputs.
- [SHARP] Do label Inspector extra prompt as one-time guidance only: it may affect emphasis, angle, and source-backed fact selection, but never schema, source grounding, target language, source identifiers, safety, provenance, runtime/provider status, or persistence boundaries.
- [SHARP] Do collapse source text/source evidence by default for every newly opened Inspector item while preserving accessible disclosure semantics and literal provenance.
- Do preserve persistent feed access through time groups and pagination.
- Do keep the left feed compact by default: flat metadata, 18px serif titles, clamped 1–2 line abstracts, and horizontal rules rather than roomy cards.
- [SHARP] Do strip visual metadata prefixes in reader surfaces: source names, time, extraction status, model support, and value tier belong in `list-meta-row` order, while full provenance belongs in `inspector-frontmatter`.
- [SHARP] Do convert original/article/feed/source URLs into compact evidence links (`原文 ↗`, `条目 ↗`, `来源 ↗`) in the Inspector; raw URL strings are reserved for Source Ledger management and diagnostics.
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
- Inspector item re-ingest loading uses only text replacement such as `[RE-INGESTING ITEM...]`, `models: loading`, current-operation conflict text, or raw `err:` strings.
- Reduced motion: disable transitions beyond immediate state changes.
- No layout shift: hover, focus, selected, loading, error, and receipt states must keep component bounds stable.
- No CSS animations or transitions are permitted on `.bracket-action`, `.source-ledger__status`, or manual ingest controls.
- Bracket actions use immediate terminal feedback: transparent enlarged hitbox at rest, stark color inversion or equivalent hard highlight on hover/focus, strict monospace text, and zero transform/shadow/fade behavior.

## Low-Fidelity Wireframe
```text
+--------------------------------------------------------------------------------+
| > Steer or paste RSS URL...                                        RESOFEED    |
+--------------------------------------------------------------------------------+
| TLDR AI FEED · 1m · 全文 · 模型支持 · high                 TODAY | INSPECTOR  |
| Agent Judge：针对生产级 AI 代理的长上下文评估方案       [☆]    | Agent Judge：针对生产级 AI 代理... |
| 随着长周期自主 AI 代理的应用日益普及，传统单一 LLM...          | ---------------------------------- |
| ---------------------------------------------------------------- | ORIGINAL  Agent Judge: Solving... |
| TLDR AI FEED · 1m · 来源摘录 · high                             | LINKS     原文 ↗ · 来源 ↗         |
| 波士顿咨询公司（BCG）首席执行官：人工智能正在...         [☆]    | AI STATUS 模型支持 · quality: high |
| ---------------------------------------------------------------- | ATTEMPT   失败 · 已保留现有摘要和要点 |
| MINIMAX · 1m · 摘录 · brief                                      | ---------------------------------- |
| MiniMax 预告 M3 模型：引入稀疏注意力机制...             [☆]     | 摘要                              |
|                                                                    | 随着长周期自主 AI 代理的应用日益普及，|
|                                                                    | 传统的单一 LLM 作为评估判断者已显现局限。|
|                                                                    |                                  |
|                                                                    | 核心洞察                          |
|                                                                    | 评估生产级代理需要可验证的长上下文证据链。|
|                                                                    |                                  |
|                                                                    | 要点                              |
|                                                                    | • 长代理轨迹超过普通上下文窗口。        |
|                                                                    | • 外部系统状态修改必须被验证。          |
|                                                                    | • 评估准则会随模型和工具迭代而变化。      |
|                                                                    | [重新处理本文]                     |
|                                                                    | 来源文本（已折叠）：全文 ▸             |
+--------------------------------------------------------------------------------+
| Source Ledger may show literal URLs because it manages sources; reader surfaces |
| replace raw URLs with compact evidence links and accessible labels.             |
+--------------------------------------------------------------------------------+
```

Mobile structure: Steer command at bottom, feed as a touch-safe compact single column with inline metadata and one-line abstracts; item tap opens a full-screen Inspector route where title appears first, Frontmatter stays compact, and the reading sections regain generous prose rhythm; Source Ledger opens as a flat full-screen list.

## Stitch Design Checkpoint — 2026-06-01

Latest Stitch source project: `projects/16485408683705488556` (`ResoFeed Design Improvement`). Durable ingestion record: [`docs/audits/stitch-design-ingestion-2026-06-01.md`](audits/stitch-design-ingestion-2026-06-01.md). The accepted concrete-screen set for local contract alignment is:

| Stitch screen | Role in local contract | Local disposition |
| --- | --- | --- |
| `0363936b97974a199e9a559c939d46fc` — `ResoFeed Workbench - Main Workspace (Refined)` | Desktop feed + Inspector split-pane visual exploration. | Accept split-pane rhythm, warm archival palette, JetBrains Mono chrome, and 44px star target. Reject persistent top navigation/counts, Material-symbol structural icons, shadowed sticky header, and `[INGEST FEED]` global shortcut as canonical UI. |
| `2e38d6a81f764f2f911477eab184daac` — `ResoFeed State Matrix — Auth, Empty, Menu, Operation States` | Owner token, first-use empty state, utility menu, and current-operation state exploration. | Accept terse state coverage. Reject overlay/menu shadow, warning icon dependency, and `[AUTHENTICATE]` copy; canonical token action remains `[SUBMIT]` and raw `err:` lines. |
| `38c91458d5f942f0a885e1e46f4747fd` — `SOURCE LEDGER — State Matrix` | Source Ledger roster and operational state exploration. | Accept flat table/list density and operation cluster. Reject `[RETRY]`, `syncing...`, `animate-pulse`, persistent `OPERATIONS` nav, and second-order job/retry semantics. Canonical actions remain `[RUN INGEST]`, `[FETCH]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`, `[DELETE]`, `[DETAILS]`. |
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
