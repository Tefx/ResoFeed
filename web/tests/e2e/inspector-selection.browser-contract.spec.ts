import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

const now = '2026-07-12T08:00:00Z';
const source = {
  id: 'src_rfbug001',
  url: 'https://rfbug001.example.test/feed.xml',
  title: 'RF BUG Inspector Source',
  last_fetch_at: now,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
};
const itemA = {
  id: 'item_rfbug001_a', source_id: source.id, source_title: source.title,
  url: 'https://rfbug001.example.test/a', title: 'RF BUG item A', localized_title: 'RF BUG item A',
  summary: 'Readable summary A.', core_insight: 'Readable insight A.', key_points: ['A1', 'A2', 'A3'],
  display_excerpt: 'Readable excerpt A.', value_tier: 'high', published_at: now, first_seen_at: now,
  extraction_status: 'full', extraction_source: 'local_readable', model_status: 'ok', content_status: 'ok',
  is_resonated: false, human_inspected_at: null, external_surfaced_at: null, story_key: null, duplicate_of_item_id: null
};
const itemB = {
  ...itemA,
  id: 'item_rfbug001_b', url: 'https://rfbug001.example.test/b', title: 'RF BUG item B', localized_title: 'RF BUG item B',
  summary: 'Readable summary B.', core_insight: 'Readable insight B.', key_points: ['B1', 'B2', 'B3'], display_excerpt: 'Readable excerpt B.'
};

function detail(item: typeof itemA) {
  return {
    ...item,
    feed_excerpt: item.display_excerpt,
    source_evidence_text: `Source evidence ${item.id}`,
    extracted_text: `Readable detail ${item.id}`,
    provenance: {
      source_url: source.url,
      canonical_url: item.url,
      original_url: item.url,
      story_key: null,
      duplicate_of_item_id: null,
      grouped_source_items: []
    }
  };
}

function itemIDFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/items\/([^/]+)(?:\/inspect)?$/u);
  if (!match) return null;
  const segment = decodeURIComponent(match[1]);
  if (!segment.startsWith('~')) return segment;
  try {
    return Buffer.from(segment.slice(1), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

async function installSelectionAPI(page: Page) {
  let delayAInspection = false;
  let releaseAInspection: (() => void) | undefined;
  let aDetailReads = 0;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [source] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: [itemA, itemB] } });
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' } } });
    if (url.pathname === '/api/runtime/operation') return route.fulfill({ json: { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } } });
    if (url.pathname === '/api/runtime/openrouter-models' || url.pathname === '/api/runtime/openrouter/models') return route.fulfill({ json: { models: [] } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });

    const itemID = itemIDFromPath(url.pathname);
    if (itemID && url.pathname.endsWith('/inspect')) {
      if (itemID === itemA.id && delayAInspection) {
        return new Promise<void>((resolve) => {
          releaseAInspection = () => {
            void route.fulfill({ json: { item_id: itemA.id, human_inspected_at: now, already_applied: false } }).then(resolve);
          };
        });
      }
      return route.fulfill({ json: { item_id: itemID, human_inspected_at: now, already_applied: false } });
    }
    if (itemID === itemA.id) {
      aDetailReads += 1;
      return route.fulfill({ json: { item: detail(itemA) } });
    }
    if (itemID === itemB.id) return route.fulfill({ json: { item: detail(itemB) } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });

  return {
    delayAInspection: () => { delayAInspection = true; },
    releaseAInspection: () => releaseAInspection?.(),
    aDetailReads: () => aDetailReads
  };
}

test('[RF-BUG-001][desktop] stale detail cannot replace the selected item', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const api = await installSelectionAPI(page);
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: itemA.title })).toBeVisible();
  api.delayAInspection();

  await page.getByRole('button', { name: `Open Inspector for: ${itemA.title}` }).click();
  await page.getByRole('button', { name: `Open Inspector for: ${itemB.title}` }).click();
  await expect(page.getByRole('heading', { name: itemB.title })).toBeVisible();
  api.releaseAInspection();
  await expect.poll(api.aDetailReads).toBeGreaterThan(1);

  const inspector = page.getByRole('complementary', { name: itemB.title });
  const snapshot = {
    heading: await inspector.getByRole('heading').first().textContent(),
    readable: await inspector.getByText('Readable summary B.').isVisible(),
    staleA: await inspector.getByText('Readable summary A.').count(),
    loading: await inspector.getByText(/^loading$/i).count()
  };
  expect(snapshot, 'Expected selected inspector item to remain current').toEqual({
    heading: itemB.title,
    readable: true,
    staleA: 0,
    loading: 0
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: itemB.title }), 'Expected selected inspector item to remain current after viewport change').toBeVisible();
});

