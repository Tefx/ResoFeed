# pbar-wiring-audit Wiring Audit Report

headline: FAIL
verdict: FAIL
orchestrator_action_hint: DO_NOT_COMPLETE

## refs Read Confirmation (MANDATORY)
No refs for this step. Read code/docs/artifacts: `cmd/resofeed/main.go`, `internal/resofeed/db.go`, `internal/resofeed/http.go`, `internal/resofeed/search.go`, `internal/resofeed/ranking.go`, `internal/resofeed/doctor.go`, `internal/resofeed/types.go`, `web/src/routes/+page.svelte`, `web/src/lib/api-client.ts`, `web/src/lib/api-contract.ts`, `web/src/routes/components/SearchRetrieval.svelte`, `Feed.svelte`, `Inspector.svelte`, `SourceLedger.svelte`, `item-anatomy.ts`.

## Protocol checklist
| Check | Classification | Evidence |
|---|---|---|
| W13 Entry-to-effect | PARTIAL | Go runtime entrypoint reaches `net.Listen` and `http.Server.Serve` (`cmd/resofeed/main.go:12-13`, `internal/resofeed/db.go:31-64,274-314`, `internal/resofeed/http.go:97-150`). UI direct routes are SPA paths handled by `staticUIHandler` fallback (`http.go:61-85`) and `surfaceForPath` (`+page.svelte:71-75`). Missing explicit SOURCE LEDGER nav wiring. |
| W1 Dead export scan | PASS_WITH_DEBT | Remediated UI surfaces are imported/rendered from `+page.svelte:6-11,490-526`; no `_Runtime*`, `_Stub*`, `_Placeholder*` route targets found in `web/src`. Dead public field scan found metadata fields consumed in visible components. |
| W2 Schema field trace | PASS | Backend writes/scans metadata (`search.go:91-103,136-166`, `ingest.go:526-542` from grep) and frontend reads quality/value/fallback/provenance fields (`Feed.svelte:40-55`, `Inspector.svelte:223-299,330-353`, `SearchRetrieval.svelte:121-139`). |
| W3 CLI param E2E coverage | NOT_IN_SCOPE_STATIC | No tests executed per static-only audit. Runtime CLI reaches router and I/O as above. |
| W4 CLI command registration | PASS | `main` -> `resofeed.Main` -> `serve` switch -> `runServe` -> `ServeHTTPAndIngestRuntime` (`main.go:12-13`, `db.go:31-64,274-314`). |
| W5 Contract strength | NOT_EVALUATED | No `@pre/@post` contract surfaces found in remediated path scan. |
| W6 Config field consumption | PASS | Serve config consumed into HTTP runtime and OpenRouter client (`db.go:181-212,303-304`). |
| W7 Escape hatch concentration | PASS | No `@invar:allow`/dead-export escape hatch evidence found in remediated path search. |
| W8/W8b Import alignment | PASS_STATIC | Frontend imports match rendered components (`+page.svelte:6-11`); Go imports `resofeed/internal/resofeed` from single binary (`main.go:3-7`). Dependency manifest not exhaustively audited. |
| W9 Transitive reachability | PARTIAL | Search/Doctor/Feed/Inspector traced to runtime; Source Ledger direct route and Steer command traced to component, but nav path absent. |
| W10 Protocol shadow detection | PASS_STATIC | Doctor uses same `WriteDoctorWithConfig` for HTTP and MCP (`http.go:555-558`, `mcp.go:367-371`); no stub/shadow target in UI route scan. |
| W11 Type cast authenticity | PASS_STATIC | No remediated-path casts laundering stub implementations found in searched files. |
| W12 Frontend route-render integrity | FAIL | `/doctor`, `/source-ledger`, Search render real Svelte components; however no visible SOURCE LEDGER nav control/path was found, so direct route and nav equivalence cannot be proven. |

