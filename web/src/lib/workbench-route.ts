export type WorkbenchSurface = 'feed' | 'inspector' | 'ledger' | 'search' | 'doctor';
export type ItemRouteKind = 'canonical' | 'legacy' | 'invalid' | null;

const workbenchSurfaceTitles: Record<WorkbenchSurface, string> = {
  feed: 'TODAY',
  inspector: 'INSPECTOR',
  ledger: 'SOURCE LEDGER',
  search: 'SEARCH',
  doctor: '/doctor'
};

export function workbenchDocumentTitle(surface: WorkbenchSurface): string {
  return `RESOFEED · ${workbenchSurfaceTitles[surface]}`;
}

export function searchResultActivationLabel(title: string, language: 'en' | 'zh'): string {
  return language === 'zh' ? `打开检查器：${title}` : `Open Inspector for: ${title}`;
}

export interface SearchRequestParams {
  q?: string;
  source?: string;
  from?: string;
  to?: string;
  resonated?: boolean;
  limit?: number;
}

export interface ResolvedWorkbenchRoute {
  surface: WorkbenchSurface;
  itemId: string | null;
  itemRouteKind: ItemRouteKind;
  canonicalPath: string | null;
  searchParams: SearchRequestParams | null;
  searchError: string | null;
}

export interface WorkbenchHistoryState {
  version: 1;
  surface: 'feed' | 'inspector' | 'search';
  itemId: string | null;
  originSurface: 'feed' | 'search' | null;
  feedPaneScrollTop: number;
  windowScrollY: number;
  searchRegionScrollTop: number;
  returnFocusItemId: string | null;
}

const utf8 = new TextEncoder();
const searchKeyOrder = ['q', 'source', 'from', 'to', 'resonated', 'limit'] as const;

function validItemId(itemId: string): boolean {
  return itemId.length > 0 && !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(itemId);
}

function assertValidItemId(itemId: string): void {
  if (!validItemId(itemId)) throw new TypeError('item ID must be non-empty Unicode scalar text without control characters');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** API-only opaque token. Browser application links use itemAppPath instead. */
export function encodeItemRouteToken(itemId: string): string {
  assertValidItemId(itemId);
  return `~${bytesToBase64(utf8.encode(itemId)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '')}`;
}

export function decodeItemRouteToken(token: string): string | null {
  if (!/^~[A-Za-z0-9_-]+$/u.test(token)) return null;
  const payload = token.slice(1);
  if (payload.length % 4 === 1) return null;
  try {
    const padded = payload.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - payload.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const itemId = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validItemId(itemId) && encodeItemRouteToken(itemId) === token ? itemId : null;
  } catch {
    return null;
  }
}

function encodeRFC3986Component(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function itemAppPath(itemId: string): string {
  assertValidItemId(itemId);
  if (itemId === '.') return '/items/!.';
  if (itemId === '..') return '/items/!..';
  let segment = encodeRFC3986Component(itemId);
  if (segment.startsWith('~')) segment = `%7E${segment.slice(1)}`;
  return `/items/${segment}`;
}

export function itemAppUrl(itemId: string, origin?: string): string {
  const source = origin ?? (typeof window !== 'undefined' ? window.location.origin : null);
  if (!source) throw new TypeError('an HTTP(S) origin is required outside a browser');
  const parsed = new URL(source);
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new TypeError('origin must be an HTTP(S) origin without credentials, path, query, or fragment');
  }
  return `${parsed.origin}${itemAppPath(itemId)}`;
}

export function itemAPIPath(itemId: string): string {
  return `/api/items/${encodeItemRouteToken(itemId)}`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeSearchRequestParams(params: SearchRequestParams):
  | { params: SearchRequestParams; error: null }
  | { params: null; error: string } {
  if (params.q === undefined || utf8.encode(params.q).length > 500) return { params: null, error: 'err: invalid search q' };
  if (params.source !== undefined && params.source.length === 0) return { params: null, error: 'err: invalid search source' };
  if (params.from !== undefined && !validDate(params.from)) return { params: null, error: 'err: invalid search from' };
  if (params.to !== undefined && !validDate(params.to)) return { params: null, error: 'err: invalid search to' };
  if (params.from !== undefined && params.to !== undefined && params.from > params.to) return { params: null, error: 'err: invalid search from' };
  if (params.resonated !== undefined && typeof params.resonated !== 'boolean') return { params: null, error: 'err: invalid search resonated' };
  if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)) return { params: null, error: 'err: invalid search limit' };
  return { params: { ...params }, error: null };
}

