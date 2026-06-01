import type { Page, Route } from 'playwright/test';

import { expect, test } from './fixtures';

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

const ownerTokenStorageKey = 'resofeed.ownerToken';
const timestamp = '2026-05-16T14:02:05Z';

const source: SourceFixture = {
  id: 'src_azrct_audit_zh',
  url: 'https://feeds.example.test/azrct-audit-zh.xml',
  title: 'Literal Source Identifier',
  last_fetch_at: timestamp,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
};

const zhItem: ItemFixture = {
  id: 'item_azrct_zh',
  source_id: source.id,
  source_title: source.title,
  url: 'https://news.example.test/unchanged-source-url',
  title: '中文标题保留在检查器',
  summary: '中文摘要用于验证处理语言界面。',
  core_insight: '中文核心洞察保持可读。',
  display_excerpt: '中文摘录文本。',
  value_tier: 'high',
  published_at: timestamp,
  first_seen_at: timestamp,
  extraction_status: 'partial_extraction',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: 'azrct-zh-story',
  duplicate_of_item_id: null
};

const items: readonly ItemFixture[] = [zhItem];

const opmlFixture = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>ResoFeed Expected Red OPML</title></head>
  <body>
    <outline text="Folder that must be flattened">
      <outline text="Literal Source Identifier" title="Literal Source Identifier" type="rss" xmlUrl="${source.url}" />
    </outline>
  </body>
