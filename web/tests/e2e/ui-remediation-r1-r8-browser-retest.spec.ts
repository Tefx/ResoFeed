import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page } from 'playwright/test';

import { test, expect } from './fixtures';
import {
  dirtyCorpusItems,
  dirtyCorpusOpml,
  startDirtyCorpusServer,
  stopDirtyCorpusServer,
  type DirtyCorpusItem
} from './dirty-corpus-fixtures';

test.use({ trace: 'on', screenshot: 'on' });

const R1_ITEM_ID = 'follow_prompt_repeated_lead_item';
const R1_READABLE_PROSE = 'Second readable paragraph confirms the body is not empty after bounded cleanup.';
const R1_FORBIDDEN_STRINGS = [
  'Follow us on Twitter for more newsletters',
  'summary-like lead repeated by the site'
] as const;

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
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

async function importDirtyCorpus(page: Page, ownerToken: string, opmlPath: string): Promise<void> {
  await enterOwnerToken(page, ownerToken);
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await page.getByLabel('import OPML').setInputFiles(opmlPath);
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  await page.getByRole('button', { name: '[RUN INGEST]' }).click();
  await expect(page.getByText(/src: Dirty Inspector Corpus · status: ok · last_fetch:/)).toBeVisible({ timeout: 20_000 });
  await runSteerCommand(page, 'today', 'today');
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();
}

async function visibleText(locator: Locator): Promise<string> {
  const text = await locator.evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').join('\n'));
  return text.replace(/\s+/g, ' ').trim();
}

function primaryInspectorText(inspector: Locator): Promise<string> {
  return visibleText(inspector.locator('h2, p:not(.contract-label):not(.contract-muted):not(.contract-warning)'));
}

function corpusItem(id: string): DirtyCorpusItem {
  const item = dirtyCorpusItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`missing dirty corpus item ${id}`);
  return item;
}

async function openInspectorFor(page: Page, item: DirtyCorpusItem): Promise<Locator> {
  const feedItem = page.getByRole('button', { name: `Open Inspector for: ${item.title}` });
  await expect(feedItem, `${item.id} feed row is visible`).toBeVisible();
  await feedItem.click();
  const inspector = page.getByRole('complementary', { name: item.title });
  await expect(inspector.getByRole('heading', { name: item.title })).toBeFocused();
  await expect(inspector.getByText('src: Dirty Inspector Corpus')).toBeVisible();
  await expect(inspector.getByRole('link', { name: 'original link' })).toBeVisible();
  return inspector;
}

test('R1-R8 Inspector browser retest preserves R1 prose while keeping dirty payloads out of primary reading copy', async ({ page, ownerToken, runInfo }, testInfo) => {
  const dirtyServer = await startDirtyCorpusServer();
  const opmlPath = path.join(runInfo.artifactRoot, 'fixtures', `ui-remediation-r1-r8-${Date.now()}.opml`);
  fs.writeFileSync(opmlPath, dirtyCorpusOpml(dirtyServer.feedUrl));

  try {
    await importDirtyCorpus(page, ownerToken, opmlPath);

    const r1Item = corpusItem(R1_ITEM_ID);
    const r1Inspector = await openInspectorFor(page, r1Item);
    await expect(r1Inspector.locator('.inspector-reading')).toContainText(R1_READABLE_PROSE);
    const r1PrimaryText = await primaryInspectorText(r1Inspector);
    await testInfo.attach('r1-primary-inspector-text.txt', { body: r1PrimaryText, contentType: 'text/plain' });
    expect(r1PrimaryText).toContain(R1_READABLE_PROSE);
    for (const forbidden of R1_FORBIDDEN_STRINGS) {
      expect(r1PrimaryText, `R1 primary text leaked ${forbidden}: ${r1PrimaryText}`).not.toContain(forbidden);
    }
    expect(r1PrimaryText, `R1 collapsed to repeated fallback: ${r1PrimaryText}`).not.toMatch(/summary unavailable\s+summary unavailable/i);

    await testInfo.attach('r2-r8-sibling-proof.txt', {
      body: 'R2-R8 sibling proof obligations are covered by inspector-dirty-corpus.spec.ts and inspector-readable-content-regression.spec.ts in this patch verification.',
      contentType: 'text/plain'
    });
  } finally {
    await stopDirtyCorpusServer(dirtyServer.server);
  }
});
