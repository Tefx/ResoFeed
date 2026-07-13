import type { APIRequestContext, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const importWarning = 'Import State replaces active sources, rules, and stars.';
const stateBundle = {
  schema_version: 'resofeed.state.v1',
  exported_at: '2026-07-12T12:00:00Z',
  sources: [
    {
      id: 'src_responsive_alpha',
      url: 'https://alpha.example.test/a/very/long/path/to/a/research/feed/that-must-not-break-the-ledger.xml',
      title: 'Alpha Research Journal With A Deliberately Long Source Name'
    },
    {
      id: 'src_responsive_beta',
      url: 'https://beta.example.test/feed.xml',
      title: 'Beta Dispatch'
    }
  ],
  steer_rules: [],
  resonated_items: []
} as const;

async function importState(
  request: APIRequestContext,
  baseURL: string,
  ownerToken: string,
  bundle: typeof stateBundle | { schema_version: string; exported_at: string; sources: never[]; steer_rules: never[]; resonated_items: never[] }
): Promise<void> {
  const response = await request.post(`${baseURL}/api/state/import`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: bundle
  });
  expect(response.status(), 'real State import fixture must be accepted').toBe(200);
}

async function openLedger(page: Page, baseURL: string, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );
  await page.goto(`${baseURL}/source-ledger`);
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await expect(page.locator('.source-ledger__row')).toHaveCount(stateBundle.sources.length);
}

function stateFilePayload(): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name: 'state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(stateBundle))
  };
}

async function selectStateFile(page: Page): Promise<void> {
  await page.locator('#state-json-file').setInputFiles(stateFilePayload());
  await expect(page.getByRole('button', { name: '[CONFIRM IMPORT]' })).toBeVisible();
}

