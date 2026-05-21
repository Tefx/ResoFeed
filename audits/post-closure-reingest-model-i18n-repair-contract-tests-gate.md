# Gate Review Report

**Phase**: post-closure-reingest-model-i18n-repair-contract-tests  
**Reviewer**: gate-reviewer  
**Verdict**: [REJECT] / BLOCKED  
**Blocking Status**: OPEN  
**Proof-Gap Status**: BLOCKING  

## refs Read Confirmation (MANDATORY)

- `CONSTITUTION.md`: searched workspace with `**/CONSTITUTION.md`; no file found, so no constitution fast-fail clause applied.
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md`: read. Key passages: scope limited to R1-R4 (lines 3-5); negative constraints (lines 7-13); R1-R4 matrix rows (lines 18-23); R1 fail conditions (lines 31-42); R2 route/auth/query/shape/redaction/non-persistence requirements (lines 44-70); R3 zh/content/source identifier rules (lines 72-99); R4 strict JSON/prompt alias/idempotency/state rules (lines 101-149); downstream verification obligations (lines 151-165).
- `docs/DESIGN.md`: read relevant authority. Key passages: Inspector fallback/model-backed/source identifier requirements (lines 601-618); Inspector re-ingest panel request/response/state/a11y contract (lines 622-636); Source Ledger forbidden product concepts (lines 638-670).
- `docs/ARCHITECTURE.md`: read relevant authority. Key passages: one binary/SQLite/OpenRouter/single-token constraints (lines 13-27); processing language basis (lines 218-321); selected item re-ingest basis, request/response/idempotency/concurrency/prompt-model non-persistence (lines 324-395).
- `internal/resofeed/post_closure_reingest_model_i18n_repair_expected_red_test.go`: read. Backend expected-red covers R2 route/auth/query shape at lines 19-60, R4 auth/canonical prompt/`extra_prompt`/conflicting aliases/unknown `language` at lines 62-132, and R3 explicit zh re-ingest/no automatic rewrite at lines 134-161.
- `web/src/lib/api-client.test.ts`: read. Existing client/render tests plus R2 compatibility fallback expected-red at lines 155-182.
- `web/src/lib/item-reingest-api.expected-red.test.ts`: read. R4 client method/body/`extra_prompt`/error redaction expected-red at lines 50-151.
- `web/src/routes/components/__tests__/inspector-reingest.expected-red.test.ts`: read. R1/R2/R3/R4 component expected-red coverage at lines 164-388.
- `web/tests/e2e/inspector-reingest.expected-red.spec.ts`: read. Browser expected-red coverage and artifact capture at lines 243-385.
- Relevant `.test-artifacts/playwright/test-output/`: existing artifacts were reviewed for presence; fresh focused Playwright run also generated failure attachments proving R1/R2/R3 red behavior, then generated tracked artifact changes were restored to avoid committing test-output churn.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| R1 | Contract lines 20, 27-42; Design lines 622-636 | Matrix ownership plus expected-red proving success collapses Inspector re-ingest controls, clears transient prompt/model, does not persist prompt, and no feed-row/library surface appears. | Matrix row line 20 OWNED. Component test `inspector-reingest.expected-red.test.ts` lines 254-286 asserts POST body, localStorage null, `[RE-INGEST ITEM]` visible, confirm/cancel/model/prompt absent. Browser test lines 243-299 captures DOM/screenshot and asserts same. Focused Vitest failed at line 279 because `[RE-INGEST ITEM]` absent after success; Playwright failed at line 294 for same R1 DOM proof. | PROVEN | yes |
| R2 | Contract lines 21, 44-70, 153-156 | Matrix ownership plus expected-red proving canonical and compatibility model-list routes align, auth/query validation exists, frontend can avoid false unavailable state, and provider failure redaction is covered or delegated with explicit closure path. | Matrix row line 21 OWNED. Backend test lines 19-60 covers both route paths for missing/invalid owner token, query rejection, authorized JSON shape. Frontend unit test lines 155-182 and browser test lines 337-359 cover canonical 404 then compatibility 200 fallback. Focused Go failed with 404 for both routes; Vitest failed at line 175; Playwright network artifact showed only `/api/runtime/openrouter-models` 404 request. **Gap:** no backend expected-red asserts identical response bodies/error semantics across both routes or provider/API-key redaction required by contract lines 64 and 156. | UNPROVEN | yes |
| R3 | Contract lines 22, 72-99, 160-165; Architecture lines 23-26 and 252-265 | Matrix ownership plus expected-red proving zh chrome/status, `html lang`, explicit operation-only item rewrite, and literal source identifiers with `translate=\"no\"`. | Matrix row line 22 OWNED. Backend test lines 134-161 proves language switch does not rewrite existing selected/other item and selected re-ingest uses zh target language only for selected item. Component test lines 288-321 asserts zh Inspector/re-ingest chrome and literal source source identifier. Browser test lines 362-385 asserts `html lang=zh-CN`, zh chrome/status, `translate=no`, zh post-reingest text, and no `language` request property. Focused backend R3 passed; focused Vitest/Playwright fail at zh chrome assertions, aligned with expected-red. | PROVEN | yes |
| R4 | Contract lines 23, 101-149; Design lines 628-634; Architecture lines 353-368 | Matrix ownership plus expected-red proving strict owner-authenticated item re-ingest JSON, canonical `prompt`, compatibility `extra_prompt`, unknown `language` rejection, request-scoped model/prompt non-persistence, idempotency fingerprint semantics, and guard conflict preservation. | Matrix row line 23 OWNED. Backend test lines 62-132 covers auth rejection, canonical prompt/model path, runtime metadata non-persistence, `extra_prompt` acceptance, conflicting aliases, and `language` rejection/no prompt leak. Frontend client test lines 50-151 covers typed method, `model:null`, canonical prompt, compatibility `extra_prompt`, and generic error no provider secret leak. Component/browser tests cover request body and conflict rendering (`inspector-reingest.expected-red.test.ts` lines 323-334; e2e lines 279-289, 384). Focused Go failed on `extra_prompt` 400; Vitest failed on `extra_prompt` serialization dropped. **Gap:** no backend expected-red covers same idempotency key + changed normalized prompt/model returning bad request, same key replay, or operation-guard conflict preservation required by contract lines 143-144 and downstream obligations lines 158. | UNPROVEN | yes |

