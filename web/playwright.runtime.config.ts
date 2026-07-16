import path from 'node:path';
import { defineConfig } from 'playwright/test';
import config, { artifactRoot } from './playwright.base.config';

export default defineConfig({
  ...config,
  testMatch: 'runtime.spec.ts',
  outputDir: path.join(artifactRoot, 'runtime', 'test-output'),
  reporter: [['line']],
  timeout: 45_000
});
