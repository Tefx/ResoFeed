# zh UI Contract/Test Gate Review

Headline: BLOCKED — broad matrix and expected-red coverage are mostly sufficient, but the owner-token prompt zh obligation is not implementable from the cited runtime-language authority without an explicit unauthenticated language source.

Blocking Status: 1 blocker.

Proof-Gap Status: no missing broad-surface row found; one row/test pair has unresolved authority ambiguity.

Verdict: [REJECT]

Gate Open Allowed: false

Orchestrator Action Hint: DO_NOT_COMPLETE

## refs Read Confirmation

- `CONSTITUTION.md` — NOT READ: no `CONSTITUTION.md` found under the isolated worktree.
- `docs/DESIGN.md` — read. Key passages: App shell surfaces and operational labels are defined at lines 346-362; persistent top `LANG` chrome is forbidden at lines 416-418; Language Control and `html lang`/aria-live rules are at lines 509-520; Source Identifiers must remain unchanged with `translate="no"` at lines 538-544; Owner Token Prompt is pre-API access and contains `Enter owner token`/`err: owner token rejected` at lines 546-554; First-Use Empty State exact English lines and no wizard rule are at lines 556-565.
- `docs/ARCHITECTURE.md` — read. Key passages: source identifiers are preservation anchors at decisions 10-13, lines 22-25; frontend loads owner token, then reads `processing_language` before rendering localized chrome at lines 276-278; source identifiers remain exact at lines 682-688.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — read. Key passages: source identifiers must not be translated at lines 12-14; R3 zh chrome/source identifier obligation is at lines 73-100; downstream frontend evidence obligations are at lines 162-167.
- `docs/contracts/zh-ui-chrome-localization-matrix.md` — read. Key passages: no new i18n/dependency/runtime/storage changes at lines 11-18; operational token exception at lines 19-25; Source Surfaces Read at lines 27-38; Requirement-to-Checklist Matrix rows ZH-SHELL-01 through ZH-TEST-10 at lines 39-52; downstream verification minimum at lines 64-72.
- `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts` — read. Key passages: fixtures preserve source title/URLs/model IDs at lines 71-179; API routes force zh language at lines 191-214 for authenticated tests; owner-token prompt expected-red has no language fixture/token and expects zh prompt at lines 218-226; broad shell/feed/search/ledger/state/Inspector test spans lines 228-321; first-use/empty-state test spans lines 323-337.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| ZH-SHELL-01 | Matrix line 43; DESIGN lines 416-418, 481-488 | Matrix row plus broad expected-red assertions for shell/Steer/menu/status/preserved tokens | Matrix row line 43; test lines 232-242; `npm --prefix web run test:e2e -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts --reporter=line` failed EXIT_CODE:1 with shell failures | PROVEN | yes |
| ZH-FEED-02 | Matrix line 44; DESIGN lines 588-610 | Matrix row plus expected-red feed visible text/aria/non-translation assertions | Matrix row line 44; test lines 243-255 assert feed aria, metadata labels, `translate="no"`, source id, resonance aria, `TODAY` | PROVEN | yes |
| ZH-SEARCH-03 | Matrix line 45; DESIGN line 357 | Matrix row plus search filters/result/aria/provenance assertions | Matrix row line 45; test lines 257-275 assert search labels, filters, result status/list, provenance, source `translate="no"` | PROVEN | yes |
| ZH-LEDGER-04 | Matrix line 46; DESIGN lines 355, 481-488 | Matrix row plus Source Ledger actions/status/diagnostics/source URL non-translation assertions | Matrix row line 46; test lines 277-291 assert ledger actions/status/aria, source title/url text and `translate="no"` | PROVEN | yes |
| ZH-STATE-05 | Matrix line 47; ARCH lines 179-188, 260-263 | Matrix row plus state portability labels/warning/input assertions without new state semantics | Matrix row line 47; test lines 293-298 assert aria, export/import, file input name, import warning | PROVEN | yes |
| ZH-TOKEN-06 | Matrix line 48; DESIGN lines 546-554; ARCH lines 276-278 | Matrix row plus owner-token prompt zh expected-red with clear implementation authority for how zh is known before API access | Matrix row line 48; test lines 218-226 expect zh prompt before token/API; ARCH lines 276-278 say frontend loads owner token then reads `processing_language` before localized chrome | BLOCKED | yes — no cited authority for unauthenticated zh owner-token prompt source/default |
| ZH-EMPTY-07 | Matrix line 49; DESIGN lines 556-565 | Matrix row plus first-use empty-state zh/no-wizard assertions | Matrix row line 49; test lines 323-337 assert empty-state aria/copy and Source Ledger empty copy | PROVEN | yes |
| ZH-INSPECTOR-08 | Matrix line 50; DESIGN lines 628-673; repair contract lines 77-83 | Matrix row plus Inspector residual/provenance/re-ingest/model/grouped-source assertions | Matrix row line 50; test lines 300-321 assert localized provenance/original-link/why/re-ingest/model IDs/grouped source aria and raw provenance removal | PROVEN_WITH_WARNING | yes |
| ZH-NONTRANSLATE-09 | Matrix line 51; DESIGN lines 538-544; ARCH lines 22-25, 682-688 | Matrix row plus explicit preservation assertions for source title/URL/model IDs/story keys/operational tokens | Matrix row line 51; non-translation register lines 54-62; tests lines 246-249, 274-275, 285-288, 306-319 | PROVEN | yes |
| ZH-TEST-10 | Matrix line 52; repair contract lines 162-167 | Expected-red coverage is broad, not Inspector-only, and fails before implementation with deterministic evidence | Test file covers token/shell/feed/search/ledger/state/empty/Inspector lines 218-337; Playwright failed EXIT_CODE:1; `npm --prefix web run check` passes | PROVEN | yes |

