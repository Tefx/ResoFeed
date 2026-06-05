import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type Language = 'en' | 'zh';
type ReingestMode = 'success' | 'failure';

type FixtureSource = {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly last_fetch_at: string | null;
  readonly last_fetch_status: 'ok' | 'rss_fetch_error';
  readonly last_fetch_error?: string | null;
  readonly is_active: boolean;
  readonly revision: number;
};

type FixtureItemSummary = {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly source_item_title: string;
  readonly localized_title: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly key_points: readonly string[];
  readonly display_excerpt?: string | null;
  readonly value_tier: string | null;
  readonly content_status: 'ok' | 'summary_unavailable';
  readonly last_reprocess_status: 'ok' | 'failed' | null;
  readonly last_reprocess_error_code: 'decode_error' | 'schema_error' | 'model_error' | 'unknown' | null;
  readonly last_reprocess_error_message: string | null;
  readonly last_reprocess_at: string | null;
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

type FixtureItemDetail = FixtureItemSummary & {
  readonly feed_excerpt: string | null;
  readonly extracted_text: string | null;
  readonly provenance: {
    readonly source_url: string;
    readonly canonical_url: string | null;
    readonly original_url: string;
    readonly story_key: string | null;
    readonly duplicate_of_item_id: string | null;
    readonly grouped_source_items: readonly [];
  };
};

type StateBundle = {
  readonly schema_version: 'resofeed.state.v1';
  readonly exported_at: string;
  readonly sources: readonly [];
  readonly steer_rules: readonly [];
  readonly resonated_items: readonly [];
};

const diagnostic = 'err: timeout while fetching https://feeds.example.test/ogv2.xml after 20s';

const source: FixtureSource = {
  id: 'src_ogv2_contract',
  url: 'https://feeds.example.test/ogv2.xml',
  title: 'OGV2 Literal Source',
  last_fetch_at: '2026-06-01T10:00:00Z',
  last_fetch_status: 'rss_fetch_error',
  last_fetch_error: diagnostic,
  is_active: true,
  revision: 3
};

const item: FixtureItemSummary = {
  id: 'item_ogv2_contract',
  source_id: source.id,
  source_title: source.title,
  url: 'https://news.example.test/ogv2-contract',
  source_item_title: 'OGV2 source item literal title',
  localized_title: 'OGV2 检查器目标',
  title: 'OGV2 Inspector target',
  summary: '现有摘要在重生成状态期间必须保留。',
  core_insight: '现有核心洞察在失败状态期间必须保留。',
  key_points: ['保留第一条要点。', '保留第二条要点。', '保留第三条要点。'],
  display_excerpt: 'RSS excerpt should stay behind Text evidence.',
  value_tier: 'high',
  content_status: 'ok',
  last_reprocess_status: null,
  last_reprocess_error_code: null,
  last_reprocess_error_message: null,
  last_reprocess_at: null,
  published_at: '2026-06-01T10:05:00Z',
  first_seen_at: '2026-06-01T10:06:00Z',
  extraction_status: 'full',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
};

const detail: FixtureItemDetail = {
  ...item,
  feed_excerpt: 'RSS excerpt should stay behind Text evidence.',
  extracted_text: 'Source-backed article text remains available for audit in Text evidence.',
  provenance: {
    source_url: source.url,
    canonical_url: item.url,
    original_url: item.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

const successfulDetail: FixtureItemDetail = {
  ...detail,
  summary: '重生成后的摘要已显示，但检查器上下文仍保持。',
  core_insight: '重生成后的核心洞察仍然在同一个检查器中。',
  key_points: ['重生成第一条要点。', '重生成第二条要点。', '重生成第三条要点。'],
  last_reprocess_status: 'ok',
  last_reprocess_at: '2026-06-01T10:10:00Z'
};

const stateBundle: StateBundle = {
  schema_version: 'resofeed.state.v1',
  exported_at: '2026-06-01T10:00:00Z',
  sources: [],
  steer_rules: [],
  resonated_items: []
};

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installApiFixtures(
  page: Page,
  ownerToken: string,
  options: { readonly language?: Language; readonly reingestMode?: ReingestMode; readonly importBodies?: string[] } = {}
): Promise<void> {
  const language = options.language ?? 'en';
  const reingestMode = options.reingestMode ?? 'success';
  let currentDetail: FixtureItemDetail = detail;

  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();

    if (apiPath === '/api/sources') return fulfillJson(route, { sources: [source] });
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [currentDetail] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: language, label: language === 'zh' ? '中文' : 'English' } });
    if (apiPath === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (apiPath === '/api/runtime/openrouter-models') return fulfillJson(route, { models: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }] });
    if (apiPath === '/api/runtime/openrouter/models') return fulfillJson(route, { models: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }] });
    if (apiPath === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (apiPath === `/api/items/${item.id}/inspect` && method === 'POST') return fulfillJson(route, { item_id: item.id, human_inspected_at: '2026-06-01T10:07:00Z', already_applied: false });
    if (apiPath === `/api/items/${item.id}` && method === 'GET') return fulfillJson(route, { item: currentDetail });
    if (apiPath === `/api/items/${item.id}/reingest` && method === 'POST') {
      if (reingestMode === 'failure') {
        return fulfillJson(route, { error: { code: 'bad_gateway', message: 'err: decode_error: malformed upstream JSON', details: { reason: 'decode_error' } } }, 502);
      }
      currentDetail = successfulDetail;
      return fulfillJson(route, {
        already_applied: false,
        reingest: {
          item_id: item.id,
          status: 'completed',
          item_updated: true,
          fts_updated: true,
          model: null,
          item: successfulDetail
        }
      });
    }
    if (apiPath === '/api/state/export') return fulfillJson(route, stateBundle);
    if (apiPath === '/api/state/import' && method === 'POST') {
      options.importBodies?.push(request.postData() ?? '');
      return fulfillJson(route, { restored: true, sources: 0, steer_rules: 0, resonated_items: 0 });
    }
    if (apiPath === '/api/ingest' && method === 'POST') return fulfillJson(route, { ingest: { status: 'completed', errors: [] } });

    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${apiPath}`, details: {} } }, 404);
  });
}

async function captureEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'ogv2-contract-lock');
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

async function openInspector(page: Page): Promise<Locator> {
  await page.locator('.contract-feed-open').first().click();
  const inspector = page.locator('.contract-inspector').first();
  await expect(inspector).toContainText(/OGV2 Inspector target|OGV2 检查器目标/u);
  return inspector;
}

async function openSourceLedger(page: Page): Promise<Locator> {
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  const ledger = page.locator('.source-ledger');
  await expect(ledger).toBeVisible();
  return ledger;
}

async function disclosureSemanticState(locator: Locator): Promise<{ readonly nativeDetails: boolean; readonly ariaExpanded: string | null; readonly ariaControls: string | null }> {
  return locator.evaluate((element) => {
    const asElement = element as HTMLElement;
    const details = asElement.closest('details');
    return {
      nativeDetails: details instanceof HTMLDetailsElement,
      ariaExpanded: asElement.getAttribute('aria-expanded'),
      ariaControls: asElement.getAttribute('aria-controls')
    };
  });
}

async function expectViewportContained(locator: Locator, viewportWidth: number, label: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, `${label} must render a box`).not.toBeNull();
  expect(box!.x, `${label} must not overflow left`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label} must not overflow right`).toBeLessThanOrEqual(viewportWidth);
}

