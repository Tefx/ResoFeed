# Current Operation and Fresh Findings Repair Contract

Status: locked contract artifact for `contract-current-operation-fresh-findings-lock`
Owner of this artifact: doc-reviewer
Scope: acceptance-defining requirements, interface semantics, acceptance checklist, and downstream proof ownership only. This document does not authorize product implementation changes by itself.

## 1. Contract Outcome

The repair is accepted only when the runtime, preview, and tests prove that long-running ingest/fetch/reprocess work is visible where it is contextually useful, never promoted into forbidden dashboard chrome, and every fresh-review finding FR-01 through FR-08 has a blocker/should-fix disposition plus an explicit proof path.

Authority hierarchy for this contract:

1. This step contract for the current-operation/reprocess-library visibility problem and FR-01 through FR-08.
2. `docs/audits/ui-preview-runtime-fresh-review-2026-05-18.md` for fresh finding observations, priorities, expected behavior, and reproduction paths.
3. `docs/DESIGN.md` for UI chrome, Source Ledger, utility menu, Owner Token Prompt, and forbidden UX concepts.
4. `docs/ARCHITECTURE.md` for single-process architecture, owner-token auth, HTTP/MCP parity, process-local current-operation snapshot, and no durable job/activity infrastructure.
5. Existing expected-red/component/e2e coverage listed in §6 as downstream proof obligations.

## 2. Requirement Matrix

Disposition values in this matrix are intentionally limited to `blocker` and `should-fix`; `pre-existing`, `out-of-scope`, and equivalent labels are not valid dispositions for this repair lock.

