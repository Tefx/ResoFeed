# zh UI Implementation Gate

Headline: implementation is **not ready** for runtime-verification closure because two zh accessible names retain English fallback phrases that the matrix requires to be localized, and the broad Playwright spec still depends on those English names.

Blocking Status: **BLOCKED**
Proof-Gap Status: source/runtime evidence exists for most surfaces, but ZH-SHELL-01, ZH-FEED-02, and ZH-TEST-10 are not positively proven.
Verdict: **[REJECT]**
Gate open allowed: **false**
Orchestrator action hint: **DO_NOT_COMPLETE**

## refs Read Confirmation

- `docs/contracts/zh-ui-chrome-localization-matrix.md` — read binding constraints, source surfaces, matrix rows ZH-SHELL-01 through ZH-TEST-10, non-translation proof register, and downstream verification minimum. Key passage: no new i18n framework/dependency/backend/storage/runtime; source titles/URLs/model IDs/operational tokens remain literal; zh mode must localize shell/feed/search/ledger/state/token/empty/Inspector chrome and prove non-translation.
- `docs/audits/zh-ui-contract-tests-gate.md` — read prior gate ledger and verification. Key passage: expected-red coverage was approved before implementation with `npm --prefix web run check` green and broad Playwright expected-red failing before implementation.
- `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts` — read full spec. Key passage: broad surfaces are covered, but post-implementation the spec still addresses the Steer textbox by English accessible name at line 276 and the Feed item-open button by English accessible name at line 321.
- Implementation commits `fc64a88` and `65ee277` — inspected changed file list and material component/test diffs. Key passage: frontend-only component/test changes; no package/backend/storage files changed.
- `web/src/routes/+page.svelte` — read shell zh chrome and wiring. Key passage: line 129 sets zh Steer label to `导向或粘贴 RSS URL Steer or paste RSS URL`.
- `web/src/routes/components/Feed.svelte` — read feed zh chrome. Key passage: line 54 sets zh item-open aria to `打开检查器：...; Open Inspector for: ...`.
- `web/src/routes/components/SearchRetrieval.svelte` — read search zh chrome and source non-translation wiring.
- `web/src/routes/components/SourceLedger.svelte` — read ledger zh chrome and source title/URL `translate` preservation.
- `web/src/routes/components/StatePortability.svelte` — read state portability zh labels/status/warning.
- `web/src/routes/components/OwnerTokenPrompt.svelte` — read owner-token zh prompt and preserved `RESOFEED`.
- `web/src/routes/components/FirstUseEmptyState.svelte` — read first-use zh empty-state copy.
- `web/src/routes/components/Inspector.svelte` — read Inspector residual zh chrome, model option IDs, source/original URL non-translation.
- `web/src/routes/components/item-anatomy.ts` and `web/src/routes/components/__tests__/item-anatomy-localization.test.ts` — read shared helper zh labels and behavioral unit tests.
- `CONSTITUTION.md` — NOT READ: workspace search found no `CONSTITUTION.md`.

## Gate Review Report

