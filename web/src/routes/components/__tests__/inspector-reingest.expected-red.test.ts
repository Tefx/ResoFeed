import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentOperationInfo, ItemDetail, ItemReingestResponse, ItemSummary } from '$lib/api-contract';
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

const modelBackedDetail: ItemDetail = {
  ...failedDetail,
  id: 'item_model_backed_source_disclosure_expected_red',
  title: 'Model-backed item still exposes source text by disclosure',
  summary: 'A complete model-backed paragraph explains the source material clearly.',
  core_insight: 'The source disclosure remains the verification path for model-backed reading.',
  display_excerpt: 'RSS excerpt remains available as source fallback.',
  extraction_status: 'full',
  model_status: 'ok',
  feed_excerpt: 'RSS excerpt remains available as source fallback.',
  extracted_text: 'Full source article text remains available for verification behind a collapsed disclosure.',
  provenance: {
    ...failedDetail.provenance,
    original_url: 'https://example.com/model-backed-source-disclosure',
    canonical_url: 'https://example.com/model-backed-source-disclosure'
  }
};

const openRouterModelListing = {
  models: [
    { id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }
  ]
} as const;

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
    if (url.endsWith('/api/runtime/openrouter-models')) return jsonResponse(openRouterModelListing);
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
          language: 'en',
          error: null,
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

