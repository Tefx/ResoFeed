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
  <label for="search-query">Plain text query</label>
  <input id="search-query" value={query} readonly aria-describedby="search-contract-note" />
  <div role="region" aria-label="Search results">
    <p class="contract-muted">{items.length} results</p>
    <ul class="contract-list">
      {#each items as item (item.id)}
        <li>{item.title} — src: {item.source_title}</li>
      {/each}
    </ul>
  </div>
  <p id="search-contract-note" class="contract-muted">
    Contract: lexical and metadata retrieval only; no RAG chat, semantic answers, or fourth top-level navigation tab.
  </p>
</section>
