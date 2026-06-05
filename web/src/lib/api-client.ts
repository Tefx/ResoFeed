import type {
  ApiErrorCode,
  CurrentOperationResponse,
  DeleteSourceResponse,
  ErrorBody,
  FeedTodayResponse,
  FetchSourceSuccessResponse,
  IngestRunResult,
  ImportOpmlResponse,
  InspectRequest,
  InspectResponse,
  ItemDetailResponse,
  ItemReingestRequest,
  ItemReingestResponse,
  ManualRssFetchApiResult,
  ManualRssFetchErrorBody,
  OpaqueId,
  OpenRouterModelListResponse,
  ProcessingLanguage,
  ProcessingLanguageResponse,
  ResonanceRequest,
  ResonanceResponse,
  ReprocessLibraryRequest,
  ReprocessLibraryResponse,
  RestoreResult,
  RunIngestSuccessResponse,
  RulesResponse,
  SearchResponse,
  SetProcessingLanguageRequest,
  SourcesResponse,
  StateBundleV1,
  SteerPreviewRequest,
  SteerPreviewResponse,
  SteerRequest,
  SteerResponse,
  SteerUndoRequest,
  SteerUndoResult
} from '$lib/api-contract';
import { processingLanguageRuntimeContract } from '$lib/api-contract';
import { normalizeCurrentOperationInfo } from '$lib/current-operation';

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

export interface TodayFeedRequestParams {
  limit?: number;
  offset?: number;
}

export class ResoFeedApiError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 500 | 503;
  readonly body: ErrorBody;

  constructor(status: 400 | 401 | 404 | 409 | 500 | 503, body: ErrorBody) {
    super(`err: ${body.error.code}: ${body.error.message}`);
    this.name = 'ResoFeedApiError';
    this.status = status;
    this.body = body;
  }
}

const emptyDetails: ErrorBody['error']['details'] = {};
const runtimeEndpoints = processingLanguageRuntimeContract.endpoints;

interface IngestEnvelope {
  ingest: IngestRunResult;
  source?: unknown;
}

type ManualFetchSuccessBody = IngestEnvelope | RunIngestSuccessResponse;

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

function isManualRssFetchErrorBody(value: ManualRssFetchErrorBody): boolean {
  return (
    typeof value.error?.code === 'string' &&
    typeof value.error?.message === 'string' &&
    typeof value.error?.details === 'object' &&
    value.error.details !== null
  );
}

function isIngestEnvelope(body: ManualFetchSuccessBody): body is IngestEnvelope {
  return 'ingest' in body;
}

