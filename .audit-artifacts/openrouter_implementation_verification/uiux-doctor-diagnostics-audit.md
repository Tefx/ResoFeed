# UI/UX Visible-Output Audit Report

step_id: `openrouter-llm-implementation.uiux-doctor-diagnostics-audit`

## Headline

**PASS_WITH_DEBT** — the implementation gate can open because `/api/doctor` emits terse raw text with OpenRouter/account-default wording and no observed secret leakage, but the default output contains a redundant `openrouter: ok` line that should be collapsed before polish closure.

## Scope and authority read confirmation

- `docs/DESIGN.md` read: `/doctor` diagnostics must be raw monospace text, not a dashboard/charts/friendly remediation cards; feedback lines must be raw strings; product chrome must use operational labels such as `/doctor`; no Gemini-facing runtime text, friendly SaaS copy, mascots, or AI-trust palette language.
- `docs/ARCHITECTURE.md` read: `/doctor` must use `text/plain`, report OpenRouter diagnostics with an `openrouter:` prefix, use `account_default` when the model is omitted, and must never print API keys, secret source, `.env` paths, authorization headers, or provider config.
- `.agents/instructions.md` read: runtime LLM secrets are runtime-only and evidence must redact `OPENROUTER_KEY`; UI chrome must remain dense, muted, archival, and functional.
- `docs/USAGE.md` read: `/doctor` is plain text operational health, not a dashboard or wizard; expected lines include `openrouter: ok configured_model=account_default resolved_model=unknown` and no secrets.

## Runtime-visible evidence

Build command:

```text
go build -o /var/folders/rs/6_0h1ssn5439q1yfqy4pykg00000gn/T/opencode/resofeed-uiux-audit ./cmd/resofeed
```

Authorized `/api/doctor` with omitted `--openrouter-model`:

```text
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

rss: ok
openrouter: ok configured_model=account_default resolved_model=unknown
openrouter: ok
extraction: ok
ingest: last_run=never
```

Authorized `/api/doctor` with `--openrouter-model openai/gpt-4.1-mini`:

```text
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

rss: ok
openrouter: ok configured_model=openai/gpt-4.1-mini resolved_model=unknown
openrouter: ok
extraction: ok
ingest: last_run=never
```

Unauthorized `/api/doctor`:

```text
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8

{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

Missing `OPENROUTER_KEY` startup validation:

```text
exit_code=2
err: invalid_openrouter_key: value required
```

Redacted server log secret scan:

```text
leaks=none
owner token explicit: stored hash
serving ResoFeed on 127.0.0.1:<ephemeral-port> (public-url http://127.0.0.1:<ephemeral-port>)
```

## Findings

| Severity | Description | Location | Reproduction |
|---|---|---|---|
| should_fix | Default and configured-model `/doctor` output includes two `openrouter:` success lines: the contract-rich `openrouter: ok configured_model=... resolved_model=...` plus a bare `openrouter: ok`. This is terse and not secret-bearing, but it is redundant status text and weakens the clarity of the OpenRouter model/default wording. | `GET /api/doctor`; source diagnosis: `internal/resofeed/doctor.go` appends `openRouterDoctorLine(cfg)` and then `readItemStatusDiagnostics(..., "openrouter", "model_status", ...)` returns `openrouter: ok` when no failures exist. | Start with `OPENROUTER_KEY=<redacted>` and explicit owner token, then `curl -i /api/doctor -H "Authorization: Bearer <redacted>"`. |

No blockers were found.

## Compliance summary

- Functional labels / archival density: **PASS_WITH_DEBT**. `/api/doctor` is plain text, uses operational prefixes, and avoids dashboards/cards; redundant `openrouter: ok` should be collapsed.
- No SaaS/AI-magic/friendly onboarding tone: **PASS**. Observed text is raw status only.
- No Gemini-facing runtime text: **PASS**. Runtime-visible `/doctor`, startup validation, and startup logs did not contain `gemini`.
- OpenRouter model/default wording: **PASS_WITH_DEBT**. `configured_model=account_default` and configured model strings are clear; duplicate `openrouter: ok` is the only clarity debt.
- Secret-bearing fields: **PASS**. Captured artifacts contain no raw OpenRouter key values, `.env` path/source metadata, bearer tokens, authorization headers, or account identifiers. The explicit owner token was used only inside the local command and is not present in retained evidence.

## Behavioral proof register

- proof: `doctor_account_default_plain_text`
  artifact: authorized `GET /api/doctor` excerpt above
  result: PASS_WITH_DEBT
  notes: correct content type and `account_default`; duplicate `openrouter: ok` should be removed/collapsed.
- proof: `doctor_configured_model_plain_text`
  artifact: authorized `GET /api/doctor` with `--openrouter-model openai/gpt-4.1-mini`
  result: PASS_WITH_DEBT
  notes: configured model is passed through unchanged; duplicate `openrouter: ok` remains.
- proof: `auth_error_microcopy`
  artifact: unauthorized `/api/doctor` excerpt
  result: PASS
  notes: terse `owner token required`; no account/login/remediation wizard tone.
- proof: `startup_secret_validation_microcopy`
  artifact: missing-key stderr excerpt
  result: PASS
  notes: deterministic `err: invalid_openrouter_key: value required`, no value echo.
- proof: `secret_redaction_scan`
  artifact: server log scan and HTTP excerpts
  result: PASS
  notes: no raw key, `.env`, `OPENROUTER_KEY`, `Authorization: Bearer`, or account IDs observed.

## Product implementation files modified

false — only this audit artifact was added.

## Gate recommendation

`gate_open_allowed: true` with implementation debt to collapse the redundant OpenRouter OK line.
