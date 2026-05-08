<script lang="ts">
  import type { ItemSummary } from '$lib/api-contract';

  interface Props {
    items: ItemSummary[];
    query: string;
  }

  let { items, query }: Props = $props();
</script>

<section class="contract-region contract-search" aria-labelledby="search-heading">
  <h2 id="search-heading">Search and Retrieval</h2>
  <form class="contract-search-form" aria-label="Search filters">
    <label for="search-query">Plain text query</label>
    <input id="search-query" value={query} readonly aria-describedby="search-contract-note" />
    <label for="search-source">Source filter</label>
    <input id="search-source" name="source" />
    <label for="search-from">From date</label>
    <input id="search-from" name="from" type="date" />
    <label for="search-to">To date</label>
    <input id="search-to" name="to" type="date" />
    <label class="contract-checkbox" for="search-resonated">
      <input id="search-resonated" name="resonated" type="checkbox" />
      Resonated only
    </label>
    <button type="submit">search</button>
  </form>
  <div role="region" aria-label="Search results">
    <p class="contract-muted">{items.length} results</p>
    <ul class="contract-list">
      {#each items as item (item.id)}
        <li>
          <article class="contract-search-result">
            <h3>{item.title}</h3>
            <p>{item.summary ?? item.core_insight ?? 'summary unavailable'}</p>
            <p class="contract-muted">match: summary</p>
            <p class="contract-muted">src: {item.source_title}</p>
            <p class="contract-muted">date: {item.published_at ?? 'date unavailable'} · {item.is_resonated ? 'resonated' : 'not resonated'}</p>
          </article>
        </li>
      {/each}
    </ul>
    {#if items.length === 0}
      <p>no results</p>
    {/if}
  </div>
  <p id="search-contract-note" class="contract-muted">
    Lexical and metadata retrieval only; results stay source-backed.
  </p>
</section>
