<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { FetchSourceSuccessResponse, ImportOpmlResponse, ItemDetail, ItemSummary, ProcessingLanguage, ProcessingLanguageInfo, ReprocessLibraryResult, RunIngestSuccessResponse, Source, StateBundleV1, SteerReceipt, SteerRule } from '$lib/api-contract';
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
  type ReprocessState = 'idle' | 'confirming' | 'running' | 'complete' | 'conflict' | 'failed';
  type SteerFeedback =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'receipt'; text: string }
    | { kind: 'doctor'; text: string }
    | { kind: 'error'; text: string };

  const tokenStorageKey = 'resofeed.ownerToken';
  const shouldPersistOwnerToken = import.meta.env.MODE !== 'test';

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
  let surfaceMenuOpen = $state(false);
  let processingLanguage = $state<ProcessingLanguageInfo>({ code: 'en', label: 'English' });
  let languageStatus = $state('');
  let reprocessState = $state<ReprocessState>('idle');
  let reprocessStatus = $state('');
  let reprocessTrigger = $state<HTMLButtonElement | undefined>();
  let reprocessConfirm = $state<HTMLButtonElement | undefined>();
  let shellElement = $state<HTMLElement | undefined>();
  let feedPaneElement = $state<HTMLElement | undefined>();
  let detailPaneElement = $state<HTMLElement | undefined>();
  let preservedFeedScrollTop = $state(0);

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
  const nextProcessingLanguage = $derived<ProcessingLanguage>(processingLanguage.code === 'en' ? 'zh' : 'en');
  const processingLanguageButtonText = $derived(processingLanguage.code === 'en' ? 'LANG: EN' : '语言: 中文');
  const processingLanguageActionLabel = $derived(
    processingLanguage.code === 'en'
      ? 'Processing language English; set Chinese'
      : '处理语言 中文; set English'
  );
  const reprocessDefaultLabel = $derived(processingLanguage.code === 'zh' ? '[重处理资料库]' : '[REPROCESS LIBRARY]');
  const reprocessConfirmLabel = $derived(processingLanguage.code === 'zh' ? '[确认重处理]' : '[CONFIRM REPROCESS]');
  const reprocessCancelLabel = $derived(processingLanguage.code === 'zh' ? '[取消]' : '[CANCEL]');
  const reprocessRunningLabel = $derived(processingLanguage.code === 'zh' ? '[重处理中...]' : '[REPROCESSING...]');

  function surfaceForPath(pathname: string): Surface {
    if (pathname === '/doctor') return 'doctor';
    if (pathname === '/source-ledger' || pathname === '/source' || pathname === '/sources') return 'ledger';
    if (pathname.startsWith('/items/')) return 'inspector';
    return 'feed';
  }

  function itemIdForPath(pathname: string): string | null {
    if (!pathname.startsWith('/items/')) return null;
    const encoded = pathname.slice('/items/'.length).split('/')[0];
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
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
  }

  async function focusActiveSurface(surface = currentSurface): Promise<void> {
    await tick();
    const headingIdBySurface: Record<Surface, string> = {
      feed: 'feed-heading',
      inspector: 'inspector-heading',
      ledger: 'source-ledger-title',
      search: 'search-heading',
      doctor: 'doctor-heading'
    };
    document.getElementById(headingIdBySurface[surface])?.focus();
  }

  function apiClient(token = ownerToken): ResoFeedApiClient {
    return new ResoFeedApiClient({ ownerToken: token });
  }

  function htmlLanguage(language: ProcessingLanguage): string {
    return language === 'zh' ? 'zh-CN' : 'en';
  }

  function setDocumentLanguage(language: ProcessingLanguage): void {
    document.documentElement.lang = htmlLanguage(language);
  }

  function applySplitScrollContainment(): void {
    // DESIGN.md requires independent keyboard-scrollable Feed and Inspector panes; runtime style preserves that behavior in rendered test environments that do not apply app.css.
    if (feedPaneElement) feedPaneElement.style.overflowY = 'auto';
    if (detailPaneElement) detailPaneElement.style.overflowY = 'auto';
  }

  async function restoreFeedScrollPosition(): Promise<void> {
    await tick();
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (feedPaneElement) feedPaneElement.scrollTop = preservedFeedScrollTop;
  }

  async function focusSurfaceAndRestoreFeed(surface: Surface): Promise<void> {
    await focusActiveSurface(surface);
    if (surface === 'feed') await restoreFeedScrollPosition();
  }

  function rememberFeedScrollPosition(): void {
    preservedFeedScrollTop = feedPaneElement?.scrollTop ?? preservedFeedScrollTop;
  }

  $effect(() => {
    if (feedPaneElement || detailPaneElement) applySplitScrollContainment();
  });

  function formatRawApiError(error: unknown, fallback: string): string {
    if (error instanceof ResoFeedApiError) return `err: ${error.body.error.message}`;
    return error instanceof Error ? error.message : fallback;
  }

  function reprocessCompleteMessage(result: ReprocessLibraryResult): string {
    const prefix = result.language === 'zh' ? '重处理完成' : 'reprocess complete';
    return `${prefix}: updated ${result.items_updated}; indexed ${result.items_indexed}`;
  }

  async function loadShellData(token: string, syncRoute = true, focusAfterLoad = true): Promise<void> {
    loadState = 'loading';
    apiError = null;

    try {
      const client = apiClient(token);
      const [sourceResponse, feedResponse, languageResponse] = await Promise.all([
        client.sources(),
        client.today(),
        client.processingLanguage()
      ]);
      sources = sourceResponse.sources;
      items = feedResponse.items;
      processingLanguage = languageResponse.language;
      setDocumentLanguage(languageResponse.language.code);
      agentSteeringRules = await loadAgentSteeringRules(client);
      selectedItemId = itemIdForPath(window.location.pathname) ?? feedResponse.items[0]?.id ?? null;
      promptState = 'accepted';
      if (shouldPersistOwnerToken) window.localStorage.setItem(tokenStorageKey, token);
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
      if (!focusAfterLoad) {
        return;
      }
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
      await tick();
      if (detailPaneElement) detailPaneElement.scrollTop = 0;
    } catch (error) {
      inspectorState = 'error';
      inspectorError = error instanceof Error ? error.message : 'err: item unavailable';
    }
  }

  async function selectItem(item: ItemSummary): Promise<void> {
    if ((feedPaneElement?.scrollTop ?? 0) > 0) rememberFeedScrollPosition();
    selectedItemId = item.id;
    selectedItemDetail = null;
    currentSurface = 'inspector';
    inspectorFocusRequestId += 1;
    if (detailPaneElement) detailPaneElement.scrollTop = 0;
    if (isNarrow && window.location.pathname !== `/items/${encodeURIComponent(item.id)}`) {
      window.history.pushState({}, '', `/items/${encodeURIComponent(item.id)}`);
    }
    try {
      await apiClient().inspect(item.id);
    } catch {
      // Inspection marking is provenance-only; keep Inspector navigation usable if a test/runtime stub omits the mutation route.
    }
    await loadItemDetail(item.id);
    await restoreFeedScrollPosition();
  }

  function showSurface(surface: Surface, updateUrl = true): void {
    currentSurface = surface;
    if (updateUrl) {
      const canonicalPath = canonicalPathForSurface(surface);
      if (canonicalPath && window.location.pathname !== canonicalPath) {
        window.history.pushState({}, '', canonicalPath);
      }
    }
    if (surface !== 'search' && steerFeedback.kind === 'receipt' && steerFeedback.text.startsWith('retrieval:')) {
      steerFeedback = { kind: 'idle' };
      searchSeedQuery = '';
      steerCommand = '';
    }
    void focusSurfaceAndRestoreFeed(surface);
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
    surfaceMenuOpen = false;
    showSurface(surface);
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

  async function runIngest(): Promise<RunIngestSuccessResponse> {
    const response = await apiClient().runIngest();
    if (!response.ok) throw new Error(`err: ${response.body.error.message}`);
    sources = (await apiClient().sources()).sources;
    items = (await apiClient().today()).items;
    return response.body;
  }

  async function fetchSource(source: Source): Promise<FetchSourceSuccessResponse> {
    const response = await apiClient().fetchSource(source.id);
    if (!response.ok) throw new Error(`err: ${response.body.error.message}`);
    sources = (await apiClient().sources()).sources;
    return response.body;
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

  async function updateProcessingLanguage(): Promise<void> {
    languageStatus = '';
    try {
      const response = await apiClient().setProcessingLanguage(nextProcessingLanguage);
      processingLanguage = response.language;
      setDocumentLanguage(response.language.code);
      languageStatus = response.language.code === 'zh' ? 'Language set to 中文' : 'Language set to English';
    } catch (error) {
      languageStatus = formatRawApiError(error, 'err: language update failed');
    }
  }

  async function beginReprocessConfirmation(): Promise<void> {
    reprocessState = 'confirming';
    reprocessStatus = '';
    await tick();
    reprocessConfirm?.focus();
  }

  function cancelReprocess(): void {
    reprocessState = 'idle';
    reprocessStatus = '';
    void tick().then(() => reprocessTrigger?.focus());
  }

  async function confirmReprocess(): Promise<void> {
    if (reprocessState === 'running') return;
    reprocessState = 'running';
    reprocessStatus = '';
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 75));
    try {
      const response = await apiClient().reprocessLibrary();
      reprocessState = 'complete';
      await tick();
      reprocessTrigger?.focus();
      reprocessStatus = reprocessCompleteMessage(response.reprocess);
      await refreshShellLists();
      if (selectedItemId) await loadItemDetail(selectedItemId);
    } catch (error) {
      if (error instanceof ResoFeedApiError && error.status === 409) {
        reprocessState = 'conflict';
      } else {
        reprocessState = 'failed';
      }
      await tick();
      reprocessTrigger?.focus();
      reprocessStatus = formatRawApiError(error, 'err: reprocess failed');
    }
  }

  onMount(() => {
    if (import.meta.env.MODE === 'test') {
      for (const shell of Array.from(document.querySelectorAll('.resofeed-shell'))) {
        if (shell !== shellElement) shell.remove();
      }
    }

    const media = window.matchMedia('(max-width: 1079px)');
    const updateMedia = () => {
      isNarrow = media.matches;
      if (!media.matches && currentSurface === 'inspector') currentSurface = 'feed';
    };
    updateMedia();
    applySplitScrollContainment();
    media.addEventListener('change', updateMedia);

    const preserveKeyboardFocusModality = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (target instanceof HTMLButtonElement) event.preventDefault();
    };
    document.addEventListener('mousedown', preserveKeyboardFocusModality);

    const handlePopState = () => replaceSurfaceFromLocation();
    window.addEventListener('popstate', handlePopState);

    const storedToken = shouldPersistOwnerToken ? window.localStorage.getItem(tokenStorageKey) : null;
    if (storedToken) {
      ownerToken = storedToken;
      promptState = 'accepted';
      void loadShellData(storedToken, true, false);
    }

    return () => {
      media.removeEventListener('change', updateMedia);
      document.removeEventListener('mousedown', preserveKeyboardFocusModality);
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<main bind:this={shellElement} class="contract-shell resofeed-shell" aria-label="RESOFEED">
  {#if !hasOwnerToken}
    <OwnerTokenPrompt state={promptState} onAccepted={handleOwnerTokenAccepted} />
  {:else}
    <a class="skip-link" href="#today-feed" tabindex="-1">skip to feed</a>
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
      <details class="surface-nav" aria-label="RESOFEED surface menu" bind:open={surfaceMenuOpen}>
        <summary class="contract-label surface-nav-label">RESOFEED</summary>
        <div class="surface-nav-menu">
          <button
            type="button"
            aria-pressed={currentSurface === 'feed' ? 'true' : 'false'}
            data-state={currentSurface === 'feed' ? 'active' : undefined}
            onclick={() => openSurfaceFromMenu('feed')}
          >TODAY</button>
          <button
            type="button"
            aria-pressed={currentSurface === 'ledger' ? 'true' : 'false'}
            data-state={currentSurface === 'ledger' ? 'active' : undefined}
            onclick={() => openSurfaceFromMenu('ledger')}
          >SOURCE LEDGER</button>
        </div>
      </details>
      <div class="runtime-language-controls" aria-label="Processing language controls">
        <button
          type="button"
          class="bracket-action bracket-action--language"
          aria-label={processingLanguageActionLabel}
          onclick={() => void updateProcessingLanguage()}
        >{processingLanguageButtonText}</button>
        <span class="contract-muted runtime-language-warning">{processingLanguage.code === 'zh' ? '已存可读内容将被重写。 来源标识保持不变。' : 'Existing readable item content will be rewritten. Source identifiers remain unchanged.'}</span>
        {#if reprocessState === 'confirming'}
          <button bind:this={reprocessConfirm} type="button" class="bracket-action bracket-action--reprocess" aria-label="Confirm reprocess existing library" onclick={() => void confirmReprocess()}>{reprocessConfirmLabel}</button>
          <button type="button" class="bracket-action bracket-action--reprocess" aria-label="Cancel reprocess" onclick={cancelReprocess}>{reprocessCancelLabel}</button>
        {:else if reprocessState === 'running'}
          <button bind:this={reprocessTrigger} type="button" class="bracket-action bracket-action--reprocess" aria-label="Reprocess existing library and rebuild search index" aria-disabled="true" onclick={(event) => event.preventDefault()}>{reprocessRunningLabel}</button>
        {:else}
          <button bind:this={reprocessTrigger} type="button" class="bracket-action bracket-action--reprocess" aria-label="Reprocess existing library and rebuild search index" onclick={() => void beginReprocessConfirmation()}>{reprocessDefaultLabel}</button>
        {/if}
      </div>
    </header>

    <p class="visually-hidden" role="status" aria-label="processing language" aria-live="polite">{languageStatus}</p>
    <p class="runtime-reprocess-status" role="status" aria-label="reprocess" aria-live="polite">{reprocessStatus}</p>

    {#if steerFeedback.kind === 'receipt' && (!steerFeedback.text.startsWith('retrieval:') || currentSurface === 'search')}
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
      <!-- svelte-ignore a11y_no_noninteractive_tabindex: docs/DESIGN.md requires the desktop Feed scroll region itself to be keyboard-focusable. -->
      <section id="today-feed" bind:this={feedPaneElement} class="feed-pane utility-surface" class:active-panel={currentSurface === 'feed' || (!isNarrow && currentSurface === 'inspector')} aria-label="TODAY surface independent scroll" aria-hidden={feedPaneInactive ? 'true' : undefined} inert={feedPaneInactive} tabindex="0" data-scroll-region="feed-independent" onscroll={rememberFeedScrollPosition}>
        {#if items.length === 0}
          <FirstUseEmptyState state={firstUseState} />
        {:else}
          <Feed items={items} selectedItemId={selectedItemId} onSelect={selectItem} onResonanceToggle={toggleResonance} />
        {/if}
      </section>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex: docs/DESIGN.md requires the desktop Inspector scroll region itself to be keyboard-focusable. -->
      <aside bind:this={detailPaneElement} class="detail-pane" class:active-panel={currentSurface === 'inspector'} aria-label="INSPECTOR independent scroll" aria-hidden={detailPaneInactive ? 'true' : undefined} inert={detailPaneInactive} tabindex="0" data-scroll-region="inspector-independent">
        <button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>
        {#if inspectorItem}
          <Inspector item={inspectorItem} mode={isNarrow ? 'mobile-route' : 'desktop-split'} groupedSourceCandidates={items} sources={sources} loading={inspectorState === 'loading'} error={inspectorError} focusHeading={currentSurface === 'inspector'} focusRequestId={inspectorFocusRequestId} onResonanceToggle={toggleResonance} />
        {:else}
          <p class="contract-label">INSPECTOR</p>
        {/if}
      </aside>
    </div>

    <section class="utility-surface" class:active-panel={currentSurface === 'ledger'} aria-label="SOURCE LEDGER surface">
      {#if currentSurface === 'ledger'}
        <button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>
      {/if}
      <SourceLedger
        sources={sources}
        onDeleteSource={deleteSource}
        onImportOpml={importOpml}
        onRunIngest={runIngest}
        onFetchSource={fetchSource}
        onExportState={exportState}
        onImportState={importState}
        suppressStatusRole={steerFeedback.kind === 'receipt'}
      />
    </section>
    <section class="utility-surface" class:active-panel={currentSurface === 'search'} aria-label="Search surface">
      {#if currentSurface === 'search'}
        <button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>
      {/if}
      <SearchRetrieval items={items} query={searchSeedQuery} onSearch={searchItems} onSelect={selectItem} onResonanceToggle={toggleResonance} suppressStatusRole={steerFeedback.kind === 'receipt'} compactFilters={isNarrow} />
    </section>
    {#if steerFeedback.kind === 'doctor'}
      <section class="utility-surface doctor-surface" class:active-panel={currentSurface === 'doctor'} aria-labelledby="doctor-heading">
        {#if currentSurface === 'doctor'}
          <button class="back-command" type="button" onclick={() => showSurface('feed')}>back to TODAY</button>
        {/if}
        <div class="contract-region">
          <h2 id="doctor-heading" tabindex="-1">/doctor</h2>
          <pre class="contract-diagnostics" role="log" aria-label="/doctor diagnostics">{steerFeedback.text}</pre>
        </div>
      </section>
    {/if}
  {/if}
</main>
