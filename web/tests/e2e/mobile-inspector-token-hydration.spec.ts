import { test, expect } from './fixtures';
import type { Page } from 'playwright/test';
import { fixtureOpml } from './e2e-contract';

type PromptProbeWindow = Window & { __resofeedSawTokenPrompt?: boolean };

interface TodayFeedResponse {
  readonly items: readonly { readonly id: string; readonly title: string }[];
}

async function apiFetch(runInfo: { baseURL: string }, ownerToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${ownerToken}`);
  return fetch(`${runInfo.baseURL}${path}`, {
    ...init,
    headers
  });
}

async function seedFixtureItem(runInfo: { baseURL: string; fixtureServer: { url: string } }, ownerToken: string): Promise<{ id: string; title: string }> {
  await apiFetch(runInfo, ownerToken, '/api/sources/import-opml', {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: fixtureOpml(runInfo.fixtureServer.url)
  });
  await apiFetch(runInfo, ownerToken, '/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await apiFetch(runInfo, ownerToken, '/api/feed/today?limit=50');
    const body = (await response.json()) as TodayFeedResponse;
    const item = body.items[0];
    if (item) return item;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('fixture item was not available in TODAY feed');
}

async function installTokenPromptProbe(page: Page, ownerToken?: string): Promise<void> {
  await page.addInitScript((token?: string) => {
    if (token) window.localStorage.setItem('resofeed.ownerToken', token);
    const probeWindow = window as PromptProbeWindow;
    probeWindow.__resofeedSawTokenPrompt = false;
    const markIfPromptRendered = () => {
      if (document.querySelector('#owner-token-input, .contract-token-prompt')) {
        probeWindow.__resofeedSawTokenPrompt = true;
      }
    };
    new MutationObserver(markIfPromptRendered).observe(document.documentElement, { childList: true, subtree: true });
    markIfPromptRendered();
  }, ownerToken);
}

test('saved token + narrow Inspector URL hard reload keeps Inspector without token prompt', async ({ page, runInfo, ownerToken }) => {
  const item = await seedFixtureItem(runInfo, ownerToken);
  await page.setViewportSize({ width: 390, height: 844 });
  await installTokenPromptProbe(page, ownerToken);

  await page.goto(`/items/${encodeURIComponent(item.id)}`);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#owner-token-input')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'INSPECTOR' })).toBeVisible();
  await expect(page.getByRole('heading', { name: item.title })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${encodeURIComponent(item.id)}$`));
  await expect.poll(async () => page.evaluate(() => (window as PromptProbeWindow).__resofeedSawTokenPrompt)).toBe(false);
});

test('no saved token on narrow Inspector URL still shows owner token prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installTokenPromptProbe(page);

  await page.goto('/items/mobile-auth-regression-smoke');

  await expect(page.locator('#owner-token-input')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
});
