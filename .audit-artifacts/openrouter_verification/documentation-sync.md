# OpenRouter Documentation Sync Audit

Date: 2026-05-10
Step: `openrouter-llm-verification-and-live-smoke.documentation-sync`
Reviewer: doc-reviewer

## Verdict

PASS. No product documentation changes were required. README, USAGE, ARCHITECTURE, DESIGN, and local agent guidance already match the implemented OpenRouter behavior and the successful live-smoke retry artifact.

## Required Reading Confirmation

- `AGENTS.md` — NOT READ: no tracked `AGENTS.md` exists at the isolated worktree root (`git ls-files -- AGENTS.md .agents/instructions.md docs/ARCHITECTURE.md docs/DESIGN.md docs/USAGE.md README.md` returned no `AGENTS.md`).
- `.agents/instructions.md` — Read: one Go binary, SQLite-only storage, OpenRouter JSON transformer, runtime-only OpenRouter secret handling, `OPENROUTER_KEY` OS/local `.env` precedence, no CLI secret flags, single owner token, HTTP/MCP parity.
- `docs/ARCHITECTURE.md` — Read: OpenRouter is sole LLM backend; `--openrouter-model` is optional/non-secret; API key resolves from OS `OPENROUTER_KEY` then local `.env`; `/doctor` uses `openrouter:` and configured/resolved model distinction; state export excludes secrets/model/provider config.
- `docs/DESIGN.md` — Read: operational labels only, owner-token prompt, Source Ledger state portability, `/doctor` as raw text, no dashboard or settings expansion.
- `docs/USAGE.md` — Read: safe OpenRouter key configuration, `.env` placeholder only, run command without API-key flag, optional model, `/doctor` example, state export/import, MCP owner-token usage.
- `README.md` — Read: quick start uses local `.env` placeholder, no inline key command, optional `--openrouter-model`, one-binary/OpenRouter/SQLite/runtime-boundary summary.

## Live Smoke Reference

- `.audit-artifacts/openrouter_verification/live-openrouter-smoke-system-test-retry.md` reports PASS: `.env` fallback exercised without printing values; `/api/doctor` returned `openrouter: ok configured_model=account_default resolved_model=unknown`; state export leaked no OpenRouter key, env source, `.env` path, model/provider config, or secret fields; HTTP/MCP/UI surfaces contained no Gemini or CLI API-key instructions.

## Documentation Checks

| Requirement | Evidence | Result |
|---|---|---|
| OpenRouter key via OS env or local `.env`, no command-line secret flag | `README.md:14-31`, `docs/USAGE.md:33-58`, `docs/ARCHITECTURE.md:69-90` | PASS |
| `--openrouter-model` optional and non-secret | `README.md:31`, `docs/USAGE.md:70,83`, `docs/ARCHITECTURE.md:62,65` | PASS |
| No Gemini flag/provider promises in core docs | `rg` forbidden search returned `FORBIDDEN_FLAG_AND_SECRET_DOC_SEARCH=NO_MATCHES` | PASS |
| `/doctor` OpenRouter raw text with configured/default/resolved model distinction and no keys | `docs/USAGE.md:430-443,648-662`, `docs/ARCHITECTURE.md:82,943` | PASS |
| State export excludes runtime-only OpenRouter key/env/model/provider config | `docs/ARCHITECTURE.md:76-77`, `docs/USAGE.md:624-646` | PASS |
| `.env` local-only and redacted placeholders | `README.md:16-21`, `docs/USAGE.md:40-58`, `docs/ARCHITECTURE.md:84-90` | PASS |
| HTTP/MCP owner-token parity preserved | `docs/ARCHITECTURE.md:16,552-557,808-825`, `docs/USAGE.md:139-149,674-741` | PASS |
| No forbidden architecture concepts introduced | README and architecture continue to forbid accounts/OAuth, sync/merge/history, vector/embeddings/RAG, provider abstraction layers | PASS |

## Search Evidence

