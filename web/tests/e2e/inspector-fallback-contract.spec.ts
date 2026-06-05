import { expect, test } from 'playwright/test';

const fallbackItem = {
  id: 'browser-fallback-source-evidence-contract',
  source_id: 'source-browser-fallback',
  source_title: 'Browser Fallback Source',
  url: 'https://example.test/browser-fallback-item',
  title: 'Browser fallback source evidence item',
  summary: null,
  core_insight: null,
  display_excerpt: 'Browser raw RSS excerpt remains evidence only.',
  value_tier: null,
  published_at: '2026-05-20T00:00:00Z',
  first_seen_at: '2026-05-20T00:00:00Z',
  extraction_status: 'partial_extraction',
  model_status: 'summary_unavailable',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
};

const fallbackDetail = {
  ...fallbackItem,
  feed_excerpt: 'Browser raw RSS excerpt remains evidence only.',
  extracted_text: 'Browser unprocessed source body must not be shown as synthesized Chinese content.',
  provenance: {
    source_url: 'https://example.test/feed.xml',
    canonical_url: fallbackItem.url,
    original_url: fallbackItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

test('Inspector fallback state is low-chrome source evidence, not repeated ghost content', async ({ page }, testInfo) => {
  await page.route('**/api/sources', (route) => route.fulfill({ json: { sources: [{ id: fallbackItem.source_id, url: 'https://example.test/feed.xml', title: fallbackItem.source_title, last_fetch_at: null, last_fetch_status: 'ok', is_active: true, revision: 1 }] } }));
  await page.route('**/api/feed/today?**', (route) => route.fulfill({ json: { items: [fallbackItem] } }));
  await page.route('**/api/runtime/language', (route) => route.fulfill({ json: { language: { code: 'zh', label: '中文' } } }));
  await page.route('**/api/steer/active', (route) => route.fulfill({ json: { rules: [] } }));
  await page.route('**/api/items/browser-fallback-source-evidence-contract/inspect', (route) => route.fulfill({ json: { item_id: fallbackItem.id, human_inspected_at: '2026-05-20T00:00:00Z', already_applied: false } }));
  await page.route('**/api/items/browser-fallback-source-evidence-contract', (route) => route.fulfill({ json: { item: fallbackDetail } }));

  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('resofeed.ownerToken', 'rfeed_browser_fallback_contract_token'));
  await page.reload();

  await page.getByRole('button', { name: `Open Inspector for: ${fallbackItem.title}` }).click();
  const inspector = page.getByRole('complementary', { name: fallbackItem.title });
  await expect(inspector).toContainText('中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录');
  const textEvidence = inspector.getByLabel('文本证据');
  await expect(textEvidence).not.toHaveAttribute('open', '');
  await expect(textEvidence).toContainText('Browser raw RSS excerpt remains evidence only.');
  await expect(inspector.getByLabel('摘要')).toHaveCount(0);
  await expect(inspector.getByLabel('核心洞察')).toHaveCount(0);
  await expect(inspector).not.toContainText('Browser unprocessed source body must not be shown');
  expect(((await inspector.textContent()) ?? '').match(/中文处理未完成/g) ?? []).toHaveLength(1);

  await inspector.screenshot({ path: testInfo.outputPath('inspector-fallback-source-evidence.png') });
});
