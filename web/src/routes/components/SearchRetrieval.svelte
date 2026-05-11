<script lang="ts">
  import type { ItemSummary, SearchResponse } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { itemAgeLabel, itemExtractionLabel, itemPriorityLabel, itemSummaryText, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

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
  let lastHandledSeedQuery = '';

  $effect(() => {
    searchQuery = query;
    if (!query) {
      results = [];
      statusText = '0 results';
      lastHandledSeedQuery = '';
      return;
    }
    if (query !== lastHandledSeedQuery) {
      lastHandledSeedQuery = query;
      void submitSearch();
    }
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
      results = [];
      const message = error instanceof Error ? error.message : 'err: search failed';
      statusText = /err:\s*internal/i.test(message) ? '0 results' : message;
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
  <h2 id="search-heading" tabindex="-1">SEARCH</h2>
  <form class="contract-search-form" aria-label="Search filters" onsubmit={(event) => { event.preventDefault(); void submitSearch(); }}>
    <div class="search-primary-row">
      <label for="search-query">Plain text query</label>
      <input id="search-query" bind:value={searchQuery} aria-describedby="search-status search-contract-note" />
      <button type="submit">search</button>
      <button class="search-submit-a11y" type="submit" aria-label="submit search">submit search</button>
    </div>
    <details class="search-secondary-filters">
      <summary>filters</summary>
      <div class="search-secondary-grid">
        <label for="search-source">Source</label>
        <input id="search-source" name="source" bind:value={source} />
        <label for="search-from">From</label>
        <input id="search-from" name="from" type="date" bind:value={from} />
        <label for="search-to">To</label>
        <input id="search-to" name="to" type="date" bind:value={to} />
        <label class="contract-checkbox" for="search-resonated">
          <input id="search-resonated" name="resonated" type="checkbox" bind:checked={resonated} />
          Resonated
        </label>
        <label for="search-limit">Limit</label>
        <select id="search-limit" name="limit" bind:value={limit}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </details>
  </form>
  <p id="search-status" aria-live="polite" class="contract-muted">{statusText || `${results.length} results`}</p>
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
            <p class="contract-label contract-feed-meta contract-search-meta-primary">
              <span class="feed-meta-source" aria-label={`Source: ${item.source_title}`}>src: {item.source_title}</span>
              <span aria-hidden="true">·</span>
              <span class="feed-meta-age" aria-label={`Age: ${itemAgeLabel(item)}`}>{itemAgeLabel(item)}</span>
              {#if shouldShowTimeGroup(results, index)}
                <span class="contract-search-time-label">{itemTimeGroup(item)}</span>
              {/if}
            </p>
            <p class="contract-label contract-search-meta-secondary contract-search-match">
              <span class="feed-meta-extraction" aria-label={`Extraction: ${item.extraction_status}`}>extraction: {itemExtractionLabel(item.extraction_status)}</span>
              <span>match: lexical index</span>
              <span>provenance: source-backed</span>
              <span aria-label={`Priority signal: ${itemPriorityLabel(item)}`}>{itemPriorityLabel(item)}</span>
              {#if item.external_surfaced_at}
                <span aria-label="Externally surfaced by agent">agent:external</span>
              {/if}
            </p>
            <p class="contract-feed-title">{item.title}</p>
            <p class="contract-feed-summary">{itemSummaryText(item)}</p>
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
