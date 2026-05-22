# Blind Browser Proof Artifact Index

Current run: `npm exec playwright test -- --config ./playwright.config.ts tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts`

Test: `blind proof: negative re-ingest error keeps correction controls and avoids stale completion`

Files:

- `negative-error-safe-state.png`
- `negative-error-safe-state.dom.html`
- `negative-error-safe-state.aria.txt`
- `negative-error-safe-state.network.json`

Proof highlights:

- B3/R3: Chinese Inspector fallback/error-safe chrome remains visible.
- B4/R4: error-safe UI preserves model/prompt controls and transient prompt after a rejected re-ingest request.
- Negative proof: no stale success content is rendered after the 400 response.
