# Spec/doc/state conformance audit — OpenRouter verification

step_intent: retest_green  
expected_result: green  
observed_result: red  
verdict: FAIL  
gate_open_allowed: false

## Summary

The implementation is broadly OpenRouter-aligned and the Go suite is green, but the audit found a blocker-class runtime validation-order divergence from `docs/ARCHITECTURE.md` startup matrix: with no OpenRouter key and an invalid `--addr`, startup reports `invalid_openrouter_key` instead of the required `invalid_addr`. This means deterministic startup validation precedence is not conformant.

## Commands run

```text
go test ./...  # PASS: ? resofeed/cmd/resofeed [no test files]; ok resofeed/internal/resofeed 1.168s
env -u OPENROUTER_KEY -u GEMINI_API_KEY go run ./cmd/resofeed serve --addr bad --db /var/folders/rs/6_0h1ssn5439q1yfqy4pykg00000gn/T/opencode/audit-invalid.sqlite3 --owner-token rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG
# observed stderr: err: invalid_openrouter_key: value required; exit status 2
env -u OPENROUTER_KEY -u GEMINI_API_KEY go run ./cmd/resofeed serve --help
# observed only --addr, --public-url, --db, --openrouter-model, --owner-token
```

## Key evidence

- Spec: `docs/ARCHITECTURE.md:92-104` requires invalid startup inputs to fail before binding; invalid `--addr` maps to `err: invalid_addr: expected HOST:PORT`, and missing/empty OpenRouter key maps separately to `err: invalid_openrouter_key: value required`.
- Implementation: `internal/resofeed/db.go:40-49` resolves `OPENROUTER_KEY` before deriving/validating `--addr` and `--public-url` (`db.go:50-61`, `db.go:109-124`).
- Runtime proof: the command above with invalid `--addr bad` and no OpenRouter key returned `err: invalid_openrouter_key: value required`, proving the earlier key check masks the invalid address.
- Positive controls: `go test ./...` passed; `cmd/resofeed/main.go:9-13`, `internal/resofeed/db.go:75-83`, `runtime_secret.go:11-35`, `openrouter.go:152-160`, `doctor.go:112-122`, `state.go:47-131`, and `mcp.go:608-661` provide substantial conforming evidence for other OpenRouter/runtime/doctor/state/MCP requirements.

## Blockers

1. **Startup validation-order divergence** — deterministic startup validation matrix is not met when invalid non-secret flags coexist with missing OpenRouter key. Remediation: validate/derive `--addr`, `--public-url`, and owner-token syntax before resolving OpenRouter secret, or add explicit deterministic validation ordering/tests matching `docs/ARCHITECTURE.md:96-104`.

## Non-blocking risks

- `.agents/instructions.md:11,27-31` still contains stale Gemini-era guidance conflicting with `docs/ARCHITECTURE.md:17,69-83`. The canonical architecture appears newer and implementation follows it, but the conflict should be cleaned up to avoid future agent drift.
- Several `_test.go` helper names still contain `Gemini`; production non-test grep did not find Gemini runtime symbols, so this is naming debt only unless test naming is considered part of the public contract.

## Product files modified

false — only this audit artifact was added.
