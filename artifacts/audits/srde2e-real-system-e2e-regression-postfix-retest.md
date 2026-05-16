# srde2e real-system E2E regression post-fix retest

Verifier: integration-verifier  
Worktree: `.vectl/worktrees/srde2e-real-system-e2e-regression`  
Branch: `vectl/step-srde2e-real-system-e2e-regression`

## Verdict

PASS. The previous blocker class (valid URL source-add commits in backend but UI receipt lacks `[UNDO]`) is not reproduced. Runtime browser proof captured a real `cmd/resofeed serve` process with SQLite, static UI, JSON HTTP, MCP Streamable HTTP, source add, undo, invalid-add rejection, lexical find/search, `/doctor`, Source Ledger controls, and MCP preview/steer/undo parity.

## Commands and raw outcomes

```bash
npm --prefix web ci
# added 150 packages; 5 npm audit findings reported by npm

npm --prefix web run test:e2e -- --project=chromium-ci-safe web/tests/e2e/real-server-ui.spec.ts
# 9 passed (11.4s)

go test ./...
# ?    resofeed/cmd/resofeed [no test files]
# ok   resofeed/internal/resofeed 1.071s

npm --prefix web run check
# svelte-check found 0 errors and 0 warnings
```

Custom runtime proof command was a one-off `node --input-type=module` Playwright script run from `web/`. It spawned:

```text
cmd/resofeed serve --addr 127.0.0.1:52960 --public-url http://127.0.0.1:52960 --db artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/runtime-proof-1778934650012.sqlite3 --owner-token <test-owner-token>
```

Raw completion:

```json
{
  "status": "ok",
  "artifactDir": "/Users/tefx/Projects/ResoFeed/.vectl/worktrees/srde2e-real-system-e2e-regression/artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof",
  "checks": [
    "owner_token_gate",
    "browser_valid_url_add_shows_undo",
    "browser_undo_deactivates_source",
    "source_ledger_controls_reachable",
    "invalid_add_url_required_no_mutation",
    "invalid_add_url_required_no_mutation",
    "invalid_add_url_required_no_mutation",
    "find_alias_lexical_warning_read_only",
    "doctor_read_only_diagnostics",
    "mcp_preview_steer_undo_parity"
  ]
}
```

Server log excerpt:

```text
owner token explicit: stored hash
serving ResoFeed on 127.0.0.1:52960 (public-url http://127.0.0.1:52960)
shutdown complete
```

## Runtime artifact paths

- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/runtime-proof.json`
- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/source-add-undo-visible.png`
- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/source-ledger-controls.png`
- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/find-lexical-warning.png`
- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/doctor-read-only.png`
- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/server.stdout.log`
- `artifacts/audits/srde2e-real-system-e2e-regression-runtime-proof/server.stderr.log`

## Key proof snippets from `runtime-proof.json`

- Valid URL add receipt: `applied: source added: 127.0.0.1:52958/undo-proof.xml; source ledger records it; background ingest will pick it up\n[UNDO]`.
- Source add persisted through backend: `source_id: src_222cb13c72a033a9`.
- Undo source mutation proof: `active_source_present: false` after `[UNDO]`.
- Invalid add commands had stable active source count: `添加 tldr`, `订阅 HN`, `add tldr` each kept `countBeforeInvalid: 1` and `countAfterInvalid: 1` with URL-required copy visible.
- Find alias proof: `status: 1 results`, `no_semantic_answer_ui: true`.
- Doctor read-only proof: `rulesBeforeDoctor: 1`, `rulesAfterDoctor: 1`, diagnostics contained `rss: ok` and `openrouter:` lines.
- MCP preview proof: route kind `search`, `will_mutate: false`, message includes `no generated answer, vector DB, embeddings, RAG, or hidden retrieval expansion`.
- MCP steer/undo proof: `undo_handle.target.kind` was `steer_rule`; `undo_steer` returned `undone: true` and `message: undone: target steer rule disabled`.

## Notes

- Product implementation files were not modified.
- Generated SQLite database was intentionally not committed; the committed JSON/screenshots/log excerpts are the audit artifact.
- `npm --prefix web ci` was run only after verifying `web/node_modules` and `web/node_modules/.bin/playwright` were absent in the isolated worktree.
