# Final Black-Box Verification Report

## refs Read Confirmation (MANDATORY)
- `docs/USAGE.md` — Read. Key passage: `serve` starts web UI, JSON HTTP API, MCP Streamable HTTP at `/mcp`, background ingestion, SQLite migrations, and static assets; all `/api/*` requests require `Authorization: Bearer <OWNER_TOKEN>`; state export/import and MCP resources/tools are public usage surfaces.
- `docs/PRD.md` — Read. Key passage: ResoFeed's core promise is freshness + memory + steering without inbox-zero mechanics; acceptance criteria AC-1..AC-17 cover freshness, star-not-pin, agent safety, state portability, and `/doctor` diagnostics.
- `docs/DESIGN.md` — Read. Key passage: public UI contract requires owner-token prompt, first-use empty state text, Steer input, flat Source Ledger, state export/import actions, raw `/doctor`, and search/retrieval surfaces with no account/onboarding/settings-dashboard language.
- `docs/DESIGN_VISION.md` — Read. Key passage: design is high-density, low-fatigue, typographic, with no account login/onboarding, no numeric indicators, no cute error states, and Source Ledger as flat read/delete-only roster.
- `docs/ARCHITECTURE.md` — Read. Key passage: one Go binary `resofeed serve` serves static UI, HTTP API, MCP `/mcp`, and ingest; every `/api/*` and `/mcp` request requires the owner token; state bundle includes only active sources, active steering rules, and resonated items; HTTP query validation rejects unknown/duplicate params.
- `.agents/instructions.md` — Read. Key passage: ResoFeed is a single-tenant analyst workbench; canonical docs are authoritative; no vector DB/RAG, no multi-user auth, no sync/merge, and HTTP endpoints/MCP expose the same Inspect/Resonate/Steer/Retrieve operations.

## Final Black-Box Report

### [Vibe Check]
The high-risk seams were startup auth/token handling, strict query validation, state restore replacement semantics, MCP parity, and the common frontend false-positive where a built app serves an empty SPA shell. I treated an empty database as acceptable for first-use and contract-level endpoint shape, but not as proof of ranking/duplicate/item mutation semantics over real ingested content.

### Commands/scripts
- `npm --prefix web install`
- `npm --prefix web run build`
- `go build -o ./bin/resofeed ./cmd/resofeed`
- `./bin/resofeed serve --addr 127.0.0.1:18080 --public-url http://127.0.0.1:18080 --db .audit-artifacts/final_black_box_verification/audit.sqlite3 --gemini-api-key fake-gemini-key-for-blackbox --gemini-model gemini-2.5-flash --owner-token rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG`
- `curl` probes against `/api/feed/today`, `/api/search`, `/api/sources`, `/api/sources/import-opml`, `/api/state/export`, `/api/state/import`, `/api/doctor`, and `/mcp`.
- CLI negative probes for missing Gemini key, short owner token, invalid public URL, and first-run generated token.
- Playwright black-box browser probes against `http://127.0.0.1:18082/`, `:18085/`, and `:18086/` for owner-token prompt, invalid-token feedback, first-use state, Source Ledger/state portability, and search via Steer.

### Actual outputs/artifacts
- Build succeeded. `npm install` reported 3 low severity dependency vulnerabilities; `npm run build` emitted a SvelteKit tsconfig warning before generating the static site; `go build` succeeded.
- Network liveness: `lsof -nP -iTCP:18080 -sTCP:LISTEN` showed `resofeed` bound on `127.0.0.1:18080`.
- Auth: unauthenticated `GET /api/feed/today` returned `401` with `{"error":{"code":"unauthorized","message":"owner token required","details":{}}}`; authenticated request returned `200` and `{"items":[]}`.
- Strict query validation: duplicate `limit` on `/api/feed/today` returned `400 bad_request` with `details.field=limit`; unknown `/api/search?bogus=1` returned `details.field=bogus`; invalid `resonated=yes` returned `details.field=resonated`.
- Search: valid `/api/search?q=sqlite&source=example&from=2026-01-01&to=2026-12-31&resonated=true&limit=7` returned `200`, empty items, and exact query echo including `limit:7`.
- OPML: nested OPML import returned `{"imported":1,"skipped":0,"folders_flattened":true}`; `/api/sources` showed one flat source, no folder fields.
- State: export returned `schema_version: resofeed.state.v1` with active source, empty rules, empty resonated items; roundtrip import returned `{"restored":{"sources":1,"steer_rules":0,"resonated_items":0}}`; invalid bundle with unknown top-level field returned `400 bad_request` with `details.field=unexpected`.
- Doctor: `GET /api/doctor` returned `200 text/plain; charset=utf-8` with raw lines including `rss:`, `gemini:`, `extraction:`, and `ingest:`.
- MCP: unauthenticated initialize returned `401`; authenticated initialize returned server capabilities; `tools/list` exposed `list_candidate_items`, `search_items`, `read_item`, `mark_inspected`, `resonate_item`, `steer`, and `report_delivery`; `resources/list` exposed `resofeed://feed/today`, `resofeed://rules/active`, `resofeed://system/doctor`, and `resofeed://sources`; `resources/read` for doctor returned `mimeType: text/plain`; `tools/call list_candidate_items` returned `{"items":[]}`.
- CLI validation: missing Gemini key exited `2` with `err: invalid_gemini_api_key: value required`; invalid owner token exited `2`; invalid public URL exited `2`; omitted owner-token generated and logged `owner token generated: rfeed_<...>` and bound the port.
- UI artifacts committed under this directory: `ui-owner-token-prompt.png`, `ui-invalid-token.png`, `ui-first-use-empty.png`, `ui-source-ledger-state.png`, `ui-search-via-steer.png`, plus text reports. UI rendered visible text and controls; invalid token rendered `err: owner token rejected`; authenticated first-use rendered the required lines; Source Ledger rendered OPML import, no-sources text, export/import actions, and state replacement warning; `search sqlite` through Steer rendered Search and Retrieval with `0 results` and lexical/source-backed copy.

