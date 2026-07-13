import type { APIRequestContext, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const sources = [
  { id: 'src_delete_alpha', url: 'https://delete-alpha.example.test/feed.xml', title: 'Delete Alpha' },
  { id: 'src_delete_beta', url: 'https://delete-beta.example.test/feed.xml', title: 'Delete Beta' }
] as const;
const savedItem = {
  item_id: 'item_saved_after_source_delete',
  url: 'https://delete-alpha.example.test/items/saved',
  source_url: sources[0].url,
  title: 'Saved item remains after source deletion'
} as const;

async function seedDeleteFixture(request: APIRequestContext, baseURL: string, ownerToken: string): Promise<void> {
  const response = await request.post(`${baseURL}/api/state/import`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      schema_version: 'resofeed.state.v1',
      exported_at: '2026-07-12T12:00:00Z',
      sources,
      steer_rules: [],
      resonated_items: [savedItem]
    }
  });
  expect(response.status(), 'real delete fixture State import').toBe(200);
}

async function openLedger(page: Page, baseURL: string, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );
  await page.goto(`${baseURL}/source-ledger`);
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await expect(page.locator('.source-ledger__row')).toHaveCount(sources.length);
}

function sourceRow(page: Page, sourceId: string) {
  return page.locator(`.source-ledger__row[data-source-id="${sourceId}"]`);
}

test.describe('RF-BUG-008 Source Ledger delete browser contract', () => {
  test('[RF-BUG-008] delete cancel restores focus', async ({ page, request, runInfo, ownerToken }) => {
    await seedDeleteFixture(request, runInfo.baseURL, ownerToken);
    await openLedger(page, runInfo.baseURL, ownerToken);

    const row = sourceRow(page, sources[0].id);
    const deleteButton = row.getByRole('button', { name: `Delete source: ${sources[0].title}` });
    const initialBox = await row.boundingBox();
    await deleteButton.click();

    const confirm = row.getByRole('button', { name: new RegExp(`Confirm delete source ${sources[0].title}`, 'i') });
    const cancel = row.getByRole('button', { name: '[CANCEL]' });
    await expect(confirm).toHaveText('[CONFIRM DELETE]');
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAccessibleName(new RegExp(`Future fetches stop; saved items remain`, 'i'));
    await expect(cancel).toBeVisible();
    await expect(row).toContainText(`Delete source “${sources[0].title}”? Future fetches stop; saved items remain.`);
    expect(await row.boundingBox(), 'delete confirmation keeps row geometry stable').toEqual(initialBox);

    await cancel.click();
    await expect(deleteButton).toBeFocused();
    await expect(deleteButton).toBeEnabled();
    await expect(deleteButton).toHaveText('[DELETE]');
    await expect(row.getByRole('button', { name: '[CONFIRM DELETE]' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: '[CANCEL]' })).toHaveCount(0);
  });

  test('[RF-BUG-008] delete success preserves saved items and moves focus', async ({ page, request, runInfo, ownerToken }) => {
    await seedDeleteFixture(request, runInfo.baseURL, ownerToken);
    await openLedger(page, runInfo.baseURL, ownerToken);

    const deletedRow = sourceRow(page, sources[0].id);
    await deletedRow.getByRole('button', { name: `Delete source: ${sources[0].title}` }).click();
    const confirm = deletedRow.getByRole('button', { name: new RegExp(`Confirm delete source ${sources[0].title}`, 'i') });
    await confirm.click();

    await expect(deletedRow).toHaveCount(0);
    await expect(sourceRow(page, sources[1].id).locator('.bracket-action--fetch')).toBeFocused();
    const itemResponse = await request.get(`${runInfo.baseURL}/api/items/${savedItem.item_id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(itemResponse.status(), 'saved items remain readable after deleting only the source subscription').toBe(200);
    const sourcesResponse = await request.get(`${runInfo.baseURL}/api/sources`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(sourcesResponse.status()).toBe(200);
    const body = await sourcesResponse.json() as { sources: Array<{ id: string }> };
    expect(body.sources.map((source) => source.id)).not.toContain(sources[0].id);
    expect(body.sources.map((source) => source.id)).toContain(sources[1].id);
  });
});
