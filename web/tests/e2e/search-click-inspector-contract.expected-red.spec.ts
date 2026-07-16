import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

async function acceptToken(page: Page, baseURL: string, ownerToken: string): Promise<void> {
  await page.goto(baseURL);
  const input = page.getByRole('textbox', { name: 'Owner token' });
  if (await input.isVisible()) {
    await input.fill(ownerToken);
    await page.getByRole('button', { name: '[SUBMIT]' }).click();
  }
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function openSearch(page: Page, baseURL: string, ownerToken: string): Promise<void> {
  await acceptToken(page, baseURL, ownerToken);
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search rf-bug-010-no-match');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.getByRole('heading', { name: 'SEARCH' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Plain text query' })).toHaveValue('rf-bug-010-no-match');
}

test.describe('legacy search-click lane remains a real-runtime migration sentinel', () => {
  test('desktop search preserves its query and visible filtered slice', async ({ page, runInfo, ownerToken }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSearch(page, runInfo.baseURL, ownerToken);
    await page.getByRole('button', { name: 'submit search' }).click();
    await expect(page.locator('#search-status')).toContainText('0 results');
    await expect(page.getByRole('textbox', { name: 'Plain text query' })).toHaveValue('rf-bug-010-no-match');
  });

  test('search submission is keyboard operable on the real product surface', async ({ page, runInfo, ownerToken }) => {
    await openSearch(page, runInfo.baseURL, ownerToken);
    const submit = page.getByRole('button', { name: 'submit search' });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#search-status')).toContainText('0 results');
  });

  test('mobile Search route survives navigation and browser Back', async ({ page, runInfo, ownerToken }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, runInfo.baseURL, ownerToken);
    await page.goto(`${runInfo.baseURL}/source-ledger`);
    await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'SEARCH' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Plain text query' })).toHaveValue('rf-bug-010-no-match');
  });

  test('empty search creates no ghost Inspector summary or core sections', async ({ page, runInfo, ownerToken }) => {
    await openSearch(page, runInfo.baseURL, ownerToken);
    await page.getByRole('button', { name: 'submit search' }).click();
    await expect(page.locator('#search-status')).toContainText('0 results');
    await expect(page.getByLabel('Summary')).toHaveCount(0);
    await expect(page.getByLabel('Core insight')).toHaveCount(0);
  });

  test('search migration sentinel forbids modal, recommendation, and tab detours', async ({ page, runInfo, ownerToken }) => {
    await openSearch(page, runInfo.baseURL, ownerToken);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/recommended|related stories|saved search|unread|mark all read/i)).toHaveCount(0);
  });
});
