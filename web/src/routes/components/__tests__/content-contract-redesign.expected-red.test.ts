import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { ItemDetail, ItemSummary, SearchResponse } from '$lib/api-contract';
import Feed from '../Feed.svelte';
import Inspector from '../Inspector.svelte';
import SearchRetrieval from '../SearchRetrieval.svelte';

interface ContentContractFields {
  source_item_title: string;
  localized_title: string;
  key_points: [string, string, string, ...string[]];
  content_status: 'ok' | 'summary_unavailable';
  last_reprocess_status: 'ok' | 'failed' | null;
  last_reprocess_error_code: 'decode_error' | 'provider_error' | 'invalid_model' | 'timeout' | null;
  last_reprocess_error_message: string | null;
  last_reprocess_at: string | null;
}

type ContentContractSummary = ItemSummary & ContentContractFields;
type ContentContractDetail = ItemDetail & ContentContractFields;

const sourceTitle = 'Meta walks away from Manus deal after China order';
const localizedTitle = '中国监管指令迫使 Manus 交易撤回';
const keyPoints = [
  '监管指令直接改变了交易可执行性，而不是只影响交易节奏。',
  '大型买方的收购意愿不再等同于 AI 初创公司的退出确定性。',
  '读者评估 AI 公司价值时，需要同时考虑技术、资本和跨境监管三条线。'
] as [string, string, string];

const contentContractItem: ContentContractSummary = {
  id: 'item_ccr_ac22',
  source_id: 'src_tldr_ai',
  source_title: 'TLDR AI Feed',
  source_item_title: sourceTitle,
  localized_title: localizedTitle,
  url: 'https://example.test/manus-meta',
  title: sourceTitle,
  summary: 'Manus 因中国监管指令撤销 Meta 收购案，显示跨境 AI 并购已经从商业谈判问题转向监管确定性问题。',
  core_insight: '这件事说明 AI 初创公司的退出路径正在被地缘监管重新定价。',
  key_points: keyPoints,
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
  story_key: 'story_manus_meta',
  duplicate_of_item_id: null
};

const contentContractDetail: ContentContractDetail = {
  ...contentContractItem,
  feed_excerpt: 'Original RSS excerpt with source title: Meta walks away from Manus deal after China order.',
  source_evidence_text: 'Source article evidence remains literal while generated reading content is Chinese.',
  extracted_text: 'Source article evidence remains literal while generated reading content is Chinese.',
  provenance: {
    source_url: 'https://tldr.tech/ai/feed.xml',
    canonical_url: 'https://example.test/manus-meta',
    original_url: 'https://example.test/manus-meta?utm_source=tldr',
    story_key: 'story_manus_meta',
    duplicate_of_item_id: null,
    grouped_source_items: [
      {
        item_id: contentContractItem.id,
        source_id: contentContractItem.source_id,
        source_title: contentContractItem.source_title,
        source_url: 'https://tldr.tech/ai/feed.xml',
        url: contentContractItem.url,
        canonical_url: contentContractItem.url,
        title: sourceTitle,
        published_at: contentContractItem.published_at ?? null,
        first_seen_at: contentContractItem.first_seen_at ?? null,
        extraction_status: 'full',
        model_status: 'ok',
        story_key: 'story_manus_meta',
        duplicate_of_item_id: null,
        is_selected_item: true
      }
    ]
  }
};

function renderFeed(): HTMLElement {
  render(Feed, {
    props: {
      items: [contentContractItem],
      selectedItemId: contentContractItem.id,
      language: 'zh',
      onSelect: async () => {},
      onResonanceToggle: async () => {}
    }
  });
  return screen.getByRole('list', { name: '今日订阅条目' });
}

