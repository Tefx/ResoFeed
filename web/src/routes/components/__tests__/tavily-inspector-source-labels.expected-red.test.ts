import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ItemDetail } from '$lib/api-contract';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';
import Inspector from '../Inspector.svelte';

type ExtractionSource = 'local_readable' | 'feed_excerpt' | 'external_tavily' | 'none';

type TavilyItemDetail = ItemDetail & {
  extraction_source: ExtractionSource;
  source_evidence_text: string | null;
};

const baseTavilyDetail: TavilyItemDetail = {
  ...expectedRedItem,
  id: 'tavily-inspector-base',
  title: 'Tavily Inspector source label contract item',
  source_item_title: 'Original Tavily Inspector source label contract item',
  localized_title: 'Tavily 检查器来源标签契约条目',
  summary: 'Generated summary stays in the Summary section only.',
  core_insight: 'Generated core insight stays in the Core insight section only.',
  key_points: ['Generated point one remains structured.', 'Generated point two remains structured.', 'Generated point three remains structured.'],
  content_status: 'ok',
  extraction_status: 'full',
  extraction_source: 'none',
  source_evidence_text: null,
  model_status: 'ok',
  feed_excerpt: null,
  extracted_text: null,
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: expectedRedItem.url,
    original_url: expectedRedItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

function tavilyDetail(overrides: Partial<TavilyItemDetail>): TavilyItemDetail {
  return { ...baseTavilyDetail, ...overrides };
}

function getInspectorFor(detail: ItemDetail): HTMLElement {
  return (
    screen.queryByRole('complementary', { name: detail.localized_title ?? detail.title }) ??
    screen.getByRole('complementary', { name: detail.title })
  );
}

function disclosureControl(disclosure: HTMLElement): HTMLElement {
  const summary = disclosure.querySelector('summary');
  if (summary instanceof HTMLElement) return summary;
  const button = within(disclosure).queryByRole('button', { name: /text evidence|文本证据/i });
  if (button instanceof HTMLElement) return button;
  throw new Error('Text evidence disclosure must expose a keyboard-operable summary or button');
}

describe('Tavily Inspector source labels and source evidence expected-red contract', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it.each([
    [
      'local readable',
      'local_readable',
      'SOURCE TEXT: LOCAL READABLE',
      {
        id: 'tavily-local-readable-label',
        extraction_status: 'full',
        extracted_text: 'Local readable source-backed article text.',
        source_evidence_text: 'Local readable source-backed article text.'
      }
    ],
    [
      'RSS excerpt only',
      'feed_excerpt',
      'SOURCE TEXT: RSS EXCERPT ONLY',
      {
        id: 'tavily-rss-excerpt-label',
        extraction_status: 'partial_extraction',
        feed_excerpt: 'RSS excerpt source evidence for display.',
        source_evidence_text: 'RSS excerpt source evidence for display.'
      }
    ],
    [
      'external Tavily',
      'external_tavily',
      'SOURCE TEXT: EXTERNAL / TAVILY',
      {
        id: 'tavily-external-source-label',
        extraction_status: 'full',
        source_evidence_text: 'Retained external Tavily source evidence.'
      }
    ]
  ] as const)('renders canonical English source-origin label for %s', (_name, extractionSource, expectedLabel, overrides) => {
    const detail = tavilyDetail({
      ...overrides,
      extraction_source: extractionSource,
      title: `${expectedLabel} contract item`,
      localized_title: `${expectedLabel} 本地化契约条目`
    });

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'en' } });

    const inspector = getInspectorFor(detail);
    expect(within(inspector).getByText(expectedLabel)).toBeVisible();
    expect(inspector).not.toHaveTextContent(/TAVILY_API_KEY|Tavily API key|provider settings|settings dashboard/i);
  });

  it.each([
    ['local_readable', '来源文本：本地正文'],
    ['feed_excerpt', '来源文本：仅 RSS 摘录'],
    ['external_tavily', '来源文本：TAVILY 外部抽取']
  ] as const)('renders Chinese source-origin label with full-width colon for %s', (extractionSource, expectedLabel) => {
    const detail = tavilyDetail({
      id: `tavily-zh-${extractionSource}`,
      extraction_source: extractionSource,
      extraction_status: extractionSource === 'feed_excerpt' ? 'partial_extraction' : 'full',
      title: `Chinese ${extractionSource} source label contract item`,
      localized_title: `中文 ${extractionSource} 来源标签契约条目`,
      source_evidence_text: `中文 ${extractionSource} 来源证据文本。`,
      feed_excerpt: extractionSource === 'feed_excerpt' ? `中文 ${extractionSource} RSS 摘录。` : null,
      extracted_text: extractionSource === 'local_readable' ? `中文 ${extractionSource} 本地正文。` : null
    });

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = getInspectorFor(detail);
    expect(within(inspector).getByText(expectedLabel)).toBeVisible();
    expect(inspector).not.toHaveTextContent(expectedLabel.replace('：', ':'));
  });

  it('uses source_evidence_text only for external Tavily Text evidence and keeps the disclosure collapsed by default', async () => {
    const retainedEvidence = 'Retained Tavily source_evidence_text is the only audit evidence that may render here.';
    const detail = tavilyDetail({
      id: 'tavily-source-evidence-text-only',
      extraction_source: 'external_tavily',
      extraction_status: 'full',
      source_evidence_text: retainedEvidence,
      feed_excerpt: 'RSS excerpt must not appear in Tavily Text evidence.',
      extracted_text: 'Generated extracted_text must not appear in Tavily Text evidence.',
      summary: 'Generated summary must not appear in Tavily Text evidence.',
      core_insight: 'Generated core insight must not appear in Tavily Text evidence.',
      key_points: ['Generated key point one must not appear.', 'Generated key point two must not appear.', 'Generated key point three must not appear.']
    });

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'en' } });

    const inspector = getInspectorFor(detail);
    const disclosure = within(inspector).getByLabelText('Text evidence');
    const control = disclosureControl(disclosure);
    expect(disclosure).not.toHaveAttribute('open');
    if (control.tagName === 'BUTTON') expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveTextContent('Text evidence: external / Tavily');

    await fireEvent.click(control);

    if (control.tagName === 'BUTTON') expect(control).toHaveAttribute('aria-expanded', 'true');
    else expect(disclosure).toHaveAttribute('open');
    expect(disclosure).toHaveTextContent(retainedEvidence);
    expect(disclosure).not.toHaveTextContent('RSS excerpt must not appear');
    expect(disclosure).not.toHaveTextContent('Generated extracted_text must not appear');
    expect(disclosure).not.toHaveTextContent('Generated summary must not appear');
    expect(disclosure).not.toHaveTextContent('Generated core insight must not appear');
    expect(disclosure).not.toHaveTextContent('Generated key point one must not appear');
  });

  it('does not render provider settings, key entry, dashboard, or Tavily configuration UI from Inspector data', () => {
    const detail = tavilyDetail({
      id: 'tavily-no-provider-ui',
      extraction_source: 'external_tavily',
      extraction_status: 'full',
      source_evidence_text: 'External source evidence exists, but provider configuration stays out of the UI.'
    });

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'en' } });

    const inspector = getInspectorFor(detail);
    expect(inspector).not.toHaveTextContent(/TAVILY_API_KEY|API key|Tavily key|provider settings|settings dashboard|provider dashboard|provider tab|marketplace/i);
    expect(within(inspector).queryByRole('button', { name: /tavily|api key|provider|settings|dashboard/i })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole('textbox', { name: /tavily|api key|provider|settings/i })).not.toBeInTheDocument();
  });
});
