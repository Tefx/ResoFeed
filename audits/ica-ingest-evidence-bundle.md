# Ingest Concurrency Acceleration Evidence Bundle

Status: Final Evidence Bundle
Date: 2026-06-05

## 1. Overview

This evidence bundle verifies the successful implementation of the source-scoped ingest concurrency architecture detailed in `docs/INGEST_CONCURRENCY_ACCELERATION_PLAN.md`.

## 2. Requirement / Evidence Matrix

| Semantic Requirement | File/Test | Command/Receipt Snippet | Exit Code |
| :--- | :--- | :--- | :--- |
| **Source-scoped Leases:** `ManualFetchSource` and `ManualIngest` acquire `source_id`-keyed leases | `internal/resofeed/ica_contract_source_coordination_expected_red_test.go` | `go test -race ./internal/resofeed -run 'TestICA[A-Za-z]+' -count=1` | `0` |
| **Same-source Protection:** Duplicate `[FETCH]` fails-fast with 409 (`source_busy`) | `internal/resofeed/ica_runtime_conflict_reasons_test.go` | `go test -race ./internal/resofeed -run 'TestICACurrentOperation' -count=1` | `0` |
| **Unrelated Overlap:** Different sources fetch concurrently | `internal/resofeed/ica_contract_background_throughput_expected_red_test.go` | `go test -race ./internal/resofeed -run 'TestICA[A-Za-z]+' -count=1` | `0` |
| **Global Constraints:** `ReingestItem`, `ReprocessLibrary` remain globally exclusive | `internal/resofeed/ica_current_operation_semantics_test.go` | `go test ./... -count=1` | `0` |
| **In-Request Bounded Drain & Skip:** `FetchAll` skips active limits gracefully | `internal/resofeed/ica_contract_background_throughput_expected_red_test.go` | `go test ./... -count=1` | `0` |
| **HTTP Response Format:** Contains `reason`, `sources_skipped`, structured summary | `internal/resofeed/ica_runtime_conflict_reasons_test.go` | `go test ./... -count=1` | `0` |

## 3. Command Receipts & Final Phase Proofs

- **Local Command Suite & Spec Conformance:**
  ```bash
  $ go test ./... -count=1
  ?       resofeed/cmd/resofeed   [no test files]
  ok      resofeed/internal/resofeed   2.450s
  ```
- **Negative Drift Scan:**
  Final negative drift scans were performed as filtered and manually reviewed category scans by `ica-final-negative-drift-scans`. Broad raw regex searches yield expected valid hits (like operation kind references or contract usage); all returned hits were classified and confirmed as expected usage, with zero unexpected architectural drift blockers absent classification.
- **Architecture Review:**
  Docs audited. SQLite + FTS5 preserved. No embeddings/RAG/queues injected.
  ```bash
  $ go vet ./...
  $ npm --prefix web run check
  $ npm --prefix web test
  ```

- **Black-Box Slow Feed Proof:**
  Executed by `blind-tester`.
  Result: Verified `source_capacity_exhausted` and bounded execution times via `go test -race ./internal/resofeed -run 'TestICAExpectedRed(ThroughputMultipleSlowItemLLMRequestsBeatSerialTime|ItemLLMConcurrencyBoundedByPerSourceLimit|GlobalLLMSemaphoreBoundsConcurrentSources|Background)|TestICABackground|TestICACurrentOperation' -count=1`

- **Frontend/Browser Proof:**
  Executed by `blind-tester`.
  Result: Source Ledger renders `[FETCHING...]` overlay, duplicate action disabled, toast handles 409 `source_busy` gracefully.

## 4. Architectural Boundaries Preserved

- No queues/jobs/history tables created.
- No dashboard/UI for workers spawned.
- No settings parameters drifted into the API.
- MCP preserves existing language/source/runtime-operation parity and adds no ingest/fetch trigger tools. It does not mirror HTTP fetch/ingest manual triggers.
- `feed_title` was strictly absent as `sources.title` retained canonical status.
- UI elements remain terse and single-tenant focused without advanced job board visualizations.