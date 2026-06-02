import fs from 'node:fs';
import http, { type Server } from 'node:http';
import net from 'node:net';
import path from 'node:path';

import type { Locator, Page } from 'playwright/test';

import { test, expect } from './fixtures';

test.use({ trace: 'on', screenshot: 'on' });

const POLLUTED_TITLE = 'Readable article polluted by page source boilerplate';
const SOURCE_TITLE = 'Inspector Readable Regression Source';
const READABLE_ARTICLE_TEXT = 'Readable article lead that should be safe for primary Inspector reading copy.';
const FALLBACK_TEXT = 'summary unavailable';

const FORBIDDEN_PRIMARY_TOKENS = [
  'function OptanonWrapper() {}',
  '--verge-font-body',
  '<script',
  '<style',
  'Skip to main content',
  'The homepage The Verge',
  'model_latency_error'
] as const;

interface RegressionFixtureServer {
  readonly server: Server;
  readonly feedUrl: string;
}

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function importRegressionFixture(page: Page, ownerToken: string, opmlPath: string, feedUrl: string): Promise<void> {
  await enterOwnerToken(page, ownerToken);
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await page.locator('#opml-file').setInputFiles(opmlPath);
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  await expect(page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
  const importedRow = page.locator('.source-ledger__row', { hasText: feedUrl }).first();
  await expect(importedRow).toBeVisible();
  const fetchButton = importedRow.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ });
  await expect(fetchButton).toBeVisible();
  await fetchButton.click();
  await expect(importedRow.locator('.source-ledger__status', { hasText: /last_fetch: \d{2}:\d{2}:\d{2}/ })).toBeVisible({ timeout: 20_000 });
  await runSteerCommand(page, 'today', 'today');
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();
}

async function triggerFixtureIngest(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken');
    const response = await window.fetch('/api/ingest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  });
  if (!result.ok && result.status !== 409) throw new Error(`fixture ingest failed: ${result.status} ${result.body}`);
}

async function runSteerCommand(page: Page, command: string, receipt: RegExp | string): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill(command);
  await steer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: receipt })).toBeVisible();
}

function primaryInspectorBody(page: Page): Locator {
  return page
    .getByRole('complementary', { name: 'INSPECTOR' })
    .locator('.contract-inspector')
    .locator('h2, p:not(.contract-label):not(.contract-muted):not(.contract-warning)');
}

async function visibleText(locator: Locator): Promise<string> {
  const parts = await locator.allTextContents();
  return parts.join('\n').replace(/\s+/g, ' ').trim();
}

test('Inspector primary body hides screenshot-family raw source, navigation, and diagnostic garbage', async ({ page, ownerToken, runInfo }, testInfo) => {
  const fixtureServer = await startRegressionFixtureServer();
  const opmlPath = path.join(runInfo.artifactRoot, 'fixtures', `inspector-readable-regression-${Date.now()}.opml`);
  fs.writeFileSync(opmlPath, regressionOpml(fixtureServer.feedUrl));

  await testInfo.attach('inspector-readable-regression-fixture-shape.txt', {
    body: [
      'RSS item shape: <guid>, <title>, <link>, <pubDate>, <description><![CDATA[...]]></description>.',
      'Article route shape: text/html page linked from the RSS <link>; no convenience fields are supplied.',
      `Forbidden tokens: ${FORBIDDEN_PRIMARY_TOKENS.join(', ')}`
    ].join('\n'),
    contentType: 'text/plain'
  });

  try {
    await importRegressionFixture(page, ownerToken, opmlPath, fixtureServer.feedUrl);
    const feedItem = page.getByRole('button', { name: `Open Inspector for: ${POLLUTED_TITLE}` });
    await expect(feedItem).toBeVisible();
    await feedItem.click();
    await expect(page.getByRole('heading', { name: POLLUTED_TITLE })).toBeFocused();

    const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
    await expect(inspector.getByLabel(`Source: ${SOURCE_TITLE}`)).toHaveText(SOURCE_TITLE);
    await expect(inspector.getByRole('link', { name: 'original link' })).toBeVisible();

    const primaryBody = primaryInspectorBody(page);
    const primaryText = await visibleText(primaryBody);
    expect(primaryText).toMatch(new RegExp(`${escapeRegex(READABLE_ARTICLE_TEXT)}|${escapeRegex(FALLBACK_TEXT)}`));
    const leakedTokens = FORBIDDEN_PRIMARY_TOKENS.filter((token) => primaryText.includes(token));
    await testInfo.attach('inspector-readable-regression-primary-body.txt', {
      body: primaryText,
      contentType: 'text/plain'
    });
    expect(leakedTokens, `Inspector primary body text: ${primaryText}`).toEqual([]);
  } finally {
    await stopRegressionFixtureServer(fixtureServer.server);
  }
});

function regressionFeedXml(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SOURCE_TITLE}</title>
    <link>${baseUrl}/</link>
    <description>Focused Inspector readable-content regression fixture.</description>
    <item>
      <guid>inspector-readable-page-source-regression</guid>
      <title>${POLLUTED_TITLE}</title>
      <link>${baseUrl}/article/polluted-readable-body</link>
      <pubDate>Sun, 10 May 2026 11:00:00 GMT</pubDate>
      <description><![CDATA[Readable feed excerpt for the focused Inspector regression.]]></description>
    </item>
  </channel>
</rss>`;
}

function regressionArticleHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${POLLUTED_TITLE}</title>
    <style>:root { --verge-font-body: Inter, sans-serif; --color-background: #fff; }</style>
    <script>function OptanonWrapper() {}</script>
  </head>
  <body>
    <a href="#main">Skip to main content</a>
    <nav>The homepage The Verge Reviews Podcasts Newsletters</nav>
    <main id="main">
      <article>
        <p>${READABLE_ARTICLE_TEXT}</p>
        <p>&lt;script&gt;function OptanonWrapper() {}&lt;/script&gt;</p>
        <p>&lt;style&gt;:root { --verge-font-body: Inter, sans-serif; }&lt;/style&gt;</p>
        <p>diagnostic token that belongs outside primary copy: model_latency_error</p>
      </article>
    </main>
    <script>history.scrollRestoration = 'manual';</script>
  </body>
</html>`;
}

function regressionOpml(feedUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Inspector Readable Regression OPML</title></head>
  <body><outline text="${SOURCE_TITLE}" title="${SOURCE_TITLE}" type="rss" xmlUrl="${escapeXml(feedUrl)}" /></body>
</opml>`;
}

async function startRegressionFixtureServer(): Promise<RegressionFixtureServer> {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    if (request.url === '/inspector-readable-regression.xml') {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      response.end(regressionFeedXml(baseUrl));
      return;
    }
    if (request.url === '/article/polluted-readable-body') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(regressionArticleHtml());
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return { server, feedUrl: `${baseUrl}/inspector-readable-regression.xml` };
}

async function stopRegressionFixtureServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
