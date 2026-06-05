# Ingest Concurrency Acceleration Evidence Bundle

Status: Final Evidence Bundle
Date: 2026-06-05

## 1. Overview

This evidence bundle verifies the successful implementation of the source-scoped ingest concurrency architecture detailed in `docs/INGEST_CONCURRENCY_ACCELERATION_PLAN.md`.

## 2. Core Semantics Verified

- **Source-scoped Leases:** `ManualFetchSource`, `ManualIngest`, and background ticks all acquire `source_id`-keyed in-memory leases.
- **Same-source Protection:** Duplicate `[FETCH]` for the same active source fails-fast with 409 (`source_busy`).
- **Unrelated Overlap:** Different sources fetch concurrently within bounded capacity.
- **Global Constraints Maintained:** Processing language mutation, state operations, and reprocess remain globally exclusive. Source Ledger `[RUN INGEST]` remains available and terse.
- **HTTP Response Fields:** Responses correctly implement `reason`, `sources_skipped`, and structured summaries without drifting into durable job boards.

## 3. In-Request Bounded Drain & Skip

- Bounded capacity drains through `llm_global_concurrency` and `item_concurrency_per_source` properly limits.
- Background and manual all-source runs are effectively restricted to a memory-only batch sequence skipping active limits gracefully.

## 4. Architectural Boundaries Preserved

- No queues/jobs/history tables created.
- No dashboard/UI for workers spawned.
- No settings parameters drifted into the API.
- MCP mirrors behavior exactly without direct fetching tools implemented.
- `feed_title` was strictly absent as `sources.title` retained canonical status.
- Source Ledger rendering supports array `[FETCHING...]` replacements visually distinct and correct.
- Black-box slow tests validated `source_capacity_exhausted`. Negative drift scans, architecture reviews, and spec conformance passed thoroughly.
