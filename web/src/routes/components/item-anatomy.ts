import type { ItemSummary, Rfc3339UtcString } from '$lib/api-contract';
import { itemDisplayExcerpt, itemDisplayTimestamp } from '$lib/api-contract';

type TimeGroup = 'TODAY' | 'YESTERDAY' | 'EARLIER';

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

export function itemSummaryText(item: ItemSummary): string {
  return readableItemText(itemDisplayExcerpt(item)) ?? 'summary unavailable';
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

export function itemAgeLabel(item: ItemSummary, now = new Date()): string {
  const timestamp = itemTimestamp(item);
  if (!timestamp) return 'time unavailable';
  const date = new Date(timestamp);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase();
}

export function itemExtractionLabel(status: ItemSummary['extraction_status']): string {
  if (status === 'full') return 'full';
  if (status === 'partial_extraction') return 'partial';
  return 'excerpt';
}

export function itemSummaryProvenanceLabel(item: ItemSummary): string {
  if (readableItemText(itemDisplayExcerpt(item))) {
    return item.model_status === 'ok' ? 'model-backed' : 'fallback: excerpt-only';
  }
  if (item.model_status === 'model_latency_error') return 'fallback: model_status model_latency_error';
  return 'fallback: unavailable';
}

export function itemPriorityLabel(item: ItemSummary): string {
  if (item.value_tier) return `value: ${item.value_tier}`;
  if (item.model_status !== 'ok') return `quality: ${itemSummaryProvenanceLabel(item)}`;
  if (item.extraction_status !== 'full') return `quality: ${itemExtractionLabel(item.extraction_status)}`;
  return 'quality: source-backed';
}

export function shouldShowTimeGroup(items: ItemSummary[], index: number): boolean {
  if (index === 0) return true;
  return itemTimeGroup(items[index]) !== itemTimeGroup(items[index - 1]);
}
