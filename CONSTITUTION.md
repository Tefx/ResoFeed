# ResoFeed Constitution

## 1. Authority and Scope

This document defines repository-wide stable invariants for ResoFeed.

- All contributors and agents MUST treat this file as binding governance for stable cross-document constraints.
- `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/DESIGN.md`, `docs/PROMPTING_SYSTEM.md`, and contract documents MUST remain canonical for their owned implementation, product, design, prompting, schema, and current-detail domains.
- Conflicting documents MUST be fixed or deleted in the same change; if the correct owner or detail is unclear, implementation MUST stop and the implementer MUST ask before proceeding.
- This constitution MUST contain only durable constraints. Feature plans, rollout sequencing, and ephemeral UI choices MUST NOT be treated as constitutional law.

## 2. Runtime and Storage Dogmas

- ResoFeed MUST remain a single-tenant system.
- ResoFeed MUST ship as one deployable Go binary.
- The single binary MUST serve the web UI, JSON HTTP API, MCP Streamable HTTP surface, and background ingestion loop.
- SQLite with FTS5 MUST remain the only storage and retrieval substrate.
- SQLite MUST remain the durable source of truth and FTS5 MUST remain a rebuildable lexical index derived from canonical rows.
- The system MUST use lexical retrieval only and MUST NOT introduce vector databases, embeddings, RAG, semantic search, distributed caches, extra worker processes, sidecars, or additional deployable services.
- The LLM MUST operate only as a bounded JSON-in / JSON-out transformer.
- The LLM MUST NOT orchestrate product workflows, hold durable state, or write directly to the database.
- Backend product behavior MUST remain in the flat `internal/resofeed` package style with direct functions, explicit SQL, and explicit SQLite transactions.
- Java-style app/domain/service/repository packages, repository/service/domain abstraction layers, DI containers, event buses, and abstraction scaffolding MUST NOT be introduced.
- Runtime state changes MUST be coordinated through direct application logic and SQLite transactions, not through queues, plugin registries, or other indirection scaffolding.

## 3. Auth and Product Boundary Dogmas

- A single owner token MUST remain the universal delegation boundary.
- Every JSON HTTP API route and operation under `/api/*` MUST require owner-token authority, including read-only routes and operations.
- Every MCP request and session under `/mcp` MUST require owner-token authority, including read-only resources and tools.
- Only static web assets and public shell loading MAY remain publicly loadable when permitted by architecture; public asset loading MUST NOT weaken owner-token authority for `/api/*` or `/mcp`.
- Owner-token reset MUST remain an offline CLI-only operation and MUST NOT be exposed through HTTP, MCP, or UI flows.
- The system MUST NOT introduce accounts, OAuth, roles, teams, or profile-based authorization.
- `actor_id` MUST remain provenance and idempotency metadata only and MUST NOT become an authorization primitive.
- HTTP and MCP surfaces MUST expose the same product semantics and owner-visible operations, while transport-specific auth, idempotency, schema, metadata, and staged exposure details MUST remain governed by architecture.
- Agents MUST NOT receive privileged product concepts unavailable to the human owner.

## 4. Content Contract Invariants

- Generated content MUST be treated as a structured content contract, not as an untyped text blob.
- Source provenance fields and generated display fields MUST remain distinct.
- Source titles, source identifiers, and source URLs MUST preserve literal provenance and MUST NOT be rewritten as generated localization.
- Generated display content MUST support a separate localized title from the source title.
- Successful generated content MUST conform to the active content contract.
- Feed MUST remain the scan surface and Inspector MUST remain the structured reading surface.
- Exact generated-field visibility, layout, counts, sentence limits, and prompt/schema tuning MUST remain in `docs/DESIGN.md`, `docs/contracts/CONTENT_CONTRACT_REDESIGN.md`, `docs/PROMPTING_SYSTEM.md`, or successor active content contracts, not in this constitution.
- `core_insight` MUST retain its distinct compact-judgment role and MUST NOT be repurposed into `key_points` or any list field.
- Within generated-content prompting, user prompts and steering inputs MAY influence emphasis, source-backed fact selection, ordering, and judgment, but MUST NOT mutate schema, provenance rules, status semantics, or required-field invariants.

## 5. Product Primitive and Interaction Invariants

- Inspect, Resonate, and Steer MUST remain the only primary user-visible primitives.
- Inspect MUST remain a deliberate attention signal and MUST NOT be inferred from dwell time, viewport tracking, or scroll-depth tracking.
- Silent agent evaluation MUST NOT count as Inspect.
- Resonate MUST remain the primary durable positive signal, MUST remain reversible, and MUST NOT become agreement, pinning, or inbox-management state.
- Steer MUST remain natural-language correction and MUST NOT become a rule-builder, weight-editor, or settings-dashboard workflow.
- Delegated-agent mutating actions, especially Steer, MUST remain visibly attributable, understandable, and human-correctable through the same owner-visible product semantics available to the human owner.
- Delegated-agent steering transparency MUST NOT introduce activity ledgers, management dashboards, per-agent registries, roles, moderation consoles, or any separate agent-management product surface.
- For delegated-agent mutating actions, `actor_id` MUST remain provenance and idempotency metadata only and MUST NOT become an authorization primitive.
- The product MUST NOT add inbox-zero mechanics such as unread queues, unread counts, numeric inbox indicators, mark-all-read flows, archive bins, or guilt-inducing backlog counters.
- The product MUST NOT add folders, tags, tag trees, source category management, isolated filter views, holding queues, or moderation consoles.
- The product MUST preserve user sovereignty and MUST NOT add hidden rate limiters, auto-collapsing spammer behavior, or invisible smart noise reduction outside explicit Steer input or owner action.
- Duplicate or story handling MUST reduce duplicate attention waste: repeated versions of the same story MUST NOT appear as separate equal-priority items, while the system MUST preserve transparent access to every original source item and provenance record and MUST NOT perform hidden source suppression, spam filtering, or invisible editorial control.

