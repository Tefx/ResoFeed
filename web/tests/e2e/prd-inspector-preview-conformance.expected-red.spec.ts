import fs from 'node:fs';
import http, { type Server } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

test.use({ trace: 'on', screenshot: 'on', viewport: { width: 1280, height: 900 } });

const fixtureTitle = 'PRD inspector conformance item with retrieval metadata';
const fixtureGuid = 'prd-inspector-preview-conformance-item';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type ElementMetric = {
  readonly found: boolean;
  readonly text: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly box: Box;
};

type LayoutSnapshot = {
  readonly masthead: ElementMetric;
  readonly nav: ElementMetric;
  readonly prompt: ElementMetric;
  readonly panel: ElementMetric;
  readonly firstRow: ElementMetric;
  readonly star: ElementMetric;
  readonly inspector: ElementMetric;
  readonly inspectorHeading: ElementMetric;
  readonly viewport: { readonly width: number; readonly height: number };
};

type FixtureServer = {
  readonly server: Server;
  readonly feedUrl: string;
  readonly baseUrl: string;
};

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function importFixtureAndOpenInspector(page: Page, ownerToken: string, opmlPath: string): Promise<Locator> {
  await enterOwnerToken(page, ownerToken);
  await openSurfaceViaMenu(page, 'SOURCE LEDGER');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await page.locator('#opml-file').setInputFiles(opmlPath);
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  const ingestButton = page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ });
  await expect(ingestButton).toBeVisible();
  await expect(page.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
  // [DEVIATION]: This fixture helper must deterministically seed the runtime feed. OPML import configures a source; the existing Source Ledger ingest action performs item ingestion.
  await ingestButton.click();
  const fixtureSourceRow = page.locator('.source-ledger__row', { hasText: /PRD Inspector Fixture Source/ });
  await expect(fixtureSourceRow).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 20_000 });
  await expect(fixtureSourceRow).toBeVisible({ timeout: 20_000 });
  await openSurfaceViaMenu(page, 'TODAY');
  // [DEVIATION]: Feed/Search Shared Anatomy now forbids a standalone visible TODAY heading; the active TODAY surface is proven by the feed list landmark and inline time labels instead.
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();

  const feedItem = page.getByRole('button', { name: `Open Inspector for: ${fixtureTitle}` });
  await expect(feedItem).toBeVisible({ timeout: 15_000 });
  await feedItem.click();
  await expect(page.getByRole('heading', { name: fixtureTitle })).toBeFocused();
  return page.getByRole('complementary', { name: 'INSPECTOR' });
}

async function openSurfaceViaMenu(page: Page, surface: 'TODAY' | 'SOURCE LEDGER'): Promise<void> {
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await menu.getByRole('button', { name: surface }).click();
}

