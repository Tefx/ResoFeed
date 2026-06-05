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
        operation: 'ingest',
        source_id: null,
        completed: true,
        sources_total: 1,
        sources_fetched: 0,
        items_discovered: 0,
        items_upserted: 0,
        errors: [{ source_id: 'src_error', code: 'rss_fetch_error', reason: 'rss_fetch_error', message: 'err: fetch failed' }]
      }
    };
    const sourceSuccess: ManualRssFetchApiResult<FetchSourceSuccessResponse> = {
      ok: true,
      status: 200,
      body: {
        operation: 'source_fetch',
        source_id: 'src_ok',
        completed: true,
        sources_total: 1,
        sources_fetched: 1,
        items_discovered: 1,
        items_upserted: 1,
        errors: []
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

    expect(ingestWithSourceError.body.errors[0]?.code).toBe('rss_fetch_error');
    expect(ingestWithSourceError.body.errors[0]?.reason).toBe('rss_fetch_error');
    expect(sourceSuccess.body.operation).toBe('source_fetch');
    expect(conflict.body.error.code).toBe('conflict');
    expect(notFound.body.error.code).toBe('not_found');
  });

  it('pins Source Ledger product-boundary labels, diagnostics, timestamp, a11y, and forbidden visual patterns', () => {
    expect(sourceLedgerManualFetchRenderContract.globalIdleLabel).toBeNull();
    expect(sourceLedgerManualFetchRenderContract.globalActiveLabel).toBeNull();
    expect(sourceLedgerManualFetchRenderContract.sourceIdleLabel).toBeNull();
    expect(sourceLedgerManualFetchRenderContract.sourceActiveLabel).toBeNull();
    expect(sourceLedgerManualFetchRenderContract.activeControlDisabled).toBe(false);
    expect(sourceLedgerManualFetchRenderContract.timestampFormat).toBe('HH:MM:SS');
    expect(sourceLedgerManualFetchRenderContract.timestampInputs).toEqual(['last_fetch']);
    expect(sourceLedgerManualFetchRenderContract.diagnosticDisclosure).toBe('[DETAILS]');
    expect(sourceLedgerManualFetchRenderContract.bracketActionStyle).toBe(
      'bracket-padding-uppercase-terminal-hover-inversion-focus-visible'
    );
    expect(sourceLedgerManualFetchRenderContract.accessibility).toEqual(
      expect.arrayContaining(['native-details-summary', 'named-delete-control', 'visible-diagnostic-disclosure', 'visible-keyboard-focus'])
    );
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
