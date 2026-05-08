<script lang="ts">
  type PortabilityState = 'idle' | 'exporting' | 'export-complete' | 'importing' | 'import-complete' | 'import-failed';

  interface Props {
    state: PortabilityState;
  }

  let { state }: Props = $props();
</script>

<section class="contract-region contract-portability" aria-labelledby="state-portability-heading" data-state={state}>
  <h2 id="state-portability-heading">State Portability</h2>
  <p class="contract-warning">import replaces active sources, rules, and stars</p>
  <button type="button">export state</button>
  <button type="button">import state</button>
  <p aria-live="polite" class="contract-muted">
    Contract: bundle contains active Source Ledger rows, active steering policy rules, and currently resonated items only.
  </p>
</section>
