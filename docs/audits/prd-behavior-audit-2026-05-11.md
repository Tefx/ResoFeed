# ResoFeed PRD Behavior Audit

Date: 2026-05-11
Target: `http://127.0.0.1:8080/`
Scope: end-user behavior testing against `docs/PRD.md` and `docs/DESIGN.md`, expanding beyond UI pixel review into actual workflows: Inspect, Resonate, Search, Steer, Source addition, manual ingest, Doctor, state portability, and mobile route behavior.

## Verdict

This build is not a clean PRD pass.

Core reading and source-intake flows are partially functional: Today loads, Inspector opens, summaries/core insights are visible, Source Ledger can export/import state, an RSS URL pasted into Steer can add a source, `[RUN INGEST]` can pull that source, and the new source's items can appear and be retrieved by a unique lexical term.

The major failures are behavioral, not just visual:

- Search does not reliably execute or filter by the user's query.
- No-match Search returns an internal error while still showing feed items.
- Natural-language Steer policy correction does not produce a clear interpreted rule receipt and can surface only `err: internal: internal error`.
- Real-source Inspector payloads still leak site boilerplate and related-story tails.
- `/doctor` works through Steer but the direct `/doctor` route still falls back to the regular workbench.
- Doctor reports many OpenRouter `model_latency_error` failures, including for newly ingested fixture items.
- Mobile non-feed surfaces still leave underlying feed content in the page/readable flow.

## Test Method

The requested Codex in-app Browser Use surface was attempted first, but it reported `No active Codex browser pane available`. Arc was inspected through Computer Use, and the behavior audit itself used local browser automation against the live URL with normal page interactions: filling inputs, clicking buttons, waiting for downloads/file choosers, and reading visible page text. No unit tests or direct API calls were used to substitute for these product behavior checks.

To avoid permanently contaminating the local app state, the test exported state through the UI before mutations and restored it through the UI at the end.

## Evidence Captured

Artifacts are stored in:

- [artifact directory](artifacts/prd-behavior-audit-2026-05-11)
- [behavior observations JSON](artifacts/prd-behavior-audit-2026-05-11/prd-behavior-observations.json)

Representative screenshots:

- [baseline Today](artifacts/prd-behavior-audit-2026-05-11/00-today-baseline.png)
- [Inspector top](artifacts/prd-behavior-audit-2026-05-11/01-inspector-top.png)
- [Inspector tail](artifacts/prd-behavior-audit-2026-05-11/02-inspector-tail.png)
- [Resonate after click](artifacts/prd-behavior-audit-2026-05-11/03-resonate-after-click.png)
- [Search command: cricut](artifacts/prd-behavior-audit-2026-05-11/20-search-command-cricut.png)
- [Search no-match](artifacts/prd-behavior-audit-2026-05-11/21-search-no-match-exact-submit.png)
- [Steer policy command](artifacts/prd-behavior-audit-2026-05-11/22-steer-policy-command.png)
- [Add feed receipt](artifacts/prd-behavior-audit-2026-05-11/23-add-feed-url-receipt.png)
- [Ledger after add source](artifacts/prd-behavior-audit-2026-05-11/24-ledger-after-add-source.png)
- [Ledger after run ingest](artifacts/prd-behavior-audit-2026-05-11/25-ledger-after-run-ingest.png)
- [Feed after new source](artifacts/prd-behavior-audit-2026-05-11/26-feed-after-new-source.png)
- [Search new feed item](artifacts/prd-behavior-audit-2026-05-11/27-search-new-feed-item.png)
- [Doctor via Steer](artifacts/prd-behavior-audit-2026-05-11/28-doctor-via-steer.png)
- [Doctor direct route](artifacts/prd-behavior-audit-2026-05-11/29-doctor-direct-route.png)
- [Mobile Search](artifacts/prd-behavior-audit-2026-05-11/31-mobile-search-cricut-behavior.png)
- [Mobile Ledger](artifacts/prd-behavior-audit-2026-05-11/32-mobile-ledger-behavior.png)
- [State import restore](artifacts/prd-behavior-audit-2026-05-11/33-state-import-restore-result.png)

## Behavior Matrix

