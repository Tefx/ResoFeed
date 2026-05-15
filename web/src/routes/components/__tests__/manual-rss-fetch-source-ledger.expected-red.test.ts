import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import type { Source, StateBundleV1 } from '$lib/api-contract';
import SourceLedger from '../SourceLedger.svelte';

type ManualFetchSourceLedgerProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
  onExportState: () => Promise<StateBundleV1>;
  onImportState: (bundle: StateBundleV1) => Promise<void> | void;
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
  it('renders manual ingest and per-source fetch controls in the Source Ledger', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeInTheDocument();
    expect(within(ledger).getByRole('button', { name: '[FETCH]' })).toBeInTheDocument();
    expect(within(ledger).getByRole('button', { name: 'Delete source: Example' })).toHaveTextContent('[DELETE]');
  });

  it('keeps manual fetch progress free of spinner or progress animation affordance at rest', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).queryByText('[INGESTING...]')).not.toBeInTheDocument();
    expect(within(ledger).queryByText('[FETCHING...]')).not.toBeInTheDocument();
    expect(within(ledger).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(ledger).queryByText(/spinner|loading…|please wait/i)).not.toBeInTheDocument();
    expect(ledger.querySelector('[class*="spinner"], [class*="animate"], [data-spinner], [data-progress]')).toBeNull();
  });

  it('renders RFC3339 ingest and source fetch timestamps as HH:MM:SS', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).queryByText(/last_ingest:/)).not.toBeInTheDocument();
    expect(ledger.querySelector('.source-ledger__status')).toHaveTextContent('last_fetch: 10:25:31');
    expect(ledger).not.toHaveTextContent('2026-05-09T10:25:31Z');
  });

  it('renders source diagnostics through a visible details disclosure without friendly SaaS copy', async () => {
    const user = userEvent.setup();
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const details = within(ledger).getByText('[DETAILS]');
    expect(details).toBeVisible();
    expect(ledger.querySelector('.source-diagnostic-details')).not.toHaveAttribute('open');
    await user.click(details);
    expect(ledger.querySelector('.source-diagnostic-details')).toHaveAttribute('open');
    expect(within(ledger).getByText(/feed_url: https:\/\/example.com\/feed.xml/)).toBeVisible();
    details.focus();
    expect(details).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(ledger.querySelector('.source-diagnostic-details')).not.toHaveAttribute('open');
    expect(ledger).not.toHaveTextContent(/sorry|oops|we couldn't|try again later|hang tight/i);
    expect(details.closest('[role="alert"], [role="status"], .card, .toast')).toBeNull();
  });

  it('keeps the visual contract: bracket labels, ledger row shape, uppercase text, and no animation affordance', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(ledger).toHaveClass('contract-source-ledger');
    expect(ledger.querySelector('ul')).toHaveClass('contract-list');
    expect(ledger.querySelector('.source-ledger-row')).toHaveClass('source-ledger-row');
    expect(within(ledger).getByText('[DETAILS]')).toHaveTextContent(/^\[[A-Z]+\]$/);
    expect(within(ledger).getByText('[RUN INGEST]')).toHaveClass('bracket-action');
    expect(within(ledger).getByText('[FETCH]')).toHaveClass('bracket-action');
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('bracket-action');
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('bracket-action--delete');
    expect(within(ledger).queryByText('imported 3 sources; folders flattened')).not.toBeInTheDocument();
    expect(ledger.querySelector('[class*="spinner"], [class*="progress"], [class*="animate"]')).toBeNull();
  });

  it('matches the Source Ledger preview row copy with one primary source string and direct action columns', () => {
    const ledger = renderCanonicalLedger();
    const row = ledger.querySelector('.source-ledger-row');

    expect(row).toBeInstanceOf(HTMLLIElement);
    expect(row).toHaveTextContent(/src: simonwillison\.net\/feed\.xml\s+url: https:\/\/simonwillison\.net\/atom\/everything\s+last_fetch: 10:25:31\s+\[FETCH\]\s+\[DELETE\]\s+\[DETAILS\]/);
    expect(row?.querySelector('.source-ledger-actions')).toBeNull();
    expect(row?.children).toHaveLength(5);
    expect(row?.children[0]).toHaveClass('source-ledger-copy');
    expect(row?.children[1]).toHaveClass('source-ledger-url');
    expect(row?.children[2]).toHaveClass('source-ledger__status');
    expect(row?.children[3]).toHaveClass('source-ledger__actions');
    expect(row?.children[3]?.children[1]).toHaveClass('bracket-action--delete');
    expect(row?.children[4]).toHaveClass('source-diagnostic-details');
  });
});
