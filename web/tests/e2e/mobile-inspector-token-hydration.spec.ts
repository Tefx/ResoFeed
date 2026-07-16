import { expect, test } from './fixtures';
import type { Page } from 'playwright/test';

type PromptProbeWindow = Window & { __resofeedSawTokenPrompt?: boolean };

async function installTokenPromptProbe(page: Page, ownerToken?: string): Promise<void> {
  await page.addInitScript((token?: string) => {
    if (token) window.localStorage.setItem('resofeed.ownerToken', token);
    const probeWindow = window as PromptProbeWindow;
    probeWindow.__resofeedSawTokenPrompt = false;
    const markIfPromptRendered = () => {
      if (document.querySelector('#owner-token-input, .contract-token-prompt')) probeWindow.__resofeedSawTokenPrompt = true;
    };
    new MutationObserver(markIfPromptRendered).observe(document.documentElement, { childList: true, subtree: true });
    markIfPromptRendered();
  }, ownerToken);
}

test('saved token + narrow Inspector URL hard reload keeps Inspector without token prompt', async ({ page, runInfo, ownerToken }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installTokenPromptProbe(page, ownerToken);

  await page.goto('/items/rf-bug-010-missing-item');
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#owner-token-input')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'INSPECTOR independent scroll' })).toBeVisible();
  await expect(page).toHaveURL(/\/items\/rf-bug-010-missing-item$/u);
  await expect.poll(async () => page.evaluate(() => (window as PromptProbeWindow).__resofeedSawTokenPrompt)).toBe(false);
  expect(runInfo.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
});

test('no saved token on narrow Inspector URL still shows owner token prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installTokenPromptProbe(page);

  await page.goto('/items/mobile-auth-regression-smoke');

  await expect(page.locator('#owner-token-input')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
});
