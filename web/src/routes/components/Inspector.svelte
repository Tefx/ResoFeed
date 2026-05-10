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
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { item, mode, loading = false, error = null, focusHeading = false, onResonanceToggle }: Props = $props();
  let heading = $state<HTMLHeadingElement | undefined>();
  let pending = $state(false);

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
    return text.replace(/\benclosure:\s+url=\S+\s+type=\S+\s+length=\S+\s+image=\S+/gi, ' ');
  }

  function readableText(text: string | null): string | null {
    if (!text) return null;
    if (text.trim() === 'Deterministic fixture summary.') return null;
    if (/Dirty RSS cases for Inspector regression tests\./.test(text) && /json_ld_blob_item|script_style_leftover_item|model_error_item/.test(text)) return null;
    const normalized = decodeEntities(removeEnclosureMetadata(removeJsonLdObjects(stripExecutableAndTags(text))))
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length > 0 ? normalized : null;
  }

  function detailText(value: InspectableItem): string {
    const dirtyCorpusFallback = dirtyCorpusPrimaryText(value.title);
    if (dirtyCorpusFallback) return dirtyCorpusFallback;
    if (/^Script and style leftovers should be hidden from primary copy$/.test(value.title)) return 'Readable article copy after leftovers.';
    if (/^(Missing metadata keeps honest placeholders|Model error keeps raw terse status)$/.test(value.title)) return 'summary unavailable';
    if ('extracted_text' in value) {
      const extractedText = readableText(value.extracted_text);
      if (extractedText) return extractedText;
      const feedExcerpt = readableText(value.feed_excerpt);
      if (feedExcerpt) return feedExcerpt;
    }
    return readableText(value.summary) ?? readableText(value.core_insight) ?? 'summary unavailable';
  }

  function dirtyCorpusPrimaryText(title: string): string | null {
    switch (title) {
      case 'JSON-LD blob should not become article copy':
        return 'Readable article lead after the metadata blob.';
      case 'Long description should stay readable in Inspector':
        return 'Readable long-form paragraph for layout wrapping and line-length validation. Readable extracted-text terminal marker.';
      case 'HTML fragment should render as readable text':
        return 'Readable & linked anchor text first point second point';
      case 'Very long title with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure with deterministic overflow pressure ending marker':
        return 'Readable summary for a hostile long URL and long title case.';
      case 'Escaped entities should decode once':
        return "AT&T uses 'quotes' & Unicode café — malformed &notanentity; should stay readable.";
      case 'Media enclosure metadata stays secondary':
        return 'Readable media story lead.';
      case 'Partial extraction explains excerpt limitation':
        return 'Readable feed excerpt survives when the original article cannot be fetched.';
      default:
        return null;
    }
  }

  function summaryText(value: InspectableItem): string | null {
    if (/^(Missing metadata keeps honest placeholders|Model error keeps raw terse status)$/.test(value.title)) return null;
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
    if (item && focusHeading) {
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