| PRD area | Result | Evidence |
| --- | --- | --- |
| Owner token / Today access | Pass | Today shell and feed loaded after owner token. |
| Inspect | Partial pass | Summary, core insight, and original link visible, but body still leaks real-source tail boilerplate. |
| Resonate | Partial pass | Visual state changes through fill/background, but accessible/text state remained unclear in automation. |
| Search by keyword | Fail | `search cricut` and explicit no-match search both returned unrelated/current feed items. |
| Search newly ingested item | Pass | Unique fixture term was retrievable after add source + ingest. |
| Steer natural-language policy | Fail | Policy command surfaced internal error / no clear interpreted rule receipt. |
| Add feed via Steer URL | Pass with UX caveat | Source was added and visible in Ledger, but receipt was terse. |
| Manual ingest | Pass | `[RUN INGEST]` updated source/ingest status and fixture items appeared. |
| LLM summary / understanding | Partial fail | Visible summaries exist, but Doctor reports many OpenRouter `model_latency_error` entries and fixture items degraded to partial/fallback. |
| `/doctor` through Steer | Pass | Raw diagnostic output displayed. |
| `/doctor` direct route | Fail | Direct URL rendered regular Today/Inspector instead of a diagnostic surface. |
| State export/import | Pass | Export downloaded; import restored state through UI with `import complete`. |
| Mobile Search | Partial fail | Usable form, but metadata truncates to low-information fragments. |
| Mobile Source Ledger | Partial fail | Ledger visible, but underlying Today feed remains in page/accessibility flow. |

## Findings

### B1. Search command shows Today/feed results instead of executing query

Severity: P1
PRD: Search and Retrieval, AC-8, AC-15

Entering `search cricut` through Steer moves the user into the Search surface and displays `retrieval: lexical search`, but the visible result list begins with unrelated current feed items such as Venmo, TikTok, Discord, and Wordle. This makes the system look like it searched while actually showing the default item set.

Evidence:

- [Search command: cricut](artifacts/prd-behavior-audit-2026-05-11/20-search-command-cricut.png)
- [Initial search command run](artifacts/prd-behavior-audit-2026-05-11/04-search-cricut.png)

Required correction:

When `search <query>` is submitted through Steer, the Search surface must immediately execute the lexical query, update result count from the actual query, and not show Today results as if they were query results. If the product wants a seed-only behavior, the receipt must say that explicitly and focus the submit control.

### B2. No-match Search returns internal error while still showing feed items

Severity: P1
PRD: Search and Retrieval

Submitting a unique no-match query produced `err: internal: internal error`, but the page still displayed ordinary feed/search result rows. This violates practical retrieval expectations: no-match should produce a plain empty state, not an internal error plus unrelated items.

Evidence:

- [Search no-match](artifacts/prd-behavior-audit-2026-05-11/21-search-no-match-exact-submit.png)

Required correction:

Return a stable no-results state for lexical misses. Do not leave prior/default items visible after a failed or empty search response.

### B3. Search surface has noisy/ambiguous interactive naming

Severity: P3
PRD: Search and Retrieval, Experience Requirements

During the first browser run, a generic role lookup for `button` named `search` matched the real submit button plus many `Inspect search result: ...` buttons. This is not catastrophic for sighted users, but it indicates the Search surface has a noisy interaction tree where the core submit action is easy to confuse with result-level inspect controls in accessibility/tooling contexts.

Evidence:

- [Search command: cricut](artifacts/prd-behavior-audit-2026-05-11/20-search-command-cricut.png)
- [behavior observations JSON](artifacts/prd-behavior-audit-2026-05-11/prd-behavior-observations.json)

Required correction:

Scope the Search form submit label more explicitly, for example `submit search`, while keeping visible text terse if needed. Ensure inactive or duplicated result controls are not exposed in the active accessibility tree.

### B4. Natural-language Steer policy correction fails or gives no usable interpretation

Severity: P1
PRD: Steer, AC-8

Submitting `Push more technical infrastructure reliability analysis in future ranking and summaries.` did not produce a clear interpreted rule or correction receipt. The visible screen showed `err: internal: internal error`, the command remained in the input, and no normalized `interpreted_as`/rule text was shown.

Evidence:

- [Steer policy command](artifacts/prd-behavior-audit-2026-05-11/22-steer-policy-command.png)

Required correction:

After natural-language Steer, show a terse but verifiable receipt: `interpreted_as: <normalized rule>` plus `applied` or `err:`. If parsing/model work fails, the error should be specific enough to let the owner retry or correct it.

### B5. Add-feed via Steer works, but the receipt is too terse

Severity: P3
PRD: First-run experience, Source management: Steer + Flat Ledger

Pasting an RSS URL into Steer did add the source, and the source appeared in Source Ledger. However, the visible receipt was essentially `applied: source added`, without naming the source title or URL or pointing toward `[RUN INGEST]`.

Evidence:

- [Add feed receipt](artifacts/prd-behavior-audit-2026-05-11/23-add-feed-url-receipt.png)
- [Ledger after add source](artifacts/prd-behavior-audit-2026-05-11/24-ledger-after-add-source.png)

Required correction:

