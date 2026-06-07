import { describe, expect, it, vi } from 'vitest';

import { ResoFeedApiClient } from './api-client';
import type { ItemDetail, ItemReingestRequest, ItemReingestResponse } from './api-contract';

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

const preservedContentAfterFailedReingest: ItemDetail = {
  id: 'item_reingest_failed_preserves_content',
  source_id: 'source_literal_tldr',
  source_title: 'TLDR AI Feed',
  url: 'https://example.test/preserved-content',
  source_item_title: 'Meta walks away from Manus deal after China order',
  localized_title: '中国监管指令迫使 Manus 交易撤回',
  title: 'Meta walks away from Manus deal after China order',
  summary: '现有摘要保持可用，即使上次重处理候选内容解码失败。\n- 这个 Markdown 行必须不能被客户端拆成要点。',
  core_insight: '现有核心洞察保持一句话，不被失败尝试替换。',
  key_points: [
    '保留下来的第一条结构化要点来自 HTTP 响应数组。',
    '保留下来的第二条结构化要点不是从摘要里的 Markdown 列表拆分。',
    '保留下来的第三条结构化要点证明失败尝试只更新 attempt diagnostics。'
  ],
  display_excerpt: null,
  value_tier: 'high',
  content_status: 'ok',
  last_reprocess_status: 'failed',
  last_reprocess_error_code: 'decode_error',
  last_reprocess_error_message: '上次重处理失败 · 解码错误 · 已保留现有摘要和要点',
  last_reprocess_at: '2026-05-24T12:00:00Z',
  published_at: '2026-05-24T11:00:00Z',
  first_seen_at: '2026-05-24T11:00:00Z',
  extraction_status: 'full',
  extraction_source: 'local_readable',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null,
  feed_excerpt: 'Literal feed excerpt keeps provenance context.',
  source_evidence_text: 'Source evidence remains literal.',
  extracted_text: 'Source evidence remains literal.',
  provenance: {
    source_url: 'https://tldr.tech/ai/feed.xml',
    canonical_url: 'https://example.test/preserved-content',
    original_url: 'https://example.test/preserved-content?utm_source=tldr',
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

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
          source_item_title: 'Contract item',
          localized_title: '重处理后的契约条目',
          title: 'Contract item',
          summary: 'Fresh summary after item-level re-ingest.',
          core_insight: 'Fresh core insight after item-level re-ingest.',
          key_points: [
            '重新处理成功后，前端接收结构化 key_points 数组。',
            '要点不会从 summary 或 core_insight 的 Markdown 文本推导。',
            '当前内容字段由成功提交原子替换。'
          ],
          display_excerpt: null,
          value_tier: null,
          content_status: 'ok',
          last_reprocess_status: 'ok',
          last_reprocess_error_code: null,
          last_reprocess_error_message: null,
          last_reprocess_at: '2026-05-24T12:00:00Z',
          published_at: null,
          first_seen_at: null,
          extraction_status: 'full',
          extraction_source: 'local_readable',
          model_status: 'ok',
          is_resonated: false,
          human_inspected_at: null,
          external_surfaced_at: null,
          story_key: null,
          duplicate_of_item_id: null,
          feed_excerpt: null,
          source_evidence_text: null,
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

  it('consumes preserved structured content and attempt diagnostics after a failed item re-ingest', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      already_applied: false,
      reingest: {
        item_id: preservedContentAfterFailedReingest.id,
        status: 'failed',
        language: 'zh',
        item_updated: false,
        fts_updated: false,
        error: {
          item_id: preservedContentAfterFailedReingest.id,
          code: 'decode_error',
          message: '上次重处理失败 · 解码错误 · 已保留现有摘要和要点'
        },
        item: preservedContentAfterFailedReingest
      }
    }));
    const client = new ResoFeedApiClient({ ownerToken: 'rfeed_item_reingest_failed_contract_0000', fetcher });

    const response = await client.reingestItem(preservedContentAfterFailedReingest.id, {
      idempotency_key: 'failed-reingest-preserves-content'
    });

    expect(response.reingest.item_updated).toBe(false);
    expect(response.reingest.item?.content_status).toBe('ok');
    expect(response.reingest.item?.last_reprocess_status).toBe('failed');
    expect(response.reingest.item?.last_reprocess_error_code).toBe('decode_error');
    expect(response.reingest.item?.source_item_title).toBe('Meta walks away from Manus deal after China order');
    expect(response.reingest.item?.localized_title).toBe('中国监管指令迫使 Manus 交易撤回');
    expect(response.reingest.item?.key_points).toEqual(preservedContentAfterFailedReingest.key_points);
    expect(response.reingest.item?.key_points).not.toContain('这个 Markdown 行必须不能被客户端拆成要点。');
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
