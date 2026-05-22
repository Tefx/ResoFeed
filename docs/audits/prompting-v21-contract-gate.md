# Prompting v2.1 Contract Matrix and Expected-Red Tests Gate

Headline: Contract/test foundation is acceptable for downstream runtime implementation.

Blocking Status: No blockers found for this pre-implementation gate.

Proof-Gap Status: Runtime behavior remains intentionally UNPROVEN in the matrix; this is acceptable for this gate because the decision artifact is a contract matrix plus expected-red tests, not runtime implementation closure.

Verdict: PASS

## refs Read Confirmation

- `docs/PROMPTING_SYSTEM.md` — read. Key passages: v2.1 compliance must not be claimed until schema_version/payload/routing/validation exist (lines 7, 336-340); exact system prompt and priority order (lines 27-56); strict payload/schema/validation/routing/fixtures contracts (lines 58-353).
- `docs/ARCHITECTURE.md` — read. Key passages: one Go binary/SQLite/OpenRouter JSON transformer boundaries (lines 13-21); prompt/model MCP parity is accepted pending implementation and must not be overclaimed (lines 3-7, 339-348, 385-389, 418-423); flat core/no sidecars/no durable prompt/model state boundaries (lines 204-215, 327-500).
- `docs/USAGE.md` — read. Key passages: HTTP model-list canonical route and MCP limited parity/pending prompt-model override note (lines 304-325, 967-987, 1027-1040); item re-ingest prompt/model are request-scoped and unknown `language` is rejected (lines 326-369).
- `docs/DESIGN.md` — read. Key passage: Inspector-only item re-ingest UI, one-time model/prompt non-persistence, low-chrome bracket states, no settings/dashboard/modal/toast surfaces (lines 637-660); source identifier `translate="no"` rule (lines 538-545).
- `docs/POST_CLOSURE_REINGEST_MODEL_I18N_REPAIR_CONTRACT.md` — read. Key R3/R4 passages: R3 zh chrome/content/source identifier obligations (lines 73-100); R4 strict HTTP prompt/model contract, alias conflict, model limits, non-persistence, idempotency (lines 102-151).
- `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` — read. Matrix coverage insight: 24 requirement rows map each row to owning step, checklist item, evidence field, status, and non-intersection/escalation; MCP pending-vs-implemented status is explicit in `PV21-MCP-PARITY-CLASSIFICATION` (line 59) and global forbidden architecture concepts are enumerated (lines 13-21).
- `internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go` — read. Test coverage insight: test-only expected-red file pins system prompt separation, exact v2.1 payload, json_schema/provider routing, strict validation boundaries, source normalization, R4 HTTP request/model checks, MCP parity fields, and a 10-family fixture inventory; it does not implement runtime product behavior.

## Constitution Audit

- `CONSTITUTION.md`: not found under isolated worktree root; no constitution fast-fail applied.

## Verification Run

- Command: `go test ./internal/resofeed -run TestPromptingV21 -count=1`
- Exit Code: 1
- Result: expected red. Failure signatures align with declared gaps: separate system/user prompt missing, strict schema/semantic validation missing, json_schema routing/provider.require_parameters missing, source-normalization v2.1 payload missing, R4 model control-character rejection missing, and MCP prompt/model parity fields missing.
- Additional command: `go test ./internal/resofeed -run TestPromptingV21RequiredRegressionFixtureInventoryExpectedRed -count=1`
- Exit Code: 0
- Result: fixture inventory records the required v2.1 fixture families.

## Positive Requirement Coverage Ledger