## Orphan Requirements

- None found in the matrix. Material surfaces from the supplied audit scope have rows and test assertions.

## Gate Decision Basis

| requirement_id | evidence_ref_reviewed | status | gate_decision_basis |
| --- | --- | --- | --- |
| ZH-SHELL-01 | `docs/contracts/zh-ui-chrome-localization-matrix.md:43`; `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts:232-242`; Playwright EXIT_CODE:1 | PROVEN | Broad shell/Steer/menu/status/preserved-token assertions exist and fail before implementation. |
| ZH-FEED-02 | matrix line 44; spec lines 243-255 | PROVEN | Feed list/aria/metadata/resonance/item-anatomy/source non-translation are covered. |
| ZH-SEARCH-03 | matrix line 45; spec lines 257-275 | PROVEN | Search filters/status/results/provenance/source non-translation are covered. |
| ZH-LEDGER-04 | matrix line 46; spec lines 277-291 | PROVEN | Source Ledger action/status/diagnostic/source identifier coverage is present. |
| ZH-STATE-05 | matrix line 47; spec lines 293-298 | PROVEN | State portability labels/input/warning coverage is present and does not authorize new state semantics. |
| ZH-TOKEN-06 | matrix line 48; spec lines 218-226; DESIGN lines 546-554; ARCH lines 276-278 | BLOCKED | The test requires zh owner-token prompt before token/language API access, but cited architecture says language is read after owner token. This is an implementation-blocking ambiguity. |
| ZH-EMPTY-07 | matrix line 49; spec lines 323-337 | PROVEN | First-use and Source Ledger empty states have expected-red coverage. |
| ZH-INSPECTOR-08 | matrix line 50; spec lines 300-321 | PROVEN_WITH_WARNING | Residual Inspector labels/model IDs/grouped-source/source identifier coverage exists. Warning: matrix token-preservation wording and repair contract's `检查器` label should be reconciled during repair. |
| ZH-NONTRANSLATE-09 | matrix lines 51, 54-62; spec lines 246-249, 274-275, 285-288, 306-319 | PROVEN | Source titles/URLs/model IDs/story keys/operational token preservation is both matrixed and testable. |
| ZH-TEST-10 | matrix line 52; spec lines 218-337; command output EXIT_CODE:1 | PROVEN | Expected-red evidence is tool-verified and broad, not narrative-only or Inspector-only. |

