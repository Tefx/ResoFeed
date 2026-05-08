<script lang="ts">
  import type { ItemSummary } from '$lib/api-contract';

  interface Props {
    items: ItemSummary[];
    selectedItemId?: string | null;
  }

  let { items, selectedItemId = null }: Props = $props();
</script>

<section class="contract-region" aria-labelledby="feed-heading">
  <h2 id="feed-heading">TODAY</h2>
  <div role="list" aria-label="Today feed contract items">
    {#each items as item (item.id)}
      <article class="contract-feed-item" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined}>
        <button class="contract-feed-open" type="button" aria-label={`Open Inspector for: ${item.title}`}>
          <p class="contract-label">
            <span aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
            · <span aria-label={`Extraction: ${item.extraction_status}`}>{item.extraction_status}</span>
            {#if item.external_surfaced_at}
              · <span aria-label="Externally surfaced by agent">agent:external</span>
            {/if}
          </p>
          <h3 class="contract-feed-title">{item.title}</h3>
          <p class="contract-feed-summary">{item.summary ?? item.core_insight ?? 'summary unavailable'}</p>
        </button>
        <button
          class="contract-resonate"
          type="button"
          aria-label={item.is_resonated ? 'Remove resonance' : 'Resonate item'}
        >
          {item.is_resonated ? '★' : '☆'}
        </button>
      </article>
    {/each}
  </div>
  <p class="contract-muted">
    Contract: Enter or Space opens Inspector; star has a 44px target; no unseen state, counts, cards, or archive actions.
  </p>
</section>
