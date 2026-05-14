# ResoFeed Runtime UI Design Audit

Date: 2026-05-15

Scope:

- Started the real `resofeed serve` binary locally.
- Used Browser Use against the live app at `http://127.0.0.1:18080/`.
- Used Computer Use for local app/window state inspection.
- Attempted Chrome plugin automation and recorded the failure mode.
- Compared live UI against `docs/DESIGN.md` and `docs/ui-preview.html`.
- Did not run unit tests.

Primary evidence:

- Runtime screenshots: `.test-artifacts/ui-audit/*.png`
- Browser measurement summary: `.test-artifacts/ui-audit/ui-audit-metrics.json`
- Runtime database used for the audit: `.test-artifacts/ui-audit.sqlite3`
- Design contract: `docs/DESIGN.md`
- Static preview: `docs/ui-preview.html`
- Relevant implementation files:
  - `web/src/routes/components/SourceLedger.svelte`
  - `web/src/routes/components/SearchRetrieval.svelte`
  - `web/src/routes/components/OwnerTokenPrompt.svelte`
  - `web/src/routes/components/Inspector.svelte`
  - `web/src/app.css`

## Tool Coverage

Browser Use was used successfully. It opened the live ResoFeed serve target, authenticated with the owner token, and exercised:

- owner-token prompt and rejected-token state;
- first-use empty state;
- Today feed;
- Inspector;
- Resonate star;
- `RESOFEED` surface menu;
- Source Ledger;
- OPML import;
- state export;
- RSS URL addition through Steer;
- Search;
- `/doctor`;
- mobile feed, mobile Inspector, and mobile Source Ledger.

Chrome plugin automation was attempted but failed before page testing:

```text
agent.browsers.get("extension")
=> Browser is not available: extension
```

Follow-up read-only checks found Chrome installed and running, Codex Chrome Extension installed and enabled, and the native host manifest correct. The failure appears to be a Codex-to-Chrome extension backend/handshake problem, not a ResoFeed UI problem. No Chrome window was opened because the Chrome plugin instructions require user confirmation before doing that recovery step.

Computer Use was used to inspect local app state. It could read Arc, but Codex app access was blocked for safety and Chrome state retrieval timed out. Therefore the product UI evidence is from Browser Use plus screenshot/DOM/computed-style measurements.

## Reproduction Setup

Build the real frontend and Go binary:

```bash
npm --prefix web run build
mkdir -p .test-artifacts/bin
go build -o .test-artifacts/bin/resofeed ./cmd/resofeed
```

Start the real server with an isolated audit database:

```bash
rm -f .test-artifacts/ui-audit.sqlite3 .test-artifacts/ui-audit.sqlite3-*
OPENROUTER_KEY=local_dummy_resofeed_ui_audit \
RESOFEED_E2E=1 \
.test-artifacts/bin/resofeed serve \
  --addr 127.0.0.1:18080 \
  --public-url http://127.0.0.1:18080 \
  --db .test-artifacts/ui-audit.sqlite3 \
  --owner-token owner-token-ui-audit-0123456789abcdef
```

Open:

```text
http://127.0.0.1:18080/
```

Authenticate with:

```text
owner-token-ui-audit-0123456789abcdef
```

The screenshot and metrics artifacts from the original run are already present under `.test-artifacts/ui-audit/`. The most useful files are:

- `15-playwright-desktop-feed.png`
- `18-playwright-ledger.png`
- `20-playwright-steer-add-source.png`
- `21-playwright-doctor.png`
- `22-playwright-search.png`
- `23-playwright-mobile-feed.png`
- `24-playwright-mobile-inspector.png`
- `25-playwright-mobile-ledger.png`
- `ui-audit-metrics.json`

## Severity Legend

- P0: Core design/product contract break or missing primary workflow.
- P1: Major visible UI/UX divergence.
- P2: Accessibility, polish, layout, or consistency defect.
- P3: Preview/documentation drift or lower-risk cleanup.

