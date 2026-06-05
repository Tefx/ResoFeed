# Ingest Concurrency Acceleration Implementation Plan

Status: Proposed target architecture for the next ResoFeed ingest acceleration change.
Scope: runtime processing-language correctness, source-scoped ingest/fetch coordination, and large-library ingest throughput.
Non-scope: durable queues, worker processes, sidecars, job dashboards, settings dashboards, vector/semantic retrieval, provider abstraction layers, or multi-user operation management.

## Original Problems

1. The owner observed that the first automatic ingest after fetch may appear to produce English output, while explicit reprocessing later follows the selected language.
2. Manual row `[FETCH]`, `[RUN INGEST]`, and background ingest use inconsistent concurrency semantics: row fetch can be source-scoped, but global ingest/background ingest can still block unrelated source work.
3. Large libraries ingest too slowly because active sources are processed serially, and each source processes new items serially.

## Evidence From Current Code

- `internal/resofeed/ingest.go` reads the persisted runtime processing language inside `ingestSource` before item processing and passes it as `TargetLanguage` to the LLM summary input. This supports the backend language contract for both manual source fetch and ingest passes.
- `ingestOnceUnlocked` currently loops active sources one by one and calls `ingestSource` serially.
- `ingestSource` currently loops feed entries one by one, builds one item at a time, and performs one `SummarizeItem` call per item.
- Existing source-title/concurrency work already permits concurrent manual source fetches when source ids differ and forbids same-source duplicate fetches.

## Architecture Basis

