<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ImportOpmlResponse, ItemDetail, ItemSummary, Source, StateBundleV1, SteerRule } from '$lib/api-contract';
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
  type Surface = 'feed' | 'inspector' | 'ledger' | 'search';
  type ManualFetchState = {
    readonly ingesting: boolean;
    readonly fetchingSourceIds: readonly string[];
    readonly lastIngestAt: string | null;
    readonly sourceErrors: Readonly<Record<string, string>>;
  };
  type SteerFeedback =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'receipt'; text: string }
    | { kind: 'doctor'; text: string }
    | { kind: 'error'; text: string };

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
  let inspectorFocusRequestId = $state(0);
  let steerCommand = $state('');
  let steerFeedback = $state<SteerFeedback>({ kind: 'idle' });
  let agentSteeringRules = $state<SteerRule[]>([]);
  let currentSurface = $state<Surface>('feed');
  let isNarrow = $state(false);
  let manualFetchState = $state<ManualFetchState>({
    ingesting: false,
    fetchingSourceIds: [],
    lastIngestAt: null,
    sourceErrors: {}
  });

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
      agentSteeringRules = await loadAgentSteeringRules(client);
      selectedItemId = feedResponse.items[0]?.id ?? null;
      promptState = 'accepted';
      window.localStorage.setItem(tokenStorageKey, token);
      loadState = 'ready';
      if (selectedItemId) {
        await loadItemDetail(selectedItemId, token);
      }
      await tick();
      if (document.activeElement === document.body || document.activeElement?.id === 'owner-token-input' || document.activeElement?.textContent?.trim() === 'submit') {
        steerInput?.focus();
      }
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
    promptState = 'submitting';
    void loadShellData(token);
  }

  async function refreshShellLists(): Promise<void> {
    const client = apiClient();
    const [sourceResponse, feedResponse] = await Promise.all([client.sources(), client.today()]);
    sources = sourceResponse.sources;
    items = feedResponse.items;
    agentSteeringRules = await loadAgentSteeringRules(client);
    if (selectedItemId && !feedResponse.items.some((item) => item.id === selectedItemId)) {
      selectedItemId = feedResponse.items[0]?.id ?? null;
      selectedItemDetail = null;
    }
  }

  async function loadAgentSteeringRules(client: ResoFeedApiClient): Promise<SteerRule[]> {
    try {
      const response = await client.activeRules();
      return response.rules.filter((rule) => rule.created_by_actor_kind === 'agent' && rule.created_by_actor_id);
    } catch {
      return [];
    }
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
    currentSurface = 'inspector';
    inspectorFocusRequestId += 1;
    await apiClient().inspect(item.id);
    await loadItemDetail(item.id);
  }

  function showSurface(surface: Surface): void {
    currentSurface = surface;
  }

  async function submitSteer(): Promise<void> {
    const command = steerCommand.trim();
    if (!command || steerFeedback.kind === 'submitting') return;

    steerFeedback = { kind: 'submitting' };
    try {
      if (command.toLowerCase().startsWith('search ')) {
        currentSurface = 'search';
        steerCommand = command.replace(/^search\s+/i, '');
        steerFeedback = { kind: 'receipt', text: 'retrieval: lexical search' };
        return;
      }
      if (command === '/doctor') {
        const diagnostics = await apiClient().doctor();
        steerFeedback = { kind: 'doctor', text: diagnostics };
        return;
      }

      const response = await apiClient().steer(command);
      steerCommand = '';
      const changed = response.receipt.changed_rules.length;
      const suffix = changed > 0 ? ` · rules:${changed}` : '';
      steerFeedback = {
        kind: 'receipt',
        text: `applied: ${response.receipt.message}${suffix}`
      };
      await refreshShellLists();
    } catch (error) {
      steerFeedback = { kind: 'error', text: error instanceof Error ? error.message : 'err: could not apply' };
    }
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

  async function importOpml(opml: string): Promise<ImportOpmlResponse> {
    const response = await apiClient().importOpml(opml);
    sources = (await apiClient().sources()).sources;
    return response;
  }

  function formatManualSourceError(message: string): string {
    return message.startsWith('err:') ? message : `err: ${message}`;
  }

  async function runManualIngest(): Promise<void> {
    if (manualFetchState.ingesting) return;
    manualFetchState = { ...manualFetchState, ingesting: true };
    try {
      let result = await apiClient().runIngest();
      if (!result.ok && result.status === 409) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        result = await apiClient().runIngest();
      }
      if (result.ok) {
        const sourceErrors = Object.fromEntries(
          result.body.errors.map((sourceError) => [sourceError.source_id, formatManualSourceError(sourceError.message)])
        );
        manualFetchState = {
          ...manualFetchState,
          lastIngestAt: result.body.completed ? new Date().toISOString() : manualFetchState.lastIngestAt,
          sourceErrors
        };
        await refreshShellLists();
        return;
      }
      apiError = `err: ${result.body.error.message}`;
    } catch (error) {
      apiError = error instanceof Error ? error.message : 'err: ingest failed';
    } finally {
      manualFetchState = { ...manualFetchState, ingesting: false };
    }
  }

  async function fetchManualSource(source: Source): Promise<void> {
    if (manualFetchState.fetchingSourceIds.includes(source.id)) return;
    manualFetchState = {
      ...manualFetchState,
      fetchingSourceIds: [...manualFetchState.fetchingSourceIds, source.id]
    };
    try {
      const result = await apiClient().fetchSource(source.id);
      if (result.ok) {
        const remainingErrors: Record<string, string> = { ...manualFetchState.sourceErrors };
        delete remainingErrors[source.id];
        const sourceError = result.body.errors.find((errorEntry) => errorEntry.source_id === source.id);
        manualFetchState = {
          ...manualFetchState,
          sourceErrors: sourceError
            ? { ...remainingErrors, [source.id]: formatManualSourceError(sourceError.message) }
            : remainingErrors
        };
        await refreshShellLists();
        return;
      }
      manualFetchState = {
        ...manualFetchState,
        sourceErrors: { ...manualFetchState.sourceErrors, [source.id]: `err: ${result.body.error.message}` }
      };
    } catch (error) {
      manualFetchState = {
        ...manualFetchState,
        sourceErrors: {
          ...manualFetchState.sourceErrors,
          [source.id]: error instanceof Error ? error.message : 'err: fetch failed'
        }
      };
    } finally {
      manualFetchState = {
        ...manualFetchState,
        fetchingSourceIds: manualFetchState.fetchingSourceIds.filter((sourceId) => sourceId !== source.id)
      };
    }
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
    const media = window.matchMedia('(max-width: 760px)');
    const updateMedia = () => {
      isNarrow = media.matches;
      if (!media.matches && currentSurface === 'inspector') currentSurface = 'feed';
    };
    updateMedia();
    media.addEventListener('change', updateMedia);

    const storedToken = window.localStorage.getItem(tokenStorageKey);
    if (storedToken) {
      ownerToken = storedToken;
      promptState = 'accepted';
      void loadShellData(storedToken);
    }

    return () => media.removeEventListener('change', updateMedia);
  });
