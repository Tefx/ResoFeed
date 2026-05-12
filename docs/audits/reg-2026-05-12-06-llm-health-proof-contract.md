# REG-2026-05-12-06 LLM Health Proof Contract

Status: contract-only proof obligations; no runtime behavior change.

## Scope

This contract distinguishes deterministic OpenRouter-compatible stub success from current live LLM health. It exists so downstream fix/retest work cannot count excerpt fallback output as live model success.

## Classification Options

Downstream classification for the current degraded live server must choose one of:

- `missing_live_model_configuration`
- `stale_database_prior_failures`
- `openrouter_client_timeout_or_error`
- `unresolved_product_regression`

## Required Downstream Artifacts

Downstream evidence for this finding must include all of:

- `/api/doctor` current response snapshot with any secrets redacted.
- Current feed sample showing `model_status` and `value_tier` for at least one affected item.
- Deterministic stub control result from an OpenRouter-compatible test server or fixture.
- Explicit live/stub distinction explaining why the deterministic stub result does or does not prove current live health.

## Success Definition

Live model success requires at least one current item with model-backed evidence:

- `model_status` is `ok`;
- `summary` or `core_insight` is populated by the live model path, not by raw RSS excerpt fallback;
- `value_tier` is non-null/non-empty model-backed evidence when the summary contract asks for it; and
- `/api/doctor` does not report current OpenRouter/provider/model uncertainty or item transform failures for that item set.

Fallback-only excerpt output, including UI text such as `fallback: excerpt-only`, is not live model success.

## Stub Success Versus Live Health

Passing an isolated deterministic OpenRouter-compatible path proves request/response shape, validation, persistence, and safe fallback handling for that stubbed path only. It does not prove that the current live server has a reachable provider, a resolved live model, acceptable latency, or current model-backed summaries.

## Forbidden Scope

This proof contract must not introduce or require:

- new LLM orchestration;
- persistence changes;
- vector search, embeddings, RAG, or semantic answer engines;
- app/domain/service/repository layers; or
- sidecar workers, sidecar diagnostics, or separate admin processes.

## Ownership

- Downstream owner: `regression-live-llm-health-classification-fix`
- Retest owner: `regression-backend-mcp-llm-liveness-probe`
- Gate: may open only after the required artifacts classify live health and prove at least one model-backed current item, or explicitly record the remaining blocker.
