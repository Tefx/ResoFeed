<script lang="ts">
  import { tick } from 'svelte';
  import type { ItemSummary } from '$lib/api-contract';

  type InspectorMode = 'desktop-split' | 'mobile-route';

  interface Props {
    item: ItemSummary | null;
    mode: InspectorMode;
  }

  let { item, mode }: Props = $props();

  let heading = $state<HTMLHeadingElement | undefined>();

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    return status === 'partial_extraction' ? 'partial' : status;
  }

  function focusHeading(node: HTMLHeadingElement): void {
    node.focus();
  }

  $effect(() => {
    if (item) {
      void tick().then(() => heading?.focus());
    }
  });
</script>

<aside class="contract-region contract-inspector" aria-labelledby="inspector-heading" aria-label={item?.title}>
  <p class="contract-label">INSPECTOR</p>
  {#if item}
    <h2 id="inspector-heading" bind:this={heading} use:focusHeading tabindex="-1">{item.title}</h2>
    <p class="contract-muted">
      <span aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
      · <span aria-label={`Extraction: ${item.extraction_status}`}>{extractionLabel(item.extraction_status)}</span>
      · <span aria-label={`Model status: ${item.model_status}`}>{item.model_status}</span>
    </p>
    <p><a href={item.url}>original link</a></p>
    {#if item.extraction_status === 'partial_extraction'}
      <p class="contract-warning">partial: excerpt only</p>
    {/if}
    <p>{item.summary ?? 'summary unavailable'}</p>
    <p>{item.core_insight ?? 'core insight unavailable'}</p>
    <p class="contract-muted">why: fresh from configured source</p>
    {#if item.story_key || item.duplicate_of_item_id}
      <p class="contract-muted">provenance: story {item.story_key ?? 'ungrouped'} · duplicate {item.duplicate_of_item_id ?? 'none'}</p>
    {/if}
    {#if mode === 'mobile-route'}
      <button class="contract-resonate" type="button" aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'}>
        {item.is_resonated ? '★' : '☆'}
      </button>
    {/if}
  {:else}
    <h2 id="inspector-heading" bind:this={heading} use:focusHeading tabindex="-1">No item selected</h2>
  {/if}
  <p class="contract-muted">
    Opening moves focus to this heading; close/back returns focus to the originating feed item and preserves scroll.
  </p>
</aside>