## Gate Decision

- [ ] OPEN: implementation may proceed
- [x] BLOCKED: required matrix/test fixes listed

## Blocking Items

1. `ZH-TOKEN-06` / `web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts:218-226`: define the authoritative source for zh owner-token prompt copy before the browser has an owner token and before `/api/runtime/language` can be read. Either revise the test to establish zh mode through an authorized pre-auth mechanism, or add an explicit contract row/authority explaining a safe unauthenticated/cached/browser-locale source. Verification step after remediation: rerun `npm --prefix web run check` and `npm --prefix web run test:e2e -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts --reporter=line` and capture the expected EXIT_CODE:1 with the revised, implementable owner-token fixture.

## Warnings

- `docs/contracts/zh-ui-chrome-localization-matrix.md:19-25` preserves `INSPECTOR` as an operational token, while `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md:77-83` names `Inspector label 检查器` and the expected-red spec asserts `检查器` at line 304. This can be satisfied by rendering both a preserved token and localized adjacent/accessibility copy, but the implementation task should not guess if product/design wants only one visible label.
- Dependency bootstrap note: `web/node_modules` was absent, so `npm --prefix web ci` was run to restore declared dependencies. It reported 4 vulnerabilities; no dependency/package files were modified.

## Notes

- No `CONSTITUTION.md` was present, so no Constitution fast-fail applies.
- No matrix row authorizes new i18n framework dependencies, storage migrations, sidecars, queues, or runtime processes.
- Expected-red output is genuinely failing before implementation; it exposes broad gaps in owner token, shell, feed, search, Source Ledger, state portability, first-use, and Inspector residual chrome.

## Verification Run

- `npm --prefix web run check` -> exit 0; `svelte-check found 0 errors and 0 warnings`.
- `npm --prefix web run test:e2e -- web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts --reporter=line; code=$?; printf 'EXIT_CODE:%s\n' "$code"` -> `EXIT_CODE:1`; 3 failed expected-red tests, including failures at spec lines 218-226, 228-321, and 323-337.

## Artifacts Modified

- `docs/audits/zh-ui-contract-tests-gate.md`

## Programmatic Handoff

```json
{
  "verdict": "BLOCKED",
  "gate_open_allowed": false,
  "orchestrator_action_hint": "DO_NOT_COMPLETE",
  "blockers": [
    {
      "id": "B-ZH-TOKEN-06-PREAUTH-LANGUAGE-AUTHORITY",
      "file": "web/tests/e2e/zh-ui-broad-chrome.expected-red.spec.ts",
      "line": 218,
      "requirement_id": "ZH-TOKEN-06",
      "missing_verification_step": "Define and fixture an authorized pre-auth zh language source for Owner Token Prompt, or revise the expected-red test so zh mode is established before asserting zh auth chrome."
    }
  ],
  "behavioral_proof_register": [
    {"requirement_id":"ZH-SHELL-01","status":"PROVEN","proof":"matrix:43 + spec:232-242 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-FEED-02","status":"PROVEN","proof":"matrix:44 + spec:243-255 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-SEARCH-03","status":"PROVEN","proof":"matrix:45 + spec:257-275 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-LEDGER-04","status":"PROVEN","proof":"matrix:46 + spec:277-291 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-STATE-05","status":"PROVEN","proof":"matrix:47 + spec:293-298 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-TOKEN-06","status":"BLOCKED","proof":"matrix:48 + spec:218-226 conflict with ARCH:276-278"},
    {"requirement_id":"ZH-EMPTY-07","status":"PROVEN","proof":"matrix:49 + spec:323-337 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-INSPECTOR-08","status":"PROVEN","proof":"matrix:50 + spec:300-321 + Playwright EXIT_CODE:1"},
    {"requirement_id":"ZH-NONTRANSLATE-09","status":"PROVEN","proof":"matrix:51,54-62 + spec:246-249,274-275,285-288,306-319"},
    {"requirement_id":"ZH-TEST-10","status":"PROVEN","proof":"matrix:52 + spec:218-337 + Playwright EXIT_CODE:1"}
  ]
}
```
