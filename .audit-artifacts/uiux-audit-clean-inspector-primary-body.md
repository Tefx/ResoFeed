## UI/UX Audit Report

### refs Read Confirmation (MANDATORY)
- docs/DESIGN.md — key passages: lines 261-263 require dense but legible archival-index chrome around article content that breathes, and operational labels only; lines 451-459 define the Inspector as source/provenance header, title, original link, extraction status, dense summary, full text/excerpt, why line, and allowed provenance/original links with no recommendation/ad modules; lines 505-534 prohibit SaaS/friendly/onboarding/folders/tags/unread/archive/design-metaphor drift.
- web/tests/e2e/inspector-readable-content-regression.spec.ts — key passage: lines 17-25 define forbidden primary tokens (`function OptanonWrapper() {}`, `--verge-font-body`, `<script`, `<style`, `Skip to main content`, `The homepage The Verge`, `model_latency_error`); lines 87-95 require the Inspector primary body to contain readable article text or `summary unavailable` and zero leaked tokens.
- web/tests/e2e/inspector-dirty-corpus.spec.ts — key passage: lines 49-87 inspect each dirty item, require readable primary expected text, verify `src`, original link, Extraction and Model status labels, and reject raw/provenance payload exposure in primary Inspector text; lines 98-114 attach screenshots/negative assertions and require no violations.
- web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts — key passage: lines 198-230 require selected hover to avoid layout shift and stacked active blocks; lines 233-249 require structured Inspector reading content with Source/Extraction/Model/original-link/provenance separated and no JSON-LD/script/style in primary h2/p; lines 251-261 reject forbidden RSS-reader/SaaS/onboarding language.
- .agents/instructions.md — key passages: lines 3-6 establish docs/DESIGN.md as canonical law; lines 37-41 require dense but legible archival-index aesthetic, functional labels (`RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`), and forbid friendly SaaS copy, onboarding wizards, folders/tags/unread/archive affordances.

[Vibe Check]
- 5D scores: Philosophy / Hierarchy / Execution / Specificity / Restraint = 4 / 4 / 4 / 4 / 5
- Spec spirit: matches the low-chrome archival workbench: paper neutral canvas, square panels, serif article payload, monospace provenance/status, restrained accent/focus only.
- Visual gestalt: Inspector is visibly a supporting reading pane, with source/model/provenance chrome separated from the primary title/body; no decorative SaaS/AI-magic vocabulary or new product concepts observed in reviewed artifacts.
- Primary friction risk: the blue focus outline around the Inspector heading is visually strong in screenshots, but it is functional focus evidence and not a blocker; no layout collision or raw-copy pollution observed.

**Rendered artifacts reviewed**:
- `.test-artifacts/playwright/test-output/inspector-readable-content-ce8e8-tion-and-diagnostic-garbage-chromium-ci-safe/test-finished-1.png`
- `.test-artifacts/playwright/test-output/inspector-readable-content-ce8e8-tion-and-diagnostic-garbage-chromium-ci-safe/trace.zip`
- `.test-artifacts/playwright/results/results.json` attachment `inspector-readable-regression-primary-body.txt` (decoded value in results body: `Readable article polluted by page source boilerplate original link Readable article lead that should be safe for primary Inspector reading copy.`)
- `.test-artifacts/playwright/test-output/inspector-dirty-corpus-dir-d2a72-eed-payloads-and-provenance-chromium-ci-safe/test-finished-1.png`
- `.test-artifacts/playwright/test-output/inspector-dirty-corpus-dir-d2a72-eed-payloads-and-provenance-chromium-ci-safe/attachments/inline-json-ld-inspector-fixed-png-38321fd53bbafa1a9cf70281adb480d361eaaebf.png`
- `.test-artifacts/playwright/results/results.json` attachment `dirty-corpus-negative-assertions.txt` (decoded: `No dirty Inspector violations detected.`)

**Inspector states reviewed**:
- Desktop split-pane Inspector, polluted HTML article route from real browser/e2e harness, Chromium `chromium-ci-safe`, 1280px-wide screenshot.
- Desktop split-pane Inspector, dirty corpus item `inline_json_ld_runtime_item`, with JSON-LD-like source payload, Chromium `chromium-ci-safe`.
- Desktop split-pane Inspector, dirty corpus item `model_error_item`/final selected state showing controlled fallback `summary unavailable`, Chromium `chromium-ci-safe`.
- Navigation/hover/selected-state behavioral coverage from `ui-navigation-hover-inspector-repair.expected-red.spec.ts` under Chromium `chromium-ci-safe`.

**Primary body legibility verdict**: PASS
- Evidence: readable regression screenshot shows the Inspector primary content as the title plus the readable paragraph `Readable article lead that should be safe for primary Inspector reading copy.`; no script/style/nav/model diagnostic tokens are visible in the primary article body. Dirty corpus screenshot shows readable article paragraphs (`Readable lead paragraph that should remain primary. More readable body after dirty payload.`) and controlled fallback (`summary unavailable`) when appropriate.

