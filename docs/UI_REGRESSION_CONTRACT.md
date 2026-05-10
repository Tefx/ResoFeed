# ResoFeed UI Regression Contract

Status: acceptance-only contract artifact. This document defines browser/a11y/screenshot coverage for the regression class covering inert controls, pointer obstruction, keyboard activation gaps, noisy interaction states, raw payload dumps, dirty RSS content, and design drift. It does not require or describe product UI behavior changes.

## Authoritative anchors

- `docs/DESIGN.md:247-263` defines the surface set and operational tone: owner-token prompt, first-use shell, feed, Inspector, Steer, Source Ledger, search, and provenance markers; copy must remain terse operational labels.
- `docs/DESIGN.md:411-449` defines Feed Item and Resonate anatomy, state semantics, keyboard/a11y rules, non-layout-shifting selection, 44px star target, and non-color active star semantics.
- `docs/DESIGN.md:451-482` defines Inspector, Source Ledger, and State Portability hierarchy and keyboard/a11y behavior.
- `docs/DESIGN.md:536-545` defines motion/state rules: color/border-only transitions, no bounce, no skeleton loaders, reduced motion support, and no layout shift.
- `docs/ui-preview.html:530-590` visually anchors selected feed row, star buttons, inline metadata, and Inspector hierarchy; `docs/ui-preview.html:596-619` anchors Source Ledger, source fetch buttons, OPML/state actions, and `/doctor`; `docs/ui-preview.html:623-668` anchors mobile feed/detail behavior.
- `docs/DESIGN_VISION.md:34-39` anchors split-pane desktop, single-column mobile, and flat Source Ledger; `docs/DESIGN_VISION.md:63-75` anchors anti-slop and no-layout-shift interaction behavior.
- `web/src/routes/+page.svelte:313-410`, `web/src/routes/components/Feed.svelte:31-70`, and `web/src/routes/components/Inspector.svelte:47-85` define implementation selectors and state observables to target in tests.

## Real hit-target contract

Browser tests MUST prove real user hit targets through pointer movement/clicks at element center points and at safe interior offsets, not only direct handler invocation. Every action below must be checked for overlay/z-index/pointer-events/layout obstruction by asserting the topmost element at the click coordinates is the intended element or an allowed descendant before activation.

Shared obstruction observables:

- Use selectors below to compute bounding boxes and viewport intersection.
- Reject if `elementFromPoint(centerX, centerY)` is not the intended control or an allowed child.
- Reject if computed `pointer-events` is `none`, `visibility` is hidden, disabled state is unexpected, bounding box area is zero, or another active panel visually covers the control.
- Reject if pointer click leaves the wrong panel active or changes layout bounds for hover/focus/selected/loading/error states (`docs/DESIGN.md:545`).

