# Post-Closure Re-Ingest, Model List, and i18n Repair Contract

Status: authoritative repair contract for `post-closure-reingest-model-i18n-repair` downstream implementation/test steps.

Scope: this contract covers only the four bug families R1-R4. It does not authorize unrelated product code, test rewrites, new surfaces, or architecture changes.

## Authority and Negative Constraints

- `docs/ARCHITECTURE.md` remains binding: one Go binary, one SQLite+FTS5 store, OpenRouter as JSON-in/JSON-out transformer only, no sidecars, no workers, no event bus, no durable jobs, no vector/embedding/RAG substrate, and no new auth/accounts/roles.
- `docs/PROMPTING_SYSTEM.md` remains binding for OpenRouter prompt compilation, structured-output routing, one-time prompt priority, source grounding, target-language preservation, summary output fields, and Go-owned validation/runtime status boundaries.
- `docs/DESIGN.md` remains binding: dense archival-index chrome; `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, and `/doctor` operational labels; Owner Token Prompt; First-Use Empty State; low-chrome bracket actions; no folders, tags, unread counts, mark-all-read, archive bins, settings dashboards, onboarding wizards, retry queues, activity history, prompt/model preference dashboards, or translation comparison panels.
- Existing item content localization is explicit. Changing runtime processing language affects UI chrome and future processing. Existing stored item-readable content changes only through explicit library reprocess or selected-item re-ingest.
- Source identifiers are literal provenance anchors. URL, source title, source URL, canonical URL, and original link must not be translated, summarized, transliterated, beautified, rewritten, or stripped of `translate="no"`/equivalent semantics.

Rationale: these constraints preserve the accepted one-runtime workbench architecture and prevent downstream agents from fixing narrow bugs by introducing forbidden product concepts.

## Requirement-to-Checklist Traceability Matrix

| requirement_id | source_ref + key passage | obligation | owning_step_id | checklist_item | evidence_field | status | non_intersection_or_escalation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `web/src/routes/components/Inspector.svelte` `submitReingest` success path currently clears prompt/model and sets status after response; `docs/DESIGN.md` section `Inspector Item Re-ingest (inspector-reingest-panel)` defines completed/running/persistence-boundary states for selected-item re-ingest, including transient prompt/model clearing and terse completion feedback. | Successful selected-item re-ingest must leave the Inspector in collapsed idle affordance: `reingestConfiguring=false`, no Model/One-time prompt/confirm/cancel controls, `[RE-INGEST ITEM]` visible, prompt/model transient state cleared, terse completed/replayed status optional but not implemented as durable history. | `post-closure-reingest-model-i18n-repair-frontend-ui-i18n.frontend-ui-i18n-repair` | `success-state-collapse` | `screenshot_dom_after_success` | OWNED | n/a |
| R2 | `internal/resofeed/openrouter.go` `ListOpenRouterModels` fetches OpenRouter `/api/v1/models` and returns `{models:[{id,name}]}` without provider-state persistence; `web/src/lib/api-contract.ts` currently documents `GET /api/runtime/openrouter-models`; tests fixture that path. | Frontend and backend must agree that `GET /api/runtime/openrouter-models` is canonical, owner-token-authenticated, strict-query, JSON response `{models:[{id,name}]}`. Backend must also accept documented compatibility route `GET /api/runtime/openrouter/models` with identical response/error semantics. | `post-closure-reingest-model-i18n-repair-backend-api-contract.backend-api-repair` | `model-list-route-compatibility` | `curl_and_network_model_list` | OWNED | n/a |
| R3 | `docs/DESIGN.md` Language Control and Source Identifiers sections require `LANG: EN/ZH`, `语言: 英文/中文`, `html lang`, reprocess warning, and literal source identifiers; `docs/ARCHITECTURE.md` decisions 10-13 state language affects future processing and explicit reprocess rewrites existing rows. | zh must localize UI chrome/statuses and model-backed target-language summary/core/reading text after explicit processing/re-ingest; source identifiers remain literal; existing stored content must not be rewritten merely because language changes. | `post-closure-reingest-model-i18n-repair-frontend-ui-i18n.frontend-ui-i18n-repair` | `zh-ui-and-post-reingest-content` | `zh_screenshot_and_item_text` | OWNED | n/a |
| R4 | `internal/resofeed/http.go` routes item mutations under `/api/items/{id}` and handles `POST /api/items/{id}/reingest`; `internal/resofeed/reprocess.go` validates model/prompt and sends them into `OpenRouterSummaryInput`; `types.go` marks model/prompt request-scoped only. | `POST /api/items/{id}/reingest` must accept owner-authenticated strict JSON with actor/idempotency plus nullable `model` and one-time prompt input. It must accept `prompt` canonical field and `extra_prompt` compatibility field safely, reject unknown fields including `language`, preserve idempotency/guard errors, and never persist prompt/model as durable runtime/browser state. | `post-closure-reingest-model-i18n-repair-backend-api-contract.backend-api-repair` | `reingest-http-extra-prompt-contract` | `curl_positive_negative_reingest` | OWNED | n/a |

## Contract Decisions

### R1: Successful Inspector Re-Ingest State Collapse

Decision: after a successful fresh or replayed selected-item re-ingest response, the Inspector re-ingest panel must collapse from configuring mode back to the single idle affordance.

Required observable state:

- `[RE-INGEST ITEM]` is visible inside `aria-label="Item re-ingest"`.
- Model selector, prompt control, `[CONFIRM RE-INGEST]`, and `[CANCEL]` are absent.
- One-time prompt and selected model are reset to empty/default.
- No item re-ingest prompt/model value is written to `localStorage`, runtime metadata, URL state, hidden inputs outside the panel, or any durable history.
- Refreshed item text comes from `response.reingest.item` when present; otherwise the selected item may be refetched through the existing item detail route.
- Failed and conflict submissions preserve the transient prompt for correction and remain in configuring mode.

Rationale: `docs/DESIGN.md` defines completed/replayed re-ingest as a transient retry state, not a durable editing surface. Collapsing successful controls prevents the bug where complete state still looks configurable.

Fails if: success leaves confirm/cancel controls visible, stores prompt/model, or creates any retry history/dashboard.

### R2: OpenRouter Model List Route Compatibility

Decision: the canonical frontend/backend model-list route is:

```text
GET /api/runtime/openrouter-models
```

Compatibility route required for HTTP clients and route drift repair:

```text
GET /api/runtime/openrouter/models
```

Both routes must:

- require the same owner-token auth as every `/api/*` route;
- reject any query parameters with `400 bad_request`;
- return `200 application/json` with `{"models":[{"id":"...","name":"..."}]}`;
- fetch live OpenRouter models through `ListOpenRouterModels`/equivalent runtime path;
- redact provider/API-key/`.env`/owner-token details on failure;
- never persist model lists, selected model state, prompt state, provider configuration, or secret-source metadata;
- allow frontend failure handling to degrade to `model list: OpenRouter models unavailable` while preserving Default model re-ingest.

Rationale: existing frontend contract and fixtures use `/api/runtime/openrouter-models`; the step explicitly forbids silently choosing between it and `/api/runtime/openrouter/models`, so compatibility is required while preserving one canonical path.

Fails if: frontend calls a path the backend does not serve, backend serves only the compatibility route, route requires public/no auth access, or errors leak secret/provider payloads.

### R3: zh UI Chrome, Target-Language Content, and Literal Source Identifiers

Decision: zh behavior is split into presentation chrome and stored item content rules.

UI chrome/statuses that must localize when processing language is `zh`:

- `<html lang="zh-CN">` unless a narrower locale is later authorized.
- Inspector label `检查器`.
- Inspector status labels such as `来源文本：仅 RSS 摘录`, `摘要来源：模型支持`, `摘要：`, `核心洞察：`, and fallback/incomplete lines.
- Utility menu language control `语言: 中文`, reprocess label `[重处理资料库]`, confirm/cancel labels where already defined, and success/status copy such as `语言已设为中文`.
- Search/Steer visible route/status copy already defined by the frontend language contract.

Stored/readable content rule:

- Existing item title/summary/core/body is not automatically rewritten when language changes.
- Future ingest uses the current processing language.
- Explicit library reprocess may rewrite existing library item-readable fields into current language.
- Explicit selected-item re-ingest may rewrite only that selected item into current language.
- After re-ingest/reprocess, updated Inspector summary/core/body assertions should prove target-language text changed only through that explicit operation.

Literal source identifier rule:

- `source_title`, `url`, `provenance.source_url`, `provenance.canonical_url`, and `provenance.original_url` remain exact literal strings.
- These identifiers must remain marked `translate="no"` or equivalent in feed, Inspector, source disclosure, grouped source list, and Source Ledger surfaces.

Rationale: architecture stores one processed language per item and explicitly rejects automatic history rewrites or bilingual reader behavior.

Fails if: switching `LANG` mutates existing item rows/content without reprocess/re-ingest, source identifiers are localized, or UI adds side-by-side translation/translation badge/failure panel surfaces.

### R4: Item Re-Ingest HTTP One-Time Prompt/Model Contract

Decision: `POST /api/items/{id}/reingest` remains the canonical item-scoped mutation route. It accepts the existing canonical request body plus one compatibility alias for prompt.

Canonical accepted request body:

```json
{
  "actor_kind": "human|agent",
  "actor_id": "owner-or-agent-id",
  "idempotency_key": "non-empty-key",
  "model": null,
  "prompt": null
}
```

Compatibility accepted body:

```json
{
  "actor_kind": "human|agent",
  "actor_id": "owner-or-agent-id",
  "idempotency_key": "non-empty-key",
  "model": "openrouter/model-id",
  "extra_prompt": "one-time retry instruction"
}
```

Field rules:

- `prompt` is canonical. `extra_prompt` is a compatibility alias normalized to the same one-time prompt semantic value.
- If both `prompt` and `extra_prompt` are present with different non-empty normalized values, return `400 bad_request` with field `prompt` or `extra_prompt` and do not call OpenRouter.
- Empty string, all-whitespace prompt, or omitted prompt normalizes to `null`/empty one-time prompt.
- One-time prompt priority, allowed effects, forbidden effects, source grounding, target-language preservation, and summary output boundaries are governed by `docs/PROMPTING_SYSTEM.md`.
- `model:null`, omitted model, empty model, or all-whitespace model means account/runtime default model for that call.
- Non-empty `model` is request-scoped and passed only to the OpenRouter transform call.
- `language` and any other unknown fields are rejected. Runtime processing language is read from persisted metadata only.
- Prompt length limit remains 4000 bytes after trimming. Model length limit remains 200 bytes after trimming unless a future architecture update changes it.
- Request body must remain strict JSON, owner-authenticated, content-type validated, and query-free.

State and idempotency rules:

- Raw prompt/model values are never persisted to SQLite runtime metadata, state export/import, localStorage, provider config, source/item durable preference state, command/activity history, or receipt storage.
- Only normalized prompt/model values participate in idempotency fingerprint/digest computation so same key + same normalized fields replays and same key + different normalized fields returns bad request; the live receipt stores only the fingerprint/digest/result snapshot needed for replay.
- Re-ingest uses existing current-operation guard semantics; conflict returns `409 conflict` with current operation details.
- Response envelope remains `{ "already_applied": boolean, "reingest": { ... } }` and must include refreshed item detail when the item was updated.

Rationale: the bug family asks for one-time extra prompt/model input without durable prompt/model state. Compatibility keeps older clients using `extra_prompt` safe while preserving `prompt` as the canonical field already declared by frontend/types. The prompt semantics delegate to `docs/PROMPTING_SYSTEM.md` so this route contract does not duplicate or drift from the canonical prompting boundary.

Fails if: prompt/model become settings/preferences, extra prompt is silently ignored, `language` is accepted, idempotency ignores prompt/model differences, prompt semantics drift from `docs/PROMPTING_SYSTEM.md`, or error handling leaks provider secrets.

## Downstream Verification Obligations

Backend repair step must produce evidence for:

- `curl`/HTTP positive: both model-list routes return identical shape and require owner auth.
- `curl`/HTTP negative: unauthorized model list is `401`; query params are `400`; provider errors redact secrets.
- `curl`/HTTP positive: `POST /api/items/{id}/reingest` accepts `prompt`, accepts `extra_prompt`, normalizes default model, returns refreshed item envelope.
- `curl`/HTTP negative: `language` is rejected; unknown fields are rejected; conflicting `prompt`/`extra_prompt` is rejected; same idempotency key with changed prompt/model is rejected; guard conflict preserves current-operation detail.

Frontend repair step must produce evidence for:

- DOM/screenshot after successful re-ingest showing only `[RE-INGEST ITEM]` and no confirm/cancel/model/prompt controls.
- Network proof that frontend calls canonical `/api/runtime/openrouter-models` and can render live model options.
- zh screenshot/DOM proving localized chrome/statuses plus literal source identifiers with `translate="no"`.
- Item text proof showing existing content changes only after explicit reprocess/re-ingest.

## Open Questions

- None blocking. The canonical/compat route decision above intentionally resolves the model-list route ambiguity for this repair.
