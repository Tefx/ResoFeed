# Prompting v2.1 R21 Artifact Proof Production

Date: 2026-05-23
Step: `prompting-v21-r21-artifact-proof-production`
Agent: `blind-tester`

## Closure Fields

verdict: PASS
blockers: []
gate_open_allowed: false
orchestrator_action_hint: READY_FOR_INDEPENDENT_RETEST
product_implementation_files_modified: false

`gate_open_allowed` remains `false`; downstream independent retest owns final gate opening.

## Scope and Blind-Test Boundary

This artifact closes `R21-PROOF-GAP` and `ARTIFACT-WRITE-CONFLICT` by recording exact generated artifact paths, raw command receipts, DOM excerpts, and continuity links in a committed `docs/audits/` file. Runtime/product files were not modified.

`web/src/routes/components/Inspector.svelte` was **NOT READ** by this proof producer because `blind-tester` forbids reading implementation source. This is an explicit ref/persona conflict; proof below uses docs, tests, and black-box browser DOM output.

## refs Read Confirmation

- `docs/DESIGN.md` — READ. Source Identifiers require URL/source title/source URL/canonical URL/original link to render unchanged and not be translated/summarized/transliterated/beautified/rewritten; accessibility requires `translate="no"` or equivalent. Language Control requires `html lang` and zh labels such as `语言: 中文`.
- `docs/ARCHITECTURE.md` — READ. Decision 12 states source identifiers are preservation anchors; localized item storage requires source identifiers not be localized destructively and provenance identifiers remain exact anchors.
- `docs/PROMPTING_SYSTEM.md` — READ. Target-language rule requires generated fields in `item.target_language` while URLs/source identifiers/source titles/provenance remain literal; validation includes provenance mutation.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — READ. R3 requires zh chrome/statuses, explicit reprocess/re-ingest before stored readable content changes, and exact literal strings marked `translate="no"` or equivalent.
- `docs/audits/prompting-v21-spec-conformance-audit.md` — READ. Failed audit left R21 as `NEEDS_TEST` and required browser proof for zh chrome/content and `translate="no"` identifiers.
- `docs/audits/prompting-v21-batched-blocker-remediation.md` — READ. B1/B2/B3/R13 were closed by deterministic evidence; R21 was closed only by linkage to abbreviated `.test-artifacts/...` citations.
- `docs/audits/inspector-ui-v21-gate.md` — READ. Existing R21 gate rows cite abbreviated `.test-artifacts/.../inspector-zh-before-reingest-red.dom.html` and `.test-artifacts/.../inspector-zh-after-reingest-red.dom.html`, which were not independently glob-resolvable before this step.
- `docs/audits/inspector-ui-v21-uiux-audit.md` — READ. UI/UX PASS cites zh screenshots/DOM and `translate="no"`, but without exact committed artifact-level path proof.
- `web/src/routes/components/Inspector.svelte` — NOT READ: forbidden implementation source for `blind-tester`; rendered/browser proof substituted.
- Existing relevant browser/e2e tests — READ: `web/tests/e2e/inspector-reingest.expected-red.spec.ts`, `web/tests/e2e/post-closure-reingest-model-i18n-blind-browser-proof.spec.ts`, `web/tests/e2e/inspector-source-model-browser-proof.audit.spec.ts`, and `web/tests/e2e/processing-language-source-split-scroll.spec.ts`. Key passages assert zh `html lang`, `检查器`, `语言: 中文`, explicit zh re-ingest summary/core, no `language` field in re-ingest payload, and `translate="no"` on source/original/canonical/source URL anchors.

## Exact Artifact Discovery and Production

Initial exact discovery for the prior abbreviated citation failed:

```text
Glob: .test-artifacts/**/inspector-zh-*.dom.html
Result: No files found
```

New targeted Playwright proof generated these exact paths:

- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.dom.html`
- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.dom.html`
- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.png`
- `.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.png`
- `.test-artifacts/playwright/results/results.json`

The generated `.test-artifacts/` files are runtime evidence; the proof-relevant exact paths and excerpts are transcribed here in committed form.

## R21 DOM Proof Excerpts

### Literal source identifiers and `translate="no"`

From `inspector-zh-before-reingest-red.dom.html` and again after re-ingest:

```html
<span class="feed-meta-source" aria-label="Source: Literal Source Identifier" translate="no">src: Literal Source Identifier</span>
```

Verifier output:

```text
.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.dom.html
  Source: Literal Source Identifier: 3166
  original link: 5359
  translate="no" count: 6
.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.dom.html
  Source: Literal Source Identifier: 3166
  original link: 5370
  translate="no" count: 6
```

### zh chrome/status and source-identifier preservation copy

From both zh DOM artifacts:

```html
<button type="button" class="bracket-action bracket-action--language" aria-label="处理语言 中文; set English" tabindex="-1">语言: 中文</button>
<span translate="no">来源标识保持不变。</span>
```

The passing browser test also asserts `await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')`; the generated DOM files are body snapshots and therefore do not include the `<html>` element.

### Explicit zh target-language content after re-ingest

From `inspector-zh-after-reingest-red.dom.html`:

```html
<p class="contract-feed-summary">显式重处理后的中文摘要。</p>
```

The same passing test asserted visible `摘要：`, `核心洞察：`, `显式重处理后的中文摘要。`, and `显式重处理后的核心洞察。` after `[重新处理本文]` and `[确认重处理]`.

## Requirement-to-Proof Mapping

| requirement_id | status | exact_artifact_paths | committed_audit_path | concrete proof |
| --- | --- | --- | --- | --- |
| R21-PROOF-GAP | PROVEN | exact zh DOM/PNG/results paths listed above | `docs/audits/prompting-v21-r21-artifact-proof.md` | New exact generated paths replace abbreviated `.test-artifacts/...` citations; DOM excerpts prove zh UI plus literal identifiers. |
| R21-TRANSLATE-NO | PROVEN | `inspector-zh-before-reingest-red.dom.html`; `inspector-zh-after-reingest-red.dom.html` | `docs/audits/prompting-v21-r21-artifact-proof.md` | Rendered DOM includes `translate="no"` on `Source: Literal Source Identifier`; verifier counted 6 `translate="no"` occurrences per DOM artifact. |
| ARTIFACT-WRITE-CONFLICT | PROVEN | this committed audit artifact | `docs/audits/prompting-v21-r21-artifact-proof.md` | Non-read-only proof producer created a file-backed closure artifact under `docs/audits/` with raw command output, exit codes, exact artifact paths, and requirement rows. |
| B1/B2/B3/R13 continuity | PROVEN | `docs/audits/prompting-v21-batched-blocker-remediation.md`; `docs/audits/prompting-v21-spec-conformance-audit.md` | `docs/audits/prompting-v21-r21-artifact-proof.md` | B1/B2/B3/R13 remain linked to prior deterministic Go/docs closure evidence; this step does not re-open or weaken them. |

## Raw Command Output

