import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

const now = '2026-06-01T14:00:00Z';

const source = {
  id: 'src_stitch_matrix',
  url: 'https://source.example.test/rss.xml',
  title: 'Matrix Source',
  last_fetch_at: now,
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
} as const;

const item = {
  id: 'item_stitch_matrix',
  source_id: source.id,
  source_title: source.title,
  source_item_title: 'Literal Matrix Source Title',
  localized_title: '矩阵运行时设计差异',
  url: 'https://source.example.test/items/matrix',
  title: '矩阵运行时设计差异',
  summary: '这是一段用于验证摘要只在检查器中展开的中文摘要。',
  core_insight: '运行时必须把结构化理解放在检查器，而不是订阅流。',
  key_points: ['订阅流保持紧凑扫描。', '检查器显示结构化要点。', '来源标识保持字面不翻译。'],
  display_excerpt: 'Fallback source excerpt for provenance.',
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
} as const;

const detail = {
  ...item,
  feed_excerpt: 'RSS excerpt stays behind Inspector source evidence.',
  extracted_text: 'Extracted body stays out of compact feed rows.',
  provenance: {
    source_url: source.url,
    canonical_url: item.url,
    original_url: item.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
} as const;

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

async function installMatrixApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'zh', label: '中文' } } });
    if (url.pathname === '/api/runtime/openrouter-models' || url.pathname === '/api/runtime/openrouter/models') return route.fulfill({ json: { models: [] } });
    if (url.pathname === '/api/runtime/operation') return route.fulfill({ json: { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [source] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: [item], next_offset: null, has_more: false } });
    if (url.pathname === '/api/search') return route.fulfill({ json: { items: [item], query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: 50 } } });
    if (url.pathname === `/api/sources/${source.id}/fetch`) {
      return route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'conflict',
            message: 'operation already running',
            details: { current_operation: runningOperation }
          }
        }
      });
    }
    if (url.pathname.endsWith('/inspect')) return route.fulfill({ json: { item_id: item.id, human_inspected_at: now, already_applied: false } });
    if (url.pathname.startsWith('/api/items/')) return route.fulfill({ json: { item: detail } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openMatrixRuntime(page: Page, ownerToken: string): Promise<void> {
  await installMatrixApi(page, ownerToken);
  await page.goto('/');
}

test.describe('expected red: Stitch runtime ingestion matrix browser DOM gaps', () => {
  test('STITCH.surface-inventory.required-surfaces: owner-token gate and first-use copy are local and account-free', async ({ page, ownerToken }) => {
    await page.goto('/');
    const prompt = page.getByRole('region', { name: 'RESOFEED owner token prompt' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Enter owner token');
    await expect(prompt).not.toContainText(/account|profile|password reset|sign up|cloud|onboarding/i);
    await expect(page.getByRole('textbox', { name: 'Owner token' })).toBeFocused();

    await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' } } });
      if (url.pathname === '/api/runtime/operation') return route.fulfill({ json: { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } } });
      if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
      if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [] } });
      if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: [], next_offset: null, has_more: false } });
      return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
    });
    await page.reload();
    const empty = page.getByRole('region', { name: 'First use' });
    await expect(empty).toContainText('Paste RSS URL in Steer or import OPML.');
    await expect(empty).toContainText('Inspect opens the item.');
    await expect(empty).toContainText('Star preserves durable value.');
    await expect(empty).toContainText('Steer is optional correction.');
    await expect(empty).not.toContainText(/wizard|setup progress|tour|account|profile|unread|inbox/i);
  });

  test('STITCH content/search/rejected-drift rows: menu, feed, Inspector, and lexical search DOM stay within approved surfaces', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openMatrixRuntime(page, ownerToken);

    const surfaceMenu = page.locator('details[aria-label="RESOFEED surface menu"]');
    await expect(surfaceMenu.locator('button').filter({ hasText: 'TODAY' })).not.toBeVisible();
    await page.getByText('RESOFEED').click();
    await expect(surfaceMenu.locator('button').filter({ hasText: 'TODAY' })).toBeVisible();
    await expect(surfaceMenu.locator('button').filter({ hasText: 'SOURCE LEDGER' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'RESOFEED surfaces' })).not.toContainText(/settings|profile|provider|chat|RAG|syncing\.\.\.|RETRY/i);

    const feedRow = page.locator('article.contract-feed-item').filter({ hasText: item.localized_title });
    await expect(feedRow).toContainText('Matrix Source');
    await expect(feedRow).not.toContainText('src: Matrix Source');
    await expect(feedRow).not.toContainText(/要点|key points|^- |^\d+\./im);
    await expect(feedRow.locator('ul, ol, li')).toHaveCount(0);

    await page.getByRole('button', { name: `Open Inspector for: ${item.title}` }).click();
    const inspector = page.getByRole('complementary', { name: item.localized_title });
    await expect(inspector.getByLabel('摘要')).toContainText(item.summary);
    await expect(inspector.getByLabel('核心洞察')).toContainText(item.core_insight);
    await expect(inspector.getByLabel('要点').locator('li')).toHaveCount(3);

    await page.getByRole('textbox', { name: /导向或粘贴 RSS URL|Steer or paste RSS URL/ }).fill('search matrix');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('region', { name: '搜索与检索' })).toBeVisible();
    await page.getByRole('button', { name: `检查搜索结果：${item.title}` }).click();
    await expect(page.getByRole('region', { name: '搜索与检索' })).toBeVisible();
    await expect(page.locator('article.contract-search-result').filter({ hasText: item.localized_title })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByText(/generated answer|semantic answer|saved search|chat|RAG|vector|unread|inbox/i)).toHaveCount(0);
  });

  test('STITCH.source-ledger.flat-operational-roster: per-source conflict exposes current operation details without retry/job drift', async ({ page, ownerToken }) => {
    await openMatrixRuntime(page, ownerToken);
    await page.getByText('RESOFEED').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();

    const ledger = page.getByTestId('source-ledger');
    await expect(ledger.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await expect(ledger.getByRole('button', { name: /\[抓取\]|\[FETCH\]/ })).toBeVisible();
    await ledger.getByRole('button', { name: /\[抓取\]|\[FETCH\]/ }).click();

    // Expected red gap: Source fetch 409 details.current_operation should be promoted into the text-only conflict line.
    await expect(ledger).toContainText('err: operation already running');
    await expect(ledger).toContainText('op: manual_ingest');
    await expect(ledger).toContainText('actor:human');
    await expect(ledger).toContainText('phase:fetching');
    await expect(ledger).not.toContainText(/RETRY|syncing\.\.\.|job|dashboard|queue|animate-pulse/i);
    await expect(ledger.locator('.material-symbols, .material-symbols-outlined, [class*="animate-pulse"]')).toHaveCount(0);
  });
});
