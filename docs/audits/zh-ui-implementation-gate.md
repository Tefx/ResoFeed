# zh UI Implementation Gate

Headline: OPEN — residual zh accessible-name blockers B-ZH-IMPL-01 and B-ZH-IMPL-02 are closed after `zh-ui-accessible-name-residual-fix`; the broad zh implementation is ready for runtime verification closure.

Blocking Status: no blockers.

Proof-Gap Status: all matrix-owned rows ZH-SHELL-01 through ZH-TEST-10 have source, test, and/or explicit runtime-verification ownership evidence. The prior verification-bypass path is closed because the broad spec now locates the affected Steer and Feed controls by zh accessible names, not English fallback names.

Verdict: **[PASS]**

Gate open allowed: **true**

Orchestrator action hint: **COMPLETE**

## refs Read Confirmation

- `CONSTITUTION.md` — NOT READ: workspace search `**/CONSTITUTION.md` found no file in the isolated worktree.
- `docs/contracts/zh-ui-chrome-localization-matrix.md` — read. Key passages: binding constraints forbid new i18n framework/dependency/backend/storage/runtime expansion and require literal source/model/brand-token preservation at lines 11-18; operational-token exception at lines 19-25; source surfaces at lines 27-38; matrix rows ZH-SHELL-01 through ZH-TEST-10 at lines 41-52; non-translation register at lines 54-62; downstream runtime verification minimum at lines 64-72.
- `docs/audits/zh-ui-contract-tests-gate.md` — read. Key passage: contract/test gate opened because matrix rows were mapped to expected-red coverage, no new dependencies were authorized, and broad expected-red coverage was not Inspector-only.
- `docs/audits/zh-ui-implementation-gate.md` prior report — read before replacement. Key passage: previous FAIL was based on `+page.svelte:129`, `Feed.svelte:54`, and spec interactions that depended on English accessible names; remediation required removing English fallback and strengthening ZH-TEST-10.
- `docs/DESIGN.md` — read. Key passages: primary surfaces include owner-token prompt, first-use, feed, Inspector, Steer, `RESOFEED` menu, Source Ledger, state import/export, processing language, search, and provenance markers at lines 346-358; product chrome uses operational labels such as `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor` at line 362; utility menu and language-control placement/accessibility at lines 416-419, 481-488, 509-519; source identifiers must remain unchanged with `translate="no"` at lines 538-544; Owner Token Prompt and First-Use Empty State constraints at lines 546-564.
- `docs/ARCHITECTURE.md` — read. Key passages: one Go process/SQLite/FTS/no accounts/no vector at lines 13-24; no extra process at lines 51-76; owner-token boundary at lines 139-147; portable-state and runtime metadata boundaries at lines 179-188 and 260-263; frontend derives UI language and preserves source identifiers at lines 240-245; no DI/event bus/sidecar/sync at lines 204-215 and 270-283.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — read. Key passages: negative constraints at lines 7-14; R3 zh UI/source identifier obligation at lines 73-100; frontend downstream evidence requires zh DOM/screenshot and literal identifiers at lines 162-167.
- Implementation commits `fc64a88`, `65ee277`, `d4d9721` — inspected with `git show --stat --name-only --oneline`. Key passage: only frontend component/test paths changed in these commits; `d4d9721` touches only `web/src/routes/+page.svelte`, `web/src/routes/components/Feed.svelte`, and `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts`.
- `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts` — read. Key passage: spec now asserts and interacts with the zh Steer textbox name at lines 253 and 276, asserts and clicks the zh Feed item-open name at lines 264 and 321, and covers owner token/shell/feed/search/ledger/state/Inspector/first-use at lines 233-356.
- `web/src/routes/+page.svelte` — read. Key passage: zh `steerLabel` is `导向或粘贴 RSS URL` at line 129; previous English fallback phrase is absent from this zh label.
- `web/src/routes/components/Feed.svelte` — read. Key passage: `openInspectorLabel` returns `打开检查器：${title}` for zh and `Open Inspector for: ${title}` only for English at lines 53-55.
- `web/src/routes/components/SearchRetrieval.svelte` — read. Key passage: zh search region/filter/result/action labels at lines 31-51 and source-title `translate` use at lines 123-202.
- `web/src/routes/components/SourceLedger.svelte` — read. Key passage: zh ledger action/status/empty/diagnostic labels at lines 60-93; source row/title/url literal rendering with `translate` at lines 328-364.
- `web/src/routes/components/StatePortability.svelte` — read. Key passage: zh state portability group/actions/input/warning/status labels at lines 16-29 and rendered controls at lines 88-96.
- `web/src/routes/components/OwnerTokenPrompt.svelte` — read. Key passage: zh owner-token heading/label/submit/rejected text at lines 21-35 while `RESOFEED` remains literal at lines 64-86.
- `web/src/routes/components/FirstUseEmptyState.svelte` — read. Key passage: zh first-use aria and four explanatory lines at lines 10-18; no wizard/onboarding constructs at lines 21-25.
- `web/src/routes/components/Inspector.svelte` — read. Key passage: localized Inspector residual labels/status/re-ingest/grouped-source chrome and literal source/original/model identifiers at lines 599-705.
- `web/src/routes/components/item-anatomy.ts` and `web/src/routes/components/__tests__/item-anatomy-localization.test.ts` — read. Key passage: zh item anatomy labels at `item-anatomy.ts:93-140`; unit tests prove zh labels while preserving literal source data and operational time tokens at test lines 35-49.

