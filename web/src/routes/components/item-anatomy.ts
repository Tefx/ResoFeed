import type { ItemSummary, ProcessingLanguage, Rfc3339UtcString } from '$lib/api-contract';
import { itemDisplayExcerpt, itemDisplayTimestamp } from '$lib/api-contract';

type TimeGroup = 'TODAY' | 'YESTERDAY' | 'EARLIER';
type ExtractionLabelKey = ItemSummary['extraction_status'];
type SummaryProvenanceKey = 'model-backed' | 'fallback' | 'source-backed';

interface ItemAnatomyChrome {
  readonly summaryUnavailable: string;
  readonly timeUnavailable: string;
  readonly age: (value: string) => string;
  readonly extraction: Record<ExtractionLabelKey, string>;
  readonly provenance: Record<SummaryProvenanceKey, string>;
  readonly priority: {
    readonly sourceBacked: string;
    readonly qualityPrefix: string;
    readonly valuePrefix: string;
    readonly valueTier: Record<string, string>;
  };
  readonly feed: {
    readonly listLabel: string;
    readonly sourceAria: (sourceTitle: string) => string;
    readonly ageAria: (age: string) => string;
    readonly extractionAria: (status: string) => string;
    readonly summaryProvenanceAria: (label: string) => string;
    readonly priorityAria: (label: string) => string;
    readonly externallySurfacedByAgent: string;
    readonly loadMoreAria: string;
    readonly loadMore: string;
    readonly loading: string;
    readonly openInspectorAria: (title: string) => string;
  };
  readonly search: {
    readonly resultCount: (count: number) => string;
    readonly searching: string;
    readonly noResults: string;
    readonly sourceAria: (sourceTitle: string) => string;
    readonly ageAria: (age: string) => string;
    readonly extractionAria: (status: string) => string;
    readonly priorityAria: (label: string) => string;
    readonly matchLexicalIndex: string;
    readonly provenanceSourceBacked: string;
    readonly externallySurfacedByAgent: string;
  };
}

const itemChromeByLanguage: Record<ProcessingLanguage, ItemAnatomyChrome> = {
  en: {
    summaryUnavailable: 'summary unavailable',
    timeUnavailable: 'time unavailable',
    age: (value) => value,
    extraction: {
      full: 'full',
      partial_extraction: 'source excerpt',
      summary_unavailable: 'excerpt',
      original_unavailable: 'excerpt'
    },
    provenance: {
      'model-backed': 'model-backed',
      fallback: 'fallback',
      'source-backed': 'source-backed'
    },
    priority: {
      sourceBacked: 'quality: source-backed',
      qualityPrefix: 'quality',
      valuePrefix: 'value',
      valueTier: {}
    },
    feed: {
      listLabel: 'Today feed items',
      sourceAria: (sourceTitle) => `Source: ${sourceTitle}`,
      ageAria: (age) => `Age: ${age}`,
      extractionAria: (status) => `Extraction: ${status}`,
      summaryProvenanceAria: (label) => `Summary provenance: ${label}`,
      priorityAria: (label) => `Priority signal: ${label}`,
      externallySurfacedByAgent: 'Externally surfaced by agent',
      loadMoreAria: 'Load more feed items',
      loadMore: '[LOAD MORE]',
      loading: '[LOADING]',
      openInspectorAria: (title) => `Open Inspector for: ${title}`
    },
    search: {
      resultCount: (count) => `${count} results`,
      searching: 'searching',
      noResults: 'no results',
      sourceAria: (sourceTitle) => `Source: ${sourceTitle}`,
      ageAria: (age) => `Age: ${age}`,
      extractionAria: (status) => `Extraction: ${status}`,
      priorityAria: (label) => `Priority signal: ${label}`,
      matchLexicalIndex: 'match: lexical index',
      provenanceSourceBacked: 'provenance: source-backed',
      externallySurfacedByAgent: 'Externally surfaced by agent'
    }
  },
  zh: {
    summaryUnavailable: '摘要不可用',
    timeUnavailable: '时间不可用',
    age: (value) => value,
    extraction: {
      full: '全文',
      partial_extraction: '来源摘录',
      summary_unavailable: '摘录',
      original_unavailable: '摘录'
    },
    provenance: {
      'model-backed': '模型支持',
      fallback: '回退',
      'source-backed': '来源支持'
    },
    priority: {
      sourceBacked: '质量：来源支持',
      qualityPrefix: '质量',
      valuePrefix: '价值',
      valueTier: {
        brief: '简报',
        high: '高价值',
        'source-claim': '来源声明'
      }
    },
    feed: {
      listLabel: '今日订阅条目',
      sourceAria: (sourceTitle) => `来源：${sourceTitle}`,
      ageAria: (age) => `时间：${age}`,
      extractionAria: (status) => `提取：${status}`,
      summaryProvenanceAria: (label) => `摘要来源：${label}`,
      priorityAria: (label) => `优先信号：${label}`,
      externallySurfacedByAgent: '由代理外部推荐',
      loadMoreAria: '加载更多订阅条目',
      loadMore: '[加载更多]',
      loading: '[加载中]',
      openInspectorAria: (title) => `打开检查器：${title}`
    },
    search: {
      resultCount: (count) => `${count} 条结果`,
      searching: '搜索中',
      noResults: '无结果',
      sourceAria: (sourceTitle) => `来源：${sourceTitle}`,
      ageAria: (age) => `时间：${age}`,
      extractionAria: (status) => `提取：${status}`,
      priorityAria: (label) => `优先信号：${label}`,
      matchLexicalIndex: '匹配：词汇索引',
      provenanceSourceBacked: '来源支持',
      externallySurfacedByAgent: '由代理外部推荐'
    }
  }
};

