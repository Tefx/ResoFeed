## Final Gate Review Report

**Reviewer**: gate-reviewer (independent of frontend-engineer implementation fix)
**Phase**: ui-navigation-hover-inspector-repair
**Timestamp**: 2026-05-10T21:32:00+08:00

### refs Read Confirmation (MANDATORY)
- `docs/DESIGN.md` — READ. Key passages: focus rings must be visible independent of accent state (lines 271-273); product copy must remain operational and avoid internal metaphors (line 263); feed selected state is a non-layout-shifting marker and hover/focus must not translate (lines 421-423); Inspector opening moves focus to detail heading and original links remain readable (line 461); 44 CSS px touch targets and keyboard support are required (lines 518-519); no layout shift for hover/focus/selected/loading/error states (lines 540-545).
- `web/tests/e2e/ui-navigation-hover-inspector-repair.expected-red.spec.ts` — READ. Confirms fixture-backed nav panel activation, selected-hover stability, JSON-LD primary-copy exclusion, and forbidden product-language assertions; line 238 asserts Inspector heading focus and lines 247-248 reject raw JSON-LD in primary Inspector paragraphs.
- `web/tests/e2e/hit-target-clickability.spec.ts` — READ. Uses real pointer-center diagnostics (`elementFromPoint`, bounding boxes, active panels) and covers SOURCE LEDGER/TODAY, feed open, star, Inspector original link, `/doctor`, OPML import, and source fetch controls; lines 187-189 validate original link hit target and href.
- `web/tests/e2e/keyboard-a11y.expected-red.spec.ts` — READ. The prior blocker target remains meaningful: line 78 test opens Inspector, line 83 locates `original link`, line 84 asserts URL href, and line 85 calls `focusAndAudit(originalLink, 'Inspector original link')` with no skip/fixme/soft downgrade around the focus assertion.
- `web/tests/e2e/feed-row-state-matrix.expected-red.spec.ts` — READ. Verifies selected/hover/focus state matrix, non-layout-shifting boxes, persistent selected marker, focus indicator visibility, and no stacked full-row active block (lines 209-248).
- `web/tests/e2e/inspector-dirty-corpus.spec.ts` — READ. Runs dirty RSS corpus through runtime ingest/server path, asserts feed and Inspector primary text do not expose raw tokens, requires source/extraction/model/original-link affordances, and fails on any accumulated violations (lines 49-87, 90-115).
- `web/tests/e2e/design-artifact-negative-ux.spec.ts` — READ. Captures required design artifacts, checks raw/provenance disclosure, mobile metadata flatness, active-panel drift, and forbidden UX copy; assertions at lines 130-150 and 172-236 are not skipped.
- `web/tests/e2e/keyboard-a11y-helpers.ts` — READ. `focusAndAudit` requires visibility, layout box, programmatic focus, `toBeFocused`, visible focus indicator, and layout stability (lines 50-80); `attachCoverageTable` documents controls covered including Inspector links (lines 122-135).
- `.test-artifacts/playwright/results/results.json` — READ. Static retest artifact shows `stats.expected=15`, `stats.skipped=0`, `stats.unexpected=0`, `stats.flaky=0` (lines 910-918); the original-link test status is passed/expected with trace attachment path at lines 611-653.
- `.test-artifacts/playwright/test-output/keyboard-a11y.expected-red-41b8a-and-Inspector-original-link-chromium-ci-safe/trace.zip` — INSPECTED. `unzip -l` succeeded and listed trace resources, screenshots, network, stacks, and `test.trace`/`0-trace.trace`; artifact exists and is inspectable.

### B-GATE-001 Closure Review
- Prior blocker: `keyboard-a11y.expected-red.spec.ts:78` expected Inspector `original link` to retain focus but observed inactive after async detail hydration.
- Root-cause evidence in implementation: `web/src/routes/+page.svelte:148-154` increments `inspectorFocusRequestId` only on explicit `selectItem`, before async inspect/detail hydration; `web/src/routes/components/Inspector.svelte:179-183` focuses the heading only when `focusRequestId !== handledFocusRequestId`, preventing hydration rerenders from stealing focus after the user focuses `original link`.
- Current behavioral proof: exact required command was run in this final gate after dependency bootstrap and exited 0; Playwright reported `15 passed (27.0s)`, including test 6 `keyboard-a11y.expected-red.spec.ts:78`.
- Blocker status: CLOSED. No evidence of residual nondeterminism: current run and committed retest JSON both show zero flaky/unexpected/skipped results for the 15-test targeted suite.

