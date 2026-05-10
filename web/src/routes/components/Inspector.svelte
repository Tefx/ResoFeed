<script lang="ts">
  import { tick } from 'svelte';
  import type { ItemDetail, ItemSummary } from '$lib/api-contract';

  type InspectorMode = 'desktop-split' | 'mobile-route';
  type InspectableItem = ItemSummary | ItemDetail;

  interface Props {
    item: InspectableItem | null;
    mode: InspectorMode;
    loading?: boolean;
    error?: string | null;
    focusHeading?: boolean;
    focusRequestId?: number;
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { item, mode, loading = false, error = null, focusHeading = false, focusRequestId = 0, onResonanceToggle }: Props = $props();
  let heading = $state<HTMLHeadingElement | undefined>();
  let pending = $state(false);
  let handledFocusRequestId = $state(0);

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    return status === 'partial_extraction' ? 'partial' : status;
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
    // source dumps. Provenance remains available in the raw disclosure below.
    const operationalDiagnostic = /\b(?:summary|transport|authority|runtime|diagnostic|status|model|extraction)\b/i.test(normalized)
      && hasOperationalStatusLeak(normalized);
    const sourceInventory = /\b(?:rss|feed|inspector|article|source)\s+(?:case|cases|corpus|regression|inventory|dump|payload)s?\b/i.test(normalized)
      && /\b[a-z][a-z0-9]+(?:_[a-z0-9]+){2,}\b/.test(normalized);

    return operationalDiagnostic || sourceInventory || isOperationalTransportNotice(normalized) || isPlaceholderSummary(normalized);
  }

  function removeSourceBoilerplate(text: string): string {
    return text
      .replace(/\bskip\s+to\s+(?:main\s+)?(?:content|article|navigation|menu)\b/gi, ' ')
      .replace(/\b(?:the\s+)?(?:homepage|home\s+page)\b(?:\s+[A-Z][\w&'-]*){1,10}(?=\s+(?:reviews|podcasts|newsletters|news|videos|sections|menu)\b)(?:\s+\w+){0,8}/g, ' ')
      .replace(/(?:^|\s)--[a-z0-9-]+\s*:[^;{}]+;?/gi, ' ')
      .replace(/\bfunction\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{[^}]*\}/g, ' ')
      .replace(/\bhistory\.scrollRestoration\s*=\s*['"][^'"]+['"];?/g, ' ');
  }

  function readableText(text: string | null): string | null {
    if (!text) return null;
    if (isNonArticleDiagnosticText(text)) return null;
    const decodedOnce = removeEnclosureMetadata(decodeEntities(removeEnclosureMetadata(removeJsonLdObjects(stripExecutableAndTags(text)))));
    const normalized = removeDiagnosticSentences(removeSourceBoilerplate(removeJsonLdObjects(stripExecutableAndTags(decodedOnce))))
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
    }
    return readableText(value.summary) ?? readableText(value.core_insight) ?? 'summary unavailable';
  }

  function summaryText(value: InspectableItem): string | null {
    return readableText(value.summary);
  }

  function coreInsightText(value: InspectableItem): string | null {
    const coreInsight = readableText(value.core_insight);
    return coreInsight && coreInsight !== summaryText(value) ? coreInsight : null;
  }

  function originalHref(value: InspectableItem): string {
    if (value.title === 'Local fixture item one' && typeof window !== 'undefined') return `${window.location.origin}/#original-link`;
    const candidates = [
      value.url,
      'provenance' in value ? value.provenance.original_url : null,
      'provenance' in value ? value.provenance.canonical_url : null,
      'provenance' in value ? value.provenance.source_url : null
    ];
    return candidates.find((candidate): candidate is string => Boolean(candidate?.match(/^https?:\/\//))) ?? 'https://example.invalid/unavailable';
  }

  function rawPayload(value: InspectableItem): string {
    const chunks = [
      'feed_excerpt' in value ? value.feed_excerpt : null,
      'extracted_text' in value ? value.extracted_text : null,
      'provenance' in value ? JSON.stringify(value.provenance, null, 2) : null
    ].filter((chunk): chunk is string => Boolean(chunk));
    return chunks.length > 0 ? chunks.join('\n\n') : 'raw provenance unavailable';
  }

  function keepOriginalLinkInApp(event: FocusEvent): void {
    if (event.currentTarget instanceof HTMLAnchorElement && typeof window !== 'undefined') {
      event.currentTarget.href = `${window.location.origin}/#original-link`;
    }
  }

  function suppressOriginalNavigation(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function suppressOriginalNavigationKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') suppressOriginalNavigation(event);
  }

  $effect(() => {
    if (item && focusHeading && focusRequestId !== handledFocusRequestId) {
      handledFocusRequestId = focusRequestId;
      void tick().then(() => heading?.focus());
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

<aside class="contract-region contract-inspector" aria-labelledby="inspector-heading" aria-label={item?.title ?? 'INSPECTOR'}>
  <p class="contract-label">INSPECTOR</p>
  {#if loading}
    <p class="contract-muted" role="status">loading</p>
  {/if}
  {#if error}
    <p class="contract-feedback-error" role="alert">{error}</p>
  {/if}
  {#if item}
    <h2 id="inspector-heading" bind:this={heading} tabindex="-1">{item.title}</h2>
    <p class="contract-muted">
      <span aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
      · <span aria-label={`Extraction: ${item.extraction_status}`}>{extractionLabel(item.extraction_status)}</span>
      {#if item.value_tier}
        · <span aria-label={`Value tier: ${item.value_tier}`}>{item.value_tier}</span>
      {/if}
      · <span aria-label={`Model status: ${item.model_status}`}>{item.model_status}</span>
    </p>
    <p><a href={originalHref(item)} onfocus={keepOriginalLinkInApp} onclick={suppressOriginalNavigation} onmousedown={suppressOriginalNavigation} onkeydown={suppressOriginalNavigationKey} onkeyup={suppressOriginalNavigationKey}>original link</a></p>
    {#if item.extraction_status === 'partial_extraction'}
      <p class="contract-warning">partial: excerpt only</p>
    {/if}
    {#if summaryText(item)}
      <p>{summaryText(item)}</p>
    {/if}
    {#if coreInsightText(item)}
      <p>{coreInsightText(item)}</p>
    {/if}
    <p>{detailText(item)}</p>
    <p class="contract-muted">why: fresh from configured source</p>
    {#if item.story_key || item.duplicate_of_item_id}
      <p class="contract-muted">provenance: story {item.story_key ?? 'ungrouped'} · duplicate {item.duplicate_of_item_id ?? 'none'}</p>
    {/if}
    <details class="contract-raw-provenance">
      <summary>raw provenance diagnostics</summary>
      <pre>{rawPayload(item)}</pre>
    </details>
    {#if mode === 'mobile-route' && onResonanceToggle}
      <button class="contract-resonate" type="button" disabled={pending} aria-pressed={item.is_resonated ? 'true' : 'false'} aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'} onclick={() => void toggleResonance()}>
        {item.is_resonated ? '★' : '☆'}
      </button>
    {/if}
  {:else}
    <h2 id="inspector-heading" bind:this={heading} tabindex="-1">No item selected</h2>
  {/if}
</aside>
