import path from 'node:path';
import { defineConfig } from 'playwright/test';
import config, { artifactRoot } from './playwright.base.config';

const artifactProof = process.env.RESOFEED_E2E_ARTIFACT_PROOF === '1';

export default defineConfig({
  ...config,
  testMatch: 'smoke.spec.ts',
  outputDir: path.join(artifactRoot, 'smoke', 'test-output'),
  reporter: [['line']],
  projects: (config.projects ?? []).map((project) => ({
    ...project,
    grep: artifactProof ? /intentional developer artifact proof$/u : project.grep,
    grepInvert: artifactProof ? /@(?:live-openrouter|llm-live)/u : /@(?:live-openrouter|llm-live)|intentional developer artifact proof$/u
  })),
  timeout: 30_000
});
