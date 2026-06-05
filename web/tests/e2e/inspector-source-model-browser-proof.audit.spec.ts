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
  id: 'src_audit_inspector_source_model',
  url: 'https://feeds.example.test/audit-inspector.xml',
  title: 'Audit Literal Source',
  last_fetch_at: '2026-05-21T10:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const fallbackItem: ItemSummary = {
  id: 'item_audit_fallback_source_disclosure',
  source_id: source.id,
  source_title: source.title,
  url: 'https://news.example.test/audit-fallback-source',
  title: 'Audit fallback source disclosure target',
  summary: null,
  core_insight: null,
  display_excerpt: 'Audit RSS source excerpt is readable only after disclosure expansion.',
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

const fallbackDetail: ItemDetail = {
  ...fallbackItem,
  feed_excerpt: 'Audit RSS source excerpt is readable only after disclosure expansion.',
  extracted_text: 'Audit extracted source body is retained for provenance.',
  provenance: {
    source_url: source.url,
    canonical_url: fallbackItem.url,
    original_url: fallbackItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

const modelBackedItem: ItemSummary = {
  ...fallbackItem,
  id: 'item_audit_model_backed_source_text',
  title: 'Audit model-backed source text target',
  url: 'https://news.example.test/audit-model-backed-source-text',
  summary: 'Audit model-backed summary is present.',
  core_insight: 'Audit model-backed core insight is present.',
  display_excerpt: 'Audit model-backed RSS excerpt remains available.',
  model_status: 'ok'
};

const modelBackedDetail: ItemDetail = {
  ...modelBackedItem,
  feed_excerpt: 'Audit model-backed RSS excerpt remains available.',
  extracted_text: 'Audit full source text becomes readable when the Text evidence disclosure expands.',
  provenance: {
    ...fallbackDetail.provenance,
    canonical_url: modelBackedItem.url,
    original_url: modelBackedItem.url
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
    const apiPath = new URL(request.url()).pathname;
    if (apiPath === '/api/sources') return fulfillJson(route, { sources: [source] });
    if (apiPath === '/api/feed/today') return fulfillJson(route, { items: [fallbackItem, modelBackedItem] });
    if (apiPath === '/api/runtime/language') return fulfillJson(route, { language: { code: 'en', label: 'English' } });
    if (apiPath === '/api/runtime/openrouter-models') {
      return fulfillJson(route, { models: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }, { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }] });
    }
    if (apiPath === '/api/runtime/operation') return fulfillJson(route, { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (apiPath === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (apiPath === `/api/items/${fallbackItem.id}/inspect` && request.method() === 'POST') return fulfillJson(route, { item_id: fallbackItem.id, human_inspected_at: '2026-05-21T12:00:00Z', already_applied: false });
    if (apiPath === `/api/items/${modelBackedItem.id}/inspect` && request.method() === 'POST') return fulfillJson(route, { item_id: modelBackedItem.id, human_inspected_at: '2026-05-21T12:05:00Z', already_applied: false });
    if (apiPath === `/api/items/${fallbackItem.id}` && request.method() === 'GET') return fulfillJson(route, { item: fallbackDetail });
    if (apiPath === `/api/items/${modelBackedItem.id}` && request.method() === 'GET') return fulfillJson(route, { item: modelBackedDetail });
    if (apiPath === `/api/items/${fallbackItem.id}/reingest` && request.method() === 'POST') {
      reingestBodies.push(request.postData() ?? '');
      return fulfillJson(route, { already_applied: false, reingest: { item_id: fallbackItem.id, status: 'completed', item_updated: true, fts_updated: true, model: 'openai/gpt-4.1-mini', item: fallbackDetail } });
    }
    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${apiPath}`, details: {} } }, 404);
  });
}

async function captureEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'inspector-source-model-browser-proof-audit');
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

test('audit browser proves Inspector source disclosure expansion, reset, model options, and no durable prompt/model state', async ({ page, ownerToken }, testInfo) => {
  const reingestBodies: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await installApiFixtures(page, ownerToken, reingestBodies);
  await page.goto('/');

  await page.getByRole('button', { name: `Open Inspector for: ${fallbackItem.title}` }).click();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  const sourceEvidence = inspector.getByLabel('Text evidence');
  await expect(sourceEvidence).not.toHaveAttribute('open', '');
  await sourceEvidence.click();
  await expect(sourceEvidence).toHaveAttribute('open', '');
  await expect(sourceEvidence).toContainText('Audit RSS source excerpt is readable only after disclosure expansion.');
  await captureEvidence(page, testInfo, 'audit-fallback-source-evidence-expanded');

  const panel = inspector.getByLabel('Item re-ingest');
  await expect(panel).toHaveText(/\[REGENERATE\]\s+Options/);
  await expect.poll(() => inspector.evaluate((root) => {
    const panelNode = root.querySelector('[data-contract="inspector-reingest"]');
    const sourceEvidenceNode = root.querySelector('[aria-label="Text evidence"]');
    if (!panelNode || !sourceEvidenceNode) return false;
    return (panelNode.compareDocumentPosition(sourceEvidenceNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  })).toBe(true);
  await panel.getByRole('button', { name: 'Options' }).click();
  await expect(panel.getByText('model:')).toBeVisible();
  await expect(panel.getByText('extra prompt (one-time, not saved)')).toBeVisible();
  await expect(panel.getByLabel('Model')).toHaveValue('default');
  await expect(panel.getByRole('option', { name: 'default: account_default' })).toHaveAttribute('value', 'default');
  await expect(panel.getByRole('option', { name: 'GPT 4.1 Mini (openai/gpt-4.1-mini)' })).toHaveAttribute('value', 'openai/gpt-4.1-mini');
  await expect(panel.getByRole('option', { name: 'Claude 3.5 Sonnet (anthropic/claude-3.5-sonnet)' })).toHaveAttribute('value', 'anthropic/claude-3.5-sonnet');
  await expect(panel.getByText(/model list: 2 OpenRouter models available/i)).toBeVisible();
  await panel.getByLabel('One-time prompt').fill('Audit one-time prompt must stay transient.');
  await panel.getByLabel('Model').selectOption('openai/gpt-4.1-mini');
  await panel.getByRole('button', { name: '[REGENERATE]' }).click();
  await expect.poll(() => reingestBodies.length).toBe(1);
  await expect(panel.getByLabel('One-time prompt')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '[REGENERATE]' })).toBeVisible();
  await expect(page.evaluate(() => Object.keys(window.localStorage).sort())).resolves.toEqual(['resofeed.ownerToken']);
  await expect(inspector.getByText(/settings|history/i)).toHaveCount(0);
  await captureEvidence(page, testInfo, 'audit-after-reingest-no-durable-state');

  await page.getByRole('button', { name: `Open Inspector for: ${modelBackedItem.title}` }).click();
  const sourceText = inspector.getByLabel('Text evidence');
  await expect(sourceText).not.toHaveAttribute('open', '');
  await sourceText.click();
  await expect(sourceText).toHaveAttribute('open', '');
  await expect(sourceText).toContainText('Audit full source text becomes readable when the Text evidence disclosure expands.');
  await captureEvidence(page, testInfo, 'audit-model-backed-source-text-expanded');
});
