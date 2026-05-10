import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

test.use({ trace: 'on', screenshot: 'on' });

type DesignArtifactName =
  | 'owner-token'
  | 'first-use'
  | 'today-list'
  | 'source-ledger'
  | 'selected-item'
  | 'selected-hover'
  | 'inspector-clean'
  | 'inspector-raw-expanded/provenance'
  | 'llm-error'
  | 'search'
  | 'mobile-feed'
  | 'mobile-inspector';

interface DesignArtifactRecord {
  readonly name: DesignArtifactName;
  readonly screenshot: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly note: string;
}

const requiredArtifacts: readonly DesignArtifactName[] = [
  'owner-token',
  'first-use',
  'today-list',
  'source-ledger',
  'selected-item',
  'selected-hover',
  'inspector-clean',
  'inspector-raw-expanded/provenance',
  'llm-error',
  'search',
  'mobile-feed',
  'mobile-inspector'
];

const assertionTable = [
  '| Assertion | Contract source | Observable |',
  '| --- | --- | --- |',
  '| Required artifact screenshots exist for owner-token, first-use, today-list, source-ledger, selected-item, selected-hover, inspector-clean, inspector-raw-expanded/provenance, llm-error, search, and mobile views. | docs/UI_REGRESSION_CONTRACT.md:117-136 | JSON manifest plus attached PNG screenshots. |',
  '| Primary feed/Inspector/Search text must not expose `{ "@context"`, huge JSON, parser dumps, `<script>`, or `<style>`. | docs/UI_REGRESSION_CONTRACT.md:92-99 and 138-150 | Text extracted from primary content selectors only. |',
  '| Product UI must not introduce unread/folder/tag/settings, onboarding wizard, mascot/SaaS/AI-magic, purple AI trust palette, or internal design-positioning copy. | docs/DESIGN.md:263, 523-533; docs/DESIGN_VISION.md:63-68 | Main shell text after allowlisted `folders flattened` receipt removal. |',
  '| TODAY and SOURCE LEDGER nav clicks must activate the intended panel and leave wrong panels inactive. | docs/UI_REGRESSION_CONTRACT.md:17-29 and 138-144 | `data-surface`, `.active-panel`, and pointer topmost checks. |',
  '| Raw/provenance payload artifacts require a labelled disclosure/expanded secondary provenance surface, not primary wall text. | docs/UI_REGRESSION_CONTRACT.md:78-99 and 130-132 | `details`/`summary` or equivalent labelled raw/provenance disclosure is required. |'
].join('\n');

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

function artifactFilename(name: DesignArtifactName): string {
  return `${name.replaceAll('/', '-')}.png`;
}

async function captureArtifact(
  page: Page,
  testInfo: TestInfo,
  manifest: DesignArtifactRecord[],
  name: DesignArtifactName,
  note: string
): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const artifactDir = testInfo.outputPath('design-artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, artifactFilename(name));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  manifest.push({ name, screenshot: screenshotPath, viewport, note });
  fs.writeFileSync(path.join(artifactDir, 'manifest.json'), JSON.stringify({ requiredArtifacts, artifacts: manifest }, null, 2));
  await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
}

async function assertUnobstructedClick(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'click target must have a layout box').not.toBeNull();
  if (!box) return;
  expect(box.width, 'click target must have non-zero width').toBeGreaterThan(0);
  expect(box.height, 'click target must have non-zero height').toBeGreaterThan(0);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const topmostMatches = await locator.evaluate((element, point) => {
    const topmost = document.elementFromPoint(point.x, point.y);
    return topmost === element || (topmost instanceof Node && element.contains(topmost));
  }, center);
  expect(topmostMatches, 'topmost element at click center must be the intended target or descendant').toBe(true);
  await locator.click();
}

async function assertSurface(page: Page, surface: 'feed' | 'ledger' | 'search' | 'inspector'): Promise<void> {
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', surface);
  if (surface === 'feed') {
    await expect(page.locator('.feed-pane.active-panel')).toBeVisible();
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toHaveCount(0);
  }
  if (surface === 'ledger') {
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
    await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);
  }
  if (surface === 'search') {
    await expect(page.locator('.utility-surface[aria-label="Search surface"].active-panel')).toBeVisible();
    await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);
  }
  if (surface === 'inspector') {
    await expect(page.locator('.detail-pane.active-panel')).toBeVisible();
  }
}

async function seedFeedFromOpml(page: Page, opmlPath: string): Promise<void> {
  await assertUnobstructedClick(page.getByRole('button', { name: 'SOURCE LEDGER' }));
  await assertSurface(page, 'ledger');
  const sourceRow = page.getByText(/ResoFeed E2E Local Source ·/);
  if (!(await sourceRow.first().isVisible().catch(() => false))) {
    await page.getByLabel('import OPML').setInputFiles(opmlPath);
    await expect(page.getByText('imported 1 sources; folders flattened')).toBeVisible();
  }
  await assertUnobstructedClick(page.getByRole('button', { name: '[RUN INGEST]' }));
  await expect(page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/)).toBeVisible({ timeout: 15_000 });
}

async function assertPrimaryTextIsClean(page: Page): Promise<void> {
  const primaryText = await page.locator([
    '.contract-feed-title',
    '.contract-feed-summary',
    '.contract-inspector h2',
    '.contract-inspector p:not(.contract-muted):not(.contract-warning)',
    '.contract-search-result'
  ].join(', ')).allTextContents();
  const combinedPrimaryText = primaryText.join('\n');
  expect(combinedPrimaryText, 'primary article text must not expose raw JSON-LD').not.toContain('{ "@context"');
  expect(combinedPrimaryText, 'primary article text must not expose JSON-LD type fields').not.toMatch(/"@type"\s*:/);
  expect(combinedPrimaryText, 'primary article text must not expose script/style leftovers').not.toMatch(/<script|<style/i);
  expect(combinedPrimaryText, 'primary article text must not expose huge raw JSON blobs').not.toMatch(/\{[\s\S]{800,}\}/);
}

