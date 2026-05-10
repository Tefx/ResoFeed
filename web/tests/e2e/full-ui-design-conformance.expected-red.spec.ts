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
  { id: 'F1', cluster: 'Shell/Chrome', source: 'audit-required-reading', expectation: 'desktop shell uses preview-like command row with no masthead/tab-nav drift' },
  { id: 'F2', cluster: 'Shell/Chrome', source: 'audit-required-reading', expectation: 'product labels stay operational: RESOFEED, TODAY, SOURCE LEDGER, INSPECTOR, /doctor' },
  { id: 'F3', cluster: 'Shell/Chrome', source: 'docs/DESIGN.md', expectation: 'shell has no persistent left navigation and feed remains primary' },
  { id: 'F4', cluster: 'Shell/Chrome', source: 'docs/DESIGN.md', expectation: 'mobile chrome is touch-safe compact, not roomy app navigation' },
  { id: 'F5', cluster: 'Shell/Chrome', source: 'docs/DESIGN.md', expectation: 'below 1080px Inspector becomes a route/full-screen detail instead of squeezed split pane' },
  { id: 'F6', cluster: 'Owner Token Prompt', source: 'docs/DESIGN.md', expectation: 'prompt copy is exactly terse: Enter owner token plus err: owner token rejected' },
  { id: 'F7', cluster: 'Owner Token Prompt', source: 'audit-required-reading', expectation: 'token action is non-generic bracket/text treatment, not SaaS login/button chrome' },
  { id: 'F8', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'today feed rows and search results share feed-item anatomy' },
  { id: 'F9', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'metadata line includes src, compact age/time, extraction provenance, and agent when needed' },
  { id: 'F10', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'metadata prefixes remain lowercase src:, agent:, partial:, err:' },
  { id: 'F11', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'summary fallback renders raw err/summary unavailable text when AI summary is absent' },
  { id: 'F12', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'feed titles clamp to two lines and summaries clamp to two lines desktop / one line narrow' },
  { id: 'F13', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'feed row rhythm uses 12px top, 11px bottom, 1px separator and stable selected dimensions' },
  { id: 'F14', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'time groups TODAY/YESTERDAY/EARLIER sit inline in metadata rows, not divider rows' },
  { id: 'F15', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'narrow search layout keeps feed-row anatomy and no crop' },
  { id: 'F16', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'Inspect and Resonate affordances are explicit 44px keyboard-reachable actions' },
  { id: 'F17', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Inspector focus is quiet and only true keyboard focus receives focus ring' },
  { id: 'F18', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'Inspector header contains provenance/original link but no visible model diagnostics' },
  { id: 'F19', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'primary reading body is cleaned editorial text, not raw extraction boilerplate' },
  { id: 'F20', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'original link is a normal accessible navigation link' },
  { id: 'F21', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'desktop split Inspector does not duplicate the star action' },
  { id: 'F22', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'mobile Inspector places star near header because feed star is hidden' },
  { id: 'F23', cluster: 'Inspector', source: 'docs/DESIGN.md', expectation: 'provenance disclosure is calm terse why/source interpretation copy' },
  { id: 'F24', cluster: 'SourceLedger/StatePortability', source: 'audit-required-reading', expectation: 'Source Ledger exposes required DOM contract/classes for harnessable rows/actions' },
  { id: 'F25', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'manual ingest action label is exactly [RUN INGEST]' },
  { id: 'F26', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'per-source fetch action label is exactly [FETCH]' },
  { id: 'F27', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'delete action is canonical [DELETE] with Delete source accessible name' },
  { id: 'F28', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'OPML import/export labels are [IMPORT OPML] and no false default imported status appears' },
  { id: 'F29', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'State actions use [EXPORT STATE] and [IMPORT STATE]' },
  { id: 'F30', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'source rows include URL column/value, not just source title' },
  { id: 'F31', cluster: 'SourceLedger/StatePortability', source: 'audit-required-reading', expectation: 'timestamps are labelled last_fetch and last_ingest' },
  { id: 'F32', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'file input is hidden without leaving a visible browser artifact while remaining label-reachable' },
  { id: 'F33', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'disabled bracket actions are transparent/restraint, not filled buttons' },
  { id: 'F34', cluster: 'SourceLedger/StatePortability', source: 'audit-required-reading', expectation: 'action baseline remains stable across normal/pending/disabled ledger states' },
  { id: 'F35', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'State Portability is only ledger footer actions; no standalone settings-like section' },
  { id: 'F36', cluster: 'SourceLedger/StatePortability', source: 'docs/DESIGN.md', expectation: 'State import warning is exactly import replaces active sources, rules, and stars' },
  { id: 'F37', cluster: '/doctor', source: 'docs/DESIGN.md', expectation: '/doctor narrow output wraps long lines and does not crop horizontally' },
  { id: 'F38', cluster: '/doctor', source: 'docs/DESIGN.md', expectation: '/doctor remains raw operational text, not a dashboard/cards/charts surface' },
  { id: 'F39', cluster: '/doctor', source: 'docs/DESIGN.md', expectation: 'raw IDs/URLs in diagnostics remain readable with deterministic wrapping' },
  { id: 'F40', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'search result date formatting is compact, tabular, and non-friendly' },
  { id: 'F41', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'search result count is plain text in results region, not a badge/queue count' },
  { id: 'F42', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'search empty/loading/error states are raw terse strings' },
  { id: 'F43', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'search provenance line explains the lexical match without RAG/chat semantics' },
  { id: 'F44', cluster: 'Feed/Search', source: 'docs/DESIGN.md', expectation: 'search narrow/mobile preserves row rhythm, visible Inspect, and visible Resonate' },
  { id: 'F45', cluster: 'Styling/tokens', source: 'docs/DESIGN.md', expectation: 'no global filled button leakage; bracket/text buttons stay transparent by default' },
  { id: 'F46', cluster: 'Styling/tokens', source: 'docs/DESIGN.md', expectation: 'focus is accessible but restrained and independent from accent state' },
  { id: 'F47', cluster: 'Styling/tokens', source: 'docs/DESIGN.md', expectation: 'accent is scarce: active Resonate plus at most one active command/focus moment per view' },
  { id: 'F48', cluster: 'Preview drift', source: 'docs/ui-preview.html', expectation: 'preview fixture must avoid inline style attributes so it can be diffed against product tokens' },
  { id: 'F49', cluster: 'Preview drift', source: 'docs/ui-preview.html', expectation: 'preview Ledger labels use [IMPORT OPML]/[EXPORT STATE]/[IMPORT STATE]' },
  { id: 'F50', cluster: 'Preview drift', source: 'docs/ui-preview.html', expectation: 'preview time-group labels are uppercase TODAY/YESTERDAY/EARLIER' },
  { id: 'F51', cluster: 'Preview drift', source: 'docs/ui-preview.html', expectation: 'preview Ledger timestamp labels use last_ingest/last_fetch canonical spellings' },
  { id: 'F52', cluster: 'Preview drift', source: 'docs/ui-preview.html', expectation: 'preview mobile Inspector title uses 28px/32px inspector-title and star near header' }
];

