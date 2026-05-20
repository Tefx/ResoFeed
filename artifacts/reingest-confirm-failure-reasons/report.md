# Re-ingest / Reprocess Failure Reason Confirmation

## Scope

- Worktree: `.vectl/worktrees/reingest-confirm-failure-reasons`
- Branch: `vectl/step-reingest-confirm-failure-reasons`
- Database copy inspected: `data/resofeed.sqlite3` (exists, 7,884,800 bytes)
- Main workspace DB: not touched.
- Product source/docs: not modified.
- External service calls: not attempted because `OPENROUTER_KEY` is absent in the runtime environment.
- Checklist receipt: no Markdown checklist (`- [ ]`) was present in the task text or verification field available to this verifier.

## Commands Identified

Canonical runtime entrypoint is one binary command:

```bash
./bin/resofeed serve --addr 127.0.0.1:8080 --public-url http://127.0.0.1:8080 --db ./data/resofeed.sqlite3 --openrouter-model openai/gpt-4.1-mini
```

Evidence:

- `README.md:23-29` documents `./bin/resofeed serve ... --db ./data/resofeed.sqlite3`.
- `docs/USAGE.md:72-74` states `serve` starts web UI, JSON API, MCP, background ingestion, SQLite migrations, and has no separate worker/admin/sync process.
- `cmd/resofeed/main.go:9-13` delegates to `resofeed.Main`.
- `internal/resofeed/db.go:31-75` accepts only `serve` and `owner-token reset`.
- Manual immediate ingest and reprocess are HTTP/API runtime operations under the running `serve` process:
  - `POST /api/ingest` (`internal/resofeed/manual_fetch_contract.go`, `internal/resofeed/http.go:243-247`, `http.go:773-780`).
  - `POST /api/runtime/reprocess-library` (`internal/resofeed/processing_language_contract.go:25-27`, `http.go:262-266`, `http.go:459-473`).

## Masked Environment Status

```json
{"OPENROUTER_KEY":"missing","RESOFEED_E2E":"missing","RESOFEED_E2E_OPENROUTER_ENDPOINT":"missing"}
```

No secret values were printed.

## Commands Run

| Command | Exit | Raw Evidence |
| --- | ---: | --- |
| `python3` read-only SQLite/env probe | 0 | `exists True size 7884800`; tables include `agent_receipts`, `items`, `runtime_metadata`, `search_fts`, `sources`; masked env as above. |
| `python3` read-only DB snapshot before run | 0 | Counts and records summarized below. |
| `go build -o /var/folders/rs/6_0h1ssn5439q1yfqy4pykg00000gn/T/opencode/resofeed-diagnosis ./cmd/resofeed` | 0 | Binary built outside worktree. |
| `timeout 20s /var/.../resofeed-diagnosis serve --addr 127.0.0.1:18082 --public-url http://127.0.0.1:18082 --db ./data/resofeed.sqlite3 --owner-token rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG` | 2 | `err: invalid_openrouter_key: value required` |
| `python3` read-only DB snapshot after blocked run | 0 | Counts unchanged; no new `reprocess_library` receipt; FTS stale marker unchanged. |

## Before DB Evidence

### Whole-library status distribution

| extraction_status | model_status | count |
| --- | --- | ---: |
| `full` | `ok` | 450 |
| `partial_extraction` | `ok` | 137 |
| `summary_unavailable` | `summary_unavailable` | 58 |
| `full` | `model_latency_error` | 16 |
| `partial_extraction` | `model_latency_error` | 3 |
| `original_unavailable` | `summary_unavailable` | 1 |

### Chinese-related status distribution

Chinese-related detection included Han characters in title, feed excerpt, extracted text, summary, or core insight.

| extraction_status | model_status | count |
| --- | --- | ---: |
| `full` | `ok` | 450 |
| `partial_extraction` | `ok` | 137 |
| `full` | `model_latency_error` | 1 |

The prior report listed two Chinese-related `full/model_latency_error` rows. Re-checking the copied DB with UTF-8 replacement shows:

