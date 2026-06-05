import type { Page, Route } from 'playwright/test';

import { expect, test } from './fixtures';

const redExpect = expect.configure({ timeout: 250, soft: true });

const preAuthLanguageFixtureKey = 'resofeed.e2e.preAuthLanguage';
const preAuthZhLanguageFixture = {
  code: 'zh',
  label: '中文',
  authority: 'e2e-fixture:zh-ui-preauth-language-test-contract-fix'
} as const;

type SourceFixture = {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly last_fetch_at: string | null;
  readonly last_fetch_status: string;
  readonly last_fetch_error?: string | null;
  readonly is_active: boolean;
  readonly revision: number;
};

type ItemFixture = {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly display_excerpt: string | null;
  readonly value_tier: string | null;
  readonly published_at: string | null;
  readonly first_seen_at: string | null;
  readonly extraction_status: 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
  readonly model_status: 'ok' | 'summary_unavailable' | 'model_latency_error';
  readonly is_resonated: boolean;
  readonly human_inspected_at: string | null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
};

type GroupedSourceItemFixture = {
  readonly item_id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly source_url: string;
  readonly url: string;
  readonly canonical_url: string;
  readonly title: string;
  readonly published_at: string | null;
  readonly first_seen_at: string | null;
  readonly extraction_status: ItemFixture['extraction_status'];
  readonly model_status: ItemFixture['model_status'];
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
  readonly is_selected_item: boolean;
};

type ItemDetailFixture = ItemFixture & {
  readonly feed_excerpt: string | null;
  readonly extracted_text: string | null;
  readonly provenance: {
    readonly source_url: string;
    readonly canonical_url: string | null;
    readonly original_url: string;
    readonly story_key: string | null;
    readonly duplicate_of_item_id: string | null;
    readonly grouped_source_items: readonly GroupedSourceItemFixture[];
  };
};

const timestamp = '2026-05-23T09:15:00Z';

const sourceWithoutTranslatedConvenienceName: SourceFixture = {
  id: 'src_simonwillison_weblog',
  url: 'https://simonwillison.net/atom/everything/',
  title: "Simon Willison's Weblog",
  last_fetch_at: timestamp,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 7
};

const secondSource: SourceFixture = {
  id: 'src_platformer_newsletter',
  url: 'https://www.platformer.news/feed/',
  title: 'Platformer',
  last_fetch_at: timestamp,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 3
};

const groupedItem: ItemFixture = {
  id: 'item_zh_chrome_story_primary',
  source_id: sourceWithoutTranslatedConvenienceName.id,
  source_title: sourceWithoutTranslatedConvenienceName.title,
  url: 'https://simonwillison.net/2026/May/23/agents-as-tools/?utm_source=resofeed',
  title: 'Agents as tools need boring UI contracts',
  summary: 'Model-backed English summary intentionally remains existing stored content until explicit reprocess.',
  core_insight: 'The broad chrome should localize without translating provenance anchors.',
  display_excerpt: 'RSS excerpt for the primary grouped story.',
  value_tier: 'source-claim',
  published_at: timestamp,
  first_seen_at: timestamp,
  extraction_status: 'partial_extraction',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: '2026-05-23T09:20:00Z',
  story_key: 'story_zh_chrome_localization_gap',
  duplicate_of_item_id: null
};

const secondItem: ItemFixture = {
  ...groupedItem,
  id: 'item_zh_chrome_story_secondary',
  source_id: secondSource.id,
  source_title: secondSource.title,
  url: 'https://www.platformer.news/ai-browser-contracts',
  title: 'Platform browser contracts stay literal',
  is_resonated: true,
  duplicate_of_item_id: groupedItem.id
};

const groupedSourceItems: readonly GroupedSourceItemFixture[] = [
  {
    item_id: groupedItem.id,
    source_id: sourceWithoutTranslatedConvenienceName.id,
    source_title: sourceWithoutTranslatedConvenienceName.title,
    source_url: sourceWithoutTranslatedConvenienceName.url,
    url: groupedItem.url,
    canonical_url: 'https://canonical.example.test/agents-as-tools',
    title: groupedItem.title,
    published_at: groupedItem.published_at,
    first_seen_at: groupedItem.first_seen_at,
    extraction_status: groupedItem.extraction_status,
    model_status: groupedItem.model_status,
    story_key: groupedItem.story_key,
    duplicate_of_item_id: null,
    is_selected_item: true
  },
  {
    item_id: secondItem.id,
    source_id: secondSource.id,
    source_title: secondSource.title,
    source_url: secondSource.url,
    url: secondItem.url,
    canonical_url: secondItem.url,
    title: secondItem.title,
    published_at: secondItem.published_at,
    first_seen_at: secondItem.first_seen_at,
    extraction_status: secondItem.extraction_status,
    model_status: secondItem.model_status,
    story_key: groupedItem.story_key,
    duplicate_of_item_id: groupedItem.id,
    is_selected_item: false
  }
];

