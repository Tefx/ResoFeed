import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { Page, TestInfo } from 'playwright/test';

import { test, expect } from './fixtures';
import { E2E_FAKE_OPENROUTER_KEY, fixtureOpml } from './e2e-contract';

test.use({ trace: 'on', screenshot: 'on' });

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
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForAuthBoundary(baseURL: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/feed/today`);
      if (response.status === 401) return;
    } catch {
      // Retry until the isolated real server has bound.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready at ${baseURL}`);
}

async function waitForHTTP(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the test-local feed fixture has bound.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`fixture server did not become ready at ${url}`);
}

async function startPolicyFixtureServer(feedXml: string): Promise<{ child: ChildProcess; url: string }> {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}/policy-feed.xml`;
  const child = spawn(process.execPath, ['-e', `
const http = require('node:http');
const feedXml = ${JSON.stringify(feedXml)};
const port = ${port};
const server = http.createServer((request, response) => {
  if (request.url === '/policy-feed.xml') {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    response.end(feedXml);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('not found');
});
server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp' },
    stdio: 'ignore'
  });
  child.unref();
  await waitForHTTP(url);
  return { child, url };
}

async function startIsolatedServer(runInfo: { binaryPath: string; artifactRoot: string; ownerToken: string; openRouterStub: { endpoint: string } }, openRouterKey: string): Promise<{ child: ChildProcess; baseURL: string; stdoutPath: string; stderrPath: string }> {
  const port = await reservePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const logsDir = path.join(runInfo.artifactRoot, 'server-logs');
  const dbPath = path.join(runInfo.artifactRoot, 'fixtures', `isolated-invalid-openrouter-${Date.now()}-${process.pid}.sqlite3`);
  const stdoutPath = path.join(logsDir, `isolated-invalid-openrouter-${port}.stdout.log`);
  const stderrPath = path.join(logsDir, `isolated-invalid-openrouter-${port}.stderr.log`);
  const stdout = fs.openSync(stdoutPath, 'w');
  const stderr = fs.openSync(stderrPath, 'w');
  const child = spawn(runInfo.binaryPath, [
    'serve',
    '--addr', `127.0.0.1:${port}`,
    '--public-url', baseURL,
    '--db', dbPath,
    '--owner-token', runInfo.ownerToken
  ], {
    cwd: path.resolve(runInfo.artifactRoot, '..', '..'),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      RESOFEED_E2E: '1',
      RESOFEED_E2E_OPENROUTER_ENDPOINT: runInfo.openRouterStub.endpoint,
      OPENROUTER_KEY: openRouterKey
    },
    stdio: ['ignore', stdout, stderr]
  });
  child.unref();
  await waitForAuthBoundary(baseURL);
  return { child, baseURL, stdoutPath, stderrPath };
}

async function enterOwnerToken(page: Page, ownerToken: string, url = '/'): Promise<void> {
  await page.goto(url);
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function runSteerCommand(page: Page, command: string, receipt: RegExp | string): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill(command);
  await steer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: receipt })).toBeVisible();
}

async function openSourceLedger(page: Page): Promise<void> {
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
}

async function openToday(page: Page): Promise<void> {
  await runSteerCommand(page, 'today', 'today');
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();
}

