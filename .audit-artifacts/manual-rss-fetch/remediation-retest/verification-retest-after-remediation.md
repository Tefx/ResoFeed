# Manual RSS Fetch Remediation Retest Artifact

Tester: integration-verifier  
Timestamp: 2026-05-10T16:18:08Z  
Scope: `verification-retest-after-remediation`

## Runtime proof excerpt

Command: Python harness that built `./cmd/resofeed`, launched `resofeed serve` with a temp SQLite DB and owner token, imported a slow local RSS source, then called authenticated manual fetch endpoints.

Key observed output:

```text
BUILD_EXIT 0
READY True LAST (401, '{"error":{"code":"unauthorized","message":"owner token required","details":{}}}\n')
IMPORT_STATUS 200
IMPORT_BODY {"imported":1,"skipped":0,"folders_flattened":true}
INGEST_STATUS 200
INGEST_BODY {"operation":"ingest","source_id":null,"completed":true,"sources_total":1,"sources_fetched":0,"items_discovered":0,"items_upserted":0,"errors":[{"source_id":"src_d80db186a8f29b45d9e4609746a4ed51","code":"rss_fetch_error","message":"rss fetch: status 503"}]}
FETCH_STATUS 200
FETCH_BODY {"operation":"source_fetch","source_id":"src_d80db186a8f29b45d9e4609746a4ed51","completed":true,"sources_total":1,"sources_fetched":0,"items_discovered":0,"items_upserted":0,"errors":[{"source_id":"src_d80db186a8f29b45d9e4609746a4ed51","code":"rss_fetch_error","message":"rss fetch: status 503"}]}
CONCURRENT_RESULTS [["second", 409, "{\"error\":{\"code\":\"conflict\",\"message\":\"ingest already running\",\"details\":{}}}\n"], ["first", 200, "{\"operation\":\"source_fetch\",\"source_id\":\"src_d80db186a8f29b45d9e4609746a4ed51\",\"completed\":true,\"sources_total\":1,\"sources_fetched\":0,\"items_discovered\":0,\"items_upserted\":0,\"errors\":[{\"source_id\":\"src_d80db186a8f29b45d9e4609746a4ed51\",\"code\":\"rss_fetch_error\",\"message\":\"rss fetch: status 503\"}]}\n"]]
SQLITE_TABLES ["agent_receipts", "item_state", "items", "runtime_metadata", "schema_migrations", "search_fts", "search_fts_config", "search_fts_content", "search_fts_data", "search_fts_docsize", "search_fts_idx", "sources", "steer_rules"]
SERVER_STDOUT owner token explicit: stored hash
serving ResoFeed on 127.0.0.1:54124 (public-url http://127.0.0.1:54124)
shutdown complete
```

Interpretation: successful 200 bodies are flat `ManualFetchResult` objects; the overlap path returns canonical 409 conflict and does not queue work. The only receipt table present is pre-existing `agent_receipts`; no `manual_fetch`, `queue`, or `job` table was present.

## Test proof excerpt

```text
$ go test ./internal/resofeed -run 'TestManualRSSFetch' -count=1 -v
PASS
ok  resofeed/internal/resofeed  0.244s

$ go test ./...
?   resofeed/cmd/resofeed [no test files]
ok  resofeed/internal/resofeed 0.360s

$ npm test
svelte-check found 0 errors and 0 warnings
Test Files 5 passed (5)
Tests 28 passed (28)

$ npm run test:render -- manual-rss-fetch
Test Files 3 passed (3)
Tests 12 passed (12)
```

## Static seam checks

- Obsolete nested manual-fetch access search for `.ingest`, `.fetch`, `body.ingest`, `body.source`, and `result.body.(ingest|fetch|source)` in `web/src` returned no matches.
- `SourceLedger.svelte` renders `[RUN INGEST]`, `[INGESTING...]`, `[FETCH]`, `[FETCHING...]`, `last ingest: HH:MM:SS`, `last fetch: HH:MM:SS`, and `imported N sources; folders flattened`.
- `docs/ui-preview.html` contains the same manual fetch controls and import-success copy in the Source Ledger reference.
