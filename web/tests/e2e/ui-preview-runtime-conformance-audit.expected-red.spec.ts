import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type ExtractionStatus = 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
type ModelStatus = 'ok' | 'summary_unavailable' | 'model_latency_error';
type LastFetchStatus = 'ok' | 'rss_fetch_error' | 'not_fetched';

interface ItemSummaryFixture {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly display_excerpt: string | null;
  readonly value_tier: string | null;
  readonly published_at: string | null;
  readonly first_seen_at: string | null;
  readonly extraction_status: ExtractionStatus;
  readonly model_status: ModelStatus;
  readonly is_resonated: boolean;
  readonly human_inspected_at: string | null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
}

interface SourceFixture {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly last_fetch_at: string | null;
  readonly last_fetch_status: LastFetchStatus;
  readonly last_fetch_error?: string | null;
  readonly is_active: boolean;
  readonly revision: number;
}

interface ItemDetailFixture extends ItemSummaryFixture {
  readonly feed_excerpt: string | null;
  readonly extracted_text: string | null;
  readonly provenance: {
    readonly source_url: string;
    readonly canonical_url: string | null;
    readonly original_url: string;
    readonly story_key: string | null;
    readonly duplicate_of_item_id: string | null;
    readonly grouped_source_items: readonly [];
  };
}

interface StyleSnapshot {
  readonly display: string;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly lineHeight: string;
  readonly letterSpacing: string;
  readonly backgroundColor: string;
  readonly color: string;
  readonly minHeight: string;
  readonly height: number;
  readonly width: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly whiteSpace: string;
  readonly text: string;
}

interface RuntimeOperationFixture {
  readonly running: boolean;
  readonly kind: string | null;
  readonly actor_kind: string | null;
  readonly phase: string | null;
  readonly count: { readonly current: number; readonly total: number } | null;
  readonly message: string | null;
  readonly started_at: string | null;
  readonly updated_at: string | null;
}

const sourceFixture: SourceFixture = {
  id: 'src_runtime_conformance',
  url: 'https://feeds.example.test/runtime-conformance.xml',
  title: 'Runtime Conformance Source With Long Ledger Name',
  last_fetch_at: '2026-05-17T14:02:05Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const longMobileSourceFixture: SourceFixture = {
  ...sourceFixture,
  id: 'src_runtime_conformance_long_mobile',
  title: 'Extremely Long Mobile Source Metadata Collision Fixture Name That Must Clamp Before Star Column'
};

