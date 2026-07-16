import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test as base, type Page } from 'playwright/test';
import { createTestDatabase, databaseResidue, removeTestDatabase, type TestDatabase } from './test-db';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const repoRoot = path.resolve(webRoot, '..');

export interface RuntimeFixture {
  readonly baseURL: string;
  readonly binaryPath: string;
  readonly database: TestDatabase;
  readonly ownerToken: string;
}

interface WorkerFixtures {
  readonly resofeedBinary: string;
}

interface TestFixtures {
  readonly runtime: RuntimeFixture;
}

function sanitizedEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    CI: '1',
    RESOFEED_E2E: '1'
  };
}

function buildBinary(binaryPath: string): void {
  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  const web = spawnSync('npm', ['--prefix', 'web', 'run', 'build'], { cwd: repoRoot, env: sanitizedEnvironment(), encoding: 'utf8' });
  if (web.status !== 0) throw new Error(`web build failed: ${(web.stderr || web.stdout).slice(-2000)}`);
  const backend = spawnSync('go', ['build', '-tags', 'resofeed_e2e', '-o', binaryPath, './cmd/resofeed'], { cwd: repoRoot, env: sanitizedEnvironment(), encoding: 'utf8' });
  if (backend.status !== 0) throw new Error(`Go build failed: ${(backend.stderr || backend.stdout).slice(-2000)}`);
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return server.close(() => reject(new Error('unable to allocate loopback port')));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForAuthBoundary(baseURL: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`real cmd/resofeed exited before readiness (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const response = await fetch(`${baseURL}/api/feed/today`);
      if (response.status === 401) return;
    } catch {
      // The owned process has not bound yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`real cmd/resofeed did not expose its auth boundary at ${baseURL}`);
}

async function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return child.exitCode !== null || child.signalCode !== null;
}

async function stopProcess(child: ChildProcess): Promise<{ readonly stopped: boolean; readonly method: 'already-exited' | 'sigterm' | 'sigkill' | 'failed' }> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return { stopped: true, method: 'already-exited' };
  }
  child.kill('SIGTERM');
  if (await waitForProcessExit(child, 5_000)) return { stopped: true, method: 'sigterm' };
  child.kill('SIGKILL');
  if (await waitForProcessExit(child, 2_000)) return { stopped: true, method: 'sigkill' };
  return { stopped: false, method: 'failed' };
}

function redact(value: string, ownerToken: string): string {
  return value
    .replaceAll(ownerToken, '<redacted-owner-token>')
    .replace(/rfeed_[A-Za-z0-9_-]+/gu, '<redacted-owner-token>')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gu, '<redacted-openrouter-key>')
    .replace(/(Authorization:\s*Bearer\s+)\S+/giu, '$1<redacted>')
    .replace(/(Cookie:\s*)[^\n]+/giu, '$1<redacted>')
    .replace(/((?:OPENROUTER_KEY|TAVILY_API_KEY)=)\S+/gu, '$1<redacted>')
    .replace(/(https?:\/\/)[^/\s:@]+:[^@\s/]+@/giu, '$1<redacted>@')
    .replace(/([?&](?:token|key|authorization|cookie)=)[^&#\s]+/giu, '$1<redacted>');
}

async function portIsClosed(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(true));
    socket.setTimeout(500, () => { socket.destroy(); resolve(true); });
  });
}

function captureBrowserDiagnostics(page: Page): { readonly lines: string[]; readonly detach: () => void } {
  const lines: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => lines.push(`console.${message.type()}: ${message.text()}`);
  const onPageError = (error: Error) => lines.push(`pageerror: ${error.message}`);
  const onRequestFailed = (request: { method(): string; url(): string; failure(): { errorText: string } | null }) => {
    lines.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  return {
    lines,
    detach: () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
    }
  };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  resofeedBinary: [async ({}, use, workerInfo) => {
    const binaryPath = path.join(repoRoot, '.test-artifacts', 'bin', `resofeed-worker-${workerInfo.workerIndex}`);
    buildBinary(binaryPath);
    await use(binaryPath);
  }, { scope: 'worker' }],
  runtime: async ({ page, resofeedBinary }, use, testInfo) => {
    const database = createTestDatabase(testInfo);
    const port = await reservePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const ownerToken = `rfeed_e2e_${randomBytes(32).toString('base64url')}`;
    const stdoutPath = testInfo.outputPath('runtime', 'server.stdout.log');
    const stderrPath = testInfo.outputPath('runtime', 'server.stderr.log');
    const diagnosticsPath = testInfo.outputPath('runtime', 'browser-diagnostics.log');
    const cleanupPath = testInfo.outputPath('runtime-cleanup.txt');
    const stdout = fs.openSync(stdoutPath, 'w');
    const stderr = fs.openSync(stderrPath, 'w');
    const diagnostics = captureBrowserDiagnostics(page);
    const child = spawn(resofeedBinary, [
      'serve', '--addr', `127.0.0.1:${port}`, '--public-url', baseURL,
      '--db', database.path, '--owner-token', ownerToken
    ], { cwd: database.directory, env: sanitizedEnvironment(), stdio: ['ignore', stdout, stderr] });

    let bodyFailure: unknown;
    try {
      await waitForAuthBoundary(baseURL, child);
      console.log('RF-BUG-010_SETUP=ready');
      await use({ baseURL, binaryPath: resofeedBinary, database, ownerToken });
    } catch (error) {
      bodyFailure = error;
    }

    diagnostics.detach();
    const processOutcome = await stopProcess(child);
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    for (const logPath of [stdoutPath, stderrPath]) {
      fs.writeFileSync(logPath, redact(fs.readFileSync(logPath, 'utf8'), ownerToken));
    }
    fs.writeFileSync(diagnosticsPath, redact(`${diagnostics.lines.join('\n')}${diagnostics.lines.length ? '\n' : ''}`, ownerToken));

    removeTestDatabase(database);
    const residue = databaseResidue(database);
    const closedPort = await portIsClosed(port);
    const clean = processOutcome.stopped && closedPort && residue.length === 0;
    fs.writeFileSync(cleanupPath, [
      `binary=${resofeedBinary}`,
      `database=${database.path}`,
      `loopback_port=${port}`,
      `process=${processOutcome.stopped ? 'stopped' : 'active'}`,
      `process_stop=${processOutcome.method}`,
      `port=${closedPort ? 'closed' : 'open'}`,
      `database_residue=${residue.length}`,
      `cleanup=${clean ? 'clean' : 'residue'}`,
      ''
    ].join('\n'));

    await testInfo.attach('server.stdout.log', { path: stdoutPath, contentType: 'text/plain' });
    await testInfo.attach('server.stderr.log', { path: stderrPath, contentType: 'text/plain' });
    await testInfo.attach('browser-diagnostics.log', { path: diagnosticsPath, contentType: 'text/plain' });
    await testInfo.attach('runtime-cleanup.txt', { path: cleanupPath, contentType: 'text/plain' });
    console.log(`RF-BUG-010_TEARDOWN=${clean ? 'clean' : 'residue'}`);
    if (!clean) throw new Error(`RF-BUG-010 teardown residue: ${JSON.stringify(residue)}`);
    if (bodyFailure) throw bodyFailure;
  }
});

export { expect };