```text
$ rg -n -- '--gemini|--gemini-api-key|--gemini-model|gemini|Gemini|--openrouter-api-key|OPENROUTER_API_KEY|sk-or-v1' README.md docs/USAGE.md docs/ARCHITECTURE.md docs/DESIGN.md .agents/instructions.md; rc=$?; if [ "$rc" -eq 1 ]; then printf 'FORBIDDEN_FLAG_AND_SECRET_DOC_SEARCH=NO_MATCHES\n'; else printf 'FORBIDDEN_FLAG_AND_SECRET_DOC_SEARCH=MATCHES exit=%s\n' "$rc"; fi
FORBIDDEN_FLAG_AND_SECRET_DOC_SEARCH=NO_MATCHES

$ rg -n -- 'OPENROUTER_KEY|--openrouter-model|openrouter:|configured_model|resolved_model|\.env is local-only|runtime input only|state export/import must never include|MCP tools/resources expose the same product concepts|every `/mcp` request/session requires' README.md docs/USAGE.md docs/ARCHITECTURE.md .agents/instructions.md
README.md:19:# .env is local-only; do not commit or print the real value.
README.md:20:OPENROUTER_KEY=<redacted-local-value>
README.md:28:  --openrouter-model openai/gpt-4.1-mini
README.md:31:`--openrouter-model` is optional and non-secret; omit it to use the OpenRouter account default. OpenRouter API keys must come from the OS environment or local `.env`, not CLI flags.
docs/ARCHITECTURE.md:62:| `--openrouter-model` | No | empty / account default | Optional OpenRouter model. Empty or omitted means use the OpenRouter account default. Provided values are passed through unchanged with no startup network model validation. |
docs/ARCHITECTURE.md:73:- `OPENROUTER_KEY` is the only accepted OpenRouter API-key name for OS environment and local `.env` sources. CLI-passed API keys are forbidden for OpenRouter.
docs/ARCHITECTURE.md:76:- LLM API keys are runtime input only. They must never be written to SQLite, `runtime_metadata`, migrations, state bundles, logs, `/doctor`, HTTP/MCP responses, frontend assets, test fixtures, docs examples, or committed artifacts.
docs/ARCHITECTURE.md:77:- State export/import must never include LLM secret values, selected model, provider name, secret-source metadata, `.env` path, or provider configuration. Redacted evidence such as `OPENROUTER_KEY=<redacted>` or `source=os_env/.env` is acceptable; raw key values are not.
docs/ARCHITECTURE.md:82:- `/doctor` OpenRouter diagnostics must use an `openrouter:` line prefix, include the configured model (`account_default` when omitted), include a resolved model only when available from runtime responses, and never include the API key, secret source, `.env` path, or raw provider configuration.
docs/ARCHITECTURE.md:810:MCP is required over Remote Streamable HTTP at `/mcp`. MCP tools/resources expose the same product concepts as the UI: inspect, resonate, steer, retrieve, and report delivery.
docs/ARCHITECTURE.md:814:- every `/mcp` request/session requires `Authorization: Bearer <OWNER_TOKEN>`;
docs/USAGE.md:43:# .env is local-only; do not commit or print the real value.
docs/USAGE.md:54:`OPENROUTER_KEY` is the only documented OpenRouter API-key name. OpenRouter secrets must not be passed through CLI flags.
docs/USAGE.md:441:openrouter: ok configured_model=account_default resolved_model=unknown
docs/USAGE.md:662:Diagnostics and live-smoke evidence must redact LLM API keys. Acceptable evidence says a key was resolved from `os_env` or `.env` and shows `OPENROUTER_KEY=<redacted>`; it must not show the actual value. `/doctor` OpenRouter lines use the `openrouter:` prefix, include the configured model (`account_default` when omitted), include a resolved model only when available, and never print keys, secret-source metadata, `.env` paths, or provider configuration.
.agents/instructions.md:26:- **Runtime-Only LLM Secrets**: OpenRouter API keys are runtime input only. Never persist them to SQLite, include them in state bundles, expose them through HTTP/MCP/UI, log them, print them in `/doctor`, place them in fixtures, or commit them in artifacts.
.agents/instructions.md:31:- **OpenRouter-Only Runtime**: `OPENROUTER_KEY` is the only accepted OpenRouter API-key name for OS environment and local `.env` sources. Do not regress to CLI API-key examples or alternate provider compatibility flags.
```

## Secret Safety

- No real OpenRouter key was read, printed, or committed.
- Examples use `<redacted-local-value>` and `<OWNER_TOKEN>` placeholders.
- `.env` is documented as local runtime input only and must not be committed.

## Changes

- Added this scoped audit artifact only.
- Product implementation files modified: false.
