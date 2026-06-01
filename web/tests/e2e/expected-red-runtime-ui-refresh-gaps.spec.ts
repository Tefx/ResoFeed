import type { Locator, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const now = '2026-06-01T14:00:00Z';

const sources = [
  {
    id: 'src_runtime_refresh_primary',
    url: 'https://visible-refresh.example.test/rss.xml',
    title: 'Visible Refresh Source',
    last_fetch_at: now,
    last_fetch_status: 'ok',
    last_fetch_error: null,
    is_active: true,
    revision: 1
  },
  {
    id: 'src_runtime_refresh_error',
    url: 'https://visible-refresh.example.test/error.xml',
    title: 'Refresh Error Source',
    last_fetch_at: null,
    last_fetch_status: 'rss_fetch_error',
    last_fetch_error: 'timeout while fetching upstream fixture',
    is_active: true,
    revision: 2
  }
] as const;

const items = [
  {
    id: 'item_runtime_refresh_primary',
    source_id: sources[0].id,
    source_title: sources[0].title,
    source_item_title: 'Literal runtime refresh source title',
    localized_title: '运行时可见刷新缺口',
    url: 'https://visible-refresh.example.test/items/primary',
    title: '运行时可见刷新缺口',
    summary: '摘要必须只在检查器中展开，订阅流保持紧凑扫描。',
    core_insight: '核心洞察在检查器中形成单独阅读层，而不是订阅流卡片。',
    key_points: ['订阅流只保留扫描线索。', '检查器显示结构化要点。', '来源账本保持扁平操作语法。'],
    display_excerpt: 'Fallback excerpt used only as source evidence.',
    value_tier: 'high',
    content_status: 'ok',
    last_reprocess_status: null,
    last_reprocess_error_code: null,
    last_reprocess_error_message: null,
    last_reprocess_at: null,
    published_at: now,
    first_seen_at: now,
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  },
  {
    id: 'item_runtime_refresh_secondary',
    source_id: sources[0].id,
    source_title: sources[0].title,
    source_item_title: 'Second literal source title',
    localized_title: '第二条扫描行',
    url: 'https://visible-refresh.example.test/items/secondary',
    title: '第二条扫描行',
    summary: '第二条摘要用于证明扫描行密度和滚动容器。',
    core_insight: '第二条核心洞察用于独立滚动证据。',
    key_points: ['第一点', '第二点', '第三点'],
    display_excerpt: 'Secondary excerpt.',
    value_tier: null,
    content_status: 'ok',
    last_reprocess_status: null,
    last_reprocess_error_code: null,
    last_reprocess_error_message: null,
    last_reprocess_at: null,
    published_at: '2026-06-01T13:00:00Z',
    first_seen_at: '2026-06-01T13:05:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: true,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  }
] as const;

const runningOperation = {
  running: true,
  kind: 'manual_ingest',
  actor_kind: 'human',
  phase: 'fetching',
  count: { current: 1, total: 2 },
  message: 'manual ingest fetching sources',
  started_at: now,
  updated_at: now
} as const;

async function installVisibleRefreshApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'zh', label: '中文' } } });
    if (path === '/api/runtime/openrouter-models' || path === '/api/runtime/openrouter/models') return route.fulfill({ json: { models: [] } });
    if (path === '/api/runtime/operation') return route.fulfill({ json: { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } } });
    if (path === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (path === '/api/sources') return route.fulfill({ json: { sources } });
    if (path === '/api/feed/today') return route.fulfill({ json: { items, next_offset: null, has_more: false } });
    if (path === `/api/sources/${sources[0].id}/fetch`) {
      return route.fulfill({
        status: 409,
        json: { error: { code: 'conflict', message: 'operation already running', details: { current_operation: runningOperation } } }
      });
    }
    if (path.endsWith('/inspect')) return route.fulfill({ json: { item_id: items[0].id, human_inspected_at: now, already_applied: false } });
    if (path.startsWith('/api/items/')) {
      const id = path.split('/')[3];
      const item = items.find((candidate) => candidate.id === id) ?? items[0];
      return route.fulfill({
        json: {
          item: {
            ...item,
            feed_excerpt: item.display_excerpt,
            extracted_text: `${item.summary} Full extracted text remains Inspector-only.`,
            provenance: { source_url: sources[0].url, canonical_url: item.url, original_url: item.url, story_key: null, duplicate_of_item_id: null, grouped_source_items: [] }
          }
        }
      });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: `not found: ${path}`, details: {} } } });
  });
}

