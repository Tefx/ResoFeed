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
mkdir -p ./.test-artifacts/bin && go build -tags resofeed_e2e -o ./.test-artifacts/bin/resofeed ./cmd/resofeed
```

The harness may use a different artifact directory, but the build target remains `./cmd/resofeed`. The `resofeed_e2e` build tag and exact runtime value `RESOFEED_E2E=1` form a two-key boundary for loopback RSS fixtures. Either key alone leaves loopback blocked. The allowance covers loopback hosts only; private, link-local, multicast, and unspecified destinations remain blocked, as do loopback destinations under strict validation. `scripts/build-resofeed.sh` remains the untagged production build path and ignores `RESOFEED_E2E` for outbound policy.

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

- built binary from `cmd/resofeed` with the `resofeed_e2e` tag;
- exact `RESOFEED_E2E=1` runtime opt-in paired with that tagged binary;
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

The project-native `scripts/vectl-check.mjs` adapter emits `vectl.check.selection.v1` and `vectl.check.evidence.v1` envelopes. Every evidence artifact uses the central Gate's exact object shape, `{"path":"<repository-relative-file>","sha256":"sha256:<digest>"}`. The foundation evidence return retains the literal compatibility field `artifacts: artifactRows`; `artifactRows` contains only those relative-path/SHA-256 objects. The adapter recursively enumerates retained ordinary Playwright and lane-discovery files instead of submitting directory or string-path artifacts, and hashes the already-redacted files in repository state. It wraps native Go, Vitest, and Playwright commands while leaving tool-specific interpretation inside the repository.

### Preliminary Collection Config Aliases
`web/playwright.browser-contract.config.ts` remains a compatibility alias for the established comprehensive collection. `web/playwright.runtime.config.ts` selects only the case-local `runtime.spec.ts` fixture lane. Both preserve the project-native Chromium identity, zero-retry policy, standard artifact policy, and real `cmd/resofeed` launch boundary.

The foundation does not add a product reset API, route interception, registry, queue, or second runtime. Case-local fixtures own the SQLite database, loopback port, real process, clean Playwright context, redacted runtime/browser diagnostics, and cleanup record.
### Foundation Evidence Boundary

The project-native foundation check is:

```bash
node scripts/vectl-check.mjs run rf-bug-v2-harness-foundation rf_bug_v2_harness_foundation_green
```

It emits the generic `vectl.check.selection.v1` / `vectl.check.evidence.v1` contract and proves four identities: adapter envelope, intentional-failure artifact retention, case-local lifecycle isolation, and native lane discovery. Lane discovery uses Playwright `--list` only for the legacy three-file set and replacement five-file set. The foundation check does not execute either product-semantic lane and does not claim Search, Source Ledger, State, route, or responsive behavior. Downstream implementation and independent runtime-verification phases own those semantic executions and the final list/run identity comparison.
### Generic Adapter Profile Contract

`scripts/vectl-check.mjs` dispatches by the exact `(suite, check_id)` pair. `select` emits one `vectl.check.selection.v1` envelope with the contract identities and digest. `run` invokes only that profile's native Go, Vitest, or Playwright checks and emits one `vectl.check.evidence.v1` envelope with identical `selected_ids` and `executed_ids`. Unknown suites, unknown checks, and cross-paired suite/check values exit non-zero before any native command starts. The expected-red item contract remains red with exit code 1; green profiles require exit code 0. Runtime-only provider secrets remain absent from child environments and evidence.

The pending profile matrix is:

| Suite | Check ID | Cardinality | Expected outcome |
|---|---|---:|---|
| `rf-bug-v2-frontend-runtime` | `rf_bug_v2_frontend_runtime_green` | 4 | green |
| `rf-bug-v2-go-token-parity` | `rf_bug_v2_go_token_parity_green` | 2 | green |
| `rf-bug-v2-embed-ui` | `rf_bug_v2_embed_ui_green` | 3 | green |
| `rf-bug-v2-opml` | `rf_bug_v2_opml_import_only_green` | 2 | green |
| `rf-bug-v2-http-security` | `rf_bug_v2_http_security_green` | 3 | green |
| `rf-bug-v2-source-ledger` | `rf_bug_v2_source_ledger_green` | 5 | green |
| `rf-bug-v2-prompting` | `rf_bug_v2_prompting_green` | 4 | green |
| `rf-bug-v2-closure-report` | `rf_bug_v2_defect_report_closure_green` | 2 | green |
| `item-deep-links-contract` | `item_deep_links_expected_red` | 3 | red |
| `item-deep-links-backend` | `item_deep_links_backend_green` | 1 | green |
| `item-deep-links-frontend` | `item_deep_links_frontend_green` | 2 | green |

`node scripts/vectl-check.mjs run rf-bug-v2-generic-adapter rf_bug_v2_generic_adapter_green` runs the focused Node regression and immutable `TestPlaywrightFixtureContract`. The regression validates all eleven selection envelopes against their fixed identities/cardinalities, parses green and red evidence fixtures, verifies identity parity, accepts only relative-path/SHA-256 artifact objects, preserves the completed foundation profile and literal `artifacts: artifactRows` contract, rejects mismatched pairs and malformed artifacts, and confirms that changes remain limited to the adapter, its developer test, and this contract. The profile emits `VECTL_ADAPTER_COMPLETED_HARNESS=preserved` and `VECTL_ADAPTER_ARTIFACT_OBJECT_COMPATIBILITY=valid` only after both developer checks pass. It does not execute unfinished consumer product semantics.

The `rf-bug-v2-source-ledger` profile binds the required `Source Ledger groups and controls render` output marker to its Vitest `test:render` command. That command includes exactly one `--reporter=verbose` argument so Vitest emits the full test title for deterministic marker validation. Neither Source Ledger Playwright command carries the verbose Vitest reporter argument; their existing `--reporter=line` contracts remain unchanged.
### RF-BUG-010 Replacement Runtime Isolation Remediation

The bounded project-native remediation profile is:

```bash
node scripts/vectl-check.mjs run rf-bug-v2-adapter-runtime-isolation-remediation rf_bug_v2_adapter_runtime_isolation_green
```

Its `vectl.check.selection.v1` envelope contains exactly `RF-BUG-010 foundation smoke isolation` and `RF-BUG-010 replacement runtime isolation`. The run preserves the intentional foundation artifact-proof failure and its HTML, JSON, trace, screenshot, video, redacted server/browser logs, and clean teardown record. It then removes only the smoke/runtime scratch roots before launching the ordinary smoke and runtime processes, preventing the intentional-failure output or generated runtime state from contaminating a later invocation.

The profile discovers the immutable replacement-five inventory with Playwright `--list`, then starts one Playwright process per file. Each process receives a freshly built real `cmd/resofeed` binary containing the current web build, a fresh SQLite database, browser context, owned loopback ports/processes, sanitized environment, and post-run cleanup boundary. The adapter aggregates the five native JSON reports and requires exactly 29 unique selected identities, the same 29 executed once, all passing on attempt zero, with no skip, retry, duplicate, or missing identity. A shared aggregate replacement process is rejected because runtime processing-language and State mutations could leak across `initial-route`/`routes`, responsive, and delete cases.

After replacement passes, the adapter discovers and executes the legacy three-file inventory with the same native selected/executed identity parity check. Every invocation retains its JSON/HTML report, redacted server and stub logs, sanitized environment note, and `runtime-cleanup.txt`; process, port, or SQLite/WAL/SHM residue fails the profile. The replacement-five and old-three acceptance sources must remain byte-identical to `HEAD`. Adapter and fixture cleanup runs on both success and failure, and the temporary embedded-web build is restored before evidence is emitted.
### Prompting v2.2 Loopback Harness Remediation

The dedicated pair `rf-bug-v2-prompting-harness` / `rf_bug_v2_prompting_harness_remediation_green` owns the Prompting loopback extraction boundary. It selects and executes exactly these four identities, in order: `RF-BUG-009 harness exact 16 subtests`, `RF-BUG-009 harness exact argv and environment`, `RF-BUG-009 harness exact four identities`, and `RF-BUG-009 harness production strict`.

The protected `TestRFBUG009PromptingV22Contract` command alone receives both opt-in keys: Go build tag `resofeed_e2e` and runtime `RESOFEED_E2E=1`. The second Prompting regression command remains untagged with `RESOFEED_E2E` absent. The general adapter child environment does not supply `RESOFEED_E2E`, so no profile gains a loopback bypass by inheritance.

The dedicated runner captures every child stdout/stderr stream while it runs the focused Node adapter contract, the existing Prompting profile, an untagged production build with runtime `RESOFEED_E2E=1`, untagged outbound fixture-boundary tests with `RESOFEED_E2E` absent, and the same outbound fixture-boundary tests with both exact opt-ins. It parses the nested Prompting `vectl.check.evidence.v1` envelope, validates the sixteen-subtest, active-version, outbound-policy, fixture, production-strictness, and `PASS` markers, then emits exactly one newline-terminated remediation evidence envelope. Child logs, build output, Go output, and the nested envelope remain captured. Any missing marker, malformed nested envelope, unexpected process outcome, or identity mismatch produces one red envelope and a nonzero exit.

Production SSRF policy remains strict: the build tag alone and runtime key alone cannot permit loopback, and the fixture allowance remains limited to loopback addresses. Rollback reverts `scripts/vectl-check.mjs`, `scripts/vectl-check.test.mjs`, and this section together.
### RF-BUG-002 Token-Parity Loopback Harness Remediation

The dedicated pair `rf-bug-v2-go-token-parity` / `rf_bug_v2_go_token_parity_green` selects and executes exactly two identities, in order: `RF-BUG-002 canonical HTTP MCP parity` and `RF-BUG-002 opaque item ID API paths 30`. Its protected Go fixture command is exactly `go test -tags resofeed_e2e -v ./internal/resofeed -run '^(TestRFBUG002OpaqueItemIDAPIPaths|TestRFBUG002CanonicalHTTPMCPParity)$' -count=1`, and that child alone receives `RESOFEED_E2E=1`. The general child environment omits `RESOFEED_E2E`.

The dedicated runner captures the focused Node adapter regression, nests the existing `rf-bug-v2-prompting-harness` / `rf_bug_v2_prompting_harness_remediation_green` strict-harness evidence, and then executes both protected RF-BUG-002 tests together. The nested envelope must retain the untagged production-build, tag-only, environment-only, two-key loopback, outbound rejection, fetch-path rejection, Playwright fixture, and `PASS` proof. The parity child must retain all 30 API subtests, canonical `~` plus unpadded UTF-8 base64url acceptance, raw and noncanonical HTTP rejection, direct raw MCP IDs, and HTTP/MCP/FTS parity.

Only the final token-parity `vectl.check.evidence.v1` envelope reaches stdout. It contains the same two selected and executed identities and the required token, subtest-count, strict-harness, test-name, and `PASS` observations. Focused regression coverage rejects malformed or incomplete nested evidence, duplicate envelopes, missing markers, `no tests to run`, skips, retries, and known parity-failure markers. Child logs, Go output, and the nested strict-harness envelope remain captured. Rollback reverts `scripts/vectl-check.mjs`, `scripts/vectl-check.test.mjs`, and this section together.
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
