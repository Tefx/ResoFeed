import { chromium } from '../web/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const base = process.env.RESOFEED_AUDIT_BASE || 'http://127.0.0.1:4174';
const token = 'audit-owner-token-000000000000000000000000';

const item = {
  id: 'item-agent-1', source_id: 'src-1', source_title: 'Example RSS', url: 'https://example.com/article',
  title: 'SQLite FTS keeps retrieval lexical',
  summary: 'Dense factual summary describing how source-backed search stays verifiable.',
  core_insight: 'Search retrieves source-backed items without RAG framing.', value_tier: 'high',
  published_at: '2026-05-09T10:00:00Z', extraction_status: 'full', model_status: 'ok',
  is_resonated: false, human_inspected_at: null, external_surfaced_at: '2026-05-09T11:00:00Z',
  story_key: null, duplicate_of_item_id: null,
};

const itemDetail = {
  ...item,
  feed_excerpt: 'Raw RSS excerpt for visual audit.',
  extracted_text: 'Full extracted text in the Inspector. Provenance and source-backed detail remain visible.',
  provenance: { source_url: 'https://example.com/feed.xml', canonical_url: 'https://example.com/article', original_url: 'https://example.com/article', story_key: null, duplicate_of_item_id: null },
};

async function routeJson(page, pattern, body) {
  await page.route(pattern, async (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();

await routeJson(page, '**/api/sources', { sources: [{ id: 'src-1', url: 'https://example.com/feed.xml', title: 'Example RSS', last_fetch_at: '2026-05-09T10:00:00Z', last_fetch_status: 'ok', is_active: true, revision: 1 }] });
await routeJson(page, '**/api/feed/today**', { items: [item] });
await routeJson(page, '**/api/items/item-agent-1', { item: itemDetail });
await routeJson(page, '**/api/items/item-agent-1/inspect', { item_id: 'item-agent-1', human_inspected_at: '2026-05-09T12:00:00Z', already_applied: false });
await routeJson(page, '**/api/items/item-agent-1/resonance', { item_id: 'item-agent-1', is_resonated: true, already_applied: false });
await routeJson(page, '**/api/steer/active', { rules: [{ id: 'rule-agent-1', rule_text: 'Push more SQLite operational notes.', is_active: true, superseded_by: null, revision: 1, created_by_actor_kind: 'agent', created_by_actor_id: 'briefing-agent' }] });
await routeJson(page, '**/api/search**', { items: [item], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } });
await routeJson(page, '**/api/state/export', { schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T12:00:00Z', sources: [{ id: 'src-1', url: 'https://example.com/feed.xml', title: 'Example RSS' }], steer_rules: [{ id: 'rule-agent-1', rule_text: 'Push more SQLite operational notes.' }], resonated_items: [] });

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate((value) => window.localStorage.setItem('resofeed.ownerToken', value), token);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=RESOFEED');
await page.screenshot({ path: '.audit-artifacts/top-navigation-agent-receipt.png', fullPage: true });

await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
await page.waitForSelector('text=State Portability');
await page.screenshot({ path: '.audit-artifacts/source-ledger-state-portability.png', fullPage: true });

await page.getByRole('button', { name: 'import state' }).click();
await page.waitForSelector('text=Choose state JSON');
await page.screenshot({ path: '.audit-artifacts/state-import-warning-focus.png', fullPage: true });

await page.getByRole('button', { name: 'TODAY' }).click();
await page.getByLabel('Steer or paste RSS URL').fill('search sqlite');
await page.getByRole('button', { name: 'apply' }).click();
await page.waitForSelector('text=Search and Retrieval');
await page.screenshot({ path: '.audit-artifacts/search-presentation.png', fullPage: true });

const roleListing = await page.evaluate(() => Array.from(document.querySelectorAll('button, a, input, select, [role], nav, main, section, aside, form')).map((html) => {
  const text = (html.textContent || '').replace(/\s+/g, ' ').trim();
  const labelFor = html.id ? document.querySelector(`label[for="${CSS.escape(html.id)}"]`)?.textContent?.trim() : '';
  const ariaLabel = html.getAttribute('aria-label') || '';
  const role = html.getAttribute('role') || html.tagName.toLowerCase();
  const name = ariaLabel || labelFor || html.getAttribute('aria-labelledby') || html.getAttribute('placeholder') || html.getAttribute('value') || text || html.getAttribute('href') || '';
  const rect = html.getBoundingClientRect(); const style = getComputedStyle(html);
  return { role, tag: html.tagName.toLowerCase(), name, text, disabled: html.hasAttribute('disabled'), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, color: style.color, backgroundColor: style.backgroundColor, outline: style.outline };
}));
await writeFile('.audit-artifacts/accessibility-role-labels.json', JSON.stringify(roleListing, null, 2));

const navText = await page.locator('nav[aria-label="Surfaces"]').innerText();
const bodyText = await page.locator('body').innerText();
await writeFile('.audit-artifacts/visible-text-search-state.txt', `NAV:\n${navText}\n\nBODY:\n${bodyText}\n`);

await browser.close();
