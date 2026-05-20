# Chinese Processing Failure Investigation

## Scope and Inputs

- Worktree: `.vectl/worktrees/chinese-processing-failure-investigation`
- Database copy inspected read-only: `data/resofeed.sqlite3`
- External services/API calls: none.
- Local logs searched: `*.log` under the worktree; only an OpenRouter stub startup line matched processing-related terms, so no runtime error log provided additional cause detail.

## Database Summary

- `items` rows: 665
- Active sources: 1 (`src_9e74b66580ae1bfe`, `TLDR FEED Feed`, `https://bullrich.dev/tldr-rss/feed.rss`)
- Source fetch state: `last_fetch_status=ok`, `last_fetch_at=2026-05-20T16:27:17Z`, `last_fetch_error` empty.
- Runtime language: `runtime_metadata.processing_language=zh`, updated at unix epoch `1779209589`.
- FTS stale marker present: `runtime_metadata.search_fts_stale_since=2026-05-19T17:43:48Z`, indicating a reprocess attempt started and did not clear the stale marker.

## Current Chinese-Related Item Status Counts

Chinese-related rows were detected by Han characters in item title/source/excerpt/extracted text/summary/core insight.

| Metric | Count |
| --- | ---: |
| Chinese-related items | 589 |
| Current model failures among Chinese-related rows (`model_status != 'ok'`) | 2 |
| Current incomplete extraction among Chinese-related rows (`extraction_status != 'full'`) | 137 |

Status distribution among Chinese-related rows:

| extraction_status | model_status | Count |
| --- | --- | ---: |
| full | ok | 450 |
| partial_extraction | ok | 137 |
| full | model_latency_error | 2 |

## Current Model Failure Rows

| item_id | title | source | published_at | first_seen_at | extraction_status | model_status |
| --- | --- | --- | --- | --- | --- | --- |
| `item_5c59ce38ca84cd208c1a5c315ecc5105` | AI eats the world (16 minute read) | TLDR FEED Feed | 2026-05-19T00:00:00Z | 2026-05-19T15:55:11Z | full | model_latency_error |
| `item_6375a9147272a04c9359d78aa4d0c029` | When "idle" isn't idle: how a Linux kernel optimization became a QUIC bug (11 minute read) | TLDR FEED Feed | 2026-05-13T00:00:00Z | 2026-05-19T16:22:40Z | full | model_latency_error |

Both rows have readable extracted article text but no summary/core insight/value tier in the current row, consistent with LLM summarization failure rather than source fetch failure.

## Current Incomplete Extraction Pattern

- All 137 current incomplete Chinese-related rows are from `TLDR FEED Feed | https://bullrich.dev/tldr-rss/feed.rss`.
- Their shared status is `extraction_status='partial_extraction'` and `model_status='ok'`.
- This means the original article fetch/extraction was unavailable or unsuitable, but the feed item description was available and the LLM successfully produced Chinese user-readable fields from that fallback text.
- Representative affected item IDs/titles:
  - `item_198f12c793fc1f9cf522bfd13cf4b09b` — Anthropic 和 OpenAI 在 Solana 上的代币化预 IPO 股票价格下跌（3 分钟阅读）
  - `item_a4cfc2b3d51bde4d8c7e715982d6a0de` — Base x402 协议实现超低微额 AI 支付（4 分钟阅读）
  - `item_baddc1ca27a6b07c58594163d355a1f7` — Bitwise 首席投资官表示《GENIUS 法案》助力加密货币融资（3 分钟阅读）
  - `item_a03c5b6247bd710d62f841b7e2275a91` — 微软的多智能体AI系统在网络安全基准测试中超越Anthropic的Mythos（3分钟阅读）
  - `item_df069d1c1b7added5d10354ef72db876` — Perplexity Computer 背后的安全架构 (2 分钟阅读)

Use this read-only SQL to enumerate the full incomplete set:

```sql
select i.id, i.title, s.title as source_title, i.source_url, i.published_at,
       i.first_seen_at, i.extraction_status, i.model_status
from items i
left join sources s on s.id = i.source_id
where i.extraction_status != 'full'
  and (i.title glob '*[一-鿿]*'
       or coalesce(i.feed_excerpt,'') glob '*[一-鿿]*'
       or coalesce(i.summary,'') glob '*[一-鿿]*'
       or coalesce(i.core_insight,'') glob '*[一-鿿]*')
order by i.first_seen_at desc, i.id;
```

## Reprocess Receipt Evidence

`agent_receipts` contains two `reprocess_library` receipts:

| created_at | status | language | attempted | updated | unavailable | failed | indexed | fts_rebuilt |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-05-19T15:41:25.892974Z | completed | zh | 0 | 0 | 0 | 0 | 0 | true |
| 2026-05-19T17:43:48.804726Z | failed | zh | 199 | 117 | 66 | 16 | 0 | false |

The failed reprocess receipt recorded only the first 50 item-level errors due to the code cap in `appendReprocessError`; those 50 break down as:

- `original_unavailable`: 29
- `model_latency_error`: 11
- `summary_unavailable`: 10

The receipt plus the still-present `search_fts_stale_since` marker indicate the Chinese library reprocess did not finish cleanly after 10 minutes. Because failed/unavailable reprocess outcomes are not written back to `items`, the durable per-item status table does not contain all 82 reprocess failures/unavailable outcomes.

## Likely Root Causes

1. **Original article extraction limitations / source content unsuitable** — Proven in code and DB. `extractArticleText` returns `partial_extraction` when article fetch fails, returns a non-2xx response, unsupported content type, binary-like payload, or empty readable text while the feed description exists. The DB has 137 Chinese-related `partial_extraction` rows, all from the same TLDR feed, with `model_status=ok`, showing fallback summarization succeeded.
2. **LLM/API latency or provider error during summarization/reprocess** — Proven in code and DB status/receipts. `buildItem` maps any `llm.SummarizeItem` error to `model_latency_error`; `openrouter.generateJSON` returns errors for missing API key, HTTP 429/5xx after retry, non-2xx status, provider error envelope, empty text, or invalid JSON. Current DB has 2 Chinese-related `model_latency_error` rows; the failed reprocess receipt reports 16 failed items and 11 capped `model_latency_error` item errors.
3. **Reprocess timeout left stale search state** — Proven in code and DB. `reprocessLibraryUnlocked` has a 10-minute timeout, marks FTS stale at start, and clears the marker only after a successful rebuild. The receipt shows `status=failed`, `items_indexed=0`, `fts_rebuilt=false`, and the DB still has `search_fts_stale_since=2026-05-19T17:43:48Z`.
4. **Source RSS fetch itself is not the immediate issue** — Proven in DB. The only source has `last_fetch_status=ok` and no `last_fetch_error`.

## Code/Schema Evidence

- `items` fields inspected: `id`, `source_id`, `source_url`, `url`, `title`, `feed_excerpt`, `extracted_text`, `summary`, `core_insight`, `value_tier`, `published_at`, `first_seen_at`, `extraction_status`, `model_status`.
- `sources` fields inspected: `id`, `url`, `title`, `last_fetch_at`, `last_fetch_status`, `last_fetch_error`, `is_active`, `revision`.
- `runtime_metadata` keys inspected: `processing_language`, `search_fts_stale_since`, `owner_token_sha256`.
- `agent_receipts` inspected for `set_processing_language` and `reprocess_library` operation snapshots.
- `internal/resofeed/ingest.go`: status constants, feed fetch/update paths, `buildItem`, `extractArticleText`, and item insert paths.
- `internal/resofeed/openrouter.go`: OpenRouter JSON generation, retry/error mapping, model status validation, and API key requirement.
- `internal/resofeed/reprocess.go`: 10-minute reprocess timeout, stale FTS marker behavior, item outcome handling, and capped error receipt behavior.

## Read-Only Queries Run

- `.tables`, `.schema items`, `.schema sources`, `.schema item_state`, `.schema agent_receipts`.
- Grouped counts by `items.extraction_status`/`items.model_status` and `sources.last_fetch_status`.
- Python read-only SQLite scans with UTF-8 replacement for invalid text payloads to detect Han characters and aggregate Chinese-related status counts.
- Runtime metadata and agent receipt queries for processing language and reprocess history.
- Local log grep for processing/model/reprocess terms.

## Recommended Next Actions

1. Re-run Chinese library reprocess only when a valid LLM/API configuration is present and expect it may need more than 10 minutes for this library size, or process smaller batches if the product supports it.
2. After a successful reprocess, verify `runtime_metadata.search_fts_stale_since` is cleared and `reprocess_library` receipt has `fts_rebuilt=true`.
3. Treat the 137 `partial_extraction` rows as degraded but not total failures: they already have Chinese summaries from feed excerpts. If full article fidelity is required, inspect article URLs for paywalls, JavaScript-only pages, unsupported content types, PDFs/binary payloads, or anti-bot responses.
4. For `model_latency_error` rows, retry summarization/reprocess with valid API credentials and monitor provider/HTTP errors; the current schema does not persist raw per-item API error details beyond receipt summaries.
