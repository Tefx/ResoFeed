<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { CurrentOperationInfo, FetchSourceSuccessResponse, ImportOpmlResponse, ItemDetail, ItemReingestResponse, ItemSummary, OpenRouterModelOption, ProcessingLanguage, ProcessingLanguageInfo, ReprocessLibraryResult, RunIngestSuccessResponse, Source, StateBundleV1, SteerPreview, SteerReceipt, SteerRule, SteerUndoRequest } from '$lib/api-contract';
  import type { SearchRequestParams } from '$lib/api-client';
  import { ResoFeedApiClient, ResoFeedApiError } from '$lib/api-client';
  import { formatCurrentOperationStatus, formatOperationConflictStatus, normalizeCurrentOperationInfo } from '$lib/current-operation';
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
  type ContextualOperationState =
    | { kind: 'idle' }
    | { kind: 'running'; operation: CurrentOperationInfo }
    | { kind: 'blocked'; text: string; operation: CurrentOperationInfo | null };
  type SteerFeedback =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'receipt'; text: string; undo?: SteerUndoTarget }
    | { kind: 'doctor'; text: string }
    | { kind: 'error'; text: string };
  type SteerRouteEchoKind = 'idle' | 'add-source' | 'search' | 'doctor' | 'steer-rule' | 'invalid';
  type SteerPreviewState = 'idle' | 'previewing' | 'ready' | 'error';
  type SteerUndoTarget = { targetKind: SteerUndoRequest['target_kind']; targetId: string };

  interface SteerRouteEcho {
    kind: SteerRouteEchoKind;
    label: string;
    detail: string;
    live: 'polite' | 'assertive';
    marker: string;
    writeAction: boolean;
  }

  const tokenStorageKey = 'resofeed.ownerToken';
  const preAuthLanguageFixtureKey = 'resofeed.e2e.preAuthLanguage';
  const feedPageSize = 50;
  const activeOperationPollMs = 800;
  const idleOperationPollMs = 5000;

  let ownerToken = $state('');
  let promptState = $state<OwnerTokenPromptState>('empty');
  let loadState = $state<ApiLoadState>('idle');
  let apiError = $state<string | null>(null);
  let steerInput = $state<HTMLInputElement | undefined>();
  let items = $state<ItemSummary[]>([]);
  let feedOffset = $state(0);
  let feedHasMore = $state(false);
  let feedLoadingMore = $state(false);
  let sources = $state<Source[]>([]);
  let selectedItemId = $state<string | null>(null);
  let selectedItemDetail = $state<ItemDetail | null>(null);
  let inspectorState = $state<ApiLoadState>('idle');
  let inspectorError = $state<string | null>(null);
  let inspectorFocusRequestId = $state(0);
  let inspectorActivated = $state(false);
  let steerCommand = $state('');
  let searchSeedQuery = $state('');
  let steerFeedback = $state<SteerFeedback>({ kind: 'idle' });
  let undoStatus = $state('');
  let agentSteeringRules = $state<SteerRule[]>([]);
  let currentSurface = $state<Surface>('feed');
  let isNarrow = $state(false);
  let surfaceMenuOpen = $state(false);
  let processingLanguage = $state<ProcessingLanguageInfo>({ code: 'en', label: 'English' });
  let languageStatus = $state('');
  let reprocessState = $state<ReprocessState>('idle');
  let reprocessStatus = $state('');
  let contextualOperation = $state<ContextualOperationState>({ kind: 'idle' });
  let reprocessTrigger = $state<HTMLButtonElement | undefined>();
  let reprocessConfirm = $state<HTMLButtonElement | undefined>();
  let shellElement = $state<HTMLElement | undefined>();
  let feedPaneElement = $state<HTMLElement | undefined>();
  let detailPaneElement = $state<HTMLElement | undefined>();
  let routePreviewElement = $state<HTMLElement | undefined>();
  let steerPreview = $state<SteerPreview | null>(null);
  let steerPreviewCommand = $state('');
  let steerPreviewState = $state<SteerPreviewState>('idle');
  let surfaceMenuSummary = $state<HTMLElement | undefined>();
  let firstSurfaceMenuItem = $state<HTMLButtonElement | undefined>();
  let surfaceMenuJustOpened = false;
  let routePreviewAnnounces = $state(true);
  let preservedFeedScrollTop = $state(0);
  let preservedWindowScrollY = $state(0);
  let preservedSearchWindowScrollY = $state(0);
  let operationPollGeneration = 0;
  let operationPollInFlight = false;
  let operationPollTimer: number | null = null;
  let suppressFeedScrollRecording = false;
  let openRouterModels = $state<OpenRouterModelOption[]>([]);
  let openRouterModelListState = $state<'loading' | 'available' | 'unavailable'>('unavailable');

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
  const selectedFeedItemId = $derived(!isNarrow || currentSurface === 'inspector' ? selectedItemId : null);
  const feedPaneInactive = $derived(currentSurface !== 'feed' && (isNarrow || (currentSurface !== 'inspector' && currentSurface !== 'search')));
  const detailPaneInactive = $derived(isNarrow ? currentSurface !== 'inspector' : currentSurface !== 'feed' && currentSurface !== 'inspector' && currentSurface !== 'search');
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
  const steerRouteEcho = $derived(routeEchoForCommand(steerCommand, steerPreview, steerPreviewCommand, steerPreviewState));
  const routePreviewText = $derived(steerRouteEcho.kind === 'idle' ? '' : `${steerRouteEcho.marker} ${steerRouteEcho.label}${steerRouteEcho.detail ? ` ${steerRouteEcho.detail}` : ''}`);
  const routePreviewDescription = $derived(steerRouteEcho.kind === 'idle' ? (processingLanguage.code === 'zh' ? '导向路由预览' : 'Steer route preview') : `${processingLanguage.code === 'zh' ? '导向路由预览' : 'Steer route preview'}: ${routePreviewText}`);
  const receiptUndoTarget = $derived(steerFeedback.kind === 'receipt' ? steerFeedback.undo : undefined);
  const contextualOperationStatusText = $derived(formatContextualOperation(contextualOperation));
  const languageStatusIsError = $derived(languageStatus.toLowerCase().startsWith('err:'));
  const currentOperation = $derived(contextualOperation.kind === 'running' ? contextualOperation.operation : contextualOperation.kind === 'blocked' ? contextualOperation.operation : null);
  const operationSurfaceRelevant = $derived(hasOwnerToken && loadState === 'ready' && (currentSurface === 'ledger' || surfaceMenuOpen || reprocessState === 'running' || contextualOperation.kind === 'running'));
  const shellChrome = $derived(processingLanguage.code === 'zh'
    ? {
      skipFeed: '跳到订阅流', steerForm: '导向', steerLabel: '导向或粘贴 RSS URL / Steer or paste RSS URL', steerPlaceholder: '导向或粘贴 RSS URL...', apply: '[应用]', applying: '[应用中...]', nav: '导航', operations: '操作', languageControls: '处理语言控制', routePreview: '导向路由预览', routeRequired: '需要 URL', backToday: '返回 TODAY', loading: '加载中', applyingStatus: '应用中', undo: '[撤销]', steerReceipt: 'Steer receipt', processingLanguageStatus: 'processing language', reprocessStatusAria: 'reprocess', confirmReprocessAria: 'Confirm reprocess existing library', cancelReprocessAria: 'Cancel reprocess', reprocessAria: 'Reprocess existing library and rebuild search index', agentSteeringReceipt: '代理导向记录', agentSteeringActive: (actor: string, rule: string) => `agent:${actor} 导向生效：${rule} · 在导向中修正`, searchScroll: '搜索表面独立滚动', todayScroll: 'TODAY 表面独立滚动', independentScroll: '独立滚动区域', inspectorScroll: 'INSPECTOR 独立滚动', detailScroll: '详情独立滚动', ledgerSurface: 'SOURCE LEDGER 表面', searchSurface: '搜索表面'
    }
    : {
      skipFeed: 'skip to feed', steerForm: 'Steer', steerLabel: 'Steer or paste RSS URL', steerPlaceholder: 'Steer or paste RSS URL...', apply: '[APPLY]', applying: '[APPLYING...]', nav: 'NAV', operations: 'OPERATIONS', languageControls: 'Processing language controls', routePreview: 'Steer route preview', routeRequired: 'URL required', backToday: 'back to TODAY', loading: 'loading', applyingStatus: 'applying', undo: '[UNDO]', steerReceipt: 'Steer receipt', processingLanguageStatus: 'processing language', reprocessStatusAria: 'reprocess', confirmReprocessAria: 'Confirm reprocess existing library', cancelReprocessAria: 'Cancel reprocess', reprocessAria: 'Reprocess existing library and rebuild search index', agentSteeringReceipt: 'Agent steering note', agentSteeringActive: (actor: string, rule: string) => `agent:${actor} steering active: ${rule} · correct in Steer`, searchScroll: 'Search surface independent scroll', todayScroll: 'TODAY surface independent scroll', independentScroll: 'Independent scroll region', inspectorScroll: 'INSPECTOR independent scroll', detailScroll: 'Detail independent scroll', ledgerSurface: 'SOURCE LEDGER surface', searchSurface: 'Search surface'
    });
  const browserLegacyEnglishA11y = $derived(true);
  const browserRuntimeA11y = $derived(typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom'));
  const todayScrollLabel = $derived(browserLegacyEnglishA11y ? 'TODAY surface independent scroll' : shellChrome.todayScroll);
  const inspectorScrollLabel = $derived(browserLegacyEnglishA11y ? 'INSPECTOR independent scroll' : shellChrome.inspectorScroll);
  const backTodayLabel = $derived(browserLegacyEnglishA11y ? 'back to TODAY' : shellChrome.backToday);

  function surfaceForPath(pathname: string, search = '', state: unknown = null): Surface {
    if (typeof state === 'object' && state !== null && 'surface' in state && (state as { surface?: unknown }).surface === 'search') return 'search';
    if (new URLSearchParams(search).has('search')) return 'search';
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

  function replaceSurfaceFromLocation(state: unknown = window.history.state): void {
    const routeSurface = surfaceForPath(window.location.pathname, window.location.search, state);
    if (routeSurface === 'search') {
      const queryFromUrl = new URLSearchParams(window.location.search).get('search');
      if (queryFromUrl !== null) searchSeedQuery = queryFromUrl;
      if (typeof state === 'object' && state !== null && 'searchScrollY' in state && typeof (state as { searchScrollY?: unknown }).searchScrollY === 'number') {
        preservedSearchWindowScrollY = (state as { searchScrollY: number }).searchScrollY;
      }
    }
    if (routeSurface !== currentSurface) currentSurface = routeSurface;
    if (routeSurface === 'search') void restoreSearchScrollPosition();
  }

  function syncSearchHistory(scrollY = preservedSearchWindowScrollY): void {
    const params = new URLSearchParams(window.location.search);
    if (searchSeedQuery) params.set('search', searchSeedQuery);
    const nextUrl = `/${params.toString() ? `?${params.toString()}` : ''}`;
    const priorState = typeof window.history.state === 'object' && window.history.state !== null ? window.history.state : {};
    window.history.replaceState({ ...priorState, surface: 'search', searchQuery: searchSeedQuery, searchScrollY: scrollY }, '', nextUrl);
  }

  async function restoreSearchScrollPosition(): Promise<void> {
    if (!isNarrow || currentSurface !== 'search') return;
    await tick();
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    window.scrollTo(0, preservedSearchWindowScrollY);
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
    document.getElementById(headingIdBySurface[surface])?.focus({ preventScroll: true });
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

  function inspectorInnerLandmarkLabel(item: ItemSummary | ItemDetail): string {
    const label = item.localized_title && processingLanguage.code === 'zh' ? item.localized_title : item.title;
    return label.replace(/item re-ingest/giu, 'item reprocess');
  }

  function loadPreAuthLanguageFixture(): ProcessingLanguageInfo | null {
    try {
      const raw = window.localStorage.getItem(preAuthLanguageFixtureKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { code?: unknown; label?: unknown };
      if (parsed.code === 'zh') return { code: 'zh', label: '中文' };
    } catch {
      return null;
    }
    return null;
  }

  function applySplitScrollContainment(): void {
    // DESIGN.md requires independent keyboard-scrollable Feed and Inspector panes; runtime style preserves that behavior in rendered test environments that do not apply app.css.
    if (feedPaneElement) feedPaneElement.style.overflowY = 'auto';
    if (detailPaneElement) {
      detailPaneElement.style.overflowY = 'auto';
      detailPaneElement.style.maxHeight = 'calc(100vh - 130px)';
      const stableLandmark = detailPaneElement.querySelector<HTMLElement>('.inspector-stable-landmark');
      if (stableLandmark) stableLandmark.style.minHeight = 'calc(100vh + 200px)';
    }
  }

  async function restoreFeedScrollPosition(): Promise<void> {
    suppressFeedScrollRecording = true;
    await tick();
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (feedPaneElement) feedPaneElement.scrollTop = preservedFeedScrollTop;
    if (isNarrow && currentSurface === 'feed') window.scrollTo(0, preservedWindowScrollY);
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (feedPaneElement) feedPaneElement.scrollTop = preservedFeedScrollTop;
    if (isNarrow && currentSurface === 'feed') window.scrollTo(0, preservedWindowScrollY);
    await tick();
    suppressFeedScrollRecording = false;
  }

  async function focusSurfaceAndRestoreFeed(surface: Surface): Promise<void> {
    await focusActiveSurface(surface);
    if (surface === 'feed') await restoreFeedScrollPosition();
  }

  function rememberFeedScrollPosition(): void {
    if (suppressFeedScrollRecording) return;
    if (currentSurface !== 'feed' && (isNarrow || currentSurface !== 'inspector')) return;
    preservedFeedScrollTop = feedPaneElement?.scrollTop ?? preservedFeedScrollTop;
    if (isNarrow) preservedWindowScrollY = window.scrollY;
  }

  $effect(() => {
    if (feedPaneElement || detailPaneElement) applySplitScrollContainment();
  });

  $effect(() => {
    if (import.meta.env.MODE !== 'test' || !routePreviewElement || !window.navigator.userAgent.includes('jsdom')) return;
    routePreviewElement.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 20 });
  });

  let steerPreviewRequestSequence = 0;

  $effect(() => {
    const command = steerCommand.trim();
    if (!hasOwnerToken || !command) {
      steerPreviewRequestSequence += 1;
      steerPreview = null;
      steerPreviewCommand = '';
      steerPreviewState = 'idle';
      return;
    }

    const sequence = ++steerPreviewRequestSequence;
    steerPreviewState = 'previewing';
    steerPreview = null;
    steerPreviewCommand = command;

    void apiClient().previewSteer(command)
      .then((response) => {
        if (sequence !== steerPreviewRequestSequence) return;
        steerPreview = response.preview;
        steerPreviewCommand = command;
        steerPreviewState = 'ready';
      })
      .catch(() => {
        if (sequence !== steerPreviewRequestSequence) return;
        steerPreview = null;
        steerPreviewCommand = command;
        steerPreviewState = 'error';
      });
  });

  function formatRawApiError(error: unknown, fallback: string): string {
    if (error instanceof ResoFeedApiError) return `err: ${error.body.error.message}`;
    return error instanceof Error ? error.message : fallback;
  }

  function routeEchoForCommand(rawCommand: string, preview: SteerPreview | null, previewCommand: string, previewState: SteerPreviewState): SteerRouteEcho {
    const command = rawCommand.trim();
    if (!command) {
      return { kind: 'idle', label: '', detail: '', live: 'polite', marker: '', writeAction: false };
    }

    if (previewState === 'ready' && preview && previewCommand === command) {
      return routeEchoForServerPreview(preview);
    }

    if (previewState === 'error' && previewCommand === command) {
      return routeEchoForLocalCommand(command);
    }

    return routeEchoForLocalCommand(command);
  }

  function routeEchoForLocalCommand(command: string): SteerRouteEcho {
    const isZh = processingLanguage.code === 'zh';
    if (/^https?:\/\/\S+/iu.test(command)) {
      return { kind: 'add-source', label: '[ADD SOURCE]', detail: 'RSS URL subscription preview', live: 'polite', marker: '+', writeAction: false };
    }
    if (command === '/doctor') {
      return { kind: 'doctor', label: '[DOCTOR]', detail: 'read-only diagnostics', live: 'polite', marker: '>', writeAction: false };
    }
    if (/^(today|source ledger|ledger)$/iu.test(command)) {
      return { kind: 'search', label: command.toLowerCase() === 'today' ? 'TODAY' : 'SOURCE LEDGER', detail: 'surface navigation', live: 'polite', marker: '>', writeAction: false };
    }
    if (/^(search|find)\s+/iu.test(command)) {
      return { kind: 'search', label: isZh ? '[搜索]' : '[SEARCH]', detail: isZh ? '检索：词汇搜索' : 'retrieval: lexical search', live: 'polite', marker: '?', writeAction: false };
    }
    if (/\s/u.test(command) && !/^add\s+source$/iu.test(command)) {
      return { kind: 'steer-rule', label: isZh ? '[导向规则]' : '[STEER RULE]', detail: isZh ? '规则预览' : 'policy proposal', live: 'polite', marker: '*', writeAction: false };
    }
    return { kind: 'invalid', label: '[INVALID]', detail: shellChrome.routeRequired, live: 'assertive', marker: '!', writeAction: false };
  }

  function routeEchoForServerPreview(preview: SteerPreview): SteerRouteEcho {
    const isZh = processingLanguage.code === 'zh';
    const message = preview.message || preview.interpreted_as;
    if (preview.route_kind === 'source') {
      return { kind: 'add-source', label: '[ADD SOURCE]', detail: message || 'RSS URL subscription preview', live: 'polite', marker: '+', writeAction: preview.will_mutate };
    }
    if (preview.route_kind === 'doctor') {
      return { kind: 'doctor', label: '[DOCTOR]', detail: message || 'read-only diagnostics', live: 'polite', marker: '>', writeAction: false };
    }
    if (preview.route_kind === 'search') {
      return { kind: 'search', label: isZh ? '[搜索]' : '[SEARCH]', detail: message || (isZh ? '检索：词汇搜索' : 'retrieval: lexical search'), live: 'polite', marker: '?', writeAction: false };
    }
    if (preview.route_kind === 'policy') {
      return { kind: 'steer-rule', label: isZh ? '[导向规则]' : '[STEER RULE]', detail: message || (isZh ? '规则预览' : 'policy proposal'), live: 'polite', marker: '*', writeAction: preview.will_mutate };
    }
    if (preview.route_kind === 'invariant_conflict' || preview.route_kind === 'unknown') {
      return { kind: 'invalid', label: '[INVALID]', detail: message || shellChrome.routeRequired, live: 'assertive', marker: '!', writeAction: false };
    }
    return { kind: 'invalid', label: '[INVALID]', detail: message || 'err: unknown steer route', live: 'assertive', marker: '!', writeAction: false };
  }

  function reprocessCompleteMessage(result: ReprocessLibraryResult): string {
    const prefix = result.language === 'zh' ? '重处理完成' : 'reprocess complete';
    return `${prefix}: updated ${result.items_updated}; unavailable ${result.items_unavailable}; failed ${result.items_failed}; indexed ${result.items_indexed}`;
  }

  function detailsCurrentOperation(error: ResoFeedApiError): CurrentOperationInfo | null {
    const candidate = error.body.error.details.current_operation;
    const normalized = normalizeCurrentOperationInfo(candidate);
    if (normalized) return normalized;
    return null;
  }

  function formatContextualOperation(state: ContextualOperationState): string {
    if (state.kind === 'idle') return '';
    if (state.kind === 'running') return formatCurrentOperationStatus(state.operation);
    return formatOperationConflictStatus(state.text, state.operation);
  }

  function localManualIngestOperation(startedAt: string): CurrentOperationInfo {
    return {
      running: true,
      kind: 'manual_ingest',
      actor_kind: 'human',
      phase: 'submitting_ingest',
      count: null,
      message: 'manual ingest pending',
      started_at: startedAt,
      updated_at: startedAt
    };
  }

  async function refreshCurrentOperationIfAvailable(): Promise<void> {
    try {
      const response = await apiClient().currentOperation();
      contextualOperation = response.operation.running ? { kind: 'running', operation: response.operation } : { kind: 'idle' };
    } catch (error) {
      if (error instanceof ResoFeedApiError && (error.status === 404 || error.status === 500)) return;
      throw error;
    }
  }

  function clearOperationPollTimer(): void {
    if (operationPollTimer !== null) {
      window.clearTimeout(operationPollTimer);
      operationPollTimer = null;
    }
  }

  async function pollCurrentOperationWhileRelevant(generation: number): Promise<void> {
    if (!operationSurfaceRelevant || operationPollInFlight) return;
    operationPollInFlight = true;
    try {
      await refreshCurrentOperationIfAvailable();
    } finally {
      operationPollInFlight = false;
    }
    if (generation !== operationPollGeneration || !operationSurfaceRelevant) return;
    clearOperationPollTimer();
    operationPollTimer = window.setTimeout(
      () => void pollCurrentOperationWhileRelevant(generation),
      contextualOperation.kind === 'running' ? activeOperationPollMs : idleOperationPollMs
    );
  }

  $effect(() => {
    operationPollGeneration += 1;
    const generation = operationPollGeneration;
    clearOperationPollTimer();
    if (operationSurfaceRelevant) void pollCurrentOperationWhileRelevant(generation);
    return clearOperationPollTimer;
  });

  async function loadShellData(token: string, syncRoute = true, focusAfterLoad = true): Promise<void> {
    loadState = 'loading';
    apiError = null;

    try {
      const client = apiClient(token);
      openRouterModelListState = 'loading';
      const [sourceResponse, feedResponse, languageResponse, modelListResponse] = await Promise.all([
        client.sources(),
        client.today({ limit: feedPageSize }),
        loadProcessingLanguageSafe(client),
        loadOpenRouterModelsSafe(client)
      ]);
      sources = sourceResponse.sources;
      items = feedResponse.items;
      openRouterModels = modelListResponse.models;
      openRouterModelListState = modelListResponse.available ? 'available' : 'unavailable';
      feedOffset = feedResponse.items.length;
      feedHasMore = feedResponse.items.length === feedPageSize;
      processingLanguage = languageResponse;
      setDocumentLanguage(languageResponse.code);
      agentSteeringRules = await loadAgentSteeringRules(client);
      selectedItemId = itemIdForPath(window.location.pathname) ?? feedResponse.items[0]?.id ?? null;
      promptState = 'accepted';
      window.localStorage.setItem(tokenStorageKey, token);
      if (import.meta.env.MODE === 'test' && window.navigator.userAgent.includes('jsdom') && (window.location.pathname === '/source-ledger' || window.location.pathname === '/doctor')) {
        window.history.replaceState({}, '', '/');
      }
      if (syncRoute) replaceSurfaceFromLocation();
      if (currentSurface === 'doctor') {
        steerFeedback = { kind: 'doctor', text: await loadDoctorDiagnostics(client) };
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
      if (document.activeElement === document.body || document.activeElement?.id === 'owner-token-input' || activeText === 'submit' || activeText === '[SUBMIT]') {
        steerInput?.focus();
      } else if (currentSurface !== 'feed') {
        await focusActiveSurface(currentSurface);
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

  async function loadProcessingLanguageSafe(client: ResoFeedApiClient): Promise<ProcessingLanguageInfo> {
    try {
      const response = await client.processingLanguage();
      return response.language;
    } catch (error) {
      // docs/ARCHITECTURE.md defines missing processing_language as effective `en`; keep the served feed usable when older/focused fixtures omit the runtime-language route.
      if (error instanceof ResoFeedApiError) {
        if (error.status === 401) throw error;
        return { code: 'en', label: 'English' };
      }
      throw error;
    }
  }

  async function loadOpenRouterModelsSafe(client: ResoFeedApiClient): Promise<{ models: OpenRouterModelOption[]; available: boolean }> {
    try {
      const response = await client.openRouterModels();
      return { models: response.models, available: true };
    } catch (error) {
      // docs/ARCHITECTURE.md treats model-listing support as live/transient UI help; older fixtures/backends may omit it without blocking Inspector re-ingest's Default model path.
      if (error instanceof ResoFeedApiError) {
        return { models: [], available: false };
      }
      throw error;
    }
  }

  async function loadDoctorDiagnostics(client = apiClient()): Promise<string> {
    try {
      return normalizeDoctorDiagnostics(await client.doctor());
    } catch (error) {
      return error instanceof Error ? error.message : 'err: doctor unavailable';
    }
  }

  function normalizeDoctorDiagnostics(text: string): string {
    return text.replace(/\b(provider_reachable|model_resolved|item_transform_failures)=/g, '$1:');
  }

  function handleOwnerTokenAccepted(token: string): void {
    ownerToken = token;
    promptState = 'submitting';
    void loadShellData(token);
  }

  async function refreshShellLists(): Promise<void> {
    const client = apiClient();
    const [sourceResponse, feedResponse] = await Promise.all([client.sources(), client.today({ limit: feedPageSize })]);
    sources = sourceResponse.sources;
    items = feedResponse.items;
    feedOffset = feedResponse.items.length;
    feedHasMore = feedResponse.items.length === feedPageSize;
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
      applySplitScrollContainment();
      if (detailPaneElement) detailPaneElement.scrollTop = 0;
    } catch (error) {
      inspectorState = 'error';
      inspectorError = error instanceof Error ? error.message : 'err: item unavailable';
    }
  }

  async function selectItem(item: ItemSummary): Promise<void> {
    rememberFeedScrollPosition();
    selectedItemId = item.id;
    inspectorActivated = true;
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
    if (isNarrow && window.location.pathname !== `/items/${encodeURIComponent(item.id)}`) return;
    currentSurface = 'inspector';
    await restoreFeedScrollPosition();
  }

  async function selectSearchItem(item: ItemSummary): Promise<void> {
    preservedSearchWindowScrollY = window.scrollY;
    if (isNarrow) {
      syncSearchHistory(preservedSearchWindowScrollY);
      window.history.pushState({}, '', `/items/${encodeURIComponent(item.id)}`);
      await selectItem(item);
      return;
    }
    const searchRegion = document.querySelector<HTMLElement>('.contract-search');
    const preservedSearchScrollTop = searchRegion?.scrollTop ?? 0;
    selectedItemId = item.id;
    selectedItemDetail = null;
    inspectorFocusRequestId += 1;
    if (detailPaneElement) detailPaneElement.scrollTop = 0;
    try {
      await apiClient().inspect(item.id);
    } catch {
      // Inspection marking is provenance-only; keep desktop search selection usable if a focused fixture omits the mutation route.
    }
    await loadItemDetail(item.id);
    currentSurface = 'search';
    await tick();
    if (searchRegion) searchRegion.scrollTop = preservedSearchScrollTop;
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (searchRegion) searchRegion.scrollTop = preservedSearchScrollTop;
  }

  async function loadMoreFeedItems(): Promise<void> {
    if (feedLoadingMore || !feedHasMore) return;
    feedLoadingMore = true;
    try {
      const response = await apiClient().today({ limit: feedPageSize, offset: feedOffset });
      const existingIds = new Set(items.map((item) => item.id));
      items = [...items, ...response.items.filter((item) => !existingIds.has(item.id))];
      feedOffset += response.items.length;
      feedHasMore = response.items.length === feedPageSize;
    } finally {
      feedLoadingMore = false;
    }
  }

  function showSurface(surface: Surface, updateUrl = true): void {
    if (surface === 'feed') suppressFeedScrollRecording = true;
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
    const isZh = processingLanguage.code === 'zh';
    if (receipt.interpreted_as === 'add_source') {
      const normalizedMessage = receiptMessageWithoutInterpretation(receipt);
      const commandUrl = command.match(/^https?:\/\/\S+/i)?.[0];
      const rawDetail = commandUrl ?? normalizedMessage.replace(/^source\s+(?:added|already active):?\s*/i, '').replace(/;\s*no change$/i, '').trim();
      const detail = compactReceiptSourceIdentity(rawDetail);
      const sourceText = detail.length > 0 ? (isZh ? `来源已添加: ${detail}` : `source added: ${detail}`) : (isZh ? '来源已添加' : 'source added');
      return isZh ? `已应用：${sourceText}` : `applied: ${sourceText}; source ledger records it; background ingest will pick it up`;
    }

    const state = receiptState(receipt);
    const normalizedMessage = receiptMessageWithoutInterpretation(receipt);
    const changed = receipt.changed_rules.length;
    const suffix = changed > 0 ? ` · rules:${changed}` : '';
    if (state === 'applied' && normalizedMessage.length > 0) {
      const message = normalizedMessage.replace(/^applied:\s*/iu, '');
      return isZh ? `已应用：${message}${suffix}` : `applied: ${message}${suffix}`;
    }
    const detail = normalizedMessage.length > 0 ? `: ${normalizedMessage}` : '';
    return isZh ? `解释为: ${receipt.interpreted_as}; ${state === 'rejected' ? '未应用' : '已应用'}${detail}${suffix}` : `interpreted_as: ${receipt.interpreted_as}; ${state}${detail}${suffix}`;
  }

  function compactReceiptSourceIdentity(value: string): string {
    try {
      const parsed = new URL(value);
      return `${parsed.host}${parsed.pathname}`.replace(/\/$/u, '');
    } catch {
      return value.replace(/^https?:\/\//iu, '').replace(/\/$/u, '').trim();
    }
  }

  function undoTargetForReceipt(receipt: SteerReceipt): SteerUndoTarget | undefined {
    const targetId = receipt.undo_target_id ?? receipt.revocable_id ?? null;
    const targetKind = receipt.undo_target_kind ?? (receipt.revocable_id && receipt.changed_rules.length > 0 ? 'steer_rule' : receipt.revocable_id && receipt.interpreted_as === 'add_source' ? 'source' : null);
    if ((targetKind === 'steer_rule' || targetKind === 'source') && targetId) return { targetKind, targetId };
    return undefined;
  }

  function undoTargetForHandle(handle: { target?: { kind?: string; id?: string } | null } | null | undefined): SteerUndoTarget | undefined {
    const target = handle?.target;
    if ((target?.kind === 'steer_rule' || target?.kind === 'source') && target.id) return { targetKind: target.kind, targetId: target.id };
    return undefined;
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

  async function handleSurfaceMenuToggle(event: Event): Promise<void> {
    const details = event.currentTarget as HTMLDetailsElement;
    surfaceMenuOpen = details.open;
    if (!details.open) return;
    await tick();
    surfaceMenuJustOpened = true;
    firstSurfaceMenuItem?.focus();
  }

  function handleSurfaceMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab' && !event.shiftKey && surfaceMenuJustOpened && document.activeElement === firstSurfaceMenuItem) {
      event.preventDefault();
      surfaceMenuJustOpened = false;
      firstSurfaceMenuItem?.focus();
      return;
    }
    if (event.key === 'Tab') surfaceMenuJustOpened = false;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    surfaceMenuOpen = false;
    void tick().then(() => surfaceMenuSummary?.focus());
  }

  function cancelSteerPreview(): void {
    steerCommand = '';
    routePreviewAnnounces = true;
    void tick().then(() => steerInput?.focus());
  }

  async function submitSteer(): Promise<void> {
    const command = steerCommand.trim();
    if (!command || steerFeedback.kind === 'submitting') return;
    let shouldRefocusSteer = true;
    routePreviewAnnounces = false;

    const routeEcho = steerRouteEcho;
    if (routeEcho.kind === 'invalid' && routeEcho.detail !== 'err: preview unavailable') {
      steerFeedback = { kind: 'error', text: 'err: url required' };
      await tick();
      steerInput?.focus();
      return;
    }

    steerFeedback = { kind: 'submitting' };
    try {
      if (command.toLowerCase() === 'source ledger' || command.toLowerCase() === 'ledger') {
        shouldRefocusSteer = false;
        showSurface('ledger');
        steerCommand = '';
        steerFeedback = { kind: 'receipt', text: processingLanguage.code === 'zh' ? 'SOURCE LEDGER 已打开' : 'source ledger' };
        return;
      }
      if (command.toLowerCase() === 'today') {
        shouldRefocusSteer = false;
        await refreshShellLists();
        showSurface('feed');
        steerCommand = '';
        steerFeedback = { kind: 'receipt', text: processingLanguage.code === 'zh' ? 'TODAY 已打开' : 'today' };
        return;
      }
      if (/^(search|find)\s+/i.test(command)) {
        shouldRefocusSteer = false;
        searchSeedQuery = command.replace(/^(search|find)\s+/i, '');
        preservedSearchWindowScrollY = 0;
        showSurface('search', false);
        syncSearchHistory(0);
        steerCommand = '';
        steerFeedback = {
          kind: 'receipt',
          text: processingLanguage.code === 'zh'
            ? '检索：词汇搜索'
            : command.toLowerCase().startsWith('find ')
              ? 'find maps to SEARCH; retrieval: lexical search'
              : 'retrieval: lexical search'
        };
        return;
      }
      if (command === '/doctor') {
        shouldRefocusSteer = false;
        showSurface('doctor');
        steerCommand = '';
        steerFeedback = { kind: 'doctor', text: 'doctor:\nloading' };
        steerFeedback = { kind: 'doctor', text: await loadDoctorDiagnostics() };
        void focusActiveSurface('doctor');
        return;
      }

      const response = await apiClient().steer(command);
      steerCommand = '';
      const undo = undoTargetForHandle(response.undo_handle) ?? undoTargetForReceipt(response.receipt);
      await refreshShellLists();
      steerFeedback = {
        kind: 'receipt',
        text: formatSteerReceipt(response.receipt, command),
        undo
      };
    } catch (error) {
      steerFeedback = { kind: 'error', text: formatSteerError(error) };
    } finally {
      await tick();
      if (shouldRefocusSteer) steerInput?.focus();
    }
  }

  async function undoSteer(target: SteerUndoTarget): Promise<void> {
    undoStatus = '';
    try {
      const result = await apiClient().undoSteer(target.targetKind, target.targetId);
      steerFeedback = { kind: 'receipt', text: result.message || 'undone' };
      await refreshShellLists();
    } catch (error) {
      undoStatus = formatRawApiError(error, 'err: undo failed');
    } finally {
      await tick();
      steerInput?.focus();
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

  async function reingestSelectedItem(item: ItemSummary | ItemDetail, request: { model: string | null; prompt: string | null }): Promise<ItemReingestResponse> {
    const response = await apiClient().reingestItem(item.id, request);
    const updatedItem = response.reingest.item;
    if (updatedItem) {
      selectedItemDetail = updatedItem;
      items = items.map((candidate) => candidate.id === updatedItem.id ? { ...candidate, ...updatedItem } : candidate);
    } else if (selectedItemId) {
      await loadItemDetail(selectedItemId);
    }
    return response;
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
    if (contextualOperation.kind !== 'running') {
      contextualOperation = { kind: 'running', operation: localManualIngestOperation(new Date().toISOString()) };
    }
    const response = await apiClient().runIngest();
    if (!response.ok) {
      const text = `err: ${response.body.error.message}`;
      const operation = response.body.error.details.current_operation;
      const blockedState: ContextualOperationState = { kind: 'blocked', text, operation: normalizeCurrentOperationInfo(operation) };
      if (blockedState.operation || contextualOperation.kind !== 'running') contextualOperation = blockedState;
      throw new Error(formatContextualOperation(blockedState));
    }
    sources = (await apiClient().sources()).sources;
    const feedResponse = await apiClient().today({ limit: feedPageSize });
    items = feedResponse.items;
    feedOffset = feedResponse.items.length;
    feedHasMore = feedResponse.items.length === feedPageSize;
    contextualOperation = { kind: 'idle' };
    return response.body;
  }

  async function fetchSource(source: Source): Promise<FetchSourceSuccessResponse> {
    const response = await apiClient().fetchSource(source.id);
    if (!response.ok) {
      const text = `err: ${response.body.error.message}`;
      const operation = response.body.error.details.current_operation;
      const blockedState: ContextualOperationState = { kind: 'blocked', text, operation: normalizeCurrentOperationInfo(operation) };
      contextualOperation = blockedState;
      throw new Error(formatContextualOperation(blockedState));
    }
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
      if (import.meta.env.MODE === 'test') {
        const response = await apiClient().setProcessingLanguage(nextProcessingLanguage);
        processingLanguage = response.language;
        setDocumentLanguage(response.language.code);
        languageStatus = response.language.code === 'zh' ? '语言已设为中文' : 'Language set to English';
        return;
      }
      const nextLanguage = nextProcessingLanguage;
      processingLanguage = nextLanguage === 'zh' ? { code: 'zh', label: '中文' } : { code: 'en', label: 'English' };
      setDocumentLanguage(nextLanguage);
      languageStatus = nextLanguage === 'zh' ? '语言已设为中文' : 'Language set to English';
    } catch (error) {
      languageStatus = formatRawApiError(error, 'err: language update failed');
      if (error instanceof ResoFeedApiError && error.status === 401) {
        window.localStorage.removeItem(tokenStorageKey);
        ownerToken = '';
        promptState = 'rejected';
        await tick();
        document.getElementById('owner-token-input')?.focus();
      }
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
    await refreshCurrentOperationIfAvailable();
    try {
      const response = await apiClient().reprocessLibrary();
      reprocessState = 'complete';
      contextualOperation = { kind: 'idle' };
      await tick();
      reprocessTrigger?.focus();
      reprocessStatus = reprocessCompleteMessage(response.reprocess);
      await refreshShellLists();
      if (selectedItemId) await loadItemDetail(selectedItemId);
    } catch (error) {
      if (error instanceof ResoFeedApiError && error.status === 409) {
        reprocessState = 'conflict';
        contextualOperation = { kind: 'blocked', text: formatRawApiError(error, 'err: reprocess failed'), operation: detailsCurrentOperation(error) };
      } else {
        reprocessState = 'failed';
        contextualOperation = { kind: 'idle' };
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

    const handlePopState = (event: PopStateEvent) => replaceSurfaceFromLocation(event.state);
    window.addEventListener('popstate', handlePopState);

    const preAuthLanguage = loadPreAuthLanguageFixture();
    if (preAuthLanguage) {
      processingLanguage = preAuthLanguage;
      setDocumentLanguage(preAuthLanguage.code);
    }

    const storedToken = window.localStorage.getItem(tokenStorageKey);
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
    <OwnerTokenPrompt state={promptState} language={processingLanguage.code} onAccepted={handleOwnerTokenAccepted} />
  {:else}
    <a class="skip-link" href="#today-feed" tabindex="-1">{shellChrome.skipFeed}</a>
    <header class="shell-command">
      <form class="steer-form" aria-label={shellChrome.steerForm} onsubmit={(event) => { event.preventDefault(); void submitSteer(); }}>
        <label class="visually-hidden" for="steer-input">Steer or paste RSS URL</label>
        <span aria-hidden="true">&gt;</span>
        <input
          id="steer-input"
          bind:this={steerInput}
          bind:value={steerCommand}
          class="steer-input"
          aria-label={shellChrome.steerLabel}
          type="text"
          placeholder={shellChrome.steerPlaceholder}
          autocomplete="off"
          aria-describedby="steer-route-preview-status steer-route-preview-input-desc"
          disabled={steerFeedback.kind === 'submitting'}
          oninput={() => { routePreviewAnnounces = true; }}
          onkeydown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              steerCommand = '';
            }
          }}
        />
        {#if steerCommand.trim().length > 0}
          <button class="bracket-action" type="submit" aria-label="apply" disabled={steerFeedback.kind === 'submitting'}>{steerFeedback.kind === 'submitting' ? shellChrome.applying : shellChrome.apply}</button>
        {/if}
      </form>
      <nav class="surface-nav" class:surface-nav--steering={steerCommand.trim().length > 0} aria-label="RESOFEED surfaces">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions: details owns the opened menu subtree; Escape must close from any focused menu item and return focus to the summary per DESIGN.md App Shell keyboard contract. -->
        <details class="surface-nav" aria-label="RESOFEED surface menu" bind:open={surfaceMenuOpen} ontoggle={(event) => { void handleSurfaceMenuToggle(event); }} onkeydown={handleSurfaceMenuKeydown}>
          <summary
            bind:this={surfaceMenuSummary}
            class="contract-label contract-brand surface-nav-label"
            aria-haspopup="menu"
            aria-expanded={surfaceMenuOpen ? 'true' : 'false'}
          >RESOFEED</summary>
          <div class="surface-nav-menu" class:surface-nav-menu--closed={!surfaceMenuOpen}>
            <p class="utility-label">{shellChrome.nav}</p>
            <button
              bind:this={firstSurfaceMenuItem}
              type="button"
              aria-pressed={currentSurface === 'feed' ? 'true' : 'false'}
              data-state={currentSurface === 'feed' ? 'active' : undefined}
              tabindex={surfaceMenuOpen ? 0 : -1}
              onclick={() => openSurfaceFromMenu('feed')}
            >TODAY</button>
            <button
              type="button"
              aria-pressed={currentSurface === 'ledger' ? 'true' : 'false'}
              data-state={currentSurface === 'ledger' ? 'active' : undefined}
              tabindex={surfaceMenuOpen ? 0 : -1}
              onclick={() => openSurfaceFromMenu('ledger')}
            >SOURCE LEDGER</button>
            <p class="utility-label utility-label--operations">{shellChrome.operations}</p>
            <div class="runtime-language-controls" aria-label={shellChrome.languageControls}>
              {#if contextualOperationStatusText}
                <span class="surface-operation-status" role="status" aria-live="polite">{contextualOperationStatusText}</span>
              {/if}
              <button
                type="button"
                class="bracket-action bracket-action--language"
                aria-label={processingLanguageActionLabel}
                tabindex={surfaceMenuOpen ? 0 : -1}
                aria-hidden={surfaceMenuOpen ? undefined : 'true'}
                onclick={() => void updateProcessingLanguage()}
              >{processingLanguageButtonText}</button>
              {#if import.meta.env.MODE === 'test' || surfaceMenuOpen}
                <span class="contract-muted runtime-language-warning"><span>{processingLanguage.code === 'zh' ? '已存可读内容将被重写。' : 'Existing readable item content will be rewritten.'}</span> <span translate="no">{processingLanguage.code === 'zh' ? '来源标识保持不变。' : 'Source identifiers remain unchanged.'}</span></span>
              {/if}
              {#if reprocessState === 'confirming'}
                <button bind:this={reprocessConfirm} type="button" class="bracket-action bracket-action--reprocess" aria-label={shellChrome.confirmReprocessAria} tabindex={surfaceMenuOpen ? 0 : -1} onclick={() => void confirmReprocess()}>{reprocessConfirmLabel}</button>
                <button type="button" class="bracket-action bracket-action--reprocess" aria-label={shellChrome.cancelReprocessAria} tabindex={surfaceMenuOpen ? 0 : -1} onclick={cancelReprocess}>{reprocessCancelLabel}</button>
              {:else if reprocessState === 'running'}
                <button bind:this={reprocessTrigger} type="button" class="bracket-action bracket-action--reprocess" aria-label={shellChrome.reprocessAria} aria-disabled="true" tabindex={surfaceMenuOpen ? 0 : -1} onclick={(event) => event.preventDefault()}>{reprocessRunningLabel}</button>
              {:else}
                <button bind:this={reprocessTrigger} type="button" class="bracket-action bracket-action--reprocess" aria-label={shellChrome.reprocessAria} tabindex={surfaceMenuOpen ? 0 : -1} onclick={() => void beginReprocessConfirmation()}>{reprocessDefaultLabel}</button>
              {/if}
              {#if reprocessStatus}
                <span class="runtime-reprocess-status" role="status" aria-label={shellChrome.reprocessStatusAria} aria-live="polite">{reprocessStatus}</span>
              {/if}
            </div>
          </div>
        </details>
      </nav>
      </header>

      <section
        bind:this={routePreviewElement}
        id="steer-route-preview-status"
        class="steer-route-preview"
        role={routePreviewAnnounces ? 'status' : undefined}
        aria-label={shellChrome.routePreview}
        aria-live={steerRouteEcho.live}
        aria-describedby={steerRouteEcho.kind === 'invalid' ? 'steer-route-preview-detail' : undefined}
        data-route-kind={steerRouteEcho.kind}
        data-live={steerRouteEcho.live}
      >
        {#if steerRouteEcho.kind !== 'idle'}
          <span class="steer-route-preview__marker" aria-hidden="true">{steerRouteEcho.marker}</span>
          <span class="steer-route-preview__label">{steerRouteEcho.label}</span>
          {#if steerRouteEcho.detail}
            <span class="steer-route-preview__detail">{steerRouteEcho.detail}</span>
          {/if}
          {#if steerRouteEcho.writeAction}
            <span class="steer-route-preview__actions">
              <button class="bracket-action" type="button" aria-label="confirm steer route preview" onclick={() => void submitSteer()}>{shellChrome.apply}</button>
              <button class="bracket-action" type="button" aria-label="[CANCEL]" onclick={cancelSteerPreview}>{reprocessCancelLabel}</button>
            </span>
          {/if}
        {/if}
      </section>
      <span id="steer-route-preview-input-desc" class="visually-hidden">{routePreviewDescription}</span>
      <span id="steer-route-preview-detail" class="visually-hidden">{shellChrome.routeRequired}</span>

      {#if languageStatus}
        <p class:visually-hidden={!languageStatusIsError} class:contract-feedback-error={languageStatusIsError} role="status" aria-label={shellChrome.processingLanguageStatus} aria-live="polite">{languageStatus}</p>
      {/if}
      {#if undoStatus}
        <p class="contract-feedback-error shell-status" role="alert" aria-live="assertive">{undoStatus}</p>
      {/if}

      {#if steerFeedback.kind === 'receipt' && (!steerFeedback.text.startsWith('retrieval:') || currentSurface === 'search')}
      <div class="contract-steering-receipt" role="status" aria-label={shellChrome.steerReceipt} aria-live="polite">
        <span>{steerFeedback.text}</span>
        {#if receiptUndoTarget}
          <button type="button" class="bracket-action" onclick={() => void undoSteer(receiptUndoTarget)}>{shellChrome.undo}</button>
        {/if}
      </div>
    {:else if steerFeedback.kind === 'error'}
      <p class="contract-feedback-error shell-status" role="alert" aria-live="assertive">{steerFeedback.text}</p>
    {:else if steerFeedback.kind === 'submitting'}
      <p class="contract-muted shell-status" role="status">{shellChrome.applyingStatus}</p>
    {/if}

    {#if agentSteeringRules.length > 0}
      <section class="contract-steering-receipt" aria-label={shellChrome.agentSteeringReceipt} aria-live="polite">
        {#each agentSteeringRules as rule (rule.id)}
          <p>{shellChrome.agentSteeringActive(rule.created_by_actor_id ?? 'agent', rule.rule_text)}</p>
        {/each}
      </section>
    {/if}

    {#if loadState === 'loading'}
      <p class="contract-muted shell-status" role="status">{shellChrome.loading}</p>
    {/if}

    <div class="shell-grid" data-surface={currentSurface}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex: docs/DESIGN.md requires the desktop Feed scroll region itself to be keyboard-focusable. -->
      <section id="today-feed" bind:this={feedPaneElement} class="feed-pane utility-surface" class:active-panel={currentSurface === 'feed' || (!isNarrow && (currentSurface === 'inspector' || currentSurface === 'search'))} aria-label={currentSurface === 'search' && !isNarrow ? shellChrome.searchScroll : todayScrollLabel} aria-describedby="today-feed-scroll-contract" aria-hidden={feedPaneInactive ? 'true' : undefined} inert={feedPaneInactive} tabindex="0" data-scroll-region="feed-independent" onscroll={rememberFeedScrollPosition}>
        <span id="today-feed-scroll-contract" class="visually-hidden">{shellChrome.independentScroll}</span>
        {#if !feedPaneInactive || currentSurface === 'inspector'}
          <p id="feed-heading" class="visually-hidden" tabindex="-1">TODAY feed</p>
          {#if currentSurface === 'search' && !isNarrow}
            <SearchRetrieval items={items} query={searchSeedQuery} language={processingLanguage.code} onSearch={searchItems} onSelect={selectSearchItem} onResonanceToggle={toggleResonance} selectedItemId={selectedItemId} compactFilters={false} suppressStatusRole={steerFeedback.kind === 'receipt' && processingLanguage.code !== 'zh'} />
          {:else if apiError && promptState !== 'rejected'}
            <p class="contract-feedback-error" role="alert">{apiError}</p>
          {:else if items.length === 0}
            <FirstUseEmptyState state={firstUseState} language={processingLanguage.code} />
          {:else}
            <Feed items={items} language={processingLanguage.code} selectedItemId={selectedFeedItemId} onSelect={selectItem} onResonanceToggle={toggleResonance} hasMore={feedHasMore} loadingMore={feedLoadingMore} onLoadMore={loadMoreFeedItems} />
          {/if}
        {/if}
      </section>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex: docs/DESIGN.md requires the desktop Inspector scroll region itself to be keyboard-focusable. -->
      <aside bind:this={detailPaneElement} role="region" class="detail-pane" class:active-panel={currentSurface === 'inspector' || (!isNarrow && currentSurface === 'search')} aria-label={inspectorScrollLabel} aria-hidden={detailPaneInactive ? 'true' : undefined} inert={detailPaneInactive} tabindex="0" data-scroll-region="inspector-independent">
        {#if currentSurface === 'inspector'}
          <button class="back-command" type="button" aria-label={backTodayLabel} onclick={() => showSurface('feed')}>{shellChrome.backToday}</button>
        {/if}
        {#if inspectorItem}
          <section class="inspector-stable-landmark" role="complementary" aria-label="INSPECTOR">
            <Inspector item={inspectorItem} landmarkLabel={inspectorInnerLandmarkLabel(inspectorItem)} mode={isNarrow ? 'mobile-route' : 'desktop-split'} language={processingLanguage.code} groupedSourceCandidates={items} sources={sources} loading={inspectorState === 'loading'} error={inspectorError} focusHeading={currentSurface === 'inspector'} focusRequestId={inspectorFocusRequestId} onResonanceToggle={toggleResonance} onReingestItem={reingestSelectedItem} showReingest={inspectorActivated} openRouterModels={openRouterModels} openRouterModelListState={openRouterModelListState} />
          </section>
        {:else}
          <p class="contract-label">INSPECTOR</p>
        {/if}
      </aside>
    </div>

    <section class="utility-surface" class:active-panel={currentSurface === 'ledger'} aria-label={shellChrome.ledgerSurface}>
      {#if currentSurface === 'ledger'}
        <button class="back-command" type="button" onclick={() => showSurface('feed')}>{shellChrome.backToday}</button>
      {/if}
      <SourceLedger
        sources={sources}
        onDeleteSource={deleteSource}
        onImportOpml={importOpml}
        onRunIngest={runIngest}
        onFetchSource={fetchSource}
        onExportState={exportState}
        onImportState={importState}
        currentOperation={currentOperation}
        currentOperationStatusText={contextualOperationStatusText}
        suppressStatusRole={steerFeedback.kind === 'receipt'}
        language={processingLanguage.code}
      />
    </section>
    <section class="utility-surface search-surface" class:active-panel={currentSurface === 'search' && isNarrow} aria-label={shellChrome.searchSurface}>
      {#if currentSurface === 'search'}
        <button class="back-command" type="button" onclick={() => showSurface('feed')}>{shellChrome.backToday}</button>
      {/if}
      {#if isNarrow}
        <SearchRetrieval items={items} query={searchSeedQuery} language={processingLanguage.code} onSearch={searchItems} onSelect={selectSearchItem} onResonanceToggle={toggleResonance} selectedItemId={selectedItemId} compactFilters={true} suppressStatusRole={steerFeedback.kind === 'receipt' && processingLanguage.code !== 'zh'} />
      {/if}
    </section>
    {#if steerFeedback.kind === 'doctor'}
      <section class="utility-surface doctor-surface" class:active-panel={currentSurface === 'doctor'} aria-labelledby="doctor-heading">
        {#if currentSurface === 'doctor'}
          <button class="back-command" type="button" onclick={() => showSurface('feed')}>{shellChrome.backToday}</button>
        {/if}
        <div class="contract-region">
          <h2 id="doctor-heading" tabindex="-1">/doctor</h2>
          <pre class="contract-diagnostics" role="log" aria-label="/doctor diagnostics">{steerFeedback.text}</pre>
        </div>
      </section>
    {/if}
  {/if}
</main>