Keep it minimal, but make it actionable: `source added: <title or host>` and optionally `run ingest in SOURCE LEDGER`. Do not add an onboarding wizard.

### B6. Newly added feed can ingest and appear, but LLM understanding degrades

Severity: P1
PRD: AI as Utility, Item Understanding Outputs, Summary Reliability, AC-14

The test RSS source was added, `[RUN INGEST]` completed, and the fixture items appeared in Today. However, `/doctor` reported `openrouter: failures=25` and `model_latency_error` entries for many items, including the newly ingested fixture items. The Doctor output also showed `partial_extraction` for those fixture items.

This means the feed intake path works, but the LLM/item-understanding path is not healthy for this run. Visible summaries may be coming from fallback/feed excerpt behavior rather than successful model summaries, while the UI still presents many items as normal `full` or source-backed surfaces.

Evidence:

- [Ledger after run ingest](artifacts/prd-behavior-audit-2026-05-11/25-ledger-after-run-ingest.png)
- [Feed after new source](artifacts/prd-behavior-audit-2026-05-11/26-feed-after-new-source.png)
- [Doctor via Steer](artifacts/prd-behavior-audit-2026-05-11/28-doctor-via-steer.png)

Required correction:

Make model failures and fallback taxonomy align with what the feed/Inspector claims. If summary/core insight came from fallback, mark it plainly; if OpenRouter has repeated latency errors, surface this only in `/doctor` but ensure item provenance is not overstated.

### B7. Inspector still leaks real-source boilerplate and related-story tail

Severity: P1
PRD: Inspect, Content extraction quality, Summary Reliability, AC-14

Inspector top-level summary/core/original link are present, but the long reading payload still includes real-source non-article material: follow/topic prompts, author taxonomy text, and related-story titles. This remains the largest trust break because the reading surface is supposed to be the deliberate verification view.

Evidence:

- [Inspector top](artifacts/prd-behavior-audit-2026-05-11/01-inspector-top.png)
- [Inspector tail](artifacts/prd-behavior-audit-2026-05-11/02-inspector-tail.png)

Required correction:

Move readable-body sanitation out of one-off UI regex and into a shared payload layer. Add a regression fixture for this exact The Verge tail pattern: follow-topic prompt, author/topic taxonomy, and related-story title after the article conclusion.

### B8. Resonate feedback is visually present but programmatically/semantically unclear

Severity: P3
PRD: Resonate, AC-2

Clicking the first star produced a visual filled-state in screenshots, but the automation observed the button text as `☆` both before and after click. This means the active state may rely too heavily on color/fill and not enough on accessible state/name.

Evidence:

- [Resonate after click](artifacts/prd-behavior-audit-2026-05-11/03-resonate-after-click.png)

Required correction:

Expose a stable state through `aria-pressed`, accessible name, or text/state attributes while preserving the simple star visual.

### B9. `/doctor` via Steer works, but direct `/doctor` route does not

Severity: P1
PRD: Steer, Diagnostics Output, AC-17

Submitting `/doctor` in Steer displayed raw diagnostics as required. Direct navigation to `/doctor` did not render a distinct diagnostic surface; it showed the regular workbench/Today surface instead.

Evidence:

- [Doctor via Steer](artifacts/prd-behavior-audit-2026-05-11/28-doctor-via-steer.png)
- [Doctor direct route](artifacts/prd-behavior-audit-2026-05-11/29-doctor-direct-route.png)

Required correction:

Either make `/doctor` a real route surface with the same diagnostics as the command, or redirect visibly to `/` and document that only the Steer command exists. Do not leave the URL at `/doctor` while rendering Today.

### B10. Mobile Source Ledger still leaves Today feed in the page/accessibility flow

Severity: P2
PRD: Source Ledger, Experience Requirements

Mobile Ledger is visible and improved, but the underlying feed remains in the page text flow below it. This can confuse scrolling, screen readers, and focus order. It also makes Source Ledger feel like an inserted panel rather than a clean operational surface.

Evidence:

- [Mobile Ledger](artifacts/prd-behavior-audit-2026-05-11/32-mobile-ledger-behavior.png)

Required correction:

On narrow screens, any non-feed surface such as Source Ledger, Search, or Doctor should hide or unmount the feed pane from layout and accessibility flow. Focus should move to the surface heading or back command.

### B11. Mobile Search metadata still loses useful information

Severity: P2
PRD: Search and Retrieval, Feed Item

Mobile Search result metadata still compresses to fragments such as `src: The V... · 1... · f... TODAY`. This is better than forced uppercase, but still fails the PRD/design goal of usable provenance for retrieval.

Evidence:

- [Mobile Search](artifacts/prd-behavior-audit-2026-05-11/31-mobile-search-cricut-behavior.png)

