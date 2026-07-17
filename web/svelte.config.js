import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const buildIdentity = process.env.RESOFEED_SVELTE_BUILD_IDENTITY;
if (!buildIdentity || !/^rf-[a-f0-9]{64}$/.test(buildIdentity)) {
  throw new Error('RESOFEED_SVELTE_BUILD_IDENTITY must be a canonical build identity');
}

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