## W13 Entry-to-Effect Trace
- Runtime: `cmd/resofeed/main.go:12-13` calls `resofeed.Main`; `internal/resofeed/db.go:31-64` parses `serve`; `db.go:274-314` opens DB, migrates, resolves token, constructs `HTTPServerConfig`, and calls `ServeHTTPAndIngestRuntime`; `http.go:97-150` calls `net.Listen` and `http.Server.Serve` with `NewRouter`; `http.go:52-58` registers `/api/`, `/mcp`, and static UI.
- SPA routes: `http.go:61-85` serves `web/build/index.html` for unknown static paths; `web/src/routes/+page.svelte:71-75` maps `/doctor` to `doctor` and `/source-ledger`/aliases to `ledger`; `+page.svelte:122-125` fetches doctor diagnostics on direct `/doctor`; `+page.svelte:510-526` renders SourceLedger/SearchRetrieval utility surfaces.
- Classification: PARTIAL because all real I/O primitives exist, but the required Source Ledger nav path could not be found.

## W1-W12 Sections / Required Checks
### 1. Search command path reaches actual search execution and SearchRetrieval rendering — WIRED
Call chain: Steer form submit (`+page.svelte:444-462`) -> `submitSteer` recognizes `search ` (`+page.svelte:268-273`) -> `showSurface('search', false)` -> renders `<SearchRetrieval ... onSearch={searchItems}>` (`+page.svelte:524-526`) -> `$effect` calls `submitSearch(false)` when `query` seed changes (`SearchRetrieval.svelte:28-41`) -> `onSearch` called with filters (`SearchRetrieval.svelte:44-55`) -> `searchItems` delegates to `apiClient().search` (`+page.svelte:400-402`) -> `ResoFeedApiClient.search` sends `/api/search` (`api-client.ts:175-185`) -> router handles GET `/api/search` (`http.go:244-247`) -> `handleSearch` parses and calls `SearchItems` (`http.go:332-342`) -> SQLite query/FTS path (`search.go:33-55,58-103`) -> response renders list items and metadata in SearchRetrieval (`SearchRetrieval.svelte:111-158`).
Backend fallback path also exists: `/api/steer` -> `handleSteer` -> `ApplySteering` -> `parseSearchSteerCommand` -> `applySearchSteering` -> `SearchItems` (`http.go:427-453`, `ranking.go:93-109,139-165`). UI intercepts `search ...` before `/api/steer`, so search behavior is proven through `/api/search`, not through `/api/steer`, for the browser command path.

### 2. `/doctor` direct route and Steer `/doctor` share diagnostics source — WIRED
Direct route chain: static UI fallback (`http.go:61-85`) -> `surfaceForPath('/doctor')` (`+page.svelte:71-75`) -> `loadShellData` invokes `client.doctor()` when current surface is doctor (`+page.svelte:122-125`) -> `api-client.ts:199-207` GET `/api/doctor` -> `http.go:268-272,555-558` -> `WriteDoctorWithConfig` -> `ReadDoctorSnapshotWithConfig` (`doctor.go:43-60,74-119`).
Steer chain: form submit -> `submitSteer` command `'/doctor'` calls `apiClient().doctor()` and sets doctor feedback/surface (`+page.svelte:275-281`) -> same API client and HTTP handler above -> same render `<pre role="log" aria-label="/doctor diagnostics">` (`+page.svelte:528-534`).
MCP also shares `WriteDoctorWithConfig` for `resofeed://system/doctor` (`mcp.go:367-371`).

### 3. Source Ledger direct route and nav reach same component/surface state — FAIL/PARTIAL
Direct route/Steer command wired: `surfaceForPath('/source-ledger'|'/source'|'/sources') => 'ledger'` (`+page.svelte:71-75`), `canonicalPathForSurface('ledger') => '/source-ledger'` (`+page.svelte:77-81`), `submitSteer` recognizes `source ledger`/`ledger` and calls `showSurface('ledger')` (`+page.svelte:256-260`), which sets `currentSurface` and URL (`+page.svelte:197-210`), then renders `<SourceLedger ...>` under the ledger utility surface (`+page.svelte:510-522`).
Nav gap: two searches found no visible nav control that calls `showSurface('ledger')` or has button text `SOURCE LEDGER`. Evidence: grep for `button.*SOURCE|SOURCE LEDGER|showSurface\(|onclick...showSurface` in `web/src/*.svelte` produced only heading text in `SourceLedger.svelte:119`, Steer command branch `+page.svelte:256-260`, back-to-TODAY buttons, and surface rendering; no nav button/link. A narrower grep for `showSurface('ledger'|SOURCE LEDGER|source-ledger|currentSurface === 'ledger'` likewise found no nav handler outside Steer/direct route. Therefore the direct route is wired, but the required nav equivalence is UNPROVEN/failed.
Impact: mouse/keyboard users cannot reach Source Ledger through a persistent nav affordance; only direct URL or Steer command paths are traceable.
Smallest verification/fix check: add/confirm a real nav control with accessible name `SOURCE LEDGER`, then statically trace its click/keyboard activation to `showSurface('ledger')` and dynamically check focus reaches `#source-ledger-heading`.

