# DESIGN_VISION: ResoFeed

## 1. Product Context
ResoFeed is a personal intelligence stream designed for humans and delegated AI agents. It processes noisy, time-sensitive RSS feeds into a fresh, policy-steered daily review. Unlike traditional RSS readers, ResoFeed actively eliminates inbox-zero anxiety. It removes numeric indicators, folders, and settings panels in favor of three core primitives: **Inspect** (attention), **Resonate** (durable memory/star), and **Steer** (natural language correction).

## 2. Concept & Theory
**Concept: "The Analyst's Workbench"**
The interface behaves like a precision intelligence workbench. It is unapologetically a tool for power users, not a consumer SaaS app, but it deeply respects the ergonomics of long-form reading.
- **User Sovereignty:** We do not protect the user from their choices. If they subscribe to a high-volume feed, we render it. No auto-collapsing, no algorithmic "Top Stories" tab hiding the raw feed.
- **AI as Raw Utility:** AI processing is treated like electricity. If it fails, the UI does not apologize with a cute illustration; it shows one terse processing/provenance line and source evidence or a fallback excerpt only in the allowed evidence/fallback slots; generated Summary/Core/Key Points sections remain absent rather than being filled with raw source text.
- **High-Density, Low-Fatigue:** The minimalism is not to "prevent choice paralysis" (paternalism); it is to maximize data density while preserving ocular comfort during sustained reading.

## 3. Trend / Platform Evidence
`trend_radar: NOT_RUN`
*Reason:* Established design theory for modern reading and digest applications strongly supports the requested PRD minimalism. Current conventions dictate edge-to-edge typography, the elimination of heavy chrome/sidebars, and lightweight feedback mechanisms.

## 4. Vibe Check
**Archival • High-Density • Typographic • Low-Fatigue**

## 5. Color Philosophy
The color system reflects a precision utility without punishing the eyes. Pure terminal black/white is too harsh for long-form reading; instead, we use the palette of ink, paper, and steel.
- **Canvas & Surfaces:** Low-fatigue neutrals (e.g., zinc, stone, or slate). Not `#000000` or `#FFFFFF`, but carefully calibrated off-whites and dark grays that reduce eye strain while maintaining stark structural borders.
- **Text & Contrast:** Maximum contrast for readability (e.g., dark charcoal on off-white, or soft ash on dark slate).
- **The Singular Accent (Resonate):** A stark, functional amber accent that appears only for explicit Resonate state and cuts through the monochrome like a highlighter pen.
*(Note: Strict semantic token mappings, contrast pairs, and typography fallback rules are deferred to the `docs/DESIGN.md` phase.)*

## 6. Typography & Scale
Typography separates "Payload" (content) from "Chrome" (utility):
- **Content Typeface:** A high-legibility, beautiful Serif for article titles, summaries, and full text (preserving the calm, low-fatigue reading experience).
- **System/UI Typeface:** A dense, raw Monospace for metadata, timestamps, Source Ledger URLs, diagnostic URLs, and the Steer input. Reader surfaces use compact link anchors instead of visible feed URL strings. This reinforces the "archival index" nature of the tool without making it look like a bash script.
- **Scale & Rhythm:** Strict grid, tightly packed metadata, generous line-height (1.5 - 1.6) only for the Serif reading payload.
*(Note: Font loading strategies, exact scale values, and overflow behaviors will be detailed in `docs/DESIGN.md`.)*

## 7. Layout & Surfaces
- **Desktop (Desk Review):** A split-pane layout. A unified scrolling feed anchored on the left, and an "Inspector" pane on the right when an item is clicked. No left-hand navigation sidebar.
- **Search as Filtered Desk Review:** Search results are another archival index slice, not a separate product mode. On desktop, choosing a result keeps the filtered list, query, and scroll context visible while the Inspector updates on the right with a quiet selected-row marker. On mobile, choosing a result drills into the full-screen Inspector, and Back returns to the same filtered slice and scroll position. This preserves the Inspect primitive without adding saved searches, tabs, modal readers, recommendation flows, or history ledgers.
- **Mobile (Commute Review):** A single-column vertical timeline. Edge-to-edge flat feed rows. The "Steer" input is anchored as a sticky command input.
- **Surface Access:** Utility surfaces may sit behind a discreet `RESOFEED` menu. `SOURCE LEDGER` can be discoverable through that menu instead of being a persistent always-visible nav link.
- **Agent Handoffs:** Items delivered by external agents receive a compact receipt/agent metadata marker such as `agent:<name>`, not a pill, and live within the same unified feed.
- **The Source Ledger:** A barebones, flat list of subscribed URLs accessible via the `RESOFEED` menu. No folders, no tags, no drag-and-drop. It is a strictly read/delete/fetch text roster, not a settings dashboard. OPML imports are instantly flattened. Manual ingestion lives here only as lightweight bracket actions: global `[RUN INGEST]` in the ledger header and per-source `[FETCH]` on source rows. These actions must not become jobs, queues, retry dashboards, or activity ledgers.

