import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const outDir = resolve(root, '.audit-artifacts/frontend-gate');
const ownerToken = 'rfeed_proof0123456789abcdefghijklmnopqrstuvwxyzABCDEFG';
const baseURL = 'http://127.0.0.1:4177';

const source = {
  id: 'src_expected_red',
  url: 'https://example.com/feed.xml',
  title: 'Example Source',
  last_fetch_at: '2026-05-09T00:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const item = {
  id: 'item_expected_red',
  source_id: source.id,
  source_title: source.title,
  url: 'https://example.com/article',
  title: 'SQLite FTS changes ranking contract',
  summary: 'Dense factual summary for a rendered feed row.',
  core_insight: 'Why this matters for retrieval.',
  published_at: '2026-05-09T00:00:00Z',
  extraction_status: 'partial_extraction',
  model_status: 'summary_unavailable',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: '2026-05-09T01:00:00Z',
  story_key: 'story_sqlite_fts',
  duplicate_of_item_id: null
};

const resonatedItem = {
  ...item,
  id: 'item_expected_red_resonated',
  title: 'Resonated retrieval should stay visible',
  is_resonated: true,
  external_surfaced_at: null
};

const detail = {
  ...item,
  feed_excerpt: 'Raw feed excerpt for detail route.',
  extracted_text: 'Full extracted text shown only in Inspector.',
  provenance: {
    source_url: source.url,
    canonical_url: item.url,
    original_url: item.url,
    story_key: item.story_key,
    duplicate_of_item_id: null
  }
};

function startDevServer() {
  const child = spawn('npm', ['--prefix', 'web', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '4177'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // retry until Vite is accepting connections
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, 250));
  }
  throw new Error('Timed out waiting for Vite dev server');
}

async function installApiMocks(page) {
  await page.route('**/api/sources', async (route) => {
    await route.fulfill({ json: { sources: [source] } });
  });
  await page.route('**/api/feed/today', async (route) => {
    await route.fulfill({ json: { items: [item, resonatedItem] } });
  });
  await page.route(`**/api/items/${item.id}`, async (route) => {
    await route.fulfill({ json: { item: detail } });
  });
  await page.route(`**/api/items/${item.id}/inspect`, async (route) => {
    await route.fulfill({ json: { item_id: item.id, human_inspected_at: '2026-05-09T00:00:00Z', already_applied: false } });
  });
  await page.route(`**/api/items/${item.id}/resonance`, async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { item_id: item.id, is_resonated: Boolean(body.resonated), already_applied: false } });
  });
}

async function openApp(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('list', { name: 'Today feed items' }).waitFor();
  await page.locator('.detail-pane .contract-inspector').waitFor({ state: 'attached' });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = startDevServer();
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await desktop.addInitScript(() => {
      window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      });
    });
    await installApiMocks(desktop);
    await openApp(desktop);
    const desktopInspector = desktop.locator('.detail-pane .contract-inspector');
    const desktopInspectorStarCount = await desktopInspector.getByRole('button', { name: /Resonate item|Remove resonance/ }).count();
    const desktopFeedStarCount = await desktop.getByRole('list', { name: 'Today feed items' }).getByRole('button', { name: /Resonate item|Remove resonance/ }).count();
    await desktop.screenshot({ path: resolve(outDir, 'current-populated-desktop-full.png'), fullPage: true });
    await desktop.screenshot({ path: resolve(root, '.audit-artifacts/populated-desktop-full.png'), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mobile.addInitScript(() => {
      window.matchMedia = (query) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      });
    });
    await installApiMocks(mobile);
    await openApp(mobile);
    await mobile.screenshot({ path: resolve(outDir, 'current-mobile-feed.png'), fullPage: true });
    await mobile.getByRole('button', { name: `Open Inspector for: ${item.title}` }).click();
    await mobile.getByRole('button', { name: 'back to TODAY' }).waitFor();
    const mobileInspector = mobile.locator('.detail-pane .contract-inspector');
    const mobileInspectorStarCount = await mobileInspector.getByRole('button', { name: /Resonate item|Remove resonance/ }).count();
    const mobileBackVisible = await mobile.getByRole('button', { name: 'back to TODAY' }).isVisible();
    await mobile.screenshot({ path: resolve(outDir, 'current-mobile-inspector.png'), fullPage: true });
    await mobile.screenshot({ path: resolve(root, '.audit-artifacts/populated-mobile-full.png'), fullPage: true });
    await mobile.getByRole('button', { name: 'back to TODAY' }).click();
    await mobile.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await mobile.getByRole('region', { name: 'SOURCE LEDGER surface' }).waitFor();
    await mobile.screenshot({ path: resolve(outDir, 'current-mobile-source-ledger.png'), fullPage: true });

    const proof = {
      generated_at: new Date().toISOString(),
      current_artifacts: {
        desktop: '.audit-artifacts/frontend-gate/current-populated-desktop-full.png',
        mobile_feed: '.audit-artifacts/frontend-gate/current-mobile-feed.png',
        mobile_inspector: '.audit-artifacts/frontend-gate/current-mobile-inspector.png',
        mobile_source_ledger: '.audit-artifacts/frontend-gate/current-mobile-source-ledger.png',
        superseding_legacy_desktop: '.audit-artifacts/populated-desktop-full.png',
        superseding_legacy_mobile: '.audit-artifacts/populated-mobile-full.png'
      },
      runtime_assertions: {
        desktop_split_inspector_resonate_button_count: desktopInspectorStarCount,
        desktop_feed_resonate_button_count: desktopFeedStarCount,
        mobile_route_inspector_resonate_button_count: mobileInspectorStarCount,
        mobile_route_back_to_today_visible: mobileBackVisible,
        source_fixture_title: source.title,
        item_fixture_title: item.title
      }
    };
    await writeFile(resolve(outDir, 'render-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
    if (desktopInspectorStarCount !== 0) throw new Error(`B3 failed: desktop Inspector star count ${desktopInspectorStarCount}`);
    if (desktopFeedStarCount < 1) throw new Error(`Feed star proof failed: desktop feed star count ${desktopFeedStarCount}`);
    if (mobileInspectorStarCount < 1) throw new Error(`Mobile Inspector star proof failed: mobile star count ${mobileInspectorStarCount}`);
    if (!mobileBackVisible) throw new Error('Mobile Inspector back control proof failed');
  } catch (error) {
    await writeFile(resolve(outDir, 'generate-proof-error.log'), `${error instanceof Error ? error.stack : String(error)}\n${server.getOutput()}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    server.child.kill('SIGTERM');
  }
}

await main();
