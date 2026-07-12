# ResoFeed Consolidated Defect Report

**Report date:** 2026-07-11
**Stabilized:** 2026-07-12
**Scope:** RF-BUG-001 through RF-BUG-010
**Authority:** This report records observed and expected product behavior. `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PROMPTING_SYSTEM.md`, `docs/CONTAINER.md`, and `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md` remain canonical.

## Summary

The ten defects affect Inspector selection, initial routing, packaged UI assets, the OPML capability boundary, browser security headers, document titles, Steer accessibility, Source Ledger responsiveness, Prompting v2.2 identity, and browser-test isolation.

The repair must preserve these project boundaries:

- one `cmd/resofeed` Go binary serves the static UI, JSON HTTP, MCP Streamable HTTP, and background ingestion;
- SQLite with FTS5 is the only durable store;
- OPML is import-only source intake;
- JSON State is the only portable-state format and contains only active sources, active steering rules, and currently resonated items;
- the Owner Token is the single authorization boundary; `actor_id` remains attribution and idempotency input only;
- OpenRouter credentials are runtime-only and must never be persisted, returned, logged, included in diagnostics, or captured in test artifacts;
- Go owns Content Security Policy and the other application security headers;
- comprehensive browser acceptance runs against the real Go runtime without intercepting product API routes.

## RF-BUG-001 — Inspector remains blank after item selection

**Observed behavior:** Selecting an item can open an empty Inspector or lose the selection while detail and inspection requests are pending. Slow responses can update the wrong selection.

**Expected behavior:** Selecting a Feed or Search item immediately opens a readable Inspector preview. Detail retrieval and inspection/provenance recording are independent: failure in one must not erase usable output from the other. A response for a previously selected item must never replace the current item. Direct item routes remain usable while detail loads or fails.

**Deterministic acceptance:**

- Real-browser desktop and narrow flows cover Feed and Search selection.
- Pending, successful, and failed detail states keep the selected item and a readable Inspector state.
- Inspection-marker failure leaves item content readable and exposes a separate diagnostic.
- Rapid A-to-B selection followed by a late A response still shows B, including URL, focus, and content.
- Viewport changes preserve selection.
- Direct item routes, Back, focus return, and Escape behavior match `docs/DESIGN.md`.

## RF-BUG-002 — Initial routes briefly render the wrong surface

**Observed behavior:** A cold load or refresh of Source Ledger can briefly render TODAY before the requested route becomes active. Similar timing can affect Search and direct item routes.

**Expected behavior:** The first visible product surface, heading, busy state, and document title must agree with the requested URL. Cold load, refresh, Back, and Forward must preserve the selected surface. Any valid opaque item ID must round-trip through browser and HTTP routes without changing the stored ID. Search URL state must remain reversible through browser history.

**Deterministic acceptance:**

- English and Chinese real-browser cases cover TODAY, SOURCE LEDGER, SEARCH, and direct item routes on cold load and refresh.
- Every readiness transition is sampled; no wrong surface, heading, title, or TODAY content appears.
- Back and Forward restore route, selection, filters, and the appropriate surface.
- IDs containing separators, percent characters, Unicode, and other valid opaque text resolve to the original item without byte loss.
- Repeated retry-free runs produce the same result.

## RF-BUG-003 — Static UI assets depend on the process working directory

**Observed behavior:** The Go server can fail to locate or serve the UI when launched outside the repository layout. This conflicts with the single-binary deployment contract.

**Expected behavior:** The built Go binary contains and serves the validated production UI without a runtime `web/build` directory, Node runtime, or working-directory dependency. Invalid packaged bootstrap assets cause startup failure before the server becomes reachable. `/doctor` reports that UI assets are ready and embedded without exposing secrets or adding a new diagnostics protocol.

**Deterministic acceptance:**

- The same built binary serves root, bootstrap assets, and valid deep links from the repository root, a temporary directory, and the deployment working directory.
- Static misses do not return SPA HTML; valid application routes still boot the SPA.
- GET and HEAD preserve status/header semantics, with no body for HEAD.
- Missing or invalid required bootstrap content causes a non-zero startup exit and no bound listener.
- The final container runs with the binary and writable SQLite data volume only.
- Doctor output contains `ui_assets=ready` and `ui_asset_source=embedded`; tests prove configured token/key values and `.env` contents cannot appear.

## RF-BUG-004 — OPML export conflicts with the state boundary

**Observed behavior:** Product and documentation surfaces expose OPML export even though project authority defines OPML as import-only.

