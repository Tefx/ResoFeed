import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'playwright/test';

import baseConfig from './playwright.config';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const artifactRoot = path.resolve(webRoot, '..', '.test-artifacts', 'playwright', 'rf-bug-010-artifact-proof');

fs.mkdirSync(path.join(artifactRoot, 'results'), { recursive: true });
process.env.PLAYWRIGHT_JSON_OUTPUT_NAME = path.join(artifactRoot, 'results', 'results.json');
process.env.PLAYWRIGHT_HTML_OUTPUT_DIR = path.join(artifactRoot, 'html-report');
process.env.PLAYWRIGHT_HTML_OPEN = 'never';

export default defineConfig({
  ...baseConfig,
  globalTeardown: undefined,
  outputDir: path.join(artifactRoot, 'test-output'),
  retries: 0,
  workers: 1,
  use: {
    ...baseConfig.use,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
