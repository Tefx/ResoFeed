import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from 'playwright/test';
import { expect, test } from './fixtures';

async function fulfillJson(route: Route, payload: object, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

test('audit options collapse and focus remains on disclosure trigger', async ({ page, ownerToken }, testInfo) => {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  const fallbackItem = {
    id: 'item1', source_id: 'src1', source_title: 'src1', url: 'https://test', title: 'Audit fallback source disclosure target',
    summary: null, core_insight: null, display_excerpt: 'excerpt', value_tier: null, published_at: null, first_seen_at: null,
    extraction_status: 'full', model_status: 'model_latency_error', is_resonated: false, human_inspected_at: null,
    external_surfaced_at: null, story_key: null, duplicate_of_item_id: null
  };
  const fallbackDetail = { ...fallbackItem, feed_excerpt: 'excerpt', extracted_text: 'ext', provenance: { source_url: '', original_url: '', grouped_source_items: [] } };

  await page.route('**/api/**', async (route) => {
    const apiPath = new URL(route.request().url()).pathname;
    if (apiPath === '/api/sources') return fulfillJson(route, { sources: [{ id: 'src1', url: 'https://test', title: 'src1', last_fetch_at: '', last_fetch_status: 'ok', is_active: true, revision: 1 }] });
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [fallbackItem] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: 'en', label: 'English' } });
    if (apiPath === '/api/runtime/openrouter-models') return fulfillJson(route, { models: [{ id: 'm1', name: 'M1' }] });
    if (apiPath === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false } });
    if (apiPath === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (apiPath === `/api/items/item1/inspect`) return fulfillJson(route, { item_id: 'item1', human_inspected_at: '2026', already_applied: false });
    if (apiPath === `/api/items/item1`) return fulfillJson(route, { item: fallbackDetail });
    return fulfillJson(route, {}, 404);
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  await page.getByRole('button', { name: `Open Inspector for: Audit fallback source disclosure target` }).click();
  const panel = page.getByLabel('Item re-ingest');
  const regenerate = panel.getByRole('button', { name: '[REGENERATE]' });
  const options = panel.getByRole('button', { name: 'Options' });
  await expect(regenerate).toBeVisible();
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('button', { name: '[CONFIRM RE-INGEST]' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '[CANCEL]' })).toHaveCount(0);

  await options.click();
  await expect(options).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByText('extra prompt (one-time, not saved)')).toBeVisible();
  await panel.getByLabel('One-time prompt').fill('Temporary prompt');

  await options.focus();
  await page.keyboard.press('Enter');
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByLabel('One-time prompt')).toHaveCount(0);
  await expect(regenerate).toBeVisible();
  await expect(options).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(panel.getByLabel('One-time prompt')).toHaveValue('Temporary prompt');

  const evidenceDir = path.join(testInfo.outputDir, 'inspector-cancel-audit');
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, 'cancel-cleared.png'), fullPage: true });
  await fs.promises.writeFile(path.join(evidenceDir, 'cancel-cleared.dom.html'), await page.locator('body').evaluate((node) => node.outerHTML), 'utf8');
  await fs.promises.writeFile(path.join(evidenceDir, 'cancel-cleared.aria.txt'), await page.locator('body').ariaSnapshot(), 'utf8');
});
