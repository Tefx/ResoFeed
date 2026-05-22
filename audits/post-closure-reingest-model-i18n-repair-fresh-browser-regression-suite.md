# Fresh Browser Regression Suite — post-closure re-ingest/model/i18n repair

<intuition>
Fresh browser proof is the right pressure point here: the previous risk was not merely HTTP correctness, but a UI that could visually contradict the backend by leaving stale controls or English/fallback copy onscreen. I treated screenshots/ARIA/DOM plus captured request payloads as the acceptance boundary and rejected implementation/source inspection. No product source was read or modified.
</intuition>

**Headline**: PASS  
**Blocking Status**: CLOSED  
**Proof-Gap Status**: NONE  
**Verdict**: PASS  
**Blockers**: []  
**Orchestrator Action Hint**: COMPLETE

## refs Read Confirmation (MANDATORY)

- `docs/DESIGN.md` — READ. Key passage: Inspector Item Re-Ingest is an Inspector-only transient panel; after completed/replayed state, one-time prompt/model are cleared, failed/conflict submissions preserve the transient prompt, and source identifiers/original links remain literal with `translate="no"`; Language Control requires `html lang` and localized `语言: 中文`; Reprocess Library Action uses low-chrome Chinese bracket labels.
- `docs/ARCHITECTURE.md` — READ. Key passage: selected item re-ingest is a narrow one-binary public mutation (`POST /api/items/{id}/reingest`) with request-scoped `model`/`prompt`, shared `{already_applied, reingest}` response, no sidecars/jobs/queues/provider state, and processing language rewrites stored item-readable content only after explicit reprocess/re-ingest.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — READ. Key passage: R1 requires success collapse to only `[RE-INGEST ITEM]` with confirm/cancel/model/prompt absent; R2 requires canonical `/api/runtime/openrouter-models` plus compatibility `/api/runtime/openrouter/models`; R3 requires zh chrome and post-explicit-reingest Chinese readable content while source identifiers remain literal; R4 requires request-scoped `prompt` plus `extra_prompt` compatibility and no `language` field.
- `web/tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts` — READ. Key passage: existing proof spec stubs public `/api/**` responses only, asserts `html lang="zh-CN"`, literal source/original link `translate="no"`, model option visibility, success collapse, canonical prompt POST, `extra_prompt` compatibility POST, and negative 400 safe-state with preserved prompt and no stale completion.
- `audits/post-closure-reingest-model-i18n-repair-batched-b1-b5-retest-gate.md` — READ. Key passage: previous gate records PASS/closed B1-B5 evidence, including committed browser artifact family, route parity network JSON, success collapse ARIA, and negative safe-state ARIA; used as prior-risk context only, not as fresh proof.
- `audits/post-closure-reingest-model-i18n-repair-strict-independent-api-curl-regression-suite.md` — READ. Key passage: strict API evidence proved real runtime curl behavior for owner-authenticated model list routes, `prompt`/`extra_prompt`, rejection of `language`, Chinese explicit reingest content, and no durable prompt/model state.
- Current `.test-artifacts/playwright/test-output/post-closure-reingest-mode-*/blind-browser-proof/` evidence family — READ. Key passage: existing artifact family contained positive/negative browser screenshots, DOM, ARIA, and network JSON. I then ran a fresh Playwright command and copied the regenerated proof family to `.audit-artifacts/fresh-browser-regression-suite/` to avoid relying on implementation evidence.
- `CONSTITUTION.md` — NOT READ: no `CONSTITUTION.md` found by workspace glob in the isolated worktree.

## Browser Regression Evidence

- command: `npm run test:e2e -- post-closure-reingest-model-i18n-blind-browser-proof.spec.ts --project=chromium-ci-safe`
- cwd: `web/`
- exit: `0`
- raw_stdout_stderr:

```text
> resofeed-web@0.0.0-contract test:e2e
> playwright test --config ./playwright.config.ts post-closure-reingest-model-i18n-blind-browser-proof.spec.ts --project=chromium-ci-safe

(node:1673) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

> resofeed-web@0.0.0-contract build
> vite build

▲ [WARNING] Cannot find base config file "./.svelte-kit/tsconfig.json" [tsconfig.json]

vite v6.4.2 building SSR bundle for production...
transforming...
✓ 155 modules transformed.
rendering chunks...
vite v6.4.2 building for production...
transforming...
✓ 167 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 403ms
✓ built in 1.27s

Run npm run preview to preview your production build locally.

> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done

Running 2 tests using 1 worker

(node:1800) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
  ✓  1 [chromium-ci-safe] › tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:161:1 › blind proof: zh model-list route parity and successful item re-ingest collapse controls (774ms)
  ✓  2 [chromium-ci-safe] › tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:230:1 › blind proof: negative re-ingest error keeps correction controls and avoids stale completion (406ms)

  2 passed (6.1s)
```

