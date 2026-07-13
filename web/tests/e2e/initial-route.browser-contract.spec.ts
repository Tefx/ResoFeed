import { Buffer } from 'node:buffer';
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
      idempotency_key: `rfbug002-route-language-${language}-${Date.now()}`
    }
  });
  expect(response.status()).toBe(200);
}

async function installFirstSurfaceProbe(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
    const observed: Array<{ surface: string; title: string }> = [];
    Object.defineProperty(window, '__rfbug002FirstSurfaces', { value: observed, configurable: true });
    const record = () => {
      const shell = document.querySelector<HTMLElement>('main[data-surface]');
      if (!shell) return;
      const surface = shell.dataset.surface ?? '';
      const sample = { surface, title: document.title };
      const prior = observed.at(-1);
      if (!prior || prior.surface !== sample.surface || prior.title !== sample.title) observed.push(sample);
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true, attributes: true });
    document.addEventListener('DOMContentLoaded', record);
  }, ownerToken);
}

async function assertOpaqueColdLoadAndRefresh(page: Page, item: { id: string }): Promise<void> {
  const token = `~${Buffer.from(item.id, 'utf8').toString('base64url')}`;
  const route = `/items/${token}`;

  for (const transition of ['cold load', 'refresh'] as const) {
    if (transition === 'cold load') await page.goto(route);
    else await page.reload();

    await expect(page.getByRole('textbox', { name: /Steer or paste RSS URL|导向或粘贴 RSS URL/ })).toBeVisible();
    const samples = await page.evaluate(() => (window as typeof window & {
      __rfbug002FirstSurfaces: Array<{ surface: string; title: string }>;
    }).__rfbug002FirstSurfaces);
    expect(samples[0]?.surface, `Expected canonical opaque item surface before TODAY during ${transition}`).toBe('inspector');
    expect(samples.some((sample) => sample.surface === 'feed'), `Expected canonical opaque item surface before TODAY during ${transition}`).toBe(false);
    await expect(page).toHaveURL(new RegExp(`/items/${token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`));
    expect(await page.title(), 'Expected canonical opaque item surface before TODAY').toBe('RESOFEED · INSPECTOR');
  }
}

for (const language of ['en', 'zh'] as const) {
  test(`[RF-BUG-002][${language}] opaque item cold load and refresh`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    const item = { id: '项目/百分号%?query#fragment' };
    await installFirstSurfaceProbe(page, ownerToken);
    await assertOpaqueColdLoadAndRefresh(page, item);
  });
}

const initialRouteAssertion = 'RF-BUG-002_INITIAL_ROUTE_MATRIX_ASSERTION';
type InitialRoute = {
  pathname: string;
  query: string | null;
  surface: 'feed' | 'inspector' | 'ledger' | 'search';
  title: string;
};

function initialRouteURL(route: InitialRoute): string {
  return route.query === null ? route.pathname : `${route.pathname}?q=${encodeURIComponent(route.query)}`;
}

async function assertResolvedInitialRoute(page: Page, route: InitialRoute): Promise<void> {
  await expect(page.getByRole('textbox', { name: /Steer or paste RSS URL|导向或粘贴 RSS URL/ })).toBeVisible();
  const samples = await page.evaluate(() => (window as typeof window & {
    __rfbug002FirstSurfaces: Array<{ surface: string; title: string }>;
  }).__rfbug002FirstSurfaces);
  const expectedSample = { surface: route.surface, title: route.title };

  expect(samples[0], initialRouteAssertion).toEqual(expectedSample);
  expect(samples.filter((sample) => sample.surface !== route.surface || sample.title !== route.title), initialRouteAssertion).toEqual([]);

  const currentURL = new URL(page.url());
  expect(currentURL.pathname, initialRouteAssertion).toBe(route.pathname);
  expect(currentURL.searchParams.get('q'), initialRouteAssertion).toBe(route.query);
  expect(currentURL.searchParams.has('search'), initialRouteAssertion).toBe(false);
  expect(await page.title(), initialRouteAssertion).toBe(route.title);
}

async function assertRouteColdLoadAndRefresh(page: Page, route: InitialRoute): Promise<void> {
  for (const transition of ['cold load', 'refresh'] as const) {
    if (transition === 'cold load') await page.goto(initialRouteURL(route));
    else await page.reload();
    await assertResolvedInitialRoute(page, route);
  }
}

for (const language of ['en', 'zh'] as const) {
  const todayRoute: InitialRoute = { pathname: '/', query: null, surface: 'feed', title: 'RESOFEED · TODAY' };
  const ledgerRoute: InitialRoute = { pathname: '/source-ledger', query: null, surface: 'ledger', title: 'RESOFEED · SOURCE LEDGER' };
  const searchRoute: InitialRoute = { pathname: '/', query: `initial route ${language}`, surface: 'search', title: 'RESOFEED · SEARCH' };
  const itemID = `项目/百分号%?query#fragment-${language}`;
  const itemToken = `~${Buffer.from(itemID, 'utf8').toString('base64url')}`;
  const itemRoute: InitialRoute = { pathname: `/items/${itemToken}`, query: null, surface: 'inspector', title: 'RESOFEED · INSPECTOR' };

  test(`[RF-BUG-002][${language}] TODAY cold load and refresh`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await installFirstSurfaceProbe(page, ownerToken);
    await assertRouteColdLoadAndRefresh(page, todayRoute);
  });

  test(`[RF-BUG-002][${language}] SOURCE LEDGER cold load and refresh`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await installFirstSurfaceProbe(page, ownerToken);
    await assertRouteColdLoadAndRefresh(page, ledgerRoute);
  });

  test(`[RF-BUG-002][${language}] SEARCH cold load and refresh`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await installFirstSurfaceProbe(page, ownerToken);
    await assertRouteColdLoadAndRefresh(page, searchRoute);
  });

  test(`[RF-BUG-002][${language}] Back and Forward preserve TODAY SEARCH and opaque item routes`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    await installFirstSurfaceProbe(page, ownerToken);

    await page.goto(initialRouteURL(todayRoute));
    await assertResolvedInitialRoute(page, todayRoute);
    await page.goto(initialRouteURL(searchRoute));
    await assertResolvedInitialRoute(page, searchRoute);
    await page.goto(initialRouteURL(itemRoute));
    await assertResolvedInitialRoute(page, itemRoute);

    await page.goBack();
    await assertResolvedInitialRoute(page, searchRoute);
    await page.goBack();
    await assertResolvedInitialRoute(page, todayRoute);
    await page.goForward();
    await assertResolvedInitialRoute(page, searchRoute);
    await page.goForward();
    await assertResolvedInitialRoute(page, itemRoute);
  });
}
