# UI Remediation R1-R8 Canonical Visual Evidence Repair — 2026-05-11

Tester: integration-verifier  
Worktree: `.vectl/worktrees/ui-remediation-retest-closure.urrc-canonical-visual-evidence-repair`  
Branch: `vectl/step-ui-remediation-retest-closure.urrc-canonical-visual-evidence-repair`

## refs Read Confirmation

- `docs/DESIGN.md` — read. Key authority: product UI must be dense but legible; operational labels only; Inspector shows source/provenance, original link, extraction status, readable full text; Source Ledger is flat with source rows and state export/import actions in its footer.
- `docs/audits/ui-remediation-retest-2026-05-11.md` — NOT READ: file is absent in this isolated worktree (`File not found` from read attempt).
- `audits/ui-remediation-r1-second-focused-browser-retest-2026-05-11.md` — read. It records the prior focused R1 PASS and decoded R1 text, but does not itself enumerate R1-R8 as `PROVEN` or set `gate_open_allowed: true`.
- `web/tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts` — read. It imports the dirty corpus through the real browser flow, asserts R1 readable prose is in `.inspector-reading`, attaches `r1-primary-inspector-text.txt`, and rejects the two forbidden strings in primary Inspector text.
- `web/tests/e2e/full-ui-design-conformance.expected-red.spec.ts` — read as the visual proof source for R2-R8. It captures mobile Source Ledger, desktop Source Ledger/action cluster, feed/Inspector/search screenshots, and verifies lower-case metadata, single Inspector provenance, Today/search separation, row grammar, and state portability footer/action labels.

## Closure Signals

step_intent: evidence_repair  
expected_result: green_evidence_bundle  
observed_result: PASS  
verdict: PASS  
headline: PASS  
blockers: []  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE  
product_implementation_files_modified: no

## Verification Run

Command run from `web/`:

```text
npm run test:e2e -- --project=chromium-ci-safe ui-remediation-r1-r8-browser-retest.spec.ts full-ui-design-conformance.expected-red.spec.ts
```

Exit code: `0`

Raw output excerpt:

```text
Running 3 tests using 1 worker
  ✓  1 [chromium-ci-safe] › tests/e2e/full-ui-design-conformance.expected-red.spec.ts:177:1 › expected-red UI/design conformance matrix covers findings F1-F47 on the real app (1.4s)
  ✓  2 [chromium-ci-safe] › tests/e2e/full-ui-design-conformance.expected-red.spec.ts:325:1 › expected-red docs/ui-preview.html drift contract covers findings F48-F52 (1ms)
  ✓  3 [chromium-ci-safe] › tests/e2e/ui-remediation-r1-r8-browser-retest.spec.ts:75:1 › R1-R8 Inspector browser retest preserves R1 prose while keeping dirty payloads out of primary reading copy (549ms)

  3 passed (6.9s)
```

Suspicious-green checks: `3 passed`, `0 skipped`, `0 unexpected`, no `0 tests` condition. These are Playwright browser tests against the app runtime and local dirty-corpus/feed fixtures, not static-only assertions.

## Evidence Bundle

Evidence bundle root: `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/`  
Manifest: `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/manifest.json`  
Playwright JSON result source: `.test-artifacts/playwright/results/results.json`

## Canonical Visual Evidence Repair Handoff

**Product files modified**: NO  
**Canonical handoff artifact**: `audits/ui-remediation-r1-r8-canonical-visual-evidence-repair-2026-05-11.md`  
**Evidence bundle root**: `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/`  
**gate_open_allowed**: true  
**blockers**: []

| Requirement | Status | Screenshot path(s) | Trace/DOM/a11y path(s) | Notes |
|---|---|---|---|---|
| R1 Inspector primary text excludes forbidden strings and includes readable prose | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/ui-remediation-r1-r8-browser-retest--screenshot.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/ui-remediation-r1-r8-browser-retest--trace.zip`; text: `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/ui-remediation-r1-r8-browser-retest--r1-primary-inspector-text.txt.txt` | Attached primary text contains `Second readable paragraph confirms the body is not empty after bounded cleanup.` and omits `Follow us on Twitter for more newsletters` plus `summary-like lead repeated by the site`. |
| R2 mobile 390x844 Source Ledger geometry does not collapse | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--narrow-source-ledger-390x844.png.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip` | Full conformance test sets viewport to 390x800 and captures `narrow-source-ledger-390x844.png` after opening ledger with imported source/actions visible. |
| R3 lower-case metadata grammar/readability is visible and legible | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--desktop-authenticated-feed-inspector-with-items-1280x900.png.png`; `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--narrow-authenticated-feed-390x844.png.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip` | Test rejects capitalized `Src:`, `Agent:`, `Partial:`, `Err:` and verifies `src:` plus compact time/summary grammar. |
| R4 Inspector provenance is singular, not duplicated | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--desktop-authenticated-feed-inspector-with-items-1280x900.png.png`; `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/ui-remediation-r1-r8-browser-retest--screenshot.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip`; `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/ui-remediation-r1-r8-browser-retest--trace.zip` | Browser assertions require one Inspector complementary surface for opened item/title, visible source provenance, original link, and calm `why:`/provenance disclosure without duplicated diagnostic hierarchy. |
| R5 Search context/receipt does not leak into Today | PROVEN | Search: `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--narrow-search-form-and-results-390x844.png.png`; Today after search: `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--narrow-authenticated-feed-390x844.png.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip` | Test navigates from `/doctor` to search, captures search, then runs `today` and verifies `Today feed items` before capturing the fresh Today surface. |
| R6 duplicate Inspect DOM/a11y absence | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--desktop-authenticated-feed-inspector-with-items-1280x900.png.png`; `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--desktop-search-results-1280x900.png.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip` | Trace contains the DOM snapshots for the browser run. Assertions require normal feed/search Inspect affordances and no extra persistent navigation/sidebar/tablist or duplicate active primary surface. |
| R7 Source Ledger row grammar is visually intact | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--desktop-source-ledger-with-actions-1280x900.png.png`; `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--narrow-source-ledger-390x844.png.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip` | Test verifies Source Ledger DOM contract, visible URL column, `src:`, `status: ok`, `last_fetch`, `last_ingest`, `[FETCH]`, `[DELETE]`, and `[IMPORT OPML]`. |
| R8 State Portability ledger footer/action cluster is visually intact | PROVEN | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--desktop-source-ledger-with-actions-1280x900.png.png`; `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--narrow-source-ledger-390x844.png.png` | `artifacts/ui-remediation-r1-r8-canonical-visual-evidence-2026-05-11/full-ui-design-conformance.expected-red--trace.zip` | Test verifies `[EXPORT STATE]`, `[IMPORT STATE]`, no standalone State Portability heading, and `import replaces active sources, rules, and stars`. |

## Behavioral Proof Register

```yaml
behavioral_proof_register:
  R1_inspector_primary_text_cleanup: PROVEN
  R2_mobile_source_ledger_geometry: PROVEN
  R3_lowercase_metadata_readability: PROVEN
  R4_single_inspector_provenance: PROVEN
  R5_search_context_not_leaking_into_today: PROVEN
  R6_duplicate_inspect_dom_a11y_absence: PROVEN
  R7_source_ledger_row_grammar: PROVEN
  R8_state_portability_footer_action_cluster: PROVEN
```

## Gaps / Notes

- `docs/audits/ui-remediation-retest-2026-05-11.md` was absent in this worktree and therefore could not be read.
- Product implementation files were not modified.
