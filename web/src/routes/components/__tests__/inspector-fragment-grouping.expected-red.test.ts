import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import type { ItemDetail, ItemSummary, Source } from '$lib/api-contract';
import Inspector from '../Inspector.svelte';

const tldrFeedUrl = 'https://bullrich.dev/tldr-rss/feed.rss';

const tldrSource: Source = {
  id: 'src_tldr_fragment_fixture',
  url: tldrFeedUrl,
  title: 'TLDR RSS synthetic feed',
  last_fetch_at: '2026-05-17T00:00:00Z',
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
};

function fragmentItem(index: number): ItemSummary {
  const entrySuffix = String(index).padStart(2, '0');
  return {
    id: `item_tldr_fragment_${entrySuffix}`,
    source_id: tldrSource.id,
    source_title: tldrSource.title,
    url: `${tldrFeedUrl}#entry_${entrySuffix}`,
    title: `TLDR unrelated synthetic entry ${entrySuffix}`,
    summary: `Unrelated TLDR feed-style item ${entrySuffix}.`,
    core_insight: `Distinct synthetic RSS fragment entry ${entrySuffix}.`,
    display_excerpt: `Feed-style excerpt for fragment ${entrySuffix}.`,
    value_tier: null,
    published_at: '2026-05-17T00:00:00Z',
    first_seen_at: '2026-05-17T00:00:00Z',
    extraction_status: 'partial_extraction',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  };
}

const unrelatedFragmentItems = Array.from({ length: 50 }, (_, index) => fragmentItem(index + 1));

const selectedFragmentDetail: ItemDetail = {
  ...unrelatedFragmentItems[0],
  feed_excerpt: 'Selected TLDR synthetic RSS feed excerpt.',
  extracted_text: 'Selected TLDR synthetic fragment entry reading body.',
  provenance: {
    source_url: tldrFeedUrl,
    canonical_url: null,
    original_url: unrelatedFragmentItems[0].url,
    // Spec-fixture conformance: these are the documented external item fields
    // from web/src/lib/api-contract.ts, not convenience grouping-only fields.
    // internal/resofeed/ingest.go synthesizes blank entry URLs as source.URL + "#" + stableID(...),
    // while docs/ARCHITECTURE.md makes story_key / duplicate_of_item_id the grouping authority.
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

afterEach(() => {
  cleanup();
});

describe('expected-red Inspector synthetic RSS fragment grouping', () => {
  it('does not infer distinct feed-entry fragments as one grouped story without grouping authority', () => {
    render(Inspector, {
      props: {
        item: selectedFragmentDetail,
        mode: 'desktop-split',
        groupedSourceCandidates: unrelatedFragmentItems,
        sources: [tldrSource]
      }
    });

    const inspector = screen.getByRole('complementary', { name: selectedFragmentDetail.title });
    expect(within(inspector).getByRole('heading', { name: selectedFragmentDetail.title })).toBeVisible();
    expect(within(inspector).getAllByText(unrelatedFragmentItems[0].url).length).toBeGreaterThan(0);

    expect(inspector.querySelector('.contract-grouped-sources')).not.toBeInTheDocument();
    expect(within(inspector).queryByText('Grouped story with 50 source items')).not.toBeInTheDocument();
  });
});