### Wiring Audit Results (W1-W8 or equivalent)
- W1 event source: PASS — `Feed` selection calls `selectItem`, and `+page.svelte:148-154` is the only audited path that increments the Inspector heading focus request for item open.
- W2 async hydration: PASS — detail loading occurs after request-id increment (`loadItemDetail` at `+page.svelte:135-145`); `Inspector.svelte:179-183` gates heading focus by one-shot request id, so detail replacement does not refocus heading repeatedly.
- W3 focus target semantics: PASS — Inspector heading remains `tabindex="-1"` at `Inspector.svelte:206` for programmatic open focus; original link remains an anchor at `Inspector.svelte:215` and the test forces focus on it via helper.
- W4 keyboard assertion strength: PASS — `keyboard-a11y.expected-red.spec.ts:83-85` still asserts href and focus/audit on original link; `focusAndAudit` uses hard `toBeFocused` at helper line 55.
- W5 panel state: PASS — nav/surface state wiring remains covered by `ui-navigation-hover...spec.ts:171-179`, `182-195`, and `hit-target-clickability.spec.ts:164-168`, `202-219`.
- W6 hit target/obstruction: PASS — pointer probes use bounding box and `elementFromPoint` in `hit-target-clickability.spec.ts:58-128` and `ui-navigation-hover...spec.ts:113-140`.
- W7 JSON-LD/provenance/mobile regression coverage: PASS — covered by `ui-navigation-hover...spec.ts:233-249`, `inspector-dirty-corpus.spec.ts:90-115`, and `design-artifact-negative-ux.spec.ts:172-236`.
- W8 artifact traceability: PASS — `.test-artifacts/playwright/results/results.json` includes all 15 expected tests; trace zip for the original-link test is present and inspectable.

### Escape Hatch Audit Results
- `@invar:allow`: none found in searched TypeScript/Svelte sources.
- Test escape hatches in scoped tests: no `test.skip`, `test.fixme`, or `.only` found in the six targeted spec/helper files. Only unrelated `real-server-ui.spec.ts` contains deterministic OpenRouter-key skips outside this gate scope.
- Assertions were not lowered to non-blocking for the original-link focus path; `focusAndAudit` retains hard focus assertion and soft checks only for focus-visual/layout stability.

### Smoke/Liveness Evidence
- Initial final-gate command: `npm --prefix web run check && npm --prefix web run test:e2e -- --project=chromium-ci-safe ui-navigation-hover-inspector-repair.expected-red.spec.ts hit-target-clickability.spec.ts keyboard-a11y.expected-red.spec.ts feed-row-state-matrix.expected-red.spec.ts inspector-dirty-corpus.spec.ts design-artifact-negative-ux.spec.ts` failed before product execution with `sh: svelte-kit: command not found`.
- Bootstrap per instruction: `npm --prefix web ci` exited 0, adding 150 packages; npm audit reported 3 low severity vulnerabilities (warning, not product gate blocker).
- Exact full targeted verification after bootstrap: `npm --prefix web run check && npm --prefix web run test:e2e -- --project=chromium-ci-safe ui-navigation-hover-inspector-repair.expected-red.spec.ts hit-target-clickability.spec.ts keyboard-a11y.expected-red.spec.ts feed-row-state-matrix.expected-red.spec.ts inspector-dirty-corpus.spec.ts design-artifact-negative-ux.spec.ts` exited 0. `svelte-check found 0 errors and 0 warnings`; Playwright ran 15 tests and reported `15 passed (27.0s)`.
- Static artifact proof: `.test-artifacts/playwright/results/results.json` from prior retest shows 15 expected, 0 skipped, 0 unexpected, 0 flaky; final run refreshed local artifacts and trace zips.

