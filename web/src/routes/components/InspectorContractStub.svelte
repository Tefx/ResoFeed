<script lang="ts">
  import type { ItemSummary } from '$lib/api-contract';

  type InspectorMode = 'desktop-split' | 'mobile-route';

  interface Props {
    item: ItemSummary | null;
    mode: InspectorMode;
  }

  let { item, mode }: Props = $props();
</script>

<aside class="contract-region contract-inspector" aria-labelledby="inspector-heading">
  <p class="contract-label">INSPECTOR</p>
  {#if item}
    <h2 id="inspector-heading">{item.title}</h2>
    <p class="contract-muted">src: {item.source_title} · {item.extraction_status} · {item.model_status}</p>
    <p><a href={item.url}>original link</a></p>
    <p>{item.summary ?? 'summary unavailable'}</p>
    <p>{item.core_insight ?? 'core insight unavailable'}</p>
    {#if mode === 'mobile-route'}
      <button class="contract-resonate" type="button" aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'}>
        {item.is_resonated ? '★' : '☆'}
      </button>
    {/if}
  {:else}
    <h2 id="inspector-heading">No item selected</h2>
  {/if}
  <p class="contract-muted">
    Contract: opening moves focus to this heading; close/back returns focus to the originating feed item and preserves scroll.
  </p>
</aside>
