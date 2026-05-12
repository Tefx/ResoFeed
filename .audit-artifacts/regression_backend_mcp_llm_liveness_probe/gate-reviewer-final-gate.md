# Backend/MCP/LLM Regression Gate Review — regression-backend-mcp-llm-gate

Headline: PASS_WITH_DEBT
Blocking Status: CLOSED
Proof-Gap Status: NON_BLOCKING
Verdict: PASS
Orchestrator Action Hint: COMPLETE

## gate_decision

```json
{
  "headline": "PASS_WITH_DEBT",
  "verdict": "PASS",
  "gate_open_allowed": true,
  "orchestrator_action_hint": "COMPLETE",
  "blocking_status": "CLOSED",
  "proof_gap_status": "NON_BLOCKING",
  "blockers": []
}
```

Debt is limited to live OpenRouter provider/account privacy-policy availability: the liveness probe loaded the runtime key from the allowed main-workspace `.env`, created/fetched a real source through public API surfaces, and correctly did **not** count fallback output as live success. Direct OpenRouter preflight returned 404 with `No endpoints available matching your guardrail restrictions and data policy`, classified as `provider_or_auth`; this is outside repo behavior and does not intersect backend/MCP closure because deterministic runtime `/mcp`, `/api/doctor`, source fetch, and feed fallback classification all passed.

## refs Read Confirmation (MANDATORY)

- `.agents/instructions.md` — read. Key passage: one Go binary, one SQLite DB, OpenRouter as JSON transformer only, owner-token boundary, and runtime secrets must never be persisted/logged/committed.
- `docs/ARCHITECTURE.md` — read. Key passage: `serve` is the single runtime process serving static UI, JSON HTTP, `/mcp`, ingest; `/mcp` requires owner token; OpenRouter key is runtime-only; no vector/RAG/sync/service layers.
- `docs/PRD.md` — read. Key passage: delegated agents must retrieve/evaluate/read/report through the same product concepts; fallback taxonomy distinguishes `summary unavailable`, `model latency/error`, and RSS failures; no accounts/RBAC/OAuth.
- `docs/DESIGN.md` — read. Key passage: `/doctor` is raw operational text, Source Ledger is flat, no settings/onboarding/dashboard bloat, and AI failure degrades plainly.
- `docs/DESIGN_VISION.md` — read. Key passage: AI is raw utility and failure should degrade to raw RSS/blank fields, not friendly/fake success; no folders/settings/numeric inbox mechanics.
- `docs/USAGE.md` — read. Key passage: OpenRouter key comes from OS env or local `.env` only; `/api/doctor` and MCP Streamable HTTP at `/mcp` are owner-token protected; search is lexical, not RAG.

## Backend Gate Decision Basis

| Regression | Status | Evidence | Gate disposition |
| --- | --- | --- | --- |
| REG-2026-05-12-02 | CLOSED by existing MCP chain | `docs/audits/regression-audit-2026-05-12-contract-matrix.md:10` delegates null-array/empty-resource closure to existing MCP capability chain; `internal/resofeed/mcp_integration_test.go:78-97` asserts `resofeed://sources` and `resofeed://rules/active` serialize empty arrays, not null. | No duplicate/contradictory proof added; phase relies on existing chain. |
| REG-2026-05-12-04 | CLOSED | Runtime proof: `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json:54-58` shows `/mcp` `read_item` HTTP 200 and full-text marker present; `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_read_item.json:1` contains `extracted_text` with `FULL EXTRACTION DETAIL TEXT -- REG-04 black-box proof`; contract test `internal/resofeed/mcp_integration_test.go:99-145` fails if full extraction lacks detail text or fallback reason. | Real `/mcp` read_item proof exists; handler-only evidence is not the sole basis. |
| REG-2026-05-12-06 | CLOSED_WITH_NON_BLOCKING_DEBT | Required classification artifacts exist: `docs/audits/reg-2026-05-12-06-llm-health-proof-contract.md:18-36`; `.audit-artifacts/.../doctor_after_live_probe.txt:3-13` reports `openrouter_client_timeout_or_error`, `live_summary_successes=0`, `fallback_only_current_summaries=1`; `.audit-artifacts/.../live_feed_today.json:1` shows live item `model_status":"model_latency_error"`; `.audit-artifacts/.../openrouter_live_preflight.json:1-7` classifies direct live preflight as `provider_or_auth` with redacted key. | Fallback-only summaries were not counted as live success. Provider/privacy restriction is non-blocking for repo closure; live PASS remains debt outside current gate. |

unresolved_statuses: []
verdict: OPEN
blockers: []
gate_open_allowed: true
remaining_gaps:
  - Non-blocking: no current live OpenRouter `model_status=ok` item due provider/account guardrail restriction; artifact is classified and non-intersecting with backend/MCP runtime proof.

## behavioral_proof_register

