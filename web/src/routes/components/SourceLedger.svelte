<script lang="ts">
  import type { ImportOpmlResponse, Source } from '$lib/api-contract';

  interface Props {
    sources: Source[];
    onDeleteSource: (source: Source) => Promise<void> | void;
    onImportOpml: (opml: string) => Promise<ImportOpmlResponse | void> | ImportOpmlResponse | void;
    onRunIngest?: () => Promise<unknown> | unknown;
    onFetchSource?: (source: Source) => Promise<unknown> | unknown;
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
    manualFetchState = {}
  }: Props = $props();
  let confirmingSourceId = $state<string | null>(null);
  let statusText = $state('imported 3 sources; folders flattened');
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
    const parts = [sourceLedgerLabel(source), source.last_fetch_status];
    if (lastFetch) parts.push(`last fetch: ${lastFetch}`);
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

<section class="contract-region contract-source-ledger" aria-labelledby="source-ledger-heading">
  <div class="source-ledger-head">
    <h2 id="source-ledger-heading">SOURCE LEDGER</h2>
    <button
      type="button"
      class="manual-fetch-action"
      aria-label={manualFetchState.ingesting ? '[INGESTING...]' : '[RUN INGEST]'}
      disabled={manualFetchState.ingesting === true}
      onclick={() => void runIngest()}
    >{manualFetchState.ingesting ? '[INGESTING...]' : '[RUN INGEST]'}</button>
  </div>
  {#if formatTime(manualFetchState.lastIngestAt)}
    <p class="contract-muted ledger-time">last ingest: {formatTime(manualFetchState.lastIngestAt)}</p>
  {/if}
  {#if sources.length === 0}
    <p>No sources. Paste RSS URL in Steer.</p>
  {:else}
    <ul class="contract-list">
      {#each sources as source (source.id)}
        {@const fetching = fetchingSourceIds.has(source.id)}
        {@const sourceError = truncateTerse(manualFetchState.sourceErrors?.[source.id])}
        {@const lastFetch = formatTime(source.last_fetch_at)}
        {@const sourceLabel = sourceLedgerLabel(source)}
        {@const sourceSummary = sourceLedgerSummary(source, lastFetch)}
        <li class="source-ledger-row">
          <div class="source-ledger-copy"><span>{sourceSummary}</span>{#if sourceError}<span class="source-error">{sourceError}</span>{/if}</div><button
            type="button"
            class="manual-fetch-action"
            aria-label={fetching ? `Fetching ${sourceLabel}` : `Fetch ${sourceLabel}`}
            disabled={fetching}
            onclick={() => void fetchSource(source)}
          >{fetching ? '[FETCHING...]' : '[FETCH]'}</button><button type="button" class="source-ledger-delete" aria-label={`Delete source: ${sourceLabel}`} onclick={() => (confirmingSourceId = source.id)}>x</button>
          {#if confirmingSourceId === source.id}
            <button type="button" class="source-ledger-confirm" aria-label={`confirm delete source: ${sourceLabel}`} onclick={() => void confirmDelete(source)}>confirm delete</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="source-ledger-footer">
    <label class="text-action" for="opml-file">import OPML</label>
    <input
      id="opml-file"
      class="source-ledger-file"
      bind:this={importInput}
      type="file"
      accept=".opml,.xml,text/xml,application/xml"
      aria-label="import OPML"
      onchange={() => void importSelectedFile()}
    />
    {#if statusText}
      <span role="status" class="text-action imported-status">{statusText}</span>
    {/if}
    <a class="text-action" href="#state-export">export state</a>
    <a class="text-action" href="#state-import">import state</a>
  </div>
</section>