```yaml
architecture_basis:
  system_layers:
    - layer: browser_spa
      responsibility: "Expose processing-language control, Source Ledger row fetch, global RUN INGEST, and terse current-operation status without job/dashboard UI."
    - layer: http_api
      responsibility: "Authenticate owner token, validate strict request bodies, call shared runtime operations, and return immediate source-scoped results/conflicts."
    - layer: mcp_surface
      responsibility: "Expose language, source-listing, and runtime-operation semantics already present in MCP; ingest/fetch triggers remain HTTP/UI-only unless a later MCP contract explicitly adds tools."
    - layer: resofeed_core
      responsibility: "Own source-scoped coordination, bounded ingest concurrency, language snapshot semantics, source/item processing, and SQLite mutations."
    - layer: sqlite
      responsibility: "Persist current source/item/runtime metadata state only; no ingest work queues, job rows, or operation history."
    - layer: external_io
      responsibility: "RSS/Atom feeds, article fetches, and OpenRouter JSON transformations; never durable state ownership."

  source_of_truth_matrix:
    processing_language: "runtime_metadata.processing_language; read at the start of each source attempt and passed to all item LLM calls for that source."
    source_lease_state: "process memory inside internal/resofeed ingest coordination; source-scoped, non-durable, cleared on completion or process exit."
    global_exclusive_state: "process memory only for operations that must see a stable whole-library view: runtime language write, library reprocess, item re-ingest unless explicitly narrowed later, and short unrepresented state import/restore."
    source_items: "items table plus search_fts derived rows; each item write remains authoritative when committed."
    current_operation: "best-effort process-memory snapshot for UI/MCP conflict explanation; not a ledger or progress store."

  service_catalog:
    set_processing_language: "Short global write; blocked while any source/global operation is active to prevent mixed-language batches."
    manual_source_fetch: "Acquire one source lease; same-source duplicate returns 409; unrelated sources may proceed."
    manual_ingest: "Attempt every idle active source selected at run start through a bounded in-request worker batch; each source attempt uses the same source lease path as manual fetch."
    background_ingest: "Periodic bounded in-request batch over active sources; skips already-busy sources and exits when the selected idle source list is drained."
    item_processing: "Per-source bounded processing of new items, with global LLM concurrency protection and per-item failure isolation."
    reprocess_library: "Explicit global operation; remains mutually exclusive with all source leases and other global operations."

  runtime_contract:
    default_fast_concurrency:
      source_concurrency: 8
      item_concurrency_per_source: 4
      llm_global_concurrency: 16
    same_source_conflict: "A second in-flight source attempt for the same source returns/skips as conflict without queueing."
    unrelated_source_overlap: "Different source ids may fetch/ingest concurrently until bounded concurrency is exhausted."
    background_skip: "A background tick skips already-busy sources, drains the selected idle source list through bounded workers, and exits when that in-request batch finishes; it does not persist work after the tick returns."
    all_source_capacity_policy: "For all-source manual/background runs, source_concurrency limits simultaneous source attempts, not the total number of idle sources attempted. The run eventually attempts every idle active source selected at run start through its bounded in-request workers. source_capacity_exhausted applies only when external active work leaves no source slot available for the run/candidate, not to idle sources merely waiting behind the run's own worker limit."
    manual_ingest_conflict_policy: "Manual RUN INGEST may start while unrelated row fetches are active; busy/capacity-unavailable sources are reported with source_busy or source_capacity_exhausted errors and sources_skipped, not persisted or queued after the response."
    language_snapshot: "The processing language used for a source attempt is captured once at source start. Language writes are blocked during active work so one run cannot mix old/new language unexpectedly."

  state_strata:
    durable_current_state: ["sources", "items", "item_state", "steer_rules", "runtime_metadata", "search_fts"]
    process_ephemeral_state: ["source leases", "global operation guard", "bounded worker semaphores", "current operation snapshot"]
    forbidden_state: ["job queue", "task table", "operation history", "activity ledger", "retry dashboard state", "portable operation receipts"]

  transport_boundary_rules:
    - "HTTP owns manual ingest/fetch triggers in this plan; MCP mirrors language/source-listing/runtime-operation semantics only for operations it already exposes."
    - "Manual ingest/fetch request body remains exactly `{}` with no idempotency key and no query parameters."
    - "Conflict responses remain immediate 409 for user-triggered same-source or global-exclusive conflicts."
    - "Background work never returns user-visible queued/pending state because it has no request response surface."
    - "No API or MCP field named `feed_title` is introduced; source display remains canonical `sources.title`."

  cross_cutting_governance:
    registries:
      - name: "source lease map"
        owner_module: "internal/resofeed/ingest.go or a small adjacent ingest_coordinator.go file in the same package"
        write_policy: "only acquire/release helpers mutate it under mutex; no SQLite persistence"
      - name: "global operation guard"
        owner_module: "internal/resofeed current operation / ingest coordination code"
        write_policy: "only true global operations acquire it"
    lifecycle_ordering:
      startup: "No new service startup; semaphores/coordinator are process-local values initialized with defaults before HTTP/background use."
      shutdown: "Context cancellation stops workers; leases release through defer/recover paths."
    coordination_mechanisms:
      - "bounded in-memory source worker pool"
      - "bounded in-memory per-source item workers"
      - "global in-memory LLM semaphore"
      - "direct function calls only"
    wiring_strategy: "Pass concurrency limits through IngestConfig; do not add DI containers or plugin registries."
    governance_owner: "internal/resofeed owns runtime coordination; cmd/resofeed only wires config defaults."

  shared_abstractions:
    shared_types:
      - name: "IngestConfig concurrency fields"
        owner_module: "internal/resofeed/ingest.go"
        consumers: ["RunIngestLoop", "ManualIngest", "ManualFetchSource", "HTTP wiring"]
        rationale: "All entry points must share the same limits; scattered constants would make behavior inconsistent."
      - name: "IngestRunResult / IngestErrorDetail"
        owner_module: "internal/resofeed ingest result contract"
        consumers: ["HTTP", "tests", "ingest runtime", "Source Ledger UI"]
        rationale: "Manual ingest and source fetch must converge on the authoritative result/error contract with `sources_attempted`, `sources_skipped`, `source_busy`, and `source_capacity_exhausted`; any legacy `ManualFetchResult` / `ManualFetchSourceError` structs must be evolved or replaced to satisfy this contract. This plan does not add MCP ingest/fetch tools."
    shared_protocols: "N/A: Go code should use direct concrete functions; no interface abstraction is needed for one runtime and one database."
    shared_utilities:
      - name: "source lease acquire/release helper"
        owner_module: "internal/resofeed ingest coordination code"
        consumers: ["manual source fetch", "manual ingest source attempt", "background ingest source attempt"]
        rationale: "Same-source exclusion must be identical across all source-entry paths."
    decision: "Share only the concurrency guard/result pieces used by multiple entry points; keep item processing details local to ingest implementation."

  ux_surfaces:
    - surface: "Source Ledger"
      scope: "Row `[FETCH]`, global `[RUN INGEST]`, row-scoped `[FETCHING...]`, terse skipped/conflict summaries, no progress bars or job lists."
    - surface: "RESOFEED utility menu"
      scope: "Processing-language control and conflict explanation when language/reprocess is blocked."
    - surface: "/doctor and current operation"
      scope: "Raw current process status only, no historical dashboard."

  runtime_surfaces:
    - surface: "web app"
      launch_or_entrypoint: "resofeed serve"
      minimum_liveness_proof: "browser Source Ledger shows multiple row fetch states or RUN INGEST summary without queue/dashboard UI."
    - surface: "HTTP API"
      launch_or_entrypoint: "POST /api/ingest and POST /api/sources/{id}/fetch"
      minimum_liveness_proof: "black-box slow-feed test proves unrelated sources overlap and same-source duplicate conflicts."
    - surface: "background ingest"
      launch_or_entrypoint: "RunIngestLoop tick inside resofeed serve"
      minimum_liveness_proof: "fixture proves busy source is skipped while idle source starts."

  module_split_recommendations:
    - module: "internal/resofeed/ingest.go"
      owner: "backend implementer"
      reason_to_change: "Ingest flow, source/item processing, and result aggregation."
      dependency_direction: "May call coordinator helpers; must not depend on HTTP/MCP."
    - module: "internal/resofeed/ingest_coordinator.go"
      owner: "backend implementer"
      reason_to_change: "Small process-local source/global lease bookkeeping and semaphores."
      dependency_direction: "May depend on context/sync/time and existing current-operation types; must not depend on HTTP/MCP or SQLite schema."
    - module: "internal/resofeed/http.go"
      owner: "backend implementer"
      reason_to_change: "Surface HTTP conflict/result mapping only."
      dependency_direction: "Calls internal/resofeed runtime operations; owns no coordination state."
    - module: "web/src/routes/components/SourceLedger.svelte"
      owner: "frontend implementer"
      reason_to_change: "Render row/global running states and terse skipped/conflict counts without dashboard drift."
      dependency_direction: "Consumes HTTP responses only."

  open_questions: []
  readiness: "READY_FOR_IMPLEMENTATION_PLANNING"
```

