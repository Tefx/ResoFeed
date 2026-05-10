import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { test, expect } from './fixtures';

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

async function enterOwnerToken(page: import('playwright/test').Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
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
  provenance: {
    source_url: string;
    original_url: string;
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
  const unauthorized = await request.get(`${runInfo.baseURL}/api/feed/today`);
  expect(unauthorized.status()).toBe(401);

  await page.goto('/');
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

test('ci-safe browser-led source import, manual fetch, feed, inspect, retrieve, and search', async ({
  page,
  runInfo,
  ownerToken
}) => {
  await enterOwnerToken(page, ownerToken);
  await expect(page.getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();

  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await expect(page.getByText('No sources. Paste RSS URL in Steer.')).toBeVisible();

  await page
    .getByLabel('import OPML')
    .setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expect(page.getByText('imported 1 sources; folders flattened')).toBeVisible();
  await expect(page.getByText(/127\.0\.0\.1:\d+ · not_fetched/)).toBeVisible();

  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.getByRole('button', { name: '[INGESTING...]' })).toBeVisible();
  await expect(page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/last ingest:/)).toBeVisible();

  await page.getByRole('button', { name: 'Fetch ResoFeed E2E Local Source' }).click();
  await expect(page.getByRole('button', { name: 'Fetching ResoFeed E2E Local Source' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fetch ResoFeed E2E Local Source' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'TODAY' }).click();
  await expect(page.getByRole('heading', { name: 'TODAY' })).toBeVisible();
  const fixtureFeedItem = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await expect(fixtureFeedItem).toBeVisible();
  await expect(fixtureFeedItem).toContainText('src: ResoFeed E2E Local Source');
  await expect(fixtureFeedItem.getByLabel('Extraction: original_unavailable')).toBeVisible();

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
  await expect(page.getByRole('heading', { name: 'Search and Retrieval' })).toBeVisible();
  await expect(page.getByLabel('Plain text query')).toHaveValue('Local fixture');
  await page.getByRole('button', { name: 'search' }).click();
  await expect(page.locator('#search-status')).toContainText('1 results');
  await expect(page.getByRole('region', { name: 'Search results' })).toContainText('Local fixture item one');
  await expect(page.getByRole('region', { name: 'Search results' })).toContainText('src: ResoFeed E2E Local Source');
});

test('@parity browser-led API/MCP parity probes share one real server fixture', async ({
  page,
  request,
  runInfo,
  ownerToken
}) => {
  const unauthorizedAPI = await request.get(`${runInfo.baseURL}/api/feed/today`);
  expect(unauthorizedAPI.status(), 'API rejects missing owner token before reads').toBe(401);
  expect(await unauthorizedAPI.json()).toMatchObject({ error: { code: 'unauthorized', details: {} } });

  const unauthorizedMCP = await request.post(`${runInfo.baseURL}/mcp`, {
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

  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await page.getByLabel('import OPML').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expect(page.getByText('imported 1 sources; folders flattened')).toBeVisible();
  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'TODAY' }).click();
  await expect(page.getByRole('heading', { name: 'TODAY' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' })).toBeVisible();

  const apiFeed = await authorizedGet<{ items: ItemSummary[] }>(request, runInfo, ownerToken, '/api/feed/today?limit=20');
  const mcpFeed = await mcpTool<{ items: ItemSummary[] }>(request, runInfo, ownerToken, 'list_candidate_items', { limit: 20 });
  const mcpFeedResource = await mcpResource<{ items: ItemSummary[] }>(request, runInfo, ownerToken, 'resofeed://feed/today');
  expect(apiFeed.items).toHaveLength(1);
  expect(apiFeed.items[0]).toMatchObject({ title: 'Local fixture item one', source_title: 'ResoFeed E2E Local Source' });
  expect(itemIds(mcpFeed.items)).toEqual(itemIds(apiFeed.items));
  expect(itemIds(mcpFeedResource.items)).toContain(apiFeed.items[0].id);
  const itemID = apiFeed.items[0].id;

  await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'INSPECTOR' })).toContainText('why: fresh from configured source');
  await expect.poll(async () => {
    const detail = await authorizedGet<{ item: ItemDetail }>(request, runInfo, ownerToken, `/api/items/${itemID}`);
    return detail.item.human_inspected_at;
  }).not.toBeNull();
  const apiDetail = await authorizedGet<{ item: ItemDetail }>(request, runInfo, ownerToken, `/api/items/${itemID}`);
  const mcpDetail = await mcpTool<{ item: ItemDetail }>(request, runInfo, ownerToken, 'read_item', { item_id: itemID });
  expect(mcpDetail.item).toMatchObject({ id: apiDetail.item.id, title: apiDetail.item.title, provenance: apiDetail.item.provenance });
  expect(mcpDetail.item.human_inspected_at).toBe(apiDetail.item.human_inspected_at);

  await page.getByRole('button', { name: 'Resonate item' }).click();
  await expect(page.getByRole('button', { name: 'Remove resonance' })).toBeVisible();
  await expect.poll(async () => {
    const detail = await authorizedGet<{ item: ItemDetail }>(request, runInfo, ownerToken, `/api/items/${itemID}`);
    return detail.item.is_resonated;
  }).toBe(true);
  const mcpResonatedSearch = await mcpTool<{ items: ItemSummary[] }>(request, runInfo, ownerToken, 'search_items', { query: 'Local fixture', resonated: true, limit: 20 });
  expect(itemIds(mcpResonatedSearch.items)).toContain(itemID);

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search Local fixture');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByText('retrieval: lexical search')).toBeVisible();
  await page.getByRole('button', { name: 'search' }).click();
  await expect(page.locator('#search-status')).toContainText('1 results');
  const apiSearch = await authorizedGet<{ items: ItemSummary[]; query: { q: string; limit: number } }>(request, runInfo, ownerToken, '/api/search?q=Local%20fixture&limit=20');
  const mcpSearch = await mcpTool<{ items: ItemSummary[] }>(request, runInfo, ownerToken, 'search_items', { query: 'Local fixture', limit: 20 });
  expect(apiSearch.query).toMatchObject({ q: 'Local fixture', limit: 20 });
  expect(itemIds(apiSearch.items)).toContain(itemID);
  expect(itemIds(mcpSearch.items)).toEqual(itemIds(apiSearch.items));

  await steer.fill('Push more parity fixture documents.');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'applied: steering updated · rules:1' })).toBeVisible();
  const apiRules = await authorizedGet<{ rules: Array<{ rule_text: string; is_active: boolean }> }>(request, runInfo, ownerToken, '/api/steer/active');
  const mcpRules = await mcpResource<{ rules: Array<{ rule_text: string; is_active: boolean }> }>(request, runInfo, ownerToken, 'resofeed://rules/active');
  expect(apiRules.rules.map((rule) => rule.rule_text)).toContain('Push more deterministic llm fixtures.');
  expect(mcpRules.rules.map((rule) => rule.rule_text)).toEqual(apiRules.rules.map((rule) => rule.rule_text));

  const toolsList = await mcpPost(request, runInfo, ownerToken, { jsonrpc: '2.0', id: 'tools', method: 'tools/list' });
  expect(toolsList.status).toBe(200);
  const toolNames = (((toolsList.body as JsonRpcResponse).result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name).sort();
  expect(toolNames).toEqual(['list_candidate_items', 'mark_inspected', 'read_item', 'report_delivery', 'resonate_item', 'search_items', 'steer']);
  expect(toolNames.join(' ')).not.toMatch(/telegram|slack|email|account|folder|tag|archive|semantic|rag/i);

  const missingMCPKey = await mcpPost(request, runInfo, ownerToken, {
    jsonrpc: '2.0',
    id: 'missing-key',
    method: 'tools/call',
    params: { name: 'resonate_item', arguments: { item_id: itemID, resonated: false, actor_id: 'parity-agent' } }
  });
  expect(missingMCPKey.status).toBe(200);
  expect((missingMCPKey.body as JsonRpcResponse).error).toMatchObject({ code: -32602, data: { field: 'idempotency_key' } });
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
  expect(missing.status).toBe(2);
  expect(missing.stderr).toContain('invalid_openrouter_key: value required');
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
