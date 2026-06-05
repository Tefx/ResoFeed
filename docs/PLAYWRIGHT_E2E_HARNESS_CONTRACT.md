# Playwright Comprehensive E2E Harness Contract

Status: contract lock only. This document defines the launch, matrix, artifact, and live-secret boundaries for a future comprehensive Playwright harness. It does not implement product behavior, fake product states, sidecar processes, queues, sync, accounts, vector search, or new UI concepts.

## Source Basis

- `docs/ARCHITECTURE.md`: ResoFeed is one `cmd/resofeed` deployable serving static UI, JSON HTTP, MCP Streamable HTTP, and background ingest against one SQLite database. OpenRouter secrets are runtime-only inputs from `OPENROUTER_KEY` or local `.env`, never CLI flags or committed artifacts. Manual ingest/fetch HTTP actions are immediate requests guarded by source-scoped bounded leases (with a global-exclusive guard only for destructive/write-heavy state ops); they must not become queues, jobs, command histories, activity ledgers, or sync primitives.
- `docs/DESIGN.md` and `docs/ui-preview.html`: UI verification must preserve dense but legible chrome, owner-token prompt, first-use empty state, Steer, discreet `RESOFEED` surface menu, Today feed, Inspector, Source Ledger, `/doctor`, raw feedback, 44px controls, visible focus, non-layout-shifting states, and lightweight Source Ledger `[RUN INGEST]` / `[FETCH]` bracket actions.
- `docs/PRD.md`: the core loop is Inspect, Resonate, Steer; first useful session uses RSS/OPML, Today, inspect, star, optional steering, and optional lightweight Source Ledger manual ingest/fetch without accounts, folders, archive, unread mechanics, dashboards, or delivery-channel setup.
- `.agents/instructions.md`: contract work must defend the one-binary/one-SQLite/OpenRouter-runtime-secret/no-sync/no-vector/no-account boundaries.

## Playwright Launch Contract

The harness must build and launch the real single deployable. It must not use Vite preview as the system under test, a mocked API server, a sidecar worker, a queue/job process, or any additional product runtime.

### Backend Build Command

```bash
mkdir -p ./.test-artifacts/bin && go build -o ./.test-artifacts/bin/resofeed ./cmd/resofeed
```

The harness may use a different artifact directory, but the build target remains `./cmd/resofeed`.

### Real Server Launch Command

```bash
TEST_DB="$(mktemp -t resofeed-e2e-XXXXXX.sqlite3)"
RESOFEED_OWNER_TOKEN="rfeed_e2e_owner_token_00000000000000000000000000000000"
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  RESOFEED_E2E=1 \
  ./.test-artifacts/bin/resofeed serve \
  --addr 127.0.0.1:0 \
  --public-url http://127.0.0.1:0 \
  --db "$TEST_DB" \
  --owner-token "$RESOFEED_OWNER_TOKEN"
```

Harness wiring may choose a concrete free port instead of `:0` if the current binary cannot report an ephemeral bound port. The required properties are:

- built binary from `cmd/resofeed`;
- isolated temporary SQLite DB fixture per worker/test run;
- deterministic owner token supplied by flag and never persisted in committed files;
- sanitized environment allow-list only, with no ambient `OPENROUTER_KEY` in CI-safe runs;
- captured server stdout/stderr for every run.

## Browser E2E Command Contract

`web/package.json` does not currently define `test:e2e`, so the locked fallback command for the harness step is:

```bash
npm --prefix web exec playwright test -- --config web/playwright.config.ts
```

Once the harness step wires `web/playwright.config.ts`, it should add/route the preferred command:

```bash
npm --prefix web run test:e2e
```

The Playwright config must be responsible for building or reusing the real binary, launching the real server, setting the base URL from the bound server, writing all artifacts under a test-artifact directory, and cleaning up the temporary SQLite DB unless preservation is explicitly requested for failed-run evidence.

## Deterministic CI-Safe Matrix

These cases must run without live LLM credentials and must explicitly clear `OPENROUTER_KEY` from the child process environment.

