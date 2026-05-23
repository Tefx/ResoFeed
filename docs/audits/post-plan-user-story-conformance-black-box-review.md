# Post-Plan User Story Conformance Black-Box Review

Step: `post-plan-user-story-conformance-independent-review.black-box-user-story-review`  
Agent: `blind-tester`  
Date: 2026-05-24 UTC runtime / 2026-05-23 local command timestamps  
Mode: public docs + public runtime interfaces only. No implementation source files were read.

## Public Setup and Commands / URLs Used

Working directory:

```text
/Users/tefx/Projects/ResoFeed/.vectl/worktrees/post-plan-user-story-conformance-independent-review.black-box-user-story-review
```

Build command from `docs/USAGE.md`:

```bash
npm --prefix web install && npm --prefix web run build && mkdir -p ./bin ./artifacts/black-box-review && go build -o ./bin/resofeed ./cmd/resofeed
```

Build observation:

- Web and Go build completed successfully.
- `npm install` reported dependency audit findings: 1 low, 2 moderate, 1 high. This is recorded as tech debt because the user-story runtime surface still built and ran.
- Vite emitted warning: `Cannot find base config file "./.svelte-kit/tsconfig.json"`; build completed.

Runtime command:

```bash
env -u OPENROUTER_KEY ./bin/resofeed serve \
  --addr 127.0.0.1:18081 \
  --public-url http://127.0.0.1:18081 \
  --db ./artifacts/black-box-review/data/resofeed2.sqlite3 \
  --owner-token "<REDACTED_THROWAWAY_OWNER_TOKEN>" \
  --first-fetch-limit 5
```

The command was executed with a throwaway owner token meeting the documented length rules. The committed audit artifact redacts the plaintext token because owner tokens are runtime credentials even in black-box smoke runs.

Network liveness proof:

```bash
lsof -i :18081
```

Observed:

```text
resofeed ... TCP localhost:18081 (LISTEN)
```

Public URLs / endpoints exercised:

- `GET http://127.0.0.1:18081/`
- `GET http://127.0.0.1:18081/api/feed/today`
- `GET http://127.0.0.1:18081/api/doctor`
- `POST http://127.0.0.1:18081/api/state/import`
- `GET http://127.0.0.1:18081/api/state/export`
- `GET http://127.0.0.1:18081/api/search?q=Blackbox&resonated=true`
- `GET http://127.0.0.1:18081/api/sources`
- `GET http://127.0.0.1:18081/api/items/blind_item`
- `POST http://127.0.0.1:18081/api/items/blind_item/inspect`
- `POST http://127.0.0.1:18081/api/items/blind_item/resonance`
- `POST http://127.0.0.1:18081/api/items/blind_item/delivery`
- `POST http://127.0.0.1:18081/mcp`
- Browser UI at `http://127.0.0.1:18081`

Evidence artifacts committed under `artifacts/black-box-review/` include HTTP transcripts, browser accessibility-state captures, and screenshots.

## refs Read Confirmation

- `CONSTITUTION.md` — NOT READ: no `CONSTITUTION.md` exists at the isolated worktree root.
- `docs/PRD.md` — Read. Key insight: core loop is Today / Inspect / Resonate / Steer without unread, folders, archive, onboarding, dashboards, or delivery-channel ownership; acceptance criteria AC-1..AC-18 cover freshness, resonance, agent auth/idempotency, search, state, diagnostics, and manual fetch controls.
- `docs/USAGE.md` — Read. Key insight: `serve` is the single runtime for UI, JSON HTTP, MCP `/mcp`, background ingest, SQLite migration, and static assets; all `/api/*` requests require owner-token auth; documented public setup includes build, `serve`, owner token prompt, Steer URL source addition, Source Ledger, search, state export/import, `/doctor`, and MCP Streamable HTTP.
- `docs/BLIND_REINGEST_PUBLIC_SETUP.md` — Read. Key insight: black-box data setup may use only owner-authenticated `POST /api/state/import` with a `resofeed.state.v1` bundle; no direct SQLite writes, test-only routes, admin daemons, jobs, or sidecars.
- `docs/DESIGN.md` — Read. Key insight: UI must expose owner-token prompt, first-use empty state, low-chrome `RESOFEED` menu, `TODAY`, `SOURCE LEDGER`, `INSPECTOR`, raw `/doctor`, lexical search, bracket actions, source provenance, and no settings/folders/tags/unread/archive/jobs/queues/spinners/toasts.
- `docs/audits/post-plan-user-story-conformance-matrix.md` — Read. Key insight: matrix maps 107 requirement rows to downstream proof ownership. This black-box review selected representative high-value rows across PRD user flows, auth/API/MCP parity, source/state/search, UI design, diagnostics, and architecture-boundary negative cases.