## Requirement Decision Basis

| requirement_id | matrix_row_reviewed | backend_expected_red | frontend_expected_red | blocker_status | evidence_ref | decision |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Yes: contract matrix line 20 has owner/checklist/evidence/status. | N/A for UI state; backend response envelope indirectly exercised by frontend fixtures. | Yes: component lines 254-286; e2e lines 243-299. | CLOSED | Vitest failure at `inspector-reingest.expected-red.test.ts:279`; Playwright failure at `web/tests/e2e/inspector-reingest.expected-red.spec.ts:294`. | ACCEPTED |
| R2 | Yes: contract matrix line 21 has owner/checklist/evidence/status. | Partial: route/auth/query/shape at backend test lines 19-60, but no identical route response comparison or provider redaction test. | Yes for fallback behavior: `api-client.test.ts:155-182`, e2e lines 337-359. | OPEN | Go output: both `/api/runtime/openrouter-models` and `/api/runtime/openrouter/models` currently 404. Gap: missing provider redaction/identical semantics expected-red. | REJECTED |
| R3 | Yes: contract matrix line 22 has owner/checklist/evidence/status. | Yes: backend lines 134-161. | Yes: component lines 288-321; e2e lines 362-385. | CLOSED | `go test ./internal/resofeed -run 'TestPostClosureChineseReingestRequiresExplicitOperationExpectedRed' -count=1` exit 0; Vitest/Playwright zh chrome failures align with expected-red. | ACCEPTED |
| R4 | Yes: contract matrix line 23 has owner/checklist/evidence/status. | Partial: auth/canonical prompt/`extra_prompt`/alias conflict/language rejection/no runtime metadata at lines 62-132, but no backend idempotency fingerprint/replay or current-operation guard conflict test. | Yes for client body/error/conflict surfaces: client test lines 50-151; component lines 254-286 and 323-334; e2e lines 279-289 and 384. | OPEN | Go output: `extra_prompt` strict JSON rejected. Vitest output: client serializes `prompt:null` and drops `extra_prompt`. Gap: missing backend idempotency/guard expected-red. | REJECTED |

## Expected-Red Semantic Acceptance

- backend_red_aligned: false for gate sufficiency. The focused backend run is red for meaningful R2/R4 defects and R3 explicit behavior is green, but backend expected-red coverage omits material R2 provider redaction/identical-route semantics and R4 idempotency/guard semantics.
- frontend_red_aligned: true for the exposed frontend bug families. Focused Vitest and Playwright failures are semantic, not compile/harness failures: R1 controls remain after success, R2 compatibility fallback absent, R3 zh chrome absent, R4 `extra_prompt` dropped.
- product_code_modified_by_test_steps: false. Upstream commit inspection showed contract/test-only changes: c6ec2c98 added only docs contract; 78ba970b added only backend expected-red test; 44bff506 modified only frontend test files. I did not modify product code.

## Automated Verification Run

- `go test ./internal/resofeed -run 'TestPostClosure' -count=1` — exit 1 (expected-red). Failures: R2 model routes return 404 instead of 400/200; R4 `extra_prompt` returns 400 instead of 200.
- `go test ./internal/resofeed -run 'TestPostClosureChineseReingestRequiresExplicitOperationExpectedRed' -count=1` — exit 0. Confirms backend R3 explicit operation/no automatic rewrite behavior is already protected.
- `npm run check` — first attempt exit 127 because `node_modules` was absent (`svelte-kit: command not found`); after `npm ci`, exit 0 with 0 errors/0 warnings.
- `npx vitest run src/lib/api-client.test.ts src/lib/item-reingest-api.expected-red.test.ts src/routes/components/__tests__/inspector-reingest.expected-red.test.ts` — exit 1 (expected-red). 4 failed / 16 passed. Semantic failures: R2 compatibility fallback rejected, R4 `extra_prompt` dropped, R1 success did not collapse controls, R3 zh re-ingest chrome missing.
- `npx playwright test --config ./playwright.config.ts tests/e2e/inspector-reingest.expected-red.spec.ts` — exit 1 (expected-red). 3 failed / 2 passed. Semantic failures: R1 success collapse, R2 compatibility model fallback, R3 zh chrome.

