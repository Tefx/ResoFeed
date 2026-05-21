import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentOperationInfo, ItemDetail, ItemSummary } from '$lib/api-contract';
import Page from '../../+page.svelte';
import Inspector from '../Inspector.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';

const ownerToken = 'rfeed_item_reingest_ui_0000000000000000000000';

const modelErrorOperation: CurrentOperationInfo = {
  running: true,
  kind: 'library_reprocess',
  actor_kind: 'human',
  phase: 'processing_items',
  count: { current: 2, total: 5 },
  message: 'library reprocess processing item',
  started_at: '2026-05-21T11:00:00Z',
  updated_at: '2026-05-21T11:00:02Z'
};

const failedItem: ItemSummary = {
  ...expectedRedItem,
  id: 'item_reingest_expected_red',
  title: 'Model latency item requires Inspector re-ingest',
  summary: null,
  core_insight: null,
  display_excerpt: 'RSS excerpt remains source evidence while model output is unavailable.',
  extraction_status: 'full',
  model_status: 'model_latency_error',
  story_key: null,
  duplicate_of_item_id: null
};

const failedDetail: ItemDetail = {
  ...failedItem,
  feed_excerpt: 'RSS excerpt remains source evidence while model output is unavailable.',
  extracted_text: 'Readable source article body exists, but model summary fields failed and should be retryable from Inspector only.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: failedItem.url,
    original_url: failedItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

function jsonResponse(body: object, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function installAuthenticatedRuntimeFetch(options: { reingestConflict?: boolean } = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
    if (url.includes('/api/feed/today')) return jsonResponse({ items: [failedItem] });
    if (url.endsWith('/api/runtime/language')) return jsonResponse({ language: { code: 'en', label: 'English' } });
    if (url.endsWith('/api/runtime/operation')) return jsonResponse({ operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
    if (url.endsWith(`/api/items/${failedItem.id}/inspect`) && method === 'POST') {
      return jsonResponse({ item_id: failedItem.id, human_inspected_at: '2026-05-21T00:00:00Z', already_applied: false });
    }
    if (url.endsWith(`/api/items/${failedItem.id}/reingest`) && method === 'POST') {
      if (options.reingestConflict) {
        return jsonResponse({
          error: {
            code: 'conflict',
            message: 'reingest blocked',
            details: { current_operation: modelErrorOperation }
          }
        }, { status: 409 });
      }
      return jsonResponse({
        already_applied: false,
        reingest: {
          item_id: failedItem.id,
          status: 'completed',
          item_updated: true,
          fts_updated: true,
          model: 'openai/gpt-4.1-mini',
          item: {
            ...failedDetail,
            summary: 'Re-ingested summary.',
            core_insight: 'Re-ingested core insight.',
            extraction_status: 'full',
            model_status: 'ok'
          }
        }
      });
    }
    if (url.endsWith(`/api/items/${failedItem.id}`)) return jsonResponse({ item: failedDetail });
    return jsonResponse({ error: { code: 'not_found', message: `not found: ${method} ${url}`, details: {} } }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function renderAuthenticatedPage(options: { reingestConflict?: boolean } = {}) {
  cleanup();
  window.localStorage.clear();
  installAuthenticatedRuntimeFetch(options);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  await waitFor(() => expect(screen.getByLabelText('Steer or paste RSS URL')).toBeVisible());
  return { user };
}

function inspectorContractSnapshot(root: HTMLElement): string {
  const panel = root.querySelector('[data-contract="inspector-reingest"]');
  const model = root.querySelector('[name="reingest-model"]');
  const prompt = root.querySelector('[name="reingest-prompt"]');
  const sourceEvidence = root.querySelector('[aria-label="Source evidence"], details[aria-label="Source evidence"]');
  const originalLink = root.querySelector('.inspector-original-link');
  return JSON.stringify({
    reingestPanelText: panel?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    modelControl: model?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    promptControl: prompt ? 'present' : null,
    sourceEvidenceCollapsed: sourceEvidence instanceof HTMLDetailsElement ? !sourceEvidence.open : false,
    originalLinkTranslate: originalLink?.getAttribute('translate') ?? null
  }, null, 2);
}

describe('expected-red Inspector item re-ingest UI contract', () => {
  it('renders item re-ingest only in the Inspector and records the exact DOM contract snapshot', async () => {
    const { user } = await renderAuthenticatedPage();

    expect(screen.queryByRole('button', { name: /re-ingest item/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/item re-ingest/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${failedItem.title}` }));
    const inspector = screen.getByRole('complementary', { name: failedItem.title });

    expect(inspectorContractSnapshot(inspector)).toMatchInlineSnapshot(`
"{
  \"reingestPanelText\": \"ITEM RE-INGEST Model Default model One-time prompt [RE-INGEST ITEM]\",
  \"modelControl\": \"Default model\",
  \"promptControl\": \"present\",
  \"sourceEvidenceCollapsed\": true,
  \"originalLinkTranslate\": \"no\"
}"
`);
    expect(within(inspector).getByLabelText('Item re-ingest')).toBeVisible();
    expect(screen.queryByRole('button', { name: /re-ingest library/i })).not.toBeInTheDocument();
  });

  it('keeps source evidence collapsed by default and source identifiers literal translate=no', () => {
    render(Inspector, { props: { item: failedDetail, mode: 'desktop-split' } });
    const inspector = screen.getByRole('complementary', { name: failedDetail.title });

    expect(within(inspector).getByRole('link', { name: 'original link' })).toHaveAttribute('translate', 'no');
    expect(within(inspector).getByLabelText('Source: Example Source')).toHaveAttribute('translate', 'no');
    const sourceEvidence = within(inspector).getByLabelText('Source evidence');
    expect(sourceEvidence.tagName, 'product gap: source evidence should be a disclosure details element').toBe('DETAILS');
    expect(sourceEvidence).not.toHaveAttribute('open');
  });

  it('sends Default model as null, treats prompt as one-time state, and clears temporary form state after success', async () => {
    const { user } = await renderAuthenticatedPage();
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${failedItem.title}` }));
    const inspector = screen.getByRole('complementary', { name: failedItem.title });

    await user.selectOptions(within(inspector).getByLabelText('Model'), 'default');
    await user.type(within(inspector).getByLabelText('One-time prompt'), 'Retry with article-only extraction.');
    await user.click(within(inspector).getByRole('button', { name: '[RE-INGEST ITEM]' }));

    const request = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith(`/api/items/${failedItem.id}/reingest`));
    const body = JSON.parse(String(request?.[1]?.body ?? '{}')) as Record<string, unknown>;
    expect(body).toEqual({
      actor_kind: 'human',
      actor_id: 'owner',
      idempotency_key: expect.any(String),
      model: null,
      prompt: 'Retry with article-only extraction.'
    });
    expect(body.idempotency_key).not.toBe('');
    await waitFor(() => expect(within(inspector).getByLabelText('One-time prompt')).toHaveValue(''));
    expect(window.localStorage.getItem('resofeed.itemReingestPrompt')).toBeNull();
    expect(window.localStorage.getItem(`resofeed.itemReingestPrompt.${failedItem.id}`)).toBeNull();
  });

  it('renders current-operation conflict detail when item re-ingest is blocked', async () => {
    const { user } = await renderAuthenticatedPage({ reingestConflict: true });
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${failedItem.title}` }));
    const inspector = screen.getByRole('complementary', { name: failedItem.title });

    await user.click(within(inspector).getByRole('button', { name: '[RE-INGEST ITEM]' }));

    const conflict = await within(inspector).findByRole('alert', { name: /item re-ingest/i });
    expect(conflict).toHaveTextContent('err: reingest blocked — op: library_reprocess · actor:human · phase:processing_items · 2/5 · library reprocess processing item · since 11:00:00');
  });

  it('clears transient item re-ingest form and status state when the Inspector item changes', async () => {
    const user = userEvent.setup();
    const secondDetail: ItemDetail = {
      ...failedDetail,
      id: 'item_reingest_expected_red_second',
      title: 'Second Inspector item starts clean',
      url: 'https://example.com/second-inspector-item',
      provenance: {
        ...failedDetail.provenance,
        original_url: 'https://example.com/second-inspector-item',
        canonical_url: 'https://example.com/second-inspector-item'
      }
    };
    const onReingestItem = vi.fn(async () => {
      throw new Error('err: model retry failed for item 1');
    });
    const view = render(Inspector, {
      props: {
        item: failedDetail,
        mode: 'desktop-split',
        showReingest: true,
        onReingestItem
      }
    });

    const firstInspector = screen.getByRole('complementary', { name: failedDetail.title });
    const firstPanel = within(firstInspector).getByLabelText('Item re-ingest');
    await user.type(within(firstPanel).getByLabelText('One-time prompt'), 'Item 1 prompt');
    await user.click(within(firstPanel).getByRole('button', { name: '[RE-INGEST ITEM]' }));

    await within(firstPanel).findByRole('alert', { name: /item re-ingest/i });
    expect(within(firstPanel).getByLabelText('One-time prompt')).toHaveValue('Item 1 prompt');
    expect(within(firstPanel).getByLabelText('Item re-ingest status')).toHaveTextContent('err: model retry failed for item 1');

    await view.rerender({
      item: secondDetail,
      mode: 'desktop-split',
      showReingest: true,
      onReingestItem
    });

    const secondInspector = screen.getByRole('complementary', { name: secondDetail.title });
    const secondPanel = within(secondInspector).getByLabelText('Item re-ingest');
    expect(within(secondPanel).getByLabelText('One-time prompt')).toHaveValue('');
    expect(within(secondPanel).getByLabelText('Model')).toHaveValue('default');
    expect(within(secondPanel).queryByLabelText('Item re-ingest status')).not.toBeInTheDocument();
    expect(secondInspector).toHaveTextContent('Second Inspector item starts clean');
    expect(secondInspector).not.toHaveTextContent('Item 1 prompt');
    expect(secondInspector).not.toHaveTextContent('err: model retry failed for item 1');
  });
});
