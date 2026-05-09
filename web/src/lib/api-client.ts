import type {
  ApiErrorCode,
  DeleteSourceResponse,
  ErrorBody,
  FeedTodayResponse,
  ImportOpmlResponse,
  InspectRequest,
  InspectResponse,
  ItemDetailResponse,
  OpaqueId,
  ResonanceRequest,
  ResonanceResponse,
  RestoreResult,
  RulesResponse,
  SearchResponse,
  SourcesResponse,
  StateBundleV1,
  SteerRequest,
  SteerResponse
} from '$lib/api-contract';

export interface ResoFeedApiClientOptions {
  ownerToken: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export interface SearchRequestParams {
  q?: string;
  source?: string;
  from?: string;
  to?: string;
  resonated?: boolean;
  limit?: number;
}

export class ResoFeedApiError extends Error {
  readonly status: 400 | 401 | 404 | 500;
  readonly body: ErrorBody;

  constructor(status: 400 | 401 | 404 | 500, body: ErrorBody) {
    super(`err: ${body.error.code}: ${body.error.message}`);
    this.name = 'ResoFeedApiError';
    this.status = status;
    this.body = body;
  }
}

const emptyDetails: ErrorBody['error']['details'] = {};

function fallbackError(code: ApiErrorCode, message: string): ErrorBody {
  return { error: { code, message, details: emptyDetails } };
}

function isCanonicalErrorBody(value: ErrorBody): boolean {
  return (
    typeof value.error?.code === 'string' &&
    typeof value.error?.message === 'string' &&
    typeof value.error?.details === 'object' &&
    value.error.details !== null
  );
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function mutationKey(prefix: string, id: string): string {
  return `${prefix}-${id}-${Date.now().toString(36)}`;
}

export class ResoFeedApiClient {
  readonly ownerToken: string;
  readonly baseUrl: string;
  readonly fetcher: typeof fetch;

  constructor(options: ResoFeedApiClientOptions) {
    this.ownerToken = options.ownerToken;
    this.baseUrl = options.baseUrl ?? '';
    this.fetcher = options.fetcher ?? fetch;
  }

  async today(limit?: number): Promise<FeedTodayResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<FeedTodayResponse>(`/api/feed/today${suffix}`);
  }

  async item(id: OpaqueId): Promise<ItemDetailResponse> {
    return this.request<ItemDetailResponse>(`/api/items/${encodeURIComponent(id)}`);
  }

  async inspect(id: OpaqueId, request?: Partial<InspectRequest>): Promise<InspectResponse> {
    return this.request<InspectResponse>(`/api/items/${encodeURIComponent(id)}/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('inspect', id)
      } satisfies InspectRequest)
    });
  }

  async resonance(id: OpaqueId, resonated: boolean, request?: Partial<ResonanceRequest>): Promise<ResonanceResponse> {
    return this.request<ResonanceResponse>(`/api/items/${encodeURIComponent(id)}/resonance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('resonance', id),
        resonated
      } satisfies ResonanceRequest)
    });
  }

  async steer(command: string, request?: Partial<SteerRequest>): Promise<SteerResponse> {
    return this.request<SteerResponse>('/api/steer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('steer', 'owner'),
        command
      } satisfies SteerRequest)
    });
  }

  async activeRules(): Promise<RulesResponse> {
    return this.request<RulesResponse>('/api/steer/active');
  }

  async sources(): Promise<SourcesResponse> {
    return this.request<SourcesResponse>('/api/sources');
  }

  async deleteSource(id: OpaqueId): Promise<DeleteSourceResponse> {
    return this.request<DeleteSourceResponse>(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async importOpml(opml: string): Promise<ImportOpmlResponse> {
    return this.request<ImportOpmlResponse>('/api/sources/import-opml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: opml
    });
  }

  async search(params: SearchRequestParams): Promise<SearchResponse> {
    const query = new URLSearchParams();
    if (params.q !== undefined) query.set('q', params.q);
    if (params.source !== undefined) query.set('source', params.source);
    if (params.from !== undefined) query.set('from', params.from);
    if (params.to !== undefined) query.set('to', params.to);
    if (params.resonated !== undefined) query.set('resonated', String(params.resonated));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<SearchResponse>(`/api/search${suffix}`);
  }

  async exportState(): Promise<StateBundleV1> {
    return this.request<StateBundleV1>('/api/state/export');
  }

  async importState(bundle: StateBundleV1): Promise<RestoreResult> {
    return this.request<RestoreResult>('/api/state/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle)
    });
  }

  async doctor(): Promise<string> {
    const response = await this.fetcher(`${this.baseUrl}/api/doctor`, {
      headers: { Authorization: `Bearer ${this.ownerToken}` }
    });
    if (!response.ok) {
      await this.throwCanonicalError(response);
    }
    return response.text();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.ownerToken}`
      }
    });

    if (!response.ok) {
      await this.throwCanonicalError(response);
    }

    return parseJson<T>(response);
  }

  private async throwCanonicalError(response: Response): Promise<never> {
    let body = fallbackError('internal', 'unexpected api error');
    try {
      const parsed = await parseJson<ErrorBody>(response);
      body = isCanonicalErrorBody(parsed) ? parsed : body;
    } catch {
      body = fallbackError('internal', 'unexpected api error');
    }
    throw new ResoFeedApiError(response.status as 400 | 401 | 404 | 500, body);
  }
}
