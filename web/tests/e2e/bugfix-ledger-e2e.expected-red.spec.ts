import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './fixtures';

interface IsolationObservation {
  readonly cleanupPath: string;
  readonly dbPath: string;
  readonly outputDir: string;
}

let observation: IsolationObservation | undefined;

test('[RF-BUG-010] mutating cases own isolated state and cleanup', async ({ page, request, runInfo, ownerToken }, testInfo) => {
  await page.goto(runInfo.baseURL);
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await expect(page.evaluate(() => window.localStorage.length), 'new mutating case starts with a clean browser context').resolves.toBe(0);

  observation = {
    cleanupPath: testInfo.outputPath('runtime-cleanup.txt'),
    dbPath: runInfo.dbPath,
    outputDir: testInfo.outputDir
  };

  const mutation = await request.put(`${runInfo.baseURL}/api/runtime/language`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      language: 'zh',
      actor_kind: 'human',
      actor_id: 'rf-bug-010-isolation',
      idempotency_key: `rf-bug-010-isolation-${Date.now()}`
    }
  });
  expect(mutation.status(), 'real product mutation reaches the case runtime').toBe(200);
});

test.afterAll(() => {
  expect(observation, 'selected isolation case must record owned runtime resources').toBeDefined();
  if (!observation) return;

  const cleanup = fs.existsSync(observation.cleanupPath)
    ? fs.readFileSync(observation.cleanupPath, 'utf8')
    : '';
  const relativeDatabase = path.relative(observation.outputDir, observation.dbPath);
  const databaseIsCaseLocal = relativeDatabase !== '' && !relativeDatabase.startsWith('..') && !path.isAbsolute(relativeDatabase);
  const cleanupIsComplete = !fs.existsSync(observation.dbPath) && /(?:^|\s)cleanup=clean(?:\s|$)/u.test(cleanup) && !/(?:^|\s)cleanup=residue(?:\s|$)/u.test(cleanup);

  expect(
    { databaseIsCaseLocal, cleanupIsComplete },
    'expected case-local database and complete cleanup'
  ).toEqual({ databaseIsCaseLocal: true, cleanupIsComplete: true });
});
