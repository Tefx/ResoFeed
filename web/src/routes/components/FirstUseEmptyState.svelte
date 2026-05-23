<script lang="ts">
  type FirstUseState = 'no-sources' | 'sources-added-no-items' | 'feed-temporarily-empty';

  interface Props {
    state: FirstUseState;
    language?: 'en' | 'zh';
  }

  let { state, language = 'en' }: Props = $props();
  const chrome = $derived(language === 'zh'
    ? {
      aria: 'First use',
      lines: ['在导向栏粘贴 RSS URL，或导入 OPML。', '检查器会打开条目。', '星标会保留持久价值。', '导向是可选修正。']
    }
    : {
      aria: 'First use',
      lines: ['Paste RSS URL in Steer or import OPML.', 'Inspect opens the item.', 'Star preserves durable value.', 'Steer is optional correction.']
    });
</script>

<section class="contract-region contract-empty" aria-label={chrome.aria} data-state={state}>
  {#each chrome.lines as line}
    <p>{line}</p>
  {/each}
</section>
