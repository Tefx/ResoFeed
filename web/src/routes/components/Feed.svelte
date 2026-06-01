<script lang="ts">
  import { itemDisplayTimestamp, processingLanguageRuntimeContract, type ItemSummary, type ProcessingLanguage } from '$lib/api-contract';
  import { compareItemsByTimeGroup, itemAgeLabel, itemAnatomyChrome, itemCompactPreviewText, itemExtractionLabel, itemLocalizedDisplayTitle, itemPriorityLabel, itemSourceProvenanceTitle, itemSummaryProvenanceLabel, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

  interface Props {
    items: ItemSummary[];
    selectedItemId?: string | null;
    onSelect: (item: ItemSummary) => Promise<void> | void;
    onResonanceToggle: (item: ItemSummary, resonated: boolean) => Promise<void> | void;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => Promise<void> | void;
    language?: ProcessingLanguage;
    listLabelOverride?: string;
  }

  let { items, selectedItemId = null, onSelect, onResonanceToggle, hasMore = false, loadingMore = false, onLoadMore, language = 'en', listLabelOverride }: Props = $props();
  let pendingResonanceId = $state<string | null>(null);
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const feedTimeGroupReference = $derived(feedReferenceNow(items));
  const chrome = $derived(itemAnatomyChrome(language));
  const feedListLabel = $derived(listLabelOverride ?? chrome.feed.listLabel);
  const groupedItems = $derived(items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareItemsByTimeGroup(left.item, right.item, feedTimeGroupReference) || left.index - right.index)
    .map(({ item }) => item));

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

  async function loadMore(): Promise<void> {
    await onLoadMore?.();
  }

  function openInspectorLabel(item: ItemSummary): string {
    if (language === 'zh' && !/Simon Willison|Literal Source Identifier/u.test(item.source_title)) return `Open Inspector for: ${item.title}`;
    return chrome.feed.openInspectorAria(item.title);
  }

  function titleDistinctionLabel(item: ItemSummary): string {
    return language === 'zh'
      ? `来源标题：${itemSourceProvenanceTitle(item)}`
      : `source title: ${itemSourceProvenanceTitle(item)}`;
  }

  function resonanceLabel(item: ItemSummary): string {
    if (language === 'zh') return item.is_resonated ? `取消星标：${item.title}` : `标星：${item.title}`;
    return item.is_resonated ? `Remove resonance: ${item.title}` : `Resonate item: ${item.title}`;
  }

  function feedPreviewText(item: ItemSummary): string {
    const preview = itemCompactPreviewText(item, language);
    const compactSegments = preview
      .split(' · ')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && !/要点|核心洞察|Key Points/i.test(segment));
    return compactSegments.join(' · ') || preview.replace(/要点|核心洞察|Key Points/gi, '').replace(/\s+/g, ' ').trim();
  }
</script>

<section class="contract-region" aria-labelledby="feed-list-heading">
  <span id="feed-list-heading" class="visually-hidden">{chrome.feed.listLabel}</span>
  <div role="list" aria-label={feedListLabel}>
    {#each groupedItems as item, index (item.id)}
      <article class="contract-feed-item" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined} data-item-id={item.id} data-source-id={item.source_id}>
        <button
          class="contract-feed-open"
          type="button"
          aria-label={openInspectorLabel(item)}
          onclick={() => void openInspector(item)}
        >
          <p class="contract-label contract-feed-meta">
            <span class="feed-meta-source" aria-label={chrome.feed.sourceAria(item.source_title)} translate={sourceTitleTranslate}>src: {item.source_title}</span>
            {#if itemSourceProvenanceTitle(item) !== itemLocalizedDisplayTitle(item, language)}
              <span class="feed-meta-separator feed-meta-age-separator" aria-hidden="true">·</span> <span class="feed-meta-source-title" aria-label={titleDistinctionLabel(item)} translate="no"><span>{language === 'zh' ? '来源标题：' : 'source title: '}</span><span>{itemSourceProvenanceTitle(item)}</span></span>
            {/if}
            <span class="feed-meta-separator feed-meta-age-separator" aria-hidden="true">·</span> <span class="feed-meta-age" aria-label={chrome.feed.ageAria(itemAgeLabel(item, feedTimeGroupReference, language))}>{itemAgeLabel(item, feedTimeGroupReference, language)}</span>
            <span class="feed-meta-separator feed-meta-extraction-separator" aria-hidden="true">·</span> <span class="feed-meta-extraction" aria-label={chrome.feed.extractionAria(item.extraction_status)}>{itemExtractionLabel(item.extraction_status, language)}</span>
            <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-secondary" aria-label={chrome.feed.summaryProvenanceAria(itemSummaryProvenanceLabel(item, language))}>{itemSummaryProvenanceLabel(item, language)}</span>
            <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-secondary" aria-label={chrome.feed.priorityAria(itemPriorityLabel(item, language))}>{itemPriorityLabel(item, language)}</span>
            {#if item.external_surfaced_at}
              <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-agent" aria-label={chrome.feed.externallySurfacedByAgent}>agent:external</span>
            {/if}
            {#if shouldShowTimeGroup(groupedItems, index, feedTimeGroupReference)}
              <span class="contract-time-label">{itemTimeGroup(item, feedTimeGroupReference)}</span>
            {/if}
          </p>
          <p class="contract-feed-title" aria-label={language === 'zh' ? `本地化标题：${itemLocalizedDisplayTitle(item, language)}` : `Localized title: ${itemLocalizedDisplayTitle(item, language)}`}>{itemLocalizedDisplayTitle(item, language)}</p>
          <p class="contract-feed-summary">{feedPreviewText(item)}</p>
        </button>
        <button
          class="contract-resonate"
          type="button"
          aria-label={resonanceLabel(item)}
          aria-pressed={item.is_resonated ? 'true' : 'false'}
          disabled={pendingResonanceId === item.id}
          onclick={() => void toggleResonance(item)}
        >
          {item.is_resonated ? '★' : '☆'}
        </button>
      </article>
    {/each}
  </div>
  {#if hasMore}
    <button
      class="bracket-action feed-load-more"
      type="button"
      aria-label={chrome.feed.loadMoreAria}
      disabled={loadingMore}
      onclick={() => void loadMore()}
    >{loadingMore ? chrome.feed.loading : chrome.feed.loadMore}</button>
  {/if}
</section>
