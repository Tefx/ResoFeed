import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentOperationInfo, ItemDetail, ItemSummary, Source } from '$lib/api-contract';
import Page from '../../+page.svelte';
import Feed from '../Feed.svelte';
import Inspector from '../Inspector.svelte';

const ownerToken = 'rfeed_runtime_provenance_expected_red_0000000000000000';

const source: Source = {
  id: 'src_runtime_contract',
  url: 'https://runtime.example/feed.xml',
  title: 'Runtime Contract Source',
  last_fetch_at: '2026-05-17T10:00:00Z',
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
};

function item(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    id: 'item_runtime_contract',
    source_id: source.id,
    source_title: source.title,
    url: 'https://runtime.example/articles/primary',
    source_item_title: 'Runtime provenance contract item',
    localized_title: '运行时出处契约条目',
    title: 'Runtime provenance contract item',
    summary: 'Documented API-shaped summary payload.',
    core_insight: 'Documented API-shaped insight payload.',
    key_points: [
      '运行时契约夹具提供结构化要点数组。',
      '来源标题和本地化标题在夹具中保持分离。',
      '重处理尝试状态独立于当前内容状态。'
    ],
    display_excerpt: 'Documented API-shaped display excerpt.',
    value_tier: null,
    content_status: 'ok',
    last_reprocess_status: null,
    last_reprocess_error_code: null,
    last_reprocess_error_message: null,
    last_reprocess_at: null,
    published_at: '2026-05-17T10:00:00Z',
    first_seen_at: '2026-05-17T10:01:00Z',
    extraction_status: 'partial_extraction',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null,
    ...overrides
  };
}

function detail(summary: ItemSummary, overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    ...summary,
    feed_excerpt: 'Documented detail feed excerpt.',
    extracted_text: 'Documented detail extracted text.',
    provenance: {
      source_url: source.url,
      canonical_url: null,
      original_url: summary.url,
      story_key: summary.story_key,
      duplicate_of_item_id: summary.duplicate_of_item_id,
      grouped_source_items: []
    },
    ...overrides
  };
}

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

function internalError(message = 'unexpected api error'): Response {
  return jsonResponse({ error: { code: 'internal', message, details: {} } }, { status: 500 });
}

function runningOperation(): CurrentOperationInfo {
  return {
    running: true,
    kind: 'library_reprocess',
    actor_kind: 'human',
    phase: 'processing_items',
    count: { current: 2, total: 5 },
    message: 'library reprocess processing item',
    started_at: '2026-05-17T11:00:00Z',
    updated_at: '2026-05-17T11:00:05Z'
  };
}

interface FetchFixtureOptions {
  readonly feedItems?: ItemSummary[];
  readonly detailFails?: boolean;
  readonly shellFails?: boolean;
  readonly doctorFails?: boolean;
  readonly operation?: CurrentOperationInfo;
}

