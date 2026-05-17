<script lang="ts">
  import { itemDisplayTimestamp, processingLanguageRuntimeContract, type ItemSummary } from '$lib/api-contract';
  import { compareItemsByTimeGroup, itemAgeLabel, itemExtractionLabel, itemPriorityLabel, itemSummaryProvenanceLabel, itemSummaryText, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

  interface Props {
    items: ItemSummary[];
    selectedItemId?: string | null;
    onSelect: (item: ItemSummary) => Promise<void> | void;
    onResonanceToggle: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { items, selectedItemId = null, onSelect, onResonanceToggle }: Props = $props();
  let pendingResonanceId = $state<string | null>(null);
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const groupedItems = $derived(items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareItemsByTimeGroup(left.item, right.item) || left.index - right.index)
    .map(({ item }) => item));
  const feedTimeGroupReference = $derived(feedReferenceNow(items));

  function feedReferenceNow(feedItems: ItemSummary[]): Date {
    const latestTimestamp = feedItems
      .map((item) => itemDisplayTimestamp(item))
      .filter((timestamp): timestamp is string => timestamp !== null)
      .map((timestamp) => new Date(timestamp).getTime())
      .filter((timestamp) => !Number.isNaN(timestamp))
      .sort((left, right) => right - left)[0];
    return latestTimestamp === undefined ? new Date() : new Date(latestTimestamp);
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
  <h2 id="feed-heading" class="visually-hidden" tabindex="-1">Today feed items</h2>
  <div role="list" aria-label="Today feed items">
    {#each groupedItems as item, index (item.id)}
      <article class="contract-feed-item" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined} data-item-id={item.id} data-source-id={item.source_id}>
        <button
          class="contract-feed-open"
          type="button"
          aria-label={`Open Inspector for: ${item.title}`}
          onclick={() => void openInspector(item)}
        >
          <p class="contract-label contract-feed-meta">
            <span class="feed-meta-source" aria-label={`Source: ${item.source_title}`} translate={sourceTitleTranslate}>src: {item.source_title}</span>
            · <span class="feed-meta-age" aria-label={`Age: ${itemAgeLabel(item)}`}>{itemAgeLabel(item)}</span>
            · <span class="feed-meta-extraction" aria-label={`Extraction: ${item.extraction_status}`}>{itemExtractionLabel(item.extraction_status)}</span>
            · <span aria-label={`Summary provenance: ${itemSummaryProvenanceLabel(item)}`}>{itemSummaryProvenanceLabel(item)}</span>
            · <span aria-label={`Priority signal: ${itemPriorityLabel(item)}`}>{itemPriorityLabel(item)}</span>
            {#if item.external_surfaced_at}
              · <span aria-label="Externally surfaced by agent">agent:external</span>
            {/if}
            {#if shouldShowTimeGroup(groupedItems, index, feedTimeGroupReference)}
              <span class="contract-time-label">{itemTimeGroup(item, feedTimeGroupReference)}</span>
            {/if}
          </p>
          <p class="contract-feed-title">{item.title}</p>
          <p class="contract-feed-summary">{itemSummaryText(item)}</p>
        </button>
        <button
          class="contract-resonate"
          type="button"
          aria-label={item.is_resonated ? `Remove resonance: ${item.title}` : `Resonate item: ${item.title}`}
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
