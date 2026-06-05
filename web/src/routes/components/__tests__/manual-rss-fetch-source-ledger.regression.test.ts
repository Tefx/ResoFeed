import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import type { CurrentOperationInfo, FetchSourceSuccessResponse, RunIngestSuccessResponse, Source, StateBundleV1 } from '$lib/api-contract';
import { formatLocalClockTimeWithHint } from '$lib/display-time';
import SourceLedger from '../SourceLedger.svelte';

type ManualFetchSourceLedgerProps = {
  sources: Source[];
  onDeleteSource: (source: Source) => Promise<void> | void;
  onImportOpml: (opml: string) => Promise<void> | void;
  onExportOpml?: () => Promise<string | Blob> | string | Blob;
  onRunIngest?: () => Promise<RunIngestSuccessResponse>;
  onFetchSource?: (source: Source) => Promise<FetchSourceSuccessResponse>;
  onExportState: () => Promise<StateBundleV1>;
  onImportState: (bundle: StateBundleV1) => Promise<void> | void;
  currentOperation?: CurrentOperationInfo | null;
  currentOperationStatusText?: string;
  language?: 'en' | 'zh';
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
    for (const label of ['[RUN INGEST]', '[FETCH]', '[DELETE]', '[IMPORT OPML]', '[EXPORT OPML]', '[EXPORT STATE]', '[IMPORT STATE]']) {
      expect(within(ledger).getByText(label)).toHaveTextContent(label);
    }
    expect(within(ledger).queryByText('[DETAILS]')).not.toBeInTheDocument();
    expect(within(ledger).getByText('source info')).toBeVisible();
    expect(within(ledger).getByRole('group', { name: 'Source list actions' })).toHaveTextContent('SOURCE LIST');
    expect(within(ledger).getByRole('group', { name: 'Portable state actions' })).toHaveTextContent('PORTABLE STATE');
    expect(ledger).toHaveTextContent('OPML = source list; State = sources + rules + stars, import replaces.');
    expect(within(ledger).getByRole('button', { name: '[IMPORT STATE]' })).toHaveAccessibleDescription('Import State replaces active sources, rules, and stars.');
    expect(within(ledger).getByText('Import State replaces active sources, rules, and stars.')).not.toBeVisible();
    expect(within(ledger).getByRole('group', { name: 'Source list actions' })).not.toHaveTextContent('Import State replaces');
    expect(ledger).not.toHaveTextContent(/\[run ingest\]|\[fetch\]|\[details\]|\[delete\]|\[import opml\]|\[export opml\]|\[export state\]|\[import state\]/);
  });

  it('localizes ordinary Source Ledger labels in Chinese while preserving bracket actions and literals', () => {
    renderLedger({ sources: [sourceWithFetchTime], language: 'zh' });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByRole('group', { name: '来源列表操作' })).toHaveTextContent('来源列表');
    expect(within(ledger).getByRole('group', { name: '状态迁移操作' })).toHaveTextContent('状态迁移');
    expect(within(ledger).getByText('[IMPORT OPML]')).toBeVisible();
    expect(within(ledger).getByText('[FETCH]')).toBeVisible();
    expect(within(ledger).queryByText('[DETAILS]')).not.toBeInTheDocument();
    expect(within(ledger).getByText('来源信息')).toBeVisible();
    expect(within(ledger).getByText('Example')).toBeVisible();
    expect(within(ledger).getByText('https://example.com/feed.xml')).toBeVisible();
    const row = ledger.querySelector('.source-ledger__row');
    expect(row).toBeInstanceOf(HTMLLIElement);
    expect(ledger).not.toHaveTextContent('SOURCE LIST');
    expect(ledger).not.toHaveTextContent('PORTABLE STATE');
    expect(row?.querySelector('.source-ledger__name')).not.toHaveTextContent('src: Example');
    expect(row?.querySelector('.source-ledger__url')).not.toHaveTextContent('url: https://example.com/feed.xml');
    expect(ledger).toHaveTextContent('OPML = 来源列表；State = 来源 + 规则 + 星标，导入会替换。');
  });

  it('does not trigger ingest from currentOperation state without explicit RUN INGEST click', async () => {
    const onRunIngest = vi.fn(async (): Promise<RunIngestSuccessResponse> => ({ operation: 'ingest', source_id: null, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [] }));
    renderLedger({
      onRunIngest,
      currentOperation: {
        running: true,
        kind: 'manual_ingest',
        actor_kind: 'human',
        phase: 'fetching_sources',
        count: null,
        message: null,
        started_at: '2026-05-17T11:00:00Z',
        updated_at: '2026-05-17T11:00:01Z'
      }
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByRole('button', { name: '[INGESTING...]' })).toBeDisabled();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(onRunIngest).not.toHaveBeenCalled();
  });

  it('shows independent row fetch states concurrently and keeps global ingest available during local fetches', async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: FetchSourceSuccessResponse) => void) | undefined;
    let resolveSecond: typeof resolveFirst;
    const onFetchSource = vi.fn((source: Source) => new Promise<FetchSourceSuccessResponse>((resolve) => {
      const complete = () => resolve({ operation: 'source_fetch', source_id: source.id, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [] });
      if (source.id === 'src_ok') resolveFirst = complete;
      if (source.id === 'src_next') resolveSecond = complete;
    }));
    const onRunIngest = vi.fn(async (): Promise<RunIngestSuccessResponse> => ({ operation: 'ingest', source_id: null, completed: true, sources_total: 2, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [{ source_id: 'src_ok', code: 'source_busy', reason: 'source_busy', message: 'Example already fetching' }], sources_skipped: 1, status: 'completed_with_errors' }));
    renderLedger({
      sources: [sourceWithFetchTime, { ...sourceWithFetchTime, id: 'src_next', title: 'Next Source', url: 'https://next.example.com/feed.xml' }],
      onFetchSource,
      onRunIngest
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    await user.click(within(ledger).getByRole('button', { name: /\[FETCH\].*Fetch source Example/ }));
    await user.click(within(ledger).getByRole('button', { name: /\[FETCH\].*Fetch source Next Source/ }));

    const fetchingButtons = within(ledger).getAllByRole('button', { name: /\[FETCHING\.\.\.\]/ });
    expect(fetchingButtons).toHaveLength(2);
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeEnabled();

    await user.click(fetchingButtons[0]);
    await user.click(within(ledger).getByRole('button', { name: '[RUN INGEST]' }));
    expect(onFetchSource).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onRunIngest).toHaveBeenCalledTimes(1));
    expect(ledger).toHaveTextContent('sources_skipped:1');
    expect(ledger).toHaveTextContent('source_busy:1 Example already fetching');
    const ingestResult = await onRunIngest.mock.results[0]?.value;
    expect(ingestResult.errors[0]?.reason).toBe('source_busy');

    resolveFirst?.({ operation: 'source_fetch', source_id: 'src_ok', completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [] });
    resolveSecond?.({ operation: 'source_fetch', source_id: 'src_next', completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [] });
    await waitFor(() => expect(within(ledger).queryByText('[FETCHING...]')).not.toBeInTheDocument());
    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toBeEnabled();
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

  it('announces Source Ledger conflict and row diagnostics assertively', () => {
    renderLedger({
      sources: [sourceWithLongDiagnostic],
      currentOperationStatusText: 'err: operation already running — op: source_fetch · actor:human · phase:fetching'
    });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByText(/err: operation already running/)).toHaveAttribute('aria-live', 'assertive');
    expect(ledger.querySelector('.source-ledger__row .source-ledger__status')).toHaveAttribute('aria-live', 'assertive');
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
    const expectedFetchTime = formatLocalClockTimeWithHint(sourceWithFetchTime.last_fetch_at) ?? '';
    expect(header).toBeInstanceOf(HTMLElement);
    expect(within(header as HTMLElement).getByText(`last_ingest: ${expectedFetchTime}`)).toHaveClass('source-ledger__status');
    expect(within(header as HTMLElement).getByRole('button', { name: '[RUN INGEST]' })).toHaveClass('bracket-action--run-ingest');
    expect(ledger.querySelector('.source-ledger__row .source-ledger__status')).toHaveTextContent(expectedFetchTime);
    expect(ledger.querySelector('.source-ledger__row .source-ledger__status')).not.toHaveTextContent('last_fetch:');
    expect(ledger).not.toHaveTextContent('2026-05-09T10:25:31Z');
    expect(ledger).toHaveTextContent(/\d{2}:\d{2}:\d{2} local/);
    expect(ledger).not.toHaveTextContent(/UTC|Z/);
  });

  it('exports OPML as sources.opml with active and completion feedback', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:sources-opml');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const onExportOpml = vi.fn(async () => '<opml version="2.0"></opml>');
    renderLedger({ onExportOpml });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    await user.click(within(ledger).getByRole('button', { name: '[EXPORT OPML]' }));

    await waitFor(() => expect(onExportOpml).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sources-opml');
    expect(within(ledger).getByText('exported sources.opml')).toBeVisible();
    expect(within(ledger).getByRole('button', { name: '[EXPORT OPML]' })).toBeEnabled();
  });

  it('restores Import State idle label, geometry state, and focus when the file picker is cancelled', async () => {
    const user = userEvent.setup();
    const onImportState = vi.fn(async () => {});
    renderLedger({ onImportState });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const importState = within(ledger).getByRole('button', { name: '[IMPORT STATE]' });
    await user.click(importState);

    await waitFor(() => expect(importState).toHaveFocus());
    expect(importState).toHaveTextContent('[IMPORT STATE]');
    expect(importState).toBeEnabled();
    expect(importState.closest('[data-state]')).toHaveAttribute('data-state', 'idle');
    expect(ledger).not.toHaveTextContent('[IMPORTING STATE...]');
    expect(onImportState).not.toHaveBeenCalled();
  });

  it('renders source diagnostics through a visible source info disclosure without friendly SaaS copy', async () => {
    const user = userEvent.setup();
    renderLedger();

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const sourceInfo = within(ledger).getByText('source info');
    expect(sourceInfo).toBeVisible();
    expect(sourceInfo).not.toHaveClass('bracket-action');
    expect(within(ledger).queryByText('[DETAILS]')).not.toBeInTheDocument();
    expect(ledger.querySelector('.source-diagnostic-details')).not.toHaveAttribute('open');
    await user.click(sourceInfo);
    expect(ledger.querySelector('.source-diagnostic-details')).toHaveAttribute('open');
    expect(within(ledger).getByText(/feed_url: https:\/\/example.com\/feed.xml/)).toBeVisible();
    sourceInfo.focus();
    expect(sourceInfo).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(ledger.querySelector('.source-diagnostic-details')).not.toHaveAttribute('open');
    expect(ledger).not.toHaveTextContent(/sorry|oops|we couldn't|try again later|hang tight/i);
    expect(sourceInfo.closest('[role="alert"], [role="status"], .card, .toast')).toBeNull();
  });

  it('preserves raw err diagnostics and exposes the full diagnostic through title and disclosure text', async () => {
    const user = userEvent.setup();
    renderLedger({ sources: [sourceWithLongDiagnostic] });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    const status = ledger.querySelector('.source-ledger__status--error');
    expect(status).toHaveTextContent(/^err: timeout while fetching/);
    expect(status).toHaveAttribute('title', sourceWithLongDiagnostic.last_fetch_error);

    await user.click(within(ledger).getByText('source info'));
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
    const sourceInfo = within(ledger).getByText('source info');
    expect(sourceInfo).toHaveTextContent(/^source info$/);
    expect(sourceInfo).not.toHaveTextContent(/^\[[A-Z]+\]$/);
    expect(sourceInfo).not.toHaveClass('bracket-action');
    expect(within(ledger).queryByText('[DETAILS]')).not.toBeInTheDocument();
    expect(within(ledger).getByText('[RUN INGEST]')).toHaveClass('bracket-action');
    expect(within(ledger).getByText('[FETCH]')).toHaveClass('bracket-action');
    expect(sourceInfo.closest('details')).toHaveClass('source-diagnostic-details');
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('bracket-action');
    expect(within(ledger).getByText('[DELETE]')).toHaveClass('bracket-action--delete');
    // DEVIATION RECORD: type=test_error; artifact=manual-rss-fetch-source-ledger.regression.test.ts; what_changed=negative OPML receipt assertion uses `OPML outlines flattened`; why=folder terminology is stale and forbidden; impact=manual fetch still proves no unrelated OPML import receipt appears.
    expect(within(ledger).queryByText('imported 3 sources; OPML outlines flattened')).not.toBeInTheDocument();
    expect(ledger.querySelector('[class*="spinner"], [class*="progress"], [class*="animate"]')).toBeNull();
  });

  it('matches the Source Ledger preview row copy with one primary source string and direct action columns', () => {
    const ledger = renderCanonicalLedger();
    const row = ledger.querySelector('.source-ledger-row');
    const expectedFetchTime = formatLocalClockTimeWithHint(sourceWithFetchTime.last_fetch_at) ?? '';

    expect(row).toBeInstanceOf(HTMLLIElement);
    expect(row).toHaveTextContent('simonwillison.net/feed.xml');
    expect(row).not.toHaveTextContent('status: ok');
    expect(row).toHaveTextContent('https://simonwillison.net/atom/everything');
    expect(row).toHaveTextContent(expectedFetchTime);
    expect(row?.querySelector('.source-ledger__status')).toHaveAttribute('title', `last_fetch: ${expectedFetchTime}`);
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
