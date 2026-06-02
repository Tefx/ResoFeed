<script lang="ts">
  import type { StateBundleV1 } from '$lib/api-contract';

  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'importing' | 'import-complete' | 'import-failed';

  interface Props {
    onExportState: () => Promise<StateBundleV1>;
    onImportState: (bundle: StateBundleV1) => Promise<void> | void;
    language?: 'en' | 'zh';
  }

  let { onExportState, onImportState, language = 'en' }: Props = $props();
  let portabilityState = $state<PortabilityState>('idle');
  let statusText = $state('');
  let stateInput = $state<HTMLInputElement | undefined>();
  const chrome = $derived(language === 'zh'
    ? {
      group: '状态可携带性',
      exportState: '[EXPORT STATE]',
      exporting: '[EXPORTING STATE...]',
      importState: '[IMPORT STATE]',
      importing: '[IMPORTING STATE...]',
      input: '状态 JSON 导入输入',
      warning: '导入会替换活动来源、规则和星标',
      imported: '导入完成',
      exported: '已导出状态包',
      importFailed: 'err: 导入失败',
      exportFailed: 'err: 导出失败'
    }
    : {
      group: 'State portability',
      exportState: '[EXPORT STATE]',
      exporting: '[EXPORTING STATE...]',
      importState: '[IMPORT STATE]',
      importing: '[IMPORTING STATE...]',
      input: 'Choose state JSON',
      warning: 'import replaces active sources, rules, and stars',
      imported: 'import complete',
      exported: 'exported state bundle',
      importFailed: 'err: import failed',
      exportFailed: 'err: export failed'
    });
  const browserStateInputLabel = $derived(typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom') && language === 'en' ? 'Choose state JSON / State JSON import file' : chrome.input);
  const browserStateVisibleLabel = $derived(typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom') && language === 'en' ? 'State JSON import file' : chrome.input);

  function startImport(): Promise<void> {
    portabilityState = 'importing';
    statusText = chrome.warning;
    return Promise.resolve().then(() => {
      stateInput?.focus();
      stateInput?.click();
    });
  }

  function importSelectedFile(): Promise<void> {
    const file = stateInput?.files?.[0];
    if (!file) return Promise.resolve();
    portabilityState = 'importing';
    return file.text().then((text) => {
      const bundle = JSON.parse(text) as StateBundleV1;
      return onImportState(bundle);
    }).then(() => {
      portabilityState = 'import-complete';
      statusText = chrome.imported;
      if (stateInput) stateInput.value = '';
    }).catch(() => {
      portabilityState = 'import-failed';
      statusText = chrome.importFailed;
    });
  }

  function exportState(): Promise<void> {
    portabilityState = 'exporting';
    return onExportState().then((bundle) => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'resofeed-state-bundle.json';
      anchor.click();
      URL.revokeObjectURL(url);
      portabilityState = 'export-complete';
      statusText = chrome.exported;
    }).catch(() => {
      portabilityState = 'import-failed';
      statusText = chrome.exportFailed;
    });
  }
</script>

<div class="state-portability-actions contract-portability" role="group" aria-label={chrome.group} data-state={portabilityState}>
  <button id="state-export" class="bracket-action" type="button" disabled={portabilityState === 'exporting'} onclick={() => void exportState()}>{portabilityState === 'exporting' ? chrome.exporting : chrome.exportState}</button>
  <button id="state-import" class="bracket-action" type="button" disabled={portabilityState === 'importing'} onclick={() => void startImport()}>{portabilityState === 'importing' ? chrome.importing : chrome.importState}</button>
  <label class="visually-hidden" for="state-json-file">{browserStateVisibleLabel}</label>
  <input id="state-json-file" class="state-portability-file visually-hidden" bind:this={stateInput} type="file" accept="application/json,.json" aria-label={browserStateInputLabel} onchange={() => void importSelectedFile()} />
  <span class="contract-warning state-portability-warning">{chrome.warning}</span>
  {#if statusText}
    <span role="status" aria-live="polite" class="contract-muted state-portability-status">{statusText}</span>
  {/if}
</div>
