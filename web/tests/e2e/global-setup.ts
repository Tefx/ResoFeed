import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { E2E_FAKE_OPENROUTER_KEY, E2E_OWNER_TOKEN, fixtureFeedXml, fixtureOpml, type E2ERunInfo } from './e2e-contract';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(webRoot, '..');
const artifactRoot = path.join(repoRoot, '.test-artifacts', 'playwright');
const binDir = path.join(repoRoot, '.test-artifacts', 'bin');
const binaryPath = path.join(binDir, 'resofeed');
const statePath = path.join(artifactRoot, 'run-info.json');

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: sanitizedToolEnv()
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function sanitizedToolEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    CI: process.env.CI ?? '',
    npm_config_cache: process.env.npm_config_cache ?? ''
  };
}

function sanitizedRuntimeEnv(): NodeJS.ProcessEnv {
  const liveRequested = isLiveOpenRouterRun();
  const liveKey = process.env.OPENROUTER_KEY?.trim();
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    RESOFEED_E2E: '1',
    OPENROUTER_KEY: liveRequested && liveKey ? liveKey : E2E_FAKE_OPENROUTER_KEY
  };
}

function isLiveOpenRouterRun(): boolean {
  return process.env.RESOFEED_E2E_LIVE_OPENROUTER === '1' || process.argv.join(' ').includes('@live-openrouter');
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
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function redactLogFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const redacted = fs
    .readFileSync(filePath, 'utf8')
    .replaceAll(E2E_OWNER_TOKEN, '<redacted-owner-token>')
    .replaceAll(E2E_FAKE_OPENROUTER_KEY, '<redacted-openrouter-key>')
    .replace(/OPENROUTER_KEY=\S+/g, 'OPENROUTER_KEY=<redacted>')
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer <redacted>');
  fs.writeFileSync(filePath, redacted);
}

async function waitForServer(baseURL: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/feed/today`);
      if (response.status === 401) return;
    } catch {
      // Retry until the real binary has bound and API auth is observable.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready at ${baseURL}`);
}

export default async function globalSetup(): Promise<void> {
  const logsDir = path.join(artifactRoot, 'server-logs');
  const fixturesDir = path.join(artifactRoot, 'fixtures');
  const resultsDir = path.join(artifactRoot, 'results');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  fs.writeFileSync(path.join(fixturesDir, 'local-feed.xml'), fixtureFeedXml);
  fs.writeFileSync(path.join(fixturesDir, 'flattened.opml'), fixtureOpml);

  run('npm', ['--prefix', 'web', 'run', 'build'], repoRoot);
  run('go', ['build', '-o', binaryPath, './cmd/resofeed'], repoRoot);

  const port = await reservePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const dbPath = path.join(fixturesDir, `resofeed-e2e-${Date.now()}-${process.pid}.sqlite3`);
  const stdoutPath = path.join(logsDir, 'server.stdout.log');
  const stderrPath = path.join(logsDir, 'server.stderr.log');
  const stdout = fs.openSync(stdoutPath, 'w');
  const stderr = fs.openSync(stderrPath, 'w');
  const child = spawn(binaryPath, [
    'serve',
    '--addr', `127.0.0.1:${port}`,
    '--public-url', baseURL,
    '--db', dbPath,
    '--owner-token', E2E_OWNER_TOKEN
  ], {
    cwd: repoRoot,
    env: sanitizedRuntimeEnv(),
    stdio: ['ignore', stdout, stderr]
  });

  child.unref();
  await waitForServer(baseURL);
  redactLogFile(stdoutPath);
  redactLogFile(stderrPath);

  const envNotesPath = path.join(artifactRoot, 'sanitized-environment.md');
  const liveRequested = isLiveOpenRouterRun() && Boolean(process.env.OPENROUTER_KEY?.trim());
  fs.writeFileSync(
    envNotesPath,
    [
      '# ResoFeed E2E sanitized environment',
      '',
      '- Allowed variables: PATH, HOME, TMPDIR, RESOFEED_E2E, OPENROUTER_KEY.',
      `- OPENROUTER_KEY: ${liveRequested ? '<redacted>; source=os_env' : '<redacted non-secret sentinel>; ambient OS value not forwarded'}.`,
      '- Owner token: supplied by --owner-token and redacted from logs/artifacts.',
      `- Binary: ${binaryPath}`,
      `- Database fixture: ${dbPath}`,
      `- Base URL: ${baseURL}`
    ].join('\n')
  );

  const info: E2ERunInfo = {
    baseURL,
    binaryPath,
    dbPath,
    ownerToken: E2E_OWNER_TOKEN,
    artifactRoot,
    server: { pid: child.pid ?? -1, stdoutPath, stderrPath },
    sanitizedEnvironment: {
      allowedVariables: ['PATH', 'HOME', 'TMPDIR', 'RESOFEED_E2E', 'OPENROUTER_KEY'],
      openRouterKey: liveRequested ? 'live-redacted' : 'ci-safe-fake-key',
      notesPath: envNotesPath
    }
  };
  fs.writeFileSync(statePath, JSON.stringify(info, null, 2));
  process.env.RESOFEED_E2E_BASE_URL = baseURL;
  process.env.RESOFEED_E2E_RUN_INFO = statePath;
  process.env.RESOFEED_E2E_OWNER_TOKEN = E2E_OWNER_TOKEN;
}
