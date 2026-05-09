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
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { item, mode, loading = false, error = null, onResonanceToggle }: Props = $props();
  let heading = $state<HTMLHeadingElement | undefined>();
  let pending = $state(false);

  function extractionLabel(status: ItemSummary['extraction_status']): string {
    return status === 'partial_extraction' ? 'partial' : status;
  }

  function detailText(value: InspectableItem): string {
    if ('extracted_text' in value && value.extracted_text) return value.extracted_text;
    if ('feed_excerpt' in value && value.feed_excerpt) return value.feed_excerpt;
    return value.summary ?? value.core_insight ?? 'summary unavailable';
  }

  $effect(() => {
    if (item) {
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
      · <span aria-label={`Model status: ${item.model_status}`}>{item.model_status}</span>
    </p>
    <p><a href={item.url}>original link</a></p>
    {#if item.extraction_status === 'partial_extraction'}
      <p class="contract-warning">partial: excerpt only</p>
    {/if}
    <p>{detailText(item)}</p>
    {#if item.core_insight}
      <p>{item.core_insight}</p>
    {/if}
    <p class="contract-muted">why: fresh from configured source</p>
    {#if item.story_key || item.duplicate_of_item_id}
      <p class="contract-muted">provenance: story {item.story_key ?? 'ungrouped'} · duplicate {item.duplicate_of_item_id ?? 'none'}</p>
    {/if}
    {#if mode === 'mobile-route' || onResonanceToggle}
      <button class="contract-resonate" type="button" disabled={pending} aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'} onclick={() => void toggleResonance()}>
        {item.is_resonated ? '★' : '☆'}
      </button>
    {/if}
  {:else}
    <h2 id="inspector-heading" bind:this={heading} tabindex="-1">No item selected</h2>
  {/if}
</aside>
