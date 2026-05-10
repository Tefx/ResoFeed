import { defineConfig, devices } from 'playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, '..');
const artifactRoot = path.join(repoRoot, '.test-artifacts', 'playwright');

export default defineConfig({
  testDir: path.join(webRoot, 'tests', 'e2e'),
  globalSetup: path.join(webRoot, 'tests', 'e2e', 'global-setup.ts'),
  globalTeardown: path.join(webRoot, 'tests', 'e2e', 'global-teardown.ts'),
  outputDir: path.join(artifactRoot, 'test-output'),
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(artifactRoot, 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(artifactRoot, 'results', 'results.json') }],
    ['junit', { outputFile: path.join(artifactRoot, 'results', 'junit.xml') }]
  ],
  use: {
    baseURL: process.env.RESOFEED_E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000
  },
  projects: [
    {
      name: 'chromium-ci-safe',
      grepInvert: /@(?:live-openrouter|llm-live)/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'live-openrouter',
      grep: /@(?:live-openrouter|llm-live)/,
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  expect: {
    timeout: 5_000
  }
});
