<script lang="ts">
  type FirstUseState = 'no-sources' | 'sources-added-no-items' | 'feed-temporarily-empty';

  interface Props {
    state: FirstUseState;
  }

  let { state }: Props = $props();
</script>

<section class="contract-region contract-empty" aria-labelledby="first-use-heading" data-state={state}>
  <h2 id="first-use-heading" class="visually-hidden">First use</h2>
  <p>Paste RSS URL in Steer or import OPML.</p>
  <p>Inspect opens the item.</p>
  <p>Star preserves durable value.</p>
  <p>Steer is optional correction.</p>
</section>