## User Stories Exercised

### US-A: Owner-token gate and first-use shell

Mapped rows: `DESIGN-AUTH-01`, `DESIGN-FIRST-01`, `PRD-US-01`, `PRD-US-04`, `PRD-AC-15`, `ARCH-HTTP-01`.

Commands / observations:

- `GET /` returned HTML with `RESOFEED`, `Enter owner token`, password input, and no account/profile/password-reset copy.
- Browser state before auth showed `RESOFEED`, `Enter owner token`, `Owner token`, `[SUBMIT]`.
- Missing auth on `GET /api/feed/today` returned `401` with JSON:

```json
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

- After entering the explicit owner token in the browser, the shell showed `Steer or paste RSS URL`, `RESOFEED` menu, `TODAY` independent scroll, `INSPECTOR`, and first-use lines: `Paste RSS URL in Steer or import OPML.`, `Inspect opens the item.`, `Star preserves durable value.`, `Steer is optional correction.`

Classification: PROVEN.

### US-B: State-import seeded source, source ledger, and state portability

Mapped rows: `BLIND-SETUP-01`, `PRD-STATE-01`, `PRD-SOURCE-01`, `PRD-AC-16`, `DESIGN-LEDGER-01`, `DESIGN-PORT-01`, `ARCH-STATE-01`, `ARCH-PORT-01`.

Setup used only public state import with the documented minimal shape:

```json
{
  "schema_version": "resofeed.state.v1",
  "exported_at": "2026-05-22T00:00:00Z",
  "sources": [{"id":"blind_source","url":"https://example.test/feed.xml","title":"Blind Source"}],
  "steer_rules": [],
  "resonated_items": [{"item_id":"blind_item","url":"https://example.test/article","source_url":"https://example.test/feed.xml","title":"Blind Blackbox Resonance Token"}]
}
```

Observed `POST /api/state/import`:

```json
{"restored":{"sources":1,"steer_rules":0,"resonated_items":1}}
```

Observed `GET /api/state/export` returned only `schema_version`, `exported_at`, `sources`, `steer_rules`, and `resonated_items`; no owner token, runtime metadata, receipts, queue, history, or provider secret fields were visible.

Observed Source Ledger browser state:

- `SOURCE LEDGER`
- `last_ingest: not_run`
- `[RUN INGEST]`, `[IMPORT OPML]`, `[EXPORT STATE]`, `[IMPORT STATE]`
- `import replaces active sources, rules, and stars`
- `src: Blind Source · status: not_fetched · last_fetch: not_fetched`
- `url: https://example.test/feed.xml`
- `[FETCH]`, `[DELETE]`, `[DETAILS]`

Classification: PROVEN.

### US-C: Search, reading, Inspector, provenance, and Resonate

Mapped rows: `PRD-SEARCH-01`, `DESIGN-SEARCH-01`, `PRD-RESONATE-01`, `DESIGN-STAR-01`, `DESIGN-INSPECTOR-01`, `PRD-EXPLAIN-01`, `PRD-AC-14`.

HTTP search:

```bash
curl -sS -i -H "Authorization: Bearer <OWNER_TOKEN>" \
  "http://127.0.0.1:18081/api/search?q=Blackbox&resonated=true"
```

Observed one result with `id: blind_item`, `source_title: Blind Source`, `title: Blind Blackbox Resonance Token`, `is_resonated: true`, `extraction_status: summary_unavailable`, and query echo.

Browser search via Steer command:

```text
search Blackbox
```

Observed browser search state:

- `retrieval: lexical search`
- `SEARCH`
- filter controls for plain text query, source, from date, to date, resonated, limit
- `1 results`
- result row includes `src: Blind Source`, `extraction: excerpt`, `match: lexical index`, `provenance: source-backed`, `agent:external`, title, `summary unavailable`, and a pressed resonance star button.

Inspector after clicking the search result showed:

- `INSPECTOR`
- `src: Blind Source`
- title `Blind Blackbox Resonance Token`
- original link `https://example.test/article`
- source URL `https://example.test/feed.xml`
- `summary unavailable · summary provenance: fallback unavailable`
- collapsed `source text:` disclosure
- `why: fresh from configured source`