function nodeOrder(root: HTMLElement, selector: string): number {
  const node = root.querySelector(selector);
  expect(node, `${selector} should exist`).toBeTruthy();
  return Array.from(root.querySelectorAll('*')).indexOf(node as Element);
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
  \"reingestPanelText\": \"REGENERATE [REGENERATE]\",
  \"modelControl\": null,
  \"promptControl\": null,
  \"sourceEvidenceCollapsed\": true,
  \"originalLinkTranslate\": \"no\"
}"
`);
    expect(within(inspector).getByLabelText('Item re-ingest')).toBeVisible();
    expect(nodeOrder(inspector, '[data-contract="inspector-reingest"]')).toBeLessThan(nodeOrder(inspector, '[aria-label="Source evidence"]'));
    expect(screen.queryByRole('button', { name: /re-ingest library/i })).not.toBeInTheDocument();
  });

  it('expands low-chrome configuring state, cancels back to the idle affordance, and restores focus', async () => {
    const user = userEvent.setup();
    render(Inspector, { props: { item: failedDetail, mode: 'desktop-split', showReingest: true, onReingestItem: vi.fn(), openRouterModels: [...openRouterModelListing.models], openRouterModelListState: 'available' } });
    const inspector = screen.getByRole('complementary', { name: failedDetail.title });
    const panel = within(inspector).getByLabelText('Item re-ingest');
    const idleButton = within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' });

    expect(within(panel).queryByLabelText('Model')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('One-time prompt')).not.toBeInTheDocument();
    await user.click(idleButton);

    const confirm = within(panel).getByRole('button', { name: '[CONFIRM RE-INGEST]' });
    expect(confirm).toHaveFocus();
    expect(within(panel).queryByLabelText('Model')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('One-time prompt')).not.toBeInTheDocument();
    const advanced = within(panel).getByRole('button', { name: '[ADVANCED OPTIONS ↓]' });
    expect(advanced).toHaveAttribute('aria-expanded', 'false');
    await user.click(advanced);

    expect(within(panel).getByText('model:')).toBeVisible();
    expect(within(panel).getByText('extra prompt (one-time, not saved)')).toBeVisible();
    expect(within(panel).getByText(/guidance only; cannot override schema, language, source identifiers, safety, status, or persistence/i)).toBeVisible();
    expect(within(panel).getByText(/may change emphasis, angle, or fact selection only among source-backed facts/i)).toBeVisible();
    expect(within(panel).getByLabelText('Model')).toHaveValue('default');
    await user.selectOptions(within(panel).getByLabelText('Model'), 'openai/gpt-4.1-mini');
    await user.type(within(panel).getByLabelText('One-time prompt'), 'Temporary prompt');
    await user.click(within(panel).getByRole('button', { name: '[CANCEL]' }));

    const restoredIdleButton = within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' });
    expect(restoredIdleButton).toHaveFocus();
    expect(within(panel).queryByLabelText('Model')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('One-time prompt')).not.toBeInTheDocument();
    await user.click(restoredIdleButton);
    expect(within(panel).queryByLabelText('Model')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('One-time prompt')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: '[ADVANCED OPTIONS ↓]' }));
    expect(within(panel).getByLabelText('Model')).toHaveValue('default');
    expect(within(panel).getByLabelText('One-time prompt')).toHaveValue('');
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

  it('expected-red: keeps model-backed source text behind an accessible collapsed disclosure', () => {
    render(Inspector, { props: { item: modelBackedDetail, mode: 'desktop-split', showReingest: true } });
    const inspector = screen.getByRole('complementary', { name: modelBackedDetail.title });

    expect(within(inspector).getByLabelText('Source: Example Source')).toHaveAttribute('translate', 'no');
    expect(within(inspector).getByText('A complete model-backed paragraph explains the source material clearly.')).toBeVisible();
    expect(within(inspector).getByText('The source disclosure remains the verification path for model-backed reading.')).toBeVisible();

    const sourceText = within(inspector).getByLabelText('Source text');
    expect(sourceText.tagName, 'product gap: model-backed Source text should be an accessible disclosure').toBe('DETAILS');
    expect(sourceText, 'product gap: Source text disclosure should be collapsed by default').not.toHaveAttribute('open');
    expect(within(sourceText).getByText('Full source article text remains available for verification behind a collapsed disclosure.')).toBeInTheDocument();
  });

  it('expected-red: surfaces live OpenRouter model options and model-list diagnostics in the Inspector model control', async () => {
    const { user } = await renderAuthenticatedPage();
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${failedItem.title}` }));
    const inspector = screen.getByRole('complementary', { name: failedItem.title });
    const panel = within(inspector).getByLabelText('Item re-ingest');
    await user.click(within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' }));
    expect(within(panel).queryByLabelText('Model')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: '[ADVANCED OPTIONS ↓]' }));
    const modelControl = within(panel).getByLabelText('Model');

    expect(within(panel).getByText(/model list: 2 OpenRouter models available/i), 'product gap: model-list diagnostics should be visible next to the selector').toBeVisible();
    expect(within(modelControl).getByRole('option', { name: 'default: account_default' })).toHaveValue('default');
    expect(within(modelControl).getByRole('option', { name: 'GPT 4.1 Mini (openai/gpt-4.1-mini)' })).toHaveValue('openai/gpt-4.1-mini');
    expect(within(modelControl).getByRole('option', { name: 'Claude 3.5 Sonnet (anthropic/claude-3.5-sonnet)' })).toHaveValue('anthropic/claude-3.5-sonnet');
  });

  it('sends Default model as null, treats prompt as one-time state, and clears temporary form state after success', async () => {
    const { user } = await renderAuthenticatedPage();
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${failedItem.title}` }));
    const inspector = screen.getByRole('complementary', { name: failedItem.title });
    const panel = within(inspector).getByLabelText('Item re-ingest');

    await user.click(within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' }));
    await user.click(within(panel).getByRole('button', { name: '[ADVANCED OPTIONS ↓]' }));
    await user.selectOptions(within(panel).getByLabelText('Model'), 'default');
    await user.type(within(panel).getByLabelText('One-time prompt'), 'Retry with article-only extraction.');
    await user.click(within(panel).getByRole('button', { name: '[CONFIRM RE-INGEST]' }));

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
    await waitFor(() => expect(within(panel).queryByLabelText('One-time prompt')).not.toBeInTheDocument());
    expect(window.localStorage.getItem('resofeed.itemReingestPrompt')).toBeNull();
    expect(window.localStorage.getItem(`resofeed.itemReingestPrompt.${failedItem.id}`)).toBeNull();
    expect(
      within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' }),
      'R1 expected-red: successful re-ingest must collapse back to the single idle affordance'
    ).toBeVisible();
    expect(within(panel).getByRole('status', { name: /item re-ingest status/i })).toHaveTextContent('re-ingest complete · search refreshed');
    expect(within(panel).queryByRole('button', { name: '[CONFIRM RE-INGEST]' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '[CANCEL]' })).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('Model')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('One-time prompt')).not.toBeInTheDocument();
  });

  it('expected-red: localizes zh Inspector and re-ingest chrome while preserving literal source identifiers', async () => {
    const user = userEvent.setup();
    render(Inspector, {
      props: {
        item: {
          ...failedDetail,
          summary: '显式重处理后的中文摘要。',
          core_insight: '显式重处理后的核心洞察。',
          model_status: 'ok'
        },
        mode: 'desktop-split',
        language: 'zh',
        showReingest: true,
        onReingestItem: vi.fn(),
        openRouterModels: [...openRouterModelListing.models],
        openRouterModelListState: 'available'
      }
    });

    const inspector = screen.getByRole('complementary', { name: failedDetail.title });
    expect(within(inspector).getByText('检查器')).toBeVisible();
    expect(within(inspector).getByText('摘要：')).toBeVisible();
    expect(within(inspector).getByText('核心洞察：')).toBeVisible();
    expect(within(inspector).getByLabelText('Source: Example Source')).toHaveAttribute('translate', 'no');
    const panel = within(inspector).getByLabelText('本文重处理');

    expect(within(panel).getByText('重新生成')).toBeVisible();
    await user.click(within(panel).getByRole('button', { name: '[重新处理本文]' }));
    expect(within(panel).queryByLabelText('模型')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('一次性提示')).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '[确认重处理]' })).toHaveFocus();
    expect(within(panel).getByRole('button', { name: '[取消]' })).toBeVisible();
    await user.click(within(panel).getByRole('button', { name: '[高级选项 ↓]' }));
    expect(within(panel).getByLabelText('模型')).toBeVisible();
    expect(within(panel).getByLabelText('一次性提示')).toBeVisible();
    expect(within(panel).getByText('2 个 OpenRouter 模型可选')).toBeVisible();
    expect(within(panel).getByText('仅作指导；不能覆盖结构、语言、来源标识、安全、状态或持久化边界。')).toBeVisible();
    const sourceBackedHelp = within(panel).getByText(/只能在有来源支持的事实中改变重点/u);
    expect(sourceBackedHelp).toHaveClass('visually-hidden');
  });

  it('renders model-list loading and unavailable states with live status text while preserving default re-ingest', async () => {
    const user = userEvent.setup();
    const { rerender } = render(Inspector, {
      props: {
        item: failedDetail,
        mode: 'desktop-split',
        showReingest: true,
        onReingestItem: vi.fn(),
        openRouterModelListState: 'loading'
      }
    });
    const inspector = screen.getByRole('complementary', { name: failedDetail.title });
    const panel = within(inspector).getByLabelText('Item re-ingest');

    await user.click(within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' }));
    expect(within(panel).queryByText('models: loading')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: '[ADVANCED OPTIONS ↓]' }));
    expect(within(panel).getByText('models: loading')).toHaveAttribute('aria-live', 'polite');
    expect(within(panel).getByLabelText('Model')).toHaveValue('default');

    await rerender({
      item: failedDetail,
      mode: 'desktop-split',
      showReingest: true,
      onReingestItem: vi.fn(),
      openRouterModelListState: 'unavailable'
    });
    expect(within(panel).getByText('err: models unavailable')).toBeVisible();
    expect(within(panel).getByLabelText('Model')).toHaveValue('default');
  });

  it('keeps the running action focused with aria-disabled text instead of removing the submitting trigger', async () => {
    const user = userEvent.setup();
    let resolveReingest: ((response: ItemReingestResponse) => void) | undefined;
    const onReingestItem = vi.fn(() => new Promise<ItemReingestResponse>((resolve) => {
      resolveReingest = resolve;
    }));
    render(Inspector, { props: { item: failedDetail, mode: 'desktop-split', showReingest: true, onReingestItem } });
    const panel = within(screen.getByRole('complementary', { name: failedDetail.title })).getByLabelText('Item re-ingest');

    await user.click(within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' }));
    await user.click(within(panel).getByRole('button', { name: '[CONFIRM RE-INGEST]' }));

    const running = within(panel).getByRole('button', { name: '[RE-INGESTING ITEM...]' });
    expect(running).toHaveAttribute('aria-disabled', 'true');
    expect(running).not.toBeDisabled();
    expect(running).toHaveFocus();

    resolveReingest?.({
      already_applied: false,
      reingest: {
        item_id: failedDetail.id,
        status: 'completed',
        language: 'en',
        item_updated: false,
        fts_updated: true,
        error: null,
        item: null
      }
    });
  });

  it('renders current-operation conflict detail when item re-ingest is blocked', async () => {
    const { user } = await renderAuthenticatedPage({ reingestConflict: true });
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${failedItem.title}` }));
    const inspector = screen.getByRole('complementary', { name: failedItem.title });
    const panel = within(inspector).getByLabelText('Item re-ingest');

    await user.click(within(panel).getByRole('button', { name: '[RE-INGEST ITEM]' }));
    await user.click(within(panel).getByRole('button', { name: '[CONFIRM RE-INGEST]' }));

    const conflict = await within(inspector).findByRole('alert', { name: /item re-ingest/i });
    expect(conflict).toHaveTextContent(/err: reingest blocked — op: library_reprocess · actor:human · phase:processing_items · 2\/5 · library reprocess processing item · since \d{2}:\d{2}:\d{2} local/);
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
    await user.click(within(firstPanel).getByRole('button', { name: '[RE-INGEST ITEM]' }));
    await user.click(within(firstPanel).getByRole('button', { name: '[ADVANCED OPTIONS ↓]' }));
    await user.type(within(firstPanel).getByLabelText('One-time prompt'), 'Item 1 prompt');
    await user.click(within(firstPanel).getByRole('button', { name: '[CONFIRM RE-INGEST]' }));

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
    expect(within(secondPanel).getByRole('button', { name: '[RE-INGEST ITEM]' })).toBeVisible();
    expect(within(secondPanel).queryByLabelText('One-time prompt')).not.toBeInTheDocument();
    expect(within(secondPanel).queryByLabelText('Model')).not.toBeInTheDocument();
    expect(within(secondPanel).queryByLabelText('Item re-ingest status')).not.toBeInTheDocument();
    expect(secondInspector).toHaveTextContent('Second Inspector item starts clean');
    expect(secondInspector).not.toHaveTextContent('Item 1 prompt');
    expect(secondInspector).not.toHaveTextContent('err: model retry failed for item 1');
  });
});
