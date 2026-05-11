<script lang="ts">
  import type { ItemSummary, SearchResponse } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { itemAgeLabel, itemExtractionLabel, itemSummaryText, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

  interface Props {
    items: ItemSummary[];
    query?: string;
    onSearch: (params: SearchRequestParams) => Promise<SearchResponse>;
    onSelect?: (item: ItemSummary) => Promise<void> | void;
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
  }

  let { items, query = '', onSearch, onSelect, onResonanceToggle }: Props = $props();
  let searchQuery = $state('');
  let source = $state('');
  let from = $state('');
  let to = $state('');
  let resonated = $state(false);
  let limit = $state(50);
  let results = $state<ItemSummary[]>([]);
  let statusText = $state('');
  let pendingResonanceId = $state<string | null>(null);

  $effect(() => {
    searchQuery = query;
    results = items;
  });

  async function submitSearch(): Promise<void> {
    statusText = 'searching';
    try {
      const response = await onSearch({
        q: searchQuery || undefined,
        source: source || undefined,
        from: from || undefined,
        to: to || undefined,
        resonated: resonated ? true : undefined,
        limit
      });
      results = response.items;
      statusText = `${response.items.length} results`;
    } catch (error) {
      statusText = error instanceof Error ? error.message : 'err: search failed';
    }
  }

  async function openInspector(item: ItemSummary): Promise<void> {
    await onSelect?.(item);
  }

  async function toggleResonance(item: ItemSummary): Promise<void> {
    pendingResonanceId = item.id;
    try {
      await onResonanceToggle?.(item, !item.is_resonated);
    } finally {
      pendingResonanceId = null;
    }
  }
</script>

<section class="contract-region contract-search" aria-labelledby="search-heading">
  <h2 id="search-heading">SEARCH</h2>
  <form class="contract-search-form" aria-label="Search filters" onsubmit={(event) => { event.preventDefault(); void submitSearch(); }}>
    <label for="search-query">Plain text query</label>
    <input id="search-query" bind:value={searchQuery} aria-describedby="search-status search-contract-note" />
    <label for="search-source">Source filter</label>
    <input id="search-source" name="source" bind:value={source} />
    <label for="search-from">From date</label>
    <input id="search-from" name="from" type="date" bind:value={from} />
    <label for="search-to">To date</label>
    <input id="search-to" name="to" type="date" bind:value={to} />
    <label class="contract-checkbox" for="search-resonated">
      <input id="search-resonated" name="resonated" type="checkbox" bind:checked={resonated} />
      Resonated only
    </label>
    <label for="search-limit">Result limit</label>
    <select id="search-limit" name="limit" bind:value={limit}>
      <option value={10}>10</option>
      <option value={20}>20</option>
      <option value={50}>50</option>
      <option value={100}>100</option>
    </select>
    <button type="submit">search</button>
  </form>
  <p id="search-status" role="status" aria-live="polite" class="contract-muted">{statusText || `${results.length} results`}</p>
  <div role="region" aria-label="Search results">
    <div role="list" aria-label="Search result items">
      {#each results as item, index (item.id)}
        <article class="contract-feed-item contract-search-result" role="listitem">
          <button
            class="contract-feed-open"
            type="button"
            aria-label={`Inspect search result: ${item.title}`}
            onclick={() => void openInspector(item)}
          >
            <p class="contract-label contract-feed-meta">
              <span class="feed-meta-source" aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
              · <span class="feed-meta-age" aria-label={`Age: ${itemAgeLabel(item)}`}>{itemAgeLabel(item)}</span>
              · <span class="feed-meta-extraction" aria-label={`Extraction: ${item.extraction_status}`}>{itemExtractionLabel(item.extraction_status)}</span>
              {#if item.value_tier}
                · <span aria-label={`Value tier: ${item.value_tier}`}>{item.value_tier}</span>
              {/if}
              {#if item.external_surfaced_at}
                · <span aria-label="Externally surfaced by agent">agent:external</span>
              {/if}
              {#if shouldShowTimeGroup(results, index)}
                <span class="contract-time-label">{itemTimeGroup(item)}</span>
              {/if}
            </p>
            <p class="contract-feed-title">{item.title}</p>
            <p class="contract-feed-summary">{itemSummaryText(item)}</p>
            <p class="contract-label contract-search-match"><span>match: lexical index</span> · <span>provenance: source-backed</span></p>
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
    {#if results.length === 0}
      <p>no results</p>
    {/if}
  </div>
  <p id="search-contract-note" class="contract-muted">Lexical and metadata retrieval only; results stay source-backed.</p>
</section>