| requirement_id | source_ref/key passage | required proof | evidence reviewed | status | blocker_if_unproven |
| --- | --- | --- | --- | --- | --- |
| PV21-SYSTEM-PROMPT | Matrix line 47; Prompting lines 39-56 | Matrix row maps owner/checklist/evidence; expected-red asserts exact separate system prompt | Matrix row + test lines 35-108 + red output line 77 | PROVEN | yes |
| PV21-PRIORITY-ORDER | Matrix line 48; Prompting lines 27-37 | Row maps priority fixture obligation | Matrix row + test lines 217-264 and fixture inventory lines 363-372 | PROVEN | yes |
| PV21-FIELD-CONTRACTS | Matrix line 49; Prompting lines 154-163 | Row maps payload fields/evidence; test asserts exact payload | Matrix row + test lines 86-95, 430-519 | PROVEN | yes |
| PV21-FIELD-CEILINGS | Matrix line 50; Prompting lines 181-220 | Row maps ceiling negatives; test includes overlong summary expected-red | Matrix row + test lines 141-148 | PROVEN | yes |
| PV21-RUNTIME-STATUS | Matrix line 51; Prompting lines 236-260 | Row maps Go-owned status; test rejects model provider status | Matrix row + test lines 132-139 | PROVEN | yes |
| PV21-MIGRATION-TRUTH | Matrix line 52; Prompting lines 7, 336-340 | Row prevents premature v2.1 compliance claims | Matrix row status UNPROVEN and escalation text | PROVEN | yes |
| PV21-CORE-SHELL | Matrix line 53; Architecture lines 206-215 | Row maps deterministic core/shell purity audit | Matrix row; expected-red file is `_test.go` only | PROVEN | yes |
| PV21-OPENROUTER-ROUTING | Matrix line 54; Prompting lines 222-235 | Row maps routing transcript; tests assert json_schema, provider.require_parameters, downgrade same model | Matrix row + test lines 97-107, 171-215 | PROVEN | yes |
| PV21-SOURCE-NORMALIZATION | Matrix line 55; Prompting lines 269-279 | Row maps source normalization report; tests assert noisy HTML cleanup and cap | Matrix row + test lines 217-264 | PROVEN | yes |
| PV21-VALIDATION-RETRY-RECEIPT | Matrix line 56; Prompting lines 280-334 | Row maps validation/retry/receipt boundary | Matrix row + validation tests lines 110-169 | PROVEN | yes |
| PV21-HTTP-MODEL-LIST | Matrix line 57; Usage lines 304-325 | Row maps route/auth/query/redaction/non-persistence proof | Matrix row with owner/evidence field | PROVEN | yes |
| PV21-HTTP-ITEM-REINGEST | Matrix line 58; Usage lines 326-369 | Row maps one-item reingest prompt/model/FTS/non-persistence proof | Matrix row + R4 test lines 266-320 | PROVEN | yes |
| PV21-MCP-PARITY-CLASSIFICATION | Matrix line 59; Usage lines 967-987, 1027-1040 | Explicit pending-vs-implemented classification | Matrix row status EXCLUDED_OR_DEFERRED + test lines 322-354 | PROVEN | yes |
| PV21-INSPECTOR-UI-SURFACE | Matrix line 60; Design lines 637-660 | Row maps UI screenshot/DOM obligation and forbidden surfaces | Matrix row | PROVEN | yes |
| R4-PROMPT-ALIAS-CONFLICT | Matrix line 61; Repair contract lines 130-140 | Row maps conflict/no-call proof | Matrix row | PROVEN | yes |
| R4-MODEL-LENGTH-LIMIT | Matrix line 62; Repair contract lines 136-140 | Row maps 200-byte/no-call proof; test covers 200/201/control chars | Matrix row + test lines 291-319 | PROVEN | yes |
| R4-STRICT-HTTP-REQUEST | Matrix line 63; Repair contract lines 138-147 | Row maps auth/content-type/query/unknown/language negatives | Matrix row + test lines 273-289 | PROVEN | yes |
| R3-ZH-UI-CHROME-STATUS | Matrix line 64; Repair contract lines 73-83 | Row maps zh DOM/screenshot proof | Matrix row | PROVEN | yes |
| R3-ZH-TARGET-CONTENT | Matrix line 65; Repair contract lines 85-92 | Row maps before/after target-language proof | Matrix row | PROVEN | yes |
| R3-LITERAL-SOURCE-IDENTIFIERS | Matrix line 66; Repair contract lines 93-100 | Row maps translate=no DOM audit | Matrix row | PROVEN | yes |
| PV21-NON-PERSISTENCE-STATE-BOUNDARY | Matrix line 67; Prompting lines 157, 263-267, 328-334 | Row maps DB/export/localStorage audit | Matrix row and global constraints lines 13-21 | PROVEN | yes |
| PV21-HTTP-MCP-PARITY-GUARDRAIL | Matrix line 68; Architecture HTTP/MCP parity rules | Row maps parity comparison and pending-field guardrail | Matrix row + Usage MCP pending passages | PROVEN | yes |
| PV21-REGRESSION-FIXTURES | Matrix line 69; Prompting lines 342-353 | Row maps full fixture inventory and results | Matrix row + test lines 356-382 + focused test exit 0 | PROVEN | yes |
| PV21-ARCHITECTURE-VERIFICATION-ADDITIONS | Matrix line 70; Architecture verification additions | Row maps required deterministic evidence receipt | Matrix row | PROVEN | yes |

## Orphan Requirements

- None found among material v2.1/R3/R4 requirements reviewed. Matrix has 24 rows; all map to downstream owner/checklist/evidence/status or explicit exclusion/deferment.

