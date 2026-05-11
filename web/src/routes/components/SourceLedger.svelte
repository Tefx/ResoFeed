<script lang="ts">
  import type { ImportOpmlResponse, Source } from '$lib/api-contract';
  import type { StateBundleV1 } from '$lib/api-contract';
  import StatePortability from './StatePortability.svelte';

  interface Props {
    sources: Source[];
    onDeleteSource: (source: Source) => Promise<void> | void;
    onImportOpml: (opml: string) => Promise<ImportOpmlResponse | void> | ImportOpmlResponse | void;
    onRunIngest?: () => Promise<unknown> | unknown;
    onFetchSource?: (source: Source) => Promise<unknown> | unknown;
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
    suppressStatusRole?: boolean;
    manualFetchState?: {
      readonly ingesting?: boolean;
      readonly fetchingSourceIds?: readonly string[];
      readonly lastIngestAt?: string | null;
      readonly sourceErrors?: Readonly<Record<string, string>>;
    };
  }

  let {
    sources,
    onDeleteSource,
    onImportOpml,
    onRunIngest,
    onFetchSource,
    onExportState,
    onImportState,
    suppressStatusRole = false,
    manualFetchState = {}
  }: Props = $props();
  let confirmingSourceId = $state<string | null>(null);
  let statusText = $state('');
  let importInput = $state<HTMLInputElement | undefined>();

  const fetchingSourceIds = $derived(new Set(manualFetchState.fetchingSourceIds ?? []));

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

  function truncateTerse(text: string | undefined): string | null {
    if (!text) return null;
    if (text.length <= 72) return text;
    return text.slice(0, 71).trimEnd() + '…';
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
    const title = source.title.trim();
    return title || compactSourceUrl(source.url);
  }

  function sourceLedgerSummary(source: Source, lastFetch: string | null): string {
    const parts = [`src: ${sourceLedgerLabel(source)}`, `status: ${source.last_fetch_status}`, `last_fetch: ${lastFetch ?? 'not_fetched'}`];
    return parts.join(' · ');
  }

  async function importSelectedFile(): Promise<void> {
    const file = importInput?.files?.[0];
    if (!file) return;
    statusText = 'importing OPML';
    try {
      const result = await onImportOpml(await file.text());
      statusText = result
        ? `imported ${result.imported || result.skipped} sources; folders flattened`
        : 'imported sources; folders flattened';
      if (importInput) importInput.value = '';
    } catch (error) {
      statusText = error instanceof Error ? error.message : 'err: import failed';
    }
  }

  async function confirmDelete(source: Source): Promise<void> {
    statusText = `deleting ${source.title}`;
    try {
      await onDeleteSource(source);
      confirmingSourceId = null;
      statusText = `deleted ${source.title}`;
    } catch (error) {
      statusText = error instanceof Error ? error.message : 'err: delete failed';
    }
  }

  async function runIngest(): Promise<void> {
    if (!onRunIngest || manualFetchState.ingesting) return;
    await onRunIngest();
  }

  async function fetchSource(source: Source): Promise<void> {
    if (!onFetchSource || fetchingSourceIds.has(source.id)) return;
    await onFetchSource(source);
  }
</script>

<section class="contract-region contract-source-ledger source-ledger" data-testid="source-ledger" aria-labelledby="source-ledger-heading">
  <div class="source-ledger-head source-ledger__header">
    <h2 id="source-ledger-heading" class="source-ledger__title" tabindex="-1">SOURCE LEDGER</h2>
    <button
      type="button"
      class="manual-fetch-action"
      aria-label={manualFetchState.ingesting ? '[INGESTING...]' : '[RUN INGEST]'}
      disabled={manualFetchState.ingesting === true}
      onclick={() => void runIngest()}
    >{manualFetchState.ingesting ? '[INGESTING...]' : '[RUN INGEST]'}</button>
  </div>
  {#if formatTime(manualFetchState.lastIngestAt)}
    <p class="contract-muted ledger-time">last_ingest: {formatTime(manualFetchState.lastIngestAt)}</p>
  {/if}
  {#if sources.length === 0}
    <p>No sources. Paste RSS URL in Steer.</p>
  {:else}
    <ul class="contract-list source-ledger__list">
      {#each sources as source (source.id)}
        {@const fetching = fetchingSourceIds.has(source.id)}
        {@const fullSourceError = manualFetchState.sourceErrors?.[source.id]}
        {@const sourceError = truncateTerse(fullSourceError)}
        {@const lastFetch = formatTime(source.last_fetch_at)}
        {@const sourceLabel = sourceLedgerLabel(source)}
        {@const sourceSummary = sourceLedgerSummary(source, lastFetch)}
        <li class="source-ledger-row source-ledger__row source-row" data-testid="source-row">
          <div class="source-ledger-copy"><span>{sourceSummary}</span>{#if sourceError}<span class="source-error" title={fullSourceError}>{sourceError}</span>{/if}</div>
          <div class="source-ledger-url source-ledger__url" title={source.url}>url: {source.url}</div>
          <span class="source-ledger__actions"><button
            type="button"
            class="manual-fetch-action"
            aria-label={fetching ? `Fetching ${sourceLabel}` : `Fetch ${sourceLabel}`}
            disabled={fetching}
            onclick={() => void fetchSource(source)}
          >{fetching ? '[FETCHING...]' : '[FETCH]'}</button><button type="button" class="source-ledger-delete" aria-label={`Delete source: ${sourceLabel}`} onclick={() => (confirmingSourceId = source.id)}>[DELETE]</button></span>
          {#if confirmingSourceId === source.id}
            <button type="button" class="source-ledger-confirm" aria-label={`confirm delete source: ${sourceLabel}`} onclick={() => void confirmDelete(source)}>[CONFIRM DELETE]</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="source-ledger-footer">
    <label class="bracket-action" for="opml-file">[IMPORT OPML]</label>
    <input
      id="opml-file"
      class="source-ledger-file visually-hidden"
      bind:this={importInput}
      type="file"
      accept=".opml,.xml,text/xml,application/xml"
      aria-label="import OPML"
      onchange={() => void importSelectedFile()}
    />
    {#if statusText}
      <span role={suppressStatusRole ? undefined : 'status'} aria-live="polite" class="ledger-status imported-status">{statusText}</span>
    {/if}
    <StatePortability onExportState={onExportState} onImportState={onImportState} />
  </div>
</section>
