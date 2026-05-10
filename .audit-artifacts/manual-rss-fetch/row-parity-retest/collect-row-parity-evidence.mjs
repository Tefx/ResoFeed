import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const artifactDir = path.dirname(__filename);
const screenshotDir = path.join(artifactDir, 'screenshots');
const webDir = path.join(repoRoot, 'web');
const requireFromWeb = createRequire(path.join(webDir, 'package.json'));
const { chromium } = requireFromWeb('playwright');
const port = 5179;
const baseUrl = `http://127.0.0.1:${port}`;

await fs.mkdir(screenshotDir, { recursive: true });

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('vite server did not become ready')), 30000);
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes('Local:') || text.includes(`localhost:${port}`) || text.includes(`127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`vite exited early with code ${code}`));
      }
    });
  });
}

async function extractRows(page, selector) {
  return page.$$eval(selector, (rows) =>
    rows.map((row) => {
      const style = getComputedStyle(row);
      return {
        text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        columnGap: style.columnGap,
        rowGap: style.rowGap,
        width: style.width,
        minHeight: style.minHeight,
        borderTop: style.borderTop,
        directChildren: Array.from(row.children).map((child) => ({
          tag: child.tagName.toLowerCase(),
          className: child.getAttribute('class') ?? '',
          text: child.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          display: getComputedStyle(child).display,
          gridColumn: getComputedStyle(child).gridColumn
        }))
      };
    })
  );
}

async function extractButtons(page, selector) {
  return page.$$eval(selector, (buttons) =>
    buttons.map((button) => {
      const style = getComputedStyle(button);
      return {
        text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        disabled: button.disabled,
        width: style.width,
        height: style.height,
        minHeight: style.minHeight,
        padding: style.padding,
        border: style.border,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        boxShadow: style.boxShadow,
        animationName: style.animationName
      };
    })
  );
}

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: webDir,
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await waitForServer(server);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('resofeed.ownerToken', 'audit-token'));
  const impl = await context.newPage();

  const sources = [
    {
      id: 'src-1',
      title: 'simonwillison.net/feed.xml',
      url: 'https://simonwillison.net/atom/everything',
      last_fetch_status: 'ok',
      last_fetch_at: '2026-05-09T10:25:31Z'
    },
    {
      id: 'src-2',
      title: 'hn.algolia.com/rss',
      url: 'https://hn.algolia.com/rss',
      last_fetch_status: 'ok',
      last_fetch_at: '2026-05-09T10:25:31Z'
    },
    {
      id: 'src-3',
      title: 'blog.example/feed',
      url: 'https://blog.example/feed',
      last_fetch_status: 'rss_fetch_error',
      last_fetch_at: null
    }
  ];

  await impl.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/sources') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources }) });
    }
    if (url.pathname === '/api/feed/today') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    }
    if (url.pathname === '/api/steer/active') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules: [] }) });
    }
    if (url.pathname === '/api/sources/src-3/fetch') {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ completed: true, source_id: 'src-3', errors: [] })
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await impl.goto(baseUrl, { waitUntil: 'networkidle' });
  await impl.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await impl.locator('.source-ledger-row').first().waitFor();
  await impl.locator('.contract-source-ledger').screenshot({ path: path.join(screenshotDir, 'implementation-source-ledger.png') });

  const implRows = await extractRows(impl, '.source-ledger-row');
  const implButtons = await extractButtons(impl, '.manual-fetch-action');
  const implFooterText = await impl.locator('.source-ledger-footer').innerText();
  const negative = await impl.evaluate(() => ({
    spinnerCount: document.querySelectorAll('[role="progressbar"], .spinner, [class*="spinner"]').length,
    gradientCount: Array.from(document.querySelectorAll('*')).filter((el) => getComputedStyle(el).backgroundImage.includes('gradient')).length,
    shadowCount: Array.from(document.querySelectorAll('*')).filter((el) => getComputedStyle(el).boxShadow !== 'none').length,
    animationCount: Array.from(document.querySelectorAll('*')).filter((el) => getComputedStyle(el).animationName !== 'none').length
  }));

  const fetchPromise = impl.getByRole('button', { name: 'Fetch blog.example/feed' }).click();
  await impl.getByRole('button', { name: 'Fetching blog.example/feed' }).waitFor({ state: 'visible' });
  const busyText = await impl.getByRole('button', { name: 'Fetching blog.example/feed' }).innerText();
  const busyDisabled = await impl.getByRole('button', { name: 'Fetching blog.example/feed' }).isDisabled();
  await fetchPromise;

  const ref = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await ref.goto(pathToFileURL(path.join(repoRoot, 'docs/ui-preview.html')).href);
  await ref.locator('.ledger').screenshot({ path: path.join(screenshotDir, 'reference-source-ledger.png') });
  const refRows = await extractRows(ref, '.ledger-row');
  const refButtons = await extractButtons(ref, '.manual-fetch-action');

  const result = {
    generated_at: new Date().toISOString(),
    reference: { rows: refRows, buttons: refButtons },
    implementation: { rows: implRows, buttons: implButtons, footerText: implFooterText, busyText, busyDisabled },
    regressionChecks: { negative },
    screenshots: {
      reference: 'screenshots/reference-source-ledger.png',
      implementation: 'screenshots/implementation-source-ledger.png'
    }
  };

  await fs.writeFile(path.join(artifactDir, 'row-parity-runtime-evidence.json'), JSON.stringify(result, null, 2));
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
