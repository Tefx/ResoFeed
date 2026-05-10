import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const worktree = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const webRoot = path.join(worktree, 'web');
const require = createRequire(path.join(webRoot, 'package.json'));
const { chromium } = require('playwright');
const { createServer } = await import(path.join(webRoot, 'node_modules/vite/dist/node/index.js'));
const { svelte } = await import(path.join(webRoot, 'node_modules/@sveltejs/vite-plugin-svelte/src/index.js'));
const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(artifactDir, 'source-ledger-visual-harness.html');
const previewPath = path.join(worktree, 'docs/ui-preview.html');

process.chdir(webRoot);
await mkdir(path.join(artifactDir, 'screenshots'), { recursive: true });

const server = await createServer({
  root: webRoot,
  configFile: false,
  plugins: [svelte()],
  resolve: { alias: { $lib: path.join(webRoot, 'src/lib') }, conditions: ['browser'] },
  server: { host: '127.0.0.1', port: 5189, strictPort: true, fs: { allow: [worktree, webRoot, artifactDir] } },
  logLevel: 'error'
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
const output = [];

try {
  await page.goto(`http://127.0.0.1:5189/@fs/${harnessPath}`);
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

  const metrics = await page.evaluate(() => {
    const section = document.querySelector('[data-audit-state="hover-focus"]');
    const run = section?.querySelector('.manual-fetch-action');
    const buttons = [...document.querySelectorAll('.manual-fetch-action')];
    const rows = [...document.querySelectorAll('.source-ledger-row')];
    return {
      runIngest: run ? getComputedStyle(run).cssText : null,
      buttonStyles: buttons.slice(0, 4).map((button) => {
        const cs = getComputedStyle(button);
        return {
          text: button.textContent,
          padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          minHeight: cs.minHeight,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          animationName: cs.animationName,
          transitionProperty: cs.transitionProperty,
          textTransform: cs.textTransform,
          letterSpacing: cs.letterSpacing,
          backgroundColor: cs.backgroundColor,
          color: cs.color
        };
      }),
      rows: rows.slice(0, 3).map((row) => {
        const cs = getComputedStyle(row);
        return { minHeight: cs.minHeight, padding: `${cs.paddingTop} ${cs.paddingBottom}`, display: cs.display, borderTop: cs.borderTopWidth };
      })
    };
  });
  await writeFile(path.join(artifactDir, 'implementation-computed-style.json'), JSON.stringify(metrics, null, 2));

  await page.goto(`file://${previewPath}`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.ledger').screenshot({ path: path.join(artifactDir, 'screenshots/reference-ui-preview-ledger.png') });
  await writeFile(path.join(artifactDir, 'rendered-artifacts.json'), JSON.stringify(output, null, 2));
} finally {
  await browser.close();
  await server.close();
}

console.log(JSON.stringify({ artifactDir, output }, null, 2));
