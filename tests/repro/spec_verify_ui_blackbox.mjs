/* Black-box UI acceptance smoke using documented URL and visible text only. */
import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const artifacts = path.join(root, '.audit-artifacts', 'end_to_end_blackbox');
const token = 'rfeed_blackbox_owner_token_0123456789ABCDEFG';

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitReady(base, proc) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) return false;
    try {
      const response = await fetch(base + '/');
      if (response.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function record(failures, condition, message) {
  if (!condition) failures.push(message);
}

await mkdir(artifacts, { recursive: true });
const failures = [];
const observations = {};
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const dbdir = mkdtempSync(path.join(artifacts, 'ui-db-'));
const cmd = [path.join(root, 'bin', 'resofeed'), 'serve', '--addr', `127.0.0.1:${port}`, '--public-url', base, '--db', path.join(dbdir, 'resofeed.sqlite3'), '--gemini-api-key', 'blackbox-fake-gemini-key', '--gemini-model', 'gemini-2.5-flash', '--owner-token', token];
observations.serve_command = cmd.join(' ');
const proc = spawn(cmd[0], cmd.slice(1), { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
proc.stdout.on('data', (d) => { stdout += d.toString(); });
proc.stderr.on('data', (d) => { stderr += d.toString(); });

let browser;
try {
  const ready = await waitReady(base, proc);
  observations.server_ready = ready;
  record(failures, ready, 'server was not ready for UI smoke');
  if (ready) {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(artifacts, 'ui-owner-token-prompt.png'), fullPage: true });
    const promptText = await page.locator('body').innerText();
    writeFileSync(path.join(artifacts, 'ui-owner-token-prompt.txt'), promptText);
    record(failures, promptText.includes('Enter owner token'), 'owner-token prompt missing in browser-rendered UI');

    await page.getByRole('textbox', { name: /^Owner token$/i }).fill(token);
    await page.getByRole('button', { name: /submit/i }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifacts, 'ui-first-use-empty.png'), fullPage: true });
    const firstUseText = await page.locator('body').innerText();
    writeFileSync(path.join(artifacts, 'ui-first-use-empty.txt'), firstUseText);
    observations.first_use_text_head = firstUseText.slice(0, 1000);
    for (const expected of ['Paste RSS URL in Steer or import OPML.', 'Inspect opens the item.', 'Star preserves durable value.', 'Steer is optional correction.']) {
      record(failures, firstUseText.includes(expected), `first-use empty state missing: ${expected}`);
    }

    const ledger = page.getByText(/SOURCE LEDGER/i).first();
    if (await ledger.count()) {
      await ledger.click();
      await page.waitForTimeout(500);
      const ledgerText = await page.locator('body').innerText();
      writeFileSync(path.join(artifacts, 'ui-source-ledger.txt'), ledgerText);
      observations.ledger_text_head = ledgerText.slice(0, 1000);
      record(failures, ledgerText.includes('export state'), 'Source Ledger missing export state action');
      record(failures, ledgerText.includes('import state'), 'Source Ledger missing import state action');
      if (ledgerText.includes('import state')) {
        await page.getByRole('link', { name: 'import state' }).click();
        await page.waitForTimeout(500);
      }
      const stateNav = page.getByText(/^STATE$/).first();
      if (await stateNav.count()) {
        await stateNav.click();
        await page.waitForTimeout(500);
      }
      const importText = await page.locator('body').innerText();
      writeFileSync(path.join(artifacts, 'ui-state-import-warning.txt'), importText);
      record(failures, importText.includes('import replaces active sources, rules, and stars'), 'state portability warning text missing after invoking import state');
      await page.screenshot({ path: path.join(artifacts, 'ui-source-ledger-state-portability.png'), fullPage: true });
    } else {
      failures.push('SOURCE LEDGER control not found after owner-token acceptance');
    }
  }
} catch (error) {
  failures.push(`UI smoke crashed: ${error?.message || error}`);
} finally {
  if (browser) await browser.close();
  proc.kill('SIGTERM');
  writeFileSync(path.join(artifacts, 'ui-server.stdout.log'), stdout);
  writeFileSync(path.join(artifacts, 'ui-server.stderr.log'), stderr);
}

const report = { status: failures.length ? 'FAIL' : 'PASS', failures, observations };
writeFileSync(path.join(artifacts, 'ui-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