describe('expected red: content contract redesign frontend runtime gaps', () => {
  it('api/client types represent source_item_title, localized_title, key_points, content_status, and last_reprocess_*', () => {
    expectTypeOf<ItemSummary>().toHaveProperty('source_item_title');
    expectTypeOf<ItemSummary>().toHaveProperty('localized_title');
    expectTypeOf<ItemSummary>().toHaveProperty('key_points');
    expectTypeOf<ItemSummary>().toHaveProperty('content_status');
    expectTypeOf<ItemSummary>().toHaveProperty('last_reprocess_status');
    expectTypeOf<ItemSummary>().toHaveProperty('extraction_source');
    expectTypeOf<ItemDetail>().toHaveProperty('source_evidence_text');
    expectTypeOf<ItemDetail>().toHaveProperty('last_reprocess_error_code');
    expectTypeOf<ItemDetail>().toHaveProperty('last_reprocess_error_message');
    expectTypeOf<ItemDetail>().toHaveProperty('last_reprocess_at');
  });

  it('ac22_title_distinction.feed: Feed accessibly distinguishes localized display title from literal source/provenance title without extra row text', () => {
    const feed = renderFeed();

    expect(within(feed).getByText(localizedTitle)).toBeVisible();
    expect(within(feed).getByLabelText(`本地化标题：${localizedTitle}`)).toBeVisible();
    expect(within(feed).getByLabelText(new RegExp(`来源：.*来源标题：${sourceTitle}`, 'u'))).toBeVisible();
    expect(within(feed).queryByText(sourceTitle)).not.toBeInTheDocument();
  });

  it('Feed renders only localized title plus summary/core preview and excludes key_points, bullets, numbers, and inferred mini-lists', () => {
    const feed = renderFeed();

    expect(within(feed).getByText(localizedTitle)).toBeVisible();
    expect(within(feed).getByText(/AI 初创公司的退出路径正在被地缘监管重新定价/u)).toBeVisible();
    for (const point of keyPoints) expect(within(feed).queryByText(point)).not.toBeInTheDocument();
    expect(feed.textContent ?? '').not.toMatch(/(?:^|\n|\s)(?:•|-|\d+[.)])\s*监管/u);
    expect(feed.querySelectorAll('ul,ol,li')).toHaveLength(0);
  });

  it('Inspector renders Chinese 摘要, 核心洞察, 要点 sections in order with 3-5 structured key point list items', () => {
    render(Inspector, { props: { item: contentContractDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: localizedTitle });
    const sections = Array.from(inspector.querySelectorAll('section[aria-label]'));
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['摘要', '核心洞察', '要点']);
    const keyPointSection = within(inspector).getByLabelText('要点');
    const listItems = within(keyPointSection).getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
    expect(listItems.map((item) => item.textContent)).toEqual(keyPoints);
    expect(keyPointSection.innerHTML).not.toMatch(/&lt;|<p>\s*(?:•|-|\d+[.)])/u);
  });

  it('ac22_title_distinction.inspector: Inspector header/provenance distinguishes localized display title from source/provenance title', () => {
    render(Inspector, { props: { item: contentContractDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: localizedTitle });
    expect(within(inspector).getByRole('heading', { name: localizedTitle })).toBeVisible();
    expect(within(inspector).getByLabelText(`本地化标题：${localizedTitle}`)).toBeVisible();
    expect(within(inspector).getByLabelText(`来源标题：${sourceTitle}`)).toBeVisible();
    expect(within(inspector).getAllByText(sourceTitle)[0]).toBeVisible();
  });

  it('Failed re-ingest line is localized and attempt-scoped while preserved content remains visible', () => {
    render(Inspector, { props: { item: contentContractDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: localizedTitle });
    expect(within(inspector).getByText('上次重处理失败 · 解码错误 · 已保留现有摘要和要点')).toBeVisible();
    expect(within(inspector).getByText(contentContractItem.summary as string)).toBeVisible();
    expect(within(inspector).getByText(contentContractItem.core_insight as string)).toBeVisible();
    for (const point of keyPoints) expect(within(inspector).getByText(point)).toBeVisible();
  });

  it('ac22_title_distinction.search_result: Search result accessibly distinguishes localized display title from source title without extra row text', async () => {
    const searchResponse: SearchResponse = {
      items: [contentContractItem],
      query: { q: 'Manus', source: null, from: null, to: null, resonated: null, limit: 50 }
    };
    render(SearchRetrieval, {
      props: {
        items: [contentContractItem],
        query: 'Manus',
        language: 'zh',
        onSearch: vi.fn(async () => searchResponse)
      }
    });

    const results = await screen.findByRole('list', { name: '搜索结果条目' });
    expect(within(results).getByText(localizedTitle)).toBeVisible();
    expect(within(results).getByLabelText(new RegExp(`来源：.*来源标题：${sourceTitle}`, 'u'))).toBeVisible();
    expect(within(results).queryByText(sourceTitle)).not.toBeInTheDocument();
  });

  it('ac22_title_distinction.provenance_context: provenance context keeps literal source title visible and distinguishable', () => {
    render(Inspector, { props: { item: contentContractDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: localizedTitle });
    const provenance = within(inspector).getByRole('list', { name: /来源|provenance|分组/u });
    expect(within(provenance).getByText(sourceTitle)).toBeVisible();
    expect(within(provenance).getByText(localizedTitle)).toBeVisible();
    expect(within(provenance).getByLabelText(`来源标题：${sourceTitle}`)).toHaveAttribute('translate', 'no');
  });
});
