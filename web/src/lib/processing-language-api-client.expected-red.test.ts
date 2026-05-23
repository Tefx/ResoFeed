import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { ResoFeedApiClient } from './api-client';
import type {
  ProcessingLanguageResponse,
  ReprocessErrorCode,
  ReprocessLibraryResponse,
  SetProcessingLanguageRequest
} from './api-contract';

interface ExpectedRuntimeLanguageClient {
  processingLanguage: () => Promise<ProcessingLanguageResponse>;
  setProcessingLanguage: (
    language: SetProcessingLanguageRequest['language'],
    request?: Partial<Omit<SetProcessingLanguageRequest, 'language'>>
  ) => Promise<ProcessingLanguageResponse>;
  reprocessLibrary: (request?: Partial<SetProcessingLanguageRequest>) => Promise<ReprocessLibraryResponse>;
}

describe('expected-red API client runtime language contract', () => {
  it('exposes typed processing-language and reprocess methods on the frontend client', () => {
    const client: ExpectedRuntimeLanguageClient = new ResoFeedApiClient({ ownerToken: 'rfeed_type_contract_expected_red_000000000000' });

    expectTypeOf(client.processingLanguage).returns.resolves.toEqualTypeOf<ProcessingLanguageResponse>();
    expectTypeOf(client.setProcessingLanguage).parameters.toEqualTypeOf<[
      SetProcessingLanguageRequest['language'],
      Partial<Omit<SetProcessingLanguageRequest, 'language'>>?
    ]>();
    expectTypeOf(client.setProcessingLanguage).returns.resolves.toEqualTypeOf<ProcessingLanguageResponse>();
    expectTypeOf(client.reprocessLibrary).returns.resolves.toEqualTypeOf<ReprocessLibraryResponse>();
  });

  it('keeps architecture-required reprocess/model failure codes in the frontend contract', () => {
    const architectureRequiredCodes = [
      'rss_fetch_error',
      'model_latency_error',
      'summary_unavailable',
      'original_unavailable',
      'timeout',
      'invalid_model',
      'provider_error',
      'rate_limited',
      'decode_error',
      'internal'
    ] satisfies ReprocessErrorCode[];

    expect(architectureRequiredCodes).toContain('invalid_model');
    expect(architectureRequiredCodes).toContain('provider_error');
    expect(architectureRequiredCodes).toContain('rate_limited');
    expect(architectureRequiredCodes).toContain('decode_error');
    expect(architectureRequiredCodes).toContain('timeout');
  });

  it('calls the strict runtime language and reprocess endpoints with owner-token authorization', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ language: { code: 'en', label: 'English' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const client = new ResoFeedApiClient({ ownerToken: 'rfeed_runtime_language_expected_red_000000000000', fetcher }) as ResoFeedApiClient & ExpectedRuntimeLanguageClient;

    await client.processingLanguage();
    expect(fetcher).toHaveBeenCalledWith('/api/runtime/language', {
      headers: { Authorization: 'Bearer rfeed_runtime_language_expected_red_000000000000' }
    });

    await client.setProcessingLanguage('zh', { actor_kind: 'human', actor_id: 'owner', idempotency_key: 'lang-zh-1' });
    expect(fetcher).toHaveBeenCalledWith('/api/runtime/language', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer rfeed_runtime_language_expected_red_000000000000',
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        language: 'zh',
        actor_kind: 'human',
        actor_id: 'owner',
        idempotency_key: 'lang-zh-1'
      })
    }));

    await client.reprocessLibrary({ actor_kind: 'human', actor_id: 'owner', idempotency_key: 'reprocess-1' });
    expect(fetcher).toHaveBeenCalledWith('/api/runtime/reprocess-library', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer rfeed_runtime_language_expected_red_000000000000',
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ actor_kind: 'human', actor_id: 'owner', idempotency_key: 'reprocess-1' })
    }));
  });
});
