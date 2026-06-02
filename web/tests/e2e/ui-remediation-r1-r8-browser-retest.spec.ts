import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page, TestInfo } from 'playwright/test';

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

async function waitForDirtyCorpusLifecycle(page: Page, feedUrl: string): Promise<void> {
  await expect.poll(async () => {
    await triggerFixtureIngest(page);
    return page.evaluate(async (targetFeedUrl) => {
      const token = window.localStorage.getItem('resofeed.ownerToken');
      const headers = { Authorization: `Bearer ${token ?? ''}` };
      const [sourcesResponse, feedResponse] = await Promise.all([
        window.fetch('/api/sources', { headers }),
        window.fetch('/api/feed/today', { headers })
      ]);
      const sourcesJson = await sourcesResponse.json() as { sources: Array<{ title: string; url: string; last_fetch_status: string; last_fetch_at: string | null }> };
      const feedJson = await feedResponse.json() as { items: Array<{ title: string; source_title: string }> };
      const source = sourcesJson.sources.find((candidate) => candidate.url === targetFeedUrl);
      const hasFixtureItems = feedJson.items.some((item) => item.source_title === 'Dirty Inspector Corpus');
      return {
        title: source?.title ?? null,
        status: source?.last_fetch_status ?? null,
        hasLastFetch: Boolean(source?.last_fetch_at),
        hasFixtureItems
      };
    }, feedUrl);
  }, {
    message: 'real API source add/background-ingest lifecycle reaches fetched Dirty Inspector Corpus rows',
    timeout: 45_000,
    intervals: [500, 1_000, 2_000]
  }).toEqual({ title: 'Dirty Inspector Corpus', status: 'ok', hasLastFetch: true, hasFixtureItems: true });
}

async function sourceIdForFeedUrl(page: Page, feedUrl: string): Promise<string> {
  const sourceId = await page.evaluate(async (targetFeedUrl) => {
    const token = window.localStorage.getItem('resofeed.ownerToken');
    const response = await window.fetch('/api/sources', { headers: { Authorization: `Bearer ${token ?? ''}` } });
    const json = await response.json() as { sources: Array<{ id: string; url: string }> };
    return json.sources.find((candidate) => candidate.url === targetFeedUrl)?.id ?? null;
  }, feedUrl);
  if (!sourceId) throw new Error(`missing imported source id for ${feedUrl}`);
  return sourceId;
}

async function importDirtyCorpus(page: Page, ownerToken: string, opmlPath: string, feedUrl: string): Promise<string> {
  await enterOwnerToken(page, ownerToken);
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await page.locator('#opml-file').setInputFiles(opmlPath);
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();
  await expect(page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
  const importedRow = page.locator('.source-ledger__row', { hasText: feedUrl }).first();
  await expect(importedRow.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ })).toBeVisible();
  await waitForDirtyCorpusLifecycle(page, feedUrl);
  const sourceId = await sourceIdForFeedUrl(page, feedUrl);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await runSteerCommand(page, 'source ledger', 'source ledger');
  await expect(page.locator('.source-ledger__row', { hasText: feedUrl }).getByText(/src: Dirty Inspector Corpus · status: ok · last_fetch:/)).toBeVisible({ timeout: 20_000 });
  await runSteerCommand(page, 'today', 'today');
  await expect(page.getByRole('list', { name: 'Today feed items' })).toBeVisible();
  return sourceId;
}

async function visibleText(locator: Locator): Promise<string> {
  return locator.evaluateAll((nodes) => {
    const chunks: string[] = [];
    for (const root of nodes) {
      const rootStyle = window.getComputedStyle(root);
      if (rootStyle.display === 'none' || rootStyle.visibility === 'hidden' || root.getClientRects().length === 0) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        const parent = current.parentElement;
        if (parent) {
          const style = window.getComputedStyle(parent);
          if (style.display !== 'none' && style.visibility !== 'hidden' && parent.getClientRects().length > 0) chunks.push(current.textContent ?? '');
        }
        current = walker.nextNode();
      }
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
  });
}