</opml>`;

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installAuditZhApi(page: Page, ownerToken: string, calls: string[]): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );

  let language: 'en' | 'zh' = 'en';
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    calls.push(`${request.method()} ${path}`);

    if (path === '/api/sources') return fulfillJson(route, { sources: [source] });
    if (path === '/api/feed/today') return fulfillJson(route, { items });
    if (path === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (path === '/api/runtime/language' && request.method() === 'GET') {
      return fulfillJson(route, { language: { code: language, label: language === 'zh' ? '中文' : 'English' }, already_applied: false });
    }
    if (path === '/api/runtime/language' && request.method() === 'PUT') {
      language = 'zh';
      return fulfillJson(route, { language: { code: 'zh', label: '中文' }, already_applied: false });
    }
    if (path === '/api/runtime/reprocess-library' && request.method() === 'POST') {
      return fulfillJson(route, {
        reprocess: {
          status: 'completed',
          language: 'zh',
          items_attempted: 1,
          items_updated: 1,
          items_unavailable: 0,
          items_failed: 0,
          items_indexed: 1,
          fts_rebuilt: true,
          errors: []
        },
        already_applied: false
      });
    }
    if (path === '/api/sources/import-opml' && request.method() === 'POST') {
      return fulfillJson(route, { imported: 1, skipped: 0, sources: [source] });
    }
    if (path === '/api/ingest' && request.method() === 'POST') {
      return fulfillJson(route, {
        ingest: { status: 'completed', completed_at: timestamp, sources_attempted: 1, sources_succeeded: 1, sources_failed: 0, items_upserted: 1, errors: [] },
        operation: 'ingest',
        source_id: null,
        completed: true,
        completed_at: timestamp,
        sources_total: 1,
        sources_fetched: 1,
        items_discovered: 1,
        items_upserted: 1,
        errors: []
      });
    }
    if (path.endsWith('/inspect') && request.method() === 'POST') {
      return fulfillJson(route, { item_id: zhItem.id, human_inspected_at: timestamp, already_applied: false });
    }
    if (path === `/api/items/${zhItem.id}` && request.method() === 'GET') {
      return fulfillJson(route, {
        item: {
          ...zhItem,
          feed_excerpt: zhItem.display_excerpt,
          extracted_text: '中文正文用于检查器阅读区域。',
          provenance: {
            source_url: source.url,
            canonical_url: 'https://canonical.example.test/unchanged-source-url',
            original_url: zhItem.url,
            story_key: zhItem.story_key,
            duplicate_of_item_id: null,
            grouped_source_items: []
          }
        }
      });
    }
    if (path === '/api/search') {
      return fulfillJson(route, { items, query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: 50 } });
    }
    if (path === '/api/steer/preview' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { command?: unknown };
      const command = typeof body.command === 'string' ? body.command : '';
      if (/^(search|find)\s+/iu.test(command)) {
        return fulfillJson(route, {
          preview: {
            route_kind: 'search',
            interpreted_as: 'search',
            will_mutate: false,
            changed_rules: [],
            message: '检索：词汇搜索'
          }
        });
      }
      return fulfillJson(route, {
        preview: {
          route_kind: 'policy',
          interpreted_as: 'steer_rule',
          will_mutate: true,
          changed_rules: [{ id: 'rule_zh_preview', rule_text: '增加中文来源。', is_active: true, superseded_by: null, revision: 1 }],
          message: '规则预览'
        }
      });
    }
    if (path === '/api/steer' && request.method() === 'POST') {
      return fulfillJson(route, {
        receipt: { interpreted_as: 'steer_rule', changed_rules: [{ id: 'rule_zh', rule_text: '增加中文来源。' }], message: 'applied: 增加中文来源。' },
        undo_handle: null
      });
    }
    if (path === '/api/state/export') {
      return fulfillJson(route, { schema_version: 'resofeed.state.v1', exported_at: timestamp, sources: [], steer_rules: [], resonated_items: [] });
    }
    return fulfillJson(route, { error: { code: 'not_found', message: 'not found', details: {} } }, 404);
  });
}

async function openShell(page: Page, ownerToken: string, calls: string[]): Promise<void> {
  await installAuditZhApi(page, ownerToken, calls);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function openSourceLedger(page: Page): Promise<void> {
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/u);
}

test.describe('AZRCT audit and zh repair regression coverage', () => {
  test('F1/P2 compact route chrome: closed menu has no persistent TODAY/SOURCE LEDGER/T/SL route controls', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);

    const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(page.locator('.surface-nav-quick'), 'closed menu must not keep T/SL quick route buttons in DOM').toHaveCount(0);
    await expect(page.locator('.surface-nav-context'), 'closed chrome must not render persistent route-label context copy').not.toBeVisible();

    await menu.locator('summary').click();
    await expect(menu.getByRole('button', { name: 'TODAY' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'SOURCE LEDGER' })).toBeVisible();
  });

  test('F2 Source Ledger header action block aligns last_ingest with RUN INGEST', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);
    await openSourceLedger(page);

    const ledger = page.locator('.source-ledger');
    const headerActions = ledger.locator('.source-ledger__header-actions');
    const status = headerActions.locator('.source-ledger__status', { hasText: /last_ingest:/u });
    const runIngest = headerActions.locator('.bracket-action--run-ingest');
    await expect(status, 'last_ingest belongs in the right-aligned header action block').toBeVisible();
    await expect(runIngest).toHaveText('[RUN INGEST]');
    const statusBox = await status.boundingBox();
    const runBox = await runIngest.boundingBox();
    expect(statusBox && runBox ? statusBox.x + statusBox.width <= runBox.x + 2 : false, 'last_ingest should sit immediately before [RUN INGEST]').toBe(true);
  });

  test('P1 OPML import updates sources/receipt only and does not call runIngest', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);
    await openSourceLedger(page);

    const ledger = page.locator('.source-ledger');
    const importInput = ledger.locator('#opml-file');
    await importInput.setInputFiles({ name: 'azrct.opml', mimeType: 'text/xml', buffer: Buffer.from(opmlFixture) });
    await expect(ledger.getByText('imported 1 sources; folders flattened')).toBeVisible();
    expect(calls.filter((call) => call === 'POST /api/sources/import-opml')).toHaveLength(1);
    expect(calls.filter((call) => call === 'POST /api/ingest'), 'OPML import must not call runIngest()/POST /api/ingest').toHaveLength(0);
  });

  test('P2 copy: steer/search preview and receipts do not render architecture-boundary slogans', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);

    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('find provenance');
    await expect(page.locator('.steer-route-preview')).not.toContainText(/semantic retrieval|no semantic retrieval|RAG/iu);
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('status').filter({ hasText: /semantic retrieval|no semantic retrieval|RAG/iu })).toHaveCount(0);
  });

  test('P2 Inspector provenance: model: ok header chrome is replaced by approved trust lines', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);

    await page.getByRole('button', { name: `Open Inspector for: ${zhItem.title}` }).click();
    const inspector = page.locator('.contract-inspector');
    await expect(inspector).toContainText('source text: RSS excerpt only');
    await expect(inspector).toContainText('summary provenance: model-backed');
    await expect(inspector.locator('.inspector-provenance')).not.toContainText('model: ok');
  });

  test('zh UI parity: html lang, LANG/reprocess/status/receipts/steer preview localize', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();

    await page.getByRole('button', { name: /Processing language English; set Chinese/u }).click();
    await expect.soft(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect.soft(page.getByRole('button', { name: /处理语言 中文/u })).toHaveText('语言: 中文');
    await expect.soft(page.getByRole('status', { name: 'processing language' })).toContainText('语言已设为中文');
    await expect.soft(page.getByRole('button', { name: 'Reprocess existing library and rebuild search index' })).toHaveText('[重处理资料库]');
    await expect.soft(page.getByText('已存可读内容将被重写。 来源标识保持不变。')).toBeVisible();

    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search 中文');
    await expect.soft(page.locator('.steer-route-preview')).toContainText('[搜索]');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect.soft(page.getByRole('status').filter({ hasText: /检索：词汇搜索/u })).toBeVisible();

    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('增加中文来源');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect.soft(page.getByRole('status', { name: 'Steer receipt' })).toContainText('已应用');
  });

  test('zh Inspector chrome localizes while source identifiers stay translate=no and unchanged', async ({ page, ownerToken }) => {
    const calls: string[] = [];
    await openShell(page, ownerToken, calls);
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: /Processing language English; set Chinese/u }).click();
    await page.getByRole('button', { name: `打开检查器：${zhItem.title}` }).click();
    const inspector = page.locator('.contract-inspector');
    await expect.soft(inspector).toContainText('检查器');
    await expect.soft(inspector).toContainText('来源文本：仅 RSS 摘录');
    await expect.soft(inspector).toContainText('摘要来源：模型支持');
    await expect.soft(inspector.getByRole('link', { name: zhItem.url }).first()).toHaveAttribute('translate', 'no');
    await expect.soft(inspector.getByRole('link', { name: source.url })).toHaveAttribute('translate', 'no');
  });
});
