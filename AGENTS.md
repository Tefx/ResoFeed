# ResoFeed Agent Instructions

This tracked copy restores isolated-worktree availability for verification agents. It reflects the repository constraints provided to this task and defers product/design authority to `docs/ARCHITECTURE.md` and `docs/DESIGN.md`.

## Project Authority

- Build ResoFeed as a single-tenant RSS intelligence workbench.
- Treat `docs/ARCHITECTURE.md` and `docs/DESIGN.md` as canonical authority.
- Push back on requests that violate architecture or design boundaries.

## Architecture Boundaries

- One deployable Go binary (`cmd/resofeed`) serves static assets, JSON HTTP, MCP Streamable HTTP, and the background ingest loop.
- SQLite plus FTS5 is the only storage and retrieval substrate; do not introduce vector databases, embeddings, RAG, or semantic search.
- The LLM is a JSON-in/JSON-out transformer only; it must not orchestrate, hold durable state, or write directly to the database.
- Keep domain logic in flat `internal/resofeed/` files; do not introduce Java-style App/Domain/Service/Repository layers, DI containers, event buses, sidecars, or extra admin/worker processes.

## State Portability

- Portable state is only active sources, active steering rules, and currently resonated items.
- Backup/restore is JSON-only through `internal/resofeed/state.go` and atomic transactions.
- Do not build sync coordinators, state mergers, conflict resolvers, activity ledgers, command history, reading history, or portable agent receipts.
- OPML is import/export only, not state restoration.

## Auth, Agents, and MCP

- A single owner token is the universal delegation boundary.
- Do not add accounts, OAuth, per-agent registries, roles, teams, or profile/password-reset flows.
- `actor_id` is provenance/idempotency only, not authorization.
- HTTP endpoints and MCP tools must expose the same product operations; agents do not get special product concepts unavailable to humans.

## UI and Design

- Follow `docs/DESIGN.md`: dense but legible archival-index chrome, muted colors, rare Resonate accent, operational labels such as `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, and `/doctor`.
- Use the Owner Token Prompt and First-Use Empty State defined in `docs/DESIGN.md`; do not build onboarding wizards.
- Do not implement folders, tags, unread counts, mark-all-read flows, archive bins, settings sliders, drag-and-drop ordering, settings dashboards, or source category management.

## Plan Tracking

- `plan.yaml` is orchestrator-owned. Do not edit it directly.
- Executors must not mutate vectl plan/claim state unless explicitly authorized by the orchestrator.
