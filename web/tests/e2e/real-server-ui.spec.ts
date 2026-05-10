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
