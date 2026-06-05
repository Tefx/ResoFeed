import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
import {
  type CurrentOperationInfo,
  type CurrentOperationResponse,
  itemDisplayExcerpt,
  itemDisplayTimestamp,
  type ErrorBody,
  type FeedTodayResponse,
  type IngestRunResult,
  type SearchResponse,
  type SourcesResponse,
  type StateBundleV1,
  type OperationKind
} from '$lib/api-contract';
import Feed from '../routes/components/Feed.svelte';
import SearchRetrieval from '../routes/components/SearchRetrieval.svelte';
import SourceLedger from '../routes/components/SourceLedger.svelte';
import StatePortability from '../routes/components/StatePortability.svelte';
import { expectedRedFallbackItem, expectedRedItem, expectedRedSource } from '../test/contract-fixtures';

const feedFixture: FeedTodayResponse = { items: [expectedRedItem, expectedRedFallbackItem] };
const sourcesFixture: SourcesResponse = { sources: [expectedRedSource] };
const searchFixture: SearchResponse = {
  items: [expectedRedItem, expectedRedFallbackItem],
  query: {
    q: 'sqlite',
    source: 'Example Source',
    from: '2026-01-01',
    to: '2026-12-31',
    resonated: false,
    limit: 50
  }
};
const stateFixture: StateBundleV1 = {
  schema_version: 'resofeed.state.v1',
  exported_at: '2026-05-09T00:00:00Z',
  sources: [{ id: expectedRedSource.id, url: expectedRedSource.url, title: expectedRedSource.title }],
  steer_rules: [{ id: 'rule_01', rule_text: 'Push more technical documents.' }],
  resonated_items: [
    {
      item_id: expectedRedItem.id,
      url: expectedRedItem.url,
      source_url: expectedRedSource.url,
      title: expectedRedItem.title
    }
  ]
};