async function roundTripStateThroughLedgerFooter(page: Page, testInfo: TestInfo): Promise<void> {
  await expect(page.getByRole('button', { name: '[EXPORT STATE]' })).toBeVisible();
  await expect(page.getByRole('button', { name: '[IMPORT STATE]' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '[EXPORT STATE]' }).click();
  const download = await downloadPromise;
  const exportedStatePath = path.join(testInfo.outputDir, 'exported-state.json');
  await download.saveAs(exportedStatePath);
  expect(fs.existsSync(exportedStatePath), 'state export download was saved').toBe(true);
  await page.locator('#state-json-file').setInputFiles(exportedStatePath);
  await expect(page.getByText('import complete')).toBeVisible();
}

type AuditArtifactName =
  | 'today-populated-item'
  | 'inspector'
  | 'search'
  | 'doctor'
  | 'steering-receipt'
  | 'mobile-feed'
  | 'mobile-inspector'
  | 'mobile-source-ledger';

type AuditMetric = {
  readonly screenshot: string;
  readonly accessibilitySnapshot: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly visibleText: string;
};

type AuditNetworkRecord = {
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly failure?: string;
};

type AuditConsoleRecord = {
  readonly type: string;
  readonly text: string;
};

function auditDir(testInfo: TestInfo): string {
  const outDir = path.join(testInfo.outputDir, 'real-server-live-audit-proof');
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

async function writeAuditJson(testInfo: TestInfo, name: string, value: unknown): Promise<string> {
  const outPath = path.join(auditDir(testInfo), `${name}.json`);
  await fs.promises.writeFile(outPath, JSON.stringify(value, null, 2), 'utf8');
  await testInfo.attach(`${name}.json`, { path: outPath, contentType: 'application/json' });
  return outPath;
}

async function captureAuditState(page: Page, testInfo: TestInfo, name: AuditArtifactName, metrics: Record<AuditArtifactName, AuditMetric>): Promise<void> {
  const outDir = auditDir(testInfo);
  const screenshot = path.join(outDir, `${name}.png`);
  const accessibilitySnapshot = path.join(outDir, `${name}.aria.txt`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await fs.promises.writeFile(accessibilitySnapshot, await page.locator('body').ariaSnapshot(), 'utf8');
  await testInfo.attach(`${name}.png`, { path: screenshot, contentType: 'image/png' });
  await testInfo.attach(`${name}.aria.txt`, { path: accessibilitySnapshot, contentType: 'text/plain' });
  metrics[name] = {
    screenshot,
    accessibilitySnapshot,
    viewport: page.viewportSize() ?? { width: 0, height: 0 },
    visibleText: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1000)
  };
}

type ItemSummary = {
  id: string;
  title: string;
  source_title: string;
  is_resonated: boolean;
  human_inspected_at: string | null;
  external_surfaced_at: string | null;
};

type ItemDetail = ItemSummary & {
  summary?: string | null;
  core_insight?: string | null;
  provenance: {
    source_url: string;
    original_url: string;
  };
};

type ItemReingestResponse = {
  already_applied: boolean;
  reingest: {
    item_id: string;
    status: 'completed' | 'completed_with_errors' | 'failed' | 'accepted';
    item_updated: boolean;
    fts_updated: boolean;
    item: ItemDetail | null;
  };
};

type JsonRpcResponse = {
  result?: unknown;
  error?: { code: number; message: string; data?: Record<string, unknown> };
};

async function authorizedGet<T>(request: import('playwright/test').APIRequestContext, runInfo: { baseURL: string }, ownerToken: string, pathName: string): Promise<T> {
  const response = await request.get(`${runInfo.baseURL}${pathName}`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  expect(response.status(), `GET ${pathName}`).toBe(200);
  return await response.json() as T;
}

async function mcpPost(request: import('playwright/test').APIRequestContext, runInfo: { baseURL: string }, ownerToken: string, payload: Record<string, unknown>): Promise<{ status: number; body: JsonRpcResponse | { error: { code: string; message: string; details: Record<string, unknown> } } }> {
  const response = await request.post(`${runInfo.baseURL}/mcp`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: payload
  });
  return { status: response.status(), body: await response.json() };
}

async function mcpTool<T>(request: import('playwright/test').APIRequestContext, runInfo: { baseURL: string }, ownerToken: string, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await mcpPost(request, runInfo, ownerToken, {
    jsonrpc: '2.0',
    id: `${name}-${Date.now()}`,
    method: 'tools/call',
    params: { name, arguments: args }
  });
  expect(response.status, `MCP tool ${name} HTTP status`).toBe(200);
  const body = response.body as JsonRpcResponse;
  expect(body.error, `MCP tool ${name} JSON-RPC error`).toBeFalsy();
  const content = (body.result as { content: Array<{ type: string; text: string }> }).content;
  expect(content).toHaveLength(1);
  return JSON.parse(content[0].text) as T;
}

async function mcpResource<T>(request: import('playwright/test').APIRequestContext, runInfo: { baseURL: string }, ownerToken: string, uri: string): Promise<T> {
  const response = await mcpPost(request, runInfo, ownerToken, {
    jsonrpc: '2.0',
    id: `resource-${Date.now()}`,
    method: 'resources/read',
    params: { uri }
  });
  expect(response.status, `MCP resource ${uri} HTTP status`).toBe(200);
  const body = response.body as JsonRpcResponse;
  expect(body.error, `MCP resource ${uri} JSON-RPC error`).toBeFalsy();
  const contents = (body.result as { contents: Array<{ uri: string; mimeType: string; text: string }> }).contents;
  expect(contents).toHaveLength(1);
  return JSON.parse(contents[0].text) as T;
}

function itemIds(items: ItemSummary[]): string[] {
  return items.map((item) => item.id);
}

test('ci-safe real server/UI boot uses the Go binary and owner-token gate', async ({ page, request, runInfo, ownerToken }) => {
  const server = await startIsolatedServer(runInfo, E2E_FAKE_OPENROUTER_KEY);
  try {
    const unauthorized = await request.get(`${server.baseURL}/api/feed/today`);
    expect(unauthorized.status()).toBe(401);

    await page.goto(`${server.baseURL}/`);
    await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
    await expect(page.locator('#owner-token-input')).toBeFocused();

    await page.locator('#owner-token-input').fill('wrong-token-with-at-least-thirty-two-chars');
    await page.getByRole('button', { name: 'submit' }).click();
    await expect(page.getByText('err: owner token rejected')).toBeVisible();

    await page.locator('#owner-token-input').fill(ownerToken);
    await page.getByRole('button', { name: 'submit' }).click();
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
    await expect(page.getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();
    await expect(page.getByText('Inspect opens the item.')).toBeVisible();
    await expect(page.getByText('Star preserves durable value.')).toBeVisible();
    await expect(page.getByText('Steer is optional correction.')).toBeVisible();
  } finally {
    server.child.kill();
  }
});

test('ci-safe harness records required artifact paths and sanitized runtime notes', async ({ runInfo }) => {
  expect(fs.existsSync(runInfo.binaryPath)).toBe(true);
  expect(fs.existsSync(runInfo.server.stdoutPath)).toBe(true);
  expect(fs.existsSync(runInfo.server.stderrPath)).toBe(true);
  expect(fs.existsSync(runInfo.fixtureServer.stdoutPath)).toBe(true);
  expect(fs.existsSync(runInfo.fixtureServer.stderrPath)).toBe(true);
  expect(fs.existsSync(runInfo.openRouterStub.stdoutPath)).toBe(true);
  expect(fs.existsSync(runInfo.openRouterStub.stderrPath)).toBe(true);
  expect(fs.existsSync(runInfo.sanitizedEnvironment.notesPath)).toBe(true);
  expect(fs.existsSync(path.join(runInfo.artifactRoot, 'fixtures', 'local-feed.xml'))).toBe(true);
  expect(fs.existsSync(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'))).toBe(true);
  expect(runInfo.sanitizedEnvironment.openRouterKey).toBe('ci-safe-fake-key');
});

test('ci-safe browser-led source import, background ingest proof, feed, inspect, retrieve, and search', async ({
  page,
  request,
  runInfo,
  ownerToken
}, testInfo) => {
  const server = await startIsolatedServer(runInfo, E2E_FAKE_OPENROUTER_KEY);
  try {
  await enterOwnerToken(page, ownerToken, `${server.baseURL}/`);
  await expect(page.getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();

  await openSourceLedger(page);
  await expect(page.getByText('No sources. Paste RSS URL in Steer.')).toBeVisible();

  await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  // DEVIATION RECORD: type=test_error; artifact=web/tests/e2e/real-server-ui.spec.ts; what_changed=OPML import receipt expects `OPML outlines flattened` instead of `folders flattened`; why=CONSTITUTION/PRD/ARCHITECTURE forbid folder product semantics and define OPML as source-subscription import only with ignored/flattened outlines, so the old expectation used stale folder-surface copy; impact=same import completion coverage and count proof, with folder terminology removed.
  await expect(page.getByText('imported 1 sources; OPML outlines flattened')).toBeVisible();
  await expect(page.locator('.source-ledger__row', { hasText: /127\.0\.0\.1:\d+/ })).toContainText('last_fetch: not_fetched');

  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.locator('.source-ledger__row', { hasText: 'ResoFeed E2E Local Source' })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 15_000 });
  await expect(page.getByText('[DELETE]')).toBeVisible();

  await roundTripStateThroughLedgerFooter(page, testInfo);

  await openToday(page);
  const fixtureFeedItem = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await expect(fixtureFeedItem).toBeVisible();
  // DEVIATION RECORD: type=test_error; artifact=web/tests/e2e/real-server-ui.spec.ts; what_changed=Feed source proof now checks visible source value plus accessible `Source:` label, not visual `src:` prefix; why=DESIGN.FEED.NO_REPEATED_PREFIXES forbids repeated visual `src:` reader prefixes while preserving source provenance through position and accessibility; impact=runtime source-disclosure coverage remains, and forbidden reader prefix regressions are caught.
  await expect(fixtureFeedItem).toContainText('ResoFeed E2E Local Source');
  await expect(fixtureFeedItem.getByLabel('Source: ResoFeed E2E Local Source')).toHaveText('ResoFeed E2E Local Source');
  await expect(fixtureFeedItem).not.toContainText('src: ResoFeed E2E Local Source');
  await expect(fixtureFeedItem.getByLabel('Extraction: original_unavailable')).toHaveText('excerpt');

  await fixtureFeedItem.click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await expect(inspector).toContainText('summary unavailable');
  await expect(inspector).toContainText('why: fresh from configured source');

  await page.getByRole('button', { name: 'Resonate item' }).click();
  await expect(page.getByRole('button', { name: 'Remove resonance' })).toBeVisible();

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('/doctor');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('heading', { name: '/doctor' })).toBeVisible();
  await expect(page.getByLabel('/doctor diagnostics')).toContainText('openrouter:');

  await steer.fill('search Local fixture');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByText('retrieval: lexical search')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SEARCH' })).toBeVisible();
  await expect(page.getByLabel('Plain text query')).toHaveValue('Local fixture');
  await page.getByRole('button', { name: 'submit search' }).click();
  await expect(page.locator('#search-status')).toContainText('1 results');
  await expect(page.getByRole('region', { name: 'Search results' })).toContainText('Local fixture item one');
  // DEVIATION RECORD: type=test_error; artifact=web/tests/e2e/real-server-ui.spec.ts; what_changed=Search source proof now checks visible source value plus accessible `Source:` label, not visual `src:` prefix; why=Search results reuse feed-item reader anatomy, and DESIGN.FEED.NO_REPEATED_PREFIXES/traceability reserve raw `src:` for Source Ledger/diagnostics only; impact=search provenance coverage remains without requiring forbidden visual chrome.
  await expect(page.getByRole('region', { name: 'Search results' })).toContainText('ResoFeed E2E Local Source');
  await expect(page.getByRole('region', { name: 'Search results' }).getByLabel('Source: ResoFeed E2E Local Source')).toHaveText('ResoFeed E2E Local Source');
  await expect(page.getByRole('region', { name: 'Search results' })).not.toContainText('src: ResoFeed E2E Local Source');
  } finally {
    server.child.kill();
  }
});

test('ci-safe real server live audit proof produces complete browser artifacts without API route fixtures', async ({
  browser,
  request,
  runInfo,
  ownerToken
}, testInfo) => {
  const liveAuditFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Live Audit Source</title>
    <link>https://live-audit.example.test/</link>
    <description>Deterministic live audit RSS fixture.</description>
    <item>
      <title>Live audit item one</title>
      <link>https://live-audit.example.test/items/one</link>
      <guid>live-audit-item-one</guid>
      <pubDate>Fri, 15 May 2026 12:00:00 GMT</pubDate>
      <description>Live audit item one proves real serve, OPML import, manual ingest, Today, Inspector, Search, Doctor, and mobile surfaces.</description>
    </item>
  </channel>
</rss>`;
  const feedServer = await startPolicyFixtureServer(liveAuditFeedXml);
  const isolated = await startIsolatedServer(runInfo, E2E_FAKE_OPENROUTER_KEY);
  const context = await browser.newContext({ baseURL: isolated.baseURL });
  const page = await context.newPage();
  const metrics = {} as Record<AuditArtifactName, AuditMetric>;
  const network: AuditNetworkRecord[] = [];
  const consoleMessages: AuditConsoleRecord[] = [];

  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/')) network.push({ method: response.request().method(), url, status: response.status() });
  });
  page.on('requestfailed', (failedRequest) => {
    const url = failedRequest.url();
    if (url.includes('/api/')) network.push({ method: failedRequest.method(), url, failure: failedRequest.failure()?.errorText ?? 'request failed' });
  });

  try {
    await enterOwnerToken(page, ownerToken);
    await openSourceLedger(page);
    await page.locator('#opml-file').setInputFiles({
      name: 'live-audit.opml',
      mimeType: 'text/xml',
      buffer: Buffer.from(fixtureOpml(feedServer.url), 'utf8')
    });
    // DEVIATION RECORD: type=test_error; artifact=web/tests/e2e/real-server-ui.spec.ts; what_changed=live audit OPML receipt expects `OPML outlines flattened` instead of `folders flattened`; why=folder terminology is forbidden product-surface drift while OPML outline flattening remains allowed source-import behavior; impact=browser audit remains blocked on successful import/count but no longer on stale copy.
    await expect(page.getByText('imported 1 sources; OPML outlines flattened')).toBeVisible();
    await page.getByRole('button', { name: '[RUN INGEST]' }).click();
    await expect(page.locator('.source-ledger__row', { hasText: 'Live Audit Source' })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 20_000 });

    const apiFeedAfterIngest = await authorizedGet<{ items: ItemSummary[] }>(request, { baseURL: isolated.baseURL }, ownerToken, '/api/feed/today?limit=20');
    expect(apiFeedAfterIngest.items.some((item) => item.title === 'Live audit item one')).toBe(true);

    await openToday(page);
    const liveAuditItem = page.getByRole('button', { name: 'Open Inspector for: Live audit item one' });
    await expect(liveAuditItem).toBeVisible();
    await captureAuditState(page, testInfo, 'today-populated-item', metrics);

    await liveAuditItem.click();
    await expect(page.getByRole('heading', { name: 'Live audit item one' })).toBeFocused();
    await expect(page.getByRole('complementary', { name: 'INSPECTOR' })).toContainText('why: fresh from configured source');
    await captureAuditState(page, testInfo, 'inspector', metrics);

    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill('search Live audit');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('heading', { name: 'SEARCH' })).toBeVisible();
    await page.getByRole('button', { name: 'submit search' }).click();
    await expect(page.locator('#search-status')).toContainText('1 results');
    await expect(page.getByRole('region', { name: 'Search results' })).toContainText('Live audit item one');
    await captureAuditState(page, testInfo, 'search', metrics);

    await steer.fill('/doctor');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('heading', { name: '/doctor' })).toBeVisible();
    await expect(page.getByLabel('/doctor diagnostics')).toContainText('openrouter:');
    await captureAuditState(page, testInfo, 'doctor', metrics);

    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    await expect(page.getByRole('button', { name: 'Open Inspector for: Live audit item one' })).toBeVisible();
    await captureAuditState(page, testInfo, 'mobile-feed', metrics);

    await page.getByRole('button', { name: 'Open Inspector for: Live audit item one' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Live audit item one' })).toBeVisible();
    await captureAuditState(page, testInfo, 'mobile-inspector', metrics);

    await steer.fill('source ledger');
    await steer.press('Enter');
    await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await expect(page.locator('.source-ledger__row', { hasText: 'Live Audit Source' })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/);
    await captureAuditState(page, testInfo, 'mobile-source-ledger', metrics);

    const apiSearchAfterBrowserSearch = await authorizedGet<{ items: ItemSummary[] }>(request, { baseURL: isolated.baseURL }, ownerToken, '/api/search?q=Live+audit&limit=50');
    expect(apiSearchAfterBrowserSearch.items.some((item) => item.title === 'Live audit item one')).toBe(true);
    expect(network.some((entry) => entry.url.includes('/api/ingest') && entry.status === 200)).toBe(true);
    expect(network.some((entry) => entry.url.includes('/api/search') && entry.status === 200)).toBe(true);
  } finally {
    await writeAuditJson(testInfo, 'metrics', metrics);
    await writeAuditJson(testInfo, 'console-log', consoleMessages);
    await writeAuditJson(testInfo, 'network-log', network);
    await context.close();
    if (isolated.child.pid) {
      try {
        process.kill(isolated.child.pid, 'SIGTERM');
      } catch {
        // Process already exited; artifacts remain useful.
      }
    }
    if (feedServer.child.pid) {
      try {
        process.kill(feedServer.child.pid, 'SIGTERM');
      } catch {
        // Process already exited.
      }
    }
  }
});

test('@parity browser-led API/MCP parity probes share one real server fixture', async ({
  browser,
  request,
  runInfo,
  ownerToken
}, testInfo) => {
  const openRouterKey = runInfo.sanitizedEnvironment.openRouterKey === 'ci-safe-fake-key'
    ? E2E_FAKE_OPENROUTER_KEY
    : process.env.OPENROUTER_KEY ?? '';
  const isolated = await startIsolatedServer(runInfo, openRouterKey);
  const isolatedRunInfo = { ...runInfo, baseURL: isolated.baseURL };
  const context = await browser.newContext({ baseURL: isolated.baseURL });
  const page = await context.newPage();
  const metrics = {} as Record<AuditArtifactName, AuditMetric>;
  try {
  const unauthorizedAPI = await request.get(`${isolatedRunInfo.baseURL}/api/feed/today`);
  expect(unauthorizedAPI.status(), 'API rejects missing owner token before reads').toBe(401);
  expect(await unauthorizedAPI.json()).toMatchObject({ error: { code: 'unauthorized', details: {} } });

  const unauthorizedMCP = await request.post(`${isolatedRunInfo.baseURL}/mcp`, {
    data: { jsonrpc: '2.0', id: 'unauth', method: 'tools/list' }
  });
  expect(unauthorizedMCP.status(), 'MCP rejects missing owner token before tool handling').toBe(401);
  expect(await unauthorizedMCP.json()).toMatchObject({ error: { code: 'unauthorized', details: {} } });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await page.locator('#owner-token-input').fill('wrong-token-with-at-least-thirty-two-chars');
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByText('err: owner token rejected')).toBeVisible();
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

  await openSourceLedger(page);
  await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  // DEVIATION RECORD: type=test_error; artifact=web/tests/e2e/real-server-ui.spec.ts; what_changed=parity OPML receipt expects `OPML outlines flattened` instead of `folders flattened`; why=OPML import ignores/flat maps outlines, but folder product semantics remain forbidden by CONSTITUTION/PRD; impact=API/MCP parity setup still proves import success before feed/parity assertions.
  await expect(page.getByText('imported 1 sources; OPML outlines flattened')).toBeVisible();
  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.locator('.source-ledger__row', { hasText: 'ResoFeed E2E Local Source' })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 15_000 });
  await openToday(page);
  await expect(page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' })).toBeVisible();

  const apiFeed = await authorizedGet<{ items: ItemSummary[] }>(request, isolatedRunInfo, ownerToken, '/api/feed/today?limit=20');
  const mcpFeed = await mcpTool<{ items: ItemSummary[] }>(request, isolatedRunInfo, ownerToken, 'list_candidate_items', { limit: 20 });
  const mcpFeedResource = await mcpResource<{ items: ItemSummary[] }>(request, isolatedRunInfo, ownerToken, 'resofeed://feed/today');
  expect(apiFeed.items).toHaveLength(1);
  expect(apiFeed.items[0]).toMatchObject({ title: 'Local fixture item one', source_title: 'ResoFeed E2E Local Source' });
  expect(itemIds(mcpFeed.items)).toEqual(itemIds(apiFeed.items));
  expect(itemIds(mcpFeedResource.items)).toContain(apiFeed.items[0].id);
  const itemID = apiFeed.items[0].id;

  await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'INSPECTOR' })).toContainText('why: fresh from configured source');
  await expect.poll(async () => {
    const detail = await authorizedGet<{ item: ItemDetail }>(request, isolatedRunInfo, ownerToken, `/api/items/${itemID}`);
    return detail.item.human_inspected_at;
  }).not.toBeNull();
  const apiDetail = await authorizedGet<{ item: ItemDetail }>(request, isolatedRunInfo, ownerToken, `/api/items/${itemID}`);
  const mcpDetail = await mcpTool<{ item: ItemDetail }>(request, isolatedRunInfo, ownerToken, 'read_item', { item_id: itemID });
  expect(mcpDetail.item).toMatchObject({ id: apiDetail.item.id, title: apiDetail.item.title, provenance: apiDetail.item.provenance });
  expect(mcpDetail.item.human_inspected_at).toBe(apiDetail.item.human_inspected_at);

  await page.getByRole('button', { name: 'Resonate item' }).click();
  await expect(page.getByRole('button', { name: 'Remove resonance' })).toBeVisible();
  await expect.poll(async () => {
    const detail = await authorizedGet<{ item: ItemDetail }>(request, isolatedRunInfo, ownerToken, `/api/items/${itemID}`);
    return detail.item.is_resonated;
  }).toBe(true);
  const mcpResonatedSearch = await mcpTool<{ items: ItemSummary[] }>(request, isolatedRunInfo, ownerToken, 'search_items', { query: 'Local fixture', resonated: true, limit: 20 });
  expect(itemIds(mcpResonatedSearch.items)).toContain(itemID);

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search Local fixture');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByText('retrieval: lexical search')).toBeVisible();
  await page.getByRole('button', { name: 'submit search' }).click();
  await expect(page.locator('#search-status')).toContainText('1 results');
  const apiSearch = await authorizedGet<{ items: ItemSummary[]; query: { q: string; limit: number } }>(request, isolatedRunInfo, ownerToken, '/api/search?q=Local%20fixture&limit=20');
  const mcpSearch = await mcpTool<{ items: ItemSummary[] }>(request, isolatedRunInfo, ownerToken, 'search_items', { query: 'Local fixture', limit: 20 });
  expect(apiSearch.query).toMatchObject({ q: 'Local fixture', limit: 20 });
  expect(itemIds(apiSearch.items)).toContain(itemID);
  expect(itemIds(mcpSearch.items)).toEqual(itemIds(apiSearch.items));

  await openToday(page);
  await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click();
  const reingestPanel = page.getByRole('complementary', { name: 'INSPECTOR' }).getByLabel('Item re-ingest');
  await expect(reingestPanel).toBeVisible();
  await reingestPanel.getByRole('button', { name: '[RE-INGEST ITEM]' }).click();
  await reingestPanel.getByLabel('One-time prompt').fill('Runtime parity re-ingest through selected Inspector item.');
  await reingestPanel.getByRole('button', { name: '[CONFIRM RE-INGEST]' }).click();
  await expect(reingestPanel.getByLabel('Item re-ingest status')).toContainText(/re-ingest complete · search (refreshed|unchanged)/, { timeout: 15_000 });
  const apiDetailAfterBrowserReingest = await authorizedGet<{ item: ItemDetail }>(request, isolatedRunInfo, ownerToken, `/api/items/${itemID}`);
  expect(apiDetailAfterBrowserReingest.item.id).toBe(itemID);

  const mcpReingest = await mcpTool<ItemReingestResponse>(request, isolatedRunInfo, ownerToken, 'reingest_item', {
    item_id: itemID,
    actor_id: 'parity-agent',
    idempotency_key: `parity-reingest-${itemID}`
  });
  expect(mcpReingest).toMatchObject({
    already_applied: false,
    reingest: { item_id: itemID, item_updated: true, fts_updated: false }
  });
  expect(mcpReingest.reingest.status).toMatch(/^completed/);
  expect(mcpReingest.reingest.item?.summary).toBe(apiDetailAfterBrowserReingest.item.summary);

  await steer.fill('Push more parity fixture documents.');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('status').filter({ hasText: /applied: .* · rules:1/ })).toBeVisible();
  await captureAuditState(page, testInfo, 'steering-receipt', metrics);
  await writeAuditJson(testInfo, 'parity-metrics', metrics);
  const apiRules = await authorizedGet<{ rules: Array<{ rule_text: string; is_active: boolean }> }>(request, isolatedRunInfo, ownerToken, '/api/steer/active');
  const mcpRules = await mcpResource<{ rules: Array<{ rule_text: string; is_active: boolean }> }>(request, isolatedRunInfo, ownerToken, 'resofeed://rules/active');
  expect(apiRules.rules.map((rule) => rule.rule_text)).toEqual(
    expect.arrayContaining([expect.stringMatching(/^(Push more deterministic llm fixtures\.|boost parity fixture)$/)])
  );
  expect(mcpRules.rules.map((rule) => rule.rule_text)).toEqual(apiRules.rules.map((rule) => rule.rule_text));

  const toolsList = await mcpPost(request, isolatedRunInfo, ownerToken, { jsonrpc: '2.0', id: 'tools', method: 'tools/list' });
  expect(toolsList.status).toBe(200);
  const toolNames = (((toolsList.body as JsonRpcResponse).result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name).sort();
  expect(toolNames).toEqual([
    'get_processing_language',
    'list_candidate_items',
    'list_openrouter_models',
    'mark_inspected',
    'preview_steer',
    'read_item',
    'reingest_item',
    'report_delivery',
    'reprocess_library',
    'resonate_item',
    'search_items',
    'set_processing_language',
    'steer',
    'undo_steer'
  ]);
  expect(toolNames.join(' ')).not.toMatch(/telegram|slack|email|account|folder|tag|archive|semantic|rag/i);

  const missingMCPKey = await mcpPost(request, isolatedRunInfo, ownerToken, {
    jsonrpc: '2.0',
    id: 'missing-key',
    method: 'tools/call',
    params: { name: 'resonate_item', arguments: { item_id: itemID, resonated: false, actor_id: 'parity-agent' } }
  });
  expect(missingMCPKey.status).toBe(200);
  expect((missingMCPKey.body as JsonRpcResponse).error).toMatchObject({ code: -32602, data: { error: { details: { field: 'idempotency_key' } } } });
  } finally {
    await context.close();
    if (isolated.child.pid) {
      try {
        process.kill(isolated.child.pid, 'SIGTERM');
      } catch {
        // Process already exited; artifacts remain useful.
      }
    }
  }
});

test('@llm-deterministic ci-safe missing and invalid OPENROUTER_KEY startup paths exit before browser binding', async ({ runInfo }) => {
  const runtimeCwd = path.join(runInfo.artifactRoot, 'runtime-cwd-without-dotenv');
  fs.mkdirSync(runtimeCwd, { recursive: true });

  const commonArgs = [
    'serve',
    '--addr', '127.0.0.1:1',
    '--public-url', 'http://127.0.0.1:1',
    '--db', path.join(runInfo.artifactRoot, 'fixtures', 'missing-openrouter.sqlite3'),
    '--owner-token', runInfo.ownerToken
  ];

  const missing = spawnSync(runInfo.binaryPath, commonArgs, {
    cwd: runtimeCwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', RESOFEED_E2E: '1' },
    encoding: 'utf8'
  });
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('runtime_failed');
  expect(missing.stderr).not.toContain('invalid_openrouter_key');
  expect(missing.stdout).not.toContain('serving ResoFeed on');

  const invalid = spawnSync(runInfo.binaryPath, commonArgs, {
    cwd: runtimeCwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', RESOFEED_E2E: '1', OPENROUTER_KEY: '   ' },
    encoding: 'utf8'
  });
  expect(invalid.status).toBe(2);
  expect(invalid.stderr).toContain('invalid_openrouter_key: value required');
  expect(invalid.stdout).not.toContain('serving ResoFeed on');
});

test('@llm-deterministic browser-led steering uses deterministic OpenRouter transport and exposes terse receipt', async ({ page, request, runInfo, ownerToken }) => {
  await enterOwnerToken(page, ownerToken);

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('Push more llm deterministic fixture coverage.');
  await page.getByRole('button', { name: 'apply' }).click();

  await expect(page.getByRole('status')).toContainText('applied: steering updated · rules:1');

  const rulesResponse = await request.get(`${runInfo.baseURL}/api/steer/active`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  expect(rulesResponse.status()).toBe(200);
  const rulesBody = await rulesResponse.json() as { rules: Array<{ rule_text: string }> };
  expect(rulesBody.rules.some((rule) => rule.rule_text === 'Push more deterministic llm fixtures.')).toBe(true);

  for (const logPath of [runInfo.server.stdoutPath, runInfo.server.stderrPath, runInfo.openRouterStub.stdoutPath, runInfo.openRouterStub.stderrPath]) {
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    expect(log).not.toContain(ownerToken);
    expect(log).not.toContain('resofeed_e2e_non_secret_openrouter_key');
    expect(log).not.toContain('Authorization: Bearer');
  }
});

test('@llm-deterministic browser-led accepted steering changes ranking, filtering, and fresh model-health proof', async ({ browser, runInfo, ownerToken }) => {
  const policyFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Policy Ranking Fixture</title>
    <link>https://policy-ranking.example/</link>
    <description>Deterministic ranking fixture for PBAR browser proof.</description>
    <item>
      <title>Crypto token launch</title>
      <link>https://policy-ranking.example/crypto-token-launch</link>
      <guid>policy-crypto-token-launch</guid>
      <pubDate>Tue, 12 May 2026 12:00:00 GMT</pubDate>
      <description>Crypto token coverage should be filtered by accepted steering.</description>
    </item>
    <item>
      <title>SQLite storage analysis</title>
      <link>https://policy-ranking.example/sqlite-storage-analysis</link>
      <guid>policy-sqlite-storage-analysis</guid>
      <pubDate>Tue, 12 May 2026 09:00:00 GMT</pubDate>
      <description>SQLite storage analysis should rank first after boost steering.</description>
    </item>
    <item>
      <title>Rust compiler release</title>
      <link>https://policy-ranking.example/rust-compiler-release</link>
      <guid>policy-rust-compiler-release</guid>
      <pubDate>Tue, 12 May 2026 11:00:00 GMT</pubDate>
      <description>Neutral fresh item remains eligible.</description>
    </item>
  </channel>
</rss>`;
  const policyServer = await startPolicyFixtureServer(policyFeedXml);
  const isolated = await startIsolatedServer(runInfo, E2E_FAKE_OPENROUTER_KEY);
  const context = await browser.newContext({ baseURL: isolated.baseURL });
  const page = await context.newPage();
  try {
    await enterOwnerToken(page, ownerToken);
    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill(policyServer.url);
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('status')).toContainText(/source added: 127\.0\.0\.1|background ingest/i);

    await openSourceLedger(page);
    await page.getByRole('button', { name: '[RUN INGEST]' }).click();
    await expect(page.locator('.source-ledger__row', { hasText: 'Policy Ranking Fixture' })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 15_000 });

    await openToday(page);
    await expect(page.getByRole('button', { name: 'Open Inspector for: Crypto token launch' })).toBeVisible();

    await steer.fill('Filter out crypto token coverage and push more sqlite storage analysis.');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('status')).toContainText('applied: steering updated · rules:2');
    await openToday(page);

    const rankedRows = page.getByRole('list', { name: 'Today feed items' }).getByRole('listitem');
    await expect(rankedRows.first()).toContainText('SQLite storage analysis');
    await expect(page.getByRole('button', { name: 'Open Inspector for: Crypto token launch' })).toHaveCount(0);

    await steer.fill('/doctor');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByLabel('/doctor diagnostics')).toContainText('openrouter: item_transform_failures:0');
    await expect(page.getByLabel('/doctor diagnostics')).toContainText('openrouter: model_resolved:true');
  } finally {
    await context.close();
    if (isolated.child.pid) {
      try {
        process.kill(isolated.child.pid, 'SIGTERM');
      } catch {
        // Process already exited; artifacts remain useful.
      }
    }
    if (policyServer.child.pid) {
      try {
        process.kill(policyServer.child.pid, 'SIGTERM');
      } catch {
        // Process already exited.
      }
    }
  }
});

