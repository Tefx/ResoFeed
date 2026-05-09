<script lang="ts">
  import type { ItemSummary, SearchResponse } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';

  interface Props {
    items: ItemSummary[];
    query?: string;
    onSearch: (params: SearchRequestParams) => Promise<SearchResponse>;
  }

  let { items, query = '', onSearch }: Props = $props();
  let searchQuery = $state('');
  let source = $state('');
  let from = $state('');
  let to = $state('');
  let resonated = $state(false);
  let results = $state<ItemSummary[]>([]);
  let statusText = $state('');

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
        resonated: resonated ? true : undefined
      });
      results = response.items;
      statusText = `${response.items.length} results`;
    } catch (error) {
      statusText = error instanceof Error ? error.message : 'err: search failed';
    }
  }
</script>

<section class="contract-region contract-search" aria-labelledby="search-heading">
  <h2 id="search-heading">Search and Retrieval</h2>
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
    <button type="submit">search</button>
  </form>
  <p id="search-status" role="status" aria-live="polite" class="contract-muted">{statusText || `${results.length} results`}</p>
  <div role="region" aria-label="Search results">
    <p class="contract-muted">{results.length} results</p>
    <ul class="contract-list">
      {#each results as item (item.id)}
        <li>
          <article class="contract-search-result">
            <h3>{item.title}</h3>
            <p>{item.summary ?? item.core_insight ?? 'summary unavailable'}</p>
            <p class="contract-muted">match: lexical index</p>
            <p class="contract-muted">src: {item.source_title}</p>
            <p class="contract-muted">date: {item.published_at ?? 'date unavailable'} · {item.is_resonated ? 'resonated' : 'not resonated'}</p>
          </article>
        </li>
      {/each}
    </ul>
    {#if results.length === 0}
      <p>no results</p>
    {/if}
  </div>
  <p id="search-contract-note" class="contract-muted">Lexical and metadata retrieval only; results stay source-backed.</p>
</section>
