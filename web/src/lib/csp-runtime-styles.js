const announcerInlineStyle = 'style="position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px"';

/** @type {import('svelte/compiler').PreprocessorGroup} */
export const cspRuntimeStyles = {
  name: 'resofeed-csp-runtime-styles',
  markup({ content, filename }) {
    if (!filename?.replaceAll('\\', '/').endsWith('/.svelte-kit/generated/root.svelte')) return;
    if (!content.includes('id="svelte-announcer"')) return;
    if (!content.includes(announcerInlineStyle)) {
      if (/<div id="svelte-announcer"[^>]*\sstyle=/u.test(content)) {
        throw new Error('SvelteKit announcer inline-style contract changed; update the CSP class transform');
      }
      return;
    }
    return { code: content.replace(announcerInlineStyle, 'class="visually-hidden"') };
  }
};
