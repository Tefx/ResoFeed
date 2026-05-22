# Inspector UI v2.1 Gate Review

Headline: [PASS] Inspector selected-item re-ingest UI has concrete source, rendered, DOM, network, and test evidence for the required DESIGN.md/R3 obligations.

Blocking Status: none.

Proof-Gap Status: none found for gate-opening checklist rows. `CONSTITUTION.md` search returned no files, so no constitution fast-fail clause applies.

Verdict: PASS.

## refs Read Confirmation

- `docs/DESIGN.md` — §Inspector Item Re-ingest requires Inspector-only placement, idle/configuring/confirming/running/complete/conflict/failed/model-list states, temporary model/prompt state, canonical model list route, no provider/settings/modal/toast/spinner/history surfaces; §Language Control requires `LANG: EN/ZH` / `语言: 英文/中文`, `html lang`, and no automatic existing-library rewrite; §Source Identifiers requires URL/source title/source URL/canonical URL/original link unchanged with `translate="no"` or equivalent.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — R3 requires zh localized chrome/statuses, target-language stored/readable content only after explicit reprocess/re-ingest, and literal `source_title`, URL, source URL, canonical URL, original URL protection; R4 forbids persisted prompt/model state and rejects/sends no `language` field.
- `docs/audits/inspector-ui-v21-uiux-audit.md` — UI/UX audit verdict is PASS, with evidence matrix rows for Idle, Configuring, Confirming/Running, Complete, Error/Conflict, and ZH localized chrome; no blocker-bearing PASS_WITH_DEBT.
- `web/src/routes/components/Inspector.svelte` — implementation keeps prompt/model in Svelte component state, resets/collapses on success/item change/cancel, localizes Inspector/status/reingest/model labels, renders source identifiers with `translate` derived from contract, and has no localStorage writes for prompt/model.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| UI-STATES | DESIGN.md §Inspector Item Re-ingest states | rendered proof for idle/configuring/confirming/running/complete/error/conflict/model-list states | UIUX audit lines 13-21; Playwright `inspector-reingest.expected-red.spec.ts` tests 1-5 passed; `.test-artifacts/playwright/test-output/.../inspector-before-reingest-assertions.dom.html`, `inspector-after-reingest-submit.dom.html`, `negative-error-safe-state.dom.html` | PROVEN | yes |
| UI-NEGATIVE | DESIGN.md avoidFor + Do/Don'ts | absence of re-ingest outside Inspector and no forbidden surfaces | `inspector-reingest.expected-red.spec.ts:251-299`; `grep` over `Inspector.svelte` found only sanitizer regex occurrences for archive/history, no settings/provider/toast/spinner/dashboard surface | PROVEN | yes |
| R3-ZH-UI-CHROME-STATUS | Contract R3 lines 77-83 | zh DOM/screenshot proof for html lang, Inspector chrome/statuses/language controls | `inspector-reingest.expected-red.spec.ts:362-385`; `.test-artifacts/.../inspector-zh-before-reingest-red.dom.html`; `.test-artifacts/.../inspector-zh-after-reingest-red.dom.html`; UIUX audit lines 21, 29 | PROVEN | yes |
| R3-ZH-TARGET-CONTENT | Contract R3 lines 85-92 | item-readable content changes only after explicit selected-item re-ingest/reprocess | `post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:117-136, 189-198`; `inspector-reingest.expected-red.spec.ts:375-385`; DOM artifact with Chinese summary/core after explicit reingest | PROVEN | yes |
| R3-LITERAL-SOURCE-IDENTIFIERS | Contract R3 lines 93-100 + DESIGN Source Identifiers | literal identifiers unchanged and `translate="no"` on relevant Inspector/source surfaces | `Inspector.svelte:46-48, 602-612, 680-685`; `post-closure...spec.ts:176-179`; `inspector-reingest.expected-red.spec.ts:257-258, 371-374`; UIUX audit lines 31, 38-41 | PROVEN | yes |
| R4-PROMPT-MODEL-REQUEST-SCOPED | Contract R4 lines 136-145 | prompt/model in request payload only; not persisted; `language` absent | `Inspector.svelte:36-40, 494-500, 534-555, 565-570`; `after-positive-success-collapse.network.json` payload has `model`/`prompt` or `extra_prompt`, no `language`; source grep shows only owner token localStorage writes | PROVEN | yes |
| MODEL-LIST-NETWORK | DESIGN §Inspector Item Re-ingest + Contract R2/R3 | canonical `/api/runtime/openrouter-models` and compatibility proof | command passed; `after-positive-success-collapse.network.json` lines 4-36; `inspector-reingest.expected-red.spec.ts:337-359` | PROVEN | yes |

## Orphan Requirements

None found. The material DESIGN.md and R3/R4 rows have corresponding proof rows above.

## Blockers

None.

## Warnings

- `npm ci` reported 4 dependency vulnerabilities (1 low, 2 moderate, 1 high). This is existing dependency hygiene, not a gate blocker for Inspector UI conformance; no `npm audit fix` was run to avoid product/dependency mutation.