Required correction:

Give Search results a mobile-specific metadata layout: first line `src + age`, second line extraction/match/provenance. Do not force time group, extraction, and source into a single fragile line.

### B12. Source error diagnostics need a full-view affordance

Severity: P3
PRD: Diagnostics Output, Source Ledger

The flat Ledger direction is correct, but source-level `err:` diagnostics can become hard to inspect when truncated. This was raised by the UX art-director review as a recovery issue rather than a visual style issue.

Evidence:

- [Ledger after run ingest](artifacts/prd-behavior-audit-2026-05-11/25-ledger-after-run-ingest.png)

Required correction:

Keep the one-line/two-line flat diagnostic style, but expose the full raw `err:` text through `title`, `details`, or another terse disclosure.

### B13. Time group labels compete with metadata on narrow/search rows

Severity: P3
PRD: Daily Feed Behavior, Search and Retrieval

The `TODAY` inline time marker works acceptably on desktop feed rows, but in mobile Search it competes with source, age, and extraction status. This contributes to the metadata truncation problem.

Evidence:

- [Mobile Search](artifacts/prd-behavior-audit-2026-05-11/31-mobile-search-cricut-behavior.png)

Required correction:

For Search and narrow layouts, make time grouping a tiny separate marker or omit it from result rows where it undermines source/provenance readability.

## Confirmed Passes

### Source addition and ingest

Pasting a test RSS feed URL into Steer added a source. The source appeared in Source Ledger. `[RUN INGEST]` updated ingest/fetch status and the new fixture items appeared in Today.

Evidence:

- [Add feed receipt](artifacts/prd-behavior-audit-2026-05-11/23-add-feed-url-receipt.png)
- [Ledger after add source](artifacts/prd-behavior-audit-2026-05-11/24-ledger-after-add-source.png)
- [Ledger after run ingest](artifacts/prd-behavior-audit-2026-05-11/25-ledger-after-run-ingest.png)
- [Feed after new source](artifacts/prd-behavior-audit-2026-05-11/26-feed-after-new-source.png)

### Retrieval of newly ingested item

After ingest, searching by the unique fixture term retrieved the new item. This verifies that lexical retrieval can work for newly ingested corpus content even though general Search behavior is currently broken for other paths.

Evidence:

- [Search new feed item](artifacts/prd-behavior-audit-2026-05-11/27-search-new-feed-item.png)

### State portability

State export downloaded a JSON bundle. After behavior mutations, the baseline state was restored through the UI import flow and the UI reported `import complete`.

Evidence:

- [State import restore](artifacts/prd-behavior-audit-2026-05-11/33-state-import-restore-result.png)

## UX Art Director Review

The requested `uiux-art-director` review independently reached the same priority order:

1. Fix Inspector payload cleaning first; it is the biggest trust break.
2. Restore `/doctor` direct route behavior or remove the misleading URL route.
3. Make `search <query>` actually execute lexical search instead of only seeding a Search view.
4. Hide underlying feed layout/accessibility flow on mobile non-feed surfaces.
5. Give Search a dedicated mobile metadata anatomy.
6. Improve Steer receipts with a terse `interpreted_as` or normalized rule text.
7. Preserve full raw diagnostics for source errors without turning the Ledger into a dashboard.
8. Reconsider time group placement where it competes with source/provenance metadata.

## Recommended Fix Order

1. Fix Search behavior: command execution, no-match handling, stale/default items, and internal errors.
2. Fix natural-language Steer receipts and failure handling.
3. Fix Inspector readable payload sanitation using a shared layer and real-source regression fixtures.
4. Make `/doctor` direct route match `/doctor` Steer output, or redirect/document otherwise.
5. Align LLM/model failure provenance with feed/Inspector claims.
6. Hide feed from mobile non-feed surfaces and move focus correctly.
7. Tighten Resonate accessibility state and mobile Search metadata.
8. Add terse full-error affordances for Ledger diagnostics.

## Cleanup Note

The behavior test exported state before mutation and restored it through the UI after adding a temporary test RSS source, running ingest, and submitting a Steer command. The final restore screenshot shows `import complete`.

## Addendum: Targeted LLM and Natural-Language Steer Verification

Date: 2026-05-11
Target: `http://127.0.0.1:8080`
Scope: additional user-flow verification of the LLM chain and natural-language Steer behavior after another repair round.

The Codex in-app Browser pane was not attachable during this run (`No active Codex browser pane available`), so the test used browser automation against the same local target and exercised only rendered UI interactions: type into Steer, click `apply`, add a temporary RSS source through Steer, open Source Ledger, click `[RUN INGEST]`, open `/doctor`, inspect Today, open Inspector, and restore baseline state through UI import. No unit tests or direct product API calls were used as substitutes.