### 7.1 Stitch Checkpoint Interpretation (2026-06-01)
Stitch's latest concrete boards add useful coverage, but they do not override the PRD/Constitution. Treat them as visual evidence to mine, not as runtime requirements.

- **Adopt:** warm archival palette; tactile, flat editorial density; JetBrains Mono-style operational chrome; split Feed/Inspector workspace; Source Ledger as a dense roster; explicit auth/empty/menu/operation state boards; bilingual responsive coverage.
- **Reject:** persistent SaaS-like nav tabs, counts as inbox pressure, `[INGEST FEED]` top-level shortcut outside Source Ledger semantics, structural Material icons, animated/pulsing loading, shadowed overlays, `[RETRY]` job semantics, and any copy implying settings/dashboard/provider/chat/RAG behavior.
- **Canonical local reading:** the concrete boards should strengthen `docs/ui-preview.html` and `docs/DESIGN.md` by showing the surface families, while local contract language keeps the stricter no-drift boundaries.
- **Mobile gesture interpretation:** adopt pull-to-refresh, pull-to-load-more, and mobile Inspector back navigation only as native/web-native gestures with text-only feedback. If a platform cannot expose a reliable native edge-swipe, the visible back row is the fallback and the gesture is a no-op; do not simulate edge-swipe physics with custom JavaScript. Gesture tokens may localize outside Source Ledger, but states remain terse text only (`[PULL TO REFRESH]` → `[REFRESHING...]`, `[PULL TO LOAD MORE]` → `[LOADING MORE...]`, or localized equivalents), with raw `err:` feedback on failure.

## 8. Feed Lifecycle & Pagination
- **Persistent Feed:** The feed is durable by default. There is no automatic expiration or midnight deletion mechanism. Users shouldn't lose their feed if they miss a few days.
- **Time Grouping:** Items are grouped softly by time (e.g., "Today", "Yesterday", "Earlier") to aid orientation without creating an artificial deadline.
- **Unread Agnostic:** Pagination or infinite scroll allows browsing past days without showing missed counts or inducing "algorithmic FOMO". Empty states simply indicate "no new items".

## 9. Low-Fidelity Prototype (Desktop)

```text
+-------------------------------------------------------------------------+
| > Steer or paste RSS URL...                                      RESOFEED |
|                                                                         |
|   NYT · 2h ago                                           TODAY         |
|   The Main Headline Goes Here               INSPECTOR                   |
|   Core insight preview clamped to           ORIGINAL  NYT               |
|   two lines.                                The Main Headline Goes Here |
|                                 ☆           --------------------------- |
|   ----------------------------------        Summary / Core Insight /    |
|   delivery-bot · 1d ago               YESTERDAY     Key Points live here.|
|   Secondary Story                           No tracking scripts, no     |
|   ...                           ★           paywall modals.             |
|                                                                         |
|                                             [REGENERATE]                |
|                                             Text evidence ▸             |
+-------------------------------------------------------------------------+
```

## 10. Craft Guardrails & Anti-Slop
- **No Paternalism:** No "You're all caught up!" messages, no hidden rate limits, no auto-collapsed "spam" folders.
- **No Cute Error States:** If the AI summary fails, show one terse processing/provenance line and raw RSS source evidence when present. Do not repeat fallback copy as Summary/Core content, and do not use ghost/skeleton loaders, warning banners, retry panels, or friendly illustrations.
- **No Account Login or Onboarding:** Single-tenant nature means no account screens, no "ghost briefings", no setup wizards. If an owner token is required, show a terse local access gate before feed API calls.
- **No Numeric Indicators:** Absolutely no numeric badges or bolded unseen states.
- **No Moderation Consoles / Activity Logs:** We do not expose secondary holding queues or extensive activity logs. Avoid building a second hidden inbox.
- **Whitespace over Borders:** Avoid the "Border-Box Maze." Separate feed items using generous vertical whitespace or stark 1px rules.
- **No AI Magic:** The item re-ingest feature is a surgical, deterministic tool. No AI sparkles, modal retries, or animated loaders. It is a temporary, inline control in the Inspector.

## 11. Micro-Interactions & States
- **Hover:** Feed items shift slightly in background tone. No layout shifting.
- **Focus:** Strict visible outline/marker using the dedicated focus token (`focus` in light mode, `focus-dark` in dark mode), not the Resonate accent or primary text color.
- **Steer (Lightweight Intent):** Steer is a simple directional input for shaping the feed. It has basic states (default, focused, submitting) and deterministic submit/receipt semantics while staying intentionally simple. No multi-turn clarification workflows or configuration lists.
- **Resonate:** The star icon uses a snappy, non-bouncy transition.
- **Manual Fetch:** Source Ledger commands behave like terminal-synchronous text. `[FETCH]` becomes `[FETCHING...]`; `[RUN INGEST]` becomes `[INGESTING...]`; success updates `last_fetch: HH:MM:SS local` or `last_ingest: HH:MM:SS local`; blocked operations print raw current-operation detail such as `err: operation already running — op: <kind> · actor:<actor> · phase:<phase> · since HH:MM:SS local`; failure prints raw `err: <diagnostic>` inline. No spinners, no pulsing dots, no toast notifications, no CSS animation, and no accent color.
- **Inspector Re-ingest:** Inline control in the Inspector after Summary/Core Insight/Key Points and before Text evidence. `[REGENERATE]` reruns the selected item directly; it never appears above the main reading payload. `Options` reveals an OpenRouter model selector and a temporary prompt input. Successful/storable outcomes update the item content inline without saving the model/prompt state; failures preserve existing content and show terse attempt feedback. No durable queue or history.
- **Text Evidence Disclosure:** Source-backed text evidence in the Inspector is collapsed by default to prioritize the reading payload, using a native accessible `<details>`/`<summary>` or equivalent disclosure widget. Fallback/source-evidence semantics remain intact when expanded.