## Findings

### 1. Source Ledger is missing `[RUN INGEST]`

Severity: P0

Expected:

- `docs/DESIGN.md` requires a global `[RUN INGEST]` action in Source Ledger header/action area.
- It must call the real manual ingest path, show `[INGESTING...]` while pending, then return to `[RUN INGEST]` with terse success/conflict/error text.

Actual:

- No `[RUN INGEST]` button appears in the live Source Ledger.
- Browser measurement recorded `runIngestCount: 0`.

Reproduction:

1. Start the server with the audit setup above.
2. Authenticate.
3. Open `RESOFEED` menu.
4. Click `SOURCE LEDGER`.
5. Inspect the Source Ledger header and action cluster.
6. There is no `[RUN INGEST]`.

Evidence:

- Screenshot: `.test-artifacts/ui-audit/18-playwright-ledger.png`
- Metrics failure: `source-ledger-run-ingest-present`
- Implementation: `web/src/routes/components/SourceLedger.svelte` renders the header at lines 107-110 without the required action.

Likely fix area:

- Add Source Ledger props and callbacks for manual ingest.
- Render a `.bracket-action--run-ingest` button in the header/action cluster.
- Wire it to `POST /api/ingest`.

### 2. Source Ledger rows are missing per-source `[FETCH]`

Severity: P0

Expected:

- `docs/DESIGN.md` requires source-level `[FETCH]` actions on each source row.
- `[FETCH]` must become `[FETCHING...]` while pending, keep the same hitbox, and update row-level `last_fetch` or raw `err:` status.

Actual:

- No row contains `[FETCH]`.
- Browser measurement recorded `fetchButtonCount: 0`.
- Mobile Source Ledger also has no `[FETCH]`.

Reproduction:

1. Open Source Ledger as above.
2. Inspect each source row.
3. Observe only `[DELETE]` and `[DETAILS]`; `[FETCH]` is absent.
4. Repeat at mobile viewport `390x844`; `[FETCH]` is still absent.

Evidence:

- Desktop screenshot: `.test-artifacts/ui-audit/18-playwright-ledger.png`
- Mobile screenshot: `.test-artifacts/ui-audit/25-playwright-mobile-ledger.png`
- Metrics failures: `source-ledger-fetch-present`, `mobile-ledger-fetch-controls-present`
- Implementation: `web/src/routes/components/SourceLedger.svelte` line 122 renders only delete/confirm actions.

Likely fix area:

- Add per-source fetch callback to `SourceLedger.svelte`.
- Wire to `POST /api/sources/{id}/fetch`.
- Preserve row geometry during `[FETCHING...]` and error states.

### 3. `docs/ui-preview.html` is missing manual ingest/fetch controls

Severity: P1

Expected:

- The preview page should reflect the canonical Source Ledger shape from `docs/DESIGN.md`.
- It should show `[RUN INGEST]` and row-level `[FETCH]`.

Actual:

- The preview shows `background ingest active`.
- It only renders `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`, and `[DELETE]`.
- It includes copy saying refresh is handled by background ingest.

Reproduction:

1. Open or inspect `docs/ui-preview.html`.
2. Search for `[RUN INGEST]` and `[FETCH]`.
3. Both are absent.

Evidence:

- Metrics failures: `ui-preview-includes-run-ingest`, `ui-preview-includes-fetch`
- `docs/ui-preview.html` lines 673-710

Likely fix area:

- Update `docs/ui-preview.html` Source Ledger fixture to include:
  - `last_ingest: HH:MM:SS`;
  - `[RUN INGEST]`;
  - row-level `[FETCH]`;
  - row-level raw error display.

### 4. Source Ledger does not show raw `err:` diagnostics inline

Severity: P1

Expected:

- `docs/DESIGN.md` requires raw `err: <diagnostic>` strings adjacent to affected source rows.
- Long diagnostics should clamp/ellipsis on desktop and be exposed through `title` or details.

