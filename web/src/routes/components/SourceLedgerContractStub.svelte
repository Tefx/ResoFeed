<script lang="ts">
  import type { Source } from '$lib/api-contract';

  interface Props {
    sources: Source[];
  }

  let { sources }: Props = $props();
</script>

<section class="contract-region contract-source-ledger" aria-labelledby="source-ledger-heading">
  <h2 id="source-ledger-heading">SOURCE LEDGER</h2>
  <button type="button">import OPML</button>
  {#if sources.length === 0}
    <p>No sources. Paste RSS URL in Steer.</p>
  {:else}
    <ul class="contract-list">
      {#each sources as source (source.id)}
        <li>
          <span>{source.title}</span>
          <span class="contract-muted"> {source.url}</span>
          <button type="button" aria-label={`Delete source: ${source.title}`}>delete</button>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="contract-muted">
    Contract: flat rows only; URL addition routes to Steer; delete requires terse confirmation before destructive removal.
  </p>
</section>
