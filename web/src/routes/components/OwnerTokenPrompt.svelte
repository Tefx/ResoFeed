<script lang="ts">
  import { tick } from 'svelte';

  type OwnerTokenPromptState = 'empty' | 'focused' | 'submitting' | 'accepted' | 'rejected';

  interface Props {
    state: OwnerTokenPromptState;
    onAccepted?: (token: string) => void;
    language?: 'en' | 'zh';
  }

  let { state: externalState, onAccepted, language = 'en' }: Props = $props();
  let token = $state('');
  let internalState = $state<OwnerTokenPromptState>('empty');
  let tokenInput = $state<HTMLInputElement | undefined>();

  const displayedState = $derived(
    externalState === 'rejected' || externalState === 'submitting' ? externalState : internalState
  );
  const canSubmit = $derived(token.length > 0 && displayedState !== 'submitting' && displayedState !== 'accepted');
  const chrome = $derived(language === 'zh'
    ? {
      heading: '输入所有者令牌',
      tokenLabel: '所有者令牌',
      submit: '[提交]',
      submitting: '[提交中]',
      rejected: 'err: 所有者令牌被拒绝'
    }
    : {
      heading: 'Enter owner token',
      tokenLabel: 'Owner token',
      submit: '[SUBMIT]',
      submitting: '[SUBMITTING]',
      rejected: 'err: owner token rejected'
    });

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

<section class="contract-region contract-token-prompt" aria-label="RESOFEED owner token prompt">
  <p class="contract-label">RESOFEED</p>
  <h1 id="owner-token-heading">{chrome.heading}</h1>
  <form class="contract-token-form" onsubmit={(event) => { event.preventDefault(); submitOwnerToken(); }}>
  <label class="visually-hidden" for="owner-token-input">{chrome.tokenLabel}</label>
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
  <button class="bracket-action" type="submit" disabled={!canSubmit}>
    {displayedState === 'submitting' ? chrome.submitting : chrome.submit}
  </button>
  </form>
  {#if displayedState === 'rejected'}
    <p id="owner-token-error" class="contract-feedback-error" role="alert" aria-live="assertive">{chrome.rejected}</p>
  {/if}
</section>