const itemFixture: ItemSummaryFixture = {
  id: 'item_runtime_conformance',
  source_id: sourceFixture.id,
  source_title: sourceFixture.title,
  url: 'https://articles.example.test/runtime-conformance',
  title: 'Runtime conformance preview drift item',
  summary: 'Dense rendered summary for runtime visual drift expected-red coverage.',
  core_insight: 'Expected-red tests expose visible DOM and geometry gaps before remediation.',
  display_excerpt: 'Rendered fallback excerpt for browser proof.',
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

const mobileCollisionItemFixture: ItemSummaryFixture = {
  ...itemFixture,
  id: 'item_runtime_conformance_mobile_collision',
  source_id: longMobileSourceFixture.id,
  source_title: longMobileSourceFixture.title,
  title: 'Mobile metadata collision fixture'
};

const itemDetailFixture: ItemDetailFixture = {
  ...itemFixture,
  feed_excerpt: 'Feed excerpt for runtime conformance.',
  extracted_text: 'Full article text for Inspector rendering.',
  provenance: {
    source_url: sourceFixture.url,
    canonical_url: itemFixture.url,
    original_url: itemFixture.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

function runtimeOperationPayload(): object {
  return { operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } };
}

function runningRuntimeOperationPayload(): RuntimeOperationFixture {
  return {
    running: true,
    kind: 'manual_ingest',
    actor_kind: 'human',
    phase: 'fetching_sources',
    count: { current: 1, total: 3 },
    message: 'global ingest fetching sources',
    started_at: '2026-05-17T14:00:00Z',
    updated_at: '2026-05-17T14:00:05Z'
  };
}

async function fulfillJson(route: Route, payload: object, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installFixtures(page: Page, ownerToken: string, options: { readonly emptySources?: boolean; readonly mobileCollision?: boolean; readonly runningOperation?: boolean } = {}): Promise<void> {
  await page.addInitScript((token) => window.localStorage.setItem('resofeed.ownerToken', token), ownerToken);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const sources = options.emptySources ? [] : [options.mobileCollision ? longMobileSourceFixture : sourceFixture];
    const items = options.emptySources ? [] : [options.mobileCollision ? mobileCollisionItemFixture : itemFixture];

    if (url.pathname === '/api/sources') return fulfillJson(route, { sources });
    if (url.pathname === '/api/feed/today') return fulfillJson(route, { items });
    if (url.pathname === `/api/items/${itemFixture.id}`) return fulfillJson(route, { item: itemDetailFixture });
    if (url.pathname === `/api/items/${mobileCollisionItemFixture.id}`) return fulfillJson(route, { item: { ...itemDetailFixture, ...mobileCollisionItemFixture } });
    if (url.pathname === '/api/runtime/language') return fulfillJson(route, { language: { code: 'en', label: 'English' } });
    if (url.pathname === '/api/runtime/operation') return fulfillJson(route, options.runningOperation ? { operation: runningRuntimeOperationPayload() } : runtimeOperationPayload());
    if (url.pathname === '/api/steer/active') return fulfillJson(route, { rules: [] });
    if (url.pathname === '/api/search') return fulfillJson(route, { items });
    if (url.pathname === '/api/doctor') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'doctor:\nrss_fetch_errors: 0' });
    if (url.pathname === '/api/state/export') return fulfillJson(route, { version: 1, sources: [], steering_rules: [], resonated_items: [] });
    return fulfillJson(route, { error: { code: 'not_found', message: `not found: ${url.pathname}`, details: {} } }, 404);
  });
}

async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'RESOFEED' })).toBeVisible();
}

async function attachEvidence(page: Page, testInfo: TestInfo, name: string, target = 'body'): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'ui-preview-runtime-conformance-audit');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  const domPath = path.join(evidenceDir, `${name}.dom.txt`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(ariaPath, await page.locator(target).ariaSnapshot(), 'utf8');
  await fs.promises.writeFile(domPath, await page.locator(target).evaluate((element) => element.outerHTML), 'utf8');
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
  await testInfo.attach(`${name}.dom.txt`, { path: domPath, contentType: 'text/plain' });
}

async function styleSnapshot(page: Page, selector: string): Promise<StyleSnapshot> {
  return page.locator(selector).first().evaluate((element): StyleSnapshot => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      display: style.display,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      backgroundColor: style.backgroundColor,
      color: style.color,
      minHeight: style.minHeight,
      height: box.height,
      width: box.width,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      whiteSpace: style.whiteSpace,
      text: element.textContent?.trim() ?? ''
    };
  });
}

