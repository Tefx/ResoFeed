# ResoFeed UI Regression Contract

Status: acceptance-only contract artifact. This document defines browser/a11y/screenshot coverage for the regression class covering inert controls, pointer obstruction, keyboard activation gaps, noisy interaction states, raw payload dumps, dirty RSS content, and design drift. It does not require or describe product UI behavior changes.

## Authoritative anchors

- `docs/DESIGN.md` defines the surface set and operational tone: owner-token prompt, first-use shell, feed, Inspector, Steer, discreet `RESOFEED` surface menu, Source Ledger, search, and provenance markers; copy must remain terse operational labels.
- `docs/DESIGN.md` defines Feed Item and Resonate anatomy, state semantics, keyboard/a11y rules, non-layout-shifting selection, 44px star target, and non-color active star semantics.
- `docs/DESIGN.md` defines Inspector, Source Ledger, State Portability hierarchy, lightweight Source Ledger manual `[RUN INGEST]` / `[FETCH]` controls, and keyboard/a11y behavior.
- `docs/DESIGN.md` defines motion/state rules: color/border-only transitions, no bounce, no skeleton loaders, reduced motion support, and no layout shift. Manual ingest/fetch uses bracket text replacement only, not spinners or dashboards.
- `docs/DESIGN_VISION.md` anchors split-pane desktop, single-column mobile, the `RESOFEED` menu, flat Source Ledger, and anti-slop/no-layout-shift interaction behavior.
- `docs/ARCHITECTURE.md` anchors the manual ingest/fetch HTTP boundary, source-scoped bounded leases for ingest, global-exclusive guards for state/language mutations, `409 conflict` behavior, and the ban on persistent jobs, queues, command histories, activity ledgers, sync/merge, or dashboards.
- `web/src/routes/+page.svelte`, `web/src/routes/components/Feed.svelte`, `web/src/routes/components/Inspector.svelte`, and `web/src/routes/components/SourceLedger.svelte` define implementation selectors and state observables to target in tests.

## Real hit-target contract

Browser tests MUST prove real user hit targets through pointer movement/clicks at element center points and at safe interior offsets, not only direct handler invocation. Every action below must be checked for overlay/z-index/pointer-events/layout obstruction by asserting the topmost element at the click coordinates is the intended element or an allowed descendant before activation.

Shared obstruction observables:

- Use selectors below to compute bounding boxes and viewport intersection.
- Reject if `elementFromPoint(centerX, centerY)` is not the intended control or an allowed child.
- Reject if computed `pointer-events` is `none`, `visibility` is hidden, disabled state is unexpected, bounding box area is zero, or another active panel visually covers the control.
- Reject if pointer click leaves the wrong panel active or changes layout bounds for hover/focus/selected/loading/error states.