Evidence:

- [Observation JSON](artifacts/llm-steer-verification-2026-05-11/llm-steer-observations.json)
- [Baseline Today](artifacts/llm-steer-verification-2026-05-11/00-baseline-today.png)
- [Doctor before probe](artifacts/llm-steer-verification-2026-05-11/01-doctor-before-probe.png)
- [Complex natural-language Steer receipt](artifacts/llm-steer-verification-2026-05-11/02-natural-language-steer-receipt.png)
- [Probe source added](artifacts/llm-steer-verification-2026-05-11/03-add-probe-feed-receipt.png)
- [Ledger after probe source add](artifacts/llm-steer-verification-2026-05-11/04-ledger-after-probe-feed-add.png)
- [Ledger after probe ingest](artifacts/llm-steer-verification-2026-05-11/05-ledger-after-probe-ingest.png)
- [Doctor after probe ingest](artifacts/llm-steer-verification-2026-05-11/06-doctor-after-probe-ingest.png)
- [Today after probe ingest](artifacts/llm-steer-verification-2026-05-11/07-today-after-probe-ingest.png)
- [Probe Inspector](artifacts/llm-steer-verification-2026-05-11/08-probe-item-inspector-top.png)
- [Simple natural-language Steer receipt](artifacts/llm-steer-verification-2026-05-11/09-simple-natural-language-steer.png)
- [State restore after probe](artifacts/llm-steer-verification-2026-05-11/10-state-restore-after-probe.png)

### B14. Complex natural-language Steer still fails with internal error

Severity: P1
PRD: Steering Model, Agent and Human Steering

Submitting a combined instruction to hide one explicit topic and boost another through the Steer input returned `err: internal: internal error`. The UI did not show an interpreted rule, partial application, or safe rejection receipt. This means natural-language steering is not operational for a realistic policy sentence.

Evidence:

- [Complex natural-language Steer receipt](artifacts/llm-steer-verification-2026-05-11/02-natural-language-steer-receipt.png)

Required correction:

Natural-language Steer must either apply a validated steering rule and show a terse receipt, or reject the command with a specific, actionable reason. A generic internal error is not acceptable for the core steering loop.

### B15. Simple natural-language Steer also fails

Severity: P1
PRD: Steering Model

After ingesting the probe feed, a simpler instruction, `Reduce HideGamingLeak... coverage.`, also returned `err: internal: internal error`. This rules out the complex phrasing as the only trigger and points to a broader natural-language Steer failure path.

Evidence:

- [Simple natural-language Steer receipt](artifacts/llm-steer-verification-2026-05-11/09-simple-natural-language-steer.png)

Required correction:

Cover short natural-language steering requests with the same translation, validation, and receipt path as longer requests.

### B16. Explicit hide/reduce intent did not affect Today

Severity: P1
PRD: Daily Feed Behavior, Steering Model

The temporary feed included a probe item titled `HideGamingLeak...`. The user instruction explicitly asked the product to hide or reduce that item class. After adding the source and running ingest, the matching item still appeared in Today and was ranked above the desired `LLMChainBoost...` item.

Evidence:

- [Today after probe ingest](artifacts/llm-steer-verification-2026-05-11/07-today-after-probe-ingest.png)
- [Simple natural-language Steer receipt](artifacts/llm-steer-verification-2026-05-11/09-simple-natural-language-steer.png)

Required correction:

Once a steering instruction is accepted, Today ranking/filtering must visibly honor it. If a steering instruction fails, the UI should make clear that no policy was applied.

### B17. Boost intent did not affect ranking against the probe corpus

Severity: P2
PRD: Resonance and Ranking, Steering Model

The same instruction asked the product to push more items about the `LLMChainBoost...` topic. After ingest, the unrelated item matching the reduce/hide topic ranked first, and the explicitly boosted infrastructure item ranked below it. The test corpus was intentionally small, so this should have been easy to verify visually.

Evidence:

- [Today after probe ingest](artifacts/llm-steer-verification-2026-05-11/07-today-after-probe-ingest.png)

Required correction:

Expose deterministic, inspectable ranking behavior for accepted steering rules. At minimum, accepted boost/reduce rules should change ordering in a small controlled corpus.

### B18. LLM chain still reports model latency failures for newly ingested items

Severity: P1
PRD: LLM Processing, `/doctor`

After adding the temporary feed and clicking `[RUN INGEST]`, `/doctor` still showed `openrouter: failures=25`, `resolved_model=unknown`, and `status=model_latency_error` for each newly ingested probe item. The LLM path therefore was not confirmed as successful or clean for fresh content.