function note(violations: string[], id: FindingID, message: string): void {
  const expectation = expectations.find((item) => item.id === id);
  violations.push(`${id} ${expectation?.cluster ?? 'unknown'}: ${message}`);
}

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function runSteerCommand(page: Page, command: string, receipt: RegExp | string): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill(command);
  await steer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: receipt })).toBeVisible();
}

async function openSourceLedger(page: Page): Promise<void> {
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
}

async function openToday(page: Page): Promise<void> {
  await runSteerCommand(page, 'today', 'today');
  await expect(page.getByRole('heading', { name: 'TODAY' })).toBeVisible();
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
  await page.getByLabel('import OPML').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.getByText(/ResoFeed E2E Local Source · ok · last_fetch:/)).toBeVisible({ timeout: 20_000 });
  await openToday(page);
}

test('expected-red UI/design conformance matrix covers findings F1-F47 on the real app', async ({ page, runInfo, ownerToken }, testInfo) => {
  const violations: string[] = [];

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();

  const promptText = await visibleText(page.locator('body'));
  if (!promptText.includes('Enter owner token')) note(violations, 'F6', 'owner token prompt did not render exact heading copy');
  if (/login|sign in|account|password|profile|cloud/i.test(promptText)) note(violations, 'F6', `owner prompt leaked account/cloud language: ${promptText}`);
  const submitButtonText = await page.getByRole('button', { name: 'submit' }).textContent();
  if (submitButtonText?.trim() !== '[SUBMIT]' && submitButtonText?.trim() !== '[ENTER]') note(violations, 'F7', `owner token submit action is generic/non-bracket: ${submitButtonText?.trim() ?? '<missing>'}`);

  await enterOwnerToken(page, ownerToken);
  await saveStateScreenshot(page, testInfo, 'desktop-1280-shell-empty');

  const bodyText = await visibleText(page.locator('body'));
  const topChrome = await metric(page, 'header, .app-chrome, main > div:first-child');
  if (/Analyst|Workbench|Archival|low-fatigue|single-tenant|SaaS/i.test(bodyText)) note(violations, 'F2', 'internal design-positioning phrase is visible in product UI');
  if (await page.locator('nav[aria-label*="primary" i], aside nav, .tab-nav, [role="tablist"]').count() > 0) note(violations, 'F1', 'persistent tab/side navigation is present despite shell contract');
  if (topChrome.height > 96) note(violations, 'F1', `top chrome is too tall for compact command row: ${topChrome.height}px`);
  if (await page.locator('aside nav, [aria-label*="sidebar" i]').count() > 0) note(violations, 'F3', 'persistent left/sidebar navigation found');

  await importFixtureFeed(page, runInfo);
  await saveStateScreenshot(page, testInfo, 'desktop-1280-feed-inspector');

  const feedItem = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await expect(feedItem).toBeVisible();
  const rowText = await visibleText(feedItem);
  if (!/src:\s*ResoFeed E2E Local Source/.test(rowText)) note(violations, 'F9', `feed metadata missing src prefix/source: ${rowText}`);
  if (!/\b(\d+[mhd]|today|yesterday|earlier|\d{1,2}:\d{2})\b/i.test(rowText)) note(violations, 'F9', `feed metadata missing compact age/time: ${rowText}`);
  if (/(Src:|Agent:|Partial:|Err:)/.test(rowText)) note(violations, 'F10', `metadata prefixes are not lowercase: ${rowText}`);
  if (!/summary unavailable|err: summary unavailable|excerpt/i.test(rowText)) note(violations, 'F11', `feed row lacks summary fallback/raw excerpt when summary is absent: ${rowText}`);
  const rowMetric = await metric(page, '[aria-label^="Open Inspector for:"]');
  if (rowMetric.height % 24 !== 0 && rowMetric.height % 24 !== 23) note(violations, 'F13', `feed row height does not preserve 24px rhythm: ${rowMetric.height}px`);
  if (await page.locator('text=/^TODAY$/').count() > 1) note(violations, 'F14', 'TODAY appears as an extra divider/nav label rather than only inline time group metadata');
  const star = page.getByRole('button', { name: 'Resonate item' }).first();
  const starMetric = await metric(page, 'button[aria-label="Resonate item"], button[aria-label="Remove resonance"]');
  if (Math.abs(starMetric.width - 44) > 2 || Math.abs(starMetric.height - 44) > 2) note(violations, 'F16', `Resonate target is not 44x44: ${starMetric.width}x${starMetric.height}`);
  await star.focus();
  const focusedStar = await metric(page, 'button[aria-label="Resonate item"]:focus-visible, button[aria-label="Remove resonance"]:focus-visible');
  if (!focusedStar.found || focusedStar.outlineStyle === 'none') note(violations, 'F46', 'focused Resonate action lacks an independent visible focus outline');

  await feedItem.click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeVisible();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  const inspectorText = await visibleText(inspector);
  if (/model|latency|tokens|openrouter|gemini/i.test(inspectorText.split('Local fixture item one')[0] ?? inspectorText)) note(violations, 'F18', `Inspector header leaks model diagnostics: ${inspectorText}`);
  if (/<!doctype|<html|function\(|JSON|raw body|undefined|null/i.test(inspectorText)) note(violations, 'F19', 'Inspector primary reading body includes raw extraction/technical boilerplate');
  if (await inspector.getByRole('link', { name: /original/i }).count() === 0) note(violations, 'F20', 'Inspector original navigation is not exposed as a normal link');
  if (await inspector.getByRole('button', { name: /Resonate item|Remove resonance/ }).count() > 0) note(violations, 'F21', 'desktop split Inspector duplicates Resonate action');
  if (!/why:|source claim|interpretation|fresh from configured source/i.test(inspectorText)) note(violations, 'F23', `Inspector lacks calm provenance disclosure: ${inspectorText}`);
  const headingMetric = await metric(page, '[aria-label="INSPECTOR"] h1, [aria-label="INSPECTOR"] h2, [role="complementary"] h1, [role="complementary"] h2');
  if (headingMetric.outlineStyle !== 'none' && headingMetric.outlineStyle !== '') note(violations, 'F17', `Inspector heading focus is visually noisy: outline=${headingMetric.outlineStyle}`);

  await openSourceLedger(page);
  const ledgerText = await visibleText(page.locator('body'));
  if (await page.locator('.source-ledger, [data-testid="source-ledger"], .source-row, [data-testid="source-row"]').count() === 0) note(violations, 'F24', 'Source Ledger lacks required stable DOM contract classes/test ids');
  if (await page.getByRole('button', { name: '[RUN INGEST]' }).count() === 0) note(violations, 'F25', 'missing canonical [RUN INGEST] action');
  if (await page.locator('.source-ledger-row').filter({ hasText: '[FETCH]' }).count() === 0) note(violations, 'F26', 'missing canonical visible [FETCH] per-source action');
  if (!/\[DELETE\]/.test(ledgerText)) note(violations, 'F27', `delete action is not visible canonical [DELETE]: ${ledgerText}`);
  if (!/\[IMPORT OPML\]/.test(ledgerText)) note(violations, 'F28', `OPML import action is not visible canonical [IMPORT OPML]: ${ledgerText}`);
  if (/imported \d+ sources; folders flattened/.test(ledgerText) && !/\[IMPORT OPML\]/.test(ledgerText)) note(violations, 'F28', 'import-complete status is shown as a default/import action substitute');
  if (!/\[EXPORT STATE\]/.test(ledgerText) || !/\[IMPORT STATE\]/.test(ledgerText)) note(violations, 'F29', `state actions are not canonical bracket labels: ${ledgerText}`);
  if (!/https?:\/\//.test(ledgerText)) note(violations, 'F30', `source URL column/value is not visible in ledger rows: ${ledgerText}`);
  if (!/last_fetch/.test(ledgerText) || !/last_ingest/.test(ledgerText)) note(violations, 'F31', `timestamp labels are not canonical last_fetch/last_ingest: ${ledgerText}`);
  const fileInputMetric = await metric(page, 'input[type="file"]');
  if (fileInputMetric.found && fileInputMetric.display !== 'none' && fileInputMetric.width > 1 && fileInputMetric.height > 1) note(violations, 'F32', `file input leaves visible browser artifact: ${fileInputMetric.width}x${fileInputMetric.height}`);
  const disabledButtonMetric = await metric(page, 'button:disabled');
  if (disabledButtonMetric.found && disabledButtonMetric.backgroundColor !== 'rgba(0, 0, 0, 0)' && !/transparent/i.test(disabledButtonMetric.backgroundColor)) note(violations, 'F33', `disabled bracket action is filled: ${disabledButtonMetric.backgroundColor}`);
  const actionButtons = await page.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().y));
  if (new Set(actionButtons.map((y) => Math.round(y))).size > Math.max(4, actionButtons.length - 2)) note(violations, 'F34', 'ledger actions do not share stable row baselines');
  if (await page.getByRole('heading', { name: /state portability/i }).count() > 0) note(violations, 'F35', 'standalone State Portability/settings-like section is visible');
  if (!/import replaces active sources, rules, and stars/.test(ledgerText)) note(violations, 'F36', 'state import warning copy is missing from ledger footer/actions');

  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('/doctor');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('heading', { name: '/doctor' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  await saveStateScreenshot(page, testInfo, 'doctor-narrow-390');
  const doctor = page.getByLabel('/doctor diagnostics');
  const doctorMetric = await metric(page, '[aria-label="/doctor diagnostics"], pre');
  if (doctorMetric.overflowX === 'scroll' || doctorMetric.whiteSpace === 'pre') note(violations, 'F37', `/doctor narrow output crops or requires horizontal scroll: overflow=${doctorMetric.overflowX}, white-space=${doctorMetric.whiteSpace}`);
  if (await page.locator('.card, .badge, canvas, svg[role="img"]').count() > 0) note(violations, 'F38', '/doctor surface contains card/badge/chart-like UI instead of raw text boundary');
  if (!/(rss|fetch|openrouter|model|latency|[0-9a-f-]{12,})/i.test(await visibleText(doctor))) note(violations, 'F39', '/doctor diagnostics omit readable operational IDs/status fields');

  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search Local fixture');
  await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).press('Enter');
  if (await page.getByRole('heading', { name: 'Search and Retrieval' }).count() === 0) {
    note(violations, 'F15', 'narrow Search route was not reachable from Steer while another utility surface was active');
  }
  if (await page.getByRole('button', { name: 'search', exact: true }).count() > 0) {
    await page.getByRole('button', { name: 'search', exact: true }).click();
  }
  await saveStateScreenshot(page, testInfo, 'search-narrow-390');
  const searchRegion = page.getByRole('region', { name: 'Search results' });
  const searchText = await searchRegion.count() > 0 ? await visibleText(searchRegion) : '';
  if (!/src:/.test(searchText) || !/summary unavailable|excerpt|match|lexical/i.test(searchText)) note(violations, 'F8', `search result does not share feed-item anatomy/provenance: ${searchText}`);
  if (/\b[A-Z][a-z]+ \d{1,2}, \d{4}\b|minutes ago|hours ago/.test(searchText)) note(violations, 'F40', `search date formatting is friendly/verbose instead of compact: ${searchText}`);
  if (await page.locator('#search-status, [role="status"]').locator('.badge, [class*="badge"]').count() > 0) note(violations, 'F41', 'search result count is rendered as a badge/queue indicator');
  if (/sorry|no worries|try another|AI answer|semantic|RAG|chat/i.test(await visibleText(page.locator('body')))) note(violations, 'F42', 'search surface uses friendly/chat/RAG language instead of raw terse states');
  if (!/retrieval: lexical search|lexical|match/i.test(await visibleText(page.locator('body')))) note(violations, 'F43', 'search provenance does not identify lexical match semantics');
  if (await searchRegion.getByRole('button', { name: /Open Inspector for:|Inspect search result:/ }).count() === 0 || await searchRegion.getByRole('button', { name: /Resonate item|Remove resonance/ }).count() === 0) note(violations, 'F44', 'narrow search results do not expose both Inspect and Resonate affordances');
  const genericFilledButton = await page.locator('button').evaluateAll((buttons) => buttons.some((button) => {
    const text = button.textContent?.trim() ?? '';
    const style = window.getComputedStyle(button);
    return text !== '★' && text !== '☆' && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && !/transparent/i.test(style.backgroundColor);
  }));
  if (genericFilledButton) note(violations, 'F45', 'non-Resonate global button uses filled background leakage');
  const accentCount = await page.locator('body *').evaluateAll((nodes) => nodes.filter((node) => window.getComputedStyle(node).backgroundColor === 'rgb(122, 70, 0)' || window.getComputedStyle(node).color === 'rgb(122, 70, 0)').length);
  if (accentCount > 2) note(violations, 'F47', `accent appears too often on one screen: ${accentCount} elements`);

  await page.setViewportSize({ width: 390, height: 800 });
  await openToday(page);
  await saveStateScreenshot(page, testInfo, 'mobile-feed-390');
  const mobileInspectorVisible = await page.getByRole('complementary', { name: 'INSPECTOR' }).isVisible().catch(() => false);
  if (mobileInspectorVisible) note(violations, 'F5', 'Inspector remains visible in split pane below 1080px');
  const mobileRow = await metric(page, '[aria-label^="Open Inspector for:"]');
  if (mobileRow.height < 44 || mobileRow.height > 104) note(violations, 'F4', `mobile feed row is not touch-safe compact: ${mobileRow.height}px`);
  if (await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).count() > 0) {
    await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click({ force: true });
  } else {
    note(violations, 'F22', 'mobile feed item was not reachable to verify mobile Inspector header/star placement');
  }
  await saveStateScreenshot(page, testInfo, 'mobile-inspector-390');
  const mobileHeaderStarCount = await page.locator('main, body').locator('button[aria-label="Resonate item"], button[aria-label="Remove resonance"]').count();
  if (mobileHeaderStarCount === 0) note(violations, 'F22', 'mobile Inspector/detail route has no star action near header');

  expect.soft(expectations.map((item) => item.id), 'coverage registry must enumerate F1-F52').toEqual(Array.from({ length: 52 }, (_, index) => `F${index + 1}`));
  expect(violations, `Expected-red conformance violations mapped to audit findings:\n${violations.join('\n')}`).toEqual([]);
});

