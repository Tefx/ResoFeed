# UI/UX Runtime Contract Retest Failure Retest — Raw Evidence Bundle

**successor_step**: `uiux-runtime-contract-retest-failure-retest`
**evidence_created_by**: `integration-verifier`
**artifact_root**: `docs/audits/artifacts/uiux-design-conformance-audit/`
**raw_log_root**: `docs/audits/artifacts/uiux-design-conformance-audit/runtime-contract-retest-failure-retest-raw/`
**fresh_browser_artifact_root**: `docs/audits/artifacts/uiux-design-conformance-audit/runtime-contract-retest-failure-retest-browser/`

## refs Read Confirmation

- `CONSTITUTION.md` — read. Key passages: runtime/storage dogmas require one Go binary, SQLite/FTS5 only, no vector/RAG/sidecars (`lines 12-24`); source/provenance and generated display fields remain distinct (`lines 38-48`); Feed/Inspector separation and anti-onboarding/settings chrome (`lines 65-74`); OPML/state portability and no folders/tags/sync/history (`lines 76-85`, `118-124`).
- `AGENTS.md` — read via tool reminder. Key passages: one Go binary, SQLite + FTS5, JSON-in/out LLM, flat `internal/resofeed`, single owner token, no accounts/roles, and UI must follow `docs/DESIGN.md` operational labels.
- `docs/ARCHITECTURE.md` — read. Key passages: one deployable Go process serving static SvelteKit app, JSON HTTP, MCP, and ingest loop (`lines 13-21`, `31-53`); language/reprocess and item re-ingest are explicit non-durable operations (`lines 22-29`); source identifiers are preservation anchors (`line 24`).
- `docs/DESIGN.md` — read. Key passages: approved surfaces include `RESOFEED` menu, Source Ledger, language/reprocess utilities, Search, and provenance markers (`lines 418-430`); repeated metadata labels are visual waste and reader surfaces must not spend space on `src:`, `来源标题:`, `条目 URL`, `来源 URL`, `价值:` (`lines 432`, `486-487`, `528-530`, `1033-1058`); language/reprocess must appear only in opened `RESOFEED` utility menu, not persistent chrome (`lines 491-493`, `522`, `1016-1021`, `1072-1078`); anti-feature negative space forbids folders/tags/settings dashboards/job dashboards/activity logs (`lines 1010-1085`).
- `docs/PRD.md` — read. Key passages: first session supports OPML import with folder structures flattened while agent setup/folders/tags/ranking customization must not exist (`lines 67-78`); source/provenance title is literal evidence, localized display title is separate (`lines 83-91`); minimalism forbids inbox-zero, unread counts, archive, holding queues, folders/tag trees, settings screens, and separate human/agent behavior models (`lines 101-113`).
- `docs/audits/uiux-design-conformance-audit.md` — read. Key passage: predecessor closure was summary-only for `uiux-runtime-contract-retest-failure-retest` and claimed lint/build/Vitest/real-server/supplemental/F1-F4/protected deviation success without raw evidence (`lines 6-18`).
- `docs/audits/uiux-design-traceability-matrix.md` — read via grep. Key passages: `DESIGN.FEED.NO_REPEATED_PREFIXES` forbids visible `src:`, `来源标题:`, `条目 URL`, `来源 URL`, `价值:` prefixes in reader surfaces while preserving source accessibility; Source Ledger/doctor are exceptions (`line 29`); anti-feature row anchors SaaS/dashboard/onboarding/settings exclusions (`line 54`).
- `web/package.json` — read. Key passages: canonical frontend commands are `npm run check`, `npm run build`, `vitest run`, and `playwright test --config ./playwright.config.ts` (`lines 6-15`); SvelteKit/Svelte/Vitest/Playwright deps are declared (`lines 16-31`).
- `web/playwright.config.ts` — read. Key passages: `chromium-ci-safe` project exists and excludes live OpenRouter tests (`lines 31-36`); results/test-output reporters are configured (`lines 17-21`).
- `web/tests/e2e/real-server-ui.spec.ts` — read. Key passages: browser-led source import/feed/search assertions reject visible `src:` while checking accessible `Source:` labels (`lines 333-397`); live audit captures Today/Inspector/Search/Doctor/mobile artifacts without API route fixtures (`lines 399-520`); parity test covers Inspector re-ingest, MCP/API parity, and anti-feature tool negative-space (`lines 522-661`).
- `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts` — read. Key passages: fixture opens `RESOFEED` menu, attaches ARIA/screenshot evidence, asserts language/reprocess controls only inside opened menu and no persistent top chrome (`lines 161-205`); current-operation running/blocked status is contextual (`lines 207-255`).