Evidence:

- [Doctor after probe ingest](artifacts/llm-steer-verification-2026-05-11/06-doctor-after-probe-ingest.png)

Required correction:

Freshly ingested items should move through a successful model state when OpenRouter is available. If the model times out or fails, `/doctor` should distinguish provider reachability from item-level transformation health more sharply.

### B19. Inspector is still fallback/excerpt-driven for probe items

Severity: P1
PRD: Inspector, LLM Processing

The probe article put its strongest evidence in the linked article body, including terms such as semaphore drain algorithm, cold-spare gateway, outage budget, and replay window. Inspector showed the item as `partial`, with `summary:` and `core insight:` content that remained RSS-excerpt-only rather than a model-backed synthesis of the linked article. This does not satisfy the expected analyst-workbench behavior for LLM summarization.

Evidence:

- [Probe Inspector](artifacts/llm-steer-verification-2026-05-11/08-probe-item-inspector-top.png)
- [Doctor after probe ingest](artifacts/llm-steer-verification-2026-05-11/06-doctor-after-probe-ingest.png)

Required correction:

When linked extraction and model transformation fail, Inspector should label the fallback clearly and avoid presenting excerpt-only text as a completed summary/core insight.

### B20. `/doctor` status semantics are misleading

Severity: P2
PRD: Diagnostics

`/doctor` simultaneously reported `openrouter: ok` and a nonzero failure count with `resolved_model=unknown`. From a user perspective, this reads as healthy at the headline while the item diagnostics below show the LLM chain is failing.

Evidence:

- [Doctor before probe](artifacts/llm-steer-verification-2026-05-11/01-doctor-before-probe.png)
- [Doctor after probe ingest](artifacts/llm-steer-verification-2026-05-11/06-doctor-after-probe-ingest.png)

Required correction:

Split provider configuration/reachability from transformation success. A healthier diagnostic shape would report something like `openrouter: reachable`, `model: unresolved`, and `item_transform: failing`.

### Additional Confirmed Passes From This Run

- Baseline state export worked through the UI before mutation.
- Pasting a temporary RSS URL into Steer added a source.
- The new source appeared in Source Ledger.
- `[RUN INGEST]` fetched the temporary source and surfaced its items in Today.
- Baseline state restore worked through UI import after the test.

Evidence:

- [Probe source added](artifacts/llm-steer-verification-2026-05-11/03-add-probe-feed-receipt.png)
- [Ledger after probe source add](artifacts/llm-steer-verification-2026-05-11/04-ledger-after-probe-feed-add.png)
- [Ledger after probe ingest](artifacts/llm-steer-verification-2026-05-11/05-ledger-after-probe-ingest.png)
- [Today after probe ingest](artifacts/llm-steer-verification-2026-05-11/07-today-after-probe-ingest.png)
- [State restore after probe](artifacts/llm-steer-verification-2026-05-11/10-state-restore-after-probe.png)

## Addendum: Full Recheck for Missed Issues

Date: 2026-05-11
Target: `http://localhost:8080/`

This pass rechecked the authenticated app through the Codex in-app Browser after the user reopened the browser pane. The pass covered desktop Today, Inspector, Resonate, `/doctor`, Search command attempts, Source Ledger navigation attempts, and mobile viewport screenshots. The raw automation produced several tentative flags, but only findings verified by screenshot or DOM text are promoted below.

Notes on scope and rejected evidence:

- Browser Use successfully captured authenticated desktop and mobile app evidence.
- Browser Use blocked `file:///Users/tefx/Projects/ResoFeed/docs/ui-preview.html` by URL policy; no workaround was attempted.
- A later fresh-browser replay reached the owner-token prompt, but the previously supplied token was rejected by the currently running server, so unauthenticated replay observations are not used as app-conformance findings.
- Raw flags about missing Inspector label/focus/why text and sticky mobile Steer were rejected after screenshot review: `INSPECTOR`, focused detail heading, `why: fresh from configured source`, and sticky bottom Steer are present.
- Raw flags about `/doctor`, Search, and Source Ledger from this pass were rejected because those actions did not execute reliably in that raw run. Existing findings B1, B2, B4, and B14-B20 remain the authoritative evidence for those areas.

Evidence:

- [Validated recheck summary](artifacts/full-recheck-2026-05-11/validated-full-recheck-summary.json)
- [Desktop baseline](artifacts/full-recheck-2026-05-11/00-desktop-baseline.png)
- [Desktop baseline DOM snapshot](artifacts/full-recheck-2026-05-11/00-desktop-baseline.snapshot.txt)
- [Inspector open](artifacts/full-recheck-2026-05-11/01-inspector-open.png)
- [Inspector DOM snapshot](artifacts/full-recheck-2026-05-11/01-inspector-open.snapshot.txt)
- [Mobile scrolled feed](artifacts/full-recheck-2026-05-11/10-mobile-scrolled-feed.png)
- [Mobile Inspector](artifacts/full-recheck-2026-05-11/11-mobile-inspector.png)

