import { Buffer } from 'node:buffer';
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