test.describe('expected-red runtime conformance audit browser regressions', () => {
  test('F01-F05: desktop top chrome and RESOFEED utility menu match preview hierarchy, warning visibility, typography, and keyboard behavior', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installFixtures(page, ownerToken);
    await page.goto('/');
    await waitForShell(page);

    const brandStyle = await styleSnapshot(page, '.contract-brand');
    expect.soft(brandStyle.fontSize, 'F01: RESOFEED must be compact preview chrome, not 32px display masthead').toBe('12px');
    expect.soft(brandStyle.height, 'F01: brand must not dominate the 56px command row').toBeLessThanOrEqual(20);

    const menuRoot = page.locator('details[aria-label="RESOFEED surface menu"]');
    const menuSummary = menuRoot.locator('summary', { hasText: 'RESOFEED' });
    await menuSummary.focus();
    await page.keyboard.press('Enter');
    await expect(menuRoot).toHaveAttribute('open', '');
    await attachEvidence(page, testInfo, 'f01-f05-top-chrome-menu', '.shell-command');

    const menu = menuRoot.locator('.surface-nav-menu');
    await expect.soft(menu.getByText('NAV', { exact: true }), 'F02: NAV micro-heading is visible in the opened utility menu').toBeVisible();
    await expect.soft(menu.getByText('SYSTEM', { exact: true }), 'F02: SYSTEM micro-heading is visible in the opened utility menu').toBeVisible();
    await expect.soft(menu.getByText('Existing readable item content will be rewritten.'), 'F03: reprocess warning is visible to sighted users').toBeVisible();
    await expect.soft(menu.getByText('Source identifiers remain unchanged.'), 'F03: source identifier warning is visible to sighted users').toBeVisible();

    const menuButtonStyle = await styleSnapshot(page, 'details[aria-label="RESOFEED surface menu"] .surface-nav-menu button');
    expect.soft(menuButtonStyle.fontSize, 'F04: utility menu buttons use 14px command typography').toBe('14px');
    expect.soft(menuButtonStyle.lineHeight, 'F04: utility menu buttons use 20px command line-height').toBe('20px');

    const activeTextAfterOpen = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect.soft(activeTextAfterOpen, 'F05: keyboard opening RESOFEED menu moves focus to the first menu item').toBe('TODAY');
    await page.keyboard.press('Escape');
    await expect.soft(menuRoot, 'F05: Escape closes the RESOFEED menu').not.toHaveAttribute('open', '');
    const activeTextAfterEscape = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect.soft(activeTextAfterEscape, 'F05: Escape returns focus to RESOFEED summary').toBe('RESOFEED');
  });

  test('F06-F10: Source Ledger desktop panel uses preview title token, surface, tools row, non-wrapping actions, and status type', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installFixtures(page, ownerToken);
    await page.goto('/source-ledger');
    await waitForShell(page);
    await expect(page.locator('.source-ledger')).toBeVisible();
    await attachEvidence(page, testInfo, 'f06-f10-source-ledger-desktop', '.utility-surface[aria-label="SOURCE LEDGER surface"]');

    const titleStyle = await styleSnapshot(page, '#source-ledger-title');
    expect.soft(titleStyle.fontSize, 'F06: Source Ledger title uses 14px chrome type').toBe('14px');
    expect.soft(titleStyle.lineHeight, 'F06: Source Ledger title uses 20px chrome line-height').toBe('20px');
    expect.soft(titleStyle.fontWeight, 'F06: Source Ledger title uses 500 weight').toBe('500');
    expect.soft(titleStyle.letterSpacing, 'F06: Source Ledger title uses 0.08em tracking (about 1.12px at 14px)').toBe('1.12px');

    const ledgerStyle = await styleSnapshot(page, '.source-ledger');
    expect.soft(ledgerStyle.backgroundColor, 'F07: Source Ledger root uses surface token #FBF8EF').toBe('rgb(251, 248, 239)');

    const headerLayout = await page.locator('.source-ledger__header').evaluate((header) => {
      const directChildren = Array.from(header.children).map((child) => child.className || child.tagName.toLowerCase());
      return { directChildren, text: header.textContent?.trim() ?? '' };
    });
    expect.soft(headerLayout.directChildren, 'F08: header contains title, status, and [RUN INGEST] as separate anatomy').toHaveLength(3);
    expect.soft(headerLayout.text, 'F08: [IMPORT OPML] belongs in a separate tools row, not the header cluster').not.toContain('[IMPORT OPML]');
    const toolsText = await page.locator('.source-ledger__tools').textContent().catch(() => '');
    expect.soft(toolsText ?? '', 'F08/F23: tools row contains preview ledger actions').toContain('[IMPORT OPML]');
    expect.soft(toolsText ?? '', 'F08/F23: tools row contains [EXPORT STATE]').toContain('[EXPORT STATE]');
    expect.soft(toolsText ?? '', 'F08/F23: tools row contains [IMPORT STATE]').toContain('[IMPORT STATE]');

    for (const selector of ['.bracket-action--run-ingest', '.bracket-action--import-opml']) {
      const actionStyle = await styleSnapshot(page, selector);
      expect.soft(actionStyle.whiteSpace, `F09: ${actionStyle.text} does not allow internal wrapping`).toBe('nowrap');
      expect.soft(actionStyle.scrollHeight, `F09: ${actionStyle.text} remains one visual line`).toBeLessThanOrEqual(actionStyle.clientHeight + 1);
    }

    const statusStyle = await styleSnapshot(page, '.source-ledger__status');
    expect.soft(statusStyle.fontSize, 'F10: Source Ledger status uses 14px chrome type').toBe('14px');
    expect.soft(statusStyle.lineHeight, 'F10: Source Ledger status uses 20px line-height').toBe('20px');

    const sourceLedgerBox = await page.locator('.source-ledger').boundingBox();
    expect.soft(sourceLedgerBox?.height ?? 0, 'F06-F10: Source Ledger populated panel remains dense within first viewport').toBeLessThanOrEqual(360);
  });

  test('F24: empty Source Ledger keeps preview dense panel rhythm and terse empty line', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installFixtures(page, ownerToken, { emptySources: true });
    await page.goto('/source-ledger');
    await waitForShell(page);
    await expect(page.locator('.source-ledger')).toBeVisible();
    await attachEvidence(page, testInfo, 'f24-source-ledger-empty-density', '.utility-surface[aria-label="SOURCE LEDGER surface"]');

    const sourceLedgerBox = await page.locator('.source-ledger').boundingBox();
    const emptyLineBox = await page.getByText('No sources. Paste RSS URL in Steer.').boundingBox();
    expect.soft(emptyLineBox, 'F24: empty ledger line is present as terse Source Ledger empty state').not.toBeNull();
    expect.soft(sourceLedgerBox?.height ?? 0, 'F24: empty Source Ledger remains dense instead of a sparse settings-like page').toBeLessThanOrEqual(280);
  });

  test('F13-F15: Steer submit, route preview density, and first-use accessibility concept follow documented contracts', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installFixtures(page, ownerToken, { emptySources: true });
    await page.goto('/');
    await waitForShell(page);
    await attachEvidence(page, testInfo, 'f13-f15-first-use-idle', '.resofeed-shell');

    await expect.soft(page.getByRole('heading', { name: 'First use' }), 'F15: hidden heading concept `First use` must not be present in the accessibility tree').toHaveCount(0);

    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill('https://feeds.example.test/new-feed.xml');
    await attachEvidence(page, testInfo, 'f13-f14-steer-active-route-preview', '.resofeed-shell');

    const submitButton = page.locator('.steer-form button[type="submit"]');
    await expect.soft(submitButton, 'F13: Steer submit affordance uses bracket action text').toHaveText('[APPLY]');
    const submitStyle = await styleSnapshot(page, '.steer-form button[type="submit"]');
    expect.soft(submitStyle.backgroundColor, 'F13: Steer submit remains transparent low-chrome bracket action').toBe('rgba(0, 0, 0, 0)');
    expect.soft(submitStyle.fontSize, 'F13: Steer submit uses 14px chrome type').toBe('14px');

    const routePreviewStyle = await styleSnapshot(page, '.steer-route-preview[data-route-kind="add-source"]');
    expect.soft(routePreviewStyle.height, 'F14: active route preview remains terse and below full touch-target strip height').toBeLessThanOrEqual(24);
  });

  test('F20-F24 plus F08/F25: mobile ledger header/status geometry and current-operation copy remain readable/canonical', async ({ page, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installFixtures(page, ownerToken, { mobileCollision: true, runningOperation: true });
    await page.goto('/');
    await waitForShell(page);

    const firstFeedItem = page.locator('.contract-feed-item').first();
    await attachEvidence(page, testInfo, 'f20-f24-mobile-feed-before-search', '.resofeed-shell');
    const mobileCollision = await firstFeedItem.evaluate((item) => {
      const meta = item.querySelector('.contract-feed-meta')?.getBoundingClientRect();
      const star = item.querySelector('.contract-resonate')?.getBoundingClientRect();
      return meta && star ? { metaRight: meta.right, starLeft: star.left, starWidth: star.width, starHeight: star.height } : null;
    });
    expect.soft(mobileCollision?.starWidth ?? 0, 'F21: mobile Resonate width remains at least 44 CSS px').toBeGreaterThanOrEqual(44);
    expect.soft(mobileCollision?.starHeight ?? 0, 'F21: mobile Resonate height remains at least 44 CSS px').toBeGreaterThanOrEqual(44);
    expect.soft(mobileCollision ? mobileCollision.metaRight : 0, 'F21: mobile metadata ends before the independent star hit area').toBeLessThanOrEqual((mobileCollision?.starLeft ?? 0) - 11.5);

    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill('search sqlite');
    await page.keyboard.press('Enter');
    await expect(page.locator('.contract-search')).toBeVisible();
    await attachEvidence(page, testInfo, 'f20-f22-mobile-search-controls', '.utility-surface[aria-label="Search surface"]');

    await page.locator('.search-secondary-filters summary').click();
    for (const selector of ['.search-secondary-filters summary', '.search-secondary-grid input', '.search-secondary-grid select']) {
      const control = page.locator(selector).first();
      await expect.soft(control, `F20: ${selector} is rendered for mobile touch target measurement`).toBeVisible();
      const controlStyle = await styleSnapshot(page, selector);
      expect.soft(Math.max(Number.parseFloat(controlStyle.minHeight), controlStyle.height), `F20: ${selector} must be at least 44 CSS px tall`).toBeGreaterThanOrEqual(44);
    }

    const searchPrimaryButtons = await page.locator('.search-primary-row button').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? ''));
    expect.soft(searchPrimaryButtons, 'F22: search surface exposes one low-chrome primary action, not duplicate generic submit controls').toEqual(['[SEARCH]']);

    await steer.fill('source ledger');
    await page.keyboard.press('Enter');
    await expect(page.locator('.source-ledger')).toBeVisible();
    await attachEvidence(page, testInfo, 'f23-f24-mobile-source-ledger', '.utility-surface[aria-label="SOURCE LEDGER surface"]');

    const visibleLedger = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"] .source-ledger');
    const titleBox = await visibleLedger.locator('#source-ledger-title').boundingBox();
    const statusBox = await visibleLedger.locator('.source-ledger__header > .source-ledger__status').boundingBox();
    const runIngestBox = await visibleLedger.locator('.source-ledger__header > .bracket-action--run-ingest').boundingBox();
    expect.soft(titleBox, 'F08 mobile: Source Ledger title is measurable').not.toBeNull();
    expect.soft(statusBox, 'F08 mobile: Source Ledger status is measurable').not.toBeNull();
    expect.soft(runIngestBox, 'F08 mobile: Source Ledger run action is measurable').not.toBeNull();
    expect.soft(statusBox && titleBox ? statusBox.y >= titleBox.y + titleBox.height - 1 : false, 'F08 mobile: last_ingest/current status sits below title instead of colliding on the same line').toBe(true);
    expect.soft(runIngestBox && titleBox ? runIngestBox.y >= titleBox.y + titleBox.height - 1 : false, 'F08 mobile: [RUN INGEST] is not on the title baseline that previously collided with status metadata').toBe(true);

    const ledgerText = await page.locator('.source-ledger').innerText();
    expect.soft(ledgerText, 'F25: canonical current-operation copy is visible in Source Ledger output').toMatch(/op:\s*ingest\/all\s*·\s*actor:owner\s*·\s*phase:fetching_sources\s*·\s*1\/3\s*·\s*global ingest fetching sources\s*·\s*since 14:00:00/i);
    expect.soft(ledgerText, 'F25: forbidden current-operation prefix is absent from Source Ledger output').not.toMatch(/current operation:\s*ingest/i);

    await expect.soft(page.getByText('Choose state JSON'), 'F23: file-form label is absent from visible product UI').toHaveCount(0);
    await expect.soft(page.locator('#state-json-file'), 'F23: import state file input remains keyboard reachable through bracket action, not direct visible file UI').not.toHaveAccessibleName('Choose state JSON');
    const ledgerBox = await page.locator('.source-ledger').boundingBox();
    expect.soft(ledgerBox?.height ?? 0, 'F24: mobile Source Ledger preserves dense first-screen rhythm').toBeLessThanOrEqual(620);
  });
});