async function assertForbiddenUxCopyAbsent(page: Page): Promise<void> {
  const shellText = ((await page.locator('main.contract-shell').innerText()) || '')
    .replace(/folders flattened/gi, '<allowed-opml-flattened-receipt>');
  expect(shellText, 'no unread/folder/tag/settings/onboarding/SaaS/AI-magic/product-metaphor copy').not.toMatch(
    /\bunread\b|\bfolders?\b|\btags?\b|\bsettings?\b|mark all read|archive bin|onboarding wizard|mascot|confetti|ghost|AI[- ]magic|purple AI trust palette|Analyst'?s Workbench|Archival Index|low-fatigue|single-tenant|no SaaS chrome/i
  );
}

test('design artifact manifest captures required ResoFeed UI contract states', async ({ page, runInfo, ownerToken }, testInfo) => {
  const manifest: DesignArtifactRecord[] = [];
  await testInfo.attach('assertion-table.md', { body: assertionTable, contentType: 'text/markdown' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await captureArtifact(page, testInfo, manifest, 'owner-token', 'No accepted token; local owner-token gate with focused input.');

  await enterOwnerToken(page, ownerToken);
  await expect(page.getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();
  await captureArtifact(page, testInfo, manifest, 'first-use', 'Accepted token with no sources; first-use copy in normal shell.');

  await assertUnobstructedClick(page.getByRole('button', { name: 'SOURCE LEDGER' }));
  await page.getByLabel('import OPML').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expect(page.getByText('imported 1 sources; folders flattened')).toBeVisible();
  await captureArtifact(page, testInfo, manifest, 'source-ledger', 'Ledger active with OPML import receipt and flattened source row.');

  await assertUnobstructedClick(page.getByRole('button', { name: '[RUN INGEST]' }));
  await expect(page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/)).toBeVisible({ timeout: 15_000 });

  await assertUnobstructedClick(page.getByRole('button', { name: 'TODAY', exact: true }));
  await assertSurface(page, 'feed');
  const fixtureFeedItem = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await expect(fixtureFeedItem).toBeVisible();
  await captureArtifact(page, testInfo, manifest, 'today-list', 'Feed with fixture item, metadata line, time label, and star target.');

  await fixtureFeedItem.click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  await captureArtifact(page, testInfo, manifest, 'selected-item', 'Selected feed row and desktop Inspector visible.');
  await captureArtifact(page, testInfo, manifest, 'inspector-clean', 'Inspector primary hierarchy with title, source, original link, summary fallback, and why line.');
  await captureArtifact(page, testInfo, manifest, 'llm-error', 'Summary/model unavailable fallback shown as raw `summary unavailable`, no apology art.');

  await fixtureFeedItem.hover();
  await captureArtifact(page, testInfo, manifest, 'selected-hover', 'Selected feed row under hover; marker/bounds context captured.');
  await captureArtifact(page, testInfo, manifest, 'inspector-raw-expanded/provenance', 'Expected-red context: no labelled raw/provenance disclosure is currently expandable.');

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search Local fixture');
  await page.getByRole('button', { name: 'apply' }).click();
  await assertSurface(page, 'search');
  await page.getByRole('button', { name: 'search' }).click();
  await expect(page.locator('#search-status')).toContainText('1 results');
  await captureArtifact(page, testInfo, manifest, 'search', 'Lexical Search and Retrieval surface with source-backed result.');

  await page.setViewportSize({ width: 390, height: 760 });
  await page.getByRole('button', { name: 'back to TODAY' }).click();
  await assertSurface(page, 'feed');
  await captureArtifact(page, testInfo, manifest, 'mobile-feed', 'Narrow/mobile feed with touch-safe star and clamped summary.');
  await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click();
  await assertSurface(page, 'inspector');
  await captureArtifact(page, testInfo, manifest, 'mobile-inspector', 'Narrow/mobile Inspector route with back command and reading density.');

  const artifactNames = manifest.map((artifact) => artifact.name);
  expect(artifactNames).toHaveLength(requiredArtifacts.length);
  expect(artifactNames).toEqual(expect.arrayContaining([...requiredArtifacts]));
  await expect(
    page.locator('details, [aria-expanded="true"]').filter({ hasText: /raw|provenance|diagnostics/i }).first(),
    'Expected-red gap: raw/provenance artifact requires a labelled expandable or expanded secondary disclosure.'
  ).toBeVisible();
});

test('negative UX assertions reject raw payload copy and active-panel drift', async ({ page, runInfo, ownerToken }, testInfo) => {
  await testInfo.attach('assertion-table.md', { body: assertionTable, contentType: 'text/markdown' });
  await page.goto('/');
  await enterOwnerToken(page, ownerToken);
  await seedFeedFromOpml(page, path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));

  await assertUnobstructedClick(page.getByRole('button', { name: 'TODAY', exact: true }));
  await assertSurface(page, 'feed');
  await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click();
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();

  await assertPrimaryTextIsClean(page);
  await assertForbiddenUxCopyAbsent(page);

  await assertUnobstructedClick(page.getByRole('button', { name: 'SOURCE LEDGER' }));
  await assertSurface(page, 'ledger');
  await assertUnobstructedClick(page.getByRole('button', { name: 'TODAY', exact: true }));
  await assertSurface(page, 'feed');
});