export function searchQueryString(params: SearchRequestParams): string {
  const normalized = normalizeSearchRequestParams(params);
  if (normalized.params === null) throw new TypeError(normalized.error);
  const entries: Array<[string, string]> = [['q', normalized.params.q ?? '']];
  if (normalized.params.source !== undefined) entries.push(['source', normalized.params.source]);
  if (normalized.params.from !== undefined) entries.push(['from', normalized.params.from]);
  if (normalized.params.to !== undefined) entries.push(['to', normalized.params.to]);
  if (normalized.params.resonated !== undefined) entries.push(['resonated', String(normalized.params.resonated)]);
  if (normalized.params.limit !== undefined && normalized.params.limit !== 50) entries.push(['limit', String(normalized.params.limit)]);
  return entries.map(([key, value]) => `${key}=${encodeRFC3986Component(value)}`).join('&');
}

function parseSearchQuery(search: string): { params: SearchRequestParams | null; error: string | null } {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return { params: null, error: null };
  const parts = raw.split('&');
  const params: SearchRequestParams = {};
  let previousIndex = -1;
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator < 0) return { params: {}, error: 'err: invalid search query' };
    const rawKey = part.slice(0, separator);
    const rawValue = part.slice(separator + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawValue);
    } catch {
      return { params: {}, error: 'err: invalid search query' };
    }
    const index = searchKeyOrder.indexOf(key as typeof searchKeyOrder[number]);
    if (index < 0 || index <= previousIndex) return { params: {}, error: `err: invalid search ${key || 'query'}` };
    previousIndex = index;
    if (key === 'q') params.q = value;
    else if (key === 'source') params.source = value;
    else if (key === 'from') params.from = value;
    else if (key === 'to') params.to = value;
    else if (key === 'resonated') {
      if (value !== 'true' && value !== 'false') return { params: {}, error: 'err: invalid search resonated' };
      params.resonated = value === 'true';
    } else if (key === 'limit') {
      if (!/^[1-9][0-9]*$/u.test(value)) return { params: {}, error: 'err: invalid search limit' };
      params.limit = Number(value);
    }
  }
  const normalized = normalizeSearchRequestParams(params);
  if (normalized.params === null) return { params, error: normalized.error };
  try {
    if (searchQueryString(normalized.params) !== raw) return { params: normalized.params, error: 'err: invalid search query' };
  } catch {
    return { params, error: 'err: invalid search query' };
  }
  return { params: normalized.params, error: null };
}

function itemRoute(pathname: string): Pick<ResolvedWorkbenchRoute, 'surface' | 'itemId' | 'itemRouteKind' | 'canonicalPath'> | null {
  if (!pathname.startsWith('/items')) return null;
  if (!pathname.startsWith('/items/')) return null;
  const segment = pathname.slice('/items/'.length);
  if (!segment || segment.includes('/')) return { surface: 'inspector', itemId: null, itemRouteKind: 'invalid', canonicalPath: null };
  if (segment === '!.' || segment === '!..') {
    return { surface: 'inspector', itemId: segment === '!.' ? '.' : '..', itemRouteKind: 'canonical', canonicalPath: null };
  }
  if (segment.startsWith('~')) {
    const itemId = decodeItemRouteToken(segment);
    return itemId === null
      ? { surface: 'inspector', itemId: null, itemRouteKind: 'invalid', canonicalPath: null }
      : { surface: 'inspector', itemId, itemRouteKind: 'legacy', canonicalPath: itemAppPath(itemId) };
  }
  try {
    const itemId = decodeURIComponent(segment);
    if (!validItemId(itemId) || itemAppPath(itemId) !== pathname) {
      return { surface: 'inspector', itemId: null, itemRouteKind: 'invalid', canonicalPath: null };
    }
    return { surface: 'inspector', itemId, itemRouteKind: 'canonical', canonicalPath: null };
  } catch {
    return { surface: 'inspector', itemId: null, itemRouteKind: 'invalid', canonicalPath: null };
  }
}

export function resolveWorkbenchRoute(pathname: string, search = '', _state: unknown = null): ResolvedWorkbenchRoute {
  const resolvedItem = itemRoute(pathname);
  if (resolvedItem) return { ...resolvedItem, searchParams: null, searchError: null };
  if (pathname === '/doctor') return { surface: 'doctor', itemId: null, itemRouteKind: null, canonicalPath: null, searchParams: null, searchError: null };
  if (pathname === '/source-ledger' || pathname === '/source' || pathname === '/sources') {
    return { surface: 'ledger', itemId: null, itemRouteKind: null, canonicalPath: null, searchParams: null, searchError: null };
  }
  if (pathname === '/' && search) {
    const parsed = parseSearchQuery(search);
    return { surface: 'search', itemId: null, itemRouteKind: null, canonicalPath: null, searchParams: parsed.params ?? {}, searchError: parsed.error };
  }
  return { surface: 'feed', itemId: null, itemRouteKind: null, canonicalPath: null, searchParams: null, searchError: null };
}

/** @deprecated API callers should use itemAPIPath; browser navigation should use itemAppPath. */
export const itemRoutePath = itemAppPath;
