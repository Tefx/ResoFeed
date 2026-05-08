<script lang="ts">
  type OwnerTokenPromptState = 'empty' | 'focused' | 'submitting' | 'accepted' | 'rejected';

  interface Props {
    state: OwnerTokenPromptState;
  }

  let { state }: Props = $props();
</script>

<section class="contract-region contract-token-prompt" aria-labelledby="owner-token-heading">
  <p class="contract-label">RESOFEED</p>
  <h1 id="owner-token-heading">Enter owner token</h1>
  <label for="owner-token-input">Owner token</label>
  <input
    id="owner-token-input"
    name="owner-token"
    type="password"
    autocomplete="off"
    disabled={state === 'submitting' || state === 'accepted'}
    aria-describedby="owner-token-accessibility-note"
  />
  <button type="button" disabled={state === 'empty' || state === 'submitting' || state === 'accepted'}>
    submit
  </button>
  {#if state === 'rejected'}
    <p class="contract-feedback-error" aria-live="assertive">err: owner token rejected</p>
  {/if}
  <p id="owner-token-accessibility-note" class="contract-muted">
    Contract: initial focus starts here; accepted focus moves to Steer or first feed item; token storage key is resofeed.ownerToken.
  </p>
</section>
