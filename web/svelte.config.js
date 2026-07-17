import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

import { resolveSvelteBuildIdentity } from '../scripts/resofeed-svelte-build-identity.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const buildIdentity = resolveSvelteBuildIdentity(repoRoot);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    version: {
      name: buildIdentity
    },
    paths: {
      relative: false
    }
  }
};

export default config;
