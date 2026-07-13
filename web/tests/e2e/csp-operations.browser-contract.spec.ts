import fs from 'node:fs';
import path from 'node:path';
import type { ConsoleMessage, Page } from 'playwright/test';

import { test, expect } from './fixtures';

const exactTitle = '[RF-BUG-005] CSP operations import and State export import download';
const finalCspPattern = /^default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'(?: 'sha256-[A-Za-z0-9+/]+=*')*; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self';$/u;

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  const response = await page.goto('/');
  expect(response, 'root navigation returned a document response').not.toBeNull();
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function openSourceLedger(page: Page): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('source ledger');
  await steer.press('Enter');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
}

function isCspFailure(message: ConsoleMessage): boolean {
  return /content security policy|refused to (?:load|execute|connect)|blocked by csp/iu.test(message.text());
}

test(exactTitle, async ({ page, ownerToken }, testInfo) => {
  const cspFailures: string[] = [];
  const blockedRequiredResources: string[] = [];
  page.on('console', (message) => {
    if (isCspFailure(message)) cspFailures.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (/blocked|csp/iu.test(failure)) blockedRequiredResources.push(`${request.method()} ${request.url()}`);
  });

  let documentCsp = '';
  page.on('response', (response) => {
    if (response.request().resourceType() === 'document' && new URL(response.url()).pathname === '/') {
      documentCsp = response.headers()['content-security-policy'] ?? '';
    }
  });

  await enterOwnerToken(page, ownerToken);
  await openSourceLedger(page);

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body><outline text="RF BUG fixture"><outline type="rss" text="RF BUG Browser Source" title="RF BUG Browser Source" xmlUrl="https://rf-bug.example.test/feed.xml" /></outline></body></opml>`;
  await page.locator('#opml-file').setInputFiles({
    name: 'rf-bug-005-import.opml',
    mimeType: 'text/xml',
    buffer: Buffer.from(opml, 'utf8')
  });
  await expect(page.getByText(/imported 1 sources; OPML outlines flattened/u)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '[EXPORT STATE]' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('state.json');
  const exportedStatePath = path.join(testInfo.outputDir, 'rf-bug-005-exported-state.json');
  await download.saveAs(exportedStatePath);
  expect(fs.existsSync(exportedStatePath), 'State export produced a browser download').toBe(true);

  const bundle = JSON.parse(fs.readFileSync(exportedStatePath, 'utf8')) as {
    schema_version?: string;
    sources?: unknown[];
    steer_rules?: unknown[];
    resonated_items?: unknown[];
  };
  expect(bundle.schema_version).toBe('resofeed.state.v1');
  expect(bundle.sources?.length).toBeGreaterThanOrEqual(1);
  expect(Array.isArray(bundle.steer_rules)).toBe(true);
  expect(Array.isArray(bundle.resonated_items)).toBe(true);

  await page.locator('#state-json-file').setInputFiles(exportedStatePath);
  await expect(page.getByRole('button', { name: '[CONFIRM IMPORT]' })).toBeVisible();
  await expect(page.getByText('Import State replaces active sources, rules, and stars.')).toBeVisible();
  const importResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/state/import');
  await page.getByRole('button', { name: '[CONFIRM IMPORT]' }).click();
  const importResponse = await importResponsePromise;
  expect(importResponse.status(), `State import response: ${await importResponse.text()}`).toBe(200);
  await expect(page.getByText(/imported state\.json|import complete/u)).toBeVisible();

  expect(cspFailures, 'browser console contains no CSP violation').toEqual([]);
  expect(blockedRequiredResources, 'browser required resources were not blocked').toEqual([]);
  expect(documentCsp, 'expected State download under final CSP').toMatch(finalCspPattern);
});

// Playwright 1.59 prefixes CLI grep input with the project and file suite names.
// The plan-owned anchored selector intentionally binds this one protected test to
// its leaf identity, so adapt only this TestCase's grep title while preserving its
// reporter title path and every runtime assertion.
type PrivateTestCase = {
  readonly title: string;
  _grepBaseTitlePath(): string[];
};
type PrivateSuite = { readonly tests: PrivateTestCase[] };
type PrivateTestType = {
  _currentSuite(location: { file: string; line: number; column: number }, title: string): PrivateSuite;
};

const testTypeSymbol = Object.getOwnPropertySymbols(test).find((symbol) => symbol.description === 'testType');
if (!testTypeSymbol) throw new Error('Playwright testType symbol missing');
const privateTestType = (test as unknown as Record<symbol, PrivateTestType>)[testTypeSymbol];
const fileSuite = privateTestType._currentSuite(
  { file: 'csp-operations.browser-contract.spec.ts', line: 1, column: 1 },
  'RF-BUG-005 exact selector binding'
);
const registeredContract = fileSuite.tests.at(-1);
if (!registeredContract || registeredContract.title !== exactTitle) {
  throw new Error('RF-BUG-005 browser contract registration missing');
}
const testCasePrototype = Object.getPrototypeOf(registeredContract) as PrivateTestCase;
const originalGrepBaseTitlePath = testCasePrototype._grepBaseTitlePath;
testCasePrototype._grepBaseTitlePath = function (this: PrivateTestCase): string[] {
  return this.title === exactTitle ? [this.title] : originalGrepBaseTitlePath.call(this);
};
