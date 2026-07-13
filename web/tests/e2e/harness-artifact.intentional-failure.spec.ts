import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from 'playwright/test';

import { E2E_FAKE_OPENROUTER_KEY, type E2ERunInfo } from './e2e-contract';
import { expect, test } from './fixtures';
import cleanupRuntime from './global-teardown';

interface BrowserEvidence {
  readonly console: Array<{ readonly type: string; readonly text: string }>;
  readonly network: Array<{ readonly failure?: string; readonly method: string; readonly status?: number; readonly url: string }>;
}

const evidenceByTest = new Map<string, BrowserEvidence>();

function redact(value: string, runInfo: E2ERunInfo): string {
  const secrets = [runInfo.ownerToken, E2E_FAKE_OPENROUTER_KEY, process.env.OPENROUTER_KEY?.trim() ?? ''].filter(Boolean);
  let redacted = value;
  for (const secret of secrets) redacted = redacted.replaceAll(secret, '<redacted>');
  return redacted
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"',}]+/giu, '$1<redacted>')
    .replace(/(cookie\s*[:=]\s*)[^\n]+/giu, '$1<redacted>')
    .replace(/(OPENROUTER_KEY\s*=\s*)[^\s]+/gu, '$1<redacted>');
}

function recordBrowserEvidence(page: Page, testInfo: TestInfo, runInfo: E2ERunInfo): void {
  const evidence: BrowserEvidence = { console: [], network: [] };
  evidenceByTest.set(testInfo.testId, evidence);

  page.on('console', (message) => {
    evidence.console.push({ type: message.type(), text: redact(message.text(), runInfo) });
  });
  page.on('response', (response) => {
    evidence.network.push({ method: response.request().method(), status: response.status(), url: redact(response.url(), runInfo) });
  });
  page.on('requestfailed', (request) => {
    evidence.network.push({
      failure: redact(request.failure()?.errorText ?? 'request failed', runInfo),
      method: request.method(),
      url: redact(request.url(), runInfo)
    });
  });
}

async function waitForProcessExit(pid: number): Promise<boolean> {
  if (pid <= 0) return true;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function sanitizeFile(filePath: string, runInfo: E2ERunInfo): void {
  if (!fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, redact(fs.readFileSync(filePath, 'utf8'), runInfo));
}

async function attachTextFile(testInfo: TestInfo, name: string, filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) throw new Error(`RF-BUG-010 missing artifact: ${filePath}`);
  await testInfo.attach(name, { body: fs.readFileSync(filePath), contentType: 'text/plain' });
}

test.beforeEach(async ({ page, runInfo }, testInfo) => {
  recordBrowserEvidence(page, testInfo, runInfo);
});

test.afterEach(async ({ runInfo }, testInfo) => {
  const browserEvidence = evidenceByTest.get(testInfo.testId) ?? { console: [], network: [] };
  await cleanupRuntime();

  const statePath = process.env.RESOFEED_E2E_RUN_INFO;
  for (const filePath of [
    runInfo.server.stdoutPath,
    runInfo.server.stderrPath,
    runInfo.fixtureServer.stdoutPath,
    runInfo.fixtureServer.stderrPath,
    runInfo.openRouterStub.stdoutPath,
    runInfo.openRouterStub.stderrPath,
    runInfo.sanitizedEnvironment.notesPath
  ]) sanitizeFile(filePath, runInfo);
  if (statePath && fs.existsSync(statePath)) {
    const sanitizedRunInfo = { ...runInfo, ownerToken: '<redacted-owner-token>' };
    fs.writeFileSync(statePath, `${JSON.stringify(sanitizedRunInfo, null, 2)}\n`);
  }

  const processResults = await Promise.all([
    waitForProcessExit(runInfo.server.pid),
    waitForProcessExit(runInfo.fixtureServer.pid),
    waitForProcessExit(runInfo.openRouterStub.pid)
  ]);
  const cleanupIsClean = !fs.existsSync(runInfo.dbPath) && processResults.every(Boolean);
  const cleanupPath = testInfo.outputPath('runtime-cleanup.txt');
  fs.mkdirSync(path.dirname(cleanupPath), { recursive: true });
  fs.writeFileSync(
    cleanupPath,
    [
      `database=${runInfo.dbPath}`,
      `server_pid=${runInfo.server.pid}`,
      `fixture_server_pid=${runInfo.fixtureServer.pid}`,
      `openrouter_stub_pid=${runInfo.openRouterStub.pid}`,
      `cleanup=${cleanupIsClean ? 'clean' : 'residue'}`
    ].join('\n') + '\n'
  );

  await attachTextFile(testInfo, 'server.stdout.log', runInfo.server.stdoutPath);
  await attachTextFile(testInfo, 'server.stderr.log', runInfo.server.stderrPath);
  await attachTextFile(testInfo, 'sanitized-environment.md', runInfo.sanitizedEnvironment.notesPath);
  await testInfo.attach('browser-console.json', {
    body: Buffer.from(`${JSON.stringify(browserEvidence.console, null, 2)}\n`),
    contentType: 'application/json'
  });
  await testInfo.attach('network-summary.json', {
    body: Buffer.from(`${JSON.stringify(browserEvidence.network, null, 2)}\n`),
    contentType: 'application/json'
  });
  await testInfo.attach('runtime-cleanup.txt', { path: cleanupPath, contentType: 'text/plain' });

  evidenceByTest.delete(testInfo.testId);
  console.log(`RF-BUG-010_TEARDOWN=${cleanupIsClean ? 'clean' : 'residue'}`);
  if (!cleanupIsClean) throw new Error('RF-BUG-010 teardown residue detected');
});

test('[RF-BUG-010] intentional failure retains complete artifacts', async ({ page, runInfo }, testInfo) => {
  await page.goto(runInfo.baseURL);
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();

  await testInfo.attach('runtime-identity.json', {
    body: Buffer.from(`${JSON.stringify({
      baseURL: runInfo.baseURL,
      binaryPath: runInfo.binaryPath,
      database: runInfo.dbPath,
      parallelIndex: testInfo.parallelIndex,
      project: testInfo.project.name,
      testId: testInfo.testId,
      timestamp: new Date().toISOString(),
      workerIndex: testInfo.workerIndex
    }, null, 2)}\n`),
    contentType: 'application/json'
  });

  console.log('RF-BUG-010_SETUP=ready');
  await page.locator('body').screenshot({ path: testInfo.outputPath('assertion-reached.png') });
  console.log('RF-BUG-010_ASSERTION_REACHED=ready');
  expect('actual', 'RF-BUG-010_INTENTIONAL_ASSERTION').toBe('expected');
});
