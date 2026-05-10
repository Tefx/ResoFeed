import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const worktree = path.resolve(artifactDir, '../../..');
const webRoot = path.join(worktree, 'web');
const require = createRequire(path.join(webRoot, 'package.json'));
const { chromium } = require('playwright');
const { createServer } = await import(path.join(webRoot, 'node_modules/vite/dist/node/index.js'));
const { svelte } = await import(path.join(webRoot, 'node_modules/@sveltejs/vite-plugin-svelte/src/index.js'));
const harnessPath = path.join(artifactDir, 'source-ledger-visual-harness.html');
const previewPath = path.join(worktree, 'docs/ui-preview.html');

process.chdir(webRoot);
await mkdir(path.join(artifactDir, 'screenshots'), { recursive: true });

const server = await createServer({
  root: webRoot,
  configFile: false,
  plugins: [svelte()],
  resolve: { alias: { $lib: path.join(webRoot, 'src/lib') }, conditions: ['browser'] },
  server: { host: '127.0.0.1', port: 5190, strictPort: true, fs: { allow: [worktree, webRoot, artifactDir] } },
  logLevel: 'error'
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
const output = [];

function compactStyle(el) {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    text: el.textContent?.trim() ?? '',
    display: cs.display,
    gridTemplateColumns: cs.gridTemplateColumns,
    columnGap: cs.columnGap,
    rowGap: cs.rowGap,
    width: `${Math.round(rect.width * 100) / 100}px`,
    height: `${Math.round(rect.height * 100) / 100}px`,
    minHeight: cs.minHeight,
    padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
    borderTop: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
    borderRight: `${cs.borderRightWidth} ${cs.borderRightStyle} ${cs.borderRightColor}`,
    borderBottom: `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`,
    borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftStyle} ${cs.borderLeftColor}`,
    borderRadius: cs.borderRadius,
    backgroundColor: cs.backgroundColor,
    color: cs.color,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    textTransform: cs.textTransform,
    boxShadow: cs.boxShadow,
    animationName: cs.animationName,
    transitionProperty: cs.transitionProperty,
    transitionDuration: cs.transitionDuration,
    overflow: cs.overflow,
    textOverflow: cs.textOverflow,
    whiteSpace: cs.whiteSpace,
    outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
    outlineOffset: cs.outlineOffset
  };
}

try {
  await page.goto(`http://127.0.0.1:5190/@fs/${harnessPath}`);
  await page.waitForLoadState('networkidle');
  if ((await page.locator('[data-audit-state="default"]').count()) === 0) {
    await writeFile(path.join(artifactDir, 'harness-load-failure.html'), await page.content());
    throw new Error('harness failed to load; wrote harness-load-failure.html');
  }
  for (const state of ['default', 'source-fetch-active', 'global-ingest-active', 'completion', 'error-conflict']) {
    const locator = page.locator(`[data-audit-state="${state}"]`);
    const file = `screenshots/impl-${state}.png`;
    await locator.screenshot({ path: path.join(artifactDir, file) });
    output.push({ state, file });
  }
  const hoverSection = page.locator('[data-audit-state="hover-focus"]');
  await hoverSection.getByRole('button', { name: '[RUN INGEST]' }).hover();
  await hoverSection.getByRole('button', { name: 'Fetch simonwillison.net/feed.xml' }).focus();
  await hoverSection.screenshot({ path: path.join(artifactDir, 'screenshots/impl-hover-focus.png') });
  output.push({ state: 'hover-focus', file: 'screenshots/impl-hover-focus.png' });

  const implementation = await page.evaluate((compactStyleText) => {
    const compact = eval(`(${compactStyleText})`);
    const section = document.querySelector('[data-audit-state="hover-focus"]');
    const all = (selector) => [...document.querySelectorAll(selector)];
    const inHover = (selector) => [...section.querySelectorAll(selector)];
    return {
      buttons: all('.manual-fetch-action').slice(0, 4).map(compact),
      hoverRunIngest: compact(section.querySelector('.manual-fetch-action')),
      focusedFetch: compact(inHover('.manual-fetch-action')[1]),
      rows: all('.source-ledger-row').slice(0, 3).map(compact),
      copyBlocks: all('.source-ledger-copy').slice(0, 3).map(compact),
      actionGroups: all('.source-ledger-actions').slice(0, 3).map(compact),
      deleteButtons: all('.source-ledger-delete').slice(0, 3).map(compact),
      footer: compact(document.querySelector('.source-ledger-footer')),
      footerText: document.querySelector('.source-ledger-footer')?.innerText,
      fileInput: compact(document.querySelector('.source-ledger-file')),
      list: compact(document.querySelector('.contract-list')),
      sourceLedger: compact(document.querySelector('.contract-source-ledger')),
      bodyText: document.body.innerText,
      spinners: document.querySelectorAll('[role="progressbar"], .spinner, [class*="spinner"]').length,
      gradients: [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).backgroundImage.includes('gradient')).length,
      shadows: [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).boxShadow !== 'none').length,
      animations: [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).animationName !== 'none').length
    };
  }, compactStyle.toString());

  await page.goto(`file://${previewPath}`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.ledger').screenshot({ path: path.join(artifactDir, 'screenshots/reference-ui-preview-ledger.png') });
  const reference = await page.evaluate((compactStyleText) => {
    const compact = eval(`(${compactStyleText})`);
    const all = (selector) => [...document.querySelectorAll(selector)];
    return {
      buttons: all('.ledger .manual-fetch-action').slice(0, 4).map(compact),
      rows: all('.ledger .ledger-row').slice(0, 3).map(compact),
      deleteButtons: all('.ledger .delete').slice(0, 3).map(compact),
      footer: compact(document.querySelector('.ledger > div[style]')),
      footerText: document.querySelector('.ledger > div[style]')?.innerText,
      ledger: compact(document.querySelector('.ledger')),
      bodyText: document.querySelector('.ledger')?.innerText,
      spinners: document.querySelectorAll('[role="progressbar"], .spinner, [class*="spinner"]').length,
      gradients: [...document.querySelectorAll('.ledger *')].filter((el) => getComputedStyle(el).backgroundImage.includes('gradient')).length,
      shadows: [...document.querySelectorAll('.ledger *')].filter((el) => getComputedStyle(el).boxShadow !== 'none').length,
      animations: [...document.querySelectorAll('.ledger *')].filter((el) => getComputedStyle(el).animationName !== 'none').length
    };
  }, compactStyle.toString());

  await writeFile(path.join(artifactDir, 'computed-style-retest.json'), JSON.stringify({ reference, implementation }, null, 2));
  await writeFile(path.join(artifactDir, 'rendered-artifacts.json'), JSON.stringify(output, null, 2));
} finally {
  await browser.close();
  await server.close();
}

console.log(JSON.stringify({ artifactDir, output }, null, 2));
