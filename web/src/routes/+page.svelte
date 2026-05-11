<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ImportOpmlResponse, ItemDetail, ItemSummary, Source, StateBundleV1, SteerReceipt, SteerRule } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
  import OwnerTokenPrompt from './components/OwnerTokenPrompt.svelte';
  import FirstUseEmptyState from './components/FirstUseEmptyState.svelte';
  import Feed from './components/Feed.svelte';
  import Inspector from './components/Inspector.svelte';
  import SourceLedger from './components/SourceLedger.svelte';
  import SearchRetrieval from './components/SearchRetrieval.svelte';

  type OwnerTokenPromptState = 'empty' | 'focused' | 'submitting' | 'accepted' | 'rejected';
  type FirstUseState = 'no-sources' | 'sources-added-no-items' | 'feed-temporarily-empty';
  type ApiLoadState = 'idle' | 'loading' | 'ready' | 'error';
  type Surface = 'feed' | 'inspector' | 'ledger' | 'search' | 'doctor';
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
  let searchSeedQuery = $state('');
  let steerFeedback = $state<SteerFeedback>({ kind: 'idle' });
  let agentSteeringRules = $state<SteerRule[]>([]);
  let currentSurface = $state<Surface>('feed');
  let isNarrow = $state(false);
  let surfaceMenu = $state<HTMLDetailsElement | undefined>();

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
  const feedPaneInactive = $derived(currentSurface !== 'feed' && currentSurface !== 'inspector');
  const detailPaneInactive = $derived(isNarrow ? currentSurface !== 'inspector' : currentSurface !== 'feed' && currentSurface !== 'inspector');

  function surfaceForPath(pathname: string): Surface {
    if (pathname === '/doctor') return 'doctor';
    if (pathname === '/source-ledger' || pathname === '/source' || pathname === '/sources') return 'ledger';
    return 'feed';
  }

  function canonicalPathForSurface(surface: Surface): string | null {
    if (surface === 'ledger') return '/source-ledger';
    if (surface === 'doctor') return '/doctor';
    if (surface === 'feed') return '/';
    return null;
  }

  function replaceSurfaceFromLocation(): void {
    const routeSurface = surfaceForPath(window.location.pathname);
    if (routeSurface !== currentSurface) currentSurface = routeSurface;
    void focusActiveSurface(routeSurface);
  }

  async function focusActiveSurface(surface = currentSurface): Promise<void> {
    await tick();
    const headingIdBySurface: Record<Surface, string> = {
      feed: 'feed-heading',
      inspector: 'inspector-heading',
      ledger: 'source-ledger-heading',
      search: 'search-heading',
      doctor: 'doctor-heading'
    };
    document.getElementById(headingIdBySurface[surface])?.focus();
  }

  function apiClient(token = ownerToken): ResoFeedApiClient {
    return new ResoFeedApiClient({ ownerToken: token });
  }

  async function loadShellData(token: string, syncRoute = true): Promise<void> {
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
      if (syncRoute) replaceSurfaceFromLocation();
      if (currentSurface === 'doctor') {
        steerFeedback = { kind: 'doctor', text: await client.doctor() };
      }
      loadState = 'ready';
      if (selectedItemId) {
        await loadItemDetail(selectedItemId, token);
      }
      await tick();
      const activeText = document.activeElement?.textContent?.trim();
      if (currentSurface !== 'feed') {
        await focusActiveSurface(currentSurface);
      } else if (document.activeElement === document.body || document.activeElement?.id === 'owner-token-input' || activeText === 'submit' || activeText === '[SUBMIT]') {
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
    await apiClient().inspect(item.id);
    await loadItemDetail(item.id);
    inspectorFocusRequestId += 1;
  }

  function showSurface(surface: Surface, updateUrl = true): void {
    currentSurface = surface;
    if (updateUrl) {
      const canonicalPath = canonicalPathForSurface(surface);
      if (canonicalPath && window.location.pathname !== canonicalPath) {
        window.history.pushState({}, '', canonicalPath);
      }
    }
    if (surface === 'feed' && steerFeedback.kind === 'receipt' && steerFeedback.text.startsWith('retrieval:')) {
      steerFeedback = { kind: 'idle' };
      searchSeedQuery = '';
      steerCommand = '';
    }
    void focusActiveSurface(surface);
  }

  function receiptMessageWithoutInterpretation(receipt: SteerReceipt): string {
    return receipt.message
      .replace(new RegExp(`^interpreted_as:\\s*${receipt.interpreted_as.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;?\\s*`, 'i'), '')
      .trim();
  }

  function receiptState(receipt: SteerReceipt): 'applied' | 'rejected' {
    if (receipt.interpreted_as === 'add_source') return 'applied';
    if (receipt.changed_rules.length > 0) return 'applied';
    return /rejected|not applied|could not|conflict|unsafe|invariant|no safe|failed/i.test(receipt.message)
      ? 'rejected'
      : 'applied';
  }

  function formatSteerReceipt(receipt: SteerReceipt, command: string): string {
    if (receipt.interpreted_as === 'add_source') {
      const normalizedMessage = receiptMessageWithoutInterpretation(receipt);
      const detail = normalizedMessage.length > 0 ? normalizedMessage : 'source added';
      return `applied: ${detail}`;
    }

    const state = receiptState(receipt);
    const normalizedMessage = receiptMessageWithoutInterpretation(receipt);
    const detail = normalizedMessage.length > 0 ? `: ${normalizedMessage}` : '';
    const changed = receipt.changed_rules.length;
    const suffix = changed > 0 ? ` · rules:${changed}` : '';
    return `interpreted_as: ${receipt.interpreted_as}; ${state}${detail}${suffix}`;
  }

  function formatSteerError(error: unknown): string {
    if (error instanceof ResoFeedApiError && error.body.error.code === 'internal') {
      return error.message;
    }
    if (error instanceof Error) return error.message;
    return 'err: could not apply steering';
  }

  function openSurfaceFromMenu(surface: Surface): void {
    showSurface(surface);
    if (surfaceMenu) surfaceMenu.open = false;
  }

  async function submitSteer(): Promise<void> {
    const command = steerCommand.trim();
    if (!command || steerFeedback.kind === 'submitting') return;

    steerFeedback = { kind: 'submitting' };
    try {
      if (command.toLowerCase() === 'source ledger' || command.toLowerCase() === 'ledger') {
        showSurface('ledger');
        steerCommand = '';
        steerFeedback = { kind: 'receipt', text: 'source ledger' };
        return;
      }
      if (command.toLowerCase() === 'today') {
        showSurface('feed');
        steerCommand = '';
        steerFeedback = { kind: 'receipt', text: 'today' };
        return;
      }
      if (command.toLowerCase().startsWith('search ')) {
        searchSeedQuery = command.replace(/^search\s+/i, '');
        showSurface('search', false);
        steerCommand = '';
        steerFeedback = { kind: 'receipt', text: 'retrieval: lexical search' };
        return;
      }
      if (command === '/doctor') {
        const diagnostics = await apiClient().doctor();
        showSurface('doctor');
        steerCommand = '';
        steerFeedback = { kind: 'doctor', text: diagnostics };
        void focusActiveSurface('doctor');
        return;
      }

      const response = await apiClient().steer(command);
      steerCommand = '';
      steerFeedback = {
        kind: 'receipt',
        text: formatSteerReceipt(response.receipt, command)
      };
      await refreshShellLists();
    } catch (error) {
      steerFeedback = { kind: 'error', text: formatSteerError(error) };
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
    const media = window.matchMedia('(max-width: 1079px)');
    const updateMedia = () => {
      isNarrow = media.matches;
      if (!media.matches && currentSurface === 'inspector') currentSurface = 'feed';
    };
    updateMedia();
    media.addEventListener('change', updateMedia);

    const preserveKeyboardFocusModality = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (target instanceof HTMLButtonElement) event.preventDefault();
    };
    document.addEventListener('mousedown', preserveKeyboardFocusModality);

    const handlePopState = () => replaceSurfaceFromLocation();
    window.addEventListener('popstate', handlePopState);

    const storedToken = window.localStorage.getItem(tokenStorageKey);
    if (storedToken) {
      ownerToken = storedToken;
      promptState = 'accepted';
      void loadShellData(storedToken);
    }

    return () => {
      media.removeEventListener('change', updateMedia);
      document.removeEventListener('mousedown', preserveKeyboardFocusModality);
      window.removeEventListener('popstate', handlePopState);
    };
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
      <details class="surface-nav" aria-label="RESOFEED surface menu" bind:this={surfaceMenu}>
        <summary class="contract-label" aria-label="RESOFEED surface menu">RESOFEED</summary>
        <div class="surface-nav-menu">
          <button type="button" aria-current={currentSurface === 'feed' ? 'page' : undefined} onclick={() => openSurfaceFromMenu('feed')}>TODAY</button>
          <button type="button" aria-current={currentSurface === 'ledger' ? 'page' : undefined} onclick={() => openSurfaceFromMenu('ledger')}>SOURCE LEDGER</button>
        </div>
      </details>
    </header>

    {#if steerFeedback.kind === 'receipt'}
      <p class="contract-steering-receipt" role="status" aria-live="polite">{steerFeedback.text}</p>
    {:else if steerFeedback.kind === 'error'}
      <p class="contract-feedback-error shell-status" role="alert" aria-live="assertive">{steerFeedback.text}</p>
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
      <section id="today-feed" class="feed-pane" class:active-panel={currentSurface === 'feed'} aria-labelledby="feed-heading" aria-hidden={feedPaneInactive ? 'true' : undefined} inert={feedPaneInactive}>
        {#if items.length === 0}
          <FirstUseEmptyState state={firstUseState} />
        {:else}
          <Feed items={items} selectedItemId={selectedItemId} onSelect={selectItem} onResonanceToggle={toggleResonance} />
        {/if}
      </section>

      <aside class="detail-pane" class:active-panel={currentSurface === 'inspector'} aria-label="INSPECTOR" aria-hidden={detailPaneInactive ? 'true' : undefined} inert={detailPaneInactive}>
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
        onExportState={exportState}
        onImportState={importState}
        suppressStatusRole={steerFeedback.kind === 'receipt'}
      />
    </section>
    <section class="utility-surface" class:active-panel={currentSurface === 'search'} aria-label="Search surface">
      {#if isNarrow}<button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>{/if}
      <SearchRetrieval items={items} query={searchSeedQuery} onSearch={searchItems} onSelect={selectItem} onResonanceToggle={toggleResonance} suppressStatusRole={steerFeedback.kind === 'receipt'} compactFilters={isNarrow} />
    </section>
    {#if steerFeedback.kind === 'doctor'}
      <section class="utility-surface doctor-surface" class:active-panel={currentSurface === 'doctor'} aria-labelledby="doctor-heading">
        {#if isNarrow}<button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>{/if}
        <div class="contract-region">
          <h2 id="doctor-heading" tabindex="-1">/doctor</h2>
          <pre class="contract-diagnostics" role="log" aria-label="/doctor diagnostics">{steerFeedback.text}</pre>
        </div>
      </section>
    {/if}
  {/if}
</main>
