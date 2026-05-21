import { describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient } from './api-client';

type ActorKind = 'human' | 'agent';

interface ItemReingestRequest {
  actor_kind: ActorKind;
  actor_id: string;
  idempotency_key: string;
  /** null means use the server/runtime default model; the UI must not serialize an empty string. */
  model: string | null;
  /** One-time instruction for this retry only; it must not become durable runtime state. */
  prompt: string | null;
}

interface ItemReingestResponse {
  already_applied: boolean;
  reingest: {
    item_id: string;
    status: 'completed' | 'failed' | 'accepted';
    item_updated: boolean;
    fts_updated: boolean;
    model: string;
    item: {
      summary: string | null;
      core_insight: string | null;
      extraction_status: 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
      model_status: 'ok' | 'summary_unavailable' | 'model_latency_error';
    } | null;
  };
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
        model: 'openai/gpt-4.1-mini',
        item: {
          summary: 'Fresh summary after item-level re-ingest.',
          core_insight: 'Fresh core insight after item-level re-ingest.',
          extraction_status: 'full',
          model_status: 'ok'
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
});
