import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import type { Source } from '$lib/api-contract';
import SourceLedger from '../SourceLedger.svelte';
import { documentedRunIngestSourceError } from '../../../test/manual-rss-fetch-fixtures';

type ManualFetchSourceLedgerProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
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
      ...props
    }
  });
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
      manualFetchState: { lastIngestAt: documentedRunIngestSourceError.ingest.last_ingest_at }
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByText('last ingest: 10:25:31')).toBeVisible();
    expect(within(ledger).getByText('last fetch: 10:25:31')).toBeVisible();
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
    expect(within(ledger).getByText('[RUN INGEST]')).toHaveTextContent(/^\[[A-Z\s]+\]$/);
    expect(within(ledger).getByText('[FETCH]')).toHaveTextContent(/^\[[A-Z]+\]$/);
    expect(ledger.querySelector('[class*="spinner"], [class*="progress"], [class*="animate"]')).toBeNull();
  });
});
