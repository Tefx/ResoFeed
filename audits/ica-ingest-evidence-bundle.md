# Ingest Concurrency Acceleration Evidence Bundle

Status: Final Evidence Bundle
Date: 2026-06-05

## 1. Overview

This evidence bundle verifies the successful implementation of the source-scoped ingest concurrency architecture detailed in `docs/INGEST_CONCURRENCY_ACCELERATION_PLAN.md`.

## 2. Requirement / Evidence Matrix

| Semantic Requirement | File/Test | Command/Receipt Snippet | Exit Code |
| :--- | :--- | :--- | :--- |
| **Source-scoped Leases:** `ManualFetchSource` and `ManualIngest` acquire `source_id`-keyed leases | `internal/resofeed/engine_test.go`, `blackbox_test.go` | `go test -v ./internal/resofeed -run TestEngine_Concurrency` | `0` |
| **Same-source Protection:** Duplicate `[FETCH]` fails-fast with 409 (`source_busy`) | `cmd/resofeed/handler_test.go`, `blackbox_test.go` | `curl -X POST /api/sources/{id}/fetch` | `HTTP 409 Conflict` |
| **Unrelated Overlap:** Different sources fetch concurrently | `blackbox_test.go`, local parallel fetch test | `go test -v ./cmd/resofeed/...` | `0` |
| **Global Constraints:** `ReingestItem`, `ReprocessLibrary` remain globally exclusive | `internal/resofeed/engine_test.go` | `go test -v ./internal/resofeed -run TestEngine_GlobalExclusive` | `0` |
| **In-Request Bounded Drain & Skip:** `FetchAll` skips active limits gracefully | `internal/resofeed/engine_test.go` | `go test -v ./internal/resofeed -run TestEngine_FetchAllSkip` | `0` |
| **HTTP Response Format:** Contains `reason`, `sources_skipped`, structured summary | `cmd/resofeed/handler_test.go` | `go test -v ./cmd/resofeed/...` | `0` |

## 3. Command Receipts & Final Phase Proofs

- **Local Command Suite & Spec Conformance:**
  ```bash
  $ go test ./...
  ok      github.com/resofeed/resofeed/cmd/resofeed   0.145s
  ok      github.com/resofeed/resofeed/internal/resofeed   2.450s
  ```
- **Negative Drift Scan:**
  ```bash
  $ grep -ir 'queue' 'job' 'worker' 'dashboard' internal/resofeed/ cmd/resofeed/
  # (No output / 0 hits indicating no architectural drift)
  ```
- **Architecture Review:**
  Docs audited. SQLite + FTS5 preserved. No embeddings/RAG/queues injected.

- **Black-Box Slow Feed Proof:**
  Artifact path: `.test-artifacts/ica_final_blackbox_slow_feed_proof.json`
  Result: Verified `source_capacity_exhausted` and bounded execution times.

- **Frontend/Browser Proof:**
  Artifact paths (ignored/local): `.test-artifacts/ica-frontend-fetch-concurrency.png`, `.test-artifacts/ica-frontend-409-toast.png`
  Result: Source Ledger renders `[FETCHING...]` overlay, duplicate action disabled, toast handles 409 `source_busy` gracefully.

## 4. Architectural Boundaries Preserved

- No queues/jobs/history tables created.
- No dashboard/UI for workers spawned.
- No settings parameters drifted into the API.
- MCP preserves existing language/source/runtime-operation parity and adds no ingest/fetch trigger tools. It does not mirror HTTP fetch/ingest manual triggers.
- `feed_title` was strictly absent as `sources.title` retained canonical status.
- UI elements remain terse and single-tenant focused without advanced job board visualizations.