import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';

const now = new Date();
const currentTimestamp = now.toISOString();

const canonicalSource = {
  id: 'src_regression_canonical',
  url: 'https://canonical.example.test/feed.xml',
  title: 'Canonical Allowed Source',
  last_fetch_at: currentTimestamp,
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
} as const;

const diagnosticItem = {
  id: 'item_regression_diagnostic',
  source_id: canonicalSource.id,
  source_title: canonicalSource.title,
  url: 'https://canonical.example.test/diagnostic-row',
  title: 'Diagnostic row metadata must stay compact',
  summary: null,
  core_insight: null,
  display_excerpt: null,
  value_tier: null,
  published_at: currentTimestamp,
  first_seen_at: currentTimestamp,
  extraction_status: 'partial_extraction',
  model_status: 'model_latency_error',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: 'story-regression-diagnostic',
  duplicate_of_item_id: null
} as const;

const cleanItem = {
  id: 'item_regression_clean',
  source_id: canonicalSource.id,
  source_title: canonicalSource.title,
  url: 'https://canonical.example.test/clean-row',
  title: 'Clean search containment item',
  summary: 'Readable source-backed summary for search containment.',
  core_insight: 'Readable core insight.',
  display_excerpt: 'Readable source-backed summary for search containment.',
  value_tier: 'high',
  published_at: currentTimestamp,
  first_seen_at: currentTimestamp,
  extraction_status: 'full',
  model_status: 'ok',
  is_resonated: true,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: 'story-regression-clean',
  duplicate_of_item_id: null
} as const;

const items = [diagnosticItem, cleanItem] as const;