**Raw source garbage audit**:
- JavaScript/script bodies: PASS
- CSS/style/custom property text: PASS
- JSON-LD/provenance/diagnostic text in primary body: PASS
- navigation/menu boilerplate in primary body: PASS
- `model_latency_error` in primary body: PASS

**Metadata/provenance separation**:
- Metadata/provenance appears in compact monospace support areas: `src: ... · full/partial · high · ok`, `original link`, `why: fresh from configured source`, and collapsed `raw provenance diagnostics`. These are visually below/around the primary serif title/body and not interleaved as article copy. This matches DESIGN.md lines 451-459 and 514.

**DESIGN.md conformance**:
- Dense/legible Inspector: PASS
- Functional labels/tone: PASS
- Muted archival aesthetic/no SaaS magic: PASS
- No unapproved product/design invention: PASS

**behavioral_proof_register**:
- requirement_ref: `docs/DESIGN.md:451-459`
  behavior_claim: Inspector shows source/provenance header, title, original link, extraction/model status, readable body/fallback, why line, and separated raw provenance diagnostics.
  runtime_proof_expected: Browser-rendered Inspector screenshot plus Playwright assertions.
  evidence_ref: `.test-artifacts/playwright/test-output/inspector-readable-content-ce8e8-tion-and-diagnostic-garbage-chromium-ci-safe/test-finished-1.png`; `.test-artifacts/playwright/results/results.json` passed 7/7.
  status: PASS
  closure_path: None.
  gate_decision_basis: Visual inspection plus targeted browser test pass.
- requirement_ref: `web/tests/e2e/inspector-readable-content-regression.spec.ts:17-25,87-95`
  behavior_claim: Polluted article source tokens do not leak into primary Inspector h2/p reading text.
  runtime_proof_expected: Browser-rendered primary-body text attachment and screenshot.
  evidence_ref: results attachment `inspector-readable-regression-primary-body.txt`; screenshot path listed above.
  status: PASS
  closure_path: None.
  gate_decision_basis: Test passed; attachment primary body contains readable title/link/body only and no forbidden tokens.
- requirement_ref: `web/tests/e2e/inspector-dirty-corpus.spec.ts:49-87,98-114`
  behavior_claim: Dirty corpus primary hierarchy hides raw feed payloads/provenance and preserves readable expected text.
  runtime_proof_expected: Dirty corpus screenshots and negative assertion attachment.
  evidence_ref: dirty corpus screenshot paths listed above; results attachment `dirty-corpus-negative-assertions.txt`.
  status: PASS
  closure_path: None.
  gate_decision_basis: Test passed; visual review confirms JSON-LD-like and diagnostic payloads do not appear as article copy.
- requirement_ref: `docs/DESIGN.md:261-277,505-534` and `.agents/instructions.md:37-41`
  behavior_claim: Layout/tone remains archival, muted, operational, and does not invent SaaS/folders/tags/unread/archive/onboarding concepts.
  runtime_proof_expected: Browser screenshots and UI text assertions.
  evidence_ref: readable and dirty corpus screenshots; `ui-navigation-hover-inspector-repair.expected-red.spec.ts` 5/5 passed in results JSON.
  status: PASS
  closure_path: None.
  gate_decision_basis: Visual review and behavioral checks show no unapproved concepts or decorative AI/SaaS styling.

**Closure fields**:
- headline: PASS
- verdict: PASS
- blockers: []
- gate_open_allowed: true
- proof_gap_status: NONE
- blocking_status: CLOSED
- orchestrator_action_hint: COMPLETE

**Commands run**:
- `npm --prefix web run check` — exit 127 initially; failed because `svelte-kit` was missing before dependencies were installed.
- `npm --prefix web ci` — exit 0; installed web dependencies because `web/node_modules` was absent.
- `npm --prefix web run check` — exit 0; `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run test:e2e -- --project=chromium-ci-safe inspector-readable-content-regression.spec.ts` — exit 0; 1/1 passed and generated readable Inspector screenshot/text/trace.
- `npm --prefix web run test:e2e -- --project=chromium-ci-safe inspector-readable-content-regression.spec.ts inspector-dirty-corpus.spec.ts ui-navigation-hover-inspector-repair.expected-red.spec.ts` — exit 0; 7/7 passed and generated dirty corpus screenshot/text/trace.

**Commit hash(es)**:
- Pending at artifact creation time; final response records committed hash.

**Files changed**:
- `.audit-artifacts/uiux-audit-clean-inspector-primary-body.md`

**Gaps/Notes**:
- Proof is desktop Chromium-focused. The step scope emphasized affected Inspector rendering after clean-primary-body retest; mobile/narrow states were not rerun in this audit. This is not blocking for the requested gate because the targeted Inspector browser evidence and prior repair coverage passed.
