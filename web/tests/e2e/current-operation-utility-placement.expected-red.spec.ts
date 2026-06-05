import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type ItemSummary = {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly value_tier: string | null;
  readonly published_at: string | null;
  readonly first_seen_at: string | null;
  readonly extraction_status: 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
  readonly model_status: 'ok' | 'summary_unavailable' | 'model_latency_error';
  readonly is_resonated: boolean;
  readonly human_inspected_at: string | null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
};

type Source = {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly last_fetch_at: string | null;
  readonly last_fetch_status: 'ok' | 'rss_fetch_error';
  readonly last_fetch_error?: string | null;
  readonly is_active: boolean;
  readonly revision: number;
};

const source: Source = {
  id: 'src_operation_utility_contract',
  url: 'https://feeds.example.test/operation-utility.xml',
  title: 'Operation Utility Fixture',
  last_fetch_at: '2026-05-17T11:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const items: ItemSummary[] = [
  {
    id: 'item_operation_utility_contract',
    source_id: source.id,
    source_title: source.title,
    url: 'https://news.example.test/operation-utility-contract',
    title: 'Operation utility rendered contract item',
    summary: 'Rendered fixture summary for operation utility placement.',
    core_insight: 'Operation utility status must be contextual, not a global idle strip.',
    value_tier: 'high',
    published_at: '2026-05-17T10:00:00Z',
    first_seen_at: '2026-05-17T10:05:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'operation-utility-contract',
    duplicate_of_item_id: null
  }
];

function runningOperation() {
  return {
    running: true,
    kind: 'library_reprocess',
    actor_kind: 'human',
    phase: 'processing_items',
    count: { current: 2, total: 5 },
    message: 'library reprocess processing item',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:05Z'
  };
}

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function installApiFixtures(
  page: Page,
  ownerToken: string,
  options: { readonly holdIngest?: Promise<void>; readonly ingestConflict?: boolean } = {}
): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/sources') {
      await fulfillJson(route, { sources: [source] });
      return;
    }
    if (path === '/api/feed/today') {
      await fulfillJson(route, { items });
      return;
    }
    if (path === '/api/runtime/language') {
      await fulfillJson(route, { language: { code: 'en', label: 'English' } });
      return;
    }
    if (path === '/api/runtime/operation') {
      await fulfillJson(route, { operation: { running: false, kind: null, scope: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
      return;
    }
    if (path === '/api/steer/active') {
      await fulfillJson(route, { rules: [] });
      return;
    }
    if (path === '/api/ingest' && request.method() === 'POST') {
      if (options.ingestConflict) {
        await fulfillJson(route, {
          error: {
            code: 'conflict',
            message: 'ingest already running',
            details: {
              operation_running: true,
              operation: 'library_reprocess',
              actor_kind: 'human',
              retry_allowed: true,
              current_operation: runningOperation()
            }
          }
        }, 409);
        return;
      }
      if (options.holdIngest) await options.holdIngest;
      await fulfillJson(route, {
        operation: 'ingest',
        source_id: null,
        completed: true,
        sources_total: 1,
        sources_fetched: 1,
        items_discovered: 1,
        items_upserted: 1,
        completed_at: '2026-05-17T11:01:00Z',
        errors: []
      });
      return;
    }

    await fulfillJson(route, { error: { code: 'not_found', message: `not found: ${path}`, details: {} } }, 404);
  });
}

async function shellReady(page: Page): Promise<void> {
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'RESOFEED' })).toBeVisible();
}

async function openSurfaceMenu(page: Page) {
  const menu = page.locator('details[aria-label="RESOFEED surface menu"]');
  await menu.locator('summary', { hasText: 'RESOFEED' }).click();
  await expect(menu).toHaveAttribute('open', '');
  return menu;
}

async function attachRenderedEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'operation-utility-placement-evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(ariaPath, await page.locator('body').ariaSnapshot(), 'utf8');
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
}

