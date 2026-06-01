import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
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

function sanitizedRuntimeEnv(openRouterEndpoint: string): NodeJS.ProcessEnv {
  const liveRequested = isLiveOpenRouterRun();
  const liveKey = process.env.OPENROUTER_KEY?.trim();
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    RESOFEED_E2E: '1',
    OPENROUTER_KEY: liveRequested && liveKey ? liveKey : E2E_FAKE_OPENROUTER_KEY
  };
  if (!(liveRequested && liveKey)) {
    env.RESOFEED_E2E_OPENROUTER_ENDPOINT = openRouterEndpoint;
  }
  return env;
}

function isLiveOpenRouterRun(): boolean {
  const argv = process.argv.join(' ');
  return process.env.RESOFEED_E2E_LIVE_OPENROUTER === '1' || argv.includes('@live-openrouter') || argv.includes('@llm-live');
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
  const liveKey = process.env.OPENROUTER_KEY?.trim();
  const redacted = fs
    .readFileSync(filePath, 'utf8')
    .replaceAll(E2E_OWNER_TOKEN, '<redacted-owner-token>')
    .replaceAll(E2E_FAKE_OPENROUTER_KEY, '<redacted-openrouter-key>')
    .replaceAll(liveKey ? liveKey : '__no_live_key_to_redact__', '<redacted-openrouter-key>')
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

async function waitForHTTP(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the deterministic feed fixture server is reachable.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`fixture server did not become ready at ${url}`);
}

async function startFixtureServer(logsDir: string): Promise<E2ERunInfo['fixtureServer']> {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}/e2e-feed.xml`;
  const stdoutPath = path.join(logsDir, 'fixture-server.stdout.log');
  const stderrPath = path.join(logsDir, 'fixture-server.stderr.log');
  const scriptPath = path.join(artifactRoot, 'fixture-feed-server.mjs');
  fs.writeFileSync(
    scriptPath,
    [
      "import http from 'node:http';",
      `const feedXml = ${JSON.stringify(fixtureFeedXml)};`,
      `const port = ${port};`,
      "const server = http.createServer((request, response) => {",
      "  if (request.url === '/e2e-feed.xml') {",
      "    response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });",
      "    response.end(feedXml);",
      "    return;",
      "  }",
      "  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });",
      "  response.end('not found');",
      "});",
      "server.listen(port, '127.0.0.1', () => { console.log(`fixture feed server listening on ${port}`); });",
      "process.on('SIGTERM', () => server.close(() => process.exit(0)));"
    ].join('\n')
  );
  const stdout = fs.openSync(stdoutPath, 'w');
  const stderr = fs.openSync(stderrPath, 'w');
  const child = spawn(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: sanitizedToolEnv(),
    stdio: ['ignore', stdout, stderr]
  });
  child.unref();
  await waitForHTTP(url);
  return { pid: child.pid ?? -1, url, stdoutPath, stderrPath };
}

async function waitForOpenRouterStub(endpoint: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/healthz`);
      if (response.ok) return;
    } catch {
      // Retry until the deterministic test harness transport has bound.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`OpenRouter stub did not become ready at ${endpoint}`);
}

function startOpenRouterStub(port: number, stdoutPath: string, stderrPath: string): ChildProcess {
  const script = String.raw`
const http = require('node:http');
const port = Number(process.argv[1]);
const successKey = 'Bearer resofeed_e2e_non_secret_openrouter_key';
http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/v1/chat/completions') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    if (req.headers.authorization !== successKey) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
      return;
    }
    const payload = JSON.parse(body);
    const promptMessage = payload.messages.find((message) => {
      if (typeof message.content !== 'string') return false;
      try {
        JSON.parse(message.content);
        return true;
      } catch {
        return false;
      }
    });
    const prompt = promptMessage ? JSON.parse(promptMessage.content) : { task: 'summarize' };
    const command = typeof prompt.steering?.command === 'string' ? prompt.steering.command.toLowerCase() : '';
    const sourceItemTitle = typeof prompt.item?.source_item_title === 'string' && prompt.item.source_item_title.trim()
      ? prompt.item.source_item_title.trim()
      : 'Deterministic fixture title';
    const steeringContent = command.includes('crypto') && command.includes('sqlite')
      ? { interpreted_as: 'steering_policy_update', rule_texts: ['filter crypto token', 'boost sqlite storage analysis'], message: 'steering updated' }
      : { interpreted_as: 'steering_policy_update', rule_texts: ['Push more deterministic llm fixtures.'], message: 'steering updated' };
    function cleanAvailableText(value) {
      if (typeof value !== 'string') return '';
      let text = value
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{\s*"@context"[\s\S]*?\}/gi, ' ')
        .replace(/\benclosure:\s+url=\S+\s+type=\S+\s+length=\S+(?:\s+image=\S+)?/gi, ' ')
        .replace(/\bfollow\s+us\s+on\s+(?:twitter|x)\s+for\s+more\s+newsletters?\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      text = text.replace(/\b(summary-like lead repeated by the site)\s+\1\b/gi, ' ');
      return text.replace(/\s+/g, ' ').trim();
    }
    function compactSummary(value) {
      if (value.length <= 1700) return value;
      return value.slice(0, 900).trimEnd() + ' ... ' + value.slice(-700).trimStart();
    }
    const availableText = cleanAvailableText(prompt.item?.available_text);
    const sourceBackedSummary = availableText ? compactSummary(availableText) : '';
    const sourceBackedInsight = availableText ? 'Source text remains readable.' : '';
    const content = prompt.task === 'translate_steering'
      ? steeringContent
      : availableText
        ? { localized_title: sourceItemTitle, summary: sourceBackedSummary, core_insight: sourceBackedInsight, key_points: ['Source text remains available.', 'Source text is preserved for review.', 'Source excerpt supports lexical retrieval.'], value_tier: 'high', model_status: 'ok' }
        : { localized_title: sourceItemTitle, summary: 'summary unavailable', core_insight: 'summary unavailable', key_points: [], value_tier: 'source-claim', model_status: 'summary_unavailable' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'e2e-chatcmpl', model: 'openrouter/e2e-deterministic', choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] }));
  });
}).listen(port, '127.0.0.1', () => console.log('openrouter stub listening'));
`;
  const stdout = fs.openSync(stdoutPath, 'w');
  const stderr = fs.openSync(stderrPath, 'w');
  const child = spawn(process.execPath, ['-e', script, String(port)], {
    cwd: repoRoot,
    env: sanitizedToolEnv(),
    stdio: ['ignore', stdout, stderr]
  });
  child.unref();
  return child;
}

