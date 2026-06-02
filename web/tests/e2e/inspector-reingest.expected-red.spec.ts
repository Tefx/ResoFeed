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

type MinimalSelectedItemReingestRequest = {
  readonly actor_kind: 'human';
  readonly actor_id: 'owner';
  readonly idempotency_key: string;
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

const modelBackedItem: ItemSummary = {
  ...item,
  id: 'item_model_backed_source_disclosure_expected_red',
  title: 'Browser model-backed item source disclosure target',
  summary: 'Browser model-backed summary is present.',
  core_insight: 'Browser model-backed core insight is present.',
  display_excerpt: 'Browser RSS excerpt remains available as fallback source text.',
  extraction_status: 'full',
  model_status: 'ok'
};

const modelBackedDetail: ItemDetail = {
  ...modelBackedItem,
  feed_excerpt: 'Browser RSS excerpt remains available as fallback source text.',
  extracted_text: 'Browser full source text remains available for verification behind a collapsed disclosure.',
  provenance: {
    ...detail.provenance,
    canonical_url: 'https://news.example.test/model-backed-source-disclosure',
    original_url: 'https://news.example.test/model-backed-source-disclosure'
  }
};

const openRouterModelListing = {
  models: [
    { id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }
  ]
} as const;

const minimalSelectedItemReingestRequest: MinimalSelectedItemReingestRequest = {
  actor_kind: 'human',
  actor_id: 'owner',
  idempotency_key: 'reingest-minimal-default-model-prompt-001'
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
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [item, modelBackedItem] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: 'en', label: 'English' } });
    if (apiPath === '/api/runtime/openrouter-models') return fulfillJson(route, openRouterModelListing);
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
    if (apiPath === `/api/items/${modelBackedItem.id}/inspect` && request.method() === 'POST') {
      return fulfillJson(route, { item_id: modelBackedItem.id, human_inspected_at: '2026-05-21T12:05:00Z', already_applied: false });
    }
    if (apiPath === `/api/items/${modelBackedItem.id}` && request.method() === 'GET') return fulfillJson(route, { item: modelBackedDetail });
    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${apiPath}`, details: {} } }, 404);
  });
}

async function installApiFixturesWithOptions(page: Page, ownerToken: string, reingestBodies: string[], options: { language?: 'en' | 'zh'; canonicalModelListStatus?: 200 | 404; compatibilityModelListStatus?: 200 | 404 } = {}): Promise<void> {
  const language = options.language ?? 'en';
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;

    if (apiPath === '/api/sources') return fulfillJson(route, { sources: [source] });
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [item] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: language, label: language === 'zh' ? '中文' : 'English' } });
    if (apiPath === '/api/runtime/openrouter-models') {
      return options.canonicalModelListStatus === 404
        ? fulfillJson(route, { error: { code: 'not_found', message: 'not found: canonical model list route', details: {} } }, 404)
        : fulfillJson(route, openRouterModelListing);
    }
    if (apiPath === '/api/runtime/openrouter/models') {
      return options.compatibilityModelListStatus === 404
        ? fulfillJson(route, { error: { code: 'not_found', message: 'not found: compatibility model list route', details: {} } }, 404)
        : fulfillJson(route, openRouterModelListing);
    }
    if (apiPath === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (apiPath === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (apiPath === `/api/items/${item.id}/inspect` && request.method() === 'POST') return fulfillJson(route, { item_id: item.id, human_inspected_at: '2026-05-21T12:00:00Z', already_applied: false });
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
            summary: language === 'zh' ? '显式重处理后的中文摘要。' : 'Browser re-ingest summary.',
            core_insight: language === 'zh' ? '显式重处理后的核心洞察。' : 'Browser re-ingest core insight.',
            extracted_text: language === 'zh' ? '显式重处理后的中文正文。' : detail.extracted_text,
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

async function attachJson(testInfo: TestInfo, name: string, payload: object): Promise<string> {
  const evidenceDir = path.join(testInfo.outputDir, 'inspector-reingest-expected-red');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const artifactPath = path.join(evidenceDir, `${name}.json`);
  await fs.promises.writeFile(artifactPath, JSON.stringify(payload, null, 2), 'utf8');
  await testInfo.attach(`${name}.json`, { path: artifactPath, contentType: 'application/json' });
  return artifactPath;
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
  await expect(panel).toHaveText(/ITEM RE-INGEST\s+\[RE-INGEST ITEM\]/);
  await expect.poll(() => inspector.evaluate((root) => {
    const panelNode = root.querySelector('[data-contract="inspector-reingest"]');
    const sourceEvidenceNode = root.querySelector('[aria-label="Source evidence"]');
    if (!panelNode || !sourceEvidenceNode) return false;
    return (panelNode.compareDocumentPosition(sourceEvidenceNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  })).toBe(true);
  await panel.getByRole('button', { name: '[RE-INGEST ITEM]' }).click();
  await expect(panel.getByText('model:')).toBeVisible();
  await expect(panel.getByText('extra prompt (one-time, guidance only, not saved)')).toBeVisible();
  await expect(panel.getByText(/guidance only; cannot override schema, language, source identifiers, safety, status, or persistence/i)).toBeVisible();
  await expect(panel.getByText(/may change emphasis, angle, or fact selection only among source-backed facts/i)).toBeVisible();
  await expect(panel.getByLabel('Model')).toHaveValue('default');
  await panel.getByLabel('One-time prompt').fill('Retry with article-only extraction.');
  await panel.getByRole('button', { name: '[CONFIRM RE-INGEST]' }).click();

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
  expect(reingestBody).not.toHaveProperty('language');
  expect(reingestBody.model).not.toBe('account_default');
  await expect(panel.getByLabel('One-time prompt')).toHaveCount(0);
  await expect(page.evaluate(() => window.localStorage.getItem('resofeed.itemReingestPrompt'))).resolves.toBeNull();
  await expect(page.evaluate(() => window.localStorage.getItem('resofeed.itemReingestModel'))).resolves.toBeNull();
  await expect(page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.toLowerCase().includes('reingest') || key.toLowerCase().includes('prompt') || key.toLowerCase().includes('model')))).resolves.toEqual([]);
  await captureEvidence(page, testInfo, 'inspector-after-reingest-submit');

  await expect(panel.getByRole('button', { name: '[RE-INGEST ITEM]' }), 'R1 DOM proof: success must collapse controls').toBeVisible();
  await expect(panel.getByRole('button', { name: '[CONFIRM RE-INGEST]' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '[CANCEL]' })).toHaveCount(0);
  await expect(panel.getByLabel('Model')).toHaveCount(0);
  await expect(panel.getByLabel('One-time prompt')).toHaveCount(0);
});

test('expected-red browser DOM shows model-backed source text disclosure contract', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken, reingestBodies);
  await page.goto('/');

  await page.getByRole('button', { name: `Open Inspector for: ${modelBackedItem.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await expect(inspector).toContainText('Browser model-backed summary is present.');
  await expect(inspector).toContainText('Browser model-backed core insight is present.');
  await captureEvidence(page, testInfo, 'inspector-model-backed-source-disclosure-red');

  const sourceText = inspector.locator('[aria-label="Source text"]');
  await expect(sourceText).toHaveCount(1);
  await expect(sourceText).toHaveJSProperty('tagName', 'DETAILS');
  await expect(sourceText).not.toHaveAttribute('open', '');
});