## Architectural Decisions

### Decision 1: Source-scoped coordination replaces global ingest/fetch exclusion

Use a process-local source lease map keyed by source id. Manual source fetch, manual ingest source attempts, and background ingest source attempts all acquire the same source lease before fetching a source.

Rationale: the current global ingest guard makes unrelated feeds block each other. Source identity is the smallest safe unit because source title updates, first-fetch limits, and feed fetch status are source-local. This preserves same-source safety while allowing unrelated sources to progress.

Trade-off: result aggregation and current-operation reporting become slightly more complex. The accepted cost is small compared with the large-library throughput gain.

Fails if source processing begins to mutate global state before per-source work completes. If that happens, the global mutation must be moved outside worker bodies or protected separately.

### Decision 2: Bounded concurrency, not unbounded goroutines

Use explicit limits:

- `source_concurrency`: default `8`
- `item_concurrency_per_source`: default `4`
- `llm_global_concurrency`: default `16`

Rationale: the owner wants fast behavior and has no known OpenRouter limit, but unbounded network/LLM concurrency can create provider errors, SQLite pressure, and poor local host behavior.

Trade-off: peak speed is capped. The cap makes failures predictable and testable.

Fails if the selected deployment host or OpenRouter account cannot sustain these defaults. In that case, lower defaults or expose minimal CLI/env configuration without creating a settings dashboard.

### Decision 3: Keep one item per LLM request for the first acceleration pass

