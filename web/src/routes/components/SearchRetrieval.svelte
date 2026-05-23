<script lang="ts">
  import { processingLanguageRuntimeContract, type ItemSummary, type ProcessingLanguage, type SearchResponse } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { itemAgeLabel, itemAnatomyChrome, itemExtractionLabel, itemPriorityLabel, itemSourceBackedProvenanceLabel, itemSummaryText, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

  interface Props {
    items: ItemSummary[];
    query?: string;
    onSearch: (params: SearchRequestParams) => Promise<SearchResponse>;
    onSelect?: (item: ItemSummary) => Promise<void> | void;
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
    selectedItemId?: string | null;
    suppressStatusRole?: boolean;
    compactFilters?: boolean;
    language?: ProcessingLanguage;
  }

  let { items, query = '', onSearch, onSelect, onResonanceToggle, selectedItemId = null, suppressStatusRole = false, compactFilters = false, language = 'en' }: Props = $props();
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
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const chrome = $derived(itemAnatomyChrome(language));

  $effect(() => {
    if (!query) {
      results = [];
      statusText = chrome.search.resultCount(0);
      lastHandledSeedQuery = '';
      return;
    }
    searchQuery = query;
    if (query !== lastHandledSeedQuery) {
      lastHandledSeedQuery = query;
      results = items;
      statusText = chrome.search.resultCount(items.length);
      void submitSearch(false);
    }
  });

  async function submitSearch(showLoading = true): Promise<void> {
    if (showLoading) statusText = chrome.search.searching;
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
      statusText = chrome.search.resultCount(response.items.length);
    } catch (error) {
      results = [];
      const message = error instanceof Error ? error.message : 'err: search failed';
      statusText = /err:\s*internal/i.test(message) ? chrome.search.resultCount(0) : message;
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

<section class="contract-region contract-search" aria-label="Search and Retrieval">
  <h2 id="search-heading" tabindex="-1">SEARCH</h2>
  <form class="contract-search-form" aria-label="Search filters" onsubmit={(event) => { event.preventDefault(); void submitSearch(); }}>
    <div class="search-primary-row">
      <label for="search-query">Plain text query</label>
      <input id="search-query" bind:value={searchQuery} aria-describedby="search-status" />
      <button type="submit" class="bracket-action">[SEARCH]</button>
    </div>
    <details class="search-secondary-filters" data-compact-filters={compactFilters ? 'true' : 'false'}>
      <summary>filters</summary>
      <div class="search-secondary-grid">
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
      </div>
    </details>
  </form>
  <p id="search-status" role={suppressStatusRole ? undefined : 'status'} aria-live="polite" class="contract-muted">{statusText || chrome.search.resultCount(results.length)}</p>
  <div role="region" aria-label="Search results">
    <div role="list" aria-label="Search result items">
      {#each results as item, index (item.id)}
        <article class="contract-feed-item contract-search-result" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined}>
          <button
            class="contract-feed-open"
            type="button"
            aria-label={`Inspect search result: ${item.title}`}
            onclick={() => void openInspector(item)}
          >
            <p class="contract-label contract-feed-meta contract-search-meta-primary">
              <span class="feed-meta-source" aria-label={chrome.search.sourceAria(item.source_title)} translate={sourceTitleTranslate}>src: {item.source_title}</span>
              <span aria-hidden="true">·</span>
              <span class="feed-meta-age" aria-label={chrome.search.ageAria(itemAgeLabel(item, new Date(), language))}>{itemAgeLabel(item, new Date(), language)}</span>
              {#if shouldShowTimeGroup(results, index)}
                <span class="contract-search-time-label">{itemTimeGroup(item)}</span>
              {/if}
            </p>
            <p class="contract-label contract-search-meta-secondary contract-search-match">
              <span class="feed-meta-extraction" aria-label={chrome.search.extractionAria(itemExtractionLabel(item.extraction_status, language))}>extraction: {itemExtractionLabel(item.extraction_status, language)}</span>
              <span>{chrome.search.matchLexicalIndex}</span>
              <span>{language === 'zh' ? itemSourceBackedProvenanceLabel(language) : chrome.search.provenanceSourceBacked}</span>
              <span aria-label={chrome.search.priorityAria(itemPriorityLabel(item, language))}>{itemPriorityLabel(item, language)}</span>
              {#if item.external_surfaced_at}
                <span aria-label={chrome.search.externallySurfacedByAgent}>agent:external</span>
              {/if}
            </p>
            <p class="contract-feed-title">{item.title}</p>
            <p class="contract-feed-summary">{itemSummaryText(item, language)}</p>
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
    {#if results.length === 0}
      <p>{chrome.search.noResults}</p>
    {/if}
  </div>
</section>
