import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
import Page from '../../+page.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';

const ownerToken = 'rfeed_operation_utility_surface_0000000000000000000';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function runningOperation() {
  return {
    running: true,
    kind: 'reprocess',
    scope: 'library',
    phase: 'processing_items',
    count: { current: 2, total: 5 },
    message: 'library reprocess processing item',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:05Z'
  };
}

function installFetch(options: { readonly holdIngest?: Promise<void>; readonly ingestConflict?: boolean; readonly operation?: unknown } = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
    if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
    if (url.endsWith('/api/runtime/language') && method === 'GET') return jsonResponse({ language: { code: 'en', label: 'English' } });
    if (url.endsWith('/api/runtime/operation') && method === 'GET') {
      return jsonResponse({ operation: options.operation ?? { running: false, kind: null, scope: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
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
              operation: 'reprocess',
              scope: 'library',
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

async function renderAuthenticatedPage(options: { readonly holdIngest?: Promise<void>; readonly ingestConflict?: boolean; readonly operation?: unknown } = {}) {
  cleanup();
  window.localStorage.clear();
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

  it('renders running and blocked operation context in Source Ledger/menu without top-chrome dashboard chrome', async () => {
    let releaseIngest!: () => void;
    const holdIngest = new Promise<void>((resolve) => { releaseIngest = resolve; });
    const { user } = await renderAuthenticatedPage({ holdIngest });

    let menu = await openMenu(user);
    await user.click(menu.getByRole('button', { name: 'SOURCE LEDGER' }));
    await user.click(screen.getByRole('button', { name: '[RUN INGEST]' }));
    expect(screen.getByRole('button', { name: '[INGESTING...]' })).toBeVisible();
    expect(within(document.querySelector('header.shell-command') as HTMLElement).queryByText('[INGESTING...]')).not.toBeInTheDocument();
    menu = await openMenu(user);
    expect(menu.getByText(/\[INGESTING\.\.\.\]|current operation:\s*ingest/i)).toBeVisible();
    releaseIngest();

    await waitFor(() => expect(screen.getByRole('button', { name: '[RUN INGEST]' })).toBeVisible());
    cleanup();
    window.localStorage.clear();
    const blocked = await renderAuthenticatedPage({ ingestConflict: true });
    const blockedNavigation = await openMenu(blocked.user);
    await blocked.user.click(blockedNavigation.getByRole('button', { name: 'SOURCE LEDGER' }));
    await blocked.user.click(screen.getByRole('button', { name: '[RUN INGEST]' }));
    await waitFor(() => {
      expect(within(screen.getByTestId('source-ledger')).getByText(/err: operation already running.*current operation:\s*reprocess\/library/i)).toBeVisible();
    });
    expect(within(document.querySelector('header.shell-command') as HTMLElement).queryByText('err: operation already running')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('source-ledger')).getAllByText(/err: operation already running/i)).toHaveLength(1);
    const blockedMenu = await openMenu(blocked.user);
    expect(blockedMenu.getByText(/err: operation already running.*current operation:\s*reprocess\/library.*phase:\s*processing_items.*count:\s*2\/5.*msg:\s*library reprocess processing item.*started:\s*11:00:00.*updated:\s*11:00:05/i)).toBeVisible();
    expect(within(screen.getByTestId('source-ledger')).getByText(/err: operation already running.*current operation:\s*reprocess\/library.*phase:\s*processing_items.*count:\s*2\/5.*msg:\s*library reprocess processing item.*started:\s*11:00:00.*updated:\s*11:00:05/i)).toBeVisible();
  });

  it('renders current operation phase, count, message, and timestamps when the menu or Source Ledger is contextual', async () => {
    const { user } = await renderAuthenticatedPage({ operation: runningOperation() });
    const menu = await openMenu(user);
    expect(menu.getByText(/\[REPROCESSING\.\.\.\].*current operation:\s*reprocess\/library.*phase:\s*processing_items.*count:\s*2\/5.*msg:\s*library reprocess processing item.*started:\s*11:00:00.*updated:\s*11:00:05/i)).toBeVisible();

    await user.click(menu.getByRole('button', { name: 'SOURCE LEDGER' }));
    expect(within(screen.getByTestId('source-ledger')).getByText(/\[REPROCESSING\.\.\.\].*current operation:\s*reprocess\/library.*phase:\s*processing_items.*count:\s*2\/5.*msg:\s*library reprocess processing item.*started:\s*11:00:00.*updated:\s*11:00:05/i)).toBeVisible();
  });
});
