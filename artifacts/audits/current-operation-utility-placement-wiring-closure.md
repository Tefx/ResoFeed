# Wiring Closure Audit: Current Operation Utility Placement / Conflict Surfaces
Status: PASS
Verdict: PASS — static wiring evidence is complete and the previously open browser expected-red proof debt is now closed by the independent retest artifact `artifacts/audits/retest-current-operation-utility-placement-blockers.md` in mainline squash commit `fb9fc024`.
Action hint: cite this standalone wiring artifact and the retest artifact together; no wiring blockers remain and gate-open is allowed for current-operation utility-placement/conflict wiring.

## Scope and method

Static-only wiring audit. No application or test execution was performed. Product code was not modified.

Required sources read and cited:

- `AGENTS.md:7-16` requires a single-tenant workbench, one Go binary, SQLite/FTS5 only, LLM as JSON transformer only, and flat `internal/resofeed/` domain logic.
- `AGENTS.md:25-36` requires a single owner-token boundary and `docs/DESIGN.md` operational labels/low-chrome UI; forbids accounts/settings bloat.
- `docs/ARCHITECTURE.md:13-21` defines one deployable Go process, thin transports, SQLite, and single owner token.
- `docs/ARCHITECTURE.md:184` names current operation snapshot as process memory behind the ingest/reprocess guard; `docs/ARCHITECTURE.md:206-210` requires one in-process guard, 409 conflicts, contextual current-operation explanation, and no durable queue/job/ledger.
- `docs/ARCHITECTURE.md:1595-1603` requires owner-token API calls, `RESOFEED` menu placement, lightweight Source Ledger controls, contextual current-operation status only, and no persistent idle top-chrome operation strip.
- `docs/DESIGN.md:301-318` defines the analyst workbench surfaces, discreet `RESOFEED` menu, flat Source Ledger, and manual ingest text-replacement behavior.
- `docs/DESIGN.md:370-375` allows `TODAY`/`SOURCE LEDGER` only after the `RESOFEED` menu opens; `docs/DESIGN.md:431-452` defines App Shell, Language Control, and Reprocess Library action anatomy.
- `docs/DESIGN.md:671-705` says manual ingest controls live in Source Ledger, use text replacement (`[INGESTING...]`, `[FETCHING...]`, conflict `err:`), and must not become dashboards/spinners/activity logs.
- `artifacts/audits/gate-current-operation-fresh-review-followup.md:7-23` identifies the prior final-gate evidence gap: no standalone wiring artifact and failing current-operation browser-contract assertions for opened menu and conflict-current-operation detail.
- `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:184-255` defines the browser contract surfaces audited here: low-frequency utilities in opened menu, running operation contextual to Source Ledger/opened menu, conflict explanation in Source Ledger/opened menu, and no persistent top-chrome idle/running/conflict status.
- `artifacts/audits/retest-current-operation-utility-placement-blockers.md` (mainline squash commit `fb9fc024`) closes the former browser debt with `verdict: PASS`, `gate_open_allowed: true`, and the required current-operation expected-red Playwright command passing 8/8.

## Protocol checklist

