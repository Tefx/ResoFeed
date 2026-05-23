# Post-Plan User Story Conformance Runtime User-Flow Walkthrough

## Machine-Readable Closure Fields

```yaml
verdict: PASS
blockers: []
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
artifact: docs/audits/post-plan-user-story-conformance-runtime-user-flow-walkthrough.md
runtime_artifacts_root: artifacts/post-plan-user-story-conformance-runtime/
surface_class: web
launch_command: >-
  env -u OPENROUTER_KEY ./bin/resofeed serve --addr 127.0.0.1:18083
  --public-url http://127.0.0.1:18083
  --db artifacts/post-plan-user-story-conformance-runtime/runtime.sqlite3
  --owner-token rfeed_runtime_walkthrough_owner_token_0123456789
  --first-fetch-limit 20
url: http://127.0.0.1:18083/
deviation_ledger:
  - id: ENV-OPENROUTER-UNAVAILABLE
    class: test_environment_limitation
    severity: non_blocking
    evidence: artifacts/post-plan-user-story-conformance-runtime/server.log; artifacts/post-plan-user-story-conformance-runtime/12-doctor-from-steer.text.txt
    note: OPENROUTER_KEY was intentionally absent/redacted; model-backed summaries/model list and successful re-ingest completion were not proven.
  - id: FIXTURE-CORPUS-NOT-CONTROLLED
    class: proof_gap
    severity: non_blocking
    evidence: live HN RSS feed in artifacts/post-plan-user-story-conformance-runtime/api-feed-after-ingest.json
    note: Live public RSS proved liveness, but did not provide deterministic duplicate/story grouping, multi-source coverage, old-resonated-vs-fresh ranking, or contradictory/partial extraction fixtures.
```

## refs Read Confirmation

- `docs/PRD.md` — Read. Key runtime obligations: first session must let a user add/import sources, see Today, inspect an item, resonate with an item, and understand Steer is optional (`§2.4`, lines 67-78); source addition is via Steer and Source Ledger is flat with manual ingest/fetch controls (`§7.2`, lines 264-277); `/doctor` must expose raw health output (`AC-17`, lines 585-587); manual fetch controls must be immediate and non-queued (`AC-18`, lines 589-601).
- `docs/DESIGN.md` — Read. Key runtime obligations: primary surfaces include owner-token prompt, first-use empty state, feed, Inspector, re-ingest, Steer, Source Ledger, utility menu, search, and agent receipts (lines 343-358); owner-token prompt uses terse local-token copy only (lines 546-555); first-use empty state exact explanatory lines (lines 556-565); Source Ledger and state portability controls are bracket actions with no jobs/dashboards (lines 687-767); `/doctor` is raw monospace diagnostics (lines 768-775); Search preserves list plus Inspector on desktop (lines 776-792).
- `docs/ui-preview.html` — Read. It is a static contract preview only, not runtime proof; it previews RESOFEED menu, Search/Inspector/re-ingest, Source Ledger controls, `/doctor`, and zh/mobile chrome (notably lines 810-1075), which informed the runtime surfaces to capture.
- `docs/ARCHITECTURE.md` — Read. Key launch/runtime contract: one Go binary started with `resofeed serve`, static UI plus JSON HTTP plus MCP in one process (lines 13, 53-76); static assets public but every `/api/*` requires owner token (lines 1107-1112); runtime language/reprocess and item re-ingest are single-process guarded operations with no durable jobs/queues (lines 950-1102); HTTP feed/search/source/doctor endpoints are authoritative runtime probes (from §6).
- `docs/audits/post-plan-user-story-conformance-matrix.md` — Read. Scope rows are those with `proof_class_required=runtime_browser` or `black_box_user_flow`; matrix row IDs and proof obligations are mapped below.

## Commands / Tools Run

