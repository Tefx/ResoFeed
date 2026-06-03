<script lang="ts">
  import type { StateBundleV1 } from '$lib/api-contract';

  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'importing' | 'import-complete' | 'import-failed';

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

  const browserStateInputLabel = $derived(typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom') && language === 'en' ? 'Choose state JSON / State JSON import file' : chrome.input);
  const browserStateVisibleLabel = $derived(typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom') && language === 'en' ? 'State JSON import file' : chrome.input);

  const visibleGroupLabel = $derived(groupLabel ?? chrome.defaultGroupLabel);
  const accessibleGroupLabel = $derived(groupAriaLabel ?? chrome.group);
  const statusIsError = $derived(statusText.toLowerCase().startsWith('err:'));

  function restoreImportIdleFocus(): void {
    if (!importPickerOpening) return;
    importPickerOpening = false;
    if (stateInput) stateInput.value = '';
    if (portabilityState === 'importing') return;
    portabilityState = 'idle';
    statusText = '';
    importStateButton?.focus();
  }

  function startImport(): void {
    statusText = '';
    importPickerOpening = true;
    stateInput?.click();
    window.setTimeout(() => restoreImportIdleFocus(), 0);
  }

  function importSelectedFile(): Promise<void> {
    importPickerOpening = false;
    const file = stateInput?.files?.[0];
    if (!file) {
      restoreImportIdleFocus();
      return Promise.resolve();
    }
    portabilityState = 'importing';
    return file.text().then((text) => {
      const bundle = JSON.parse(text) as StateBundleV1;
      return onImportState(bundle);
    }).then(() => {
      portabilityState = 'import-complete';
      statusText = chrome.imported;
      if (stateInput) stateInput.value = '';
    }).catch((error: unknown) => {
      portabilityState = 'import-failed';
      statusText = error instanceof Error ? rawErrorText(error.message) : chrome.importFailed;
      if (stateInput) stateInput.value = '';
    });
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
      portabilityState = 'import-failed';
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
  <label class="visually-hidden" for="state-json-file">{browserStateVisibleLabel}</label>
  <input id="state-json-file" class="state-portability-file visually-hidden" bind:this={stateInput} type="file" accept="application/json,.json" aria-label={browserStateInputLabel} onchange={() => void importSelectedFile()} />
  <span id="state-import-warning" class="contract-warning state-portability-warning" hidden={!importRiskFocused && portabilityState !== 'importing' && portabilityState !== 'import-failed'}>{chrome.warning}</span>
  {#if statusText}
    <span role="status" aria-live={statusIsError ? 'assertive' : 'polite'} class="contract-muted state-portability-status">{statusText}</span>
  {/if}
</div>