## Gate Review Report

| step_id | evidence_quality | concerns |
| --- | --- | --- |
| zh-ui-shared-helper-item-anatomy | GOOD: source helper plus Vitest receipt cover zh extraction/provenance/priority/fallback labels, source-title literal preservation, and operational time-group token preservation. | Helper evidence is intentionally not runtime DOM proof; runtime verifier still owns screenshot/DOM closure. |
| zh-ui-component-chrome-fixes | GOOD: component source and broad Playwright green cover shell/feed/search/ledger/state/token/empty/Inspector chrome with preserved tokens; static check is green. | Runtime verification must still collect design/runtime DOM artifacts required by matrix lines 64-72. |
| zh-ui-accessible-name-residual-fix | GOOD: residual Steer and Feed accessible-name defects are fixed in source and the broad spec now uses zh accessible names at the affected controls. | No blocker. |

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| ZH-SHELL-01 | Matrix line 43 requires zh shell/Steer/status/menu aria localization while preserving operational tokens. | Source + targeted runtime test that shell/Steer zh accessible names are localized and no English fallback is required. | `+page.svelte:127-132` has zh `steerLabel: '导向或粘贴 RSS URL'`; spec lines 251-260 assert `html lang`, skip link, zh textbox/placeholder/route/menu labels and preserved `RESOFEED`; spec line 276 fills by zh accessible name; Playwright targeted run 3 passed. | PROVEN | yes |
| ZH-FEED-02 | Matrix line 44 requires zh feed list/item-open/meta/resonance/load-more/item-anatomy labels with literal source titles. | Source + runtime test that feed aria is zh-localized and source title remains literal/`translate=no`. | `Feed.svelte:53-55` returns zh item-open aria without English fallback; `Feed.svelte:63-110` renders feed/source/meta/resonance controls; `item-anatomy.ts:93-140`; spec lines 262-274 assert zh list, item-open, metadata, source literal `translate=no`, source id, and `TODAY`; spec line 321 clicks by zh item-open name; Vitest 3 passed; Playwright 3 passed. | PROVEN | yes |
| ZH-SEARCH-03 | Matrix line 45 requires zh search labels/status/result actions/metadata and source non-translation. | Source + runtime test. | `SearchRetrieval.svelte:31-51,123-202`; spec lines 276-294 assert zh search region/heading/filters/status/results/actions/metadata and source literal `translate=no`; Playwright 3 passed. | PROVEN | yes |
| ZH-LEDGER-04 | Matrix line 46 requires zh Source Ledger actions/status/empty/diagnostic chrome while preserving `SOURCE LEDGER`, source titles, URLs, raw identifiers. | Source + runtime test + non-translation proof. | `SourceLedger.svelte:60-93,328-364`; spec lines 296-310 and 353-355 assert `SOURCE LEDGER`, zh actions/status/diagnostics, source title and URL literal text with `translate=no`, and zh empty state; Playwright 3 passed. | PROVEN | yes |
| ZH-STATE-05 | Matrix line 47 requires zh state export/import labels/input/warning/status without changing portable-state semantics. | Source + runtime test + no backend/storage diff. | `StatePortability.svelte:16-29,88-96`; spec lines 312-317 assert zh group/actions/input/warning; protected-path diff `fc64a88^..d4d9721` produced no dependency/backend/storage/runtime files. | PROVEN | yes |
| ZH-TOKEN-06 | Matrix line 48 requires zh owner-token prompt, no account/login semantics, `RESOFEED` literal. | Source + pre-auth runtime test. | `OwnerTokenPrompt.svelte:21-35,64-86`; spec lines 234-245 assert explicit pre-auth zh fixture, zh prompt/label/submit, `RESOFEED`, and absence of login/account/password/profile; Playwright 3 passed. | PROVEN | yes |
| ZH-EMPTY-07 | Matrix line 49 requires zh first-use copy/aria and no onboarding wizard. | Source + runtime test. | `FirstUseEmptyState.svelte:10-18,21-25`; spec lines 342-356 assert zh empty-state aria/four lines and Source Ledger empty copy; no wizard constructs appear in component source; Playwright 3 passed. | PROVEN | yes |
| ZH-INSPECTOR-08 | Matrix line 50 requires Inspector residual zh labels/aria/status/original-link/grouped-source/model/re-ingest while preserving identifiers. | Source + runtime test. | `Inspector.svelte:599-705`; spec lines 319-340 assert localized Inspector/residual/provenance/re-ingest/grouped-source chrome and preserved source/model/story/original-link identifiers; Playwright 3 passed. | PROVEN | yes |
| ZH-NONTRANSLATE-09 | Matrix lines 51 and 54-62 require literal source identifiers/titles/URLs/model IDs/actor/timestamps/technical IDs/brand tokens. | Source + runtime assertions + protected diff. | Source uses `translate=no`/equivalent in Feed/Search/Ledger/Inspector; spec lines 258-260, 265-268, 293-294, 304-307, 325-332, 337-339 assert operational tokens/source titles/URLs/model IDs/story keys literal; protected-path diff has no backend/model/storage dependency change. | PROVEN | yes |
| ZH-TEST-10 | Matrix line 52 requires broad tests, not Inspector-only, with preserved-token/non-translated identifier assertions and no English fallback selector bypass. | Test source + green targeted run after residual fix. | Spec lines 233-356 cover owner-token/shell/feed/search/ledger/state/Inspector/first-use; affected Steer and Feed interactions use zh accessible names at lines 276 and 321; grep/source review confirms zh labels in `+page.svelte:129` and `Feed.svelte:54` do not contain prior English fallback; Playwright 3 passed. | PROVEN | yes |

