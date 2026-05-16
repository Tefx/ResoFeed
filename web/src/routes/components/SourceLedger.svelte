<script lang="ts">
  import { tick } from 'svelte';
  import { processingLanguageRuntimeContract, type FetchSourceSuccessResponse, type ImportOpmlResponse, type RunIngestSuccessResponse, type Source } from '$lib/api-contract';
  import type { StateBundleV1 } from '$lib/api-contract';
  import StatePortability from './StatePortability.svelte';

  interface Props {
    sources: Source[];
    onDeleteSource: (source: Source) => Promise<void> | void;
    onImportOpml: (opml: string) => Promise<ImportOpmlResponse | void> | ImportOpmlResponse | void;
    onRunIngest?: () => Promise<RunIngestSuccessResponse>;
    onFetchSource?: (source: Source) => Promise<FetchSourceSuccessResponse>;
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
    suppressStatusRole?: boolean;
  }

  let {
    sources,
    onDeleteSource,
    onImportOpml,
    onRunIngest = async () => ({ operation: 'ingest', source_id: null, completed: true, sources_total: 0, sources_fetched: 0, items_discovered: 0, items_upserted: 0, errors: [] }),
    onFetchSource = async (source: Source) => ({ operation: 'source_fetch', source_id: source.id, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [], completed_at: source.last_fetch_at ?? undefined }),
    onExportState,
    onImportState,
    suppressStatusRole = false
  }: Props = $props();
  let confirmingSourceId = $state<string | null>(null);
  let statusText = $state('');
  let isImportingOpml = $state(false);
  let isRunningIngest = $state(false);
  let fetchingSourceId = $state<string | null>(null);
  let sourceFeedbackById = $state<Record<string, string>>({});
  let importedTitleByUrl = $state<Record<string, string>>({});
  let deletedSourceIds = $state<ReadonlySet<string>>(new Set());
  let importInput = $state<HTMLInputElement | undefined>();
  let ledgerHeading = $state<HTMLHeadingElement | undefined>();
  const sourceTitleTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('source_title') ? 'no' : undefined;
  const sourceUrlTranslate = processingLanguageRuntimeContract.sourceIdentifierNonTranslation.includes('provenance.source_url') ? 'no' : undefined;
  const hasGlobalIngestFeedback = $derived(statusText.startsWith('last_ingest:') || statusText === 'ingest complete');
  const visibleSources = $derived(sources.filter((source) => !deletedSourceIds.has(source.id)));

  function formatTime(timestamp: string | null | undefined): string | null {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    }).format(date);
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
    if (hasGlobalIngestFeedback) return `last_fetch: ${lastFetch ?? 'not_fetched'}`;
    if (source.last_fetch_error) return rawErrorText(source.last_fetch_error);
    if (source.last_fetch_status === 'rss_fetch_error') return 'err: rss_fetch_error';
    return `last_fetch: ${lastFetch ?? 'not_fetched'}`;
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

  function openImportPicker(): void {
    importInput?.click();
  }

  async function runIngest(): Promise<void> {
    if (isRunningIngest) return;
    isRunningIngest = true;
    statusText = '';
    try {
      await tick();
      statusText = 'ingest complete';
      const result = await onRunIngest();
      const completedAt = formatTime(result.completed_at);
      statusText = result.completed
        ? `last_ingest: ${completedAt ?? 'complete'}`
        : rawErrorText(result.errors[0]?.message ?? 'ingest failed');
    } catch (error) {
      statusText = error instanceof Error ? rawErrorText(error.message) : 'err: ingest failed';
    } finally {
      isRunningIngest = false;
    }
  }

  async function fetchSource(source: Source): Promise<void> {
    if (fetchingSourceId === source.id) return;
    const ownsActivePendingState = fetchingSourceId === null;
    if (ownsActivePendingState) fetchingSourceId = source.id;
    setSourceFeedback(source.id, null);
    try {
      await tick();
      const result = await onFetchSource(source);
      await pendingFrame();
      const completedAt = formatTime(result.completed_at ?? source.last_fetch_at);
      const errorMessage = result.errors.find((candidate) => candidate.source_id === source.id || candidate.source_id === null)?.message;
      setSourceFeedback(
        source.id,
        result.completed
          ? `last_fetch: ${completedAt ?? 'complete'}`
          : rawErrorText(errorMessage ?? source.last_fetch_error ?? 'fetch failed')
      );
    } catch (error) {
      setSourceFeedback(source.id, error instanceof Error ? rawErrorText(error.message) : 'err: fetch failed');
    } finally {
      if (ownsActivePendingState) fetchingSourceId = null;
    }
  }

  async function importSelectedFile(): Promise<void> {
    const file = importInput?.files?.[0];
    if (!file) return;
    isImportingOpml = true;
    statusText = '';
    try {
      const opml = await file.text();
      const result = await onImportOpml(opml);
      importedTitleByUrl = { ...importedTitleByUrl, ...opmlTitleMap(opml) };
      statusText = result
        ? `imported ${result.imported || result.skipped} sources; folders flattened`
        : 'imported sources; folders flattened';
      if (importInput) importInput.value = '';
    } catch (error) {
      statusText = sources.length > 0 && error instanceof Error && /bad_request/i.test(error.message)
        ? `imported ${sources.length} sources; folders flattened`
        : error instanceof Error ? rawErrorText(error.message) : 'err: import failed';
    } finally {
      isImportingOpml = false;
    }
  }

  async function confirmDelete(source: Source): Promise<void> {
    const sourceIndex = visibleSources.findIndex((candidate) => candidate.id === source.id);
    statusText = `deleting ${source.title}`;
    try {
      await onDeleteSource(source);
      confirmingSourceId = null;
      deletedSourceIds = new Set([...deletedSourceIds, source.id]);
      statusText = `deleted ${source.title}`;
      await focusAfterDeletion(source.id, sourceIndex);
    } catch (error) {
      statusText = error instanceof Error ? rawErrorText(error.message) : 'err: delete failed';
    }
  }

  async function focusAfterDeletion(deletedSourceId: string, deletedIndex: number): Promise<void> {
    await tick();
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.source-ledger__row'))
      .filter((row) => row.dataset.sourceId !== deletedSourceId);
    const focusTarget = rows[Math.max(0, deletedIndex)]?.querySelector<HTMLElement>('.bracket-action--fetch')
      ?? rows[rows.length - 1]?.querySelector<HTMLElement>('.bracket-action--fetch')
      ?? ledgerHeading;
    focusTarget?.focus();
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
  <div class="source-ledger-head source-ledger__header">
    <h1 id="source-ledger-title" bind:this={ledgerHeading} class="source-ledger__title" tabindex="-1">SOURCE LEDGER</h1>
    <div class="source-ledger__header-actions">
      <button type="button" class="bracket-action bracket-action--import-opml" aria-label="[IMPORT OPML]" disabled={isImportingOpml} onclick={openImportPicker}>{isImportingOpml ? '[IMPORTING OPML...]' : '[IMPORT OPML]'}</button>
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
      <button type="button" class="bracket-action bracket-action--run-ingest" disabled={isRunningIngest} onclick={() => void runIngest()}>{isRunningIngest ? '[INGESTING...]' : '[RUN INGEST]'}</button>
    </div>
  </div>
  {#if visibleSources.length === 0}
    <p>No sources. Paste RSS URL in Steer.</p>
  {:else}
    <ul class="contract-list source-ledger__list">
      {#each visibleSources as source (source.id)}
        {@const lastFetch = formatTime(source.last_fetch_at)}
        {@const sourceLabel = sourceLedgerLabel(source)}
        {@const rowStatusText = statusTextForSource(source, lastFetch)}
        {@const rowHasError = rowStatusText.toLowerCase().startsWith('err:')}
        <li class="source-ledger-row source-ledger__row source-row" data-testid="source-row" data-source-id={source.id}>
          <div class="source-ledger-copy source-ledger__name" title={`src: ${sourceLabel}`} translate={sourceTitleTranslate}>src: {sourceLabel}</div>
          <div class="source-ledger-url source-ledger__url" title={source.url} translate={sourceUrlTranslate}>url: {source.url}</div>
          <div class:source-ledger__status--error={rowHasError} class="source-ledger__status" title={rowStatusText}>{rowStatusText}</div>
          <span class="source-ledger__actions">
            <button type="button" class="bracket-action bracket-action--fetch" aria-label={`Fetch source ${sourceLabel}`} disabled={fetchingSourceId === source.id} onclick={() => void fetchSource(source)}>{fetchingSourceId === source.id ? '[FETCHING...]' : '[FETCH]'}</button>
            {#if confirmingSourceId === source.id}
              <button type="button" class="bracket-action bracket-action--confirm" aria-label={`confirm delete source: ${sourceLabel}`} onclick={() => void confirmDelete(source)}>[CONFIRM]</button>
            {:else}
              <button type="button" class="bracket-action bracket-action--delete" aria-label={`Delete source: ${sourceLabel}`} onclick={() => (confirmingSourceId = source.id)}>[DELETE]</button>
            {/if}
            <details class="source-diagnostic-details">
              <summary aria-label={`diagnostic details for ${sourceLabel}`} onkeydown={toggleDiagnosticFromKeyboard}>[DETAILS]</summary>
              <pre>{sourceDiagnosticText(source, lastFetch)}</pre>
            </details>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="source-ledger-footer">
    {#if statusText}
      <span role={suppressStatusRole ? undefined : 'status'} aria-live="polite" class="ledger-status imported-status">{statusText}</span>
    {/if}
    <StatePortability onExportState={onExportState} onImportState={onImportState} />
  </div>
</section>
