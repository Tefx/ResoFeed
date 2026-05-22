import { describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient } from './api-client';
import type { ItemReingestRequest, ItemReingestResponse } from './api-contract';

interface ItemReingestCompatibilityRequest extends Omit<ItemReingestRequest, 'prompt'> {
  /** Backward-compatible alias accepted by the backend contract and normalized to prompt semantics. */
  extra_prompt: string | null;
}

interface ExpectedItemReingestClient {
  reingestItem: (itemId: string, request?: Partial<ItemReingestRequest>) => Promise<ItemReingestResponse>;
}

function jsonResponse(body: ItemReingestResponse): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('expected-red item re-ingest API client contract', () => {
  it('exposes a typed item-scoped re-ingest method without changing existing product endpoints', () => {
    const client = new ResoFeedApiClient({ ownerToken: 'rfeed_item_reingest_contract_0000000000000000' });
    const reingestItem = (client as Partial<ExpectedItemReingestClient>).reingestItem;

    expect(reingestItem, 'product gap: frontend client must expose item-scoped reingestItem').toBeTypeOf('function');
  });

  it('sends Default model as model:null and one-time prompt only in the request body', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      already_applied: false,
      reingest: {
        item_id: 'item_reingest_expected_red',
        status: 'completed',
        item_updated: true,
        fts_updated: true,
        language: 'en',
        error: null,
        item: {
          id: 'item_reingest_expected_red',
          source_id: 'source_reingest_expected_red',
          source_title: 'Contract Source',
          url: 'https://example.test/item',
          title: 'Contract item',
          summary: 'Fresh summary after item-level re-ingest.',
          core_insight: 'Fresh core insight after item-level re-ingest.',
          display_excerpt: null,
          value_tier: null,
          published_at: null,
          first_seen_at: null,
          extraction_status: 'full',
          model_status: 'ok',
          is_resonated: false,
          human_inspected_at: null,
          external_surfaced_at: null,
          story_key: null,
          duplicate_of_item_id: null,
          feed_excerpt: null,
          extracted_text: null,
          provenance: {
            source_url: 'https://example.test/feed.xml',
            canonical_url: null,
            original_url: 'https://example.test/item',
            story_key: null,
            duplicate_of_item_id: null,
            grouped_source_items: []
          }
        }
      }
    }));
    const client = new ResoFeedApiClient({ ownerToken: 'rfeed_item_reingest_api_000000000000000000', fetcher });
    const reingestItem = (client as Partial<ExpectedItemReingestClient>).reingestItem;

    expect(reingestItem, 'product gap: missing item re-ingest API client method').toBeTypeOf('function');
    if (typeof reingestItem !== 'function') return;

    await reingestItem('item_reingest_expected_red', {
      actor_kind: 'human',
      actor_id: 'owner',
      idempotency_key: 'item-reingest-1',
      model: null,
      prompt: 'Retry with a stricter article-only extraction prompt.'
    });

    expect(fetcher).toHaveBeenCalledWith('/api/items/item_reingest_expected_red/reingest', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer rfeed_item_reingest_api_000000000000000000',
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        actor_kind: 'human',
        actor_id: 'owner',
        idempotency_key: 'item-reingest-1',
        model: null,
        prompt: 'Retry with a stricter article-only extraction prompt.'
      } satisfies ItemReingestRequest)
    }));
  });

  it('expected-red: serializes compatibility extra_prompt without silently dropping one-time retry instructions', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      already_applied: false,
      reingest: {
        item_id: 'item_reingest_extra_prompt_expected_red',
        status: 'completed',
        item_updated: true,
        fts_updated: true,
        language: 'en',
        error: null,
        item: null
      }
    }));
    const client = new ResoFeedApiClient({ ownerToken: 'rfeed_item_reingest_extra_prompt_00000000', fetcher });
    const compatibilityClient = client as ResoFeedApiClient & {
      reingestItem: (itemId: string, request: Partial<ItemReingestCompatibilityRequest>) => Promise<ItemReingestResponse>;
    };

    await compatibilityClient.reingestItem('item_reingest_extra_prompt_expected_red', {
      actor_kind: 'human',
      actor_id: 'owner',
      idempotency_key: 'item-reingest-extra-prompt-1',
      model: ' openrouter/contract-model ',
      extra_prompt: '  one-time compatibility instruction  '
    });

    expect(fetcher).toHaveBeenCalledWith('/api/items/item_reingest_extra_prompt_expected_red/reingest', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        actor_kind: 'human',
        actor_id: 'owner',
        idempotency_key: 'item-reingest-extra-prompt-1',
        model: 'openrouter/contract-model',
        extra_prompt: 'one-time compatibility instruction'
      } satisfies ItemReingestCompatibilityRequest)
    }));
  });

  it('parses the backend-selected item re-ingest response envelope without stale frontend-only fields', async () => {
    const backendJsonFixture = {
      reingest: {
        item_id: 'runtime_item_01',
        status: 'completed',
        language: 'zh',
        item_updated: true,
        fts_updated: true,
        error: null,
        item: null
      },
      already_applied: false
    } satisfies ItemReingestResponse;

    expect(Object.keys(backendJsonFixture.reingest).sort()).toEqual([
      'error',
      'fts_updated',
      'item',
      'item_id',
      'item_updated',
      'language',
      'status'
    ]);
    expect('accepted' in backendJsonFixture.reingest).toBe(false);
    expect('model' in backendJsonFixture.reingest).toBe(false);
    expect(backendJsonFixture).toMatchObject({
      already_applied: false,
      reingest: {
        item_id: 'runtime_item_01',
        status: 'completed',
        language: 'zh',
        item_updated: true,
        fts_updated: true,
        error: null,
        item: null
      }
    });
  });

  it('keeps malformed provider errors generic and does not leak provider secrets through client errors', async () => {
    const fetcher = vi.fn(async () => new Response('OpenRouter failed: sk-or-secret-provider-token', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    }));
    const client = new ResoFeedApiClient({ ownerToken: 'rfeed_item_reingest_error_safety_000000', fetcher });

    await expect(client.reingestItem('item_reingest_error_safe', { idempotency_key: 'safe-error-1' })).rejects.toThrow('err: internal: unexpected api error');
    await expect(client.reingestItem('item_reingest_error_safe', { idempotency_key: 'safe-error-2' })).rejects.not.toThrow(/sk-or-secret-provider-token/u);
  });
});