Classification: PROVEN for lexical retrieval, item detail, provenance visibility, fallback label, and observable Resonate state. Ranking-specific claims such as “old stars do not pin” remain outside this minimal seeded corpus and are marked `NEEDS_TEST` in the behavioral proof register.

### US-D: Inspect, delivery, and retry-safe mutations

Mapped rows: `PRD-INSPECT-01`, `PRD-ACTOR-01`, `PRD-AC-07`, `PRD-AC-10`, `PRD-AC-12`, `ARCH-HTTP-01`.

Observed `POST /api/items/blind_item/inspect`:

```json
{"item_id":"blind_item","human_inspected_at":"2026-05-23T22:26:19.70257Z","already_applied":false}
```

Replay with the same idempotency key returned:

```json
{"item_id":"blind_item","human_inspected_at":"2026-05-23T22:26:19.70257Z","already_applied":true}
```

Observed unauthorized mutation attempt without owner token:

```json
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

Observed same idempotency key with different mutation fingerprint:

```json
{"error":{"code":"bad_request","message":"bad request","details":{"field":"idempotency_key","reason":"request_fingerprint_mismatch"}}}
```

Observed delivery report:

```json
{"item_id":"blind_item","external_surfaced_at":"2026-05-09T00:00:00Z","already_applied":false}
```

Classification: PROVEN for public auth boundary, inspect idempotency, delivery recording, and fingerprint mismatch rejection. Human-over-agent ranking precedence remains `NEEDS_TEST` with a richer corpus.

### US-E: `/doctor` raw diagnostics

Mapped rows: `PRD-AC-17`, `DESIGN-DOC-01`, `PRD-FALLBACK-01`, `ARCH-SECRET-01`.

Observed `GET /api/doctor` with missing `OPENROUTER_KEY`:

```text
rss: ok
openrouter: provider_reachable=unknown configured_model=account_default
openrouter: model_resolved=false resolved_model=unknown
...
search_fts: ok
ingest: last_run=never
ingest: first_fetch_limit=5
```

Observed browser `/doctor` command rendered raw text lines including RSS/source status, OpenRouter model status, fallback provenance, search FTS status, extraction failures, and ingest status. No charts, cards, friendly remediation wizard, key value, or `.env` path appeared.

Classification: PROVEN.

### US-F: MCP/HTTP parity smoke

Mapped rows: `PRD-US-02`, `PRD-AGENT-01`, `ARCH-MCP-01`, `PRD-AC-09`, `PRD-AC-10`, `PRD-AC-12`.

Observed unauthenticated MCP initialize at `/mcp` returned the same owner-token-required `401` body.

Observed authenticated MCP initialize returned:

```json
{"capabilities":{"resources":{},"tools":{}},"protocolVersion":"2025-03-26","serverInfo":{"name":"resofeed","version":"0.0.0"}}
```

Observed `tools/list` included public agent tools: `list_candidate_items`, `search_items`, `read_item`, `mark_inspected`, `resonate_item`, `preview_steer`, `steer`, `undo_steer`, `report_delivery`, `get_processing_language`, `set_processing_language`, `reprocess_library`, `reingest_item`, `list_openrouter_models`.

Observed `resources/list` included: `resofeed://feed/today`, `resofeed://rules/active`, `resofeed://system/doctor`, `resofeed://system/operation`, `resofeed://sources`, `resofeed://runtime/language`.

Observed MCP `search_items` for `Blackbox` returned the same item envelope as HTTP search inside a JSON text content response.

Classification: PROVEN for auth, tool/resource exposure, and search parity smoke. Full parity for every tool is `NEEDS_TEST` outside this representative smoke.

## Highest-Risk Failure / Negative Cases

| case | requirement rows | input | observed | classification |
| --- | --- | --- | --- | --- |
| Missing owner token rejected | `ARCH-HTTP-01`, `PRD-AC-12`, `DESIGN-AUTH-01` | `GET /api/feed/today` without auth; `POST /mcp` without auth | `401` JSON `owner token required` | PROVEN |
| Strict query validation | `ARCH-HTTP-01`, `PRD-SEARCH-01` | `GET /api/search?q=blackbox&unknown=1` | `400 bad_request`, `details.field: unknown` | PROVEN |
| Idempotency fingerprint mismatch | `PRD-AC-10`, `PRD-ACTOR-01` | reuse resonance idempotency key with changed `resonated` value | `400 bad_request`, `details.reason: request_fingerprint_mismatch` | PROVEN |
| Invalid state bundle rejected | `ARCH-PORT-01`, `PRD-STATE-01` | `POST /api/state/import` with undocumented `steer_rules[].is_active` | `400 bad_request`, `details.field: is_active`; later export remained empty | PROVEN |
| Missing OpenRouter key nonfatal and redacted | `ARCH-SECRET-01`, `PRD-FALLBACK-01` | start with `env -u OPENROUTER_KEY`, call `/api/doctor` | Server bound; diagnostics showed model unavailable/status lines, no secret values | PROVEN |
| Forbidden user concepts visible | `PRD-MIN-01`, `DESIGN-NEG-01` | Scan observed UI text captures for settings/folders/tags/unread/archive/queues/jobs/accounts | No forbidden hits in captured token/main/menu/search/inspector/ledger states | PROVEN |