test('expected-red browser DOM shows OpenRouter model list diagnostics in Inspector selector', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken, reingestBodies);
  await page.goto('/');

  await page.getByRole('button', { name: `Open Inspector for: ${item.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  const panel = inspector.getByLabel('Item re-ingest');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '[RE-INGEST ITEM]' }).click();
  await captureEvidence(page, testInfo, 'inspector-model-list-diagnostics-red');

  await expect(panel.getByText(/model list: 2 OpenRouter models available/i)).toBeVisible();
  await expect(panel.getByRole('option', { name: 'GPT 4.1 Mini (openai/gpt-4.1-mini)' })).toHaveAttribute('value', 'openai/gpt-4.1-mini');
  await expect(panel.getByRole('option', { name: 'Claude 3.5 Sonnet (anthropic\/claude-3.5-sonnet)' })).toHaveAttribute('value', 'anthropic/claude-3.5-sonnet');
});

test('spec fixture: selected-item re-ingest minimal request omits optional model prompt and language', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  await installApiFixtures(page, ownerToken, reingestBodies);
  await page.goto('/');

  await page.evaluate(async ({ token, body }) => {
    const response = await fetch('/api/items/item_reingest_expected_red/reingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`fixture reingest failed: ${response.status}`);
    return response.json();
  }, { token: ownerToken, body: minimalSelectedItemReingestRequest });

  await expect.poll(() => reingestBodies.length).toBe(1);
  const sentBody = JSON.parse(reingestBodies[0] ?? '{}') as Record<string, unknown>;
  await attachJson(testInfo, 'minimal-selected-item-reingest-request', sentBody);
  expect(sentBody).toEqual(minimalSelectedItemReingestRequest);
  expect(sentBody).not.toHaveProperty('model');
  expect(sentBody).not.toHaveProperty('prompt');
  expect(sentBody).not.toHaveProperty('extra_prompt');
  expect(sentBody).not.toHaveProperty('language');
});

test('expected-red browser network proof: compatibility OpenRouter route prevents false unavailable state', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  const modelRequests: Array<{ path: string; status: number }> = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes('/api/runtime/openrouter')) modelRequests.push({ path: url.pathname, status: response.status() });
  });
  await installApiFixturesWithOptions(page, ownerToken, reingestBodies, { canonicalModelListStatus: 404, compatibilityModelListStatus: 200 });
  await page.goto('/');
  await page.getByRole('button', { name: `Open Inspector for: ${item.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  const panel = inspector.getByLabel('Item re-ingest');
  await panel.getByRole('button', { name: '[RE-INGEST ITEM]' }).click();
  await captureEvidence(page, testInfo, 'inspector-model-list-compat-route-red');
  await attachJson(testInfo, 'inspector-model-list-network-red', { modelRequests });

  await expect(panel.getByText(/model list: 2 OpenRouter models available/i)).toBeVisible();
  await expect(panel.getByRole('option', { name: 'GPT 4.1 Mini (openai/gpt-4.1-mini)' })).toHaveAttribute('value', 'openai/gpt-4.1-mini');
  expect(modelRequests).toEqual([
    { path: '/api/runtime/openrouter-models', status: 404 },
    { path: '/api/runtime/openrouter/models', status: 200 }
  ]);
});

test('expected-red browser zh chrome and post-reingest item text proof', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixturesWithOptions(page, ownerToken, reingestBodies, { language: 'zh' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.getByRole('button', { name: `Open Inspector for: ${item.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await captureEvidence(page, testInfo, 'inspector-zh-before-reingest-red');
  await expect(inspector.getByText('检查器')).toBeVisible();
  await expect(inspector.getByText(/中文处理失败|中文处理未完成/u)).toBeVisible();
  await expect(inspector.getByLabel(/Source: Literal Source Identifier/u)).toHaveAttribute('translate', 'no');
  const panel = inspector.getByLabel('本文重处理');
  await panel.getByRole('button', { name: '[重新处理本文]' }).click();
  await panel.getByLabel('一次性提示').fill('请用中文重写摘要和核心洞察。');
  await panel.getByRole('button', { name: '[确认重处理]' }).click();
  await captureEvidence(page, testInfo, 'inspector-zh-after-reingest-red');

  await expect(inspector.getByText('摘要：')).toBeVisible();
  await expect(inspector.getByText('核心洞察：')).toBeVisible();
  await expect(inspector.getByText('显式重处理后的中文摘要。')).toBeVisible();
  await expect(inspector.getByText('显式重处理后的核心洞察。')).toBeVisible();
  expect(JSON.parse(reingestBodies[0] ?? '{}')).not.toHaveProperty('language');
});