| Protocol | Result | Evidence |
|---|---|---|
| W13 Entry-to-Effect Trace | WIRED_AND_BROWSER_PROVEN | `cmd/resofeed` runtime is documented as one binary (`docs/ARCHITECTURE.md:13`, `:75`); current-operation lifecycle hits memory/API/UI, and browser expected-red proof is now closed by `artifacts/audits/retest-current-operation-utility-placement-blockers.md` in mainline commit `fb9fc024` with 8/8 passing. |
| W1 Dead Export Scan | WIRED | `CurrentOperationInfo`, `CurrentOperationResponse`, `RuntimeOperationHTTPPath`, and `RuntimeOperationMCPResourceURI` are used by HTTP/MCP/frontend/tests (`internal/resofeed/current_operation.go:8-32`, `http.go:267-271`, `mcp.go:512`, `web/src/lib/api-contract.ts:11-28,216`). |
| W2 Schema Field Trace | WIRED | Backend writes `running/kind/actor_kind/phase/count/message/started_at/updated_at` (`current_operation.go:47-55,59-77`); frontend validates/reads all fields (`web/src/lib/current-operation.ts:53-65,98-117`). |
| W3 CLI Param E2E Coverage | NOT_IN_SCOPE_NO_NEW_CLI | No current-operation CLI flag; owner-token runtime boundary traced through existing server/API/frontend. |
| W4 CLI Command Registration | NOT_IN_SCOPE_NO_NEW_COMMAND | No command module added or required for this surface. |
| W5 Contract Strength Scan | NOT_APPLICABLE | Go/Svelte code path has no `@pre/@post` contract annotations in audited files. |
| W6 Config Field Consumption | WIRED | Owner token is consumed by HTTP auth (`http.go:236-240,362-375`) and frontend `Authorization` header (`api-client.ts:382-388`). |
| W7 Escape Hatch Concentration | NO_RISK_FOUND | Required prior gate reported scoped `@invar:allow` scan no matches (`gate-current-operation-fresh-review-followup.md:27-28`); no audited code path relies on allow escape hatches. |
| W8 Dependency-Import Alignment | NO_NEW_DEPENDENCY | Audited feature uses existing Go stdlib/Svelte modules; no new dependency claim found. |
| W8b Undeclared Import Dependencies | NO_NEW_IMPORT_RISK | Static audit found no new package/import surface for this artifact-only step. |
| W9 Transitive Entry-Point Reachability | WIRED | Public HTTP route → handler → process-memory snapshot → frontend client → page state → menu/Source Ledger render is traced below. |
| W10 Protocol Shadow Detection | NO_SHADOW_FOUND | Current-operation source is the live `ingestGuardState.current` snapshot, not a stub (`current_operation.go:118-123`; `ingest.go:34-42`). Browser specs mock API at test boundary only. |
| W11 Type Cast Authenticity | ACCEPTABLE_RUNTIME_GUARD | Frontend normalizes unknown API payloads before use (`api-client.ts:132-136,310-316`; `current-operation.ts:53-70`), not laundering stubs into UI state. |
| W12 Frontend Route-Render Integrity | WIRED_AND_BROWSER_PROVEN | Route state and render syntax exist (`+page.svelte:824-872`, `:956-971`); browser proof now passes via `npm run test:e2e -- --project=chromium-ci-safe current-operation-utility-placement.expected-red.spec.ts ui-runtime-fresh-review-followup.expected-red.spec.ts` from `web/` (8/8, retest artifact in commit `fb9fc024`). |

## W13 entry-to-effect trace first

### Backend current-operation status source → API surface

Classification: WIRED.

Call chain:

1. Runtime operation starts when guarded operations acquire the one in-process guard:
   - background ingest: `internal/resofeed/ingest.go:98-105` calls `tryAcquireIngestGuardWithActor(..., "ingest", "background", "background")` then `updateCurrentOperation("loading_sources", ...)`.
   - manual ingest: `internal/resofeed/ingest.go:112-119` calls `tryAcquireIngestGuardWithActor(..., "ingest", "all", "human")` then updates `loading_sources`.
   - manual source fetch: `internal/resofeed/ingest.go:125-154` calls the same guard for `fetch/source`, updates `loading_source`, `fetching_source`, and `source_complete`.
   - reprocess: `internal/resofeed/reprocess.go:28,49,77` updates current-operation phases for library reprocess.
2. Guard acquisition writes the in-memory snapshot: `internal/resofeed/ingest.go:273-294` stores holder details, calls `ingestGuardState.current.start(...)`, and clears the snapshot on release (`:291-293`).
3. Snapshot fields are written/read in `internal/resofeed/current_operation.go:40-88`; `currentOperationInfo()` returns `ingestGuardState.current.get()` at `:118-120`.
4. HTTP route is owner-token protected before dispatch (`internal/resofeed/http.go:236-240`) and registered as `GET RuntimeOperationHTTPPath` at `internal/resofeed/http.go:267-271`.
5. HTTP handler returns the live snapshot: `internal/resofeed/http.go:447-448` writes `CurrentOperationResponse{Operation: currentOperationInfo()}`.
6. Conflict path enriches 409 responses with the same current-operation detail: `internal/resofeed/http.go:451-453` → `guardConflictHTTPDetailMap`; `internal/resofeed/ingest.go:315-331` includes `operation_running`, `operation`, `actor_kind`, `retry_allowed`, and `current_operation`.

