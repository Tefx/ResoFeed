import { describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient } from '$lib/api-client';
import type {
  FetchSourceSuccessResponse,
  ManualRssFetchApiResult,
  RunIngestSuccessResponse
} from '$lib/api-contract';
import {
  documentedConflictError,
  documentedFetchSourceOk,
  documentedNotFoundError,
  documentedRunIngestOk,
  documentedRunIngestSourceError
} from '../test/manual-rss-fetch-fixtures';

interface ManualRssFetchClientMethods {
  runIngest: () => Promise<ManualRssFetchApiResult<RunIngestSuccessResponse>>;
  fetchSource: (sourceId: string) => Promise<ManualRssFetchApiResult<FetchSourceSuccessResponse>>;
}

type FetchCall = {
  readonly url: string;
  readonly init?: RequestInit;
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function manualClient(fetcher: typeof fetch): ResoFeedApiClient & ManualRssFetchClientMethods {
  return new ResoFeedApiClient({
    ownerToken: 'owner-token-123456789012345678901234',
    baseUrl: 'http://resofeed.local',
    fetcher
  }) as ResoFeedApiClient & ManualRssFetchClientMethods;
}

describe('expected-red Manual RSS Fetch API client behavior', () => {
  it('POSTs /api/ingest with an empty JSON object body and no query params', async () => {
    const calls: FetchCall[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(documentedRunIngestOk);
    });

    const result = await manualClient(fetcher).runIngest();

    expect(result).toEqual({ ok: true, status: 200, body: documentedRunIngestOk });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://resofeed.local/api/ingest');
    expect(new URL(calls[0]?.url ?? '').search).toBe('');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: 'Bearer owner-token-123456789012345678901234',
      'Content-Type': 'application/json'
    });
    expect(calls[0]?.init?.body).toBe('{}');
  });

  it('POSTs /api/sources/{id}/fetch with an encoded id, empty body, and no query params', async () => {
    const calls: FetchCall[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(documentedFetchSourceOk);
    });

    const result = await manualClient(fetcher).fetchSource('src/needs encoding');

    expect(result).toEqual({ ok: true, status: 200, body: documentedFetchSourceOk });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://resofeed.local/api/sources/src%2Fneeds%20encoding/fetch');
    expect(new URL(calls[0]?.url ?? '').search).toBe('');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toBe('{}');
  });

  it('returns documented 200 source-level error payload without treating it as a transport error', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(documentedRunIngestSourceError));

    await expect(manualClient(fetcher).runIngest()).resolves.toEqual({
      ok: true,
      status: 200,
      body: documentedRunIngestSourceError
    });
  });

  it('returns documented 409 conflict and 404 not_found envelopes for manual fetch routes', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/ingest')) return jsonResponse(documentedConflictError, 409);
      if (url.endsWith('/api/sources/src_missing/fetch')) return jsonResponse(documentedNotFoundError, 404);
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, 404);
    });

    await expect(manualClient(fetcher).runIngest()).resolves.toEqual({
      ok: false,
      status: 409,
      body: documentedConflictError
    });
    await expect(manualClient(fetcher).fetchSource('src_missing')).resolves.toEqual({
      ok: false,
      status: 404,
      body: documentedNotFoundError
    });
  });
});
