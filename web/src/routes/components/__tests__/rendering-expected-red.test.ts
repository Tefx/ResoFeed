import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Feed from '../Feed.svelte';
import FirstUseEmptyState from '../FirstUseEmptyState.svelte';
import Inspector from '../Inspector.svelte';
import OwnerTokenPrompt from '../OwnerTokenPrompt.svelte';
import SearchRetrieval from '../SearchRetrieval.svelte';
import SourceLedger from '../SourceLedger.svelte';
import StatePortability from '../StatePortability.svelte';
import Page from '../../+page.svelte';
import {
  expectedRedItem,
  expectedRedResonatedItem,
  expectedRedSource
} from '../../../test/contract-fixtures';
import type { ItemDetail } from '$lib/api-contract';

const expectedRedDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'Raw feed excerpt for detail route.',
  extracted_text: 'Full extracted text shown only in Inspector.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: expectedRedItem.url,
    original_url: expectedRedItem.url,
    story_key: expectedRedItem.story_key,
    duplicate_of_item_id: null
  }
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'text/plain', ...init.headers }
  });
}

describe('expected-red rendering contracts from docs/DESIGN.md', () => {
  it('renders the owner-token prompt as the local access gate without pre-acceptance persistence', async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    render(OwnerTokenPrompt, { props: { state: 'empty', onAccepted } });

    expect(screen.getByText('RESOFEED')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();

    const tokenInput = screen.getByLabelText('Owner token');
    expect(tokenInput).toHaveAttribute('type', 'password');
    expect(tokenInput).toHaveFocus();

    await user.type(tokenInput, 'rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(window.localStorage.getItem('resofeed.ownerToken')).toBeNull();
    expect(onAccepted).toHaveBeenCalledWith('rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG');
  });

  it('persists owner token only after authenticated bootstrap succeeds and never after rejection', async () => {
    const user = userEvent.setup();
    const rejectedFetch = vi.fn(async () =>
      jsonResponse({ error: { code: 'unauthorized', message: 'owner token required', details: {} } }, { status: 401 })
    );
    vi.stubGlobal('fetch', rejectedFetch);

    render(Page);
    await user.type(screen.getByLabelText('Owner token'), 'rfeed_rejected0123456789abcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected'));
    expect(window.localStorage.getItem('resofeed.ownerToken')).toBeNull();
    cleanup();

    const acceptedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [] });
      if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [] });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    });
    vi.stubGlobal('fetch', acceptedFetch);

    render(Page);
    await user.type(screen.getByLabelText('Owner token'), 'rfeed_accepted0123456789abcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(screen.getByLabelText('Steer or paste RSS URL')).toBeVisible());
    expect(window.localStorage.getItem('resofeed.ownerToken')).toBe('rfeed_accepted0123456789abcdefghijklmnopqrstuvwxyz');
  });

  it('renders owner-token rejection as an assertive accessible error', () => {
    render(OwnerTokenPrompt, { props: { state: 'rejected' } });

    expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected');
    expect(screen.getByLabelText('Owner token')).toHaveFocus();
  });

  it('renders the first-use empty state with the required static loop copy', () => {
    render(FirstUseEmptyState, { props: { state: 'no-sources' } });

    const region = screen.getByRole('region', { name: 'First use' });
    expect(within(region).getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();
    expect(within(region).getByText('Inspect opens the item.')).toBeVisible();
    expect(within(region).getByText('Star preserves durable value.')).toBeVisible();
    expect(within(region).getByText('Steer is optional correction.')).toBeVisible();
    expect(within(region).queryByText(/Contract:/)).not.toBeInTheDocument();
    expect(within(region).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders feed rows with visible provenance and exposes missing keyboard inspect plus star toggle behavior', async () => {
    const user = userEvent.setup();
    const onResonanceToggle = vi.fn(async () => {});
    const onSelect = vi.fn(async () => {});
    render(Feed, {
      props: {
        items: [expectedRedItem, expectedRedResonatedItem],
        selectedItemId: expectedRedItem.id,
        onSelect,
        onResonanceToggle
      }
    });

    const feed = screen.getByRole('list', { name: 'Today feed items' });
    expect(within(feed).getByText('SQLite FTS changes ranking contract')).toBeVisible();
    expect(within(feed).getAllByLabelText('Source: Example Source')[0]).toBeVisible();
    expect(within(feed).getAllByLabelText('Extraction: partial_extraction')[0]).toBeVisible();
    expect(within(feed).getByLabelText('Externally surfaced by agent')).toBeVisible();

    const openButton = screen.getByRole('button', {
      name: 'Open Inspector for: SQLite FTS changes ranking contract'
    });
    openButton.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expectedRedItem);

    const star = screen.getByRole('button', { name: 'Resonate item' });
    await user.click(star);
    expect(onResonanceToggle).toHaveBeenCalledWith(expectedRedItem, true);
    expect(screen.queryByRole('region', { name: 'Opened Inspector focus target' })).not.toBeInTheDocument();
  });

  it('renders the inspector and exposes missing detail-focus/provenance completion', async () => {
    render(Inspector, { props: { item: expectedRedItem, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: 'SQLite FTS changes ranking contract' });
    expect(within(inspector).getByText('INSPECTOR')).toBeVisible();
    expect(within(inspector).getByRole('link', { name: 'original link' })).toHaveAttribute(
      'href',
      expectedRedItem.url
    );
    expect(within(inspector).getByText('partial')).toBeVisible();
    expect(within(inspector).getByText('why: fresh from configured source')).toBeVisible();
    expect(within(inspector).queryByRole('button', { name: 'Resonate item' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(inspector).getByRole('heading', { name: expectedRedItem.title })).toHaveFocus());
  });

  it('wires Steer to /api/steer and /doctor to raw text diagnostics', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      if (url.endsWith('/api/steer')) return jsonResponse({ receipt: { interpreted_as: 'add_source', message: 'source added', changed_rules: [] } });
      if (url.endsWith('/api/doctor')) return textResponse('rss: ok\ngemini: ok\ningest: last_run=2026-05-09T00:00:00Z');
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    const steer = await screen.findByLabelText('Steer or paste RSS URL');
    await user.type(steer, 'https://example.com/feed.xml');
    await user.click(screen.getByRole('button', { name: 'apply' }));
    await waitFor(() => expect(screen.getByText('applied: source added')).toBeVisible());

    const steerCall = calls.find((call) => call.url.endsWith('/api/steer'));
    expect(steerCall?.init?.method).toBe('POST');
    expect(JSON.parse(String(steerCall?.init?.body))).toMatchObject({ command: 'https://example.com/feed.xml', actor_kind: 'human' });

    await user.clear(steer);
    await user.type(steer, '/doctor');
    await user.click(screen.getByRole('button', { name: 'apply' }));
    await waitFor(() => expect(screen.getByRole('log', { name: '/doctor diagnostics' })).toHaveTextContent('rss: ok'));
    expect(screen.getByRole('log', { name: '/doctor diagnostics' }).tagName).toBe('PRE');
  });

  it('renders only allowed top-level surfaces and demotes search/state from product navigation', async () => {
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    await screen.findByRole('navigation', { name: 'Surfaces' });
    const nav = screen.getByRole('navigation', { name: 'Surfaces' });
    expect(within(nav).getByRole('button', { name: 'TODAY' })).toBeVisible();
    expect(within(nav).getByRole('button', { name: 'SOURCE LEDGER' })).toBeVisible();
    expect(within(nav).queryByRole('button', { name: 'SEARCH' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'STATE' })).not.toBeInTheDocument();
  });

  it('surfaces active MCP agent steering attribution as an inline correction receipt', async () => {
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [{ id: 'rule_agent', rule_text: 'Push more sqlite research.', is_active: true, superseded_by: null, revision: 1, created_by_actor_kind: 'agent', created_by_actor_id: 'briefing-agent' }] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    const receipt = await screen.findByRole('region', { name: 'Agent steering receipt' });
    expect(receipt).toHaveTextContent('agent:briefing-agent steering active: Push more sqlite research. · correct in Steer');
  });

  it('uses mobile feed-first full-screen surfaces instead of one stacked page', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      if (url.endsWith(`/api/items/${expectedRedItem.id}/inspect`)) return jsonResponse({ item_id: expectedRedItem.id, human_inspected_at: '2026-05-09T00:00:00Z', already_applied: false });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    await screen.findByRole('list', { name: 'Today feed items' });
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${expectedRedItem.title}` }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'back to TODAY' })[0]).toBeVisible());
    expect(screen.getByRole('complementary', { name: expectedRedItem.title })).toHaveTextContent('Full extracted text shown only in Inspector.');
    expect(screen.getAllByRole('button', { name: 'Resonate item' }).length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: 'SOURCE LEDGER' }));
    expect(screen.getByRole('region', { name: 'SOURCE LEDGER surface' })).toHaveClass('active-panel');
  });

  it('renders the flat Source Ledger and exposes missing destructive confirmation behavior', async () => {
    const user = userEvent.setup();
    render(SourceLedger, { props: { sources: [expectedRedSource], onDeleteSource: async () => {}, onImportOpml: async () => {} } });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByText('import OPML')).toBeVisible();
    expect(within(ledger).getByText('example.com/feed.xml')).toBeVisible();
    expect(within(ledger).getByText('imported 3 sources; folders flattened')).toBeVisible();

    await user.click(within(ledger).getByRole('button', { name: 'Delete source: Example Source' }));
    expect(within(ledger).getByRole('button', { name: 'confirm delete source: Example Source' })).toBeVisible();
  });

  it('renders state portability warning and exposes missing import/export live feedback', async () => {
    const user = userEvent.setup();
    render(StatePortability, { props: { onExportState: async () => ({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] }), onImportState: async () => {} } });

    const portability = screen.getByRole('region', { name: 'State Portability' });
    expect(
      within(portability).getByText('import replaces active sources, rules, and stars')
    ).toBeVisible();

    await user.click(within(portability).getByRole('button', { name: 'import state' }));
    expect(within(portability).getByLabelText('Choose state JSON')).toBeVisible();

    await user.click(within(portability).getByRole('button', { name: 'export state' }));
    expect(within(portability).getByRole('status')).toHaveTextContent('exported state.json');
  });

  it('renders search/retrieval and exposes missing filters plus provenance-rich result anatomy', () => {
    render(SearchRetrieval, { props: { items: [expectedRedItem], query: 'sqlite', onSearch: async () => ({ items: [expectedRedItem], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } }) } });

    const search = screen.getByRole('region', { name: 'Search and Retrieval' });
    expect(within(search).getByLabelText('Plain text query')).toHaveValue('sqlite');
    expect(within(search).getByLabelText('Source filter')).toBeVisible();
    expect(within(search).getByLabelText('From date')).toBeVisible();
    expect(within(search).getByLabelText('Resonated only')).toBeVisible();
    expect(within(search).getByLabelText('Result limit')).toHaveValue('50');
    expect(within(search).getByRole('status')).toHaveTextContent('1 results');
    expect(within(search).getByText('match: lexical index')).toBeVisible();
    expect(within(search).getByText('src: Example Source')).toBeVisible();
  });
});