export function itemAnatomyChrome(language: ProcessingLanguage = 'en'): ItemAnatomyChrome {
  return itemChromeByLanguage[language];
}
const timeGroupOrder: Record<TimeGroup, number> = {
  TODAY: 0,
  YESTERDAY: 1,
  EARLIER: 2
};

function decodeEntities(text: string): string {
  if (typeof document === 'undefined') return text;
  const element = document.createElement('textarea');
  element.innerHTML = text;
  return element.value;
}

function removeJsonLdPrefix(text: string): string {
  const start = text.search(/\{\s*"@context"/i);
  if (start < 0 || text.slice(0, start).trim().length > 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return text.slice(index + 1);
  }
  return text;
}

export function readableItemText(text: string | null | undefined): string | null {
  if (!text) return null;
  if (text.trim() === 'Deterministic fixture summary.') return null;
  const withoutExecutable = text
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutExecutable.replace(/<[^>]*>/g, ' ');
  const withoutJsonLdPrefix = removeJsonLdPrefix(withoutTags);
  const withoutEnclosure = withoutJsonLdPrefix.replace(/\benclosure:\s+url=\S+\s+type=\S+\s+length=\S+\s+image=\S+/gi, ' ');
  const normalized = decodeEntities(withoutEnclosure).replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

export function itemSummaryText(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  return readableItemText(itemDisplayExcerpt(item)) ?? itemAnatomyChrome(language).summaryUnavailable;
}

export function itemLocalizedDisplayTitle(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  const transportTitle = readableItemText(item.title);
  const sourceTitle = readableItemText(item.source_item_title);
  if (transportTitle && sourceTitle && transportTitle !== sourceTitle) return transportTitle;
  if (language === 'zh') {
    const localizedTitle = readableItemText(item.localized_title);
    return localizedTitle ?? sourceTitle ?? transportTitle ?? item.title;
  }
  return sourceTitle ?? transportTitle ?? item.title;
}

export function itemSourceProvenanceTitle(item: ItemSummary): string {
  return readableItemText(item.source_item_title) ?? readableItemText(item.title) ?? item.title;
}

export function itemCompactPreviewText(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  const summary = readableItemText(item.summary);
  const coreInsight = readableItemText(item.core_insight);
  const preview = [summary, coreInsight].filter((part): part is string => Boolean(part)).join(' · ');
  return preview || itemSummaryText(item, language);
}

function stripReaderRowForbiddenText(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/giu, ' ')
    .replace(/(?:^|[\s·])(?:Key Points?|要点|核心洞察)\s*[:：]?/giu, ' ')
    .replace(/(?:^|\s)(?:[-*•‣]|\d+[.)、])\s+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function itemReaderRowPreviewText(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  const chrome = itemAnatomyChrome(language);
  const preview = itemCompactPreviewText(item, language);
  const compactSegments = preview
    .split(' · ')
    .map((segment) => stripReaderRowForbiddenText(segment))
    .filter((segment) => segment.length > 0);
  return compactSegments.join(' · ') || chrome.summaryUnavailable;
}

export function itemTimestamp(item: ItemSummary): Rfc3339UtcString | null {
  return itemDisplayTimestamp(item);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function itemTimeGroup(item: ItemSummary, now = new Date()): TimeGroup {
  const timestamp = itemTimestamp(item);
  if (!timestamp) return 'EARLIER';
  const itemDay = startOfLocalDay(new Date(timestamp));
  const today = startOfLocalDay(now);
  const deltaDays = Math.round((today.getTime() - itemDay.getTime()) / 86_400_000);
  if (deltaDays <= 0) return 'TODAY';
  if (deltaDays === 1) return 'YESTERDAY';
  return 'EARLIER';
}

export function itemAgeLabel(item: ItemSummary, now = new Date(), language: ProcessingLanguage = 'en'): string {
  const timestamp = itemTimestamp(item);
  const chrome = itemAnatomyChrome(language);
  if (!timestamp) return chrome.timeUnavailable;
  const date = new Date(timestamp);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return chrome.age(`${Math.max(1, minutes)}m`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return chrome.age(`${hours}h`);
  const days = Math.floor(hours / 24);
  if (days < 7) return chrome.age(`${days}d`);
  return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric' }).toLowerCase();
}

export function compareItemsByTimeGroup(left: ItemSummary, right: ItemSummary, now = new Date()): number {
  const leftGroup = itemTimeGroup(left, now);
  const rightGroup = itemTimeGroup(right, now);
  const groupDelta = timeGroupOrder[leftGroup] - timeGroupOrder[rightGroup];
  if (groupDelta !== 0) return groupDelta;

  return 0;
}

export function itemExtractionLabel(status: ItemSummary['extraction_status'], language: ProcessingLanguage = 'en'): string {
  return itemAnatomyChrome(language).extraction[status];
}

export function itemSummaryProvenanceLabel(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  const provenance = itemAnatomyChrome(language).provenance;
  if (readableItemText(itemDisplayExcerpt(item))) return item.model_status === 'ok' ? provenance['model-backed'] : provenance.fallback;
  return provenance.fallback;
}

export function itemSourceBackedProvenanceLabel(language: ProcessingLanguage = 'en'): string {
  return itemAnatomyChrome(language).provenance['source-backed'];
}

export function itemPriorityLabel(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  const chrome = itemAnatomyChrome(language).priority;
  if (item.value_tier) return chrome.valueTier[item.value_tier] ?? `${chrome.valuePrefix}: ${item.value_tier}`;
  if (item.model_status !== 'ok') return `${chrome.qualityPrefix}: ${itemExtractionLabel(item.extraction_status, language)}`;
  if (item.extraction_status !== 'full') return `${chrome.qualityPrefix}: ${itemExtractionLabel(item.extraction_status, language)}`;
  return chrome.sourceBacked;
}

export function itemReaderRowPriorityToken(item: ItemSummary, language: ProcessingLanguage = 'en'): string {
  const chrome = itemAnatomyChrome(language).priority;
  if (item.value_tier) return chrome.valueTier[item.value_tier] ?? item.value_tier;
  if (item.model_status !== 'ok' || item.extraction_status !== 'full') return itemExtractionLabel(item.extraction_status, language);
  return language === 'zh' ? '来源支持' : 'source-backed';
}

export function itemHasAuthoritativeGrouping(item: ItemSummary): boolean {
  return Boolean(item.story_key || item.duplicate_of_item_id);
}

export function shouldShowTimeGroup(items: ItemSummary[], index: number, now = new Date()): boolean {
  if (index === 0) return true;
  return itemTimeGroup(items[index], now) !== itemTimeGroup(items[index - 1], now);
}