function primaryInspectorText(inspector: Locator): Promise<string> {
  return visibleText(inspector.locator('h2, p:not(.contract-label):not(.contract-muted):not(.contract-warning)'));
}

function corpusItem(id: string): DirtyCorpusItem {
  const item = dirtyCorpusItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`missing dirty corpus item ${id}`);
  return item;
}

async function openSurfaceMenu(page: Page): Promise<Locator> {
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  await menu.locator('summary').click();
  return menu;
}

async function assertManualLedgerFetchControls(page: Page): Promise<void> {
  const ledgerSurface = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]');
  // docs/DESIGN.md Source Ledger lines 573-591 and docs/UI_REGRESSION_CONTRACT.md lines 36-37 require lightweight manual controls.
  await expect(ledgerSurface.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
  await expect(ledgerSurface.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
}

async function assertTodayExcludedFromA11yFlow(page: Page): Promise<void> {
  const feedPane = page.locator('#today-feed');
  await expect(feedPane).toHaveAttribute('aria-hidden', 'true');
  await expect(feedPane).toHaveAttribute('inert', '');
  await expect(page.getByRole('list', { name: 'Today feed items' })).not.toBeVisible();
}

async function saveRealApiProofArtifacts(page: Page, testInfo: TestInfo): Promise<void> {
  const outDir = path.join(testInfo.outputDir, 'real-api-regression-proof');
  fs.mkdirSync(outDir, { recursive: true });
  const screenshotPath = path.join(outDir, 'real-api-reg-01-03-05-07-08-09.png');
  const domPath = path.join(outDir, 'real-api-reg-01-03-05-07-08-09.dom.txt');
  const statePath = path.join(outDir, 'real-api-reg-01-03-05-07-08-09-state.json');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(domPath, await page.locator('main.contract-shell').evaluate((node) => node.outerHTML), 'utf8');
  const apiState = await page.evaluate(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken');
    const headers = { Authorization: `Bearer ${token ?? ''}` };
    const [sources, feed, search, doctor] = await Promise.all([
      window.fetch('/api/sources', { headers }).then((response) => response.json()),
      window.fetch('/api/feed/today', { headers }).then((response) => response.json()),
      window.fetch('/api/search?q=Readable&limit=10', { headers }).then((response) => response.json()),
      window.fetch('/api/doctor', { headers }).then((response) => response.text())
    ]);
    return { sources, feedItemCount: feed.items?.length ?? 0, searchItemCount: search.items?.length ?? 0, doctorFirstLine: doctor.split('\n')[0] ?? '' };
  });
  await fs.promises.writeFile(statePath, JSON.stringify(apiState, null, 2), 'utf8');
  await testInfo.attach('real-api-regression-proof.png', { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach('real-api-regression-proof.dom.txt', { path: domPath, contentType: 'text/plain' });
  await testInfo.attach('real-api-regression-proof-state.json', { path: statePath, contentType: 'application/json' });
}

async function openInspectorFor(page: Page, item: DirtyCorpusItem, sourceId: string): Promise<Locator> {
  const feedItem = page.locator(`.contract-feed-item[data-source-id="${sourceId}"]`).getByRole('button', { name: `Open Inspector for: ${item.title}` });
  await expect(feedItem, `${item.id} feed row is visible`).toBeVisible();
  await feedItem.click();
  const inspector = page.getByRole('complementary', { name: item.title });
  await expect(inspector.getByRole('heading', { name: item.title })).toBeFocused();
  await expect(inspector.getByLabel('Source: Dirty Inspector Corpus')).toHaveText('Dirty Inspector Corpus');
  await expect(inspector.getByRole('link', { name: 'original link' })).toBeVisible();
  return inspector;
}

test('R1-R8 Inspector browser retest preserves R1 prose while keeping dirty payloads out of primary reading copy', async ({ page, ownerToken, runInfo }, testInfo) => {
  const dirtyServer = await startDirtyCorpusServer();
  const opmlPath = path.join(runInfo.artifactRoot, 'fixtures', `ui-remediation-r1-r8-${Date.now()}.opml`);
  fs.writeFileSync(opmlPath, dirtyCorpusOpml(dirtyServer.feedUrl));

  try {
    const dirtySourceId = await importDirtyCorpus(page, ownerToken, opmlPath, dirtyServer.feedUrl);

    const r1Item = corpusItem(R1_ITEM_ID);
    const r1Inspector = await openInspectorFor(page, r1Item, dirtySourceId);
    await expect(r1Inspector.locator('.inspector-reading')).toContainText(R1_READABLE_PROSE);
    const r1PrimaryText = await primaryInspectorText(r1Inspector);
    await testInfo.attach('r1-primary-inspector-text.txt', { body: r1PrimaryText, contentType: 'text/plain' });
    expect(r1PrimaryText).toContain(R1_READABLE_PROSE);
    for (const forbidden of R1_FORBIDDEN_STRINGS) {
      expect(r1PrimaryText, `R1 primary text leaked ${forbidden}: ${r1PrimaryText}`).not.toContain(forbidden);
    }
    expect(r1PrimaryText, `R1 collapsed to repeated fallback: ${r1PrimaryText}`).not.toMatch(/summary unavailable\s+summary unavailable/i);

    await runSteerCommand(page, 'search Readable', 'retrieval: lexical search');
    await expect(page.locator('.shell-grid[data-surface="search"]')).toBeVisible();
    await expect(page.locator('.feed-pane.active-panel[aria-label="Search surface independent scroll"]')).toBeVisible();
    await expect(page.locator('.contract-search-form button[type="submit"]:visible')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'retrieval: lexical search' })).toBeVisible();

    let menu = await openSurfaceMenu(page);
    await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'retrieval: lexical search' })).toHaveCount(0);
    await expect(page.locator('.source-ledger__row', { hasText: dirtyServer.feedUrl }).getByText(/src: Dirty Inspector Corpus · status: ok · last_fetch:/)).toBeVisible();
    await assertManualLedgerFetchControls(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);
    await assertTodayExcludedFromA11yFlow(page);
    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('search Readable');
    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).press('Enter');
    await expect(page.locator('.utility-surface[aria-label="Search surface"]')).toHaveClass(/active-panel/);
    await assertTodayExcludedFromA11yFlow(page);
    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).fill('/doctor');
    await page.getByRole('textbox', { name: 'Steer or paste RSS URL' }).press('Enter');
    await expect(page.locator('.doctor-surface')).toHaveClass(/active-panel/);
    await assertTodayExcludedFromA11yFlow(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    await runSteerCommand(page, 'today', 'today');
    const rowText = await visibleText(page.locator(`.contract-feed-item[data-source-id="${dirtySourceId}"]`).filter({ hasText: 'Model error keeps raw terse status' }));
    expect(rowText).not.toMatch(/model_status|model_latency_error/i);
    expect(rowText.match(/summary unavailable/gi) ?? []).toHaveLength(1);
    const modelErrorInspector = await openInspectorFor(page, corpusItem('model_error_item'), dirtySourceId);
    expect(await visibleText(modelErrorInspector)).not.toMatch(/model_status|model_latency_error/i);

    await saveRealApiProofArtifacts(page, testInfo);

    await testInfo.attach('r2-r8-sibling-proof.txt', {
      body: 'R2-R8 sibling proof obligations are covered by inspector-dirty-corpus.spec.ts and inspector-readable-content-regression.spec.ts in this patch verification.',
      contentType: 'text/plain'
    });
  } finally {
    await stopDirtyCorpusServer(dirtyServer.server);
  }
});
