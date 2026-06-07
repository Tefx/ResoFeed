import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { execSync } from 'child_process';

import fs from 'fs';

let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short=8 HEAD').toString().trim();
} catch (e) {
  // Ignore
}
let pkgVersion = 'unknown';
try {
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  pkgVersion = pkg.version;
} catch (e) {
  // Ignore
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