### 4. Feed/Inspector metadata fields for quality/value/fallback/provenance are read by visible components — WIRED
Backend field production: `ListTodayFeed`/search query uses `scanItemSummary` fields (`search.go:91-103,186-203`); detail query fills `ItemDetail` and `Provenance` (`search.go:136-166`); FTS/rebuild consumes provenance/value (`search.go:170-183`).
Visible UI readers: Feed reads extraction/fallback/value/external provenance via `itemExtractionLabel`, `itemSummaryProvenanceLabel`, `itemPriorityLabel`, `external_surfaced_at` (`Feed.svelte:40-55`, `item-anatomy.ts:88-107`); Inspector reads `extracted_text`, `feed_excerpt`, `display_excerpt`, `provenance.*`, `story_key`, `duplicate_of_item_id`, `extraction_status`, `value_tier`, `model_status` and renders provenance, summary provenance, warnings, source details (`Inspector.svelte:223-299,330-353`); SearchRetrieval reads extraction, external surfacing, priority, and hard-coded source-backed provenance in result rows (`SearchRetrieval.svelte:121-139`).

### 5. Source diagnostic full-view affordance reachable by mouse/keyboard/assistive tech — WIRED_WITH_DEBT
SourceLedger renders a real `<button type="button" class="source-diagnostic-action">` in each row with full diagnostics in `aria-label` and `title` (`SourceLedger.svelte:151-156`). It is keyboard focusable by default as a button, mouse reachable as a button target, and assistive-tech reachable through the explicit aria-label containing status, last fetch, URL, and full error. Debt: the button has no visible text and no click handler/disclosure; "full-view" is available as accessible name/title, not an expanded visible panel. If full-view requires visible text disclosure, this remains incomplete.
Smallest runtime check: browser/a11y snapshot should show a focusable button named `diagnostic details for ... full error ...`; keyboard Tab should land on it; mouse hover/click target should expose title or future disclosure.

### 6. No placeholder/stub route target/dead public field remains — PASS_STATIC with noted benign matches
Stub/placeholder scan in `web/src`: no `_Runtime*`, `_Stub*`, or `_Placeholder*` route/component targets found. Matches were test-only `vi.stubGlobal(...)`, the normal input attribute `placeholder="Steer or paste RSS URL..."`, and `Inspector.svelte:isPlaceholderSummary`, which is sanitation logic, not a route target. Public metadata fields in remediated paths have visible readers as listed above. No dead remediated field was proven.

## Required evidence blocks
**Orphan exports/dead public fields**:
```text
No dead remediated public metadata field proven. Field readers found:
- Feed.svelte:43-46 extraction_status/model_status/value_tier/external_surfaced_at via item-anatomy.
- item-anatomy.ts:94-107 model_status fallback, value_tier, extraction_status quality labels.
- Inspector.svelte:223-299,330-353 feed_excerpt/extracted_text/display_excerpt/provenance/story_key/duplicate/value/model/extraction visible labels/details.
- SearchRetrieval.svelte:130-135 extraction/provenance/priority/external surfacing.
```

