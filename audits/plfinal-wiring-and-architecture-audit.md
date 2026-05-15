# Final Wiring/Architecture Audit — plfinal-wiring-and-architecture-audit

## refs Read Confirmation (MANDATORY)
- `docs/ARCHITECTURE.md` — READ. Key passage: lines 13-20 require one deployable Go process, one SQLite database with FTS5 lexical retrieval, one backend package, thin transports, and no vector DB/embeddings/RAG. Lines 199-209 require direct calls, SQLite transactions, one in-process ingest/fetch/reprocess guard, and no queues/ledgers/event bus/DI/repository layer.
- `AGENTS.md` — NOT READ: absent from isolated worktree at `/Users/tefx/Projects/ResoFeed/.vectl/worktrees/plfinal-wiring-and-architecture-audit/AGENTS.md`; direct `read` returned file-not-found and `glob **/AGENTS.md` found no file under the worktree.

## Final Wiring/Architecture Audit
- Runtime entrypoint evidence:
  - `cmd/resofeed/main.go:9-13` delegates the single `main` entrypoint to `resofeed.Main` and states no migrate/worker/doctor/admin/sync sidecars.
  - `internal/resofeed/db.go:31-74` recognizes only `serve` and the documented offline `owner-token reset`; `db.go:274-311` opens SQLite, runs migrations, resolves owner token, constructs OpenRouter client, and starts `ServeHTTPAndIngestRuntime` with background ingest inside the same runtime.
  - `internal/resofeed/http.go:56-62` wires `/api/`, `/mcp`, and static UI onto one router.
  - `go list ./...` returned only `resofeed/cmd/resofeed` and `resofeed/internal/resofeed`.
- Storage/search backend evidence:
  - `internal/resofeed/db.go:25` imports only `modernc.org/sqlite` as the DB driver; `db.go:348-379` opens the one SQLite database.
  - `internal/resofeed/migrations.go:9-12` names the current-state tables and `search_fts`; `migrations.go:131-140` creates the FTS5 virtual table.
  - `internal/resofeed/search.go:19-32` defines lexical/metadata retrieval and excludes embeddings/vector/generated answer/chat-history semantics; `search.go:58-103` builds SQL/FTS queries directly.
- Concurrency guard evidence:
  - `internal/resofeed/ingest.go:34-40` defines a package-level guarded operation state.
  - `ingest.go:97-116` uses `tryAcquireIngestGuard` for background/manual ingest; `ingest.go:122-128` uses the same guard for source fetch.
  - `internal/resofeed/reprocess.go:17-28` uses the same guard for explicit library reprocess.
  - `internal/resofeed/runtime_metadata.go:23-44` uses the same guard for processing-language mutation, preserving the reprocess/ingest/fetch exclusion class.
  - `internal/resofeed/http.go:390-408` maps HTTP reprocess guard conflicts to `409 conflict`; `http.go:589-617` routes HTTP manual ingest/fetch through guarded functions; `http.go:1011-1015` maps manual ingest/fetch guard conflicts to the same conflict response.
  - `internal/resofeed/mcp.go:124-135` maps MCP language/reprocess operations to the same core functions; `mcp.go:629-647` maps guard conflict errors into MCP conflict error data.
- Runtime metadata, receipts, FTS stale marker, and state boundary evidence:
  - `internal/resofeed/runtime_metadata.go:12-20` reads persisted language with default fallback and no export side effect; `runtime_metadata.go:114-119` writes the `search_fts_stale_since` marker.
  - `internal/resofeed/reprocess.go:64-66` sets the stale marker before reprocess; `reprocess.go:116-122` rebuilds FTS and marks completion.
  - `internal/resofeed/doctor.go:135-145` exposes FTS stale/OK status from runtime metadata.
  - `internal/resofeed/idempotency.go:17-22` defines receipts as live retry/fingerprint semantics; `idempotency.go:67-107` deletes expired receipts before fresh reuse.
  - `internal/resofeed/state.go:14-23` limits portable state to sources, steering rules, and resonated items; `state.go:47-49` explicitly excludes runtime metadata, receipts, search indexes, histories, and sync metadata; `state.go:134-210` imports by validated transactional replacement rather than merge/conflict resolution.
- Forbidden concept scan:
  - Focused implementation scan over non-test/non-contract `internal/resofeed/*.go` found no implementation files containing `sync coordinator`, `state merger`, `conflict resolver`, `job queue`, `delivery registry`, `per-agent auth registry`, `agent registry`, `service layer`, `DI container`, or `event bus`.
  - Remaining implementation hits for `vector`, `embedding`, `RAG`, `activity ledger`, and `repository layer` are negative contract comments in `search.go`, `migrations.go`, `state.go`, `ranking.go`, `types.go`, and `db.go`, not implementations.
  - Directory shape scan found no `app`, `domain`, `service(s)`, `repository/repositories`, `worker(s)`, `queue(s)`, `sync`, `registry`, or `registries` directories.
- Architecture boundary findings:
  - Finding F-001 [NON_BLOCKING]: Required `AGENTS.md` was absent from the isolated worktree, so this audit could not quote it as a repository-local objective artifact. Closure path: orchestrator/repo owner should ensure `AGENTS.md` is present in future isolated worktrees or remove it from required-reading for this branch shape.
  - No blocker-class architecture violations found in runtime wiring, storage/search backend, flat package shape, concurrency guard, or portable/runtime state boundaries.
- Verification commands:
  - `go test ./...` → `? resofeed/cmd/resofeed [no test files]`; `ok resofeed/internal/resofeed 1.011s`.
  - `go list ./...` → `resofeed/cmd/resofeed`; `resofeed/internal/resofeed`.
- Verdict: PASS_WITH_DEBT

## Machine-readable Receipt
headline: PASS_WITH_DEBT
proof_gap_status: NON_BLOCKING
blocking_status: CLOSED
verdict: PASS
blockers: []
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
behavioral_proof_register:
  - proof: go test ./...
    result: pass
  - proof: runtime entrypoint/package scan
    result: pass
  - proof: focused forbidden-concept implementation scan
    result: pass_with_false_positive_contract_comments
product_implementation_files_modified: no
