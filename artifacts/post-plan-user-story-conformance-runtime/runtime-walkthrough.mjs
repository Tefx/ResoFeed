import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const baseURL = 'http://127.0.0.1:18083';
const ownerToken = 'rfeed_runtime_walkthrough_owner_token_0123456789';
const outDir = new URL('./', import.meta.url);
const events = [];
const consoleMessages = [];
const failedRequests = [];
const responses = [];

function artifact(name) {
  return new URL(name, outDir).pathname;
}

async function saveJSON(name, value) {
  await writeFile(artifact(name), JSON.stringify(value, null, 2));
}

async function capture(page, name, note) {
  await page.screenshot({ path: artifact(`${name}.png`), fullPage: true });
  await writeFile(artifact(`${name}.dom.html`), await page.content());
  const text = await page.locator('body').innerText().catch((error) => `ERR_TEXT:${error.message}`);
  await writeFile(artifact(`${name}.text.txt`), text);
  const accessibility = page.accessibility
    ? await page.accessibility.snapshot({ interestingOnly: false }).catch((error) => ({ error: error.message }))
    : await page.locator('body').ariaSnapshot().catch((error) => ({ error: error.message }));
  await saveJSON(`${name}.accessibility.json`, accessibility);
  events.push({ name, url: page.url(), note, text_sample: text.slice(0, 1000) });
}

async function clickIfVisible(locator, description) {
  const count = await locator.count();
  if (count === 0) {
    events.push({ name: `skip:${description}`, note: 'locator not found' });
    return false;
  }
  await locator.first().click();
  events.push({ name: `click:${description}`, url: locator.page().url() });
  return true;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

page.on('console', (message) => {
  consoleMessages.push({ type: message.type(), text: message.text(), location: message.location() });
});
page.on('requestfailed', (request) => {
  failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText ?? 'unknown' });
});
page.on('response', (response) => {
  const url = response.url();
  if (url.includes('/api/')) responses.push({ url, status: response.status(), method: response.request().method() });
});

await page.goto(baseURL, { waitUntil: 'networkidle' });
await capture(page, '01-owner-token-prompt', 'Unauthenticated runtime presents owner-token prompt from real Go server.');

await page.locator('#owner-token-input').fill('wrong-token');
await page.getByRole('button', { name: /submit/i }).click();
await page.waitForSelector('text=err: owner token rejected', { timeout: 10000 });
await capture(page, '02-owner-token-rejected', 'Invalid token interaction yields raw rejection line.');

await page.locator('#owner-token-input').fill(ownerToken);
await page.getByRole('button', { name: /submit/i }).click();
await page.waitForSelector('text=Hacker News: Front Page', { timeout: 20000 });
await capture(page, '03-authenticated-today-feed', 'Valid token loads populated Today feed from ingested RSS source.');

await page.getByRole('button', { name: /^Open Inspector for:/ }).first().click();
await page.waitForSelector('text=INSPECTOR', { timeout: 10000 });
await capture(page, '04-inspector-after-feed-click', 'Feed item click opens Inspector and marks Inspect via UI flow.');

const firstStar = page.locator('.contract-feed-item').first().locator('button.contract-resonate');
await firstStar.click();
await page.waitForTimeout(500);
await capture(page, '05-resonate-toggle', 'Resonate star toggled from feed row; star shape/state visible.');

await clickIfVisible(page.getByRole('button', { name: /^\[RE-INGEST ITEM\]$/ }), 'open item re-ingest panel');
await page.waitForSelector('textarea[name="reingest-prompt"]', { timeout: 10000 });
await page.locator('textarea[name="reingest-prompt"]').fill('one-time runtime verification prompt; do not persist');
await capture(page, '06-inspector-reingest-prompt-configured', 'Inspector-only re-ingest panel accepts one-time prompt; model list unavailable because OPENROUTER_KEY is absent.');

await page.locator('summary.surface-nav-label').click();
await page.waitForSelector('text=SOURCE LEDGER', { timeout: 10000 });
await capture(page, '07-resofeed-menu-open', 'RESOFEED menu exposes NAV/OPERATIONS including language/reprocess controls.');

await page.getByRole('button', { name: /Processing language English; set Chinese/i }).click();
await page.waitForFunction(() => document.documentElement.lang === 'zh-CN', null, { timeout: 10000 });
await capture(page, '08-language-zh-chrome', 'Language switch updates html lang and localized chrome; source identifiers remain literal.');

await page.getByRole('button', { name: /来源账本|SOURCE LEDGER/ }).click();
await page.waitForTimeout(1000);
await capture(page, '09-source-ledger-zh', 'Source Ledger reachable from menu; flat source row and state actions visible in zh runtime.');

await clickIfVisible(page.getByRole('button', { name: /抓取来源 Hacker News|Fetch source Hacker News/i }), 'per-source fetch');
await page.waitForTimeout(2500);
await capture(page, '10-source-ledger-after-fetch', 'Per-source fetch button interaction completed or reported inline status without jobs/dashboard.');

const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
await clickIfVisible(page.getByRole('button', { name: /EXPORT STATE|导出状态|\[EXPORT STATE\]|\[导出状态\]/i }), 'export state');
const download = await downloadPromise;
if (download) {
  await download.saveAs(artifact('state-export-from-ui.json'));
  events.push({ name: 'download:state-export', suggestedFilename: download.suggestedFilename() });
}
await capture(page, '11-state-export-interaction', 'State export action invoked from Source Ledger utility surface.');

await page.locator('summary.surface-nav-label').click();
await page.getByRole('button', { name: /今日|TODAY/ }).click();
await page.waitForTimeout(1000);
await page.locator('#steer-input').fill('/doctor');
await page.getByRole('button', { name: 'apply', exact: true }).click();
await page.waitForSelector('text=doctor:', { timeout: 10000 });
await capture(page, '12-doctor-from-steer', 'Steer /doctor command renders raw diagnostics text.');

await page.locator('#steer-input').fill('search Markdown');
await page.getByRole('button', { name: 'apply', exact: true }).click();
await Promise.race([
  page.waitForSelector('text=SEARCH', { timeout: 10000 }),
  page.waitForSelector('text=搜索', { timeout: 10000 })
]).catch(async () => { await page.waitForTimeout(1500); });
await capture(page, '13-search-from-steer', 'Steer search command opens lexical search surface with result/provenance list.');
await clickIfVisible(page.getByRole('button', { name: /Inspect search result|检查搜索结果/ }), 'inspect search result');
await page.waitForTimeout(1000);
await capture(page, '14-search-result-inspector', 'Search result selection keeps search slice visible and updates Inspector on desktop.');

await saveJSON('runtime-walkthrough-events.json', events);
await saveJSON('runtime-console-messages.json', consoleMessages);
await saveJSON('runtime-failed-requests.json', failedRequests);
await saveJSON('runtime-api-responses.json', responses);
await browser.close();
