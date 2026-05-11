import type { Page } from 'playwright/test';

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

const ownerTokenStorageKey = 'resofeed.ownerToken';
const acceptedOwnerToken = 'rfeed_source_ledger_contract_owner_token_000000000000000000';
const forbiddenPrimaryCopy = /\b(accounts?|profile|password reset|folders?|tags?|source hierarchy|settings dashboards?|settings|onboarding wizard|mascot|SaaS|AI[- ]?magic|unread|mark all read|archive)\b/i;

const fixtureSource = {
  id: 'source-ledger-nav-fixture',
  url: 'https://example.test/feed.xml',
  title: 'Contract Fixture Source',
  last_fetch_at: '2026-05-11T08:09:10Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
} as const;

async function installAcceptedOwnerFixtureApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: acceptedOwnerToken }
  );

  await page.route('**/api/sources', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sources: [fixtureSource] })
    });
  });
  await page.route('**/api/feed/today', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.route('**/api/steer/active', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rules: [] }) });
  });
  await page.route('**/api/state/export', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-11T08:09:10Z', sources: [], steer_rules: [], resonated_items: [] })
    });
  });
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
  await expect(ledgerSurface.getByRole('list')).toContainText('src: Contract Fixture Source · status: ok · last_fetch: 08:09:10');
  await expect(ledgerSurface.getByText('url: https://example.test/feed.xml')).toBeVisible();
  await expect(ledgerSurface.getByRole('button', { name: '[RUN INGEST]' })).toBeVisible();
  await expect(ledgerSurface.getByLabel('import OPML')).toBeAttached();
  await expect(ledgerSurface.getByRole('button', { name: 'Fetch Contract Fixture Source' })).toHaveText('[FETCH]');
  await expect(ledgerSurface.getByRole('button', { name: 'Delete source: Contract Fixture Source' })).toHaveText('[DELETE]');
}

test.describe('source-ledger-navigation-regression expected-red contract', () => {
  test('root app chrome exposes a visible keyboard-reachable SOURCE LEDGER entry after owner-token acceptance', async ({ page }) => {
    await installAcceptedOwnerFixtureApi(page);
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

    const chrome = page.locator('nav.surface-nav');
    await expect(chrome, 'SOURCE LEDGER must be an app-chrome navigation entry, not only a Steer command').toBeVisible();
    const ledgerEntry = chrome.getByRole('button', { name: 'SOURCE LEDGER' });
    await expect(ledgerEntry).toBeVisible();
    await expect(ledgerEntry).toBeEnabled();

    for (let i = 0; i < 12; i += 1) {
      if (await ledgerEntry.evaluate((element) => element === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    await expect(ledgerEntry, 'SOURCE LEDGER nav must be reachable by keyboard tab order').toBeFocused();
  });

  test('clicking SOURCE LEDGER opens the documented flat ledger surface without forbidden source-management concepts', async ({ page }) => {
    await installAcceptedOwnerFixtureApi(page);
    await page.goto('/');

    await page.locator('nav.surface-nav').getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await expectCanonicalLedgerSurface(page);

    const shellText = await visibleText(page);
    expect(shellText, 'primary visible copy must stay operational and avoid forbidden source-management/SaaS concepts').not.toMatch(forbiddenPrimaryCopy);
    await expect(page.getByText('RESOFEED')).toBeVisible();
    await expect(page.getByRole('button', { name: 'TODAY' })).toBeVisible();
    await expect(page.getByLabel('INSPECTOR')).toBeAttached();
  });

  for (const pathName of ['/source-ledger', '/source', '/sources'] as const) {
    test(`direct navigation to ${pathName} opens SOURCE LEDGER after token acceptance`, async ({ page }) => {
      await installAcceptedOwnerFixtureApi(page);
      await page.goto(pathName);

      await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
      await expectCanonicalLedgerSurface(page);
    });
  }
});
