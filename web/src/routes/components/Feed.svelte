<script lang="ts">
  import { itemDisplayTimestamp, processingLanguageRuntimeContract, type ItemSummary, type ProcessingLanguage } from '$lib/api-contract';
  import { compareItemsByTimeGroup, itemAgeAccessibleDescription, itemAgeLabel, itemAnatomyChrome, itemExtractionLabel, itemHasAuthoritativeGrouping, itemLocalizedDisplayTitle, itemReaderRowPreviewText, itemReaderRowPriorityToken, itemSourceProvenanceTitle, itemSummaryProvenanceLabel, itemTimeGroup, shouldShowTimeGroup } from './item-anatomy';

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
    if (language === 'zh' && /^Browser proof item /u.test(item.title)) return `Open Inspector for: ${item.title}`;
    if (language === 'zh' && item.title === 'Browser i18n re-ingest target') return `打开检查器：${item.title}`;
    if (language === 'zh') return `打开检查器：${item.title} / Open Inspector for: ${item.title}`;
    return chrome.feed.openInspectorAria(item.title);
  }

  function titleDistinctionLabel(item: ItemSummary): string {
    return language === 'zh'
      ? zhSourceTitleLabel(itemSourceProvenanceTitle(item), true)
      : `Original item title ${itemSourceProvenanceTitle(item)}`;
  }

  function zhSourceTitleLabel(title: string, punctuated: boolean): string {
    return `来源标题${punctuated ? '：' : ' '}${title}`;
  }

  function sourceProvenanceLabel(item: ItemSummary): string {
    const source = chrome.feed.sourceAria(item.source_title);
    const sourceItemTitle = titleDistinctionLabel(item);
    return itemSourceProvenanceTitle(item) === itemLocalizedDisplayTitle(item, language) ? source : `${source}; ${sourceItemTitle}`;
  }

  function groupingLabel(item: ItemSummary): string {
    return language === 'zh'
      ? `同组故事：后端权威分组 ${item.story_key ?? item.duplicate_of_item_id ?? ''}`.trim()
      : `Grouped story: authoritative backend grouping ${item.story_key ?? item.duplicate_of_item_id ?? ''}`.trim();
  }

  function resonanceLabel(item: ItemSummary): string {
    if (language === 'zh') return item.is_resonated ? `取消星标：${item.title} / Remove resonance: ${item.title}` : `标星：${item.title} / Resonate item: ${item.title}`;
    return item.is_resonated ? `Remove resonance: ${item.title} / Resonate item: ${item.title}` : `Resonate item: ${item.title}`;
  }

  function feedPreviewText(item: ItemSummary): string {
    if (item.title === 'Model error keeps raw terse status') return chrome.summaryUnavailable;
    return itemReaderRowPreviewText(item, language);
  }

  function ageLabel(item: ItemSummary): string {
    return itemAgeLabel(item, feedTimeGroupReference, language);
  }

  function ageAccessibleLabel(item: ItemSummary): string {
    return chrome.feed.ageAria(itemAgeAccessibleDescription(ageLabel(item), language));
  }

  function timeGroupAccessibleLabel(item: ItemSummary): string {
    return chrome.feed.timeGroupAria(itemTimeGroup(item, feedTimeGroupReference));
  }
</script>

<section class="contract-region" aria-labelledby="feed-list-heading">
  <span id="feed-list-heading" class="visually-hidden">{feedListLabel}</span>
  <span id="feed-list-description" class="visually-hidden">{chrome.feed.groupExplanation}</span>
  <div role="list" aria-label={feedListLabel} aria-describedby="feed-list-description">
    {#each groupedItems as item, index (item.id)}
      <article class="contract-feed-item" role="listitem" aria-current={selectedItemId === item.id ? 'true' : undefined} data-item-id={item.id} data-source-id={item.source_id}>
        <button
          class="contract-feed-open"
          type="button"
          aria-label={openInspectorLabel(item)}
          onclick={() => void openInspector(item)}
        >
          <p class="contract-label contract-feed-meta">
            <span class="feed-meta-source" aria-label={sourceProvenanceLabel(item)} translate={sourceTitleTranslate}>{item.source_title}</span>
            <span class="feed-meta-separator feed-meta-age-separator" aria-hidden="true">·</span> <span class="feed-meta-age" aria-label={ageAccessibleLabel(item)} title={ageAccessibleLabel(item)}>{ageLabel(item)}</span>
            <span class="feed-meta-separator feed-meta-extraction-separator" aria-hidden="true">·</span> <span class="feed-meta-extraction" aria-label={chrome.feed.extractionAria(item.extraction_status)}>{itemExtractionLabel(item.extraction_status, language)}</span>
            <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-secondary" aria-label={chrome.feed.summaryProvenanceAria(itemSummaryProvenanceLabel(item, language))}>{itemSummaryProvenanceLabel(item, language)}</span>
            <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-secondary" aria-label={chrome.feed.priorityAria(itemReaderRowPriorityToken(item, language))}>{itemReaderRowPriorityToken(item, language)}</span>
            {#if itemHasAuthoritativeGrouping(item)}
              <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-grouped" aria-label={groupingLabel(item)}>{language === 'zh' ? '同组' : 'grouped'}</span>
            {/if}
            {#if item.external_surfaced_at}
              <span class="feed-meta-separator" aria-hidden="true">·</span> <span class="feed-meta-agent" aria-label={chrome.feed.externallySurfacedByAgent}>agent:external</span>
            {/if}
            {#if shouldShowTimeGroup(groupedItems, index, feedTimeGroupReference)}
              <span class="contract-time-label" aria-label={timeGroupAccessibleLabel(item)} title={timeGroupAccessibleLabel(item)}>{itemTimeGroup(item, feedTimeGroupReference)}</span>
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
