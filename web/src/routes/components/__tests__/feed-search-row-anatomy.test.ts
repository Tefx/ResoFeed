import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ItemSummary, SearchResponse } from '$lib/api-contract';
import Feed from '../Feed.svelte';
import SearchRetrieval from '../SearchRetrieval.svelte';

const now = '2026-06-02T12:00:00Z';

function item(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    id: 'item_row_contract',
    source_id: 'src_row_contract',
    source_title: 'TLDR AI Feed',
    url: 'https://example.com/articles/source-entry?utm=raw',
    source_item_title: 'Original RSS source title that must stay provenance-only',
    localized_title: '本地化扫描标题',
    title: '本地化扫描标题',
    summary: 'Key Points: 1. https://example.com/raw should not leak. Dense summary remains.',
    core_insight: '• Core preview remains prose, not a feed bullet.',
    key_points: ['Do not render this feed key point.', 'Do not infer a mini list.', 'Inspector owns structured points.'],
    display_excerpt: 'Raw RSS fallback excerpt is allowed when model text is absent.',
    value_tier: 'high',
    content_status: 'ok',
    last_reprocess_status: null,
    last_reprocess_error_code: null,
    last_reprocess_error_message: null,
    last_reprocess_at: null,
    published_at: now,
    first_seen_at: now,
    extraction_status: 'full',
    extraction_source: 'local_readable',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null,
    ...overrides
  };
}

function visibleText(): string {
  return document.body.textContent ?? '';
}

function expectReaderRowsPreserveNegativeContract(text: string): void {
  expect(text).not.toMatch(/src:|来源标题:|来源标题：|价值:|价值：|Key Points|Do not render this feed key point|https?:\/\//u);
  expect(text).not.toMatch(/(?:^|\s)(?:[-*•‣]|\d+[.)、])\s+/u);
}

describe('Feed/Search compact row anatomy', () => {
  it('renders Feed rows as dense scan rows while keeping provenance in accessible names', () => {
    const grouped = item({ id: 'grouped', story_key: 'story_authoritative' });
    const standalone = item({ id: 'standalone', localized_title: 'Standalone localized title', title: 'Standalone localized title', story_key: null, duplicate_of_item_id: null });
    render(Feed, {
      props: {
        items: [grouped, standalone],
        selectedItemId: grouped.id,
        onSelect: vi.fn(),
        onResonanceToggle: vi.fn()
      }
    });

    const feed = screen.getByRole('list', { name: 'Today feed items' });
    expect(within(feed).getAllByText('TLDR AI Feed')[0]).toBeVisible();
    expect(within(feed).getByText('本地化扫描标题')).toBeVisible();
    expect(within(feed).getAllByLabelText(/Source: TLDR AI Feed; Original item title Original RSS source title/u)[0]).toBeVisible();
    expect(within(feed).getByLabelText(/Grouped story: authoritative backend grouping story_authoritative/u)).toBeVisible();
    expect(within(feed).getAllByText('grouped')).toHaveLength(1);
    expectReaderRowsPreserveNegativeContract(visibleText());
  });

  it('renders partial extraction/raw fallback without URL or list leakage', () => {
    render(Feed, {
      props: {
        items: [item({ summary: null, core_insight: null, display_excerpt: '1. https://example.com/raw Raw RSS fallback excerpt remains readable.', extraction_status: 'partial_extraction', model_status: 'summary_unavailable', value_tier: null })],
        onSelect: vi.fn(),
        onResonanceToggle: vi.fn(),
        language: 'zh'
      }
    });

    expect(screen.getAllByText('来源摘录')[0]).toBeVisible();
    expect(screen.getByText(/Raw RSS fallback excerpt remains readable/u)).toBeVisible();
    expectReaderRowsPreserveNegativeContract(visibleText());
  });

  it('shares the same negative row contract in Search/Retrieval rows', async () => {
    const results = [item({ id: 'search_grouped', duplicate_of_item_id: 'item_parent' }), item({ id: 'search_plain', story_key: null, duplicate_of_item_id: null })];
    const onSearch = vi.fn(async (): Promise<SearchResponse> => ({
      items: results,
      query: { q: 'row', source: null, from: null, to: null, resonated: null, limit: 50 }
    }));

    render(SearchRetrieval, {
      props: {
        items: results,
        query: 'row',
        onSearch,
        onSelect: vi.fn(),
        onResonanceToggle: vi.fn(),
        selectedItemId: 'search_grouped'
      }
    });

    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    const resultsList = screen.getByRole('list', { name: 'Search result items' });
    expect(within(resultsList).getAllByLabelText(/Source: TLDR AI Feed; Original item title Original RSS source title/u)[0]).toBeVisible();
    expect(within(resultsList).getByLabelText(/Grouped story: authoritative backend grouping item_parent/u)).toBeVisible();
    expect(within(resultsList).getAllByText('grouped')).toHaveLength(1);
    expect(within(resultsList).getAllByText('match: lexical index')[0]).toBeVisible();
    expectReaderRowsPreserveNegativeContract(visibleText());
  });

  it('keeps desktop Search as a full-height workflow slice instead of a 260px widget', () => {
    const css = readFileSync(resolve(__dirname, '../../../app.css'), 'utf8');
    expect(css).toMatch(/\.feed-pane\s*>\s*\.contract-search\s*\{[\s\S]*min-height:\s*100%;[\s\S]*height:\s*auto;/u);
    expect(css).toMatch(/\.feed-pane\s*>\s*\.contract-search\s*>\s*\.contract-search-results-region\s*,[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/u);
    expect(css).not.toContain('min(260px, calc(100vh - 178px))');
  });

  it('localizes visible Search chrome in Chinese while preserving literal source data', async () => {
    const results = [item({ id: 'zh_search_localized' })];
    const onSearch = vi.fn(async (): Promise<SearchResponse> => ({
      items: results,
      query: { q: 'row', source: null, from: null, to: null, resonated: null, limit: 50 }
    }));

    render(SearchRetrieval, {
      props: {
        items: results,
        query: 'row',
        onSearch,
        onSelect: vi.fn(),
        onResonanceToggle: vi.fn(),
        language: 'zh'
      }
    });

    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    const search = screen.getByRole('region', { name: '搜索与检索' });
    expect(within(search).getByRole('heading', { name: '词汇搜索' })).toBeVisible();
    expect(within(search).getByText('匹配：词汇索引')).toBeVisible();
    expect(within(search).getByText('来源支持')).toBeVisible();
    expect(within(search).getByText('TLDR AI Feed')).toBeVisible();
    expect(search).not.toHaveTextContent('match: lexical index');
    expect(search).not.toHaveTextContent('provenance: source-backed');
    expect(search).not.toHaveTextContent('filters');
  });

  afterEach(() => cleanup());
});
