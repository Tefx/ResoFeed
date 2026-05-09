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
            {#if items.findIndex((candidate) => candidate.id === item.id) === 0}
              <span class="contract-time-label">TODAY</span>
            {/if}
            {#if item.external_surfaced_at}
              · <span aria-label="Externally surfaced by agent">agent:external</span>
            {/if}
          </p>
          <p class="contract-feed-title">{item.title}</p>
          <p class="contract-feed-summary">{item.summary ?? item.core_insight ?? 'summary unavailable'}</p>
        </button>
        <button
          class="contract-resonate"
          type="button"
          aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'}
          disabled={pendingResonanceId === item.id}
          onclick={() => void toggleResonance(item)}
        >
          {item.is_resonated ? '★' : '☆'}
        </button>
      </article>
    {/each}
  </div>
</section>
