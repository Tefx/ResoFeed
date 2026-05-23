# zh UI Contract/Test Gate Review

Headline: OPEN — the B-ZH-TOKEN-06 pre-auth language-authority blocker is remediated, and the matrix plus expected-red tests now provide broad, per-surface implementation obligations.

Blocking Status: no blockers.

Proof-Gap Status: all material matrix rows and verification checklist items are mapped to concrete contract/test evidence. Expected-red evidence is tool-verified and remains failing before implementation.

Verdict: [PASS]

Gate Open Allowed: true

Orchestrator Action Hint: COMPLETE

## refs Read Confirmation

- `CONSTITUTION.md` — NOT READ: no `CONSTITUTION.md` found under the isolated worktree via `**/CONSTITUTION.md` search.
- `docs/DESIGN.md` — read. Key passages: primary surfaces include owner-token prompt, first-use empty state, feed, Inspector, Steer, `RESOFEED` menu, Source Ledger, state import/export, processing language, search, and provenance markers at lines 346-358; product chrome uses operational labels such as `RESOFEED`, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, and `/doctor` at line 362; persistent top language chrome is forbidden and utility-menu placement is authorized at lines 416-418 and 481-488; Language Control and `<html lang>`/aria-live rules are at lines 509-520; Source Identifiers must remain unchanged with `translate="no"` at lines 538-544; Owner Token Prompt is pre-API access and must not create account/login semantics at lines 546-554; First-Use Empty State exact lines/no wizard rule are at lines 556-565; Feed/Inspector contracts and source identifier preservation appear at lines 588-610 and 628-683.
- `docs/ARCHITECTURE.md` — read. Key passages: one Go process/no sidecars at lines 13 and 51-76; owner-token and no-account boundary at lines 21 and 139-147; persisted processing language/source identifier decisions at lines 22-25; portable state excludes processing language at lines 179-188 and 260-263; frontend derives UI language from authenticated runtime API at lines 245 and 275-278; source identifiers remain exact at lines 240-245.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — read. Key passages: no new architecture/dependencies/accounts and literal source identifiers at lines 7-14; R3 zh chrome/source identifier obligation at lines 73-100; downstream frontend evidence obligations for zh DOM/screenshot and literal identifiers at lines 162-167.
- `docs/contracts/zh-ui-chrome-localization-matrix.md` — read. Key passages: no new i18n framework/dependency/runtime/storage changes at lines 11-18; operational-token exception at lines 19-25; Source Surfaces Read at lines 27-38; Requirement-to-Checklist Matrix rows ZH-SHELL-01 through ZH-TEST-10 at lines 39-52; Non-Translation Proof Register at lines 54-62; downstream verification minimum at lines 64-72.
- `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts` — read. Key passages: explicit pre-auth zh fixture key/value and authority at lines 7-12; source/title/URL/model fixtures preserving literal provenance at lines 76-186; `installPreAuthZhLanguageFixture` stores explicit fixture authority at lines 192-199; authenticated broad zh API fixtures at lines 201-230; owner-token prompt expected-red uses the explicit pre-auth fixture and verifies its authority at lines 233-245; broad shell/feed/search/ledger/state/Inspector expected-red coverage spans lines 247-340; first-use/empty-state coverage spans lines 342-356.
- `ab0c35a` diff — read with `git show --unified=80 ab0c35a -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts`. Key passage: commit adds `preAuthLanguageFixtureKey`, `preAuthZhLanguageFixture.authority`, `installPreAuthZhLanguageFixture`, and the owner-token test assertion that localStorage contains `"authority":"e2e-fixture:zh-ui-preauth-language-test-contract-fix"` before zh owner-token assertions.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| ZH-SHELL-01 | Matrix line 43; DESIGN lines 346-362, 416-418, 481-488, 509-520 | Matrix row plus broad expected-red assertions for shell/Steer/menu/status/preserved tokens | Matrix row line 43; spec lines 247-261 assert `html lang`, skip link, Steer label/placeholder, route-preview aria, NAV/OPERATIONS zh, `RESOFEED`, absence of visible `TODAY` and `/doctor`; Playwright targeted run failed EXIT_CODE:1 with this test among the 3 failures | PROVEN | yes |
| ZH-FEED-02 | Matrix line 44; DESIGN lines 588-610 | Matrix row plus expected-red feed visible text/aria/non-translation assertions | Matrix row line 44; spec lines 262-275 assert feed list aria, item-open aria, source title literal text, `translate="no"`, source id, zh source/age/extraction/value labels, star aria, agent aria, and preserved `TODAY`; Playwright EXIT_CODE:1 | PROVEN | yes |
| ZH-SEARCH-03 | Matrix line 45; DESIGN line 357 | Matrix row plus search filters/result/aria/provenance assertions | Matrix row line 45; spec lines 276-295 assert search region aria, heading, filters, query controls, result status/list/buttons, lexical/provenance chrome, and source non-translation; Playwright EXIT_CODE:1 | PROVEN | yes |
| ZH-LEDGER-04 | Matrix line 46; DESIGN lines 355, 481-488, 687-689 | Matrix row plus Source Ledger actions/status/diagnostics/source URL non-translation assertions | Matrix row line 46; spec lines 296-310 assert `SOURCE LEDGER`, zh run/import/fetch/delete/details/action/status chrome, source title literal text with `translate="no"`, source URL literal text with `translate="no"`; Playwright EXIT_CODE:1 | PROVEN | yes |
| ZH-STATE-05 | Matrix line 47; ARCH lines 179-188, 260-263 | Matrix row plus state portability labels/warning/input assertions without new state semantics | Matrix row line 47; spec lines 312-317 assert zh state portability aria, export/import labels, file input accessible name, and import-warning copy; matrix line 47 preserves portable-state semantics and forbids sync/merge expansion; Playwright EXIT_CODE:1 | PROVEN | yes |
| ZH-TOKEN-06 | Matrix line 48; DESIGN lines 546-554; prior blocker B-ZH-TOKEN-06-PREAUTH-LANGUAGE-AUTHORITY | Matrix row plus owner-token prompt zh expected-red with explicit pre-auth language authority that no longer relies on authenticated `/api/runtime/language` ordering | Matrix row line 48; preauth fixture constants at spec lines 7-12; fixture installation at lines 192-199; owner-token test calls fixture before `page.goto('/')` and verifies fixture authority before zh assertions at lines 233-245; commit `ab0c35a` contains only this remediation diff; Playwright owner-token test remains one of 3 expected-red failures | PROVEN | yes |
| ZH-EMPTY-07 | Matrix line 49; DESIGN lines 556-565 | Matrix row plus first-use empty-state zh/no-wizard assertions | Matrix row line 49; spec lines 342-356 assert empty-state aria/copy and Source Ledger empty copy. The negative no-wizard/non-feature obligation is covered by the matrix non-goals and absence of any asserted/authorized onboarding constructs; Playwright EXIT_CODE:1 | PROVEN | yes |
| ZH-INSPECTOR-08 | Matrix line 50; DESIGN lines 628-683; repair contract lines 77-83 | Matrix row plus Inspector residual/provenance/re-ingest/model/grouped-source assertions | Matrix row line 50; spec lines 319-340 assert localized Inspector text/provenance aria/original-link/reingest/model IDs/status/grouped-source aria and removal of raw English provenance string; Playwright EXIT_CODE:1 | PROVEN | yes |
| ZH-NONTRANSLATE-09 | Matrix lines 51 and 54-62; DESIGN lines 538-544; ARCH lines 22-25, 240-245 | Matrix row plus explicit preservation assertions for source title/URL/model IDs/story keys/operational tokens | Matrix line 51 plus Non-Translation Proof Register lines 54-62; spec lines 258-260, 265-268, 274, 293-294, 299, 304-307, 325-332, and 337-339 assert preserved operational tokens/source titles/URLs/model IDs/story keys with literal values and `translate="no"` where applicable | PROVEN | yes |
| ZH-TEST-10 | Matrix line 52; repair contract lines 162-167 | Expected-red coverage is broad, not Inspector-only, and fails before implementation with deterministic evidence | Test file covers token/shell/feed/search/ledger/state/empty/Inspector lines 233-356; targeted Playwright run failed `EXIT_CODE:1` with exactly 3 failed tests after the preauth fix; `npm --prefix web run check` passes | PROVEN | yes |