Do not batch multiple articles into one LLM request in this phase.

Rationale: current persistence, validation, status, provenance, and failure isolation are item-scoped. Multi-article JSON responses would make one malformed output endanger multiple items and complicate partial success semantics.

Trade-off: token overhead remains higher than micro-batching. The simpler design is safer and should already produce large speedups from concurrency.

Fails if provider-side rate/latency makes per-item requests insufficient after bounded concurrency is implemented and measured. If so, design a later micro-batch contract with explicit partial-failure semantics.

### Decision 4: Language writes remain globally blocked while work is active

A source attempt captures the processing language once when that source starts. `PUT /api/runtime/language` remains blocked while any source or global operation is active.

Rationale: this prevents one manual/background run from mixing English and Chinese across sources or items because the owner changed language mid-run. It also addresses the observed language concern without adding new durable state.

Trade-off: language changes wait for active ingest/fetch work to finish. This is acceptable because language is a global pipeline state, not a per-item display toggle.

Fails if users require per-source/per-item language overrides, which is outside current product scope.

## Implementation Phases

### Phase 1: Expected-red tests and current behavior proof

Add tests before implementation:

- backend language parity:
  - set runtime language to `zh`;
  - trigger `ManualFetchSource` and `IngestOnce`;
  - assert the fake LLM receives `TargetLanguage=zh`;
  - assert persisted generated fields come from the Chinese fixture output.
- source-scoped coordination:
  - slow source A row fetch in flight;
  - slow source B row fetch starts and overlaps;
  - second fetch for source A returns `409 conflict`;
  - when all source-concurrency slots are occupied by unrelated work, a manual row fetch returns `409 conflict` with reason `source_capacity_exhausted` and no queued work;
  - `[RUN INGEST]` while source A is busy starts idle source B and reports source A as `source_busy`/`sources_skipped`, without queueing;
  - `[RUN INGEST]` under external source-capacity pressure drains all selected idle sources through any slot it owns and reports only externally blocked source starts as `source_capacity_exhausted`/`sources_skipped`.
- background behavior:
  - background tick while source A is busy skips A and fetches idle B;
  - background tick under external source-capacity pressure drains all selected idle sources through any slot it owns and skips only externally capacity-unavailable starts without queueing after the tick;
  - no durable queue/job/operation-history schema appears.
- throughput behavior:
  - multiple slow source fixtures complete faster than serial time under `source_concurrency > 1`;
  - multiple slow item/LLM fixtures inside one source complete faster than serial time under `item_concurrency_per_source > 1`.

### Phase 2: Coordinator extraction

Introduce a small process-local coordinator in `internal/resofeed`, preferably `ingest_coordinator.go` if it keeps `ingest.go` readable.

Required contract:

- acquire source lease by source id;
- reject same-source duplicate with existing conflict shape;
- allow unrelated source leases until source concurrency capacity is reached;
- when source capacity is reached by external active work, manual source fetch returns `409 conflict` with reason `source_capacity_exhausted`; manual/background all-source ingest drains selected idle sources through bounded in-request workers and skips only externally capacity-unavailable source starts with `source_capacity_exhausted` plus `sources_skipped`;
- acquire global-exclusive operation for language write, library reprocess, short unrepresented state import/restore, and any operation still intentionally global; state import/restore must not add a new current-operation kind or dashboard surface;
- global-exclusive operation conflicts with any active source lease;
- release is guaranteed through `defer` and panic/recover paths;
- state is memory-only and never exported or written to SQLite.

### Phase 3: Manual fetch and manual ingest semantics

- `ManualFetchSource` uses the source lease path.
- `ManualIngest` reads active sources, skips already-busy source ids, then drains the remaining selected idle sources through a bounded in-request worker batch.
- `source_concurrency` limits simultaneous source attempts, not the total number of selected idle sources attempted by that run.
- A busy source contributes a source-level `source_busy` skipped entry; a source that cannot start because external active source work leaves no source slot available contributes `source_capacity_exhausted`. Neither fails the whole run and neither creates durable or post-response queued work.
- Result counters define skipped sources explicitly: `sources_attempted` counts only source attempts that started, `sources_skipped` counts busy or capacity-unavailable sources skipped before fetch, `sources_failed` counts started attempts that failed, and `errors[]` carries `source_busy` or `source_capacity_exhausted` entries for skipped sources.

