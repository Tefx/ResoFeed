import { createRequire } from 'node:module';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = require('playwright');

const [baseURL, ownerToken, outDir] = process.argv.slice(2);
if (!baseURL || !ownerToken || !outDir) {
  console.error('usage: node ui_probe.mjs <base-url> <owner-token> <out-dir>');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

await page.goto(baseURL, { waitUntil: 'networkidle' });
const tokenText = await page.locator('body').innerText();
if (!tokenText.includes('Enter owner token')) {
  throw new Error(`owner token prompt not rendered; body=${tokenText.slice(0, 500)}`);
}
await page.screenshot({ path: `${outDir}/audit-owner-token-prompt.png`, fullPage: true });

await page.evaluate((token) => localStorage.setItem('resofeed.ownerToken', token), ownerToken);
await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.waitForTimeout(750);
const feedText = await page.locator('body').innerText();
for (const expected of ['RESOFEED', 'SQLite runtime proof item']) {
  if (!feedText.includes(expected)) {
    throw new Error(`feed surface missing ${expected}; body=${feedText.slice(0, 1200)}`);
  }
}
await page.screenshot({ path: `${outDir}/audit-seeded-feed.png`, fullPage: true });
console.log(JSON.stringify({ ok: true, tokenPrompt: true, seededFeed: true, screenshots: [`${outDir}/audit-owner-token-prompt.png`, `${outDir}/audit-seeded-feed.png`] }));
await browser.close();
