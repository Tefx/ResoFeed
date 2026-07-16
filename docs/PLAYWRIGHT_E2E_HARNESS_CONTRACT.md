# Playwright Comprehensive E2E Harness Contract

Status: implemented harness contract. The harness verifies the real `cmd/resofeed` deployable and preserves the product, storage, authentication, and runtime-secret boundaries below. It does not implement product behavior, fake comprehensive-browser states, sidecar product processes, queues, sync, accounts, vector search, or new UI concepts.

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
`web/package.json` exposes explicit lanes:

```bash
npm --prefix web run test:e2e
npm --prefix web run test:e2e:ci-safe
npm --prefix web run test:e2e:smoke
npm --prefix web run test:e2e:runtime
```

`test:e2e:smoke` and `test:e2e:runtime` launch the real binary with test-case-local SQLite, browser state, loopback port, process, logs, and cleanup evidence. `test:e2e:ci-safe` preserves the established browser-contract collection while excluding live OpenRouter cases. All deterministic lanes run with one worker and zero retries. Reports and runtime evidence stay under `.test-artifacts/playwright/`, which is runtime output rather than portable product state.

Live OpenRouter remains opt-in through `npm --prefix web run test:e2e:live` with `OPENROUTER_KEY` supplied only by the runtime environment.

### Config Boundaries

- `playwright.base.config.ts` defines zero-retry Chromium defaults and ordinary Playwright artifacts.
- `playwright.config.ts` preserves the established comprehensive collection and real-binary global setup.
- `playwright.smoke.config.ts` and `playwright.runtime.config.ts` select the case-local fixture lanes.
- `playwright.ci-safe.config.ts` selects deterministic Chromium only.
- `playwright.live.config.ts` selects the explicit live project only.
- `playwright.browser-contract.config.ts` remains the browser-contract alias.

The project-native `scripts/vectl-check.mjs` adapter emits `vectl.check.selection.v1` and `vectl.check.evidence.v1` envelopes. Every evidence artifact uses the central Gate's exact object shape, `{"path":"<repository-relative-file>","sha256":"sha256:<digest>"}`. The adapter recursively enumerates retained ordinary Playwright and lane-discovery files instead of submitting directory or string-path artifacts, and hashes the already-redacted files in repository state. It wraps native Go, Vitest, and Playwright commands while leaving tool-specific interpretation inside the repository.

### Preliminary Collection Config Aliases
`web/playwright.browser-contract.config.ts` remains a compatibility alias for the established comprehensive collection. `web/playwright.runtime.config.ts` selects only the case-local `runtime.spec.ts` fixture lane. Both preserve the project-native Chromium identity, zero-retry policy, standard artifact policy, and real `cmd/resofeed` launch boundary.

The foundation does not add a product reset API, route interception, registry, queue, or second runtime. Case-local fixtures own the SQLite database, loopback port, real process, clean Playwright context, redacted runtime/browser diagnostics, and cleanup record.
### Foundation Evidence Boundary

The project-native foundation check is:

```bash
node scripts/vectl-check.mjs run rf-bug-v2-harness-foundation rf_bug_v2_harness_foundation_green
```

It emits the generic `vectl.check.selection.v1` / `vectl.check.evidence.v1` contract and proves four identities: adapter envelope, intentional-failure artifact retention, case-local lifecycle isolation, and native lane discovery. Lane discovery uses Playwright `--list` only for the legacy three-file set and replacement five-file set. The foundation check does not execute either product-semantic lane and does not claim Search, Source Ledger, State, route, or responsive behavior. Downstream implementation and independent runtime-verification phases own those semantic executions and the final list/run identity comparison.
## Deterministic CI-Safe Matrix
These cases run with zero retries and without live LLM credentials; the child environment explicitly clears `OPENROUTER_KEY`.

