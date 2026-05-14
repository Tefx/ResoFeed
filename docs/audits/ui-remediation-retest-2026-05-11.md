# ResoFeed UI Remediation Retest Audit

Date: 2026-05-11
Target: `http://127.0.0.1:8080/`
Scope: post-remediation UI/UX retest against `docs/DESIGN.md`, `docs/ui-preview.html` intent, and the previously recorded full UI conformance findings.

## Verdict

The remediation is directionally successful, but the live app is not yet a clean design-conformance pass.

Major shell, feed, search, ledger, doctor, and original-link issues have improved. Remaining blockers are concentrated in Inspector content sanitation, narrow/mobile Source Ledger row geometry, metadata readability, and stale command/receipt state.

## Evidence Captured

Screenshots were captured from the Codex in-app browser and copied into this audit directory:

- [desktop feed](artifacts/ui-remediation-retest-2026-05-11/feed.png)
- [desktop inspector](artifacts/ui-remediation-retest-2026-05-11/inspector.png)
- [desktop source ledger](artifacts/ui-remediation-retest-2026-05-11/ledger.png)
- [desktop doctor](artifacts/ui-remediation-retest-2026-05-11/doctor.png)
- [desktop search](artifacts/ui-remediation-retest-2026-05-11/search.png)
- [mobile feed](artifacts/ui-remediation-retest-2026-05-11/mobile-feed.png)
- [mobile inspector](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector.png)
- [mobile inspector content](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector-content.png)
- [mobile inspector boilerplate](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector-boilerplate.png)
- [mobile inspector tail](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector-tail.png)
- [mobile source ledger](artifacts/ui-remediation-retest-2026-05-11/mobile-ledger.png)
- [mobile search](artifacts/ui-remediation-retest-2026-05-11/mobile-search.png)

## Confirmed Improvements

### App shell and feed

Status: mostly fixed.

The live desktop feed now presents a lightweight workbench shell: no persistent left navigation, no large marketing-style masthead, and no settings-sidebar behavior. The top row is reduced to Steer plus product labeling, matching the `App Shell` direction in `docs/DESIGN.md`.

Feed rows now include item age, useful summary text, and inline time-group labels. The feed is closer to the archival-index density target than the prior audited build.

Evidence:

- [desktop feed](artifacts/ui-remediation-retest-2026-05-11/feed.png)
- [mobile feed](artifacts/ui-remediation-retest-2026-05-11/mobile-feed.png)

### Search

Status: substantially improved.

Search now renders as `SEARCH`, uses a compact form, and search results mostly reuse feed-item anatomy with Inspect and Resonate affordances. Mobile search no longer has the previous label/input collision.

Evidence:

- [desktop search](artifacts/ui-remediation-retest-2026-05-11/search.png)
- [mobile search](artifacts/ui-remediation-retest-2026-05-11/mobile-search.png)

### Original link behavior

Status: fixed.

The Inspector `original link` is now a real outbound link and opens in a new tab. This resolves the prior issue where the visible link was present but navigation was suppressed.

Evidence:

- [desktop inspector](artifacts/ui-remediation-retest-2026-05-11/inspector.png)
- [mobile inspector](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector.png)

### Source Ledger action labels

Status: partially fixed.

The Ledger now uses bracket action labels such as `[RUN INGEST]`, `[FETCH]`, `[DELETE]`, `[IMPORT OPML]`, `[EXPORT STATE]`, and `[IMPORT STATE]`. The false default imported-status issue was not observed in the retest.

Evidence:

- [desktop source ledger](artifacts/ui-remediation-retest-2026-05-11/ledger.png)
- [mobile source ledger](artifacts/ui-remediation-retest-2026-05-11/mobile-ledger.png)

### `/doctor`

Status: mostly fixed.

The `/doctor` route now behaves as a clean operational surface rather than rendering on top of the feed. Long diagnostic lines wrap instead of visibly cropping in the tested viewport.

Evidence:

- [desktop doctor](artifacts/ui-remediation-retest-2026-05-11/doctor.png)