## Blockers

- None.

## Warnings

- W1: The raw `go test` command exits 1, as expected for this gate. Downstream runtime implementers must not treat this as ordinary CI pass; they need the orchestrator expected-red wrapper/assertion or equivalent acceptance string (`expected-red verification ok`) when promoting expected-red evidence.
- W2: Several required regression fixture families are currently represented by inventory and boundary descriptions rather than full behavioral runtime execution. This is acceptable for a contract/test foundation gate, but downstream implementation gates must produce behavioral fixture results for each family.

## Notes

- The expected-red tests are confined to `internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go` and use fake/httptest providers; no product implementation logic or runtime files were modified by this gate review.
- MCP pending-vs-implemented status is not implicit: matrix line 59 and Usage lines 967-987/1027-1040 explicitly classify HTTP as current prompt/model override surface and MCP prompt/model fields as pending.

## Gate Decision Basis

| requirement_id | evidence_ref | checklist_row | status | blocks_next_phase | closure_path |
| --- | --- | --- | --- | --- | --- |
| MATRIX-ROW-MAPPING | `docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` lines 45-70 | Every matrix row maps to downstream owner/checklist/evidence field or explicit non-intersection/escalation | PROVEN | false | Downstream steps consume row evidence fields. |
| EXPECTED-RED-FIXTURES | `internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go` lines 35-382; focused fixture inventory test exit 0 | Expected-red tests cover required fixture families or record already-green proof | PROVEN_WITH_WARNING | false | Runtime implementation gates must replace inventory-only proof with behavioral fixture results. |
| NO-RUNTIME-IMPLEMENTATION | File path `_test.go` only; test helpers use fake HTTP/LLM and assertions | Tests do not add runtime implementation logic | PROVEN | false | Keep production changes in downstream implementation steps. |
| ROW-STATUS-BASIS | Matrix lines 36-41 and each row status in lines 47-70 | Gate basis lists PROVEN/UNPROVEN/NEEDS_TEST/BLOCKED-equivalent status for each row | PROVEN | false | Existing statuses UNPROVEN/EXCLUDED_OR_DEFERRED are explicit and appropriate pre-implementation. |
| BLOCKING-POLICY | Matrix line 59 and global constraints lines 13-21; Usage MCP pending lines 967-987/1027-1040 | Gate blocks on orphan requirements, vague refs evidence, forbidden architecture authorization | PROVEN | false | No blocker triggered. |

## Behavioral Proof Register

- expected_red_command:
  - command: `go test ./internal/resofeed -run TestPromptingV21 -count=1`
  - exit_code: 1
  - matching_failures:
    - `prompting_v21_runtime_contract_expected_red_test.go:77` separate system/user prompt absent.
    - `:128`, `:137`, `:146`, `:155`, `:166` strict schema/runtime status/ceilings/injection/unavailable validation absent.
    - `:186`, `:207` json_schema routing/provider.require_parameters/downgrade absent.
    - `:228`, `:252` v2.1 payload/source-normalization fixture absent.
    - `:314` R4 model control-character rejection absent.
    - `:348` MCP prompt/model parity fields absent.
- fixture_inventory_green:
  - command: `go test ./internal/resofeed -run TestPromptingV21RequiredRegressionFixtureInventoryExpectedRed -count=1`
  - exit_code: 0
  - proof: test lines 356-382 enumerate 10 required fixture families and validate non-empty metadata.

## Checklist Receipt

- Every matrix row maps to downstream owner/checklist/evidence field or has explicit non-intersection/escalation: checked=true; evidence=`docs/contracts/PROMPTING_SYSTEM_V21_RUNTIME_CONFORMANCE_MATRIX.md` lines 45-70.
- Expected-red tests cover all required fixture families or record already-green proof: checked=true; evidence=`internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go` lines 356-382 and focused test exit 0; warning=inventory proof only for some families.
- Tests do not add runtime implementation logic: checked=true; evidence=`internal/resofeed/prompting_v21_runtime_contract_expected_red_test.go` is test-only and uses fake providers/helpers.
- Gate decision basis lists PROVEN/UNPROVEN/NEEDS_TEST/BLOCKED status for each row: checked=true; evidence=Positive Requirement Coverage Ledger above plus matrix statuses.
- Gate blocks on orphan requirements, vague refs evidence, or forbidden architecture authorization: checked=true; evidence=no orphan requirements found; no forbidden architecture authorization in matrix/test artifacts.

## Gate Verdict

- gate_open_allowed: true
- verdict: PASS
- blockers: []
- orchestrator_action_hint: COMPLETE
