import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import type { APIRequestContext, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Ledger Runtime Fixture</title><link>https://example.test/</link><description>runtime</description><item><title>Fixture item</title><link>https://example.test/item</link><guid>ledger-runtime-item</guid></item></channel></rss>`;
let feedServer: Server;
let feedBaseURL = '';

const sourceDefinitions = () => [
  { id: 'src_runtime_alpha', url: `${feedBaseURL}/alpha.xml`, title: 'Runtime Alpha' },
  { id: 'src_runtime_beta', url: `${feedBaseURL}/beta.xml`, title: 'Runtime Beta' }
];

async function seedSources(request: APIRequestContext, baseURL: string, dbPath: string, ownerToken: string, sources = sourceDefinitions()): Promise<void> {
  const validatedSources = sources.map((source, index) => ({
    ...source,
    url: `https://runtime-fixture-${index + 1}.example.test/feed.xml`
  }));
  const response = await request.post(`${baseURL}/api/state/import`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      schema_version: 'resofeed.state.v1',
      exported_at: '2026-07-12T12:00:00Z',
      sources: validatedSources,
      steer_rules: [],
      resonated_items: []
    }
  });
  const responseText = await response.text();
  expect(response.status(), `real runtime State fixture import: ${responseText}`).toBe(200);

  // Runtime acceptance uses a real HTTP feed server. The production URL validator
  // correctly rejects loopback, so test-only fixture setup rewrites only this
  // disposable SQLite database after validating the portable-state API shape.
  const database = new DatabaseSync(dbPath);
  try {
    database.exec('begin immediate');
    const update = database.prepare('update sources set url = ? where id = ?');
    for (const source of sources) update.run(source.url, source.id);
    database.exec('commit');
  } catch (error) {
    database.exec('rollback');
    throw error;
  } finally {
    database.close();
  }
}

async function openLedger(page: Page, baseURL: string, ownerToken: string, expectedRows: number): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );
  await page.goto(`${baseURL}/source-ledger`);
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await expect(page.locator('.source-ledger__row')).toHaveCount(expectedRows);
}

function row(page: Page, sourceId: string) {
  return page.locator(`.source-ledger__row[data-source-id="${sourceId}"]`);
}

test.beforeAll(async () => {
  feedServer = createServer((request, response) => {
    if (request.url === '/error.xml') {
      response.writeHead(500, { 'content-type': 'text/plain' });
      response.end('fixture upstream error');
      return;
    }
    if (request.url !== '/alpha.xml' && request.url !== '/beta.xml' && request.url !== '/conflict.xml') {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
      response.end(feedXml);
    }, 850);
  });
  await new Promise<void>((resolve, reject) => {
    feedServer.once('error', reject);
    feedServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = feedServer.address() as AddressInfo;
  feedBaseURL = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!feedServer) return;
  await new Promise<void>((resolve, reject) => feedServer.close((error) => error ? reject(error) : resolve()));
});

