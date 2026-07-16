import path from 'node:path';
import { defineConfig } from 'playwright/test';
import { artifactRoot } from './playwright.base.config';
import config from './playwright.ci-safe.config';

export default defineConfig({
  ...config,
  testMatch: ['runtime.spec.ts', '*.runtime.spec.ts'],
  outputDir: path.join(artifactRoot, 'runtime', 'test-output'),
  reporter: [['line']],
  timeout: 45_000
});