| ID | Requirement / finding | Disposition | Authoritative citations | Affected surfaces | Downstream ownership |
|---|---|---|---|---|---|
| CO-01 | Current operation is visible during long-running library reprocess and other guarded operations while Source Ledger is in scope and while the `RESOFEED` utility menu is open. Idle state must clear instead of leaving persistent status copy. | blocker | Audit FR-02 observes non-canonical running operation text and expected canonical status while utility menu or Source Ledger is open. Architecture `CurrentOperationInfo`, conflict response, and `GET /api/runtime/operation` sections define a process-memory snapshot cleared when the guard releases. Design permits utility surfaces through the `RESOFEED` Utility Menu and Source Ledger manual status sections. | Backend current-operation endpoint/conflicts; Source Ledger header; opened `RESOFEED` utility menu; component formatting. | expected-red: `internal/resofeed/current_operation_contract_expected_red_test.go`, `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts`, component test. repair: backend current-operation fields/conflict details and frontend contextual display. retest: browser/runtime current-operation proof. wiring audit: ensure idle clear and no persistent top-chrome status. |
| CO-02 | Guard conflicts display the canonical current operation from `details.current_operation`, not stale or opportunistic text. | blocker | Audit FR-02 cites frontend hard-coded `actor:owner` and shape drift. Architecture conflict response and MCP parity sections include `details.current_operation: CurrentOperationInfo` when a representable operation is running. Existing e2e/component tests assert conflict text includes current operation detail. | Error handling for manual ingest/fetch/reprocess; Source Ledger conflict status; utility menu conflict status. | expected-red: backend conflict test and placement tests. repair: normalize conflict formatter to use returned `current_operation`. retest: conflict browser proof and API proof. |
| CO-03 | Owner token remains required for `GET /api/runtime/operation`, operation-trigger endpoints, and MCP operation resources/tools. | blocker | Architecture decision and HTTP/MCP auth sections require every `/api/*` route and `/mcp` request to use the owner token; DESIGN Owner Token Prompt appears before API calls and stores `resofeed.ownerToken`; AGENTS says a single owner token is the universal delegation boundary. | HTTP API; MCP; owner-token prompt; operation polling; reprocess/ingest/fetch triggers. | spec conformance: API auth review. wiring audit: polling and trigger paths carry owner token without bypass. gate: no unauthenticated operation reads or triggers. |
| CO-04 | Running updates are bounded/lightweight and active only while Source Ledger, open `RESOFEED` menu, Inspector item re-ingest, or current-operation-relevant UI is in scope; there is no persistent top-chrome idle strip. | should-fix | Audit FR-06 observes the frontend reads current operation once and visible data depends on reload/navigation. Design Current Operation Status says running updates use `aria-live="polite"` and no more often than useful phase/count changes. Placement tests forbid idle/current-operation text in persistent top chrome. | Frontend polling/wiring; utility menu; Source Ledger; Inspector item re-ingest; current-operation live regions. | repair: contextual bounded polling while scoped UI is active. retest: current-operation polling browser proof. UIUX audit: no top-chrome idle status and live-region behavior. |
| CO-05 | Canonical display vocabulary uses operation kinds `background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, `item_reingest` and actor values `background`, `human`, `agent`; stale vocabulary such as `ingest/all`, `fetch/source`, `reprocess/library`, or `actor:owner` is not acceptable user-visible status copy after repair. | blocker | Audit FR-02 expected text lists the original allowed display kinds and actors; this contract now extends that vocabulary with the Inspector item re-ingest delta. Design status shape is `op: <kind> · actor:<actor> · phase:<phase> · <counts/message> · since <time>`. Architecture documents the same canonical current-operation `kind` plus `actor_kind` shape. | API contract translation layer; frontend API contract; Source Ledger/menu/Inspector formatter; MCP parity documentation. | expected-red: backend current-operation test + component formatter tests; repair: backend type/schema, API client validation, formatter; retest: runtime conflict; spec conformance: API/MCP vocabulary; wiring audit: conflict details; gate: no actor-as-auth drift. |
| CO-06 | Current-operation status clears when idle: idle response has `running:false` and all nullable fields `null`, and the UI removes contextual running/conflict status rather than leaving stale status. | blocker | Architecture `CurrentOperationInfo` and `GET /api/runtime/operation` sections require `running:false` plus nullable fields `null` when idle. Existing backend expected-red test asserts exact idle shape. Placement tests forbid top-chrome idle/current-operation text. | Backend endpoint; frontend state clearing; Source Ledger/menu status nodes. | expected-red: backend idle test and placement tests. repair: state clearing and scoped display. retest: idle clear proof. |
| CO-07 | Explicitly forbidden: dashboards, queues, histories, ledgers for activity/jobs/commands, settings dashboards, extra services, service/repository/DI layers, persistent top-chrome idle status, job dashboards, retry panels, sync/merge controls, and durable operation receipts. | blocker | Design Source Ledger, Inspector, and forbidden-pattern sections prohibit dashboards, queues, activity ledgers, settings dashboards, and related source-management concepts. Architecture decisions and backend lifecycle sections forbid queues/jobs/activity ledgers and service/repository/DI/event-bus layers. AGENTS repeats the same boundaries. | All implementation and docs generated downstream. | gate: diff review for forbidden concepts. wiring audit: no storage/schema/service layers. UIUX audit: no dashboards/top-chrome idle strip. |
| FR-01 | Mobile `RESOFEED` utility menu must open as a visible flat full-width/narrow utility sheet, not off-screen; focus moves to first item and Escape returns focus. | blocker | Audit FR-01 observed the mobile utility menu off-screen. DESIGN Layout and `RESOFEED` Utility Menu sections require a flat full-width/narrow utility surface and keyboard-reachable menu items. | Mobile utility menu CSS/DOM/focus. | expected-red: `web/tests/e2e/ui-runtime-fresh-review-remediation.spec.ts` FR-01/FR-10 and conformance menu tests. repair: UI placement. retest/browser proof: 390×844 menu screenshot/ARIA. UIUX audit: focus and sheet visibility. |
| FR-02 | Current-operation API/UI shape and copy must align to canonical fields, actor semantics, and display vocabulary. | blocker | Audit FR-02 observes `[INGESTING...] · op: ingest/all · actor:owner...` and missing `actor_kind` in backend/frontend contract. Architecture requires process-local `CurrentOperationInfo`, endpoint, and conflict semantics. | Backend/current-operation schema; frontend API contract; Source Ledger/menu display. | expected-red: backend current-operation test, placement e2e, component test. repair: schema/formatter alignment. retest: API and browser proof. spec conformance: actor/kind vocabulary. |
| FR-03 | During an active current operation, Source Ledger `[RUN INGEST]` reflects running state (`[INGESTING...]`) and is disabled; it must not remain enabled/default. | blocker | Audit FR-03 observed header `[INGESTING...]` while adjacent `[RUN INGEST]` remained enabled. DESIGN Source Ledger active state requires `[INGESTING...]`, disabled, no spinner/progress. The static preview must model the same Source Ledger status/action anatomy. | Source Ledger global ingest action; current-operation state propagation. | expected-red: placement e2e running ingest, component test. repair: disabled/running action wiring. retest/browser proof: disabled running action. |
| FR-04 | Source Ledger bracket actions must maintain stable 44 CSS px hit targets, including `[RUN INGEST]`, `[IMPORT OPML]`, and `[FETCH]`. | should-fix | Audit FR-04 measured undersized actions. DESIGN layout and Source Ledger DOM contract require stable 44 CSS px touch targets. | Source Ledger bracket action geometry. | expected-red: preview/runtime conformance action geometry; fresh review browser proof. repair: hitbox sizing only. retest/browser proof: hitbox measurements desktop/mobile. UIUX audit: no row-height disruption. |
| FR-05 | Current-operation status uses readable chrome operational typography, wraps/truncates only in a way that preserves phase/count/message usefulness, and is not metadata-sized nowrap text. | should-fix | Audit FR-05 observes metadata typography and nowrap truncating useful detail. DESIGN component tokens and Current Operation Status require chrome typography and useful phase/count/message detail when available. | Utility menu status; Source Ledger current-operation line; mobile layout. | expected-red: preview/runtime conformance FR-25/current-operation copy. repair: status typography/wrapping. retest/browser proof: mobile readable status. UIUX audit: no stale/oversized dashboard copy. |
| FR-06 | Running current-operation status refreshes while scoped UI is active, without full reload and without unbounded background polling. | should-fix | Audit FR-06 observes one-time read and stale counts until reload. Design allows useful running updates with `aria-live="polite"`. Architecture says the snapshot is contextual inline status only, not durable history. | Frontend current-operation polling; scoped UI lifecycle; live regions. | expected-red: downstream polling proof to be added/updated under current-operation browser coverage. repair: bounded scoped polling. retest: observe count/message update without reload. wiring audit: no global idle poll/dashboard. |
| FR-07 | `docs/ui-preview.html` must not embed preview-only `scenario running:`/`scenario blocked:` labels inside user-visible operational status components. | should-fix | Audit FR-07 lists preview status strings with `scenario running:` and `scenario blocked`; DESIGN Current Operation Status examples require canonical copy only inside components. | Static preview copy; runtime/preview conformance. | expected-red: preview DOM/copy audit. repair: preview copy outside component text or remove prefixes. retest: static/browser preview copy proof. |
| FR-08 | `docs/ui-preview.html` Source Ledger DOM must match the required DOM contract: `h1#source-ledger-title`, header/status/action anatomy, and native disabled where required for Source Ledger active actions. | should-fix | Audit FR-08 observes preview heading/disabled-state drift. DESIGN Source Ledger DOM contract requires `h1#source-ledger-title` and native disabled bracket actions where required. | Static preview DOM; runtime Source Ledger DOM; accessibility tree. | expected-red: `web/tests/e2e/ui-preview-runtime-conformance-audit.expected-red.spec.ts` and remediation FR-07 DOM test. repair: preview/runtime DOM alignment. retest: preview DOM proof and runtime DOM proof. |

