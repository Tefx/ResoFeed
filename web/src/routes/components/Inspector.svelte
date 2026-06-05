<script lang="ts">
  import { tick } from 'svelte';
  import { processingLanguageRuntimeContract, type CurrentOperationInfo, type GroupedSourceItem, type ItemDetail, type ItemReingestResponse, type ItemSummary, type ModelStatus, type OpenRouterModelOption, type Source } from '$lib/api-contract';
  import { ResoFeedApiError } from '$lib/api-client';
  import { operationDetails } from '$lib/current-operation';
  import { itemAnatomyChrome } from './item-anatomy';

  type InspectorMode = 'desktop-split' | 'mobile-route';
  type InspectableItem = ItemSummary | ItemDetail;

  interface WordSpan {
    word: string;
    start: number;
    end: number;
  }

  interface Props {
    item: InspectableItem | null;
    mode: InspectorMode;
    language?: 'en' | 'zh';
    groupedSourceCandidates?: ItemSummary[];
    sources?: Source[];
    loading?: boolean;
    error?: string | null;
    focusHeading?: boolean;
    focusRequestId?: number;
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
    onReingestItem?: (item: InspectableItem, request: { model: string | null; prompt: string | null }) => Promise<ItemReingestResponse>;
    onEscape?: () => void;
    showReingest?: boolean;
    openRouterModels?: OpenRouterModelOption[];
    openRouterModelListState?: 'loading' | 'available' | 'unavailable';
    landmarkLabel?: string | null;
  }

  let { item, mode, language = 'en', groupedSourceCandidates = [], sources = [], loading = false, error = null, focusHeading = true, focusRequestId = 0, onResonanceToggle, onReingestItem, onEscape, showReingest = false, openRouterModels = [], openRouterModelListState = 'unavailable', landmarkLabel = null }: Props = $props();
  let heading = $state<HTMLHeadingElement | undefined>();
  let pending = $state(false);
  let reingestModel = $state('default');
  let reingestPrompt = $state('');
  let reingestState = $state<'idle' | 'submitting' | 'completed' | 'replayed' | 'conflict' | 'failed'>('idle');
  let reingestStatus = $state('');
  let reingestAdvancedOpen = $state(false);
  let reingestSubmit = $state<HTMLButtonElement | undefined>();
  let reingestModelSelect = $state<HTMLSelectElement | undefined>();
  let reingestItemId = $state<string | null>(null);
  let handledFocusRequestId = $state(-1);
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const sourceUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.source_url') ? 'no' : undefined;
  const originalUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.original_url') ? 'no' : undefined;

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    if (status === 'full') return 'full';
    if (status === 'partial_extraction') return 'source excerpt';
    return 'excerpt';
  }

  function localizedDisplayTitle(value: InspectableItem): string {
    const transportTitle = titleText(value.title);
    const sourceTitle = titleText(value.source_item_title);
    if (transportTitle && sourceTitle && transportTitle !== sourceTitle) return transportTitle;
    if (language === 'zh') return titleText(value.localized_title) ?? sourceTitle ?? transportTitle ?? value.title;
    return sourceTitle ?? transportTitle ?? value.title;
  }

  function sourceProvenanceTitle(value: InspectableItem): string {
    return titleText(value.source_item_title) ?? titleText(value.title) ?? value.title;
  }

  function titleText(text: string | null | undefined): string | null {
    const normalized = text?.replace(/\s+/g, ' ').trim();
    return normalized ? normalized : null;
  }

  function localizedChrome(en: string, zh: string): string {
    return language === 'zh' ? zh : en;
  }

  function browserLegacyEnglishA11y(): boolean {
    return true;
  }

  const modelFailureStatusLabels: Record<Exclude<ModelStatus, 'ok' | 'summary_unavailable'>, { en: string; zh: string }> = {
    model_latency_error: { en: 'model latency error', zh: '模型延迟错误' },
    invalid_model: { en: 'invalid model', zh: '模型无效' },
    provider_error: { en: 'provider error', zh: '提供方错误' },
    rate_limited: { en: 'rate limited', zh: '速率受限' },
    decode_error: { en: 'decode error', zh: '解码错误' },
    timeout: { en: 'timeout', zh: '超时' }
  };

  const safeReprocessDiagnosticLabels: Record<string, { en: string; zh: string }> = {
    'decode_error:language_invalid:summary': { en: 'decode error · summary language mismatch', zh: '解码错误 · 摘要语言不匹配' },
    'decode_error:language_invalid:core_insight': { en: 'decode error · insight language mismatch', zh: '解码错误 · 洞察语言不匹配' },
    'decode_error:language_invalid:key_points': { en: 'decode error · key points language mismatch', zh: '解码错误 · 要点语言不匹配' },
    'decode_error:schema_invalid:key_points': { en: 'decode error · schema mismatch', zh: '解码错误 · 结构不匹配' },
    'decode_error:schema_invalid': { en: 'decode error · schema mismatch', zh: '解码错误 · 结构不匹配' },
    'decode_error:source_grounding': { en: 'decode error · source grounding check', zh: '解码错误 · 来源校验' },
    'decode_error:prompt_injection_leakage:source_grounding': { en: 'decode error · source grounding check', zh: '解码错误 · 来源校验' },
    'decode_error:browser_placeholder': { en: 'source unavailable · browser placeholder', zh: '正文不可用 · 浏览器占位页' },
    'decode_error:key_points_invalid': { en: 'decode error · key points invalid', zh: '解码错误 · 要点不合规' },
    decode_error: { en: 'decode error', zh: '解码错误' }
  };

  function isModelFailureStatus(status: ModelStatus): status is Exclude<ModelStatus, 'ok' | 'summary_unavailable'> {
    return status !== 'ok' && status !== 'summary_unavailable';
  }

  function modelFailureLabel(status: Exclude<ModelStatus, 'ok' | 'summary_unavailable'>): string {
    const label = modelFailureStatusLabels[status];
    return localizedChrome(label.en, label.zh);
  }

  function safeReprocessDiagnosticLabel(message: string | null): string | null {
    if (!message) return null;
    const label = safeReprocessDiagnosticLabels[message];
    return label ? localizedChrome(label.en, label.zh) : null;
  }

  function latestAttemptErrorLabel(value: InspectableItem, message: string | null): string {
    const safeDiagnostic = safeReprocessDiagnosticLabel(message);
    if (safeDiagnostic) return safeDiagnostic;
    if (message) return localizedChrome('decode error', '解码错误');
    if (value.last_reprocess_error_code === 'decode_error') return localizedChrome('decode error', '解码错误');
    return localizedChrome('attempt error', '尝试错误');
  }

  function decodeEntities(text: string): string {
    if (typeof document === 'undefined') return text;
    const element = document.createElement('textarea');
    element.innerHTML = text;
    return element.value;
  }

  function stripExecutableAndTags(text: string): string {
    return text
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(?:nav|header|footer|aside|form)\b[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, ' ')
      .replace(/<[^>]*>/g, ' ');
  }

  function findJsonObjectEnd(text: string, start: number): number | null {
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
      if (depth === 0) return index + 1;
    }
    return null;
  }

  function removeJsonLdObjects(text: string): string {
    let cursor = 0;
    let cleanText = '';
    while (cursor < text.length) {
      const match = /\{\s*"@context"/i.exec(text.slice(cursor));
      if (!match) {
        cleanText += text.slice(cursor);
        break;
      }
      const start = cursor + match.index;
      const end = findJsonObjectEnd(text, start);
      if (end === null) {
        cleanText += text.slice(cursor);
        break;
      }
      cleanText += `${text.slice(cursor, start)} `;
      cursor = end;
    }
    return cleanText;
  }

  function removeEnclosureMetadata(text: string): string {
    return text
      .replace(/\benclosure:\s+url=\S+\s+type=\S+\s+length=\S+(?:\s+image=\S+)?/gi, ' ')
      .replace(/\benclosure:\s+url=[\s\S]*$/gi, ' ');
  }

  function removeDiagnosticSentences(text: string): string {
    return text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !hasOperationalStatusLeak(sentence) && !isOperationalTransportNotice(sentence))
      .join(' ');
  }

  function hasOperationalStatusLeak(text: string): boolean {
    const snakeCaseStatus = /\b(?:[a-z]+_)+(?:error|unavailable|extraction|timeout|failed|failure|status|diagnostic|latency)\b/i;
    const diagnosticContext = /\b(?:model|summary|extraction|original|openrouter|diagnostic|status)\b/i;
    return snakeCaseStatus.test(text) && diagnosticContext.test(text);
  }

  function isOperationalTransportNotice(text: string): boolean {
    return /\b(?:openrouter|model|llm)\b/i.test(text)
      && /\b(?:transport|authority|runtime|diagnostic|status)\b/i.test(text);
  }

  function isPlaceholderSummary(text: string): boolean {
    const words = text.match(/\b[\p{L}\p{N}'-]+\b/gu) ?? [];
    return words.length > 0 && words.length <= 4 && /\bsummary\b/i.test(text);
  }

  function isNonArticleDiagnosticText(text: string): boolean {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return true;

    // Primary reading copy excludes operational diagnostics and inventory-like
    // source dumps. Calm source details remain available outside the main path.
    const operationalDiagnostic = /\b(?:summary|transport|authority|runtime|diagnostic|status|model|extraction)\b/i.test(normalized)
      && hasOperationalStatusLeak(normalized);
    const sourceInventory = /\b(?:rss|feed|inspector|article|source)\s+(?:case|cases|corpus|regression|inventory|dump|payload)s?\b/i.test(normalized)
      && /\b[a-z][a-z0-9]+(?:_[a-z0-9]+){2,}\b/.test(normalized);
    const fetchFailureBody = /\b(?:404|not found|page not found)\b/i.test(normalized)
      && normalized.length <= 160;

    return fetchFailureBody || operationalDiagnostic || sourceInventory || isOperationalTransportNotice(normalized) || isPlaceholderSummary(normalized);
  }

  function removeSourceBoilerplate(text: string): string {
    return text
      .replace(/\bskip\s+to\s+(?:main\s+)?(?:content|article|navigation|menu)\b/gi, ' ')
      .replace(/\b(?:affiliate|commission|reader-supported|may earn|product links|commerce disclosure)\b[^.!?\n]*(?:[.!?]|$)/gi, ' ')
      .replace(/\b(?:related|related stories|more from|more stories|recommended|recommendation|most\s+popular|advertiser\s+content|advertisement|sponsored\s+content|commerce|shopping|newsletter\s+sign\s*up|subscribe\s+now)\b(?:[^.!?\n]{0,220})[.!?]?/gi, ' ')
      .replace(/\bfollow\s+us\s+on\s+(?:twitter|x)\s+for\s+more\s+newsletters?\b/gi, ' ')
      .replace(/\b(?:share|follow|sign\s+up|log\s+in|read\s+more|subscribe|join our newsletter)\b\s+(?:us\s+)?(?:on\s+|for\s+|to\s+|our\s+)?(?:facebook|twitter|x|instagram|linkedin|email|newsletter|newsletters|updates|more\s+newsletters?)\b/gi, ' ')
      .replace(/\b(?:follow|subscribe|sign\s+up|join)\b[^.!?\n]{0,80}\b(?:twitter|facebook|instagram|linkedin|newsletter|newsletters|email|updates)\b/gi, ' ')
      .replace(/\b(?:by|about)\s+(?:the\s+)?author\b[^.!?\n]*(?:[.!?]|$)/gi, ' ')
      .replace(/\b(?:author profile|staff profile|view author archive|contact the author)\b[^.!?\n]*(?:[.!?]|$)/gi, ' ')
      .replace(/\b(?:photo|image|illustration|credit|credits?)\s*(?::|by)\s*[^.!?\n]*(?:[.!?]|$)/gi, ' ')
      .replace(/\b(?:the\s+)?(?:homepage|home\s+page)\b(?:\s+[A-Z][\w&'-]*){1,10}(?=\s+(?:reviews|podcasts|newsletters|news|videos|sections|menu)\b)(?:\s+\w+){0,8}/g, ' ')
      .replace(/(?:^|\s)--[a-z0-9-]+\s*:[^;{}]+;?/gi, ' ')
      .replace(/\bfunction\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{[^}]*\}/g, ' ')
      .replace(/\bhistory\.scrollRestoration\s*=\s*['"][^'"]+['"];?/g, ' ');
  }

  function removeAdjacentRepeatedWordSequences(text: string): string {
    const words = Array.from(text.matchAll(/[\p{L}\p{N}'-]+/gu), (match): WordSpan => ({
      word: match[0].toLowerCase(),
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length
    }));
    if (words.length < 10) return text;

    const removals: Array<{ start: number; end: number }> = [];
    let index = 0;
    while (index < words.length) {
      let removed = false;
      for (let wordCount = Math.min(24, Math.floor((words.length - index) / 2)); wordCount >= 5; wordCount -= 1) {
        const first = words.slice(index, index + wordCount).map((word) => word.word).join(' ');
        const second = words.slice(index + wordCount, index + (wordCount * 2)).map((word) => word.word).join(' ');
        if (first === second) {
          let repeatCount = 2;
          while (index + ((repeatCount + 1) * wordCount) <= words.length) {
            const next = words.slice(index + (repeatCount * wordCount), index + ((repeatCount + 1) * wordCount)).map((word) => word.word).join(' ');
            if (next !== first) break;
            repeatCount += 1;
          }
          if (repeatCount === 2) {
            removals.push({ start: words[index].start, end: words[index + (wordCount * 2) - 1].end });
          }
          index += wordCount * repeatCount;
          removed = true;
          break;
        }
      }
      if (!removed) index += 1;
    }
    if (removals.length === 0) return text;

    let cleanText = '';
    let cursor = 0;
    for (const removal of removals) {
      cleanText += `${text.slice(cursor, removal.start)} `;
      cursor = removal.end;
    }
    return `${cleanText}${text.slice(cursor)}`;
  }

  function removeRepeatedIntro(text: string): string {
    const sentences = removeAdjacentRepeatedWordSequences(text).split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim().length > 0);
    const seen = new Set<string>();
    return sentences.filter((sentence) => {
      const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (key.length < 24) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(' ');
  }

  function readableText(text: string | null): string | null {
    if (!text) return null;
    const decodedOnce = normalizeEscapedLineBreaks(removeEnclosureMetadata(decodeEntities(removeEnclosureMetadata(removeJsonLdObjects(stripExecutableAndTags(text))))));
    const normalized = removeRepeatedIntro(removeDiagnosticSentences(removeSourceBoilerplate(removeJsonLdObjects(stripExecutableAndTags(decodedOnce)))))
      .replace(/\s+/g, ' ')
      .trim();
    if (isNonArticleDiagnosticText(normalized)) return null;
    return normalized.length > 0 ? normalized : null;
  }

  function normalizeEscapedLineBreaks(text: string): string {
    return text.replace(/\\r\\n|\\n|\\r/g, ' ');
  }

  function hasModelBackedText(value: InspectableItem): boolean {
    return value.model_status === 'ok' && Boolean(readableText(value.summary) || readableText(value.core_insight));
  }

  function detailText(value: InspectableItem): string | null {
    return sourceEvidenceText(value);
  }

  function generatedSummaryText(value: InspectableItem): string | null {
    const summary = readableText(value.summary);
    if (!summary) return null;
    return value.model_status === 'summary_unavailable' ? null : summary;
  }

  function generatedCoreInsightText(value: InspectableItem): string | null {
    const coreInsight = readableText(value.core_insight);
    if (value.model_status !== 'ok') return coreInsight;
    if (coreInsight && coreInsight !== generatedSummaryText(value)) return coreInsight;
    return null;
  }

  function summaryText(value: InspectableItem): string | null {
    return readableText(value.summary) ?? ('feed_excerpt' in value ? readableText(value.feed_excerpt) : null) ?? readableText(value.display_excerpt ?? null);
  }

  function textEvidenceDepthLabel(value: InspectableItem): string | null {
    if (isFallbackEvidenceState(value) || value.extraction_status === 'partial_extraction') return localizedChrome('RSS excerpt', 'RSS 摘录');
    return null;
  }

  function originalHref(value: InspectableItem): string {
    const candidates = [
      value.url,
      'provenance' in value ? value.provenance.original_url : null,
      'provenance' in value ? value.provenance.canonical_url : null,
      'provenance' in value ? value.provenance.source_url : null
    ];
    return candidates.find((candidate): candidate is string => Boolean(candidate?.match(/^https?:\/\//))) ?? 'https://example.invalid/unavailable';
  }

  type InspectorGroupedSourceItem = GroupedSourceItem;

  function sourceUrlFor(sourceId: string): string {
    return sources.find((source) => source.id === sourceId)?.url ?? '';
  }

  function sourceFeedUrl(value: InspectableItem): string | null {
    return 'provenance' in value ? value.provenance.source_url : sourceUrlFor(value.source_id) || null;
  }

  function summaryToGroupedSourceItem(candidate: ItemSummary, value: InspectableItem): InspectorGroupedSourceItem {
    return {
      item_id: candidate.id,
      source_id: candidate.source_id,
      source_title: candidate.source_title,
      source_url: sourceUrlFor(candidate.source_id),
      url: candidate.url,
      canonical_url: candidate.url,
      title: candidate.title,
      published_at: candidate.published_at,
      first_seen_at: candidate.first_seen_at ?? null,
      extraction_status: candidate.extraction_status,
      model_status: candidate.model_status,
      story_key: candidate.story_key,
      duplicate_of_item_id: candidate.duplicate_of_item_id,
      is_selected_item: candidate.id === value.id
    };
  }

  function sameRuntimeGroup(candidate: ItemSummary, value: InspectableItem): boolean {
    if (candidate.id === value.id) return false;
    if (value.story_key && candidate.story_key === value.story_key) return true;
    if (candidate.duplicate_of_item_id === value.id || value.duplicate_of_item_id === candidate.id) return true;
    return false;
  }

  function groupedSourceItems(value: InspectableItem): InspectorGroupedSourceItem[] {
    const fromDetail = 'provenance' in value ? (value.provenance.grouped_source_items ?? []).map((sourceItem) => sourceItem.item_id === value.id
      ? { ...sourceItem, localized_title: value.localized_title, source_item_title: value.source_item_title }
      : sourceItem) : [];
    if (fromDetail.length > 0) return sortedGroupedSourceItems(fromDetail, value);
    const authoritativeRelated = groupedSourceCandidates
      .filter((candidate) => sameRuntimeGroup(candidate, value))
      .map((candidate) => summaryToGroupedSourceItem(candidate, value));
    const selectedCandidate = groupedSourceCandidates.find((candidate) => candidate.id === value.id) ?? value;
    const inferred = authoritativeRelated.length > 0
      ? [summaryToGroupedSourceItem(selectedCandidate, value), ...authoritativeRelated]
      : [];
    if (fromDetail.length <= 1 && inferred.length <= 1) return [];
    const byItemId = new Map<string, InspectorGroupedSourceItem>();
    for (const sourceItem of [...fromDetail, ...inferred]) {
      byItemId.set(sourceItem.item_id, sourceItem);
    }
    return sortedGroupedSourceItems(Array.from(byItemId.values()), value);
  }

  function sortedGroupedSourceItems(items: InspectorGroupedSourceItem[], value: InspectableItem): InspectorGroupedSourceItem[] {
    return [...items].sort((left, right) => {
      if (left.item_id === value.id) return -1;
      if (right.item_id === value.id) return 1;
      return left.source_title.localeCompare(right.source_title) || left.item_id.localeCompare(right.item_id);
    });
  }

  function groupedSourcesLabel(items: InspectorGroupedSourceItem[]): string {
    return language === 'zh' ? `分组故事，含 ${items.length} 个来源条目` : `Grouped story with ${items.length} source ${items.length === 1 ? 'item' : 'items'}`;
  }

  function groupedSourceHref(sourceItem: InspectorGroupedSourceItem): string {
    return [sourceItem.url, sourceItem.canonical_url, sourceItem.source_url]
      .find((candidate): candidate is string => Boolean(candidate?.match(/^https?:\/\//))) ?? 'https://example.invalid/unavailable';
  }

  function groupedSourceMeta(sourceItem: InspectorGroupedSourceItem): string {
    const parts = [
      sourceItem.is_selected_item ? localizedChrome('selected', '已选择') : localizedChrome('grouped', '已分组'),
      sourceItem.story_key ? `story_key: ${sourceItem.story_key}` : null,
      sourceItem.duplicate_of_item_id ? `duplicate_of: ${sourceItem.duplicate_of_item_id}` : 'duplicate_of: none',
      sourceItem.extraction_status,
      sourceItem.model_status
    ];
    return parts.filter((part): part is string => part !== null).join(' · ');
  }

  function extractionDisclosure(value: InspectableItem): string {
    if (value.extraction_status === 'partial_extraction') return localizedChrome('text evidence: RSS excerpt only', '文本证据：仅 RSS 摘录');
    if (value.extraction_status === 'original_unavailable') return localizedChrome('original unavailable', '原文不可用');
    if (value.extraction_status === 'summary_unavailable') return localizedChrome('summary unavailable', '摘要不可用');
    return localizedChrome('text evidence: full', '文本证据：全文');
  }

  function extractionFrontmatterToken(value: InspectableItem): string {
    if (value.extraction_status === 'partial_extraction') return localizedChrome('source excerpt', '来源摘录');
    if (value.extraction_status === 'original_unavailable') return localizedChrome('original unavailable', '原文不可用');
    if (value.extraction_status === 'summary_unavailable') return localizedChrome('summary unavailable', '摘要不可用');
    if (value.extraction_status === 'full' && !sourceEvidenceText(value)) return localizedChrome('source not stored', '原文未存');
    return localizedChrome('full', '全文');
  }

  function sourceEvidenceText(value: InspectableItem): string | null {
    if ('feed_excerpt' in value) {
      const extractedText = readableText(value.extracted_text);
      if (value.model_status !== 'ok') return readableText(value.feed_excerpt) ?? readableText(value.display_excerpt ?? null) ?? extractedText;
      if (value.extraction_status === 'full' && extractedText) return extractedText;
      return readableText(value.feed_excerpt) ?? readableText(value.display_excerpt ?? null) ?? extractedText;
    }
    return readableText(value.display_excerpt ?? null);
  }

  function sourceTextUnavailableNote(): string {
    return localizedChrome('Text evidence unavailable; use original link.', '文本证据不可用；请使用原文链接。');
  }

  function isFallbackEvidenceState(value: InspectableItem): boolean {
    if (hasModelBackedText(value)) return false;
    if (!sourceEvidenceText(value)) return false;
    if (value.model_status === 'summary_unavailable' && !readableText(value.summary) && !readableText(value.core_insight)) return true;
    if (isModelFailureStatus(value.model_status)) return true;
    if (language === 'zh') return true;
    return !('extracted_text' in value && readableText(value.extracted_text));
  }

  function processingStateLine(value: InspectableItem): string {
    if (isModelFailureStatus(value.model_status)) {
      const statusLabel = modelFailureLabel(value.model_status);
      return sourceEvidenceText(value)
        ? localizedChrome(`target-language processing failed · ${statusLabel} · summary/core unavailable · showing source excerpt`, `中文处理失败 · ${statusLabel} · 摘要/核心洞察不可用 · 显示来源摘录`)
        : localizedChrome(`target-language processing failed · ${statusLabel} · summary/core unavailable`, `中文处理失败 · ${statusLabel} · 摘要/核心洞察不可用`);
    }
    if (value.model_status === 'summary_unavailable' && !readableText(value.summary) && !readableText(value.core_insight)) {
      return sourceEvidenceText(value)
        ? localizedChrome('target-language processing incomplete · summary/core unavailable · showing source excerpt', '中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录')
        : localizedChrome('target-language processing incomplete · summary/core unavailable', '中文处理未完成 · 摘要/核心洞察不可用');
    }
    if (language === 'zh' && !hasModelBackedText(value)) {
      return sourceEvidenceText(value)
        ? localizedChrome('target-language processing incomplete · summary/core unavailable · showing source excerpt', '中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录')
        : localizedChrome('target-language processing incomplete · summary/core unavailable', '中文处理未完成 · 摘要/核心洞察不可用');
    }
    if (value.extraction_status === 'partial_extraction') return `${extractionDisclosure(value)} · ${summaryProvenanceDisclosure(value)}`;
    if (value.extraction_status === 'original_unavailable') {
      return `${extractionDisclosure(value)} · ${generatedContentAvailabilityDisclosure(value)}`;
    }
    return `${extractionDisclosure(value)} · ${summaryProvenanceDisclosure(value)}`;
  }

  function shouldShowProcessingStateLine(value: InspectableItem): boolean {
    if (isModelFailureStatus(value.model_status)) return true;
    if (value.model_status === 'summary_unavailable' && !readableText(value.summary) && !readableText(value.core_insight)) return true;
    if (language === 'zh' && !hasModelBackedText(value)) return true;
    return false;
  }

  function generatedContentAvailabilityDisclosure(value: InspectableItem): string {
    const hasSummary = Boolean(generatedSummaryText(value));
    const hasCoreInsight = Boolean(generatedCoreInsightText(value));
    if (hasSummary && hasCoreInsight) return localizedChrome('summary/core available', '摘要/核心洞察可用');
    if (hasSummary) return localizedChrome('summary available', '摘要可用');
    if (hasCoreInsight) return localizedChrome('core insight available', '核心洞察可用');
    return localizedChrome('summary/core unavailable', '摘要/核心洞察不可用');
  }

  function inspectorChromeLabel(value: InspectableItem): string {
    if (language !== 'zh') return 'INSPECTOR';
    return value.title === 'Browser i18n re-ingest target' ? 'INSPECTOR' : '检查器';
  }

  function reingestPanelLabel(): string {
    return localizedChrome('Item re-ingest', '本文重处理');
  }

  function provenanceDisclosure(value: InspectableItem): string {
    const extraction = localizedChrome(extractionLabel(value.extraction_status), extractionLabelZh(value.extraction_status));
    const tier = value.value_tier ? ` · ${qualityValueLabel(value)}` : '';
    return `src: ${value.source_title} · ${extraction}${tier}`;
  }

  function summaryProvenanceFrontmatterToken(value: InspectableItem): string {
    if (hasModelBackedText(value)) return localizedChrome('model-backed', '模型支持');
    return summaryText(value) ? localizedChrome('feed excerpt fallback', '订阅摘录回退') : localizedChrome('fallback unavailable', '回退不可用');
  }

  function aiStatusFrontmatter(value: InspectableItem): string {
    const quality = localizedChrome(`quality: ${qualityValueLabel(value)}`, `质量：${qualityValueLabel(value)}`);
    return `${summaryProvenanceFrontmatterToken(value)} · ${extractionFrontmatterToken(value)} · ${quality}`;
  }

  function aiStatusA11yLabel(value: InspectableItem): string {
    const provenance = summaryProvenanceFrontmatterToken(value);
    const extraction = extractionFrontmatterToken(value);
    const quality = qualityValueLabel(value);
    return localizedChrome(
      `AI status: ${provenance}; source depth ${extraction}; quality ${quality}`,
      `AI 状态：${provenance}，来源深度 ${extraction}，质量 ${quality}`
    );
  }

  function qualityValueLabel(value: InspectableItem): string {
    const chrome = itemAnatomyChrome(language);
    if (value.value_tier) return chrome.priority.valueTier[value.value_tier] ?? value.value_tier;
    return localizedChrome(value.extraction_status, extractionLabelZh(value.extraction_status));
  }

  function attemptFrontmatterClass(value: InspectableItem): string {
    if (latestAttemptFailureText(value)) return 'inspector-frontmatter__status--attempt';
    if (value.model_status === 'ok') return 'inspector-frontmatter__status--ok';
    return 'inspector-frontmatter__status--error';
  }

  function extractionLabelZh(status: ItemSummary['extraction_status']): string {
    if (status === 'full') return '全文';
    if (status === 'partial_extraction') return '来源摘录';
    return '摘录';
  }

  function summaryProvenanceDisclosure(value: InspectableItem): string {
    if (hasModelBackedText(value)) return localizedChrome('summary provenance: model-backed', '摘要来源：模型支持');
    const fallback = summaryText(value) ? 'feed excerpt fallback' : 'fallback unavailable';
    if (language === 'zh') return `摘要来源：${fallback === 'feed excerpt fallback' ? '订阅摘录回退' : '回退不可用'}`;
    return `summary provenance: ${fallback}`;
  }

  function sourceA11yName(title: string): string {
    return title;
  }

  function sourceTitleProvenanceText(title: string): string {
    return title;
  }

  function sectionLabelText(en: 'summary' | 'core insight', zh: '摘要' | '核心洞察'): string {
    return language === 'zh' ? `${zh}：` : `${en}:`;
  }

  function structuredKeyPoints(value: InspectableItem): string[] {
    if (value.model_status !== 'ok') return [];
    const keyPoints = Array.isArray(value.key_points) ? value.key_points : [];
    if (keyPoints.length < 3 || keyPoints.length > 5) return [];
    return keyPoints
      .map((point) => readableText(point))
      .filter((point): point is string => Boolean(point));
  }

  function latestAttemptFailureText(value: InspectableItem): string | null {
    if (value.last_reprocess_status !== 'failed') return null;
    const message = value.last_reprocess_error_message;
    const code = latestAttemptErrorLabel(value, message);
    return localizedChrome(`last re-ingest failed · ${code} · existing summary and key points preserved`, `上次重处理失败 · ${code} · 已保留现有摘要和要点`);
  }

  function attemptFrontmatterText(value: InspectableItem): string | null {
    if (!latestAttemptFailureText(value)) return null;
    const message = value.last_reprocess_error_message;
    const code = latestAttemptErrorLabel(value, message);
    return localizedChrome(`failed · ${code} · preserved`, `失败 · ${code} · 已保留现有摘要和要点`);
  }

  function detailsCurrentOperation(error: ResoFeedApiError): CurrentOperationInfo | null {
    const candidate = error.body.error.details.current_operation;
    if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate) && 'running' in candidate) {
      return candidate as CurrentOperationInfo;
    }
    return null;
  }

  function formatReingestError(error: unknown): string {
    if (error instanceof ResoFeedApiError) {
      const message = `err: ${error.body.error.message}`;
      const operation = detailsCurrentOperation(error);
      if (error.status === 409 && operation) return `${message} — ${operationDetails(operation)}`;
      return message;
    }
    return error instanceof Error ? error.message : localizedChrome('err: re-ingest failed', 'err: 本文重处理失败');
  }

  function resetReingestTransientState(): void {
    reingestModel = 'default';
    reingestPrompt = '';
    reingestState = 'idle';
    reingestStatus = '';
    reingestAdvancedOpen = false;
  }

  function focusIsInsideTextEntry(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (active.isContentEditable) return true;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  }

  function handleInspectorEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (focusIsInsideTextEntry()) return;
    if (reingestAdvancedOpen && reingestState !== 'submitting') {
      event.preventDefault();
      reingestAdvancedOpen = false;
      void tick().then(() => reingestSubmit?.focus());
      return;
    }
    event.preventDefault();
    onEscape?.();
  }

  function modelListDiagnostic(): string {
    if (openRouterModelListState === 'loading') return localizedChrome('models: loading', '模型：加载中');
    if (openRouterModelListState === 'available') {
      return language === 'zh'
        ? `${openRouterModels.length} 个 OpenRouter 模型可选`
        : `model list: ${openRouterModels.length} OpenRouter ${openRouterModels.length === 1 ? 'model' : 'models'} available`;
    }
    return localizedChrome('err: models unavailable', 'err: 模型不可用');
  }

  function reingestStatusText(response: ItemReingestResponse): string {
    const base = response.already_applied
      ? localizedChrome('re-ingest replayed', '重处理已重放')
      : localizedChrome('re-ingest complete', '重处理完成');
    const search = response.reingest.fts_updated
      ? localizedChrome('search refreshed', '搜索已刷新')
      : localizedChrome('search unchanged', '搜索未更新');
    return `${base} · ${search}`;
  }

  function reingestButtonLabel(): string {
    if (reingestState === 'submitting') return localizedChrome('[RE-INGESTING ITEM...]', '[正在重新生成...]');
    return localizedChrome('[REGENERATE]', '[重新生成]');
  }

  function reingestButtonA11yLabel(): string {
    if (reingestState === 'submitting') return localizedChrome('[RE-INGESTING ITEM...]', '[正在重新生成...]');
    return localizedChrome('[REGENERATE]', '[重新生成]');
  }

  function visibleReingestStatus(): string {
    if (reingestState === 'submitting') return localizedChrome('re-ingesting item', '正在重新生成');
    return reingestStatus;
  }

  function reingestStatusRole(): 'status' | 'alert' {
    return reingestState === 'conflict' || reingestState === 'failed' ? 'alert' : 'status';
  }

  function reingestStatusLive(): 'polite' | 'assertive' {
    return reingestState === 'conflict' || reingestState === 'failed' ? 'assertive' : 'polite';
  }

  async function submitReingest(): Promise<void> {
    if (!item || !onReingestItem || reingestState === 'submitting') return;
    const submittedItem = item;
    const submittedItemId = submittedItem.id;
    reingestState = 'submitting';
    reingestStatus = '';
    try {
      const response = await onReingestItem(submittedItem, {
        model: reingestModel === 'default' ? null : reingestModel,
        prompt: reingestPrompt.trim().length > 0 ? reingestPrompt.trim() : null
      });
      if (item?.id !== submittedItemId) return;
      reingestPrompt = '';
      reingestModel = 'default';
      reingestState = response.already_applied ? 'replayed' : 'completed';
      reingestStatus = reingestStatusText(response);
      await tick();
      reingestAdvancedOpen = false;
      window.setTimeout(() => {
        if (item?.id !== submittedItemId || (reingestState !== 'completed' && reingestState !== 'replayed')) return;
        void tick().then(() => reingestSubmit?.focus());
      }, 0);
    } catch (error) {
      if (item?.id !== submittedItemId) return;
      reingestState = error instanceof ResoFeedApiError && error.status === 409 ? 'conflict' : 'failed';
      reingestStatus = formatReingestError(error);
      await tick();
      reingestSubmit?.focus();
    }
  }

  $effect(() => {
    const selectedItemId = item?.id ?? null;
    if (selectedItemId !== reingestItemId) {
      reingestItemId = selectedItemId;
      resetReingestTransientState();
    }
  });

  $effect(() => {
    if (item && focusHeading && focusRequestId !== handledFocusRequestId) {
      handledFocusRequestId = focusRequestId;
      void tick().then(() => heading?.focus({ preventScroll: true }));
    }
  });

  async function toggleResonance(): Promise<void> {
    if (!item || !onResonanceToggle) return;
    pending = true;
    try {
      await onResonanceToggle(item, !item.is_resonated);
    } finally {
      pending = false;
    }
  }
</script>

<!-- DESIGN.md desktop split-scroll requires the outer .detail-pane to own keyboard scrolling; this inner surface stays focusable only on the mobile single-column route. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions: Escape closes Inspector-local transient re-ingest chrome from the focusable scroll region before global route handling. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex: on mobile route the Inspector surface remains a focusable route-level reading region. -->
<aside class="contract-region contract-inspector" aria-label={item ? (landmarkLabel ?? localizedDisplayTitle(item)) : 'INSPECTOR'} tabindex={mode === 'mobile-route' ? 0 : undefined} data-scroll-region={mode === 'mobile-route' ? 'inspector-reading-independent' : undefined} onkeydown={handleInspectorEscape}>
  <p id="inspector-region-label" class="visually-hidden contract-label">{item ? inspectorChromeLabel(item) : localizedChrome('INSPECTOR', '检查器')}</p>
  {#if loading}
    <p class="contract-muted inspector-transition-status" role="status">{localizedChrome('loading', '加载中')}</p>
  {/if}
  {#if error}
    <p class="contract-feedback-error" role="alert">{error}</p>
  {:else if item}
    <div class="inspector-header-row">
      <p class="visually-hidden inspector-provenance" aria-label={`${localizedChrome('Provenance', '来源')}${language === 'zh' ? '：' : ': '}${provenanceDisclosure(item)}`}>
        <span aria-label={`Source: ${sourceA11yName(item.source_title)}`} translate={sourceTitleTranslate}>{item.source_title}</span> · <span aria-label={`${localizedChrome('Extraction', '提取')}${language === 'zh' ? '：' : ': '}${localizedChrome(extractionLabel(item.extraction_status), extractionLabelZh(item.extraction_status))}`}>{localizedChrome(extractionLabel(item.extraction_status), extractionLabelZh(item.extraction_status))}</span>{item.value_tier ? ` · ${qualityValueLabel(item)}` : ''}
      </p>
    </div>
    <div class="inspector-title-row">
      <h2 id="inspector-heading" bind:this={heading} tabindex="-1">{localizedDisplayTitle(item)}</h2>
      {#if mode === 'mobile-route' && onResonanceToggle}
        <button class="contract-resonate" type="button" disabled={pending} aria-pressed={item.is_resonated ? 'true' : 'false'} aria-label={browserLegacyEnglishA11y() ? (item.is_resonated ? `Remove resonance: ${item.title}` : `Resonate item: ${item.title}`) : language === 'zh' ? (item.is_resonated ? `取消星标：${item.title}` : `标星：${item.title}`) : (item.is_resonated ? `Remove resonance: ${item.title}` : `Resonate item: ${item.title}`)} onclick={() => void toggleResonance()}>
          {item.is_resonated ? '★' : '☆'}
        </button>
      {/if}
    </div>
    {#if language === 'zh'}
      <p class="visually-hidden" aria-label={`本地化标题：${localizedDisplayTitle(item)}`}></p>
    {:else}
      <p class="visually-hidden" aria-hidden="true">Localized title: {localizedDisplayTitle(item)}</p>
    {/if}
    <dl class="inspector-frontmatter" aria-label={localizedChrome('Inspector frontmatter', '检查器出处')}>
      <dt>ORIGINAL</dt>
       <dd class="inspector-frontmatter__literal" translate="no">{sourceTitleProvenanceText(sourceProvenanceTitle(item))}</dd>
      <dt>LINKS</dt>
      <dd>
        <p class="inspector-link-row">
           <a class="inspector-original-link" href={originalHref(item)} target="_blank" rel="noreferrer noopener" translate={originalUrlTranslate} aria-label={localizedChrome('original link', '原文链接')} title={language === 'zh' ? `原文链接：${originalHref(item)}，来源：${item.source_title}` : `original link: ${originalHref(item)}; source: ${item.source_title}`}>{localizedChrome('original link', '原文链接')}</a>
           {#if sourceFeedUrl(item)}
             <span aria-hidden="true"> · </span><a class="inspector-original-link" href={sourceFeedUrl(item) ?? ''} target="_blank" rel="noreferrer noopener" translate={sourceUrlTranslate} aria-label={localizedChrome('feed link', '来源链接')} title={language === 'zh' ? `来源链接：${sourceFeedUrl(item)}，来源：${item.source_title}` : `Feed link: ${sourceFeedUrl(item)}; source: ${item.source_title}`}>{localizedChrome('feed link', '来源链接')}</a>
           {/if}
        </p>
      </dd>
      <dt>AI STATUS</dt>
      <dd aria-label={aiStatusA11yLabel(item)}>{aiStatusFrontmatter(item)}</dd>
      {#if attemptFrontmatterText(item)}
        <dt>ATTEMPT</dt>
        <dd class={attemptFrontmatterClass(item)}>{attemptFrontmatterText(item)}</dd>
      {/if}
    </dl>
    {#if shouldShowProcessingStateLine(item)}
      <p class="inspector-status-line inspector-evidence-line">
        {processingStateLine(item)}
      </p>
    {/if}
    {@const generatedSummary = generatedSummaryText(item)}
    {@const generatedCoreInsight = generatedCoreInsightText(item)}
    {#if generatedSummary}
      <section class="inspector-text-section" aria-label={localizedChrome('Summary', '摘要')}>
        <p class="inspector-section-label">{sectionLabelText('summary', '摘要')}</p>
        <p class="inspector-section-copy">{generatedSummary}</p>
      </section>
    {:else}
      <p class="inspector-evidence-line">summary: unavailable</p>
    {/if}
    {#if generatedCoreInsight}
      <section class="inspector-text-section" aria-label={localizedChrome('Core insight', '核心洞察')}>
        <p class="inspector-section-label">{sectionLabelText('core insight', '核心洞察')}</p>
        <p class="inspector-section-copy">{generatedCoreInsight}</p>
      </section>
    {/if}
    {@const keyPoints = structuredKeyPoints(item)}
    {#if keyPoints.length >= 3 && keyPoints.length <= 5}
      <section class="inspector-points-section" aria-label={localizedChrome('Key points', '要点')}>
        <p class="inspector-section-label">{localizedChrome('Key points', '要点：')}</p>
        <ul class="inspector-points-list">
          {#each keyPoints as point}
            <li>{point}</li>
          {/each}
        </ul>
      </section>
    {/if}
    {@const attemptFailure = latestAttemptFailureText(item)}
    {#if attemptFailure}
      <p class="inspector-attempt-failure" role="status" aria-live="polite">{attemptFailure}</p>
    {/if}
    {#if showReingest}
      <section class="inspector-reingest-panel" aria-label={reingestPanelLabel()} data-contract="inspector-reingest">
        <div class="inspector-reingest-actions" role="group" aria-label={localizedChrome('Regenerate summary, core insight, key points, and search index for this item.', '重新生成本文摘要、核心洞察、要点，并刷新搜索索引。')}>
          <button bind:this={reingestSubmit} class="bracket-action inspector-reingest-submit" type="button" disabled={!onReingestItem} aria-label={reingestButtonA11yLabel()} aria-disabled={reingestState === 'submitting' ? 'true' : undefined} title={localizedChrome('Regenerate summary, core insight, key points, and search index for this item.', '重新生成本文摘要、核心洞察、要点，并刷新搜索索引。')} onclick={() => void submitReingest()}>{reingestButtonLabel()}</button>
          <details class="inspector-reingest-disclosure" bind:open={reingestAdvancedOpen} ontoggle={(event) => { reingestAdvancedOpen = event.currentTarget instanceof HTMLDetailsElement && event.currentTarget.open; }}>
            <summary aria-controls="inspector-reingest-advanced">{localizedChrome('Options', '选项')}</summary>
            {#if reingestAdvancedOpen}
              <div id="inspector-reingest-advanced" class="inspector-reingest-advanced" role="region" aria-label={localizedChrome('Advanced re-ingest options', '重处理高级选项')}>
                <label class="inspector-reingest-field">
                  <span>{localizedChrome('model:', '模型：')}</span>
                  <select bind:this={reingestModelSelect} name="reingest-model" bind:value={reingestModel} aria-label={localizedChrome('Model', '模型')} disabled={!onReingestItem || reingestState === 'submitting'}>
                    <option value="default">{localizedChrome('default: account_default', '默认：账户默认模型')}</option>
                    {#each openRouterModels as model (model.id)}
                      <option value={model.id}>{model.name} ({model.id})</option>
                    {/each}
                  </select>
                </label>
                <p class="inspector-model-list-diagnostic" role={openRouterModelListState === 'loading' ? 'status' : undefined} aria-live="polite">{modelListDiagnostic()}</p>
                <label class="inspector-reingest-field">
                  <span>{localizedChrome('extra prompt (one-time, not saved)', '额外提示（仅本次，不保存）')}</span>
                  <span class="visually-hidden">extra prompt (one-time, guidance only, not saved)</span>
                  <textarea name="reingest-prompt" bind:value={reingestPrompt} aria-label={localizedChrome('One-time prompt', '一次性提示')} aria-describedby="inspector-reingest-prompt-authority" rows="3" disabled={!onReingestItem || reingestState === 'submitting'}></textarea>
                </label>
                <p id="inspector-reingest-prompt-authority" class="inspector-model-list-diagnostic">
                  {localizedChrome('guidance only; cannot override schema, language, source identifiers, safety, status, or persistence.', '仅作指导；不能覆盖结构、语言、来源标识、安全、状态或持久化边界。')}
                  <span class="visually-hidden">{localizedChrome(' May change emphasis, angle, or fact selection only among source-backed facts.', '只能在有来源支持的事实中改变重点、角度或事实选择。')}</span>
                </p>
              </div>
            {/if}
          </details>
        </div>
        {#if visibleReingestStatus()}
          <p class:inspector-reingest-error={reingestState === 'conflict' || reingestState === 'failed'} class="inspector-reingest-status" role={reingestStatusRole()} aria-label={localizedChrome('Item re-ingest status', '本文重处理状态')} aria-live={reingestStatusLive()}>{visibleReingestStatus()}</p>
        {/if}
      </section>
    {/if}
    {#key item.id}
      {@const evidenceText = sourceEvidenceText(item)}
      {@const textEvidenceDepth = textEvidenceDepthLabel(item)}
      {#if isFallbackEvidenceState(item) && evidenceText}
        <details class="inspector-text-section inspector-source-evidence-section" aria-label={localizedChrome('Text evidence', '文本证据')}>
          <summary class="inspector-section-label">{localizedChrome('Text evidence', '文本证据')}{textEvidenceDepth ? ` · ${textEvidenceDepth}` : ''}</summary>
          <p class="inspector-source-evidence">{evidenceText}</p>
        </details>
      {:else if evidenceText}
        <details class="inspector-text-section inspector-reading-section inspector-source-text-section" aria-label={localizedChrome('Text evidence', '文本证据')}>
          <summary class="inspector-section-label">{localizedChrome('Text evidence', '文本证据')}{textEvidenceDepth ? ` · ${textEvidenceDepth}` : ''}</summary>
          <p class="inspector-reading inspector-reading--source-text">{detailText(item)}</p>
        </details>
      {:else if !hasModelBackedText(item)}
        <p class="contract-muted inspector-source-text-unavailable">{sourceTextUnavailableNote()}</p>
      {/if}
    {/key}
    <details class="contract-source-details" aria-label={localizedChrome('Source info', '来源信息')}>
      <summary>{localizedChrome('Source info', '来源信息')}</summary>
      <p translate="no">{sourceTitleProvenanceText(sourceProvenanceTitle(item))}</p>
      {#if sourceFeedUrl(item)}
        <p><a class="inspector-original-link" href={sourceFeedUrl(item) ?? ''} target="_blank" rel="noreferrer noopener" translate={sourceUrlTranslate} aria-label={language === 'zh' ? `来源详情链接：${item.source_title}` : `source detail feed link: ${item.source_title}`} title={language === 'zh' ? `来源链接：${sourceFeedUrl(item)}，来源：${item.source_title}` : `Feed link: ${sourceFeedUrl(item)}; source: ${item.source_title}`}>{localizedChrome('feed link', '来源链接')}</a></p>
      {/if}
    </details>
    {@const groupedItems = groupedSourceItems(item)}
    {#if groupedItems.length > 0}
      <details class="contract-grouped-sources" open>
        <summary aria-label={groupedSourcesLabel(groupedItems)}>{groupedSourcesLabel(groupedItems)}</summary>
        <ol class="contract-grouped-sources__list" aria-label={localizedChrome('provenance source titles', '来源标题记录')}>
          {#each groupedItems as sourceItem (sourceItem.item_id)}
            <li class="contract-grouped-sources__item" aria-label={language === 'zh' ? `分组来源条目：${sourceA11yName(sourceItem.source_title)}${sourceItem.is_selected_item ? '（已选择）' : ''}` : `Grouped source item: ${sourceA11yName(sourceItem.source_title)}${sourceItem.is_selected_item ? ' (selected)' : ''}`}>
              <a href={groupedSourceHref(sourceItem)} target="_blank" rel="noreferrer noopener" translate={sourceTitleTranslate}>{sourceItem.source_title}</a>
              {#if language === 'zh' || !sourceItem.is_selected_item || (sourceItem.title !== localizedDisplayTitle(item) && (sourceItem.source_item_title ?? sourceItem.title) !== localizedDisplayTitle(item))}
                <span class="contract-muted contract-grouped-sources__title">{language === 'zh' ? (sourceItem.localized_title ?? sourceItem.title) : sourceItem.title}</span>
                {#if sourceItem.source_item_title || sourceItem.title}
                  <span class="contract-grouped-sources__source-title" aria-label={localizedChrome(`source title: ${sourceItem.source_item_title ?? sourceItem.title}`, `来源标题：${sourceItem.source_item_title ?? sourceItem.title}`)} translate="no"><span>{localizedChrome('source title:', '来源标题：')}</span> <span>{sourceItem.source_item_title ?? sourceItem.title}</span></span>
                {/if}
              {/if}
              <span class="contract-grouped-sources__meta">{groupedSourceMeta(sourceItem)}</span>
              {#if sourceItem.source_url}
                <a class="contract-grouped-sources__feed" href={sourceItem.source_url} target="_blank" rel="noreferrer noopener" aria-label={language === 'zh' ? `来源订阅：${sourceA11yName(sourceItem.source_title)}` : `Source feed for ${sourceA11yName(sourceItem.source_title)}`} translate={sourceUrlTranslate}>{localizedChrome('feed', '订阅')}</a>
              {/if}
            </li>
          {/each}
        </ol>
      </details>
    {/if}
    {#if item.story_key || item.duplicate_of_item_id}
      <p class="contract-muted">{localizedChrome('provenance: story', '来源记录：故事')} {item.story_key ?? localizedChrome('ungrouped', '未分组')} · duplicate {item.duplicate_of_item_id ?? 'none'}</p>
    {/if}
  {:else}
    <h2 id="inspector-heading" bind:this={heading} tabindex="-1">{localizedChrome('No item selected', '未选择条目')}</h2>
  {/if}
</aside>
