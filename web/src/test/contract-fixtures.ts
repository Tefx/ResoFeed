import type { ItemSummary, Source } from '$lib/api-contract';

export const expectedRedItem: ItemSummary = {
  id: 'item_expected_red',
  source_id: 'src_expected_red',
  source_title: 'Example Source',
  url: 'https://example.com/article',
  source_item_title: 'SQLite FTS changes ranking contract',
  localized_title: 'SQLite FTS 改变排序契约',
  title: 'SQLite FTS changes ranking contract',
  summary: 'Dense factual summary for a rendered feed row.',
  core_insight: 'Why this matters for retrieval.',
  key_points: [
    'SQLite FTS 仍然是检索来源，前端必须把要点当作结构化数组消费。',
    '排序契约变化影响搜索结果解释，但不引入向量或语义检索。',
    '来源标题保持字面量，中文显示标题单独保存在 localized_title。'
  ],
  value_tier: 'high',
  content_status: 'summary_unavailable',
  last_reprocess_status: null,
  last_reprocess_error_code: null,
  last_reprocess_error_message: null,
  last_reprocess_at: null,
  published_at: '2026-05-09T00:00:00Z',
  extraction_status: 'partial_extraction',
  extraction_source: 'feed_excerpt',
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
  source_item_title: 'Resonated retrieval should stay visible',
  localized_title: '共鸣后的检索仍应可见',
  title: 'Resonated retrieval should stay visible',
  is_resonated: true,
  external_surfaced_at: null
};

export const expectedRedFallbackItem: ItemSummary = {
  ...expectedRedItem,
  id: 'item_expected_red_fallback',
  source_item_title: 'Source-backed fallback item keeps list display stable',
  localized_title: null,
  title: 'Source-backed fallback item keeps list display stable',
  summary: null,
  core_insight: null,
  key_points: [],
  display_excerpt: 'Source-backed feed excerpt for list/search fallback.',
  content_status: 'summary_unavailable',
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
