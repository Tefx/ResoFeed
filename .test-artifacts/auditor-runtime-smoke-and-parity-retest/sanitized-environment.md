# ResoFeed E2E sanitized environment

- Allowed variables: PATH, HOME, TMPDIR, RESOFEED_E2E, RESOFEED_E2E_OPENROUTER_ENDPOINT, OPENROUTER_KEY.
- OPENROUTER_KEY: <redacted non-secret sentinel>; ambient OS value not forwarded.
- OpenRouter endpoint: deterministic local test transport; no external secret or provider call.
- Owner token: supplied by --owner-token and redacted from logs/artifacts.
- OPML fixture feed URL: http://127.0.0.1:57052/e2e-feed.xml
- Fixture feed server stdout: /Users/tefx/Projects/ResoFeed/.vectl/worktrees/item-reingest-system-verification.runtime-smoke-and-parity-retest/.test-artifacts/playwright/server-logs/fixture-server.stdout.log
- Fixture feed server stderr: /Users/tefx/Projects/ResoFeed/.vectl/worktrees/item-reingest-system-verification.runtime-smoke-and-parity-retest/.test-artifacts/playwright/server-logs/fixture-server.stderr.log
- Binary: /Users/tefx/Projects/ResoFeed/.vectl/worktrees/item-reingest-system-verification.runtime-smoke-and-parity-retest/.test-artifacts/bin/resofeed
- Database fixture: /Users/tefx/Projects/ResoFeed/.vectl/worktrees/item-reingest-system-verification.runtime-smoke-and-parity-retest/.test-artifacts/playwright/fixtures/resofeed-e2e-1779378648042-68270.sqlite3
- Base URL: http://127.0.0.1:57055