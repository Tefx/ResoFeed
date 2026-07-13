import type { APIRequestContext, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const auth = (ownerToken: string) => ({ Authorization: `Bearer ${ownerToken}` });

async function setLanguage(request: APIRequestContext, baseURL: string, ownerToken: string, language: 'en' | 'zh'): Promise<void> {
  const response = await request.put(`${baseURL}/api/runtime/language`, {
    headers: { ...auth(ownerToken), 'Content-Type': 'application/json' },
    data: {
      language,
      actor_kind: 'human',
      actor_id: 'owner',
      idempotency_key: `rfbug006007-language-${language}-${Date.now()}`
    }
  });
  expect(response.status()).toBe(200);
}

async function installToken(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
}

async function waitForShell(page: Page): Promise<void> {
  await expect(page.locator('#steer-input')).toBeVisible();
}

test('[RF-BUG-006] route-derived title updates atomically', async ({ page, request, runInfo, ownerToken }) => {
  await installToken(page, ownerToken);
  const routes = [
    { path: '/', surface: 'feed', title: 'RESOFEED · TODAY' },
    { path: '/source-ledger', surface: 'ledger', title: 'RESOFEED · SOURCE LEDGER' },
    { path: '/?q=title%20contract', surface: 'search', title: 'RESOFEED · SEARCH' },
    { path: '/items/~aXRlbV9taXNzaW5nX3RpdGxlX2NvbnRyYWN0', surface: 'inspector', title: 'RESOFEED · INSPECTOR' },
    { path: '/doctor', surface: 'doctor', title: 'RESOFEED · /doctor' }
  ] as const;

  for (const language of ['en', 'zh'] as const) {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    for (const route of routes) {
      await page.goto(route.path);
      await waitForShell(page);
      expect.soft(await page.locator('main').getAttribute('data-surface'), 'Expected exact route-derived document title surface').toBe(route.surface);
      expect.soft(await page.title(), `Expected exact route-derived document title ${route.title}`).toBe(route.title);
    }

    await page.goto('/');
    await waitForShell(page);
    const steer = page.locator('#steer-input');
    await steer.fill('source ledger');
    await steer.press('Enter');
    await expect(page.locator('main[data-surface="ledger"]')).toBeVisible();
    expect.soft(await page.title(), 'Expected exact route-derived document title after client navigation').toBe('RESOFEED · SOURCE LEDGER');

    await steer.fill('search title history');
    await steer.press('Enter');
    await expect(page.locator('main[data-surface="search"]')).toBeVisible();
    expect.soft(await page.title(), 'Expected exact route-derived document title after Search navigation').toBe('RESOFEED · SEARCH');

    await page.goBack();
    expect.soft(await page.title(), 'Expected exact route-derived document title after Back').toBe('RESOFEED · SOURCE LEDGER');
    await page.goForward();
    expect.soft(await page.title(), 'Expected exact route-derived document title after Forward').toBe('RESOFEED · SEARCH');
  }
});

for (const language of ['en', 'zh'] as const) {
  test(`[RF-BUG-007][${language}] repeated invalid add source remounts one alert`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await installToken(page, ownerToken);
    const mutationRequests: string[] = [];
    page.on('request', (candidate) => {
      const url = new URL(candidate.url());
      if (candidate.method() === 'POST' && url.pathname === '/api/steer') mutationRequests.push(candidate.url());
    });

    await page.goto('/');
    await waitForShell(page);
    const steer = page.locator('#steer-input');
    await steer.fill('add source');
    await page.getByRole('button', { name: 'apply' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toHaveCount(1);
    await alert.evaluate((node) => node.setAttribute('data-rfbug007-attempt', 'first'));

    await page.getByRole('button', { name: 'apply' }).click();
    await expect(alert).toHaveCount(1);
    expect(await alert.getAttribute('data-rfbug007-attempt'), 'Expected one newly mounted alert and retained focus').toBeNull();
    await expect(steer, 'Expected one newly mounted alert and retained focus').toBeFocused();
    await expect(steer).toHaveValue('add source');
    expect(mutationRequests, 'invalid add source must send no mutation').toEqual([]);

    const localizedError = language === 'zh' ? /需要 URL/u : /URL required/i;
    await expect(alert).toHaveText(localizedError);
    await steer.fill('add source edited');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await steer.fill('');
    await expect(steer).not.toHaveAccessibleDescription(localizedError);
    expect(mutationRequests).toEqual([]);
  });
}
