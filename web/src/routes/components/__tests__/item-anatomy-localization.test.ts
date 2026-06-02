import { describe, expect, it } from 'vitest';

import type { ItemSummary } from '$lib/api-contract';
import { itemAgeLabel, itemAnatomyChrome, itemExtractionLabel, itemPriorityLabel, itemSourceBackedProvenanceLabel, itemSummaryProvenanceLabel, itemSummaryText, itemTimeGroup } from '../item-anatomy';

const item: ItemSummary = {
  id: 'item_literal_identifier',
  source_id: 'src_literal_identifier',
  source_title: "Simon Willison's Weblog",
  url: 'https://simonwillison.net/2026/May/23/agents-as-tools/',
  source_item_title: 'Agents as tools need boring UI contracts',
  localized_title: '作为工具的 Agent 需要朴素 UI 契约',
  title: 'Agents as tools need boring UI contracts',
  summary: 'Stored item text remains literal until explicit processing.',
  core_insight: null,
  key_points: [
    '字面来源标题保持不翻译，用于证明来源。',
    '本地化标题作为单独显示字段存在。',
    '结构化要点不会从摘要文本推导。'
  ],
  display_excerpt: null,
  value_tier: 'source-claim',
  content_status: 'ok',
  last_reprocess_status: null,
  last_reprocess_error_code: null,
  last_reprocess_error_message: null,
  last_reprocess_at: null,
  published_at: '2026-05-23T09:15:00Z',
  first_seen_at: '2026-05-23T09:15:00Z',
  extraction_status: 'partial_extraction',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: '2026-05-23T09:20:00Z',
  story_key: 'story_literal_identifier',
  duplicate_of_item_id: null
};

describe('item anatomy chrome localization', () => {
  it('keeps English defaults available', () => {
    expect(itemExtractionLabel(item.extraction_status)).toBe('source excerpt');
    expect(itemSummaryProvenanceLabel(item)).toBe('model-backed');
    expect(itemPriorityLabel(item)).toBe('value: source-claim');
    expect(itemSummaryText({ ...item, summary: null, core_insight: null, display_excerpt: null })).toBe('summary unavailable');
  });

  it('selects zh label/provenance/quality text without translating literal source data', () => {
    const zhChrome = itemAnatomyChrome('zh');

    expect(zhChrome.feed.sourceAria(item.source_title)).toBe("来源：Simon Willison's Weblog");
    expect(itemExtractionLabel(item.extraction_status, 'zh')).toBe('来源摘录');
    expect(itemSummaryProvenanceLabel(item, 'zh')).toBe('模型支持');
    expect(itemPriorityLabel(item, 'zh')).toBe('来源声明');
    expect(itemSourceBackedProvenanceLabel('zh')).toBe('来源支持');
    expect(itemSummaryText({ ...item, summary: null, core_insight: null, display_excerpt: null }, 'zh')).toBe('摘要不可用');
  });

  it.each([
    ['brief', '简报'],
    ['high', '高价值']
  ] as const)('localizes current zh value tier %s', (valueTier, label) => {
    expect(itemPriorityLabel({ ...item, value_tier: valueTier }, 'zh')).toBe(label);
  });

  it('preserves operational time-group tokens while localizing time fallback chrome', () => {
    expect(itemTimeGroup(item, new Date('2026-05-23T10:00:00Z'))).toBe('TODAY');
    expect(itemAgeLabel({ ...item, published_at: null, first_seen_at: null }, new Date('2026-05-23T10:00:00Z'), 'zh')).toBe('时间不可用');
  });
});
