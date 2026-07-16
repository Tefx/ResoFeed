import { expect, test } from './fixtures/runtime-fixture';

test('[RF-BUG-010] mutating runtime owns case-local SQLite and browser state', async ({ page, request, runtime }) => {
  await page.goto(runtime.baseURL);
  await expect(page.getByRole('heading', { name: 'RESOFEED' })).toBeVisible();
  await expect(page.evaluate(() => window.localStorage.length)).resolves.toBe(0);
  await page.evaluate(() => window.localStorage.setItem('rf-bug-010-case-marker', 'owned'));
  await expect(page.evaluate(() => window.localStorage.getItem('rf-bug-010-case-marker'))).resolves.toBe('owned');

  const response = await request.put(`${runtime.baseURL}/api/runtime/language`, {
    headers: { Authorization: `Bearer ${runtime.ownerToken}` },
    data: {
      language: 'zh',
      actor_kind: 'human',
      actor_id: 'rf-bug-010-runtime-fixture',
      idempotency_key: `rf-bug-010-runtime-${Date.now()}`
    }
  });
  expect(response.status()).toBe(200);
  expect(runtime.database.path).toContain(test.info().outputDir);
});
