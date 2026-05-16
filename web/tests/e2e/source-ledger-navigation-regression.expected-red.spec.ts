import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

/*
Acceptance matrix pinned by this expected-red contract:

- root chrome visible SOURCE LEDGER nav: DESIGN.md lines 365-369 allow an optional Source Ledger
  route/overlay in the app shell; DESIGN.md lines 505-521 require terse canonical product labels and
  keyboard navigation for every action; ARCHITECTURE.md lines 904-924 require web/ to preserve DESIGN.md
  and expose flat Source Ledger without extra dashboards.
- click activation opens ledger: DESIGN.md lines 463-476 define SOURCE LEDGER heading, flat source rows,
  deletion, OPML import, and forbidden source-management concepts; ARCHITECTURE.md lines 916-924 forbid
  folders/tags/settings-dashboard source management.
- direct /source-ledger opens ledger: DESIGN.md lines 365-369 explicitly allow a Source Ledger
  route/overlay; /source-ledger is the canonical route slug for that surface in this contract.
- /source and /sources compatibility aliases: user-reported regression path says /source, /sources, and
  /source-ledger do not open the ledger. No authoritative doc names /source or /sources; preserve them as
  compatibility aliases unless gate review rejects alias scope.
- copy and concepts: DESIGN.md lines 263 and 521 require RESOFEED, TODAY, SOURCE LEDGER, INSPECTOR, /doctor
  labels; DESIGN.md lines 474 and 525-534 plus ARCHITECTURE.md lines 920-924 forbid folders/tags/settings
  dashboards and friendly SaaS/onboarding drift.
*/

const forbiddenPrimaryCopy = /\b(accounts?|profile|password reset|folders?|tags?|source hierarchy|settings dashboards?|settings|onboarding wizard|mascot|SaaS|AI[- ]?magic|unread|mark all read|archive)\b/i;

test.use({ trace: 'on', screenshot: 'on' });

async function acceptOwnerTokenAt(page: Page, absoluteURL: string, ownerToken: string): Promise<void> {
  await page.goto(absoluteURL);
  const tokenInput = page.locator('#owner-token-input');
  if (await tokenInput.isVisible()) {
    await tokenInput.fill(ownerToken);
    await page.getByRole('button', { name: 'submit' }).click();
  }
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function captureLedgerRegressionScreenshot(page: Page, testInfo: TestInfo, label: string): Promise<string> {
  const screenshotPath = testInfo.outputPath(`${label}-source-ledger-regression.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function expectUnobstructedHitTarget(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} must be visible before hit-target probing`).toBeVisible();
  const obstruction = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    const style = window.getComputedStyle(element);
    return {
      area: rect.width * rect.height,
      disabled: element instanceof HTMLButtonElement ? element.disabled : false,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      allowedTopElement: top === element || Boolean(top && element.contains(top)),
      topTag: top?.tagName ?? null,
      topText: top?.textContent?.trim().slice(0, 120) ?? null
    };
  });

  expect(obstruction, `${label} obstruction probe`).toMatchObject({
    disabled: false,
    pointerEvents: 'auto',
    visibility: 'visible',
    allowedTopElement: true
  });
  expect(obstruction.area, `${label} must have non-zero clickable area`).toBeGreaterThan(0);
}

async function visibleText(page: Page): Promise<string> {
  return page.locator('main.contract-shell').evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chunks: string[] = [];
    let current = walker.nextNode();
    while (current) {
      const parent = current.parentElement;
      if (parent) {
        const style = window.getComputedStyle(parent);
        const rects = parent.getClientRects();
        if (style.display !== 'none' && style.visibility !== 'hidden' && rects.length > 0) {
          chunks.push(current.textContent ?? '');
        }
      }
      current = walker.nextNode();
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
  });
}

async function expectCanonicalLedgerSurface(page: Page): Promise<void> {
  const ledgerSurface = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]');
  await expect(ledgerSurface).toHaveClass(/active-panel/);
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await expect(ledgerSurface.getByRole('button', { name: '[RUN INGEST]' })).toBeVisible();
  await expect(ledgerSurface.getByRole('button', { name: '[IMPORT OPML]' })).toBeVisible();
  await expect(ledgerSurface.locator('#opml-file')).toBeAttached();
}

test.describe('source-ledger-navigation-regression expected-red contract', () => {
  test('root app chrome exposes a visible keyboard-reachable unobstructed SOURCE LEDGER entry after owner-token acceptance', async ({ page, runInfo, ownerToken }, testInfo) => {
    await acceptOwnerTokenAt(page, `${runInfo.baseURL}/`, ownerToken);
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
    await captureLedgerRegressionScreenshot(page, testInfo, 'root-after-owner-token');

    const chrome = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
    await expect(chrome, 'SOURCE LEDGER must be reachable through the RESOFEED utility menu, not only a Steer command').toBeVisible();
    await chrome.locator('summary').click();
    const ledgerEntry = chrome.getByRole('button', { name: 'SOURCE LEDGER' });
    await expect(ledgerEntry).toBeVisible();
    await expect(ledgerEntry).toBeEnabled();
    await expectUnobstructedHitTarget(ledgerEntry, 'SOURCE LEDGER nav');

    for (let i = 0; i < 12; i += 1) {
      if (await ledgerEntry.evaluate((element) => element === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    await expect(ledgerEntry, 'SOURCE LEDGER nav must be reachable by keyboard tab order').toBeFocused();
  });

  test('clicking SOURCE LEDGER opens the documented flat ledger surface without forbidden source-management concepts', async ({ page, runInfo, ownerToken }, testInfo) => {
    await acceptOwnerTokenAt(page, `${runInfo.baseURL}/`, ownerToken);
    await captureLedgerRegressionScreenshot(page, testInfo, 'before-source-ledger-click');

    const chrome = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
    await chrome.locator('summary').click();
    await chrome.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await expectCanonicalLedgerSurface(page);

    const shellText = await visibleText(page);
    expect(shellText, 'primary visible copy must stay operational and avoid forbidden source-management/SaaS concepts').not.toMatch(forbiddenPrimaryCopy);
    await expect(page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary')).toHaveText('RESOFEED');
    await chrome.locator('summary').click();
    await expect(chrome.getByRole('button', { name: 'TODAY' })).toBeVisible();
    await expect(page.getByLabel('INSPECTOR')).toBeAttached();
  });

  for (const pathName of ['/source-ledger', '/source', '/sources'] as const) {
    test(`direct navigation to ${pathName} opens SOURCE LEDGER after token acceptance`, async ({ page, runInfo, ownerToken }, testInfo) => {
      await acceptOwnerTokenAt(page, `${runInfo.baseURL}${pathName}`, ownerToken);
      await captureLedgerRegressionScreenshot(page, testInfo, `direct-${pathName.replaceAll('/', '') || 'root'}`);

      await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
      await expectCanonicalLedgerSurface(page);
    });
  }
});