async function installRegressionFixtureApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [canonicalSource] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') {
      return route.fulfill({
        json: {
          items,
          query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: 50 }
        }
      });
    }
    if (url.pathname === '/api/doctor') {
      return route.fulfill({
        contentType: 'text/plain; charset=utf-8',
        body: 'rss: ok\nopenrouter: configured_model account_default\nextraction: model latency for item_regression_diagnostic'
      });
    }
    if (url.pathname.startsWith('/api/items/')) {
      const matched = items.find((item) => url.pathname.includes(item.id)) ?? diagnosticItem;
      return route.fulfill({
        json: {
          item: {
            ...matched,
            feed_excerpt: matched.display_excerpt,
            extracted_text: matched.display_excerpt ?? 'Primary article text remains readable even when model diagnostics exist.',
            provenance: {
              source_url: canonicalSource.url,
              canonical_url: matched.url,
              original_url: matched.url,
              story_key: matched.story_key,
              duplicate_of_item_id: null
            }
          }
        }
      });
    }
    if (url.pathname.endsWith('/resonance')) return route.fulfill({ json: { item_id: cleanItem.id, is_resonated: false, already_applied: false } });
    if (url.pathname.endsWith('/inspect')) return route.fulfill({ json: { item_id: cleanItem.id, human_inspected_at: currentTimestamp, already_applied: false } });
    if (url.pathname === '/api/state/export') {
      return route.fulfill({
        json: {
          schema_version: 'resofeed.state.v1',
          exported_at: currentTimestamp,
          sources: [{ id: canonicalSource.id, url: canonicalSource.url, title: canonicalSource.title }],
          steer_rules: [],
          resonated_items: []
        }
      });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openShell(page: Page, ownerToken: string): Promise<void> {
  await installRegressionFixtureApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function visibleText(locator: Locator): Promise<string> {
  return locator.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chunks: string[] = [];
    let current = walker.nextNode();
    while (current) {
      const parent = current.parentElement;
      if (parent) {
        const style = window.getComputedStyle(parent);
        if (style.display !== 'none' && style.visibility !== 'hidden' && parent.getClientRects().length > 0) {
          chunks.push(current.textContent ?? '');
        }
      }
      current = walker.nextNode();
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
  });
}

async function openSurfaceMenu(page: Page): Promise<Locator> {
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  await menu.locator('summary').click();
  return menu;
}

async function assertTodayExcludedFromA11yFlow(page: Page): Promise<void> {
  const feedPane = page.locator('#today-feed');
  await expect(feedPane, 'inactive Today feed must be hidden from accessibility APIs').toHaveAttribute('aria-hidden', 'true');
  await expect(feedPane, 'inactive Today feed must be inert so feed controls are skipped').toHaveAttribute('inert', '');
  await expect(page.getByRole('list', { name: 'Today feed items' }), 'inactive Today feed list must not remain visible').not.toBeVisible();
}

async function saveRenderedLedgerProof(page: Page, testInfo: TestInfo): Promise<void> {
  const outDir = path.join(testInfo.outputDir, 'source-ledger-reg-01-proof');
  fs.mkdirSync(outDir, { recursive: true });
  const ledgerSurface = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]');
  const screenshotPath = path.join(outDir, 'source-ledger-forbidden-controls-absent.png');
  const domPath = path.join(outDir, 'source-ledger-forbidden-controls-absent.dom.txt');
  await ledgerSurface.screenshot({ path: screenshotPath });
  await fs.promises.writeFile(domPath, await ledgerSurface.evaluate((node) => node.outerHTML), 'utf8');
  await testInfo.attach('source-ledger-forbidden-controls-absent.png', { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach('source-ledger-forbidden-controls-absent.dom.txt', { path: domPath, contentType: 'text/plain' });
}

test.describe('regression audit UI expected-red coverage', () => {
  test('REG-01 Source Ledger boundary guard allows canonical ledger grammar but forbids run/fetch/manual-ingest controls', async ({ page, ownerToken }, testInfo) => {
    await openShell(page, ownerToken);

    const menu = await openSurfaceMenu(page);
    await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    const ledgerSurface = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]');

    await expect(ledgerSurface).toHaveClass(/active-panel/);
    await expect(ledgerSurface.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await expect(ledgerSurface.getByText('src: Canonical Allowed Source · status: ok · last_fetch:', { exact: false })).toBeVisible();
    await expect(ledgerSurface.locator('.source-ledger__url', { hasText: `url: ${canonicalSource.url}` })).toBeVisible();
    await expect(ledgerSurface.getByRole('button', { name: 'Delete source: Canonical Allowed Source' })).toBeVisible();
    await expect(ledgerSurface.getByRole('button', { name: '[IMPORT OPML]' })).toBeVisible();
    await expect(ledgerSurface.locator('#opml-file')).toBeAttached();

    // docs/DESIGN.md Source Ledger lines 573-591 and docs/UI_REGRESSION_CONTRACT.md lines 36-37 require lightweight manual controls.
    await expect(ledgerSurface.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
    await expect(ledgerSurface.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
    await saveRenderedLedgerProof(page, testInfo);
  });

  test('REG-03 Search renders exactly one visible submit control in desktop and mobile retrieval states', async ({ page, ownerToken }) => {
    await openShell(page, ownerToken);

    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search compact metadata');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.locator('.shell-grid[data-surface="search"]')).toBeVisible();
    await expect(page.locator('.feed-pane.active-panel[aria-label="Search surface independent scroll"]')).toBeVisible();

    const desktopSubmitControls = page.locator('.contract-search-form button[type="submit"]:visible');
    await expect(desktopSubmitControls, 'desktop Search must expose exactly one visible submit control').toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileSubmitControls = page.locator('.contract-search-form button[type="submit"]:visible');
    await expect(mobileSubmitControls, 'mobile Search must expose exactly one visible submit control').toHaveCount(1);
  });

  test('REG-05 mobile utility routes hide inactive Today feed and remove feed controls from the a11y flow', async ({ page, ownerToken }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openShell(page, ownerToken);

    let menu = await openSurfaceMenu(page);
    await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await assertTodayExcludedFromA11yFlow(page);

    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill('search containment');
    await steer.press('Enter');
    await expect(page.locator('.utility-surface[aria-label="Search surface"]')).toHaveClass(/active-panel/);
    await assertTodayExcludedFromA11yFlow(page);

    await steer.fill('/doctor');
    await steer.press('Enter');
    await expect(page.locator('.doctor-surface')).toHaveClass(/active-panel/);
    await assertTodayExcludedFromA11yFlow(page);
  });

  test('REG-07 Search receipts are scoped away when navigating to Source Ledger, Today, or /doctor', async ({ page, ownerToken }) => {
    await openShell(page, ownerToken);

    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search receipt scope');
    await page.getByRole('button', { name: 'apply' }).click();
    const searchReceipt = page.getByRole('status').filter({ hasText: 'retrieval: lexical search' });
    await expect(searchReceipt).toBeVisible();

    let menu = await openSurfaceMenu(page);
    await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await expect(searchReceipt, 'Search receipt must not remain visible on Source Ledger').toHaveCount(0);

    menu = await openSurfaceMenu(page);
    await menu.getByRole('button', { name: 'TODAY' }).click();
    await expect(searchReceipt, 'Search receipt must not remain visible after returning to Today').toHaveCount(0);

    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('/doctor');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(searchReceipt, 'Search receipt must not remain visible on /doctor').toHaveCount(0);
  });

  test('REG-08 feed row metadata stays compact and does not repeat raw diagnostic model strings', async ({ page, ownerToken }) => {
    await openShell(page, ownerToken);

    const row = page.locator('.contract-feed-item').filter({ hasText: diagnosticItem.title });
    await expect(row).toBeVisible();
    const rowText = await visibleText(row);
    expect(rowText, 'feed row metadata should not foreground raw model_status enum names').not.toMatch(/model_status|model_latency_error/i);
    expect(rowText.match(/fallback/gi) ?? [], 'feed row should not repeat fallback diagnostics across metadata fields').toHaveLength(1);
    expect(rowText.match(/summary unavailable/gi) ?? [], 'feed row should not repeat summary-unavailable diagnostics').toHaveLength(1);
  });

  test('REG-09 Inspector primary header/body copy does not foreground raw model_status', async ({ page, ownerToken }) => {
    await openShell(page, ownerToken);

    await page.getByRole('button', { name: `Open Inspector for: ${diagnosticItem.title}` }).click();
    const inspector = page.locator('.contract-inspector');
    await expect(inspector.getByRole('heading', { name: diagnosticItem.title })).toBeVisible();

    const inspectorText = await visibleText(inspector);
    expect(inspectorText, 'Inspector primary visible copy should translate model status instead of foregrounding raw enum fields').not.toMatch(/model_status|model_latency_error/i);
  });
});