function jsonResponse(
  body: FeedTodayResponse | SourcesResponse | SearchResponse | StateBundleV1 | CurrentOperationResponse | ErrorBody | { ingest: IngestRunResult },
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

describe('ResoFeed API client and rendered sinks', () => {
  it('sends the owner-token header and renders source/feed fixtures into visible DOM', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer owner-token-123456789012345678901234' });
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse(sourcesFixture);
      if (url.includes('/api/feed/today')) return jsonResponse(feedFixture);
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, 404);
    });

    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });
    const [sources, feed] = await Promise.all([client.sources(), client.today()]);
    const fallbackItem = feed.items.find((item) => item.id === expectedRedFallbackItem.id);

    expect(fallbackItem?.published_at).toBeNull();
    expect(fallbackItem?.first_seen_at).toBe('2026-05-09T02:00:00Z');
    expect(itemDisplayTimestamp(expectedRedFallbackItem)).toBe('2026-05-09T02:00:00Z');
    expect(fallbackItem?.summary).toBeNull();
    expect(fallbackItem?.core_insight).toBeNull();
    expect(itemDisplayExcerpt(expectedRedFallbackItem)).toBe('Source-backed feed excerpt for list/search fallback.');

    render(SourceLedger, { props: { sources: sources.sources, onDeleteSource: async () => {}, onImportOpml: async () => {}, onExportState: async () => ({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] }), onImportState: async () => {} } });
    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(ledger).toHaveTextContent('Example Source');
    expect(ledger).not.toHaveTextContent('src: Example Source');
    expect(ledger).toHaveTextContent('https://example.com/feed.xml');
    expect(ledger).toHaveTextContent(/\d{2}:\d{2}:\d{2} local/);

    render(Feed, { props: { items: feed.items, selectedItemId: feed.items[0]?.id, onSelect: async () => {}, onResonanceToggle: async () => {} } });
    const list = screen.getByRole('list', { name: 'Today feed items' });
    expect(within(list).getByText(expectedRedItem.title)).toBeVisible();
    expect(within(list).getAllByLabelText('Extraction: partial_extraction')[0]).toHaveTextContent('source excerpt');
  });

  it('renders search and state portability fixtures from API client responses', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer owner-token-123456789012345678901234' });
      const url = String(input);
      if (url.includes('/api/search')) return jsonResponse(searchFixture);
      if (url.endsWith('/api/state/export')) return jsonResponse(stateFixture);
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, 404);
    });

    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });
    const [search, state] = await Promise.all([
      client.search({ q: 'sqlite', source: 'Example Source', from: '2026-01-01', to: '2026-12-31', resonated: false }),
      client.exportState()
    ]);
    const searchFallbackItem = search.items.find((item) => item.id === expectedRedFallbackItem.id);

    expect(state.schema_version).toBe('resofeed.state.v1');
    expect(searchFallbackItem?.published_at).toBeNull();
    expect(searchFallbackItem?.first_seen_at).toBe('2026-05-09T02:00:00Z');
    expect(searchFallbackItem?.summary).toBeNull();
    expect(searchFallbackItem?.core_insight).toBeNull();
    expect(itemDisplayTimestamp(expectedRedFallbackItem)).toBe('2026-05-09T02:00:00Z');
    expect(itemDisplayExcerpt(expectedRedFallbackItem)).toBe('Source-backed feed excerpt for list/search fallback.');

    render(SearchRetrieval, { props: { items: search.items, query: search.query.q, onSearch: async () => search } });
    const searchRegion = screen.getByRole('region', { name: 'Search and Retrieval' });
    expect(within(searchRegion).getAllByText('match: lexical index')[0]).toBeVisible();
    expect(within(searchRegion).getAllByText('Example Source')[0]).toBeVisible();
    expect(within(searchRegion).queryByText('src: Example Source')).not.toBeInTheDocument();

    render(StatePortability, { props: { onExportState: async () => state, onImportState: async () => {} } });
    expect(screen.getByRole('group', { name: 'State portability' })).toHaveTextContent(
      'Import State replaces active sources, rules, and stars.'
    );
  });

  it('requests feed windows with limit and offset for lightweight browsing', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer owner-token-123456789012345678901234' });
      expect(String(input)).toBe('/api/feed/today?limit=50&offset=50');
      return jsonResponse(feedFixture);
    });

    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });
    await client.today({ limit: 50, offset: 50 });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('downloads OPML source-list text from the canonical frontend endpoint', async () => {
    const opml = '<?xml version="1.0"?><opml version="2.0"></opml>';
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer owner-token-123456789012345678901234' });
      expect(String(input)).toBe('/api/sources/export-opml');
      return new Response(opml, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
    });
    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });

    await expect(client.exportOpml()).resolves.toBe(opml);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throws canonical API errors without replacing backend code/message/details', async () => {
    const badRequest: ErrorBody = {
      error: { code: 'bad_request', message: 'invalid query parameter', details: { field: 'q' } }
    };
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(badRequest, 400));
    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });

    await expect(client.search({ q: 'x'.repeat(501) })).rejects.toMatchObject({
      status: 400,
      body: badRequest
    } satisfies Partial<ResoFeedApiError>);
  });

  it('expected-red: falls back to the OpenRouter compatibility route instead of a false unavailable model list', async () => {
    const modelList = {
      models: [
        { id: 'openrouter/model-alpha', name: 'Model Alpha' },
        { id: 'openrouter/model-beta', name: 'Model Beta' }
      ]
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer owner-token-123456789012345678901234' });
      const url = String(input);
      if (url.endsWith('/api/runtime/openrouter-models')) {
        return jsonResponse({ error: { code: 'not_found', message: 'not found: canonical route drift', details: {} } }, 404);
      }
      if (url.endsWith('/api/runtime/openrouter/models')) {
        return new Response(JSON.stringify(modelList), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, 404);
    });
    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });

    await expect(client.openRouterModels()).resolves.toEqual(modelList);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/runtime/openrouter-models', {
      headers: { Authorization: 'Bearer owner-token-123456789012345678901234' }
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/runtime/openrouter/models', {
      headers: { Authorization: 'Bearer owner-token-123456789012345678901234' }
    });
  });

  it('accepts the canonical current-operation runtime contract and clears idle display state', async () => {
    const canonicalKind: OperationKind = 'library_reprocess';
    const running: CurrentOperationResponse = {
      operation: {
        running: true,
        kind: canonicalKind,
        actor_kind: 'human',
        phase: 'processing_items',
        count: { current: 2, total: 5 },
        message: 'library reprocess processing item',
        started_at: '2026-05-17T11:00:00Z',
        updated_at: '2026-05-17T11:00:05Z'
      }
    };
    const idle: CurrentOperationResponse = {
      operation: {
        running: false,
        kind: null,
        actor_kind: null,
        phase: null,
        count: null,
        message: null,
        started_at: null,
        updated_at: null
      }
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(running))
      .mockResolvedValueOnce(jsonResponse(idle));
    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });

    await expect(client.currentOperation()).resolves.toEqual(running);
    await expect(client.currentOperation()).resolves.toEqual(idle);
    expect(fetcher).toHaveBeenCalledWith('/api/runtime/operation', {
      headers: { Authorization: 'Bearer owner-token-123456789012345678901234' }
    });
  });

  it('preserves backend ingest error reason while normalizing manual ingest envelopes', async () => {
    const ingest: IngestRunResult = {
      scope: 'all',
      source_id: null,
      status: 'completed_with_errors',
      started_at: '2026-06-05T14:07:00Z',
      completed_at: '2026-06-05T14:07:08Z',
      sources_attempted: 0,
      sources_succeeded: 0,
      sources_failed: 0,
      sources_skipped: 1,
      items_upserted: 0,
      errors: [
        {
          source_id: 'src_busy',
          code: 'source_busy',
          reason: 'source_busy',
          message: 'source already fetching'
        }
      ]
    };
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ ingest }));
    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });

    const result = await client.runIngest();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.errors[0]).toMatchObject({ code: 'source_busy', reason: 'source_busy' });
      expect(result.body.sources_skipped).toBe(1);
    }
  });

  it('preserves canonical current_operation details on operation conflict responses', async () => {
    const currentOperation: CurrentOperationInfo = {
      running: true,
      kind: 'manual_ingest',
      actor_kind: 'agent',
      phase: 'fetching_sources',
      count: { current: 1, total: 3 },
      message: 'ingest fetching source',
      started_at: '2026-05-17T14:00:00Z',
      updated_at: '2026-05-17T14:00:05Z'
    };
    const conflict: ErrorBody = {
      error: {
        code: 'conflict',
        message: 'operation already running',
        details: {
          retry_allowed: true,
          current_operation: currentOperation
        }
      }
    };
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(conflict, 409));
    const client = new ResoFeedApiClient({ ownerToken: 'owner-token-123456789012345678901234', fetcher });

    const result = await client.runIngest();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.body.error.details.current_operation).toEqual(currentOperation);
      expect(result.body.error.details.current_operation).not.toMatchObject({ kind: 'ingest', scope: 'all' });
    }
  });
});