### Phase 4: Background ingest semantics

- `RunIngestLoop` still performs an immediate first pass and then interval ticks.
- Each pass uses the same bounded source attempt batch as manual ingest, but conflict/busy/capacity-unavailable sources are skipped silently or recorded only in ephemeral diagnostics.
- A background tick never waits for a busy source lease or source-capacity slot to become free and never enqueues delayed work.

### Phase 5: Item-level concurrency

Inside a source attempt:

- fetch and parse the feed once;
- apply first-fetch limit once;
- filter already-existing items before worker dispatch;
- process new items with bounded item workers;
- acquire the global LLM semaphore only around the model request, not around feed/article fetch or SQLite writes;
- upsert each item independently;
- aggregate item-level failures into the source result without deleting or hiding other items.

SQLite rule: keep network and LLM calls outside write transactions. Transactions should be short and per committed item/source status update unless an existing helper already guarantees this.

### Phase 6: UI and UX proof

- Source Ledger can show more than one row `[FETCHING...]` when unrelated rows are active.
- `[RUN INGEST]` may run while unrelated row fetches are active, but it must show terse skipped/conflict counts for busy or capacity-unavailable sources.
- No spinners, progress bars, queue labels, job lists, retry panels, settings sliders, or operation history.
- Language control shows conflict only while active work blocks the language write.

### Phase 7: Runtime gates

Required gates:

- `go test ./...`
- `go test -race ./internal/resofeed` or focused race tests around coordinator/source leases
- frontend check/test/build if Source Ledger UI changes
- black-box slow-feed HTTP proof:
  - unrelated source fetch overlap;
  - same-source duplicate 409;
  - manual source fetch capacity exhaustion returns 409 with reason `source_capacity_exhausted`;
  - manual ingest overlaps idle sources while one row fetch is busy and reports `source_busy`/`sources_skipped`;
  - manual ingest under external source-capacity pressure drains selected idle sources through owned slots and reports only externally blocked starts as `source_capacity_exhausted`/`sources_skipped`;
  - background tick skips busy or externally capacity-unavailable sources and drains selected idle sources through bounded workers;
  - Chinese language setting reaches first fetch/ingest LLM request;
  - `POST /api/state/import` during active source/global work returns `409` with reason `global_operation_running`, without adding `state_import`/`state_restore` current-operation kinds, dashboards, queues, or history.
- schema negative proof: no new SQLite tables/columns for jobs, queues, operation history, workers, or dashboards.

## Contract Changes From Prior Source-Title Concurrency Work

This plan preserves:

- canonical `sources.title` with no `feed_title` field;
- different-source manual row fetch overlap;
- same-source duplicate 409;
- no queues/jobs/history/dashboards;
- terse Source Ledger bracket actions.

This plan intentionally supersedes only the old global mutual-exclusion rule that forced background ingest and `[RUN INGEST]` to conflict with every manual source fetch. The new rule is source-scoped: only the same source conflicts; true global operations remain globally exclusive.

## Implementation Handoff

Suggested implementation order:

1. Add expected-red tests for language, source overlap, background skip, and throughput.
2. Add source/global coordinator helpers and wire existing row fetch through them.
3. Convert manual ingest/background ingest into bounded source-attempt batches.
4. Add item-level bounded processing and global LLM semaphore.
5. Update Source Ledger UI for multiple row-running states and skipped-source summaries.
6. Run gates and black-box runtime proof.

Watch for:

- Do not hold SQLite transactions during HTTP/article/LLM calls.
- Do not turn busy skipped sources into queued retry work.
- Do not expose raw OpenRouter errors, secrets, prompt text, or provider internals.
- Do not introduce frameworks or new package layers; keep changes flat in `internal/resofeed`.

Open questions: none from the owner. Defaults selected for fast mode: source `8`, per-source items `4`, global LLM `16`.
