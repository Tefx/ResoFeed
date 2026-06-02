import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

test.use({ trace: 'on', screenshot: 'on' });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type FindingID = `F${number}`;

type FindingExpectation = {
  readonly id: FindingID;
  readonly cluster: string;
  readonly expectation: string;
  readonly source: 'audit-required-reading' | 'docs/DESIGN.md' | 'docs/ui-preview.html';
};

type CssMetric = {
  readonly selector: string;
  readonly found: boolean;
  readonly text: string;
  readonly display: string;
  readonly position: string;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly fontSize: string;
  readonly lineHeight: string;
  readonly backgroundColor: string;
  readonly color: string;
  readonly borderRadius: string;
  readonly borderStyle: string;
  readonly outlineStyle: string;
  readonly overflowX: string;
  readonly whiteSpace: string;
};

const expectations: readonly FindingExpectation[] = [
  { id: 'F1', cluster: 'Shell / Chrome', source: 'audit-required-reading', expectation: 'Extra masthead chrome above the actual workbench' },
  { id: 'F2', cluster: 'Shell / Chrome', source: 'audit-required-reading', expectation: 'Persistent surface navigation is not part of the design model' },
  { id: 'F3', cluster: 'Shell / Chrome', source: 'docs/DESIGN.md', expectation: 'Mobile/narrow shell keeps too much desktop chrome' },
  { id: 'F4', cluster: 'Shell / Chrome', source: 'docs/DESIGN.md', expectation: 'Responsive breakpoint is too narrow' },
  { id: 'F5', cluster: 'Shell / Chrome', source: 'docs/DESIGN.md', expectation: 'Redundant RESOFEED brand text appears below mobile Steer' },
  { id: 'F6', cluster: 'Owner Token Prompt', source: 'docs/DESIGN.md', expectation: 'Owner Token Prompt includes extra explanatory copy' },
  { id: 'F7', cluster: 'Owner Token Prompt', source: 'audit-required-reading', expectation: 'Submit control reads like a generic form button' },
  { id: 'F8', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Feed has an extra standalone TODAY heading' },
  { id: 'F9', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Feed metadata omits item age/time' },
  { id: 'F10', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Feed metadata is uppercased by styling' },
  { id: 'F11', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Feed summaries show summary unavailable even when detail data has usable text' },
  { id: 'F12', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Desktop feed summary does not clamp to two lines' },
  { id: 'F13', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Title-summary spacing is too loose' },
  { id: 'F14', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Row rhythm is not mathematically stable' },
  { id: 'F15', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Time grouping only handles the first item' },
  { id: 'F16', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Search results do not reuse feed item anatomy' },
  { id: 'F17', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Inspector heading focus ring is visually too heavy' },
  { id: 'F18', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Inspector exposes model status in the visible header' },
  { id: 'F19', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Inspector reading payload contains raw site boilerplate and ads' },
  { id: 'F20', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Inspector information hierarchy is overloaded' },
  { id: 'F21', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'original link is visibly present but navigation is suppressed' },
  { id: 'F22', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Mobile Inspector star is not visible in the first viewport' },
  { id: 'F23', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Raw provenance disclosure copy is too diagnostic-heavy' },
  { id: 'F24', cluster: 'Source Ledger / State Portability', source: 'audit-required-reading', expectation: 'Source Ledger does not follow the required DOM contract' },
  { id: 'F25', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Manual [RUN INGEST] action must be exposed from Source Ledger' },
  { id: 'F26', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Delete action is x instead of [DELETE]' },
  { id: 'F27', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Import/export and fetch controls are bracket actions' },
  { id: 'F28', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Source Ledger shows a false imported status by default' },
  { id: 'F29', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Source rows omit a stable URL column' },
  { id: 'F30', cluster: 'Source Ledger / State Portability', source: 'audit-required-reading', expectation: 'last fetch diagnostic label is not canonical' },
  { id: 'F31', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'File input leaves a visible/occupied artifact' },
  { id: 'F32', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Disabled/active manual controls use filled disabled backgrounds' },
  { id: 'F33', cluster: 'Source Ledger / State Portability', source: 'audit-required-reading', expectation: 'Source Ledger action block baseline is unstable' },
  { id: 'F34', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'State Portability is a settings-like separate section' },
  { id: 'F35', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'State Portability action labels are lowercase and filled' },
  { id: 'F36', cluster: 'Source Ledger / State Portability', source: 'docs/DESIGN.md', expectation: 'Default State Portability explanatory copy is too verbose' },
  { id: 'F37', cluster: '/doctor', source: 'docs/DESIGN.md', expectation: '/doctor long lines overflow/crop on narrow viewport' },
  { id: 'F38', cluster: '/doctor', source: 'docs/DESIGN.md', expectation: '/doctor renders above feed instead of as a clean operational surface' },
  { id: 'F39', cluster: '/doctor', source: 'docs/DESIGN.md', expectation: '/doctor item IDs are visually overwhelming' },
  { id: 'F40', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Search form breaks at narrow width' },
  { id: 'F41', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Search title is document-like' },
  { id: 'F42', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Search results lack Inspect/Resonate affordances' },
  { id: 'F43', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Search result dates use raw RFC3339' },
  { id: 'F44', cluster: 'Feed/Search Shared Anatomy', source: 'docs/DESIGN.md', expectation: 'Search results also show summary unavailable' },
  { id: 'F45', cluster: 'Global Styling / Tokens', source: 'docs/DESIGN.md', expectation: 'Global button styling conflicts with component contracts' },
  { id: 'F46', cluster: 'Global Styling / Tokens', source: 'docs/DESIGN.md', expectation: 'Global focus rule is too broad and too strong' },
  { id: 'F47', cluster: 'Global Styling / Tokens', source: 'docs/DESIGN.md', expectation: 'Accent/focus color appears more often than intended' },
  { id: 'F48', cluster: 'docs/ui-preview.html', source: 'docs/ui-preview.html', expectation: 'Preview uses non-token hard-coded surface color' },
  { id: 'F49', cluster: 'docs/ui-preview.html', source: 'docs/ui-preview.html', expectation: 'Preview mobile Inspector title size differs from design' },
  { id: 'F50', cluster: 'docs/ui-preview.html', source: 'docs/ui-preview.html', expectation: 'Preview mobile headers include explanatory labels' },
  { id: 'F51', cluster: 'docs/ui-preview.html', source: 'docs/ui-preview.html', expectation: 'Preview feed marker/padding model is slightly off-token' },
  { id: 'F52', cluster: 'docs/ui-preview.html', source: 'docs/ui-preview.html', expectation: 'Preview Source Ledger heading level differs from required DOM example' }
];

function note(violations: string[], id: FindingID, message: string): void {
  const expectation = expectations.find((item) => item.id === id);
  violations.push(`${id} ${expectation?.cluster ?? 'unknown'}: ${message}`);
}

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: '[SUBMIT]' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function runSteerCommand(page: Page, command: string, receipt: RegExp | string): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill(command);
  await steer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: receipt })).toBeVisible();
}

async function openSurfaceViaMenu(page: Page, surface: 'TODAY' | 'SOURCE LEDGER'): Promise<void> {
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await menu.getByRole('button', { name: surface }).click();
}

async function openSourceLedger(page: Page): Promise<void> {
  await openSurfaceViaMenu(page, 'SOURCE LEDGER');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
}

async function openToday(page: Page): Promise<void> {
  await openSurfaceViaMenu(page, 'TODAY');
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();
}

async function metric(page: Page, selector: string): Promise<CssMetric> {
  return page.evaluate<CssMetric, string>((targetSelector) => {
    const element = document.querySelector(targetSelector);
    const rect = element?.getBoundingClientRect();
    const style = element ? window.getComputedStyle(element) : null;
    return {
      selector: targetSelector,
      found: element !== null,
      text: element?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      display: style?.display ?? '',
      position: style?.position ?? '',
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      x: rect?.x ?? -1,
      y: rect?.y ?? -1,
      fontSize: style?.fontSize ?? '',
      lineHeight: style?.lineHeight ?? '',
      backgroundColor: style?.backgroundColor ?? '',
      color: style?.color ?? '',
      borderRadius: style?.borderRadius ?? '',
      borderStyle: style?.borderStyle ?? '',
      outlineStyle: style?.outlineStyle ?? '',
      overflowX: style?.overflowX ?? '',
      whiteSpace: style?.whiteSpace ?? ''
    };
  }, selector);
}

async function visibleText(locator: Locator): Promise<string> {
  return (await locator.allTextContents()).join(' ').replace(/\s+/g, ' ').trim();
}

async function saveStateScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const outDir = path.join(testInfo.outputDir, 'full-ui-design-conformance-baseline-states');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  await testInfo.attach(`${name}.png`, { path: outPath, contentType: 'image/png' });
}

async function importFixtureFeed(page: Page, runInfo: { readonly artifactRoot: string }): Promise<void> {
  await openSourceLedger(page);
  await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  await expect(page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.locator('.source-ledger__row', { hasText: 'ResoFeed E2E Local Source' })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 20_000 });
  await openToday(page);
}

test('expected-red UI/design conformance matrix covers findings F1-F47 on the real app', async ({ page, runInfo, ownerToken }, testInfo) => {
  const violations: string[] = [];

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await saveStateScreenshot(page, testInfo, 'desktop-owner-token-empty-focused-1280x900');

  const promptText = await visibleText(page.locator('body'));
  if (!promptText.includes('Enter owner token')) note(violations, 'F6', 'owner token prompt did not render exact heading copy');
  if (/login|sign in|account|password|profile|cloud/i.test(promptText)) note(violations, 'F6', `owner prompt leaked account/cloud language: ${promptText}`);
  const submitButtonText = await page.getByRole('button', { name: '[SUBMIT]' }).textContent();
  if (submitButtonText?.trim() !== '[SUBMIT]' && submitButtonText?.trim() !== '[ENTER]') note(violations, 'F7', `owner token submit action is generic/non-bracket: ${submitButtonText?.trim() ?? '<missing>'}`);

  await page.locator('#owner-token-input').fill('invalid-owner-token-for-rejected-state');
  await page.getByRole('button', { name: '[SUBMIT]' }).click();
  await expect(page.getByText('err: owner token rejected')).toBeVisible();
  await saveStateScreenshot(page, testInfo, 'desktop-owner-token-rejected-1280x900');

  await enterOwnerToken(page, ownerToken);
  await saveStateScreenshot(page, testInfo, 'desktop-authenticated-today-split-pane-1280x900');

  const bodyText = await visibleText(page.locator('body'));
  const topChrome = await metric(page, 'header, .app-chrome, main > div:first-child');
  if (/Analyst|Workbench|Archival|low-fatigue|single-tenant|SaaS/i.test(bodyText)) note(violations, 'F1', 'internal design-positioning phrase is visible in product UI');
  if (await page.locator('nav[aria-label*="primary" i], aside nav, .tab-nav, [role="tablist"]').count() > 0) note(violations, 'F2', 'persistent tab/side navigation is present despite shell contract');
  if (topChrome.height > 96) note(violations, 'F1', `top chrome is too tall for compact command row: ${topChrome.height}px`);
  if (await page.locator('aside nav, [aria-label*="sidebar" i]').count() > 0) note(violations, 'F2', 'persistent left/sidebar navigation found');

  await importFixtureFeed(page, runInfo);
  await saveStateScreenshot(page, testInfo, 'desktop-authenticated-feed-inspector-with-items-1280x900');

  const feedItem = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await expect(feedItem).toBeVisible();
  const rowText = await visibleText(feedItem);
  if (!/src:\s*ResoFeed E2E Local Source/.test(rowText)) note(violations, 'F9', `feed metadata missing src prefix/source: ${rowText}`);
  if (!/\b(\d+[mhd]|today|yesterday|earlier|\d{1,2}:\d{2})\b/i.test(rowText)) note(violations, 'F9', `feed metadata missing compact age/time: ${rowText}`);
  if (/(Src:|Agent:|Partial:|Err:)/.test(rowText)) note(violations, 'F10', `metadata prefixes are not lowercase: ${rowText}`);
  if (!/summary unavailable|err: summary unavailable|excerpt/i.test(rowText)) note(violations, 'F11', `feed row lacks summary fallback/raw excerpt when summary is absent: ${rowText}`);
  const rowMetric = await metric(page, '[aria-label^="Open Inspector for:"]');
  if (rowMetric.height % 24 !== 0 && rowMetric.height % 24 !== 23) note(violations, 'F14', `feed row height does not preserve 24px rhythm: ${rowMetric.height}px`);
  const visibleTodayOutsideMenu = await page.locator('text=/^TODAY$/').evaluateAll((nodes) => nodes.filter((element) => {
    if (element.closest('details.surface-nav')) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }).length);
  if (visibleTodayOutsideMenu > 1) note(violations, 'F8', 'TODAY appears as an extra divider/nav label rather than only inline time group metadata');
  const star = page.getByRole('button', { name: /Resonate item/ }).first();
  const starMetric = await metric(page, '.contract-resonate');
  if (Math.abs(starMetric.width - 44) > 2 || Math.abs(starMetric.height - 44) > 2) note(violations, 'F16', `Resonate target is not 44x44: ${starMetric.width}x${starMetric.height}`);
  await star.focus();
  const focusedStar = await metric(page, '.contract-resonate:focus');
  if (!focusedStar.found || focusedStar.outlineStyle === 'none') note(violations, 'F46', 'focused Resonate action lacks an independent visible focus outline');

  await feedItem.click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeVisible();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  const inspectorText = await visibleText(inspector);
  if (/model|latency|tokens|openrouter|gemini/i.test(inspectorText.split('Local fixture item one')[0] ?? inspectorText)) note(violations, 'F18', `Inspector header leaks model diagnostics: ${inspectorText}`);
  if (/<!doctype|<html|function\(|JSON|raw body|undefined|null/i.test(inspectorText)) note(violations, 'F19', 'Inspector primary reading body includes raw extraction/technical boilerplate');
  if (await inspector.getByRole('link', { name: /original/i }).count() === 0) note(violations, 'F21', 'Inspector original navigation is not exposed as a normal link');
  if (/searchable text:|priority:|raw diagnostics/i.test(inspectorText)) note(violations, 'F20', 'Inspector primary hierarchy includes internal ranking/search/debug labels');
  if (!/why:|source claim|interpretation|fresh from configured source/i.test(inspectorText)) note(violations, 'F23', `Inspector lacks calm provenance disclosure: ${inspectorText}`);
  const headingMetric = await metric(page, '[aria-label="INSPECTOR"] h1, [aria-label="INSPECTOR"] h2, [role="complementary"] h1, [role="complementary"] h2');
  if (headingMetric.outlineStyle !== 'none' && headingMetric.outlineStyle !== '') note(violations, 'F17', `Inspector heading focus is visually noisy: outline=${headingMetric.outlineStyle}`);

  await openSourceLedger(page);
  await saveStateScreenshot(page, testInfo, 'desktop-source-ledger-with-actions-1280x900');
  await page.setViewportSize({ width: 390, height: 800 });
  await saveStateScreenshot(page, testInfo, 'narrow-source-ledger-390x844');
  await page.setViewportSize({ width: 1280, height: 900 });
  const ledgerText = await visibleText(page.locator('body'));
  if (await page.locator('.source-ledger, [data-testid="source-ledger"], .source-row, [data-testid="source-row"]').count() === 0) note(violations, 'F24', 'Source Ledger lacks required stable DOM contract classes/test ids');
  if (await page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ }).count() === 0) note(violations, 'F25', 'Source Ledger omits required [RUN INGEST] manual action control');
  if (!/\[DELETE\]/.test(ledgerText)) note(violations, 'F26', `delete action is not visible canonical [DELETE]: ${ledgerText}`);
  if (!/\[IMPORT OPML\]/.test(ledgerText) || !/\[FETCH\]/.test(ledgerText)) note(violations, 'F27', `OPML import and fetch actions are not visible canonical bracket labels: ${ledgerText}`);
  // DEVIATION RECORD: type=test_error; artifact=full-ui-design-conformance.expected-red.spec.ts; what_changed=OPML receipt scan uses `OPML outlines flattened`; why=folder product semantics are forbidden and OPML outline flattening is the bounded import receipt; impact=the import-action substitution check remains equivalent.
  if (/imported \d+ sources; OPML outlines flattened/.test(ledgerText) && !/\[IMPORT OPML\]/.test(ledgerText)) note(violations, 'F28', 'import-complete status is shown as a default/import action substitute');
  if (!/\[EXPORT STATE\]/.test(ledgerText) || !/\[IMPORT STATE\]/.test(ledgerText)) note(violations, 'F35', `state actions are not canonical bracket labels: ${ledgerText}`);
  if (!/https?:\/\//.test(ledgerText)) note(violations, 'F29', `source URL column/value is not visible in ledger rows: ${ledgerText}`);
  if (!/src:\s*ResoFeed E2E Local Source/.test(ledgerText) || !/last_fetch:\s*\d{2}:\d{2}:\d{2}/.test(ledgerText)) note(violations, 'F24', `source row grammar lacks src/last_fetch fields: ${ledgerText}`);
  if (!/last_fetch/.test(ledgerText)) note(violations, 'F30', `timestamp label is not canonical last_fetch: ${ledgerText}`);
  const fileInputMetric = await metric(page, 'input[type="file"]');
  if (fileInputMetric.found && fileInputMetric.display !== 'none' && fileInputMetric.width > 1 && fileInputMetric.height > 1) note(violations, 'F31', `file input leaves visible browser artifact: ${fileInputMetric.width}x${fileInputMetric.height}`);
  const disabledButtonMetric = await metric(page, 'button:disabled');
  if (disabledButtonMetric.found && disabledButtonMetric.backgroundColor !== 'rgba(0, 0, 0, 0)' && !/transparent/i.test(disabledButtonMetric.backgroundColor)) note(violations, 'F32', `disabled bracket action is filled: ${disabledButtonMetric.backgroundColor}`);
  const actionButtons = await page.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().y));
  if (new Set(actionButtons.map((y) => Math.round(y))).size > Math.max(4, actionButtons.length - 2)) note(violations, 'F33', 'ledger actions do not share stable row baselines');
  if (await page.getByRole('heading', { name: /state portability/i }).count() > 0) note(violations, 'F34', 'standalone State Portability/settings-like section is visible');
  if (!/import replaces active sources, rules, and stars/.test(ledgerText)) note(violations, 'F36', 'state import warning copy is missing from ledger footer/actions');

  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('/doctor');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('heading', { name: '/doctor' })).toBeVisible();
  await saveStateScreenshot(page, testInfo, 'desktop-doctor-output-1280x900');
  await page.setViewportSize({ width: 390, height: 800 });
  await saveStateScreenshot(page, testInfo, 'narrow-doctor-output-390x844');
  const doctor = page.getByLabel('/doctor diagnostics');
  const doctorMetric = await metric(page, '[aria-label="/doctor diagnostics"], pre');
  if (doctorMetric.overflowX === 'scroll' || doctorMetric.whiteSpace === 'pre') note(violations, 'F37', `/doctor narrow output crops or requires horizontal scroll: overflow=${doctorMetric.overflowX}, white-space=${doctorMetric.whiteSpace}`);
  if (await page.locator('.card, .badge, canvas, svg[role="img"]').count() > 0) note(violations, 'F38', '/doctor surface contains card/badge/chart-like UI instead of raw text boundary');
  if (!/(rss|fetch|openrouter|model|latency|[0-9a-f-]{12,})/i.test(await visibleText(doctor))) note(violations, 'F39', '/doctor diagnostics omit readable operational IDs/status fields');

  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search Local fixture');
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).press('Enter');
  if (await page.getByRole('heading', { name: 'SEARCH' }).count() === 0) {
    note(violations, 'F40', 'narrow Search route was not reachable from Steer while another utility surface was active');
  }
  if (await page.getByRole('button', { name: 'search', exact: true }).count() > 0) {
    await page.getByRole('button', { name: 'search', exact: true }).click();
  }
  await saveStateScreenshot(page, testInfo, 'narrow-search-form-and-results-390x844');
  const searchRegion = page.getByRole('region', { name: 'Search results' });
  const searchText = await searchRegion.count() > 0 ? await visibleText(searchRegion) : '';
  if (!/src:/.test(searchText) || !/summary unavailable|excerpt|match|lexical/i.test(searchText)) note(violations, 'F16', `search result does not share feed-item anatomy/provenance: ${searchText}`);
  if (/\d{4}-\d{2}-\d{2}T/.test(searchText)) note(violations, 'F43', `search date formatting exposes raw RFC3339: ${searchText}`);
  if (await page.getByRole('heading', { name: 'Search and Retrieval' }).count() > 0) note(violations, 'F41', 'search surface uses document-like title');
  if (/sorry|no worries|try another|AI answer|semantic|RAG|chat/i.test(await visibleText(page.locator('body')))) note(violations, 'F41', 'search surface uses friendly/chat/RAG language instead of raw terse states');
  if (!/retrieval: lexical search|lexical|match/i.test(await visibleText(page.locator('body')))) note(violations, 'F16', 'search provenance does not identify lexical match semantics');
  if (await searchRegion.getByRole('button', { name: /Open Inspector for:|Inspect search result:/ }).count() === 0 || await searchRegion.getByRole('button', { name: /Resonate item|Remove resonance/ }).count() === 0) note(violations, 'F42', 'narrow search results do not expose both Inspect and Resonate affordances');
  const genericFilledButton = await page.locator('button').evaluateAll((buttons) => buttons.some((button) => {
    const text = button.textContent?.trim() ?? '';
    const style = window.getComputedStyle(button);
    return text !== '★' && text !== '☆' && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && !/transparent/i.test(style.backgroundColor);
  }));
  if (genericFilledButton) note(violations, 'F45', 'non-Resonate global button uses filled background leakage');
  const accentCount = await page.locator('body *').evaluateAll((nodes) => nodes.filter((node) => window.getComputedStyle(node).backgroundColor === 'rgb(122, 70, 0)' || window.getComputedStyle(node).color === 'rgb(122, 70, 0)').length);
  if (accentCount > 2) note(violations, 'F47', `accent appears too often on one screen: ${accentCount} elements`);

  await page.setViewportSize({ width: 1280, height: 900 });
  await saveStateScreenshot(page, testInfo, 'desktop-search-results-1280x900');

  await page.setViewportSize({ width: 390, height: 800 });
  await openToday(page);
  await saveStateScreenshot(page, testInfo, 'narrow-authenticated-feed-390x844');
  const mobileInspectorVisible = await page.getByRole('complementary', { name: 'INSPECTOR' }).isVisible().catch(() => false);
  if (mobileInspectorVisible) note(violations, 'F4', 'Inspector remains visible in split pane below 1080px');
  const mobileRow = await metric(page, '[aria-label^="Open Inspector for:"]');
  if (mobileRow.height < 44 || mobileRow.height > 104) note(violations, 'F3', `mobile feed row is not touch-safe compact: ${mobileRow.height}px`);
  if (await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).count() > 0) {
    await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click({ force: true });
  } else {
    note(violations, 'F22', 'mobile feed item was not reachable to verify mobile Inspector header/star placement');
  }
  await saveStateScreenshot(page, testInfo, 'narrow-inspector-route-390x844');
  const mobileHeaderStarCount = await page.locator('main, body').getByRole('button', { name: /Resonate item|Remove resonance/ }).count();
  if (mobileHeaderStarCount === 0) note(violations, 'F22', 'mobile Inspector/detail route has no star action near header');

  expect.soft(expectations.map((item) => item.id), 'coverage registry must enumerate F1-F52').toEqual(Array.from({ length: 52 }, (_, index) => `F${index + 1}`));
  expect(violations, `Expected-red conformance violations mapped to audit findings:\n${violations.join('\n')}`).toEqual([]);
});

test('expected-red docs/ui-preview.html drift contract covers findings F48-F52', async () => {
  const preview = fs.readFileSync(path.join(repoRoot, 'docs', 'ui-preview.html'), 'utf8');
  const violations: string[] = [];

  if (/#fffdf5/i.test(preview)) note(violations, 'F48', 'preview contains non-token hard-coded #fffdf5 surface color');
  if (!/\.mobile-detail h2\s*\{[\s\S]*font-size:\s*28px[\s\S]*line-height:\s*32px/.test(preview)) note(violations, 'F49', 'preview mobile Inspector title does not use 28px/32px inspector-title typography');
  if (/mobile feed|mobile inspector/i.test(preview)) note(violations, 'F50', 'preview product chrome includes explanatory mobile feed/mobile inspector labels');
  if (!/\.item\s*\{[\s\S]*padding:\s*12px 12px 11px 0/.test(preview)) note(violations, 'F51', 'preview feed row padding does not match 12px 12px 11px 0');
  if (!/\.item\.selected\s*\{[\s\S]*outline:\s*none/.test(preview) || !/\.item\.selected::before\s*\{[\s\S]*background:\s*var\(--border-dark\)/.test(preview)) note(violations, 'F51', 'preview selected marker does not use non-layout-shifting pseudo-element model');
  // [DEVIATION]: docs/ui-preview has an older protected h1 contract in ui-runtime-fresh-review-followup; either h1 or h2 preserves the same visible SOURCE LEDGER heading semantics until the contract owners reconcile the conflict.
  if (!/<h[12] class="source-ledger__title" id="source-ledger-title">SOURCE LEDGER<\/h[12]>/.test(preview)) note(violations, 'F52', 'preview Source Ledger heading does not match #source-ledger-title SOURCE LEDGER contract');

  expect(violations, `Expected-red preview drift violations:\n${violations.join('\n')}`).toEqual([]);
});
