import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const outDir = path.dirname(scriptPath);
const repoRoot = path.resolve(outDir, '..', '..', '..');
const workRoot = path.join(repoRoot, '.test-artifacts', 'client-runtime-proof-after-batched-remediation');
const binPath = path.join(workRoot, 'bin', 'resofeed');
const ownerToken = 'rfeed_runtime_proof_owner_token_0000000000000000000000000000';
const fakeOpenRouterKey = 'resofeed_runtime_proof_non_secret_openrouter_key';
const launchedAt = new Date().toISOString();

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(workRoot, 'bin'), { recursive: true });
fs.mkdirSync(path.join(workRoot, 'logs'), { recursive: true });
fs.mkdirSync(path.join(workRoot, 'fixtures'), { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env ?? {}) }
  });
  const logPath = path.join(outDir, `${options.name ?? command.replace(/[^a-z0-9]/gi, '-')}.log`);
  fs.writeFileSync(logPath, [`$ ${command} ${args.join(' ')}`, `exit=${result.status ?? 'null'}`, '--- stdout ---', result.stdout ?? '', '--- stderr ---', result.stderr ?? ''].join('\n'));
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed; see ${logPath}`);
  return { command: `${command} ${args.join(' ')}`, exitCode: result.status, logPath };
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('no TCP port')));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(url, predicate = (response) => response.ok, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (predicate(response)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for ${url}`);
}

