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
    source_item_title: `TLDR unrelated synthetic entry ${entrySuffix}`,
    localized_title: `TLDR 无关合成条目 ${entrySuffix}`,
    title: `TLDR unrelated synthetic entry ${entrySuffix}`,
    summary: `Unrelated TLDR feed-style item ${entrySuffix}.`,
    core_insight: `Distinct synthetic RSS fragment entry ${entrySuffix}.`,
    key_points: [
      `Synthetic fragment ${entrySuffix} keeps structured point one.`,
      `Synthetic fragment ${entrySuffix} keeps structured point two.`,
      `Synthetic fragment ${entrySuffix} keeps structured point three.`
    ],
    display_excerpt: `Feed-style excerpt for fragment ${entrySuffix}.`,
    value_tier: null,
    content_status: 'ok',
    last_reprocess_status: null,
    last_reprocess_error_code: null,
    last_reprocess_error_message: null,
    last_reprocess_at: null,
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

  it('keeps backend-authoritative grouped source disclosure transparent', () => {
    const selectedGroupedItem = unrelatedFragmentItems[0];
    const duplicateGroupedItem = unrelatedFragmentItems[1];
    const authoritativeDetail: ItemDetail = {
      ...selectedGroupedItem,
      story_key: 'story_authoritative_grouping_fixture',
      feed_excerpt: 'Selected grouped item feed excerpt.',
      extracted_text: 'Selected grouped item reading body.',
      provenance: {
        source_url: tldrFeedUrl,
        canonical_url: null,
        original_url: selectedGroupedItem.url,
        story_key: 'story_authoritative_grouping_fixture',
        duplicate_of_item_id: null,
        grouped_source_items: [
          {
            item_id: selectedGroupedItem.id,
            source_id: selectedGroupedItem.source_id,
            source_title: selectedGroupedItem.source_title,
            source_url: tldrFeedUrl,
            url: selectedGroupedItem.url,
            canonical_url: null,
            title: selectedGroupedItem.title,
            published_at: selectedGroupedItem.published_at,
            first_seen_at: selectedGroupedItem.first_seen_at ?? null,
            extraction_status: selectedGroupedItem.extraction_status,
            model_status: selectedGroupedItem.model_status,
            story_key: 'story_authoritative_grouping_fixture',
            duplicate_of_item_id: null,
            is_selected_item: true
          },
          {
            item_id: duplicateGroupedItem.id,
            source_id: duplicateGroupedItem.source_id,
            source_title: duplicateGroupedItem.source_title,
            source_url: tldrFeedUrl,
            url: duplicateGroupedItem.url,
            canonical_url: null,
            title: duplicateGroupedItem.title,
            published_at: duplicateGroupedItem.published_at,
            first_seen_at: duplicateGroupedItem.first_seen_at ?? null,
            extraction_status: duplicateGroupedItem.extraction_status,
            model_status: duplicateGroupedItem.model_status,
            story_key: 'story_authoritative_grouping_fixture',
            duplicate_of_item_id: selectedGroupedItem.id,
            is_selected_item: false
          }
        ]
      }
    };

    render(Inspector, {
      props: {
        item: authoritativeDetail,
        mode: 'desktop-split',
        groupedSourceCandidates: unrelatedFragmentItems,
        sources: [tldrSource]
      }
    });

    const inspector = screen.getByRole('complementary', { name: authoritativeDetail.title });
    expect(within(inspector).getByText('Grouped story with 2 source items')).toBeVisible();
    expect(within(inspector).getByText(selectedGroupedItem.title)).toBeVisible();
    expect(inspector.querySelector('.contract-grouped-sources')).toHaveTextContent(duplicateGroupedItem.title);
  });

  it('preserves true same-article URL fallback for non-synthetic fragments', () => {
    const sameArticleBase = 'https://example.com/research/story';
    const selectedSameArticle: ItemDetail = {
      ...unrelatedFragmentItems[0],
      id: 'item_same_article_selected',
      source_id: 'src_same_article_primary',
      source_title: 'Primary Source',
      url: `${sameArticleBase}?utm_source=feed#comments`,
      title: 'Same article selected item',
      feed_excerpt: 'Same article selected excerpt.',
      extracted_text: 'Same article selected body.',
      provenance: {
        source_url: 'https://example.com/feed.xml',
        canonical_url: null,
        original_url: `${sameArticleBase}?utm_source=feed#comments`,
        story_key: null,
        duplicate_of_item_id: null,
        grouped_source_items: []
      }
    };
    const sameArticleCandidate: ItemSummary = {
      ...unrelatedFragmentItems[1],
      id: 'item_same_article_candidate',
      source_id: 'src_same_article_secondary',
      source_title: 'Secondary Source',
      url: `${sameArticleBase}?ref=rss#section`,
      title: 'Same article candidate item'
    };

    render(Inspector, {
      props: {
        item: selectedSameArticle,
        mode: 'desktop-split',
        groupedSourceCandidates: [selectedSameArticle, sameArticleCandidate],
        sources: [
          { ...tldrSource, id: 'src_same_article_primary', url: 'https://example.com/feed.xml', title: 'Primary Source' },
          { ...tldrSource, id: 'src_same_article_secondary', url: 'https://secondary.example/feed.xml', title: 'Secondary Source' }
        ]
      }
    });

    const inspector = screen.getByRole('complementary', { name: selectedSameArticle.title });
    expect(within(inspector).getByText('Grouped story with 2 source items')).toBeVisible();
    expect(inspector.querySelector('.contract-grouped-sources')).toHaveTextContent(sameArticleCandidate.title);
  });
});