Effect boundary: in-memory process snapshot only; no SQLite persistence, queues, or history. This aligns with `docs/ARCHITECTURE.md:184` and `:206-210`.

### Frontend API consumer → polling/state source

Classification: WIRED_WITH_BOUNDED_POLLING.

Call chain:

1. Endpoint contract names `GET /api/runtime/operation`: `web/src/lib/api-contract.ts:216`.
2. API client calls the endpoint and normalizes unknown JSON: `web/src/lib/api-client.ts:310-316`, with owner-token header on all requests at `:382-388`.
3. Page imports formatters and normalizer: `web/src/routes/+page.svelte:3-6`.
4. Page state stores contextual operation as idle/running/blocked: `web/src/routes/+page.svelte:19-22,67`.
5. `refreshCurrentOperationIfAvailable()` calls `apiClient().currentOperation()` and clears UI state to idle when backend returns `running:false`: `web/src/routes/+page.svelte:272-279`.
6. Polling is active only when relevant: `operationSurfaceRelevant` requires owner token, ready load state, and Source Ledger/open menu/reprocess running (`web/src/routes/+page.svelte:116`). `pollCurrentOperationWhileRelevant()` stops when not relevant/in-flight/after 3 polls and reschedules only while running at 800ms (`:289-302`); effect resets generation/count and clears timers (`:305-311`).

Effect boundary: lightweight bounded polling only; no permanent dashboard loop.

### RESOFEED menu / low-frequency utility placement render surface

Classification: WIRED.

Call chain:

1. Closed top chrome contains brand, Steer, and `details` menu trigger, not language/reprocess/status controls directly: `web/src/routes/+page.svelte:797-827`.
2. Opened menu renders `NAV`, `TODAY`, `SOURCE LEDGER`, `OPERATIONS`: `web/src/routes/+page.svelte:828-845`.
3. Current-operation status appears inside opened menu only when `contextualOperationStatusText` is non-empty: `web/src/routes/+page.svelte:846-849`.
4. Language and reprocess low-frequency controls live inside `runtime-language-controls`: `web/src/routes/+page.svelte:850-868`.
5. Render-level tests assert closed chrome excludes `LANG`, `[REPROCESS LIBRARY]`, and idle/current-operation strings, while opened menu exposes controls: `web/src/routes/components/__tests__/current-operation-utility-placement.test.ts:114-128`.
6. Browser expected-red contract asserts the same placement: `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:184-205`.

### Source Ledger contextual current-operation render surface

Classification: WIRED.

Call chain:

1. Parent passes `currentOperation` and `contextualOperationStatusText` into `SourceLedger`: `web/src/routes/+page.svelte:960-970`.
2. `SourceLedger` accepts those props at `web/src/routes/components/SourceLedger.svelte:8-19,21-32`.
3. Header status chooses current-operation text before last-ingest fallback: `web/src/routes/components/SourceLedger.svelte:47-51`.
4. Header renders the status inline and disables the global ingest action when a current operation blocks manual ingest: `web/src/routes/components/SourceLedger.svelte:271-276`.
5. Running/shared-operation probe preserves disabled state without duplicating generic conflict text: `web/src/routes/components/SourceLedger.svelte:52-56,145-154`.

### Conflict-current-operation browser contract surface

Classification: WIRED_AND_BROWSER_PROVEN.

Call chain:

1. Backend conflict response includes canonical `details.current_operation`: `internal/resofeed/ingest.go:315-331`; HTTP writes it via `internal/resofeed/http.go:451-453`.
2. Frontend manual ingest captures 409 conflict body, formats `err: <message>`, normalizes `details.current_operation`, and sets `contextualOperation = blocked`: `web/src/routes/+page.svelte:660-669`.
3. `formatOperationConflictStatus()` appends canonical operation details to the raw error text: `web/src/lib/current-operation.ts:115-117`; fields are assembled as `op`, `actor`, `phase`, count, message, and `since`: `:98-106`.
4. The same `contextualOperationStatusText` flows to both opened menu (`+page.svelte:846-849`) and Source Ledger (`+page.svelte:960-970`; `SourceLedger.svelte:271-276`).
5. Component test covers blocked conflict in both surfaces and absence from top chrome: `web/src/routes/components/__tests__/current-operation-utility-placement.test.ts:146-158`.
6. Browser expected-red contract asserts Source Ledger conflict text and opened menu text: `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:231-255`.
7. Debt closure: independent browser retest artifact `artifacts/audits/retest-current-operation-utility-placement-blockers.md` (mainline squash commit `fb9fc024`) reports `verdict: PASS`, `gate_open_allowed: true`, and the exact e2e command passing 8/8, including the previously failing pending-ingest menu and conflict-current-operation line families.

