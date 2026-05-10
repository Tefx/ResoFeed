import type { ItemSummary, Source } from '$lib/api-contract';

export const expectedRedItem: ItemSummary = {
  id: 'item_expected_red',
  source_id: 'src_expected_red',
  source_title: 'Example Source',
  url: 'https://example.com/article',
  title: 'SQLite FTS changes ranking contract',
  summary: 'Dense factual summary for a rendered feed row.',
  core_insight: 'Why this matters for retrieval.',
  value_tier: 'high',
  published_at: '2026-05-09T00:00:00Z',
  extraction_status: 'partial_extraction',
  model_status: 'summary_unavailable',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: '2026-05-09T01:00:00Z',
  story_key: 'story_sqlite_fts',
  duplicate_of_item_id: null
};

export const expectedRedResonatedItem: ItemSummary = {
  ...expectedRedItem,
  id: 'item_expected_red_resonated',
  title: 'Resonated retrieval should stay visible',
  is_resonated: true,
  external_surfaced_at: null
};

export const expectedRedFallbackItem: ItemSummary = {
  ...expectedRedItem,
  id: 'item_expected_red_fallback',
  title: 'Source-backed fallback item keeps list display stable',
  summary: null,
  core_insight: null,
  display_excerpt: 'Source-backed feed excerpt for list/search fallback.',
  published_at: null,
  first_seen_at: '2026-05-09T02:00:00Z',
  extraction_status: 'partial_extraction',
  model_status: 'summary_unavailable',
  external_surfaced_at: null
};

export const expectedRedSource: Source = {
  id: 'src_expected_red',
  url: 'https://example.com/feed.xml',
  title: 'Example Source',
  last_fetch_at: '2026-05-09T00:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};
