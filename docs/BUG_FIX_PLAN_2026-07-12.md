# ResoFeed Defect Repair Architecture and Planning Authority

**Date:** 2026-07-12
**Scope:** RF-BUG-001 through RF-BUG-010
**Status:** Ready for pending-plan repair; not ready for implementation

## 1. Purpose and Authority

This document gives a planner enough authority to repair the pending managed plan without inventing product boundaries. It defines observable outcomes, ownership, dependency direction, state flow, security/privacy constraints, failure behavior, rollback boundaries, and deterministic acceptance.

Canonical product authority remains:

- `docs/ARCHITECTURE.md` for system, storage, HTTP, MCP, and state contracts;
- `docs/DESIGN.md` for user-visible UI and accessibility behavior;
- `docs/PROMPTING_SYSTEM.md` for Prompting System v2.2;
- `docs/CONTAINER.md` for the single-container runtime;
- `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md` for real-runtime browser acceptance;
- `AGENTS.md` for hard project constraints.

If this document conflicts with a canonical reference, the canonical reference wins. The planner must preserve each RF-BUG ID as a traceable requirement.

## 2. Binding Decisions

1. **Single deployable:** `cmd/resofeed` remains one Go binary serving static assets, JSON HTTP, MCP Streamable HTTP, and background ingest. No sidecar worker, admin process, or runtime UI directory is introduced.
2. **Storage:** SQLite with FTS5 remains the only durable store. No vector database, embedding service, queue, activity ledger, sync coordinator, or state merger is allowed.
3. **Portable state:** JSON State is the only backup/restore format. It contains only active sources, active steering rules, and currently resonated items. OPML is import-only source intake.
4. **Authorization:** The Owner Token remains the universal authorization boundary. `actor_id` is attribution and idempotency input, never authorization.
5. **Secrets:** `OPENROUTER_KEY` is runtime-only. Secrets, authorization values, cookies, provider bodies, and `.env` contents must not be persisted, returned, logged, included in Doctor, or retained in browser evidence.
6. **HTTP security:** Go owns Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`. Caddy passes them unchanged.
7. **Prompting:** `docs/PROMPTING_SYSTEM.md` defines the only active Prompting v2.2 semantics. OpenRouter transforms JSON and does not orchestrate or write durable state.
8. **Browser acceptance:** Comprehensive Playwright cases use the real Go runtime and product APIs. Product API interception cannot prove comprehensive browser behavior.
9. **Frontend state:** Route, selection, focus, pending, and inline errors are transient browser state. SQLite and Go remain authoritative for product data.
10. **Minimal shape:** Keep domain logic in flat `internal/resofeed/` files and frontend behavior under `web/`. Add no service/repository hierarchy, DI container, registry framework, event bus, or provider abstraction layer.

## 3. Architecture Basis

### 3.1 System Layers

| Layer | Owner | Responsibility | Allowed dependency direction |
|---|---|---|---|
| Browser UI | `web/` | Routes, rendering, interaction, focus, accessibility, responsive layout, transient request state | UI → existing HTTP contracts |
| HTTP/static/MCP shell | `internal/resofeed/http.go`, `mcp.go`, adjacent static/Doctor ownership | Owner Token enforcement, strict transport validation, serialization, static delivery, security headers | Transport → application operations and packaged assets |
| Application core | flat files in `internal/resofeed/` | Ingest, inspect, resonate, steer, search, state, prompting orchestration, result classification | Core → SQLite and OpenRouter boundary through existing project wiring |
| Persistence | SQLite + FTS5 | Durable product state and lexical search | Application core → SQLite |
| LLM boundary | `internal/resofeed/openrouter.go` | Runtime JSON transformation and safe provider failure classification | Application core → OpenRouter; never OpenRouter → SQLite |
| Runtime packaging | `cmd/resofeed`, container build | One process, embedded UI, writable data location, startup/shutdown | Entrypoint → initialized application and transports |
| Verification shell | existing Go, frontend, and Playwright tests | Deterministic proof against pure/render boundaries and real runtime | Tests → public or package contracts; comprehensive browser → real runtime |

The split follows existing ownership because each area changes for a distinct reason. No new layer is needed.

### 3.2 Source of Truth Matrix

| Data or behavior | Authority | Explicit exclusions |
|---|---|---|
| Sources, items, resonance, steering rules | SQLite | Browser local state and test artifacts |
| Lexical search | SQLite FTS5 rebuilt/updated from canonical item data | Embeddings and vector stores |
| Portable state | Validated JSON State transaction | OPML, items/history, receipts, settings, credentials |
| Source intake | OPML import or Steer URL intake | OPML export/restoration/sync |
| Owner authorization | Runtime Owner Token contract | `actor_id`, browser route, MCP identity |
| Processing language and item transform behavior | Runtime metadata plus Prompting v2.2 canonical contract | Per-browser private variants and stale v2.1 behavior |
| Product routes and titles | Canonical route/UI contract | Host address and hydration timing |
| Static UI bytes | UI build packaged into the Go binary | Process working directory and external runtime asset tree |
| Security headers | Go HTTP boundary | Caddy overrides and per-handler competing values |
| Transient UI selection/focus/errors | Current browser session | SQLite, State export, receipts |
| Test result and diagnostics | Standard test/runtime evidence | Product state, portable state, custom durable evidence ledger |

### 3.3 Service Catalog

- **Go binary:** one deployable exposing static UI, JSON HTTP, MCP Streamable HTTP, and background ingest.
- **SQLite/FTS5:** sole durable data and lexical-search service.
- **OpenRouter:** sole external model provider and stateless JSON transformer.
- **Browser UI:** authenticated owner workbench with no durable authority beyond browser storage of the Owner Token under the existing contract.
- **Caddy/Tailnet:** downstream TLS/reverse-proxy boundary that must not replace Go-owned application security headers.

No additional service is authorized.

### 3.4 Runtime Contract

- Startup resolves runtime configuration, opens/migrates SQLite, validates packaged UI prerequisites, initializes HTTP/MCP/application wiring, binds the listener, then starts background ingest after storage is ready.
- A required packaged-asset failure stops startup before the listener is reachable.
- The runtime uses existing project dependencies only. New external libraries require a separate architecture decision.
- Source-level ingest failures remain isolated; no persistent work queue or delayed command history is created.
- State restore validates before one atomic SQLite transaction. Failure leaves the prior portable state unchanged.
- Valid model output is committed through Go-owned application behavior. Invalid or unavailable output follows canonical failure/fallback classification and cannot partially update item text and FTS state.
- Shutdown and test teardown close owned processes, browser contexts, ports, and temporary databases. Residue is a verification failure.

### 3.5 State Strata

**Durable product state:** SQLite sources, items and provenance, resonance, steering rules, FTS5 content, allowed runtime metadata, and short-lived idempotency data only where already authorized.

**Portable state:** Active sources, active steering rules, and currently resonated items in JSON State only.

**Transient runtime state:** Active operation status, request coordination, source fetch state, in-memory guards, provider responses during a request, and process lifecycle.

**Browser-session state:** Current route, selection, focus return target, pending/error state, search presentation state, and the existing Owner Token storage behavior.

**Request-only state:** One-time prompts, model overrides, authorization headers, provider request/response bodies, and `actor_id` attribution.

No transient, browser, request-only, credential, receipt, history, or diagnostic state becomes portable.

### 3.6 Transport Boundary Rules

- HTTP and MCP expose equivalent authorized product operations where canonical architecture requires parity; neither transport owns business logic.
- HTTP query/body validation remains strict. Unknown or duplicate query parameters are rejected where the canonical endpoint contract requires it.
- Owner Token checks occur before protected route lookup, preserving unauthorized-before-not-found behavior for retired protected paths.
- Static routing serves real assets only for asset paths and SPA bootstrap only for listed application routes. Static misses must not masquerade as SPA success.
- Browser routes must round-trip every valid opaque item ID without altering the stored ID; the implementation representation is deferred to the implementation stage and must satisfy existing validation constraints.
- Go applies the four required security headers around the complete HTTP surface. Inner handlers and Caddy do not compete for ownership.
- Streaming and cancellation semantics remain those of the existing Go HTTP boundary.

### 3.7 Cross-Cutting Governance

- **Registries:** None. Existing explicit application wiring and SQLite ownership are sufficient.
- **Lifecycle ordering:** The entrypoint owns startup and shutdown order described in the runtime contract.
- **Coordination:** Existing in-process coordination and SQLite transactions only. No event bus, queue, service discovery, or DI container.
- **Wiring:** Explicit constructor/function wiring from `cmd/resofeed` into flat `internal/resofeed/` modules and transports.
- **Governance owner:** `cmd/resofeed` owns lifecycle; `internal/resofeed` owns application coordination; SQLite owns transaction boundaries; the browser owns transient interaction coordination.

This direct wiring is chosen because one process and one storage engine do not justify a separate control plane.

### 3.8 Shared Abstractions

**Shared types:** Existing item, source, state, operation-result, and transport DTOs remain canonical where already shared by HTTP, MCP, and frontend contracts. Ownership stays with the current defining module.

**Shared protocols:** No new protocol is authorized. HTTP and MCP call the same existing application operations rather than introducing parallel service interfaces.

**Shared utilities:** Reuse existing route/API helpers and test fixtures only where they already serve multiple consumers. Do not create a generic helper package for one repair.

**Decision:** Share only contracts already crossing two or more current boundaries. Bug-specific selection, layout, CSP construction, asset validation, and test cleanup details remain local to their owners unless repeated code demonstrates an immediate need.

### 3.9 Module Split Recommendations

| Existing area | Owner | Repair responsibility | Must not own |
|---|---|---|---|
| Main workbench route/components | Frontend | RF-BUG-001, 002, 006, 007 interaction and route behavior | Durable product state or transport policy |
| Source Ledger component/styles | Frontend | RF-BUG-004 and 008 controls, grouping, focus, responsive behavior | OPML export, source hierarchy, job history |
| HTTP/static/Doctor boundary | Go transport/runtime | RF-BUG-003, 004, 005 static capability, headers, diagnostics | Domain orchestration or persisted asset metadata |
| Prompting/ingest/reprocess boundary | Go application + OpenRouter edge | RF-BUG-009 canonical v2.2 behavior and atomic data/FTS outcomes | HTTP serialization or provider-owned persistence |
| Playwright harness | Verification | RF-BUG-010 real-runtime isolation, cleanup, ordinary failure evidence | Product reset API, product route interception, or durable evidence format |
| Canonical documentation | Named canonical docs | User-visible contract synchronization | Implementation-private layouts or temporary test artifacts |

Keep these areas within their existing files unless file size or test locality provides concrete evidence for a small adjacent split.

### 3.10 UX Surfaces

- TODAY and Search item selection into Inspector.
- Cold, refreshed, and history-restored routes.
- Source Ledger responsive controls and status.
- Steer invalid-state accessibility.
- Browser titles and `/doctor` diagnostics.
- JSON State export/import and OPML import.

Design/audit involvement is required for RF-BUG-001, 002, 006, 007, and 008 because their acceptance includes focus, accessibility, responsive layout, or visible transition behavior.

### 3.11 Runtime Surfaces

- **Local server/browser:** launch the built `cmd/resofeed` binary and prove routes, assets, API authorization, security headers, and UI behavior in a real browser.
- **Container:** launch the one-process image with a writable SQLite volume and no external UI tree or Node runtime.
- **Tailnet/Caddy:** prove browser boot and unchanged Go-owned security headers through the deployed reverse proxy.
- **MCP:** prove authorized parity for affected operations without adding product concepts.

Runtime closure requires launched-surface evidence; handler/component tests alone cannot close these surfaces.

### 3.12 Open Questions

None block pending-plan repair.

### 3.13 Readiness

**READY FOR PENDING-PLAN REPAIR; NOT READY FOR IMPLEMENTATION.**

The architecture basis names owners, dependency direction, state strata, transport boundaries, failure assumptions, and deterministic outcomes. The managed plan must now be repaired against this authority. Implementation may begin only after that plan has valid ownership, reachable dependencies, bounded modification authority, and ordinary phase prerequisites.

## 4. Requirement Contracts

### RF-BUG-001 — Inspector Selection

**Required outcome:** Feed and Search selection immediately render the selected item preview; detail and inspection-marker requests enhance it independently; stale responses cannot replace the current selection. Direct item routes remain usable through pending, failure, success, Back, focus return, and Escape.

**Acceptance:** Desktop and narrow real-browser flows cover pending/success/failure, rapid A-to-B selection with late A completion, viewport changes, direct routes, and focus behavior. Current item, URL, content, and errors must agree after every transition.

### RF-BUG-002 — Initial Route, History, and Opaque IDs

**Required outcome:** Route resolution determines the first visible surface and title before token hydration or shell API work can expose another surface. Cold load, refresh, Back, and Forward preserve TODAY, SOURCE LEDGER, SEARCH, and direct item state. Valid opaque item IDs round-trip unchanged through browser and affected HTTP item operations.

**Acceptance:** English and Chinese route matrices sample every readiness transition; repeated zero-retry runs show no wrong surface/title. Search filters and selection restore through history. Special valid IDs return the same stored item ID.

### RF-BUG-003 — Embedded UI and Doctor

**Required outcome:** The production UI is packaged into the single Go binary and validated before bind. Runtime behavior is independent of working directory. Doctor adds only `ui_assets=ready` and `ui_asset_source=embedded` to its existing safe output.

**Acceptance:** The built binary serves root, assets, and valid deep links from multiple working directories; invalid required bootstrap content fails before bind; static misses remain misses; GET/HEAD behavior is correct; container runtime needs only the binary and writable data. Doctor redaction tests cover configured secret values and line-breaking input.

### RF-BUG-004 — OPML and Portable State

**Required outcome:** Retain OPML import and JSON State export/import. Remove OPML export from Go, HTTP, MCP, UI, and active documentation. Portable State remains limited to active sources, active steering rules, and currently resonated items.

**Acceptance:** Capability scans find no OPML export. Source Ledger shows the retained operations only. A retired protected path yields ordinary unauthorized before authentication and ordinary not-found after valid authentication. JSON State round-trips allowed fields atomically and excludes all others.

### RF-BUG-005 — HTTP Security

**Required outcome:** Go emits one effective CSP, `nosniff`, `no-referrer`, and `DENY` framing value across the complete HTTP surface. The policy boots the packaged UI and supports ordinary product operations. Caddy does not alter the values. Streaming and cancellation remain functional.

**Acceptance:** Focused Go response tests, a real Chromium OPML-import/State-export-import flow, streaming/cancellation checks, and direct-Go versus Caddy comparison all pass. Browser console/network evidence contains no CSP breakage or raw secrets.

### RF-BUG-006 — Titles

**Required outcome:** Use `RESOFEED` for the static shell and exact functional titles for TODAY, SOURCE LEDGER, SEARCH, INSPECTOR, and `/doctor`. Language changes do not translate these labels.

**Acceptance:** Cold load, refresh, client navigation, Back, and Forward in English and Chinese show the route-correct title with no host fallback or intermediate wrong title.

### RF-BUG-007 — Steer Accessibility

**Required outcome:** Idle/empty Steer exposes no missing-URL error. A matching invalid submission exposes one localized accessible error, retains input/focus, sends no mutation, and clears on edit. Stale preview and transport failure cannot create a false missing-URL state.

**Acceptance:** English and Chinese accessibility lifecycle tests cover empty, invalid, edit recovery, repeat invalid, locale change, stale preview, and transport failure with one current announcement and no duplicate alert.

### RF-BUG-008 — Source Ledger

**Required outcome:** Source List and Portable State remain separately labelled and usable on narrow screens. Retain OPML import; State export/import; global ingest; per-source fetch; delete confirmation/cancel; source info; operation status and diagnostics. Do not add OPML export, a second URL field, folders/tags, settings, sync, job history, or an activity ledger.

**Acceptance:** Desktop and narrow real-runtime checks cover grouping, 44-by-44 CSS-pixel targets, focus, overflow, long content, ingest/fetch states and conflicts, independent rows, delete focus behavior, accessibility relationships, and screenshots.

### RF-BUG-009 — Prompting v2.2

**Required outcome:** All canonical transform paths identify and enforce Prompting System v2.2 according to `docs/PROMPTING_SYSTEM.md`. OpenRouter remains a runtime transformer; Go validates and owns persistence. Stale v2.1 naming is removed from active runtime identities, errors, tests, and aligned documentation.

**Acceptance:** Focused ingest/reprocess tests cover valid, boundary, malformed, unavailable, retry/fallback, and atomic item/FTS outcomes. Request-only prompts/model choices, provider data, and credentials never enter durable or portable state.

### RF-BUG-010 — E2E Isolation

**Required outcome:** Comprehensive Playwright runs the real binary and product APIs with case-local mutable state, clean browser contexts, bounded safe runtime reuse, reliable cleanup, and ordinary Playwright/runtime failure evidence. Synthetic states stay in render/unit tests. No product reset API or route interception is added.

**Acceptance:** The smoke lane finishes under two minutes; full Chromium list/run sets match with zero retries; three clean full runs pass the same title set; an intentional assertion failure retains standard report/trace/screenshot/video plus redacted runtime/browser diagnostics and cleanup outcome; teardown residue fails.

## 5. State and Data Flow

1. **Browser interaction:** User action updates transient route/selection state and calls an authenticated HTTP operation.
2. **Transport:** Go authenticates Owner Token, validates the request, and invokes the existing application operation.
3. **Application core:** Domain behavior reads/writes SQLite or calls OpenRouter when required. Transport formatting stays outside the core.
4. **Persistence:** SQLite transaction commits authoritative state and related FTS5 updates together where the canonical contract requires atomicity.
5. **Response:** HTTP or MCP serializes the canonical outcome; the browser reconciles only the current request/selection.
6. **Failure:** Validation/auth failures do not mutate state. Provider or detail failures retain prior readable state. State-import failure rolls back. Stale browser responses are discarded.

## 6. Planning Dependencies and Sequencing

1. **Repair the managed plan against this authority.** Preserve RF-BUG-001–010 traceability and restrict each step to its actual owner and files.
2. **Synchronize canonical contracts that currently conflict.** Resolve OPML import-only/JSON State language and single-binary packaging before dependent implementation.
3. **Lock observable acceptance.** Define focused tests for each RF-BUG outcome without prescribing helper layouts, private algorithms, complete fixture bytes, or temporary artifact directories.
4. **Repair frontend behavior:** RF-BUG-001, 002, 006, 007, and the UI portion of 008.
5. **Repair Go runtime boundaries:** RF-BUG-003, 004, 005, and the runtime portion of 008.
6. **Align Prompting v2.2:** RF-BUG-009 after canonical contract synchronization.
7. **Stabilize real-runtime browser acceptance:** RF-BUG-010 after product behavior and runtime boundaries are available.
8. **Close container and Tailnet surfaces:** Verify the built artifact and Caddy behavior after local acceptance.
9. **Synchronize final documentation:** Update user-visible behavior and ordinary verification evidence in the same change cycle as code/tests.

Independent work may run in parallel only when it does not mutate the same contract or acceptance owner.

## 7. Verification Matrix

| Requirement | Focused proof | Real-runtime proof | Failure/rollback proof |
|---|---|---|---|
| RF-BUG-001 | Selection and stale-response tests | Feed/Search desktop and narrow browser flows | Detail/inspection failure retains readable state |
| RF-BUG-002 | Route/history/ID round-trip tests | Cold/refresh/Back/Forward EN/ZH repetitions | No wrong intermediate surface/title |
| RF-BUG-003 | Packaged-asset and Doctor redaction tests | Arbitrary-cwd binary and container boot | Invalid bootstrap fails before bind |
| RF-BUG-004 | Capability and State-boundary tests | Source Ledger plus HTTP/MCP probes | Failed State import leaves prior state; retired path auth precedence |
| RF-BUG-005 | Header, streaming, cancellation tests | Chromium CSP flow and direct/Caddy comparison | Missing/duplicate header or CSP violation fails acceptance |
| RF-BUG-006 | Title mapping tests | Cold and client navigation EN/ZH | No host fallback or stale title |
| RF-BUG-007 | Accessibility lifecycle tests | Keyboard/screen-reader-oriented browser flow | Edit clears invalid state; stale/transport errors stay distinct |
| RF-BUG-008 | Responsive/state render tests | Desktop/narrow operations, accessibility, screenshots | Conflicts/errors remain local and controls stay usable |
| RF-BUG-009 | Prompting v2.2 transform-path tests | Runtime ingest/reprocess where applicable | Invalid/provider failure cannot partially update item/FTS |
| RF-BUG-010 | Harness isolation/cleanup checks | Smoke, full Chromium, three clean runs | Intentional failure retains redacted evidence; residue fails |

A generic command exit or aggregate pass count does not substitute for the named user behavior. Exact command orchestration belongs to the repaired plan and implementation-stage verification, derived from current repository scripts.

## 8. Security and Privacy

- Never read, print, persist, fixture, or transmit an actual `.env` value as evidence.
- Clear or replace `OPENROUTER_KEY` for deterministic CI-safe browser lanes; live smoke remains separately authorized by the canonical harness contract.
- Sanitize Owner Token, provider keys, Authorization/Cookie values, credential-bearing URLs, provider bodies, and runtime commands before evidence retention.
- Doctor and startup errors may name a missing/invalid field or source, but never its secret value.
- CSP and companion headers remain application-owned by Go and apply to error paths as well as success paths.
- Browser evidence must use the real product boundary without exposing credentials in screenshots, logs, network summaries, or reports.

## 9. Failure and Rollback

- Each repair remains independently reversible at its owning boundary, while code, tests, and documentation for that behavior move together.
- Rollback must restore the last passing user behavior and compatible data contract. It must never restore OPML export, secret exposure, external runtime UI assets, or prohibited portable state.
- State-format changes require backward-safe validation and atomic restore behavior under the canonical architecture.
- Prompting failure leaves prior readable item/search state intact unless canonical fallback behavior explicitly commits a complete replacement.
- Deployment rollback restores the prior single binary and keeps the SQLite volume intact; any data migration requires its own verified compatibility/rollback plan.
- A failed browser or container verification blocks that runtime surface without claiming broader release readiness.

## 10. Documentation Synchronization

Implementation work must update the affected canonical and user-facing documentation in English during the same cycle:

- OPML/State: Architecture, Design, usage/readme surfaces, and active UI descriptions;
- embedded UI/container: Architecture, Container, and build/deployment instructions;
- CSP/security headers: Architecture, Container, and deployment notes;
- routes/Inspector/titles/Ledger/accessibility: Architecture and Design where contracts change;
- Prompting v2.2: Prompting System and Architecture;
- E2E isolation: Playwright harness contract and concise executable test guidance.

Documentation records product behavior and ordinary verification. It must not prescribe private helper/function layouts, complete fixture bytes, temporary artifact directories, non-authoritative receipt serialization, parser/check mechanics already constrained by validation, or repeated command choreography.

## 11. Trade-offs and Failure Conditions

| Decision | Accepted cost | Fails if |
|---|---|---|
| Embedded UI in one binary | UI build must precede Go packaging | Runtime still depends on cwd or external UI files |
| Browser resolves route before async hydration | Slightly stricter route-state ownership | Any wrong first surface/title becomes visible |
| Immediate Inspector preview with independent enhancements | Preview and detail states coexist briefly | One failed/late request erases current readable state |
| OPML import-only plus JSON State portability | No OPML subscription export | Product exposes export/restoration or State grows beyond allowed fields |
| Go-owned security headers | Proxy cannot define competing application policy | UI breaks, values diverge through Caddy, or streaming/cancellation changes |
| Flat existing modules | Some files remain broad | Repair introduces layers or shared abstractions without current need |
| Case-local mutable browser-test state | More runtime setup per mutating case | Tests remain order-dependent or cleanup residue survives |
| Standard test evidence | Less custom normalization | Failures cannot identify affected test/resources without secrets |

## 12. Explicit Non-Goals

- User accounts, OAuth, per-agent authorization, or an agent registry.
- Vector search, embeddings, RAG, or a second database.
- OPML export, OPML restoration, sync, merge, conflict resolution, history, or portable receipts.
- Persistent jobs, queues, retry dashboards, command/activity ledgers, or test-only product reset APIs.
- Folders, tags, unread counts, archive bins, settings panels, source ordering, or a second URL intake field.
- New services, sidecars, DI containers, event buses, repository layers, plugin systems, or provider abstractions.
- Implementation-private algorithms, helper/function layouts, complete fixture bytes, temporary evidence layouts, or custom evidence serialization.

## 13. Planner Handoff

The planner must:

- retain one traceable implementation/acceptance path for every RF-BUG-001–010 requirement;
- assign each step to the owner and dependency direction in the architecture basis;
- keep code, focused tests, real-runtime acceptance, and documentation synchronized;
- separate local, container, and Tailnet closure so unpublished/deployed behavior is not claimed early;
- protect product code and canonical docs from test-harness concerns, and protect the harness from product-only reset/interception shortcuts;
- derive exact commands and file authority from the repository at planning time rather than copying stale orchestration from this document;
- leave implementation-stage details to the responsible implementation agent within the approved boundaries.

**Unresolved blockers:** None for pending-plan repair. Implementation remains blocked on completion and validation of that plan repair.