export default async function globalSetup(): Promise<void> {
  const logsDir = path.join(artifactRoot, 'server-logs');
  const fixturesDir = path.join(artifactRoot, 'fixtures');
  const resultsDir = path.join(artifactRoot, 'results');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const fixtureServer = await startFixtureServer(logsDir);
  fs.writeFileSync(path.join(fixturesDir, 'local-feed.xml'), fixtureFeedXml);
  fs.writeFileSync(path.join(fixturesDir, 'flattened.opml'), fixtureOpml(fixtureServer.url));

  run('npm', ['--prefix', 'web', 'run', 'build'], repoRoot);
  run('go', ['build', '-o', binaryPath, './cmd/resofeed'], repoRoot);

  const port = await reservePort();
  const stubPort = await reservePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const openRouterEndpoint = `http://127.0.0.1:${stubPort}`;
  const dbPath = path.join(fixturesDir, `resofeed-e2e-${Date.now()}-${process.pid}.sqlite3`);
  const stdoutPath = path.join(logsDir, 'server.stdout.log');
  const stderrPath = path.join(logsDir, 'server.stderr.log');
  const stubStdoutPath = path.join(logsDir, 'openrouter-stub.stdout.log');
  const stubStderrPath = path.join(logsDir, 'openrouter-stub.stderr.log');
  const stub = startOpenRouterStub(stubPort, stubStdoutPath, stubStderrPath);
  await waitForOpenRouterStub(openRouterEndpoint);
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
    env: sanitizedRuntimeEnv(openRouterEndpoint),
    stdio: ['ignore', stdout, stderr]
  });

  child.unref();
  await waitForServer(baseURL);
  redactLogFile(stdoutPath);
  redactLogFile(stderrPath);
  redactLogFile(stubStdoutPath);
  redactLogFile(stubStderrPath);

  const envNotesPath = path.join(artifactRoot, 'sanitized-environment.md');
  const liveRequested = isLiveOpenRouterRun() && Boolean(process.env.OPENROUTER_KEY?.trim());
  fs.writeFileSync(
    envNotesPath,
    [
      '# ResoFeed E2E sanitized environment',
      '',
      '- Allowed variables: PATH, HOME, TMPDIR, RESOFEED_E2E, RESOFEED_E2E_OPENROUTER_ENDPOINT, OPENROUTER_KEY.',
      `- OPENROUTER_KEY: ${liveRequested ? '<redacted>; source=os_env' : '<redacted non-secret sentinel>; ambient OS value not forwarded'}.`,
      `- OpenRouter endpoint: ${liveRequested ? 'canonical external OpenRouter endpoint; live-secret smoke only' : 'deterministic local test transport; no external secret or provider call'}.`,
      '- Owner token: supplied by --owner-token and redacted from logs/artifacts.',
      `- OPML fixture feed URL: ${fixtureServer.url}`,
      `- Fixture feed server stdout: ${fixtureServer.stdoutPath}`,
      `- Fixture feed server stderr: ${fixtureServer.stderrPath}`,
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
    fixtureServer,
    openRouterStub: { endpoint: openRouterEndpoint, pid: stub.pid ?? -1, stdoutPath: stubStdoutPath, stderrPath: stubStderrPath },
    sanitizedEnvironment: {
      allowedVariables: ['PATH', 'HOME', 'TMPDIR', 'RESOFEED_E2E', 'RESOFEED_E2E_OPENROUTER_ENDPOINT', 'OPENROUTER_KEY'],
      openRouterKey: liveRequested ? 'live-redacted' : 'ci-safe-fake-key',
      notesPath: envNotesPath
    }
  };
  fs.writeFileSync(statePath, JSON.stringify(info, null, 2));
  process.env.RESOFEED_E2E_BASE_URL = baseURL;
  process.env.RESOFEED_E2E_RUN_INFO = statePath;
  process.env.RESOFEED_E2E_OWNER_TOKEN = E2E_OWNER_TOKEN;
}
