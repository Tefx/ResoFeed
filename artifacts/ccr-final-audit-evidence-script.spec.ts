import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const baseDetail = {
  id: 'audit-item',
  source_id: 'src1',
  source_title: 'Audit Source',
  title: 'Audit Title',
  url: 'https://example.com/audit',
  published_at: new Date().toISOString(),
  feed_excerpt: 'Audit excerpt',
  author: 'Auditor',
  extracted_text: 'Audit text',
  model_status: 'ok',
  extraction_status: 'ok',
  extraction_error: null,
  human_inspected_at: null,
  steer_match_refs: [],
  summary: '这是摘要测试',
  core_insight: '这是核心洞察测试',
  key_points: ['zh section key point 1', 'zh section key point 2', 'zh section key point 3'],
  value_tier: 'high',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

test('desktop split-pane Inspector reingest control and zh sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.route('**/api/sources', (route) => route.fulfill({ json: { sources: [{ id: 'src1', url: 'https://example.test/feed.xml', title: 'Source', last_fetch_at: null, last_fetch_status: 'ok', is_active: true, revision: 1 }] } }));
  await page.route('**/api/feed/today?**', (route) => route.fulfill({ json: { items: [baseDetail] } }));
  await page.route('**/api/runtime/language', (route) => route.fulfill({ json: { language: { code: 'zh', label: '中文' } } }));
  await page.route('**/api/steer/active', (route) => route.fulfill({ json: { rules: [] } }));
  await page.route('**/api/items/*/inspect', (route) => route.fulfill({ json: { item_id: baseDetail.id, human_inspected_at: new Date().toISOString(), already_applied: false } }));
  await page.route('**/api/items/*', (route) => route.fulfill({ json: { item: baseDetail } }));

  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('resofeed.ownerToken', 'audit_token'));
  await page.reload();

  await page.getByRole('button', { name: `Open Inspector for: ${baseDetail.title}` }).click();
  const inspector = page.getByRole('complementary', { name: baseDetail.title });
  await expect(inspector).toBeVisible();

  // Wait a bit to ensure it rendered fully
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '../artifacts/ccr-final-audit-desktop-reingest.png' });
  const html = await inspector.evaluate(el => el.outerHTML);
  fs.writeFileSync('../artifacts/ccr-final-audit-desktop-dom.html', html);

  const reingestBtn = inspector.getByRole('button', { name: '[重新处理本文]' });
  await expect(reingestBtn).toBeVisible();
});

test('original_unavailable fallback status copy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const fallbackDetail = {
    ...baseDetail,
    extraction_status: 'original_unavailable',
    extracted_text: null
  };

  await page.route('**/api/sources', (route) => route.fulfill({ json: { sources: [{ id: 'src1', url: 'https://example.test/feed.xml', title: 'Source', last_fetch_at: null, last_fetch_status: 'ok', is_active: true, revision: 1 }] } }));
  await page.route('**/api/feed/today?**', (route) => route.fulfill({ json: { items: [fallbackDetail] } }));
  await page.route('**/api/runtime/language', (route) => route.fulfill({ json: { language: { code: 'zh', label: '中文' } } }));
  await page.route('**/api/steer/active', (route) => route.fulfill({ json: { rules: [] } }));
  await page.route('**/api/items/*/inspect', (route) => route.fulfill({ json: { item_id: fallbackDetail.id, human_inspected_at: new Date().toISOString(), already_applied: false } }));
  await page.route('**/api/items/*', (route) => route.fulfill({ json: { item: fallbackDetail } }));

  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('resofeed.ownerToken', 'audit_token'));
  await page.reload();

  await page.getByRole('button', { name: `Open Inspector for: ${fallbackDetail.title}` }).click();
  const inspector = page.getByRole('complementary', { name: fallbackDetail.title });
  await expect(inspector).toBeVisible();

  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '../artifacts/ccr-final-audit-fallback.png' });
  const html = await inspector.evaluate(el => el.outerHTML);
  fs.writeFileSync('../artifacts/ccr-final-audit-fallback-dom.html', html);
  
  await expect(inspector).not.toContainText('原文不可用 · 摘要/核心洞察不可用');
  await expect(inspector).toContainText('原文不可用 · 摘要/核心洞察可用');
});
