import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import type { APIRequestContext, Page } from 'playwright/test';

import { expect, test } from './fixtures/runtime-fixture';

const frontendGap = 'IDL-FRONTEND-APP-HISTORY-GAP';
const ownerTokenStorageKey = 'resofeed.ownerToken';
const primaryID = 'item_deep_link_browser_primary';
const secondaryID = 'item_deep_link_browser_secondary';
const primaryTitle = 'Deep link browser primary';
const secondaryTitle = 'Deep link browser secondary';

interface ItemWireRequest {
  readonly method: string;
  readonly path: string;
}

function itemAppPath(itemID: string): string {
  if (itemID === '.') return '/items/!.';
  if (itemID === '..') return '/items/!..';
  let segment = encodeURIComponent(itemID).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  if (segment.startsWith('~')) segment = `%7E${segment.slice(1)}`;
  return `/items/${segment}`;
}

function itemAPIPath(itemID: string): string {
  return `/api/items/~${Buffer.from(itemID, 'utf8').toString('base64url')}`;
}

function seedBrowserItems(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('pragma busy_timeout = 5000; begin immediate');
    database.prepare(`insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision)
      values (?, ?, ?, ?, 'not_fetched', 1, 1)`).run(
      'src_item_deep_link_browser',
      'https://deep-link-browser.example.test/feed.xml',
      'Deep Link Browser Source',
      '2026-07-26T12:00:00Z'
    );
    const insertItem = database.prepare(`insert into items (
      id, source_id, source_url, url, canonical_url, title, source_item_title,
      localized_title, summary, core_insight, key_points, feed_excerpt, extracted_text,
      value_tier, published_at, first_seen_at, extraction_status, extraction_source,
      content_status, model_status, story_key, duplicate_of_item_id
    ) values (?, 'src_item_deep_link_browser', 'https://deep-link-browser.example.test/feed.xml', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'high', ?, ?, 'full', 'local_readable', 'available', 'ok', ?, null)`);
    const insertFTS = database.prepare(`insert into search_fts (
      item_id, title, source_item_title, localized_title, source_title, feed_excerpt,
      summary, core_insight, key_points, extracted_text, provenance
    ) values (?, ?, ?, ?, 'Deep Link Browser Source', ?, ?, ?, ?, ?, ?)`);
    for (const row of [
      { id: primaryID, title: primaryTitle, minute: '02', story: 'story_deep_link_browser_primary' },
      { id: secondaryID, title: secondaryTitle, minute: '01', story: 'story_deep_link_browser_secondary' }
    ]) {
      const articleURL = `https://deep-link-browser.example.test/articles/${row.id}`;
      const published = `2026-07-26T12:${row.minute}:00Z`;
      const summary = `Summary for ${row.title}`;
      const insight = `Core insight for ${row.title}`;
      const points = '["one","two","three"]';
      const excerpt = `Feed excerpt for ${row.title}`;
      const extracted = `Extracted text for ${row.title}`;
      insertItem.run(
        row.id,
        articleURL,
        articleURL,
        row.title,
        row.title,
        row.title,
        summary,
        insight,
        points,
        excerpt,
        extracted,
        published,
        published,
        row.story
      );
      insertFTS.run(row.id, row.title, row.title, row.title, excerpt, summary, insight, points, extracted, `${articleURL} ${row.story}`);
    }
    database.exec('commit');
  } catch (error) {
    try {
      database.exec('rollback');
    } catch {
      // Preserve the original fixture error.
    }
    throw error;
  } finally {
    database.close();
  }
}

function itemStateSnapshot(databasePath: string): string {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database.prepare(`select item_id, is_resonated, human_inspected_at, external_surfaced_at,
      last_actor_kind, last_actor_id from item_state
      where item_id in (?, ?) order by item_id`).all(primaryID, secondaryID);
    return JSON.stringify(rows);
  } finally {
    database.close();
  }
}

