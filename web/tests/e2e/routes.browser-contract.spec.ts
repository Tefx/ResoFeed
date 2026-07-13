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

const searchFixtureTimestamp = '2026-07-12T09:00:00Z';

function searchFixtureItem(id: string, title: string) {
  return {
    id,
    source_id: 'src_rfbug002_search',
    source_title: 'RF BUG Search Source',
    url: `https://rfbug002.example.test/${id}`,
    title,
    localized_title: title,
    source_item_title: title,
    summary: `${title} summary.`,
    core_insight: `${title} insight.`,
    key_points: [`${title} point`],
    display_excerpt: `${title} excerpt.`,
    value_tier: 'high',
    published_at: searchFixtureTimestamp,
    first_seen_at: searchFixtureTimestamp,
    extraction_status: 'full',
    extraction_source: 'local_readable',
    model_status: 'ok',
    content_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  };
}

function searchFixtureDetail(item: ReturnType<typeof searchFixtureItem>) {
  return {
    ...item,
    feed_excerpt: item.display_excerpt,
    source_evidence_text: `${item.title} source evidence.`,
    extracted_text: `${item.title} extracted detail.`,
    provenance: {
      source_url: 'https://rfbug002.example.test/feed.xml',
      canonical_url: item.url,
      original_url: item.url,
      story_key: null,
      duplicate_of_item_id: null,
      grouped_source_items: []
    }
  };
}

async function installSearchSelectionAPI(page: Page, fixtureItems: readonly ReturnType<typeof searchFixtureItem>[]): Promise<void> {
  await page.route('**/api/items/**', async (route) => {
    const candidate = route.request();
    const url = new URL(candidate.url());
    const itemID = decodeURIComponent(url.pathname.split('/')[3] ?? '');
    const item = fixtureItems.find((fixture) => fixture.id === itemID);
    if (!item) {
      await route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
      return;
    }
    if (candidate.method() === 'POST' && url.pathname.endsWith('/inspect')) {
      await route.fulfill({ json: { item_id: item.id, human_inspected_at: searchFixtureTimestamp, already_applied: false } });
      return;
    }
    await route.fulfill({ json: { item: searchFixtureDetail(item) } });
  });
}

test('[RF-BUG-002] Search ignores stale completion and preserves latest selection', async ({ page, ownerToken }) => {
  const staleItem = searchFixtureItem('item_rfbug002_stale', 'Stale generation result');
  const latestItem = searchFixtureItem('item_rfbug002_latest', 'Latest generation result');
  const observedQueries: string[] = [];
  let releaseStale: () => void = () => {};
  const staleGate = new Promise<void>((resolve) => { releaseStale = resolve; });
  let staleCompleted = false;

  await installSearchSelectionAPI(page, [staleItem, latestItem]);
  await page.route('**/api/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    observedQueries.push(query);
    if (query === 'stale generation') {
      await staleGate;
      await route.fulfill({ json: { items: [staleItem], query: { q: query, source: null, from: null, to: null, resonated: null, limit: 50 } } });
      staleCompleted = true;
      return;
    }
    if (query === 'latest generation') {
      await route.fulfill({ json: { items: [latestItem], query: { q: query, source: null, from: null, to: null, resonated: null, limit: 50 } } });
      return;
    }
    await route.continue();
  });
  await installToken(page, ownerToken);

  await page.goto('/?q=stale%20generation');
  await waitForShell(page);
  await expect.poll(() => observedQueries.includes('stale generation')).toBe(true);

  const query = page.locator('#search-query');
  await query.fill('latest generation');
  await query.press('Enter');
  await expect.poll(() => observedQueries.includes('latest generation')).toBe(true);
  await expect(page.getByRole('heading', { name: latestItem.title })).toBeVisible();
  await expect(page.locator('.contract-search-result', { hasText: latestItem.title })).toHaveAttribute('aria-current', 'true');

  releaseStale();
  await expect.poll(() => staleCompleted).toBe(true);

  const finalState = {
    resultTitles: await page.locator('.contract-search-result .contract-feed-title').allTextContents(),
    selectedTitle: await page.locator('.contract-search-result[aria-current="true"] .contract-feed-title').textContent(),
    inspectorTitle: await page.locator('.detail-pane').getByRole('heading').first().textContent(),
    query: new URL(page.url()).searchParams.get('q')
  };
  expect(finalState, 'RF-BUG-002_SEARCH_GENERATION_ASSERTION latest generation exclusively owns results and Inspector selection').toEqual({
    resultTitles: [latestItem.title],
    selectedTitle: latestItem.title,
    inspectorTitle: latestItem.title,
    query: 'latest generation'
  });
});

test('[RF-BUG-002] Invalid Search edit recovery retains focus and submits corrected request', async ({ page, ownerToken }) => {
  const searchRequests: string[] = [];
  await page.route('**/api/search?**', async (route) => {
    searchRequests.push(route.request().url());
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    await route.fulfill({ json: { items: [], query: { q: query, source: null, from: null, to: null, resonated: null, limit: 50 } } });
  });
  await installToken(page, ownerToken);

  await page.goto('/?q=%C3%28');
  await waitForShell(page);
  const query = page.locator('#search-query');
  const historyBeforeEdit = await page.evaluate(() => ({ length: window.history.length, state: JSON.stringify(window.history.state), href: window.location.href }));
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(searchRequests).toEqual([]);

  await query.fill('recovered search');
  await expect(query, 'RF-BUG-002_INVALID_SEARCH_RECOVERY_ASSERTION edited invalid Search retains input focus').toBeFocused();
  expect.soft(
    await page.getByRole('alert').count(),
    'RF-BUG-002_INVALID_SEARCH_RECOVERY_ASSERTION editing clears stale invalid state before request'
  ).toBe(0);
  expect(searchRequests, 'RF-BUG-002_INVALID_SEARCH_RECOVERY_ASSERTION invalid edit sends no request').toEqual([]);
  expect(
    await page.evaluate(() => ({ length: window.history.length, state: JSON.stringify(window.history.state), href: window.location.href })),
    'RF-BUG-002_INVALID_SEARCH_RECOVERY_ASSERTION invalid edit writes no history'
  ).toEqual(historyBeforeEdit);

  await query.press('Enter');
  await expect.poll(() => searchRequests.length).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(query).toBeFocused();
  expect(new URL(searchRequests[0]).searchParams.get('q')).toBe('recovered search');
  expect(new URL(page.url()).searchParams.get('q')).toBe('recovered search');
});
