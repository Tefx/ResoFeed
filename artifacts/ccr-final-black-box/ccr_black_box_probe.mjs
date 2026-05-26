import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import playwright from '../../web/node_modules/playwright/index.js';
const { chromium } = playwright;

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'artifacts/ccr-final-black-box');
const LOGS = path.join(OUT, 'logs');
const SHOTS = path.join(OUT, 'screenshots');
const DOM = path.join(OUT, 'dom');
const RESP = path.join(OUT, 'responses');
const TMP = path.join(OUT, 'tmp');

const OWNER_TOKEN = 'rfeed_ccr_black_box_owner_token_0000000000000000000000';
const OPENROUTER_KEY = 'resofeed_ccr_non_secret_openrouter_key';
const localizedTitle = '中国监管令改写 AI 并购退出路径';
const sourceItemTitle = 'Manus scraps Meta deal after Chinese regulator order';
const sourceTitle = 'TLDR AI Feed';
const summary = 'Manus 因中国监管指令撤销 Meta 收购案，显示跨境 AI 并购已经从商业谈判问题转向监管确定性问题。';
const coreInsight = '这件事说明 AI 初创公司的退出路径正在被地缘监管重新定价。';
const keyPoints = [
  'Manus 撤销交易不是产品失败，而是监管指令改变了并购可执行性。',
  'Meta 等大型买方的收购意愿不再等同于 AI 初创公司的退出确定性。',
  '读者评估 AI 公司价值时，需要同时考虑技术、资本和跨境监管三条线。'
];
const listIntentKeyPoints = [
  '中国监管指令直接改变了 Manus 与 Meta 交易的可执行性，而不是只影响谈判节奏。',
  'Meta 的收购意愿没有消除跨境 AI 交易面临的监管不确定性。',
  'AI 初创公司的退出预期需要同时评估技术吸引力、买方资本和监管批准。',
  '这类交易风险会改变投资人和创始人对跨境退出路径的定价。'
];

function redact(text) {
  return String(text)
    .replaceAll(OWNER_TOKEN, '<redacted-owner-token>')
    .replaceAll(OPENROUTER_KEY, '<redacted-openrouter-key>')
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer <redacted>');
}

async function writeText(file, text) {
  await fs.writeFile(file, redact(text), 'utf8');
}

async function writeJSON(file, value) {
  await writeText(file, JSON.stringify(value, null, 2));
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const port = a && typeof a !== 'string' ? a.port : 0;
      s.close((err) => err ? reject(err) : resolve(port));
    });
  });
}

async function waitHTTP(url, accept = (r) => r.ok, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (accept(r)) return r;
      last = `status ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${url}: ${last}`);
}

async function startFixtureServer() {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${sourceTitle}</title><link>${base}/</link><description>CCR black-box localized content fixture.</description>
<item><guid>ccr-ac22-title-separation</guid><title>${sourceItemTitle}</title><link>${base}/article/manus-meta-regulator</link><pubDate>Tue, 26 May 2026 10:00:00 GMT</pubDate><description>Manus cancelled a proposed Meta acquisition after a Chinese regulator order, making cross-border AI M&amp;A risk concrete.</description></item>
</channel></rss>`;
  const article = `<!doctype html><html><body><article><h1>${sourceItemTitle}</h1><p>Manus cancelled a proposed acquisition by Meta after Chinese regulators ordered the deal withdrawn.</p><p>The episode shows that cross-border AI startup exits depend on technology, capital and regulatory execution risk.</p></article></body></html>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
      res.end(feedXml); return;
    }
    if (req.url === '/article/manus-meta-regulator') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(article); return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return { server, base, feedUrl: `${base}/feed.xml`, feedXml };
}

