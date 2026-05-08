<script lang="ts">
  type FirstUseState = 'no-sources' | 'sources-added-no-items' | 'feed-temporarily-empty';

  interface Props {
    state: FirstUseState;
  }

  let { state }: Props = $props();
</script>

<section class="contract-region contract-empty" aria-labelledby="first-use-heading" data-state={state}>
  <h2 id="first-use-heading">TODAY</h2>
  <p>Paste RSS URL in Steer or import OPML.</p>
  <p>Inspect opens the item.</p>
  <p>Star preserves durable value.</p>
  <p>Steer is optional correction.</p>
  <p class="contract-muted">
    Contract: explanatory text is static; first actionable control remains Steer or OPML import.
  </p>
</section>
