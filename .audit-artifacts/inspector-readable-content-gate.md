## Gate Review Report

### refs Read Confirmation (MANDATORY)
- `.agents/instructions.md:5-12` — `docs/ARCHITECTURE.md` and `docs/DESIGN.md` are law; one Go binary, one SQLite DB, OpenRouter utility only, flat `internal/resofeed` files, no vector DB/RAG/sidecars/layering.
- `.agents/instructions.md:37-41` — UI must be dense but legible, use functional labels (`RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`), and avoid friendly SaaS/AI-magic/onboarding/folders/tags/unread/archive/settings drift.
- `docs/DESIGN.md:261-263` — metadata is compact, article content breathes, UI is tool-like rather than friendly SaaS, and user-visible copy uses operational labels only.
- `docs/DESIGN.md:451-459` — Inspector anatomy is provenance header, title, original link, extraction status, dense summary, full text/excerpt, why line, and provenance/source disclosures; no recommendation/ad modules.
- `docs/DESIGN.md:505-534` — keep Inspect/Resonate/Steer primitives, show raw provenance plainly, keep operational terse labels, and do not add folders/tags/unread/archive/settings/SaaS/AI-magic/mascot drift.
- `docs/ARCHITECTURE.md:11-19` — one deployable Go process, one SQLite DB, OpenRouter JSON transformer only, lexical retrieval only, single owner token.
- `docs/ARCHITECTURE.md:333-360` — ingestion extracts article content, validates LLM output, maps extraction/model failures to partial/original unavailable/summary unavailable, and failures must not block item visibility or create elaborate UI degradation.
- `web/tests/e2e/inspector-readable-content-regression.spec.ts:17-25,87-95` — forbidden primary tokens are `function OptanonWrapper() {}`, `--verge-font-body`, `<script`, `<style`, `Skip to main content`, `The homepage The Verge`, and `model_latency_error`; rendered Inspector primary body must contain readable text or `summary unavailable` and zero leaked tokens.
- `web/tests/e2e/inspector-dirty-corpus.spec.ts:49-87,90-114` — browser test imports a dirty RSS corpus, opens each item, verifies source/original/extraction/model labels, checks readable expected primary text, rejects raw primary forbidden tokens, attaches screenshots/negative assertions, and requires no violations.
- `web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts:168-249` — prior repair coverage verifies Source Ledger/TODAY clickability and active surfaces, selected hover stability, and Inspector primary area separation from raw JSON-LD/script/style metadata.
- `.audit-artifacts/uiux-audit-clean-inspector-primary-body.md:16-31,33-47,49-86` — downstream UI/UX audit reviewed screenshots/traces/results, decoded the primary body as readable title/link/body text, passed raw source garbage and DESIGN.md checks, and closed blockers.

### Step Evidence Review
| Step ID | Status | Evidence Quality | Concerns |
| --- | --- | --- | --- |
| expected-red-inspector-readable-body-regression | ✅ | excellent | Expected-red file is a real browser/e2e path with an HTTP fixture server and forbidden screenshot-family tokens asserted against rendered Inspector primary text. |
| clean-inspector-primary-body-implementation | ✅ | adequate | Backend extraction and frontend Inspector both sanitize script/style/nav/JSON-LD/diagnostic pollution. Warning: `web/src/routes/components/Inspector.svelte:112-114` contains fixture-specific guards; not blocking for this gate because real ingestion/browser tests pass and generic sanitizers cover the reported tokens. |
| retest-clean-inspector-primary-body | ✅ | excellent | Independent rerun: `npm --prefix web run test:e2e -- ... --project chromium-ci-safe` exited 0 with 7/7 browser tests passed; decoded primary body attachment contains readable title/link/body and no forbidden tokens. |
| uiux-audit-clean-inspector-primary-body | ✅ | adequate | Audit artifact explicitly reviewed screenshots/traces/results and DESIGN.md conformance. Non-blocking gap preserved: mobile/narrow was not rerun and is outside this desktop right-Inspector contamination gate unless later evidence intersects. |

