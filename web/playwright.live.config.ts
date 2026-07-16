import { defineConfig } from 'playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  projects: (config.projects ?? []).filter((project) => project.name === 'live-openrouter'),
  retries: 0,
  workers: 1
});
