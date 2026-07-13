import type { APIRequestContext, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const assertion = 'RF-BUG-002_SEARCH_ROUTE_HISTORY_ASSERTION';
const auth = (ownerToken: string) => ({ Authorization: `Bearer ${ownerToken}` });

async function setLanguage(request: APIRequestContext, baseURL: string, ownerToken: string, language: 'en' | 'zh'): Promise<void> {
  const response = await request.put(`${baseURL}/api/runtime/language`, {
    headers: { ...auth(ownerToken), 'Content-Type': 'application/json' },
    data: {
      language,
      actor_kind: 'human',
      actor_id: 'owner',
      idempotency_key: `rfbug002-search-language-${language}-${Date.now()}`
    }
  });
  expect(response.status()).toBe(200);
}

async function installToken(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
    Object.defineProperty(window, '__rfbug002InitialHistoryLength', {
      value: window.history.length,
      configurable: true
    });
  }, ownerToken);
}

async function waitForShell(page: Page): Promise<void> {
  await expect(page.locator('#steer-input')).toBeVisible();
}

async function openSearchFromSteer(page: Page, query: string): Promise<void> {
  const steer = page.locator('#steer-input');
  await steer.fill(`search ${query}`);
  await steer.press('Enter');
  await expect(page.locator('main[data-surface="search"]')).toBeVisible();
}

test('[RF-BUG-002] Search canonical URL maps search to q', async ({ page, request, runInfo, ownerToken }) => {
  await installToken(page, ownerToken);
  for (const language of ['en', 'zh'] as const) {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await page.goto('/?q=exact%20bytes&source=src_literal&from=2026-07-01&to=2026-07-12&resonated=true&limit=20');
    await waitForShell(page);

    expect(await page.locator('main').getAttribute('data-surface'), assertion).toBe('search');
    expect(await page.locator('#search-query').inputValue(), assertion).toBe('exact bytes');
    expect(await page.locator('#search-source').inputValue(), assertion).toBe('src_literal');
    expect(await page.locator('#search-from').inputValue(), assertion).toBe('2026-07-01');
    expect(await page.locator('#search-to').inputValue(), assertion).toBe('2026-07-12');
    expect(await page.locator('#search-resonated').isChecked(), assertion).toBe(true);
    expect(await page.locator('#search-limit').inputValue(), assertion).toBe('20');
  }
});

test('[RF-BUG-002] Search validates filters and bounds before request', async ({ page, request, runInfo, ownerToken }) => {
  await installToken(page, ownerToken);
  const searchRequests: string[] = [];
  page.on('request', (candidate) => {
    if (new URL(candidate.url()).pathname === '/api/search') searchRequests.push(candidate.url());
  });

  for (const language of ['en', 'zh'] as const) {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    for (const rawQuery of ['q=%C3%28', 'q=%&from=2026-07-12&to=2026-07-01', 'q=bounded&limit=101']) {
      const beforeRequests = searchRequests.length;
      await page.goto(`/?${rawQuery}`);
      await waitForShell(page);

      expect(await page.locator('main').getAttribute('data-surface'), assertion).toBe('search');
      await expect(page.getByRole('alert')).toHaveCount(1);
      expect(searchRequests.length, assertion).toBe(beforeRequests);
      const historyLengths = await page.evaluate(() => ({
        initial: (window as typeof window & { __rfbug002InitialHistoryLength: number }).__rfbug002InitialHistoryLength,
        current: window.history.length
      }));
      expect(historyLengths.current, assertion).toBe(historyLengths.initial);
    }
  }
});

test('[RF-BUG-002] Search submit writes bounded history state', async ({ page, request, runInfo, ownerToken }) => {
  await installToken(page, ownerToken);
  for (const language of ['en', 'zh'] as const) {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await page.goto('/');
    await waitForShell(page);
    await openSearchFromSteer(page, 'sqlite exact bytes');

    const state = await page.evaluate(() => window.history.state as Record<string, unknown> | null);
    const url = new URL(page.url());
    expect(url.pathname, assertion).toBe('/');
    expect(url.searchParams.get('q'), assertion).toBe('sqlite exact bytes');
    expect(url.searchParams.has('search'), assertion).toBe(false);
    expect(state, assertion).toMatchObject({ surface: 'search', searchQuery: 'sqlite exact bytes' });
    expect(JSON.stringify(state).length, assertion).toBeLessThan(2048);
    expect(JSON.stringify(state), assertion).not.toMatch(/"items"|"results"|"history"/u);
  }
});

test('[RF-BUG-002] Search Back Forward refresh restores valid state', async ({ page, request, runInfo, ownerToken }) => {
  await installToken(page, ownerToken);
  for (const language of ['en', 'zh'] as const) {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await page.goto('/');
    await waitForShell(page);
    await openSearchFromSteer(page, `history ${language}`);

    const steer = page.locator('#steer-input');
    await steer.fill('source ledger');
    await steer.press('Enter');
    await expect(page.locator('main[data-surface="ledger"]')).toBeVisible();

    await page.goBack();
    await expect(page.locator('main[data-surface="search"]')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('q'), assertion).toBe(`history ${language}`);
    expect(await page.locator('#search-query').inputValue(), assertion).toBe(`history ${language}`);

    await page.reload();
    await waitForShell(page);
    expect(await page.locator('main').getAttribute('data-surface'), assertion).toBe('search');
    expect(await page.locator('#search-query').inputValue(), assertion).toBe(`history ${language}`);

    await page.goForward();
    await expect(page.locator('main[data-surface="ledger"]')).toBeVisible();
  }
});
