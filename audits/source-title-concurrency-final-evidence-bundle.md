# Source Title Concurrency Final Evidence Bundle

## Scope
Final-gate remediation for STC blockers B1/B2/B3. Contract preserved; no plan or orchestrator state modified.

## Authority Receipts
- `docs/contracts/SOURCE_TITLE_CONCURRENCY_TRACEABILITY_MATRIX.md`: STC-R2 requires RSS/Atom non-empty feed titles to update canonical `sources.title` and increment `revision`; STC-R1/R5 forbid `feed_title`; STC-R3/R4 require different-source concurrency, same-source `409`, no queues/jobs/durable progress; STC-R6/R7 bind Source Ledger UI to backend `source.title`, `[FETCHING...]`, superseded `[RUN INGEST]` disablement evidence, and no dashboard drift.
- `docs/ARCHITECTURE.md`: §4.1 makes `sources.title` canonical and says successful RSS/Atom fetch with non-empty title increments `revision`; §5.1 requires parsed feed metadata updates, bounded in-process source concurrency, same-source conflict, skipped background ticks, and no persistent queues/job tables/ledgers/schedulers; §10 verification additions require source title/revision updates, no `feed_title`, HTTP/MCP parity, and concurrent-source proof.
- `docs/DESIGN.md`: Source Ledger row source name is backend `source.title`; manual `[FETCH]` and `[RUN INGEST]` are immediate operations, not jobs; different rows may show `[FETCHING...]` concurrently; original STC evidence superseded by ingest concurrency acceleration: `[RUN INGEST]` remains available during unrelated row fetch and skips busy sources with terse summaries; disabled only for true global-exclusive operations or when the ingest action itself is running; no progress bars/spinners/job lists/queue labels/retry panels/operation history.
- `CONSTITUTION.md`: one Go binary, SQLite+FTS only, flat `internal/resofeed` direct SQL/functions; no workers/sidecars/event buses/DI/repository scaffolding; portable state excludes runtime/operation history; guarded operations fail fast without persistent pending work; no folders/tags/queues/sync/command/reading history.
- `internal/resofeed/ingest.go`: `updateSourceFetch` was the implementation locus; prior non-empty-title path double-bumped with `revision = revision + case when title <> ? then 2 else 1 end`.
- `internal/resofeed/stc_backend_expected_red_test.go`: backend expected-red STC tests already covered RSS/Atom/blank fixtures, HTTP/MCP no-`feed_title`, source concurrency, same-source conflict, global ingest conflict, and forbidden durable artifacts.

## B1 Exact-Once Revision Closure
- Implementation: changed non-empty parsed-title `update sources` SQL to `revision = revision + 1` while still updating canonical `title`, `last_fetch_*`, and preserving blank-title branch behavior (`last_fetch_*`, `revision + 1`, prior title unchanged).
- Test strengthening: `TestSTCExpectedRedSourceTitleRevisionAndTransportContracts` now asserts exact RSS seed `10 -> 11`, Atom seed `20 -> 21`, and response revisions match exact-once values. Blank-title fixture preserves `Existing Blank Fallback` with seed `10 -> 11` status-bookkeeping behavior.
- Compatibility support: fake ingest test driver now derives source id from final SQL arg so existing non-SQLite ingest regression tests match the corrected SQL shape.

### Backend Command Receipts
```text
$ go test ./internal/resofeed -run 'TestSTCExpectedRedSourceTitleRevisionAndTransportContracts' -count=1 -v
=== RUN   TestSTCExpectedRedSourceTitleRevisionAndTransportContracts
=== RUN   TestSTCExpectedRedSourceTitleRevisionAndTransportContracts/HTTP_source_listing_exposes_title_only
=== RUN   TestSTCExpectedRedSourceTitleRevisionAndTransportContracts/MCP_source_listing_exposes_title_only
--- PASS: TestSTCExpectedRedSourceTitleRevisionAndTransportContracts (0.02s)
    --- PASS: TestSTCExpectedRedSourceTitleRevisionAndTransportContracts/HTTP_source_listing_exposes_title_only (0.00s)
    --- PASS: TestSTCExpectedRedSourceTitleRevisionAndTransportContracts/MCP_source_listing_exposes_title_only (0.00s)
PASS
ok  	resofeed/internal/resofeed	0.475s
```