## Remaining Findings

### R1. Inspector reading payload still contains raw site boilerplate

Severity: P1
Status: still failing
Design reference: `docs/DESIGN.md` -> `Inspector Pane`

The mobile Inspector still includes non-reading payload content, including repeated summary-like text, author/profile copy, affiliate/commission disclosure, image attribution, and tail-end follow/recommendation copy. This violates the Inspector requirement that it must not include related-content modules, ads, or recommendation material.

Observed examples include:

- repeated intro/summary text before the article body;
- "If you buy something from a Verge link..." affiliate disclosure;
- author biography-style copy;
- photo credit text embedded in the body;
- "Follow topics and authors..." recommendation copy;
- unrelated story titles near the tail.

Evidence:

- [mobile inspector content](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector-content.png)
- [mobile inspector boilerplate](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector-boilerplate.png)
- [mobile inspector tail](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector-tail.png)

Required correction:

Inspector body sanitation must remove affiliate disclosures, author/profile boilerplate, photo credits when they are not article prose, follow/recommendation prompts, and related-story tails before rendering the reading payload.

### R2. Mobile Source Ledger row loses source identity/status

Severity: P1
Status: new or residual regression
Design reference: `docs/DESIGN.md` -> `Source Ledger`

At 390px width, the Source Ledger row no longer clearly preserves the required row fields. The visible row emphasizes the URL and actions, while the source name and last-fetch/status content are missing, collapsed, or pushed out of the readable first row.

The design requires source name, URL, adjacent last-fetch status or raw diagnostic text, and right-aligned actions. On mobile, wrapping is allowed, but row identity must remain readable.

Evidence:

- [mobile source ledger](artifacts/ui-remediation-retest-2026-05-11/mobile-ledger.png)

Required correction:

Use a mobile row layout that preserves `src: <name>`, URL, status, and action block in predictable order. Prefer stacked-but-stable row fields over compressing name/status out of view.

### R3. Metadata remains uppercased and becomes unreadable on mobile

Severity: P2
Status: still failing
Design reference: `docs/DESIGN.md` -> `Feed Item`

Feed and search metadata are still rendered in forced uppercase, e.g. `SRC: THE VERGE`, instead of the required compact inline grammar `src: <host> · <age> · <full|partial|excerpt>`.

On mobile search, metadata truncates into fragments such as `SRC: THE ... · 4.. · F...`, which preserves neither source readability nor extraction provenance.

Evidence:

- [desktop feed](artifacts/ui-remediation-retest-2026-05-11/feed.png)
- [mobile search](artifacts/ui-remediation-retest-2026-05-11/mobile-search.png)

Required correction:

Remove forced uppercase from metadata content and prioritize readable truncation. On narrow widths, source and age should remain legible before lower-priority extraction markers truncate.

### R4. Inspector renders duplicate extraction state

Severity: P2
Status: still failing
Design reference: `docs/DESIGN.md` -> `Inspector Pane`

The Inspector displays `full · full`, duplicating extraction/provenance state. This adds diagnostic noise to the reading header.

Evidence:

- [desktop inspector](artifacts/ui-remediation-retest-2026-05-11/inspector.png)
- [mobile inspector](artifacts/ui-remediation-retest-2026-05-11/mobile-inspector.png)

Required correction:

Render extraction status once. If two fields exist internally, collapse them into a single user-facing provenance string.

### R5. Search command state leaks back into Today/feed context

Severity: P2
Status: residual behavior issue
Design reference: `docs/DESIGN.md` -> `Steering Receipt`, `Search and Retrieval`

After using Search and returning to Today/feed, the UI can still show `retrieval: lexical search`, while the Steer input retains the previous query or command and keeps the `apply` button visible. This creates an ambiguous state: the visible surface is Today, but receipt/input context still reads like Search.

Evidence:

- [mobile feed](artifacts/ui-remediation-retest-2026-05-11/mobile-feed.png)
- [mobile search](artifacts/ui-remediation-retest-2026-05-11/mobile-search.png)