## Raw command evidence

| command_family | exact_command | exit_code | raw_output_ref |
|---|---|---:|---|
| dependency_hydration | `npm --prefix web ci` | 0 | `runtime-contract-retest-failure-retest-raw/01-npm-ci.log` (`added 150 packages`, audited 151 packages; 3 low severity npm audit findings) |
| check_lint | `npm --prefix web run check` | 0 | `runtime-contract-retest-failure-retest-raw/02-npm-check.log` (`svelte-check found 0 errors and 0 warnings`) |
| build | `npm --prefix web run build` | 0 | `runtime-contract-retest-failure-retest-raw/03-npm-build.log` (`vite build`; `✓ built`; `Wrote site to "build"`) |
| combined_ui_contract_vitest | `(workdir web) npm exec -- vitest run src/routes/components/__tests__/feed-search-row-anatomy.test.ts src/routes/components/__tests__/current-operation-utility-placement.test.ts src/routes/components/__tests__/inspector-desktop-reingest-wiring.test.ts src/routes/components/__tests__/inspector-fallback-contract.test.ts src/routes/components/__tests__/content-contract-surfaces.test.ts src/routes/components/__tests__/item-anatomy-localization.test.ts` | 0 | `runtime-contract-retest-failure-retest-raw/04b-combined-ui-contract-vitest-from-web.log` (`Test Files 6 passed (6)`, `Tests 29 passed (29)`) |
| real_server_ui | `(workdir web) npm run test:e2e -- --project=chromium-ci-safe real-server-ui.spec.ts` | 0 | `runtime-contract-retest-failure-retest-raw/05-real-server-ui-chromium-ci-safe.log` (`Running 9 tests`, `9 passed (11.7s)`) |
| supplemental_e2e | `(workdir web) npm run test:e2e -- --project=chromium-ci-safe inspector-source-model-browser-proof.audit.spec.ts feed-search-anatomy.spec.ts current-operation-utility-placement.expected-red.spec.ts` | 0 | `runtime-contract-retest-failure-retest-raw/06-supplemental-e2e-inspector-search-current-operation.log` (`Running 5 tests`, `5 passed (5.8s)`) |
| f1_f4_behavior_register | artifact register | PROVEN | `f1-f4-behavior-register.md` |
| protected_deviation_ledger | artifact ledger | NON_WEAKENING | `protected-deviation-ledger.md` |

Additional raw note: an initial non-canonical Vitest attempt was run from the repository root with `npm --prefix web exec -- vitest ...` and failed because Vite aliases/Svelte imports resolved from the wrong cwd (`runtime-contract-retest-failure-retest-raw/04-combined-ui-contract-vitest.log`, exit 1). The canonical rerun from `web/` passed and is the accepted command evidence above.

## Raw output excerpts

- Dependency hydration: `01-npm-ci.log:2` — `added 150 packages, and audited 151 packages in 1s`; `01-npm-ci.log:7` — `3 low severity vulnerabilities` (WARN; dependency audit finding, not a gate failure for the requested behavior evidence).
- Check/lint: `02-npm-check.log:2-3` — `resofeed-web@0.1.0 check` / `svelte-kit sync && svelte-check`; `02-npm-check.log:8` — `svelte-check found 0 errors and 0 warnings`.
- Build: `03-npm-build.log:2-3` — `resofeed-web@0.1.0 build` / `vite build`; `03-npm-build.log:47-53` — `✓ built`, `Wrote site to "build"`, `✔ done`.
- Combined Vitest: `04b-combined-ui-contract-vitest-from-web.log:17-20` — `Test Files 6 passed (6)`, `Tests 29 passed (29)`.
- Real-server UI: `05-real-server-ui-chromium-ci-safe.log:61-75` — `Running 9 tests using 1 worker`; all 9 named `real-server-ui.spec.ts` tests passed.
- Supplemental e2e: `06-supplemental-e2e-inspector-search-current-operation.log:61-71` — `Running 5 tests using 1 worker`; all 5 current-operation/feed-search/inspector-source-model tests passed.

## Browser/Runtime Artifact Register

