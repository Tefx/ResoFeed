import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import type { FetchSourceSuccessResponse, RunIngestSuccessResponse, Source, StateBundleV1 } from '$lib/api-contract';
import SourceLedger from '../SourceLedger.svelte';

type LedgerProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
  onRunIngest: () => Promise<RunIngestSuccessResponse>;
  onFetchSource: (source: Source) => Promise<FetchSourceSuccessResponse>;
  onExportState: () => Promise<StateBundleV1>;
  onImportState: (bundle: StateBundleV1) => Promise<void> | void;
};

const TestLedger = SourceLedger as Component<LedgerProps>;
const sources: Source[] = [
  {
    id: 'src_alpha',
    url: 'https://alpha.example.test/a/very/long/feed/path/that/must/remain/legible.xml',
    title: 'Alpha Research Journal With A Deliberately Long Source Name',
    last_fetch_at: '2026-07-12T12:34:56Z',
    last_fetch_status: 'ok',
    last_fetch_error: null,
    is_active: true,
    revision: 1
  },
  {
    id: 'src_beta',
    url: 'https://beta.example.test/feed.xml',
    title: 'Beta Dispatch',
    last_fetch_at: null,
    last_fetch_status: 'rss_fetch_error',
    last_fetch_error: 'err: upstream timeout with a deliberately long diagnostic that must remain available to assistive technology',
    is_active: true,
    revision: 2
  }
];

function stateBundle(): StateBundleV1 {
  return {
    schema_version: 'resofeed.state.v1',
    exported_at: '2026-07-12T12:00:00Z',
    sources: [],
    steer_rules: [],
    resonated_items: []
  };
}

function renderLedger(overrides: Partial<LedgerProps> = {}): HTMLElement {
  render(TestLedger, {
    props: {
      sources,
      onDeleteSource: async () => {},
      onImportOpml: async () => {},
      onRunIngest: async () => ({
        operation: 'ingest',
        source_id: null,
        completed: true,
        sources_total: sources.length,
        sources_fetched: sources.length,
        items_discovered: 2,
        items_upserted: 2,
        errors: [],
        completed_at: '2026-07-12T12:35:00Z'
      }),
      onFetchSource: async (source) => ({
        operation: 'source_fetch',
        source_id: source.id,
        completed: true,
        sources_total: 1,
        sources_fetched: 1,
        items_discovered: 1,
        items_upserted: 1,
        errors: [],
        completed_at: '2026-07-12T12:35:00Z'
      }),
      onExportState: async () => stateBundle(),
      onImportState: async () => {},
      ...overrides
    }
  });
  return screen.getByRole('region', { name: 'SOURCE LEDGER' });
}

describe('RF-BUG-008 Source Ledger render acceptance', () => {
  it('[RF-BUG-008] Source Ledger groups and controls render', () => {
    const ledger = renderLedger();
    const sourceList = within(ledger).getByRole('group', { name: 'Source list actions' });
    const portableState = within(ledger).getByRole('group', { name: 'Portable state actions' });

    expect(sourceList).toHaveTextContent('SOURCE LIST');
    expect(within(sourceList).getByRole('button', { name: '[IMPORT OPML]' })).toHaveTextContent('[IMPORT OPML]');
    expect(within(sourceList).queryByText('[EXPORT OPML]')).not.toBeInTheDocument();
    expect(portableState).toHaveTextContent('PORTABLE STATE');
    expect(within(portableState).getByRole('button', { name: '[EXPORT STATE]' })).toBeVisible();
    expect(within(portableState).getByRole('button', { name: '[IMPORT STATE]' })).toHaveAccessibleDescription(
      'Import State replaces active sources, rules, and stars.'
    );
    expect(ledger.querySelector('input[type="url"], textarea[name*="url" i]')).toBeNull();
    expect(ledger).not.toHaveTextContent(/folder|tag|job|queue|activity ledger|sync|merge/i);
  });

  it('[RF-BUG-008] Source Ledger operational states render', async () => {
    const user = userEvent.setup();
    const pendingFetches = new Map<string, (result: FetchSourceSuccessResponse) => void>();
    let resolveIngest: ((result: RunIngestSuccessResponse) => void) | undefined;
    const onFetchSource = vi.fn((source: Source) => new Promise<FetchSourceSuccessResponse>((resolve) => {
      pendingFetches.set(source.id, resolve);
    }));
    const onRunIngest = vi.fn(() => new Promise<RunIngestSuccessResponse>((resolve) => {
      resolveIngest = resolve;
    }));
    const ledger = renderLedger({ onFetchSource, onRunIngest });

    const rows = ledger.querySelectorAll<HTMLElement>('.source-ledger__row');
    await user.click(within(rows[0]).getByRole('button', { name: /Fetch source Alpha Research Journal/ }));
    await user.click(within(rows[1]).getByRole('button', { name: /Fetch source Beta Dispatch/ }));
    expect(within(ledger).getAllByText('[FETCHING...]')).toHaveLength(2);
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeEnabled();

    await user.click(within(ledger).getByRole('button', { name: '[RUN INGEST]' }));
    expect(within(ledger).getByRole('button', { name: '[INGESTING...]' })).toBeDisabled();
    expect(within(ledger).queryByRole('progressbar')).not.toBeInTheDocument();

    for (const [sourceId, resolve] of pendingFetches) {
      resolve({
        operation: 'source_fetch',
        source_id: sourceId,
        completed: true,
        sources_total: 1,
        sources_fetched: 1,
        items_discovered: 1,
        items_upserted: 1,
        errors: [],
        completed_at: '2026-07-12T12:35:00Z'
      });
    }
    resolveIngest?.({
      operation: 'ingest',
      source_id: null,
      completed: true,
      sources_total: sources.length,
      sources_fetched: sources.length,
      items_discovered: 2,
      items_upserted: 2,
      errors: [],
      completed_at: '2026-07-12T12:35:00Z'
    });

    await waitFor(() => expect(within(ledger).queryByText('[FETCHING...]')).not.toBeInTheDocument());
    await waitFor(() => expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeEnabled());
  });
});