## 12. Component Inventory
- **Feed Row:** Combines flat inline metadata values (source, time, extraction/model/value cues), inline time-group badge, Serif Title, clamped core-insight-first preview, and the Resonate action.
- **Steer Input:** A simple text input for natural language commands.
- **Inspector Pane:** The detailed reading view, containing the reading payload, inline item re-ingest controls placed after the structured reading sections, and a collapsed-by-default source evidence block.
- **Source Ledger Row:** Flat source name, URL, adjacent fetch status, right-aligned bracket actions (`[FETCH]`, `[DELETE]`) that do not shift source metadata when the action text changes.
- **Global Ingest Action:** Header-level `[RUN INGEST]` command paired with `last_ingest` status; it is a manual override for all sources, not a dashboard job monitor.

### 12.1 Stitch Concrete Board Inventory
The latest Stitch board set maps to local components as follows:

- `Main Workspace (Refined)`: Feed Row, Resonate Button, Inspector Pane, collapsed source detail, item re-ingest affordance.
- `State Matrix`: Owner Token Prompt, First-Use Empty State, RESOFEED Utility Menu, Current Operation conflict line.
- `SOURCE LEDGER — State Matrix`: Source Ledger Row, Global Ingest Action, State Portability actions, raw source diagnostics.
- `Bilingual + Responsive Matrix`: Mobile feed route, mobile Inspector route, bilingual generated-content labels, literal source identifiers.
- `Editorial Atlas`: broad mood reference only; it does not loosen local component, navigation, or runtime constraints.
- `Atlas Specification`: page-family inventory only; it is not an authorization to add new nav primitives or dashboards.

## 13. Functional Mapping (PRD to UI)
| PRD Requirement | UI/UX Representation |
| --- | --- |
| **Inspect** | Clicking a feed row opens the Inspector Pane. |
| **Resonate** | A prominent, unambiguous Star toggle (`☆` / `★`) on every feed row, plus a star in the Inspector when in single-column mobile view. Double-tap Resonate is prohibited so native text selection remains reliable. |
| **Steer** | A lightweight Command Bar / Sticky input for natural language intents, or pasting raw RSS URLs to subscribe. |
| **Surface access** | `RESOFEED` opens a discreet menu containing utility surface entries such as `TODAY` and `SOURCE LEDGER`; this keeps chrome low without removing navigation. |
| **Diagnostics** | `/doctor` renders raw system health as plain text inside the existing Steer/feedback surface. |
| **Manual Source Fetch** | Source Ledger row action `[FETCH]`; active state `[FETCHING...]`; success updates `last_fetch` with local timezone text; failure prints raw `err:` beside the source. No queue, retry dashboard, or activity record. |
| **Manual Global Ingest** | Source Ledger header action `[RUN INGEST]`; active state `[INGESTING...]`; success updates `last_ingest` with local timezone text; conflict returns terse raw feedback with current operation detail (`op`, `actor`, `phase`, timestamp). |
| **Inspector Item Re-ingest** | Inline Inspector command (`[REGENERATE]`) with an `Options` disclosure for a temporary OpenRouter model selector and prompt input. Submitting attempts one item-scoped reprocess; only the selected item's stored fields/search row are updated, and only for successful or otherwise storable outcomes defined by the architecture failure contract. |
| **Collapsed Text Evidence** | Inspector source-backed evidence is wrapped in a collapsed accessible disclosure widget by default to prioritize the summarized payload. |
| **State Portability** | Export/import appears as terse text actions covering active sources, active steering rules, and currently resonated items without a settings dashboard. |
| **No Inbox-Zero / Anxiety** | Absence of counters, bold/unseen typography. |
| **Persistent Feed** | Time-grouped pagination; older items remain accessible without auto-deletion. |
| **No Paternalism** | No auto-collapsing of noisy feeds, no algorithmic "Top Stories" tabs, no "Mark All Read". |
| **AI as Utility** | Terse failure/provenance lines plus source evidence or fallback excerpt only in allowed slots when summaries fail; no raw source text masquerading as generated sections and no friendly error illustrations. |
| **Single-Tenant** | No onboarding screens, account login flows, or setup wizards. If an owner token is required, present it as a terse local access gate before feed API calls. |
