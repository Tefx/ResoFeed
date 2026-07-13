export type WorkbenchSurface = 'feed' | 'inspector' | 'ledger' | 'search' | 'doctor';

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
  searchParams: SearchRequestParams | null;
  searchError: string | null;
}

const searchKeys = new Set(['q', 'source', 'from', 'to', 'resonated', 'limit']);
const utf8 = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function encodeItemRouteToken(itemId: string): string {
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
    return encodeItemRouteToken(itemId) === token ? itemId : null;
  } catch {
    return null;
  }
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
  if (params.q !== undefined && utf8.encode(params.q).length > 500) return { params: null, error: 'err: invalid search q' };
  if (params.source !== undefined && params.source.length === 0) return { params: null, error: 'err: invalid search source' };
  if (params.from !== undefined && !validDate(params.from)) return { params: null, error: 'err: invalid search from' };
  if (params.to !== undefined && !validDate(params.to)) return { params: null, error: 'err: invalid search to' };
  if (params.from !== undefined && params.to !== undefined && params.from > params.to) return { params: null, error: 'err: invalid search from' };
  if (params.resonated !== undefined && typeof params.resonated !== 'boolean') return { params: null, error: 'err: invalid search resonated' };
  if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)) return { params: null, error: 'err: invalid search limit' };
  return { params: { ...params }, error: null };
}

function decodeQueryComponent(value: string): string {
  return decodeURIComponent(value.replace(/\+/gu, ' '));
}

function parseSearchQuery(search: string): { recognized: boolean; params: SearchRequestParams; error: string | null } {
  const params: SearchRequestParams = {};
  const seen = new Set<string>();
  let recognized = false;
  let firstUnknownKey: string | null = null;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return { recognized, params, error: null };

  for (const part of raw.split('&')) {
    if (!part) continue;
    const separator = part.indexOf('=');
    const rawKey = separator >= 0 ? part.slice(0, separator) : part;
    const rawValue = separator >= 0 ? part.slice(separator + 1) : '';
    let key: string;
    try {
      key = decodeQueryComponent(rawKey);
    } catch {
      return { recognized, params, error: 'err: invalid search query' };
    }
    if (!searchKeys.has(key)) {
      if (recognized) return { recognized, params, error: `err: invalid search ${key || 'query'}` };
      firstUnknownKey ??= key || 'query';
      continue;
    }
    recognized = true;
    if (seen.has(key)) return { recognized, params, error: `err: invalid search ${key}` };
    seen.add(key);

    let value: string;
    try {
      value = decodeQueryComponent(rawValue);
    } catch {
      return { recognized, params, error: `err: invalid search ${key}` };
    }
    if (key === 'q') params.q = value;
    else if (key === 'source') params.source = value;
    else if (key === 'from') params.from = value;
    else if (key === 'to') params.to = value;
    else if (key === 'resonated') {
      if (value !== 'true' && value !== 'false') return { recognized, params, error: 'err: invalid search resonated' };
      params.resonated = value === 'true';
    } else if (key === 'limit') {
      if (!/^[0-9]+$/u.test(value)) return { recognized, params, error: 'err: invalid search limit' };
      params.limit = Number(value);
    }
  }

  if (recognized && firstUnknownKey !== null) return { recognized, params, error: `err: invalid search ${firstUnknownKey}` };
  const normalized = normalizeSearchRequestParams(params);
  return normalized.params === null
    ? { recognized, params, error: normalized.error }
    : { recognized, params: normalized.params, error: null };
}

function historySearchQuery(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('surface' in state) || (state as { surface?: unknown }).surface !== 'search') return null;
  const query = 'searchQuery' in state ? (state as { searchQuery?: unknown }).searchQuery : '';
  return typeof query === 'string' ? query : '';
}

export function resolveWorkbenchRoute(pathname: string, search = '', state: unknown = null): ResolvedWorkbenchRoute {
  if (pathname === '/doctor') return { surface: 'doctor', itemId: null, searchParams: null, searchError: null };
  if (pathname === '/source-ledger' || pathname === '/source' || pathname === '/sources') {
    return { surface: 'ledger', itemId: null, searchParams: null, searchError: null };
  }
  if (pathname.startsWith('/items/')) {
    const token = pathname.slice('/items/'.length).split('/')[0] ?? '';
    return { surface: 'inspector', itemId: decodeItemRouteToken(token), searchParams: null, searchError: null };
  }
  if (pathname === '/') {
    const parsed = parseSearchQuery(search);
    const stateQuery = historySearchQuery(state);
    if (parsed.recognized || stateQuery !== null) {
      const params = parsed.recognized ? parsed.params : { q: stateQuery ?? '' };
      return { surface: 'search', itemId: null, searchParams: params, searchError: parsed.error };
    }
  }
  return { surface: 'feed', itemId: null, searchParams: null, searchError: null };
}

export function searchQueryString(params: SearchRequestParams): string {
  const query = new URLSearchParams();
  if (params.q !== undefined) query.set('q', params.q);
  if (params.source !== undefined) query.set('source', params.source);
  if (params.from !== undefined) query.set('from', params.from);
  if (params.to !== undefined) query.set('to', params.to);
  if (params.resonated !== undefined) query.set('resonated', String(params.resonated));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  return query.toString();
}

export function itemRoutePath(itemId: string): string {
  return `/items/${encodeItemRouteToken(itemId)}`;
}
