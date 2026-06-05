import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

const now = '2026-05-20T12:00:00Z';

const source = {
  id: 'src_search_click',
  url: 'https://example.test/search-click/feed.xml',
  title: 'Search Contract Source',
  last_fetch_at: now,
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const selectedItem = {
  id: 'item_search_click_selected',
  source_id: source.id,
  source_title: source.title,
  url: 'https://example.test/search-click/selected',
  title: 'Search click selected fallback item',
  summary: null,
  core_insight: null,
  display_excerpt: 'Raw RSS excerpt proves fallback source evidence survives search selection.',
  value_tier: null,
  published_at: now,
  first_seen_at: now,
  extraction_status: 'partial_extraction',
  model_status: 'summary_unavailable',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
} as const;

const alternateItem = {
  ...selectedItem,
  id: 'item_search_click_alternate',
  url: 'https://example.test/search-click/alternate',
  title: 'Search click alternate model-backed item',
  summary: 'Model-backed alternate summary for list depth.',
  core_insight: 'Alternate core insight.',
  display_excerpt: 'Alternate excerpt.',
  extraction_status: 'full',
  model_status: 'ok'
} as const;

const items = [selectedItem, alternateItem];

const selectedDetail = {
  ...selectedItem,
  feed_excerpt: 'Raw RSS excerpt proves fallback source evidence survives search selection.',
  extracted_text: 'Unprocessed source body must not masquerade as synthesized search detail.',
  provenance: {
    source_url: source.url,
    canonical_url: selectedItem.url,
    original_url: selectedItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

const alternateDetail = {
  ...alternateItem,
  feed_excerpt: 'Alternate excerpt.',
  extracted_text: 'Full alternate source text.',
  provenance: {
    source_url: source.url,
    canonical_url: alternateItem.url,
    original_url: alternateItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

async function installSearchClickMockApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [source] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items } });
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' } } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') {
      return route.fulfill({
        json: {
          items,
          query: {
            q: url.searchParams.get('q') ?? '',
            source: null,
            from: null,
            to: null,
            resonated: null,
            limit: Number(url.searchParams.get('limit') ?? 50)
          }
        }
      });
    }
    if (url.pathname.endsWith('/inspect')) {
      const itemId = url.pathname.split('/').at(-2) ?? selectedItem.id;
      return route.fulfill({ json: { item_id: itemId, human_inspected_at: now, already_applied: false } });
    }
    if (url.pathname.endsWith('/resonance')) {
      const itemId = url.pathname.split('/').at(-2) ?? selectedItem.id;
      return route.fulfill({ json: { item_id: itemId, is_resonated: true, already_applied: false } });
    }
    if (url.pathname.startsWith('/api/items/')) {
      const detail = url.pathname.includes(alternateItem.id) ? alternateDetail : selectedDetail;
      return route.fulfill({ json: { item: detail } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openSearch(page: Page, ownerToken: string): Promise<void> {
  await installSearchClickMockApi(page);
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search fallback evidence');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('region', { name: 'Search and Retrieval' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` })).toBeVisible();
}

test.describe('expected red: search result click keeps filtered slice and Inspector synchronized', () => {
  test('desktop result click keeps search list visible, preserves query/scroll, selects row, and updates Inspector', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSearch(page, ownerToken);

    const searchSurface = page.getByRole('region', { name: 'Search and Retrieval' });
    const preservedScrollTop = await page.locator('.contract-search').evaluate((node) => {
      node.scrollTop = Math.min(48, Math.max(0, node.scrollHeight - node.clientHeight));
      return node.scrollTop;
    });
    await page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();

    await expect(searchSurface).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Plain text query' })).toHaveValue('fallback evidence');
    await expect.poll(() => page.locator('.contract-search').evaluate((node) => node.scrollTop)).toBe(preservedScrollTop);
    await expect(page.getByRole('complementary', { name: selectedItem.title })).toContainText(selectedItem.title);
    await expect(page.locator('article.contract-search-result').filter({ hasText: selectedItem.title })).toHaveAttribute('aria-current', 'true');
  });

  test('search result activation exposes aria-selected/current and works with keyboard Enter/Space', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSearch(page, ownerToken);

    const resultButton = page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` });
    await resultButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('article.contract-search-result').filter({ hasText: selectedItem.title })).toHaveAttribute('aria-current', 'true');

    await page.getByRole('button', { name: `Inspect search result: ${alternateItem.title}` }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('article.contract-search-result').filter({ hasText: alternateItem.title })).toHaveAttribute('aria-current', 'true');
  });

  test('mobile tap drills into detail and browser Back restores search query and prior scroll', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, ownerToken);

    await page.evaluate(() => window.scrollTo(0, 180));
    await page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();
    await expect(page).toHaveURL(/\/items\/item_search_click_selected$/);
    await expect(page.getByRole('complementary', { name: selectedItem.title })).toContainText(selectedItem.title);

    await page.goBack();
    await expect(page.getByRole('region', { name: 'Search and Retrieval' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Plain text query' })).toHaveValue('fallback evidence');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(180);
  });

  test('search detail uses Inspector fallback source evidence and does not create ghost Summary/Core sections', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSearch(page, ownerToken);

    await page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();
    const inspector = page.getByRole('complementary', { name: selectedItem.title });
    await expect(inspector).toContainText('target-language processing incomplete · summary/core unavailable · showing source excerpt');
    await expect(inspector.getByLabel('Text evidence')).toContainText('Raw RSS excerpt proves fallback source evidence survives search selection.');
    await expect(inspector.getByLabel('Summary')).toHaveCount(0);
    await expect(inspector.getByLabel('Core insight')).toHaveCount(0);
    await expect(inspector).not.toContainText('Unprocessed source body must not masquerade');
  });

  test('search click contract forbids modal, recommendation, and tab detours', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSearch(page, ownerToken);

    await page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/recommended|related stories|immersive reader|saved search|unread|mark all read/i)).toHaveCount(0);
  });
});