## 6. Localization and Rendering Invariants

- Generated and user-facing content MUST follow the active localization contract.
- Source and provenance literals, URLs, and stable source names MUST remain unchanged.
- Current language choices MUST be governed by `docs/PRD.md`, `docs/DESIGN.md`, `docs/PROMPTING_SYSTEM.md`, and active content contracts.
- Feed rows MUST remain compact scanning surfaces.
- Inspector MUST remain the structured reading surface for expanded generated content.
- Feed and Inspector MUST remain separate surfaces; feed rows MUST NOT become miniature article cards or structured list containers.
- Desktop split scroll MUST remain layout containment only and MUST NOT become persisted behavioral state or analytics input.
- The UI MUST remain dense, operational, and tool-like and MUST NOT introduce onboarding wizards, celebratory empty states, decorative AI chrome, or settings-heavy control surfaces.

## 7. State Portability and Source-Ledger Invariants

- Portable state MUST include only active sources, active steering rules, and currently resonated items.
- JSON state bundles MUST remain the only complete state export/import and restoration path.
- State import MUST validate the full bundle before mutation and MUST apply replacement in a single SQLite transaction.
- State import MUST NOT perform partial restore.
- Processing language, owner-token material, diagnostics, agent receipts, current-operation snapshots, and other runtime metadata MUST NOT become portable state.
- OPML MUST remain source-subscription import only under the current authoritative PRD, DESIGN, ARCHITECTURE, or successor contract unless a future authoritative contract explicitly adds export; OPML MUST never be complete state restoration.
- OPML MUST NOT carry runtime metadata, generated content, steering rules, resonance state, secrets, diagnostics, or complete state restoration data.
- Source addition MUST remain available through Steer URL submission; the product MUST NOT require a separate add-source wizard or duplicate source-entry workflow.

## 8. Re-Ingest, Reprocess, and Persistence Invariants

- Re-ingest failure MUST be recorded as attempt state, not as destructive replacement of current usable content.
- Failed re-ingest attempts MUST NOT overwrite valid persisted titles, summaries, insights, key points, or other current generated content.
- Successful re-ingest MUST replace generated content atomically.
- Failed item re-ingest and failed candidate output MUST NOT pollute persisted content, search indexes, or transport outputs.
- Search indexes and transport outputs MUST remain aligned with currently persisted content except during architecture-defined active reprocess windows before the final FTS rebuild and during stale-FTS recovery windows after failed or crashed library reprocess; such windows MUST be explicitly diagnosable through the operational diagnostic surface and MUST be recoverable by the architecture-defined rerun path.
- Library reprocess and item re-ingest MUST remain explicit, owner-authorized operations and MUST NOT create durable jobs, queues, histories, or reusable prompt/model preference state.

## 9. Operational Safety and Failure Invariants

- LLM integration MUST remain a single bounded stateless JSON transformer/provider adapter.
- LLM integration MUST NOT become orchestration authority, durable-state authority, storage authority, or workflow authority.
- LLM vendor selection MUST remain governed by architecture, configuration, and current implementation documents, not this constitution.
- LLM secrets MUST remain runtime inputs only and MUST NOT be accepted by CLI flag, persisted, exported, logged, or committed.
- Durable storage of owner-token material MUST contain only hash/material safe for verification.
- Plaintext owner tokens MUST NOT be persisted, exported, logged, or exposed except through the intentional first-run/reset delivery path defined by architecture.
- LLM provider secrets missing from recognized runtime sources MUST be non-fatal: startup MUST continue, the server MUST bind, and provider-backed operations MUST remain unavailable rather than entering degraded hidden modes.
- Explicit empty or whitespace-only recognized LLM secret values MUST remain startup-fatal.
- Live provider, model-list, and authentication failures MUST be treated as runtime/provider-unavailable states unless architecture explicitly defines additional startup-fatal syntax validation.
- Runtime/provider failure classification MUST remain application-owned; the model MUST NOT self-classify provider, transport, or persistence failures.
- The product MUST expose terse operational diagnostics and MUST NOT turn failure handling into dashboards, queues, or apologetic conversational UI.

## 10. Concurrency and Idempotency Invariants

- Mutating operations MUST be safe under retry and idempotent replay boundaries.
- Background ingest, manual ingest, source fetch, and library/item reprocess operations MUST NOT overlap when they share the guarded execution class.
- Any mutation affecting generated content language, search indexing language, processing language, or localization contract application MUST be guarded against ingest, reprocess, fetch, and re-ingest conflicts.
- Conflicting guarded operations MUST fail fast with conflict semantics and MUST NOT create persistent pending work.
- Current-operation reporting MUST remain ephemeral contextual state and MUST NOT become a durable activity ledger.

## 11. Forbidden Drift

- The project MUST NOT collapse source title and localized display title back into one overloaded field.
- The project MUST NOT render model-authored Markdown or HTML as a substitute for structured content fields.
- The project MUST NOT expose agent-only content concepts unavailable to human users.
- The project MUST NOT reintroduce destructive failure paths that degrade existing readable content after processing errors.
- The project MUST NOT add multi-tenant SaaS features, per-agent registries, delivery-channel ownership, moderation consoles, source category systems, holding queues, isolated filter products, folders, tags, tag trees, sync/merge systems, state mergers, conflict resolvers, command history, or reading history.
