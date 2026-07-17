import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync } from 'node:fs';
import { compile, preprocess } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

type WorkbenchRouteModule = {
  encodeItemRouteToken(itemId: string): string;
  decodeItemRouteToken(token: string): string | null;
};

async function loadWorkbenchRoute(): Promise<WorkbenchRouteModule> {
  const specifier = '../workbench-route';
  try {
    return await import(/* @vite-ignore */ specifier) as WorkbenchRouteModule;
  } catch (error) {
    expect(error, 'expected canonical ~base64url token module to be importable').toBeUndefined();
    throw error;
  }
}

describe('RF-BUG-005 active Svelte runtime CSP styling', () => {
  it('keeps every active component and the generated announcer free of inline style mutation', async () => {
    const routesDirectory = new URL('../../routes/', import.meta.url);
    const componentURLs = [
      new URL('+layout.svelte', routesDirectory),
      new URL('+page.svelte', routesDirectory),
      ...readdirSync(new URL('components/', routesDirectory))
        .filter((name) => name.endsWith('.svelte'))
        .sort()
        .map((name) => new URL(`components/${name}`, routesDirectory))
    ];
    const appStyles = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

    for (const componentURL of componentURLs) {
      const source = readFileSync(componentURL, 'utf8');
      const compiled = compile(source, { filename: componentURL.pathname, generate: 'client', dev: false });
      expect(source, componentURL.pathname).not.toMatch(/<[^>]+\sstyle\s*=/iu);
      expect(source, componentURL.pathname).not.toMatch(/\.style(?:\.|\[|\.setProperty)/u);
      expect(compiled.js.code, componentURL.pathname).not.toMatch(/(?:set_style|\.style(?:\.|\[|\.setProperty))/u);
    }

    const routeSource = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
    expect(routeSource).not.toContain('applySplitScrollContainment');
    expect(routeSource).toContain('class="feed-pane utility-surface"');
    expect(routeSource).toContain('role="region" class="detail-pane"');

    const generatedRootURL = new URL('../../../.svelte-kit/generated/root.svelte', import.meta.url);
    const generatedRoot = readFileSync(generatedRootURL, 'utf8');
    const { cspRuntimeStyles } = await import('../csp-runtime-styles.js');
    const transformedRoot = await preprocess(generatedRoot, cspRuntimeStyles, { filename: generatedRootURL.pathname });
    expect(generatedRoot).toContain('<div id="svelte-announcer"');
    expect(transformedRoot.code).toContain('<div id="svelte-announcer" aria-live="assertive" aria-atomic="true" class="visually-hidden">');
    expect(transformedRoot.code).not.toMatch(/<div id="svelte-announcer"[^>]*\sstyle=/u);
    expect(compile(transformedRoot.code, { filename: generatedRootURL.pathname, generate: 'client', dev: false }).js.code).not.toContain('position: absolute; left: 0; top: 0');

    expect(appStyles).toMatch(/\.visually-hidden\s*\{[^}]*position:\s*absolute;[^}]*width:\s*1px;[^}]*height:\s*1px;[^}]*overflow:\s*hidden;/su);
    expect(appStyles).toMatch(/\.feed-pane\s*\{[^}]*overflow-y:\s*auto;/su);
    expect(appStyles).toMatch(/\.detail-pane\s*\{[^}]*max-height:\s*calc\(100vh - 130px\);[^}]*overflow-y:\s*auto;/su);
    expect(appStyles).toMatch(/\.detail-pane\.active-panel \.inspector-stable-landmark\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*100%;[^}]*flex-direction:\s*column;/su);
    expect(appStyles).toMatch(/\.detail-pane > \.inspector-stable-landmark > \.contract-inspector\s*\{[^}]*flex:\s*1 0 auto;[^}]*width:\s*100%;[^}]*min-height:\s*100%;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/su);
    expect(appStyles).toMatch(/@media \(max-width:\s*1079px\)[\s\S]*?\.detail-pane\.active-panel\s*\{[^}]*min-height:\s*0;[^}]*max-height:\s*none;/u);
  });
});

describe('RF-BUG-002 opaque item IDs', () => {
  it('uses ~ plus unpadded RFC4648 base64url and round-trips every UTF-8 byte', async () => {
    const itemIDs = [
      'item/segment',
      'item%percent',
      '项目/百分号%',
      'item?query#fragment',
      'item+plus space',
      '~already-token-like_-.',
      'ordinary-ascii-123',
      'emoji-😀',
      'cafe\u0301'
    ];

    expect(itemIDs).toHaveLength(9);
    expect(new Set(itemIDs).size).toBe(9);
    console.info('canonical ~base64url round-trip cases=9');

    const route = await loadWorkbenchRoute();
    for (const itemID of itemIDs) {
      const expected = `~${Buffer.from(itemID, 'utf8').toString('base64url')}`;
      const token = route.encodeItemRouteToken(itemID);
      expect(token, `expected canonical ~base64url token for ${JSON.stringify(itemID)}`).toBe(expected);
      expect(token).not.toMatch(/=|\+|\//u);
      expect(route.decodeItemRouteToken(token), `expected byte-identical route-token round trip for ${JSON.stringify(itemID)}`).toBe(itemID);
    }
  });

  it('rejects non-canonical, padded, malformed, and fatal UTF-8 tokens', async () => {
    const route = await loadWorkbenchRoute();
    for (const token of ['', 'plain-id', '~', '~a===', '~***', '~ww', '~wyg']) {
      expect(route.decodeItemRouteToken(token), `expected canonical ~base64url token rejection for ${JSON.stringify(token)}`).toBeNull();
    }
  });
});