## Notes

- Initial `npm run check` failed because web dependencies were absent (`svelte-kit: command not found`). After verifying no `node_modules/.bin/svelte-kit` was present, `npm ci` installed declared baseline dependencies and targeted checks passed.
- Screenshot/DOM artifacts are generated under `.test-artifacts/playwright/test-output/...`; they are ignored runtime evidence and not committed.

## Gate Decision Basis

| requirement_ref | evidence_ref | status | gate_decision_basis |
| --- | --- | --- | --- |
| R3-ZH-UI-CHROME-STATUS | `docs/audits/inspector-ui-v21-uiux-audit.md:21,29`; `web/tests/e2e/inspector-reingest.expected-red.spec.ts:362-385`; `.test-artifacts/.../inspector-zh-before-reingest-red.dom.html` | PROVEN | zh `html lang`, `检查器`, localized status/chrome, and `语言: 中文` surfaces have rendered DOM/test proof. |
| R3-ZH-TARGET-CONTENT | `web/tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:117-136,189-198`; `.test-artifacts/.../inspector-zh-after-reingest-red.dom.html` | PROVEN | Initial detail remains source/excerpt state; explicit POST changes selected item to Chinese summary/core/body and collapses controls. |
| R3-LITERAL-SOURCE-IDENTIFIERS | `web/src/routes/components/Inspector.svelte:46-48,602-612,680-685`; `web/tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts:176-179`; UIUX audit lines 31,40-41 | PROVEN | Source title/original/source feed/grouped source identifiers retain literal text and `translate="no"`. |

## Behavioral Proof Register

| requirement_ref | behavior_claim | runtime_proof_expected | evidence_ref | status | closure_path | gate_decision_basis |
| --- | --- | --- | --- | --- | --- | --- |
| DESIGN-INSPECTOR-STATES | All named Inspector re-ingest states render with low-chrome controls and collapse after success | Playwright DOM/screenshot artifacts and passing tests | `inspector-reingest.expected-red.spec.ts` tests 1-5; `post-closure...blind-browser-proof.spec.ts` tests 1-2; UIUX audit Evidence Matrix | PROVEN | none | Targeted Playwright suite passed 8/8 and UIUX audit is PASS. |
| DESIGN-NEGATIVE-SPACE | Re-ingest remains Inspector-only; forbidden provider/settings/modal/toast/spinner/history surfaces absent | DOM/source negative checks | `inspector-reingest.expected-red.spec.ts:251-299`; `grep` over `Inspector.svelte` forbidden terms | PROVEN | none | No forbidden UI surface introduced in Inspector source; tests assert no re-ingest affordance before Inspector open and no library re-ingest in panel. |
| R3-ZH-CHROME | zh selected Inspector uses localized chrome/statuses and `html lang="zh-CN"` | Browser DOM/screenshot | `.test-artifacts/.../inspector-zh-before-reingest-red.dom.html`; test line 367 | PROVEN | none | DOM/test proves `zh-CN`, `检查器`, Chinese status/control labels. |
| R3-ZH-TARGET-CONTENT | Language switch alone does not rewrite stored content; explicit selected-item re-ingest changes only selected readable content | Before/after browser proof and fixture state transition | `post-closure...spec.ts:90,117-136,189-198`; `inspector-reingest.expected-red.spec.ts:362-385` | PROVEN | none | Current detail starts as English/source text; only POST reingest mutates fixture to Chinese item returned in response. |
| R3-LITERAL-SOURCES | Source identifiers are literal and non-translatable | DOM/source proof | `Inspector.svelte:46-48,602-612,680-685`; tests line 178-179, 373 | PROVEN | none | Touched Inspector provenance/original/grouped/feed links use `translate="no"` and tests assert visible literal source. |
| R4-NETWORK-REQUEST-SCOPED | Reingest sends model/prompt only in request; no `language`; no prompt/model persistence | Network JSON and source/localStorage grep | `after-positive-success-collapse.network.json`; `grep` localStorage results; test lines 198,221,225 | PROVEN | none | Network payload contains actor/idempotency/model/prompt or extra_prompt and no language; only owner token is persisted in app source. |

## Verification Commands

1. `npm run check && npx playwright test --config ./playwright.config.ts web/tests/e2e/inspector-reingest.expected-red.spec.ts web/tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts web/tests/e2e/inspector-source-model-browser-proof.audit.spec.ts` from `web/` — exit 127 before dependency bootstrap; raw output included `sh: svelte-kit: command not found`.
2. `npm ci && npm run check && npx playwright test --config ./playwright.config.ts web/tests/e2e/inspector-reingest.expected-red.spec.ts web/tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts web/tests/e2e/inspector-source-model-browser-proof.audit.spec.ts` from `web/` — exit 0; raw output included `svelte-check found 0 errors and 0 warnings`, Vite build success, and `8 passed (7.9s)`.

## Orchestrator Action Hint

COMPLETE — gate_open_allowed: true.