async function readItem(request: APIRequestContext, baseURL: string, ownerToken: string, itemID: string): Promise<Record<string, unknown>> {
  const response = await request.get(`${baseURL}${itemAPIPath(itemID)}`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  const text = await response.text();
  expect(response.status(), `${frontendGap}: real item fixture read failed: ${text}`).toBe(200);
  return JSON.parse(text) as Record<string, unknown>;
}

function itemProjection(envelope: Record<string, unknown>): string {
  const item = envelope.item as Record<string, unknown> | undefined;
  return JSON.stringify({
    id: item?.id,
    is_resonated: item?.is_resonated,
    human_inspected_at: item?.human_inspected_at,
    external_surfaced_at: item?.external_surfaced_at
  });
}

async function installFirstSurfaceProbe(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
    const samples: Array<{ surface: string; title: string }> = [];
    Object.defineProperty(window, '__itemDeepLinkFirstSurfaces', { value: samples, configurable: true });
    const record = () => {
      const shell = document.querySelector<HTMLElement>('main[data-surface]');
      if (!shell) return;
      const sample = { surface: shell.dataset.surface ?? '', title: document.title };
      const previous = samples.at(-1);
      if (!previous || previous.surface !== sample.surface || previous.title !== sample.title) samples.push(sample);
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true, attributes: true });
    document.addEventListener('DOMContentLoaded', record);
  }, ownerTokenStorageKey);
}

async function expectInspector(page: Page, title: string, path: string, baseURL: string): Promise<void> {
  await expect(page, `${frontendGap}: Inspector URL drift`).toHaveURL(`${baseURL}${path}`);
  await expect(page, `${frontendGap}: Inspector title drift`).toHaveTitle('RESOFEED · INSPECTOR');
  const heading = page.getByRole('heading', { name: title });
  await expect(heading, `${frontendGap}: Inspector did not render ${title}`).toBeVisible();
}

function itemWrites(requests: readonly ItemWireRequest[]): readonly ItemWireRequest[] {
  return requests.filter((request) => request.method !== 'GET' && request.path.startsWith('/api/items/'));
}

test.setTimeout(120_000);