| step_id | evidence_quality | concerns |
| --- | --- | --- |
| zh-ui-shared-helper-item-anatomy | GOOD with one targeted unit receipt: `item-anatomy-localization.test.ts` covers zh labels, summary fallback, non-translated source title, and preserved time-group tokens. | Helper-level proof does not cover component accessible names; relies on component/e2e proof for rendered labels. |
| zh-ui-component-chrome-fixes | MIXED: `npm --prefix web run check` and broad Playwright spec pass, and most surfaces have source evidence. | BLOCKER: shell and feed accessible names retain English fallback text in zh mode; broad Playwright spec still depends on those English names, creating a verification-bypass path. |

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| ZH-SHELL-01 | Matrix row requires zh mode localizes skip link, Steer labels/placeholders/actions/status, route preview/status/back text, menu microcopy, language/reprocess explanatory text, and shell aria labels while preserving `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, `/doctor`. | Source plus runtime proof that zh shell accessible names are localized without English fallback outside preserved tokens. | `+page.svelte:127-132`, `+page.svelte:945-1046`, Playwright 3 passed. However `+page.svelte:129` contains bilingual `steerLabel: '导向或粘贴 RSS URL Steer or paste RSS URL'`, and spec line 276 still selects textbox by English name. | BLOCKED | yes |
| ZH-FEED-02 | Matrix row requires zh feed list aria, item-open aria, metadata labels, resonance aria, load-more/status, item anatomy labels; source titles literal/non-translatable. | Source plus runtime proof that item-open aria is zh-localized and source title remains literal/`translate=no`. | `Feed.svelte:53-55`, `Feed.svelte:63-110`, `item-anatomy.ts:93-140`, Playwright 3 passed. Source non-translation is proven, but `Feed.svelte:54` appends `Open Inspector for` in zh aria, and spec line 321 depends on that English name. | BLOCKED | yes |
| ZH-SEARCH-03 | Matrix row requires zh search heading/surface labels/filters/status/result actions/metadata and source title non-translation. | Source and runtime proof. | `SearchRetrieval.svelte:31-51`, `SearchRetrieval.svelte:123-202`; Playwright spec lines 278-294 passed. | PROVEN | yes |
| ZH-LEDGER-04 | Matrix row requires zh Source Ledger actions/status/empty/aria/diagnostic chrome while preserving `SOURCE LEDGER`, source titles, URLs, and raw identifiers. | Source and runtime proof. | `SourceLedger.svelte:60-93`, `SourceLedger.svelte:328-364`; Playwright spec lines 296-310 and 353-355 passed; source title and URL use `translate={...}`. | PROVEN | yes |
| ZH-STATE-05 | Matrix row requires zh state export/import labels, input names, warnings/status/errors without changing portable-state semantics. | Source and runtime proof; no backend/state expansion. | `StatePortability.svelte:16-29`, `StatePortability.svelte:88-96`; Playwright spec lines 312-317 passed; changed-file audit found no backend/storage path changes. | PROVEN | yes |
| ZH-TOKEN-06 | Matrix row requires zh owner-token prompt copy/form labels/status, no account/login/profile/password-reset semantics, `RESOFEED` literal. | Source and runtime proof. | `OwnerTokenPrompt.svelte:21-35`, `OwnerTokenPrompt.svelte:64-86`; Playwright spec lines 234-245 passed and asserts absence of login/account/password/profile. | PROVEN | yes |
| ZH-EMPTY-07 | Matrix row requires zh first-use aria/copy and no onboarding wizard. | Source and runtime proof. | `FirstUseEmptyState.svelte:10-18`, `FirstUseEmptyState.svelte:21-25`; Playwright spec lines 342-356 passed. | PROVEN | yes |
| ZH-INSPECTOR-08 | Matrix row requires closing Inspector residual English labels/aria/status/original-link/grouped-source/model/re-ingest while preserving source links/model IDs. | Source and runtime proof. | `Inspector.svelte:599-705`; Playwright spec lines 319-340 passed for localized residuals and literal model IDs/URLs/story key. | PROVEN | yes |
| ZH-NONTRANSLATE-09 | Matrix row/register requires source IDs/titles/URLs/model IDs/actor IDs/timestamps/technical IDs/brand tokens literal. | Non-translation table/source/runtime proof. | `processingLanguageRuntimeContract` consumers in Feed/Search/Ledger/Inspector; Playwright assertions at lines 258-260, 265-268, 293-294, 304-307, 325-332, 337-339 passed. Changed-file audit shows no backend/model/storage mutation. | PROVEN | yes |
| ZH-TEST-10 | Matrix row requires broad expected-red tests not Inspector-only and must reject build-only/source-only/Inspector-only evidence. | Test must support green retest without allowing residual English verification bypass. | Broad Playwright passed 3/3, but test still relies on English names at `zh-ui-broad-chrome.expected-red.spec.ts:276` and `:321`, matching the implementation's bilingual accessible names. | BLOCKED | yes |

## Orphan Requirements

- None found for matrix rows ZH-SHELL-01 through ZH-TEST-10.

## Blockers

| id | expert/phase | severity | evidence path:line or command output | why it matters | remediation | verification |
| --- | --- | --- | --- | --- | --- | --- |
| B-ZH-IMPL-01 | E1/E5 Phase 2 | BLOCKER | `web/src/routes/+page.svelte:129`; `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts:276` | ZH-SHELL-01 requires localized Steer labels/aria in zh mode. The accessible label contains the non-authorized English phrase `Steer or paste RSS URL`, and the broad e2e spec still uses that English name, so runtime closure can pass with residual English shell aria. | Remove the English fallback from the zh Steer accessible label while preserving allowed `RSS URL`; update the Playwright interaction to use the zh accessible name or a non-user-facing selector that does not require residual English. | `npm --prefix web run check` exit 0; targeted broad zh Playwright exit 0; explicit assertion that the Steer textbox accessible name does not contain `Steer or paste`. |
| B-ZH-IMPL-02 | E1/E5 Phase 2 | BLOCKER | `web/src/routes/components/Feed.svelte:54`; `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts:321` | ZH-FEED-02 requires zh item-open aria. The rendered accessible name includes `Open Inspector for`, and the test depends on that English name to open Inspector, masking a feed aria localization defect. | Remove the English fallback from zh item-open aria. Update the test to open the item by the zh accessible name already asserted at spec line 264, or by a non-user-facing locator after separately asserting the zh accessible name. | `npm --prefix web run check` exit 0; targeted broad zh Playwright exit 0; explicit assertion that feed item-open button accessible names do not contain `Open Inspector for` in zh mode. |

## Warnings

- `npm --prefix web ci` reports 4 dependency vulnerabilities (1 low, 2 moderate, 1 high). This gate did not investigate because no dependency files changed in the implementation commits.
- Playwright emitted Node `[DEP0205] module.register()` deprecation warnings; non-blocking for this localization gate.

## Notes

- Architecture/dependency audit: `git diff --name-only fc64a88^ 65ee277 -- package.json web/package.json web/package-lock.json web/pnpm-lock.yaml package-lock.json pnpm-lock.yaml go.mod go.sum internal cmd migrations db web/vite.config.ts web/playwright.config.ts` produced no output, so no new frontend dependency/framework/backend/storage/runtime expansion was introduced by the reviewed implementation range.
- `git diff --check fc64a88^ 65ee277 -- web/src/routes web/tests/e2e` produced no output.
- Local verification required `npm --prefix web ci` because `svelte-kit` was initially missing from `web/node_modules`; no tracked dependency files changed.

## Requirement Decision Basis

| requirement_id | implementation_evidence_ref | status | closure_path |
| --- | --- | --- | --- |
| ZH-SHELL-01 | `+page.svelte:127-132`, `+page.svelte:945-1046`, Playwright 3 passed but bilingual shell aria remains | BLOCKED | Remediate B-ZH-IMPL-01 before runtime closure. |
| ZH-FEED-02 | `Feed.svelte:53-55`, `Feed.svelte:63-110`, `item-anatomy.ts:93-140`, unit 3 passed, Playwright 3 passed but bilingual feed aria remains | BLOCKED | Remediate B-ZH-IMPL-02 before runtime closure. |
| ZH-SEARCH-03 | `SearchRetrieval.svelte:31-51`, `SearchRetrieval.svelte:123-202`, Playwright search assertions passed | PROVEN | Runtime verifier may collect DOM/screenshot closure after blockers are fixed. |
| ZH-LEDGER-04 | `SourceLedger.svelte:60-93`, `SourceLedger.svelte:328-364`, Playwright ledger assertions passed | PROVEN | Runtime verifier may collect DOM/screenshot closure after blockers are fixed. |
| ZH-STATE-05 | `StatePortability.svelte:16-29`, `StatePortability.svelte:88-96`, no backend/storage diff | PROVEN | Runtime verifier may collect DOM/screenshot closure after blockers are fixed. |
| ZH-TOKEN-06 | `OwnerTokenPrompt.svelte:21-35`, `OwnerTokenPrompt.svelte:64-86`, Playwright owner-token assertions passed | PROVEN | Runtime verifier may collect DOM/screenshot closure after blockers are fixed. |
| ZH-EMPTY-07 | `FirstUseEmptyState.svelte:10-18`, Playwright empty-state assertions passed | PROVEN | Runtime verifier may collect DOM/screenshot closure after blockers are fixed. |
| ZH-INSPECTOR-08 | `Inspector.svelte:599-705`, Playwright Inspector assertions passed | PROVEN | Runtime verifier may collect DOM/screenshot closure after blockers are fixed. |
| ZH-NONTRANSLATE-09 | Feed/Search/Ledger/Inspector `translate=no` consumers; Playwright literal source/model/story assertions passed | PROVEN | Include nontranslated identifier table in later runtime verification. |
| ZH-TEST-10 | `zh-ui-broad-chrome.expected-red.spec.ts:233-356`; Playwright 3 passed | BLOCKED | Strengthen interactions/assertions so green cannot depend on residual English accessible names. |

## Gate Decision

- [ ] OPEN: verification closure may proceed
- [x] BLOCKED: remediation required before runtime/audit closure

## Verification Run

- `pwd && git status --short --branch` -> exit 0; branch `vectl/step-zh-ui-implementation-gate` in isolated worktree.
- `**/CONSTITUTION.md` workspace search -> no files found.
- `git show --stat --name-only --oneline fc64a88 65ee277` -> exit 0; identified reviewed frontend files.
- `git diff --name-only fc64a88^ 65ee277 -- package.json web/package.json web/package-lock.json web/pnpm-lock.yaml package-lock.json pnpm-lock.yaml go.mod go.sum internal cmd migrations db web/vite.config.ts web/playwright.config.ts` -> exit 0; no protected dependency/backend/storage/runtime files changed.
- `git diff --check fc64a88^ 65ee277 -- web/src/routes web/tests/e2e` -> exit 0; no whitespace errors.
- First `npm --prefix web run check` -> exit 127-equivalent shell failure: `svelte-kit: command not found` because local `web/node_modules` was absent.
- `npm --prefix web ci` -> exit 0; installed declared dependencies; reported 4 vulnerabilities; no tracked dependency files changed.
- `npm --prefix web run check` -> exit 0; `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run test:e2e -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts --reporter=line; code=$?; printf 'EXIT_CODE:%s\n' "$code"; exit "$code"` -> exit 0; Playwright reported 3 passed.
- `npm --prefix web run test:render -- src/routes/components/__tests__/item-anatomy-localization.test.ts` -> exit 0; Vitest reported 1 file passed, 3 tests passed.

## Programmatic Handoff

```json
{
  "verdict": "FAIL",
  "gate_open_allowed": false,
  "orchestrator_action_hint": "DO_NOT_COMPLETE",
  "blockers": [
    {
      "id": "B-ZH-IMPL-01",
      "file": "web/src/routes/+page.svelte",
      "line": 129,
      "missing_verification_step": "Assert zh Steer textbox accessible name does not contain the English phrase 'Steer or paste'."
    },
    {
      "id": "B-ZH-IMPL-02",
      "file": "web/src/routes/components/Feed.svelte",
      "line": 54,
      "missing_verification_step": "Assert zh feed item-open accessible name does not contain the English phrase 'Open Inspector for'."
    }
  ],
  "behavioral_proof_register": [
    {"requirement_id":"ZH-SHELL-01","status":"BLOCKED","proof":"+page.svelte:129 contains bilingual zh aria label; spec:276 depends on English accessible name"},
    {"requirement_id":"ZH-FEED-02","status":"BLOCKED","proof":"Feed.svelte:54 contains bilingual zh item-open aria; spec:321 depends on English accessible name"},
    {"requirement_id":"ZH-SEARCH-03","status":"PROVEN","proof":"SearchRetrieval.svelte:31-51,123-202 + Playwright 3 passed"},
    {"requirement_id":"ZH-LEDGER-04","status":"PROVEN","proof":"SourceLedger.svelte:60-93,328-364 + Playwright 3 passed"},
    {"requirement_id":"ZH-STATE-05","status":"PROVEN","proof":"StatePortability.svelte:16-29,88-96 + no backend/storage diff"},
    {"requirement_id":"ZH-TOKEN-06","status":"PROVEN","proof":"OwnerTokenPrompt.svelte:21-35,64-86 + Playwright 3 passed"},
    {"requirement_id":"ZH-EMPTY-07","status":"PROVEN","proof":"FirstUseEmptyState.svelte:10-18 + Playwright 3 passed"},
    {"requirement_id":"ZH-INSPECTOR-08","status":"PROVEN","proof":"Inspector.svelte:599-705 + Playwright 3 passed"},
    {"requirement_id":"ZH-NONTRANSLATE-09","status":"PROVEN","proof":"translate=no source/model/story assertions in broad Playwright spec passed"},
    {"requirement_id":"ZH-TEST-10","status":"BLOCKED","proof":"Broad spec passes but still uses residual English names at spec:276 and spec:321"}
  ]
}
```
