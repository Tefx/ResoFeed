# Stitch Design Ingestion — 2026-06-01

Status: local docs/artifacts updated; pending review-fix-loop approval.

## Authority Boundary

This artifact records the latest Google Stitch design inputs for ResoFeed and their local disposition. Stitch outputs are design evidence, not product authority. The governing authority remains:

- `CONSTITUTION.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/DESIGN_VISION.md`
- active contracts under `docs/contracts/`

If a Stitch screen conflicts with constitutional or PRD constraints, only the conforming visual/interaction intent is adopted.

## Stitch Project Snapshot

- Project: `projects/16485408683705488556`
- Title: `ResoFeed Design Improvement`
- Latest observed project update: `2026-05-31T17:51:00.175083Z`
- Primary design system asset: `assets/14705124699491326347`
- Stitch design system version observed: `6`
- Design-system display name: `ResoFeed Workbench`

### Latest Stitch DESIGN.md / Design-System Excerpt

Stitch's latest design-system text frames ResoFeed as a single-tenant RSS intelligence workbench with a dense archival/editorial feel. Accepted source details:

- Brand/style: single-tenant, focused editorial consumption, archival research, warm paper-like surfaces, low chrome.
- Layout: fixed-grid philosophy, dense ledger/feed view, Inspector pane on desktop and full-screen stack on mobile, 4px rhythm, 44px touch targets.
- Elevation: no shadows/blurs as a rule; tonal layers and low-contrast outlines should carry hierarchy.
- Components: bracket actions, 44px `☆`/`★` Resonate star, Steer input, feed rows with metadata/title/summary and left active marker.
- Tokens: warm stone palette around `#F3F0E7`, `#FBF8EF`, `#ECE6D8`, `#24231E`, `#68645B`, `#D7D0C0`, and Resonate accent `#7A4600`.
- Concrete screen HTML used `JetBrains Mono` for operational chrome; local docs now use it as preferred chrome mono with IBM Plex Mono as fallback.

Rejected or downgraded Stitch design-system drift:

- Public Sans as canonical chrome/action face when concrete screen HTML uses mono and local DESIGN requires archival index chrome.
- Any language implying consumer feed coaching, SaaS dashboard behavior, or marketing copy.
- Any Material icon dependency as structural semantics.

## Concrete Screen Inventory

| Resource | Stitch title | Purpose | Local disposition |
| --- | --- | --- | --- |
| `projects/16485408683705488556/screens/0363936b97974a199e9a559c939d46fc` | `ResoFeed Workbench - Main Workspace (Refined)` | Desktop Feed + Inspector split-pane. | Adopt split-pane architecture, warm archival palette, JetBrains Mono chrome, and 44px star affordance. Reject persistent top tabs, item counts, `[INGEST FEED]` global shortcut, Material star icon, and shadowed sticky header as canonical implementation. |
| `projects/16485408683705488556/screens/2e38d6a81f764f2f911477eab184daac` | `ResoFeed State Matrix — Auth, Empty, Menu, Operation States` | Owner token, first-use empty, RESOFEED menu, current-operation conflict. | Adopt the state coverage. Reject `[AUTHENTICATE]` copy, overlay shadow, warning icon dependency, and icon-only operation symbolism. Canonical owner-token action remains `[SUBMIT]`. |
| `projects/16485408683705488556/screens/38c91458d5f942f0a885e1e46f4747fd` | `SOURCE LEDGER — State Matrix` | Source Ledger roster and operational states. | Adopt flat roster/table density and action cluster. Reject `syncing...`, `animate-pulse`, `[RETRY]`, persistent `OPERATIONS` top nav, and retry/job semantics. |
| `projects/16485408683705488556/screens/7e4d3cf967da4a34b476c4f656e57045` | `ResoFeed - Bilingual + Responsive Matrix` | Responsive and bilingual coverage. | Adopt only where it preserves Feed/Inspector separation, literal source identifiers, Chinese generated-content labels, and touch-safe mobile behavior. |
| `projects/16485408683705488556/screens/0945e90ac2ce4b408576a0d3b063228f` | `ResoFeed Workbench - Editorial Atlas` | Broad editorial atlas board. | Reference for overall mood only; local DESIGN remains stricter. |
| `projects/16485408683705488556/screens/116c49ba79224f2fb04f1c0dbde52c09` | `ResoFeed Atlas Specification` | Page-family markdown summary. | Accepted as non-authoritative inventory: TODAY + INSPECTOR, SOURCE LEDGER, SEARCH RETRIEVAL, FULL INSPECTOR, OWNER TOKEN, FIRST USE EMPTY, RESOFEED MENU, CURRENT OPERATION. |

## Local Updates Applied

- `docs/DESIGN.md`
  - Preferred chrome mono changed to `JetBrains Mono` with `IBM Plex Mono` as fallback.
  - Added `Stitch Design Checkpoint — 2026-06-01` section with accepted/rejected screen dispositions.
- `docs/DESIGN_VISION.md`
  - Added Stitch checkpoint interpretation and concrete board inventory.
- `docs/ui-preview.html`
  - Updated static preview chrome stack to prefer `JetBrains Mono`.
  - Added a visible checkpoint strip listing current Stitch input screens and rejected drift categories.

## Accepted Design Delta

The only accepted design-system deltas from Stitch are:

1. Prefer `JetBrains Mono` for operational chrome where available.
2. Treat the new Stitch boards as explicit coverage for Owner Token, First-Use Empty, RESOFEED Menu, Source Ledger state, operation conflict, desktop split-pane, and responsive/bilingual states.
3. Keep warm archival visual direction and low-chrome density.

## Rejected Drift Checklist

The following Stitch-observed patterns remain explicitly non-canonical:

- persistent top navigation tabs replacing the discreet `RESOFEED` menu;
- item/source counts as inbox-like pressure;
- global `[INGEST FEED]` outside Source Ledger/manual-ingest semantics;
- `[RETRY]`, `syncing...`, `animate-pulse`, or retry/job-dashboard semantics;
- Material Symbols as structural icons for status, star, warning, or terminal state;
- shadows, overlay elevation, or card/depth metaphors as primary hierarchy;
- friendly admin/dashboard framing, profile/settings/provider tabs, RAG/chat, vector/semantic search, or marketing pages.

## Review-Fix Loop Target Set

The review-fix-loop should review this complete target set:

- `docs/DESIGN.md`
- `docs/DESIGN_VISION.md`
- `docs/ui-preview.html`
- `docs/audits/stitch-design-ingestion-2026-06-01.md`
- `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` (included only for stale `docs/DESIGN.md` reference repair/verification)

Required review posture:

- Ensure the Stitch checkpoint is reflected without weakening PRD/Constitution constraints.
- Ensure local artifacts do not accidentally authorize rejected Stitch drift.
- Ensure `docs/ui-preview.html` remains a static design artifact, not runtime proof.
- Ensure line/reference shifts do not break contract readability.