## Orphan Requirements

- `ORPHAN_REQUIREMENT R2.provider_error_redaction`: Contract lines 64 and 156 require provider/API-key/`.env`/owner-token redaction on model-list failure. No backend expected-red test asserts redaction for model-list provider failure.
- `ORPHAN_REQUIREMENT R2.identical_route_semantics`: Contract lines 58-64 require both model-list routes to have identical response/error semantics. Backend tests loop both paths but do not compare response/error bodies or prove identical semantics.
- `ORPHAN_REQUIREMENT R4.idempotency_prompt_model_fingerprint`: Contract line 143 and downstream obligation line 158 require prompt/model to participate in idempotency fingerprint. No backend expected-red asserts same key+same normalized fields replays or same key+different prompt/model rejects.
- `ORPHAN_REQUIREMENT R4.guard_conflict_backend`: Contract line 144 and downstream obligation line 158 require guard conflict current-operation detail. Frontend rendering has a mocked conflict test, but backend expected-red does not verify HTTP `409 conflict` preserves current-operation detail for item re-ingest.

## Blockers

1. **R2-BLOCKER-001 — missing model-list provider redaction expected-red**
   - evidence: `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md:64` and `:156`; backend test file only covers lines 19-60 auth/query/shape and no provider failure path.
   - why it matters: implementation could leak OpenRouter/API-key/.env/owner-token details while all current expected-red tests still pass.
   - remediation: add backend expected-red fixture for model-list provider failure that asserts generic/redacted error and absence of secret/provider payload.
   - verification: rerun `go test ./internal/resofeed -run 'TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed|<new redaction test>' -count=1` and capture semantic red/green as intended.
2. **R2-BLOCKER-002 — missing identical canonical/compat route semantics proof**
   - evidence: contract lines 58-64 require identical response/error semantics; backend test lines 23-59 loop routes independently but never compare the two responses/errors.
   - remediation: add backend expected-red asserting both routes share status, content type, JSON shape/body normalization, auth and query error details.
   - verification: focused backend test proves drift fails before implementation and passes only when both routes are equivalent.
3. **R4-BLOCKER-001 — missing backend idempotency fingerprint expected-red for prompt/model**
   - evidence: contract line 143 and obligation line 158; backend test lines 62-132 does not reuse an idempotency key with same/different normalized prompt/model.
   - remediation: add backend expected-red covering same key + same normalized prompt/model replay and same key + changed prompt/model `400 bad_request` without model call.
   - verification: focused backend test fails on current implementation and passes only when idempotency includes normalized prompt/model.
4. **R4-BLOCKER-002 — missing backend current-operation guard conflict expected-red**
   - evidence: contract line 144 and obligation line 158; only frontend mocked conflict rendering exists at `inspector-reingest.expected-red.test.ts:323-334`.
   - remediation: add backend HTTP expected-red that forces the current operation guard occupied and asserts `POST /api/items/{id}/reingest` returns `409 conflict` with current-operation detail.
   - verification: focused backend test fails until item re-ingest uses guard semantics.

## Warnings

- `npm ci` was required because `web/node_modules` was absent. It reported 4 vulnerabilities (1 low, 2 moderate, 1 high). This is not a gate blocker for contract-test sufficiency but should be tracked separately.
- Some frontend/browser tests already pass for adjacent source-disclosure behavior. That does not invalidate expected-red status for the targeted bug exposures, but it confirms the test files mix expected-red and regression-positive assertions.

## Notes

- No product code modifications were made by this gate. Generated Playwright artifact changes were restored before committing the audit report.
- The matrix rows are present and owned for R1-R4; the block is specifically missing expected-red coverage for material R2/R4 sub-obligations, not absence of the matrix.

## Gate Decision

- recommendation: BLOCKED
- blocking_issues: R2 provider-redaction expected-red missing; R2 identical-route-semantics proof missing; R4 idempotency prompt/model fingerprint expected-red missing; R4 backend guard-conflict expected-red missing.
- required_actions: add the missing backend expected-red tests or explicitly narrow the authoritative contract with approved planner/product authority before implementation begins.
- gate_open_allowed: false
- orchestrator_action_hint: DO_NOT_COMPLETE
- headline: BLOCKED
- verdict: FAIL
- blockers: [R2-BLOCKER-001, R2-BLOCKER-002, R4-BLOCKER-001, R4-BLOCKER-002]
- proof_gap_status: BLOCKING
- blocking_status: OPEN