</script>

<main class="contract-shell resofeed-shell" aria-label="RESOFEED">
  {#if !hasOwnerToken}
    <OwnerTokenPrompt state={promptState} onAccepted={handleOwnerTokenAccepted} />
  {:else}
    <a class="skip-link" href="#today-feed">skip to feed</a>
    <header class="shell-command">
      <form class="steer-form" aria-label="Steer" onsubmit={(event) => { event.preventDefault(); void submitSteer(); }}>
        <label class="visually-hidden" for="steer-input">Steer or paste RSS URL</label>
        <span aria-hidden="true">&gt;</span>
        <input
          id="steer-input"
          bind:this={steerInput}
          bind:value={steerCommand}
          class="steer-input"
          type="text"
          placeholder="Steer or paste RSS URL..."
          autocomplete="off"
          disabled={steerFeedback.kind === 'submitting'}
          onkeydown={(event) => {
            if (event.key === 'Escape') steerCommand = '';
          }}
        />
        {#if steerCommand.trim().length > 0}
          <button type="submit" disabled={steerFeedback.kind === 'submitting'}>{steerFeedback.kind === 'submitting' ? 'applying' : 'apply'}</button>
        {/if}
      </form>
      <span class="contract-label">RESOFEED</span>
    </header>

    <nav class="surface-nav" aria-label="Surfaces">
      <button type="button" class:active-surface={currentSurface === 'feed'} aria-current={currentSurface === 'feed' ? 'true' : undefined} onclick={() => showSurface('feed')}>TODAY</button>
      <button type="button" class:active-surface={currentSurface === 'ledger'} aria-current={currentSurface === 'ledger' ? 'true' : undefined} onclick={() => showSurface('ledger')}>SOURCE LEDGER</button>
    </nav>

    {#if steerFeedback.kind === 'receipt'}
      <p class="contract-steering-receipt" role="status" aria-live="polite">{steerFeedback.text}</p>
    {:else if steerFeedback.kind === 'error'}
      <p class="contract-feedback-error shell-status" role="alert" aria-live="assertive">{steerFeedback.text}</p>
    {:else if steerFeedback.kind === 'doctor'}
      <section class="contract-region doctor-surface" aria-labelledby="doctor-heading">
        <h2 id="doctor-heading">/doctor</h2>
        <pre class="contract-diagnostics" role="log" aria-label="/doctor diagnostics">{steerFeedback.text}</pre>
      </section>
    {:else if steerFeedback.kind === 'submitting'}
      <p class="contract-muted shell-status" role="status">applying</p>
    {/if}

    {#if agentSteeringRules.length > 0}
      <section class="contract-steering-receipt" aria-label="Agent steering receipt" aria-live="polite">
        {#each agentSteeringRules as rule (rule.id)}
          <p>agent:{rule.created_by_actor_id} steering active: {rule.rule_text} · correct in Steer</p>
        {/each}
      </section>
    {/if}

    {#if loadState === 'loading'}
      <p class="contract-muted shell-status" role="status">loading</p>
    {:else if apiError && promptState !== 'rejected'}
      <p class="contract-feedback-error shell-status" role="alert">{apiError}</p>
    {/if}

    <div class="shell-grid" data-surface={currentSurface}>
      <section id="today-feed" class="feed-pane" class:active-panel={currentSurface === 'feed'} aria-labelledby="feed-heading">
        {#if items.length === 0}
          <FirstUseEmptyState state={firstUseState} />
        {:else}
          <Feed items={items} selectedItemId={selectedItemId} onSelect={selectItem} onResonanceToggle={toggleResonance} />
        {/if}
      </section>

      <aside class="detail-pane" class:active-panel={currentSurface === 'inspector'} aria-label="INSPECTOR">
        {#if isNarrow}
          <button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>
        {/if}
        {#if inspectorItem}
          <Inspector item={inspectorItem} mode={isNarrow ? 'mobile-route' : 'desktop-split'} loading={inspectorState === 'loading'} error={inspectorError} focusHeading={currentSurface === 'inspector'} focusRequestId={inspectorFocusRequestId} onResonanceToggle={toggleResonance} />
        {:else}
          <p class="contract-label">INSPECTOR</p>
        {/if}
      </aside>
    </div>

    <section class="utility-surface" class:active-panel={currentSurface === 'ledger'} aria-label="SOURCE LEDGER surface">
      {#if isNarrow}<button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>{/if}
      <SourceLedger
        sources={sources}
        onDeleteSource={deleteSource}
        onImportOpml={importOpml}
        onRunIngest={runManualIngest}
        onFetchSource={fetchManualSource}
        manualFetchState={manualFetchState}
      />
      <StatePortability onExportState={exportState} onImportState={importState} />
    </section>
    <section class="utility-surface" class:active-panel={currentSurface === 'search'} aria-label="Search surface">
      {#if isNarrow}<button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>{/if}
      <SearchRetrieval items={items} query={steerCommand} onSearch={searchItems} />
    </section>
  {/if}
</main>
