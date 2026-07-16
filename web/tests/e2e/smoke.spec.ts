import { expect, test } from './fixtures/runtime-fixture';

test('[RF-BUG-010] isolated smoke boots the real owner-token boundary', async ({ page, request, runtime }) => {
  const unauthorized = await request.get(`${runtime.baseURL}/api/feed/today`);
  expect(unauthorized.status()).toBe(401);

  await page.goto(runtime.baseURL);
  await expect(page.getByRole('heading', { name: 'RESOFEED' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Enter owner token' })).toBeVisible();
  await expect(page.evaluate(() => window.localStorage.length)).resolves.toBe(0);
});

test('[RF-BUG-010] intentional developer artifact proof', async ({ page, runtime }, testInfo) => {
  await page.goto(runtime.baseURL);
  await expect(page.getByRole('textbox', { name: 'Enter owner token' })).toBeVisible();
  console.log('RF-BUG-010_ASSERTION_REACHED=ready');
  await page.screenshot({ path: testInfo.outputPath('assertion-reached.png') });
  expect('actual', 'RF-BUG-010_INTENTIONAL_ASSERTION').toBe('expected');
});