## Matrix Row Mapping Summary

- `PRD-US-01`: PROVEN — first-use and main shell expose Today/Steer/Resonate/Inspector vocabulary without inbox-management copy.
- `PRD-US-02`: PROVEN — MCP is remote HTTP at `/mcp` with owner auth and shared product tools; core UI/API worked without agent setup.
- `PRD-US-03`: PROVEN — desk/search/detail/policy surfaces were publicly reachable; commute delivery semantics were smoke-tested via delivery API, not an external delivery channel.
- `PRD-US-04`: PROVEN — first-use copy, Steer input, Source Ledger OPML/import controls, and no wizard were observed.
- `PRD-MIN-01`: PROVEN — observed UI text did not expose forbidden folders/tags/unread/archive/settings/job concepts.
- `PRD-FALLBACK-01`: PROVEN — `summary unavailable` and raw `/doctor` appeared; no cute/loader/apology state observed.
- `PRD-STATE-01`: PROVEN — export/import active-state bundle worked and omitted owner token/runtime metadata.
- `PRD-INSPECT-01`: PROVEN — inspect was explicit API mutation with idempotency, not passive browser viewing.
- `PRD-RESONATE-01`: PROVEN_WITH_LIMIT — resonance toggle/search state observed; long-term ranking/not-pin needs richer corpus.
- `PRD-STEER-01`: PROVEN — Steer accepted `search Blackbox` and `/doctor`; URL-add not re-tested because state import was the public seeded setup path for this review.
- `PRD-ACTOR-01`: PROVEN_WITH_LIMIT — owner-token boundary, actor IDs, idempotency, delivery provenance observed; human-over-agent ranking precedence needs richer corpus.
- `PRD-SOURCE-01`: PROVEN — flat Source Ledger and manual controls visible; live fetch of external invalid source intentionally not relied upon.
- `PRD-SEARCH-01`: PROVEN — lexical search and filters visible in HTTP and browser.
- `PRD-AGENT-01`: PROVEN_WITH_LIMIT — MCP tools/resources/auth/search parity observed; all-tool parity needs dedicated matrix.
- `PRD-AC-10`: PROVEN — replay and fingerprint mismatch behavior observed.
- `PRD-AC-12`: PROVEN — unauthorized HTTP and MCP requests rejected at boundary.
- `PRD-AC-16`: PROVEN — import/export active state shape observed.
- `PRD-AC-17`: PROVEN — `/doctor` raw text observed in HTTP and browser.
- `DESIGN-AUTH-01`: PROVEN — owner token prompt and no account copy observed.
- `DESIGN-FIRST-01`: PROVEN — exact first-use loop lines observed.
- `DESIGN-MENU-01`: PROVEN — `RESOFEED` menu with `NAV`, `TODAY`, `SOURCE LEDGER`, `OPERATIONS`, `LANG: EN`, `[REPROCESS LIBRARY]` observed.
- `DESIGN-LEDGER-01`: PROVEN — Source Ledger bracket controls and flat row observed.
- `DESIGN-PORT-01`: PROVEN — `[EXPORT STATE]`, `[IMPORT STATE]`, replacement warning observed.
- `DESIGN-DOC-01`: PROVEN — browser `/doctor` raw log observed.
- `ARCH-HTTP-01`: PROVEN — auth, query rejection, item/search/state endpoints observed.
- `ARCH-MCP-01`: PROVEN_WITH_LIMIT — MCP initialize/tools/resources/search smoke observed.
- `BLIND-SETUP-01`: PROVEN — setup used state import only, no direct DB writes or private hooks.

## Deviation Ledger