| Control | Selector / observable | Required real activation proof | Authority |
| --- | --- | --- | --- |
| `TODAY` nav | `nav.surface-nav button:has-text("TODAY")`; shell `data-surface="feed"`; `.feed-pane.active-panel` | Pointer click on visible nav button makes feed the active surface and does not leave `.utility-surface[aria-label="SOURCE LEDGER surface"]` active. Topmost element must be the button/descendant. | `docs/DESIGN.md:250-258`, `+page.svelte:342-345`, `+page.svelte:374-381` |
| `SOURCE LEDGER` nav | `nav.surface-nav button:has-text("SOURCE LEDGER")`; shell `data-surface="ledger"`; `.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel` | Pointer click opens Source Ledger surface, hides/deactivates wrong panels, and cannot be blocked by feed/detail panes. | `docs/DESIGN.md:463-476`, `+page.svelte:342-345`, `+page.svelte:395-406` |
| Steer submit | `form.steer-form`, `#steer-input`, `form.steer-form button[type="submit"]` | Fill non-empty command, verify submit button appears with stable dimensions, pointer click submits once, duplicate disabled/submitting state keeps bounds fixed, receipt/error/doctor appears in proper live region. | `docs/DESIGN.md:390-405`, `+page.svelte:319-358` |
| Star / Resonate | `.contract-feed-item .contract-resonate`; mobile Inspector `.contract-inspector .contract-resonate` only when route mode | 44x44 minimum target; pointer click toggles `☆` to `★` or reverse plus accessible label changes between `Resonate item` and `Remove resonance`; active state uses shape and color, not color alone; pending state does not shrink target. | `docs/DESIGN.md:435-449`, `Feed.svelte:58-66`, `Inspector.svelte:77-80` |
| Feed row Inspect/open | `.contract-feed-open` within `.contract-feed-item` | Pointer click opens Inspector for that item, selected row gets selected/current observable (`aria-current="true"` or equivalent) without layout shift; on narrow route, current surface is Inspector. | `docs/DESIGN.md:411-433`, `Feed.svelte:35-57`, `+page.svelte:145-151` |
| Inspector original links | `.contract-inspector a[href]` with accessible text `original link` or labelled equivalent | Link is reachable, unobstructed, has non-empty href, and primary reading content remains visible; link click may be intercepted in tests but must be a real anchor target. | `docs/DESIGN.md:451-461`, `Inspector.svelte:65` |
| `/doctor` | Type `/doctor` in `#steer-input`, submit button | Submits through Steer, shows `.doctor-surface` with heading `/doctor` and `pre.contract-diagnostics[role="log"]`; no dashboard cards/charts replace raw text. | `docs/DESIGN.md:483-489`, `DESIGN_VISION.md:88`, `+page.svelte:169-172`, `+page.svelte:351-355` |
| OPML import | Source Ledger import action in `SourceLedger` plus `StatePortability` actions; observable copy `import OPML`, `imported N sources; folders flattened` | Import action is keyboard/pointer reachable from Source Ledger, invokes file/text import path, displays raw progress/completion/error line, and does not expose folders as UI hierarchy. | `docs/DESIGN.md:463-482`, `docs/ui-preview.html:605-609`, `+page.svelte:397-405` |
| Source fetch buttons | Source Ledger per-source fetch buttons and run-ingest action; preview `.manual-fetch-action` | Buttons are 44px min-height, unobstructed, disabled only while fetching/ingesting, labelled per source (`Fetch <source>`/`[RUN INGEST]`), and show source-specific raw error/status without moving row bounds. | `docs/ui-preview.html:330-357`, `docs/ui-preview.html:597-604`, `+page.svelte:214-278` |

## Keyboard and accessibility contract

Required global proofs:

- `Tab` order starts at Owner Token input when token is absent; after accepted token focus moves to `#steer-input` or first feed item (`docs/DESIGN.md:371-380`).
- With token accepted, `Tab` reaches Steer, visible submit when present, `TODAY`, `SOURCE LEDGER`, feed open buttons, star buttons, Inspector original link, Source Ledger actions, OPML import, source fetch/delete buttons, state export/import actions, and search controls.
- Focus indicator must be visible independent of active/accent state (`docs/DESIGN.md:271-272`) and must not rely solely on color.
- `Enter` activates links/buttons and Steer submit; `Space` activates feed open button and Resonate buttons (`docs/DESIGN.md:433`, `docs/DESIGN.md:449`).
- Navigation/action state uses `aria-current`, `aria-selected`, `aria-pressed`, `aria-expanded`, `data-surface`, active-panel class, or an equivalent machine-observable state; tests must fail if the visual active panel and semantic active state disagree.
- Landmarks/regions required: main shell labelled `RESOFEED`, feed region labelled/heading `TODAY`, Inspector labelled `INSPECTOR`, Source Ledger labelled surface, `/doctor` labelled log/status region, and live regions for receipt/error (`docs/DESIGN.md:369`, `docs/DESIGN.md:405`, `docs/DESIGN.md:489`).

Per-control minimums:

| Control | Role/name requirement | Activation keys | State observable |
| --- | --- | --- | --- |
| Owner token | Text input labelled `Enter owner token` or equivalent; submit named; error `role="alert"`/assertive | Enter submits; Tab reaches submit | prompt states empty/focused/submitting/accepted/rejected |
| Steer | Label `Steer or paste RSS URL`; submit named `apply`/`applying` | Enter submits; Escape clears unsent text | `aria-live` receipt/error; disabled only submitting |
| Surface nav | Buttons named `TODAY`, `SOURCE LEDGER` | Enter/Space | `data-surface`, `active-surface`, `active-panel`, plus `aria-selected`/equivalent preferred |
| Feed row | Button named `Open Inspector for: <title>`; markers labelled source/extraction/value/agent | Enter/Space opens Inspector | selected/current row `aria-current="true"` or equivalent |
| Resonate | Button label announces state: `Resonate item` / `Remove resonance` | Enter/Space toggles | glyph shape changes and label changes; disabled pending announced |
| Inspector link | Anchor text/name identifies original link | Enter opens/navigates | non-empty href, focus visible |
| Source Ledger | List rows as list/listitem or equivalent; delete named `Delete source: <name>` | Enter/Space; confirmation for delete | focus returns next row/heading after delete |
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