function installFetch(options: FetchFixtureOptions = {}) {
  const feedItems = options.feedItems ?? [item()];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/sources')) {
      if (options.shellFails) return internalError();
      return jsonResponse({ sources: [source] });
    }
    if (url.includes('/api/feed/today')) return jsonResponse({ items: feedItems });
    if (url.endsWith('/api/runtime/language') && method === 'GET') return jsonResponse({ language: { code: 'en', label: 'English' } });
    if (url.endsWith('/api/runtime/operation') && method === 'GET') {
      return jsonResponse({ operation: options.operation ?? { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    }
    if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
    if (url.endsWith('/api/doctor')) {
      if (options.doctorFails) return textResponse('err: doctor unavailable', { status: 500 });
      return textResponse('doctor:\nrss_fetch_errors: 0\nmodel_latency_ms: 842');
    }
    if (/\/api\/items\/[^/]+$/u.test(url) && method === 'GET') {
      if (options.detailFails) return internalError();
      const id = decodeURIComponent(url.split('/api/items/')[1] ?? '');
      const summary = feedItems.find((candidate) => candidate.id === id) ?? feedItems[0] ?? item({ id });
      return jsonResponse({ item: detail(summary) });
    }
    if (/\/api\/items\/[^/]+\/inspect$/u.test(url) && method === 'POST') return jsonResponse({ item_id: 'ok', human_inspected_at: '2026-05-17T11:02:00Z', already_applied: false });
    return jsonResponse({ error: { code: 'not_found', message: `not found: ${method} ${url}`, details: {} } }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function renderAuthenticatedPage(options: FetchFixtureOptions = {}) {
  cleanup();
  window.localStorage.clear();
  installFetch(options);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible());
  return { user };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('expected-red runtime and provenance conformance regressions', () => {
  it('F11 keeps global API/Steer errors out of persistent top shell strips and duplicate status bands', async () => {
    await renderAuthenticatedPage({ shellFails: true });

    await waitFor(() => expect(screen.getByText(/err: internal: unexpected api error/i)).toBeVisible());
    expect(document.querySelector('.shell-status.contract-feedback-error')).not.toBeInTheDocument();
  });

  it('F12 renders the /doctor diagnostics surface even when the diagnostics request fails', async () => {
    const { user } = await renderAuthenticatedPage({ doctorFails: true });

    await user.type(screen.getByRole('textbox', { name: 'Steer or paste RSS URL' }), '/doctor');
    await user.click(screen.getByRole('button', { name: 'apply' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '/doctor' })).toBeVisible());
    const doctorSurface = document.querySelector('.doctor-surface');
    expect(doctorSurface).toBeInstanceOf(HTMLElement);
    expect(within(doctorSurface as HTMLElement).getByText(/err: doctor unavailable/i)).toBeVisible();
    expect(document.querySelector('.shell-status.contract-feedback-error')).not.toBeInTheDocument();
  });

  it('F16 renders distinct same-source same-title items when no authoritative grouping fields exist', () => {
    const first = item({ id: 'item_same_title_1', url: 'https://runtime.example/articles/a', title: 'Same title distinct item' });
    const second = item({ id: 'item_same_title_2', url: 'https://runtime.example/articles/b', title: 'Same title distinct item' });

    render(Feed, {
      props: {
        items: [first, second],
        selectedItemId: null,
        onSelect: vi.fn(),
        onResonanceToggle: vi.fn()
      }
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(document.querySelector(`[data-item-id="${first.id}"]`)).toBeInTheDocument();
    expect(document.querySelector(`[data-item-id="${second.id}"]`)).toBeInTheDocument();
  });

  it('F17 forbids Inspector URL fallback grouping without story_key, duplicate_of_item_id, or provenance.grouped_source_items', () => {
    const selected = detail(item({ id: 'item_url_selected', url: 'https://runtime.example/story?utm=feed#comments', title: 'Selected URL fallback candidate' }));
    const candidate = item({ id: 'item_url_candidate', url: 'https://runtime.example/story?ref=rss#section', title: 'URL-similar but ungrouped candidate' });

    render(Inspector, {
      props: {
        item: selected,
        mode: 'desktop-split',
        groupedSourceCandidates: [selected, candidate],
        sources: [source]
      }
    });

    const inspector = screen.getByRole('complementary', { name: selected.title });
    expect(inspector.querySelector('.contract-grouped-sources')).not.toBeInTheDocument();
    expect(within(inspector).queryByText(/Grouped story with 2 source items/i)).not.toBeInTheDocument();
  });

  it('F18 omits invented hard-coded quality claims for arbitrary item data', () => {
    const arbitraryItem = detail(item({ id: 'item_quality_unproven', value_tier: null, extraction_status: 'partial_extraction', model_status: 'summary_unavailable' }));

    render(Inspector, {
      props: {
        item: arbitraryItem,
        mode: 'desktop-split',
        groupedSourceCandidates: [arbitraryItem],
        sources: [source]
      }
    });

    expect(screen.queryByText(/source quality is high; complete, attributed, and extracted/i)).not.toBeInTheDocument();
  });

  it('F19 separates detail API failure from readable fallback payload instead of rendering both as valid detail content', async () => {
    const summary = item({ id: 'item_detail_failure', title: 'Fallback summary title after detail failure' });
    await renderAuthenticatedPage({ feedItems: [summary], detailFails: true });

    const inspector = screen.getByRole('complementary', { name: summary.title });
    await waitFor(() => expect(within(inspector).getByRole('alert')).toHaveTextContent(/err: internal: unexpected api error/i));
    expect(within(inspector).queryByRole('heading', { name: summary.title })).not.toBeInTheDocument();
    expect(within(inspector).queryByText(summary.summary ?? '')).not.toBeInTheDocument();
  });

  it('F25 renders current operation copy in the canonical op/actor/phase/counts/since shape', async () => {
    const { user } = await renderAuthenticatedPage({ operation: runningOperation() });
    const menu = document.querySelector('details[aria-label="RESOFEED surface menu"]');
    expect(menu).toBeInstanceOf(HTMLDetailsElement);

    await user.click(within(menu as HTMLElement).getByText('RESOFEED'));

    await waitFor(() => {
      expect(within(menu as HTMLElement).getByText(/op:\s*library_reprocess\s*·\s*actor:human\s*·\s*phase:processing_items\s*·\s*2\/5\s*·\s*library reprocess processing item\s*·\s*since\s*\d{2}:\d{2}:\d{2} local/i)).toBeVisible();
    });
    expect(within(menu as HTMLElement).queryByText(/current operation:|msg:|started:|updated:/i)).not.toBeInTheDocument();
  });
});