## Orphan Requirements

- None found for matrix rows ZH-SHELL-01 through ZH-TEST-10 or the verification checklist.

## Blockers

- None.

## Warnings

- `npm --prefix web ci` was required because `svelte-kit` was missing before dependency bootstrap; install used declared dependencies only and left tracked files clean. It reported 4 vulnerabilities (1 low, 2 moderate, 1 high), not investigated because dependency manifests were unchanged and this gate is scoped to zh UI implementation readiness.
- Playwright emitted Node `[DEP0205] module.register()` deprecation warnings; non-blocking for this gate.

## Notes

- Constitution audit: no `CONSTITUTION.md` exists in the isolated worktree, so no Constitution fast-fail applies.
- Architecture/dependency audit: `git diff --name-only fc64a88^ d4d9721 -- package.json web/package.json web/package-lock.json web/pnpm-lock.yaml package-lock.json pnpm-lock.yaml go.mod go.sum internal cmd migrations db web/vite.config.ts web/playwright.config.ts` produced no output; no new frontend dependency/framework/backend/storage/runtime expansion is introduced by the reviewed implementation range.
- `git diff --check fc64a88^ d4d9721 -- web/src/routes web/tests/e2e` produced no output.
- Gate approval is implementation-readiness only. Runtime verification still owns DOM/screenshot/nontranslated identifier table closure required by matrix lines 64-72.

## Requirement Decision Basis

| requirement_id | implementation_evidence_ref | status | closure_path |
| --- | --- | --- | --- |
| ZH-SHELL-01 | `+page.svelte:127-132`; spec `:251-260,:276`; Playwright 3 passed | PROVEN | Runtime verifier may collect shell DOM/screenshot proof. |
| ZH-FEED-02 | `Feed.svelte:53-110`; `item-anatomy.ts:93-140`; spec `:262-274,:321`; Vitest 3 passed; Playwright 3 passed | PROVEN | Runtime verifier may collect feed DOM/screenshot proof. |
| ZH-SEARCH-03 | `SearchRetrieval.svelte:31-51,123-202`; spec `:276-294`; Playwright 3 passed | PROVEN | Runtime verifier may collect search DOM/screenshot proof. |
| ZH-LEDGER-04 | `SourceLedger.svelte:60-93,328-364`; spec `:296-310,:353-355`; Playwright 3 passed | PROVEN | Runtime verifier may collect ledger DOM/screenshot proof. |
| ZH-STATE-05 | `StatePortability.svelte:16-29,88-96`; spec `:312-317`; protected diff empty | PROVEN | Runtime verifier may collect state portability DOM/screenshot proof. |
| ZH-TOKEN-06 | `OwnerTokenPrompt.svelte:21-35,64-86`; spec `:234-245`; Playwright 3 passed | PROVEN | Runtime verifier may collect pre-auth prompt proof if needed. |
| ZH-EMPTY-07 | `FirstUseEmptyState.svelte:10-25`; spec `:342-356`; Playwright 3 passed | PROVEN | Runtime verifier may collect first-use DOM/screenshot proof. |
| ZH-INSPECTOR-08 | `Inspector.svelte:599-705`; spec `:319-340`; Playwright 3 passed | PROVEN | Runtime verifier may collect Inspector DOM/screenshot proof. |
| ZH-NONTRANSLATE-09 | Feed/Search/Ledger/Inspector source identifier `translate=no` consumers; spec literal assertions; protected diff empty | PROVEN | Runtime verifier must include nontranslated identifier table. |
| ZH-TEST-10 | Spec `:233-356`, especially zh selectors at `:276` and `:321`; Playwright 3 passed | PROVEN | Runtime verification may proceed; no English fallback selector bypass remains in affected zh names. |

