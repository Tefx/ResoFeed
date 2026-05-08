<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ItemSummary, Source } from '$lib/api-contract';
  import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
  import OwnerTokenPrompt from './components/OwnerTokenPrompt.svelte';
  import FirstUseEmptyState from './components/FirstUseEmptyState.svelte';
  import FeedContractStub from './components/FeedContractStub.svelte';
  import InspectorContractStub from './components/InspectorContractStub.svelte';
  import SourceLedgerContractStub from './components/SourceLedgerContractStub.svelte';
  import StatePortabilityContractStub from './components/StatePortabilityContractStub.svelte';
  import SearchRetrievalContractStub from './components/SearchRetrievalContractStub.svelte';

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

  const hasOwnerToken = $derived(ownerToken.length > 0 && promptState !== 'rejected');
  const firstUseState = $derived<FirstUseState>(
    sources.length === 0
      ? 'no-sources'
      : items.length === 0
        ? 'sources-added-no-items'
        : 'feed-temporarily-empty'
  );

  async function loadShellData(token: string): Promise<void> {
    loadState = 'loading';
    apiError = null;

    try {
      const client = new ResoFeedApiClient({ ownerToken: token });
      const [sourceResponse, feedResponse] = await Promise.all([
        client.sources(),
        client.today()
      ]);
      sources = sourceResponse.sources;
      items = feedResponse.items;
      promptState = 'accepted';
      loadState = 'ready';
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
          <FeedContractStub items={items} selectedItemId={items[0]?.id} />
        {/if}
      </section>

      <aside class="detail-pane" aria-label="INSPECTOR">
        {#if items[0]}
          <InspectorContractStub item={items[0]} mode="desktop-split" />
        {:else}
          <p class="contract-label">INSPECTOR</p>
        {/if}
      </aside>
    </div>

    <SourceLedgerContractStub sources={sources} />
    <StatePortabilityContractStub state="idle" />
    <SearchRetrievalContractStub items={items} query="" />
  {/if}
</main>
