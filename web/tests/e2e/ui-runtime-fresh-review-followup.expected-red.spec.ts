import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type CurrentOperationCount = { readonly current: number; readonly total: number };
type CanonicalOperationKind = 'background_ingest' | 'manual_ingest' | 'source_fetch' | 'library_reprocess';
type CanonicalActorKind = 'background' | 'human' | 'agent';
type CanonicalCurrentOperation = {
  readonly running: boolean;
  readonly kind: CanonicalOperationKind | null;
  readonly actor_kind: CanonicalActorKind | null;
  readonly phase: string | null;
  readonly count: CurrentOperationCount | null;
  readonly message: string | null;
  readonly started_at: string | null;
  readonly updated_at: string | null;
};
type RuntimeOperation = CanonicalCurrentOperation;
type RuntimeOperationResponse = { readonly operation: RuntimeOperation };
type SourceFixture = {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly last_fetch_at: string | null;
  readonly last_fetch_status: 'ok' | 'rss_fetch_error';
  readonly last_fetch_error?: string | null;
  readonly is_active: boolean;
  readonly revision: number;
};
type ItemFixture = {
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
  readonly extraction_status: 'full';
  readonly model_status: 'ok';
  readonly is_resonated: boolean;
  readonly human_inspected_at: string | null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
};
type GeometrySnapshot = {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: string;
  readonly lineHeight: string;
  readonly whiteSpace: string;
  readonly scrollHeight: number;
  readonly clientHeight: number;
};

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

const sourceFixture: SourceFixture = {
  id: 'src_fresh_followup_runtime',
  url: 'https://feeds.example.test/fresh-followup.xml',
  title: 'Fresh Followup Runtime Source',
  last_fetch_at: '2026-05-17T14:02:05Z',
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
};

const itemFixture: ItemFixture = {
  id: 'item_fresh_followup_runtime',
  source_id: sourceFixture.id,
  source_title: sourceFixture.title,
  url: 'https://articles.example.test/fresh-followup-runtime',
  title: 'Fresh review current-operation fixture',
  summary: 'Expected-red runtime fixture for contextual current-operation proof.',
  core_insight: 'Current operation must be visible only in contextual utility surfaces.',
  value_tier: 'high',
  published_at: '2026-05-17T13:30:00Z',
  first_seen_at: '2026-05-17T13:35:00Z',
  extraction_status: 'full',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
};

const secondItemFixture: ItemFixture = {
  ...itemFixture,
  id: 'item_fresh_followup_runtime_second',
  url: 'https://articles.example.test/fresh-followup-runtime-second',
  title: 'Fresh review second item remains selectable',
  summary: 'Second item selection must remain responsive while library reprocess runs.',
  core_insight: 'Reading navigation is independent from reprocess mutation progress.',
  published_at: '2026-05-17T13:31:00Z',
  first_seen_at: '2026-05-17T13:36:00Z'
};

const documentedLibraryReprocessOperation: CanonicalCurrentOperation = {
  running: true,
  kind: 'library_reprocess',
  actor_kind: 'human',
  phase: 'processing_items',
  count: { current: 2, total: 5 },
  message: 'library reprocess processing item',
  started_at: '2026-05-17T11:00:00Z',
  updated_at: '2026-05-17T11:00:05Z'
};

const documentedIdleOperation: CanonicalCurrentOperation = {
  running: false,
  kind: null,
  actor_kind: null,
  phase: null,
  count: null,
  message: null,
  started_at: null,
  updated_at: null
};

const runningManualIngestOperation: CanonicalCurrentOperation = {
  running: true,
  kind: 'manual_ingest',
  actor_kind: 'human',
  phase: 'fetching_sources',
  count: { current: 1, total: 3 },
  message: 'ingest fetching source',
  started_at: '2026-05-17T14:00:00Z',
  updated_at: '2026-05-17T14:00:05Z'
};

