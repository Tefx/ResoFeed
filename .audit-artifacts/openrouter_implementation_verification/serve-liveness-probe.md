# OpenRouter implementation verification — serve liveness probe

step_intent: retest_green  
expected_result: green  
observed_result: green  
verdict: PASS

## [Vibe Check]

The risky failure mode here is a handler-only or config-only green result: a binary can parse flags yet never bind a socket, or a doctor handler can be unit-tested while the real process leaks runtime secrets. I therefore treated the actual `resofeed serve` process as guilty until it bound a real TCP port, served `GET /api/doctor` over HTTP with owner-token auth, rejected legacy Gemini flags at CLI parse time, and kept the fake OpenRouter key absent from raw logs and doctor output.

## Refs read confirmation

- `AGENTS.md` — NOT READ: file absent in isolated worktree.
- `.agents/instructions.md` — read lines 8-12 one-binary boundary; lines 25-31 runtime-only LLM secret handling and OpenRouter accepted names; lines 33-35 HTTP/API contract.
- `docs/ARCHITECTURE.md` — read lines 11-18 one binary/OpenRouter-only decisions; lines 45-83 runtime command/OpenRouter secret and `/doctor` contract; lines 930-943 gate criteria including `resofeed serve`, no CLI API-key requirement, and `/doctor` `openrouter:` no-key output.
- `docs/USAGE.md` — read lines 33-58 OpenRouter key setup and `.env`/OS env contract; lines 60-74 serve command and no separate processes; lines 430-443 `/api/doctor` example; lines 648-662 diagnostics and redaction rules.

## Commands executed

```text
npm --prefix web run build && mkdir -p ./bin && go build -o ./bin/resofeed ./cmd/resofeed
# failed initially: vite missing

npm --prefix web install && npm --prefix web run build && mkdir -p ./bin && go build -o ./bin/resofeed ./cmd/resofeed

OPENROUTER_KEY=<OPENROUTER_KEY_REDACTED> ./bin/resofeed serve --addr 127.0.0.1:18088 --public-url http://127.0.0.1:18088 --db <TMP_DB> --owner-token <OWNER_TOKEN_REDACTED>

curl-equivalent urllib request:
GET http://127.0.0.1:18088/api/doctor
Authorization: Bearer <OWNER_TOKEN_REDACTED>

./bin/resofeed serve --gemini-api-key <legacy-secret-redacted> --db <TMP_DIR>/legacy.sqlite3

./bin/resofeed serve --help
```

## Actual output snippets

```text
Initial build:
> resofeed-web@0.0.0-contract build
> vite build
sh: vite: command not found

Dependency/bootstrap + build:
added 150 packages, and audited 151 packages in 2s
3 low severity vulnerabilities
> resofeed-web@0.0.0-contract build
> vite build
✓ built in 274ms
> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done

serve probe:
started_port: true
doctor_status: 200
doctor_headers:
Content-Type: text/plain; charset=utf-8
Content-Length: 132

doctor_body:
rss: ok
openrouter: ok configured_model=account_default resolved_model=unknown
openrouter: ok
extraction: ok

serve_log:
owner token explicit: stored hash
serving ResoFeed on 127.0.0.1:18088 (public-url http://127.0.0.1:18088)
shutdown complete

fake_key_in_raw_log: false
fake_key_in_raw_doctor: false

additional surface exposure probe:
GET / -> 200 text/html; charset=utf-8
GET /mcp without auth -> 401 application/json; charset=utf-8 {"error":{"code":"unauthorized","message":"owner token required","details":{}}}
GET /api/doctor with auth -> 200 text/plain; charset=utf-8

legacy Gemini flag rejection:
returncode: 2
stderr: flag provided but not defined: -gemini-api-key
stdout excerpt:
Usage: resofeed serve [flags]
Flags:
  -addr string
  -db string
  -openrouter-model string
  -owner-token string
  -public-url string
legacy_secret_in_output: false
```

## Runnable surface evidence

- Entrypoint command: real built `./bin/resofeed serve` from `./cmd/resofeed`; no CLI API-key flag used.
- Startup result: bound `127.0.0.1:18088`; startup log reached `serving ResoFeed ...`. Follow-up probe on `127.0.0.1:18089` confirmed UI root returns HTML and `/mcp` is present behind owner-token auth.
- Operation accepted: authenticated `GET /api/doctor` returned HTTP 200 text/plain.
- `/doctor` OpenRouter raw text: included `openrouter: ok configured_model=account_default resolved_model=unknown` and `openrouter: ok`.
- Gemini flag rejection: `--gemini-api-key` returned exit code 2 with `flag provided but not defined: -gemini-api-key`.
- Secrets redacted: fake OpenRouter key absent from raw serve logs and raw doctor body; legacy fake Gemini value absent from parse error output.

## behavioral_proof_register

- proof: build_real_entrypoint
  command: `npm --prefix web install && npm --prefix web run build && mkdir -p ./bin && go build -o ./bin/resofeed ./cmd/resofeed`
  result: PASS
  notes: Initial `npm --prefix web run build` failed because `vite` was missing; documented quickstart install resolved it. NPM audit reported 3 low-severity dependency advisories, not liveness blockers.
- proof: serve_binds_http_with_openrouter_env
  command: `OPENROUTER_KEY=<OPENROUTER_KEY_REDACTED> ./bin/resofeed serve --addr 127.0.0.1:18088 --public-url http://127.0.0.1:18088 --db <TMP_DB> --owner-token <OWNER_TOKEN_REDACTED>`
  result: PASS
  notes: Bound TCP port and served HTTP before any fake-upstream OpenRouter call was needed. Follow-up probe also returned `200 text/html` for `/` and `401 owner token required` for `/mcp`, proving those surfaces were routed by the same process.
- proof: doctor_openrouter_text_no_secret
  command: `GET /api/doctor` with owner token
  result: PASS
  notes: Returned `text/plain` with `openrouter:` lines and no fake key, secret source, `.env` path, or raw provider config.
- proof: legacy_gemini_flag_rejected
  command: `./bin/resofeed serve --gemini-api-key <legacy-secret-redacted> --db <TMP_DIR>/legacy.sqlite3`
  result: PASS
  notes: CLI parser rejected the legacy Gemini flag before startup; output did not echo the fake legacy value.

## Issues found

| Severity | Description | Location | Reproduction |
|---|---|---|---|
| Non-blocking | Documented build command requires web dependencies; a cold worktree without `web/node_modules` fails `npm --prefix web run build` with `vite: command not found` until `npm --prefix web install` is run. This aligns with docs Quick Start step 1 and did not block liveness after following docs. | Local build environment | `npm --prefix web run build` in cold worktree |

## Conclusion

headline: PASS  
gate_open_allowed: true  
orchestrator_action_hint: COMPLETE
