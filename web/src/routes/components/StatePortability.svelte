<script lang="ts">
  import { onMount } from 'svelte';
  import type { StateBundleV1 } from '$lib/api-contract';

  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'export-failed' | 'import-confirming' | 'importing' | 'import-complete' | 'import-failed';

  interface Props {
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
    groupLabel?: string;
    groupAriaLabel?: string;
    language?: 'en' | 'zh';
  }

  let { onExportState, onImportState, groupLabel, groupAriaLabel, language = 'en' }: Props = $props();
  let portabilityState = $state<PortabilityState>('idle');
  let statusText = $state('');
  let stateInput = $state<HTMLInputElement | undefined>();
  let importStateButton = $state<HTMLButtonElement | undefined>();
  let confirmImportButton = $state<HTMLButtonElement | undefined>();
  let pendingImportBundle = $state<StateBundleV1 | null>(null);
  let importRiskFocused = $state(false);
  let importPickerOpening = false;
  const stateFileName = 'state.json';
  const chrome = $derived(language === 'zh'
    ? {
      group: '状态可携带性',
      defaultGroupLabel: 'PORTABLE STATE',
      exportState: '[EXPORT STATE]',
      exporting: '[EXPORTING STATE...]',
      importState: '[IMPORT STATE]',
      importing: '[IMPORTING STATE...]',
      input: '状态 JSON 导入输入',
      warning: '导入 State 会替换活动来源、规则和星标。',
      imported: '导入完成',
      exported: '已导出状态包',
      importFailed: 'err: 导入失败',
      exportFailed: 'err: 导出失败'
    }
    : {
      group: 'State portability',
      defaultGroupLabel: 'PORTABLE STATE',
      exportState: '[EXPORT STATE]',
      exporting: '[EXPORTING STATE...]',
      importState: '[IMPORT STATE]',
      importing: '[IMPORTING STATE...]',
      input: 'Choose state JSON',
      warning: 'Import State replaces active sources, rules, and stars.',
      imported: 'import complete',
      exported: `exported ${stateFileName}`,
      importFailed: 'err: import failed',
      exportFailed: 'err: export failed'
    });

  const visibleGroupLabel = $derived(groupLabel ?? chrome.defaultGroupLabel);
  const accessibleGroupLabel = $derived(groupAriaLabel ?? chrome.group);
  const statusIsError = $derived(statusText.toLowerCase().startsWith('err:'));

  function clearStateInput(): void {
    if (stateInput) stateInput.value = '';
  }

  function resetImportIntent(focusImport = true): void {
    importPickerOpening = false;
    pendingImportBundle = null;
    clearStateInput();
    if (portabilityState !== 'importing') portabilityState = 'idle';
    statusText = '';
    if (focusImport) window.setTimeout(() => importStateButton?.focus(), 0);
  }

  function restoreImportIdleFocus(): void {
    if (!importPickerOpening) return;
    resetImportIntent();
  }

  function startImport(): void {
    resetImportIntent(false);
    importPickerOpening = true;
    stateInput?.click();
    window.setTimeout(() => restoreImportIdleFocus(), 0);
  }

  function importSelectedFile(): Promise<void> {
    importPickerOpening = false;
    const file = stateInput?.files?.[0];
    if (!file) {
      resetImportIntent();
      return Promise.resolve();
    }
    statusText = '';
    return file.text().then((text) => {
      pendingImportBundle = parseStateBundle(text);
      portabilityState = 'import-confirming';
      clearStateInput();
      window.setTimeout(() => confirmImportButton?.focus(), 0);
    }).catch((error: unknown) => {
      pendingImportBundle = null;
      portabilityState = 'import-failed';
      statusText = error instanceof Error ? rawErrorText(error.message) : chrome.importFailed;
      clearStateInput();
    });
  }

  function confirmImport(): Promise<void> {
    if (!pendingImportBundle || portabilityState === 'importing') return Promise.resolve();
    const bundle = pendingImportBundle;
    pendingImportBundle = null;
    portabilityState = 'importing';
    statusText = '';
    return Promise.resolve(onImportState(bundle)).then(() => {
      portabilityState = 'import-complete';
      statusText = chrome.imported;
      clearStateInput();
    }).catch((error: unknown) => {
      portabilityState = 'import-failed';
      statusText = error instanceof Error ? rawErrorText(error.message) : chrome.importFailed;
      clearStateInput();
    });
  }

  function handleImportKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || portabilityState !== 'import-confirming') return;
    event.preventDefault();
    event.stopPropagation();
    resetImportIntent();
  }

  onMount(() => {
    const handleGlobalImportKeydown = (event: KeyboardEvent): void => {
      handleImportKeydown(event);
    };
    window.addEventListener('keydown', handleGlobalImportKeydown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalImportKeydown, { capture: true });
  });

  function parseStateBundle(text: string): StateBundleV1 {
    const parsed: unknown = JSON.parse(text);
    if (!isStateBundleV1(parsed)) throw new Error('invalid state bundle');
    return parsed;
  }

  function isStateBundleV1(value: unknown): value is StateBundleV1 {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return candidate.schema_version === 'resofeed.state.v1'
      && typeof candidate.exported_at === 'string'
      && Array.isArray(candidate.sources)
      && Array.isArray(candidate.steer_rules)
      && Array.isArray(candidate.resonated_items);
  }

  function exportState(): Promise<void> {
    portabilityState = 'exporting';
    return onExportState().then((bundle) => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = stateFileName;
      anchor.click();
      URL.revokeObjectURL(url);
      portabilityState = 'export-complete';
      statusText = chrome.exported;
    }).catch((error: unknown) => {
      portabilityState = 'export-failed';
      statusText = error instanceof Error ? rawErrorText(error.message) : chrome.exportFailed;
    });
  }

  function rawErrorText(message: string): string {
    const trimmed = message.trim();
    return trimmed.toLowerCase().startsWith('err:') ? trimmed : `err: ${trimmed}`;
  }
