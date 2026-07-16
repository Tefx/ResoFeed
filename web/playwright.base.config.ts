import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from 'playwright/test';

export const webRoot = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(webRoot, '..');
export const artifactRoot = path.join(repoRoot, '.test-artifacts', 'playwright');

export default defineConfig({
  testDir: path.join(webRoot, 'tests', 'e2e'),
  outputDir: path.join(artifactRoot, 'test-output'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(artifactRoot, 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(artifactRoot, 'results', 'results.json') }],
    ['junit', { outputFile: path.join(artifactRoot, 'results', 'junit.xml') }]
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000
  },
  projects: [{
    name: 'chromium-ci-safe',
    grepInvert: /@(?:live-openrouter|llm-live)/,
    use: { ...devices['Desktop Chrome'] }
  }],
  expect: { timeout: 5_000 }
});