async function startOpenRouterStub() {
  const port = await reservePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
    if (req.method === 'GET' && req.url === '/api/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'ccr/zh-ok', name: 'CCR zh ok' }, { id: 'ccr/decode-error', name: 'CCR decode error' }] })); return;
    }
    if (req.method !== 'POST' || req.url !== '/api/v1/chat/completions') { res.writeHead(404); res.end('not found'); return; }
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      const authOK = req.headers.authorization === `Bearer ${OPENROUTER_KEY}`;
      if (!authOK) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'invalid api key' } })); return; }
      const payload = JSON.parse(body);
      let prompt = {};
      for (const m of payload.messages ?? []) {
        if (typeof m.content === 'string') { try { prompt = JSON.parse(m.content); break; } catch {} }
      }
      calls.push({ model: payload.model ?? null, task: prompt.task ?? null, steering: prompt.steering ?? null, one_time_prompt: prompt.one_time_prompt ?? prompt.prompt ?? null });
      if (payload.model === 'ccr/decode-error' || JSON.stringify(prompt).includes('触发解码错误')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'ccr-decode-error', model: 'ccr/decode-error', choices: [{ message: { role: 'assistant', content: '{ not valid json' } }] })); return;
      }
      const promptText = JSON.stringify(prompt);
      const content = prompt.task === 'translate_steering'
        ? { interpreted_as: 'steering_policy_update', rule_texts: ['优先关注跨境 AI 监管风险'], message: 'steering updated' }
        : {
            localized_title: localizedTitle,
            summary,
            core_insight: promptText.includes('核心洞察要分点') ? '一次性提示把多点分析放入要点，同时保留一句核心洞察。' : coreInsight,
            key_points: promptText.includes('核心洞察要分点') ? listIntentKeyPoints : keyPoints,
            value_tier: 'high',
            model_status: 'ok'
          };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'ccr-ok', model: payload.model ?? 'ccr/zh-ok', choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] }));
    });
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return { server, endpoint, calls };
}

async function startResoFeed(baseURL, dbPath, openRouterEndpoint) {
  const stdoutPath = path.join(LOGS, 'resofeed.stdout.log');
  const stderrPath = path.join(LOGS, 'resofeed.stderr.log');
  const stdout = fssync.openSync(stdoutPath, 'w');
  const stderr = fssync.openSync(stderrPath, 'w');
  const addr = new URL(baseURL).host;
  const child = spawn(path.join(ROOT, 'bin/resofeed'), ['serve', '--addr', addr, '--public-url', baseURL, '--db', dbPath, '--owner-token', OWNER_TOKEN, '--openrouter-model', 'ccr/zh-ok'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp', RESOFEED_E2E: '1', RESOFEED_E2E_OPENROUTER_ENDPOINT: openRouterEndpoint, OPENROUTER_KEY },
    stdio: ['ignore', stdout, stderr]
  });
  await waitHTTP(`${baseURL}/api/feed/today`, (r) => r.status === 401, 20000);
  return { child, stdoutPath, stderrPath };
}