## 3. Interface Semantics Lock

### 3.1 Backend/API fields

Downstream repair must treat the following as the locked current-operation interface semantics. If the implementation keeps the architecture's existing low-level `kind`/`scope` pair internally, it must still expose enough structured data for canonical UI display and conflict explanation.

Required envelope for `GET /api/runtime/operation`, HTTP conflict `details.current_operation`, and MCP `resofeed://system/operation`:

```json
{
  "operation": {
    "running": true,
    "kind": "library_reprocess",
    "actor_kind": "human",
    "phase": "processing_items",
    "count": { "current": 2, "total": 5 },
    "message": "library reprocess processing item",
    "started_at": "2026-05-17T11:00:00Z",
    "updated_at": "2026-05-17T11:00:05Z"
  }
}
```

Idle envelope semantics:

```json
{
  "operation": {
    "running": false,
    "kind": null,
    "actor_kind": null,
    "phase": null,
    "count": null,
    "message": null,
    "started_at": null,
    "updated_at": null
  }
}
```

Locked field meanings:

| Field | Required | Nullable when idle | Accepted/canonical values | Notes |
|---|---:|---:|---|---|
| `running` | Yes | No | `true`/`false` | `true` only while the in-process operation guard is held. |
| `kind` | Yes | Yes | `background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, `item_reingest` | User-visible canonical operation kind. Downstream may map from internal guard values, but stale display values are not accepted. |
| `actor_kind` | Yes | Yes | `background`, `human`, `agent` | Authorization remains owner-token based; `actor_kind` is provenance/display semantics, not auth. |
| `phase` | Yes | Yes | terse phase strings such as `starting`, `loading_sources`, `fetching_sources`, `fetching_feed`, `processing_items`, `source_complete`, `complete` | Must be non-empty when known and running. |
| `count` | Yes | Yes | `null` or `{ "current": integer, "total": integer }` | Non-negative integers; clients tolerate `null`. |
| `message` | Yes | Yes | terse operational text | No friendly dashboard prose. |
| `started_at` | Yes | Yes | RFC3339 UTC string | Null only when idle/unknown. |
| `updated_at` | Yes | Yes | RFC3339 UTC string | Null only when idle/unknown. |

Compatibility resolution note: `docs/ARCHITECTURE.md` has been reconciled to the same display/runtime vocabulary (`background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, `item_reingest`) and `actor_kind` field locked here. Internal guards may still map from low-level implementation inputs, but HTTP/MCP/frontend contract surfaces must not expose the older `kind`/`scope` pair as canonical current-operation shape.

