<script lang="ts">
  import { tick } from 'svelte';

  type OwnerTokenPromptState = 'empty' | 'focused' | 'submitting' | 'accepted' | 'rejected';

  interface Props {
    state: OwnerTokenPromptState;
    onAccepted?: (token: string) => void;
  }

  let { state: externalState, onAccepted }: Props = $props();
  let token = $state('');
  let internalState = $state<OwnerTokenPromptState>('empty');
  let tokenInput = $state<HTMLInputElement | undefined>();

  const displayedState = $derived(
    externalState === 'rejected' || externalState === 'submitting' ? externalState : internalState
  );
  const canSubmit = $derived(token.length > 0 && displayedState !== 'submitting' && displayedState !== 'accepted');

  async function focusTokenInput(): Promise<void> {
    await tick();
    tokenInput?.focus();
  }

  $effect(() => {
    internalState = externalState;
    if (externalState !== 'accepted') {
      void focusTokenInput();
    }
  });

  function submitOwnerToken(): void {
    if (!canSubmit) {
      void focusTokenInput();
      return;
    }

    internalState = 'submitting';
    onAccepted?.(token);
  }

  function focusOnMount(node: HTMLInputElement): void {
    node.focus();
  }
</script>

<section class="contract-region contract-token-prompt" aria-labelledby="owner-token-heading">
  <p class="contract-label">RESOFEED</p>
  <h1 id="owner-token-heading">Enter owner token</h1>
  <form class="contract-token-form" onsubmit={(event) => { event.preventDefault(); submitOwnerToken(); }}>
  <label class="visually-hidden" for="owner-token-input">Owner token</label>
  <input
    id="owner-token-input"
    use:focusOnMount
    bind:this={tokenInput}
    bind:value={token}
    name="owner-token"
    type="password"
    autocomplete="off"
    disabled={displayedState === 'submitting' || displayedState === 'accepted'}
    aria-describedby="owner-token-error"
  />
  <button type="submit" disabled={!canSubmit} aria-label="submit">
    [submit]
  </button>
  </form>
  {#if displayedState === 'rejected'}
    <p id="owner-token-error" class="contract-feedback-error" role="alert" aria-live="assertive">err: owner token rejected</p>
  {/if}
</section>
