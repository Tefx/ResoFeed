import { mount } from 'svelte';
import SourceLedger from '/src/routes/components/SourceLedger.svelte';
import type { Source } from '/src/lib/api-contract';

const baseSources: Source[] = [
  {
    id: 'src_simon',
    url: 'https://simonwillison.net/atom/everything/',
    title: 'simonwillison.net/feed.xml',
    last_fetch_at: '2026-05-09T10:25:31Z',
    last_fetch_status: 'ok',
    is_active: true,
    revision: 1
  },
  {
    id: 'src_hn',
    url: 'https://hn.algolia.com/rss',
    title: 'hn.algolia.com/rss',
    last_fetch_at: '2026-05-09T10:25:31Z',
    last_fetch_status: 'ok',
    is_active: true,
    revision: 1
  },
  {
    id: 'src_blog',
    url: 'https://blog.example/feed',
    title: 'blog.example/feed',
    last_fetch_at: null,
    last_fetch_status: 'rss_fetch_error',
    is_active: true,
    revision: 1
  }
];

const noop = async () => undefined;

function render(targetId: string, props = {}) {
  const target = document.getElementById(targetId);
  if (!target) throw new Error(`missing target ${targetId}`);
  mount(SourceLedger, {
    target,
    props: {
      sources: baseSources,
      onDeleteSource: noop,
      onImportOpml: noop,
      onRunIngest: noop,
      onFetchSource: noop,
      ...props
    }
  });
}

render('default');
render('source-fetch-active', {
  manualFetchState: { fetchingSourceIds: ['src_blog'] }
});
render('global-ingest-active', {
  manualFetchState: { ingesting: true }
});
render('completion', {
  manualFetchState: { lastIngestAt: '2026-05-09T10:25:31Z' }
});
render('error-conflict', {
  manualFetchState: {
    sourceErrors: {
      src_blog: 'err: conflict ingest already running after upstream source fetch timeout diagnostic should truncate here'
    }
  }
});
render('hover-focus');
