import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type ItemSummary = {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly display_excerpt?: string | null;
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

type ItemDetail = ItemSummary & {
  readonly feed_excerpt: string | null;
  readonly extracted_text: string | null;
  readonly provenance: {
    readonly source_url: string;
    readonly canonical_url: string | null;
    readonly original_url: string;
    readonly story_key: string | null;
    readonly duplicate_of_item_id: string | null;
    readonly grouped_source_items: [];
  };
};

const source = {
  id: 'src_reingest_expected_red',
  url: 'https://feeds.example.test/reingest.xml',
  title: 'Literal Source Identifier',
  last_fetch_at: '2026-05-21T10:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const item: ItemSummary = {
  id: 'item_reingest_expected_red',
  source_id: source.id,
  source_title: source.title,
  url: 'https://news.example.test/reingest-target',
  title: 'Browser item re-ingest target',
  summary: null,
  core_insight: null,
  display_excerpt: 'RSS excerpt stays as collapsible source evidence.',
  value_tier: null,
  published_at: '2026-05-21T10:05:00Z',
  first_seen_at: '2026-05-21T10:06:00Z',
  extraction_status: 'full',
  model_status: 'model_latency_error',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
};

const detail: ItemDetail = {
  ...item,
  feed_excerpt: 'RSS excerpt stays as collapsible source evidence.',
  extracted_text: 'Readable source body exists while model output is unavailable.',
  provenance: {
    source_url: source.url,
    canonical_url: item.url,
    original_url: item.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

async function fulfillJson(route: Route, payload: object, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installApiFixtures(page: Page, ownerToken: string, reingestBodies: string[]): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;

    if (apiPath === '/api/sources') return fulfillJson(route, { sources: [source] });
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [item] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: 'en', label: 'English' } });
    if (apiPath === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (apiPath === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (apiPath === `/api/items/${item.id}/inspect` && request.method() === 'POST') {
      return fulfillJson(route, { item_id: item.id, human_inspected_at: '2026-05-21T12:00:00Z', already_applied: false });
    }
    if (apiPath === `/api/items/${item.id}/reingest` && request.method() === 'POST') {
      reingestBodies.push(request.postData() ?? '');
      return fulfillJson(route, {
        already_applied: false,
        reingest: {
          item_id: item.id,
          status: 'completed',
          item_updated: true,
          fts_updated: true,
          model: 'openai/gpt-4.1-mini',
          item: {
            ...detail,
            summary: 'Browser re-ingest summary.',
            core_insight: 'Browser re-ingest core insight.',
            extraction_status: 'full',
            model_status: 'ok'
          }
        }
      });
    }
    if (apiPath === `/api/items/${item.id}` && request.method() === 'GET') return fulfillJson(route, { item: detail });
    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${apiPath}`, details: {} } }, 404);
  });
}

async function captureEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'inspector-reingest-expected-red');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const domPath = path.join(evidenceDir, `${name}.dom.html`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(domPath, await page.locator('body').evaluate((node) => node.outerHTML), 'utf8');
  await fs.promises.writeFile(ariaPath, await page.locator('body').ariaSnapshot(), 'utf8');
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.dom.html`, { path: domPath, contentType: 'text/html' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
}

test('expected-red browser-visible Inspector item re-ingest flow and evidence contract', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken, reingestBodies);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();

  await expect(page.getByRole('button', { name: /re-ingest item/i })).toHaveCount(0);
  await page.getByRole('button', { name: `Open Inspector for: ${item.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await expect(inspector).toContainText(item.title);
  await captureEvidence(page, testInfo, 'inspector-before-reingest-assertions');

  await expect(inspector.getByRole('link', { name: 'original link' })).toHaveAttribute('translate', 'no');
  await expect(inspector.getByLabel(/Source: Literal Source Identifier/u)).toHaveAttribute('translate', 'no');

  const sourceEvidence = inspector.getByRole('group', { name: 'Source evidence' });
  await expect(sourceEvidence).not.toHaveAttribute('open', '');

  const panel = inspector.getByLabel('Item re-ingest');
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Model')).toHaveValue('default');
  await panel.getByLabel('One-time prompt').fill('Retry with article-only extraction.');
  await panel.getByRole('button', { name: '[RE-INGEST ITEM]' }).click();

  await expect.poll(() => reingestBodies.length).toBe(1);
  const reingestBody = JSON.parse(reingestBodies[0] ?? '{}') as Record<string, unknown>;
  expect(typeof reingestBody.idempotency_key).toBe('string');
  expect(reingestBody.idempotency_key).not.toBe('');
  expect(reingestBody).toEqual({
    actor_kind: 'human',
    actor_id: 'owner',
    idempotency_key: reingestBody.idempotency_key,
    model: null,
    prompt: 'Retry with article-only extraction.'
  });
  await expect(panel.getByLabel('One-time prompt')).toHaveValue('');
  await expect(page.evaluate(() => window.localStorage.getItem('resofeed.itemReingestPrompt'))).resolves.toBeNull();
  await captureEvidence(page, testInfo, 'inspector-after-reingest-submit');
});
