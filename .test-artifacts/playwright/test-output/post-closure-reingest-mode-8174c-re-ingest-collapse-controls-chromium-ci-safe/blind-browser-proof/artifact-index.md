# Blind Browser Proof Artifact Index

Current run: `npm exec playwright test -- --config ./playwright.config.ts tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts`

Test: `blind proof: zh model-list route parity and successful item re-ingest collapse controls`

Files:

- `before-positive-confirm.png`
- `before-positive-confirm.dom.html`
- `before-positive-confirm.aria.txt`
- `before-positive-confirm.network.json`
- `after-positive-success-collapse.png`
- `after-positive-success-collapse.dom.html`
- `after-positive-success-collapse.aria.txt`
- `after-positive-success-collapse.network.json`

Proof highlights:

- B1/R2: `after-positive-success-collapse.network.json` records canonical `/api/runtime/openrouter-models` status `200` and compatibility `/api/runtime/openrouter/models` status `200` with identical model-list responses.
- B3/R1-R4 UIUX: `after-positive-success-collapse.aria.txt` records Chinese Inspector chrome, collapsed idle re-ingest affordance, and Chinese target-language content.
- B4/R4: `after-positive-success-collapse.network.json` records canonical `prompt` POST and compatibility `extra_prompt` POST, both without `language`.