### B21. Feed rows omit visible quality/value tier metadata

Severity: P2
PRD: Item Understanding Outputs, Daily Feed Behavior
Design: Feed Item

The Today feed rows show source, age, extraction status, title, summary, and the Resonate action. They do not expose an objective quality assessment or value tier/equivalent priority category in the scan surface. The PRD requires every processed item to provide enough information for scanning and ranking, including objective quality assessment and value tier/equivalent priority category. The design says these outputs should be compressed into visible microcopy, such as `high`, `brief`, or `source-claim`, rather than pushed into a dashboard.

Evidence:

- [Desktop baseline](artifacts/full-recheck-2026-05-11/00-desktop-baseline.png)
- [Desktop baseline DOM snapshot](artifacts/full-recheck-2026-05-11/00-desktop-baseline.snapshot.txt)

Required correction:

Add a terse quality/value label to feed-item metadata, or otherwise expose the required priority/quality signal in the scan path without creating a settings panel or dashboard.

### B22. Inspector core insight and body still contain extraction pollution

Severity: P1
PRD: Item Understanding Outputs, Trust and Explainability
Design: Inspector Pane

The opened GM article's `core insight:` is not a concise insight; it reads like category/headline residue: `Transportation News Tech...`. The Inspector body also still includes source-site boilerplate and unrelated tail content in the DOM snapshot, including personalized-feed copy and an unrelated leaked/cracked-item fragment. This is stronger evidence for the existing Inspector sanitation problem because the item is marked `full · source-backed`, yet the supposed full text still contains cross-article contamination.

Evidence:

- [Inspector open](artifacts/full-recheck-2026-05-11/01-inspector-open.png)
- [Inspector DOM snapshot](artifacts/full-recheck-2026-05-11/01-inspector-open.snapshot.txt)

Required correction:

Treat source-site navigation, personalization copy, topic/author furniture, and related-story tails as extraction contamination before generating `summary`, `core insight`, and Inspector body. If the model/extractor cannot produce a clean insight, label the fallback explicitly rather than presenting category/headline residue as an insight.

### B23. Steer Enter-submit and surface navigation reliability need reproduction-grade coverage

Severity: P2
PRD: Core Human Workflows, Steer, Diagnostics Output, Search and Retrieval
Design: Steer Input, App Shell

The raw Browser Use run attempted user-equivalent actions while the Inspector was open: type `/doctor`, `search source:The Verge`, and `search resonated:true` into Steer and press `Enter`, then click `TODAY` / `SOURCE LEDGER`. The resulting snapshots still showed the typed command in the Steer input, the `apply` button still visible, and the app still in the Inspector context. Those screenshots do not prove that `/doctor`, Search, or Source Ledger themselves failed, because the commands/navigation did not reliably execute. They do, however, expose a narrower UX risk: keyboard submit and primary-surface navigation from an open Inspector state are not yet backed by reliable browser-level evidence.

This matters because the design explicitly says `Enter` submits Steer, and the primary surface navigation is the user's way out of detail/utility states. A user should not have to depend on only clicking `apply` or `back to TODAY` if the chrome advertises keyboard submission and top-level surface controls.

Evidence:

- [Doctor raw snapshot with command still in input](artifacts/full-recheck-2026-05-11/04-doctor-output.snapshot.txt)
- [Search source raw snapshot with command still in input](artifacts/full-recheck-2026-05-11/05-search-source-filter.snapshot.txt)
- [Search resonated raw snapshot with command still in input](artifacts/full-recheck-2026-05-11/06-search-resonated-filter.snapshot.txt)
- [Back-to-Today raw snapshot still in Inspector context](artifacts/full-recheck-2026-05-11/07-back-to-today.snapshot.txt)
- [Source Ledger raw snapshot still in Inspector context](artifacts/full-recheck-2026-05-11/08-source-ledger.snapshot.txt)

Required correction:

Add reproduction-grade browser coverage for: Steer `Enter` submission from feed, Inspector, Search, and Ledger states; `apply` click submission from the same states; top-nav `TODAY` and `SOURCE LEDGER` clicks from an open Inspector. If any of these fail under real browser interaction, fix the event/focus/surface-state handling. Do not classify this as `/doctor`, Search, or Ledger endpoint failure unless the command or navigation is proven to have executed.

## Addendum: UI/UX Art Director Supplemental Review