| Control | Selector / observable | Required real activation proof | Authority |
| --- | --- | --- | --- |
| `RESOFEED` surface menu | `details.surface-nav[aria-label="RESOFEED surface menu"] > summary` or equivalent menu trigger | Pointer/keyboard activation opens a menu containing `TODAY` and `SOURCE LEDGER`; the menu trigger remains visible in the top command row. | `docs/DESIGN.md` App Shell / Layout & Spacing |
| `TODAY` menu entry | `details.surface-nav[open] button:has-text("TODAY")` or equivalent menu item; shell `data-surface="feed"`; `.feed-pane.active-panel` | After opening `RESOFEED`, pointer click on `TODAY` makes feed the active surface and does not leave `.utility-surface[aria-label="SOURCE LEDGER surface"]` active. Topmost element must be the menu item/descendant. | `docs/DESIGN.md` App Shell / Layout & Spacing |
| `SOURCE LEDGER` menu entry | `details.surface-nav[open] button:has-text("SOURCE LEDGER")` or equivalent menu item; shell `data-surface="ledger"`; `.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel` | After opening `RESOFEED`, pointer click opens Source Ledger, hides/deactivates wrong panels, and cannot be blocked by feed/detail panes. The entry may be hidden while the menu is closed. | `docs/DESIGN.md` App Shell / Source Ledger |
| Steer submit | `form.steer-form`, `#steer-input`, `form.steer-form button[type="submit"]` | Fill non-empty command, verify submit button appears with stable dimensions, pointer click submits once, duplicate disabled/submitting state keeps bounds fixed, receipt/error/doctor appears in proper live region. | `docs/DESIGN.md` Steer Input |
| Star / Resonate | `.contract-feed-item .contract-resonate`; mobile Inspector `.contract-inspector .contract-resonate` only when route mode | 44x44 minimum target; pointer click toggles `☆` to `★` or reverse plus accessible label changes between `Resonate item` and `Remove resonance`; active state uses shape and color, not color alone; pending state does not shrink target. | `docs/DESIGN.md` Resonate Button |
| Feed row Inspect/open | `.contract-feed-open` within `.contract-feed-item` | Pointer click opens Inspector for that item, selected row gets selected/current observable (`aria-current="true"` or equivalent) without layout shift; on narrow route, current surface is Inspector. | `docs/DESIGN.md` Feed Item |
| Inspector original links | `.contract-inspector a[href]` with accessible text `original link` or labelled equivalent | Link is reachable, unobstructed, has non-empty href, and primary reading content remains visible; link click may be intercepted in tests but must be a real anchor target. | `docs/DESIGN.md` Inspector Pane |
| `/doctor` | Type `/doctor` in `#steer-input`, submit button | Submits through Steer, shows `.doctor-surface` with heading `/doctor` and `pre.contract-diagnostics[role="log"]`; no dashboard cards/charts replace raw text. | `docs/DESIGN.md` Diagnostics Output |
| Source Ledger `[RUN INGEST]` | Source Ledger header button named `[RUN INGEST]` / `[INGESTING...]`; observable `last_ingest` and/or raw status text | Pointer/keyboard activation calls the real manual ingest path, disables only while pending, preserves hitbox/bounds, and returns to `[RUN INGEST]` with terse success/conflict/error text. | `docs/DESIGN.md` Source Ledger; `docs/ARCHITECTURE.md` HTTP Surface |
| Source Ledger `[FETCH]` | Per-source row button named `[FETCH]` / `[FETCHING...]` or accessible label `Fetch source <name>` | Pointer/keyboard activation calls the real per-source fetch path, disables only the active row control while pending, preserves row geometry, and returns to `[FETCH]` with `last_fetch` or terse conflict/error status text in the row status/diagnostics area. | `docs/DESIGN.md` Source Ledger; `docs/ARCHITECTURE.md` HTTP Surface |
| OPML import | Source Ledger import action in `SourceLedger` plus `StatePortability` actions; observable copy `[IMPORT OPML]`, `imported N sources; folders flattened` | Import action is keyboard/pointer reachable from Source Ledger, invokes file/text import path, displays raw progress/completion/error line, and does not expose folders as UI hierarchy. | `docs/DESIGN.md` Source Ledger |
| Source diagnostics/details | Source Ledger per-source `[DETAILS]` disclosure and row status text | Diagnostic disclosures and delete/import/export/import-state controls are reachable and unobstructed; source-specific terse error/status may appear without moving row bounds. | `docs/DESIGN.md` Source Ledger |

Manual-ingest controls are positive contract targets now. Tests must still fail if those controls introduce dashboard concepts: folders, tags, source hierarchy, job queue, persistent activity log, retry panel, sync/merge UI, or portable manual-ingest receipts.

## Keyboard and accessibility contract

Required global proofs:

- `Tab` order starts at Owner Token input when token is absent; after accepted token focus moves to `#steer-input` or first feed item.
- With token accepted, `Tab` reaches Steer, visible submit when present, the `RESOFEED` surface menu trigger, opened menu entries for `TODAY` and `SOURCE LEDGER`, feed open buttons, star buttons, Inspector original link, Source Ledger actions, OPML import, `[RUN INGEST]`, per-source `[FETCH]`, Source Ledger details/delete controls, state export/import actions, and search controls.
- Focus indicator must be visible independent of active/accent state and must not rely solely on color.
- `Enter` activates links/buttons/menu items and Steer submit; `Space` activates feed open button, Resonate buttons, and menu/button controls where applicable.
- Navigation/action state uses `aria-current`, `aria-selected`, `aria-expanded`, `aria-pressed`, `data-surface`, active-panel class, or an equivalent machine-observable state; tests must fail if the visual active panel and semantic active state disagree.
- Landmarks/regions required: main shell labelled `RESOFEED`, feed region labelled/heading `TODAY`, Inspector labelled `INSPECTOR`, Source Ledger labelled surface, `/doctor` labelled log/status region, and live regions for receipt/error/manual ingest status.

Per-control minimums:

| Control | Role/name requirement | Activation keys | State observable |
| --- | --- | --- | --- |
| Owner token | Text input labelled `Enter owner token` or equivalent; submit named; error `role="alert"`/assertive | Enter submits; Tab reaches submit | prompt states empty/focused/submitting/accepted/rejected |
| Steer | Label `Steer or paste RSS URL`; submit named `apply`/`applying` | Enter submits; Escape clears unsent text | `aria-live` receipt/error; disabled only submitting |
| `RESOFEED` surface menu | Menu trigger named `RESOFEED`; opened menu exposes `TODAY` and `SOURCE LEDGER` entries | Enter/Space/click opens menu; Enter/Space/click activates entries | `aria-expanded` or native `details[open]`; `data-surface`/`active-panel` after entry activation |
| Feed row | Button named `Open Inspector for: <title>`; markers labelled source/extraction/value/agent | Enter/Space opens Inspector | selected/current row `aria-current="true"` or equivalent |
| Resonate | Button label announces state: `Resonate item` / `Remove resonance` | Enter/Space toggles | glyph shape changes and label changes; disabled pending announced |
| Inspector link | Anchor text/name identifies original link | Enter opens/navigates | non-empty href, focus visible |
| Source Ledger manual ingest | Header button named `[RUN INGEST]` / `[INGESTING...]` | Enter/Space/click runs ingest when enabled | disabled only while pending; status/error live region or equivalent terse feedback |
| Source Ledger per-source fetch | Row button named `[FETCH]` / `[FETCHING...]` or `Fetch source: <name>` | Enter/Space/click fetches the row source when enabled | disabled only while that fetch is pending; row status/error updates without layout shift |
| Source Ledger delete/details | List rows as list/listitem or equivalent; delete named `Delete source: <name>`; details named for source diagnostics | Enter/Space; confirmation for delete | focus returns next row/heading after delete; details use `aria-expanded`/native disclosure |
| OPML/import/export | Buttons/links with explicit names | Enter/Space; file input reachable | live completion/failure messages |
| `/doctor` output | `role="log"` or labelled status/log region | N/A after command | long lines wrap; no mobile horizontal-only scroll |

## Interaction state matrix for feed rows

Authority: `docs/DESIGN.md:75-98`, `docs/DESIGN.md:411-433`, `docs/DESIGN.md:536-545`, `docs/ui-preview.html:136-149`, and `docs/DESIGN_VISION.md:71-75`.

Test target: `.contract-feed-item` with child `.contract-feed-open`, `.contract-feed-title`, `.contract-feed-summary`, and `.contract-resonate`.

| State | Visual expectation | Semantic expectation | Regression bans |
| --- | --- | --- | --- |
| Normal | Background/canvas neutral, 1px separator, flat metadata, serif title, clamped summary, independent 44px star | No selected/current state unless item open | Card chrome, bordered metadata pills in feed, unread/bold count semantics |
| Hover | Tonal shift or border/color-only change within 120-150ms; no translation | Pointer cursor on actionable targets | Layout shift, stacked accent blocks, noisy shadow/glow, title/summary gap changes |
| Selected | Non-layout-shifting 3px left marker by default; optional subtle `surface-active` only if compact/narrow and not a large empty block | `aria-current="true"` or equivalent; means open in Inspector only | Treating selected as focus/priority/unread; dimension changes; accent flood |
| Selected + hover | Selected marker remains visible and selected state remains distinguishable; hover may add only restrained tonal cue | Selected/current state persists | Hover hiding selected marker, double-active styling, new shadows/borders shifting bounds |
| Focus | Visible focus ring/outline independent of selection/accent; no translation | Real keyboard focus on row open button or star | Invisible focus, focus only by color, focus ring clipped by overflow |
| Selected + focus | Both states perceptible: selected marker/current state plus focus ring on focused control | Selected item remains current; focused element remains keyboard target | Ambiguous double state, layout shift, active style noise, clipped ring |

## Inspector hierarchy and raw/provenance payload placement

Authority: `docs/DESIGN.md:451-461`, `docs/DESIGN.md:514`, `docs/ui-preview.html:655-667`, `Inspector.svelte`.

Primary readable hierarchy must be, in order or visually equivalent:

1. Operational `INSPECTOR` label.
2. Source/provenance header (`src`, extraction status, source/value context where material) in compact mono metadata; raw `model_status` enum strings belong in `/doctor` or secondary diagnostics, not the primary reading header.
3. Article title as the detail heading; opening Inspector moves focus to this heading.
4. Original link, visibly secondary but reachable.
5. Extraction status warning when partial/unavailable.
6. Dense summary/core insight and full extracted text/excerpt using readable payload typography.
7. Why-this-appeared/provenance lines as secondary metadata.

Raw JSON, JSON-LD, extracted metadata objects, media/enclosure metadata, grouped-source provenance, parser diagnostics, and model receipts MAY appear only when one of these is true:

- Inside a labelled disclosure/`details` section collapsed by default.
- In a visibly secondary diagnostics/provenance block after primary reading content.
- In `/doctor` or a raw diagnostic output region explicitly labelled as operational output.

They MUST NOT appear as primary article title, summary, body opening paragraph, feed row title/summary, or unlabeled visible wall of text. Primary text containing `{ "@context"`, `<script`, `<style`, or huge raw JSON indicates a blocking raw payload regression unless explicitly inside a labelled raw/provenance disclosure.

## Dirty content corpus fixture requirements

Fixtures used for browser/visual regression MUST include at least these mess classes and assert both feed and Inspector behavior:

| Fixture name | Mess class | Required assertion |
| --- | --- | --- |
| `json_ld_blob_item` | RSS description begins with JSON-LD including `{ "@context"`, nested arrays, and schema.org fields | Feed/Inspector primary title/summary/body do not show raw JSON-LD; raw content only in labelled collapsed/secondary provenance |
| `long_description_item` | 10k+ character description with paragraphs and no summary | Feed clamps summary; Inspector wraps text with readable line length and no horizontal scroll |
| `html_fragment_item` | HTML tags, anchors, lists, escaped entities | Primary content renders sanitized readable text/link; no raw tags unless in raw disclosure |
| `script_style_leftover_item` | `<script>`/`<style>` leftovers and tracking snippets | Scripts/styles never visible as primary reading content and never execute |
| `missing_summary_date_author_item` | Missing summary, published date, author/source metadata | Uses honest placeholder such as `summary unavailable`/`—` or omits optional metadata; no fake data |
| `very_long_url_title_item` | 300+ char URL and 200+ char title | Feed title clamps/wraps deterministically; metadata ellipsizes/wraps without pushing star or breaking row |
| `escaped_entities_item` | `&amp;`, `&#x27;`, mixed Unicode, malformed entities | User-facing text is decoded where safe and readable; no double-escaping |
| `media_enclosure_metadata_item` | Image/audio/video enclosure URLs, MIME types, sizes | Media/enclosure metadata appears only labelled as secondary/provenance, not as article body |
| `partial_extraction_item` | Extraction status `partial_extraction`, feed excerpt only | Feed/Search compact metadata shows `source excerpt`; Inspector shows `source text: RSS excerpt only`; summary provenance is asserted separately as `summary provenance: model-backed` or `summary provenance: feed excerpt fallback` according to model output |
| `model_error_item` | Summary unavailable or model error | Uses `summary unavailable` plus labelled model/error provenance in a diagnostic/provenance region when details are available; no raw parser prefix as primary copy, apology art, cute copy, or skeleton |
| `fragment_distinct_feed_entries` | Multiple unrelated items whose original URLs share host/path but differ by meaningful or synthetic fragments such as `#feed-entry-1`, with `story_key: null` and `duplicate_of_item_id: null` | Feed and Inspector keep separate item identities; no `Grouped story with N source items` marker/disclosure appears; opening each row shows its own original URL including fragment and provenance. |
| `authoritative_grouped_story` | Multiple related items with backend-provided non-null `story_key` or explicit `duplicate_of_item_id` | Feed/Inspector may show `Grouped story with N source items`; the count and source-list disclosure come from backend grouping data, not frontend URL normalization. |

## Design artifact screenshot manifest

Each named artifact should be captured at deterministic viewport(s), with fresh data/fixture labels documented. Screenshots should be paired with an accessibility snapshot or DOM state dump only as supporting evidence; visual evidence remains mandatory for geometry/design assertions.

| Artifact name | Required state / notes |
| --- | --- |
| `owner-token` | No accepted token; terse local gate; focused token input; rejected error variant if available |
| `first-use` | Accepted token, no sources; normal shell; exact first-use lines; no wizard/art |
| `today-list` | Feed with multiple items, time group label, normal/active star, flat metadata |
| `source-ledger` | Ledger active, OPML import, source rows, fetch buttons, delete buttons, state import/export links |
| `selected-item` | Desktop split with selected feed item and Inspector visible |
| `selected-hover` | Same selected item under hover; selected marker remains distinguishable and bounds stable |
| `selected-focus` | Keyboard focus on selected row/open button and on selected row star |
| `inspector-clean` | Primary readable hierarchy with title/source/time/link/summary/content and no raw payload in primary body |
| `inspector-raw-expanded-provenance` | Labelled raw/provenance disclosure expanded or secondary diagnostics block visible |
| `llm-error` | Summary/model error state with `summary unavailable` and labelled diagnostics/provenance if available; no skeleton/apology/cute illustration |
| `search` | Search surface/results via Steer `search ...`; feed anatomy preserved with match provenance |
| `doctor` | `/doctor` raw text log region; long lines wrapped |
| `mobile-feed` | Narrow/mobile feed, touch-safe targets, one-line summaries, bottom/sticky Steer if implemented |
| `mobile-inspector` | Narrow/mobile detail route, back command, optional Inspector star, reading density restored |