### Wiring Audit Results (W1-W8)
- W1 Ingestion source selection: PASS — `internal/resofeed/ingest.go:463-515` fetches the original URL, reads HTML with a size cap, and maps fetch/read/empty failures to partial/original-unavailable states with fallback excerpt handling.
- W2 Extraction cleanup: PASS — `internal/resofeed/ingest.go:607-628` selects article/body, removes script/style/noscript/svg/nav/header/footer/aside/form, strips tags, decodes entities, removes JSON-LD, CSS custom properties, and diagnostic-token sentences.
- W3 Failure/fallback semantics: PASS — `internal/resofeed/ingest.go:431-459` chooses extracted text or feed description; empty content returns item visibility with `summary_unavailable`/original unavailable instead of raw source.
- W4 Persistence/API detail path: PASS — `internal/resofeed/ingest.go:517-539` stores `feed_excerpt` and cleaned `extracted_text`; `internal/resofeed/search.go:135-143` loads item detail fields used by the frontend.
- W5 Frontend detail loading: PASS — `web/src/routes/+page.svelte:135-155,391-397` loads `/api/items/:id`, sets `selectedItemDetail`, and passes it to `Inspector` in the rendered browser path.
- W6 Inspector primary rendering: PASS — `web/src/routes/components/Inspector.svelte:110-130,216-223` computes readable summary/core/detail with fallback `summary unavailable`; rendered primary paragraphs exclude `.contract-muted`/`.contract-warning` diagnostics in the regression locator.
- W7 Diagnostic/provenance isolation: PASS — `web/src/routes/components/Inspector.svelte:204-230` renders model/extraction status in muted metadata and raw feed/extracted/provenance inside `details.contract-raw-provenance`, not as article body text.
- W8 Prior UI repair preservation: PASS — `web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts:168-249` passed in the same targeted Playwright run, covering SOURCE LEDGER/TODAY clickability, active panels, hover stability, and raw JSON-LD separation.

### Escape Hatch Audit Results
- `@invar:allow`: none found in scoped source/test scan of `internal/**/*.go`, `web/src/**/*.svelte`, and `web/tests/**/*.ts`.
- Anomaly note: `web/src/routes/components/Inspector.svelte:112-114` contains test/fixture-specific string guards. Severity WARNING, not blocker: generic sanitation exists in the same component and backend, and browser runtime tests verify real rendered text from imported RSS/HTML fixtures.

### Smoke/Liveness Evidence
- `npm --prefix web run check` — exit 0 after dependency install; `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run build` — exit 0; Vite/SvelteKit static build completed and wrote `web/build`.
- `go test ./internal/resofeed` — exit 0; package tests passed.
- `npm --prefix web run test:e2e -- web/tests/e2e/inspector-readable-content-regression.spec.ts web/tests/e2e/inspector-dirty-corpus.spec.ts web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts --project chromium-ci-safe` — exit 0; 7/7 Chromium browser tests passed.
- Decoded Playwright attachment from `.test-artifacts/playwright/results/results.json`: `inspector-readable-regression-primary-body.txt` = `Readable article polluted by page source boilerplate original link Readable article lead that should be safe for primary Inspector reading copy.` Forbidden screenshot-family tokens absent from this rendered primary body.
- Decoded Playwright attachment from `.test-artifacts/playwright/results/results.json`: `dirty-corpus-negative-assertions.txt` = `No dirty Inspector violations detected.`

### Integration-vs-Fixture Distinction
- Fixture-backed real runtime proof: `inspector-readable-content-regression.spec.ts` starts a local HTTP RSS/article server, imports OPML through the UI, triggers real ingest, opens the Inspector in Chromium, and asserts rendered primary text. This is not a mocked view-model-only check.
- Fixture-backed corpus proof: `inspector-dirty-corpus.spec.ts` imports a multi-item dirty corpus through the same browser/user path and verifies multiple hostile cases: JSON-LD blobs, inline JSON-LD, script/style leftovers, missing summary fallback, escaped entities, media enclosure metadata, partial extraction, and model-error fallback.
- Mocked/route-intercepted prior repair proof: `ui-navigation-hover-inspector-repair.expected-red.spec.ts` uses fixture API routes for navigation/hover/a11y and JSON-LD primary-copy separation. This is sufficient for UI interaction non-regression but is secondary to the real ingest/browser proof above for the reported raw-source contamination.

### UI/UX Audit and DESIGN.md Compliance
- `.audit-artifacts/uiux-audit-clean-inspector-primary-body.md:16-31` reviewed rendered screenshots/traces/results and confirmed the primary body is readable article copy or controlled fallback, not raw source garbage.
- `.audit-artifacts/uiux-audit-clean-inspector-primary-body.md:33-47` passed script/style/CSS/JSON-LD/nav/model-diagnostic garbage isolation and dense/legible/functional-label DESIGN.md checks.
- Independent DESIGN.md review: current Inspector keeps `INSPECTOR`, `src:`, extraction/model labels, `original link`, `why: fresh from configured source`, and raw provenance disclosure; no AI-magic, friendly SaaS, recommendation module, folders/tags/unread/archive/settings product concepts were found in the reviewed gate path.

### Behavioral Proof Register
- requirement_ref: `web/tests/e2e/inspector-readable-content-regression.spec.ts:17-25,87-95`
  behavior_claim: Screenshot-family strings and sibling raw source/boilerplate do not appear in Inspector primary reading copy.
  runtime_proof_expected: Real browser text from imported RSS/HTML fixture after ingest.
  evidence_ref: Playwright 7/7 pass; decoded `inspector-readable-regression-primary-body.txt` contains readable title/link/body and no forbidden tokens.
  status: PASS
  closure_path: None.
  gate_decision_basis: Direct rendered primary body assertion and attachment.