Required correction:

Clear or scope retrieval receipts to the active surface. If the current surface is Today, Search-specific receipt text should not persist unless explicitly useful and clearly timestamped.

### R6. Mobile search DOM exposes duplicate Inspect surfaces

Severity: P3
Status: accessibility/DOM concern
Design reference: `docs/DESIGN.md` -> `Search and Retrieval`

During mobile search inspection, the DOM snapshot exposed both old feed-style `Open Inspector for: ...` buttons and Search-specific `Inspect search result: ...` buttons. The visible UI may not show both sets, but the duplicate interactive surface can confuse keyboard and assistive-technology navigation.

Evidence:

- [mobile search](artifacts/ui-remediation-retest-2026-05-11/mobile-search.png)

Required correction:

When Search is active, hide or unmount inactive feed inspect controls from the accessibility tree. Only the visible/current surface should expose interactive result controls.

### R7. Source Ledger source row still does not fully match required row grammar

Severity: P3
Status: partial residual
Design reference: `docs/DESIGN.md` -> `Source Ledger`

The desktop Ledger is improved but still does not clearly follow the example grammar `src: <name>`, URL, status, and right-aligned action block. The current row begins with the source name and status text, but the `src:` prefix and strict field separation are not fully visible.

Evidence:

- [desktop source ledger](artifacts/ui-remediation-retest-2026-05-11/ledger.png)

Required correction:

Align rendered markup and visible text with the required DOM contract: source name should render as `src: <name>`, followed by URL, status, and actions.

### R8. State Portability remains visually separated from Ledger actions

Severity: P3
Status: partial residual
Design reference: `docs/DESIGN.md` -> `State Portability`

State Portability has improved labels, but it still reads as a separate horizontal section rather than terse actions reachable from the Source Ledger footer/action cluster.

Evidence:

- [desktop source ledger](artifacts/ui-remediation-retest-2026-05-11/ledger.png)
- [mobile source ledger](artifacts/ui-remediation-retest-2026-05-11/mobile-ledger.png)

Required correction:

Move `[EXPORT STATE]` and `[IMPORT STATE]` into a Ledger footer/action cluster while preserving the required warning text: `import replaces active sources, rules, and stars`.

## Retest Matrix

| Surface | Desktop result | Mobile result | Notes |
| --- | --- | --- | --- |
| App shell / Today | Pass with minor metadata residuals | Pass with stale receipt/metadata residuals | Shell cleanup is the clearest win. |
| Feed item anatomy | Mostly pass | Partial pass | Metadata casing/truncation still fails. |
| Inspector | Partial pass | Fail | Original link fixed; body sanitation still P1. |
| Source Ledger | Partial pass | Fail | Desktop action labels improved; mobile row geometry fails. |
| State Portability | Partial pass | Partial pass | Labels improved; placement still drifted. |
| `/doctor` | Mostly pass | Not exhaustively retested | Desktop route no longer renders over feed. |
| Search | Mostly pass | Partial pass | Layout fixed; DOM/state residuals remain. |

## Priority Fix Order

1. Fix Inspector body sanitation for boilerplate, affiliate text, author/profile copy, image credits, recommendation/follow prompts, and related-story tails.
2. Rebuild mobile Source Ledger row layout so source name, URL, status, and actions remain readable at 390px.
3. Correct metadata grammar and mobile truncation: `src:` lower-case, readable source/age, graceful extraction truncation.
4. Collapse duplicate Inspector extraction state from `full · full` to a single provenance value.
5. Scope Search receipts and Steer retained value to the active surface.
6. Remove inactive duplicate Inspect controls from the accessibility tree during Search.
7. Tighten Ledger DOM/visual grammar and State Portability placement.

## Verification Notes

The retest used the in-app browser against `http://127.0.0.1:8080/` and a 390x844 mobile viewport override. The viewport override was reset after capture.

Computer Use could list local apps but was blocked from inspecting the Codex app window by safety policy, so the visual evidence in this report comes from Browser screenshots.