```text
$ pwd && ls .vectl/worktrees/prompting-v21-r21-artifact-proof-production
/Users/tefx/Projects/ResoFeed
AGENTS.md
artifacts
audits
cmd
docs
go.mod
go.sum
internal
plan.yaml
README.md
tests
web

$ ls "web/node_modules/.bin" >/dev/null 2>&1 && printf 'node_modules present\n' || printf 'node_modules missing\n'
node_modules missing

$ npm ci && npx playwright test --config ./playwright.config.ts web/tests/e2e/inspector-reingest.expected-red.spec.ts -g "expected-red browser zh chrome and post-reingest item text proof"
added 150 packages, and audited 151 packages in 2s
4 vulnerabilities (1 low, 2 moderate, 1 high)
(node:43716) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
> resofeed-web@0.0.0-contract build
> vite build
✓ 155 modules transformed.
✓ built in 428ms
✓ built in 1.32s
Running 1 test using 1 worker
✓  1 [chromium-ci-safe] › tests/e2e/inspector-reingest.expected-red.spec.ts:362:1 › expected-red browser zh chrome and post-reingest item text proof (494ms)
1 passed (5.4s)
Exit code: 0

$ python - <<'PY'
from pathlib import Path
paths=sorted(Path('.').glob('.test-artifacts/playwright/test-output/**/inspector-reingest-expected-red/inspector-zh-*.dom.html'))
print('python glob count:', len(paths))
for p in paths:
    print(p)
    text=p.read_text()
    for needle in ['lang="zh-CN"','检查器','语言: 中文','来源标识保持不变','translate="no"','Source: Literal Source Identifier','original link','显式重处理后的中文摘要。','显式重处理后的核心洞察。']:
        print(f'  {needle}:', text.find(needle))
    print('  translate="no" count:', text.count('translate="no"'))
PY
python glob count: 2
.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-after-reingest-red.dom.html
  lang="zh-CN": -1
  检查器: 4754
  语言: 中文: 1446
  来源标识保持不变: 1562
  translate="no": 1547
  Source: Literal Source Identifier: 3166
  original link: 5359
  显式重处理后的中文摘要。: 4114
  显式重处理后的核心洞察。: 5864
  translate="no" count: 6
.test-artifacts/playwright/test-output/inspector-reingest.expecte-43391-st-reingest-item-text-proof-chromium-ci-safe/inspector-reingest-expected-red/inspector-zh-before-reingest-red.dom.html
  lang="zh-CN": -1
  检查器: 4765
  语言: 中文: 1446
  来源标识保持不变: 1562
  translate="no": 1547
  Source: Literal Source Identifier: 3166
  original link: 5370
  显式重处理后的中文摘要。: -1
  显式重处理后的核心洞察。: -1
  translate="no" count: 6
Exit code: 0
```

## Behavioral Proof Register

| behavior | proof_status | evidence |
| --- | --- | --- |
| Exact R21 artifact paths are generated and independently resolvable in current worktree | PROVEN | Python glob found two exact zh DOM paths after targeted Playwright run. |
| zh UI chrome renders in browser | PROVEN | Passing Playwright test asserts `html lang="zh-CN"`, `检查器`, `语言: 中文`; DOM excerpts include zh chrome. |
| Source identifiers remain literal provenance anchors | PROVEN | DOM excerpts show `src: Literal Source Identifier` unchanged with exact source label. |
| Source identifiers are marked non-translatable | PROVEN | DOM excerpts show `translate="no"`; verifier counted six occurrences in each DOM file. |
| Explicit re-ingest changes readable content into zh without source identifier rewrite | PROVEN | After-reingest DOM/test assertions show zh summary/core after `[重新处理本文]`/`[确认重处理]`. |

## Checklist Receipt

- refs confirmation includes key passages for the R21 source identifier and zh UI obligations plus the failed retest/audit basis: PROVEN — `refs Read Confirmation`.
- Exact artifact discovery evidence shows whether existing `.test-artifacts/**/inspector-zh-*.dom.html` paths exist; abbreviated absent paths are not used as proof: PROVEN — initial Glob returned no files; new exact paths listed.
- If existing artifacts are absent, new rendered/browser/DOM artifacts are produced and exact filesystem paths are recorded: PROVEN — targeted Playwright run produced exact DOM/PNG/result paths.
- R21 proof includes literal source identifier text and rendered DOM/browser evidence for `translate="no"` or equivalent source identifier protection: PROVEN — DOM excerpt and count.
- A file-backed closure artifact is created or updated under `docs/audits/` with raw command output, exit codes, exact artifact paths, and requirement-to-proof mapping rows: PROVEN — this file.
- Closure artifact includes `verdict`, `blockers`, `gate_open_allowed`, and `orchestrator_action_hint`; successful proof production uses `READY_FOR_INDEPENDENT_RETEST`, not final gate OPEN: PROVEN — Closure Fields.
- The artifact links B1/B2/B3/R13 deterministic closure evidence without weakening or re-opening those already proven/bounded rows: PROVEN — continuity row.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "verdict": "PASS",
  "blockers": [],
  "gate_open_allowed": false,
  "orchestrator_action_hint": "READY_FOR_INDEPENDENT_RETEST",
  "closure_artifact_path": "docs/audits/prompting-v21-r21-artifact-proof.md",
  "product_implementation_files_modified": false
}
```