## W1-W12 detailed notes

### W1 Dead export scan

No dead public current-operation surface found. `RuntimeOperationHTTPPath` is consumed by HTTP routing (`current_operation.go:8`; `http.go:267`). `RuntimeOperationMCPResourceURI` is consumed by MCP resource handling (`current_operation.go:10`; `mcp.go:512`). Frontend contract and client consume `CurrentOperationResponse` (`api-contract.ts:27-28`; `api-client.ts:310-316`).

### W2 Schema field trace

Fields are written in `current_operation.go:47-55` and updated in `:59-77`; conflicts fall back to a synthesized running snapshot if needed (`ingest.go:338-353`). Frontend accepts only canonical kind/actor/count/timestamp shapes (`current-operation.ts:31-65`) and displays every non-null detail field (`:98-117`). No ghost/write-only field found in this trace.

### W3 CLI parameter E2E coverage

No current-operation CLI parameter exists. Owner-token CLI/runtime configuration is relevant only as the auth boundary; API requests are protected by HTTP auth (`http.go:236-240,362-375`) and the frontend sends `Authorization: Bearer` (`api-client.ts:382-388`).

### W4 CLI command registration

No new CLI command registration involved. The surface is HTTP/MCP/UI only.

### W5 Contract strength scan

No `@pre/@post` contracts found in audited files. Existing behavior is guarded by Go/Svelte tests and expected-red browser contracts rather than annotation contracts.

### W6 Config field consumption

Owner-token consumption is wired through the full path: architecture requires localStorage key/header (`docs/ARCHITECTURE.md:1595-1598`); page uses `tokenStorageKey = 'resofeed.ownerToken'` (`+page.svelte:41`) and stores token after successful bootstrap (`+page.svelte:331-332`); API client sends bearer auth (`api-client.ts:382-388`); backend rejects unauthenticated `/api/*` before routing (`http.go:236-240`).

### W7 Escape hatch concentration

No audited escape hatch concentration found. Prior gate explicitly recorded a scoped `@invar:allow|invar:allow` scan with no matches (`gate-current-operation-fresh-review-followup.md:27-28`).

### W8/W8b Dependency-import alignment

No dependency drift found in the static trace. Backend uses Go stdlib synchronization/time/HTTP; frontend uses existing Svelte app/API modules. This artifact step introduces no runtime import.

### W9 Transitive entry-point reachability

Trace reaches from documented runtime (`resofeed serve` one process, `docs/ARCHITECTURE.md:13,75`) through HTTP handler and frontend render. One-hop-only risk not found for source/API/UI placement.

### W10 Protocol shadow detection

No Protocol/ABC shadow found. Runtime uses the live package-level guard snapshot (`ingest.go:34-42`; `current_operation.go:118-123`). Test fixtures mock network responses only in component/browser tests.

### W11 Type cast authenticity

Frontend casts are guarded by normalization and shape checks: `api-client.ts:132-136` rejects invalid current-operation envelopes; `current-operation.ts:53-70` rejects invalid kind/actor/count/timestamp shapes. No wiring-laundering cast found in audited path.

### W12 Frontend route-render integrity

Route/render path exists: `surfaceForPath('/source-ledger')` maps to ledger (`+page.svelte:118-120`), menu buttons call `openSurfaceFromMenu` (`+page.svelte:830-844`), menu operation status renders at `+page.svelte:846-849`, Source Ledger receives props at `+page.svelte:960-970`, and Ledger renders header status/actions at `SourceLedger.svelte:271-276`. The prior browser-contract debt is now closed by `artifacts/audits/retest-current-operation-utility-placement-blockers.md` in mainline commit `fb9fc024`, which records the required current-operation expected-red browser command passing 8/8.

## Findings

### Finding 1 — Standalone wiring evidence was missing before this step

