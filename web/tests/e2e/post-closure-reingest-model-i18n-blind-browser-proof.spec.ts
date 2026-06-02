import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type NetworkEntry = {
  method: string;
  path: string;
  status: number;
  payload?: unknown;
  response?: unknown;
};

const source = {
  id: 'src_blind_i18n_repair',
  url: 'https://feeds.example.test/blind-i18n.xml',
  title: 'Literal Source Identifier',
  last_fetch_at: '2026-05-22T10:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const item = {
  id: 'item_blind_reingest_i18n',
  source_id: source.id,
  source_title: source.title,
  url: 'https://news.example.test/blind-reingest-original-link',
  title: 'Browser i18n re-ingest target',
  summary: null,
  core_insight: null,
  display_excerpt: 'RSS excerpt before explicit re-ingest.',
  value_tier: null,
  published_at: '2026-05-22T10:05:00Z',
  first_seen_at: '2026-05-22T10:06:00Z',
  extraction_status: 'full',
  model_status: 'model_latency_error',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
};

const detail = {
  ...item,
  feed_excerpt: 'RSS excerpt before explicit re-ingest.',
  extracted_text: 'Readable source text exists before explicit model retry.',
  provenance: {
    source_url: source.url,
    canonical_url: item.url,
    original_url: item.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

const zhReingestedDetail = {
  ...detail,
  summary: '显式重处理后的中文摘要，足以证明目标语言内容已更新。',
  core_insight: '显式重处理后的中文核心洞察，说明修复后的浏览器状态。',
  extracted_text: '显式重处理后的中文正文片段，用于浏览器证据。',
  extraction_status: 'full',
  model_status: 'ok'
};

const openRouterModels = {
  models: [
    { id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }
  ]
};

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installApiFixtures(
  page: Page,
  ownerToken: string,
  network: NetworkEntry[],
  mode: 'positive' | 'negative'
): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  let currentDetail: typeof detail | typeof zhReingestedDetail = detail;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();

    if (apiPath === '/api/sources') return fulfillJson(route, { sources: [source] });
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [item] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: 'zh', label: '中文' }, already_applied: false });
    if (apiPath === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (apiPath === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (apiPath === '/api/runtime/openrouter-models') {
      network.push({ method, path: apiPath, status: 200, response: openRouterModels });
      return fulfillJson(route, openRouterModels);
    }
    if (apiPath === '/api/runtime/openrouter/models') {
      network.push({ method, path: apiPath, status: 200, response: openRouterModels });
      return fulfillJson(route, openRouterModels);
    }
    if (apiPath === `/api/items/${item.id}/inspect` && method === 'POST') {
      return fulfillJson(route, { item_id: item.id, human_inspected_at: '2026-05-22T12:00:00Z', already_applied: false });
    }
    if (apiPath === `/api/items/${item.id}` && method === 'GET') {
      return fulfillJson(route, { item: currentDetail });
    }
    if (apiPath === `/api/items/${item.id}/reingest` && method === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      if (mode === 'negative') {
        network.push({ method, path: apiPath, status: 400, payload });
        return fulfillJson(route, { error: { code: 'bad_request', message: 'err: bad_request: conflicting prompt fields rejected safely', details: { field: 'prompt' } } }, 400);
      }
      currentDetail = zhReingestedDetail;
      network.push({ method, path: apiPath, status: 200, payload });
      return fulfillJson(route, {
        already_applied: false,
        reingest: {
          item_id: item.id,
          status: 'completed',
          item_updated: true,
          fts_updated: true,
          language: 'zh',
          error: null,
          item: zhReingestedDetail
        }
      });
    }

    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${apiPath}`, details: {} } }, 404);
  });
}

async function captureEvidence(page: Page, testInfo: TestInfo, name: string, extra: unknown): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'blind-browser-proof');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const domPath = path.join(evidenceDir, `${name}.dom.html`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  const jsonPath = path.join(evidenceDir, `${name}.network.json`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(domPath, await page.locator('body').evaluate((node) => node.outerHTML), 'utf8');
  await fs.promises.writeFile(ariaPath, await page.locator('body').ariaSnapshot(), 'utf8');
  await fs.promises.writeFile(jsonPath, JSON.stringify(extra, null, 2), 'utf8');

  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.dom.html`, { path: domPath, contentType: 'text/html' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
  await testInfo.attach(`${name}.network.json`, { path: jsonPath, contentType: 'application/json' });
}

test('blind proof: zh model-list route parity and successful item re-ingest collapse controls', async ({ page, ownerToken }, testInfo) => {
  const network: NetworkEntry[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken, network, 'positive');
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const compatibilityModels = await page.evaluate(async (token) => {
    const response = await fetch('/api/runtime/openrouter/models', { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  }, ownerToken);
  expect(compatibilityModels).toEqual({ status: 200, body: openRouterModels });
  await expect(page.getByRole('button', { name: `Open Inspector for: ${item.title}` })).toHaveCount(0);
  const zhOpenInspector = page.getByRole('button', { name: `打开检查器：${item.title}` });
  await expect(zhOpenInspector).toBeVisible();
  await zhOpenInspector.click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await expect(inspector.getByText('INSPECTOR')).toBeVisible();
  await expect(inspector.getByText('检查器')).toHaveCount(0);
  await expect(inspector.getByText(/中文处理失败|中文处理未完成/u)).toBeVisible();
  await expect(inspector.getByLabel(/Source: Literal Source Identifier/u)).toHaveAttribute('translate', 'no');
  await expect(inspector.getByRole('link', { name: '原文链接' })).toHaveAttribute('translate', 'no');

  const panel = inspector.getByLabel('本文重处理');
  await panel.getByRole('button', { name: '[重新处理本文]' }).click();
  await expect(panel.getByText(/模型列表：2 个 OpenRouter 模型可用|model list: 2 OpenRouter models available/iu)).toBeVisible();
  await expect(panel.getByRole('option', { name: 'GPT 4.1 Mini (openai/gpt-4.1-mini)' })).toHaveAttribute('value', 'openai/gpt-4.1-mini');
  await panel.getByLabel('模型').selectOption('openai/gpt-4.1-mini');
  await panel.getByLabel('一次性提示').fill('请用中文重写摘要和核心洞察。');
  await captureEvidence(page, testInfo, 'before-positive-confirm', { network });

  await panel.getByRole('button', { name: '[确认重处理]' }).click();
  await expect(inspector.getByText('显式重处理后的中文摘要，足以证明目标语言内容已更新。')).toBeVisible();
  await expect(inspector.getByText('显式重处理后的中文核心洞察，说明修复后的浏览器状态。')).toBeVisible();
  await expect(panel.getByRole('button', { name: '[重新处理本文]' })).toBeVisible();
  await expect(panel.getByRole('status', { name: /item re-ingest status|本文重处理状态/i })).toContainText('重处理完成 · 搜索已刷新');
  await expect(panel.getByRole('button', { name: '[确认重处理]' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '[取消]' })).toHaveCount(0);
  await expect(panel.getByLabel('模型')).toHaveCount(0);
  await expect(panel.getByLabel('一次性提示')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('resofeed.itemReingestPrompt'))).toBeNull();

  const extraPromptProof = await page.evaluate(async ({ token, itemId }) => {
    const response = await fetch(`/api/items/${itemId}/reingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: 'human',
        actor_id: 'owner',
        idempotency_key: 'browser-extra-prompt-compatibility-proof',
        model: 'openai/gpt-4.1-mini',
        extra_prompt: '请通过兼容 extra_prompt 字段证明一次性提示。'
      })
    });
    return { status: response.status, body: await response.json() };
  }, { token: ownerToken, itemId: item.id });
  expect(extraPromptProof.status).toBe(200);
  expect(extraPromptProof.body).toMatchObject({ already_applied: false, reingest: { item_id: item.id, status: 'completed', item_updated: true, fts_updated: true } });
  await captureEvidence(page, testInfo, 'after-positive-success-collapse', { network });

  const reingest = network.find((entry) => entry.path.endsWith('/reingest'));
  expect(reingest?.status).toBe(200);
  expect(reingest?.payload).toMatchObject({ actor_kind: 'human', actor_id: 'owner', model: 'openai/gpt-4.1-mini', prompt: '请用中文重写摘要和核心洞察。' });
  expect(reingest?.payload).not.toHaveProperty('language');
  const extraPromptReingest = network.find((entry) => entry.payload && (entry.payload as Record<string, unknown>).extra_prompt === '请通过兼容 extra_prompt 字段证明一次性提示。');
  expect(extraPromptReingest?.status).toBe(200);
  expect(extraPromptReingest?.payload).toMatchObject({ actor_kind: 'human', actor_id: 'owner', model: 'openai/gpt-4.1-mini', extra_prompt: '请通过兼容 extra_prompt 字段证明一次性提示。' });
  expect(extraPromptReingest?.payload).not.toHaveProperty('language');
  expect(network.filter((entry) => entry.path.includes('/api/runtime/openrouter'))).toEqual([
    { method: 'GET', path: '/api/runtime/openrouter-models', status: 200, response: openRouterModels },
    { method: 'GET', path: '/api/runtime/openrouter/models', status: 200, response: openRouterModels }
  ]);
});

test('blind proof: negative re-ingest error keeps correction controls and avoids stale completion', async ({ page, ownerToken }, testInfo) => {
  const network: NetworkEntry[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken, network, 'negative');
  await page.goto('/');
  await page.getByRole('button', { name: `打开检查器：${item.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  const panel = inspector.getByLabel('本文重处理');
  await panel.getByRole('button', { name: '[重新处理本文]' }).click();
  await panel.getByLabel('一次性提示').fill('保留这个失败后的修正提示。');
  await panel.getByRole('button', { name: '[确认重处理]' }).click();

  await expect(panel.getByText(/err: bad_request: conflicting prompt fields rejected safely/u)).toBeVisible();
  await expect(panel.getByRole('button', { name: '[确认重处理]' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '[取消]' })).toBeVisible();
  await expect(panel.getByLabel('一次性提示')).toHaveValue('保留这个失败后的修正提示。');
  await expect(inspector.getByText('显式重处理后的中文摘要，足以证明目标语言内容已更新。')).toHaveCount(0);
  await captureEvidence(page, testInfo, 'negative-error-safe-state', { network });

  const reingest = network.find((entry) => entry.path.endsWith('/reingest'));
  expect(reingest?.status).toBe(400);
  expect(reingest?.payload).toMatchObject({ prompt: '保留这个失败后的修正提示。' });
});
