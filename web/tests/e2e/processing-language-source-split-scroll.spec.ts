import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route, TestInfo } from 'playwright/test';

import { test, expect } from './fixtures';

type ItemSummary = {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly value_tier: string | null;
  readonly published_at: string | null;
  readonly first_seen_at: string | null;
  readonly extraction_status: 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
  readonly model_status: 'ok' | 'summary_unavailable' | 'model_latency_error';
  readonly is_resonated: boolean;
  readonly human_inspected_at: string | null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
};

type ItemDetail = ItemSummary & {
  readonly feed_excerpt: string | null;
  readonly extracted_text: string | null;
  readonly provenance: {
    readonly source_url: string;
    readonly canonical_url: string | null;
    readonly original_url: string;
    readonly story_key: string | null;
    readonly duplicate_of_item_id: string | null;
    readonly grouped_source_items: [];
  };
};

const source = {
  id: 'src_browser_proof',
  url: 'https://feeds.example.test/browser-proof.xml',
  title: 'Do Not Translate Source',
  last_fetch_at: '2026-05-16T10:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const items: ItemSummary[] = Array.from({ length: 50 }, (_, index) => {
  const ordinal = index + 1;
  return {
    id: `browser_proof_item_${ordinal}`,
    source_id: source.id,
    source_title: source.title,
    url: `https://news.example.test/articles/browser-proof-${ordinal}?utm_source=exact-anchor`,
    title: `Browser proof item ${ordinal}`,
    summary: `Rendered browser fixture summary ${ordinal}.`,
    core_insight: `Rendered browser fixture insight ${ordinal}.`,
    value_tier: ordinal % 2 === 0 ? 'high' : null,
    published_at: `2026-05-16T${String(ordinal).padStart(2, '0')}:00:00Z`,
    first_seen_at: `2026-05-16T${String(ordinal).padStart(2, '0')}:05:00Z`,
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: `browser-proof-story-${ordinal}`,
    duplicate_of_item_id: null
  };
});

function detailFor(itemId: string): ItemDetail {
  const item = items.find((candidate) => candidate.id === itemId) ?? items[0];
  const ordinal = item.id.replace('browser_proof_item_', '');
  return {
    ...item,
    feed_excerpt: `Exact feed excerpt for ${item.title}.`,
    extracted_text: Array.from({ length: 80 }, (_, index) => `Long inspector paragraph ${index + 1} for ${item.title}.`).join(' '),
    provenance: {
      source_url: source.url,
      canonical_url: `https://canonical.example.test/browser-proof-${ordinal}`,
      original_url: `https://original.example.test/browser-proof-${ordinal}`,
      story_key: item.story_key,
      duplicate_of_item_id: null,
      grouped_source_items: []
    }
  };
}

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function installApiFixtures(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/sources') {
      await fulfillJson(route, { sources: [source] });
      return;
    }
    if (path === '/api/feed/today') {
      await fulfillJson(route, { items });
      return;
    }
    if (path === '/api/runtime/language') {
      await fulfillJson(route, { language: { code: 'zh', label: '中文' } });
      return;
    }
    if (path === '/api/steer/active') {
      await fulfillJson(route, { rules: [] });
      return;
    }
    if (path.endsWith('/inspect') && request.method() === 'POST') {
      const itemId = decodeURIComponent(path.replace('/api/items/', '').replace('/inspect', ''));
      await fulfillJson(route, { item_id: itemId, human_inspected_at: '2026-05-16T12:00:00Z', already_applied: false });
      return;
    }
    const itemMatch = path.match(/^\/api\/items\/([^/]+)$/u);
    if (itemMatch && request.method() === 'GET') {
      await fulfillJson(route, { item: detailFor(decodeURIComponent(itemMatch[1])) });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'not found', details: {} } })
    });
  });
}

async function shellReady(page: Page): Promise<void> {
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('list', { name: /Today feed items|今日订阅条目/u })).toBeVisible();
}

async function captureRenderedEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'split-scroll-mobile-route-evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(ariaPath, await page.locator('body').ariaSnapshot(), 'utf8');
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
}

