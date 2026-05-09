<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ItemDetail, ItemSummary, Source, StateBundleV1 } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
  import OwnerTokenPrompt from './components/OwnerTokenPrompt.svelte';
  import FirstUseEmptyState from './components/FirstUseEmptyState.svelte';
  import Feed from './components/Feed.svelte';
  import Inspector from './components/Inspector.svelte';
  import SourceLedger from './components/SourceLedger.svelte';
  import StatePortability from './components/StatePortability.svelte';
  import SearchRetrieval from './components/SearchRetrieval.svelte';

  type OwnerTokenPromptState = 'empty' | 'focused' | 'submitting' | 'accepted' | 'rejected';
  type FirstUseState = 'no-sources' | 'sources-added-no-items' | 'feed-temporarily-empty';
  type ApiLoadState = 'idle' | 'loading' | 'ready' | 'error';

  const tokenStorageKey = 'resofeed.ownerToken';

  let ownerToken = $state('');
  let promptState = $state<OwnerTokenPromptState>('empty');
  let loadState = $state<ApiLoadState>('idle');
  let apiError = $state<string | null>(null);
  let steerInput = $state<HTMLInputElement | undefined>();
  let items = $state<ItemSummary[]>([]);
  let sources = $state<Source[]>([]);
  let selectedItemId = $state<string | null>(null);
  let selectedItemDetail = $state<ItemDetail | null>(null);
  let inspectorState = $state<ApiLoadState>('idle');
  let inspectorError = $state<string | null>(null);

  const hasOwnerToken = $derived(ownerToken.length > 0 && promptState !== 'rejected');
  const firstUseState = $derived<FirstUseState>(
    sources.length === 0
      ? 'no-sources'
      : items.length === 0
        ? 'sources-added-no-items'
        : 'feed-temporarily-empty'
  );

  const selectedItemSummary = $derived(items.find((item) => item.id === selectedItemId) ?? items[0] ?? null);
  const inspectorItem = $derived(selectedItemDetail ?? selectedItemSummary);

  function apiClient(token = ownerToken): ResoFeedApiClient {
    return new ResoFeedApiClient({ ownerToken: token });
  }

  async function loadShellData(token: string): Promise<void> {
    loadState = 'loading';
    apiError = null;

    try {
      const client = apiClient(token);
      const [sourceResponse, feedResponse] = await Promise.all([
        client.sources(),
        client.today()
      ]);
      sources = sourceResponse.sources;
      items = feedResponse.items;
      selectedItemId = feedResponse.items[0]?.id ?? null;
      promptState = 'accepted';
      loadState = 'ready';
      if (selectedItemId) {
        await loadItemDetail(selectedItemId, token);
      }
      await tick();
      steerInput?.focus();
    } catch (error) {
      if (error instanceof ResoFeedApiError && error.status === 401) {
        window.localStorage.removeItem(tokenStorageKey);
        ownerToken = '';
        promptState = 'rejected';
      }
      loadState = 'error';
      apiError = error instanceof Error ? error.message : 'err: api unavailable';
    }
  }

  function handleOwnerTokenAccepted(token: string): void {
    ownerToken = token;
    void loadShellData(token);
  }

  async function loadItemDetail(itemId: string, token = ownerToken): Promise<void> {
    inspectorState = 'loading';
    inspectorError = null;
    try {
      const response = await apiClient(token).item(itemId);
      selectedItemDetail = response.item;
      inspectorState = 'ready';
    } catch (error) {
      inspectorState = 'error';
      inspectorError = error instanceof Error ? error.message : 'err: item unavailable';
    }
  }

  async function selectItem(item: ItemSummary): Promise<void> {
    selectedItemId = item.id;
    selectedItemDetail = null;
    await apiClient().inspect(item.id);
    await loadItemDetail(item.id);
  }

  async function toggleResonance(item: ItemSummary, resonated: boolean): Promise<void> {
    const response = await apiClient().resonance(item.id, resonated);
    items = items.map((candidate) =>
      candidate.id === item.id ? { ...candidate, is_resonated: response.is_resonated } : candidate
    );
    if (selectedItemDetail?.id === item.id) {
      selectedItemDetail = { ...selectedItemDetail, is_resonated: response.is_resonated };
    }
  }

  async function deleteSource(source: Source): Promise<void> {
    await apiClient().deleteSource(source.id);
    sources = sources.filter((candidate) => candidate.id !== source.id);
  }

  async function importOpml(opml: string): Promise<void> {
    await apiClient().importOpml(opml);
    sources = (await apiClient().sources()).sources;
  }

  async function exportState(): Promise<StateBundleV1> {
    return apiClient().exportState();
  }

  async function importState(bundle: StateBundleV1): Promise<void> {
    await apiClient().importState(bundle);
    await loadShellData(ownerToken);
  }

  async function searchItems(params: SearchRequestParams) {
    return apiClient().search(params);
  }

  onMount(() => {
    const storedToken = window.localStorage.getItem(tokenStorageKey);
    if (storedToken) {
      ownerToken = storedToken;
      promptState = 'accepted';
      void loadShellData(storedToken);
    }
  });
</script>

<main class="contract-shell resofeed-shell" aria-label="RESOFEED">
  {#if !hasOwnerToken}
    <OwnerTokenPrompt state={promptState} onAccepted={handleOwnerTokenAccepted} />
  {:else}
    <a class="skip-link" href="#today-feed">skip to feed</a>
    <header class="shell-command">
      <label class="visually-hidden" for="steer-input">Steer or paste RSS URL</label>
      <input
        id="steer-input"
        bind:this={steerInput}
        class="steer-input"
        type="text"
        placeholder="Steer or paste RSS URL..."
        autocomplete="off"
      />
      <span class="contract-label">RESOFEED</span>
    </header>

    {#if loadState === 'loading'}
      <p class="contract-muted shell-status" role="status">loading</p>
    {:else if apiError && promptState !== 'rejected'}
      <p class="contract-feedback-error shell-status" role="alert">{apiError}</p>
    {/if}

    <div class="shell-grid">
      <section id="today-feed" class="feed-pane" aria-labelledby="today-heading">
        <h1 id="today-heading">TODAY</h1>
        {#if items.length === 0}
          <FirstUseEmptyState state={firstUseState} />
        {:else}
          <Feed items={items} selectedItemId={selectedItemId} onSelect={selectItem} onResonanceToggle={toggleResonance} />
        {/if}
      </section>

      <aside class="detail-pane" aria-label="INSPECTOR">
        {#if inspectorItem}
          <Inspector item={inspectorItem} mode="desktop-split" loading={inspectorState === 'loading'} error={inspectorError} onResonanceToggle={toggleResonance} />
        {:else}
          <p class="contract-label">INSPECTOR</p>
        {/if}
      </aside>
    </div>

    <SourceLedger sources={sources} onDeleteSource={deleteSource} onImportOpml={importOpml} />
    <StatePortability onExportState={exportState} onImportState={importState} />
    <SearchRetrieval items={items} query="" onSearch={searchItems} />
  {/if}
</main>
