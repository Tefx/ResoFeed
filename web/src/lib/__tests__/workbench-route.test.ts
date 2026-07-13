import { Buffer } from 'node:buffer';
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

describe('RF-BUG-002 opaque item IDs', () => {
  it('uses ~ plus unpadded RFC4648 base64url and round-trips every UTF-8 byte', async () => {
    const route = await loadWorkbenchRoute();
    const itemIDs = [
      'item/segment',
      'item%percent',
      '项目/百分号%',
      'item?query#fragment',
      'item+plus space',
      '~already-token-like_-.'
    ];

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
