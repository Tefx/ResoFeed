# CCR Final Architecture Review

Task: `content-contract-redesign-final-verification-and-deep-review.ccr-final-architecture-review`

## refs Read Confirmation

- `CONSTITUTION.md` read: runtime/storage dogmas require one deployable Go binary, SQLite+FTS5 only, lexical retrieval only, bounded JSON-in/JSON-out LLM, flat `internal/resofeed`, direct SQL/transactions, no DI/event bus/service/repository drift; auth dogmas require owner-token for `/api/*` and `/mcp`, `actor_id` provenance/idempotency only; re-ingest failures must update attempt state only; concurrency dogmas require guarded non-overlap and no persistent pending work.
- `docs/contracts/CONTENT_CONTRACT_REDESIGN.md` read: constraints preserved repeat one Go binary, SQLite+FTS5, bounded LLM, HTTP/MCP parity, owner-token boundary, `actor_id` non-auth; re-ingest semantics require atomic success replacement and failed attempts to leave generated content untouched; FTS must index current readable content and not failed candidates.
- `docs/PRD.md` read: actor authority uses owner token as external-agent delegation boundary without separate per-agent auth registry; search is lexical and not RAG/vector; non-goals forbid ledgers, queues, moderation, folders/tags, SaaS features; AC-23/AC-24 require non-destructive re-ingest and historical re-ingest preservation.
- `docs/ARCHITECTURE.md` read: system boundary is one `resofeed` Go binary serving static UI, JSON HTTP, MCP Streamable HTTP, background ingest, and migrations; backend layers are `cmd/resofeed`, flat `internal/resofeed`, SQLite, RSS/Atom, OpenRouter; coordination uses direct function calls, SQLite transactions, and one in-process guard; schema shape includes `items`, `agent_receipts`, `search_fts`, and `runtime_metadata` only for current/runtime state.
- `docs/PROMPTING_SYSTEM.md#field-semantics` read: `localized_title`, `summary`, `core_insight`, and `key_points` are target-language structured fields; model status is only `ok`/`summary_unavailable`; Go owns runtime/provider/persistence statuses; retry failures update attempt diagnostics only; prompt receipts are optional non-portable diagnostics only.
- `docs/DESIGN.md` read: Inspector item re-ingest is selected-item only, model/prompt temporary, no durable jobs/history/preferences; current-operation status is in-memory only; search is not RAG; Do/Don'ts forbid dashboards, queues, history, settings, saved prompt/model defaults, Feed key points, and destructive failed re-ingest UI.

## Architecture Review Matrix

| invariant | evidence | verdict | notes |
| --- | --- | --- | --- |
| One deployable Go binary | `go list ./...` returned only `resofeed/cmd/resofeed` and `resofeed/internal/resofeed`; `cmd/**/*.go` contains only `cmd/resofeed/main.go`; `docs/ARCHITECTURE.md` §2 says the Go binary serves static assets, JSON HTTP, MCP, background ingest, and migrations. | PASS | No worker/admin/sync deployable package found. |
| Flat `internal/resofeed` product core | All internal Go files are under `internal/resofeed`; `docs/ARCHITECTURE.md` §3.1 assigns Product core to `internal/resofeed`; grep found no package directory named service/repository/domain/app. | PASS | File-level splits exist, but package remains flat. |
| SQLite/FTS5 only | `migrations.go:64-140` defines current tables and `search_fts using fts5`; `migrations.go:184-203` rebuilds FTS with content-contract columns; forbidden-storage grep found no Redis/Postgres/Kafka/vector schema. | PASS | Test fixture strings mention PostgreSQL/vector only as negative tests or copy. |
| Direct SQL/transactions | `migrations.go:20-45`, `reprocess.go:678-707`, `idempotency.go:68-120`, `state.go:146-206`, and `ranking.go:795-824` use direct `database/sql` transactions. | PASS | No repository/service/DI abstraction layer found. |
| No vector/RAG/semantic-answer drift | `CONSTITUTION.md` forbids vectors/embeddings/RAG; `search.go:21` states no embeddings/vector/generated answer; grep hits are negative guardrails/tests, not implementation tables or dependencies. | PASS | Lexical FTS remains the only search substrate. |
| Owner-token universal boundary | `http.go:239-243` checks auth before API routing; `http.go:370-383` validates Bearer token/hash; `mcp.go:17-20` requires owner token before JSON-RPC dispatch. | PASS | Static UI remains public per architecture; `/api/*` and `/mcp` are protected. |
| `actor_id` not authorization | `CONSTITUTION.md` and `docs/PRD.md` define `actor_id` as provenance/idempotency; code validates it in mutation request fields and stores it in receipts/state, while auth is Bearer-token based in `http.go`/`mcp.go`. | PASS | No per-agent registry or auth lookup found. |
| LLM JSON transformer boundary | `openrouter.go:59-67` system prompt demands exact JSON and says runtime/provider errors are app-owned; `openrouter.go:69-73` LLMClient is a bounded use-boundary; `openrouter.go:1547-1558` output DTO is validated before saving; `openrouter.go:1568-1569` steering output is only a proposal and Go owns final DB transaction. | PASS | No direct DB writes from LLM adapter found. |
| HTTP/MCP parity for product operations | `http.go:260-279` exposes model list/reprocess/current operation; `mcp.go:148-152` maps library reprocess to shared function; `mcp.go:89-96` maps item re-ingest to shared `ReingestItem`; `mcp.go:892-893` lists `reingest_item` and `list_openrouter_models`. | PASS | MCP gets same product concepts, not agent-only concepts. |
| No durable jobs/history state | `migrations.go:9-11` names schema as current-state only; `current_operation.go:12-14` says in-memory only, not job/queue/ledger/history; grep found no created job/queue/history/ledger tables beyond `agent_receipts` idempotency. | PASS | `agent_receipts` is permitted retry/provenance state, not portable activity ledger. |