**Expected behavior:** OPML remains available only for source intake. Portable backup and restore use JSON State and include only active sources, active steering rules, and currently resonated items. No UI, HTTP, MCP, or active documentation surface advertises OPML export, OPML restoration, merge, sync, history, or portable receipts.

**Deterministic acceptance:**

- Source Ledger exposes OPML import and JSON State export/import, with no OPML export action.
- The active HTTP and MCP capability inventories contain OPML import and no OPML export operation.
- The retired export route returns the ordinary unauthorized response before authentication and ordinary not-found response after valid Owner Token authentication.
- JSON State round-trips the allowed portable fields atomically and excludes all other state.
- Active documentation contains no contradictory OPML export or restoration requirement.

## RF-BUG-005 — Browser security headers are absent

**Observed behavior:** Static and API responses lack a consistent Content Security Policy and related browser hardening headers. Because the Owner Token is stored in browser local storage, injected script would cross the authorization boundary.

**Expected behavior:** Go applies one effective value for each required header across static, API, MCP, authorization errors, not-found responses, and internal errors:

- `Content-Security-Policy`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`.

The policy permits the packaged UI to boot and perform ordinary product operations without weakening script or framing protections. Caddy passes these application-owned values unchanged. Streaming and cancellation behavior must remain intact.

**Deterministic acceptance:**

- Focused Go tests cover representative successful and failed static, API, and MCP responses, including unauthorized requests.
- Every checked response has one effective value for each required header.
- A real Chromium session boots under the policy and completes OPML import plus JSON State export/import without policy violations or blocked required resources.
- Streaming exposes flushed content before completion, and request cancellation reaches the handler.
- Direct-Go and deployed Caddy responses have matching application-owned header values.
- No raw Owner Token, OpenRouter key, authorization value, cookie, provider body, or `.env` value appears in logs or retained browser evidence.

## RF-BUG-006 — Document title falls back to the host address

**Observed behavior:** The browser title can remain the host address or lag behind client navigation.

**Expected behavior:** The static shell title is `RESOFEED`. Active surfaces use these functional titles:

- `RESOFEED · TODAY`;
- `RESOFEED · SOURCE LEDGER`;
- `RESOFEED · SEARCH`;
- `RESOFEED · INSPECTOR`;
- `RESOFEED · /doctor`.

Processing language does not translate the functional labels.

**Deterministic acceptance:** Cold load, refresh, client navigation, Back, and Forward update the title with the same transition as the route. English and Chinese runs observe no host-address fallback or intermediate wrong title.

## RF-BUG-007 — Empty Steer state exposes “URL required” to assistive technology

**Observed behavior:** An idle or empty Steer input can expose `URL required` or `需要 URL` before the user submits an invalid source command.

**Expected behavior:** Empty Steer state has no missing-URL error. A submitted command that lacks its required URL enters one localized invalid state, retains input and focus, and sends no mutation. Editing clears that state. Preview transport failure remains a transport error rather than a missing-URL error.

**Deterministic acceptance:** English and Chinese accessibility tests cover empty, invalid submission, edit recovery, repeated invalid submission, locale change, stale preview response, and transport failure. Each invalid attempt exposes one current accessible description/live announcement without duplicate alerts.

## RF-BUG-008 — Source Ledger controls break into ambiguous groups on narrow screens

**Observed behavior:** At a narrow viewport, Source List and Portable State actions wrap into unclear groupings; bracket labels split and controls become difficult to target.

**Expected behavior:** Source List and Portable State remain separately labelled groups. Source List exposes OPML import; Portable State exposes JSON State export/import. The Ledger retains global ingest, per-source fetch, delete confirmation/cancel, source information, status, and diagnostics. It adds no second source URL field, folder/tag hierarchy, settings panel, sync control, activity ledger, or OPML export.

**Deterministic acceptance:**

- At the required narrow viewport and desktop reference viewport, labels and bracket tokens remain intact with no document-level horizontal overflow.
- Independent controls are keyboard reachable, visibly focused, and at least 44 by 44 CSS pixels.
- Long source names, URLs, timestamps, and errors remain legible without changing group ownership.
- Real-runtime cases cover ingest idle/pending/success/error/conflict, row fetch idle/pending/success/error/conflict, independent unrelated rows, and delete confirm/cancel/success with predictable focus.
- Screenshots and accessibility checks verify both group relationships and absence of prohibited controls.

## RF-BUG-009 — Prompting v2.2 behavior retains v2.1 identity

**Observed behavior:** Runtime names, errors, and tests mix v2.1 terminology with the canonical `resofeed.summarize.v2.2` contract, obscuring which behavior is active.

**Expected behavior:** Every ingest and reprocess path that uses the canonical transform identifies and enforces Prompting System v2.2. Input priority, processing language, one-time prompt semantics, output fields, validation, retry/fallback classification, and provenance follow `docs/PROMPTING_SYSTEM.md`. OpenRouter remains a JSON transformer and never owns persistence.

**Deterministic acceptance:**

- Focused tests exercise normal, boundary, malformed, unavailable, and fallback outcomes across ingest and reprocess paths.
- Runtime diagnostics and errors that name the contract identify v2.2 and contain no stale v2.1 identity.
- Valid transformed output persists only through the Go application path; invalid output cannot partially update item text or FTS state.
- Prompt inputs, provider responses, one-time prompts, model overrides, and OpenRouter credentials do not enter portable State or diagnostics.
- Canonical Prompting and Architecture documentation remain aligned with the passing behavior.

## RF-BUG-010 — E2E failures are slow to isolate and can share mutable state

**Observed behavior:** Comprehensive browser tests can reuse mutable runtime or SQLite state, leave resources behind, and provide incomplete failure evidence. Failures are therefore order-dependent and expensive to diagnose.

**Expected behavior:** Comprehensive Playwright tests exercise the real Go binary and real product HTTP surface. Mutating cases receive isolated mutable state and a clean browser context. Read-only runtime reuse is allowed only when no mutable state can leak. Owned processes, ports, contexts, logs, and temporary databases are cleaned up. Synthetic API states remain in render/unit tests; product API interception is forbidden for comprehensive browser claims.

**Deterministic acceptance:**

- The CI-safe smoke lane completes in under two minutes with zero retries.
- The full Chromium lane lists and runs the same positive test set with zero retries.
- Three clean full-suite runs produce the same passing title set.
- An intentional assertion failure retains ordinary Playwright report, trace, screenshot, video, redacted server output, browser diagnostics, runtime identity, database location, and cleanup outcome.
- Failure evidence identifies the affected test and owned resources while containing no raw secrets, authorization values, cookies, provider bodies, or `.env` contents.
- Teardown residue fails the case.
- Legacy test removal occurs only after replacement coverage demonstrates the same user behavior.

## Cross-Defect Data and Failure Boundaries

- The browser owns transient route, selection, focus, pending, and inline-error state; it does not become a durable source of truth.
- SQLite owns durable sources, items, resonance, steering rules, runtime metadata, and FTS5 data according to `docs/ARCHITECTURE.md`.
- JSON State import is validated before an atomic transaction; failure leaves prior portable state intact.
- Ingest and reprocess failures remain isolated from unrelated sources/items. Invalid model output cannot partially update item text or search data.
- Browser, server, Doctor, container, and test artifacts must redact runtime secrets and authorization material.
- Rollback must restore the last passing product behavior and documentation together; it must not restore OPML export or any prohibited state capability.

## Traceability Matrix

| Requirement | User-observable outcome | Primary deterministic proof |
|---|---|---|
| RF-BUG-001 | Inspector opens and remains on the selected item | Real-browser Feed/Search selection and stale-response cases |
| RF-BUG-002 | First visible surface matches the URL | Cold/refresh/history route matrix in English and Chinese |
| RF-BUG-003 | One binary serves UI from any working directory | Arbitrary-directory runtime and invalid-bootstrap startup checks |
| RF-BUG-004 | OPML imports only; JSON State carries portable state | UI/API/MCP/docs capability scan and State round-trip |
| RF-BUG-005 | Browser responses are hardened without breaking UI | Go response checks, Chromium CSP flow, direct/Caddy comparison |
| RF-BUG-006 | Browser title matches the active surface | Cold and client-navigation title checks |
| RF-BUG-007 | Missing-URL error appears only after invalid submission | English/Chinese accessibility lifecycle checks |
| RF-BUG-008 | Ledger actions remain grouped and operable | Responsive runtime, keyboard, accessibility, and screenshot checks |
| RF-BUG-009 | Active transforms consistently implement v2.2 | Focused ingest/reprocess contract tests and documentation alignment |
| RF-BUG-010 | Browser tests are isolated and diagnosable | Smoke budget, three clean full runs, intentional-failure evidence |

## Open Questions

None block pending-plan repair. Implementation remains intentionally unstarted until the managed plan is repaired against the stabilized report and repair plan.
