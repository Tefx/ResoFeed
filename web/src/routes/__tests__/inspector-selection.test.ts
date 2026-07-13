import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Page from '../+page.svelte';
import type { ItemDetail, ItemSummary } from '$lib/api-contract';
import { expectedRedItem, expectedRedSource } from '../../test/contract-fixtures';

const ownerToken = 'rfeed_rfbug001_selection_unit_owner_token_000000';
const itemA: ItemSummary = { ...expectedRedItem, id: 'item_rfbug001_a', title: 'RF BUG item A', localized_title: 'RF BUG item A' };
const itemB: ItemSummary = { ...expectedRedItem, id: 'item_rfbug001_b', title: 'RF BUG item B', localized_title: 'RF BUG item B' };

function detail(item: ItemSummary): ItemDetail {
  return {
    ...item,
    feed_excerpt: `Readable excerpt for ${item.title}`,
    source_evidence_text: `Readable evidence for ${item.title}`,
    extracted_text: `Readable detail for ${item.title}`,
    provenance: {
      source_url: expectedRedSource.url,
      canonical_url: item.url,
      original_url: item.url,
      story_key: null,
      duplicate_of_item_id: null,
      grouped_source_items: []
    }
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installSelectionAPI(options: { failBInspection?: boolean } = {}) {
  let releaseAInspection: (() => void) | undefined;
  let delayAInspection = false;
  const calls: string[] = [];

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://resofeed.test');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/api/sources') return json({ sources: [expectedRedSource] });
    if (url.pathname === '/api/feed/today') return json({ items: [itemA, itemB] });
    if (url.pathname === '/api/runtime/language') return json({ language: { code: 'en', label: 'English' } });
    if (url.pathname === '/api/runtime/operation') return json({ operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (url.pathname === '/api/runtime/openrouter-models' || url.pathname === '/api/runtime/openrouter/models') return json({ models: [] });
    if (url.pathname === '/api/steer/active') return json({ rules: [] });
    if (url.pathname === `/api/items/${itemA.id}/inspect`) {
      if (!delayAInspection) return json({ item_id: itemA.id, human_inspected_at: null, already_applied: false });
      return new Promise<Response>((resolve) => { releaseAInspection = () => resolve(json({ item_id: itemA.id, human_inspected_at: null, already_applied: false })); });
    }
    if (url.pathname === `/api/items/${itemB.id}/inspect`) {
      if (options.failBInspection) return json({ error: { code: 'internal', message: 'inspection marker unavailable', details: {} } }, 500);
      return json({ item_id: itemB.id, human_inspected_at: null, already_applied: false });
    }
    if (url.pathname === `/api/items/${itemA.id}`) return json({ item: detail(itemA) });
    if (url.pathname === `/api/items/${itemB.id}`) return json({ item: detail(itemB) });
    return json({ error: { code: 'not_found', message: 'not found', details: {} } }, 404);
  }));

  return {
    calls,
    delayAInspection: () => { delayAInspection = true; },
    releaseAInspection: () => releaseAInspection?.()
  };
}

async function renderAcceptedPage(api: ReturnType<typeof installSelectionAPI>) {
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  await screen.findByRole('heading', { name: itemA.title });
  return { api, user };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('RF-BUG-001 Inspector selection state', () => {
  it('keeps the current item ready when a prior inspection releases after the next detail', async () => {
    const api = installSelectionAPI();
    const { user } = await renderAcceptedPage(api);
    api.delayAInspection();

    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${itemA.title}` }));
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${itemB.title}` }));
    await screen.findByRole('heading', { name: itemB.title });
    api.releaseAInspection();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: itemB.title }), 'Expected selected inspector item to remain current').toBeVisible();
      expect(screen.queryByText(/^loading$/i), 'Expected selected inspector item to remain current without stale loading state').not.toBeInTheDocument();
    });
  });

  it('keeps readable detail when inspection provenance fails and exposes a separate diagnostic', async () => {
    const api = installSelectionAPI({ failBInspection: true });
    const { user } = await renderAcceptedPage(api);
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${itemB.title}` }));

    expect(await screen.findByRole('heading', { name: itemB.title })).toBeVisible();
    expect(screen.getByText(`Readable detail for ${itemB.title}`)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(/inspection marker unavailable/i);
  });
});