async function screenshotToArtifact(page: Page, testInfo: TestInfo, runInfo: { readonly artifactRoot: string }, fileName: string): Promise<string> {
  const screenshotDir = path.join(runInfo.artifactRoot, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(fileName, { path: screenshotPath, contentType: 'image/png' });
  return screenshotPath;
}

async function visibleText(locator: Locator): Promise<string> {
  const parts = await locator.allTextContents();
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function expectVisibleField(inspector: Locator, pattern: RegExp, label: string, violations: string[]): Promise<void> {
  const matches = await inspector.getByText(pattern).count();
  if (matches === 0) {
    violations.push(`missing visible Inspector field: ${label} (${pattern.source})`);
  }
}

async function layoutSnapshot(page: Page): Promise<LayoutSnapshot> {
  return page.evaluate<LayoutSnapshot>(() => {
    function boxFor(element: Element | null): Box {
      if (!element) return { x: -1, y: -1, width: 0, height: 0 };
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }

    function metric(selector: string): ElementMetric {
      const element = document.querySelector(selector);
      const style = element ? window.getComputedStyle(element) : null;
      return {
        found: element !== null,
        text: element?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        fontSize: style ? Number.parseFloat(style.fontSize) : 0,
        lineHeight: style ? Number.parseFloat(style.lineHeight) : 0,
        box: boxFor(element)
      };
    }

    return {
      masthead: metric('h1, .preview-title h1, .contract-brand, .brand'),
      nav: metric('nav, .surface-nav, .subtitle'),
      prompt: metric('.steer, [aria-label="Steer or paste RSS URL"], input[placeholder*="Steer"], textarea[placeholder*="Steer"]'),
      panel: metric('.panel, main.contract-shell, .shell-grid'),
      firstRow: metric('.item, .contract-feed-item'),
      star: metric('.star, .contract-feed-item[aria-current="true"] .contract-resonate, .contract-feed-item[aria-current="true"] button[aria-label="Resonate item"], .contract-feed-item[aria-current="true"] button[aria-label="Remove resonance"]'),
      inspector: metric('.inspector, .contract-inspector, [aria-label="INSPECTOR"]'),
      inspectorHeading: metric('.inspector h2, .contract-inspector h2, [aria-label="INSPECTOR"] h2'),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });
}

function auditLiveLayout(snapshot: LayoutSnapshot, violations: string[]): void {
  if (!snapshot.masthead.found || !/RESOFEED/.test(snapshot.masthead.text)) {
    violations.push('missing RESOFEED product label in desktop shell');
  }
  // [DEVIATION]: DESIGN.md now defines low-chrome RESOFEED menu navigation, not the older preview's large masthead or persistent DOCTOR/INSPECTOR nav line.
  if (!/TODAY/.test(snapshot.nav.text) || !/SOURCE LEDGER/.test(snapshot.nav.text)) {
    violations.push(`surface menu missing TODAY / SOURCE LEDGER placement: ${snapshot.nav.text}`);
  }
  if (!snapshot.prompt.found || snapshot.prompt.box.y > 140) {
    violations.push(`Steer prompt box is not visibly placed near the top command area: y=${snapshot.prompt.box.y}`);
  }
  if (!snapshot.panel.found || snapshot.panel.box.width < 1000 || snapshot.panel.box.x < 16 || snapshot.panel.box.x > 48) {
    violations.push(`desktop panel geometry/margins drift from preview: x=${snapshot.panel.box.x}, width=${snapshot.panel.box.width}`);
  }
  if (!snapshot.firstRow.found || snapshot.firstRow.box.height < 44) {
    violations.push(`feed row/card geometry does not expose a bounded item row: height=${snapshot.firstRow.box.height}`);
  }
  if (!snapshot.star.found || Math.abs(snapshot.star.box.width - 44) > 3 || Math.abs(snapshot.star.box.height - 44) > 3) {
    violations.push(`Resonate star alignment/target is not the preview 44px square: ${snapshot.star.box.width}x${snapshot.star.box.height}`);
  }
  if (!snapshot.inspector.found || snapshot.inspector.box.width < 420 || snapshot.inspector.box.width > 580) {
    violations.push(`Inspector pane width/hierarchy drift from preview: width=${snapshot.inspector.box.width}`);
  }
  if (!snapshot.inspectorHeading.found || snapshot.inspectorHeading.fontSize < 26) {
    violations.push(`Inspector title typography scale too small/missing: ${snapshot.inspectorHeading.fontSize}px`);
  }
}

async function startPrdFixtureServer(): Promise<FixtureServer> {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    if (request.url === '/prd-inspector-conformance.xml') {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      response.end(prdFixtureFeedXml(baseUrl));
      return;
    }
    if (request.url === '/articles/prd-inspector-conformance') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(prdFixtureArticleHtml());
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return { server, baseUrl, feedUrl: `${baseUrl}/prd-inspector-conformance.xml` };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        server.close(() => reject(new Error('unable to reserve TCP port')));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function prdFixtureOpml(feedUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>PRD Inspector Conformance OPML</title></head>
  <body><outline text="PRD Inspector Fixture Source" title="PRD Inspector Fixture Source" type="rss" xmlUrl="${escapeXml(feedUrl)}" /></body>
</opml>`;
}

function prdFixtureFeedXml(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PRD Inspector Fixture Source</title>
    <link>${baseUrl}/</link>
    <description>Production-format fixture for PRD Inspector preview conformance browser tests.</description>
    <item>
      <guid>${fixtureGuid}</guid>
      <title>${fixtureTitle}</title>
      <link>${baseUrl}/articles/prd-inspector-conformance</link>
      <pubDate>Sun, 10 May 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Dense factual summary fixture: full extraction should preserve provenance, search text, topic metadata, and why-this-appeared rationale for runtime UI verification.]]></description>
    </item>
  </channel>
</rss>`;
}

function prdFixtureArticleHtml(): string {
  return `<!doctype html><html><head><title>${fixtureTitle}</title></head><body>
<article>
  <p>Core insight fixture: objective assessment, value tier, source provenance, topical metadata, and searchable text must be visible in Inspect.</p>
  <p>Searchable text sentinel: blue-green-cassowary retrieval phrase. Topic metadata sentinel: rss-intelligence, provenance-audit, inspector-preview.</p>
  <p>Quality evidence sentinel: source quality is high because the article is complete, attributed, and extracted from a reachable original URL.</p>
</article>
</body></html>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

test('expected-red PRD Inspector fields and ui-preview desktop parity are visible in the real rendered app', async ({ browser, page, ownerToken, runInfo }, testInfo) => {
  const fixtureServer = await startPrdFixtureServer();
  const opmlPath = path.join(runInfo.artifactRoot, 'fixtures', `prd-inspector-conformance-${Date.now()}.opml`);
  fs.writeFileSync(opmlPath, prdFixtureOpml(fixtureServer.feedUrl));

  const previewPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const violations: string[] = [];

  try {
    await previewPage.goto(pathToFileURL(path.join(repoRoot, 'docs', 'ui-preview.html')).toString());
    await expect(previewPage.locator('.page')).toBeVisible();
    const previewScreenshotPath = await screenshotToArtifact(previewPage, testInfo, runInfo, 'prd-inspector-preview-baseline.png');
    const previewLayout = await layoutSnapshot(previewPage);
    await testInfo.attach('prd-inspector-preview-baseline-layout.json', {
      body: JSON.stringify(previewLayout, null, 2),
      contentType: 'application/json'
    });
    expect(previewLayout.masthead.fontSize, 'preview baseline must expose the documented 32px masthead').toBeGreaterThanOrEqual(30);
    expect(previewLayout.star.box.width, 'preview baseline must expose a 44px star').toBeCloseTo(44, 0);

    const inspector = await importFixtureAndOpenInspector(page, ownerToken, opmlPath);
    const liveScreenshotPath = await screenshotToArtifact(page, testInfo, runInfo, 'prd-inspector-live-app-expected-red.png');
    const liveLayout = await layoutSnapshot(page);
    await testInfo.attach('prd-inspector-live-layout.json', {
      body: JSON.stringify(liveLayout, null, 2),
      contentType: 'application/json'
    });

    await expectVisibleField(inspector, /质量评估|objective quality assessment|quality assessment|quality:/i, '质量评估/objective quality assessment', violations);
    await expectVisibleField(inspector, /优先级|value tier|priority category|priority:/i, '优先级/value tier', violations);
    await expectVisibleField(inspector, /核心见解|concise core insight|core insight/i, '核心见解/concise core insight', violations);
    await expectVisibleField(inspector, /密集事实摘要|dense factual summary|dense summary|summary:/i, '密集事实摘要/dense factual summary', violations);
    await expectVisibleField(inspector, /来源与提取溯源|source and extraction provenance|provenance:|src:|extraction:/i, '来源与提取溯源/source and extraction provenance', violations);
    await expectVisibleField(inspector, /为什么展示给你|why this appeared|why:/i, '为什么展示给你/why this appeared', violations);
    await expectVisibleField(inspector, /可检索文本|searchable text|retrieval text|indexed text|blue-green-cassowary/i, '可检索文本/searchable text', violations);

    const inspectorText = await visibleText(inspector);
    if (!/rss-intelligence|provenance-audit|inspector-preview|topic/i.test(inspectorText)) {
      violations.push('missing topical metadata proof in Inspector visible text');
    }
    if (!/source quality is high|complete, attributed, and extracted/i.test(inspectorText)) {
      violations.push('missing field-level objective quality/source-quality proof in Inspector visible text');
    }

    auditLiveLayout(liveLayout, violations);
    await testInfo.attach('prd-inspector-expected-red-violations.txt', {
      body: violations.length === 0 ? 'No PRD/UI-preview gaps detected.' : violations.join('\n'),
      contentType: 'text/plain'
    });
    await testInfo.attach('prd-inspector-artifact-paths.txt', {
      body: `preview=${previewScreenshotPath}\nlive=${liveScreenshotPath}`,
      contentType: 'text/plain'
    });

    expect(violations).toEqual([]);
  } finally {
    await previewPage.close();
    await stopServer(fixtureServer.server);
  }
});