const detail: ItemDetailFixture = {
  ...groupedItem,
  feed_excerpt: groupedItem.display_excerpt,
  extracted_text: 'Readable source text remains in the source language; chrome around it is the localization target.',
  provenance: {
    source_url: sourceWithoutTranslatedConvenienceName.url,
    canonical_url: 'https://canonical.example.test/agents-as-tools',
    original_url: groupedItem.url,
    story_key: groupedItem.story_key,
    duplicate_of_item_id: null,
    grouped_source_items: groupedSourceItems
  }
};

const openRouterModels = {
  models: [
    { id: 'openai/gpt-5.1-mini', name: 'GPT 5.1 Mini' },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' }
  ]
};

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installIgnoredPreAuthZhLanguageFixture(page: Page): Promise<void> {
  // Authenticated runtime language is the product authority; this ignored e2e key
  // proves unauthenticated owner-token chrome is not controlled by fixture state.
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: preAuthLanguageFixtureKey, value: preAuthZhLanguageFixture }
  );
}

async function installBroadZhFixtures(page: Page, ownerToken: string, mode: 'populated' | 'empty'): Promise<void> {
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);

  const sources = mode === 'populated' ? [sourceWithoutTranslatedConvenienceName, secondSource] : [];
  const items = mode === 'populated' ? [groupedItem, secondItem] : [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/sources') return fulfillJson(route, { sources });
    if (path === '/api/feed/today') return fulfillJson(route, { items });
    if (path === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (path === '/api/runtime/language') return fulfillJson(route, { language: { code: 'zh', label: '中文' }, already_applied: false });
    if (path === '/api/runtime/openrouter-models') return fulfillJson(route, openRouterModels);
    if (path === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (path === '/api/search') return fulfillJson(route, { items, query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: 50 } });
    if (path === `/api/items/${groupedItem.id}/inspect` && method === 'POST') return fulfillJson(route, { item_id: groupedItem.id, human_inspected_at: timestamp, already_applied: false });
    if (path === `/api/items/${secondItem.id}/inspect` && method === 'POST') return fulfillJson(route, { item_id: secondItem.id, human_inspected_at: timestamp, already_applied: false });
    if (path === `/api/items/${groupedItem.id}` && method === 'GET') return fulfillJson(route, { item: detail });
    if (path === `/api/items/${secondItem.id}` && method === 'GET') return fulfillJson(route, { item: { ...detail, ...secondItem, provenance: { ...detail.provenance, original_url: secondItem.url, canonical_url: secondItem.url, source_url: secondSource.url } } });
    if (path === '/api/ingest' && method === 'POST') return fulfillJson(route, { operation: 'ingest', source_id: null, completed: true, completed_at: timestamp, sources_total: sources.length, sources_fetched: sources.length, items_discovered: items.length, items_upserted: items.length, errors: [] });
    if (path === `/api/sources/${sourceWithoutTranslatedConvenienceName.id}/fetch` && method === 'POST') return fulfillJson(route, { operation: 'source_fetch', source_id: sourceWithoutTranslatedConvenienceName.id, completed: true, completed_at: timestamp, sources_total: 1, sources_fetched: 1, items_discovered: 1, items_upserted: 1, errors: [] });
    if (path === '/api/state/export') return fulfillJson(route, { schema_version: 'resofeed.state.v1', exported_at: timestamp, sources: [], steer_rules: [], resonated_items: [] });
    if (path === '/api/state/import' && method === 'POST') return fulfillJson(route, { imported: true });
    if (path === '/api/sources/import-opml' && method === 'POST') return fulfillJson(route, { imported: 1, skipped: 0, sources });
    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${path}`, details: {} } }, 404);
  });
}

test.describe('expected-red zh UI chrome localization matrix', () => {
  test('owner token prompt ignores pre-auth e2e language fixture and avoids account concepts', async ({ page }) => {
    await installIgnoredPreAuthZhLanguageFixture(page);
    await page.goto('/');

    await expect(page.evaluate((key) => window.localStorage.getItem(key), preAuthLanguageFixtureKey)).resolves.toContain('"authority":"e2e-fixture:zh-ui-preauth-language-test-contract-fix"');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Owner token' })).toBeVisible();
    await expect(page.getByRole('button', { name: '[SUBMIT]' })).toBeVisible();
    await redExpect(page.getByRole('heading', { name: '输入所有者令牌' })).toHaveCount(0);
    await redExpect(page.getByText('RESOFEED')).toBeVisible();
    await redExpect(page.getByText(/login|account|password reset|profile/iu)).toHaveCount(0);
  });

  test('shell feed search ledger state and Inspector zh chrome are broad expected-red gaps', async ({ page, ownerToken }) => {
    await installBroadZhFixtures(page, ownerToken, 'populated');
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await redExpect(page.locator('.skip-link')).toHaveText('跳到订阅流');
    await redExpect(page.getByRole('textbox', { name: '导向或粘贴 RSS URL' })).toBeVisible();
    await redExpect(page.getByPlaceholder('导向或粘贴 RSS URL...')).toBeVisible();
    await redExpect(page.locator('#steer-route-preview-status')).toHaveAttribute('aria-label', '导向路由预览');
    await redExpect(page.locator('.utility-label').first()).toHaveText('导航');
    await redExpect(page.locator('.utility-label--operations')).toHaveText('系统');
    await redExpect(page.getByText('RESOFEED').first()).toBeVisible();
    await redExpect(page.getByRole('button', { name: 'TODAY' })).toHaveCount(0);
    await redExpect(page.getByText('/doctor')).toHaveCount(0);

    const feed = page.locator('#today-feed');
    await redExpect(feed.getByRole('list', { name: '今日订阅条目' })).toBeVisible();
    await redExpect(feed.getByRole('button', { name: `打开检查器：${groupedItem.title}` })).toBeVisible();
    await redExpect(feed.locator('.feed-meta-source').first()).toHaveText(sourceWithoutTranslatedConvenienceName.title);
    await redExpect(feed.locator('.feed-meta-source').first()).toHaveAttribute('translate', 'no');
    await redExpect(feed.locator(`[data-source-id="${sourceWithoutTranslatedConvenienceName.id}"]`)).toHaveCount(1);
    await redExpect(feed.locator('.feed-meta-source').first()).toHaveAttribute('aria-label', `来源：${sourceWithoutTranslatedConvenienceName.title}`);
    await redExpect(feed.locator('.feed-meta-age').first()).toHaveAttribute('aria-label', /时间：/u);
    await redExpect(feed.locator('.feed-meta-extraction').first()).toContainText('来源摘录');
    await redExpect(feed.locator('.feed-meta-secondary').nth(1)).toContainText('来源声明');
    await redExpect(feed.getByRole('button', { name: `标星：${groupedItem.title}` })).toBeVisible();
    await redExpect(feed.locator('.feed-meta-agent').first()).toHaveAttribute('aria-label', '由代理外部推荐');
    await redExpect(feed.locator('.contract-time-label').first()).toHaveText('TODAY');

    await page.getByRole('textbox', { name: '导向或粘贴 RSS URL' }).fill('search browser contracts');
    await page.keyboard.press('Enter');
    const search = page.locator('.contract-search');
    await redExpect(search).toHaveAttribute('aria-label', '搜索与检索');
    await redExpect(search.getByRole('heading', { name: '搜索' })).toBeVisible();
    await redExpect(search.getByLabel('搜索筛选')).toBeVisible();
    await redExpect(search.getByLabel('纯文本查询')).toBeVisible();
    await redExpect(search.getByRole('button', { name: '[搜索]' })).toBeVisible();
    await redExpect(search.getByText('筛选')).toBeVisible();
    await search.getByText('筛选').click();
    await redExpect(search.getByLabel('来源筛选')).toBeVisible();
    await redExpect(search.getByLabel('仅已标星')).toBeVisible();
    await redExpect(search.getByRole('status')).toContainText('2 条结果');
    await redExpect(search.getByRole('region', { name: '搜索结果' })).toBeVisible();
    await redExpect(search.getByRole('list', { name: '搜索结果条目' })).toBeVisible();
    await redExpect(search.getByRole('button', { name: `检查搜索结果：${groupedItem.title}` })).toBeVisible();
    await redExpect(search.locator('.contract-search-match').first()).toContainText('匹配：词汇索引');
    await redExpect(search.locator('.contract-search-match').first()).toContainText('来源支持');
    await redExpect(search.locator('.feed-meta-source').first()).toHaveText(sourceWithoutTranslatedConvenienceName.title);
    await redExpect(search.locator('.feed-meta-source').first()).toHaveAttribute('translate', 'no');

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    const ledger = page.locator('.source-ledger');
    await redExpect(ledger.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await redExpect(ledger.getByRole('button', { name: '[RUN INGEST]' })).toBeVisible();
    await redExpect(ledger.locator('.source-ledger__status').first()).toContainText('上次抓取');
    await redExpect(ledger.locator('[aria-label="账本操作"]')).toBeVisible();
    await redExpect(ledger.getByRole('button', { name: '[IMPORT OPML]' })).toBeVisible();
    await redExpect(ledger.locator('.source-ledger__name').first()).toHaveText(sourceWithoutTranslatedConvenienceName.title);
    await redExpect(ledger.locator('.source-ledger__name').first()).toHaveAttribute('translate', 'no');
    await redExpect(ledger.locator('.source-ledger__url').first()).toHaveText(sourceWithoutTranslatedConvenienceName.url);
    await redExpect(ledger.locator('.source-ledger__url').first()).toHaveAttribute('translate', 'no');
    await redExpect(ledger.getByRole('button', { name: `[FETCH] 抓取来源 ${sourceWithoutTranslatedConvenienceName.title}` })).toBeVisible();
    await redExpect(ledger.getByRole('button', { name: `删除来源：${sourceWithoutTranslatedConvenienceName.title}` })).toBeVisible();
    await redExpect(ledger.getByLabel(`诊断详情：${sourceWithoutTranslatedConvenienceName.title}`)).toBeVisible();

    const portability = ledger.locator('.contract-portability');
    await redExpect(portability).toHaveAttribute('aria-label', '状态迁移操作');
    await redExpect(portability.getByRole('button', { name: '[EXPORT STATE]' })).toBeVisible();
    await redExpect(portability.getByRole('button', { name: '[IMPORT STATE]' })).toBeVisible();
    await redExpect(portability.getByLabel('状态 JSON 导入输入')).toHaveCount(1);
    await redExpect(portability.locator('.state-portability-warning')).toHaveText('导入 State 会替换活动来源、规则和星标。');

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'TODAY' }).click();
    await feed.getByRole('button', { name: `打开检查器：${groupedItem.title}` }).click();
    const inspector = page.locator('.contract-inspector');
    await redExpect(inspector).toContainText('检查器');
    await redExpect(inspector.locator('.inspector-provenance')).toHaveAttribute('aria-label', /来源：/u);
    await redExpect(inspector.locator('.inspector-provenance [translate="no"]')).toContainText(sourceWithoutTranslatedConvenienceName.title);
    await redExpect(inspector.getByRole('link', { name: '原文链接' })).toHaveAttribute('translate', 'no');
    await redExpect(inspector.getByText('为什么：来自已配置来源的新条目')).toHaveCount(0);
    await redExpect(inspector.getByLabel('本文重处理')).toBeVisible();
    await redExpect(inspector.getByRole('button', { name: '[重新处理本文]' })).toBeVisible();
    await inspector.getByRole('button', { name: '[重新处理本文]' }).click();
    await redExpect(inspector.getByRole('option', { name: 'GPT 5.1 Mini (openai/gpt-5.1-mini)' })).toHaveAttribute('value', 'openai/gpt-5.1-mini');
    await redExpect(inspector.getByRole('option', { name: 'Claude 3.7 Sonnet (anthropic/claude-3.7-sonnet)' })).toHaveAttribute('value', 'anthropic/claude-3.7-sonnet');
    await redExpect(inspector.locator('.inspector-reingest-status')).toHaveAttribute('aria-label', '本文重处理状态');
    await redExpect(inspector.locator('.contract-grouped-sources summary')).toHaveAttribute('aria-label', '分组故事，含 2 个来源条目');
    await redExpect(inspector.locator('.contract-grouped-sources__item').first()).toHaveAttribute('aria-label', `分组来源条目：${sourceWithoutTranslatedConvenienceName.title}（已选择）`);
    await redExpect(inspector.locator('.contract-grouped-sources__feed').first()).toHaveAttribute('aria-label', `来源订阅：${sourceWithoutTranslatedConvenienceName.title}`);
    await redExpect(inspector.locator('.contract-grouped-sources__feed').first()).toHaveAttribute('href', sourceWithoutTranslatedConvenienceName.url);
    await redExpect(inspector.locator('.contract-grouped-sources__meta').first()).toContainText(`story_key: ${groupedItem.story_key}`);
    await redExpect(inspector.getByText(`provenance: story ${groupedItem.story_key} · duplicate none`)).toHaveCount(0);
  });

  test('first-use and source-ledger empty states expose zh expected-red copy gaps', async ({ page, ownerToken }) => {
    await installBroadZhFixtures(page, ownerToken, 'empty');
    await page.goto('/');

    const empty = page.locator('.contract-empty');
    await redExpect(empty).toHaveAttribute('aria-label', '订阅流空状态');
    await redExpect(empty.getByText('在导向栏粘贴 RSS URL，或导入 OPML。')).toBeVisible();
    await redExpect(empty.getByText('检查器会打开条目。')).toBeVisible();
    await redExpect(empty.getByText('星标会保留持久价值。')).toBeVisible();
    await redExpect(empty.getByText('导向是可选修正。')).toBeVisible();

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await redExpect(page.locator('.source-ledger').getByText('暂无来源。在导向栏粘贴 RSS URL。')).toBeVisible();
  });
});
