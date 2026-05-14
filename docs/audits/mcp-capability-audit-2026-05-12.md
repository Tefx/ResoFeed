# ResoFeed MCP Capability Audit

Document date: 2026-05-12
Test date: 2026-05-11

Scope: end-to-end MCP capability testing against `docs/ARCHITECTURE.md` MCP Surface requirements. The audit used direct HTTP calls to the real `/mcp` Streamable HTTP endpoint on an isolated `resofeed serve` process, with a temporary owner token, deterministic local OpenRouter stub, and seeded SQLite database. It did not use unit tests or in-process handler shortcuts.

Artifacts:

- [MCP audit observations JSON](artifacts/mcp-audit-2026-05-11/mcp-audit-observations.json)
- [Current server probe](artifacts/mcp-audit-2026-05-11/current-server-probe.json)
- [MCP fixture seed SQL](artifacts/mcp-audit-2026-05-11/seed.sql)
- [OpenRouter stub log](artifacts/mcp-audit-2026-05-11/openrouter-stub.log)
- [Isolated server stdout](artifacts/mcp-audit-2026-05-11/server.stdout.log)
- [Isolated server stderr](artifacts/mcp-audit-2026-05-11/server.stderr.log)

## Current Cleanup Note (2026-05-13)

This audit records historical MCP findings from the 2026-05-11/2026-05-12 audit run. Later remediation and closure artifacts supersede the open status of MCP-2: empty `resofeed://sources` and `resofeed://rules/active` resources now have closure evidence showing `{"sources":[]}` and `{"rules":[]}` rather than JSON `null`.

Use this document as historical defect evidence. For current closure status, use `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json`, `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md`, and the regression final/spec gate artifacts.

## Summary

- Historical audit execution: 44 MCP checks were executed.
- Historical audit result at that time: 41 checks passed; 3 checks failed or blocked verification:
  - current `localhost:8080` was unreachable during the live probe;
  - empty `resofeed://sources` returned `sources: null`;
  - empty `resofeed://rules/active` returned `rules: null`.
- Current cleanup status: the localhost liveness blocker and empty-resource null-array finding are historical. Later runtime evidence records an authenticated server/MCP liveness path and empty MCP resources as `{"sources":[]}` and `{"rules":[]}`. The historical failures remain documented below only to preserve audit traceability.

## Passing Coverage

- Missing and invalid MCP auth return HTTP `401` before JSON-RPC dispatch.
- `GET /mcp` returns HTTP `400` with `POST required`.
- Invalid JSON returns MCP parse error `-32700`.
- Unknown JSON-RPC methods return `-32601`.
- `initialize`, `tools/list`, and `resources/list` expose the expected protocol surface.
- Tool schemas are strict object schemas with `additionalProperties=false`.
- Resource list MIME declarations match the architecture contract.
- `resofeed://feed/today` returns an empty `items` array when no content exists, and returns seeded candidates after fixture insertion.
- `resofeed://system/doctor` returns `text/plain` diagnostics.
- `list_candidate_items`, `search_items`, and `read_item` work against seeded content.
- Read/evaluate MCP calls did not mutate `item_state`.
- `mark_inspected`, `resonate_item`, and `report_delivery` mutate state and replay idempotently.
- Reusing an idempotency key with a different payload is rejected and leaves state unchanged.
- `search_items` with `resonated: true` sees prior MCP resonance mutation.
- Natural-language `steer` calls the deterministic OpenRouter translation path, writes an active rule, and replays without a second LLM call.
- URL subscription through MCP `steer` adds a source without calling the LLM, and the new source appears in `resofeed://sources`.
- MCP agent `steer` respects active human steering precedence.
- Unknown tools/resources return MCP JSON-RPC not-found errors, not HTTP `404`.
- Missing query, invalid dates, reversed date ranges, unknown fields, missing idempotency keys, oversized `actor_id`, invalid `delivered_at`, and missing items are rejected through MCP errors.
- HTTP `/api/search` and MCP `search_items` exposed the same seeded retrieval item for the same lexical query.
- Mutating MCP calls created bounded runtime receipts for idempotency/provenance.

## Findings

### MCP-1. Current localhost MCP instance was unreachable during the historical live probe

Severity: P2 historical/environmental; current status: CLOSED_BY_LATER_RUNTIME_PROOF
PRD/Architecture: MCP Surface, Owner Token Boundary

During the original audit, the current `http://localhost:8080` instance could not be reached during the MCP live probe. The artifact records `transport_error: fetch failed`, and a follow-up socket check found no process listening on TCP port 8080. This meant the current in-app Browser URL was stale or the app server had exited by the time MCP testing ran.

This was not proof that the MCP handler was broken. It was a real audit blocker for that review round because the displayed local instance could not verify current-state MCP auth, resources, or tool behavior until the server was restarted or the expected bind address was corrected.

Historical evidence:

- [Current server probe](artifacts/mcp-audit-2026-05-11/current-server-probe.json)

Closure evidence:

- `.audit-artifacts/regression_backend_mcp_llm_liveness_probe/report.json` records later `/api/doctor`, `/api/feed/today`, MCP `read_item`, and MCP sources resource liveness through a bound runtime.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` records later full runtime retest coverage for HTTP/MCP liveness.

Historical correction requirement, now closed by later proof:

Before future review rounds, make the app/server lifecycle explicit: confirm a listener on `localhost:8080`, confirm `/mcp` responds to missing-auth smoke with HTTP `401`, and provide or configure a valid owner token for the running instance. The later runtime artifacts listed above satisfy this requirement for the remediation chain.

### MCP-2. Empty MCP `sources` and `rules/active` resources returned `null` arrays during the historical audit

Severity: P2 historical; current status: CLOSED_BY_LATER_RUNTIME_PROOF
Architecture: MCP Surface, Resource JSON Bodies

During the original isolated audit run, `resofeed://sources` returned `{ "sources": null }` and `resofeed://rules/active` returned `{ "rules": null }`. The architecture contract defines these resource bodies as `{ "sources": [Source] }` and `{ "rules": [SteerRule] }`. Empty state should serialize as empty arrays, not JSON `null`.

This was client-visible at the time. MCP clients often iterate resource arrays directly; `null` forces special-case handling and violates the published schema shape. `resofeed://feed/today` already behaved correctly in the same empty fixture by returning `items: []`, so this was a localized response-shaping defect.

Historical evidence:

- [MCP audit observations JSON](artifacts/mcp-audit-2026-05-11/mcp-audit-observations.json)

Closure evidence:

- `.audit-artifacts/regression_audit_full_runtime_retest/mcp_empty_resources_and_auth.json` records empty MCP resources as `{"sources":[]}` and `{"rules":[]}`.
- `.audit-artifacts/regression_audit_full_runtime_retest/full-runtime-retest-evidence.md` records the empty-array retest as closed.

Historical correction requirement, now closed by later proof:

- `resofeed://sources` must return `{ "sources": [] }`.
- `resofeed://rules/active` must return `{ "rules": [] }`.
