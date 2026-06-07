import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
import Page from '../../+page.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';

const ownerToken = 'rfeed_operation_utility_surface_0000000000000000000';
const appCss = readFileSync('src/app.css', 'utf8');

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function runningOperation(current = 2, total = 5) {
  return {
    running: true,
    kind: 'library_reprocess',
    actor_kind: 'human',
    phase: 'processing_items',
    count: { current, total },
    message: 'library reprocess processing item',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:05Z'
  };
}

function runningManualIngestOperation() {
  return {
    running: true,
    kind: 'manual_ingest',
    actor_kind: 'human',
    phase: 'fetching_sources',
    count: { current: 1, total: 3 },
    message: 'ingest fetching source',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:05Z'
  };
}

function feedItems(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    ...expectedRedItem,
    id: `item_feed_${offset + index + 1}`,
    title: `Feed row ${offset + index + 1}`,
    published_at: `2026-05-17T10:${String((offset + index) % 60).padStart(2, '0')}:00Z`
  }));
}

function installFetch(options: { readonly holdIngest?: Promise<void>; readonly ingestConflict?: boolean; readonly operation?: unknown | (() => unknown); readonly pagedFeed?: boolean } = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
    if (url.includes('/api/feed/today')) {
      if (!options.pagedFeed) return jsonResponse({ items: [expectedRedItem] });
      const parsed = new URL(url, 'http://resofeed.test');
      const offset = Number(parsed.searchParams.get('offset') ?? '0');
      const count = offset === 0 ? 50 : 10;
      return jsonResponse({ items: feedItems(count, offset) });
    }
    if (url.endsWith('/api/runtime/language') && method === 'GET') return jsonResponse({ language: { code: 'en', label: 'English' } });
    if (url.endsWith('/api/runtime/operation') && method === 'GET') {
      const operation = typeof options.operation === 'function' ? options.operation() : options.operation;
      return jsonResponse({ operation: operation ?? { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    }
    if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
    if (url.endsWith('/api/ingest') && method === 'POST') {
      if (options.ingestConflict) {
        return jsonResponse({
          error: {
            code: 'conflict',
            message: 'operation already running',
            details: {
              operation_running: true,
              retry_allowed: true,
              current_operation: runningOperation()
            }
          }
        }, { status: 409 });
      }
      if (options.holdIngest) await options.holdIngest;
      return jsonResponse({ operation: 'ingest', source_id: null, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 1, items_upserted: 1, completed_at: '2026-05-17T11:01:00Z', errors: [] });
    }
    return jsonResponse({ error: { code: 'not_found', message: `not found: ${method} ${url}`, details: {} } }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function renderAuthenticatedPage(options: { readonly holdIngest?: Promise<void>; readonly ingestConflict?: boolean; readonly operation?: unknown | (() => unknown); readonly pagedFeed?: boolean } = {}) {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  installFetch(options);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible());
  return { user };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const menu = document.querySelector('details[aria-label="RESOFEED surface menu"]');
  expect(menu).toBeInstanceOf(HTMLDetailsElement);
  await user.click(within(menu as HTMLElement).getByText('RESOFEED'));
  expect(menu).toHaveAttribute('open', '');
  return within(menu as HTMLElement);
}

describe('current operation and low-frequency utility placement', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('accepts documented count objects and rejects invalid count shapes', async () => {
    installFetch({ operation: runningOperation() });
    await expect(new ResoFeedApiClient({ ownerToken }).currentOperation()).resolves.toMatchObject({
      operation: { count: { current: 2, total: 5 } }
    });

    installFetch({ operation: { ...runningOperation(), count: 2 } });
    await expect(new ResoFeedApiClient({ ownerToken }).currentOperation()).rejects.toBeInstanceOf(ResoFeedApiError);

    installFetch({ operation: { ...runningOperation(), count: { current: '2', total: 5 } } });
    await expect(new ResoFeedApiClient({ ownerToken }).currentOperation()).rejects.toBeInstanceOf(ResoFeedApiError);
  });

  it('keeps LANG/reprocess and idle operation status out of persistent top chrome until the RESOFEED menu opens', async () => {
    const { user } = await renderAuthenticatedPage();
    const topChrome = document.querySelector('header.shell-command');
    expect(topChrome).toBeInstanceOf(HTMLElement);

    expect(within(topChrome as HTMLElement).queryByText('LANG: EN')).not.toBeVisible();
    expect(within(topChrome as HTMLElement).queryByText('[REPROCESS LIBRARY]')).not.toBeVisible();
    expect(within(topChrome as HTMLElement).queryByText(/current operation|idle|last_ingest: not_run/i)).not.toBeInTheDocument();

    const menu = await openMenu(user);
    expect(menu.getByRole('button', { name: /processing language.*English.*set.*Chinese/i })).toBeVisible();
    expect(menu.getByText('LANG: EN')).toBeVisible();
    expect(menu.getByRole('button', { name: /Reprocess existing library and rebuild search index/i })).toBeVisible();
    expect(menu.getByText('[REPROCESS LIBRARY]')).toBeVisible();
  });

  it('toggles the RESOFEED utility menu closed from the trigger and updates expanded state', async () => {
    const { user } = await renderAuthenticatedPage();
    const menu = document.querySelector('details[aria-label="RESOFEED surface menu"]');
    expect(menu).toBeInstanceOf(HTMLDetailsElement);
    const trigger = within(menu as HTMLElement).getByText('RESOFEED');

    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveClass('surface-nav-label');
    expect(appCss).toMatch(/details\s*>\s*summary,\s*\n\[role='button'\]:not\(\[aria-disabled='true'\]\)\s*\{\s*\n\s*cursor:\s*pointer;/);

    await user.click(trigger);
    expect(menu).toHaveAttribute('open', '');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders running and blocked operation context in Source Ledger/menu without top-chrome dashboard chrome', async () => {
    let releaseIngest!: () => void;
    const holdIngest = new Promise<void>((resolve) => { releaseIngest = resolve; });
    let operationActive = true;
    const { user } = await renderAuthenticatedPage({ holdIngest, operation: () => operationActive ? runningManualIngestOperation() : undefined });

    let menu = await openMenu(user);
    await user.click(menu.getByRole('button', { name: 'SOURCE LEDGER' }));
    expect(screen.getByRole('button', { name: '[INGESTING...]' })).toBeDisabled();
    expect(within(document.querySelector('header.shell-command') as HTMLElement).queryByText('[INGESTING...]')).not.toBeInTheDocument();
    menu = await openMenu(user);
    await waitFor(() => expect(menu.getByText(/\[INGESTING\.\.\.\].*op:\s*manual_ingest.*actor:human/i)).toBeVisible());
    operationActive = false;
    releaseIngest();
    cleanup();
    window.localStorage.clear();
    const blocked = await renderAuthenticatedPage({ ingestConflict: true });
    const blockedNavigation = await openMenu(blocked.user);
    await blocked.user.click(blockedNavigation.getByRole('button', { name: 'SOURCE LEDGER' }));
    await blocked.user.click(screen.getByRole('button', { name: '[RUN INGEST]' }));
    await waitFor(() => {
      expect(within(screen.getByTestId('source-ledger')).getByText(/err: operation already running.*op:\s*library_reprocess/i)).toBeVisible();
    });
    expect(within(document.querySelector('header.shell-command') as HTMLElement).queryByText('err: operation already running')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('source-ledger')).getAllByText(/err: operation already running/i)).toHaveLength(1);
    const blockedMenu = await openMenu(blocked.user);
    expect(blockedMenu.getByText(/err: operation already running.*op:\s*library_reprocess.*actor:human.*phase:\s*processing_items.*2\/5.*library reprocess processing item.*since\s*\d{2}:\d{2}:\d{2} local/i)).toBeVisible();
    expect(within(screen.getByTestId('source-ledger')).getByText(/err: operation already running.*op:\s*library_reprocess.*actor:human.*phase:\s*processing_items.*2\/5.*library reprocess processing item.*since\s*\d{2}:\d{2}:\d{2} local/i)).toBeVisible();
  });

  it('renders current operation phase, count, message, and timestamps when the menu or Source Ledger is contextual', async () => {
    const { user } = await renderAuthenticatedPage({ operation: runningOperation() });
    const menu = await openMenu(user);
    expect(menu.getByText(/\[REPROCESSING\.\.\.\].*op:\s*library_reprocess.*actor:human.*phase:\s*processing_items.*2\/5.*library reprocess processing item.*since\s*\d{2}:\d{2}:\d{2} local/i)).toBeVisible();

    await user.click(menu.getByRole('button', { name: 'SOURCE LEDGER' }));
    expect(within(screen.getByTestId('source-ledger')).getByText(/\[REPROCESSING\.\.\.\].*op:\s*library_reprocess.*actor:human.*phase:\s*processing_items.*2\/5.*library reprocess processing item.*since\s*\d{2}:\d{2}:\d{2} local/i)).toBeVisible();
  });

  it('refreshes current operation counts in-place while the RESOFEED menu remains open', async () => {
    let pollCount = 0;
    const { user } = await renderAuthenticatedPage({
      operation: () => runningOperation(++pollCount === 1 ? 20 : 21, 591)
    });
    const menu = await openMenu(user);

    expect(menu.getByText(/2[01]\/591/)).toBeVisible();
    await waitFor(() => expect(menu.getByText(/21\/591/)).toBeVisible(), { timeout: 1500 });
    expect(screen.getByLabelText('RESOFEED surface menu')).toHaveAttribute('open');
  });

  it('lets the feed surface request and append more than the first visible batch', async () => {
    const { user } = await renderAuthenticatedPage({ pagedFeed: true });
    const feedRegion = screen.getByRole('region', { name: /TODAY surface independent scroll/i });

    expect(within(feedRegion).getByText('Feed row 1')).toBeVisible();
    expect(within(feedRegion).getByText('Feed row 50')).toBeVisible();
    expect(within(feedRegion).queryByText('Feed row 60')).not.toBeInTheDocument();

    await user.click(within(feedRegion).getByRole('button', { name: 'Load more feed items' }));

    await waitFor(() => expect(within(feedRegion).getByText('Feed row 60')).toBeVisible());
    expect(fetch).toHaveBeenCalledWith('/api/feed/today?limit=50&offset=50', expect.any(Object));
  });
});