## Negative UX assertions

Tests and audit checks MUST fail on these patterns unless the text appears inside a labelled raw/provenance disclosure or diagnostic region where explicitly allowed:

- Primary feed or Inspector text contains `{ "@context"`, `"@type"`, huge JSON blobs, raw parser object dumps, `<script`, `<style`, or tracking payloads.
- Navigation click on `TODAY` or `SOURCE LEDGER` from the opened `RESOFEED` menu leaves the wrong panel active, leaves multiple primary surfaces visibly active, or disagrees with semantic active state.
- Inert controls: click/focus on `RESOFEED` menu, menu entries, Steer submit, row open, star, original link, `/doctor`, OPML import, `[RUN INGEST]`, `[FETCH]`, source details, delete, export/import does not produce required state/receipt/error.
- Any required hit target is obstructed by overlay/z-index/pointer-events/dead panel, has zero-size bounds, or is below 44 CSS px where specified for touch/action controls.
- Hover/focus/selected/loading/error/receipt/manual-ingest states shift layout bounds, translate rows, add bounce, add shimmer/skeleton, or stack noisy shadows/glows.
- Source Ledger manual controls create or imply folders, tags, source hierarchy, job queue, persisted pending job, retry dashboard, command history, activity ledger, sync/merge UI, portable manual-ingest receipts, settings dashboard, or second source URL paste field.
- Feed or Inspector shows grouped-source disclosure for items whose backend `story_key` and `duplicate_of_item_id` are both `null`, including by stripping URL fragments from synthetic feed-entry URLs.
- User-facing folders, tags, unread counts, mark-all-read, archive bins, settings dashboards/sliders, source hierarchy, drag ordering, pause/resume source toggles, moderation queues, or activity ledgers.
- Mascot/cute SaaS/AI-magic copy or visuals: confetti, ghosts, apologetic empty/error copy, onboarding wizard, decorative gradients/blobs/Memphis filler, purple AI trust palette.
- Product UI copy exposes internal phrases: `Analyst's Workbench`, `Archival Index`, `low-fatigue`, `single-tenant`, or `no SaaS chrome`.
- Fake metrics/testimonials/placeholders presented as real; only honest content placeholders (`—`, `summary unavailable`) and explicit provenance labels (`source text: RSS excerpt only`, `source excerpt`) are allowed.
- Raw parser status prefixes such as `partial:` or `err:` MUST NOT appear as primary feed, Inspector, placeholder, or empty-state copy. Diagnostic-only terse strings may appear only inside labelled diagnostic/provenance disclosure regions.

## Acceptance checklist mapping

- Hit-target coverage: `RESOFEED` menu trigger, `TODAY` menu entry, `SOURCE LEDGER` menu entry, Steer submit, row Inspect, star/resonate, Inspector links, `/doctor`, `[RUN INGEST]`, `[FETCH]`, OPML import, Source Ledger details/delete, state import/export.
- Keyboard/a11y coverage: tab order, menu open/close, menu entry activation, focus visibility, Enter/Space activation, roles/labels/live regions, selected/active semantics.
- Manual ingest/fetch coverage: success, pending disabled state, conflict (`409`) feedback, source-level error feedback, timestamp update, no layout shift, no queue/job/activity/dashboard UI.
- Interaction state matrix: normal, hover, selected, selected+hover, focus, selected+focus with no layout shift or noisy stacking.
- Inspector hierarchy: primary reading hierarchy separated from secondary raw/provenance diagnostics.
- Dirty corpus: JSON-LD, long text, HTML fragments, script/style leftovers, missing metadata, long URL/title, entities, media/enclosures, partial extraction, model error.
- Screenshot manifest: owner-token, first-use, today-list, source-ledger with manual controls, selected-item, selected-hover, selected-focus, inspector-clean, inspector-raw-expanded-provenance, llm-error, search, doctor, mobile-feed, mobile-inspector.
- Negative rules: raw dumps, forbidden RSS-reader/SaaS concepts, obstructed or inert controls, dashboard/job/activity drift, design drift, fake content, and active panel mismatch.