test('ITEM-DEEP-LINK browser history auth error read-only lifecycle', async ({ page, request, runtime }) => {
  seedBrowserItems(runtime.database.path);
  const stateBefore = itemStateSnapshot(runtime.database.path);
  const detailBefore = itemProjection(await readItem(request, runtime.baseURL, runtime.ownerToken, primaryID));
  const wire: ItemWireRequest[] = [];
  page.on('request', (candidate) => {
    const url = new URL(candidate.url());
    if (url.pathname.startsWith('/api/items/')) wire.push({ method: candidate.method(), path: url.pathname });
  });

  await installFirstSurfaceProbe(page);
  const primaryPath = itemAppPath(primaryID);
  const coldResponse = await page.goto(`${runtime.baseURL}${primaryPath}`);
  expect(coldResponse?.status(), `${frontendGap}: canonical cold load did not reach the SPA`).toBe(200);
  await expect(page, `${frontendGap}: canonical cold-load URL changed`).toHaveURL(`${runtime.baseURL}${primaryPath}`);
  await expect(page, `${frontendGap}: item route did not own the pre-auth title`).toHaveTitle('RESOFEED · INSPECTOR');
  await expect(page.getByRole('heading', { name: 'Enter owner token' }), `${frontendGap}: item route did not retain the owner-token prompt`).toBeVisible();
  const firstSurfaces = await page.evaluate(() => (window as typeof window & {
    __itemDeepLinkFirstSurfaces: Array<{ surface: string; title: string }>;
  }).__itemDeepLinkFirstSurfaces);
  expect(firstSurfaces[0], `${frontendGap}: wrong first surface`).toEqual({ surface: 'inspector', title: 'RESOFEED · INSPECTOR' });
  expect(firstSurfaces.some((sample) => sample.surface === 'feed' || sample.surface === 'search'), `${frontendGap}: TODAY/Search flashed before Inspector`).toBe(false);
  expect(wire, `${frontendGap}: unauthenticated item content request escaped the token boundary`).toEqual([]);

  await page.locator('#owner-token-input').fill(runtime.ownerToken);
  await page.getByRole('button', { name: '[SUBMIT]' }).click();
  await expectInspector(page, primaryTitle, primaryPath, runtime.baseURL);
  await expect(page.getByRole('heading', { name: primaryTitle }), `${frontendGap}: accepted item-route authentication focus`).toBeFocused();
  expect(itemWrites(wire), `${frontendGap}: authentication recovery performed an item mutation`).toEqual([]);

  await page.reload();
  await expectInspector(page, primaryTitle, primaryPath, runtime.baseURL);
  expect(itemWrites(wire), `${frontendGap}: refresh performed an item mutation`).toEqual([]);
  const detailAfterRefresh = itemProjection(await readItem(request, runtime.baseURL, runtime.ownerToken, primaryID));
  expect(detailAfterRefresh, `${frontendGap}: read-only lifecycle changed item detail state`).toBe(detailBefore);
  expect(itemStateSnapshot(runtime.database.path), `${frontendGap}: cold load/auth/refresh changed item_state`).toBe(stateBefore);

  const invalidPath = '/items/%00';
  const requestsBeforeInvalid = wire.length;
  const invalidResponse = await page.goto(`${runtime.baseURL}${invalidPath}`);
  expect(invalidResponse?.status(), `${frontendGap}: dispatchable invalid route missed SPA fallback`).toBe(200);
  await expect(page, `${frontendGap}: invalid route changed URL`).toHaveURL(`${runtime.baseURL}${invalidPath}`);
  await expect(page, `${frontendGap}: invalid route lost Inspector title`).toHaveTitle('RESOFEED · INSPECTOR');
  await expect(page.getByRole('alert'), `${frontendGap}: invalid route missed localized Inspector error`).toContainText(/Invalid item link|无效的文章链接/u);
  expect(wire.slice(requestsBeforeInvalid), `${frontendGap}: invalid route issued an item API request`).toEqual([]);

  const missingPath = itemAppPath('item_deep_link_browser_missing');
  const writesBeforeMissing = itemWrites(wire).length;
  await page.goto(`${runtime.baseURL}${missingPath}`);
  await expect(page, `${frontendGap}: not-found route changed URL`).toHaveURL(`${runtime.baseURL}${missingPath}`);
  await expect(page, `${frontendGap}: not-found route lost Inspector title`).toHaveTitle('RESOFEED · INSPECTOR');
  await expect(page.getByRole('alert'), `${frontendGap}: not-found route missed localized Inspector error`).toContainText(/Item does not exist or was deleted|文章不存在或已被删除/u);
  expect(itemWrites(wire), `${frontendGap}: not-found read performed a mutation`).toHaveLength(writesBeforeMissing);

  await page.goto(`${runtime.baseURL}/`);
  await expect(page, `${frontendGap}: Feed title`).toHaveTitle('RESOFEED · TODAY');
  const secondaryButton = page.getByRole('button', { name: `Open Inspector for: ${secondaryTitle}` });
  await expect(secondaryButton, `${frontendGap}: seeded Feed row missing`).toBeVisible();
  const writesBeforeActivation = itemWrites(wire).length;
  await secondaryButton.click();
  const secondaryPath = itemAppPath(secondaryID);
  await expectInspector(page, secondaryTitle, secondaryPath, runtime.baseURL);
  const explicitWrites = itemWrites(wire).slice(writesBeforeActivation);
  expect(explicitWrites.filter((entry) => entry.path === `${itemAPIPath(secondaryID)}/inspect`), `${frontendGap}: deliberate activation inspection cardinality`).toHaveLength(1);
  expect(explicitWrites.filter((entry) => /\/(?:delivery|resonance)$/u.test(entry.path)), `${frontendGap}: deliberate activation emitted unrelated writes`).toEqual([]);

  const writesAfterActivation = itemWrites(wire).length;
  await page.goBack();
  await expect(page, `${frontendGap}: Back did not restore TODAY`).toHaveURL(`${runtime.baseURL}/`);
  await expect(page, `${frontendGap}: Back title`).toHaveTitle('RESOFEED · TODAY');
  await page.goForward();
  await expectInspector(page, secondaryTitle, secondaryPath, runtime.baseURL);
  expect(itemWrites(wire), `${frontendGap}: Back/Forward duplicated inspection`).toHaveLength(writesAfterActivation);

  const historyState = await page.evaluate(() => window.history.state as Record<string, unknown> | null);
  expect(historyState?.version, `${frontendGap}: versioned item history state`).toBe(1);
  expect(historyState?.surface, `${frontendGap}: item history surface`).toBe('inspector');
  expect(historyState?.itemId, `${frontendGap}: item history identity`).toBe(secondaryID);
  const allowedHistoryKeys = new Set([
    'version', 'surface', 'itemId', 'originSurface', 'feedPaneScrollTop', 'windowScrollY',
    'searchRegionScrollTop', 'returnFocusItemId'
  ]);
  expect(Object.keys(historyState ?? {}).filter((key) => !allowedHistoryKeys.has(key)), `${frontendGap}: history stored payload or unbounded state`).toEqual([]);
  expect(JSON.stringify(historyState), `${frontendGap}: history leaked token or item payload`).not.toMatch(/ownerToken|summary|core_insight|items|results/iu);

  await page.getByRole('button', { name: 'Return to TODAY' }).click();
  await expect(page, `${frontendGap}: route-aware Feed Close`).toHaveURL(`${runtime.baseURL}/`);
  await expect(page.getByRole('button', { name: `Open Inspector for: ${secondaryTitle}` }), `${frontendGap}: Feed restoration row focus`).toBeFocused();

  const searchURL = `${runtime.baseURL}/?q=Deep%20link&limit=10`;
  await page.goto(searchURL);
  await expect(page, `${frontendGap}: Search title`).toHaveTitle('RESOFEED · SEARCH');
  const primarySearchButton = page.getByRole('button', { name: `Open Inspector for: ${primaryTitle}` });
  await expect(primarySearchButton, `${frontendGap}: canonical Search did not retrieve current corpus`).toBeVisible();
  const writesBeforeSearchActivation = itemWrites(wire).length;
  await primarySearchButton.click();
  await expectInspector(page, primaryTitle, primaryPath, runtime.baseURL);
  expect(itemWrites(wire).slice(writesBeforeSearchActivation).filter((entry) => entry.path === `${itemAPIPath(primaryID)}/inspect`), `${frontendGap}: Search activation inspection cardinality`).toHaveLength(1);
  await page.goBack();
  await expect(page, `${frontendGap}: Search Back URL/filter restoration`).toHaveURL(searchURL);
  await expect(page, `${frontendGap}: Search Back title`).toHaveTitle('RESOFEED · SEARCH');
  await expect(primarySearchButton, `${frontendGap}: Search Back focus restoration`).toBeFocused();

  await page.goto(`${runtime.baseURL}${primaryPath}`);
  await expectInspector(page, primaryTitle, primaryPath, runtime.baseURL);
  await page.getByRole('button', { name: 'Return to Feed' }).click();
  await expect(page, `${frontendGap}: external Close did not replace with Feed`).toHaveURL(`${runtime.baseURL}/`);
  await page.goBack();
  await expect(page, `${frontendGap}: Back after external Close reopened Inspector`).not.toHaveTitle('RESOFEED · INSPECTOR');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${runtime.baseURL}${secondaryPath}`);
  await expectInspector(page, secondaryTitle, secondaryPath, runtime.baseURL);
  await page.reload();
  await expectInspector(page, secondaryTitle, secondaryPath, runtime.baseURL);
  await expect(page.getByRole('button', { name: 'Return to Feed' }), `${frontendGap}: narrow sticky visible Close`).toBeVisible();

  const stateAfter = itemStateSnapshot(runtime.database.path);
  const database = new DatabaseSync(runtime.database.path, { readOnly: true });
  try {
    const rows = database.prepare(`select item_id from item_state
      where human_inspected_at is not null and item_id in (?, ?) order by item_id`).all(primaryID, secondaryID) as Array<{ item_id: string }>;
    expect(rows.map((row) => row.item_id), `${frontendGap}: effective deliberate mutation targets`).toEqual([primaryID, secondaryID]);
  } finally {
    database.close();
  }
  expect(stateAfter, `${frontendGap}: browser lifecycle did not produce bounded item-state rows`).not.toBe(stateBefore);
  expect(itemWrites(wire).filter((entry) => /\/(?:delivery|resonance)$/u.test(entry.path)), `${frontendGap}: route lifecycle changed delivery or resonance`).toEqual([]);

  console.info('ITEM_DEEP_LINK_HISTORY=complete');
  console.info('ITEM_DEEP_LINK_AUTH_RECOVERY=complete');
  console.info('ITEM_DEEP_LINK_ERRORS=complete');
  console.info('ITEM_DEEP_LINK_MUTATION_TARGET=complete');
  console.info('ITEM_DEEP_LINK_BROWSER_MATRIX=complete');
});