| step | command/tool | exit | evidence |
| --- | --- | ---: | --- |
| build deps | `npm --prefix web install` | 0 | `artifacts/post-plan-user-story-conformance-runtime/npm-install.log` |
| build frontend | `npm --prefix web run build` | 0 | `artifacts/post-plan-user-story-conformance-runtime/web-build.log` |
| build binary | `go build -o ./bin/resofeed ./cmd/resofeed` | 0 | `artifacts/post-plan-user-story-conformance-runtime/go-build.log` |
| launch populated runtime | `env -u OPENROUTER_KEY ./bin/resofeed serve --addr 127.0.0.1:18083 ...` | running, then stopped | `artifacts/post-plan-user-story-conformance-runtime/server.log` |
| add source | `POST /api/steer` with `https://hnrss.org/frontpage` | 0 / HTTP 200 | `api-steer-add-source.json` |
| ingest source | `POST /api/ingest {}` | 0 / HTTP 200 | `api-run-ingest.json` |
| browser walkthrough | `node artifacts/.../runtime-walkthrough.mjs` | 0 | screenshots/DOM/accessibility files `01-*` through `14-*`; event log `runtime-walkthrough-events.json` |
| launch empty runtime | `env -u OPENROUTER_KEY ./bin/resofeed serve --addr 127.0.0.1:18084 ...` | running, then stopped | `empty-server.log` |
| empty first-use walkthrough | inline Playwright script | 0 | `empty-01-*`, `empty-02-*`, `empty-03-*` |

## Runtime Evidence Table

| surface / flow | proof artifacts | observed runtime content / interaction |
| --- | --- | --- |
| Owner-token prompt | `01-owner-token-prompt.*`, `empty-01-owner-token-prompt.*` | Real server rendered `RESOFEED`, `Enter owner token`, token field, `[SUBMIT]` before authorized API access. |
| Invalid-token rejection | `02-owner-token-rejected.*`, `runtime-api-responses.json` | Submitting wrong token produced `err: owner token rejected`; API responses included expected 401s. |
| First-use empty state | `empty-02-first-use-empty-state.*` | Empty fresh runtime showed `Paste RSS URL in Steer or import OPML.`, `Inspect opens the item.`, `Star preserves durable value.`, `Steer is optional correction.` |
| Steer source addition | `empty-03-steer-url-add-source-receipt.*`, `api-steer-add-source.json` | Pasting RSS URL in Steer produced source-added receipt; populated runtime source add returned `source added: hnrss.org; visible in SOURCE LEDGER`. |
| Source ingest | `api-run-ingest.json`, `api-sources-after-ingest.json`, `03-authenticated-today-feed.*` | Manual ingest fetched 1 source successfully, upserted 20 items, and feed rendered `Hacker News: Front Page` rows. |
| Today feed / time grouping | `03-authenticated-today-feed.png`, `.dom.html`, `.text.txt` | Populated feed showed source metadata, `TODAY`/`YESTERDAY`, titles, fallback excerpts, star controls, and agent steering receipt. |
| Inspect | `04-inspector-after-feed-click.*`, `runtime-api-responses.json` | Clicking feed row called `POST /api/items/{id}/inspect` 200 and opened Inspector with provenance/original link/source evidence. |
| Resonate | `05-resonate-toggle.*`, `runtime-api-responses.json` | Clicking star called `POST /api/items/{id}/resonance` 200 and changed star glyph/state. |
| Inspector re-ingest / one-time prompt | `06-inspector-reingest-prompt-configured.*` | `[RE-INGEST ITEM]` expanded only in Inspector; one-time prompt textarea accepted input; model diagnostic showed `err: models unavailable` due absent OpenRouter key. |
| RESOFEED menu | `07-resofeed-menu-open.*` | Menu exposed `NAV`, `TODAY`, `SOURCE LEDGER`, `OPERATIONS`, `LANG: EN`, and `[REPROCESS LIBRARY]` without persistent settings dashboard. |
| Processing language / zh chrome | `08-language-zh-chrome.*` | `PUT /api/runtime/language` 200; `<html lang>` changed to `zh-CN`; UI chrome localized while source identifiers such as `Hacker News: Front Page` and URLs remained literal. |
| Source Ledger | `09-source-ledger-zh.*` | Flat `SOURCE LEDGER` showed source row, URL, last fetch, `[运行抓取]`, `[导入 OPML]`, `[导出状态]`, `[导入状态]`, `[抓取]`, `[删除]`, `[详情]`. |
| Per-source fetch | `10-source-ledger-after-fetch.*`, `runtime-api-responses.json` | `[抓取]` invoked `POST /api/sources/{id}/fetch` 200 and updated last-fetch time inline; no queue/job dashboard observed. |
| State export | `11-state-export-interaction.*`, `state-export-from-ui.json` | `[导出状态]` downloaded `state.json`; UI reported `已导出 state.json`. |
| `/doctor` via Steer | `12-doctor-from-steer.*`, `api-doctor-final.txt` | Steer `/doctor` navigated to `/doctor` and rendered raw lines including `rss: ok`, `openrouter: ...`, item transform failures. |
| Search via Steer | `13-search-from-steer.*`, `api-search-markdown-final.json` | Steer `search Markdown` opened `/?search=Markdown`, showed lexical results, result count, provenance/quality lines. |
| Search result selection | `14-search-result-inspector.*` | Clicking a search result kept search list visible on desktop and updated Inspector detail for the selected result. |

