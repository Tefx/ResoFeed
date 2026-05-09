# Live OpenRouter Smoke Evidence

step_intent: retest_green
expected_result: green
observed_result: blocked
failure_alignment: n/a
verdict: BLOCKED
blockers:
- B1: `OPENROUTER_KEY` was absent from the OS environment and no local `.env` fallback with `OPENROUTER_KEY=` was present in the isolated worktree; live OpenRouter smoke cannot be executed without fabricating evidence.
product_implementation_files_modified: false
gate_open_allowed: false
orchestrator_action_hint: DO_NOT_COMPLETE
headline: FAIL
proof_gap_status: BLOCKING
blocking_status: OPEN

**Tester**: blind-tester
**Independence Level**: L3

## refs Read Confirmation

- AGENTS.md — NOT READ: no `AGENTS.md` file exists at the isolated worktree root. The inherited prompt copy says one deployable Go binary, one SQLite DB, OpenRouter runtime-only secrets, single owner token, strict HTTP validation, and no product-code/doc/test modifications by auditor.
- .agents/instructions.md — Read lines 8-35 and 25-31: one `cmd/resofeed` binary; SQLite only; OpenRouter JSON transformer; owner token boundary; runtime OpenRouter keys must never be persisted, exposed, logged, printed in `/doctor`, fixtures, or committed artifacts; OS/local `.env` `OPENROUTER_KEY` precedence; no CLI secret flags; `OPENROUTER_KEY` is the only accepted OpenRouter API-key name.
- docs/ARCHITECTURE.md — Read lines 11-19 and 69-82: `resofeed serve` serves static UI, JSON HTTP, MCP, ingest; OpenRouter is sole LLM backend; `OPENROUTER_KEY` from OS then local `.env`; missing/empty key must fail before binding; state export/import and `/doctor` must not reveal secrets or provider config; omitted model is `account_default`.
- docs/DESIGN.md — Read lines 371-389 and 463-487: owner-token prompt, first-use empty state, Source Ledger OPML import, state portability warning, and `/doctor` as raw text diagnostics.
- docs/USAGE.md — Read lines 24-74, 139-239, 336-443, and 624-741: documented build/run, no CLI secret flag, auth header, `/api/feed/today`, strict query validation, OPML import, `/api/search`, `/api/state/export`, `/api/doctor`, and MCP `/mcp` resources/tools.

## Secret Handling

- `.env`/OPENROUTER_KEY value was not printed: only presence/absence was checked; no environment values or `.env` contents were emitted.
- Owner token value redacted: no owner token was generated or used because the OpenRouter precondition failed before live server execution.
- Commands run without shell tracing secrets: no `set -x`; no API key on command line; no `.env` sourcing; no request headers with secrets printed.

## Commands Executed

```text
ls -la && if [ -n "${OPENROUTER_KEY:-}" ]; then printf 'OPENROUTER_KEY_PRESENT=os_env\n'; elif [ -n "${OPENROUTER_API_KEY:-}" ]; then printf 'OPENROUTER_API_KEY_PRESENT=os_env_but_contract_prefers_OPENROUTER_KEY\n'; elif [ -f .env ] && /usr/bin/grep -Eq '^[[:space:]]*OPENROUTER_KEY[[:space:]]*=' .env; then printf 'OPENROUTER_KEY_PRESENT=dot_env\n'; elif [ -f .env ] && /usr/bin/grep -Eq '^[[:space:]]*OPENROUTER_API_KEY[[:space:]]*=' .env; then printf 'OPENROUTER_API_KEY_PRESENT=dot_env_alias_but_contract_prefers_OPENROUTER_KEY\n'; else printf 'OPENROUTER_KEY_PRESENT=missing\n'; fi
ls ".audit-artifacts" && mkdir -p ".audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test"
```

No build, serve, curl, MCP, or UI commands were executed after the missing live-secret precondition was established. Running further smoke steps would create misleading partial evidence for a live OpenRouter gate.

## Actual Redacted Output

```text
OPENROUTER_KEY_PRESENT=missing
```

## Smoke Matrix

| Surface | Operation | Expected | Observed | Status |
|---|---|---|---|---|
| Build | cmd/resofeed | binary builds | Not run after missing OpenRouter precondition | BLOCKED |
| Server | resofeed serve | starts with env/.env key and omitted model | Not run; `OPENROUTER_KEY` unavailable | BLOCKED |
| Auth | unauth/auth | reject/accept | Not run; server not started | BLOCKED |
| Feed | /api/feed/today | reachable | Not run; server not started | BLOCKED |
| Search | /api/search | strict validation | Not run; server not started | BLOCKED |
| Doctor | /api/doctor | openrouter no secrets | Not run; server not started | BLOCKED |
| State | /api/state/export | no runtime config | Not run; server not started | BLOCKED |
| OPML | import path | not portable state restore | Not run; server not started | BLOCKED |
| MCP | initialize/tools/resources/steer | parity | Not run; server not started | BLOCKED |
| UI | page load | nonblank | Not run; server not started | BLOCKED |

## Issues Found

| Severity | Description | Location | Reproduction | Gate Intersection |
|---|---|---|---|---|
| Blocking | Required live OpenRouter secret unavailable in isolated worktree/OS environment. | Environment precondition | Check `OPENROUTER_KEY` in OS env or local `.env` without printing values; observed `OPENROUTER_KEY_PRESENT=missing`. | Final OpenRouter gate cannot open; no live smoke evidence can be trusted. |

## Artifact

- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test.md`
