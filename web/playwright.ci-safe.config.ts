import { defineConfig } from 'playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  retries: 0,
  workers: 1,
  projects: (config.projects ?? []).filter((project) => project.name === 'chromium-ci-safe')
});