### 3.2 Frontend display semantics

Canonical running display shape:

```text
op: <kind> · actor:<actor_kind> · phase:<phase> · <count/message> · since <HH:MM:SS>
```

Examples:

- `[REPROCESSING...] · op: library_reprocess · actor:human · phase:processing_items · 2/5 · library reprocess processing item · since 11:00:00`
- `[INGESTING...] · op: background_ingest · actor:background · phase:fetching_sources · 1/3 · ingest fetching source · since 14:00:00`
- `[FETCHING...] · op: source_fetch · actor:human · phase:fetching_feed · src: example · since 14:02:00`

Display rules:

- Use canonical `kind` and `actor_kind`; do not render `actor:owner`, `ingest/all`, `fetch/source`, or `reprocess/library` as final repaired status copy.
- Show status only in contextual surfaces: Source Ledger, open `RESOFEED` menu, and current-operation-relevant UI.
- Remove contextual running status when idle. Do not replace it with a persistent top-chrome idle strip.
- Conflict text must combine the terse error and the canonical current operation from `details.current_operation`; it must not duplicate generic errors or fabricate stale status.
- Use `aria-live="polite"` for running updates and terse conflict/result updates where applicable.
- Polling/refresh must be bounded and scoped to active current-operation surfaces; this contract does not permit a global dashboard poller.

