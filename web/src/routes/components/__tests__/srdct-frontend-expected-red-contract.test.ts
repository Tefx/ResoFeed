import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Page from '../../+page.svelte';
import SourceLedger from '../SourceLedger.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';
import type { FetchSourceSuccessResponse, ImportOpmlResponse, ItemDetail, Source, StateBundleV1 } from '$lib/api-contract';

const ownerToken = 'rfeed_srdct_expected_red_frontend_tests_000000000000000';

const expectedDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'RSS excerpt only source text for expected-red Inspector fixture.',
  extracted_text: 'Readable Inspector body for expected-red split-scroll fixture.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: expectedRedItem.url,
    original_url: expectedRedItem.url,
    story_key: expectedRedItem.story_key,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

function installPageApi(options: { revocableId?: string | null; invalidAddSource?: boolean } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/runtime/language')) return jsonResponse({ language: { code: 'en', label: 'English' }, already_applied: false });
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedDetail });
      if (url.endsWith(`/api/items/${expectedRedItem.id}/inspect`)) return jsonResponse({ item_id: expectedRedItem.id, human_inspected_at: '2026-05-09T00:00:00Z', already_applied: false });
      if (url.endsWith('/api/search')) return jsonResponse({ items: [expectedRedItem], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } });
      if (url.endsWith('/api/doctor')) return textResponse('doctor: model latency 842ms\nrss: ok');
      if (url.endsWith('/api/steer/preview') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as { command?: string };
        const command = String(body.command ?? '').trim();
        const lower = command.toLowerCase();
        if (lower === 'add source') return jsonResponse({ preview: { route_kind: 'unknown', interpreted_as: 'source_command_missing_url', will_mutate: false, changed_rules: [], message: 'URL required' } });
        if (/^https?:\/\/\S+/i.test(command)) return jsonResponse({ preview: { route_kind: 'source', interpreted_as: 'add_source', will_mutate: true, changed_rules: [], message: 'RSS URL subscription preview' } });
        if (/^(search|find)\s+\S+/i.test(command)) return jsonResponse({ preview: { route_kind: 'search', interpreted_as: 'search', will_mutate: false, changed_rules: [], message: 'retrieval: lexical search' } });
        if (lower === '/doctor') return jsonResponse({ preview: { route_kind: 'doctor', interpreted_as: 'doctor', will_mutate: false, changed_rules: [], message: 'read-only diagnostics' } });
        return jsonResponse({ preview: { route_kind: 'policy', interpreted_as: 'steer_rule', will_mutate: true, changed_rules: [{ id: 'preview_rule_srdct', rule_text: command, is_active: true, superseded_by: null, revision: 1 }], message: 'policy proposal' } });
      }
      if (url.endsWith('/api/steer') && init?.method === 'POST') {
        if (options.invalidAddSource) {
          return jsonResponse({ error: { code: 'bad_request', message: 'url required', details: {} } }, { status: 400 });
        }
        return jsonResponse({
          receipt: {
            interpreted_as: 'steer_rule',
            message: 'less celebrity coverage',
            changed_rules: [{ id: 'rule_srdct_expected_red', rule_text: 'less celebrity coverage', is_active: true, superseded_by: null, revision: 1 }],
            revocable_id: options.revocableId ?? null
          }
        });
      }
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    })
  );
}

async function renderAcceptedPage(options: { revocableId?: string | null; invalidAddSource?: boolean } = {}) {
  cleanup();
  window.localStorage.clear();
  installPageApi(options);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  const steer = await screen.findByRole('textbox', { name: 'Steer or paste RSS URL' });
  expect(steer).toHaveFocus();
  return { steer, user };
}

const sourceWithDiagnostic: Source = {
  ...expectedRedSource,
  id: 'src_srdct_expected_red',
  url: 'https://example.com/feed.xml',
  title: 'Example Source',
  last_fetch_at: '2026-05-09T14:02:05Z',
  last_fetch_status: 'rss_fetch_error',
  last_fetch_error: 'timeout while fetching upstream feed',
  revision: 4
};

function stateBundle(): StateBundleV1 {
  return { schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] };
}

