<script lang="ts">
  import type { ItemSummary } from '$lib/api-contract';

  interface Props {
    items: ItemSummary[];
    selectedItemId?: string | null;
    onSelect: (item: ItemSummary) => Promise<void> | void;
    onResonanceToggle: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { items, selectedItemId = null, onSelect, onResonanceToggle }: Props = $props();
  let pendingResonanceId = $state<string | null>(null);
  function extractionLabel(status: ItemSummary['extraction_status']): string {
    return status === 'partial_extraction' ? 'partial' : status;
  }

  function decodeEntities(text: string): string {
    if (typeof document === 'undefined') return text;
    const element = document.createElement('textarea');
    element.innerHTML = text;
    return element.value;
  }

  function readableText(text: string | null): string | null {
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

  function displaySummary(item: ItemSummary): string {
    return readableText(item.summary) ?? readableText(item.core_insight) ?? 'summary unavailable';
  }

  async function openInspector(item: ItemSummary): Promise<void> {
    await onSelect(item);
  }

  async function toggleResonance(item: ItemSummary): Promise<void> {
    pendingResonanceId = item.id;
    try {
      await onResonanceToggle(item, !item.is_resonated);
    } finally {
      pendingResonanceId = null;
    }
  }
</script>

<section class="contract-region" aria-labelledby="feed-heading">
  <h2 id="feed-heading">TODAY</h2>
  <div role="list" aria-label="Today feed items">
    {#each items as item (item.id)}
      <article class="contract-feed-item" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined}>
        <button
          class="contract-feed-open"
          type="button"
          aria-label={`Open Inspector for: ${item.title}`}
          onclick={() => void openInspector(item)}
        >
          <p class="contract-label contract-feed-meta">
            <span aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
            · <span aria-label={`Extraction: ${item.extraction_status}`}>{extractionLabel(item.extraction_status)}</span>
            {#if item.value_tier}
              · <span aria-label={`Value tier: ${item.value_tier}`}>{item.value_tier}</span>
            {/if}
            {#if items.findIndex((candidate) => candidate.id === item.id) === 0}
              <span class="contract-time-label">TODAY</span>
            {/if}
            {#if item.external_surfaced_at}
              · <span aria-label="Externally surfaced by agent">agent:external</span>
            {/if}
          </p>
          <p class="contract-feed-title">{item.title}</p>
          <p class="contract-feed-summary">{displaySummary(item)}</p>
        </button>
        <button
          class="contract-resonate"
          type="button"
          aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'}
          aria-pressed={item.is_resonated ? 'true' : 'false'}
          disabled={pendingResonanceId === item.id}
          onclick={() => void toggleResonance(item)}
        >
          {item.is_resonated ? '★' : '☆'}
        </button>
      </article>
    {/each}
  </div>
</section>