async function assertResponsiveLedger(page: Page, testInfo: TestInfo, viewport: { width: number; height: number }): Promise<void> {
  const ledger = page.locator('.source-ledger');
  const sourceList = ledger.getByRole('group', { name: 'Source list actions' });
  const portableState = ledger.getByRole('group', { name: 'Portable state actions' });
  const list = ledger.locator('.source-ledger__list');

  await expect(list).toHaveScreenshot(`source-ledger-${viewport.width}x${viewport.height}.png`, {
    animations: 'disabled',
    caret: 'hide'
  });

  const geometry = await ledger.evaluate((root) => {
    const sourceGroup = root.querySelector<HTMLElement>('.source-ledger__action-group--source-list');
    const stateGroup = root.querySelector<HTMLElement>('.source-ledger__action-group--state');
    const controls = Array.from(root.querySelectorAll<HTMLElement>('button, summary'))
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return { text: control.textContent?.trim() ?? '', width: rect.width, height: rect.height };
      });
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sourceGroupOverflow: Boolean(sourceGroup && sourceGroup.scrollWidth > sourceGroup.clientWidth + 1),
      stateGroupOverflow: Boolean(stateGroup && stateGroup.scrollWidth > stateGroup.clientWidth + 1),
      controls
    };
  });

  expect(
    geometry.documentOverflow || geometry.sourceGroupOverflow || geometry.stateGroupOverflow,
    'expected 44px controls without horizontal overflow'
  ).toBe(false);
  for (const control of geometry.controls) {
    expect(control.width, `${control.text} must be at least 44 CSS px wide`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.text} must be at least 44 CSS px high`).toBeGreaterThanOrEqual(44);
  }

  await expect(sourceList).toContainText('SOURCE LIST');
  await expect(sourceList.getByRole('button', { name: '[IMPORT OPML]' })).toBeVisible();
  await expect(sourceList.getByText('[EXPORT OPML]'), 'SOURCE LIST is import-only').toHaveCount(0);
  await expect(portableState).toContainText('PORTABLE STATE');
  await expect(portableState.getByRole('button', { name: '[EXPORT STATE]' })).toBeVisible();
  const importStateButton = portableState.getByRole('button', { name: '[IMPORT STATE]' });
  await expect(importStateButton).toHaveAccessibleDescription(importWarning);
  await importStateButton.focus();
  await expect(importStateButton).toBeFocused();
  await expect(importStateButton).toHaveCSS('outline-style', 'solid');
  await expect(ledger.locator('input[type="url"], textarea[name*="url" i]')).toHaveCount(0);
  await expect(ledger.locator('.source-ledger__name').first()).toHaveAttribute('title', /Alpha Research Journal/);
  await expect(ledger.locator('.source-ledger__url').first()).toHaveAttribute('title', stateBundle.sources[0].url);
  expect(testInfo.retry, 'responsive acceptance runs without retries').toBe(0);
}

test.describe('RF-BUG-004 State import browser acceptance', () => {
  test('[RF-BUG-004] State import confirms before atomic replacement', async ({ page, request, runInfo, ownerToken }) => {
    await importState(request, runInfo.baseURL, ownerToken, stateBundle);
    await openLedger(page, runInfo.baseURL, ownerToken);
    const importRequests: string[] = [];
    page.on('request', (candidate) => {
      if (new URL(candidate.url()).pathname === '/api/state/import' && candidate.method() === 'POST') importRequests.push(candidate.url());
    });

    await selectStateFile(page);
    const confirm = page.getByRole('button', { name: '[CONFIRM IMPORT]' });
    const cancel = page.getByRole('button', { name: '[CANCEL]' });
    expect(importRequests, 'expected zero import requests before CONFIRM IMPORT').toHaveLength(0);
    await expect(confirm).toBeFocused();
    await expect(page.getByText(importWarning)).toBeVisible();
    await expect(cancel).toBeVisible();
    await expect(
      confirm,
      'expected zero import requests before CONFIRM IMPORT and the confirmation control to expose the destructive warning'
    ).toHaveAccessibleDescription(importWarning);

    await confirm.click();
    await expect.poll(() => importRequests.length).toBe(1);
    await expect(page.getByText(/imported state\.json|import complete/)).toBeVisible();
  });

  test('[RF-BUG-004] State import cancellation resets intent and focus', async ({ page, request, runInfo, ownerToken }) => {
    await importState(request, runInfo.baseURL, ownerToken, stateBundle);
    await openLedger(page, runInfo.baseURL, ownerToken);
    await selectStateFile(page);
    await page.getByRole('button', { name: '[CANCEL]' }).click();

    const importStateButton = page.getByRole('button', { name: '[IMPORT STATE]' });
    await expect(importStateButton).toBeFocused();
    await expect(importStateButton).toBeEnabled();
    await expect(page.locator('.state-portability-actions')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByRole('button', { name: '[CONFIRM IMPORT]' })).toHaveCount(0);
    await expect(page.locator('#state-json-file')).toHaveValue('');
  });

  test('[RF-BUG-004] State import Escape cancellation resets intent and focus', async ({ page, request, runInfo, ownerToken }) => {
    await importState(request, runInfo.baseURL, ownerToken, stateBundle);
    await openLedger(page, runInfo.baseURL, ownerToken);
    await selectStateFile(page);
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: '[IMPORT STATE]' })).toBeFocused();
    await expect(page.locator('.state-portability-actions')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByRole('button', { name: '[CONFIRM IMPORT]' })).toHaveCount(0);
  });

  test('[RF-BUG-004] State import native picker cancellation resets intent and focus', async ({ page, request, runInfo, ownerToken }) => {
    await importState(request, runInfo.baseURL, ownerToken, stateBundle);
    await openLedger(page, runInfo.baseURL, ownerToken);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '[IMPORT STATE]' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([]);

    await expect(page.getByRole('button', { name: '[IMPORT STATE]' })).toBeFocused();
    await expect(page.locator('.state-portability-actions')).toHaveAttribute('data-state', 'idle');
  });
});

const viewports = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 }
] as const;

for (const viewport of viewports) {
  test(`[RF-BUG-008][${viewport.width}x${viewport.height}] Source Ledger responsive contract`, async ({ page, request, runInfo, ownerToken }, testInfo) => {
    await importState(request, runInfo.baseURL, ownerToken, stateBundle);
    await page.setViewportSize(viewport);
    await openLedger(page, runInfo.baseURL, ownerToken);
    await assertResponsiveLedger(page, testInfo, viewport);
  });
}