| Claim | Proof status | Evidence | Uncertainty source |
| --- | --- | --- | --- |
| Real `resofeed serve` liveness | PROVEN | Probe rerun exit 0; `.audit-artifacts/.../report.json:63-77` records worktree-local `bin/resofeed serve`, port bound, migration ready. | None for local runtime. |
| `/api/doctor` runtime surface | PROVEN | `.audit-artifacts/.../report.json:6-15`; `.audit-artifacts/.../doctor_after_live_probe.txt:1-15`. | Live provider health is degraded but classified. |
| `/api/feed/today` runtime surface | PROVEN | `.audit-artifacts/.../report.json:20-30`; `.audit-artifacts/.../feed_today.json:1`. | Live item model status is fallback/error, not success. |
| Public source fetch path | PROVEN | `.audit-artifacts/.../live_source_fetch.json:1` shows `completed:true`, `items_discovered:1`, `items_upserted:1`, no errors. | None for RSS/local article fetch. |
| Real `/mcp` `read_item` full detail | PROVEN | `.audit-artifacts/.../mcp_read_item.json:1`; `.audit-artifacts/.../report.json:54-58`. | Seeded SQLite fixture after migration; still exercised real bound binary and `/mcp`, not handler-only. |
| MCP sources resource | PROVEN | `.audit-artifacts/.../mcp_sources_resource.json:1` returns JSON content for `resofeed://sources`; report status 200. | None. |
| Live OpenRouter success | NOT_PROVEN_NON_BLOCKING | `.audit-artifacts/.../openrouter_live_preflight.json:1-7`; `.audit-artifacts/.../doctor_after_live_probe.txt:7-10`. | Provider/account guardrail/privacy availability outside repo; explicitly not counted as live success. |
| Secret redaction | PROVEN | Probe report says key loaded as `<redacted-openrouter-key>` and doctor `contains_raw_secret:false`; independent secret scan command found `leak_count: 0`. | Scan scoped to liveness artifact directory and known main-workspace key. |

## Wiring Audit Results W1-W8

| ID | Area | Result | Evidence |
| --- | --- | --- | --- |
| W1 | Single runtime binary | PASS | Liveness rerun built and executed `./bin/resofeed serve`; report command path is worktree-local `.vectl/worktrees/regression-backend-mcp-llm-gate/bin/resofeed`. |
| W2 | SQLite/FTS storage boundary | PASS | Probe migrated temp SQLite and seeded/read via product runtime; architecture forbids vector/RAG, and scoped grep found only negative guard comments/tests for vector/RAG terms in `internal/resofeed`. |
| W3 | Owner-token auth boundary | PASS | Probe uses redacted `--owner-token` and authorized HTTP/MCP; MCP tests include unauthorized `/mcp` 401 assertions at `internal/resofeed/mcp_integration_test.go:25-28`, `168-174`, `263-270`. |
| W4 | HTTP API liveness | PASS | `/api/doctor`, `/api/feed/today`, `/api/sources/import-opml`, and `/api/sources/{id}/fetch` artifacts all status 200 in report. |
| W5 | MCP Streamable HTTP liveness | PASS | initialize, `tools/call read_item`, and `resources/read sources` status 200 in report. |
| W6 | LLM live/fallback classification | PASS_WITH_DEBT | Doctor and feed prove fallback/error classification; preflight classifies provider/auth guardrail; no fallback counted as live success. |
| W7 | Secret handling/redaction | PASS | Key loaded from permitted external `.env` only, report redacts value; independent scan found no raw key in liveness artifacts. |
| W8 | Architecture invariant preservation | PASS | No evidence of accounts/OAuth/RBAC/vector/RAG/sync/event bus/service layer additions in reviewed backend/MCP/LLM scope; matches are negative guard comments/tests. |

## Escape Hatch Audit

- Command: `rg -n '@invar:allow|invar:allow' cmd internal web/src web/tests docs/ARCHITECTURE.md docs/PRD.md docs/DESIGN.md docs/DESIGN_VISION.md docs/USAGE.md .agents/instructions.md`
- Exit: 1 (no matches).
- Result: no scoped source/ref `@invar:allow` or `invar:allow` escape hatches found. Earlier broad grep matched only plan/audit text and was not used as source approval evidence.

## Verification Run

| Command | Exit | Summary |
| --- | ---: | --- |
| `go test ./...` | 0 | `? resofeed/cmd/resofeed [no test files]`; `ok resofeed/internal/resofeed 0.687s`. |
| `mkdir -p bin && go build -o ./bin/resofeed ./cmd/resofeed && .venv/bin/python tests/repro/regression_backend_mcp_llm_liveness_probe.py` | 0 | Probe status PASS, no failures; worktree-local runtime proof. |
| `.venv/bin/python - <<'PY' ... raw-key artifact scan ... PY` | 0 | `key_present: True`, `files_scanned: 15`, `leak_count: 0`. |
| Scoped `rg` escape-hatch scan | 1 | No matches; ripgrep exit 1 means no matches. |

## Blockers / Warnings / Notes

Blockers: none.

Warnings:
- Live OpenRouter has no current `model_status=ok` proof. The gate accepts this only because direct preflight attributes the failure to provider/account guardrail availability and all repo-owned fallback classification is honest and redacted.

Notes:
- The first probe attempt failed because `bin/resofeed` was not present in the isolated worktree. I built the binary locally and reran the probe successfully.
- Transient SQLite DB directories and the built binary were not intentionally included as gate artifacts.

## Programmatic Handoff

```json
{
  "status": "SUCCESS",
  "gate_decision": {
    "headline": "PASS_WITH_DEBT",
    "verdict": "PASS",
    "gate_open_allowed": true,
    "orchestrator_action_hint": "COMPLETE",
    "blocking_status": "CLOSED",
    "proof_gap_status": "NON_BLOCKING",
    "blockers": []
  },
  "reg_mapping": {
    "REG-2026-05-12-02": "CLOSED",
    "REG-2026-05-12-04": "CLOSED",
    "REG-2026-05-12-06": "CLOSED_WITH_NON_BLOCKING_DEBT"
  },
  "artifacts_modified": [
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/doctor.txt",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/doctor_after_live_probe.txt",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/feed_today.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_feed_today.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_source_fetch.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/live_sources.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/mcp_sources_resource.json",
    ".audit-artifacts/regression_backend_mcp_llm_liveness_probe/gate-reviewer-final-gate.md"
  ]
}
```