```text
$ go test ./internal/resofeed -run 'TestSTCExpectedRed|TestManual|TestMCP|TestSource|TestIngest' -count=1 -v
... PASS lines included STC exact title/revision, different-source overlap, same-source conflict, no feed_title storage/aliases, no durable queue/job/activity/worker/scheduler drift, global/manual/background conflict/skip, manual fetch contract, MCP resource/tool parity ...
PASS
ok  	resofeed/internal/resofeed	0.371s
```

```text
$ go test ./...
?   	resofeed/cmd/resofeed	[no test files]
ok  	resofeed/internal/resofeed	1.458s
```

## B2 Phase-Gate and Final Spec Conformance Receipts
- Phase-gate receipts included here: source title/revision exact-once proof, HTTP/MCP no-`feed_title` proof, source fetch concurrency/conflict proof, global/background conflict/skip proof, durable artifact negative proof, frontend Source Ledger runtime proof.
- Final spec conformance: accepted strict STC contract preserved; no alternate `feed_title`; no new queue/job/dashboard/progress-history/source-category surface; no completed plan state changed.
- Evidence bundle path: `audits/source-title-concurrency-final-evidence-bundle.md`.

## B3 Frontend Executable Proof
```text
$ test -d web/node_modules && echo 'web/node_modules present' || echo 'web/node_modules missing'
web/node_modules missing
```

```text
$ npm --prefix web ci
added 150 packages, and audited 151 packages in 1s
25 packages are looking for funding
3 low severity vulnerabilities
```

```text
$ npm --prefix web run check
> resofeed-web@0.2.0 check
> svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: .../web
Getting Svelte diagnostics...
svelte-check found 0 errors and 0 warnings
```

```text
$ npm --prefix web run test:render -- src/routes/components/__tests__/source-title-concurrency.expected-red.test.ts
> resofeed-web@0.2.0 test:render
> vitest run src/routes/components/__tests__/source-title-concurrency.expected-red.test.ts
Test Files  1 passed (1)
Tests  4 passed (4)
```

## Negative Drift Scan
```text
$ python3 <production-negative-scan>
-- feed_title production scan --
NO_MATCHES
-- forbidden route-name scan --
NO_MATCHES
-- forbidden source-ledger UI drift token scan --
NO_MATCHES
```

## Deviation Records
- type: contract_preserving_test_strengthening
  artifact: `internal/resofeed/stc_backend_expected_red_test.go`
  what_changed: replaced weak relative revision assertion with exact RSS seed `10 -> 11`, exact Atom seed `20 -> 21`, response revision assertions, and explicit blank-title preservation/status-bookkeeping assertion.
  why: final gate B1 found exact-once contract violation not caught by the prior relative assertion.
  impact: strengthens protected expected-red/green coverage without weakening contract or deleting fixtures.
- type: test_harness_alignment
  artifact: `internal/resofeed/ingest_gemini_test.go`
  what_changed: fake SQL driver reads source id from final arg for non-empty title update SQL.
  why: implementation SQL no longer includes duplicate fetched-title comparison arg after removing double-bump logic.
  impact: keeps existing non-SQLite ingest regression harness aligned with corrected SQL shape; no product behavior change.

## Modified Artifacts
- `internal/resofeed/ingest.go`
- `internal/resofeed/stc_backend_expected_red_test.go`
- `internal/resofeed/ingest_gemini_test.go`
- `audits/source-title-concurrency-final-evidence-bundle.md`
