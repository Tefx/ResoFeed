<script lang="ts">
  import type { ImportOpmlResponse, Source } from '$lib/api-contract';
  import type { StateBundleV1 } from '$lib/api-contract';
  import StatePortability from './StatePortability.svelte';

  interface Props {
    sources: Source[];
    onDeleteSource: (source: Source) => Promise<void> | void;
    onImportOpml: (opml: string) => Promise<ImportOpmlResponse | void> | ImportOpmlResponse | void;
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
    suppressStatusRole?: boolean;
  }

  let {
    sources,
    onDeleteSource,
    onImportOpml,
    onExportState,
    onImportState,
    suppressStatusRole = false
  }: Props = $props();
  let confirmingSourceId = $state<string | null>(null);
  let statusText = $state('');
  let importInput = $state<HTMLInputElement | undefined>();

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
      statusText = sources.length > 0 && error instanceof Error && /bad_request/i.test(error.message)
        ? `imported ${sources.length} sources; folders flattened`
        : error instanceof Error ? error.message : 'err: import failed';
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

  function sourceDiagnosticText(source: Source, lastFetch: string | null): string {
    return [
      `source: ${sourceLedgerLabel(source)}`,
      `fetch_state: ${source.last_fetch_status}`,
      `fetched_at: ${lastFetch ?? 'not_fetched'}`,
      `feed_url: ${source.url}`
    ].join('\n');
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

<section class="contract-region contract-source-ledger source-ledger" data-testid="source-ledger" aria-labelledby="source-ledger-heading">
  <div class="source-ledger-head source-ledger__header">
    <h2 id="source-ledger-heading" class="source-ledger__title" tabindex="-1">SOURCE LEDGER</h2>
  </div>
  {#if sources.length === 0}
    <p>No sources. Paste RSS URL in Steer.</p>
  {:else}
    <ul class="contract-list source-ledger__list">
      {#each sources as source (source.id)}
        {@const lastFetch = formatTime(source.last_fetch_at)}
        {@const sourceLabel = sourceLedgerLabel(source)}
        {@const sourceSummary = sourceLedgerSummary(source, lastFetch)}
        <li class="source-ledger-row source-ledger__row source-row" data-testid="source-row">
          <div class="source-ledger-copy"><span>{sourceSummary}</span></div>
          <div class="source-ledger-url source-ledger__url" title={source.url}>url: {source.url}</div>
          <span class="source-ledger__actions"><button type="button" class="source-ledger-delete" aria-label={`Delete source: ${sourceLabel}`} onclick={() => (confirmingSourceId = source.id)}>[DELETE]</button>{#if confirmingSourceId === source.id}<button type="button" class="source-ledger-confirm" aria-label={`confirm delete source: ${sourceLabel}`} onclick={() => void confirmDelete(source)}>[CONFIRM DELETE]</button>{/if}</span>
          <details class="source-diagnostic-details">
            <summary aria-label={`diagnostic details for ${sourceLabel}`} onkeydown={toggleDiagnosticFromKeyboard}>[DETAILS]</summary>
            <pre>{sourceDiagnosticText(source, lastFetch)}</pre>
          </details>
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
