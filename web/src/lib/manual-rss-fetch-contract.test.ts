import { describe, expect, it } from 'vitest';

import {
  manualRssFetchEndpoints,
  sourceLedgerManualFetchRenderContract,
  type EmptyJsonObject,
  type FetchSourceSuccessResponse,
  type ManualRssFetchApiResult,
  type ManualRssFetchRequestContract,
  type RunIngestSuccessResponse
} from './api-contract';

describe('manual RSS fetch acceptance contract lock', () => {
  it('pins wire paths, POST method, empty JSON body, and no query params', () => {
    const requestContract: ManualRssFetchRequestContract = {
      method: 'POST',
      queryParams: false,
      body: {} satisfies EmptyJsonObject
    };

    expect(manualRssFetchEndpoints.runIngest).toBe('/api/ingest');
    expect(manualRssFetchEndpoints.fetchSource).toBe('/api/sources/{id}/fetch');
    expect(requestContract).toEqual({ method: 'POST', queryParams: false, body: {} });
  });

  it('pins success, source-level error, conflict, and not_found result shapes without client queues', () => {
    const ingestWithSourceError: ManualRssFetchApiResult<RunIngestSuccessResponse> = {
      ok: true,
      status: 200,
      body: {
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
      }
    };
    const sourceSuccess: ManualRssFetchApiResult<FetchSourceSuccessResponse> = {
      ok: true,
      status: 200,
      body: {
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
      }
    };
    const conflict: ManualRssFetchApiResult<RunIngestSuccessResponse> = {
      ok: false,
      status: 409,
      body: { error: { code: 'conflict', message: 'ingest already running', details: {} } }
    };
    const notFound: ManualRssFetchApiResult<FetchSourceSuccessResponse> = {
      ok: false,
      status: 404,
      body: { error: { code: 'not_found', message: 'source not found', details: { id: 'src_missing' } } }
    };

    expect(ingestWithSourceError.body.ingest.status).toBe('source_errors');
    expect(sourceSuccess.body.fetch.status).toBe('ok');
    expect(conflict.body.error.code).toBe('conflict');
    expect(notFound.body.error.code).toBe('not_found');
  });

  it('pins Source Ledger labels, state text, timestamp, a11y, and forbidden visual patterns', () => {
    expect(sourceLedgerManualFetchRenderContract.globalIdleLabel).toBe('[RUN INGEST]');
    expect(sourceLedgerManualFetchRenderContract.globalActiveLabel).toBe('[INGESTING...]');
    expect(sourceLedgerManualFetchRenderContract.sourceIdleLabel).toBe('[FETCH]');
    expect(sourceLedgerManualFetchRenderContract.sourceActiveLabel).toBe('[FETCHING...]');
    expect(sourceLedgerManualFetchRenderContract.activeControlDisabled).toBe(true);
    expect(sourceLedgerManualFetchRenderContract.timestampFormat).toBe('HH:MM:SS');
    expect(sourceLedgerManualFetchRenderContract.timestampInputs).toEqual(['last_ingest', 'last_fetch']);
    expect(sourceLedgerManualFetchRenderContract.errorCopy).toBe('terse-truncated-non-layout-shifting');
    expect(sourceLedgerManualFetchRenderContract.bracketActionStyle).toBe(
      'bracket-padding-uppercase-terminal-hover-inversion-focus-visible'
    );
    expect(sourceLedgerManualFetchRenderContract.accessibility).toContain('visible-keyboard-focus');
    expect(sourceLedgerManualFetchRenderContract.forbiddenPatterns).toEqual(
      expect.arrayContaining([
        'spinner',
        'progress-animation',
        'box-shadow',
        'rounded-saas-button',
        'friendly-copy',
        'folder-affordance',
        'tag-affordance',
        'unread-count',
        'archive-affordance',
        'settings-slider',
        'drag-and-drop-ordering',
        'local-fake-job',
        'client-queue',
        'client-receipt',
        'optimistic-durable-state'
      ])
    );
  });
});