## Console / Network / Log Anomalies

- Expected auth-boundary console errors: `runtime-console-messages.json` records four 401 resource errors from submitting a wrong owner token before successful auth. These are expected for the invalid-token test and are non-blocking.
- Failed browser requests: `runtime-failed-requests.json` is empty.
- Runtime environment limitation: `server.log`, `empty-server.log`, and `/doctor` show `openrouter-key: unavailable` / OpenRouter failures. This blocks proving model-backed summaries, live model listing, and successful re-ingest completion, but does not block web runtime liveness.

## Runtime Flow Matrix

### Matrix rows with `proof_class_required=runtime_browser`

- PRD-DAILY-04: PROVEN — feed remained useful and time-grouped with no unread/queue clearing in `03-authenticated-today-feed.*`.
- PRD-AC-11: PROVEN — agent-created steering rule rendered inline (`agent:delivery-bot steering active...`) in `03-*` through `14-*`; created via `api-steer-agent-no-key.json`.
- PRD-AC-17: PROVEN — `/doctor` via Steer rendered raw health output in `12-doctor-from-steer.*`.
- DESIGN-LAYOUT-01: PROVEN — desktop feed + Inspector/search split was observable in `03-*`, `04-*`, `13-*`, `14-*`; mobile-specific route not rerun in this step.
- DESIGN-MENU-01: PROVEN — menu interaction in `07-resofeed-menu-open.*`.
- DESIGN-OP-01 / CO-LOCK-01 / CO-LOCK-03: PROVEN_WITH_LIMITATION — Source Ledger fetch/status and current-operation polling endpoints returned 200; no overlapping long-running operation was available to force a visible conflict. Evidence: `09-*`, `10-*`, `runtime-api-responses.json`.
- DESIGN-LANG-01: PROVEN — language switch and low-chrome reprocess action captured in `08-language-zh-chrome.*`.
- DESIGN-AUTH-01: PROVEN — owner token prompt/rejection/acceptance captured in `01-*`, `02-*`, `03-*`.
- DESIGN-FIRST-01: PROVEN — fresh empty runtime captured exact first-use lines in `empty-02-first-use-empty-state.*`.
- DESIGN-STEER-01: PROVEN — source URL, `/doctor`, and `search Markdown` Steer interactions captured in `empty-03-*`, `12-*`, `13-*`.
- DESIGN-STAR-01: PROVEN — star toggle captured in `05-resonate-toggle.*`.
- DESIGN-INSPECTOR-01: PROVEN_WITH_ENV_LIMITATION — Inspector, source evidence, and re-ingest prompt UI captured in `04-*` and `06-*`; successful model-backed re-ingest blocked by absent OpenRouter key.
- DESIGN-PORT-01: PROVEN — state export from Source Ledger captured in `11-*` and `state-export-from-ui.json`.
- DESIGN-DOC-01: PROVEN — raw doctor output captured in `12-*`.
- DESIGN-SEARCH-01: PROVEN — search form/result selection/Inspector captured in `13-*`, `14-*`.
- UIREG-01: PROVEN_PARTIAL — pointer activation exercised on owner prompt, feed row, star, menu, language, source fetch, state export, doctor, search; no exhaustive hit-target measurement in this liveness pass.
- UIREG-04: PROVEN_PARTIAL — fallback/source evidence stayed in Inspector disclosure/status path in `04-*`, `13-*`; dirty corpus not run here.
- UIREG-05 / E2E-02 / E2E-03: BLOCKED_NON_BLOCKING — dedicated dirty corpus and full E2E harness matrix are owned by e2e-harness review; this pass produced independent runtime artifacts, not full Playwright suite artifacts.
- REPAIR-R1: BLOCKED_NON_BLOCKING — re-ingest configuration opened and prompt accepted, but successful completion/collapse requires OpenRouter-backed processing.

### Matrix rows with `proof_class_required=black_box_user_flow`