- Severity: EVIDENCE_COMPLETENESS_BLOCKER_CLOSED
- Evidence: prior gate summary/blockers at `artifacts/audits/gate-current-operation-fresh-review-followup.md:7-23`; required artifact now exists at `artifacts/audits/current-operation-utility-placement-wiring-closure.md`.
- Call chain: final gate evidence requirement → missing `artifacts/audits/*wiring*` artifact → this artifact maps backend source/API → frontend consumer → menu/Source Ledger/conflict surfaces.
- Impact: final gate previously lacked a standalone wiring artifact to cite.
- Verification suggestion: `git ls-files 'artifacts/audits/*wiring*.md'` should include this path; review this report's W13 trace.

### Finding 2 — Browser expected-red contract debt is closed

- Severity: TEST_DEBT_CLOSED
- Evidence: prior gate reported the exact expected-red e2e command failed (`gate-current-operation-fresh-review-followup.md:18`) and named failures at lines 207 and 231 (`:22-23`). Static wiring already showed Source Ledger/open-menu render paths (`+page.svelte:846-849,960-970`; `SourceLedger.svelte:271-276`) and component coverage (`current-operation-utility-placement.test.ts:130-168`). Independent browser retest artifact `artifacts/audits/retest-current-operation-utility-placement-blockers.md` in mainline squash commit `fb9fc024` now reports `verdict: PASS`, `gate_open_allowed: true`, and `npm run test:e2e -- --project=chromium-ci-safe current-operation-utility-placement.expected-red.spec.ts ui-runtime-fresh-review-followup.expected-red.spec.ts` passing 8/8 from `web/`.
- Call chain: browser contract fixture → API route mocks `/api/runtime/operation`/409 details (`web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:117-139`) → expected UI assertions (`:207-255`) → independent retest proof green.
- Impact: no remaining browser-proof blocker intersects the final gate for current-operation utility placement/conflict wiring.
- Verification suggestion: final gate may cite this wiring artifact plus `artifacts/audits/retest-current-operation-utility-placement-blockers.md` / commit `fb9fc024`; no further wiring remediation is indicated.

## Uncertainty register

| Item | Status | Proof |
|---|---|---|
| Browser menu displays local long-running `[RUN INGEST]` status while request is pending | CLOSED | Retest artifact `artifacts/audits/retest-current-operation-utility-placement-blockers.md` in commit `fb9fc024` reports test 2 passed for `current-operation-utility-placement.expected-red.spec.ts:207-228`. |
| Conflict selector/copy in browser expected-red | CLOSED | Retest artifact reports test 3 passed for `current-operation-utility-placement.expected-red.spec.ts:231-255`, retiring the stale selector/copy concern. |
| Exact `reprocess.go` lifecycle line effects | NON_BLOCKING_STATIC_SCOPE | Search/static evidence shows phase updates at `internal/resofeed/reprocess.go:28,49,77`; browser retest also proved canonical library_reprocess status in Source Ledger/opened menu via `ui-runtime-fresh-review-followup.expected-red.spec.ts` test 4. |

## Behavioral proof register

| Behavior | Proof status | Evidence |
|---|---|---|
| Backend current-operation snapshot is in-memory and cleared on guard release | PROVEN_STATIC | `current_operation.go:79-88,118-123`; `ingest.go:286-294`; architecture `docs/ARCHITECTURE.md:184,206-210`. |
| `GET /api/runtime/operation` is owner-token protected and returns current snapshot | PROVEN_STATIC | `http.go:236-240,267-271,447-448`; `http.go:362-375`. |
| Frontend API client sends owner token and validates current-operation response | PROVEN_STATIC | `api-client.ts:310-316,382-388`; `current-operation.ts:53-70`. |
| Polling is bounded/lightweight and only relevant for Source Ledger/open menu/reprocess | PROVEN_RUNTIME | Static wiring `+page.svelte:116,289-311`; retest artifact test 5 passed for bounded visible-surface polling. |
| Opened `RESOFEED` menu contains operation status and low-frequency utilities | PROVEN_RUNTIME | Static render `+page.svelte:824-872`; component test `current-operation-utility-placement.test.ts:114-168`; retest artifact tests 1-4 passed in Chromium. |
| Closed top chrome lacks persistent idle/running/conflict operation strip | PROVEN_RUNTIME | Static render `+page.svelte:797-827`; component assertions `current-operation-utility-placement.test.ts:114-128,139,153`; retest artifact tests 1, 2, and 4 passed with no persistent idle/current-operation top-chrome strip. |
| Source Ledger conflict displays canonical `current_operation` detail | PROVEN_RUNTIME | `ingest.go:315-331`; `+page.svelte:660-669`; `current-operation.ts:115-117`; `SourceLedger.svelte:271-276`; retest artifact test 3 passed. |
| Idle backend response clears frontend contextual status | PROVEN_RUNTIME | `current_operation.go:79-81`; `+page.svelte:272-276`; retest artifact test 5 passed for polling updates clearing when idle. |