Authority: `docs/DESIGN.md:451-461`, `docs/DESIGN.md:514`, `docs/ui-preview.html:579-590`, `Inspector.svelte:47-85`.

Primary readable hierarchy must be, in order or visually equivalent:

1. Operational `INSPECTOR` label.
2. Source/provenance header (`src`, extraction status, model status/value where material) in compact mono metadata.
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
| `partial_extraction_item` | Extraction status `partial_extraction`, feed excerpt only | Feed shows `partial`; Inspector shows `partial: excerpt only` and explains limitation |
| `model_error_item` | Summary unavailable or model error | Raw line such as `err: summary unavailable`; no apology art/cute copy/skeleton |

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
| `llm-error` | Summary/model error raw line; no skeleton/apology/cute illustration |
| `search` | Search surface/results via Steer `search ...`; feed anatomy preserved with match provenance |
| `doctor` | `/doctor` raw text log region; long lines wrapped |
| `mobile-feed` | Narrow/mobile feed, touch-safe targets, one-line summaries, bottom/sticky Steer if implemented |
| `mobile-inspector` | Narrow/mobile detail route, back command, optional Inspector star, reading density restored |

## Negative UX assertions

Tests and audit checks MUST fail on these patterns unless the text appears inside a labelled raw/provenance disclosure or diagnostic region where explicitly allowed:

- Primary feed or Inspector text contains `{ "@context"`, `"@type"`, huge JSON blobs, raw parser object dumps, `<script`, `<style`, or tracking payloads.
- Navigation click on `TODAY` or `SOURCE LEDGER` leaves the wrong panel active, leaves multiple primary surfaces visibly active, or disagrees with semantic active state.
- Inert controls: click/focus on nav, Steer submit, row open, star, original link, `/doctor`, OPML import, source fetch, delete, export/import does not produce required state/receipt/error.
- Any required hit target is obstructed by overlay/z-index/pointer-events/dead panel, has zero-size bounds, or is below 44 CSS px where specified for touch/action controls.
- Hover/focus/selected/loading/error/receipt states shift layout bounds, translate rows, add bounce, add shimmer/skeleton, or stack noisy shadows/glows.
- User-facing folders, tags, unread counts, mark-all-read, archive bins, settings dashboards/sliders, source hierarchy, drag ordering, pause/resume source toggles, moderation queues, or activity ledgers.
- Mascot/cute SaaS/AI-magic copy or visuals: confetti, ghosts, apologetic empty/error copy, onboarding wizard, decorative gradients/blobs/Memphis filler, purple AI trust palette.
- Product UI copy exposes internal phrases: `Analyst's Workbench`, `Archival Index`, `low-fatigue`, `single-tenant`, or `no SaaS chrome`.
- Fake metrics/testimonials/placeholders presented as real; only honest placeholders (`—`, `summary unavailable`, raw `err:`/`partial:` lines) are allowed.

## Acceptance checklist mapping

- Hit-target coverage: `TODAY`, `SOURCE LEDGER`, Steer submit, row Inspect, star/resonate, Inspector links, `/doctor`, OPML import, source fetch/delete, state import/export.
- Keyboard/a11y coverage: tab order, focus visibility, Enter/Space activation, roles/labels/live regions, selected/active semantics.
- Interaction state matrix: normal, hover, selected, selected+hover, focus, selected+focus with no layout shift or noisy stacking.
- Inspector hierarchy: primary reading hierarchy separated from secondary raw/provenance diagnostics.
- Dirty corpus: JSON-LD, long text, HTML fragments, script/style leftovers, missing metadata, long URL/title, entities, media/enclosures, partial extraction, model error.
- Screenshot manifest: owner-token, first-use, today-list, source-ledger, selected-item, selected-hover, selected-focus, inspector-clean, inspector-raw-expanded-provenance, llm-error, search, doctor, mobile-feed, mobile-inspector.
- Negative rules: raw dumps, forbidden RSS-reader/SaaS concepts, obstructed or inert controls, design drift, fake content, and active panel mismatch.
