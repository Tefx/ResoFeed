import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Inspector from '../Inspector.svelte';
import type { ItemDetail } from '$lib/api-contract';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';

const baseDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'Raw RSS excerpt remains source evidence only.',
  extracted_text: 'Full article text for normal source text rendering.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: expectedRedItem.url,
    original_url: expectedRedItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

describe('Inspector fallback/source evidence contract', () => {
  it('renders fallback status exactly once, hides Summary/Core, and shows source evidence', () => {
    const fallbackDetail: ItemDetail = {
      ...baseDetail,
      id: 'fallback-source-evidence-contract',
      title: 'Fallback source evidence contract item',
      summary: null,
      core_insight: null,
      extraction_status: 'partial_extraction',
      model_status: 'summary_unavailable',
      feed_excerpt: 'Raw RSS excerpt remains source evidence only.',
      extracted_text: 'Unprocessed source body must not masquerade as synthesized reading content.'
    };

    render(Inspector, { props: { item: fallbackDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: fallbackDetail.title });
    expect(within(inspector).getByText('中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录')).toBeVisible();
    expect((inspector.textContent?.match(/中文处理未完成/g) ?? [])).toHaveLength(1);
    expect(within(inspector).queryByLabelText('摘要')).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText('核心洞察')).not.toBeInTheDocument();
    expect(within(inspector).getByLabelText('出处记录')).toHaveTextContent('Raw RSS excerpt remains source evidence only.');
    expect(inspector).not.toHaveTextContent('Unprocessed source body must not masquerade');
  });

  it('keeps OK model-backed items on the normal Summary/Core/Source Text path', () => {
    const okDetail: ItemDetail = {
      ...baseDetail,
      id: 'ok-model-backed-contract',
      title: 'OK model-backed contract item',
      summary: 'Model-backed digest explains durable feed retrieval behavior.',
      core_insight: 'Model-backed core insight remains visible.',
      extraction_status: 'full',
      model_status: 'ok',
      extracted_text: 'Full article text for normal source text rendering.'
    };

    render(Inspector, { props: { item: okDetail, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: okDetail.title });
    expect(within(inspector).getByLabelText('Summary')).toHaveTextContent('Model-backed digest explains durable feed retrieval behavior.');
    expect(within(inspector).getByLabelText('Core insight')).toHaveTextContent('Model-backed core insight remains visible.');
    expect(within(inspector).getByLabelText('Source text')).toHaveTextContent('Full article text for normal source text rendering.');
    expect(within(inspector).queryByLabelText('Source evidence')).not.toBeInTheDocument();
  });
});
