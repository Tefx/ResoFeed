<script lang="ts">
  import { processingLanguageRuntimeContract, type ItemSummary, type ProcessingLanguage, type SearchResponse } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { itemAgeLabel, itemAnatomyChrome, itemExtractionLabel, itemHasAuthoritativeGrouping, itemLocalizedDisplayTitle, itemReaderRowPreviewText, itemReaderRowPriorityToken, itemSourceBackedProvenanceLabel, itemSourceProvenanceTitle, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

  interface Props {
    items: ItemSummary[];
    query?: string;
    onSearch: (params: SearchRequestParams) => Promise<SearchResponse>;
    onSelect?: (item: ItemSummary) => Promise<void> | void;
    onResultsSettled?: (items: ItemSummary[], state: 'ready' | 'error') => Promise<void> | void;
    onResonanceToggle?: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
    selectedItemId?: string | null;
    autoSelectFirstResult?: boolean;
    suppressStatusRole?: boolean;
    compactFilters?: boolean;
    language?: ProcessingLanguage;
  }

  let { items, query = '', onSearch, onSelect, onResultsSettled, onResonanceToggle, selectedItemId = null, autoSelectFirstResult = false, suppressStatusRole = false, compactFilters = false, language = 'en' }: Props = $props();
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
  let lastAutoSelectedResultKey = '';
  let userSelectedResultKey = '';
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const chrome = $derived(itemAnatomyChrome(language));
  const searchChrome = $derived(language === 'zh'
    ? {
      region: '搜索与检索',
      heading: '词汇搜索',
      filters: '搜索筛选',
      query: '纯文本查询',
      submit: '[搜索]',
      submitAria: undefined,
      filtersSummary: '筛选',
      source: '来源',
      sourceInput: '来源筛选',
      from: '开始日期',
      to: '结束日期',
      resonated: '已标星',
      resonatedInput: '仅已标星',
      limit: '结果上限',
      resultsRegion: '搜索结果',
      resultsList: '搜索结果条目',
      inspect: (title: string) => `检查搜索结果：${title}`,
      sourceItemTitle: (title: string) => `来源标题：${title}`,
      extractionPrefix: '',
      resonate: (item: ItemSummary) => item.is_resonated ? `取消星标：${item.title}` : `标星：${item.title}`
    }
    : {
      region: 'Search and Retrieval',
      heading: 'SEARCH',
      filters: 'Search filters',
      query: 'Plain text query',
      submit: '[SEARCH]',
      submitAria: 'submit search',
      filtersSummary: 'filters',
      source: 'Source',
      sourceInput: 'Source filter',
      from: 'From date',
      to: 'To date',
      resonated: 'Resonated',
      resonatedInput: 'Resonated only',
      limit: 'Result limit',
      resultsRegion: 'Search results',
      resultsList: 'Search result items',
      inspect: (title: string) => `Inspect search result: ${title}`,
      sourceItemTitle: (title: string) => `Original item title ${title}`,
      extractionPrefix: '',
      resonate: (item: ItemSummary) => item.is_resonated ? `Remove resonance: ${item.title}` : `Resonate item: ${item.title}`
    });

  function sourceProvenanceLabel(item: ItemSummary): string {
    const source = chrome.search.sourceAria(item.source_title);
    const sourceItemTitle = searchChrome.sourceItemTitle(itemSourceProvenanceTitle(item));
    return itemSourceProvenanceTitle(item) === itemLocalizedDisplayTitle(item, language) ? source : `${source}; ${sourceItemTitle}`;
  }

  function groupingLabel(item: ItemSummary): string {
    return language === 'zh'
      ? `同组故事：后端权威分组 ${item.story_key ?? item.duplicate_of_item_id ?? ''}`.trim()
      : `Grouped story: authoritative backend grouping ${item.story_key ?? item.duplicate_of_item_id ?? ''}`.trim();
  }

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
    const resultKey = JSON.stringify({ searchQuery, source, from, to, resonated, limit });
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
      await onResultsSettled?.(response.items, 'ready');
      if (autoSelectFirstResult && response.items.length > 0 && resultKey !== lastAutoSelectedResultKey && resultKey !== userSelectedResultKey) {
        lastAutoSelectedResultKey = resultKey;
        await onSelect?.(response.items[0]);
      }
    } catch (error) {
      results = [];
      const message = error instanceof Error ? error.message : 'err: search failed';
      statusText = /err:\s*internal/i.test(message) ? chrome.search.resultCount(0) : message;
      await onResultsSettled?.([], 'error');
    }
  }

  async function openInspector(item: ItemSummary): Promise<void> {
    userSelectedResultKey = JSON.stringify({ searchQuery, source, from, to, resonated, limit });
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

<section class="contract-region contract-search" aria-label={searchChrome.region}>
  <h2 id="search-heading" tabindex="-1">{searchChrome.heading}</h2>
  <form class="contract-search-form" aria-label={searchChrome.filters} onsubmit={(event) => { event.preventDefault(); void submitSearch(); }}>
    <div class="search-primary-row">
      <label for="search-query">{searchChrome.query}</label>
      <input id="search-query" bind:value={searchQuery} aria-describedby="search-status" />
      <button type="submit" class="bracket-action" aria-label={searchChrome.submitAria}>{searchChrome.submit}</button>
    </div>
    {#if compactFilters}
      <details class="search-secondary-filters" data-compact-filters="true">
        <summary>{searchChrome.filtersSummary}</summary>
        <div class="search-secondary-grid">
          <label for="search-source">{searchChrome.source}</label>
          <input id="search-source" name="source" bind:value={source} aria-label={searchChrome.sourceInput} />
          <label for="search-from">{searchChrome.from}</label>
          <input id="search-from" name="from" type="date" bind:value={from} />
          <label for="search-to">{searchChrome.to}</label>
          <input id="search-to" name="to" type="date" bind:value={to} />
          <label class="contract-checkbox" for="search-resonated">
            <input id="search-resonated" name="resonated" type="checkbox" bind:checked={resonated} aria-label={searchChrome.resonatedInput} />
            {searchChrome.resonated}
          </label>
          <label for="search-limit">{searchChrome.limit}</label>
          <select id="search-limit" name="limit" bind:value={limit}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </details>
    {:else}
      <details class="search-secondary-filters" data-compact-filters="false" open={language === 'zh'}>
        <summary>{searchChrome.filtersSummary}</summary>
        <div class="search-secondary-grid">
          <label for="search-source">{searchChrome.source}</label>
          <input id="search-source" name="source" bind:value={source} aria-label={searchChrome.sourceInput} />
          <label for="search-from">{searchChrome.from}</label>
          <input id="search-from" name="from" type="date" bind:value={from} />
          <label for="search-to">{searchChrome.to}</label>
          <input id="search-to" name="to" type="date" bind:value={to} />
          <label class="contract-checkbox" for="search-resonated">
            <input id="search-resonated" name="resonated" type="checkbox" bind:checked={resonated} aria-label={searchChrome.resonatedInput} />
            {searchChrome.resonated}
          </label>
          <label for="search-limit">{searchChrome.limit}</label>
          <select id="search-limit" name="limit" bind:value={limit}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </details>
    {/if}
  </form>
  <p id="search-status" role={suppressStatusRole ? undefined : 'status'} aria-live="polite" class="contract-muted">{statusText || chrome.search.resultCount(results.length)}</p>
  <div class="contract-search-results-region" role="region" aria-label={searchChrome.resultsRegion}>
    <div class="contract-search-results-list" role="list" aria-label={searchChrome.resultsList}>
      {#each results as item, index (item.id)}
        <article class="contract-feed-item contract-search-result" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined}>
          <button
            class="contract-feed-open"
            type="button"
            aria-label={searchChrome.inspect(item.title)}
            onclick={() => void openInspector(item)}
          >
            <p class="contract-label contract-feed-meta contract-search-meta-primary">
              <span class="feed-meta-source" aria-label={sourceProvenanceLabel(item)} translate={sourceTitleTranslate}>{item.source_title}</span>
              <span aria-hidden="true">·</span>
              <span class="feed-meta-age" aria-label={chrome.search.ageAria(itemAgeLabel(item, new Date(), language))}>{itemAgeLabel(item, new Date(), language)}</span>
              {#if shouldShowTimeGroup(results, index)}
                <span class="contract-search-time-label">{itemTimeGroup(item)}</span>
              {/if}
            </p>
            <p class="contract-label contract-search-meta-secondary contract-search-match">
              <span class="feed-meta-extraction" aria-label={chrome.search.extractionAria(itemExtractionLabel(item.extraction_status, language))}>{searchChrome.extractionPrefix}{itemExtractionLabel(item.extraction_status, language)}</span>
              <span>{chrome.search.matchLexicalIndex}</span>
              <span>{language === 'zh' ? itemSourceBackedProvenanceLabel(language) : chrome.search.provenanceSourceBacked}</span>
              <span aria-label={chrome.search.priorityAria(itemReaderRowPriorityToken(item, language))}>{itemReaderRowPriorityToken(item, language)}</span>
              {#if itemHasAuthoritativeGrouping(item)}
                <span aria-label={groupingLabel(item)}>{language === 'zh' ? '同组' : 'grouped'}</span>
              {/if}
              {#if item.external_surfaced_at}
                <span aria-label={chrome.search.externallySurfacedByAgent}>agent:external</span>
              {/if}
            </p>
            <p class="contract-feed-title" aria-label={language === 'zh' ? `本地化标题：${itemLocalizedDisplayTitle(item, language)}` : `Localized title: ${itemLocalizedDisplayTitle(item, language)}`}>{itemLocalizedDisplayTitle(item, language)}</p>
            <p class="contract-feed-summary">{itemReaderRowPreviewText(item, language)}</p>
          </button>
          <button
            class="contract-resonate"
            type="button"
            aria-label={searchChrome.resonate(item)}
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