- screenshots:
  - configuring/model-list: `.audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/before-positive-confirm.png`
  - completed/collapsed/zh content: `.audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.png`
  - negative/error safe state: `.audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.png`
- DOM/ARIA snapshots:
  - `.audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/before-positive-confirm.aria.txt`
  - `.audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/before-positive-confirm.dom.html`
  - `.audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.aria.txt`
  - `.audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.dom.html`
  - `.audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.aria.txt`
  - `.audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.dom.html`
- network log:
  - model-list canonical: `GET /api/runtime/openrouter-models`, status `200`, body includes `openai/gpt-4.1-mini` / `GPT 4.1 Mini` and `anthropic/claude-3.5-sonnet` / `Claude 3.5 Sonnet`.
  - model-list compatibility: `GET /api/runtime/openrouter/models`, status `200`, identical visible model body.
  - re-ingest canonical prompt payload: `POST /api/items/item_blind_reingest_i18n/reingest`, status `200`, payload fields `actor_kind:"human"`, `actor_id:"owner"`, `model:"openai/gpt-4.1-mini"`, `prompt:"请用中文重写摘要和核心洞察。"`, no `language` field.
  - re-ingest compatibility payload: `POST /api/items/item_blind_reingest_i18n/reingest`, status `200`, payload fields `actor_kind:"human"`, `actor_id:"owner"`, `model:"openai/gpt-4.1-mini"`, `extra_prompt:"请通过兼容 extra_prompt 字段证明一次性提示。"`, no `language` field.
  - negative payload: `POST /api/items/item_blind_reingest_i18n/reingest`, status `400`, payload fields `model:null`, `prompt:"保留这个失败后的修正提示。"`.
- Chinese evidence:
  - Before explicit re-ingest ARIA shows zh chrome/status and fallback state: `检查器`, `中文处理失败 · 摘要/核心洞察不可用 · 显示来源摘录`, `项目重处理`, `模型列表：2 个 OpenRouter 模型可用`, `一次性提示（不保存）`, `[确认重处理]`, `[取消]`.
  - After explicit re-ingest ARIA shows Chinese content: feed paragraph `显式重处理后的中文摘要，足以证明目标语言内容已更新。`; Inspector summary `显式重处理后的中文摘要，足以证明目标语言内容已更新。`; core insight `显式重处理后的中文核心洞察，说明修复后的浏览器状态。`.
  - DOM grep confirmed literal source warning uses `translate="no"` (`来源标识保持不变。`), and the proof spec asserted selected item source/original link have `translate="no"`.
- negative paths:
  - `.audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.aria.txt` shows prompt retained (`保留这个失败后的修正提示。`), model control still visible, `[确认重处理]` and `[取消]` still visible, and alert `err: err: bad_request: conflicting prompt fields rejected safely`.
  - Same ARIA snapshot keeps the original fallback excerpt and contains no `重处理完成` completed-state contradiction.

## Behavioral Proof Register

| behavior | proof status | evidence |
| --- | --- | --- |
| Successful re-ingest transitions from configuring to completed and collapses confirm/cancel/model/prompt controls | PROVEN | before ARIA lines show model/prompt/confirm/cancel; after ARIA shows only `[重处理项目]` and `重处理完成`; Playwright assertions passed. |
| Model list loads visibly and backend-compatible routes are observable | PROVEN | before ARIA shows both model options and `模型列表：2 个 OpenRouter 模型可用`; network JSON records canonical and compatibility model-list paths with `200`. |
| Re-ingest sends prompt/model/extra_prompt request-scoped payloads and omits `language` | PROVEN | positive network JSON includes canonical `prompt` POST and compatibility `extra_prompt` POST, both status `200` and without `language`. |
| zh chrome/statuses and post-reingest summary/core item text are Chinese | PROVEN | before/after ARIA excerpts above; after summary/core text are Chinese after explicit re-ingest. |
| Negative/error flow is safe and has no stale configuring/completed contradiction | PROVEN | negative network status `400`; negative ARIA shows retained correction controls/prompt and no stale success/completed text. |
| Fresh context, not reused implementation evidence | PROVEN | fresh command exit `0` generated artifacts copied to `.audit-artifacts/fresh-browser-regression-suite/`; no product source read or modified. |

