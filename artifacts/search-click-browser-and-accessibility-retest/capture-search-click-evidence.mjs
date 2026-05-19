import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const webRoot = path.join(repoRoot, 'web');
const artifactDir = scriptDir;
const baseURL = 'http://127.0.0.1:4173';
const now = '2026-05-20T12:00:00Z';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(webRoot, 'node_modules', 'playwright'));

const source = { id: 'src_search_click', url: 'https://example.test/search-click/feed.xml', title: 'Search Contract Source', last_fetch_at: now, last_fetch_status: 'ok', is_active: true, revision: 1 };
const selectedItem = { id: 'item_search_click_selected', source_id: source.id, source_title: source.title, url: 'https://example.test/search-click/selected', title: 'Search click selected fallback item', summary: null, core_insight: null, display_excerpt: 'Raw RSS excerpt proves fallback source evidence survives search selection.', value_tier: null, published_at: now, first_seen_at: now, extraction_status: 'partial_extraction', model_status: 'summary_unavailable', is_resonated: false, human_inspected_at: null, external_surfaced_at: null, story_key: null, duplicate_of_item_id: null };
const alternateItem = { ...selectedItem, id: 'item_search_click_alternate', url: 'https://example.test/search-click/alternate', title: 'Search click alternate model-backed item', summary: 'Model-backed alternate summary for list depth.', core_insight: 'Alternate core insight.', display_excerpt: 'Alternate excerpt.', extraction_status: 'full', model_status: 'ok' };
const items = [selectedItem, alternateItem];
const selectedDetail = { ...selectedItem, feed_excerpt: selectedItem.display_excerpt, extracted_text: 'Unprocessed source body must not masquerade as synthesized search detail.', provenance: { source_url: source.url, canonical_url: selectedItem.url, original_url: selectedItem.url, story_key: null, duplicate_of_item_id: null, grouped_source_items: [] } };
const alternateDetail = { ...alternateItem, feed_excerpt: 'Alternate excerpt.', extracted_text: 'Full alternate source text.', provenance: { source_url: source.url, canonical_url: alternateItem.url, original_url: alternateItem.url, story_key: null, duplicate_of_item_id: null, grouped_source_items: [] } };

