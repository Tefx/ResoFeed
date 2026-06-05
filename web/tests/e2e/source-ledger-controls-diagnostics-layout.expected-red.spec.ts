import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';

const longDiagnostic =
  'err: timeout while fetching https://very-long-source.example.com/feeds/research/2026/05/14/extremely/deep/path/that/should/ellipsis.xml after 20s';

const sources = [
  {
    id: 'src_long_diagnostic',
    url: 'https://very-long-source.example.com/feeds/research/2026/05/14/extremely/deep/path/that/should/ellipsis.xml',
    title: 'Long Diagnostic Source',
    last_fetch_at: '2026-05-15T14:02:05Z',
    last_fetch_status: 'rss_fetch_error',
    last_fetch_error: longDiagnostic,
    is_active: true,
    revision: 7
  },
  {
    id: 'src_ok',
    url: 'https://ok.example.test/feed.xml',
    title: 'Operational Source',
    last_fetch_at: '2026-05-15T14:03:06Z',
    last_fetch_status: 'ok',
    last_fetch_error: null,
    is_active: true,
    revision: 3
  }
] as const;

type ManualRequest = 'run-ingest' | 'fetch-source';

async function installFixtureApi(page: Page, ownerToken: string, requests: ManualRequest[]): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/state/export') {
      return route.fulfill({
        json: {
          schema_version: 'resofeed.state.v1',
          exported_at: '2026-05-15T14:00:00Z',
          sources: [],
          steer_rules: [],
          resonated_items: []
        }
      });
    }
    if (url.pathname === '/api/ingest' && request.method() === 'POST') {
      requests.push('run-ingest');
      return route.fulfill({
        json: {
          ingest: {
            status: 'completed',
            scope: 'all',
            source_id: null,
            started_at: '2026-05-15T14:04:00Z',
            completed_at: '2026-05-15T14:04:02Z',
            sources_attempted: 2,
            sources_succeeded: 2,
            sources_failed: 0,
            items_upserted: 4,
            errors: []
          }
        }
      });
    }
    if (url.pathname === '/api/sources/src_long_diagnostic/fetch' && request.method() === 'POST') {
      requests.push('fetch-source');
      return route.fulfill({
        json: {
          ingest: {
            status: 'failed',
            scope: 'source',
            source_id: 'src_long_diagnostic',
            started_at: '2026-05-15T14:05:00Z',
            completed_at: '2026-05-15T14:05:20Z',
            sources_attempted: 1,
            sources_succeeded: 0,
            sources_failed: 1,
            items_upserted: 0,
            errors: [{ source_id: 'src_long_diagnostic', code: 'timeout', message: longDiagnostic }]
          },
          source: sources[0]
        }
      });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openSourceLedger(page: Page, ownerToken: string, requests: ManualRequest[]): Promise<void> {
  await installFixtureApi(page, ownerToken, requests);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);
}