async function api(baseURL, method, pathName, body, extraHeaders = {}) {
  const r = await fetch(`${baseURL}${pathName}`, {
    method,
    headers: { Authorization: `Bearer ${OWNER_TOKEN}`, ...(body && !(body instanceof Buffer) ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
    body: body ? (body instanceof Buffer || typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed, raw: text };
}

async function mcp(baseURL, payload) {
  return api(baseURL, 'POST', '/mcp', payload);
}

async function mcpTool(baseURL, name, args) {
  return mcp(baseURL, { jsonrpc: '2.0', id: `${name}-${Date.now()}`, method: 'tools/call', params: { name, arguments: args } });
}

async function capture(page, name, scopeSelector = 'body') {
  const screenshot = path.join(SHOTS, `${name}.png`);
  const dom = path.join(DOM, `${name}.html`);
  const aria = path.join(DOM, `${name}.aria.txt`);
  const locator = page.locator(scopeSelector);
  if (scopeSelector === 'body') await page.screenshot({ path: screenshot, fullPage: true });
  else await locator.first().screenshot({ path: screenshot });
  await writeText(dom, await locator.evaluate((node) => node.outerHTML));
  await writeText(aria, await locator.ariaSnapshot());
  return { screenshot, dom, aria };
}

async function main() {
  await fs.rm(path.join(OUT, 'probe-error.txt'), { force: true }).catch(() => {});
  const port = await reservePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const dbPath = path.join(TMP, `ccr-${Date.now()}.sqlite3`);
  const fixture = await startFixtureServer();
  const openrouter = await startOpenRouterStub();
  const app = await startResoFeed(baseURL, dbPath, openrouter.endpoint);
  const responses = {};
  const browserArtifacts = {};
  let browser;
  try {
    responses.unauthorized_api = await api(baseURL, 'GET', '/api/feed/today');
    responses.language_set = await api(baseURL, 'PUT', '/api/runtime/language', { language: 'zh', actor_kind: 'human', actor_id: 'owner', idempotency_key: 'ccr-lang-zh' });
    const opml = `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>CCR OPML</title></head><body><outline text="${sourceTitle}" title="${sourceTitle}" type="rss" xmlUrl="${fixture.feedUrl}" /></body></opml>`;
    responses.import_opml = await api(baseURL, 'POST', '/api/sources/import-opml', opml, { 'content-type': 'application/xml' });
    responses.sources_after_import = await api(baseURL, 'GET', '/api/sources');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.addInitScript((token) => localStorage.setItem('resofeed.ownerToken', token), OWNER_TOKEN);
    const network = [];
    page.on('response', async (r) => { if (r.url().includes('/api/') || r.url().endsWith('/mcp')) network.push({ method: r.request().method(), url: r.url().replace(OWNER_TOKEN, '<redacted-owner-token>'), status: r.status() }); });
    await page.goto(baseURL);
    responses.manual_ingest = await api(baseURL, 'POST', '/api/ingest', {});
    await writeJSON(path.join(RESP, 'http-manual-ingest.json'), responses.manual_ingest);

    responses.feed_after_ingest = await api(baseURL, 'GET', '/api/feed/today?limit=10');
    const item = responses.feed_after_ingest.body.items?.[0];
    if (!item?.id) throw new Error(`No feed item after ingest: ${JSON.stringify(responses.feed_after_ingest.body)}`);
    const itemID = item.id;
    responses.detail_after_ingest = await api(baseURL, 'GET', `/api/items/${encodeURIComponent(itemID)}`);
    await writeJSON(path.join(RESP, 'http-feed-after-ingest.json'), responses.feed_after_ingest);
    await writeJSON(path.join(RESP, 'http-detail-after-ingest.json'), responses.detail_after_ingest);

    await page.getByRole('textbox').fill('today');
    await page.getByRole('button', { name: /apply|应用|执行/i }).click().catch(async () => { await page.keyboard.press('Enter'); });
    await page.waitForTimeout(1000);
    browserArtifacts.feed = await capture(page, 'feed', '[aria-label="今日订阅条目"]');

    const feedText = await page.locator('body').innerText();
    const feedRowText = await page.locator('button', { hasText: localizedTitle }).first().innerText().catch(() => '');
    const feedButton = page.getByRole('button', { name: new RegExp(localizedTitle) }).first();
    if (await feedButton.count()) await feedButton.click(); else await page.locator('button', { hasText: localizedTitle }).first().click();
    await page.waitForTimeout(1000);
    browserArtifacts.inspector = await capture(page, 'inspector', '[aria-label="INSPECTOR"]');

    const inspectorTextBefore = await page.locator('body').innerText();
    const sourceDisclosure = page.locator('details, [aria-expanded]').filter({ hasText: /来源|Source|原始|source/i }).last();
    if (await sourceDisclosure.count()) {
      await sourceDisclosure.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    browserArtifacts.provenance = await capture(page, 'provenance-context', '[aria-label="INSPECTOR"]');

    await page.getByRole('textbox').fill('search 监管');
    await page.getByRole('button', { name: /apply|应用|执行/i }).click().catch(async () => { await page.keyboard.press('Enter'); });
    await page.waitForTimeout(500);
    const searchButton = page.getByRole('button', { name: /SEARCH|搜索/i }).first();
    if (await searchButton.count()) await searchButton.click();
    await page.waitForTimeout(1000);
    browserArtifacts.search = await capture(page, 'search-result', 'body');
    const searchText = await page.locator('body').innerText();

    responses.search_localized = await api(baseURL, 'GET', '/api/search?q=%E7%9B%91%E7%AE%A1&limit=10');

    responses.reingest_list_intent = await api(baseURL, 'POST', `/api/items/${encodeURIComponent(itemID)}/reingest`, { actor_kind: 'human', actor_id: 'owner', idempotency_key: 'ccr-list-intent-http', model: 'ccr/zh-ok', prompt: '核心洞察要分点' });
    responses.detail_after_list_intent = await api(baseURL, 'GET', `/api/items/${encodeURIComponent(itemID)}`);
    responses.reingest_failed_decode = await api(baseURL, 'POST', `/api/items/${encodeURIComponent(itemID)}/reingest`, { actor_kind: 'human', actor_id: 'owner', idempotency_key: 'ccr-decode-failure-http', model: 'ccr/decode-error', prompt: '触发解码错误' });
    responses.detail_after_failed_decode = await api(baseURL, 'GET', `/api/items/${encodeURIComponent(itemID)}`);
    await writeJSON(path.join(RESP, 'http-search-localized.json'), responses.search_localized);
    await writeJSON(path.join(RESP, 'http-reingest-list-intent.json'), responses.reingest_list_intent);
    await writeJSON(path.join(RESP, 'http-detail-after-list-intent.json'), responses.detail_after_list_intent);
    await writeJSON(path.join(RESP, 'http-reingest-failed-decode.json'), responses.reingest_failed_decode);
    await writeJSON(path.join(RESP, 'http-detail-after-failed-decode.json'), responses.detail_after_failed_decode);

    responses.mcp_tools_list = await mcp(baseURL, { jsonrpc: '2.0', id: 'tools-list', method: 'tools/list' });
    responses.mcp_read_item = await mcpTool(baseURL, 'read_item', { item_id: itemID });
    responses.mcp_search_items = await mcpTool(baseURL, 'search_items', { query: '监管', limit: 10 });
    responses.mcp_reingest_failed = await mcpTool(baseURL, 'reingest_item', { item_id: itemID, actor_id: 'ccr-agent', idempotency_key: 'ccr-mcp-reingest-decode-failure', model: 'ccr/decode-error', prompt: '触发解码错误' });
    responses.detail_after_mcp_failed = await api(baseURL, 'GET', `/api/items/${encodeURIComponent(itemID)}`);
    await writeJSON(path.join(RESP, 'mcp-tools-list.json'), responses.mcp_tools_list);
    await writeJSON(path.join(RESP, 'mcp-read-item.json'), responses.mcp_read_item);
    await writeJSON(path.join(RESP, 'mcp-search-items.json'), responses.mcp_search_items);
    await writeJSON(path.join(RESP, 'mcp-reingest-failed.json'), responses.mcp_reingest_failed);
    await writeJSON(path.join(RESP, 'http-detail-after-mcp-failed.json'), responses.detail_after_mcp_failed);

    await writeJSON(path.join(RESP, 'openrouter-calls.json'), openrouter.calls);
    await writeJSON(path.join(RESP, 'browser-network.json'), network);
    const proof = {
      baseURL,
      itemID,
      fixtureFeedUrl: fixture.feedUrl,
      browserArtifacts,
      texts: { feedText, feedRowText, inspectorTextBefore, searchText },
      responseFiles: fssync.readdirSync(RESP).sort().map((name) => path.join(RESP, name)),
      expected: { localizedTitle, sourceItemTitle, sourceTitle, summary, coreInsight, keyPoints, listIntentKeyPoints }
    };
    await writeJSON(path.join(OUT, 'proof-summary.json'), proof);
    console.log(JSON.stringify(proof, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    app.child.kill('SIGTERM');
    fixture.server.close();
    openrouter.server.close();
    await new Promise((r) => setTimeout(r, 300));
    for (const p of [app.stdoutPath, app.stderrPath]) if (fssync.existsSync(p)) await writeText(p, await fs.readFile(p, 'utf8'));
  }
}

main().catch(async (err) => {
  await writeText(path.join(OUT, 'probe-error.txt'), err.stack || err.message || String(err));
  console.error(err);
  process.exit(1);
});
