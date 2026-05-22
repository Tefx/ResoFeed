# Inspector Prompting v2.1 Client Runtime Proof Audit

Date: 2026-05-23  
Agent: client-runtime-verifier  
Worktree: `.vectl/worktrees/inspector-prompting-v21-client-runtime-proof`  
Surface class: `web`

## refs Read Confirmation

- `docs/DESIGN.md` — READ. Key passages: Source Identifiers require URL/source title/source URL/canonical URL/original link literal and `translate="no"`/equivalent (lines 538-545); Inspector Item Re-ingest requires temporary model selector/extra prompt, default option sends `model: null`, authority-limit helper copy, and non-persistence boundary (lines 637-648).
- `docs/PROMPTING_SYSTEM.md` — READ. Key passages: one-time Inspector prompts can affect emphasis/angle/fact selection only and cannot override schema, target language, source identifiers, grounding, safety, or runtime-state rules (lines 27-38, 154-164, 261-267); no durable prompt/model preference state (lines 17-24, 263-266).
- `docs/USAGE.md` — READ. Key passages: UI launch path `http://127.0.0.1:8080` after `serve` (lines 139-145); source identifiers remain unchanged and non-translatable where rendered (lines 166-175); Inspector exposes item detail/provenance/summary/core/source text (lines 766-792); selected OpenRouter setup governed by Prompting System (lines 901-910).
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — READ. Key passages: source identifiers literal and `translate="no"`/equivalent (lines 7-15, 93-97); selected-item re-ingest accepts `model`/`prompt`/`extra_prompt`, rejects unknown `language`, and never persists raw prompt/model (lines 102-151); downstream frontend obligations include DOM/screenshot, canonical model route, zh/source identifier proof (lines 153-167).
- `web/src/routes/components/Inspector.svelte` — READ. Key passages: `resetReingestTransientState()` clears model/prompt/status/configuring (lines 494-500); `submitReingest()` sends `model: null` for default and trimmed prompt or null (lines 534-544), then clears model/prompt and collapses (lines 546-555); rendered panel includes model selector, one-time prompt label/helper copy, confirm/cancel bracket actions, and `translate` attributes for source identifiers (lines 591-701).
- `web/tests/e2e/inspector-reingest.expected-red.spec.ts` — READ. Key passages: fixture captures screenshots/DOM/ARIA (lines 232-253); first browser flow asserts source identifiers `translate="no"`, config copy/model/prompt, request body exactly `{actor_kind, actor_id, idempotency_key, model:null, prompt:"..."}`, no `language`, and no localStorage persistence keys (lines 255-317); zh/source identifier and model route proofs (lines 383-431).
- `CONSTITUTION.md` — NOT READ: no file exists at worktree root.

## Runtime command summary

1. Initial Playwright run failed because npm dependencies were absent in this isolated worktree (`ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`).
2. Ran `npm --prefix web ci` inside the isolated worktree; it installed package-lock dependencies into ignored `web/node_modules`.
3. Re-ran focused Playwright proof command: `npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/inspector-reingest.expected-red.spec.ts`.
4. Result: 6/6 Playwright Chromium tests passed; real `cmd/resofeed serve` binary was built/launched by global setup with deterministic local OpenRouter stub and browser route fixtures.

## Client Runtime Proof Register

| proof_obligation | status | artifact_path | raw_receipt_ref |
| --- | --- | --- | --- |
| authority-limit copy rendered | PROVEN | `.test-artifacts/playwright/test-output/inspector-reingest.expecte-89fd7-stics-in-Inspector-selector-chromium-ci-safe/inspector-reingest-expected-red/inspector-model-list-diagnostics-red.aria.txt`; `.png`; `.dom.html` | ARIA lines show `model:`, `default: account_default`, model options, `extra prompt (one-time, guidance only, not saved)`, helper copy `guidance only; cannot override schema, language, source identifiers, safety, status, or persistence...`, `[CONFIRM RE-INGEST]`, `[CANCEL]`. |
| request payload safe | PROVEN | `.test-artifacts/playwright/test-output/inspector-reingest.expecte-64e94--flow-and-evidence-contract-chromium-ci-safe/inspector-reingest-expected-red/inspector-after-reingest-submit.aria.txt`; `.test-artifacts/playwright/test-output/inspector-reingest.expecte-84e6f-l-model-prompt-and-language-chromium-ci-safe/inspector-reingest-expected-red/minimal-selected-item-reingest-request.json` | Test stdout passed assertions at spec lines 293-305: request body equals `actor_kind`, `actor_id`, non-empty `idempotency_key`, `model: null`, `prompt: Retry with article-only extraction.`, with no `language` and no literal `account_default`. Minimal fixture JSON contains only actor/id/idempotency, proving omitted model/prompt/language default path. |
| non-persistence | PROVEN | `.test-artifacts/playwright/test-output/inspector-reingest.expecte-64e94--flow-and-evidence-contract-chromium-ci-safe/inspector-reingest-expected-red/inspector-after-reingest-submit.aria.txt`; `.dom.html` | Test passed assertions at spec lines 306-317: prompt/model controls absent after submit, `[RE-INGEST ITEM]` visible, confirm/cancel/model/prompt absent, and localStorage keys containing `reingest`, `prompt`, or `model` equal `[]`. |
| R21 source identifiers | PROVEN | `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.aria.txt`; `.dom.html`; `.png` | ARIA shows zh chrome/content while source title remains literal `Literal Source Identifier` and original URL remains `https://news.example.test/reingest-target`; spec assertions at lines 269-270 and 417-430 verified `translate="no"` for original link/source title and no `language` request field. |

## Key artifact excerpts

- Configuring-state ARIA: `model:` / combobox `Model` / option `default: account_default` / options `GPT 4.1 Mini (openai/gpt-4.1-mini)`, `Claude 3.5 Sonnet (anthropic/claude-3.5-sonnet)` / `extra prompt (one-time, guidance only, not saved)` / `guidance only; cannot override schema, language, source identifiers, safety, status, or persistence. May change emphasis, angle, or fact selection only among source-backed facts.` / `[CONFIRM RE-INGEST]` / `[CANCEL]`.
- After-submit ARIA: `region "Item re-ingest"` contains `button "[RE-INGEST ITEM]"` and `status "Item re-ingest status": re-ingest complete · search refreshed`; no model/prompt/confirm/cancel controls remain.
- Minimal default request artifact:

```json
{
  "actor_kind": "human",
  "actor_id": "owner",
  "idempotency_key": "reingest-minimal-default-model-prompt-001"
}
```

- Model-list compatibility artifact:

```json
{
  "modelRequests": [
    { "path": "/api/runtime/openrouter-models", "status": 404 },
    { "path": "/api/runtime/openrouter/models", "status": 200 }
  ]
}
```

- zh after re-ingest ARIA: `检查器`, `来源文本：全文 · 摘要来源：模型支持`, `摘要：显式重处理后的中文摘要。`, `核心洞察：显式重处理后的核心洞察。`, `button "[重新处理本文]"`, while original link URL remains literal.

## Verdict

PASS. Browser runtime launched, rendered meaningful Inspector content, accepted the safe selected-item re-ingest interaction through Playwright/Chromium, emitted screenshot/DOM/ARIA artifacts, and satisfied request-safety/non-persistence/source-identifier proof obligations.