## Concurrency / State Review

| operation | guard/transaction evidence | verdict |
| --- | --- | --- |
| Background ingest | `ingest.go:108-117` acquires `tryAcquireIngestGuardWithActor(ctx, "ingest", "background", "background")`; conflict returns nil for background tick skip. | PASS |
| Manual ingest | `ingest.go:120-130` shares the same guard and says no durable queue/job state when another operation is running. | PASS |
| Per-source fetch | `ingest.go:133-165` shares the same guard and records source-level result/errors only. | PASS |
| Library reprocess | `reprocess.go:22-39` acquires guard, uses idempotency receipt, and declares no durable coordination artifacts; `reprocess.go:729-748` rebuilds FTS and clears stale marker in one transaction. | PASS |
| Item re-ingest | `reprocess.go:54-87` validates request, acquires `item_reingest` guard, updates current operation, and uses idempotency receipt; `reprocess.go:678-707` commits success/failure state transactionally. | PASS |
| Failed re-ingest preservation | `reprocess.go:685-689` updates only `last_reprocess_*` on failed/unavailable outcomes; success branch at `reprocess.go:690-705` updates generated fields and FTS only when outcome is writable. | PASS |
| Search index alignment | `reprocess.go:701-705` refreshes FTS only for non-failed outcomes; `reprocess.go:712-727` refreshes selected item row; `migrations.go:184-203` rebuilds FTS with source/localized/key points fields. | PASS |
| Idempotent replay boundary | `idempotency.go:17-21` defines single receipt implementation; `idempotency.go:67-107` replays live same-fingerprint receipts and deletes expired rows transactionally; `idempotency.go:109-122` writes receipts in a transaction. | PASS |
| Current operation state | `current_operation.go:12-14` says process-local/in-memory/cleared on release; `current_operation.go:79-83` clears the snapshot. | PASS |

## Issues

| severity | issue | gate_intersection | owner |
| --- | --- | --- | --- |
| none | No architecture/concurrency/product-boundary blockers found in reviewed refs and code artifacts. | CCR final architecture gate | N/A |

## Closure Signals

- headline: PASS
- verdict: PASS
- blockers: []
- gate_open_allowed: true
- orchestrator_action_hint: COMPLETE

## checklist_receipt

- Required refs read and cited: yes.
- Code/package layout checked: `go list ./...`, `cmd/**/*.go`, `internal/**/*.go`.
- Forbidden drift searched: vector/RAG/embedding, service/repository/DI/event bus, job/queue/history/ledger/registry tables.
- Guard/transaction evidence checked: ingest/fetch/reprocess/item re-ingest/current operation/idempotency.
- Verification command: `go test ./...` passed (`resofeed/internal/resofeed` ok; `resofeed/cmd/resofeed` no test files).