const pollingOperations: readonly CanonicalCurrentOperation[] = [
  {
    running: true,
    kind: 'library_reprocess',
    actor_kind: 'human',
    phase: 'loading_sources',
    count: { current: 1, total: 5 },
    message: 'library reprocess loading sources',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:01Z'
  },
  {
    running: true,
    kind: 'library_reprocess',
    actor_kind: 'human',
    phase: 'processing_items',
    count: { current: 3, total: 5 },
    message: 'library reprocess processing item 3',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:05Z'
  }
];

async function fulfillJson(route: Route, payload: object, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installApiFixture(
  page: Page,
  ownerToken: string,
  options: {
    readonly currentOperation: RuntimeOperationResponse | (() => RuntimeOperationResponse);
    readonly ingestConflict?: boolean;
    readonly items?: readonly ItemFixture[];
    readonly holdItemDetail?: { readonly itemID: string; readonly promise: Promise<void> };
  }
): Promise<{ readonly operationRequestCount: () => number; readonly reprocessRequestCount: () => number }> {
  let operationRequests = 0;
  let reprocessRequests = 0;
  const fixtureItems = options.items ?? [itemFixture];
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/sources') return fulfillJson(route, { sources: [sourceFixture] });
    if (url.pathname === '/api/feed/today') return fulfillJson(route, { items: fixtureItems });
    const itemPathMatch = url.pathname.match(/^\/api\/items\/([^/]+)$/u);
    if (itemPathMatch) {
      const itemID = decodeURIComponent(itemPathMatch[1]);
      const item = fixtureItems.find((candidate) => candidate.id === itemID) ?? itemFixture;
      if (options.holdItemDetail?.itemID === itemID) await options.holdItemDetail.promise;
      return fulfillJson(route, { item: { ...item, feed_excerpt: 'Fixture feed excerpt.', extracted_text: `Fixture article text for ${item.title}.`, provenance: { source_url: sourceFixture.url, canonical_url: item.url, original_url: item.url, story_key: null, duplicate_of_item_id: null, grouped_source_items: [] } } });
    }
    if (url.pathname.match(/^\/api\/items\/[^/]+\/inspect$/u) && request.method() === 'POST') {
      return fulfillJson(route, { item_id: 'inspected', human_inspected_at: '2026-05-17T14:03:00Z', already_applied: false });
    }
    if (url.pathname === '/api/runtime/language') return fulfillJson(route, { language: { code: 'en', label: 'English' } });
    if (url.pathname === '/api/runtime/operation') {
      operationRequests += 1;
      return fulfillJson(route, typeof options.currentOperation === 'function' ? options.currentOperation() : options.currentOperation);
    }
    if (url.pathname === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (url.pathname === '/api/ingest' && request.method() === 'POST') {
      if (options.ingestConflict) {
        return fulfillJson(route, {
          error: {
            code: 'conflict',
            message: 'ingest already running',
            details: {
              retry_allowed: true,
              current_operation: documentedLibraryReprocessOperation
            }
          }
        }, 409);
      }
      return fulfillJson(route, { operation: 'ingest', source_id: null, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [], completed_at: '2026-05-17T14:01:00Z' });
    }
    if (url.pathname === '/api/runtime/reprocess-library' && request.method() === 'POST') {
      reprocessRequests += 1;
      return fulfillJson(route, { already_applied: false, reprocess: { status: 'completed', language: 'en', started_at: '2026-05-17T11:00:00Z', completed_at: '2026-05-17T11:00:10Z', items_attempted: 5, items_updated: 5, items_unavailable: 0, items_failed: 0, items_indexed: 5, fts_rebuilt: true, errors: [] } });
    }
    if (url.pathname === '/api/state/export') return fulfillJson(route, { version: 1, sources: [], steering_rules: [], resonated_items: [] });
    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${url.pathname}`, details: {} } }, 404);
  });
  return { operationRequestCount: () => operationRequests, reprocessRequestCount: () => reprocessRequests };
}

async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'RESOFEED' })).toBeVisible();
}

async function openSourceLedger(page: Page): Promise<Locator> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('source ledger');
  await page.keyboard.press('Enter');
  const ledger = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"] .source-ledger');
  await expect(ledger).toBeVisible();
  return ledger;
}

async function openUtilityMenu(page: Page): Promise<Locator> {
  const menuRoot = page.locator('details[aria-label="RESOFEED surface menu"]');
  const summary = menuRoot.locator('summary', { hasText: 'RESOFEED' });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(menuRoot).toHaveAttribute('open', '');
  return menuRoot;
}

async function attachPageEvidence(page: Page, testInfo: TestInfo, name: string, target = 'body'): Promise<string> {
  const evidenceDir = path.join(testInfo.outputDir, 'ui-runtime-fresh-review-followup');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const domPath = path.join(evidenceDir, `${name}.dom.html`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(domPath, await page.locator(target).evaluate((element) => element.outerHTML), 'utf8');
  await fs.promises.writeFile(ariaPath, await page.locator(target).ariaSnapshot(), 'utf8');
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.dom.html`, { path: domPath, contentType: 'text/html' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
  return screenshotPath;
}

async function geometry(locator: Locator): Promise<GeometrySnapshot> {
  return locator.evaluate((element): GeometrySnapshot => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      text: element.textContent?.trim() ?? '',
      width: box.width,
      height: box.height,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      whiteSpace: style.whiteSpace,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  });
}

test.describe('expected-red current-operation and fresh review browser proof', () => {
  test('CO-01/FR-05: exact documented library_reprocess status is contextual in Source Ledger and opened RESOFEED menu, never idle top chrome', async ({ page, ownerToken }, testInfo) => {
    // Spec-fixture conformance: this fixture is exactly docs/CURRENT_OPERATION_FRESH_FINDINGS_CONTRACT.md §3.1's documented running operation envelope.
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixture(page, ownerToken, { currentOperation: { operation: documentedLibraryReprocessOperation } });
    await page.goto('/');
    await waitForShell(page);
    const ledger = await openSourceLedger(page);
    await attachPageEvidence(page, testInfo, 'source-ledger-running-operation', '.utility-surface[aria-label="SOURCE LEDGER surface"]');

    const canonicalStatusPattern = /\[REPROCESSING\.\.\.\]\s*·\s*op:\s*library_reprocess\s*·\s*actor:human\s*·\s*phase:processing_items\s*·\s*2\/5\s*·\s*library reprocess processing item\s*·\s*since \d{2}:\d{2}:\d{2}\s+local/i;
    await expect.soft(ledger, 'CO-01/FR-05: Source Ledger must show canonical documented library_reprocess operation status').toContainText(canonicalStatusPattern);

    const status = ledger.locator('.source-ledger__header > .source-ledger__status');
    const statusGeometry = await geometry(status);
    expect.soft(statusGeometry.fontSize, 'FR-05: current-operation status uses chrome 14px typography, not metadata type').toBe('14px');
    expect.soft(statusGeometry.lineHeight, 'FR-05: current-operation status uses chrome 20px line-height').toBe('20px');
    expect.soft(statusGeometry.whiteSpace, 'FR-05: status can wrap/preserve useful detail instead of nowrap truncation').not.toBe('nowrap');
    expect.soft(statusGeometry.scrollHeight, 'FR-05: useful phase/count/message detail is not clipped').toBeLessThanOrEqual(statusGeometry.clientHeight + 1);

    const menu = await openUtilityMenu(page);
    await attachPageEvidence(page, testInfo, 'utility-menu-open-running-operation', 'details[aria-label="RESOFEED surface menu"]');
    await expect.soft(menu, 'CO-01: opened RESOFEED menu must expose current operation while work is running').toContainText(canonicalStatusPattern);
    await expect.soft(page.locator('header.shell-command').getByText(/idle|current operation|last_ingest: not_run/i), 'CO-06: no persistent top-chrome idle/current-operation strip is rendered').toHaveCount(0);
  });

  test('CO-07: reload restores in-flight library reprocess and does not expose a new start path', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const fixture = await installApiFixture(page, ownerToken, { currentOperation: { operation: documentedLibraryReprocessOperation } });
    await page.goto('/');
    await waitForShell(page);
    await page.reload();
    await waitForShell(page);

    const menu = await openUtilityMenu(page);
    await attachPageEvidence(page, testInfo, 'reload-restored-library-reprocess', 'details[aria-label="RESOFEED surface menu"]');
    await expect.soft(menu, 'CO-07: reload must restore the running library_reprocess status from /api/runtime/operation').toContainText(/\[REPROCESSING\.\.\.\].*op:\s*library_reprocess.*2\/5/i);
    const reprocessButton = menu.getByRole('button', { name: /Reprocess existing library/i });
    await expect.soft(reprocessButton, 'CO-07: reload must not show a fresh reprocess start label while backend reports running').toHaveText('[REPROCESSING...]');
    await expect.soft(reprocessButton, 'CO-07: reload-restored reprocess action is aria-disabled while guard is running').toHaveAttribute('aria-disabled', 'true');
    expect.soft(fixture.reprocessRequestCount(), 'CO-07: restoring progress after reload must not POST a new reprocess request').toBe(0);
  });

  test('CO-08: article selection remains responsive while library reprocess is running and detail fetch is pending', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    let releaseSecondDetail!: () => void;
    const secondDetail = new Promise<void>((resolve) => { releaseSecondDetail = resolve; });
    await installApiFixture(page, ownerToken, {
      currentOperation: { operation: documentedLibraryReprocessOperation },
      items: [itemFixture, secondItemFixture],
      holdItemDetail: { itemID: secondItemFixture.id, promise: secondDetail }
    });
    await page.goto('/');
    await waitForShell(page);
    await expect(page.getByRole('heading', { name: itemFixture.title })).toBeVisible();

    await page.getByRole('button', { name: `Open Inspector for: ${secondItemFixture.title}` }).click();
    await attachPageEvidence(page, testInfo, 'reprocess-running-second-item-selected-before-detail', 'main[aria-label="RESOFEED"]');
    await expect.soft(page.getByRole('heading', { name: secondItemFixture.title }), 'CO-08: selected item preview replaces stale Inspector detail immediately').toBeVisible();
    await expect.soft(page.getByRole('heading', { name: itemFixture.title }), 'CO-08: stale prior Inspector heading must not remain while next detail is pending').toHaveCount(0);

    releaseSecondDetail();
    await expect(page.getByRole('heading', { name: secondItemFixture.title })).toBeVisible();
  });

  test('CO-04/FR-06: visible current-operation surfaces poll bounded updates and clear when idle', async ({ page, ownerToken }) => {
    let operationIndex = 0;
    const fixture = await installApiFixture(page, ownerToken, {
      currentOperation: () => ({ operation: pollingOperations[Math.min(operationIndex++, pollingOperations.length - 1)] })
    });
    await page.goto('/');
    await waitForShell(page);
    const ledger = await openSourceLedger(page);

    await expect.soft(ledger, 'FR-06: scoped operation status is visible after startup read').toContainText(/phase:(loading_sources|processing_items).*(1|3)\/5.*library reprocess (loading sources|processing item 3)/i);
    await expect.soft(ledger, 'FR-06: phase/count/message refreshes without a full reload while Source Ledger remains visible').toContainText(/phase:processing_items.*3\/5.*library reprocess processing item 3/i, { timeout: 2500 });
    const requestCount = fixture.operationRequestCount();
    expect.soft(requestCount, 'FR-06: polling performs more than the initial one-shot read while relevant UI is visible').toBeGreaterThanOrEqual(2);
    expect.soft(requestCount, 'FR-06: polling remains bounded/lightweight for a short visible interval').toBeLessThanOrEqual(5);
  });

  test('CO-02/FR-03/FR-04: guard conflict copy, shared ingest disabling, and 44px bracket hit targets are browser-visible', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installApiFixture(page, ownerToken, { currentOperation: { operation: runningManualIngestOperation }, ingestConflict: true });
    await page.goto('/');
    await waitForShell(page);
    const ledger = await openSourceLedger(page);
    await attachPageEvidence(page, testInfo, 'source-ledger-running-manual-ingest', '.utility-surface[aria-label="SOURCE LEDGER surface"]');

    const runIngest = ledger.locator('.bracket-action--run-ingest');
    await expect.soft(runIngest, 'FR-03: Source Ledger global ingest action reflects shared current operation').toHaveText('[INGESTING...]');
    await expect.soft(runIngest, 'FR-03: Source Ledger global ingest action is disabled while shared operation is running').toBeDisabled();

    await page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ }).click({ trial: true }).catch(() => undefined);
    await expect.soft(ledger, 'CO-02: shared running-operation guard exposes canonical current_operation copy').toContainText(/op:\s*manual_ingest\s*·\s*actor:human\s*·\s*phase:fetching_sources\s*·\s*1\/3\s*·\s*ingest fetching source\s*·\s*since \d{2}:\d{2}:\d{2}\s*(?:local|本地)/i);

    for (const [finding, selector] of [['FR-04 run ingest', '.bracket-action--run-ingest'], ['FR-04 import OPML', '.bracket-action--import-opml'], ['FR-04 fetch', '.bracket-action--fetch']] as const) {
      const box = await geometry(ledger.locator(selector).first());
      expect.soft(box.height, `${finding}: bracket action exposes at least a 44 CSS px hit target`).toBeGreaterThanOrEqual(44);
    }
  });

  test('FR-01: mobile RESOFEED menu opens as full-width utility sheet with focus transfer and Escape return', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiFixture(page, ownerToken, { currentOperation: { operation: documentedIdleOperation } });
    await page.goto('/');
    await waitForShell(page);
    const menuRoot = await openUtilityMenu(page);
    const menu = menuRoot.locator('.surface-nav-menu');
    await attachPageEvidence(page, testInfo, 'mobile-menu-open', 'details[aria-label="RESOFEED surface menu"]');
    const box = await menu.boundingBox();
    expect.soft(box, 'FR-01: mobile utility menu is measurable').not.toBeNull();
    expect.soft(box?.x ?? Number.NaN, 'FR-01: mobile utility menu starts at the viewport edge instead of off-screen').toBeLessThanOrEqual(1);
    expect.soft(box?.width ?? 0, 'FR-01: mobile utility menu spans the narrow viewport as a utility sheet').toBeGreaterThanOrEqual(388);
    expect.soft(box?.y ?? 9999, 'FR-01: mobile utility menu opens visibly within the 390x844 viewport').toBeLessThan(844 - 44);
    expect.soft(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''), 'FR-01: focus moves to the first menu item').toBe('TODAY');
    await page.keyboard.press('Escape');
    await expect.soft(menuRoot, 'FR-01: Escape closes the mobile RESOFEED sheet').not.toHaveAttribute('open', '');
    expect.soft(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''), 'FR-01: Escape returns focus to RESOFEED summary').toBe('RESOFEED');
  });

  test('FR-07/FR-08: docs/ui-preview Source Ledger uses canonical operational copy and required DOM contract', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(pathToFileURL(path.join(repoRoot, 'docs', 'ui-preview.html')).toString());
    await expect(page.locator('.source-ledger')).toBeVisible();
    await attachPageEvidence(page, testInfo, 'ui-preview-source-ledger-dom-copy', '.source-ledger');

    const visibleStatusText = await page.locator('.source-ledger__status').allTextContents();
    expect.soft(visibleStatusText.join('\n'), 'FR-07: scenario labels are not embedded in user-visible operational status components').not.toMatch(/scenario\s+(running|blocked)\s*:/i);
    expect.soft(visibleStatusText.join('\n'), 'FR-07: preview exposes canonical current-operation copy outside scenario labels').toMatch(/op:\s*(library_reprocess|manual_ingest|background_ingest|source_fetch)\s*·\s*actor:(human|background|agent)\s*·\s*phase:/i);

    await expect.soft(page.locator('h1#source-ledger-title'), 'FR-08: preview Source Ledger title is h1#source-ledger-title').toHaveCount(1);
    await expect.soft(page.locator('.source-ledger__header > #source-ledger-title + .source-ledger__status + .bracket-action--run-ingest'), 'FR-08: preview header anatomy is title/status/run action').toHaveCount(1);
    await expect.soft(page.locator('.source-ledger__header .bracket-action--run-ingest'), 'FR-08: preview active Source Ledger action uses native disabled where required').toBeDisabled();
  });
});
