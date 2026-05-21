# Inspector Source/Model Browser Proof Audit

## Commands

### Required harness

```text
$ npm exec playwright test -- --config ./playwright.config.ts tests/e2e/inspector-reingest.expected-red.spec.ts
(node:18242) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

> resofeed-web@0.0.0-contract build
> vite build

▲ [WARNING] Cannot find base config file "./.svelte-kit/tsconfig.json" [tsconfig.json]

    tsconfig.json:2:13:
      2 │   "extends": "./.svelte-kit/tsconfig.json",
        ╵              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

vite v6.4.2 building SSR bundle for production...
transforming...
✓ 155 modules transformed.
rendering chunks...
vite v6.4.2 building for production...
transforming...
✓ 167 modules transformed.
rendering chunks...
computing gzip size...
.svelte-kit/output/client/_app/version.json                        0.03 kB │ gzip:  0.05 kB
.svelte-kit/output/client/.vite/manifest.json                      2.81 kB │ gzip:  0.56 kB
.svelte-kit/output/client/_app/immutable/assets/0.CY0PoaA8.css    28.33 kB │ gzip:  5.07 kB
.svelte-kit/output/client/_app/immutable/entry/start.MK9Y5zTF.js   0.08 kB │ gzip:  0.09 kB
.svelte-kit/output/client/_app/immutable/nodes/0.ryg9g2xH.js       0.49 kB │ gzip:  0.34 kB
.svelte-kit/output/client/_app/immutable/nodes/1.3KtD3Z-m.js       0.54 kB │ gzip:  0.34 kB
.svelte-kit/output/client/_app/immutable/chunks/BdyGKox4.js        1.32 kB │ gzip:  0.73 kB
.svelte-kit/output/client/_app/immutable/chunks/DoJSQfNp.js        1.69 kB │ gzip:  0.94 kB
.svelte-kit/output/client/_app/immutable/chunks/D2c8ttWm.js        2.29 kB │ gzip:  1.01 kB
.svelte-kit/output/client/_app/immutable/entry/app.CfDumkgt.js     6.15 kB │ gzip:  2.86 kB
.svelte-kit/output/client/_app/immutable/chunks/kH4vaPyF.js        8.51 kB │ gzip:  3.63 kB
.svelte-kit/output/client/_app/immutable/chunks/Yygdiqmb.js       33.11 kB │ gzip: 12.90 kB
.svelte-kit/output/client/_app/immutable/chunks/DaVcBp4o.js       38.26 kB │ gzip: 14.05 kB
.svelte-kit/output/client/_app/immutable/nodes/2.Do9k8oOc.js      96.06 kB │ gzip: 31.35 kB
✓ built in 384ms
✓ built in 1.27s

Run npm run preview to preview your production build locally.

> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done

Running 3 tests using 1 worker

  ✓  1 [chromium-ci-safe] › tests/e2e/inspector-reingest.expected-red.spec.ts:181:1 › expected-red browser-visible Inspector item re-ingest flow and evidence contract (602ms)
  ✓  2 [chromium-ci-safe] › tests/e2e/inspector-reingest.expected-red.spec.ts:223:1 › expected-red browser DOM shows model-backed source text disclosure contract (249ms)
  ✓  3 [chromium-ci-safe] › tests/e2e/inspector-reingest.expected-red.spec.ts:241:1 › expected-red browser DOM shows OpenRouter model list diagnostics in Inspector selector (243ms)

  3 passed (5.9s)
```

Exit code: `0`.

### Supplemental audit harness

```text
$ npm exec playwright test -- --config ./playwright.config.ts tests/e2e/inspector-source-model-browser-proof.audit.spec.ts
(node:19009) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

> resofeed-web@0.0.0-contract build
> vite build

vite v6.4.2 building SSR bundle for production...
transforming...
✓ 155 modules transformed.
rendering chunks...
vite v6.4.2 building for production...
transforming...
✓ 167 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 394ms
✓ built in 1.29s

Run npm run preview to preview your production build locally.

> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done

Running 1 test using 1 worker

  ✓  1 [chromium-ci-safe] › tests/e2e/inspector-source-model-browser-proof.audit.spec.ts:154:1 › audit browser proves Inspector source disclosure expansion, reset, model options, and no durable prompt/model state (718ms)

  1 passed (4.0s)
```

Exit code: `0`.

## Runtime Artifact Paths

- Required harness screenshots/DOM/ARIA: `.test-artifacts/playwright/test-output/inspector-reingest.expecte-64e94--flow-and-evidence-contract-chromium-ci-safe/inspector-reingest-expected-red/`, `.test-artifacts/playwright/test-output/inspector-reingest.expecte-970fc-ce-text-disclosure-contract-chromium-ci-safe/inspector-reingest-expected-red/`, `.test-artifacts/playwright/test-output/inspector-reingest.expecte-89fd7-stics-in-Inspector-selector-chromium-ci-safe/inspector-reingest-expected-red/`.
- Supplemental audit screenshots/DOM/ARIA: `.test-artifacts/playwright/test-output/inspector-source-model-bro-3e30d--durable-prompt-model-state-chromium-ci-safe/inspector-source-model-browser-proof-audit/`.

## Key Browser Proofs

- Source disclosure collapsed then expanded: `audit-fallback-source-evidence-expanded.aria.txt` includes `group "Source evidence"` and readable source excerpt `Audit RSS source excerpt is readable only after disclosure expansion.`
- Source text reset and expansion on newly selected model-backed item: `audit-model-backed-source-text-expanded.aria.txt` includes `group "Source text"` and readable text `Audit full source text becomes readable when the Source text disclosure expands.`
- Model diagnostics/options: ARIA artifacts include selected `Default model`, `GPT 4.1 Mini (openai/gpt-4.1-mini)`, `Claude 3.5 Sonnet (anthropic/claude-3.5-sonnet)`, and `model list: 2 OpenRouter models available`.
- No durable model/prompt state: supplemental audit asserts `Object.keys(window.localStorage).sort()` equals only `['resofeed.ownerToken']` after selecting a one-time model, submitting with a one-time prompt, and clearing prompt UI; visible Inspector text count for `/settings|history/i` is zero.
