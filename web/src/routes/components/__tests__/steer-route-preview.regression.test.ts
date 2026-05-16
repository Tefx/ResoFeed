import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Page from '../../+page.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';
import type { ItemDetail } from '$lib/api-contract';

const ownerToken = 'rfeed_expected_red_steer_preview_000000000000000000';

const expectedRedDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'RSS excerpt for Steer route preview fixture.',
  extracted_text: 'Readable Inspector text for Steer route preview fixture.',
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

function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'text/plain', ...init.headers }
  });
}

function installSteerPreviewApi(options: { revocable?: boolean; warningOnly?: boolean; invalid?: boolean } = {}) {
  const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.endsWith('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      if (url.endsWith('/api/doctor')) return textResponse('doctor: model latency 842ms\nrss: ok');
      if (url.endsWith('/api/search')) {
        return jsonResponse({ items: [expectedRedItem], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } });
      }
      if (url.endsWith('/api/steer') && init?.method === 'POST') {
        if (options.invalid) {
          return jsonResponse({ error: { code: 'bad_request', message: 'url required', details: {} } }, { status: 400 });
        }
        return jsonResponse({
          receipt: {
            interpreted_as: options.warningOnly ? 'find_alias_warning' : 'steer_rule',
            message: options.warningOnly ? 'find maps to SEARCH; retrieval: lexical search' : 'less celebrity coverage',
            changed_rules: options.warningOnly ? [] : [{ id: 'rule_expected_red', rule_text: 'less celebrity coverage' }],
            revocable_id: options.revocable ? 'receipt_revocable_expected_red' : null
          }
        });
      }
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    })
  );
  return calls;
}

async function renderAcceptedPage(options: { revocable?: boolean; warningOnly?: boolean; invalid?: boolean } = {}) {
  cleanup();
  window.localStorage.clear();
  const calls = installSteerPreviewApi(options);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  const steer = await screen.findByLabelText('Steer or paste RSS URL');
  expect(steer).toHaveFocus();
  return { calls, steer, user };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('Steer route preview and receipt regression contracts', () => {
  it('keeps idle preview space reserved but blank with no [IDLE] chip, no duplicate hint, and aria-describedby wiring', async () => {
    const { steer } = await renderAcceptedPage();
    const form = steer.closest('form');
    expect(form).toHaveClass('steer-form');

    const preview = screen.getByRole('status', { name: 'Steer route preview' });
    expect(preview).toHaveAttribute('aria-live', 'polite');
    expect(preview).toHaveClass('steer-route-preview');
    expect(preview).toHaveTextContent(/^\s*$/);
    expect(preview.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(preview).not.toHaveTextContent('[IDLE]');
    expect(document.body).not.toHaveTextContent(/Steer is optional correction\.\s+Steer is optional correction\./);
    expect(steer).toHaveAccessibleDescription(/Steer route preview/i);
    expect(steer.getAttribute('aria-describedby')?.split(/\s+/)).toContain(preview.id);
  });

  it('classifies [ADD SOURCE], [SEARCH], [DOCTOR], [STEER RULE], and [INVALID] previews from exact Steer input copy', async () => {
    const { steer, user } = await renderAcceptedPage();
    const preview = screen.getByRole('status', { name: 'Steer route preview' });

    await user.type(steer, 'https://example.com/feed.xml');
    expect(preview).toHaveTextContent('[ADD SOURCE]');

    await user.clear(steer);
    await user.type(steer, 'search sqlite');
    expect(preview).toHaveTextContent('[SEARCH]');

    await user.clear(steer);
    await user.type(steer, '/doctor');
    expect(preview).toHaveTextContent('[DOCTOR]');

    await user.clear(steer);
    await user.type(steer, 'less celebrity coverage');
    expect(preview).toHaveTextContent('[STEER RULE]');

    await user.clear(steer);
    await user.type(steer, 'add source');
    expect(preview).toHaveTextContent('[INVALID]');
    expect(preview).toHaveAccessibleDescription(/URL required/i);
  });

  it('retains focus, Escape cancels unsent text, invalid add-source is assertive, and find alias remains warning-only', async () => {
    const { steer, user } = await renderAcceptedPage({ invalid: true });
    await user.type(steer, 'add source');
    await user.click(screen.getByRole('button', { name: 'apply' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveAttribute('aria-live', 'assertive');
    expect(error).toHaveTextContent('err: url required');
    expect(steer).toHaveFocus();

    await user.clear(steer);
    await user.type(steer, 'less celebrity coverage');
    await user.keyboard('{Escape}');
    expect(steer).toHaveValue('');
    expect(steer).toHaveFocus();

    cleanup();
    const rerendered = await renderAcceptedPage({ warningOnly: true });
    await rerendered.user.type(rerendered.steer, 'find sqlite');
    await rerendered.user.click(screen.getByRole('button', { name: 'apply' }));
    const receipt = await screen.findByRole('status', { name: 'Steer receipt' });
    expect(receipt).toHaveAttribute('aria-live', 'polite');
    expect(receipt).toHaveTextContent('find maps to SEARCH; retrieval: lexical search');
    expect(screen.queryByRole('button', { name: '[UNDO]' })).not.toBeInTheDocument();
  });

  it('renders write preview [APPLY]/[CANCEL] and exposes [UNDO] only when backend returns a revocable id', async () => {
    const { steer, user } = await renderAcceptedPage({ revocable: true });
    await user.type(steer, 'less celebrity coverage');

    const preview = screen.getByRole('status', { name: 'Steer route preview' });
    expect(within(preview).getByText('[STEER RULE]')).toBeVisible();
    expect(within(preview).getByRole('button', { name: 'confirm steer route preview' })).toBeVisible();
    expect(within(preview).getByRole('button', { name: '[CANCEL]' })).toBeVisible();

    await user.click(within(preview).getByRole('button', { name: 'confirm steer route preview' }));
    const receipt = await screen.findByRole('status', { name: 'Steer receipt' });
    expect(receipt).toHaveTextContent('applied: less celebrity coverage');
    expect(within(receipt).getByRole('button', { name: '[UNDO]' })).toBeVisible();

    cleanup();
    const nonRevocable = await renderAcceptedPage({ revocable: false });
    await nonRevocable.user.type(nonRevocable.steer, 'less celebrity coverage');
    await nonRevocable.user.click(screen.getByRole('button', { name: 'confirm steer route preview' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Steer receipt' })).toHaveTextContent('applied: less celebrity coverage'));
    expect(screen.queryByRole('button', { name: '[UNDO]' })).not.toBeInTheDocument();
  });
});
