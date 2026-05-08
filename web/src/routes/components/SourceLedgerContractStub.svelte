<script lang="ts">
  import type { Source } from '$lib/api-contract';

  interface Props {
    sources: Source[];
  }

  let { sources }: Props = $props();

  let confirmingSourceId = $state<string | null>(null);
  let importStatus = $state('');

  function startOpmlImport(): void {
    importStatus = 'import pending';
  }
</script>

<section class="contract-region contract-source-ledger" aria-labelledby="source-ledger-heading">
  <h2 id="source-ledger-heading">SOURCE LEDGER</h2>
  <button type="button" onclick={startOpmlImport}>import OPML</button>
  {#if importStatus}
    <p role="status" class="contract-muted">{importStatus}</p>
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
            <button type="button" aria-label={`confirm delete source: ${source.title}`}>confirm delete</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <p class="contract-muted">
    <a href="#state-export">export state</a> · <a href="#state-import">import state</a>
  </p>
  <p class="contract-muted">
    Flat rows only; URL addition routes to Steer; delete requires terse confirmation before destructive removal.
  </p>
</section>