- PRD-US-01: PROVEN — Today/Resonate/Steer loop observed across `03-*`, `05-*`, `12-*`, `13-*`.
- PRD-US-03: PROVEN_PARTIAL — desk review, retrieval/search, and policy correction were exercised; external commute digest was not a web UI surface in this step.
- PRD-US-04 / PRD-AC-15: PROVEN — first-use prompt/empty state, URL source addition through Steer, ingest, feed, inspect, and resonate were exercised (`empty-*`, `03-*` to `05-*`). OPML import UI was visible but file import was not executed.
- PRD-AI-01 / PRD-EXTRACT-01 / ARCH-INGEST-01: PROVEN_WITH_ENV_LIMITATION — fallback/source evidence and extraction/model distinction observed, but model-backed trustworthy summaries were blocked by absent OpenRouter key.
- PRD-RESONATE-01: PROVEN_PARTIAL — reversible star toggle and API success proven; long-term ranking/non-pin behavior requires controlled older corpus.
- PRD-STEER-01 / PRD-AC-08: PROVEN — URL add, `/doctor`, search, human/agent policy receipts exercised.
- PRD-DUP-01 / PRD-AC-13: BLOCKED_NON_BLOCKING — live HN feed did not provide authoritative grouped duplicate/story fixture; grouping UI not proven.
- PRD-DAILY-01 / PRD-AC-01: PROVEN_PARTIAL — fresh feed path proven; quota/old-resonated domination requires deterministic corpus.
- PRD-DAILY-02 / PRD-AC-02: PROVEN_PARTIAL — star/search presence proven; old-star-not-pin ranking requires deterministic older corpus.
- PRD-DAILY-03 / PRD-AC-03: PROVEN_PARTIAL — configured-source news feed coverage proven from HN source; no multi-source coverage corpus.
- PRD-POLICY-01 / PRD-AC-04 / PRD-AC-05: PROVEN_PARTIAL — steering receipts and Inspect-vs-Resonate UI semantics observed; ranking conflict/interest-not-agreement requires controlled ranked corpus.
- PRD-AC-14: PROVEN_PARTIAL — fallback summary transparency observed through source excerpt/model unavailable states; contradictory/low-confidence model cases require fixtures/OpenRouter.
- ARCH-RANK-01: PROVEN_PARTIAL — feed endpoint and search/ranking surface live; guardrail quotas require controlled corpus.
- LANG-LOCK-03: PROVEN_PARTIAL — zh UI/source identifier preservation and state export were observed; library reprocess/FTS stale recovery not executed.
- PROMPT-04: PROVEN_PARTIAL — one-time prompt UI accepted request-scoped prompt; prompt fixture/receipt redaction completion blocked by missing OpenRouter key and owned by prompting-runtime review.
- BLIND-SETUP-01: NOT_APPLICABLE_TO_THIS_BROWSER_PASS — no blind re-ingest setup was required because this was direct browser/runtime verification.

## Unobserved States / Exact Blockers

- Successful model-backed summary generation and successful item re-ingest completion: environment limitation, no `OPENROUTER_KEY` configured. Required condition: provide safe live OpenRouter key via OS env or local uncommitted `.env`.
- Deterministic duplicate/story grouping, old-resonated freshness ranking, multi-source coverage quotas, controversial inspect-not-agreement ranking: proof-fixture limitation. Required condition: controlled black-box corpus with known timestamps, resonance state, grouping fields, and multiple sources.
- OPML file import: UI action visible but upload not executed in this pass. Required condition: safe OPML fixture file and approval to replace/add source state.
- Manual current-operation conflict while operation is running: not forced because public feed fetch completed quickly. Required condition: slow fixture/source or controlled concurrent trigger.

## checklist_receipt

- Actual runtime launch command/target/URL is recorded.: PROVEN — see Machine-Readable Closure Fields and `server.log` / `empty-server.log`.
- Each runnable PRD user story in the matrix is walked or explicitly blocked with reason and severity.: PROVEN — see Runtime Flow Matrix and Unobserved States.
- Screenshots/DOM/accessibility artifacts show meaningful non-blank content for every material surface.: PROVEN — `01-*` through `14-*` plus `empty-*` include screenshots, DOM, text, and accessibility/ARIA snapshots.
- At least one safe documented interaction is performed for each applicable flow.: PROVEN — owner token submit/reject/accept, Steer URL, ingest, feed inspect, star toggle, re-ingest prompt entry, menu, language switch, source fetch, state export, `/doctor`, search, and search-result selection.
- Closure fields are present: verdict, blockers, gate_open_allowed, orchestrator_action_hint, deviation_ledger.: PROVEN — present in Machine-Readable Closure Fields.
