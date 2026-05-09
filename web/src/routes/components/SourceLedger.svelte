<script lang="ts">
  import type { Source } from '$lib/api-contract';

  interface Props {
    sources: Source[];
    onDeleteSource: (source: Source) => Promise<void> | void;
    onImportOpml: (opml: string) => Promise<void> | void;
  }

  let { sources, onDeleteSource, onImportOpml }: Props = $props();
  let confirmingSourceId = $state<string | null>(null);
  let statusText = $state('');
  let importInput = $state<HTMLInputElement | undefined>();

  async function importSelectedFile(): Promise<void> {
    const file = importInput?.files?.[0];
    if (!file) return;
    statusText = 'importing OPML';
    try {
      await onImportOpml(await file.text());
      statusText = 'imported OPML';
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
</script>

<section class="contract-region contract-source-ledger" aria-labelledby="source-ledger-heading">
  <h2 id="source-ledger-heading">SOURCE LEDGER</h2>
  <label for="opml-file">import OPML</label>
  <input id="opml-file" bind:this={importInput} type="file" accept=".opml,.xml,text/xml,application/xml" onchange={() => void importSelectedFile()} />
  {#if statusText}
    <p role="status" class="contract-muted">{statusText}</p>
  {/if}
  {#if sources.length === 0}
    <p>No sources. Paste RSS URL in Steer.</p>
  {:else}
    <ul class="contract-list">
      {#each sources as source (source.id)}
        <li>
          <span>{source.title}</span>
          <span class="contract-muted"> {source.url}</span>
          <span class="contract-muted"> {source.last_fetch_status}</span>
          <button type="button" aria-label={`Delete source: ${source.title}`} onclick={() => (confirmingSourceId = source.id)}>delete</button>
          {#if confirmingSourceId === source.id}
            <button type="button" aria-label={`confirm delete source: ${source.title}`} onclick={() => void confirmDelete(source)}>confirm delete</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <p class="contract-muted">
    <a href="#state-export">export state</a> · <a href="#state-import">import state</a>
  </p>
</section>