**Route/command reachability**:
```text
Search: +page.svelte:268-273 -> +page.svelte:524-526 -> SearchRetrieval.svelte:28-55 -> +page.svelte:400-402 -> api-client.ts:175-185 -> http.go:246-247,332-342 -> search.go:33-103 -> SearchRetrieval.svelte:111-158.
Doctor direct: http.go:61-85 -> +page.svelte:71-75,122-125 -> api-client.ts:199-207 -> http.go:268-272,555-558 -> doctor.go:43-119 -> +page.svelte:528-534.
Doctor Steer: +page.svelte:275-281 -> same api-client/http/doctor writer -> +page.svelte:528-534.
Source Ledger direct/Steer: +page.svelte:71-81,256-260,197-210 -> +page.svelte:510-522 -> SourceLedger.svelte:117-177.
Source Ledger nav: no nav control found after primary grep and fallback query; gap.
```

**Metadata consumption**:
```text
quality/value: item-anatomy.ts:102-107, Feed.svelte:45, Inspector.svelte:289-292, SearchRetrieval.svelte:133.
fallback/model: item-anatomy.ts:94-100, Inspector.svelte:295-299,339-343, Feed.svelte:44.
provenance: Inspector.svelte:260-279,289-299,330,348-353; SearchRetrieval.svelte:132; Feed.svelte:44-47.
backend production: search.go:91-103,136-166,170-183,186-203; ingest.go:526-542 (grep evidence).
```

**Stub/placeholder scan**:
```text
web/src grep `_Runtime|_Stub|_Placeholder|Runtime...|Stub...|Placeholder...|placeholder|stub` returned only:
- test-only vi.stubGlobal in web/src/routes/components/__tests__/rendering-expected-red.test.ts;
- Inspector.svelte:isPlaceholderSummary sanitation helper;
- +page.svelte input placeholder attribute.
No placeholder/stub route target found.
```

**Headline**: FAIL

### Gate semantic reporting
verdict: FAIL
blockers:
  - Source Ledger direct route and Steer command are wired, but required nav control/path to the same surface is absent/unproven.
gate_open_allowed: false
orchestrator_action_hint: DO_NOT_COMPLETE
explicit_uncertainty_sources:
  - Static-only audit: no app/browser/test execution performed.
  - Source diagnostic "full-view" interpreted as accessible aria-label/title; if contract requires visible expanded panel, additional UI work is needed.
product_implementation_files_modified: false

### Behavioral Proof Register
behavioral_proof_register:
  search_steer_to_search_retrieval: NEEDS_TEST
  doctor_direct_and_steer_share_diagnostics_source: NEEDS_TEST
  source_ledger_direct_route_to_component: NEEDS_TEST
  source_ledger_nav_to_same_component: UNPROVEN
  metadata_visible_consumption: NEEDS_TEST
  source_diagnostic_affordance_a11y: NEEDS_TEST
  no_stub_placeholder_route_targets: PROVEN

### Verification suggestions
- Static: add a grep assertion for `SOURCE LEDGER` nav control calling `showSurface('ledger')` or a link to `/source-ledger`.
- Browser: with authenticated shell, click/Tab to SOURCE LEDGER nav, verify focus on `#source-ledger-heading` and same `data-testid="source-ledger"` as direct `/source-ledger`.
- Browser: enter `search sqlite` in Steer and assert `/api/search?q=sqlite` network request plus Search results region.
- Browser/a11y: direct `/doctor` and Steer `/doctor` both show `<pre role="log" aria-label="/doctor diagnostics">` with `openrouter:` lines.
- Browser/a11y: source diagnostic action appears as focusable button with accessible name containing full status/url/error.

### Files changed / commits
Audit artifact only: `.audit-artifacts/pbar-wiring-audit.md`.

### Programmatic Handoff
```json
{"headline":"FAIL","verdict":"FAIL","blockers":["Source Ledger nav path to the same component/surface state is absent or unproven"],"gate_open_allowed":false,"orchestrator_action_hint":"DO_NOT_COMPLETE","product_implementation_files_modified":false,"audit_artifact":".audit-artifacts/pbar-wiring-audit.md"}
```

### Terminal handoff evidence
Action Summary: Static wiring audit completed for Search, Doctor, Source Ledger, Feed/Inspector metadata, diagnostic affordance, and stub/placeholder targets. Found blocking Source Ledger nav reachability gap.
Verification Run: Static grep/read audit only; no app/tests executed. Commit verification command `git status --short && git log -1 --oneline` exit code 0 after commit.
Artifacts Modified: `.audit-artifacts/pbar-wiring-audit.md` only.
