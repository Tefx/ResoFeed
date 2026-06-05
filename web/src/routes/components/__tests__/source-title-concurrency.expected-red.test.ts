import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import { ResoFeedApiError } from '$lib/api-client';
import type { CurrentOperationInfo, FetchSourceSuccessResponse, Source, StateBundleV1 } from '$lib/api-contract';
import SourceLedger from '../SourceLedger.svelte';

type SourceLedgerExpectedRedProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
  onFetchSource?: (source: Source) => Promise<FetchSourceSuccessResponse>;
  onExportState: () => Promise<StateBundleV1>;
  onImportState: (bundle: StateBundleV1) => Promise<void> | void;
};

const ExpectedRedSourceLedger = SourceLedger as Component<SourceLedgerExpectedRedProps>;

function source(overrides: Partial<Source> & Pick<Source, 'id' | 'title' | 'url'>): Source {
  return {
    last_fetch_at: null,
    last_fetch_status: 'not_fetched',
    is_active: true,
    revision: 1,
    ...overrides
  };
}

function renderLedger(props: Partial<SourceLedgerExpectedRedProps> = {}, sources: Source[] = [
  source({ id: 'src_alpha', title: 'Alpha Journal', url: 'https://alpha.example.test/rss.xml' }),
  source({ id: 'src_beta', title: 'Beta Dispatch', url: 'https://beta.example.test/feed.xml' }),
  source({ id: 'src_gamma', title: 'Gamma Notes', url: 'https://gamma.example.test/atom.xml' })
]): HTMLElement {
  render(ExpectedRedSourceLedger, {
    props: {
      sources,
      onDeleteSource: async () => {},
      onImportOpml: async () => {},
      onExportState: async () => ({
        schema_version: 'resofeed.state.v1',
        exported_at: '2026-06-05T00:00:00Z',
        sources: [],
        steer_rules: [],
        resonated_items: []
      }),
      onImportState: async () => {},
      ...props
    }
  });
  return screen.getByRole('region', { name: 'SOURCE LEDGER' });
}

function rowBySourceId(ledger: HTMLElement, sourceId: string): HTMLElement {
  const row = ledger.querySelector(`[data-source-id="${sourceId}"]`);
  expect(row).toBeInstanceOf(HTMLElement);
  return row as HTMLElement;
}

function expectForbiddenOperationalSurfacesAbsent(ledger: HTMLElement): void {
  expect(within(ledger).queryByRole('progressbar')).not.toBeInTheDocument();
  expect(ledger.querySelector('[class*="spinner"], [class*="progress"], [data-spinner], [data-progress]')).toBeNull();
  expect(ledger).not.toHaveTextContent(/job list|jobs?|queue|queued|retry dashboard|operation history|activity ledger|command history/i);
}

describe('Source Ledger source-title/concurrency expected-red contract', () => {
  it('renders the row primary name from backend source.title and never from a feed_title field', () => {
    const sourceWithForbiddenAlias = {
      ...source({ id: 'src_title', title: 'Backend Parsed Feed Title', url: 'https://title.example.test/rss.xml', last_fetch_at: '2026-06-05T12:00:00Z', last_fetch_status: 'ok' }),
      feed_title: 'Forbidden feed_title Alias'
    } satisfies Source & { feed_title: string };
    const ledger = renderLedger({}, [sourceWithForbiddenAlias]);
    const row = rowBySourceId(ledger, 'src_title');

    expect(within(row).getByText('Backend Parsed Feed Title')).toBeVisible();
    expect(row.querySelector('.source-ledger__name')).toHaveTextContent('Backend Parsed Feed Title');
    expect(ledger).not.toHaveTextContent('Forbidden feed_title Alias');
    expect(ledger).toHaveTextContent('[FETCH]');
    expect(ledger).toHaveTextContent('[RUN INGEST]');
  });

  it('allows multiple distinct source rows to show [FETCHING...] while unrelated row [FETCH] remains actionable and [RUN INGEST] is disabled', async () => {
    const user = userEvent.setup();
    const pendingBySource = new Map<string, (response: FetchSourceSuccessResponse) => void>();
    const onFetchSource = vi.fn((candidate: Source) => new Promise<FetchSourceSuccessResponse>((resolve) => {
      pendingBySource.set(candidate.id, resolve);
    }));
    const ledger = renderLedger({ onFetchSource });

    await user.click(within(rowBySourceId(ledger, 'src_alpha')).getByRole('button', { name: /\[FETCH\].*Alpha Journal/ }));
    await user.click(within(rowBySourceId(ledger, 'src_beta')).getByRole('button', { name: /\[FETCH\].*Beta Dispatch/ }));

    const fetchingButtons = within(ledger).getAllByRole('button', { name: /\[FETCHING\.\.\.\]/ });
    expect(fetchingButtons).toHaveLength(2);
    expect(fetchingButtons[0]).toBeDisabled();
    expect(fetchingButtons[1]).toBeDisabled();
    expect(within(rowBySourceId(ledger, 'src_gamma')).getByRole('button', { name: /\[FETCH\].*Gamma Notes/ })).toBeEnabled();
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeDisabled();
    expect(onFetchSource).toHaveBeenCalledTimes(2);
    expectForbiddenOperationalSurfacesAbsent(ledger);

    for (const [sourceId, resolve] of pendingBySource) {
      resolve({ operation: 'source_fetch', source_id: sourceId, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [] });
    }
  });

  it('shows raw duplicate same-source current-operation conflict adjacent to the affected row without queue/progress/dashboard UI', async () => {
    const user = userEvent.setup();
    const conflictingOperation: CurrentOperationInfo = {
      running: true,
      kind: 'source_fetch',
      actor_kind: 'human',
      phase: 'fetching',
      count: null,
      message: 'scope: source:Alpha Journal',
      started_at: '2026-06-05T14:06:02Z',
      updated_at: '2026-06-05T14:06:03Z'
    };
    const onFetchSource = vi.fn(async () => {
      throw new ResoFeedApiError(409, {
        error: {
          code: 'conflict',
          message: 'fetch already running',
          details: { current_operation: conflictingOperation }
        }
      });
    });
    const ledger = renderLedger({ onFetchSource });
    const alphaRow = rowBySourceId(ledger, 'src_alpha');

    await user.click(within(alphaRow).getByRole('button', { name: /\[FETCH\].*Alpha Journal/ }));

    expectForbiddenOperationalSurfacesAbsent(ledger);
    await waitFor(() => {
      expect(within(alphaRow).getByText(/err: (conflict: )?fetch already running/)).toBeVisible();
      expect(alphaRow).toHaveTextContent('op: source_fetch');
      expect(alphaRow).toHaveTextContent('actor:human');
      expect(alphaRow).toHaveTextContent('scope: source:Alpha Journal');
      expect(alphaRow).toHaveTextContent('phase:fetching');
    });
    expect(within(rowBySourceId(ledger, 'src_beta')).queryByText(/err: fetch already running/)).not.toBeInTheDocument();
    expect(within(rowBySourceId(ledger, 'src_beta')).getByRole('button', { name: /\[FETCH\].*Beta Dispatch/ })).toBeEnabled();
  });
});
