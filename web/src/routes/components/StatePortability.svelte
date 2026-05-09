<script lang="ts">
  import type { StateBundleV1 } from '$lib/api-contract';

  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'importing' | 'import-complete' | 'import-failed';

  interface Props {
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
  }

  let { onExportState, onImportState }: Props = $props();
  let portabilityState = $state<PortabilityState>('idle');
  let showImportInput = $state(false);
  let statusText = $state('bundle contains active Source Ledger rows, active steering policy rules, and currently resonated items only');
  let stateInput = $state<HTMLInputElement | undefined>();

  async function startImport(): Promise<void> {
    showImportInput = true;
    portabilityState = 'importing';
    statusText = 'import replaces active sources, rules, and stars';
    await Promise.resolve();
    stateInput?.focus();
  }

  async function importSelectedFile(): Promise<void> {
    const file = stateInput?.files?.[0];
    if (!file) return;
    portabilityState = 'importing';
    try {
      const bundle = JSON.parse(await file.text()) as StateBundleV1;
      await onImportState(bundle);
      portabilityState = 'import-complete';
      statusText = 'import complete';
    } catch {
      portabilityState = 'import-failed';
      statusText = 'err: import failed';
    }
  }

  async function exportState(): Promise<void> {
    portabilityState = 'exporting';
    try {
      const bundle = await onExportState();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'state.json';
      anchor.click();
      URL.revokeObjectURL(url);
      portabilityState = 'export-complete';
      statusText = 'exported state.json';
    } catch {
      portabilityState = 'import-failed';
      statusText = 'err: export failed';
    }
  }
</script>

<section class="contract-region contract-portability" aria-labelledby="state-portability-heading" data-state={portabilityState}>
  <h2 id="state-portability-heading">State Portability</h2>
  <p class="contract-warning">import replaces active sources, rules, and stars</p>
  <button id="state-export" type="button" disabled={portabilityState === 'exporting'} onclick={() => void exportState()}>export state</button>
  <button id="state-import" type="button" disabled={portabilityState === 'importing'} onclick={() => void startImport()}>import state</button>
  {#if showImportInput}
    <label for="state-json-file">Choose state JSON</label>
    <input id="state-json-file" bind:this={stateInput} type="file" accept="application/json,.json" onchange={() => void importSelectedFile()} />
  {/if}
  <p role="status" aria-live="polite" class="contract-muted">{statusText}</p>
</section>