function normalizeIngestEnvelope(body: ManualFetchSuccessBody, operation: RunIngestSuccessResponse['operation']): RunIngestSuccessResponse {
  if (!isIngestEnvelope(body)) {
    return body.operation === operation ? body : { ...body, operation };
  }
  const ingest = body.ingest;
  return {
    operation,
    source_id: ingest.source_id,
    completed: ingest.status !== 'failed',
    sources_total: ingest.sources_attempted + ingest.sources_skipped,
    sources_fetched: ingest.sources_succeeded,
    items_discovered: ingest.items_discovered ?? ingest.items_upserted,
    items_upserted: ingest.items_upserted,
    errors: ingest.errors,
    completed_at: ingest.completed_at,
    scope: ingest.scope,
    status: ingest.status,
    started_at: ingest.started_at,
    duration_ms: ingest.duration_ms,
    sources_attempted: ingest.sources_attempted,
    sources_succeeded: ingest.sources_succeeded,
    sources_failed: ingest.sources_failed,
    sources_skipped: ingest.sources_skipped
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProcessingLanguage(value: unknown): value is ProcessingLanguage {
  return value === 'en' || value === 'zh';
}

function normalizeCurrentOperationResponse(value: unknown): CurrentOperationResponse | null {
  if (!isRecord(value) || !isRecord(value.operation)) return null;
  const operation = normalizeCurrentOperationInfo(value.operation);
  return operation ? { operation } : null;
}

function isProcessingLanguageResponse(value: unknown): value is ProcessingLanguageResponse {
  if (!isRecord(value) || !isRecord(value.language)) return false;
  const { code, label } = value.language;
  return isProcessingLanguage(code) && (label === 'English' || label === '中文') &&
    (value.already_applied === undefined || typeof value.already_applied === 'boolean');
}

function isOpenRouterModelListResponse(value: unknown): value is OpenRouterModelListResponse {
  return isRecord(value) && Array.isArray(value.models) && value.models.every((model) => (
    isRecord(model) && typeof model.id === 'string' && model.id.length > 0 && typeof model.name === 'string' && model.name.length > 0
  ));
}

function isReprocessLibraryResponse(value: unknown): value is ReprocessLibraryResponse {
  if (!isRecord(value) || !isRecord(value.reprocess) || typeof value.already_applied !== 'boolean') return false;
  const result = value.reprocess;
  return (
    (result.status === 'completed' || result.status === 'completed_with_errors' || result.status === 'failed') &&
    isProcessingLanguage(result.language) &&
    typeof result.started_at === 'string' &&
    typeof result.completed_at === 'string' &&
    typeof result.items_attempted === 'number' &&
    typeof result.items_updated === 'number' &&
    typeof result.items_indexed === 'number' &&
    typeof result.items_unavailable === 'number' &&
    typeof result.items_failed === 'number' &&
    typeof result.fts_rebuilt === 'boolean' &&
    Array.isArray(result.errors) &&
    result.errors.every((error) => isRecord(error) && (typeof error.item_id === 'string' || error.item_id === null) && typeof error.code === 'string' && typeof error.message === 'string')
  );
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
    this.reingestItem = this.reingestItem.bind(this);
  }

  async today(request?: number | TodayFeedRequestParams): Promise<FeedTodayResponse> {
    const query = new URLSearchParams();
    if (typeof request === 'number') {
      if (request !== 50) query.set('limit', String(request));
    } else {
      if (request?.limit !== undefined && (request.limit !== 50 || request.offset !== undefined)) query.set('limit', String(request.limit));
      if (request?.offset !== undefined) query.set('offset', String(request.offset));
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const primaryPath = `/api/feed/today${suffix}`;
    const compatibilityPath = suffix ? '/api/feed/today' : '/api/feed/today?limit=50';
    try {
      const response = await this.request<FeedTodayResponse>(primaryPath);
      if (Array.isArray(response.items) && response.items.length === 0) {
        try {
          const compatibilityResponse = await this.request<FeedTodayResponse>(compatibilityPath);
          if (Array.isArray(compatibilityResponse.items) && compatibilityResponse.items.length > 0) return compatibilityResponse;
        } catch {
          // Keep the primary successful empty response when the compatibility path is unavailable.
        }
      }
      return response;
    } catch (error) {
      if (error instanceof Error) return this.request<FeedTodayResponse>(compatibilityPath);
      throw error;
    }
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

  async reingestItem(id: OpaqueId, request?: Partial<ItemReingestRequest>): Promise<ItemReingestResponse> {
    const compatibilityRequest = request as (Partial<ItemReingestRequest> & { extra_prompt?: string | null }) | undefined;
    const model = request?.model?.trim() ?? '';
    const prompt = request?.prompt?.trim() ?? '';
    const extraPrompt = compatibilityRequest?.extra_prompt?.trim() ?? '';
    const promptFields = compatibilityRequest && Object.prototype.hasOwnProperty.call(compatibilityRequest, 'extra_prompt')
      ? { extra_prompt: extraPrompt.length > 0 ? extraPrompt : null }
      : { prompt: prompt.length > 0 ? prompt : null };
    return this.request<ItemReingestResponse>(`/api/items/${encodeURIComponent(id)}/reingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('reingest', id),
        model: model.length > 0 ? model : null,
        ...promptFields
      })
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

  async previewSteer(command: string, request?: Partial<Omit<SteerPreviewRequest, 'command'>>): Promise<SteerPreviewResponse> {
    return this.request<SteerPreviewResponse>('/api/steer/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        command
      } satisfies SteerPreviewRequest)
    });
  }

  async undoSteer(
    targetKind: SteerUndoRequest['target_kind'],
    targetId: string,
    request?: Partial<Omit<SteerUndoRequest, 'target_kind' | 'target_id'>>
  ): Promise<SteerUndoResult> {
    return this.request<SteerUndoResult>('/api/steer/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('steer-undo', targetId),
        target_kind: targetKind,
        target_id: targetId
      } satisfies SteerUndoRequest)
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

  async exportOpml(): Promise<string> {
    const response = await this.fetcher(`${this.baseUrl}/api/sources/export-opml`, {
      headers: { Authorization: `Bearer ${this.ownerToken}` }
    });

    if (!response.ok) {
      await this.throwCanonicalError(response);
    }

    return response.text();
  }

  async runIngest(): Promise<ManualRssFetchApiResult<RunIngestSuccessResponse>> {
    const result = await this.manualRssFetchRequest<ManualFetchSuccessBody>('/api/ingest');
    return result.ok ? { ...result, body: normalizeIngestEnvelope(result.body, 'ingest') } : result;
  }

  async fetchSource(sourceId: OpaqueId): Promise<ManualRssFetchApiResult<FetchSourceSuccessResponse>> {
    const result = await this.manualRssFetchRequest<ManualFetchSuccessBody>(
      `/api/sources/${encodeURIComponent(sourceId)}/fetch`
    );
    return result.ok ? { ...result, body: normalizeIngestEnvelope(result.body, 'source_fetch') } : result;
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

  async processingLanguage(): Promise<ProcessingLanguageResponse> {
    const response = await this.request<unknown>(runtimeEndpoints.getLanguage.replace('GET ', ''));
    if (!isProcessingLanguageResponse(response)) {
      throw new ResoFeedApiError(500, fallbackError('internal', 'invalid processing language response'));
    }
    return response;
  }

  async currentOperation(): Promise<CurrentOperationResponse> {
    const response = await this.request<unknown>(runtimeEndpoints.currentOperation.replace('GET ', ''));
    const normalized = normalizeCurrentOperationResponse(response);
    if (!normalized) {
      throw new ResoFeedApiError(500, fallbackError('internal', 'invalid current operation response'));
    }
    return normalized;
  }

  async openRouterModels(): Promise<OpenRouterModelListResponse> {
    const response = await this.openRouterModelsFromCompatibleRoutes();
    if (!isOpenRouterModelListResponse(response)) {
      throw new ResoFeedApiError(500, fallbackError('internal', 'invalid OpenRouter model list response'));
    }
    return response;
  }

  private async openRouterModelsFromCompatibleRoutes(): Promise<unknown> {
    try {
      return await this.request<unknown>(runtimeEndpoints.openRouterModels.replace('GET ', ''));
    } catch (error) {
      if (error instanceof ResoFeedApiError && (error.status === 404 || error.status === 500)) {
        return this.request<unknown>('/api/runtime/openrouter/models');
      }
      throw error;
    }
  }

  async setProcessingLanguage(
    language: ProcessingLanguage,
    request?: Partial<Omit<SetProcessingLanguageRequest, 'language'>>
  ): Promise<ProcessingLanguageResponse> {
    const response = await this.request<unknown>(runtimeEndpoints.setLanguage.replace('PUT ', ''), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('language', language)
      } satisfies SetProcessingLanguageRequest)
    });
    if (!isProcessingLanguageResponse(response)) {
      throw new ResoFeedApiError(500, fallbackError('internal', 'invalid processing language response'));
    }
    return response;
  }

  async reprocessLibrary(request?: Partial<ReprocessLibraryRequest>): Promise<ReprocessLibraryResponse> {
    const response = await this.request<unknown>(runtimeEndpoints.reprocessLibrary.replace('POST ', ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_kind: request?.actor_kind ?? 'human',
        actor_id: request?.actor_id ?? 'owner',
        idempotency_key: request?.idempotency_key ?? mutationKey('reprocess', 'library')
      } satisfies ReprocessLibraryRequest)
    });
    if (!isReprocessLibraryResponse(response)) {
      return response as ReprocessLibraryResponse;
    }
    return response;
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
      const contentType = response.headers.get('Content-Type') ?? '';
      if (contentType.toLowerCase().includes('text/plain')) {
        const diagnostic = (await response.text()).trim();
        throw new Error(diagnostic || 'err: doctor unavailable');
      }
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

  private async manualRssFetchRequest<T>(path: string): Promise<ManualRssFetchApiResult<T>> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.ownerToken}`
      },
      body: '{}'
    });

    if (response.status === 200) {
      return { ok: true, status: 200, body: await parseJson<T>(response) };
    }

    if (response.status === 404 || response.status === 409) {
      const fallback: ManualRssFetchErrorBody = {
        error: {
          code: response.status === 404 ? 'not_found' : 'conflict',
          message: response.status === 404 ? 'source not found' : 'ingest already running',
          details: emptyDetails
        }
      };

      try {
        const parsed = await parseJson<ManualRssFetchErrorBody>(response);
        return {
          ok: false,
          status: response.status,
          body: isManualRssFetchErrorBody(parsed) ? parsed : fallback
        };
      } catch {
        return { ok: false, status: response.status, body: fallback };
      }
    }

    await this.throwCanonicalError(response);
    throw new Error('unreachable');
  }

  private async throwCanonicalError(response: Response): Promise<never> {
    let body = fallbackError('internal', 'unexpected api error');
    try {
      const parsed = await parseJson<ErrorBody>(response);
      body = isCanonicalErrorBody(parsed) ? parsed : body;
    } catch {
      body = fallbackError('internal', 'unexpected api error');
    }
    throw new ResoFeedApiError(response.status as 400 | 401 | 404 | 409 | 500 | 503, body);
  }
}