## Gate Decision

- [x] OPEN: verification closure may proceed
- [ ] BLOCKED: remediation required before runtime/audit closure

## Verification Run

- `pwd && git status --short --branch` -> exit 0; confirmed branch `vectl/step-zh-ui-implementation-gate` in isolated worktree.
- `**/CONSTITUTION.md` workspace search -> no files found.
- `git log --oneline -10` -> exit 0; confirmed residual-fix commit `d4d97218` and worktree branch context.
- `git show --stat --name-only --oneline fc64a88 65ee277 d4d9721` -> exit 0; reviewed changed file sets for all implementation commits.
- `git diff --name-only fc64a88^ d4d9721 -- package.json web/package.json web/package-lock.json web/pnpm-lock.yaml package-lock.json pnpm-lock.yaml go.mod go.sum internal cmd migrations db web/vite.config.ts web/playwright.config.ts` -> exit 0 with no output; no protected dependency/backend/storage/runtime files changed.
- `git diff --check fc64a88^ d4d9721 -- web/src/routes web/tests/e2e` -> exit 0; no whitespace errors.
- Initial `npm --prefix web run check` -> failed with `svelte-kit: command not found`; environment dependency bootstrap was missing, not a source failure.
- `npm --prefix web ci` -> exit 0; installed declared dependencies; reported 4 vulnerabilities; no tracked files changed.
- `npm --prefix web run check` -> exit 0; `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run test:render -- src/routes/components/__tests__/item-anatomy-localization.test.ts` -> exit 0; Vitest reported 1 file passed, 3 tests passed.
- `npm --prefix web run test:e2e -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts --reporter=line` -> exit 0; Playwright reported 3 passed.

## Programmatic Handoff

```json
{
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blockers": [],
  "behavioral_proof_register": [
    {"requirement_id":"ZH-SHELL-01","status":"PROVEN","proof":"+page.svelte:129 zh Steer label + spec:253,276 + Playwright 3 passed"},
    {"requirement_id":"ZH-FEED-02","status":"PROVEN","proof":"Feed.svelte:53-55 zh item-open label + spec:264,321 + Vitest 3 passed + Playwright 3 passed"},
    {"requirement_id":"ZH-SEARCH-03","status":"PROVEN","proof":"SearchRetrieval.svelte:31-51,123-202 + spec:276-294 + Playwright 3 passed"},
    {"requirement_id":"ZH-LEDGER-04","status":"PROVEN","proof":"SourceLedger.svelte:60-93,328-364 + spec:296-310,353-355 + Playwright 3 passed"},
    {"requirement_id":"ZH-STATE-05","status":"PROVEN","proof":"StatePortability.svelte:16-29,88-96 + spec:312-317 + protected diff empty"},
    {"requirement_id":"ZH-TOKEN-06","status":"PROVEN","proof":"OwnerTokenPrompt.svelte:21-35,64-86 + spec:234-245 + Playwright 3 passed"},
    {"requirement_id":"ZH-EMPTY-07","status":"PROVEN","proof":"FirstUseEmptyState.svelte:10-25 + spec:342-356 + Playwright 3 passed"},
    {"requirement_id":"ZH-INSPECTOR-08","status":"PROVEN","proof":"Inspector.svelte:599-705 + spec:319-340 + Playwright 3 passed"},
    {"requirement_id":"ZH-NONTRANSLATE-09","status":"PROVEN","proof":"translate=no source consumers + spec literal assertions + no protected backend/storage/dependency diff"},
    {"requirement_id":"ZH-TEST-10","status":"PROVEN","proof":"broad spec:233-356, zh affected selectors at :276 and :321, Playwright 3 passed"}
  ]
}
```