Actual:

- The audit database contained `last_fetch_error = 'err: timeout ...'`.
- Live UI only showed `status: rss_fetch_error`.
- No visible `err:` appeared in the ledger row.

Reproduction:

1. Insert or use a source row with `last_fetch_status='rss_fetch_error'` and `last_fetch_error='err: timeout ...'`.
2. Open Source Ledger.
3. Observe that only `status: rss_fetch_error` is shown.
4. The raw diagnostic is not adjacent to the row.

Evidence:

- Metrics failure: `ledger-raw-error-visible`
- Screenshot: `.test-artifacts/ui-audit/18-playwright-ledger.png`
- Database evidence:

```sql
select id, title, last_fetch_status, last_fetch_error
from sources
where id = 'src_local';
```

Actual row contains the raw error in SQLite, but the UI does not render it.

Likely fix area:

- Backend `Source` JSON currently does not expose `last_fetch_error`.
- Add it to the API shape or provide a row diagnostic field.
- Render it as `.source-ledger__status--error` / raw error text.

### 5. Source Ledger row geometry does not match the design contract

Severity: P1

Expected:

- Source name, URL, status/error, and right-aligned actions should be stable columns.
- `[FETCHING...]`, `[INGESTING...]`, and raw errors must not push source metadata.

Actual:

- Current UI compresses `src`, `status`, and `last_fetch` into one long text cell.
- Long URL and status strings truncate aggressively.
- Important values are visibly collapsed in desktop and mobile screenshots.

Reproduction:

1. Use a long source URL such as:
   `https://very-long-source.example.com/feeds/research/2026/05/14/extremely/deep/path/that/should/ellipsis.xml`
2. Open Source Ledger.
3. Observe `last_fetch` and URL truncation competing with each other.

Evidence:

- Desktop screenshot: `.test-artifacts/ui-audit/18-playwright-ledger.png`
- Mobile screenshot: `.test-artifacts/ui-audit/25-playwright-mobile-ledger.png`
- CSS: `web/src/app.css` lines 150-175

Likely fix area:

- Use the documented `.source-ledger__row` column structure.
- Separate source name, URL, status/error, and actions instead of combining status into source copy.

### 6. `[IMPORT OPML]` is not keyboard/button semantic

Severity: P1

Expected:

- OPML import must be keyboard and pointer reachable from Source Ledger.
- The visible action should be a button-like bracket action with explicit accessible name.

Actual:

- Visible `[IMPORT OPML]` is a `<label for="opml-file">`.
- Browser measurement:

```json
{
  "text": "[IMPORT OPML]",
  "tabIndex": -1,
  "role": null,
  "display": "flex",
  "width": 126.40625,
  "height": 44
}
```

Reproduction:

1. Open Source Ledger.
2. Try keyboard tabbing to `[IMPORT OPML]`.
3. The visible label is not a normal keyboard-focusable button.
4. Pointer click works, but the semantic action does not satisfy the keyboard contract.

Evidence:

- Metrics failure: `opml-visible-action-keyboard-role`
- Implementation: `web/src/routes/components/SourceLedger.svelte` lines 132-140

Likely fix area:

- Render a real `<button type="button">[IMPORT OPML]</button>`.
- Trigger the file input from the button while keeping the file input keyboard accessible.

### 7. Bracket action hover/focus is too weak

Severity: P2

Expected:

- `docs/DESIGN.md` requires bracket actions to feel terminal-like:
  - immediate color inversion, or
  - equally stark instantaneous highlight.

Actual:

- `.bracket-action:hover` and `:focus-visible` only add an outline.
- Background stays transparent; no inversion.

Reproduction:

1. Open Source Ledger.
2. Hover or keyboard-focus `[EXPORT STATE]`, `[IMPORT STATE]`, or `[DELETE]`.
3. Observe outline-only treatment instead of terminal-style inversion.

Evidence:

- CSS: `web/src/app.css` lines 210-215

Likely fix area:

- Align `.bracket-action:hover` / `:focus-visible` with `docs/ui-preview.html` lines 443-447, or another equally stark token-based highlight.

### 8. Search exposes architecture/design explanation as user-visible copy

Severity: P2

Expected:

- User-visible UI should stay operational and should not render internal product/design explanations.
- Search results can show provenance, but not architecture note prose.

Actual:

- Search surface renders:

```text
Lexical and metadata retrieval only; results stay source-backed.
```

This is an implementation/architecture explanation, not an operational UI label.

Reproduction:

1. Enter `search sqlite` in Steer.
2. Submit.
3. Observe the note at the bottom of Search.

Evidence:

- Screenshot: `.test-artifacts/ui-audit/22-playwright-search.png`
- Metrics failure: `search-architecture-note-not-visible`
- Implementation: `web/src/routes/components/SearchRetrieval.svelte` line 157

Likely fix area:

- Remove visible explanatory note.
- Keep provenance in each result row via compact metadata such as `match: lexical index` and `provenance: source-backed`.

### 9. Search filter layout is visually misaligned on desktop

Severity: P2

Expected:

- Dense but organized operational layout.
- Labels and controls should scan as aligned pairs.

Actual:

- At 1280px, `Result limit` appears far from its select.
- The select falls to the next visual row, making the filter panel look broken.

Reproduction:

1. Enter `search sqlite`.
2. Use desktop viewport `1280x900`.
3. Inspect the filter grid.
4. Observe `Result limit` label and select are visually disconnected.

Evidence:

- Screenshot: `.test-artifacts/ui-audit/22-playwright-search.png`
- Implementation: `web/src/routes/components/SearchRetrieval.svelte` lines 86-105
- CSS grid: `web/src/app.css` lines 587-597

Likely fix area:

- Rework filter grid into stable label/control pairs.
- Avoid placing a checkbox label/control in a way that shifts the following select.

### 10. Mobile feed metadata is over-truncated

Severity: P1

Expected:

- Mobile feed should remain compact but legible.
- Metadata should preserve useful source, age, extraction, and provenance signals.

Actual:

- Mobile feed displays fragments like:

```text
src: si... · 1... · mod... · val...
```

This is too truncated to support triage.

Reproduction:

1. Set viewport to `390x844`.
2. Open the authenticated feed.
3. Inspect the metadata rows.

Evidence:

- Screenshot: `.test-artifacts/ui-audit/23-playwright-mobile-feed.png`
- CSS: `web/src/app.css` lines 522-539 keep the metadata row `nowrap` with hidden overflow.

Likely fix area:

- Allow controlled wrapping or a mobile-specific reduced metadata subset.
- Preserve at least source, age, extraction, and time group in readable form.

### 11. Inspector original link uses browser default blue

Severity: P2

Expected:

- Inspector links should remain within the muted/token palette and archival metadata style.
- `docs/ui-preview.html` represents original link as compact metadata (`original ↗`), not default browser blue.

Actual:

- Computed style for `original link`:

```json
{
  "linkColor": "rgb(0, 0, 238)",
  "linkDecoration": "underline"
}
```

Reproduction:

1. Open any feed item in Inspector.
2. Inspect `original link`.
3. It renders as default blue underlined browser link.

Evidence:

- Screenshots:
  - `.test-artifacts/ui-audit/16-playwright-desktop-inspector.png`
  - `.test-artifacts/ui-audit/24-playwright-mobile-inspector.png`
- Implementation: `web/src/routes/components/Inspector.svelte` line 338

Likely fix area:

- Add explicit token-based link styling inside `.contract-inspector`.
- Consider matching preview's compact `original ↗` treatment.

### 12. Owner Token Prompt heading is heavier than the prompt contract

Severity: P2

Expected:

- Owner token prompt should be a terse local gate with chrome typography.
- Anatomy: product label, one terse line `Enter owner token`, token input, submit action, raw invalid-token line.

Actual:

- `Enter owner token` renders as a large browser-default heading.
- It visually dominates the prompt more than the design contract implies.

Reproduction:

1. Clear or avoid `localStorage['resofeed.ownerToken']`.
2. Open `/`.
3. Observe the prompt heading scale.

Evidence:

- Screenshot: `.test-artifacts/ui-audit/13-owner-token-standalone.png`
- Implementation: `web/src/routes/components/OwnerTokenPrompt.svelte` line 50

Likely fix area:

- Style `#owner-token-heading` with the owner-token prompt/chrome token rather than default heading scale.

### 13. Delete confirmation shifts Source Ledger row geometry

Severity: P2

Expected:

- Interaction states should not shift row bounds.
- Destructive confirmation is allowed, but should preserve geometry as much as possible.

Actual:

- Browser measurement showed row height changed from 101px to 102px after clicking `[DELETE]`.
- A 1px shift is small, but the contract asks for no layout shift in interaction states.

Reproduction:

1. Open Source Ledger.
2. Capture first source row bounding box.
3. Click `[DELETE]`.
4. Capture the same row bounding box.
5. Compare heights.

Evidence:

```json
{
  "deleteRowBefore": { "height": 101 },
  "deleteRowAfter": { "height": 102 }
}
```

Likely fix area:

- Reserve space or render confirmation in a fixed action area.
- Ensure border/padding does not change row height.

### 14. Resonate buttons share the same accessible name across rows

Severity: P2

Expected:

- Button labels should announce the action and enough context to distinguish repeated controls in a list.

Actual:

- Browser Use strict locator found four `button[name="Resonate item"]` controls.
- This is technically common for repeated controls, but it makes screen-reader and automation disambiguation weaker.

Reproduction:

1. Open authenticated feed with multiple unstarred rows.
2. Query controls by accessible name `Resonate item`.
3. Multiple identical controls are returned.

Evidence:

- Browser Use strict-mode error during audit:

```text
getByRole('button', { name: 'Resonate item' }) resolved to 4 elements
```

Likely fix area:

- Keep visible glyph unchanged.
- Change `aria-label` to include the item title, for example `Resonate item: Agents are the new shell scripts`.

## Passed Checks Worth Preserving

These areas behaved correctly in the runtime audit:

- Owner token rejected state shows raw `err: owner token rejected`.
- First-use empty state renders the exact design-copy lines.
- Feed rows have 44px star targets.
- Feed title-to-summary gap measured 4px.
- Feed hover and selected states did not shift row bounds.
- Desktop Inspector does not duplicate the star.
- Mobile Inspector includes the star.
- Dirty JSON-LD/script/style source payloads did not appear in primary Inspector content.
- `RESOFEED` menu exposes `TODAY` and `SOURCE LEDGER`.
- OPML import flattened folder structure.
- State export downloaded `state.json`.
- RSS URL pasted in Steer added a source and showed an `applied:` receipt.
- `/doctor` rendered as raw pre-wrapped diagnostics.
- Search results showed `match: lexical index` and `provenance: source-backed`.
- Mobile command row was bottom-fixed with 44px star targets.

## Recommended Fix Order

1. Add `[RUN INGEST]` and row-level `[FETCH]` to live Source Ledger.
2. Update `docs/ui-preview.html` to match the current manual-ingest design contract.
3. Expose and render raw source `err:` diagnostics.
4. Rework Source Ledger row grid and action geometry.
5. Convert visible OPML import action to a keyboard-semantic button.
6. Fix bracket-action hover/focus inversion.
7. Remove Search architecture note and repair filter layout.
8. Fix mobile feed metadata legibility.
9. Style Inspector original links with design tokens.
10. Tune Owner Token Prompt heading scale.
11. Remove delete-confirmation row shift.
12. Add item context to repeated Resonate button accessible names.

