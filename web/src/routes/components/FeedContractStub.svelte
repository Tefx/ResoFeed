<script lang="ts">
  import { tick } from 'svelte';
  import type { ItemSummary } from '$lib/api-contract';

  interface Props {
    items: ItemSummary[];
    selectedItemId?: string | null;
  }

  let { items, selectedItemId = null }: Props = $props();

  let localItems = $state<ItemSummary[]>([]);
  let openItemId = $state<string | null>(null);
  let inspectorHeading = $state<HTMLHeadingElement | undefined>();

  const openItem = $derived(localItems.find((item) => item.id === openItemId) ?? null);

  $effect(() => {
    localItems = items;
  });

  $effect(() => {
    openItemId = selectedItemId;
  });

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    return status === 'partial_extraction' ? 'partial' : status;
  }

  async function openInspector(item: ItemSummary): Promise<void> {
    openItemId = item.id;
    await tick();
    inspectorHeading?.focus();
  }

  function toggleResonance(itemId: string): void {
    localItems = localItems.map((item) =>
      item.id === itemId ? { ...item, is_resonated: !item.is_resonated } : item
    );
  }
</script>

<section class="contract-region" aria-labelledby="feed-heading">
  <h2 id="feed-heading">TODAY</h2>
  <div role="list" aria-label="Today feed contract items">
    {#each localItems as item (item.id)}
      <article class="contract-feed-item" role="listitem" aria-current={openItemId === item.id ? 'true' : undefined}>
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
          onclick={() => toggleResonance(item.id)}
        >
          {item.is_resonated ? '★' : '☆'}
        </button>
      </article>
    {/each}
  </div>
  {#if openItem}
    <section class="contract-inline-inspector" aria-label="Opened Inspector focus target">
      <h2 bind:this={inspectorHeading} tabindex="-1">{openItem.title}</h2>
      <p class="contract-muted">why: fresh from configured source</p>
    </section>
  {/if}
  <p class="contract-muted">
    Enter or Space opens Inspector; star has a 44px target; no unseen state or counts.
  </p>
</section>
