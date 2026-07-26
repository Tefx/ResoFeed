import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';

const frontendGap = 'IDL-FRONTEND-APP-HISTORY-GAP';

type RouteResult = {
  surface?: unknown;
  itemId?: unknown;
  itemRouteKind?: unknown;
  canonicalPath?: unknown;
  searchParams?: unknown;
  searchError?: unknown;
};

type RouteModule = Record<string, unknown> & {
  itemAppPath?: (itemId: string) => string;
  itemAppUrl?: (itemId: string, origin?: string) => string;
  itemAPIPath?: (itemId: string) => string;
  resolveWorkbenchRoute?: (pathname: string, search?: string, state?: unknown) => RouteResult;
  searchQueryString?: (params: Record<string, unknown>) => string;
};

type ApiClientModule = {
  ResoFeedApiClient: new (options: {
    ownerToken: string;
    baseUrl?: string;
    fetcher?: typeof fetch;
  }) => {
    item(id: string): Promise<unknown>;
    inspect(id: string): Promise<unknown>;
    resonance(id: string, resonated: boolean): Promise<unknown>;
    reingestItem(id: string): Promise<unknown>;
  };
};

function recordMismatch(gaps: string[], label: string, actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) gaps.push(`${label}=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

function callString(
  gaps: string[],
  label: string,
  fn: ((...args: never[]) => unknown) | undefined,
  ...args: unknown[]
): string | null {
  if (typeof fn !== 'function') {
    gaps.push(`${label} helper is not exported`);
    return null;
  }
  try {
    const value = fn(...args as never[]);
    if (typeof value !== 'string') {
      gaps.push(`${label} returned ${typeof value}`);
      return null;
    }
    return value;
  } catch (error) {
    gaps.push(`${label} threw ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function expectRejected(gaps: string[], label: string, action: () => unknown): void {
  try {
    action();
    gaps.push(`${label} was accepted`);
  } catch {
    // Rejection is the contract.
  }
}

function checkRoute(
  gaps: string[],
  route: RouteModule,
  label: string,
  pathname: string,
  expected: { itemId: string | null; kind: 'canonical' | 'legacy' | 'invalid'; canonicalPath: string | null }
): void {
  if (typeof route.resolveWorkbenchRoute !== 'function') {
    gaps.push('resolveWorkbenchRoute helper is not exported');
    return;
  }
  let result: RouteResult;
  try {
    result = route.resolveWorkbenchRoute(pathname);
  } catch (error) {
    gaps.push(`${label} parser threw ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  recordMismatch(gaps, `${label}.surface`, result.surface, 'inspector');
  recordMismatch(gaps, `${label}.itemId`, result.itemId, expected.itemId);
  recordMismatch(gaps, `${label}.itemRouteKind`, result.itemRouteKind, expected.kind);
  recordMismatch(gaps, `${label}.canonicalPath`, result.canonicalPath, expected.canonicalPath);
}

describe('ITEM-DEEP-LINK application and API route contract', () => {
  it('ITEM-DEEP-LINK app codec and API domain separation', async () => {
    const gaps: string[] = [];
    const route = await import('../workbench-route') as RouteModule;
    const api = await import('../api-client') as ApiClientModule;

    const fixtures = [
      { id: 'item_97a1df0284aabd9923cec462328a50f6', path: '/items/item_97a1df0284aabd9923cec462328a50f6' },
      { id: '~slash/%?hash#雪', path: '/items/%7Eslash%2F%25%3Fhash%23%E9%9B%AA' },
      { id: '.', path: '/items/!.' },
      { id: '..', path: '/items/!..' },
      { id: '!.', path: '/items/%21.' },
      { id: '!..', path: '/items/%21..' },
      { id: 'emoji-😀', path: '/items/emoji-%F0%9F%98%80' },
      { id: 'cafe\u0301', path: '/items/cafe%CC%81' }
    ] as const;

    for (const fixture of fixtures) {
      const actual = callString(gaps, `itemAppPath(${JSON.stringify(fixture.id)})`, route.itemAppPath, fixture.id);
      recordMismatch(gaps, `itemAppPath(${JSON.stringify(fixture.id)})`, actual, fixture.path);
      if (actual !== null) checkRoute(gaps, route, `parse ${fixture.path}`, actual, { itemId: fixture.id, kind: 'canonical', canonicalPath: null });
    }

    if (typeof route.itemAppPath === 'function') {
      for (const invalid of ['', '\u0000', '\u001f', '\u007f', '\u0085', '\ud800']) {
        expectRejected(gaps, `itemAppPath(${JSON.stringify(invalid)})`, () => route.itemAppPath?.(invalid));
      }
    }

    const explicitURL = callString(
      gaps,
      'itemAppUrl explicit origin',
      route.itemAppUrl,
      '~slash/%?hash#雪',
      'https://resofeed.example.test/'
    );
    recordMismatch(
      gaps,
      'itemAppUrl explicit origin',
      explicitURL,
      'https://resofeed.example.test/items/%7Eslash%2F%25%3Fhash%23%E9%9B%AA'
    );
    if (typeof route.itemAppUrl === 'function') {
      for (const invalidOrigin of [
        'ftp://resofeed.example.test',
        'https://owner:secret@resofeed.example.test',
        'https://resofeed.example.test/path',
        'https://resofeed.example.test/?token=secret',
        'https://resofeed.example.test/#fragment'
      ]) {
        expectRejected(gaps, `itemAppUrl origin ${JSON.stringify(invalidOrigin)}`, () => route.itemAppUrl?.('item_01', invalidOrigin));
      }
    }

    const legacyID = '~slash/%?hash#雪';
    const legacyPath = `/items/~${Buffer.from(legacyID, 'utf8').toString('base64url')}`;
    checkRoute(gaps, route, 'legacy route', legacyPath, {
      itemId: legacyID,
      kind: 'legacy',
      canonicalPath: '/items/%7Eslash%2F%25%3Fhash%23%E9%9B%AA'
    });
    checkRoute(gaps, route, 'dot sentinel', '/items/!.', { itemId: '.', kind: 'canonical', canonicalPath: null });
    checkRoute(gaps, route, 'dot-dot sentinel', '/items/!..', { itemId: '..', kind: 'canonical', canonicalPath: null });
    checkRoute(gaps, route, 'leading-bang ordinary ID', '/items/%21.', { itemId: '!.', kind: 'canonical', canonicalPath: null });
    checkRoute(gaps, route, 'leading-bang dot-dot ordinary ID', '/items/%21..', { itemId: '!..', kind: 'canonical', canonicalPath: null });
    for (const invalidPath of [
      '/items/',
      '/items/%ZZ',
      '/items/%00',
      '/items/item_01/extra',
      '/items/~***',
      '/items/~',
      '/items/%ED%A0%80'
    ]) {
      checkRoute(gaps, route, `invalid route ${invalidPath}`, invalidPath, { itemId: null, kind: 'invalid', canonicalPath: null });
    }

    const expectedAPIPath = `/api/items/~${Buffer.from(legacyID, 'utf8').toString('base64url')}`;
    const apiPath = callString(gaps, 'itemAPIPath', route.itemAPIPath, legacyID);
    recordMismatch(gaps, 'itemAPIPath', apiPath, expectedAPIPath);
    if (apiPath !== null && explicitURL !== null && explicitURL.endsWith(apiPath)) {
      gaps.push('browser application URL reused the API token domain');
    }

    const apiClientSource = readFileSync(new URL('../api-client.ts', import.meta.url), 'utf8');
    if (!/\bitemAPIPath\b/u.test(apiClientSource)) gaps.push('api-client.ts does not consume the independent itemAPIPath helper');
    if (/\bitemAppPath\b/u.test(apiClientSource)) gaps.push('api-client.ts consumes the browser itemAppPath helper');

    const calls: Array<{ url: string; method: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        method: init?.method ?? 'GET'
      });
      return new Response(JSON.stringify({
        item: { id: legacyID },
        item_id: legacyID,
        resolved_from_item_id: null,
        duplicate_target_item_id: null,
        duplicate_target_available: null,
        already_applied: false,
        human_inspected_at: null,
        is_resonated: true,
        reingest: { item_id: legacyID, status: 'completed', item_updated: true, fts_updated: true }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const client = new api.ResoFeedApiClient({ ownerToken: 'rfeed_item_deep_link_contract_owner_token', fetcher });
    try {
      await client.item(legacyID);
      await client.inspect(legacyID);
      await client.resonance(legacyID, true);
      await client.reingestItem(legacyID);
    } catch (error) {
      gaps.push(`API client contract calls threw ${error instanceof Error ? error.message : String(error)}`);
    }
    const expectedCalls = [
      { url: expectedAPIPath, method: 'GET' },
      { url: `${expectedAPIPath}/inspect`, method: 'POST' },
      { url: `${expectedAPIPath}/resonance`, method: 'POST' },
      { url: `${expectedAPIPath}/reingest`, method: 'POST' }
    ];
    recordMismatch(gaps, 'API item-operation paths', JSON.stringify(calls), JSON.stringify(expectedCalls));

    if (typeof route.searchQueryString !== 'function') {
      gaps.push('searchQueryString helper is not exported');
    } else {
      const search = route.searchQueryString({
        q: 'snow + 雪',
        source: 'Wire Desk',
        from: '2026-07-01',
        to: '2026-07-26',
        resonated: false,
        limit: 7
      });
      const expectedSearch = 'q=snow%20%2B%20%E9%9B%AA&source=Wire%20Desk&from=2026-07-01&to=2026-07-26&resonated=false&limit=7';
      recordMismatch(gaps, 'canonical Search query', search, expectedSearch);
      if (typeof route.resolveWorkbenchRoute === 'function') {
        const parsed = route.resolveWorkbenchRoute('/', `?${search}`);
        recordMismatch(gaps, 'canonical Search surface', parsed.surface, 'search');
        recordMismatch(gaps, 'canonical Search error', parsed.searchError, null);
        recordMismatch(gaps, 'canonical Search params', JSON.stringify(parsed.searchParams), JSON.stringify({
          q: 'snow + 雪',
          source: 'Wire Desk',
          from: '2026-07-01',
          to: '2026-07-26',
          resonated: false,
          limit: 7
        }));
        for (const invalidSearch of [
          '?source=Wire%20Desk',
          '?q=x&unknown=y',
          '?q=x&source=a&source=b',
          '?source=a&q=x',
          '?q=x+space',
          '?q=x&limit=050'
        ]) {
          const invalid = route.resolveWorkbenchRoute('/', invalidSearch);
          if (invalid.surface !== 'search' || typeof invalid.searchError !== 'string' || invalid.searchError.length === 0) {
            gaps.push(`invalid Search route ${invalidSearch} was not rejected before retrieval`);
          }
        }
      }
    }

    if (gaps.length > 0) {
      const detail = gaps.join('; ');
      throw new Error(`${frontendGap}: ${detail.length > 12000 ? `${detail.slice(0, 12000)}…` : detail}`);
    }

    console.info('ITEM_DEEP_LINK_APP_CODEC=complete');
    console.info('ITEM_DEEP_LINK_API_DOMAIN_SEPARATION=complete');
  });
});