| item_id | title | extraction_status | model_status | extracted_len | summary_len | note |
| --- | --- | --- | --- | ---: | ---: | --- |
| `item_5c59ce38ca84cd208c1a5c315ecc5105` | AI eats the world (16 minute read) | `full` | `model_latency_error` | 432 | 0 | Extracted payload begins `%PDF-1. 3` with binary replacement characters and one incidental Han character, so this is not a true Chinese row; it is a PDF/binary extraction contamination plus LLM failure. |
| `item_6375a9147272a04c9359d78aa4d0c029` | When "idle" isn't idle: how a Linux kernel optimization became a QUIC bug (11 minute read) | `full` | `model_latency_error` | 17,435 | 0 | Readable article text exists; model summary fields are empty, consistent with LLM/API summarization failure. |

### Runtime metadata

| key | value | updated_at |
| --- | --- | ---: |
| `owner_token_sha256` | `<redacted sha256 present>` | 1779205043 |
| `processing_language` | `zh` | 1779209589 |
| `search_fts_stale_since` | `2026-05-19T17:43:48Z` | 1779212628 |

### Source state

| id | title | url | active | last_fetch_status | last_fetch_at | last_fetch_error | revision |
| --- | --- | --- | ---: | --- | --- | --- | ---: |
| `src_9e74b66580ae1bfe` | TLDR FEED Feed | `https://bullrich.dev/tldr-rss/feed.rss` | 1 | `ok` | `2026-05-20T16:42:17Z` | empty | 59 |

### Reprocess receipts

`agent_receipts` contains two `reprocess_library` receipts. The latest receipt remains:

```json
{"status":"failed","language":"zh","items_attempted":199,"items_updated":117,"items_indexed":0,"items_unavailable":66,"items_failed":16,"fts_rebuilt":false}
```

The first 50 recorded errors in that receipt include `original_unavailable`, `summary_unavailable`, and `model_latency_error`; the receipt error list is capped at 50 by `internal/resofeed/reprocess.go:411-423` and `processing_language_contract.go:97-118`.

## Attempted Re-ingest/Reprocess Result

Starting the canonical runtime was blocked before SQLite open/migration, HTTP binding, background ingest, or HTTP reprocess could run:

```text
err: invalid_openrouter_key: value required
```

The compiled binary exited with code 2. This is expected from `internal/resofeed/db.go:54-63` and `db.go:215-222`: `serve` resolves the OpenRouter runtime secret and rejects empty/whitespace keys before `runServe`.

Because the required API credential is missing and the task explicitly forbids external calls unless required credentials are present, no live OpenRouter call, manual ingest, or reprocess was attempted.

## After DB Evidence

The after snapshot is unchanged:

| Metric | After |
| --- | --- |
| Whole-library status distribution | Same as before: 450 `full/ok`, 137 `partial_extraction/ok`, 58 `summary_unavailable/summary_unavailable`, 16 `full/model_latency_error`, 3 `partial_extraction/model_latency_error`, 1 `original_unavailable/summary_unavailable`. |
| Chinese-related distribution | Same as before: 450 `full/ok`, 137 `partial_extraction/ok`, 1 `full/model_latency_error`. |
| `item_5c59...` | Still `full/model_latency_error`, `extracted_len=432`, `summary_len=0`. |
| `item_6375...` | Still `full/model_latency_error`, `extracted_len=17435`, `summary_len=0`. |
| `runtime_metadata.search_fts_stale_since` | Still `2026-05-19T17:43:48Z`. |
| `sources.last_fetch_status` | Still `ok`; no source error. |
| `reprocess_library` receipts | Still count 2; latest `2026-05-19T17:43:48.804726Z`; no new receipt written. |

## Confirmed Failure Reasons