### 3.3 Trigger/auth semantics

- `GET /api/runtime/operation`, reprocess, ingest, fetch, language mutation, and MCP equivalents remain owner-token protected.
- Possession of owner token authorizes the action; `actor_kind` and `actor_id` are provenance/idempotency fields only where applicable.
- Manual ingest/fetch triggers do not create idempotency receipts, queues, jobs, histories, or retry state.
- Reprocess remains explicit and non-durable; it may use idempotency where architecture already requires, but it must not become a durable job dashboard or activity ledger.

## 4. Acceptance Checklist

- [ ] Source Ledger shows current operation during `library_reprocess`, `background_ingest`, `manual_ingest`, and `source_fetch` when those operations hold the guard.
- [ ] Inspector item re-ingest conflicts/status use canonical `item_reingest` when that operation holds the guard.
- [ ] Open `RESOFEED` utility menu shows the same canonical running/conflict status while relevant work is running.
- [ ] Closed top chrome does not show `LANG`, `[REPROCESS LIBRARY]`, running operation status, conflict status, or idle operation status as persistent dashboard chrome.
- [ ] Idle operation clears contextual status: backend returns `running:false` with nullable fields `null`; frontend removes stale running/conflict copy.
- [ ] Guard conflicts display `err: <diagnostic>` plus canonical `current_operation` detail from the conflict response.
- [ ] Operation display vocabulary is restricted to `background_ingest`, `manual_ingest`, `source_fetch`, `library_reprocess`, `item_reingest` and `background`, `human`, `agent`.
- [ ] `actor_kind` is present in backend/frontend current-operation contract semantics and is not replaced by `actor:owner` display text.
- [ ] Owner-token auth is required for operation reads, operation triggers, and MCP operation resources/tools.
- [ ] Running update refresh is bounded/lightweight and active only while Source Ledger, open utility menu, Inspector item re-ingest, or current-operation-relevant UI is in scope.
- [ ] Mobile utility menu is visible at 390×844, opens as a flat utility sheet, moves focus to first item, and Escape returns focus to `RESOFEED`.
- [ ] Source Ledger running action is disabled/stable and displays `[INGESTING...]` while a shared current operation blocks/runs global ingest.
- [ ] Source Ledger bracket action hitboxes are at least 44 CSS px without disrupting dense row rhythm.
- [ ] Current-operation status typography/wrapping preserves phase/count/message detail on mobile.
- [ ] Static preview status components contain canonical operation copy only; scenario labels, if retained, live outside user-visible status components.
- [ ] Static preview Source Ledger DOM uses `h1#source-ledger-title`, required header/status/action anatomy, and the documented disabled action semantics.
- [ ] No dashboards, queues, histories, activity ledgers, settings dashboards, extra services, service/repository/DI layers, persistent top-chrome idle status, retry panels, sync/merge controls, or durable operation receipts are introduced.

## 5. Browser / Runtime Proof Obligations

The downstream proof set must include, at minimum:

