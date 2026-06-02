import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import type { CurrentOperationInfo, Source, StateBundleV1 } from '$lib/api-contract';
import { formatLocalClockTime } from '$lib/display-time';
import SourceLedger from '../SourceLedger.svelte';

type ManualFetchSourceLedgerProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
  onExportState: () => Promise<StateBundleV1>;
  onImportState: (bundle: StateBundleV1) => Promise<void> | void;
  currentOperation?: CurrentOperationInfo | null;
  currentOperationStatusText?: string;
};

const ManualSourceLedger = SourceLedger as Component<ManualFetchSourceLedgerProps>;
const appCss = readFileSync('src/app.css', 'utf8');

const sourceWithFetchTime: Source = {
  id: 'src_ok',
  url: 'https://example.com/feed.xml',
  title: 'Example',
  last_fetch_at: '2026-05-09T10:25:31Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 2
};

const sourceWithLongDiagnostic: Source = {
  id: 'src_err',
  url: 'https://diagnostic.example.com/feed.xml',
  title: 'Diagnostic Source',
  last_fetch_at: null,
  last_fetch_status: 'rss_fetch_error',
  last_fetch_error: 'err: timeout while fetching https://diagnostic.example.com/feed.xml after 20s with a very long raw diagnostic',
  is_active: true,
  revision: 3
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

describe('Manual RSS Fetch Source Ledger regression contract', () => {
  it('renders manual ingest and per-source fetch controls in the Source Ledger', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeInTheDocument();
    expect(within(ledger).getByRole('button', { name: /\[FETCH\].*Fetch source Example/ })).toHaveTextContent('[FETCH]');
    expect(within(ledger).getByRole('button', { name: 'Delete source: Example' })).toHaveTextContent('[DELETE]');
  });

  it('renders the canonical Source Ledger bracket actions with exact uppercase labels', () => {
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    for (const label of ['[RUN INGEST]', '[FETCH]', '[DETAILS]', '[DELETE]', '[IMPORT OPML]', '[EXPORT STATE]', '[IMPORT STATE]']) {
      expect(within(ledger).getByText(label)).toHaveTextContent(label);
    }
    expect(ledger).not.toHaveTextContent(/\[run ingest\]|\[fetch\]|\[details\]|\[delete\]|\[import opml\]|\[export state\]|\[import state\]/);
  });

  it('disables global ingest from typed current-operation state including library_reprocess without parsing status text', () => {
    renderLedger({
      currentOperation: {
        running: true,
        kind: 'library_reprocess',
        actor_kind: 'human',
        phase: 'processing_items',
        count: { current: 2, total: 5 },
        message: 'library reprocess processing item',
        started_at: '2026-05-17T11:00:00Z',
        updated_at: '2026-05-17T11:00:05Z'
      },
      currentOperationStatusText: '[REPROCESSING...] · op: library_reprocess · actor:human · phase:processing_items · 2/5 · library reprocess processing item · since 11:00:00'
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const runIngest = within(ledger).getByRole('button', { name: '[INGESTING...]' });
    expect(runIngest).toBeDisabled();
    expect(within(ledger).getByText(/op: library_reprocess/)).toBeVisible();
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
    const header = ledger.querySelector('.source-ledger__header');
    const expectedFetchTime = formatLocalClockTime(sourceWithFetchTime.last_fetch_at);
    expect(header).toBeInstanceOf(HTMLElement);
    expect(within(header as HTMLElement).getByText(`last_ingest: ${expectedFetchTime}`)).toHaveClass('source-ledger__status');
    expect(within(header as HTMLElement).getByRole('button', { name: '[RUN INGEST]' })).toHaveClass('bracket-action--run-ingest');
    expect(ledger.querySelector('.source-ledger__row .source-ledger__status')).toHaveTextContent(`last_fetch: ${expectedFetchTime}`);
    expect(ledger).not.toHaveTextContent('2026-05-09T10:25:31Z');
    expect(ledger).not.toHaveTextContent(/UTC|Z/);
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

  it('preserves raw err diagnostics and exposes the full diagnostic through title and disclosure text', async () => {
    const user = userEvent.setup();
    renderLedger({ sources: [sourceWithLongDiagnostic] });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const status = ledger.querySelector('.source-ledger__status--error');
    expect(status).toHaveTextContent(/^err: timeout while fetching/);
    expect(status).toHaveAttribute('title', sourceWithLongDiagnostic.last_fetch_error);

    await user.click(within(ledger).getByText('[DETAILS]'));
    expect(within(ledger).getByText(/fetch_error: err: timeout while fetching/)).toBeVisible();
  });

  it('returns focus to the next row after source deletion and to the Ledger heading for the final row', async () => {
    const user = userEvent.setup();
    const onDeleteSource = vi.fn(async () => {});
    renderLedger({ sources: [sourceWithFetchTime, { ...sourceWithFetchTime, id: 'src_next', title: 'Next Source', url: 'https://next.example.com/feed.xml' }], onDeleteSource });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    await user.click(within(ledger).getByRole('button', { name: 'Delete source: Example' }));
    await user.click(within(ledger).getByRole('button', { name: 'confirm delete source: Example' }));
    expect(onDeleteSource).toHaveBeenCalledWith(sourceWithFetchTime);
    expect(within(ledger).getByRole('button', { name: /\[FETCH\].*Fetch source Next Source/ })).toHaveFocus();

    await user.click(within(ledger).getByRole('button', { name: 'Delete source: Next Source' }));
    await user.click(within(ledger).getByRole('button', { name: 'confirm delete source: Next Source' }));
    expect(within(ledger).getByRole('heading', { name: 'SOURCE LEDGER' })).toHaveFocus();
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
    expect(appCss).toMatch(/\.bracket-action\s*\{[\s\S]*cursor:\s*pointer;/);
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('bracket-action');
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('bracket-action--delete');
    // DEVIATION RECORD: type=test_error; artifact=manual-rss-fetch-source-ledger.regression.test.ts; what_changed=negative OPML receipt assertion uses `OPML outlines flattened`; why=folder terminology is stale and forbidden; impact=manual fetch still proves no unrelated OPML import receipt appears.
    expect(within(ledger).queryByText('imported 3 sources; OPML outlines flattened')).not.toBeInTheDocument();
    expect(ledger.querySelector('[class*="spinner"], [class*="progress"], [class*="animate"]')).toBeNull();
  });

  it('matches the Source Ledger preview row copy with one primary source string and direct action columns', () => {
    const ledger = renderCanonicalLedger();
    const row = ledger.querySelector('.source-ledger-row');
    const expectedFetchTime = formatLocalClockTime(sourceWithFetchTime.last_fetch_at);

    expect(row).toBeInstanceOf(HTMLLIElement);
    expect(row).toHaveTextContent(`src: simonwillison.net/feed.xml · status: ok · last_fetch: ${expectedFetchTime}`);
    expect(row).toHaveTextContent('url: https://simonwillison.net/atom/everything');
    expect(row).toHaveTextContent(`last_fetch: ${expectedFetchTime}`);
    expect(row?.querySelector('.source-ledger-actions')).toBeNull();
    expect(row?.children).toHaveLength(4);
    expect(row?.children[0]).toHaveClass('source-ledger-copy');
    expect(row?.children[1]).toHaveClass('source-ledger-url');
    expect(row?.children[2]).toHaveClass('source-ledger__status');
    expect(row?.children[3]).toHaveClass('source-ledger__actions');
    expect(row?.children[3]?.children[1]).toHaveClass('bracket-action--delete');
    expect(row?.children[3]?.children[2]).toHaveClass('source-diagnostic-details');
  });
});