test('@llm-deterministic invalid OPENROUTER_KEY browser path fails gracefully with sanitized diagnostics', async ({ browser, runInfo, ownerToken }) => {
  const invalidSentinel = 'resofeed_e2e_invalid_openrouter_key';
  const isolated = await startIsolatedServer(runInfo, invalidSentinel);
  const context = await browser.newContext({ baseURL: isolated.baseURL });
  const page = await context.newPage();
  try {
    await enterOwnerToken(page, ownerToken);
    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill('Push more invalid key failure evidence.');
    await page.getByRole('button', { name: 'apply' }).click();

    await expect(page.getByRole('alert')).toHaveText('err: internal: internal error');

    for (const logPath of [isolated.stdoutPath, isolated.stderrPath]) {
      const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
      expect(log).not.toContain(invalidSentinel);
      expect(log).not.toContain(ownerToken);
      expect(log).not.toContain('Authorization: Bearer');
    }
  } finally {
    await context.close();
    if (isolated.child.pid) {
      try {
        process.kill(isolated.child.pid, 'SIGTERM');
      } catch {
        // Process already exited; artifacts remain useful.
      }
    }
  }
});

test('@live-openrouter live OpenRouter smoke is opt-in and skipped without runtime key', async ({ runInfo }) => {
  test.skip(!process.env.OPENROUTER_KEY?.trim(), 'OPENROUTER_KEY absent; live OpenRouter smoke skipped deterministically');
  expect(runInfo.sanitizedEnvironment.openRouterKey).toBe('live-redacted');
});