## Recommended verification checks

Final-gate citation checks:

1. `git ls-files 'artifacts/audits/*wiring*.md'` — should list `artifacts/audits/current-operation-utility-placement-wiring-closure.md`.
2. Review W13 trace above for backend source/API → frontend consumer → RESOFEED menu → Source Ledger/conflict surfaces.
3. Cite independent retest artifact `artifacts/audits/retest-current-operation-utility-placement-blockers.md` from mainline squash commit `fb9fc024`; it records `npm run test:e2e -- --project=chromium-ci-safe current-operation-utility-placement.expected-red.spec.ts ui-runtime-fresh-review-followup.expected-red.spec.ts` passing 8/8 from `web/` and `gate_open_allowed: true`.

## Evidence completeness disposition

PASS. The missing standalone wiring artifact concern is closed by this report, and the previously open browser proof debt is closed by independent retest artifact `artifacts/audits/retest-current-operation-utility-placement-blockers.md` in mainline squash commit `fb9fc024`. No product-code wiring blockers remain for current-operation utility placement/conflict surfaces. Gate-open is allowed for this wiring/evidence closure scope.

## Programmatic handoff

```json
{
  "artifact": "artifacts/audits/current-operation-utility-placement-wiring-closure.md",
  "status": "PASS",
  "headline": "PASS",
  "gate_open_allowed": true,
  "wiring_blockers": [],
  "browser_debt": "CLOSED_BY_RETEST",
  "browser_debt_closure": {
    "artifact": "artifacts/audits/retest-current-operation-utility-placement-blockers.md",
    "mainline_squash_commit": "fb9fc024",
    "command": "npm run test:e2e -- --project=chromium-ci-safe current-operation-utility-placement.expected-red.spec.ts ui-runtime-fresh-review-followup.expected-red.spec.ts",
    "working_directory": "web",
    "result": "8 passed"
  },
  "mapped_paths": {
    "backend_source_api": [
      "internal/resofeed/current_operation.go:40-88",
      "internal/resofeed/current_operation.go:118-123",
      "internal/resofeed/ingest.go:273-294",
      "internal/resofeed/http.go:236-240",
      "internal/resofeed/http.go:267-271",
      "internal/resofeed/http.go:447-453"
    ],
    "frontend_consumer": [
      "web/src/lib/api-client.ts:310-316",
      "web/src/lib/api-client.ts:382-388",
      "web/src/routes/+page.svelte:272-311"
    ],
    "menu_placement": [
      "web/src/routes/+page.svelte:824-872"
    ],
    "source_ledger_conflict": [
      "web/src/routes/+page.svelte:660-669",
      "web/src/routes/+page.svelte:960-970",
      "web/src/routes/components/SourceLedger.svelte:47-56",
      "web/src/routes/components/SourceLedger.svelte:271-276"
    ],
    "browser_contract": [
      "web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts:184-255",
      "web/tests/e2e/ui-runtime-fresh-review-followup.expected-red.spec.ts"
    ]
  },
  "behavioral_proof_register": {
    "backend_current_operation_snapshot": "PROVEN_STATIC",
    "owner_token_protected_runtime_operation_api": "PROVEN_STATIC",
    "frontend_bounded_polling": "PROVEN_RUNTIME",
    "opened_menu_operation_status": "PROVEN_RUNTIME",
    "source_ledger_conflict_detail": "PROVEN_RUNTIME",
    "closed_top_chrome_no_idle_status": "PROVEN_RUNTIME"
  }
}
```
