# ResoFeed Agent Instructions

## 1. Project Identity & Authority
- **Role**: You are building ResoFeed, a single-tenant RSS intelligence tool designed as an "analyst's workbench".
- **Canonical Docs**: `docs/ARCHITECTURE.md` and `docs/DESIGN.md` are the ultimate sources of truth. Treat them as law.
- **Invariant Defense**: If a user or task requests a feature that violates these boundaries (e.g., adding user accounts, vector DBs, or sync servers), **push back** and cite the architecture.

## 2. Hard Architecture & File Boundaries
- **One Deployable**: A single Go binary (`cmd/resofeed`) runs static assets, JSON HTTP, MCP Streamable HTTP, and a background ingest loop. No sidecar worker or admin processes.
- **One SQLite DB**: SQLite + FTS5 is the only storage. **Do not** introduce vector databases, embeddings, or RAG semantic search. Lexical search only.
- **LLM Utility**: OpenRouter is a pure JSON-in/JSON-out transformer for summaries and steering translation. It does not orchestrate, hold state, or write to the database directly.
- **Minimal File Shape**: Keep domain logic inside flat files in `internal/resofeed/` (e.g., `ingest.go`, `ranking.go`, `state.go`). **Do not** introduce Java-style App/Domain/Service/Repository layers, DI containers, or event buses.

## 3. State Portability (Strict No-Sync/No-Merge Rule)
- **Minimal Definition**: "Portable state" means **only** active sources, active steering rules, and currently resonated items.
- **JSON Backup/Restore Only**: `internal/resofeed/state.go` validates state bundles and performs atomic transactional backup/restore. 
- **FORBIDDEN**: Do not build a sync coordinator, state merger, 409 conflict resolver, activity ledger, command history, reading history, or portable agent receipts. OPML is import-only for source intake, not export or state restoration.

## 4. Auth, Agent, and MCP Rules
- **Owner Token Boundary**: A single owner token (`--owner-token`) is the universal delegation boundary. There is no multi-user OAuth, no accounts, and **no per-agent registry**. 
- **Attribution vs Auth**: `actor_id` is for idempotency and provenance, not authorization.
- **Steering Contracts**: Human steering supersedes delegated agent steering. Commands that violate core product invariants (e.g., "hide all items") must be partially applied or safely rejected with a terse receipt, not blindly executed.
- **Idempotency**: Agent receipts exist purely for idempotency and provenance. They are not a portable user-visible activity feed.

## 4A. Runtime Secret Handling
- **Runtime-Only LLM Secrets**: OpenRouter API keys are runtime input only. Never persist them to SQLite, include them in state bundles, expose them through HTTP/MCP/UI, log them, print them in `/doctor`, place them in fixtures, or commit them in artifacts.
- **OpenRouter Secret Precedence**: Current OpenRouter startup resolution is OS `OPENROUTER_KEY` > local `.env` fallback. Empty or whitespace-only values are invalid.
- **No CLI Secret Flags**: Do not add examples or integrations that require CLI-passed API keys. OpenRouter API keys must not be accepted by CLI flag.
- **Local `.env` Boundary**: `.env` is local runtime input only. Do not read, print, or commit actual `.env` contents unless a task explicitly requires safe contract review without values. Minimal parser only: `KEY=VALUE`, blank lines, and `#` comments; no shell sourcing, expansion, command substitution, command execution, includes, or multiline semantics.
- **Redacted Evidence Only**: Verification may state `OPENROUTER_KEY=<redacted>` or `source=os_env/.env`; never include raw API-key values. Parser and validation errors must not contain secret values.
- **OpenRouter-Only Runtime**: `OPENROUTER_KEY` is the only accepted OpenRouter API-key name for OS environment and local `.env` sources. Do not regress to CLI API-key examples or alternate provider compatibility flags.

## 5. HTTP/API Contract Rules
- **Deterministic Validation**: HTTP query validation for `/api/feed/today` and `/api/search` is strict and contract-test oriented. Reject unknown or duplicate query parameters with `400 bad_request`.
- **Uniformity**: HTTP endpoints and MCP tools must expose the same product operations (Inspect, Resonate, Steer, Retrieve). Agents do not get "special" product concepts unavailable to humans.

## 6. UI & Design Principles (DESIGN.md)
- **Aesthetic**: Dense but legible. Archival index. Muted colors with rare accents (e.g., Resonate star). 
- **Chrome**: Use functional labels (`RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`). Do not use friendly SaaS copy, mascots, or AI-magic trust palettes.
- **First-Use**: Use the Owner Token Prompt and First-Use Empty State explicitly defined in `DESIGN.md`. Do not build onboarding wizards.
- **FORBIDDEN**: Do not implement folders, tags, unread counts, "mark all read" flows, archive bins, settings sliders, or drag-and-drop ordering.

## 7. Plan Tracking (vectl)
- vectl tracks this repo's implementation plan as a structured `plan.yaml`.
- **Source of truth:** `plan.yaml`. **DO NOT EDIT DIRECTLY** (no `sed`, no Write tools).
- **Modification:** ONLY use MCP tools (`vectl_claim`, `vectl_complete`, `vectl_mutate`, etc.) to change the plan.
- **Step IDs:** Must be globally unique across ALL phases.
- **Evidence:** Mandatory when completing steps (commands run + outputs + gaps).
- **Spec uncertainty:** Leave `# SPEC QUESTION: ...` in code; do not guess or hallucinate missing requirements.