1. **Real server/UI boot:** build and launch the real embedded Go binary from a working directory outside the repository. Static UI and valid deep links load; `/api/*` is unauthorized before token entry; no mocked product runtime or product API interception is used.
2. **Route and title matrix:** cold load, refresh, Back, and Forward cover TODAY, SOURCE LEDGER, SEARCH, and direct Inspector routes in English and Chinese. Every readiness transition shows the route-correct surface and exact functional title without host fallback or intermediate TODAY content. Valid opaque item IDs round-trip unchanged.
3. **Inspector selection:** Feed and Search selections cover pending/success/failure, inspection-marker failure, rapid A-to-B selection with late A completion, viewport changes, direct routes, Escape, and focus return. Current item, URL, readable content, and errors agree after every transition.
4. **Steer accessibility:** empty, invalid submission, edit recovery, repeated invalid submission, locale change, stale preview, and transport failure expose one current localized announcement and never mutate on missing URL.
5. **Source Ledger:** desktop and narrow cases cover separately labelled Source List and Portable State groups, OPML import, JSON State export/import, ingest/fetch states and conflicts, delete confirm/cancel/success, source information, long content, focus, 44-by-44 CSS-pixel targets, overflow, and prohibited-control absence.
6. **CSP and headers:** Chromium boots under Go-owned security headers and completes OPML import plus JSON State export/import without CSP console violations or blocked required resources. Streaming and cancellation retain their ordinary behavior.
7. **Prompting v2.2:** real-runtime ingest/reprocess cases use deterministic provider seams only where the Go runtime already exposes them, cover valid and failure classifications, and prove malformed output cannot partially update item/FTS state.
8. **API/MCP parity:** authenticated probes compare equivalent retrieve, inspect, resonate, steer, and source/state operations, including strict validation and authorization precedence.
9. **Isolation and cleanup:** every mutating test owns case-local SQLite state, a clean browser context, an allocated port, and its launched process. Runtime reuse is limited to proven read-only cases. Teardown verifies process, port, context, logs, and temporary database cleanup; residue fails the test.
10. **Determinism:** the CI-safe smoke lane completes under two minutes; the full Chromium list and run contain the same positive title set; three clean full runs pass that same set.
11. **Intentional failure proof:** one deliberate assertion failure retains the ordinary Playwright report, trace, screenshot, video, redacted runtime/browser diagnostics, runtime identity, database location, and cleanup outcome.

## Live OpenRouter Smoke Boundary
Live LLM checks are opt-in only and separated from deterministic CI-safe cases through the `live-openrouter` project and `@llm-live` / `@live-openrouter` tags.

Locked live command:

```bash
OPENROUTER_KEY="$OPENROUTER_KEY" npm --prefix web run test:e2e:live
```

Live smoke requirements:

- read `OPENROUTER_KEY` from the OS environment or runtime-local `.env` only;
- never commit `.env`, raw keys, captured request headers containing keys, or key-derived values;
- skip with a deterministic message when `OPENROUTER_KEY` is absent;
- fail before binding or assert the documented startup error when `OPENROUTER_KEY` is empty/whitespace/invalid;
- record only redacted evidence such as `OPENROUTER_KEY=<redacted>; source=os_env` or `source=.env`;
- exercise the smallest live path necessary to prove OpenRouter JSON-in/JSON-out utility wiring and `/doctor` redaction.
## Required Evidence Artifacts
Every comprehensive E2E run emits or retains the applicable ordinary evidence:

- Playwright HTML and machine-readable result reports for the comprehensive collection;
- trace, screenshot, and video for failed tests according to the active config;
- per-case redacted server stdout/stderr, browser diagnostics, and `runtime-cleanup.txt` for isolated lanes;
- binary path, case-local SQLite path, loopback port, process outcome, and cleanup outcome;
- foundation lane-discovery JSON with exact native project/file/title identities for the old-three and replacement-five sets, without test execution;
- downstream lane-migration JSON list/run reports with identical native project/file/title identities after the product-semantic repairs are available;
- sanitized evidence with owner token, OpenRouter/Tavily keys, Authorization, Cookie, credential-bearing URL, and provider-body material removed.

Case teardown terminates the owned process, verifies the loopback port is closed, removes SQLite/WAL/SHM files, and fails when residue remains. The runtime starts from the case-local artifact directory with an allow-listed environment, so repository `.env` fallback and ambient live-provider credentials cannot enter deterministic runs. Failed assertions still run fixture teardown and retain their ordinary Playwright artifacts.
## Forbidden Scope Guard

The harness contract must not introduce or rely on:

- product behavior not already specified by architecture/design/PRD;
- accounts, OAuth, profiles, registration, or multi-user concepts;
- sync/merge/conflict-resolution coordinators or portable activity ledgers;
- sidecar workers, queue/job systems, extra admin processes, mocked product runtimes, or persisted manual-ingest jobs;
- manual-ingest retry dashboards, command histories, activity feeds, or portable manual-ingest receipts;
- vector DBs, embeddings, RAG answer surfaces, or semantic search;
- folders, tags, unread counts, archive flows, settings sliders, dashboards, decorative gradients, mascots, skeleton loaders, or friendly SaaS copy.