test.describe('expected-red contextual operation and utility placement contracts', () => {
  test('DESIGN App Shell/Language/Reprocess: low-frequency utilities render only inside opened RESOFEED utility menu, not persistent top chrome', async ({ page, ownerToken }, testInfo) => {
    // Contract basis: docs/DESIGN.md App Shell says utility surfaces are reachable through the `RESOFEED` surface menu;
    // Language Control and Reprocess Library Action define terse LANG/[REPROCESS LIBRARY] utility controls with no settings dashboard.
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken);
    await page.goto('/');
    await shellReady(page);
    await attachRenderedEvidence(page, testInfo, 'idle-top-chrome-before-menu-open');

    const persistentTopChrome = page.locator('header.shell-command');
    await expect(persistentTopChrome.getByText('LANG: EN', { exact: true }), 'LANG must not be a prominent always-visible top chrome control while the RESOFEED menu is closed').not.toBeVisible();
    await expect(persistentTopChrome.getByText('[REPROCESS LIBRARY]', { exact: true }), '[REPROCESS LIBRARY] must not be a prominent always-visible top chrome action while the RESOFEED menu is closed').not.toBeVisible();
    await expect(persistentTopChrome.getByText(/current operation|last_ingest: not_run|idle/i), 'no persistent idle global status strip belongs in top chrome').not.toBeVisible();

    const menu = await openSurfaceMenu(page);
    await attachRenderedEvidence(page, testInfo, 'utility-menu-open-low-frequency-controls');
    await expect(menu.getByRole('button', { name: /processing language.*English.*set.*Chinese/i })).toBeVisible();
    await expect(menu.getByText('LANG: EN', { exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: /Reprocess existing library and rebuild search index/i })).toBeVisible();
    await expect(menu.getByText('[REPROCESS LIBRARY]', { exact: true })).toBeVisible();
  });

  test('DESIGN Source Ledger/App Shell: running operation status is contextual to Source Ledger and opened RESOFEED utility menu', async ({ page, ownerToken }, testInfo) => {
    // Contract basis: docs/DESIGN.md Source Ledger makes manual ingest status a Ledger concern;
    // App Shell permits opened RESOFEED utility surfaces, but forbids persistent status-dashboard chrome.
    let releaseIngest!: () => void;
    const holdIngest = new Promise<void>((resolve) => { releaseIngest = resolve; });
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { holdIngest });
    await page.goto('/source-ledger');
    await shellReady(page);
    await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();

    await page.getByRole('button', { name: '[RUN INGEST]' }).click();
    await expect(page.locator('section.source-ledger').getByRole('button', { name: '[INGESTING...]' })).toBeVisible();
    await attachRenderedEvidence(page, testInfo, 'source-ledger-running-ingest-visible');

    const persistentTopChrome = page.locator('header.shell-command');
    await expect(persistentTopChrome.getByText('[INGESTING...]', { exact: true }), 'running ingest status must not become a persistent global top-chrome strip').not.toBeVisible();

    const menu = await openSurfaceMenu(page);
    await attachRenderedEvidence(page, testInfo, 'utility-menu-open-running-operation-status');
    await expect(menu.getByText(/\[INGESTING\.\.\.\]|current operation:\s*ingest/i), 'opened RESOFEED operations/utility surface must expose the current operation status when work is running').toBeVisible();
    releaseIngest();
  });

  test('DESIGN Source Ledger/App Shell: blocked operation explanation appears only in Source Ledger and opened RESOFEED utility menu', async ({ page, ownerToken }, testInfo) => {
    // Contract basis: docs/DESIGN.md Source Ledger conflict state is raw `err: ingest already running`;
    // App Shell keeps operational utility status contextual instead of an idle global status strip.
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixtures(page, ownerToken, { ingestConflict: true });
    await page.goto('/source-ledger');
    await shellReady(page);
    await page.getByRole('button', { name: '[RUN INGEST]' }).click();

    const ledger = page.locator('section.source-ledger');
    const contextualConflictStatus = ledger.locator('.source-ledger__header > .source-ledger__status').filter({
      hasText: /err: ingest already running.*op:\s*library_reprocess.*actor:human.*phase:processing_items.*2\/5.*library reprocess processing item.*since \d{2}:\d{2}:\d{2}\s*(?:local|本地)/i
    });
    await expect(contextualConflictStatus, 'Source Ledger conflict status must include current_operation detail').toHaveCount(1);
    await expect(contextualConflictStatus).toBeVisible();
    await expect(ledger.getByText('err: ingest already running'), 'Source Ledger must not duplicate the generic conflict status').toHaveCount(1);
    await attachRenderedEvidence(page, testInfo, 'source-ledger-blocked-operation-visible');

    const persistentTopChrome = page.locator('header.shell-command');
    await expect(persistentTopChrome.getByText('err: ingest already running'), 'blocked operation explanation must not render as persistent top chrome').not.toBeVisible();

    const menu = await openSurfaceMenu(page);
    await attachRenderedEvidence(page, testInfo, 'utility-menu-open-blocked-operation-status');
    await expect(menu.getByText(/err: ingest already running.*op:\s*library_reprocess.*actor:human.*phase:processing_items.*2\/5.*library reprocess processing item.*since \d{2}:\d{2}:\d{2}\s*(?:local|本地)/i), 'opened RESOFEED operations/utility surface must expose blocked-operation explanation with current_operation detail').toBeVisible();
  });
});
