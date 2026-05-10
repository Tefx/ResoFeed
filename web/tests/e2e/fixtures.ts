import fs from 'node:fs';

import { expect, test as base } from 'playwright/test';

import type { E2ERunInfo } from './e2e-contract';

interface ResoFeedFixtures {
  readonly runInfo: E2ERunInfo;
  readonly ownerToken: string;
}

function loadRunInfo(): E2ERunInfo {
  const infoPath = process.env.RESOFEED_E2E_RUN_INFO;
  if (!infoPath) throw new Error('RESOFEED_E2E_RUN_INFO missing; global setup did not run');
  return JSON.parse(fs.readFileSync(infoPath, 'utf8')) as E2ERunInfo;
}

export const test = base.extend<ResoFeedFixtures>({
  runInfo: async ({}, use) => {
    await use(loadRunInfo());
  },
  ownerToken: async ({ runInfo }, use) => {
    await use(runInfo.ownerToken);
  }
});

export { expect };
