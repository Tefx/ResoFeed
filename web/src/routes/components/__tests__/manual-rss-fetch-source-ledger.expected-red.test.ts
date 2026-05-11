import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import type { Source, StateBundleV1 } from '$lib/api-contract';
import SourceLedger from '../SourceLedger.svelte';
import { documentedRunIngestSourceError } from '../../../test/manual-rss-fetch-fixtures';

type ManualFetchSourceLedgerProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
  onExportState: () => Promise<StateBundleV1>;
  onImportState: (bundle: StateBundleV1) => Promise<void> | void;
  onRunIngest?: () => Promise<unknown>;
  onFetchSource?: (source: Source) => Promise<unknown>;
  manualFetchState?: {
    readonly ingesting?: boolean;
    readonly fetchingSourceIds?: readonly string[];
    readonly lastIngestAt?: string | null;
    readonly sourceErrors?: Readonly<Record<string, string>>;
  };
};

const ManualSourceLedger = SourceLedger as Component<ManualFetchSourceLedgerProps>;

const sourceWithFetchTime: Source = {
  id: 'src_ok',
  url: 'https://example.com/feed.xml',
  title: 'Example',
  last_fetch_at: '2026-05-09T10:25:31Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 2
};

function renderLedger(props?: Partial<ManualFetchSourceLedgerProps>): void {
  render(ManualSourceLedger, {
    props: {
      sources: [sourceWithFetchTime],
      onDeleteSource: async () => {},
      onImportOpml: async () => {},
      onExportState: async () => ({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] }),
      onImportState: async () => {},
      ...props
    }
  });
}

function renderCanonicalLedger(): HTMLElement {
  renderLedger({
    sources: [
      {
        ...sourceWithFetchTime,
        id: 'simon',
        url: 'https://simonwillison.net/atom/everything',
        title: 'simonwillison.net/feed.xml'
      }
    ]
  });

  return screen.getByRole('region', { name: 'SOURCE LEDGER' });
}

describe('expected-red Manual RSS Fetch Source Ledger rendering contract', () => {
  it('renders default manual fetch actions as bracket uppercase native controls', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeVisible();
    expect(within(ledger).getByRole('button', { name: 'Fetch Example' })).toHaveTextContent('[FETCH]');
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' }).tagName).toBe('BUTTON');
  });

  it('renders active ingest/fetch labels disabled with no spinner or progress animation affordance', () => {
    renderLedger({
      onRunIngest: () => new Promise(() => undefined),
      onFetchSource: () => new Promise(() => undefined),
      manualFetchState: { ingesting: true, fetchingSourceIds: ['src_ok'] }
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const ingest = within(ledger).getByRole('button', { name: '[INGESTING...]' });
    const fetch = within(ledger).getByRole('button', { name: 'Fetching Example' });
    expect(ingest).toBeDisabled();
    expect(fetch).toBeDisabled();
    expect(fetch).toHaveTextContent('[FETCHING...]');
    expect(within(ledger).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(ledger).queryByText(/spinner|loading…|please wait/i)).not.toBeInTheDocument();
    expect(ledger.querySelector('[class*="spinner"], [class*="animate"], [data-spinner], [data-progress]')).toBeNull();
  });

  it('renders RFC3339 ingest and source fetch timestamps as HH:MM:SS', () => {
    renderLedger({
      manualFetchState: { lastIngestAt: '2026-05-09T10:25:31Z' }
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByText('last_ingest: 10:25:31')).toBeVisible();
    expect(ledger.querySelector('.source-ledger-copy')).toHaveTextContent('last_fetch: 10:25:31');
    expect(ledger).not.toHaveTextContent('2026-05-09T10:25:31Z');
  });

  it('renders terse truncated source-level errors without friendly SaaS copy or layout-shifting containers', () => {
    renderLedger({
      manualFetchState: {
        sourceErrors: {
          src_ok:
            'err: fetch failed because the upstream feed timed out after the documented source fetch timeout and should truncate here'
        }
      }
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const errorLine = within(ledger).getByText(/^err: fetch failed/);
    expect(errorLine).toBeVisible();
    expect(errorLine.textContent?.length ?? 0).toBeLessThanOrEqual(72);
    expect(ledger).not.toHaveTextContent(/sorry|oops|we couldn't|try again later|hang tight/i);
    expect(errorLine.closest('[role="alert"], [role="status"], .card, .toast')).toBeNull();
  });

  it('keeps the visual contract: bracket labels, ledger row shape, uppercase text, and no animation affordance', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(ledger).toHaveClass('contract-source-ledger');
    expect(ledger.querySelector('ul')).toHaveClass('contract-list');
    expect(ledger.querySelector('.source-ledger-row')).toHaveClass('source-ledger-row');
    expect(within(ledger).getByText('[RUN INGEST]')).toHaveTextContent(/^\[[A-Z\s]+\]$/);
    expect(within(ledger).getByText('[FETCH]')).toHaveTextContent(/^\[[A-Z]+\]$/);
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('source-ledger-delete');
    expect(within(ledger).queryByText('imported 3 sources; folders flattened')).not.toBeInTheDocument();
    expect(ledger.querySelector('[class*="spinner"], [class*="progress"], [class*="animate"]')).toBeNull();
  });

  it('matches the Source Ledger preview row copy with one primary source string and direct action columns', () => {
    const ledger = renderCanonicalLedger();
    const row = ledger.querySelector('.source-ledger-row');

    expect(row).toBeInstanceOf(HTMLLIElement);
    expect(row).toHaveTextContent('src: simonwillison.net/feed.xml · status: ok · last_fetch: 10:25:31 url: https://simonwillison.net/atom/everything [FETCH][DELETE]');
    expect(row?.querySelector('.source-ledger-actions')).toBeNull();
    expect(row?.children).toHaveLength(3);
    expect(row?.children[0]).toHaveClass('source-ledger-copy');
    expect(row?.children[1]).toHaveClass('source-ledger-url');
    expect(row?.children[2]).toHaveClass('source-ledger__actions');
    expect(row?.children[2]?.children[0]).toHaveClass('manual-fetch-action');
    expect(row?.children[2]?.children[1]).toHaveClass('source-ledger-delete');
  });
});