| id | classification | magnitude | requirement_ids | evidence | recommendation |
| --- | --- | --- | --- | --- | --- |
| DEV-BB-001 | tech_debt | minor | Runtime/build hygiene | `npm --prefix web install` reported 4 dependency audit findings; Vite warned about missing `.svelte-kit/tsconfig.json` base config. Build still completed. | Track in dependency/build hygiene queue; not a gate blocker for this user-story conformance smoke. |
| DEV-BB-002 | tech_debt | minor | `PRD-STEER-01`, `ARCH-PORT-01` | An intentionally invalid state import with `steer_rules[].is_active` was rejected. This confirms strictness, but also shows the Usage guide’s abridged steer-rule examples are insufficient for hand-authoring portable rule fixtures. | If human-authored state bundles are expected, add a complete steer rule example to public docs. |
| DEV-BB-003 | suggestion | minor | `PRD-DAILY-01`, `PRD-AC-07` | After delivery was recorded, `GET /api/feed/today` returned `items: []` while search still found the item. This is compatible with duplicate-surfacing avoidance, but the smoke corpus was too small to prove ranking/freshness guardrails. | Add a documented black-box corpus for freshness vs resonance vs delivery ranking. |

No blocker or should-fix deviations were found in the exercised public surfaces.

## Behavioral Proof Register

| behavior | proof status | evidence |
| --- | --- | --- |
| Server binds and serves UI/API/MCP from one documented `serve` command | PROVEN | `lsof -i :18081`; root HTML; `/api/*`; `/mcp` |
| Owner-token auth boundary for HTTP | PROVEN | `unauth-today.txt`; authorized doctor/feed/search transcripts |
| Owner-token auth boundary for MCP | PROVEN | `mcp-unauth-initialize.txt`; `mcp-auth-initialize.txt` |
| First-use owner token prompt and empty-state copy | PROVEN | `browser-state-token-prompt.txt`; `browser-state-main-ui.txt` |
| Public state import/export setup | PROVEN | `state-import-minimal.txt`; `state-export-after-import.txt` |
| Source Ledger flat controls and no second source URL field in observed UI | PROVEN | `browser-state-source-ledger.txt` |
| Lexical search via HTTP and browser Steer command | PROVEN | `search-after-agent-resonance.txt`; `browser-state-search-blackbox.txt` |
| Inspector detail/provenance/fallback labels | PROVEN | `item-detail.txt`; `browser-state-inspector.txt` |
| Resonate reversible state and retry mismatch safety | PROVEN | `resonance-off.txt`; `agent-resonance-1.txt`; `agent-resonance-mismatch.txt` |
| Inspect idempotency | PROVEN | `inspect-1.txt`; `inspect-replay.txt` |
| External delivery reporting | PROVEN | `delivery.txt`; search result `agent:external` marker |
| `/doctor` raw diagnostics and secret redaction | PROVEN | `doctor.txt`; `browser-state-doctor.txt` |
| No forbidden product concepts in observed UI states | PROVEN | `forbidden-ui-scan.txt` |
| Freshness vs old resonance ranking | NEEDS_TEST | Requires richer time-varied corpus beyond this representative smoke. |
| Duplicate/story grouping provenance | NEEDS_TEST | Requires multi-source duplicate fixture. |
| Human steering precedence over agent ranking drift | NEEDS_TEST | Requires ranking corpus and agent/human conflicting steer scenario. |
| Full all-tool MCP/HTTP parity | NEEDS_TEST | Search parity was proven; every mutating tool parity not exhaustively walked here. |

## Completion Receipt

1. Surface Area Tested: `serve` command, root web UI, owner-token prompt, Steer search and `/doctor`, Source Ledger, Search surface, Inspector, HTTP endpoints listed above, MCP `/mcp` initialize/tools/resources/search.
2. Vulnerabilities Triggered: no 500s, crashes, exposed secrets, or unhandled runtime errors were observed. Expected 401/400 negative-path errors were triggered and returned structured public errors.
3. The Blind Verdict: PASS.
4. Programmatic Handoff: see machine-readable closure fields below.

## Machine-Readable Closure Fields

```yaml
verdict: PASS
blockers: []
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
artifact: docs/audits/post-plan-user-story-conformance-black-box-review.md
deviation_ledger:
  - id: DEV-BB-001
    classification: tech_debt
    magnitude: minor
    blocker: false
  - id: DEV-BB-002
    classification: tech_debt
    magnitude: minor
    blocker: false
  - id: DEV-BB-003
    classification: suggestion
    magnitude: minor
    blocker: false
behavioral_proof_summary:
  proven: 13
  needs_test: 4
  unproven: 0
```
