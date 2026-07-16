import path from 'node:path';
import { defineConfig, devices } from 'playwright/test';
import baseConfig, { artifactRoot, webRoot } from './playwright.base.config';

export default defineConfig({
  ...baseConfig,
  globalSetup: path.join(webRoot, 'tests', 'e2e', 'global-setup.ts'),
  globalTeardown: path.join(webRoot, 'tests', 'e2e', 'global-teardown.ts'),
  use: {
    ...baseConfig.use,
    baseURL: process.env.RESOFEED_E2E_BASE_URL
  },
  projects: [
    ...(baseConfig.projects ?? []),
    {
      name: 'live-openrouter',
      grep: /@(?:live-openrouter|llm-live)/,
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(artifactRoot, 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(artifactRoot, 'results', 'results.json') }],
    ['junit', { outputFile: path.join(artifactRoot, 'results', 'junit.xml') }]
  ]
});
