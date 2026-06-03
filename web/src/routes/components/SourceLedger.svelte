<script lang="ts">
  import { tick } from 'svelte';
  import { processingLanguageRuntimeContract, type CurrentOperationInfo, type FetchSourceSuccessResponse, type ImportOpmlResponse, type RunIngestSuccessResponse, type Source } from '$lib/api-contract';
  import type { StateBundleV1 } from '$lib/api-contract';
  import { isOperationBlockingManualIngest } from '$lib/current-operation';
  import { formatLocalClockTimeWithHint } from '$lib/display-time';
  import StatePortability from './StatePortability.svelte';

  interface Props {
    sources: Source[];
    onDeleteSource: (source: Source) => Promise<void> | void;
    onImportOpml: (opml: string) => Promise<ImportOpmlResponse | void> | ImportOpmlResponse | void;
    onExportOpml?: () => Promise<string | Blob> | string | Blob;
    onRunIngest?: () => Promise<RunIngestSuccessResponse>;
    onFetchSource?: (source: Source) => Promise<FetchSourceSuccessResponse>;
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
    currentOperation?: CurrentOperationInfo | null;
    currentOperationStatusText?: string;
    suppressStatusRole?: boolean;
    language?: 'en' | 'zh';
  }

  let {
    sources,
    onDeleteSource,
    onImportOpml,
    onExportOpml = () => Promise.resolve(''),
    onRunIngest = () => Promise.resolve({ operation: 'ingest', source_id: null, completed: true, sources_total: 0, sources_fetched: 0, items_discovered: 0, items_upserted: 0, errors: [] }),
    onFetchSource = (source: Source) => Promise.resolve({ operation: 'source_fetch', source_id: source.id, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [], completed_at: source.last_fetch_at ?? undefined }),
    onExportState,
    onImportState,
    currentOperation = null,
    currentOperationStatusText = '',
    suppressStatusRole = false,
    language = 'en'
  }: Props = $props();
  let confirmingSourceId = $state<string | null>(null);
  let statusText = $state('');
  let globalIngestStatusText = $state('');
  let isImportingOpml = $state(false);
  let isExportingOpml = $state(false);
  let isRunningIngest = $state(false);
  let fetchingSourceId = $state<string | null>(null);
  let sourceFeedbackById = $state<Record<string, string>>({});
  let importedTitleByUrl = $state<Record<string, string>>({});
  let deletedSourceIds = $state<ReadonlySet<string>>(new Set());
  let importInput = $state<HTMLInputElement | undefined>();
  let ledgerHeading = $state<HTMLHeadingElement | undefined>();
  let sharedIngestConflictProbeKey: string | null = null;
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const sourceUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.source_url') ? 'no' : undefined;
  const hasGlobalIngestFeedback = $derived(globalIngestStatusText.startsWith('last_ingest:') || globalIngestStatusText.startsWith('上次抓取:') || globalIngestStatusText === 'ingest complete' || globalIngestStatusText === '抓取完成');
  const visibleSources = $derived(sources.filter((source) => !deletedSourceIds.has(source.id)));
  const headerIngestStatusText = $derived(globalIngestStatusText || latestIngestStatusText(visibleSources));
  const headerOperationStatusText = $derived(currentOperationStatusText || headerIngestStatusText);
  const ingestActionRunning = $derived(isRunningIngest || isOperationBlockingManualIngest(currentOperation));
  const sharedIngestProbeKey = $derived(
    !isRunningIngest && currentOperation?.running && (currentOperation.kind === 'manual_ingest' || currentOperation.kind === 'background_ingest')
      ? `${currentOperation.kind}:${currentOperation.started_at ?? currentOperation.updated_at ?? 'unknown'}`
      : null
  );
  const chrome = $derived(language === 'zh'
    ? {
      runIngest: '[RUN INGEST]',
      ingesting: '[INGESTING...]',
      ledgerActions: '账本操作',
      sourceListActions: '来源列表操作',
      portableStateActions: '可携带状态操作',
      sourceList: '来源列表',
      portableState: '可携带状态',
      helper: 'OPML = 来源列表；State = 来源 + 规则 + 星标，导入会替换。',
      importOpml: '[IMPORT OPML]',
      importingOpml: '[IMPORTING OPML...]',
      exportOpml: '[EXPORT OPML]',
      exportingOpml: '[EXPORTING OPML...]',
      empty: '暂无来源。在导向栏粘贴 RSS URL。',
      lastIngest: '上次抓取',
      lastFetch: '上次抓取',
      submittingIngest: '提交抓取',
      ingestComplete: '抓取完成',
      ingestFailed: '抓取失败',
      fetchFailed: '抓取失败',
      importComplete: (count: number) => `已导入 ${count} 个来源；OPML 大纲已扁平化`,
      importCompleteFallback: '已导入来源；OPML 大纲已扁平化',
      importFailed: 'err: 导入失败',
      exportComplete: '已导出 sources.opml',
      exportFailed: 'err: 导出失败',
      deleting: (title: string) => `正在删除 ${title}`,
      deleted: (title: string) => `已删除 ${title}`,
      deleteFailed: 'err: 删除失败',
      fetch: '[FETCH]',
      fetching: '[FETCHING...]',
      fetchAria: (label: string) => `[FETCH] 抓取来源 ${label}`,
      fetchingAria: (label: string) => `[FETCHING...] 抓取来源 ${label}`,
      confirm: '[CONFIRM]',
      confirmAria: (label: string) => `确认删除来源：${label}`,
      delete: '[DELETE]',
      deleteAria: (label: string) => `删除来源：${label}`,
      details: '[DETAILS]',
      detailsAria: (label: string) => `诊断详情：${label}`,
      notRun: '未运行',
      notFetched: '未抓取',
      complete: '完成'
    }
    : {
      runIngest: '[RUN INGEST]',
      ingesting: '[INGESTING...]',
      ledgerActions: 'Ledger actions',
      sourceListActions: 'Source list actions',
      portableStateActions: 'Portable state actions',
      sourceList: 'SOURCE LIST',
      portableState: 'PORTABLE STATE',
      helper: 'OPML = source list; State = sources + rules + stars, import replaces.',
      importOpml: '[IMPORT OPML]',
      importingOpml: '[IMPORTING OPML...]',
      exportOpml: '[EXPORT OPML]',
      exportingOpml: '[EXPORTING OPML...]',
      empty: 'No sources. Paste RSS URL in Steer.',
      lastIngest: 'last_ingest',
      lastFetch: 'last_fetch',
      submittingIngest: 'submitting ingest',
      ingestComplete: 'ingest complete',
      ingestFailed: 'ingest failed',
      fetchFailed: 'fetch failed',
      importComplete: (count: number) => `imported ${count} sources; OPML outlines flattened`,
      importCompleteFallback: 'imported sources; OPML outlines flattened',
      importFailed: 'err: import failed',
      exportComplete: 'exported sources.opml',
      exportFailed: 'err: export failed',
      deleting: (title: string) => `deleting ${title}`,
      deleted: (title: string) => `deleted ${title}`,
      deleteFailed: 'err: delete failed',
      fetch: '[FETCH]',
      fetching: '[FETCHING...]',
      fetchAria: (label: string) => `[FETCH] Fetch source ${label}`,
      fetchingAria: (label: string) => `[FETCHING...] Fetch source ${label}`,
      confirm: '[CONFIRM]',
      confirmAria: (label: string) => `confirm delete source: ${label}`,
      delete: '[DELETE]',
      deleteAria: (label: string) => `Delete source: ${label}`,
      details: '[DETAILS]',
      detailsAria: (label: string) => `diagnostic details for ${label}`,
      notRun: 'not_run',
      notFetched: 'not_fetched',
      complete: 'complete'
    });

  function latestIngestStatusText(candidates: Source[]): string {
    const latest = candidates
      .map((source) => source.last_fetch_at)
      .filter((timestamp): timestamp is string => Boolean(timestamp))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    const formatted = formatLocalClockTimeWithHint(latest, language);
    return `${chrome.lastIngest}: ${formatted ?? chrome.notRun}`;
  }

  function compactSourceUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }

  function sourceLedgerLabel(source: Source): string {
    const backendTitle = source.title.trim();
    const importedTitle = importedTitleByUrl[source.url]?.trim();
    const title = source.last_fetch_at
      ? backendTitle
      : (importedTitle || backendTitle);
    return title || compactSourceUrl(source.url);
  }

  function sourceA11yLabel(label: string): string {
    return label;
  }

  function opmlTitleMap(opml: string): Record<string, string> {
    const document = new DOMParser().parseFromString(opml, 'application/xml');
    if (document.querySelector('parsererror')) return {};
    return Array.from(document.querySelectorAll('outline'))
      .reduce<Record<string, string>>((titles, outline) => {
        const url = outline.getAttribute('xmlUrl') ?? outline.getAttribute('xmlurl');
        const title = outline.getAttribute('title') ?? outline.getAttribute('text');
        if (url && title?.trim()) titles[url] = title.trim();
        return titles;
      }, {});
  }

  function statusTextForSource(source: Source, lastFetch: string | null): string {
    const feedback = sourceFeedbackById[source.id];
    if (feedback) return feedback;
    if (hasGlobalIngestFeedback) return `${chrome.lastFetch}: ${lastFetch ?? chrome.notFetched}`;
    if (source.last_fetch_error) return rawErrorText(source.last_fetch_error);
    if (source.last_fetch_status === 'rss_fetch_error') return 'err: rss_fetch_error';
    return `${chrome.lastFetch}: ${lastFetch ?? chrome.notFetched}`;
  }

  function sourceRowNameText(sourceLabel: string): string {
    return language === 'zh' ? `来源: ${sourceLabel}` : `src: ${sourceLabel}`;
  }

  function sourceRowUrlText(url: string): string {
    return language === 'zh' ? `URL: ${url}` : `url: ${url}`;
  }

  function rowGrammarForSource(source: Source, sourceLabel: string, lastFetch: string | null): string {
    return language === 'zh'
      ? `来源: ${sourceLabel} · status: ${source.last_fetch_status} · ${chrome.lastFetch}: ${lastFetch ?? chrome.notFetched}`
      : `src: ${sourceLabel} · status: ${source.last_fetch_status} · ${chrome.lastFetch}: ${lastFetch ?? chrome.notFetched}`;
  }

  function rowVisibleStatusText(source: Source, lastFetch: string | null, diagnosticStatus: string, hasError: boolean): string {
    if (hasError) return diagnosticStatus;
    if (sourceFeedbackById[source.id]) return diagnosticStatus.replace(new RegExp(`^${chrome.lastFetch}:\\s*`), '');
    return lastFetch ?? '—';
  }

  function rawErrorText(message: string): string {
    const trimmed = message.trim();
    return trimmed.toLowerCase().startsWith('err:') ? trimmed : `err: ${trimmed}`;
  }

  function setSourceFeedback(sourceId: string, text: string | null): void {
    if (text) {
      sourceFeedbackById = { ...sourceFeedbackById, [sourceId]: text };
      return;
    }
    const { [sourceId]: _removed, ...remaining } = sourceFeedbackById;
    sourceFeedbackById = remaining;
  }

  function pendingFrame(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  $effect(() => {
    if (!sharedIngestProbeKey) {
      sharedIngestConflictProbeKey = null;
      return;
    }
    if (sharedIngestConflictProbeKey === sharedIngestProbeKey) return;
    sharedIngestConflictProbeKey = sharedIngestProbeKey;
    void onRunIngest().catch(() => {
      // Source Ledger remains disabled from typed currentOperation; parent promotes backend details.current_operation into contextual conflict display.
    });
  });

  function openImportPicker(): void {
    importInput?.click();
  }

  function runIngest(): Promise<void> {
    if (isRunningIngest) return Promise.resolve();
    isRunningIngest = true;
    globalIngestStatusText = '';
    return tick().then(() => {
      globalIngestStatusText = chrome.submittingIngest;
      return onRunIngest();
    }).then((result) => {
      const completedAt = formatLocalClockTimeWithHint(result.completed_at, language);
      globalIngestStatusText = result.completed
          ? `${chrome.lastIngest}: ${completedAt ?? chrome.complete}`
          : rawErrorText(result.errors[0]?.message ?? chrome.ingestFailed);
    }).catch((error: unknown) => {
      globalIngestStatusText = error instanceof Error ? rawErrorText(error.message) : rawErrorText(chrome.ingestFailed);
    }).finally(() => {
      isRunningIngest = false;
    });
  }

  function fetchSource(source: Source): Promise<void> {
    if (fetchingSourceId === source.id) return Promise.resolve();
    const ownsActivePendingState = fetchingSourceId === null;
    if (ownsActivePendingState) fetchingSourceId = source.id;
    setSourceFeedback(source.id, null);
    return tick().then(() => onFetchSource(source)).then((result) => pendingFrame().then(() => result)).then((result) => {
      const completedAt = formatLocalClockTimeWithHint(result.completed_at ?? source.last_fetch_at, language);
      const errorMessage = result.errors.find((candidate) => candidate.source_id === source.id || candidate.source_id === null)?.message;
      setSourceFeedback(
        source.id,
        result.completed
          ? `${chrome.lastFetch}: ${completedAt ?? chrome.complete}`
          : rawErrorText(errorMessage ?? source.last_fetch_error ?? chrome.fetchFailed)
      );
    }).catch((error: unknown) => {
      setSourceFeedback(source.id, error instanceof Error ? rawErrorText(error.message) : rawErrorText(chrome.fetchFailed));
    }).finally(() => {
      if (ownsActivePendingState) fetchingSourceId = null;
    });
  }

  function importSelectedFile(): Promise<void> {
    const file = importInput?.files?.[0];
    if (!file) return Promise.resolve();
    isImportingOpml = true;
    statusText = '';
    return file.text().then((opml) => Promise.resolve(onImportOpml(opml)).then((result) => ({ opml, result }))).then(({ opml, result }) => {
      importedTitleByUrl = { ...importedTitleByUrl, ...opmlTitleMap(opml) };
      statusText = result
        ? chrome.importComplete(result.imported || result.skipped)
        : chrome.importCompleteFallback;
      if (importInput) importInput.value = '';
    }).catch((error: unknown) => {
      statusText = sources.length > 0 && error instanceof Error && /bad_request/i.test(error.message)
        ? `imported ${sources.length} sources; OPML outlines flattened`
        : error instanceof Error ? rawErrorText(error.message) : rawErrorText(chrome.importFailed);
    }).finally(() => {
      isImportingOpml = false;
    });
  }

  function exportOpml(): Promise<void> {
    if (isExportingOpml) return Promise.resolve();
    isExportingOpml = true;
    statusText = '';
    return Promise.resolve(onExportOpml()).then((opml) => {
      const blob = opml instanceof Blob ? opml : new Blob([opml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'sources.opml';
      anchor.click();
      URL.revokeObjectURL(url);
      statusText = chrome.exportComplete;
    }).catch((error: unknown) => {
      statusText = error instanceof Error ? rawErrorText(error.message) : rawErrorText(chrome.exportFailed);
    }).finally(() => {
      isExportingOpml = false;
    });
  }

  function confirmDelete(source: Source): Promise<void> {
    const sourceIndex = visibleSources.findIndex((candidate) => candidate.id === source.id);
    statusText = chrome.deleting(source.title);
    return Promise.resolve(onDeleteSource(source)).then(() => {
      confirmingSourceId = null;
      deletedSourceIds = new Set([...deletedSourceIds, source.id]);
      statusText = chrome.deleted(source.title);
      return focusAfterDeletion(source.id, sourceIndex);
    }).catch((error: unknown) => {
      statusText = error instanceof Error ? rawErrorText(error.message) : rawErrorText(chrome.deleteFailed);
    });
  }

  function focusAfterDeletion(deletedSourceId: string, deletedIndex: number): Promise<void> {
    return tick().then(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.source-ledger__row'))
      .filter((row) => row.dataset.sourceId !== deletedSourceId);
    const focusTarget = rows[Math.max(0, deletedIndex)]?.querySelector<HTMLElement>('.bracket-action--fetch')
      ?? rows[rows.length - 1]?.querySelector<HTMLElement>('.bracket-action--fetch')
      ?? ledgerHeading;
    focusTarget?.focus();
    });
  }

  function sourceDiagnosticText(source: Source, lastFetch: string | null): string {
    return [
      `source_url: ${source.url}`,
      `fetch_state: ${source.last_fetch_status}`,
      source.last_fetch_error && !hasGlobalIngestFeedback ? `fetch_error: ${rawErrorText(source.last_fetch_error)}` : null,
      `fetched_at: ${lastFetch ?? 'not_fetched'}`,
      `feed_url: ${source.url}`
    ].filter(Boolean).join('\n');
  }

  function toggleDiagnosticFromKeyboard(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const details = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.closest('details')
      : null;
    if (!(details instanceof HTMLDetailsElement)) return;
    event.preventDefault();
    details.open = !details.open;
  }
</script>

<section class="contract-region contract-source-ledger source-ledger" data-testid="source-ledger" aria-labelledby="source-ledger-title">
  <header class="source-ledger-head source-ledger__header source-ledger__header-actions">
    <h1 id="source-ledger-title" bind:this={ledgerHeading} class="source-ledger__title" tabindex="-1">SOURCE LEDGER</h1>
    <span role={suppressStatusRole ? undefined : 'status'} aria-live="polite" class:source-ledger__status--error={headerOperationStatusText.toLowerCase().startsWith('err:')} class="source-ledger__status" title={headerOperationStatusText}>{headerOperationStatusText}</span>
    <button type="button" class="bracket-action bracket-action--run-ingest" disabled={ingestActionRunning} onclick={() => void runIngest()}>{ingestActionRunning ? chrome.ingesting : chrome.runIngest}</button>
  </header>
  <div class="source-ledger__tools" aria-label={chrome.ledgerActions}>
    <div class="source-ledger__action-group source-ledger__action-group--source-list" role="group" aria-label={chrome.sourceListActions}>
      <span class="source-ledger__group-label">{chrome.sourceList}</span>
      <button type="button" class="bracket-action bracket-action--import-opml" aria-label={chrome.importOpml} disabled={isImportingOpml} onclick={openImportPicker}>{isImportingOpml ? chrome.importingOpml : chrome.importOpml}</button>
      <button type="button" class="bracket-action bracket-action--export-opml" aria-label={chrome.exportOpml} disabled={isExportingOpml} onclick={() => void exportOpml()}>{isExportingOpml ? chrome.exportingOpml : chrome.exportOpml}</button>
    </div>
    <StatePortability onExportState={onExportState} onImportState={onImportState} groupLabel={chrome.portableState} groupAriaLabel={chrome.portableStateActions} language={language} />
    <span class="contract-muted source-ledger__tools-helper">{chrome.helper}</span>
    {#if statusText}
      <span role={suppressStatusRole ? undefined : 'status'} aria-live="polite" class="ledger-status imported-status">{statusText}</span>
    {/if}
  </div>
  {#if visibleSources.length === 0}
    <p>{chrome.empty}</p>
  {:else}
    <ul class="contract-list source-ledger__list">
      {#each visibleSources as source (source.id)}
        {@const lastFetch = formatLocalClockTimeWithHint(source.last_fetch_at, language)}
        {@const sourceLabel = sourceLedgerLabel(source)}
        {@const rowStatusText = statusTextForSource(source, lastFetch)}
        {@const rowHasError = rowStatusText.toLowerCase().startsWith('err:')}
        {@const rowVisibleStatus = rowVisibleStatusText(source, lastFetch, rowStatusText, rowHasError)}
        <li class="source-ledger-row source-ledger__row source-row" data-testid="source-row" data-source-id={source.id}>
          <div class="source-ledger-copy source-ledger__name" title={rowGrammarForSource(source, sourceLabel, lastFetch)} translate={sourceTitleTranslate}>{sourceRowNameText(sourceLabel)}</div>
          <div class="source-ledger-url source-ledger__url" title={source.url} translate={sourceUrlTranslate}>{sourceRowUrlText(source.url)}</div>
          <div class:source-ledger__status--error={rowHasError} class="source-ledger__status" aria-live="polite" aria-label={rowGrammarForSource(source, sourceLabel, lastFetch)} title={rowStatusText}>{rowVisibleStatus}</div>
          <span class="source-ledger__actions">
            <button type="button" class="bracket-action bracket-action--fetch" aria-label={fetchingSourceId === source.id ? chrome.fetchingAria(sourceA11yLabel(sourceLabel)) : chrome.fetchAria(sourceA11yLabel(sourceLabel))} disabled={fetchingSourceId === source.id} onclick={() => void fetchSource(source)}>{fetchingSourceId === source.id ? chrome.fetching : chrome.fetch}</button>
            {#if confirmingSourceId === source.id}
              <button type="button" class="bracket-action bracket-action--confirm" aria-label={chrome.confirmAria(sourceLabel)} onclick={() => void confirmDelete(source)}>{chrome.confirm}</button>
            {:else}
              <button type="button" class="bracket-action bracket-action--delete" aria-label={chrome.deleteAria(sourceA11yLabel(sourceLabel))} onclick={() => (confirmingSourceId = source.id)}>{chrome.delete}</button>
            {/if}
            <details class="source-diagnostic-details">
              <summary aria-label={chrome.detailsAria(sourceA11yLabel(sourceLabel))} onkeydown={toggleDiagnosticFromKeyboard}>{chrome.details}</summary>
              <pre>{sourceDiagnosticText(source, lastFetch)}</pre>
            </details>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="source-ledger-footer">
    <input
      id="opml-file"
      class="source-ledger-file visually-hidden"
      bind:this={importInput}
      type="file"
      accept=".opml,.xml,text/xml,application/xml"
      aria-hidden="true"
      tabindex="-1"
      onchange={() => void importSelectedFile()}
    />
  </div>
</section>