| Proof area | Required evidence | Owning downstream lane |
|---|---|---|
| Mobile utility menu | 390×844 browser proof that `RESOFEED` menu opens visibly, contains `TODAY`/`SOURCE LEDGER`, focus moves to first item, Escape returns focus. | expected-red + repair + retest + UIUX audit |
| Source Ledger current operation | Browser proof that Source Ledger shows canonical current-operation detail during long-running reprocess/ingest/fetch. | expected-red + repair + retest |
| Open utility menu current operation | Browser/component proof that opened menu shows canonical running/conflict status and closed top chrome does not. | expected-red + repair + retest |
| Current-operation polling | Runtime proof that phase/count/message update without reload while scoped UI is active and stop/clear when idle/out of scope. | repair + wiring audit + retest |
| Reprocess-library visibility | Browser/API proof that `library_reprocess` is visible in Source Ledger/menu while running and does not become a job dashboard. | repair + retest + UIUX audit |
| Disabled running action | Browser/component proof that `[RUN INGEST]` becomes `[INGESTING...]` and disabled when the shared current operation makes it unavailable. | expected-red + repair + retest |
| Hitboxes | Browser measurement proof for `[RUN INGEST]`, `[IMPORT OPML]`, `[FETCH]` at >=44 CSS px without density regression. | repair + UIUX audit + retest |
| Preview copy | Static/browser proof that preview operational status text has no `scenario running:` or `scenario blocked` inside user-visible status components. | expected-red + repair + spec conformance |
| Preview DOM | Static/browser proof that `docs/ui-preview.html` Source Ledger uses required `h1#source-ledger-title`, header anatomy, and disabled action contract. | expected-red + repair + spec conformance |
| Owner-token auth | API/component proof that operation read/trigger paths use owner token and unauthenticated calls fail. | spec conformance + gate |
| Forbidden concepts | Diff/proof audit showing no dashboards, queues, histories, settings dashboards, extra services, service/repository/DI layers, or persistent idle top-chrome status. | wiring audit + UIUX audit + gate |

## 6. Downstream Ownership Map

| Item | Expected-red source | Repair owner class | Retest / audit / gate owner class |
|---|---|---|---|
| CO-01 / CO-06 backend current-operation shape and idle clear | `internal/resofeed/current_operation_contract_expected_red_test.go` | backend repair | spec conformance + gate |
| CO-02 conflict current-operation detail | `internal/resofeed/current_operation_contract_expected_red_test.go`; `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts`; component placement test | backend + frontend repair | retest + wiring audit |
| CO-03 owner token auth | architecture/API contract plus existing authenticated fixtures | backend/frontend repair as needed | spec conformance + gate |
| CO-04 / FR-06 scoped polling | current-operation placement tests plus new/updated browser proof obligation | frontend wiring repair | wiring audit + retest |
| CO-05 / FR-02 canonical vocabulary and `actor_kind` | current-operation placement expected-red; preview/runtime conformance FR-25; component API contract validation | backend/frontend contract repair | spec conformance + UIUX audit |
| CO-07 forbidden concepts | docs/DESIGN, docs/ARCHITECTURE, AGENTS boundaries | all repair lanes must avoid | wiring audit + UIUX audit + gate |
| FR-01 mobile utility menu | `web/tests/e2e/ui-runtime-fresh-review-remediation.spec.ts` FR-01/FR-10; conformance menu test | frontend CSS/DOM/focus repair | browser retest + UIUX audit |
| FR-03 disabled running action | `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts`; component placement test | frontend Source Ledger repair | browser retest |
| FR-04 hitboxes | conformance/fresh-review browser measurements | CSS/UI repair | UIUX audit + browser retest |
| FR-05 readable current-operation status | conformance FR-25/current-operation status checks | frontend status style/layout repair | UIUX audit + browser retest |
| FR-07 preview copy | preview/runtime conformance audit expected-red | preview doc repair | spec conformance |
| FR-08 preview DOM | preview/runtime conformance audit expected-red; runtime fresh-review FR-07 DOM test | preview/runtime DOM repair | spec conformance + browser retest |

## 7. Non-Goals

- This contract does not implement Go/Svelte/TypeScript runtime behavior.
- This contract does not add or modify tests.
- This contract does not add a job dashboard, queue, history, activity ledger, retry panel, settings dashboard, sync/merge system, extra service, service/repository layer, DI container, event bus, storage schema, or persistent operation state.
- This contract does not weaken owner-token authorization.
- This contract does not make `spec-verifier` responsible for writing contract artifacts; downstream read-only verification remains separate from this doc-reviewer-authored contract lock.
