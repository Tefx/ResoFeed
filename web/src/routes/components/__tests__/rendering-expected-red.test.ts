import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import Feed from '../Feed.svelte';
import FirstUseEmptyState from '../FirstUseEmptyState.svelte';
import Inspector from '../Inspector.svelte';
import OwnerTokenPrompt from '../OwnerTokenPrompt.svelte';
import SearchRetrieval from '../SearchRetrieval.svelte';
import SourceLedger from '../SourceLedger.svelte';
import StatePortability from '../StatePortability.svelte';
import Page from '../../+page.svelte';
import { formatLocalClockTimeWithHint } from '$lib/display-time';
import {
  expectedRedFallbackItem,
  expectedRedItem,
  expectedRedResonatedItem,
  expectedRedSource
} from '../../../test/contract-fixtures';
import type { ItemDetail } from '$lib/api-contract';

const expectedRedDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'Raw feed excerpt for detail route.',
  extracted_text: 'Full extracted text shown only in Inspector.',
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

describe('expected-red rendering contracts from docs/DESIGN.md', () => {
  it('renders the owner-token prompt as the local access gate without pre-acceptance persistence', async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    render(OwnerTokenPrompt, { props: { state: 'empty', onAccepted } });

    expect(screen.getByText('RESOFEED')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();

    const tokenInput = screen.getByLabelText('Owner token');
    expect(tokenInput).toHaveAttribute('type', 'password');
    expect(tokenInput).toHaveFocus();

    await user.type(tokenInput, 'rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG');
    await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));

    expect(window.localStorage.getItem('resofeed.ownerToken')).toBeNull();
    expect(onAccepted).toHaveBeenCalledWith('rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG');
  });

  it('persists owner token only after authenticated bootstrap succeeds and never after rejection', async () => {
    const user = userEvent.setup();
    const rejectedFetch = vi.fn(async () =>
      jsonResponse({ error: { code: 'unauthorized', message: 'owner token required', details: {} } }, { status: 401 })
    );
    vi.stubGlobal('fetch', rejectedFetch);

    render(Page);
    await user.type(screen.getByLabelText('Owner token'), 'rfeed_rejected0123456789abcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected'));
    expect(window.localStorage.getItem('resofeed.ownerToken')).toBeNull();
    cleanup();

    const acceptedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [] });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    });
    vi.stubGlobal('fetch', acceptedFetch);

    render(Page);
    await user.type(screen.getByLabelText('Owner token'), 'rfeed_accepted0123456789abcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));

    await waitFor(() => expect(screen.getByLabelText('Steer or paste RSS URL')).toBeVisible());
    expect(window.localStorage.getItem('resofeed.ownerToken')).toBe('rfeed_accepted0123456789abcdefghijklmnopqrstuvwxyz');
  });

  it('renders owner-token rejection as an assertive accessible error', () => {
    render(OwnerTokenPrompt, { props: { state: 'rejected' } });

    expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected');
    expect(screen.getByLabelText('Owner token')).toHaveFocus();
  });

  it('renders the first-use empty state with the required static loop copy', () => {
    render(FirstUseEmptyState, { props: { state: 'no-sources' } });

    const region = screen.getByRole('region', { name: 'First use' });
    expect(within(region).getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();
    expect(within(region).getByText('Inspect opens the item.')).toBeVisible();
    expect(within(region).getByText('Star preserves durable value.')).toBeVisible();
    expect(within(region).getByText('Steer is optional correction.')).toBeVisible();
    expect(within(region).queryByText(/Contract:/)).not.toBeInTheDocument();
    expect(within(region).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders feed rows with visible provenance and exposes missing keyboard inspect plus star toggle behavior', async () => {
    const user = userEvent.setup();
    const onResonanceToggle = vi.fn(async () => {});
    const onSelect = vi.fn(async () => {});
    render(Feed, {
      props: {
        items: [expectedRedItem, expectedRedResonatedItem],
        selectedItemId: expectedRedItem.id,
        onSelect,
        onResonanceToggle
      }
    });

    const feed = screen.getByRole('list', { name: 'Today feed items' });
    expect(within(feed).getByText('SQLite FTS changes ranking contract')).toBeVisible();
    expect(within(feed).getAllByText('Why this matters for retrieval.')[0]).toBeVisible();
    expect(within(feed).queryByText('Dense factual summary for a rendered feed row.')).not.toBeInTheDocument();
    expect(within(feed).getAllByLabelText('Source: Example Source')[0]).toBeVisible();
    expect(within(feed).getAllByLabelText('Extraction: partial_extraction')[0]).toBeVisible();
    expect(within(feed).getByLabelText('Externally surfaced by agent')).toBeVisible();

    const openButton = screen.getByRole('button', {
      name: 'Open Inspector for: SQLite FTS changes ranking contract'
    });
    openButton.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expectedRedItem);

    const star = screen.getByRole('button', { name: `Resonate item: ${expectedRedItem.title}` });
    await user.click(star);
    expect(onResonanceToggle).toHaveBeenCalledWith(expectedRedItem, true);
    expect(screen.queryByRole('region', { name: 'Opened Inspector focus target' })).not.toBeInTheDocument();
  });

  it('renders feed anatomy with timestamp groups and source-backed summary fallback', () => {
    const now = new Date();
    const todayItem = {
      ...expectedRedFallbackItem,
      id: 'item_today_group',
      published_at: now.toISOString(),
      first_seen_at: now.toISOString()
    };
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString();
    const earlier = new Date(now.getTime() - 3 * 86_400_000).toISOString();

    render(Feed, {
      props: {
        items: [
          todayItem,
          { ...expectedRedItem, id: 'item_yesterday_group', published_at: yesterday, external_surfaced_at: null },
          { ...expectedRedItem, id: 'item_earlier_group', title: 'Earlier feed item', published_at: earlier, external_surfaced_at: null }
        ],
        onSelect: async () => {},
        onResonanceToggle: async () => {}
      }
    });

    const feed = screen.getByRole('list', { name: 'Today feed items' });
    expect(feed).toHaveAccessibleDescription('Grouped by time; ranked within each group.');
    expect(screen.queryByRole('heading', { name: 'TODAY' })).not.toBeInTheDocument();
    const todayLabel = within(feed).getByText('TODAY');
    expect(todayLabel).toBeVisible();
    expect(todayLabel).toHaveAttribute('title', 'Time group: TODAY; following items belong to this group until the next group marker');
    expect(within(feed).getByText('YESTERDAY')).toBeVisible();
    expect(within(feed).getByText('EARLIER')).toBeVisible();
    expect(within(feed).getByText('1m')).toHaveAttribute('title', 'Age: 1 minute ago');
    expect(within(feed).getByText('Source-backed feed excerpt for list/search fallback.')).toBeVisible();
    expect(within(feed).queryByText('summary unavailable')).not.toBeInTheDocument();
  });

  it('renders the inspector and exposes missing detail-focus/provenance completion', async () => {
    render(Inspector, { props: { item: expectedRedItem, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: 'SQLite FTS changes ranking contract' });
    expect(within(inspector).getByText('INSPECTOR')).toBeVisible();
    expect(within(inspector).getByRole('link', { name: 'original link' })).toHaveAttribute(
      'href',
      expectedRedItem.url
    );
    expect(within(inspector).getByText('feed excerpt fallback · source excerpt · quality: high')).toBeVisible();
    expect(within(inspector).queryByText('source text: RSS excerpt only')).not.toBeInTheDocument();
    expect(within(inspector).queryByText('why: fresh from configured source')).not.toBeInTheDocument();
    expect(within(inspector).queryByRole('button', { name: `Resonate item: ${expectedRedItem.title}` })).not.toBeInTheDocument();
    await waitFor(() => expect(within(inspector).getByRole('heading', { name: expectedRedItem.title })).toHaveFocus());
  });

  it('keeps Inspector primary reading editorial while preserving calm provenance and normal original-link behavior', () => {
    const dirtyDetail: ItemDetail = {
      ...expectedRedItem,
      id: 'item_dirty_inspector_contract',
      title: 'Clean fixture item with JSON-LD metadata',
      summary: 'model_status summary_unavailable diagnostic payload',
      core_insight: 'Readable core insight remains in the primary path.',
      extraction_status: 'full',
      model_status: 'summary_unavailable',
      feed_excerpt: 'Readable fallback excerpt for the primary Inspector reading path.',
      extracted_text: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle"}</script>
        Skip to main content. Advertisement newsletter sign up.
        Readable article paragraph after the metadata blob.
        OpenRouter model transport diagnostic status: model_latency_error.`,
      provenance: {
        source_url: expectedRedSource.url,
        canonical_url: expectedRedItem.url,
        original_url: expectedRedItem.url,
        story_key: 'story-json-ld',
        duplicate_of_item_id: null,
        grouped_source_items: []
      }
    };

    render(Inspector, { props: { item: dirtyDetail, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: dirtyDetail.title });
    expect(within(inspector).getByRole('heading', { name: dirtyDetail.title })).toBeVisible();
    expect(within(inspector).getByLabelText(/Provenance: src: Example Source · full/)).toBeVisible();
    expect(within(inspector).queryByLabelText(/Model status:/)).not.toBeInTheDocument();
    expect(within(inspector).getByText('Readable core insight remains in the primary path.')).toBeVisible();
    expect(within(inspector).getByText(/Readable article paragraph after the metadata blob/)).toBeInTheDocument();

    const primaryText = within(inspector).getByText(/Readable article paragraph after the metadata blob/).textContent ?? '';
    expect(primaryText).not.toMatch(/@context|schema\.org|Advertisement|model_latency_error|OpenRouter/i);

    const originalLink = within(inspector).getByRole('link', { name: 'original link' });
    expect(originalLink).toHaveAttribute('href', expectedRedItem.url);
    expect(originalLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(true);
  });

  it('does not present unprocessed English source text as completed Chinese Inspector body', () => {
    const fallbackDetail: ItemDetail = {
      ...expectedRedItem,
      id: 'item_zh_fallback_source_excerpt',
      title: 'English source fixture awaiting reprocess',
      summary: null,
      core_insight: null,
      extraction_status: 'partial_extraction',
      model_status: 'summary_unavailable',
      feed_excerpt: 'This raw English RSS excerpt should remain provenance, not the main Chinese body.',
      extracted_text: 'This raw English body should not appear as completed Chinese reading content.',
      provenance: {
        source_url: expectedRedSource.url,
        canonical_url: expectedRedItem.url,
        original_url: expectedRedItem.url,
        story_key: null,
        duplicate_of_item_id: null,
        grouped_source_items: []
      }
    };

    render(Inspector, { props: { item: fallbackDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: fallbackDetail.title });
    expect(within(inspector).getByText('中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录')).toBeVisible();
    expect((inspector.textContent?.match(/中文处理未完成/g) ?? [])).toHaveLength(1);
    expect(within(inspector).queryByLabelText('摘要')).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText('核心洞察')).not.toBeInTheDocument();
    expect(within(inspector).getByLabelText('出处记录')).toHaveTextContent('出处记录：');
    expect(within(inspector).getByLabelText('出处记录')).toHaveTextContent('This raw English RSS excerpt should remain provenance, not the main Chinese body.');
    expect(inspector).not.toHaveTextContent('This raw English body should not appear as completed Chinese reading content.');
  });

  it('prefers model-backed Chinese reading text over stale English extracted text', () => {
    const mixedDetail: ItemDetail = {
      ...expectedRedItem,
      id: 'item_zh_model_backed_stale_body',
      title: '中文标题',
      summary: '这是中文摘要。',
      core_insight: '这是中文核心洞察。',
      extraction_status: 'full',
      model_status: 'ok',
      feed_excerpt: 'An older English feed excerpt remains stored from before reprocess.',
      extracted_text: 'An older English full article body remains stored from before reprocess and should not be shown in Chinese mode.',
      provenance: {
        source_url: expectedRedSource.url,
        canonical_url: expectedRedItem.url,
        original_url: expectedRedItem.url,
        story_key: null,
        duplicate_of_item_id: null,
        grouped_source_items: []
      }
    };

    render(Inspector, { props: { item: mixedDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: mixedDetail.title });
    expect(within(inspector).getByLabelText('来源文本')).toHaveTextContent('这是中文摘要。 这是中文核心洞察。');
    expect(inspector).not.toHaveTextContent('older English full article body');
  });

  it('keeps the original link as a low-chrome provenance anchor with its own focus class', () => {
    render(Inspector, { props: { item: expectedRedItem, mode: 'desktop-split' } });

    const originalLink = screen.getByRole('link', { name: 'original link' });
    expect(originalLink).toHaveClass('inspector-original-link');
    expect(originalLink.closest('p')).toHaveClass('inspector-link-row');
    expect(originalLink.tagName).toBe('A');
    expect(originalLink).not.toHaveAttribute('role', 'button');
  });

  it('keeps OK model-backed Inspector reading hierarchy on shared section classes and labels', () => {
    const okDetail: ItemDetail = {
      ...expectedRedDetail,
      model_status: 'ok',
      extraction_status: 'full',
      summary: 'Dense factual summary for a rendered Inspector section.',
      core_insight: 'Why this matters for retrieval remains model-backed.',
      extracted_text: 'Full extracted text shown only in Inspector.'
    };

    render(Inspector, { props: { item: okDetail, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: okDetail.title });
    const sections = Array.from(inspector.querySelectorAll('.inspector-text-section'));
    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['Summary', 'Core insight', 'Source text']);
    expect(sections.map((section) => section.querySelector('.inspector-section-label')?.textContent)).toEqual(['summary:', 'core insight:', 'source text:']);
    expect(sections[0].querySelector('.inspector-section-copy')).not.toBeNull();
    expect(sections[1].querySelector('.inspector-section-copy')).not.toBeNull();
    expect(sections[2]).toHaveClass('inspector-reading-section');
    expect(sections[2]).toHaveClass('inspector-source-text-section');
    expect(sections[2].querySelector('.inspector-reading--source-text')).not.toBeNull();
    expect(within(inspector).getByLabelText('Summary')).toHaveTextContent('Dense factual summary for a rendered Inspector section.');
    expect(within(inspector).getByLabelText('Core insight')).toHaveTextContent('Why this matters for retrieval remains model-backed.');
  });

  it('contracts original-link CSS away from boxed/button-like styling', () => {
    const css = fs.readFileSync(`${process.cwd()}/src/app.css`, 'utf8');
    const originalLinkRule = css.match(/\.contract-inspector \.inspector-original-link\s*\{[^}]+\}/)?.[0] ?? '';
    const originalLinkHoverFocusRule = css.match(/\.contract-inspector \.inspector-original-link:hover,\n\.contract-inspector \.inspector-original-link:focus-visible\s*\{[^}]+\}/)?.[0] ?? '';

    expect(originalLinkRule).toContain('display: inline;');
    expect(originalLinkRule).toContain('min-height: auto;');
    expect(originalLinkRule).toContain('padding: 0;');
    expect(originalLinkRule).toContain('border: 0;');
    expect(originalLinkRule).not.toMatch(/border-block-end|box-shadow|background:/);
    expect(originalLinkHoverFocusRule).toContain('background: transparent;');
    expect(originalLinkHoverFocusRule).toContain('outline: 0;');
    expect(originalLinkHoverFocusRule).toContain('box-shadow: none;');
    expect(originalLinkHoverFocusRule).toContain('text-decoration-line: underline;');
  });

  it('keeps Inspector model-list diagnostics out of payload paragraph typography', () => {
    const css = fs.readFileSync(`${process.cwd()}/src/app.css`, 'utf8');
    const payloadParagraphRule = css.match(/\.contract-inspector p[^{]+\{[^}]+font: var\(--rf-typography-payload\);[^}]+\}/)?.[0] ?? '';
    const modelListDiagnosticRule = css.match(/\.contract-inspector \.inspector-model-list-diagnostic\s*\{[^}]+\}/)?.[0] ?? '';

    expect(payloadParagraphRule).toContain(':not(.inspector-model-list-diagnostic)');
    expect(modelListDiagnosticRule).toContain('color: var(--rf-color-muted);');
    expect(modelListDiagnosticRule).toContain('font: var(--rf-typography-metadata);');
    expect(modelListDiagnosticRule).not.toContain('font: var(--rf-typography-payload);');
  });

  it('removes follow/newsletter prompts and adjacent repeated lead-like filler without blanking article prose', () => {
    const dirtyDetail: ItemDetail = {
      ...expectedRedItem,
      id: 'item_inspector_follow_prompt_repeated_lead',
      title: 'Article with follow prompt and repeated lead',
      summary: 'Readable summary remains outside social boilerplate.',
      core_insight: 'Readable core insight remains outside social boilerplate.',
      extraction_status: 'full',
      feed_excerpt: 'Readable fallback excerpt remains available.',
      extracted_text: `summary-like lead repeated by the site summary-like lead repeated by the site
        Follow us on Twitter for more newsletters
        Readable article prose survives after social boilerplate and repeated lead filler.`,
      provenance: {
        source_url: expectedRedSource.url,
        canonical_url: expectedRedItem.url,
        original_url: expectedRedItem.url,
        story_key: null,
        duplicate_of_item_id: null,
        grouped_source_items: []
      }
    };

    render(Inspector, { props: { item: dirtyDetail, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: dirtyDetail.title });
    expect(within(inspector).getByText(/Readable article prose survives after social boilerplate/)).toBeInTheDocument();
    const primaryText = Array.from(inspector.querySelectorAll('h2, p:not(.contract-label):not(.contract-muted):not(.contract-warning)'))
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(primaryText).not.toContain('Follow us on Twitter for more newsletters');
    expect(primaryText).not.toContain('summary-like lead repeated by the site');
  });

  it('places the mobile Inspector Resonate action in the top header row without duplicating debug status', () => {
    const onResonanceToggle = vi.fn(async () => {});
    render(Inspector, { props: { item: expectedRedItem, mode: 'mobile-route', onResonanceToggle } });

    const inspector = screen.getByRole('complementary', { name: expectedRedItem.title });
    const headerRow = inspector.querySelector('.inspector-header-row');
    const heading = within(inspector).getByRole('heading', { name: expectedRedItem.title });
    const star = within(inspector).getByRole('button', { name: `Resonate item: ${expectedRedItem.title}` });

    expect(headerRow).toContainElement(star);
    expect(Boolean(star.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(within(inspector).queryByText(expectedRedItem.model_status)).not.toBeInTheDocument();
  });

  it('wires Steer to /api/steer and /doctor to raw text diagnostics', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      if (url.endsWith('/api/steer')) return jsonResponse({ receipt: { interpreted_as: 'add_source', message: 'source added', changed_rules: [] } });
      if (url.endsWith('/api/doctor')) return textResponse('rss: ok\ngemini: ok\ningest: last_run=2026-05-09T00:00:00Z');
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    const steer = await screen.findByLabelText('Steer or paste RSS URL');
    await user.type(steer, 'https://example.com/feed.xml');
    await user.click(screen.getByRole('button', { name: 'apply' }));
    await waitFor(() => expect(screen.getByText(/source added:/)).toBeVisible());

    const steerCall = calls.find((call) => call.url.endsWith('/api/steer'));
    expect(steerCall?.init?.method).toBe('POST');
    expect(JSON.parse(String(steerCall?.init?.body))).toMatchObject({ command: 'https://example.com/feed.xml', actor_kind: 'human' });

    await user.clear(steer);
    await user.type(steer, '/doctor');
    await user.click(screen.getByRole('button', { name: 'apply' }));
    await waitFor(() => expect(screen.getByRole('log', { name: '/doctor diagnostics' })).toHaveTextContent('rss: ok'));
    expect(screen.getByRole('log', { name: '/doctor diagnostics' }).tagName).toBe('PRE');
    expect(screen.getByRole('region', { name: '/doctor' })).toHaveClass('active-panel');
    expect(document.querySelector('.shell-grid')).toHaveAttribute('data-surface', 'doctor');
  });

  it('exposes Source Ledger through a non-persistent RESOFEED utility menu', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    await screen.findByLabelText('Steer or paste RSS URL');

    const menu = screen.getByRole('group', { name: 'RESOFEED surface menu' });
    expect(within(menu).getByText('RESOFEED')).toBeVisible();
    expect(within(menu).queryByRole('button', { name: 'SOURCE LEDGER' })).not.toBeVisible();
    await user.click(within(menu).getByText('RESOFEED'));
    await user.click(within(menu).getByRole('button', { name: 'SOURCE LEDGER' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'SOURCE LEDGER surface' })).toHaveClass('active-panel'));
    expect(screen.getByRole('heading', { name: 'SOURCE LEDGER' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'SEARCH' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'STATE' })).not.toBeInTheDocument();
  });

  it('surfaces active MCP agent steering attribution as an inline correction receipt', async () => {
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [{ id: 'rule_agent', rule_text: 'Push more sqlite research.', is_active: true, superseded_by: null, revision: 1, created_by_actor_kind: 'agent', created_by_actor_id: 'briefing-agent' }] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    const receipt = await screen.findByRole('region', { name: 'Agent steering receipt' });
    expect(receipt).toHaveTextContent('agent:briefing-agent steering active: Push more sqlite research. · correct in Steer');
  });

  it('uses mobile feed-first full-screen surfaces instead of one stacked page', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      if (url.endsWith(`/api/items/${expectedRedItem.id}/inspect`)) return jsonResponse({ item_id: expectedRedItem.id, human_inspected_at: '2026-05-09T00:00:00Z', already_applied: false });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    await screen.findByRole('list', { name: 'Today feed items' });
    await user.click(screen.getByRole('button', { name: `Open Inspector for: ${expectedRedItem.title}` }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'back to TODAY' })[0]).toBeVisible());
    expect(screen.getByRole('complementary', { name: expectedRedItem.title })).toHaveTextContent('Full extracted text shown only in Inspector.');
    expect(screen.getAllByRole('button', { name: `Resonate item: ${expectedRedItem.title}` })).toHaveLength(1);

    const steer = screen.getByLabelText('Steer or paste RSS URL');
    await user.type(steer, 'source ledger');
    await user.click(screen.getByRole('button', { name: 'apply' }));
    expect(screen.getByRole('region', { name: 'SOURCE LEDGER surface' })).toHaveClass('active-panel');
  });

  it('scopes mobile Search controls and retrieval receipts away from Today', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    window.localStorage.setItem('resofeed.ownerToken', 'rfeed_existing0123456789abcdefghijklmnopqrstuvwxyz');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/sources')) return jsonResponse({ sources: [expectedRedSource] });
      if (url.includes('/api/feed/today')) return jsonResponse({ items: [expectedRedItem] });
      if (url.endsWith('/api/steer/active')) return jsonResponse({ rules: [] });
      if (url.includes('/api/search')) return jsonResponse({ items: [expectedRedItem], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } });
      if (url.endsWith(`/api/items/${expectedRedItem.id}`)) return jsonResponse({ item: expectedRedDetail });
      return jsonResponse({ error: { code: 'not_found', message: 'not found', details: {} } }, { status: 404 });
    }));

    render(Page);
    const steer = await screen.findByLabelText('Steer or paste RSS URL');
    await user.type(steer, 'search sqlite');
    await user.click(screen.getByRole('button', { name: 'apply' }));

    const search = await screen.findByRole('region', { name: 'Search and Retrieval' });
    expect(screen.getByText('retrieval: lexical search')).toBeVisible();
    expect(within(search).getByRole('button', { name: `Inspect search result: ${expectedRedItem.title}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: `Open Inspector for: ${expectedRedItem.title}` })).not.toBeInTheDocument();

    await user.clear(steer);
    await user.type(steer, 'today');
    await user.click(screen.getByRole('button', { name: 'apply' }));
    await waitFor(() => expect(screen.queryByText('retrieval: lexical search')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: `Open Inspector for: ${expectedRedItem.title}` })).toBeVisible();
  });

  it('renders the flat Source Ledger and exposes missing destructive confirmation behavior', async () => {
    const user = userEvent.setup();
    render(SourceLedger, { props: { sources: [expectedRedSource], onDeleteSource: async () => {}, onImportOpml: async () => {}, onExportState: async () => ({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] }), onImportState: async () => {} } });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByText('[IMPORT OPML]')).toBeVisible();
    expect(within(ledger).getByText('src: Example Source')).toBeVisible();
    expect(ledger).not.toHaveTextContent('status: ok');
    expect(within(ledger).getByText('url: https://example.com/feed.xml')).toBeVisible();
    expect(within(ledger).getByText(formatLocalClockTimeWithHint(expectedRedSource.last_fetch_at) ?? '')).toBeVisible();
    expect(within(ledger).getByText('[EXPORT STATE]')).toBeVisible();
    expect(within(ledger).getByText('[IMPORT STATE]')).toBeVisible();
    // DEVIATION RECORD: type=test_error; artifact=rendering-expected-red.test.ts; what_changed=negative OPML receipt assertion uses `OPML outlines flattened`; why=folder terminology is stale and forbidden; impact=rendering proof still rejects unrelated import receipt presence.
    expect(within(ledger).queryByText('imported 3 sources; OPML outlines flattened')).not.toBeInTheDocument();

    await user.click(within(ledger).getByRole('button', { name: 'Delete source: Example Source' }));
    expect(within(ledger).getByRole('button', { name: 'confirm delete source: Example Source' })).toBeVisible();
  });

  it('renders state portability warning and exposes missing import/export live feedback', async () => {
    const user = userEvent.setup();
    render(StatePortability, { props: { onExportState: async () => ({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] }), onImportState: async () => {} } });

    const portability = screen.getByRole('group', { name: 'State portability' });
    expect(within(portability).getByRole('button', { name: '[IMPORT STATE]' })).toHaveAccessibleDescription('Import State replaces active sources, rules, and stars.');
    expect(within(portability).getByText('Import State replaces active sources, rules, and stars.')).not.toBeVisible();
    expect(within(portability).getByText('Import State replaces active sources, rules, and stars.')).toHaveAttribute('hidden');

    await user.click(within(portability).getByRole('button', { name: '[IMPORT STATE]' }));
    expect(within(portability).getByLabelText('Choose state JSON')).toHaveClass('visually-hidden');

    await user.click(within(portability).getByRole('button', { name: '[EXPORT STATE]' }));
    expect(within(portability).getByRole('status')).toHaveTextContent('exported state.json');
  });

  it('renders search/retrieval with filters collapsed by default and still openable', async () => {
    const user = userEvent.setup();
    render(SearchRetrieval, { props: { items: [expectedRedItem], query: 'sqlite', onSearch: async () => ({ items: [expectedRedItem], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } }) } });

    const search = screen.getByRole('region', { name: 'Search and Retrieval' });
    const filters = within(search).getByText('filters').closest('details');
    expect(filters).toBeInstanceOf(HTMLDetailsElement);
    expect(filters).not.toHaveAttribute('open');
    expect(within(search).getByLabelText('Plain text query')).toHaveValue('sqlite');
    expect(within(search).getByLabelText('Source filter')).not.toBeVisible();
    await user.click(within(search).getByText('filters'));
    expect(filters).toHaveAttribute('open');
    expect(within(search).getByLabelText('Source filter')).toBeVisible();
    expect(within(search).getByLabelText('From date')).toBeVisible();
    expect(within(search).getByLabelText('Resonated only')).toBeVisible();
    expect(within(search).getByLabelText('Result limit')).toHaveValue('50');
    expect(within(search).getByRole('status')).toHaveTextContent('1 results');
    expect(within(search).getByText('match: lexical index')).toBeVisible();
    expect(within(search).getByText('Example Source')).toBeVisible();
    expect(within(search).queryByText('src: Example Source')).not.toBeInTheDocument();
  });

  it('renders search results with shared feed anatomy, compact dates, fallback excerpts, and actions', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(async () => {});
    const onResonanceToggle = vi.fn(async () => {});
    render(SearchRetrieval, {
      props: {
        items: [expectedRedFallbackItem],
        query: 'fallback',
        onSearch: async () => ({ items: [expectedRedFallbackItem], query: { q: 'fallback', source: null, from: null, to: null, resonated: null, limit: 50 } }),
        onSelect,
        onResonanceToggle
      }
    });

    const search = screen.getByRole('region', { name: 'Search and Retrieval' });
    const result = within(search).getByRole('listitem');
    expect(result).toHaveClass('contract-feed-item');
    expect(within(result).getByText('Source-backed feed excerpt for list/search fallback.')).toBeVisible();
    expect(within(result).queryByText('date unavailable')).not.toBeInTheDocument();
    expect(within(result).queryByText(/T\d{2}:\d{2}:\d{2}Z/)).not.toBeInTheDocument();
    expect(within(result).getByText('match: lexical index')).toBeVisible();
    expect(within(result).getByText('provenance: source-backed')).toBeVisible();

    await user.click(within(result).getByRole('button', { name: `Inspect search result: ${expectedRedFallbackItem.title}` }));
    expect(onSelect).toHaveBeenCalledWith(expectedRedFallbackItem);
    await user.click(within(result).getByRole('button', { name: `Resonate item: ${expectedRedFallbackItem.title}` }));
    expect(onResonanceToggle).toHaveBeenCalledWith(expectedRedFallbackItem, true);
  });
});
