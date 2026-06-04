import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const artifactDir = path.join(repoRoot, '.test-artifacts', 'feed-search-anatomy');

const now = new Date();
const today = now.toISOString();
const yesterday = new Date(now.getTime() - 86_400_000).toISOString();
const earlier = new Date(now.getTime() - 3 * 86_400_000).toISOString();

const source = {
  id: 'src_anatomy',
  url: 'https://example.com/feed.xml',
  title: 'Example Source',
  last_fetch_at: today,
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const items = [
  {
    id: 'item_anatomy_today',
    source_id: source.id,
    source_title: source.title,
    url: 'https://example.com/today',
    title: 'Today source-backed anatomy item',
    summary: 'Useful source-backed summary for the desktop feed row.',
    core_insight: 'Core insight is available.',
    display_excerpt: 'Fallback excerpt is not needed for this row.',
    value_tier: 'high',
    published_at: today,
    first_seen_at: today,
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: today,
    story_key: 'story_today',
    duplicate_of_item_id: null
  },
  {
    id: 'item_anatomy_yesterday',
    source_id: source.id,
    source_title: source.title,
    url: 'https://example.com/yesterday',
    title: 'Yesterday fallback anatomy item',
    summary: null,
    core_insight: null,
    display_excerpt: 'Source-backed feed excerpt for fallback rendering.',
    value_tier: null,
    published_at: null,
    first_seen_at: yesterday,
    extraction_status: 'partial_extraction',
    model_status: 'summary_unavailable',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'story_yesterday',
    duplicate_of_item_id: null
  },
  {
    id: 'item_anatomy_earlier',
    source_id: source.id,
    source_title: source.title,
    url: 'https://example.com/earlier',
    title: 'Earlier compact anatomy item',
    summary: 'Earlier item keeps the row grammar shared.',
    core_insight: null,
    display_excerpt: null,
    value_tier: null,
    published_at: earlier,
    first_seen_at: earlier,
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: true,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'story_earlier',
    duplicate_of_item_id: null
  }
] as const;

async function installMockApi(page: Page, language: 'en' | 'zh' = 'en'): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: language === 'zh' ? { code: 'zh', label: '中文' } : { code: 'en', label: 'English' } } });
    if (url.pathname === '/api/runtime/operation') {
      return route.fulfill({
        json: {
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
        }
      });
    }
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [source] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') return route.fulfill({ json: { items, query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: 50 } } });
    if (url.pathname.endsWith('/inspect')) return route.fulfill({ json: { item_id: 'item_anatomy_today', human_inspected_at: today, already_applied: false } });
    if (url.pathname.endsWith('/resonance')) return route.fulfill({ json: { item_id: 'item_anatomy_today', is_resonated: true, already_applied: false } });
    if (url.pathname.startsWith('/api/items/')) {
      const item = items.find((candidate) => url.pathname.includes(candidate.id)) ?? items[0];
      return route.fulfill({ json: { item: { ...item, feed_excerpt: item.display_excerpt, extracted_text: 'Full extracted text for rendered proof.', provenance: { source_url: source.url, canonical_url: item.url, original_url: item.url, story_key: item.story_key, duplicate_of_item_id: null } } } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function saveProof(page: Page, name: string): Promise<string> {
  fs.mkdirSync(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, `${name}.png`);
  const domPath = path.join(artifactDir, `${name}.txt`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(domPath, await page.locator('body').innerText());
  return screenshotPath;
}

test('feed/search anatomy rendered proof across desktop and narrow viewports', async ({ page, ownerToken }) => {
  await installMockApi(page);
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const feedList = page.getByRole('list', { name: 'Today feed items' });
  await expect(feedList).toBeVisible();
  await expect(feedList.getByText('TODAY', { exact: true })).toBeVisible();
  await expect(feedList.getByText('YESTERDAY', { exact: true })).toBeVisible();
  await expect(feedList.getByText('EARLIER', { exact: true })).toBeVisible();
  await expect(feedList.getByText('Source-backed feed excerpt for fallback rendering.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TODAY', exact: true })).toHaveCount(0);
  await saveProof(page, 'feed-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileChrome = page.locator('.shell-command > .surface-nav .surface-nav-label');
  await expect(mobileChrome).toHaveText('RESOFEED');
  const mobileChromeBox = await mobileChrome.boundingBox();
  expect(mobileChromeBox, 'narrow TODAY keeps visible top RESOFEED chrome').not.toBeNull();
  expect(mobileChromeBox?.height ?? 0, 'top chrome is not visually clipped to a hidden 1px label').toBeGreaterThanOrEqual(20);
  expect(mobileChromeBox?.y ?? Number.POSITIVE_INFINITY, 'top chrome stays at the viewport top').toBeLessThanOrEqual(8);

  const mobileSteer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await expect(mobileSteer).toBeVisible();
  const mobileSteerBox = await mobileSteer.boundingBox();
  expect(mobileSteerBox, 'bottom command input remains reachable on narrow TODAY').not.toBeNull();
  expect(mobileSteerBox?.y ?? 0, 'Steer input remains in the bottom command affordance').toBeGreaterThan(700);

  const firstFeedRowBox = await page.locator('.contract-feed-item').first().boundingBox();
  expect(firstFeedRowBox, 'narrow feed rows render below top chrome').not.toBeNull();
  expect(firstFeedRowBox?.y ?? 0, 'feed rows do not start underneath top RESOFEED chrome').toBeGreaterThan((mobileChromeBox?.y ?? 0) + (mobileChromeBox?.height ?? 0));
  await saveProof(page, 'feed-narrow');

  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search fallback');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('region', { name: 'Search and Retrieval' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect search result: Yesterday fallback anatomy item' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resonate item' }).first()).toBeVisible();
  await expect(page.getByText('match: lexical index').first()).toBeVisible();
  await expect(page.getByText('provenance: source-backed').first()).toBeVisible();
  await saveProof(page, 'search-narrow');

  await page.setViewportSize({ width: 1280, height: 900 });
  await saveProof(page, 'search-desktop');
});

test('Escape from Search returns to TODAY and clears search state in English and Chinese', async ({ page, ownerToken }) => {
  for (const language of ['en', 'zh'] as const) {
    await page.unroute('**/api/**').catch(() => undefined);
    await installMockApi(page, language);
    await page.addInitScript(
      ({ token }) => {
        window.localStorage.setItem('resofeed.ownerToken', token);
      },
      { token: ownerToken }
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('textbox', { name: /Steer|导向/ }).fill('search fallback');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'search');
    await expect(page).toHaveURL(/\?search=fallback/);
    await expect(page.getByText(language === 'zh' ? '检索：词汇搜索' : 'retrieval: lexical search')).toBeVisible();

    await page.locator('.contract-search').focus();
    await page.keyboard.press('Escape');

    await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'feed');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('region', { name: language === 'zh' ? '搜索与检索' : 'Search and Retrieval' })).toBeHidden();
    await expect(page.getByText(language === 'zh' ? '检索：词汇搜索' : 'retrieval: lexical search')).toHaveCount(0);
  }
});

test('desktop Search auto-selects first result and clears stale Inspector when results are empty', async ({ page, ownerToken }) => {
  await installMockApi(page);
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today source-backed anatomy item' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search fallback');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'search');
  await expect(page.getByRole('button', { name: 'Inspect search result: Today source-backed anatomy item' })).toBeVisible();
  await expect(page.locator('.contract-search-result').first()).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Today source-backed anatomy item' })).toBeVisible();

  await page.route('**/api/search**', async (route) => route.fulfill({ json: { items: [], query: { q: 'nohits', source: null, from: null, to: null, resonated: null, limit: 50 } } }));
  await page.getByRole('textbox', { name: 'Plain text query' }).fill('nohits');
  await page.getByRole('button', { name: 'submit search' }).click();
  await expect(page.getByText('no results')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today source-backed anatomy item' })).toHaveCount(0);
  await expect(page.locator('.inspector-empty-placeholder')).toBeVisible();
});