test('expected-red docs/ui-preview.html drift contract covers findings F48-F52', async () => {
  const preview = fs.readFileSync(path.join(repoRoot, 'docs', 'ui-preview.html'), 'utf8');
  const violations: string[] = [];

  if (/style="/.test(preview)) note(violations, 'F48', 'preview contains inline style attributes that mask token/class drift');
  for (const label of ['[IMPORT OPML]', '[EXPORT STATE]', '[IMPORT STATE]']) {
    if (!preview.includes(label)) note(violations, 'F49', `preview missing canonical ${label} label`);
  }
  if (!preview.includes('TODAY') || !preview.includes('YESTERDAY')) note(violations, 'F50', 'preview uses title-case time groups rather than uppercase metadata labels');
  if (!preview.includes('last_ingest') || !preview.includes('last_fetch')) note(violations, 'F51', 'preview uses spaced timestamp labels instead of last_ingest/last_fetch');
  if (!/\.mobile-detail h2\s*\{[\s\S]*font-size:\s*28px[\s\S]*line-height:\s*32px/.test(preview)) note(violations, 'F52', 'preview mobile Inspector title does not use 28px/32px inspector-title typography');

  expect(violations, `Expected-red preview drift violations:\n${violations.join('\n')}`).toEqual([]);
});
