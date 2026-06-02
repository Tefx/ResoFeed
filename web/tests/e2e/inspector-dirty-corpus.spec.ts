import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page } from 'playwright/test';

import { test, expect } from './fixtures';
import {
  dirtyCorpusInventory,
  dirtyCorpusItems,
  dirtyCorpusOpml,
  startDirtyCorpusServer,
  stopDirtyCorpusServer,
  type DirtyCorpusItem
} from './dirty-corpus-fixtures';

test.use({ trace: 'on', screenshot: 'on' });

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function importDirtyCorpus(page: Page, ownerToken: string, opmlPath: string, feedUrl: string): Promise<void> {
  await enterOwnerToken(page, ownerToken);
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await page.locator('#opml-file').setInputFiles(opmlPath);
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  await expect(page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
  const importedRow = page.locator('.source-ledger__row', { hasText: feedUrl }).first();
  await expect(importedRow).toBeVisible();
  await expect(importedRow.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]|Fetch source Dirty Inspector Corpus/ })).toBeVisible();
  await triggerFixtureIngest(page);
  await expect(page.locator('.source-ledger__row', { hasText: 'Dirty Inspector Corpus' }).getByText(/src: Dirty Inspector Corpus/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/last_fetch:/).first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await runSteerCommand(page, 'today', 'today');
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();
}

async function triggerFixtureIngest(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken');
    const response = await window.fetch('/api/ingest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  });
  if (!result.ok && result.status !== 409) throw new Error(`fixture ingest failed: ${result.status} ${result.body}`);
}

async function runSteerCommand(page: Page, command: string, receipt: RegExp | string): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill(command);
  await steer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: receipt })).toBeVisible();
}

async function visibleText(locator: Locator): Promise<string> {
  const parts = await locator.allTextContents();
  return parts.join('\n').replace(/\s+/g, ' ').trim();
}

async function primaryInspectorText(inspector: Locator): Promise<string> {
  return visibleText(inspector.locator('h2, p:not(.contract-muted):not(.contract-warning)'));
}

function forbiddenTokensIn(text: string, tokens: readonly string[]): string[] {
  return tokens.filter((token) => text.includes(token));
}

async function inspectDirtyItem(page: Page, item: DirtyCorpusItem): Promise<readonly string[]> {
  const violations: string[] = [];
  const feedItem = page.getByRole('button', { name: `Open Inspector for: ${item.title}` });
  await expect(feedItem, `${item.id} feed row is visible`).toBeVisible();
  const feedText = await visibleText(feedItem);
  const feedForbidden = forbiddenTokensIn(feedText, item.rawPrimaryForbidden);
  if (feedForbidden.length > 0) {
    violations.push(`${item.id} feed primary text exposed raw tokens: ${feedForbidden.join(', ')}`);
  }

  await feedItem.click();
  await expect(page.getByRole('heading', { name: item.title })).toBeFocused();
  const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
  await expect(inspector.getByLabel('Source: Dirty Inspector Corpus')).toHaveText('Dirty Inspector Corpus');
  await expect(inspector.getByRole('link', { name: 'original link' })).toBeVisible();
  await expect(inspector.getByLabel(/Provenance:/)).toBeVisible();
  if (item.readablePrimaryExpected[0]) {
    await inspector.getByText(item.readablePrimaryExpected[0]).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  }

  const primaryText = await primaryInspectorText(inspector);
  for (const expected of item.readablePrimaryExpected) {
    if (!primaryText.includes(expected) && !(await inspector.getByText(expected).isVisible().catch(() => false))) {
      violations.push(`${item.id} missing readable primary text: ${expected}`);
    }
  }

  const inspectorForbidden = forbiddenTokensIn(primaryText, item.rawPrimaryForbidden);
  if (inspectorForbidden.length > 0) {
    violations.push(`${item.id} Inspector primary text exposed raw tokens: ${inspectorForbidden.join(', ')}`);
  }

  const rawDisclosure = inspector.locator('details, [aria-label*="raw" i], [aria-label*="provenance" i], [aria-label*="diagnostic" i]');
  const rawDisclosureCount = await rawDisclosure.count();
  if (inspectorForbidden.length > 0 && rawDisclosureCount === 0) {
    violations.push(`${item.id} exposed raw/provenance payload without labelled secondary/collapsed raw disclosure`);
  }
  return violations;
}

test('dirty corpus inspector primary hierarchy hides raw feed payloads and provenance', async ({ page, ownerToken, runInfo }, testInfo) => {
  const dirtyServer = await startDirtyCorpusServer();
  const opmlPath = path.join(runInfo.artifactRoot, 'fixtures', `dirty-inspector-corpus-${Date.now()}.opml`);
  fs.writeFileSync(opmlPath, dirtyCorpusOpml(dirtyServer.feedUrl));
  await testInfo.attach('dirty-corpus-fixture-inventory.txt', { body: dirtyCorpusInventory(), contentType: 'text/plain' });

  try {
    await importDirtyCorpus(page, ownerToken, opmlPath, dirtyServer.feedUrl);
    await testInfo.attach('dirty-corpus-today.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const violations: string[] = [];
    for (const item of dirtyCorpusItems) {
      violations.push(...await inspectDirtyItem(page, item));
      if (item.id === 'inline_json_ld_runtime_item') {
        const screenshotDir = path.join(runInfo.artifactRoot, 'screenshots');
        fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, 'inline-json-ld-inspector-fixed.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await testInfo.attach('inline-json-ld-inspector-fixed.png', { path: screenshotPath, contentType: 'image/png' });
      }
    }
    await testInfo.attach('dirty-corpus-negative-assertions.txt', {
      body: violations.length === 0 ? 'No dirty Inspector violations detected.' : violations.join('\n'),
      contentType: 'text/plain'
    });
    expect(violations).toEqual([]);
  } finally {
    await stopDirtyCorpusServer(dirtyServer.server);
  }
});
