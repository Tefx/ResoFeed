# Supplemental Runtime Proof Debt Resolution

Step: `post-plan-user-story-conformance-retest-and-final-audit.post-repair-browser-runtime-proof`
Agent: `client-runtime-verifier`

## Steering receipt proof resolution

Command run from `web/`:

```text
npx playwright test --config ./playwright.config.ts tests/e2e/real-server-ui.spec.ts -g "browser-led steering uses deterministic" --output ../.test-artifacts/manual/steering-stale-test-output
```

Observed command result:

```text
Running 1 test using 1 worker
  ✓  1 [chromium-ci-safe] › tests/e2e/real-server-ui.spec.ts:705:1 › @llm-deterministic browser-led steering uses deterministic OpenRouter transport and exposes terse receipt (1.0s)

  1 passed (21.0s)
```

Exact browser assertion proving visible receipt:

```ts
// web/tests/e2e/real-server-ui.spec.ts:708-712
const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
await steer.fill('Push more llm deterministic fixture coverage.');
await page.getByRole('button', { name: 'apply' }).click();

await expect(page.getByRole('status')).toContainText('applied: steering updated · rules:1');
```

Why sufficient under this step's evidence template: the step permits raw command output/exit codes for runtime proof. This Playwright command launched the browser/runtime path and the assertion targets the user-observable `role="status"` receipt after a safe documented browser interaction. Because the assertion passed in a real Chromium run, there is no unresolved final-gate proof gap for steering receipt visibility.

## zh re-ingest browser fixture proof resolution

Command run from `web/`:

```text
npx playwright test --config ./playwright.config.ts tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts --output ../.test-artifacts/manual/zh-reingest-output
```

Observed command result:

```text
Running 2 tests using 1 worker
  ✓  1 [chromium-ci-safe] › tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:162:1 › blind proof: zh model-list route parity and successful item re-ingest collapse controls (820ms)
  ✓  2 [chromium-ci-safe] › tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:236:1 › blind proof: negative re-ingest error keeps correction controls and avoids stale completion (632ms)

  2 passed (5.3s)
```

Committed runtime browser artifacts:

- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-8174c-re-ingest-collapse-controls-chromium-ci-safe/blind-browser-proof/after-positive-success-collapse.aria.txt`
- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-8174c-re-ingest-collapse-controls-chromium-ci-safe/blind-browser-proof/after-positive-success-collapse.png`
- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-8174c-re-ingest-collapse-controls-chromium-ci-safe/blind-browser-proof/after-positive-success-collapse.dom.html`
- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-8174c-re-ingest-collapse-controls-chromium-ci-safe/blind-browser-proof/after-positive-success-collapse.network.json`
- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-cb02b-and-avoids-stale-completion-chromium-ci-safe/blind-browser-proof/negative-error-safe-state.aria.txt`
- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-cb02b-and-avoids-stale-completion-chromium-ci-safe/blind-browser-proof/negative-error-safe-state.png`
- `.test-artifacts/manual/zh-reingest-output/post-closure-reingest-mode-cb02b-and-avoids-stale-completion-chromium-ci-safe/blind-browser-proof/negative-error-safe-state.network.json`

Key ARIA evidence from `after-positive-success-collapse.aria.txt`:

```text
button "打开检查器：Browser i18n re-ingest target"
paragraph: 显式重处理后的中文摘要，足以证明目标语言内容已更新。
paragraph: 显式重处理后的中文核心洞察，说明修复后的浏览器状态。
status "本文重处理状态": 重处理完成 · 搜索已刷新
```

Key network evidence from `after-positive-success-collapse.network.json`:

```json
{
  "method": "POST",
  "path": "/api/items/item_blind_reingest_i18n/reingest",
  "status": 200,
  "payload": {
    "actor_kind": "human",
    "actor_id": "owner",
    "model": "openai/gpt-4.1-mini",
    "prompt": "请用中文重写摘要和核心洞察。"
  }
}
```

Why route-level API fixtures are non-blocking: the required disputed seam was frontend browser liveness and localization after clicking `[确认重处理]`, not Go re-ingest algorithm correctness. The browser route fixture still exercised a real hydrated Svelte UI in Chromium, safe user interactions, DOM/ARIA rendering, focus/control collapse, localized accessible names, visible success state, and negative bad_request robustness. The full Go server path was separately proven by the live-audit real-server run for launch, owner-token, source ledger, ingest, feed, Inspector, search, `/doctor`, and network health. Therefore the fixture use does not create a final-gate blocker for client-runtime liveness.