### Integration-vs-Fixture Distinction
- Fixture-backed Playwright proof: `ui-navigation-hover-inspector-repair.expected-red.spec.ts` and `feed-row-state-matrix.expected-red.spec.ts` route API responses directly in browser fixtures; useful for deterministic UI state and JSON-LD assertions.
- Runtime fixture/server proof: `hit-target-clickability.spec.ts`, `keyboard-a11y.expected-red.spec.ts`, `inspector-dirty-corpus.spec.ts`, and `design-artifact-negative-ux.spec.ts` use the E2E artifact root, fixture feed/server, OPML import, ingest actions, and built web app flow; this is stronger than static DOM-only evidence but still fixture-backed, not production RSS/LLM traffic.
- Static artifact proof: committed `.test-artifacts/playwright/results/results.json`, JUnit/html report, screenshots, and trace zips provide replayable proof but are not by themselves runtime liveness.
- Prior real runtime blind proof: no new live external runtime probe was required or performed in this final gate; scoped gate is keyboard/focus nondeterminism in the comprehensive targeted Chromium fixture suite.

### CLI Executability Matrix
| CLI surface | Touched by phase | Verification | Status |
| --- | --- | --- | --- |
| Go/server CLI `cmd/resofeed` | No | N/A for UI focus remediation; Playwright build uses test harness binary artifacts only | N/A |
| Web npm scripts | Yes, verification only | `npm --prefix web run check` and exact `npm --prefix web run test:e2e -- --project=chromium-ci-safe ...` | PASS |
| Product user CLI | No | No CLI contract modified | N/A |

### Behavioral Proof Register
| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| B-GATE-001 | Inspector heading autofocus must not steal focus from original link after hydration | Full targeted Playwright suite green, including `keyboard-a11y.expected-red.spec.ts:78` | Final command output: `15 passed`; `results.json:611-653` | PASS | One-shot focus request id in `+page.svelte:148-154` and `Inspector.svelte:179-183` | PASS |
| DESIGN focus | Focus rings visible and keyboard navigation supported | Keyboard a11y tests and helper hard focus checks | `keyboard-a11y-helpers.ts:50-80`; final command | PASS | Assertions retained | PASS |
| DESIGN selected state | Selected/hover/focus do not layout-shift or stack ambiguous active blocks | Feed row state matrix and UI repair tests | `feed-row-state-matrix.expected-red.spec.ts:209-248`; final command | PASS | Covered in 15-test suite | PASS |
| JSON-LD/provenance | Raw metadata stays out of primary reading copy | UI repair, dirty corpus, design negative UX tests | `ui-navigation-hover...spec.ts:247-248`; `inspector-dirty-corpus.spec.ts:114`; final command | PASS | Covered in comprehensive targeted suite | PASS |
| Mobile/design artifact | Mobile metadata and design artifacts remain covered | Design artifact negative UX spec | `design-artifact-negative-ux.spec.ts:172-236`; final command | PASS | Covered in comprehensive targeted suite | PASS |

## Gate Decision
verdict: PASS
headline: PASS
blockers: []
gate_open_allowed: true
proof_gap_status: NONE
blocking_status: CLOSED
orchestrator_action_hint: COMPLETE

### Action Summary
- Independently re-read required specs/tests/artifacts, audited focus wiring and assertion strength, inspected the original-link trace zip, bootstrapped missing web dependencies, reran the exact comprehensive targeted command, and refreshed evidence artifacts.

### Verification Run (Command + Exit Code)
- `npm --prefix web run check && npm --prefix web run test:e2e -- --project=chromium-ci-safe ui-navigation-hover-inspector-repair.expected-red.spec.ts hit-target-clickability.spec.ts keyboard-a11y.expected-red.spec.ts feed-row-state-matrix.expected-red.spec.ts inspector-dirty-corpus.spec.ts design-artifact-negative-ux.spec.ts` — initial exit 127 due missing `svelte-kit` bootstrap state.
- `npm --prefix web ci && npm --prefix web run check && npm --prefix web run test:e2e -- --project=chromium-ci-safe ui-navigation-hover-inspector-repair.expected-red.spec.ts hit-target-clickability.spec.ts keyboard-a11y.expected-red.spec.ts feed-row-state-matrix.expected-red.spec.ts inspector-dirty-corpus.spec.ts design-artifact-negative-ux.spec.ts` — exit 0; `svelte-check found 0 errors and 0 warnings`; `15 passed (27.0s)`.
- `unzip -l .test-artifacts/playwright/test-output/keyboard-a11y.expected-red-41b8a-and-Inspector-original-link-chromium-ci-safe/trace.zip` — exit 0; trace archive listed 36 files.

### Artifacts Modified
- Added this gate report: `.audit-artifacts/final-gate-keyboard-a11y-remediation.md`.
- Refreshed Playwright evidence under `.test-artifacts/playwright/` by rerunning the required suite.
