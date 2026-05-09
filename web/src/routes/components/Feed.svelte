<script lang="ts">
  import { tick } from 'svelte';
  import type { ItemSummary } from '$lib/api-contract';

  interface Props {
    items: ItemSummary[];
    selectedItemId?: string | null;
    onSelect: (item: ItemSummary) => Promise<void> | void;
    onResonanceToggle: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { items, selectedItemId = null, onSelect, onResonanceToggle }: Props = $props();
  let pendingResonanceId = $state<string | null>(null);
  let inspectorHeading = $state<HTMLHeadingElement | undefined>();

  const selectedItem = $derived(items.find((item) => item.id === selectedItemId) ?? null);

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    return status === 'partial_extraction' ? 'partial' : status;
  }

  async function openInspector(item: ItemSummary): Promise<void> {
    await onSelect(item);
    await tick();
    inspectorHeading?.focus();
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
          <p class="contract-label">
            <span aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
            · <span aria-label={`Extraction: ${item.extraction_status}`}>{extractionLabel(item.extraction_status)}</span>
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
  {#if selectedItem}
    <section class="contract-inline-inspector" aria-label="Opened Inspector focus target">
      <h2 bind:this={inspectorHeading} tabindex="-1">{selectedItem.title}</h2>
      <p class="contract-muted">why: fresh from configured source</p>
    </section>
  {/if}
</section>
