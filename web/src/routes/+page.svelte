<script lang="ts">
  import type { ItemSummary, Source } from '$lib/api-contract';
  import OwnerTokenPrompt from './components/OwnerTokenPrompt.svelte';
  import FirstUseEmptyState from './components/FirstUseEmptyState.svelte';
  import FeedContractStub from './components/FeedContractStub.svelte';
  import InspectorContractStub from './components/InspectorContractStub.svelte';
  import SourceLedgerContractStub from './components/SourceLedgerContractStub.svelte';
  import StatePortabilityContractStub from './components/StatePortabilityContractStub.svelte';
  import SearchRetrievalContractStub from './components/SearchRetrievalContractStub.svelte';

  const contractItem: ItemSummary = {
    id: 'item_contract',
    source_id: 'src_contract',
    source_title: 'Example Source',
    url: 'https://example.com/article',
    title: 'Feed item contract stub',
    summary: 'Dense factual summary placeholder for acceptance shape only.',
    core_insight: 'Why this matters placeholder.',
    published_at: null,
    extraction_status: 'partial_extraction',
    model_status: 'summary_unavailable',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  };

  const contractSources: Source[] = [
    {
      id: 'src_contract',
      url: 'https://example.com/feed.xml',
      title: 'Example Source',
      last_fetch_at: null,
      last_fetch_status: 'not_fetched',
      is_active: true,
      revision: 1
    }
  ];
</script>

<main class="contract-shell" aria-label="RESOFEED contract stubs">
  <OwnerTokenPrompt state="empty" />
  <FirstUseEmptyState state="no-sources" />
  <FeedContractStub items={[contractItem]} selectedItemId="item_contract" />
  <InspectorContractStub item={contractItem} mode="desktop-split" />
  <SourceLedgerContractStub sources={contractSources} />
  <StatePortabilityContractStub state="idle" />
  <SearchRetrievalContractStub items={[contractItem]} query="sqlite" />
</main>
