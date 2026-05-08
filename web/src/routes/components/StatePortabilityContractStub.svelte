<script lang="ts">
  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'importing' | 'import-complete' | 'import-failed';

  interface Props {
    state: PortabilityState;
  }

  let { state: portabilityState }: Props = $props();
  let showImportInput = $state(false);
  let statusText = $state('');

  $effect(() => {
    showImportInput = portabilityState === 'importing';
    statusText = portabilityState === 'export-complete' ? 'exported state.json' : '';
  });

  function startImport(): void {
    showImportInput = true;
    statusText = '';
  }

  function exportState(): void {
    statusText = 'exported state.json';
  }
</script>

<section class="contract-region contract-portability" aria-labelledby="state-portability-heading" data-state={portabilityState}>
  <h2 id="state-portability-heading">State Portability</h2>
  <p class="contract-warning">import replaces active sources, rules, and stars</p>
  <button id="state-export" type="button" onclick={exportState}>export state</button>
  <button id="state-import" type="button" onclick={startImport}>import state</button>
  {#if showImportInput}
    <label for="state-json-file">Choose state JSON</label>
    <input id="state-json-file" type="file" accept="application/json,.json" />
  {/if}
  <p role="status" aria-live="polite" class="contract-muted">
    {statusText || 'bundle contains active Source Ledger rows, active steering policy rules, and currently resonated items only'}
  </p>
</section>