## Orphan Requirements

- None found. All material surfaces named in the supplied scope and in matrix `Source Surfaces Read` have matrix rows and expected-red or explicit implementation-ownership evidence fields.

## Gate Decision Basis

| requirement_id | evidence_ref_reviewed | status | gate_decision_basis |
| --- | --- | --- | --- |
| ZH-SHELL-01 | `docs/contracts/zh-ui-chrome-localization-matrix.md:43`; `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts:247-261`; Playwright `EXIT_CODE:1` | PROVEN | Broad shell/Steer/menu/status/preserved-token assertions exist and fail before implementation. |
| ZH-FEED-02 | matrix line 44; spec lines 262-275; Playwright `EXIT_CODE:1` | PROVEN | Feed list/aria/metadata/resonance/item-anatomy/source non-translation are covered. |
| ZH-SEARCH-03 | matrix line 45; spec lines 276-295; Playwright `EXIT_CODE:1` | PROVEN | Search filters/status/results/provenance/source non-translation are covered. |
| ZH-LEDGER-04 | matrix line 46; spec lines 296-310; Playwright `EXIT_CODE:1` | PROVEN | Source Ledger action/status/diagnostic/source identifier and URL coverage is present. |
| ZH-STATE-05 | matrix line 47; spec lines 312-317; ARCH portable-state lines 179-188, 260-263 | PROVEN | State portability labels/input/warning coverage is present and does not authorize new state semantics. |
| ZH-TOKEN-06 | matrix line 48; spec lines 7-12, 192-199, 233-245; commit `ab0c35a`; Playwright owner-token test failed expected-red | PROVEN | Prior ambiguity is closed for this contract-test gate: owner-token zh assertions are explicitly driven by an e2e pre-auth language fixture and verify that fixture authority before asserting zh prompt copy, instead of relying on authenticated `/api/runtime/language` ordering. |
| ZH-EMPTY-07 | matrix line 49; spec lines 342-356; Playwright `EXIT_CODE:1` | PROVEN | First-use and Source Ledger empty states have expected-red coverage and no new onboarding surface is authorized. |
| ZH-INSPECTOR-08 | matrix line 50; spec lines 319-340; Playwright `EXIT_CODE:1` | PROVEN | Residual Inspector labels/model IDs/grouped-source/source identifier coverage exists. |
| ZH-NONTRANSLATE-09 | matrix lines 51, 54-62; spec lines 258-260, 265-268, 293-294, 304-307, 325-332, 337-339 | PROVEN | Source titles/URLs/model IDs/story keys/operational-token preservation is both matrixed and testable. |
| ZH-TEST-10 | matrix line 52; spec lines 233-356; command output `EXIT_CODE:1` with 3 failed tests | PROVEN | Expected-red evidence is tool-verified and broad, not narrative-only or Inspector-only. |