function startFeedServer(port) {
  const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Post Remediation Runtime Source</title>
<link>https://post-remediation.example.test/</link>
<description>Deterministic post-remediation runtime proof feed.</description>
<item><title>Post remediation structured insight item</title><link>https://post-remediation.example.test/items/structured</link><guid>post-remediation-structured</guid><pubDate>Mon, 01 Jun 2026 12:00:00 GMT</pubDate><description>Post remediation runtime proof verifies compact feed rows, selected markers, structured inspector sections, source ledger actions, and mobile responsive surfaces with meaningful content.</description></item>
<item><title>Post remediation second compact row</title><link>https://post-remediation.example.test/items/second</link><guid>post-remediation-second</guid><pubDate>Mon, 01 Jun 2026 11:00:00 GMT</pubDate><description>Second deterministic proof item keeps the feed non blank and shows compact row density after remediation.</description></item>
</channel></rss>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/runtime-proof-feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
      res.end(feedXml);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function startOpenRouterStub(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'openrouter/runtime-proof-model', name: 'Runtime Proof Model' }] }));
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
      if (req.headers.authorization !== `Bearer ${fakeOpenRouterKey}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
        return;
      }
      const content = {
        localized_title: '后修复结构化洞察条目',
        summary: '后修复运行时证据显示，真实网页应用已加载紧凑信息流、结构化检查器与来源台账。',
        core_insight: '这条证据证明批量修复后的界面不是空壳，而是可交互的真实运行时。',
        key_points: [
          '信息流保留来源、时间与摘要，适合快速扫描。',
          '检查器按照摘要、核心洞察、要点的顺序呈现结构化内容。',
          '来源台账保留扁平括号操作和当前操作状态区域。'
        ],
        value_tier: 'high',
        model_status: 'ok'
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'runtime-proof-chatcmpl', model: 'openrouter/runtime-proof-model', choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function capture(page, name) {
  const screenshot = path.join(outDir, `${name}.png`);
  const dom = path.join(outDir, `${name}.dom.html`);
  const aria = path.join(outDir, `${name}.aria.txt`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await fs.promises.writeFile(dom, await page.locator('body').evaluate((node) => node.outerHTML), 'utf8');
  await fs.promises.writeFile(aria, await page.locator('body').ariaSnapshot(), 'utf8');
  return {
    screenshot: path.relative(repoRoot, screenshot),
    dom: path.relative(repoRoot, dom),
    aria: path.relative(repoRoot, aria),
    viewport: page.viewportSize(),
    visibleTextSample: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900)
  };
}

async function steer(page, command, receiptText) {
  const input = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await input.fill(command);
  await input.press('Enter');
  if (receiptText) await page.getByRole('status').filter({ hasText: receiptText }).waitFor({ state: 'visible', timeout: 10000 });
}

const commandReceipts = [];
let feedServer;
let openRouterServer;
let appProcess;
let browser;
const artifacts = {};
const consoleMessages = [];
const network = [];

try {
  commandReceipts.push(run('npm', ['--prefix', 'web', 'run', 'build'], { name: 'npm-build' }));
  commandReceipts.push(run('go', ['build', '-o', binPath, './cmd/resofeed'], { name: 'go-build' }));

  const feedPort = await reservePort();
  const openRouterPort = await reservePort();
  const appPort = await reservePort();
  feedServer = await startFeedServer(feedPort);
  openRouterServer = await startOpenRouterStub(openRouterPort);
  await waitFor(`http://127.0.0.1:${openRouterPort}/healthz`);

  const baseURL = `http://127.0.0.1:${appPort}`;
  const dbPath = path.join(workRoot, 'fixtures', `runtime-proof-${Date.now()}.sqlite3`);
  const appStdout = path.join(outDir, 'resofeed-serve.stdout.log');
  const appStderr = path.join(outDir, 'resofeed-serve.stderr.log');
  appProcess = spawn(binPath, ['serve', '--addr', `127.0.0.1:${appPort}`, '--public-url', baseURL, '--db', dbPath, '--owner-token', ownerToken], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp', RESOFEED_E2E: '1', RESOFEED_E2E_OPENROUTER_ENDPOINT: `http://127.0.0.1:${openRouterPort}`, OPENROUTER_KEY: fakeOpenRouterKey },
    stdio: ['ignore', fs.openSync(appStdout, 'w'), fs.openSync(appStderr, 'w')]
  });
  await waitFor(`${baseURL}/api/feed/today`, (response) => response.status === 401);

  const opmlPath = path.join(workRoot, 'fixtures', 'runtime-proof.opml');
  const feedURL = `http://127.0.0.1:${feedPort}/runtime-proof-feed.xml`;
  fs.writeFileSync(opmlPath, `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Runtime Proof OPML</title></head><body><outline text="Post Remediation Runtime Source" title="Post Remediation Runtime Source" type="rss" xmlUrl="${feedURL}" /></body></opml>`);

  browser = await chromium.launch();
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on('response', (response) => { if (response.url().includes('/api/')) network.push({ method: response.request().method(), url: response.url().replace(baseURL, ''), status: response.status() }); });
  page.on('requestfailed', (request) => { if (request.url().includes('/api/')) network.push({ method: request.method(), url: request.url().replace(baseURL, ''), failure: request.failure()?.errorText ?? 'failed' }); });

  await page.goto('/');
  await page.evaluate((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.reload();
  if (await page.locator('#owner-token-input').isVisible().catch(() => false)) {
    await page.locator('#owner-token-input').fill(ownerToken);
    await page.getByRole('button', { name: 'submit' }).click();
  }
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken') ?? '';
    const response = await fetch('/api/runtime/language', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ language: 'zh', actor_kind: 'human', actor_id: 'owner', idempotency_key: 'client-runtime-proof-set-zh' }) });
    if (!response.ok) throw new Error(`set zh failed ${response.status} ${await response.text()}`);
  });
  await page.reload();
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).waitFor({ state: 'visible' });

  await steer(page, 'source ledger', 'source ledger');
  await page.locator('#opml-file').setInputFiles(opmlPath);
  await page.waitForFunction(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken') ?? '';
    const response = await fetch('/api/sources', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return false;
    const json = await response.json();
    return json.sources?.some((source) => source.title === 'Post Remediation Runtime Source');
  }, undefined, { timeout: 10000 });
  await page.locator('.source-ledger__row', { hasText: 'Post Remediation Runtime Source' }).waitFor({ state: 'visible', timeout: 10000 });
  artifacts.desktopSourceLedgerImported = await capture(page, 'desktop-source-ledger-imported');
  await page.getByRole('button', { name: /\[RUN INGEST\]|\[运行抓取\]/ }).click();
  await page.locator('.source-ledger__row', { hasText: 'Post Remediation Runtime Source' }).getByText(/(?:last_fetch|上次抓取): \d{2}:\d{2}:\d{2}/).first().waitFor({ state: 'visible', timeout: 25000 });
  artifacts.desktopSourceLedger = await capture(page, 'desktop-source-ledger-after-ingest');

  await steer(page, 'today', 'today');
  const firstFeedButton = page.locator('.contract-feed-item').first().getByRole('button').first();
  await firstFeedButton.waitFor({ state: 'visible', timeout: 10000 });
  artifacts.desktopFeed = await capture(page, 'desktop-feed-before-selection');
  await firstFeedButton.click();
  await page.getByRole('complementary', { name: 'INSPECTOR' }).getByText('摘要：', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('complementary', { name: 'INSPECTOR' }).getByText('核心洞察：', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('complementary', { name: 'INSPECTOR' }).getByText('要点：', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  artifacts.desktopInspector = await capture(page, 'desktop-inspector-selected');

  const firstRowClass = await page.locator('.contract-feed-item').first().getAttribute('class');
  const rowMarker = await page.locator('.contract-feed-item').first().evaluate((node) => {
    const before = window.getComputedStyle(node, '::before');
    const style = window.getComputedStyle(node);
    return { className: node.className, borderLeftWidth: style.borderLeftWidth, beforeWidth: before.width, beforeBackground: before.backgroundColor, beforeContent: before.content };
  });

  await page.getByRole('button', { name: /Resonate item|标星/ }).first().click();
  await page.getByRole('button', { name: /Remove resonance|取消标星/ }).first().waitFor({ state: 'visible', timeout: 10000 });
  artifacts.interaction = await capture(page, 'desktop-interaction-resonated');

  artifacts.computedChrome = await page.evaluate(() => {
    const selectors = ['main.contract-shell', 'details.surface-nav summary', '.source-ledger', '.source-ledger__row', '.bracket-action', 'input[aria-label="Steer or paste RSS URL"]'];
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const style = window.getComputedStyle(element);
      return [selector, { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing }];
    }));
  });
  artifacts.selectedRowMarker = { firstRowClass, rowMarker };

  await page.setViewportSize({ width: 390, height: 844 });
  await steer(page, 'today', 'today');
  const firstMobileFeedButton = page.locator('.contract-feed-item').first().getByRole('button').first();
  await firstMobileFeedButton.waitFor({ state: 'visible', timeout: 10000 });
  artifacts.mobileFeed = await capture(page, 'mobile-feed');
  await firstMobileFeedButton.click({ force: true });
  await page.getByText('摘要：', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  artifacts.mobileInspector = await capture(page, 'mobile-inspector');
  await steer(page, 'source ledger', 'source ledger');
  await page.getByRole('heading', { name: 'SOURCE LEDGER' }).waitFor({ state: 'visible', timeout: 10000 });
  artifacts.mobileSourceLedger = await capture(page, 'mobile-source-ledger');

  const apiState = await page.evaluate(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken') ?? '';
    const headers = { Authorization: `Bearer ${token}` };
    const [language, feed, sources, operation] = await Promise.all([
      fetch('/api/runtime/language', { headers }).then((r) => r.json()),
      fetch('/api/feed/today?limit=10', { headers }).then((r) => r.json()),
      fetch('/api/sources', { headers }).then((r) => r.json()),
      fetch('/api/runtime/operation', { headers }).then((r) => r.json()).catch((error) => ({ error: String(error) }))
    ]);
    return { language, feedItemCount: feed.items?.length ?? 0, sourceCount: sources.sources?.length ?? 0, operation };
  });

  const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
  const gitBranch = spawnSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
  const manifest = {
    launchedAt,
    completedAt: new Date().toISOString(),
    postRemediationContext: {
      gitHead,
      gitBranch,
      recentCommits: spawnSync('git', ['log', '--oneline', '-5'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim().split('\n'),
      staleArtifactReuse: false,
      upstreamCompletedBeforeHead: ['batched-broad-e2e-ui-remediation', 'retest-green-runtime-ui-after-batched-remediation']
    },
    launch: {
      buildCommands: commandReceipts.map((receipt) => ({ command: receipt.command, exitCode: receipt.exitCode, logPath: path.relative(repoRoot, receipt.logPath) })),
      serveCommand: `${path.relative(repoRoot, binPath)} serve --addr 127.0.0.1:${appPort} --public-url ${baseURL} --db ${path.relative(repoRoot, dbPath)} --owner-token <redacted>`,
      url: baseURL,
      routes: ['/', '/api/runtime/language', '/api/sources', '/api/feed/today', '/api/runtime/operation'],
      viewports: { desktop: { width: 1280, height: 720 }, mobile: { width: 390, height: 844 } },
      fixtureFeedURL: feedURL,
      openRouterEndpoint: `http://127.0.0.1:${openRouterPort}`,
      logs: { stdout: path.relative(repoRoot, appStdout), stderr: path.relative(repoRoot, appStderr) }
    },
    apiState,
    artifacts,
    consoleMessages,
    network
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.promises.writeFile(path.join(outDir, 'computed-chrome.json'), JSON.stringify({ computedChrome: artifacts.computedChrome, selectedRowMarker: artifacts.selectedRowMarker }, null, 2), 'utf8');
  await fs.promises.writeFile(path.join(outDir, 'console-log.json'), JSON.stringify(consoleMessages, null, 2), 'utf8');
  await fs.promises.writeFile(path.join(outDir, 'network-log.json'), JSON.stringify(network, null, 2), 'utf8');
} finally {
  if (browser) await browser.close();
  if (appProcess?.pid) appProcess.kill('SIGTERM');
  if (feedServer) feedServer.close();
  if (openRouterServer) openRouterServer.close();
}