async function openVisibleRefreshRuntime(page: Page, ownerToken: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await installVisibleRefreshApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'RESOFEED' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open Inspector for: ${items[0].title}` })).toBeVisible();
}

function feedRow(page: Page): Locator {
  return page.locator('article.contract-feed-item').filter({ hasText: items[0].localized_title });
}

async function fontFamily(locator: Locator): Promise<string> {
  return locator.evaluate((element) => window.getComputedStyle(element).fontFamily);
}

test.describe('expected-red runtime visible UI refresh gaps from traceability matrix', () => {
  test('DESIGN.CHROME.MONO + DESIGN.FEED.COMPACT + DESIGN.RESONATE.44: desktop feed chrome exposes compact scan row visual semantics', async ({ page, ownerToken }) => {
    await openVisibleRefreshRuntime(page, ownerToken, { width: 1280, height: 900 });

    const row = feedRow(page);
    const rowBox = await row.boundingBox();
    const resonateBox = await row.locator('.contract-resonate').boundingBox();
    const chromeFont = await fontFamily(page.locator('main[aria-label="RESOFEED"]').first());

    // DESIGN.CHROME.MONO (matrix lines 27, 51): chrome/source/ledger text must compute to JetBrains Mono first.
    expect.soft(chromeFont, 'DESIGN.CHROME.MONO computed_font_family_chrome').toMatch(/^"?JetBrains Mono"?/i);
    // DESIGN.FEED.COMPACT (matrix line 30): compact scan row; not card-like miniature article.
    expect.soft(rowBox?.height ?? 0, 'DESIGN.FEED.COMPACT row_height_density_metrics').toBeLessThanOrEqual(112);
    await expect.soft(row.locator('ul, ol, li'), 'DESIGN.FEED.COMPACT dom_feed_no_key_points_lists').toHaveCount(0);
    await expect.soft(row, 'DESIGN.FEED.COMPACT no Inspector-only section labels in Feed').not.toContainText(/要点|核心洞察|Key Points/i);
    // DESIGN.RESONATE.44 (matrix line 31): hit target and glyph semantics are runtime-visible.
    expect.soft(resonateBox?.width ?? 0, 'DESIGN.RESONATE.44 bounding_box_resonate_min_44 width').toBeGreaterThanOrEqual(44);
    expect.soft(resonateBox?.height ?? 0, 'DESIGN.RESONATE.44 bounding_box_resonate_min_44 height').toBeGreaterThanOrEqual(44);
    await expect.soft(row.locator('.contract-resonate'), 'DESIGN.RESONATE.44 dom_star_glyph_toggle').toHaveText('☆');
  });

  test('DESIGN.INSPECTOR.SECTIONS + ARCH.MOBILE.INSPECTOR.ROUTE: mobile activation opens full-screen structured reading surface', async ({ page, ownerToken }) => {
    await openVisibleRefreshRuntime(page, ownerToken, { width: 390, height: 844 });
    await page.getByRole('button', { name: `Open Inspector for: ${items[0].title}` }).click();

    const inspector = page.getByRole('complementary', { name: items[0].localized_title });
    const inspectorBox = await inspector.boundingBox();
    const feedVisibleRows = await page.locator('article.contract-feed-item').filter({ visible: true }).count();

    // ARCH.MOBILE.INSPECTOR.ROUTE (matrix line 24): mobile Inspector is route-level full-screen detail with Feed hidden.
    await expect.soft(page, 'ARCH.MOBILE.INSPECTOR.ROUTE mobile_route_path').toHaveURL(new RegExp(`/items/${items[0].id}`));
    expect.soft(inspectorBox?.width ?? 0, 'ARCH.MOBILE.INSPECTOR.ROUTE mobile_route_inspector_fullscreen_width').toBeGreaterThanOrEqual(360);
    expect.soft(feedVisibleRows, 'ARCH.MOBILE.INSPECTOR.ROUTE feed rows hidden behind full-screen detail').toBe(0);
    // DESIGN.INSPECTOR.SECTIONS (matrix line 32): structured Chinese generated content order and list semantics.
    await expect.soft(inspector.getByLabel('摘要')).toContainText(items[0].summary);
    await expect.soft(inspector.getByLabel('核心洞察')).toContainText(items[0].core_insight);
    await expect.soft(inspector.getByLabel('要点').locator('li')).toHaveCount(3);
  });

  test('ARCH.SOURCE_LEDGER.BRACKET + DESIGN.SOURCE_LEDGER.FLAT + CONSTITUTION.NO.DURABLE.OPERATIONS: Source Ledger stays flat and exposes inline operation language', async ({ page, ownerToken }) => {
    await openVisibleRefreshRuntime(page, ownerToken, { width: 1280, height: 900 });
    await page.locator('details[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();

    const ledger = page.getByTestId('source-ledger');
    // ARCH.SOURCE_LEDGER.BRACKET + DESIGN.SOURCE_LEDGER.FLAT (matrix lines 21, 33): flat roster with canonical bracket controls.
    await expect.soft(ledger.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await expect.soft(ledger.getByRole('button', { name: /\[运行抓取\]|\[RUN INGEST\]/ })).toBeVisible();
    await expect.soft(ledger.getByRole('button', { name: /\[抓取\]|\[FETCH\]/ }).first()).toBeVisible();
    await expect.soft(ledger.locator('.source-ledger__row')).toHaveCount(sources.length);

    await ledger.getByRole('button', { name: /\[抓取\]|\[FETCH\]/ }).first().click();
    // CONSTITUTION.NO.DURABLE.OPERATIONS (matrix line 19): conflict/status text remains inline contextual operation language, not a dashboard.
    await expect.soft(ledger, 'CONSTITUTION.NO.DURABLE.OPERATIONS dom_current_operation_inline_text err').toContainText('err: operation already running');
    await expect.soft(ledger, 'ARCH.SOURCE_LEDGER.BRACKET dom_conflict_op_actor_phase_text op').toContainText('op: manual_ingest');
    await expect.soft(ledger, 'ARCH.SOURCE_LEDGER.BRACKET dom_conflict_op_actor_phase_text actor').toContainText('actor:human');
    await expect.soft(ledger, 'ARCH.SOURCE_LEDGER.BRACKET dom_conflict_op_actor_phase_text phase').toContainText('phase:fetching');
  });

  test('STITCH.REJECT.* negative drift: runtime forbids top nav/counts, global ingest/retry/sync/pulse, and card/dashboard semantics', async ({ page, ownerToken }) => {
    await openVisibleRefreshRuntime(page, ownerToken, { width: 1280, height: 900 });
    await page.locator('details[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    const body = page.locator('body');

    // STITCH.REJECT.TOP_NAV.COUNTS.INGEST (matrix line 37): reject persistent top nav/counts and global [INGEST FEED].
    await expect.soft(page.getByRole('navigation', { name: /top|dashboard|primary/i }), 'STITCH.REJECT.TOP_NAV.COUNTS.INGEST no persistent top nav').toHaveCount(0);
    await expect.soft(body, 'STITCH.REJECT.TOP_NAV.COUNTS.INGEST no unread/count chrome').not.toContainText(/unread|\b\d+\s*(items|feeds|sources|new)\b/i);
    await expect.soft(body, 'STITCH.REJECT.TOP_NAV.COUNTS.INGEST no [INGEST FEED]').not.toContainText('[INGEST FEED]');
    // STITCH.REJECT.RETRY.SYNC.PULSE (matrix line 39): reject retry/sync/pulse/job semantics.
    await expect.soft(body, 'STITCH.REJECT.RETRY.SYNC.PULSE no [RETRY]').not.toContainText('[RETRY]');
    await expect.soft(body, 'STITCH.REJECT.RETRY.SYNC.PULSE no syncing...').not.toContainText(/syncing\.\.\./i);
    await expect.soft(page.locator('[class*="animate-pulse"], .animate-pulse'), 'STITCH.REJECT.RETRY.SYNC.PULSE no animate-pulse').toHaveCount(0);
    // STITCH.REJECT.ICON.SHADOW + ARCH.NO.JOBS.QUEUES.HISTORY (matrix lines 22, 38): no shadow/card/dashboard semantics.
    await expect.soft(page.locator('.card, [class*="card"], [class*="shadow"], nav[aria-label*="dashboard" i], [aria-label*="dashboard" i]'), 'STITCH.REJECT.ICON.SHADOW no shadow/card/nav-dashboard semantics').toHaveCount(0);
    await expect.soft(body, 'ARCH.NO.JOBS.QUEUES.HISTORY no job queue history dashboard').not.toContainText(/job|queue|history|activity|dashboard/i);
  });
});
