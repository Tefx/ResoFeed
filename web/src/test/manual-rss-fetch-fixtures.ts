import type {
  FetchSourceSuccessResponse,
  ManualRssFetchErrorBody,
  RunIngestSuccessResponse
} from '$lib/api-contract';

/**
 * Spec-derived minimal fixtures.
 *
 * Source: internal/resofeed/manual_fetch_contract.go ManualFetchResult. These
 * intentionally include only documented flat backend fields: no nested ingest,
 * source, or fetch envelopes; no local job ids; no client queue state; no
 * durable/manual receipt payloads.
 */
export const documentedRunIngestOk: RunIngestSuccessResponse = {
  operation: 'ingest',
  source_id: null,
  completed: true,
  sources_total: 1,
  sources_fetched: 1,
  items_discovered: 1,
  items_upserted: 1,
  errors: []
};

export const documentedRunIngestSourceError: RunIngestSuccessResponse = {
  operation: 'ingest',
  source_id: null,
  completed: true,
  sources_total: 1,
  sources_fetched: 0,
  items_discovered: 0,
  items_upserted: 0,
  errors: [{ source_id: 'src_error', code: 'rss_fetch_error', reason: 'rss_fetch_error', message: 'err: fetch failed' }]
};

export const documentedFetchSourceOk: FetchSourceSuccessResponse = {
  operation: 'source_fetch',
  source_id: 'src_ok',
  completed: true,
  sources_total: 1,
  sources_fetched: 1,
  items_discovered: 1,
  items_upserted: 1,
  errors: []
};

export const documentedConflictError: ManualRssFetchErrorBody = {
  error: { code: 'conflict', message: 'ingest already running', details: {} }
};

export const documentedNotFoundError: ManualRssFetchErrorBody = {
  error: { code: 'not_found', message: 'source not found', details: { id: 'src_missing' } }
};