function seedRealSelectionDatabase(dbPath: string): void {
  const database = new DatabaseSync(dbPath);
  try {
    database.exec('begin immediate');
    database.prepare(`
      insert or replace into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, last_fetch_error, is_active, revision)
      values (?, ?, ?, ?, ?, 'ok', null, 1, 1)
    `).run(source.id, source.url, source.title, now, now);

    const insertItem = database.prepare(`
      insert or replace into items (
        id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text,
        summary, core_insight, value_tier, published_at, first_seen_at, extraction_status,
        model_status, story_key, duplicate_of_item_id, source_item_title, localized_title,
        key_points, content_status, extraction_source, source_evidence_text
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, ?, ?, ?, ?, ?)
    `);
    insertItem.run(
      itemA.id, source.id, source.url, itemA.url, itemA.url, itemA.title, itemA.display_excerpt,
      `Readable detail ${itemA.id} ${'A'.repeat(4_000_000)}`, itemA.summary, itemA.core_insight,
      itemA.value_tier, itemA.published_at, itemA.first_seen_at, itemA.extraction_status,
      itemA.model_status, itemA.title, itemA.localized_title, JSON.stringify(itemA.key_points),
      itemA.content_status, itemA.extraction_source, `Source evidence ${itemA.id}`
    );
    insertItem.run(
      itemB.id, source.id, source.url, itemB.url, itemB.url, itemB.title, itemB.display_excerpt,
      `Readable detail ${itemB.id}`, itemB.summary, itemB.core_insight, itemB.value_tier,
      itemB.published_at, itemB.first_seen_at, itemB.extraction_status, itemB.model_status,
      itemB.title, itemB.localized_title, JSON.stringify(itemB.key_points), itemB.content_status,
      itemB.extraction_source, `Source evidence ${itemB.id}`
    );
    database.prepare('delete from item_state where item_id in (?, ?)').run(itemA.id, itemB.id);
    database.exec('commit');
  } catch (error) {
    database.exec('rollback');
    throw error;
  } finally {
    database.close();
  }
}

function inspectedAtFromDatabase(dbPath: string, itemID: string): string | null {
  const database = new DatabaseSync(dbPath);
  try {
    const row = database.prepare('select human_inspected_at from item_state where item_id = ?').get(itemID) as { human_inspected_at?: string | null } | undefined;
    return row?.human_inspected_at ?? null;
  } finally {
    database.close();
  }
}

test('[RF-BUG-001] real API SQLite stale selection seam', async ({ page, runInfo, ownerToken }) => {
  seedRealSelectionDatabase(runInfo.dbPath);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);

  const productRequests: string[] = [];
  page.on('request', (candidate) => {
    const url = new URL(candidate.url());
    const itemID = itemIDFromPath(url.pathname);
    if (url.pathname === '/api/feed/today') productRequests.push(`${candidate.method()} feed`);
    if (itemID) productRequests.push(`${candidate.method()} ${itemID}${url.pathname.endsWith('/inspect') ? ' inspect' : ' detail'}`);
  });

  await page.goto(runInfo.baseURL);
  await expect(page.getByRole('heading', { name: itemA.title })).toBeVisible();

  const aDetailResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && itemIDFromPath(url.pathname) === itemA.id && !url.pathname.endsWith('/inspect');
  });
  const aInspectionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && itemIDFromPath(url.pathname) === itemA.id && url.pathname.endsWith('/inspect');
  });
  const bDetailResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && itemIDFromPath(url.pathname) === itemB.id && !url.pathname.endsWith('/inspect');
  });
  const bInspectionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && itemIDFromPath(url.pathname) === itemB.id && url.pathname.endsWith('/inspect');
  });

  await page.getByRole('button', { name: `Open Inspector for: ${itemA.title}` }).click();
  await page.getByRole('button', { name: `Open Inspector for: ${itemB.title}` }).click();

  const [aDetail, aInspection, bDetail, bInspection] = await Promise.all([
    aDetailResponse,
    aInspectionResponse,
    bDetailResponse,
    bInspectionResponse
  ]);
  expect([aDetail.status(), aInspection.status(), bDetail.status(), bInspection.status()]).toEqual([200, 200, 200, 200]);
  const aInspectionBody = await aInspection.json() as { item_id: string };
  const bInspectionBody = await bInspection.json() as { item_id: string };

  const inspector = page.getByRole('complementary', { name: itemB.title });
  await expect(inspector.getByRole('heading', { name: itemB.title })).toBeVisible();
  await expect(inspector.getByText(itemB.summary)).toBeVisible();
  await expect(inspector.getByText(itemA.summary)).toHaveCount(0);
  await expect(page.locator('.contract-feed-item', { hasText: itemB.title })).toHaveAttribute('aria-current', 'true');

  expect({
    aInspectionItem: aInspectionBody.item_id,
    bInspectionItem: bInspectionBody.item_id,
    aInspectedAt: inspectedAtFromDatabase(runInfo.dbPath, itemA.id),
    bInspectedAt: inspectedAtFromDatabase(runInfo.dbPath, itemB.id),
    selectedTitle: await inspector.getByRole('heading').first().textContent(),
    observedRealSeam: productRequests.includes(`GET ${itemA.id} detail`)
      && productRequests.includes(`POST ${itemA.id} inspect`)
      && productRequests.includes(`GET ${itemB.id} detail`)
      && productRequests.includes(`POST ${itemB.id} inspect`)
  }, 'real API and SQLite preserve selected-item/detail/inspection ownership after stale completion').toMatchObject({
    aInspectionItem: itemA.id,
    bInspectionItem: itemB.id,
    aInspectedAt: expect.any(String),
    bInspectedAt: expect.any(String),
    selectedTitle: itemB.title,
    observedRealSeam: true
  });

  console.log('RF-BUG-001_REAL_API_SQLITE_SEAM=ready');
});
