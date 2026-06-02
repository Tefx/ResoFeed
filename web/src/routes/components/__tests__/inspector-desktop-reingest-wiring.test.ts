import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Inspector from '../Inspector.svelte';
import { expectedRedItem } from '../../../test/contract-fixtures';
import Page from '../../+page.svelte';

const ownerToken = 'test-owner-token-with-at-least-thirty-two-chars';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false)
    })
  });
}

function installPageApiFixture(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url, 'http://localhost');
    if (!init?.headers || !(init.headers as Record<string, string>).Authorization) return jsonResponse({ error: { code: 'unauthorized', message: 'owner token required', details: {} } }, 401);
    if (parsed.pathname === '/api/sources') return jsonResponse({ sources: [] });
    if (parsed.pathname === '/api/feed/today') return jsonResponse({ items: [expectedRedItem], next_offset: null });
    if (parsed.pathname === '/api/runtime/language') return jsonResponse({ language: { code: 'zh', label: '中文' }, already_applied: true });
    if (parsed.pathname === '/api/runtime/openrouter-models') return jsonResponse({ models: [{ id: 'openrouter/test-model', name: 'OpenRouter Test Model' }] });
    if (parsed.pathname === '/api/steer/active') return jsonResponse({ rules: [] });
    if (parsed.pathname === `/api/items/${expectedRedItem.id}`) return jsonResponse({
      item: {
        ...expectedRedItem,
        feed_excerpt: 'Runtime fixture feed excerpt.',
        extracted_text: 'Runtime fixture source evidence.',
        provenance: {
          source_url: 'https://example.com/feed.xml',
          canonical_url: expectedRedItem.url,
          original_url: expectedRedItem.url,
          story_key: expectedRedItem.story_key,
          duplicate_of_item_id: expectedRedItem.duplicate_of_item_id,
          grouped_source_items: []
        }
      }
    });
    if (parsed.pathname === `/api/items/${expectedRedItem.id}/inspect`) return jsonResponse({ inspected: true });
    if (parsed.pathname === '/api/runtime/operation') return jsonResponse({ operation: { running: false } });
    return jsonResponse({ error: { code: 'not_found', message: parsed.pathname, details: {} } }, 404);
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop split-pane Inspector re-ingest wiring', () => {
  it('keeps the rendered desktop Inspector re-ingest affordance available', () => {
    render(Inspector, {
      props: {
        item: expectedRedItem,
        mode: 'desktop-split',
        language: 'zh',
        showReingest: true
      }
    });

    const inspector = screen.getByRole('complementary', { name: 'SQLite FTS 改变排序契约' });
    expect(within(inspector).getByLabelText('本文重处理')).toBeVisible();
    expect(within(inspector).getByRole('button', { name: '[重新处理本文]' })).toBeVisible();
  });

  it('wires page-selected Inspector re-ingest by rendered behavior on desktop and narrow routes', async () => {
    // DEVIATION RECORD: type=test_error; artifact=web/src/routes/components/__tests__/inspector-desktop-reingest-wiring.test.ts; what_changed=Removed brittle `+page.svelte` source-string scan for a specific `showReingest` expression and replaced it with rendered page behavior in desktop and narrow matchMedia states; why=DESIGN.md:851 requires runtime Inspector availability, not a particular Svelte expression, and the existing real-server E2E parity test also proves selected-item re-ingest after actual item activation; impact=coverage now fails on user-visible wiring regressions while allowing equivalent implementation expressions.
    for (const matchesNarrow of [false, true]) {
      cleanup();
      window.localStorage.setItem('resofeed.ownerToken', ownerToken);
      window.history.replaceState({}, '', '/');
      installMatchMedia(matchesNarrow);
      installPageApiFixture();
      render(Page);

      const openInspector = await screen.findByRole('button', { name: /Open Inspector for: SQLite FTS changes ranking contract/u });
      await fireEvent.click(openInspector);

      await waitFor(() => expect(screen.getByRole('complementary', { name: /SQLite FTS 改变排序契约/u })).toBeVisible());
      expect(screen.getByLabelText('本文重处理')).toBeVisible();
      expect(screen.getByRole('button', { name: '[重新处理本文]' })).toBeVisible();
    }
  });
});