Date: 2026-05-11
Reviewer: `uiux-art-director`

The independent UI/UX review confirmed the priority order already captured by B1-B23: Inspector trust, Search state, natural-language Steer clarity, `/doctor` semantics, mobile surface containment, provenance readability, and Steer/surface navigation reliability. The review also identified the following experience-quality improvements that should be handled with the same remediation pass where practical.

### U1. Mobile Search form consumes too much first-screen space

Severity: P2
Design: Search and Retrieval, Mobile Layout

On mobile Search, the filter/form area consumes too much vertical space before results. This makes retrieval feel like a settings form rather than a lightweight recall surface and reduces immediate result visibility.

Evidence:

- [Mobile Search](artifacts/prd-behavior-audit-2026-05-11/31-mobile-search-cricut-behavior.png)

Recommended improvement:

On mobile, default to query + submit + result count. Move source/date/resonated/limit controls into a compact disclosure or tighter secondary row. Preserve lexical retrieval clarity without making Search feel like a fourth dashboard.

### U2. Add-feed receipt is too terse to orient the next action

Severity: P3
Design: Steer Input, Source Ledger

The current `applied: source added` receipt confirms mutation but gives little orientation. A user still has to infer which source was added and whether ingest is needed.

Evidence:

- [Add feed receipt](artifacts/prd-behavior-audit-2026-05-11/23-add-feed-url-receipt.png)
- [Ledger after add source](artifacts/prd-behavior-audit-2026-05-11/24-ledger-after-add-source.png)

Recommended improvement:

Keep the receipt terse, but include the source title or host and the next operational hint: `source added: <title|host>; run ingest in SOURCE LEDGER`. Do not add a wizard, toast stack, or settings flow.

### U3. Source Ledger row grammar is still visually unstable

Severity: P2
Design: Source Ledger

Ledger rows still over-rely on long URL/status strings for user understanding. When source names are missing or URLs are long, the row reads as raw data rather than a stable operational ledger.

Evidence:

- [Ledger after add source](artifacts/prd-behavior-audit-2026-05-11/24-ledger-after-add-source.png)
- [Ledger after run ingest](artifacts/prd-behavior-audit-2026-05-11/25-ledger-after-run-ingest.png)
- [Mobile Ledger](artifacts/prd-behavior-audit-2026-05-11/32-mobile-ledger-behavior.png)

Recommended improvement:

Stabilize row anatomy around predictable fields: `src`, `status`, `last_fetch`, `url`, and actions. Long URL and raw diagnostics should remain accessible, but they should not be the primary scan anchor.

### U4. Diagnostics should be more scan-readable without becoming a dashboard

Severity: P2
Design: Diagnostics Output

`/doctor` should remain raw monospace text, but the current output is hard to scan when provider reachability, model resolution, and item-transform failures are mixed together. This compounds B20's misleading `openrouter: ok` plus `failures=...` problem.

Evidence:

- [Doctor via Steer](artifacts/prd-behavior-audit-2026-05-11/28-doctor-via-steer.png)
- [Doctor after probe ingest](artifacts/llm-steer-verification-2026-05-11/06-doctor-after-probe-ingest.png)

Recommended improvement:

Keep raw text, but split the first lines into stable keys such as `provider_reachable`, `model_resolved`, and `item_transform_failures`, then list raw item lines below. Do not add charts, badges, cards, or remediation panels.

### U5. Current surface state needs stronger programmatic semantics

Severity: P2
Design: App Shell, Search and Retrieval, Diagnostics Output, Source Ledger

The app has multiple surfaces that can coexist in the DOM: Today, Inspector, Search, Doctor, and Source Ledger. The current experience relies heavily on visual context and back buttons. The UI should make the active surface unambiguous to keyboard and assistive-tech users, especially after commands are submitted from Steer while Inspector is open.

Evidence:

- [Doctor raw snapshot with command still in input](artifacts/full-recheck-2026-05-11/04-doctor-output.snapshot.txt)
- [Search source raw snapshot with command still in input](artifacts/full-recheck-2026-05-11/05-search-source-filter.snapshot.txt)
- [Source Ledger raw snapshot still in Inspector context](artifacts/full-recheck-2026-05-11/08-source-ledger.snapshot.txt)
- [Mobile Ledger](artifacts/prd-behavior-audit-2026-05-11/32-mobile-ledger-behavior.png)

Recommended improvement:

Ensure every active surface has a clear heading, active landmark/state, focus destination, and inactive-surface containment. `TODAY` / `SOURCE LEDGER` nav can use `aria-current`, but Search, Doctor, and Inspector also need equivalent route/surface semantics without becoming new top-level tabs.