test('browser proves source identifiers are non-translatable and desktop panes split scroll independently', async ({ page, ownerToken }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken);
  await page.goto('/');
  await shellReady(page);

  const feedPane = page.locator('[data-scroll-region="feed-independent"]');
  const inspectorPane = page.locator('[data-scroll-region="inspector-independent"]');
  await expect(feedPane).toHaveAttribute('tabindex', '0');
  await expect(feedPane).toHaveAttribute('aria-label', 'TODAY surface independent scroll');
  await expect(inspectorPane).toHaveAttribute('tabindex', '0');
  await expect(inspectorPane).toHaveAttribute('aria-label', 'INSPECTOR independent scroll');
  await expect(feedPane).toHaveCSS('overflow-y', 'auto');
  await expect(inspectorPane).toHaveCSS('overflow-y', 'auto');
  await feedPane.focus();
  await expect(feedPane).toBeFocused();
  await inspectorPane.focus();
  await expect(inspectorPane).toBeFocused();

  await expect(page.locator('.feed-meta-source').first()).toHaveAttribute('translate', 'no');

  const initialInspectorTop = await inspectorPane.evaluate((node) => node.scrollTop);
  await feedPane.evaluate((node) => {
    node.scrollTop = 520;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await inspectorPane.evaluate((node) => { node.scrollTop = 360; });
  await expect.poll(async () => feedPane.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect.poll(async () => inspectorPane.evaluate((node) => node.scrollTop)).toBeGreaterThan(initialInspectorTop);

  const feedScrollBeforeSelect = await feedPane.evaluate((node) => node.scrollTop);
  const inspectorScrollBeforeSelect = await inspectorPane.evaluate((node) => node.scrollTop);
  expect(inspectorScrollBeforeSelect).toBeGreaterThan(0);

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label') === 'Open Inspector for: Browser proof item 10'
    );
    if (!(target instanceof HTMLElement)) throw new Error('target feed row button was not found');
    target.click();
  });
  await expect(page.getByRole('heading', { name: 'Browser proof item 10' })).toBeFocused();
  await expect.poll(async () => inspectorPane.evaluate((node) => node.scrollTop)).toBe(0);
  await expect.poll(async () => feedPane.evaluate((node) => node.scrollTop)).toBe(feedScrollBeforeSelect);
  await expect(page.locator('.contract-feed-item[aria-current="true"] .contract-feed-title')).toHaveText('Browser proof item 10');
  await expect(inspectorPane).toHaveClass(/active-panel/u);

  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await expect(inspector.locator('.inspector-provenance [translate="no"]')).toHaveText('Do Not Translate Source');
  await expect(inspector.getByRole('link', { name: /original link|原文链接/u })).toHaveAttribute('translate', 'no');
  await expect(inspector.getByRole('link', { name: /original link|原文链接/u })).toHaveAttribute('href', items[9].url);

  await expect(inspector.getByRole('link', { name: /feed link|来源链接/u })).toHaveAttribute('href', source.url);
  await expect(inspector.getByRole('link', { name: /feed link|来源链接/u })).toHaveAttribute('translate', 'no');
  await captureRenderedEvidence(page, testInfo, 'desktop-split-scroll');
});

test('browser keeps mobile full-screen Inspector route and restores feed scroll after back', async ({ page, ownerToken }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page, ownerToken);
  await page.goto('/');
  await shellReady(page);

  await page.evaluate(() => window.scrollTo(0, 520));
  const feedScrollBeforeRoute = await page.evaluate(() => window.scrollY);

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label') === 'Open Inspector for: Browser proof item 12'
    );
    if (!(target instanceof HTMLElement)) throw new Error('target mobile feed row button was not found');
    target.click();
  });
  await expect(page).toHaveURL(/\/items\/browser_proof_item_12$/u);
  await expect(page.getByRole('button', { name: 'back to TODAY' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'INSPECTOR' })).toContainText('Browser proof item 12');
  await expect(page.getByRole('button', { name: 'Resonate item: Browser proof item 12' })).toBeVisible();
  await expect(page.locator('.detail-pane')).toHaveClass(/active-panel/u);
  await expect(page.locator('.feed-pane')).toBeHidden();
  await expect(page.locator('.contract-feed-item[aria-current="true"] .contract-feed-title')).toHaveText('Browser proof item 12');
  await captureRenderedEvidence(page, testInfo, 'mobile-inspector-route');

  await page.getByRole('button', { name: 'back to TODAY' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('list', { name: /Today feed items|今日订阅条目/u })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(feedScrollBeforeRoute);
  await expect(page.locator('.contract-feed-item[aria-current="true"]')).toHaveCount(0);
  await captureRenderedEvidence(page, testInfo, 'mobile-feed-restored');
});
