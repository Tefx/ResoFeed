import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const webRoot = path.join(repoRoot, 'web');
const baseURL = 'http://127.0.0.1:4174';
const now = '2026-05-20T12:00:00Z';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(webRoot, 'node_modules', 'playwright'));

const longSourceTitle = 'Search Contract Source With Extremely Long Publisher Metadata That Should Wrap Or Ellipsize Before Touch Targets And Never Collide With The Resonate Hitbox';
const source = { id: 'src_search_click_long_metadata', url: 'https://example.test/search-click/long-feed.xml', title: longSourceTitle, last_fetch_at: now, last_fetch_status: 'ok', is_active: true, revision: 1 };
const selectedItem = { id: 'item_search_click_long_metadata', source_id: source.id, source_title: source.title, url: 'https://example.test/search-click/long-selected', title: 'Long metadata restored search selected item', summary: null, core_insight: null, display_excerpt: 'Long metadata row proves compact mobile restored search layout remains touch-safe.', value_tier: null, published_at: now, first_seen_at: now, extraction_status: 'partial_extraction', model_status: 'summary_unavailable', is_resonated: false, human_inspected_at: null, external_surfaced_at: null, story_key: null, duplicate_of_item_id: null };
const selectedDetail = { ...selectedItem, feed_excerpt: selectedItem.display_excerpt, extracted_text: 'Source body retained for detail route only.', provenance: { source_url: source.url, canonical_url: selectedItem.url, original_url: selectedItem.url, story_key: null, duplicate_of_item_id: null, grouped_source_items: [] } };

function buildPreviewBundle() {
  const result = spawnSync('npm', ['run', 'build'], { cwd: webRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`npm run build failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return { status: result.status };
}

function startPreviewServer() {
  const child = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4174'], { cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
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
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: [selectedItem] } });
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' } } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') return route.fulfill({ json: { items: [selectedItem], query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: Number(url.searchParams.get('limit') ?? 50) } } });
    if (url.pathname.endsWith('/inspect')) return route.fulfill({ json: { item_id: selectedItem.id, human_inspected_at: now, already_applied: false } });
    if (url.pathname.endsWith('/resonance')) return route.fulfill({ json: { item_id: selectedItem.id, is_resonated: true, already_applied: false } });
    if (url.pathname.startsWith('/api/items/')) return route.fulfill({ json: { item: selectedDetail } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

function overlap(a, b) {
  if (!a || !b) return true;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function gap(a, b) {
  if (!a || !b) return null;
  return {
    horizontal: Math.max(b.left - a.right, a.left - b.right, 0),
    vertical: Math.max(b.top - a.bottom, a.top - b.bottom, 0)
  };
}

async function main() {
  await fs.mkdir(scriptDir, { recursive: true });
  const build = buildPreviewBundle();
  const server = startPreviewServer();
  const browser = await chromium.launch();
  try {
    await waitForServer();
    const page = await browser.newPage({ viewport: { width: 360, height: 844 }, isMobile: true });
    await installMockApi(page);
    await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), 'audit-token');
    await page.goto(baseURL + '/');
    try {
      await page.getByRole('textbox', { name: /steer|paste|rss|command|指令|订阅|搜尋|搜索/i }).fill('long metadata fallback evidence', { timeout: 5000 });
      await page.getByRole('button', { name: /^apply$/i }).click();
      await page.getByRole('region', { name: 'Search and Retrieval' }).waitFor({ timeout: 5000 });
    } catch {
      await page.goto(baseURL + '/?search=long+metadata+fallback+evidence');
      await page.getByRole('region', { name: 'Search and Retrieval' }).waitFor();
    }
    await page.evaluate(() => window.scrollTo(0, 180));
    await page.getByRole('button', { name: `Inspect search result: ${selectedItem.title}` }).click();
    await page.waitForURL(/\/items\/item_search_click_long_metadata$/);
    await page.goBack();
    await page.getByRole('region', { name: 'Search and Retrieval' }).waitFor();
    await page.waitForFunction(() => window.scrollY === 180, undefined, { timeout: 5000 }).catch(() => undefined);

    const article = page.locator('article.contract-search-result').filter({ hasText: selectedItem.title }).first();
    await article.waitFor();
    const geometry = await article.evaluate((node) => {
      const toRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      const elements = Array.from(node.querySelectorAll('*'));
      const today = elements.find((el) => el.textContent?.trim() === 'TODAY');
      const star = elements.find((el) => el instanceof HTMLButtonElement && /resonate|resonance/i.test(el.getAttribute('aria-label') || el.textContent || ''));
      const longMeta = elements
        .filter((el) => (el.textContent || '').includes('Search Contract Source With Extremely Long Publisher Metadata'))
        .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
      const longMetaStyle = longMeta ? getComputedStyle(longMeta) : null;
      return {
        article: toRect(node),
        today: toRect(today),
        longMeta: toRect(longMeta),
        star: toRect(star),
        text: node.textContent?.replace(/\s+/g, ' ').trim(),
        longMetaText: longMeta?.textContent?.replace(/\s+/g, ' ').trim(),
        longMetaClientWidth: longMeta?.clientWidth ?? null,
        longMetaScrollWidth: longMeta?.scrollWidth ?? null,
        longMetaTextOverflow: longMetaStyle?.textOverflow ?? null,
        longMetaWhiteSpace: longMetaStyle?.whiteSpace ?? null,
        starLabel: star?.getAttribute('aria-label') || star?.textContent || null
      };
    });

    const evidence = {
      build,
      viewport: { width: 360, height: 844, isMobile: true },
      restored: {
        url: page.url(),
        query: await page.getByRole('textbox', { name: 'Plain text query' }).inputValue(),
        scrollY: await page.evaluate(() => window.scrollY)
      },
      screenshot: 'mobile-restored-long-metadata.png',
      geometry,
      checks: {
        hasTodayLabel: Boolean(geometry.today),
        hasLongMetadataText: Boolean(geometry.longMetaText?.includes('Search Contract Source With Extremely Long Publisher Metadata')),
        longMetadataWrappedOrEllipsized: Boolean(geometry.longMeta && (geometry.longMeta.height > 20 || geometry.longMetaScrollWidth > geometry.longMetaClientWidth || geometry.longMetaTextOverflow === 'ellipsis')),
        starHitboxAtLeast44: Boolean(geometry.star && geometry.star.width >= 44 && geometry.star.height >= 44),
        todayDoesNotOverlapStar: !overlap(geometry.today, geometry.star),
        longMetadataDoesNotOverlapStar: !overlap(geometry.longMeta, geometry.star),
        todayDoesNotOverlapLongMetadata: !overlap(geometry.today, geometry.longMeta)
      },
      gaps: {
        todayToStar: gap(geometry.today, geometry.star),
        longMetadataToStar: gap(geometry.longMeta, geometry.star),
        todayToLongMetadata: gap(geometry.today, geometry.longMeta)
      },
      serverOutput: server.getOutput()
    };
    await page.screenshot({ path: path.join(scriptDir, evidence.screenshot), fullPage: true });
    await fs.writeFile(path.join(scriptDir, 'mobile-overlap-runtime-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    const failed = Object.entries(evidence.checks).filter(([, value]) => !value);
    if (failed.length) throw new Error(`mobile overlap checks failed: ${failed.map(([key]) => key).join(', ')}`);
  } finally {
    await browser.close();
    server.child.kill('SIGTERM');
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
