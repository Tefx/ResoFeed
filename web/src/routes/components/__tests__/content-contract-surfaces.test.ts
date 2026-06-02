import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ItemDetail, ItemSummary, SearchResponse } from '$lib/api-contract';
import type { SearchRequestParams } from '$lib/api-client';
import Feed from '../Feed.svelte';
import Inspector from '../Inspector.svelte';
import SearchRetrieval from '../SearchRetrieval.svelte';

const item: ItemSummary = {
  id: 'item_content_contract_ui',
  source_id: 'src_tldr_ai',
  source_title: 'TLDR AI Feed',
  url: 'https://example.test/manus-meta',
  source_item_title: 'Meta walks away from Manus deal after China order',
  localized_title: '中国监管指令迫使 Manus 交易撤回',
  title: 'Meta walks away from Manus deal after China order',
  summary: '这篇文章说明 Meta 收购 Manus 的交易因中国监管指令撤回，反映跨境 AI 并购受到更强约束。',
  core_insight: 'AI 初创公司的退出路径正在被技术、资本与监管共同重塑。',
  key_points: [
    'Manus 因中国监管指令撤销 Meta 收购案，说明跨境 AI 并购已经受到实质监管约束。',
    '该事件会影响 AI 初创公司的退出预期，因为买方意愿不再等同于交易确定性。',
    '对读者的价值在于判断 AI 公司估值时必须同时考虑技术、资本和监管三条线。'
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
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: 'story_manus_meta',
  duplicate_of_item_id: null
};

const detail: ItemDetail = {
  ...item,
  feed_excerpt: 'Literal RSS excerpt remains provenance evidence.',
  extracted_text: 'Literal source evidence remains available behind disclosure.',
  provenance: {
    source_url: 'https://tldr.tech/ai/feed.xml',
    canonical_url: 'https://example.test/manus-meta',
    original_url: 'https://example.test/manus-meta?utm_source=tldr',
    story_key: item.story_key,
    duplicate_of_item_id: null,
    grouped_source_items: [
      {
        item_id: item.id,
        source_id: item.source_id,
        source_title: item.source_title,
        source_url: 'https://tldr.tech/ai/feed.xml',
        url: item.url,
        source_item_title: item.source_item_title,
        localized_title: item.localized_title,
        canonical_url: 'https://example.test/manus-meta',
        title: item.title,
        published_at: item.published_at,
        first_seen_at: item.first_seen_at ?? null,
        extraction_status: item.extraction_status,
        model_status: item.model_status,
        story_key: item.story_key,
        duplicate_of_item_id: null,
        is_selected_item: true
      },
      {
        item_id: 'item_content_contract_context',
        source_id: 'src_context',
        source_title: 'Context Source',
        source_url: 'https://context.example/feed.xml',
        url: 'https://context.example/manus-meta',
        source_item_title: 'Context source literal Manus title',
        localized_title: '上下文来源中的 Manus 交易',
        canonical_url: 'https://context.example/manus-meta',
        title: 'Context source literal Manus title',
        published_at: item.published_at,
        first_seen_at: item.first_seen_at ?? null,
        extraction_status: item.extraction_status,
        model_status: item.model_status,
        story_key: item.story_key,
        duplicate_of_item_id: item.id,
        is_selected_item: false
      }
    ]
  }
};

afterEach(() => cleanup());

describe('content contract UI surfaces', () => {
  it('Feed uses localized title and compact preview while excluding key_points from DOM text', () => {
    render(Feed, {
      props: {
        items: [item],
        language: 'zh',
        onSelect: vi.fn(),
        onResonanceToggle: vi.fn()
      }
    });

    const row = screen.getByRole('listitem');
    expect(within(row).getByText(item.localized_title ?? '')).toBeVisible();
    // DEVIATION RECORD: type=test_error; artifact=web/src/routes/components/__tests__/content-contract-surfaces.test.ts; what_changed=Feed provenance assertion now checks accessible source/title provenance without requiring the forbidden visual/readout-style `来源标题：` prefix; why=DESIGN.md:486-487,528-532,730,747 and 1033/1058 forbid repeated reader prefixes in Feed while preserving accessible provenance; impact=stronger positive a11y provenance plus visual-prefix regression guard.
    expect(within(row).getByLabelText(new RegExp(`来源：.*来源标题：${item.source_item_title}`, 'u'))).toBeVisible();
    expect(row).not.toHaveTextContent(`来源标题：${item.source_item_title}`);
    expect(within(row).getByText(/这篇文章说明.*AI 初创公司的退出路径/u)).toBeVisible();
    for (const point of item.key_points) {
      expect(within(row).queryByText(point)).not.toBeInTheDocument();
    }
  });

  it('Inspector renders structured Chinese sections in order and preserves failed re-ingest content', () => {
    render(Inspector, {
      props: {
        item: detail,
        mode: 'desktop-split',
        language: 'zh',
        showReingest: true,
        groupedSourceCandidates: [item]
      }
    });

    const inspector = screen.getByRole('complementary', { name: item.localized_title ?? item.title });
    expect(within(inspector).getAllByText(item.localized_title ?? '')[0]).toBeVisible();
    expect(within(inspector).getByLabelText(`来源标题：${item.source_item_title}`)).toBeVisible();
    const sectionLabels = within(inspector).getAllByText(/^(摘要：|核心洞察：|要点：)$/u).map((node) => node.textContent);
    expect(sectionLabels).toEqual(['摘要：', '核心洞察：', '要点：']);
    const keyPointSection = within(inspector).getByRole('region', { name: '要点' });
    const keyPointList = within(keyPointSection).getByRole('list');
    expect(within(keyPointList).getAllByRole('listitem')).toHaveLength(3);
    for (const point of item.key_points) expect(within(keyPointList).getByText(point)).toBeVisible();
    expect(within(inspector).getByText('上次重处理失败 · 解码错误 · 已保留现有摘要和要点')).toBeVisible();
    expect(within(inspector).getByText(item.summary ?? '')).toBeVisible();
    expect(within(inspector).getByText(item.core_insight ?? '')).toBeVisible();
  });

  it('Search result exposes localized display title and literal source title distinctly', async () => {
    const onSearch = vi.fn(async (_params: SearchRequestParams): Promise<SearchResponse> => ({
      query: { q: 'Manus', source: null, from: null, to: null, resonated: null, limit: 50 },
      items: [item]
    }));
    render(SearchRetrieval, {
      props: {
        items: [item],
        query: 'Manus',
        language: 'zh',
        onSearch
      }
    });

    const result = await screen.findByRole('listitem');
    expect(within(result).getByText(item.localized_title ?? '')).toBeVisible();
    // DEVIATION RECORD: type=test_error; artifact=web/src/routes/components/__tests__/content-contract-surfaces.test.ts; what_changed=Search provenance assertion mirrors Feed anatomy by checking accessible source/title provenance and absence of the forbidden repeated visual `来源标题：` prefix; why=Search results reuse Feed reader anatomy under DESIGN.SEARCH and DESIGN.FEED.NO_REPEATED_PREFIXES; impact=search source provenance remains positively covered without weakening visual-prefix prohibition.
    expect(within(result).getByLabelText(new RegExp(`来源：.*来源标题：${item.source_item_title}`, 'u'))).toBeVisible();
    expect(result).not.toHaveTextContent(`来源标题：${item.source_item_title}`);
  });

  it('Provenance grouped context keeps localized and source titles distinguishable', () => {
    render(Inspector, {
      props: {
        item: detail,
        mode: 'desktop-split',
        language: 'zh',
        groupedSourceCandidates: [item]
      }
    });

    const groupedContext = document.querySelector('.contract-grouped-sources');
    expect(groupedContext).toBeInstanceOf(HTMLElement);
    expect(groupedContext).toHaveTextContent(item.localized_title ?? '');
    expect(groupedContext).toHaveTextContent(`来源标题： ${item.source_item_title}`);
  });
});