1. **Real server/UI boot**: static UI loads from the Go binary; `/api/*` is unauthorized before token entry; no mocked API server.
2. **First-use owner token**: prompt appears before API calls, token input receives initial focus, invalid token shows `err: owner token rejected`, accepted token stores `resofeed.ownerToken`, and focus moves to Steer or first feed item.
3. **First-use empty state**: no sources renders the specified lines (`Paste RSS URL in Steer or import OPML.`, `Inspect opens the item.`, `Star preserves durable value.`, `Steer is optional correction.`) inside the normal shell.
4. **Surface menu/navigation**: the `RESOFEED` menu is visible after token acceptance, opens through real pointer and keyboard input, exposes `TODAY` and `SOURCE LEDGER`, and activates the correct surface without leaving the wrong panel active.
5. **Source/feed operations**: paste RSS URL via Steer or import OPML fixture, verify flat Source Ledger rows, deletion confirmation/error states, OPML folder flattening evidence, no folders/tags/settings affordances.
6. **Source Ledger manual controls**: verify Source Ledger exposes lightweight `[RUN INGEST]` and per-source `[FETCH]` bracket actions; pending states render `[INGESTING...]` / `[FETCHING...]`; success updates `last_ingest` / `last_fetch`; source-level errors and conflicts render terse raw `err:`/conflict feedback; row/header geometry and 44px hit targets remain stable.
7. **Source Ledger anti-dashboard boundary**: verify manual controls do not create or expose job queues, retry dashboards, command histories, activity ledgers, sync/merge controls, portable manual-ingest receipts, source hierarchy, folders, tags, pause/resume toggles, or a second source URL paste field.
8. **Today/feed**: `GET /api/feed/today` backs the Today surface, covers loading, empty, populated, grouped, partial, summary-unavailable, selected, hover, focus, and keyboard-open Inspector states.
9. **Inspect/retrieve/search**: opening an item retrieves detail, marks human Inspect through the real API when required, displays provenance/original link/extracted or excerpt text, and lexical search covers query/source/date/resonated filters plus strict query validation errors.
10. **LLM failure/mock boundary**: CI-safe tests simulate missing/invalid OpenRouter startup/runtime paths deterministically by absence or invalid value only, asserting startup skip/failure or fallback taxonomy without committed secrets or network LLM calls.
11. **API/MCP parity probes**: authenticated HTTP and MCP probes compare equivalent product operations for Today/list candidates, search, read item, inspect, resonate, steer, report delivery, auth failure, idempotency, and strict schema validation.
12. **Visual/UX invariants**: screenshots verify dense archival layout, muted palette, rare accent star, visible focus, no decorative gradients/mascots/skeletons, responsive desktop split vs mobile Inspector route, no clipping/overflow with long RSS strings, and no layout shift on hover/focus/selected/loading/error states.

## Live OpenRouter Smoke Boundary

Live LLM checks are opt-in only and must be separated from deterministic CI-safe cases by a Playwright project, grep, or tag such as `@llm-live` / `@live-openrouter`.

Locked live command:

```bash
OPENROUTER_KEY="$OPENROUTER_KEY" npm --prefix web run test:e2e -- --grep @llm-live
```

Live smoke requirements:

- read `OPENROUTER_KEY` from the OS environment or runtime-local `.env` only;
- never commit `.env`, raw keys, captured request headers containing keys, or key-derived values;
- skip with a deterministic message when `OPENROUTER_KEY` is absent;
- fail before binding or assert the documented startup error when `OPENROUTER_KEY` is empty/whitespace/invalid;
- record only redacted evidence such as `OPENROUTER_KEY=<redacted>; source=os_env` or `source=.env`;
- exercise the smallest live path necessary to prove OpenRouter JSON-in/JSON-out utility wiring and `/doctor` redaction.

## Required Evidence Artifacts

Every comprehensive E2E run must emit or retain:

- Playwright HTML report and machine-readable JSON/JUnit result;
- trace archive for failed tests and contract-critical happy paths;
- screenshots for first-use prompt, accepted shell, Source Ledger, Inspector, search, responsive desktop/mobile, and visual invariant cases;
- video for failed tests and interaction-heavy flows where applicable;
- server stdout and stderr with owner token and `OPENROUTER_KEY` redacted;
- exact SQLite DB fixture path and preservation/cleanup status;
- sanitized environment note listing allowed variables and explicitly stating whether `OPENROUTER_KEY` was absent, redacted from OS env, or redacted from `.env`;
- launched binary path, build command, launch command with token/secret redactions, base URL, worker id, and timestamps;
- browser console and network summaries with authorization headers and secrets redacted.

## Forbidden Scope Guard

The harness contract must not introduce or rely on:

- product behavior not already specified by architecture/design/PRD;
- accounts, OAuth, profiles, registration, or multi-user concepts;
- sync/merge/conflict-resolution coordinators or portable activity ledgers;
- sidecar workers, queue/job systems, extra admin processes, mocked product runtimes, or persisted manual-ingest jobs;
- manual-ingest retry dashboards, command histories, activity feeds, or portable manual-ingest receipts;
- vector DBs, embeddings, RAG answer surfaces, or semantic search;
- folders, tags, unread counts, archive flows, settings sliders, dashboards, decorative gradients, mascots, skeleton loaders, or friendly SaaS copy.