test.describe('RF-BUG-008 real-runtime Source Ledger operations', () => {
  test('[RF-BUG-008] RUN INGEST transitions', async ({ page, request, runInfo, ownerToken }) => {
    await seedSources(request, runInfo.baseURL, runInfo.dbPath, ownerToken);
    await openLedger(page, runInfo.baseURL, ownerToken, 2);

    const namedRunIngest = page.getByRole('button', { name: '[RUN INGEST]' });
    await expect(namedRunIngest).toBeVisible();
    const runIngest = page.locator('.bracket-action--run-ingest');
    await runIngest.click();
    await expect(runIngest).toHaveText('[INGESTING...]');
    await expect(runIngest).toBeDisabled();
    await expect(runIngest).toHaveText('[RUN INGEST]', { timeout: 10_000 });
    await expect(page.locator('.source-ledger__header .source-ledger__status')).toContainText(/last_ingest:|err:/);
    await expect(page.locator('.source-ledger [role="progressbar"], .source-ledger [class*="spinner"]')).toHaveCount(0);
  });

  test('[RF-BUG-008] FETCH transitions and independent rows', async ({ page, request, runInfo, ownerToken }) => {
    const sources = sourceDefinitions();
    await seedSources(request, runInfo.baseURL, runInfo.dbPath, ownerToken, sources);
    await openLedger(page, runInfo.baseURL, ownerToken, sources.length);

    const alphaFetch = row(page, sources[0].id).locator('.bracket-action--fetch');
    const betaFetch = row(page, sources[1].id).locator('.bracket-action--fetch');
    await alphaFetch.click();
    await expect(alphaFetch).toHaveText('[FETCHING...]');
    await expect(betaFetch).toBeEnabled();
    await betaFetch.click();
    await expect(alphaFetch).toHaveText('[FETCHING...]');
    await expect(betaFetch).toHaveText('[FETCHING...]');
    await expect(page.getByRole('button', { name: '[RUN INGEST]' })).toBeEnabled();
    await expect(
      page.locator('.bracket-action--export-opml'),
      'expected independent pending and current-operation state'
    ).toHaveCount(0);

    await expect(alphaFetch).toHaveText('[FETCH]', { timeout: 10_000 });
    await expect(betaFetch).toHaveText('[FETCH]', { timeout: 10_000 });
    await expect(row(page, sources[0].id).locator('.source-ledger__status')).toContainText(/local|err:/);
    await expect(row(page, sources[1].id).locator('.source-ledger__status')).toContainText(/local|err:/);
  });

  test('[RF-BUG-008] ingest and fetch error transitions', async ({ page, request, runInfo, ownerToken }) => {
    const errorSource = { id: 'src_runtime_error', url: `${feedBaseURL}/error.xml`, title: 'Runtime Error Source' };
    await seedSources(request, runInfo.baseURL, runInfo.dbPath, ownerToken, [errorSource]);
    await openLedger(page, runInfo.baseURL, ownerToken, 1);

    const fetch = row(page, errorSource.id).locator('.bracket-action--fetch');
    await fetch.click();
    await expect(fetch).toHaveText('[FETCHING...]');
    await expect(fetch).toHaveText('[FETCH]', { timeout: 10_000 });
    const status = row(page, errorSource.id).locator('.source-ledger__status--error');
    await expect(status).toContainText(/^err:/);
    await expect(status).toHaveAttribute('aria-live', 'assertive');
    await expect(status).toHaveAttribute('title', /^err:/);
  });

  test('[RF-BUG-008] current-operation conflict detail', async ({ page, request, runInfo, ownerToken }) => {
    const conflictSource = { id: 'src_runtime_conflict', url: `${feedBaseURL}/conflict.xml`, title: 'Runtime Conflict Source' };
    await seedSources(request, runInfo.baseURL, runInfo.dbPath, ownerToken, [conflictSource]);
    await openLedger(page, runInfo.baseURL, ownerToken, 1);

    let cleanupConflictRequestStart = () => {};
    const conflictRequestStarted = new Promise<void>((resolve, reject) => {
      feedServer.on('request', onConflictRequestStart);
      const timeout = setTimeout(() => {
        cleanupConflictRequestStart();
        reject(new Error('timed out waiting for /conflict.xml request start'));
      }, 10_000);
      cleanupConflictRequestStart = () => {
        clearTimeout(timeout);
        feedServer.off('request', onConflictRequestStart);
      };
      function onConflictRequestStart(request: import('node:http').IncomingMessage) {
        if (request.url === '/conflict.xml') {
          cleanupConflictRequestStart();
          resolve();
        }
      }
    });

    try {
      const externalFetch = fetch(`${runInfo.baseURL}/api/sources/${conflictSource.id}/fetch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      await conflictRequestStarted;
      const runningOperation = async () => {
        const response = await request.get(`${runInfo.baseURL}/api/runtime/operation`, {
          headers: { Authorization: `Bearer ${ownerToken}` }
        });
        const body: { operation: { kind: string | null; actor_kind: string | null; phase: string | null } } = await response.json();
        return {
          kind: body.operation.kind,
          actor_kind: body.operation.actor_kind,
          phase: body.operation.phase
        };
      };
      await expect.poll(runningOperation, { timeout: 10_000 }).toEqual({
        kind: 'source_fetch',
        actor_kind: 'human',
        phase: 'fetching_source'
      });
      await row(page, conflictSource.id).locator('.bracket-action--fetch').click();

      const status = row(page, conflictSource.id).locator('.source-ledger__status');
      await expect(status).toContainText(/^err:/);
      await expect(status).toContainText('op: source_fetch');
      await expect(status).toContainText('actor:human');
      await expect(status).toContainText('phase:');
      await expect(status).toHaveAttribute('aria-live', 'assertive');
      expect((await externalFetch).status).toBe(200);
    } finally {
      cleanupConflictRequestStart();
    }
  });

  test('[RF-BUG-008] source info disclosure', async ({ page, request, runInfo, ownerToken }) => {
    const sources = sourceDefinitions();
    await seedSources(request, runInfo.baseURL, runInfo.dbPath, ownerToken, sources);
    await openLedger(page, runInfo.baseURL, ownerToken, sources.length);

    const disclosure = row(page, sources[0].id).locator('details.source-diagnostic-details');
    const summary = disclosure.locator('summary');
    await expect(summary).toHaveText('source info');
    await expect(summary).not.toHaveClass(/bracket-action/);
    await expect(disclosure).not.toHaveAttribute('open', '');
    await summary.click();
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(disclosure.locator('pre')).toContainText(`source_url: ${sources[0].url}`);
    await expect(disclosure.locator('pre')).toContainText('fetch_state: not_fetched');
    await expect(page.getByText('[DETAILS]')).toHaveCount(0);
  });
});