test.describe('OGV2 expected-red browser contract lock', () => {
  test('OGV2 expected-red: narrow zh Inspector exposes direct [重新生成] plus unbracketed 选项 without duplicate label or confirmation path', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await installApiFixtures(page, ownerToken, { language: 'zh' });
    await page.goto('/');
    const inspector = await openInspector(page);
    await captureEvidence(page, testInfo, 'zh-narrow-inspector-idle');

    await expect(inspector.getByRole('button', { name: '[重新生成]' })).toBeVisible();
    await expect(inspector.getByText('[重新生成]')).toHaveCount(1);
    await expect(inspector.getByText('重新生成', { exact: true })).toHaveCount(0);

    const options = inspector.getByRole('button', { name: '选项' });
    await expect(options).toBeVisible();
    await expect(options).toHaveText('选项');
    await expect(options).not.toHaveText(/\[/u);
    await expect(options).toHaveAttribute('aria-expanded', 'false');

    await expect(inspector.getByRole('button', { name: /确认重处理|确认重新生成|CONFIRM/u })).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: /取消|CANCEL/u })).toHaveCount(0);
  });

  test('OGV2 expected-red: Options disclosure opens model and one-time prompt without narrow viewport overflow', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await installApiFixtures(page, ownerToken, { language: 'zh' });
    await page.goto('/');
    const inspector = await openInspector(page);

    const options = inspector.getByRole('button', { name: '选项' });
    const collapsedSemantics = await disclosureSemanticState(options);
    expect(collapsedSemantics.nativeDetails || (collapsedSemantics.ariaExpanded === 'false' && Boolean(collapsedSemantics.ariaControls))).toBe(true);
    await options.click();
    await expect(options).toHaveAttribute('aria-expanded', 'true');
    await expect(inspector.getByLabel('模型')).toBeVisible();
    await expect(inspector.getByLabel(/额外提示|一次性提示/u)).toBeVisible();
    await inspector.getByLabel(/额外提示|一次性提示/u).fill('窄屏选项内容必须在检查器阅读宽度内换行，不得越出视口。'.repeat(4));
    await captureEvidence(page, testInfo, 'zh-narrow-options-open');

    const viewportWidth = page.viewportSize()?.width ?? 390;
    await expectViewportContained(inspector, viewportWidth, 'Inspector');
    await expectViewportContained(inspector.getByLabel('模型'), viewportWidth, 'Model selector');
    await expectViewportContained(inspector.getByLabel(/额外提示|一次性提示/u), viewportWidth, 'One-time prompt');
    await expect(inspector.getByRole('button', { name: '[重新生成]' })).toBeVisible();
    await expect(inspector.getByRole('button', { name: /确认|取消/u })).toHaveCount(0);
  });

  test('OGV2 expected-red: successful direct regenerate preserves Inspector context and uses status semantics', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { language: 'zh', reingestMode: 'success' });
    await page.goto('/');
    const inspector = await openInspector(page);

    await expect(inspector.getByText('现有摘要在重生成状态期间必须保留。')).toBeVisible();
    await expect(inspector.getByText('现有核心洞察在失败状态期间必须保留。')).toBeVisible();
    await inspector.getByRole('button', { name: '[重新生成]' }).click();
    await expect(inspector.getByRole('status', { name: /本文重处理状态|item re-ingest status/i })).toContainText(/重处理完成 · 搜索已刷新|re-ingest complete · search refreshed/u);
    await expect(inspector.getByRole('button', { name: '[重新生成]' })).toBeVisible();
    await expect(inspector.getByText('OGV2 检查器目标')).toBeVisible();
    await expect(inspector.getByText('重生成后的摘要已显示，但检查器上下文仍保持。')).toBeVisible();
    await expect(inspector.getByText('重生成后的核心洞察仍然在同一个检查器中。')).toBeVisible();
    await expect(inspector.getByRole('button', { name: /确认|取消/u })).toHaveCount(0);
    await captureEvidence(page, testInfo, 'zh-regenerate-success-status');
  });

  test('OGV2 expected-red: failed direct regenerate keeps existing content visible and localizes attempt status', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { language: 'zh', reingestMode: 'failure' });
    await page.goto('/');
    const inspector = await openInspector(page);

    await inspector.getByRole('button', { name: '[重新生成]' }).click();
    await expect(inspector.getByText('现有摘要在重生成状态期间必须保留。')).toBeVisible();
    await expect(inspector.getByText('现有核心洞察在失败状态期间必须保留。')).toBeVisible();
    await expect(inspector.getByText('保留第一条要点。')).toBeVisible();
    const status = inspector.getByRole('alert', { name: /本文重处理状态|item re-ingest status/i });
    await expect(status).toContainText(/上次重处理失败 · .* · 已保留现有摘要和要点/u);
    await expect(status).not.toContainText(/err:/u);
    await expect(inspector.getByRole('button', { name: '[重新生成]' })).toBeVisible();
    await expect(inspector.getByRole('button', { name: /确认|取消/u })).toHaveCount(0);
    await captureEvidence(page, testInfo, 'zh-regenerate-failure-preserved-content');
  });

  test('OGV2 expected-red: Inspector Text evidence and Source info are correctly labelled collapsed disclosures', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { language: 'en' });
    await page.goto('/');
    const inspector = await openInspector(page);
    await captureEvidence(page, testInfo, 'inspector-evidence-source-info-collapsed');

    const textEvidence = inspector.getByText('Text evidence', { exact: true });
    await expect(textEvidence).toBeVisible();
    await expect(textEvidence.locator('xpath=ancestor-or-self::details[1]')).not.toHaveAttribute('open', '');
    const textEvidenceSemantics = await disclosureSemanticState(textEvidence);
    expect(textEvidenceSemantics.nativeDetails || (textEvidenceSemantics.ariaExpanded === 'false' && Boolean(textEvidenceSemantics.ariaControls))).toBe(true);
    await textEvidence.click();
    await expect(inspector.getByText('Source-backed article text remains available for audit in Text evidence.')).toBeVisible();

    const sourceInfo = inspector.getByText('Source info', { exact: true });
    await expect(sourceInfo).toBeVisible();
    await expect(sourceInfo).not.toHaveText(/details/i);
    const sourceInfoSemantics = await disclosureSemanticState(sourceInfo);
    expect(sourceInfoSemantics.nativeDetails || (sourceInfoSemantics.ariaExpanded === 'false' && Boolean(sourceInfoSemantics.ariaControls))).toBe(true);
  });

  test('OGV2 expected-red: Source Ledger row diagnostics use source info / 来源信息 disclosure, never [DETAILS], while raw err details remain accessible', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { language: 'en' });
    await page.goto('/');
    const ledger = await openSourceLedger(page);
    await captureEvidence(page, testInfo, 'source-ledger-source-info-collapsed');

    await expect.soft(ledger.getByText('[DETAILS]')).toHaveCount(0);
    const sourceInfo = ledger.locator('.source-diagnostic-details summary').first();
    await expect(sourceInfo).toBeVisible();
    await expect.soft(sourceInfo).toHaveText('source info');
    const sourceInfoSemantics = await disclosureSemanticState(sourceInfo);
    expect(sourceInfoSemantics.nativeDetails || (sourceInfoSemantics.ariaExpanded === 'false' && Boolean(sourceInfoSemantics.ariaControls))).toBe(true);
    await sourceInfo.click();
    await expect(ledger.getByText(/fetch_error: err: timeout while fetching/u)).toBeVisible();

  });

  test('OGV2 expected-red: zh Source Ledger row diagnostics use 来源信息 disclosure instead of [DETAILS]', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { language: 'zh' });
    await page.goto('/');
    const ledger = await openSourceLedger(page);

    await expect.soft(ledger.getByText('[DETAILS]')).toHaveCount(0);
    await expect(ledger.locator('.source-diagnostic-details summary').first()).toHaveText('来源信息');
  });

  test('OGV2 expected-red: State import waits for inline confirmation and cancel/Escape/file-picker cancellation restore idle geometry and focus', async ({ page, ownerToken }, testInfo) => {
    const importBodies: string[] = [];
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { language: 'en', importBodies });
    await page.goto('/');
    const ledger = await openSourceLedger(page);
    const importState = ledger.getByRole('button', { name: '[IMPORT STATE]' });
    const idleBox = await importState.boundingBox();
    expect(idleBox).not.toBeNull();

    const cancelChooser = page.waitForEvent('filechooser');
    await importState.click();
    await (await cancelChooser).setFiles([]);
    await expect.soft(importState).toBeFocused();
    await expect(importState).toHaveText('[IMPORT STATE]');
    await expect(importState.locator('xpath=ancestor::*[@data-state][1]')).toHaveAttribute('data-state', 'idle');
    const cancelledBox = await importState.boundingBox();
    expect(cancelledBox).not.toBeNull();
    expect(Math.round(cancelledBox!.width)).toBe(Math.round(idleBox!.width));
    expect(Math.round(cancelledBox!.height)).toBe(Math.round(idleBox!.height));

    const selectChooser = page.waitForEvent('filechooser');
    await importState.click();
    await (await selectChooser).setFiles({ name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stateBundle)) });
    await expect.poll(() => importBodies.length, 'State replacement must not POST before inline confirmation').toBe(0);
    await expect(ledger.getByText('Import State replaces active sources, rules, and stars.')).toBeVisible();
    await expect(ledger.getByRole('button', { name: '[CONFIRM IMPORT]' })).toBeFocused();
    await expect(ledger.getByRole('button', { name: '[CANCEL]' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(importState).toBeFocused();
    await expect(importState).toHaveText('[IMPORT STATE]');
    await expect(ledger.getByRole('button', { name: '[CONFIRM IMPORT]' })).toHaveCount(0);
    await expect(ledger.getByRole('button', { name: '[CANCEL]' })).toHaveCount(0);
    await expect.poll(() => importBodies.length).toBe(0);
    await captureEvidence(page, testInfo, 'state-import-confirmation-reset');
  });
});