function startPreviewServer() {
  const child = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], { cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

function buildPreviewBundle() {
  const result = spawnSync('npm', ['run', 'build'], { cwd: webRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`npm run build failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return { status: result.status };
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseURL);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`preview server did not become ready at ${baseURL}`);
}

async function installMockApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [source] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items } });
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' } } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') return route.fulfill({ json: { items, query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: Number(url.searchParams.get('limit') ?? 50) } } });
    if (url.pathname.endsWith('/inspect')) return route.fulfill({ json: { item_id: url.pathname.split('/').at(-2) ?? selectedItem.id, human_inspected_at: now, already_applied: false } });
    if (url.pathname.endsWith('/resonance')) return route.fulfill({ json: { item_id: url.pathname.split('/').at(-2) ?? selectedItem.id, is_resonated: true, already_applied: false } });
    if (url.pathname.startsWith('/api/items/')) return route.fulfill({ json: { item: url.pathname.includes(alternateItem.id) ? alternateDetail : selectedDetail } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openSearch(page, token) {
  await installMockApi(page);
  await page.addInitScript((ownerToken) => window.localStorage.setItem('resofeed.ownerToken', ownerToken), token);
  await page.goto(baseURL + '/');
  const commandBox = page.getByRole('textbox', { name: /steer|paste|rss|command|指令|订阅|搜尋|搜索/i }).first();
  try {
    await commandBox.fill('search fallback evidence', { timeout: 5000 });
    await page.getByRole('button', { name: /^apply$/i }).click();
    await page.getByRole('region', { name: 'Search and Retrieval' }).waitFor();
    return;
  } catch {}

  await page.goto(baseURL + '/?search=fallback+evidence');
  await page.getByRole('region', { name: 'Search and Retrieval' }).waitFor();
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const buildResult = buildPreviewBundle();
  const server = startPreviewServer();
  const browser = await chromium.launch();
  const evidence = { screenshots: {}, checks: {} };
  try {
    await waitForServer();
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openSearch(desktop, 'audit-token');
    await desktop.locator('.contract-search').evaluate((node) => { node.scrollTop = 48; });
    await desktop.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();
    await desktop.waitForLoadState('networkidle');
    const desktopScroll = await desktop.locator('.contract-search').evaluate((node) => node.scrollTop);
    const desktopQuery = await desktop.getByRole('textbox', { name: 'Plain text query' }).inputValue();
    const selectedAria = await desktop.locator('article.contract-search-result').filter({ hasText: selectedItem.title }).getAttribute('aria-current');
    const inspectorText = await desktop.getByRole('complementary', { name: selectedItem.title }).innerText();
    await desktop.screenshot({ path: path.join(artifactDir, 'desktop-selected-inspector.png'), fullPage: true });
    evidence.screenshots.desktop = 'desktop-selected-inspector.png';
    evidence.checks.desktop = { desktopQuery, desktopScroll, selectedAria, inspectorHasSelectedTitle: inspectorText.includes(selectedItem.title) };

    await desktop.getByRole('button', { name: `Inspect search result: ${alternateItem.title}` }).focus();
    await desktop.keyboard.press('Space');
    const alternateAriaAfterSpace = await desktop.locator('article.contract-search-result').filter({ hasText: alternateItem.title }).getAttribute('aria-current');
    await desktop.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).focus();
    await desktop.keyboard.press('Enter');
    const selectedAriaAfterEnter = await desktop.locator('article.contract-search-result').filter({ hasText: selectedItem.title }).getAttribute('aria-current');
    evidence.checks.accessibility = { selectedAriaAfterEnter, alternateAriaAfterSpace };

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await openSearch(mobile, 'audit-token');
    await mobile.evaluate(() => window.scrollTo(0, 180));
    await mobile.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();
    await mobile.waitForURL(/\/items\/item_search_click_selected$/);
    await mobile.getByRole('complementary', { name: selectedItem.title }).waitFor();
    await mobile.screenshot({ path: path.join(artifactDir, 'mobile-detail.png'), fullPage: true });
    evidence.screenshots.mobileDetail = 'mobile-detail.png';
    const detailUrl = mobile.url();
    await mobile.goBack();
    await mobile.getByRole('region', { name: 'Search and Retrieval' }).waitFor();
    const restoredQuery = await mobile.getByRole('textbox', { name: 'Plain text query' }).inputValue();
    await mobile.waitForFunction(() => window.scrollY === 180, undefined, { timeout: 5000 }).catch(() => undefined);
    const restoredScroll = await mobile.evaluate(() => window.scrollY);
    await mobile.screenshot({ path: path.join(artifactDir, 'mobile-restored-search.png'), fullPage: true });
    evidence.screenshots.mobileRestored = 'mobile-restored-search.png';
    evidence.checks.mobile = { detailUrl, restoredUrl: mobile.url(), restoredQuery, restoredScroll };

    const preview = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await preview.goto(pathToFileURL(path.join(repoRoot, 'docs', 'ui-preview.html')).href);
    await preview.locator('[aria-label="Search selection contract preview"]').waitFor();
    await preview.screenshot({ path: path.join(artifactDir, 'preview-selected-state.png'), fullPage: true });
    evidence.screenshots.preview = 'preview-selected-state.png';
    evidence.checks.preview = { selectedAria: await preview.locator('article.item.selected').first().getAttribute('aria-current'), hasInspectorPreview: await preview.getByLabel('Inspector preview').getByText(selectedItem.title).count(), hasSourceEvidence: await preview.getByText('Source evidence: Raw RSS excerpt proves fallback source evidence survives search selection.').count() };
    evidence.checks.forbiddenPatterns = { dialogCount: await desktop.getByRole('dialog').count(), forbiddenTextCount: await desktop.getByText(/recommended|related stories|immersive reader|saved search|unread|mark all read|settings slider|onboarding|account/i).count() };
    evidence.build = buildResult;
    evidence.serverOutput = server.getOutput();
    await fs.writeFile(path.join(artifactDir, 'runtime-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
    server.child.kill('SIGTERM');
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