## Gate Decision

- [x] OPEN: implementation may proceed
- [ ] BLOCKED: required matrix/test fixes listed

## Blocking Items

- None.

## Warnings

- `docs/contracts/zh-ui-chrome-localization-matrix.md:19-25` preserves `INSPECTOR` as an operational token while `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md:77-83` calls for `Inspector label 检查器`, and the expected-red spec asserts `检查器` at line 323. This is not blocking because the matrix explicitly allows adjacent/localized chrome while preserving operational tokens, but implementation evidence should prove no source/provenance/model identifiers are translated.
- Dependency bootstrap note: `web/node_modules` was absent. `npm --prefix web ci` was run to restore declared dependencies and reported 4 vulnerabilities; no dependency/package files were modified.

## Notes

- No `CONSTITUTION.md` was present, so no Constitution fast-fail applies.
- No reviewed matrix row authorizes a new i18n framework dependency, backend process, storage migration, sidecar, queue, vector/RAG substrate, account model, or runtime state expansion.
- Expected-red output is genuinely failing before implementation; it exposes broad gaps in owner token, shell, feed, search, Source Ledger, state portability, first-use, and Inspector residual chrome.

## Verification Run

- `pwd && git status --short --branch` -> exit 0; confirmed worktree `/Users/tefx/Projects/ResoFeed/.vectl/worktrees/zh-ui-contract-tests-gate` on branch `vectl/step-zh-ui-contract-tests-gate` with clean start.
- `**/CONSTITUTION.md` workspace search -> no files found.
- `git show --unified=80 ab0c35a -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts` -> exit 0; verified preauth fixture remediation diff.
- Initial `npm --prefix web run check` -> failed because `web/node_modules` was absent and `svelte-kit` was not found; this was environment bootstrap, not source failure.
- `npm --prefix web ci` -> exit 0; installed declared web dependencies; reported 4 vulnerabilities; no tracked dependency files changed.
- `npm --prefix web run check` -> exit 0; `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run test:e2e -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts --reporter=line; code=$?; printf 'EXIT_CODE:%s\n' "$code"` -> `EXIT_CODE:1`; Playwright reported 3 failed tests: owner-token prompt pre-auth zh fixture, broad shell/feed/search/ledger/state/Inspector gaps, and first-use/source-ledger empty-state gaps.

## Artifacts Modified

- `docs/audits/zh-ui-contract-tests-gate.md`

## Programmatic Handoff

```json
{
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blockers": [],
  "behavioral_proof_register": [
    {"requirement_id":"ZH-SHELL-01","status":"PROVEN","proof":"matrix:43 + spec:247-261 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-FEED-02","status":"PROVEN","proof":"matrix:44 + spec:262-275 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-SEARCH-03","status":"PROVEN","proof":"matrix:45 + spec:276-295 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-LEDGER-04","status":"PROVEN","proof":"matrix:46 + spec:296-310 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-STATE-05","status":"PROVEN","proof":"matrix:47 + spec:312-317 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-TOKEN-06","status":"PROVEN","proof":"matrix:48 + spec:7-12,192-199,233-245 + commit ab0c35a + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-EMPTY-07","status":"PROVEN","proof":"matrix:49 + spec:342-356 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-INSPECTOR-08","status":"PROVEN","proof":"matrix:50 + spec:319-340 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-NONTRANSLATE-09","status":"PROVEN","proof":"matrix:51,54-62 + spec non-translation assertions + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-TEST-10","status":"PROVEN","proof":"matrix:52 + spec:233-356 + npm check exit 0 + Playwright EXIT_CODE:1 with 3 failed tests"}
  ]
}
```
