<script lang="ts">
  import type { StateBundleV1 } from '$lib/api-contract';

  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'importing' | 'import-complete' | 'import-failed';

  interface Props {
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
  }

  let { onExportState, onImportState }: Props = $props();
  let portabilityState = $state<PortabilityState>('idle');
  let statusText = $state('');
  let stateInput = $state<HTMLInputElement | undefined>();

  async function startImport(): Promise<void> {
    portabilityState = 'importing';
    statusText = 'import replaces active sources, rules, and stars';
    await Promise.resolve();
    stateInput?.focus();
    stateInput?.click();
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
      if (stateInput) stateInput.value = '';
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

<div class="state-portability-actions contract-portability" role="group" aria-label="State portability" data-state={portabilityState}>
  <button id="state-export" class="bracket-action" type="button" disabled={portabilityState === 'exporting'} onclick={() => void exportState()}>{portabilityState === 'exporting' ? '[EXPORTING STATE...]' : '[EXPORT STATE]'}</button>
  <button id="state-import" class="bracket-action" type="button" disabled={portabilityState === 'importing'} onclick={() => void startImport()}>{portabilityState === 'importing' ? '[IMPORTING STATE...]' : '[IMPORT STATE]'}</button>
  <label class="visually-hidden" for="state-json-file">Choose state JSON</label>
  <input id="state-json-file" class="state-portability-file visually-hidden" bind:this={stateInput} type="file" accept="application/json,.json" aria-label="Choose state JSON" onchange={() => void importSelectedFile()} />
  <span class="contract-warning state-portability-warning">import replaces active sources, rules, and stars</span>
  {#if statusText}
    <span role="status" aria-live="polite" class="contract-muted state-portability-status">{statusText}</span>
  {/if}
</div>