| Artifact(s) | Proves |
|---|---|
| `runtime-contract-retest-failure-retest-browser/today-populated-item.aria.txt`, `runtime-contract-retest-failure-retest-browser/today-populated-item.png`, `runtime-contract-retest-failure-retest-browser/feed-desktop.txt`, `runtime-contract-retest-failure-retest-browser/feed-desktop.png`, `runtime-contract-retest-failure-retest-browser/feed-narrow.txt`, `runtime-contract-retest-failure-retest-browser/feed-narrow.png` | Feed provenance remains visible/accessibility-backed without visible `src:` / `来源标题:` reader prefixes. |
| `runtime-contract-retest-failure-retest-browser/search.aria.txt`, `runtime-contract-retest-failure-retest-browser/search.png`, `runtime-contract-retest-failure-retest-browser/search-desktop.txt`, `runtime-contract-retest-failure-retest-browser/search-desktop.png`, `runtime-contract-retest-failure-retest-browser/search-narrow.txt`, `runtime-contract-retest-failure-retest-browser/search-narrow.png` | Search provenance remains visible/accessibility-backed without visible `src:` / `来源标题:` reader prefixes. |
| `runtime-contract-retest-failure-retest-browser/audit-fallback-source-evidence-expanded.*`, `runtime-contract-retest-failure-retest-browser/audit-model-backed-source-text-expanded.*`, `runtime-contract-retest-failure-retest-browser/inspector.aria.txt`, `runtime-contract-retest-failure-retest-browser/inspector.png` | Inspector source disclosure/model/source evidence and failed/fallback states. |
| `runtime-contract-retest-failure-retest-browser/audit-after-reingest-no-durable-state.*` | Behavior-based Inspector re-ingest and no durable prompt/model state after re-ingest. |
| `runtime-contract-retest-failure-retest-browser/utility-menu-open-low-frequency-controls.aria.txt`, `runtime-contract-retest-failure-retest-browser/utility-menu-open-low-frequency-controls.png` | Opened `RESOFEED` utility-menu ARIA/screenshot proof showing `LANG: EN` and `[REPROCESS LIBRARY]` only inside opened menu. |
| `runtime-contract-retest-failure-retest-browser/utility-menu-open-running-operation-status.aria.txt`, `runtime-contract-retest-failure-retest-browser/utility-menu-open-running-operation-status.png` | Opened utility-menu current-operation status proof. |
| `runtime-contract-retest-failure-retest-browser/doctor.aria.txt`, `runtime-contract-retest-failure-retest-browser/doctor.png`, `runtime-contract-retest-failure-retest-browser/mobile-feed.*`, `runtime-contract-retest-failure-retest-browser/mobile-inspector.*`, `runtime-contract-retest-failure-retest-browser/mobile-source-ledger.*`, `runtime-contract-retest-failure-retest-browser/metrics.json`, `runtime-contract-retest-failure-retest-browser/network-log.json`, `runtime-contract-retest-failure-retest-browser/console-log.json`, `runtime-contract-retest-failure-retest-browser/parity-metrics.json` | All real-server live-audit matrix rows, mobile/runtime surfaces, network/API activity, and diagnostic surfaces. |
| `f1-f4-behavior-register.md` | F1-F4 status register and matrix/anti-feature references. |
| `protected-deviation-ledger.md` | Authority-cited non-weakening protected deviation ledger. |

## Behavioral Proof Register

| Behavior | Proof status | Evidence |
|---|---|---|
| Dependency hydration resolves prior `svelte-kit: command not found` verifier blocker. | PROVEN | `01-npm-ci.log`, then `02-npm-check.log` exit 0. |
| Frontend check/lint passes after hydration. | PROVEN | `02-npm-check.log:8`. |
| Frontend production build passes. | PROVEN | `03-npm-build.log:47-53`. |
| Combined UI contract Vitest passes from canonical `web/` cwd. | PROVEN | `04b-combined-ui-contract-vitest-from-web.log:17-20`. |
| Real-server UI chromium-ci-safe proof passes on real Go server surfaces. | PROVEN | `05-real-server-ui-chromium-ci-safe.log:61-75`; copied live-audit artifacts. |
| Supplemental Inspector/source/model/search/current-operation e2e passes. | PROVEN | `06-supplemental-e2e-inspector-search-current-operation.log:61-71`; copied supplemental artifacts. |
| F1-F4 behavior register exists and is successor-specific. | PROVEN | `f1-f4-behavior-register.md`. |
| Protected deviation ledger is authority-cited and non-weakening. | PROVEN | `protected-deviation-ledger.md`. |

## Side Effects

- Allowed dependency hydration occurred in the isolated worktree via `npm --prefix web ci`; `web/node_modules/` is untracked/ignored bootstrap state and is not staged.
- Evidence-only files were added/updated under `docs/audits/` and `docs/audits/artifacts/uiux-design-conformance-audit/`.
- No product implementation files, tests, requirements, `plan.yaml`, or `.git/vectl/claims.json` were changed by this remediation step.