test('@llm-live @live-openrouter live OpenRouter browser steering flow redacts runtime key material', async ({ page, request, runInfo, ownerToken }, testInfo) => {
  const liveKey = process.env.OPENROUTER_KEY?.trim();
  test.skip(!liveKey, 'OPENROUTER_KEY absent; live OpenRouter smoke skipped deterministically');

  expect(runInfo.sanitizedEnvironment.openRouterKey).toBe('live-redacted');
  expect(fs.readFileSync(runInfo.sanitizedEnvironment.notesPath, 'utf8')).toContain('OPENROUTER_KEY: <redacted>; source=os_env');

  await enterOwnerToken(page, ownerToken);
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('Prefer concise primary-source database systems research in future summaries.');
  await page.getByRole('button', { name: 'apply' }).click();

  const status = page.getByRole('status');
  const alert = page.getByRole('alert');
  await expect(status.or(alert)).toBeVisible({ timeout: 60_000 });
  if (await alert.isVisible()) {
    const message = await alert.textContent();
    throw new Error(`FAIL_INVALID_KEY_OR_SERVICE: live OpenRouter-backed steer returned UI error: ${message ?? '<empty alert>'}`);
  }
  await expect(status).toContainText(/applied:/, { timeout: 60_000 });

  const rulesResponse = await request.get(`${runInfo.baseURL}/api/steer/active`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  expect(rulesResponse.status()).toBe(200);
  const rulesBody = await rulesResponse.json() as { rules: Array<{ rule_text: string }> };
  expect(rulesBody.rules.length).toBeGreaterThan(0);

  for (const logPath of [runInfo.server.stdoutPath, runInfo.server.stderrPath, runInfo.sanitizedEnvironment.notesPath]) {
    const body = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    expect(body).not.toContain(liveKey);
    expect(body).not.toContain(ownerToken);
    expect(body).not.toContain('Authorization: Bearer');
    await testInfo.attach(path.basename(logPath), { body, contentType: 'text/plain' });
  }
});
