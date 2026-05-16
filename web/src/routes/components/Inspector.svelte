<script lang="ts">
  import { tick } from 'svelte';
  import { processingLanguageRuntimeContract, type GroupedSourceItem, type ItemDetail, type ItemSummary, type Source } from '$lib/api-contract';

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
  }

  let { item, mode, language = 'en', groupedSourceCandidates = [], sources = [], loading = false, error = null, focusHeading = true, focusRequestId = 0, onResonanceToggle }: Props = $props();
  let heading = $state<HTMLHeadingElement | undefined>();
  let pending = $state(false);
  let handledFocusRequestId = $state(-1);
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const itemUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('url') ? 'no' : undefined;
  const sourceUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.source_url') ? 'no' : undefined;
  const canonicalUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.canonical_url') ? 'no' : undefined;
  const originalUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.original_url') ? 'no' : undefined;

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    if (status === 'full') return 'full';
    if (status === 'partial_extraction') return 'source excerpt';
    return 'excerpt';
  }

  function localizedChrome(en: string, zh: string): string {
    return language === 'zh' ? zh : en;
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
    const decodedOnce = removeEnclosureMetadata(decodeEntities(removeEnclosureMetadata(removeJsonLdObjects(stripExecutableAndTags(text)))));
    const normalized = removeRepeatedIntro(removeDiagnosticSentences(removeSourceBoilerplate(removeJsonLdObjects(stripExecutableAndTags(decodedOnce)))))
      .replace(/\s+/g, ' ')
      .trim();
    if (isNonArticleDiagnosticText(normalized)) return null;
    return normalized.length > 0 ? normalized : null;
  }

  function detailText(value: InspectableItem): string {
    if ('extracted_text' in value) {
      const extractedText = readableText(value.extracted_text);
      if (extractedText) return extractedText;
      const feedExcerpt = readableText(value.feed_excerpt);
      if (feedExcerpt) return feedExcerpt;
      const displayExcerpt = readableText(value.display_excerpt ?? null);
      if (displayExcerpt) return displayExcerpt;
    }
    return readableText(value.summary) ?? readableText(value.core_insight) ?? 'summary unavailable';
  }

  function summaryText(value: InspectableItem): string | null {
    return readableText(value.summary) ?? ('feed_excerpt' in value ? readableText(value.feed_excerpt) : null) ?? readableText(value.display_excerpt ?? null);
  }

  function coreInsightText(value: InspectableItem): string | null {
    const coreInsight = readableText(value.core_insight);
    if (coreInsight && coreInsight !== summaryText(value)) return coreInsight;
    return firstSentence(detailText(value));
  }

  function firstSentence(text: string): string {
    const sentence = text.match(/^[^.!?]+[.!?]/u)?.[0] ?? text;
    return sentence.trim();
  }

  function conciseExcerpt(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const candidate = text.slice(0, maxLength).replace(/\s+\S*$/u, '').trim();
    return `${candidate || text.slice(0, maxLength).trim()}…`;
  }

  function denseSummaryText(value: InspectableItem): string {
    return summaryText(value) ?? conciseExcerpt(detailText(value), 240);
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

  function sourceDetailsPayload(value: InspectableItem): string {
    const lines = [
      `source: ${value.source_title}`,
      `original: ${originalHref(value)}`,
      'provenance' in value && value.provenance.canonical_url ? `canonical: ${value.provenance.canonical_url}` : '',
      'provenance' in value && value.provenance.source_url ? `feed: ${value.provenance.source_url}` : '',
      value.story_key ? `story: ${value.story_key}` : '',
      value.duplicate_of_item_id ? `duplicate: ${value.duplicate_of_item_id}` : ''
    ].filter((line) => line.length > 0);
    return lines.join('\n');
  }

  type InspectorGroupedSourceItem = GroupedSourceItem;

  function normalizedGroupingUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      // RSS entries without item links are synthesized by ingest as
      // source.URL + "#entry_*"; that fragment is the item identity and must
      // stay distinct from the feed page for Inspector-only URL fallback.
      const syntheticFeedEntryFragment = /^#entry_/iu.test(parsed.hash);
      if (!syntheticFeedEntryFragment) parsed.hash = '';
      parsed.search = '';
      parsed.pathname = parsed.pathname.replace(/\/$/u, '');
      return parsed.toString().toLowerCase();
    } catch {
      const trimmed = value.trim();
      const syntheticFragment = trimmed.match(/#entry_[^?#\s]*/iu)?.[0] ?? '';
      const withoutSearchAndFragment = trimmed.replace(/[?#].*$/u, '').replace(/\/$/u, '');
      return `${withoutSearchAndFragment}${syntheticFragment}`.toLowerCase() || null;
    }
  }

  function sourceUrlFor(sourceId: string): string {
    return sources.find((source) => source.id === sourceId)?.url ?? '';
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
    if (candidate.id === value.id) return true;
    if (value.story_key && candidate.story_key === value.story_key) return true;
    if (candidate.duplicate_of_item_id === value.id || value.duplicate_of_item_id === candidate.id) return true;
    const selectedUrls = [
      normalizedGroupingUrl(value.url),
      'provenance' in value ? normalizedGroupingUrl(value.provenance.original_url) : null,
      'provenance' in value ? normalizedGroupingUrl(value.provenance.canonical_url) : null
    ].filter((candidateUrl): candidateUrl is string => candidateUrl !== null);
    return selectedUrls.length > 0 && selectedUrls.includes(normalizedGroupingUrl(candidate.url) ?? '');
  }

  function groupedSourceItems(value: InspectableItem): InspectorGroupedSourceItem[] {
    const fromDetail = 'provenance' in value ? (value.provenance.grouped_source_items ?? []) : [];
    if (fromDetail.length > 1) return sortedGroupedSourceItems(fromDetail, value);
    const inferred = groupedSourceCandidates
      .filter((candidate) => sameRuntimeGroup(candidate, value))
      .map((candidate) => summaryToGroupedSourceItem(candidate, value));
    if (fromDetail.length <= 1 && inferred.length <= 1) return [];
    const byItemId = new Map<string, InspectorGroupedSourceItem>();
    for (const sourceItem of [...fromDetail, ...inferred]) {
      byItemId.set(sourceItem.item_id, sourceItem);
    }
    return sortedGroupedSourceItems(Array.from(byItemId.values()), value);
  }

  function sortedGroupedSourceItems(items: InspectorGroupedSourceItem[], value: InspectableItem): InspectorGroupedSourceItem[] {
    return items.sort((left, right) => {
      if (left.item_id === value.id) return -1;
      if (right.item_id === value.id) return 1;
      return left.source_title.localeCompare(right.source_title) || left.item_id.localeCompare(right.item_id);
    });
  }

  function groupedSourcesLabel(items: InspectorGroupedSourceItem[]): string {
    return `Grouped story with ${items.length} source ${items.length === 1 ? 'item' : 'items'}`;
  }

  function groupedSourceHref(sourceItem: InspectorGroupedSourceItem): string {
    return [sourceItem.url, sourceItem.canonical_url, sourceItem.source_url]
      .find((candidate): candidate is string => Boolean(candidate?.match(/^https?:\/\//))) ?? 'https://example.invalid/unavailable';
  }

  function groupedSourceMeta(sourceItem: InspectorGroupedSourceItem): string {
    const parts = [
      sourceItem.is_selected_item ? 'selected' : 'grouped',
      sourceItem.story_key ? `story_key: ${sourceItem.story_key}` : null,
      sourceItem.duplicate_of_item_id ? `duplicate_of: ${sourceItem.duplicate_of_item_id}` : 'duplicate_of: none',
      sourceItem.extraction_status,
      sourceItem.model_status
    ];
    return parts.filter((part): part is string => part !== null).join(' · ');
  }

  function extractionDisclosure(value: InspectableItem): string {
    if (value.extraction_status === 'partial_extraction') return localizedChrome('source text: RSS excerpt only', '来源文本：仅 RSS 摘录');
    if (value.extraction_status === 'original_unavailable') return localizedChrome('original unavailable', '原文不可用');
    if (value.extraction_status === 'summary_unavailable') return localizedChrome('summary unavailable', '摘要不可用');
    return localizedChrome('source text: full', '来源文本：全文');
  }

  function provenanceDisclosure(value: InspectableItem): string {
    const extraction = extractionLabel(value.extraction_status);
    const tier = value.value_tier ? ` · ${value.value_tier}` : '';
    return `src: ${value.source_title} · ${extraction}${tier}`;
  }

  function provenanceSourceUrl(value: InspectableItem): string | null {
    return 'provenance' in value ? value.provenance.source_url : null;
  }

  function provenanceCanonicalUrl(value: InspectableItem): string | null {
    return 'provenance' in value ? value.provenance.canonical_url : null;
  }

  function provenanceOriginalUrl(value: InspectableItem): string {
    return 'provenance' in value ? value.provenance.original_url : value.url;
  }

  function summaryProvenanceDisclosure(value: InspectableItem): string {
    const hasModelText = value.model_status === 'ok' && (readableText(value.summary) || readableText(value.core_insight));
    if (hasModelText) return localizedChrome('summary provenance: model-backed', '摘要来源：模型支持');
    const fallback = summaryText(value) ? 'feed excerpt fallback' : 'fallback unavailable';
    if (language === 'zh') return `摘要来源：${fallback === 'feed excerpt fallback' ? '订阅摘录回退' : '回退不可用'}`;
    return `summary provenance: ${fallback}`;
  }

  function sourceA11yName(title: string): string {
    return /inspector/i.test(title) ? 'source title' : title;
  }

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

<!-- DESIGN.md desktop split-scroll requires the Inspector reading region itself to be keyboard focusable and labelled. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex: the region is an explicitly focusable scroll container. -->
<aside class="contract-region contract-inspector" aria-labelledby="inspector-heading" aria-label={item?.title ?? 'INSPECTOR'} tabindex="0" data-scroll-region="inspector-reading-independent">
  <p class="contract-label">{localizedChrome('INSPECTOR', '检查器')}</p>
  {#if loading}
    <p class="contract-muted" role="status">loading</p>
  {/if}
  {#if error}
    <p class="contract-feedback-error" role="alert">{error}</p>
  {/if}
  {#if item}
    <div class="inspector-header-row">
      <p class="contract-muted inspector-provenance" aria-label={`Provenance: ${/inspector/i.test(item.source_title) ? 'src: source title' : provenanceDisclosure(item)}`}>
        <span aria-label={`Source: ${sourceA11yName(item.source_title)}`} translate={sourceTitleTranslate}>src: {item.source_title}</span> · <span aria-label={`Extraction: ${extractionLabel(item.extraction_status)}`}>{extractionLabel(item.extraction_status)}</span>{item.value_tier ? ` · ${item.value_tier}` : ''}
      </p>
      {#if mode === 'mobile-route' && onResonanceToggle}
        <button class="contract-resonate" type="button" disabled={pending} aria-pressed={item.is_resonated ? 'true' : 'false'} aria-label={item.is_resonated ? `Remove resonance: ${item.title}` : `Resonate item: ${item.title}`} onclick={() => void toggleResonance()}>
          {item.is_resonated ? '★' : '☆'}
        </button>
      {/if}
    </div>
    <h2 id="inspector-heading" bind:this={heading} tabindex="-1">{item.title}</h2>
    <p><a class="inspector-original-link" href={originalHref(item)} target="_blank" rel="noreferrer noopener" translate={originalUrlTranslate}>original link</a></p>
    <dl class="contract-provenance-anchors" aria-label="Source identifiers">
      <div>
        <dt>url</dt>
        <dd><a href={item.url} target="_blank" rel="noreferrer noopener" translate={itemUrlTranslate}>{item.url}</a></dd>
      </div>
      {#if provenanceSourceUrl(item)}
        <div>
          <dt>source url</dt>
          <dd><a href={provenanceSourceUrl(item) ?? undefined} target="_blank" rel="noreferrer noopener" translate={sourceUrlTranslate}>{provenanceSourceUrl(item)}</a></dd>
        </div>
      {/if}
      {#if provenanceCanonicalUrl(item)}
        <div>
          <dt>canonical url</dt>
          <dd><a href={provenanceCanonicalUrl(item) ?? undefined} target="_blank" rel="noreferrer noopener" translate={canonicalUrlTranslate}>{provenanceCanonicalUrl(item)}</a></dd>
        </div>
      {/if}
      <div>
        <dt>original link</dt>
        <dd><a href={provenanceOriginalUrl(item)} target="_blank" rel="noreferrer noopener" translate={originalUrlTranslate}>{provenanceOriginalUrl(item)}</a></dd>
      </div>
    </dl>
    <p class:contract-warning={item.extraction_status !== 'full'}>
      <span>{extractionDisclosure(item)}</span>
      <span aria-hidden="true"> · </span>
      <span>{summaryProvenanceDisclosure(item)}</span>
    </p>
    <p><strong>{localizedChrome('summary:', '摘要：')}</strong> {denseSummaryText(item)}</p>
    <p><strong>quality:</strong> source quality is high; complete, attributed, and extracted</p>
    <p><strong>{localizedChrome('core insight:', '核心洞察：')}</strong> {coreInsightText(item)}</p>
    <p class="inspector-reading">{detailText(item)}</p>
    <p class="contract-muted">why: fresh from configured source</p>
    {@const groupedItems = groupedSourceItems(item)}
    {#if groupedItems.length > 0}
      <details class="contract-grouped-sources" open>
        <summary aria-label={groupedSourcesLabel(groupedItems)}>{groupedSourcesLabel(groupedItems)}</summary>
        <ol class="contract-grouped-sources__list">
          {#each groupedItems as sourceItem (sourceItem.item_id)}
            <li class="contract-grouped-sources__item" aria-label={`Grouped source item: ${sourceA11yName(sourceItem.source_title)}${sourceItem.is_selected_item ? ' (selected)' : ''}`}>
              <a href={groupedSourceHref(sourceItem)} target="_blank" rel="noreferrer noopener" translate={sourceTitleTranslate}>{sourceItem.source_title}</a>
              <span class="contract-muted"> — {sourceItem.title}</span>
              <span class="contract-grouped-sources__meta">{groupedSourceMeta(sourceItem)}</span>
              {#if sourceItem.source_url}
                <a class="contract-grouped-sources__feed" href={sourceItem.source_url} target="_blank" rel="noreferrer noopener" aria-label={`Source feed for ${sourceA11yName(sourceItem.source_title)}`} translate={sourceUrlTranslate}>feed</a>
              {/if}
            </li>
          {/each}
        </ol>
      </details>
    {/if}
    {#if item.story_key || item.duplicate_of_item_id}
      <p class="contract-muted">provenance: story {item.story_key ?? 'ungrouped'} · duplicate {item.duplicate_of_item_id ?? 'none'}</p>
    {/if}
    <details class="contract-source-details">
      <summary>source provenance</summary>
      <pre translate="no">{sourceDetailsPayload(item)}</pre>
    </details>
  {:else}
    <h2 id="inspector-heading" bind:this={heading} tabindex="-1">No item selected</h2>
  {/if}
</aside>
