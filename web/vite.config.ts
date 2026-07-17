import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveSvelteBuildIdentity } from '../scripts/resofeed-svelte-build-identity.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const buildIdentity = resolveSvelteBuildIdentity(repoRoot);

const commitHash = buildIdentity.slice(3, 11);
let pkgVersion = 'unknown';
try {
  const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
  pkgVersion = pkg.version;
} catch {
  // The rendered version stays explicit when package metadata is unavailable.
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(commitHash),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkgVersion)
  },
  plugins: [sveltekit()],
  resolve: {
    conditions: ['browser']
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', 'tests/e2e/**']
  }
});