function renderSourceLedger(): void {
  render(SourceLedger, {
    props: {
      sources: [sourceWithDiagnostic],
      onDeleteSource: async () => {},
      onImportOpml: async (): Promise<ImportOpmlResponse> => ({ imported: 1, skipped: 0, folders_flattened: true }),
      onRunIngest: async () => ({ operation: 'ingest', source_id: null, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 2, items_upserted: 2, errors: [], completed_at: '2026-05-09T14:00:02Z' }),
      onFetchSource: async (source: Source): Promise<FetchSourceSuccessResponse> => ({ operation: 'source_fetch', source_id: source.id, completed: false, sources_total: 1, sources_fetched: 0, items_discovered: 0, items_upserted: 0, errors: [{ source_id: source.id, code: 'timeout', message: 'timeout while fetching upstream feed' }], completed_at: '2026-05-09T14:02:20Z' }),
      onExportState: async () => stateBundle(),
      onImportState: async () => {}
    }
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('srdct expected-red frontend UI contracts', () => {
  it('reserves a blank Steer idle preview with aria-describedby and no [IDLE] chip before user input', async () => {
    const { steer } = await renderAcceptedPage();
    const preview = screen.getByRole('status', { name: 'Steer route preview' });

    expect(preview, 'DESIGN.md Steer input requires terse live receipt/preview semantics without duplicate hint copy').toHaveAttribute('aria-live', 'polite');
    expect(preview).toHaveTextContent(/^\s*$/);
    expect(preview).not.toHaveTextContent('[IDLE]');
    expect(steer).toHaveAccessibleDescription(/Steer route preview/i);
    expect(steer.getAttribute('aria-describedby')?.split(/\s+/)).toContain(preview.id);
    expect(document.body).not.toHaveTextContent(/Steer is optional correction\.\s+Steer is optional correction\./);
  });

  it('uses documented Steer route chips, Escape cancellation, assertive invalid URL feedback, and revocable-only [UNDO]', async () => {
    const { steer, user } = await renderAcceptedPage({ invalidAddSource: true });
    const preview = screen.getByRole('status', { name: 'Steer route preview' });

    await user.type(steer, 'https://example.com/feed.xml');
    await waitFor(() => expect(preview).toHaveTextContent('[ADD SOURCE]'));
    await user.clear(steer);
    await user.type(steer, 'search sqlite');
    await waitFor(() => expect(preview).toHaveTextContent('[SEARCH]'));
    await user.clear(steer);
    await user.type(steer, '/doctor');
    await waitFor(() => expect(preview).toHaveTextContent('[DOCTOR]'));
    await user.clear(steer);
    await user.type(steer, 'less celebrity coverage');
    await waitFor(() => expect(preview).toHaveTextContent('[STEER RULE]'));
    await user.keyboard('{Escape}');
    expect(steer).toHaveValue('');
    expect(steer).toHaveFocus();

    await user.type(steer, 'add source');
    await waitFor(() => expect(preview).toHaveTextContent('[INVALID]'));
    await user.click(screen.getByRole('button', { name: 'apply' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveAttribute('aria-live', 'assertive');
    expect(error).toHaveTextContent('err: url required');

    cleanup();
    const revocable = await renderAcceptedPage({ revocableId: 'receipt_srdct_revocable' });
    await revocable.user.type(revocable.steer, 'less celebrity coverage');
    const writePreview = screen.getByRole('status', { name: 'Steer route preview' });
    await waitFor(() => expect(within(writePreview).getByText('[STEER RULE]')).toBeVisible());
    expect(within(writePreview).getByRole('button', { name: 'confirm steer route preview' })).toBeVisible();
    expect(within(writePreview).getByRole('button', { name: '[CANCEL]' })).toBeVisible();
    await revocable.user.click(within(writePreview).getByRole('button', { name: 'confirm steer route preview' }));
    expect(await screen.findByRole('button', { name: '[UNDO]' })).toBeVisible();
  });

  it('keeps Source Ledger flat with canonical actions, diagnostics disclosure semantics, and no duplicate URL subscription field', async () => {
    const user = userEvent.setup();
    renderSourceLedger();
    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });

    expect(within(ledger).getByRole('button', { name: '[RUN INGEST]' })).toHaveTextContent('[RUN INGEST]');
    expect(within(ledger).getByRole('button', { name: /\[FETCH\].*Fetch source Example Source/ })).toHaveTextContent('[FETCH]');
    expect(within(ledger).getByRole('button', { name: 'Delete source: Example Source' })).toHaveTextContent('[DELETE]');
    expect(within(ledger).getByRole('button', { name: '[IMPORT OPML]' })).toBeVisible();
    const opmlFileInput = ledger.querySelector('#opml-file');
    expect(opmlFileInput).toHaveAttribute('type', 'file');
    expect(opmlFileInput).toHaveAttribute('aria-hidden', 'true');
    expect(opmlFileInput).toHaveAttribute('tabindex', '-1');
    expect(within(ledger).getByRole('button', { name: '[EXPORT OPML]' })).toBeVisible();
    expect(within(ledger).getByRole('button', { name: '[EXPORT STATE]' })).toBeVisible();
    expect(within(ledger).getByRole('button', { name: '[IMPORT STATE]' })).toBeVisible();
    expect(ledger.querySelectorAll('input[type="url"], input[name*="url" i], textarea[name*="url" i]')).toHaveLength(0);

    const details = within(ledger).getByText('[DETAILS]');
    expect(details.closest('details')).not.toHaveAttribute('open');
    await user.click(details);
    expect(details.closest('details')).toHaveAttribute('open');
    expect(within(ledger).getByText(/fetch_error: err: timeout while fetching upstream feed/)).toBeVisible();

    await user.click(within(ledger).getByRole('button', { name: '[RUN INGEST]' }));
    const header = ledger.querySelector('.source-ledger__header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText(/last_ingest: \d{2}:\d{2}:\d{2} local/)).toHaveClass('source-ledger__status');
    expect(ledger.querySelector('.source-ledger-footer')).not.toHaveTextContent(/last_ingest:/);
    const sourceRow = ledger.querySelector('.source-ledger__row');
    expect(sourceRow).not.toBeNull();
    expect((sourceRow as HTMLElement).querySelector('.source-ledger__status')).toHaveTextContent(/\d{2}:\d{2}:\d{2} local/);
    expect((sourceRow as HTMLElement).querySelector('.source-ledger__status')).not.toHaveTextContent('last_fetch:');
    expect(within(sourceRow as HTMLElement).getByRole('button', { name: /\[FETCH\].*Fetch source Example Source/ })).toHaveTextContent('[FETCH]');
    expect(ledger).not.toHaveTextContent(/job|queue|dashboard|settings|activity log|folder|tag|semantic answer|chat|RAG/i);
  });

  it('disables only the active Source Ledger fetch row while another row remains reachable for backend conflict proof', async () => {
    const user = userEvent.setup();
    let releaseFetch: (() => void) | undefined;
    const secondSource: Source = { ...sourceWithDiagnostic, id: 'src_srdct_second', title: 'Second Source', url: 'https://second.example/feed.xml' };
    render(SourceLedger, {
      props: {
        sources: [sourceWithDiagnostic, secondSource],
        onDeleteSource: async () => {},
        onImportOpml: async (): Promise<ImportOpmlResponse> => ({ imported: 1, skipped: 0, folders_flattened: true }),
        onRunIngest: async () => ({ operation: 'ingest', source_id: null, completed: true, sources_total: 2, sources_fetched: 2, items_discovered: 2, items_upserted: 2, errors: [] }),
        onFetchSource: async (source: Source): Promise<FetchSourceSuccessResponse> => {
          if (source.id === sourceWithDiagnostic.id) {
            await new Promise<void>((resolve) => { releaseFetch = resolve; });
            return { operation: 'source_fetch', source_id: source.id, completed: true, sources_total: 1, sources_fetched: 1, items_discovered: 0, items_upserted: 0, errors: [], completed_at: '2026-05-09T14:02:20Z' };
          }
          return { operation: 'source_fetch', source_id: source.id, completed: false, sources_total: 1, sources_fetched: 0, items_discovered: 0, items_upserted: 0, errors: [{ source_id: source.id, code: 'conflict', message: 'ingest already running' }] };
        },
        onExportState: async () => stateBundle(),
        onImportState: async () => {}
      }
    });

    const firstFetch = screen.getByRole('button', { name: /\[FETCH\].*Fetch source Example Source/ });
    const secondFetch = screen.getByRole('button', { name: /\[FETCH\].*Fetch source Second Source/ });
    await user.click(firstFetch);
    expect(firstFetch).toBeDisabled();
    expect(firstFetch).toHaveTextContent('[FETCHING...]');
    expect(secondFetch).not.toBeDisabled();
    await user.click(secondFetch);
    expect(await screen.findByText('err: ingest already running')).toBeVisible();
    releaseFetch?.();
  });
});