## Closure Fields

verdict: PASS  
headline: PASS  
proof_gap_status: NONE  
blocking_status: CLOSED  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE  
uncertainty_sources: []  
blockers: []

## checklist_receipt

```yaml
"Screenshots and DOM/ARIA snapshots prove the completed state no longer shows confirm/cancel controls":
  checked: true
  proof_artifacts:
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.png"
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.aria.txt"
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.dom.html"
  basis: "After-success ARIA shows Item re-ingest region with only [重处理项目] plus status 重处理完成; Playwright asserted confirm/cancel/model/prompt counts are zero."
"Network evidence proves model-list request path/status and visible model options":
  checked: true
  proof_artifacts:
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/before-positive-confirm.aria.txt"
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.network.json"
  basis: "ARIA shows GPT 4.1 Mini and Claude 3.5 Sonnet options; network shows /api/runtime/openrouter-models and /api/runtime/openrouter/models both status 200 with identical model bodies."
"Network evidence proves re-ingest extra prompt/model payload fields and status":
  checked: true
  proof_artifacts:
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.network.json"
  basis: "Network JSON includes status 200 canonical prompt/model payload and status 200 extra_prompt/model compatibility payload, with no language field."
"Chinese UI labels/statuses and explicit post-reingest Chinese item content are visible in artifacts":
  checked: true
  proof_artifacts:
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/before-positive-confirm.aria.txt"
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.aria.txt"
    - ".audit-artifacts/fresh-browser-regression-suite/positive-blind-browser-proof/after-positive-success-collapse.png"
  basis: "Artifacts show 检查器, 中文处理失败, 模型列表, 项目重处理, 重处理完成, and post-explicit-reingest Chinese summary/core text."
"Negative/error flow artifacts show safe diagnostics and no stale configuring/completed contradiction":
  checked: true
  proof_artifacts:
    - ".audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.png"
    - ".audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.aria.txt"
    - ".audit-artifacts/fresh-browser-regression-suite/negative-blind-browser-proof/negative-error-safe-state.network.json"
  basis: "Negative ARIA shows alert err: bad_request, retained prompt and confirm/cancel controls, while Chinese success text and completed state are absent; network status is 400."
"Browser proof is from a fresh context and not reused from implementation evidence":
  checked: true
  proof_artifacts:
    - "fresh command stdout in this report"
    - ".audit-artifacts/fresh-browser-regression-suite/results.json"
    - ".audit-artifacts/fresh-browser-regression-suite/junit.xml"
  basis: "I ran Playwright in this isolated worktree during this audit and copied the regenerated proof artifacts into a new audit-artifact family."
```

## Completion Receipt

1. `Surface Area Tested`: Browser UI at `/` through Playwright, Inspector item re-ingest panel, model selector, one-time prompt, confirm/cancel controls, visible zh chrome/statuses, source/original link literal behavior, and intercepted public `/api/**` network paths `/api/runtime/openrouter-models`, `/api/runtime/openrouter/models`, `/api/items/{id}/reingest`.
2. `Vulnerabilities Triggered`: No crashes, 500s, stale completed/configuring contradiction, or unsafe prompt persistence observed. Negative re-ingest returned safe `400` diagnostic and preserved correction controls.
3. `The Blind Verdict`: PASS.

## Product Files Modified

- None.

## Commit Hashes

- PENDING at report creation; final response supplies committed hash.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "headline": "PASS",
  "blocking_status": "CLOSED",
  "proof_gap_status": "NONE",
  "verdict": "PASS",
  "orchestrator_action_hint": "COMPLETE",
  "gate_open_allowed": true,
  "blockers": [],
  "behavioral_proof_register": {
    "success_collapse": "PROVEN",
    "model_list_visible_and_network_compatible": "PROVEN",
    "reingest_payload_prompt_model_extra_prompt": "PROVEN",
    "zh_ui_and_post_reingest_content": "PROVEN",
    "negative_error_safe_state": "PROVEN",
    "fresh_browser_context": "PROVEN"
  }
}
```
