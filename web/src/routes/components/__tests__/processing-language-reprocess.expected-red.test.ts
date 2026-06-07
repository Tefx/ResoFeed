import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Page from '../../+page.svelte';
import Feed from '../Feed.svelte';
import Inspector from '../Inspector.svelte';
import SourceLedger from '../SourceLedger.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';
import type { CurrentOperationInfo, ItemDetail } from '$lib/api-contract';

const ownerToken = 'rfeed_expected_red_language_reprocess_0000000000000000';

const expectedRedDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'English fixture excerpt that represents stored target-language content.',
  extracted_text: 'English fixture article body that should be replaced only by explicit reprocess.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: expectedRedItem.url,
    original_url: expectedRedItem.url,
    story_key: expectedRedItem.story_key,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function installAuthenticatedRuntimeFetch(options: { language?: 'en' | 'zh'; languageStatus?: number; languagePutStatus?: number; reprocessStatus?: number; reprocessResultStatus?: 'completed' | 'completed_with_errors' | 'failed'; ftsStale?: boolean; currentOperation?: CurrentOperationInfo } = {}) {
  const language = options.language ?? 'en';
  const languageStatus = options.languageStatus ?? 200;
  const languagePutStatus = options.languagePutStatus ?? languageStatus;
  const reprocessStatus = options.reprocessStatus ?? 200;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
    if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
    if (url.endsWith(`/api/items/${expectedRedItem.id}/inspect`) && method === 'POST') {
      return jsonResponse({ item_id: expectedRedItem.id, human_inspected_at: '2026-05-15T00:00:00Z', already_applied: false });
    }
    if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
    if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
    if (url.endsWith('/api/runtime/operation') && method === 'GET') {
      return jsonResponse({ operation: options.currentOperation ?? { running: false } });
    }
    if (url.endsWith('/api/runtime/language') && method === 'GET') {
      if (languageStatus === 401) {
        return jsonResponse({ error: { code: 'unauthorized', message: 'owner token rejected', details: {} } }, { status: 401 });
      }
      return jsonResponse({ language: { code: language, label: language === 'zh' ? '中文' : 'English' } });
    }
    if (url.endsWith('/api/runtime/language') && method === 'PUT') {
      if (languagePutStatus === 400) {
        return jsonResponse({ error: { code: 'bad_request', message: 'request_fingerprint_mismatch', details: { reason: 'request_fingerprint_mismatch' } } }, { status: 400 });
      }
      if (languagePutStatus === 401) {
        return jsonResponse({ error: { code: 'unauthorized', message: 'owner token rejected', details: {} } }, { status: 401 });
      }
      if (languagePutStatus === 409) {
        return jsonResponse({ error: { code: 'conflict', message: 'ingest already running', details: {} } }, { status: 409 });
      }
      if (languagePutStatus === 500) {
        return jsonResponse({ error: { code: 'internal', message: 'language update failed', details: {} } }, { status: 500 });
      }
      return jsonResponse({ language: { code: 'zh', label: '中文' }, already_applied: false });
    }
    if (url.endsWith('/api/runtime/reprocess-library') && method === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (reprocessStatus === 400) {
        return jsonResponse({ error: { code: 'bad_request', message: 'request_fingerprint_mismatch', details: { reason: 'request_fingerprint_mismatch' } } }, { status: 400 });
      }
      if (reprocessStatus === 409) {
        return jsonResponse({ error: { code: 'conflict', message: 'ingest already running', details: {} } }, { status: 409 });
      }
      if (reprocessStatus === 500) {
        return jsonResponse({ error: { code: 'internal', message: 'reprocess failed', details: {} } }, { status: 500 });
      }
      return jsonResponse({
        reprocess: {
          status: options.reprocessResultStatus ?? 'completed',
          language: 'zh',
          started_at: '2026-05-15T00:00:00Z',
          completed_at: '2026-05-15T00:00:01Z',
          items_attempted: 6,
          items_updated: 1,
          items_indexed: 4,
          items_unavailable: 2,
          items_failed: 3,
          fts_rebuilt: options.ftsStale === true ? false : true,
          fts_stale: options.ftsStale === true,
          errors: []
        },
        already_applied: false
      });
    }
    return jsonResponse({ error: { code: 'not_found', message: `not found: ${method} ${url}`, details: {} } }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function renderAuthenticatedPage(options: { language?: 'en' | 'zh'; languageStatus?: number; languagePutStatus?: number; reprocessStatus?: number; reprocessResultStatus?: 'completed' | 'completed_with_errors' | 'failed'; ftsStale?: boolean; currentOperation?: CurrentOperationInfo } = {}) {
  cleanup();
  window.localStorage.clear();
  installAuthenticatedRuntimeFetch(options);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  await waitFor(() => expect(screen.getByLabelText('Steer or paste RSS URL')).toBeVisible());
  return { user };
}

async function openResofeedSurfaceMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const menu = screen.getByLabelText('RESOFEED surface menu') as HTMLDetailsElement;
  if (!menu.open) {
    await user.click(within(menu).getByText('RESOFEED', { selector: 'summary' }));
  }
  await waitFor(() => expect(menu).toHaveAttribute('open'));
  return menu;
}

describe('expected-red processing language and reprocess rendering contracts', () => {
  it('renders global LANG control, updates <html lang>, announces success/failure, and avoids forbidden surfaces', async () => {
    const { user } = await renderAuthenticatedPage({ language: 'en' });

    const domSnapshot = document.body.innerHTML;
    expect(domSnapshot).toContain('LANG: EN');
    const surfaceMenu = await openResofeedSurfaceMenu(user);

    const languageControl = within(surfaceMenu).getByRole('button', {
      name: /processing language.*English.*set.*Chinese/i
    });
    expect(languageControl).toBeVisible();
    expect(languageControl).toHaveClass('bracket-action');
    expect(document.documentElement).toHaveAttribute('lang', 'en');

    await user.click(languageControl);

    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'zh-CN'));
    expect(within(surfaceMenu).getByRole('button', { name: /处理语言 中文; set English/i })).toHaveTextContent('语言: 中文');
    expect(screen.getByRole('status', { name: /processing language/i })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status', { name: /processing language/i })).toHaveTextContent(/Language set to 中文|语言已设为中文/);
    expect(screen.queryByRole('heading', { name: /settings|preferences|onboarding/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /translate this item|show original|side-by-side/i })).not.toBeInTheDocument();
  });

  it('renders terse HTTP 400 and 401 language failures without replacing controls with settings UI', async () => {
    const { user } = await renderAuthenticatedPage({ language: 'en', languagePutStatus: 400 });
    const surfaceMenu = await openResofeedSurfaceMenu(user);

    await user.click(within(surfaceMenu).getByRole('button', { name: /processing language.*English.*set.*Chinese/i }));

    await waitFor(() => expect(screen.getByRole('status', { name: /processing language/i })).toHaveTextContent('err: request_fingerprint_mismatch'));
    expect(screen.getByRole('status', { name: /processing language/i })).toBeVisible();
    expect(screen.getByRole('status', { name: /processing language/i })).toHaveClass('contract-feedback-error');
    expect(screen.getByText('LANG: EN')).toHaveClass('bracket-action');
    expect(screen.queryByRole('heading', { name: /settings|preferences|onboarding/i })).not.toBeInTheDocument();

    cleanup();
    window.localStorage.clear();
    installAuthenticatedRuntimeFetch({ language: 'en', languagePutStatus: 401 });
    render(Page);
    await user.type(screen.getByLabelText('Owner token'), ownerToken);
    await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
    await waitFor(() => expect(screen.getByLabelText('Steer or paste RSS URL')).toBeVisible());
    expect(window.localStorage.getItem('resofeed.ownerToken')).toBe(ownerToken);

    const unauthorizedMenu = await openResofeedSurfaceMenu(user);
    await user.click(within(unauthorizedMenu).getByRole('button', { name: /processing language.*English.*set.*Chinese/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected'));
    expect(window.localStorage.getItem('resofeed.ownerToken')).toBeNull();
    expect(screen.getByLabelText('Owner token')).toHaveFocus();

    cleanup();
    window.localStorage.clear();
    installAuthenticatedRuntimeFetch({ languageStatus: 401 });
    render(Page);
    await user.type(screen.getByLabelText('Owner token'), ownerToken);
    await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected'));
    expect(screen.getByLabelText('Owner token')).toHaveFocus();
  });

  it('restores an in-flight library reprocess after page reload and does not expose a fresh start action', async () => {
    cleanup();
    window.localStorage.clear();
    window.localStorage.setItem('resofeed.ownerToken', ownerToken);
    const fetcher = installAuthenticatedRuntimeFetch({
      language: 'zh',
      currentOperation: {
        running: true,
        kind: 'library_reprocess',
        actor_kind: 'human',
        phase: 'processing_items',
        count: { current: 2, total: 6 },
        message: 'library reprocess item processed',
        started_at: '2026-05-15T00:00:00Z',
        updated_at: '2026-05-15T00:00:03Z'
      }
    });
    render(Page);

    await waitFor(() => expect(screen.getByLabelText('Steer or paste RSS URL')).toBeVisible());
    const surfaceMenu = await openResofeedSurfaceMenu(userEvent.setup());
    const running = within(surfaceMenu).getByRole('button', { name: /Reprocess existing library/i });
    expect(running).toHaveTextContent(/\[REPROCESSING\.\.\.\]|\[重处理中\.\.\.\]/);
    expect(running).toHaveAttribute('aria-disabled', 'true');
    expect(within(surfaceMenu).getByText(/2\/6/)).toBeVisible();
    expect(within(surfaceMenu).queryByRole('button', { name: /Confirm reprocess/i })).not.toBeInTheDocument();

    const postCalls = fetcher.mock.calls.filter(([input, init]) => String(input).endsWith('/api/runtime/reprocess-library') && init?.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('renders reprocess bracket-action default, confirmation, running, complete, conflict, and failure states with live output', async () => {
    const { user } = await renderAuthenticatedPage({ language: 'zh' });
    const surfaceMenu = await openResofeedSurfaceMenu(user);

    const action = within(surfaceMenu).getByRole('button', {
      name: /Reprocess existing library and rebuild search index/i
    });
    expect(action).toHaveTextContent('[重处理资料库]');
    expect(action).toHaveClass('bracket-action');
    expect(screen.getByText(/Source identifiers remain unchanged|来源标识保持不变/)).toBeVisible();

    await user.click(action);
    const confirm = screen.getByRole('button', { name: /Confirm reprocess/i });
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveTextContent(/?\[CONFIRM REPROCESS\]|?\[确认重处理\]/);
    expect(screen.getByRole('button', { name: /Cancel reprocess/i })).toHaveTextContent(/\[CANCEL\]|\[取消\]/);

    await user.click(confirm);
    const running = await screen.findByRole('button', { name: /reprocess/i });
    expect(running).toHaveTextContent(/\[REPROCESSING\.\.\.\]|\[重处理中\.\.\.\]/);
    expect(running).toHaveAttribute('aria-disabled', 'true');
    expect(running).not.toHaveAttribute('disabled');

    await waitFor(() => expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent(/reprocess complete|重处理完成/));
    expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent(/attempted 6; updated 1; unavailable 2; failed 3; indexed 4/);
    expect(screen.getByRole('status', { name: /reprocess/i })).toHaveAttribute('aria-live', 'polite');

    installAuthenticatedRuntimeFetch({ language: 'zh', reprocessResultStatus: 'failed', ftsStale: true });
    await openResofeedSurfaceMenu(user);
    await user.click(within(surfaceMenu).getByRole('button', { name: /Reprocess existing library/i }));
    await user.click(within(surfaceMenu).getByRole('button', { name: /Confirm reprocess/i }));
    await waitFor(() => expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent(/重处理未完成|reprocess incomplete/));
    expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent(/attempted 6; updated 1; unavailable 2; failed 3; indexed 4/);
    expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent(/搜索索引待重建|search index stale/);

    installAuthenticatedRuntimeFetch({ language: 'zh', reprocessStatus: 409 });
    await openResofeedSurfaceMenu(user);
    await user.click(within(surfaceMenu).getByRole('button', { name: /Reprocess existing library/i }));
    await user.click(within(surfaceMenu).getByRole('button', { name: /Confirm reprocess/i }));
    await waitFor(() => expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent('err: ingest already running'));
    expect(screen.getByRole('button', { name: /Reprocess existing library/i })).toHaveFocus();

    installAuthenticatedRuntimeFetch({ language: 'zh', reprocessStatus: 400 });
    await openResofeedSurfaceMenu(user);
    await user.click(within(surfaceMenu).getByRole('button', { name: /Reprocess existing library/i }));
    await user.click(within(surfaceMenu).getByRole('button', { name: /Confirm reprocess/i }));
    await waitFor(() => expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent('err: request_fingerprint_mismatch'));

    installAuthenticatedRuntimeFetch({ language: 'zh', reprocessStatus: 500 });
    await openResofeedSurfaceMenu(user);
    await user.click(within(surfaceMenu).getByRole('button', { name: /Reprocess existing library/i }));
    await user.click(within(surfaceMenu).getByRole('button', { name: /Confirm reprocess/i }));
    await waitFor(() => expect(screen.getByRole('status', { name: /reprocess/i })).toHaveTextContent('err: reprocess failed'));
  });

  it('marks source identifiers as literal non-translated provenance anchors across feed, inspector, and ledger renders', () => {
    render(Feed, {
      props: {
        items: [expectedRedItem],
        selectedItemId: expectedRedItem.id,
        onSelect: async () => {},
        onResonanceToggle: async () => {}
      }
    });
    expect(screen.getByLabelText('Source: Example Source')).toHaveAttribute('translate', 'no');
    // DEVIATION RECORD: type=test_error; artifact=processing-language-reprocess.expected-red.test.ts; what_changed=feed source assertion now requires literal visible source value without repeated `src:` prefix while preserving the `Source: Example Source` accessible label; why=DESIGN.FEED.NO_REPEATED_PREFIXES and DESIGN.SOURCE_IDENTIFIERS require no repeated visual reader prefixes but unchanged, screen-reader-readable source provenance; impact=coverage is tightened to catch stale visual `src:` regressions instead of requiring forbidden reader chrome.
    expect(screen.getByText('Example Source')).toHaveAttribute('translate', 'no');
    expect(screen.queryByText('src: Example Source')).not.toBeInTheDocument();

    render(Inspector, { props: { item: expectedRedDetail, mode: 'desktop-split' } });
    const inspector = screen.getByRole('complementary', { name: expectedRedDetail.title });
    const originalLink = within(inspector).getByRole('link', { name: 'original link' });
    expect(originalLink).toHaveAttribute('translate', 'no');
    expect(originalLink).toHaveAttribute('href', expectedRedItem.url);

    render(SourceLedger, {
      props: {
        sources: [expectedRedSource],
        onDeleteSource: async () => {},
        onImportOpml: async () => {},
        onExportState: async () => ({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-15T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] }),
        onImportState: async () => {}
      }
    });
    expect(screen.getByText(expectedRedSource.url)).toHaveAttribute('translate', 'no');
  });

  it('keeps desktop feed and Inspector as independent focusable scroll regions while mobile Inspector remains a route', async () => {
    await renderAuthenticatedPage({ language: 'en' });

    const feedPane = screen.getByLabelText(/TODAY surface/i);
    const inspectorPane = screen.getByLabelText(/^INSPECTOR independent scroll$/i);
    expect(feedPane).toHaveAttribute('tabindex', '0');
    expect(inspectorPane).toHaveAttribute('tabindex', '0');
    expect(feedPane).toHaveAccessibleName(/TODAY.*independent scroll/i);
    expect(inspectorPane).toHaveAccessibleName(/INSPECTOR.*independent scroll/i);
    expect(feedPane).toHaveClass('feed-pane');
    expect(feedPane).toHaveAttribute('data-scroll-region', 'feed-independent');
    expect(inspectorPane).toHaveClass('detail-pane');
    expect(inspectorPane).toHaveAttribute('data-scroll-region', 'inspector-independent');

    const beforeFeedScroll = 312;
    feedPane.scrollTop = beforeFeedScroll;
    await userEvent.click(screen.getByRole('button', { name: `Open Inspector for: ${expectedRedItem.title}` }));
    expect(feedPane.scrollTop).toBe(beforeFeedScroll);
    expect(inspectorPane.scrollTop).toBe(0);

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
    window.history.pushState({}, '', '/items/item_expected_red');
    await renderAuthenticatedPage({ language: 'en' });
    expect(screen.getAllByRole('button', { name: /back to TODAY/i }).some((button) => button.classList.contains('back-command'))).toBe(true);
    expect(screen.getByRole('complementary', { name: expectedRedItem.title })).toBeVisible();
  });
});