test.describe('expected-red Source Ledger manual controls, diagnostics, and geometry', () => {
  test('Issue 1: header renders [RUN INGEST], stable [INGESTING...] hitbox, POST /api/ingest, and terse completion feedback', async ({ page, ownerToken }) => {
    const requests: ManualRequest[] = [];
    await openSourceLedger(page, ownerToken, requests);

    const ledger = page.locator('.source-ledger');
    const runIngest = ledger.locator('.bracket-action--run-ingest');
    await expect(runIngest, 'Source Ledger header must expose the canonical run-ingest bracket action').toHaveText('[RUN INGEST]');
    const before = await runIngest.boundingBox();
    await runIngest.click();
    await expect(runIngest, 'pending ingest text must be terminal-synchronous with no spinner').toHaveText('[INGESTING...]');
    const pending = await runIngest.boundingBox();
    expect(pending, 'run-ingest hitbox must remain stable while pending').toEqual(before);
    await expect.poll(() => requests.filter((request) => request === 'run-ingest').length).toBe(1);
    await expect(ledger.locator('.source-ledger__header-actions .source-ledger__status')).toHaveText(/last_ingest:|ingest complete|err: ingest already running|err:/i);
  });

  test('Issue 2: every desktop and mobile source row renders [FETCH], stable [FETCHING...] hitbox, and POSTs to /api/sources/{id}/fetch', async ({ page, ownerToken }) => {
    const requests: ManualRequest[] = [];
    await openSourceLedger(page, ownerToken, requests);

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }] as const) {
      await page.setViewportSize(viewport);
      const rows = page.locator('.source-ledger__row');
      await expect(rows).toHaveCount(sources.length);
      for (let index = 0; index < sources.length; index += 1) {
        await expect(rows.nth(index).locator('.bracket-action--fetch'), `row ${index + 1} must expose canonical [FETCH] at ${viewport.width}px`).toHaveText('[FETCH]');
      }
    }

    const firstFetch = page.locator('.source-ledger__row').first().locator('.bracket-action--fetch');
    const before = await firstFetch.boundingBox();
    await firstFetch.click();
    await expect(firstFetch).toHaveText('[FETCHING...]');
    expect(await firstFetch.boundingBox(), 'fetch hitbox must remain stable while pending').toEqual(before);
    await expect.poll(() => requests.filter((request) => request === 'fetch-source').length).toBe(1);
  });

  test('Issues 4 and 5: raw err diagnostics render inline in stable Source Ledger columns on desktop and mobile', async ({ page, ownerToken }) => {
    const requests: ManualRequest[] = [];
    await openSourceLedger(page, ownerToken, requests);

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }] as const) {
      await page.setViewportSize(viewport);
      const row = page.locator('.source-ledger__row', { hasText: 'Long Diagnostic Source' }).first();
      await expect(row.locator('.source-ledger__name'), `name column must be stable at ${viewport.width}px`).toHaveText('Long Diagnostic Source');
      await expect(row.locator('.source-ledger__url'), `URL column must be stable at ${viewport.width}px`).toHaveText(/https:\/\/very-long-source\.example\.com/);
      const status = row.locator('.source-ledger__status.source-ledger__status--error');
      await expect(status, `raw err diagnostic must be inline beside the affected row at ${viewport.width}px`).toContainText(longDiagnostic);
      await expect(status).toHaveAttribute('title', longDiagnostic);
      await expect(row.locator('.source-ledger__actions'), `actions must be right-aligned in their own column at ${viewport.width}px`).toHaveCSS('justify-content', /flex-end|end/);
    }
  });

  test('Issue 6: visible [IMPORT OPML] is keyboard-reachable button semantics while the file input remains reachable', async ({ page, ownerToken }) => {
    const requests: ManualRequest[] = [];
    await openSourceLedger(page, ownerToken, requests);

    const ledger = page.locator('.source-ledger');
    const importButton = ledger.getByRole('button', { name: '[IMPORT OPML]' });
    await expect(importButton, 'visible OPML action must be a named keyboard button, not only a label').toBeVisible();
    await expect(importButton).toHaveClass(/bracket-action/);
    for (let index = 0; index < 2; index += 1) await page.keyboard.press('Tab');
    await expect(importButton, 'keyboard tab order must reach visible [IMPORT OPML]').toBeFocused();
    const fileInput = ledger.locator('input[type="file"][accept*="xml"]');
    await expect(fileInput, 'hidden file input must remain programmatically reachable by stable selector').toHaveAttribute('id', 'opml-file');
    await expect(fileInput, 'hidden file input must not duplicate the visible OPML button accessible name').not.toHaveAccessibleName(/import OPML/i);
    await expect(fileInput, 'hidden file input is implementation plumbing outside the accessibility tree').toHaveAttribute('aria-hidden', 'true');
  });

  test('R6: delete and confirm are canonical bracket actions with terminal hover/focus inversion', async ({ page, ownerToken }) => {
    const requests: ManualRequest[] = [];
    await openSourceLedger(page, ownerToken, requests);

    const row = page.locator('.source-ledger__row', { hasText: 'Long Diagnostic Source' }).first();
    const deleteButton = row.getByRole('button', { name: 'Delete source: Long Diagnostic Source' });
    await expect(deleteButton).toHaveClass(/bracket-action/);
    await expect(deleteButton).toHaveClass(/bracket-action--delete/);
    await deleteButton.hover();
    await expect(deleteButton).toHaveCSS('background-color', 'rgb(36, 35, 30)');
    await expect(deleteButton).toHaveCSS('color', 'rgb(243, 240, 231)');

    await deleteButton.click();
    const confirmButton = row.getByRole('button', { name: 'confirm delete source: Long Diagnostic Source' });
    await expect(confirmButton).toHaveText('[CONFIRM]');
    await expect(confirmButton).toHaveClass(/bracket-action/);
    await expect(confirmButton).toHaveClass(/bracket-action--confirm/);
    await confirmButton.focus();
    await expect(confirmButton).toHaveCSS('background-color', 'rgb(36, 35, 30)');
    await expect(confirmButton).toHaveCSS('color', 'rgb(243, 240, 231)');
  });

  test('Issue 13: delete confirmation preserves Source Ledger row bounds', async ({ page, ownerToken }) => {
    const requests: ManualRequest[] = [];
    await openSourceLedger(page, ownerToken, requests);

    const row = page.locator('.source-ledger__row', { hasText: 'Long Diagnostic Source' }).first();
    const before = await row.boundingBox();
    await row.getByRole('button', { name: 'Delete source: Long Diagnostic Source' }).click();
    await expect(row.getByRole('button', { name: 'confirm delete source: Long Diagnostic Source' })).toBeVisible();
    expect(await row.boundingBox(), 'delete confirmation must not shift row height or bounds').toEqual(before);
  });
});
