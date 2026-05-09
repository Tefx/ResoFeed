import type {
  FetchSourceSuccessResponse,
  ManualRssFetchErrorBody,
  RunIngestSuccessResponse
} from '$lib/api-contract';

/**
 * Spec-derived minimal fixtures.
 *
 * Source: web/src/lib/api-contract.ts “Manual RSS Fetch frontend contract lock”
 * declarations for RunIngestSuccessResponse, FetchSourceSuccessResponse, and
 * ManualRssFetchErrorBody. These intentionally include only documented fields:
 * no convenience labels, derived booleans, local job ids, client queue state, or
 * UI-only timestamps.
 */
export const documentedRunIngestOk: RunIngestSuccessResponse = {
  ingest: {
    last_ingest_at: '2026-05-09T10:25:31Z',
    status: 'ok',
    sources: [
      {
        source_id: 'src_ok',
        last_fetch_at: '2026-05-09T10:25:31Z',
        status: 'ok',
        message: null
      }
    ]
  }
};

export const documentedRunIngestSourceError: RunIngestSuccessResponse = {
  ingest: {
    last_ingest_at: '2026-05-09T10:25:31Z',
    status: 'source_errors',
    sources: [
      {
        source_id: 'src_error',
        last_fetch_at: '2026-05-09T10:25:31Z',
        status: 'rss_fetch_error',
        message: 'err: fetch failed'
      }
    ]
  }
};

export const documentedFetchSourceOk: FetchSourceSuccessResponse = {
  source: {
    id: 'src_ok',
    url: 'https://example.com/feed.xml',
    title: 'Example',
    last_fetch_at: '2026-05-09T10:25:31Z',
    last_fetch_status: 'ok',
    is_active: true,
    revision: 2
  },
  fetch: {
    source_id: 'src_ok',
    last_fetch_at: '2026-05-09T10:25:31Z',
    status: 'ok',
    message: null
  }
};

export const documentedConflictError: ManualRssFetchErrorBody = {
  error: { code: 'conflict', message: 'ingest already running', details: {} }
};

export const documentedNotFoundError: ManualRssFetchErrorBody = {
  error: { code: 'not_found', message: 'source not found', details: { id: 'src_missing' } }
};