1. **Current run blocker: missing OpenRouter credential.** Proven by masked environment (`OPENROUTER_KEY=missing`) and binary output `err: invalid_openrouter_key: value required` with exit 2. Without this credential, the runtime cannot start, so neither background ingest, `POST /api/ingest`, nor `POST /api/runtime/reprocess-library` can run.
2. **Persisted `model_latency_error` rows are LLM/API summarization failures, not RSS-source failures.** The code maps `llm.SummarizeItem` errors to `model_latency_error` (`internal/resofeed/openrouter.go:84-101`; `internal/resofeed/reprocess.go:202-208`). The two prior focus rows still have empty summary fields and non-empty extracted text. `item_6375...` has a full readable article body; `item_5c59...` has PDF/binary-looking text that was stored as `full` and then failed model summarization.
3. **Partial extraction rows are degraded-success fallback, not total failures.** All 137 Chinese-related partial rows are `partial_extraction/ok` and have Chinese summary text. That means article extraction was incomplete/unavailable but model summarization from fallback feed text succeeded. They should not be counted as failed LLM items.
4. **Stale FTS is a reprocess timeout/completion failure marker.** `runtime_metadata.search_fts_stale_since=2026-05-19T17:43:48Z` remains present; the latest receipt shows `status=failed`, `items_indexed=0`, `fts_rebuilt=false`. Code sets the marker at reprocess start and clears it only after `rebuildSearchIndexAndClearStale` succeeds (`internal/resofeed/reprocess.go:66-70`, `reprocess.go:129-140`, `reprocess.go:389-408`).
5. **RSS source fetch is not the immediate failure.** The only active source is `last_fetch_status=ok`, `last_fetch_error=''`, `last_fetch_at=2026-05-20T16:42:17Z`.

## Item-Level Results

| item_id | before -> after | conclusion |
| --- | --- | --- |
| `item_5c59ce38ca84cd208c1a5c315ecc5105` | `full/model_latency_error`, `summary_len=0` -> unchanged | Still failed. Extracted text begins `%PDF-1. 3` with binary replacement chars; likely PDF/binary extraction contamination plus LLM/API failure. Could not retry without `OPENROUTER_KEY`. |
| `item_6375a9147272a04c9359d78aa4d0c029` | `full/model_latency_error`, `summary_len=0` -> unchanged | Still failed. Full readable text exists; failure reason is model/API summarization path. Could not retry without `OPENROUTER_KEY`. |
| 137 `partial_extraction/ok` Chinese rows | `partial_extraction/ok` -> unchanged | Degraded-success fallback: source article extraction incomplete, but Chinese model output exists. Not a failed LLM state. |

## Behavioral Proof Register

| Behavior | Proof status | Evidence |
| --- | --- | --- |
| Canonical runtime starts only through `resofeed serve` | PROVEN | Docs and `Main` command switch; binary was built and invoked. |
| Current environment can run re-ingest/reprocess | UNPROVEN | Runtime exits before start due missing `OPENROUTER_KEY`; no HTTP/API surface became available. |
| Missing credential blocks ingest/reprocess attempt | PROVEN | Binary exit 2 with `err: invalid_openrouter_key: value required`. |
| Existing DB failure statuses changed after attempted run | PROVEN negative | Before/after snapshots unchanged; no new receipt. |
| Partial extraction rows are degraded-success fallback | PROVEN | `partial_extraction/ok` count 137 with non-empty Chinese summaries; code status taxonomy supports this. |
| FTS remains stale from failed reprocess | PROVEN | Runtime metadata marker remains, latest receipt `fts_rebuilt=false`. |

## Recommended Remediation

1. Provide `OPENROUTER_KEY` via OS env or local uncommitted `.env`, then rerun the runtime and trigger `POST /api/runtime/reprocess-library` with owner token authorization and a fresh idempotency key.
2. Expect a full-library Chinese reprocess to need more than the current 10-minute timeout for 665 items; consider implementing/using smaller supported batches if the product adds that surface, or run when provider latency is low.
3. After a successful reprocess, verify `runtime_metadata.search_fts_stale_since` is absent and the latest `reprocess_library` receipt has `fts_rebuilt=true` and nonzero `items_indexed`.
4. For `item_5c59...`, separately inspect PDF handling/binary detection because the stored `extracted_text` begins with a PDF header despite `extraction_status='full'`.
5. Treat `partial_extraction/ok` as degraded content fidelity rather than failed Chinese processing; investigate original article URLs only if full article fidelity is required.