</script>

<div class="state-portability-actions source-ledger__action-group source-ledger__action-group--state contract-portability" role="group" aria-label={accessibleGroupLabel} data-state={portabilityState}>
  <span class="source-ledger__group-label">{visibleGroupLabel}</span>
  <button id="state-export" class="bracket-action bracket-action--export-state" type="button" disabled={portabilityState === 'exporting'} onclick={() => void exportState()}>{portabilityState === 'exporting' ? chrome.exporting : chrome.exportState}</button>
  <button id="state-import" bind:this={importStateButton} class="bracket-action bracket-action--import-state" type="button" aria-describedby="state-import-warning" disabled={portabilityState === 'importing'} onfocus={() => (importRiskFocused = true)} onblur={() => (importRiskFocused = false)} onclick={startImport}>{portabilityState === 'importing' ? chrome.importing : chrome.importState}</button>
  <input id="state-json-file" class="state-portability-file visually-hidden" bind:this={stateInput} type="file" accept="application/json,.json" aria-label={chrome.input} onchange={() => void importSelectedFile()} />
  <span id="state-import-warning" class="contract-warning state-portability-warning" hidden={!importRiskFocused && portabilityState !== 'import-confirming' && portabilityState !== 'importing' && portabilityState !== 'import-failed'}>{chrome.warning}</span>
  {#if portabilityState === 'import-confirming'}
    <button bind:this={confirmImportButton} class="bracket-action bracket-action--confirm bracket-action--confirm-import" type="button" onkeydown={handleImportKeydown} onclick={() => void confirmImport()}>[CONFIRM IMPORT]</button>
    <button class="bracket-action bracket-action--cancel bracket-action--cancel-import" type="button" onkeydown={handleImportKeydown} onclick={() => resetImportIntent()}>[CANCEL]</button>
  {/if}
  {#if statusText}
    <span role="status" aria-live={statusIsError ? 'assertive' : 'polite'} class="contract-muted state-portability-status">{statusText}</span>
  {/if}
</div>