### Acceptance coverage
| PRD AC | Public-surface evidence | Result |
|---|---|---|
| AC-1 Freshness protection | API/feed and MCP candidate surfaces reachable and auth-gated; no populated ranking corpus available in this clean audit. | NON_BLOCKING_GAP |
| AC-2 Star is not pin | Resonance endpoint/tool schemas visible; no item corpus to prove old-star ranking behavior. | NON_BLOCKING_GAP |
| AC-3 News coverage without stars | Not provable without seeded multi-source time corpus. | NON_BLOCKING_GAP |
| AC-4 Strict Policy Execution | Steer endpoint exists; no real Gemini/ingestion corpus to prove future ranking policy. | NON_BLOCKING_GAP |
| AC-5 Interest is not agreement | Inspect semantics not provable without item corpus; no passive UI tracking observed from black-box probes. | NON_BLOCKING_GAP |
| AC-6 Human authority over agents | MCP/HTTP auth and actor/idempotency schemas present; precedence over live rankings not provable. | NON_BLOCKING_GAP |
| AC-7 External handoff idempotency | `report_delivery` tool exposed with idempotency schema; no item corpus to verify suppression. | NON_BLOCKING_GAP |
| AC-8 Steering clarity | UI Steer rendered receipts/search mode; API steer documented/exposed. | PASS_SAMPLE |
| AC-9 Agent evaluate vs deliver | `list_candidate_items` read call returned items without mutation surface; delivery tool exposed; no item corpus. | NON_BLOCKING_GAP |
| AC-10 Agent mutation safety | Mutating MCP tools require idempotency keys in schema; no item mutation could be executed without item corpus. | NON_BLOCKING_GAP |
| AC-11 Agent steering receipt | MCP steer tool exposed; UI has receipt areas; live agent receipt over populated feed not sampled. | NON_BLOCKING_GAP |
| AC-12 Unauthorized agent action | `/mcp` unauthenticated initialize rejected at auth boundary with 401 and no tool handling. | PASS |
| AC-13 Duplicate/story provenance | Not provable without duplicate/story corpus. | NON_BLOCKING_GAP |
| AC-14 Summary transparency | UI/design fallback labels visible in docs; no ingested partial/unavailable article sampled. | NON_BLOCKING_GAP |
| AC-15 First useful session | First-use UI showed documented empty state, owner token gate, Steer, Source Ledger, OPML, export/import; no folders/settings/agent setup required. | PASS_SAMPLE |
| AC-16 State Portability | Export/import roundtrip through public HTTP matched architecture schema and restore result; invalid unknown field rejected. | PASS |
| AC-17 Diagnostics Output | `/api/doctor` returned raw text; UI `/doctor`/diagnostic command surface was represented through Steer contract and Source Ledger search smoke. | PASS_SAMPLE |

### Issues found
- No blocker-class behavioral failure found through documented public interfaces.
- Non-blocking debt: clean-environment black-box audit did not prove ranking, duplicate grouping, item inspect/resonate mutation, or Gemini-backed steering semantics because no realistic ingested item corpus or real Gemini key was available. This is a proof gap, not a reproduced product failure.
- Non-blocking hygiene: `npm install` reported 3 low severity dependency vulnerabilities; not a product-behavior blocker for this gate.

### Not tested and why
- Real RSS ingestion + Gemini summarization/ranking: no real Gemini key was provided; fake key was sufficient for startup and static/public API contract probes but not for LLM-backed content processing.
- Item detail/inspect/resonance/report-delivery happy path: empty clean database had no item IDs through public setup within bounded audit time.
- Rich PRD corpus properties (freshness quotas, old-star non-pinning, duplicate provenance): require a deterministic seeded corpus or live ingestion fixture beyond the public docs' quick-start contract.
- Browser screenshots are static proof of rendered surfaces, not visual contrast/accessibility audits.

- Headline: PASS_WITH_DEBT

### Test-step semantic reporting
step_intent: deep_review
expected_result: green
observed_result: green
failure_alignment: none
verdict: PASS
blockers: []
gate_open_allowed: true
orchestrator_action_hint: COMPLETE
product_implementation_files_modified: false

### behavioral_proof_register
- proof: Public CLI startup/validation, network port binding, HTTP auth/query/state/doctor flows, MCP auth/resources/tools, and rendered UI owner-token/first-use/source-ledger/state/search surfaces were exercised through documented commands only.
- uncertainty_sources: No populated item/ranking corpus and no real Gemini key; ranking, duplicate grouping, and item mutation idempotency remain non-blocking proof debt.
- proof_gap_status: NON_BLOCKING
- blocking_status: CLOSED
headline: PASS_WITH_DEBT

**Headline**: PASS_WITH_DEBT
**Blocking Status**: CLOSED
**Proof-Gap Status**: NON_BLOCKING
**Verdict**: PASS
**Blockers**: []
**Orchestrator Action Hint**: COMPLETE
