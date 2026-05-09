# Runtime Secret Env Config Gate Review

Reviewer: gate-reviewer
Timestamp: 2026-05-10T00:00:00Z

Verdict: OPEN / PASS

Evidence summary:
- Required refs read: `.agents/instructions.md`, `docs/ARCHITECTURE.md`, `docs/USAGE.md`, `README.md`, `docs/DESIGN.md`.
- Focused runtime-secret tests: `go test ./internal/resofeed -run 'Test(GeminiRuntimeSecret|DotEnvParser|StatePortabilityExcludes|DocsRuntimeSecret|DocsDoNotRequire)' -count=1` -> PASS.
- Full Go tests: `go test ./... -count=1` -> PASS.
- Race-focused runtime-secret tests: `go test -race ./internal/resofeed -run 'Test(GeminiRuntimeSecret|DotEnvParser|StatePortabilityExcludes|DocsRuntimeSecret|DocsDoNotRequire)' -count=1` -> PASS.
- Static vet: `go vet ./...` -> PASS.
- Build: `go build -o ./bin/resofeed ./cmd/resofeed` -> PASS.
- CLI surface: `./bin/resofeed --help`, `./bin/resofeed serve --help`, and `./bin/resofeed doctor` unknown-command check -> PASS.
- Runtime smoke: temporary local `.env` with fake `GEMINI_API_KEY=<redacted>`, no `--gemini-api-key`, explicit owner token, HTTP `/`, `/api/doctor`, and `/api/state/export` all succeeded; output/export scan found `SMOKE_SECRET_LEAK_HITS=0`.
- State export keys observed: `schema_version,exported_at,sources,steer_rules,resonated_items`.
- Escape hatch scan excluding orchestrator state and dependencies: no `@invar:allow` or `invar:allow` findings.

Non-blocking warnings:
- Some non-public repro/test harnesses still use fake `--gemini-api-key` values for legacy startup tests. Public docs and smoke path no longer require CLI-passed API keys; these are not OpenRouter docs or real-secret examples.

Blocking gaps: none.