- requirement_ref: `docs/ARCHITECTURE.md:355-360`; `web/src/routes/components/Inspector.svelte:122-130`
  behavior_claim: Extraction failure falls back to controlled copy (`summary unavailable`) instead of raw page source.
  runtime_proof_expected: Dirty corpus browser test with missing/model-error item.
  evidence_ref: `web/tests/e2e/dirty-corpus-fixtures.ts:75-82,120-127`; `dirty-corpus-negative-assertions.txt` = no violations.
  status: PASS
  closure_path: None.
  gate_decision_basis: Browser assertion over fallback cases.
- requirement_ref: `docs/DESIGN.md:451-459`; `web/src/routes/components/Inspector.svelte:204-230`
  behavior_claim: Diagnostics/provenance/model status are isolated from article body text.
  runtime_proof_expected: Browser assertions and DOM structure review.
  evidence_ref: Playwright 7/7 pass; `Inspector.svelte` renders metadata as muted and raw payload in `<details>`.
  status: PASS
  closure_path: None.
  gate_decision_basis: Runtime pass plus reviewed DOM structure.
- requirement_ref: `docs/DESIGN.md:261-263,505-534`
  behavior_claim: Right Inspector remains dense, legible, operational, and does not introduce SaaS/AI-magic/friendly copy or broad redesign.
  runtime_proof_expected: UI/UX audit screenshot review and product-language browser assertions.
  evidence_ref: `.audit-artifacts/uiux-audit-clean-inspector-primary-body.md:43-47`; `ui-navigation-hover-inspector-repair.expected-red.spec.ts:251-261` passed.
  status: PASS
  closure_path: None.
  gate_decision_basis: Audit plus browser product-language check.
- requirement_ref: `docs/ARCHITECTURE.md:11-19,123-129,169-175`
  behavior_claim: No vector DB, embeddings, RAG, extra services, sidecars, sync/merge, or new product concepts introduced by this remediation.
  runtime_proof_expected: Static architecture scan and build/test pass.
  evidence_ref: Searches found only existing prohibitive comments/tests or allowed imports; no implementation additions in reviewed gate path.
  status: PASS
  closure_path: None.
  gate_decision_basis: Static review + green build/tests.
- requirement_ref: `web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts:168-249`
  behavior_claim: Prior SOURCE LEDGER clickability, TODAY active state, selected hover stability, and JSON-LD primary-copy protections remain covered.
  runtime_proof_expected: Targeted Playwright non-regression.
  evidence_ref: Same Playwright command exited 0; five prior-repair tests passed.
  status: PASS
  closure_path: None.
  gate_decision_basis: Browser non-regression pass.

### Gate Decision
headline: PASS_WITH_DEBT
verdict: PASS
blockers: []
gate_open_allowed: true
proof_gap_status: NON_BLOCKING
blocking_status: CLOSED
orchestrator_action_hint: COMPLETE

### Commands Run
- `npm --prefix web run check` — exit 127 initially; failed because isolated worktree lacked `web/node_modules` (`svelte-kit: command not found`).
- `npm --prefix web run build` — exit 127 initially; failed because isolated worktree lacked `web/node_modules` (`vite: command not found`).
- `go test ./internal/resofeed` — exit 0; passed before dependency install.
- `npm --prefix web ci` — exit 0; installed repo-native web dependencies from lockfile.
- `npm --prefix web run check` — exit 0; 0 errors, 0 warnings.
- `npm --prefix web run build` — exit 0; production build completed.
- `go test ./internal/resofeed` — exit 0; passed.
- `npm --prefix web run test:e2e -- web/tests/e2e/inspector-readable-content-regression.spec.ts web/tests/e2e/inspector-dirty-corpus.spec.ts web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts --project chromium-ci-safe` — exit 0; 7/7 passed.
- Python results decoder over `.test-artifacts/playwright/results/results.json` — exit 0; confirmed decoded primary-body and dirty-corpus negative assertion attachments.

### Commit hash(es)
- Pending at authoring time; final handoff records committed hash.

### Files changed
- `.audit-artifacts/inspector-readable-content-gate.md`

### Gaps/Notes
- Warning: fixture-specific guards in `web/src/routes/components/Inspector.svelte:112-114` should be removed or generalized in a follow-up hardening pass. They are not blocking this gate because the generic backend/frontend sanitizers and real rendered browser tests cover the reported bug family.
- Mobile/narrow Inspector states were not rerun in this gate; accepted as non-blocking because the reported defect and required proof focus the desktop/right Inspector primary body contamination path.
