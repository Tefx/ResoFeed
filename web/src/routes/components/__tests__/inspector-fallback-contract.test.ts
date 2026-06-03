import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Inspector from '../Inspector.svelte';
import type { ItemDetail, ModelStatus } from '$lib/api-contract';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';

const baseDetail: ItemDetail = {
  ...expectedRedItem,
  feed_excerpt: 'Raw RSS excerpt remains source evidence only.',
  extracted_text: 'Full article text for normal source text rendering.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: expectedRedItem.url,
    original_url: expectedRedItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

describe('Inspector fallback/source evidence contract', () => {
  it('renders fallback status exactly once, hides Summary/Core, and shows source evidence', () => {
    const fallbackDetail: ItemDetail = {
      ...baseDetail,
      id: 'fallback-source-evidence-contract',
      title: 'Fallback source evidence contract item',
      summary: null,
      core_insight: null,
      extraction_status: 'partial_extraction',
      model_status: 'summary_unavailable',
      feed_excerpt: 'Raw RSS excerpt remains source evidence only.',
      extracted_text: 'Unprocessed source body must not masquerade as synthesized reading content.'
    };

    render(Inspector, { props: { item: fallbackDetail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: fallbackDetail.title });
    expect(within(inspector).getByText('中文处理未完成 · 摘要/核心洞察不可用 · 显示来源摘录')).toBeVisible();
    expect((inspector.textContent?.match(/中文处理未完成/g) ?? [])).toHaveLength(1);
    expect(within(inspector).queryByLabelText('摘要')).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText('核心洞察')).not.toBeInTheDocument();
    expect(within(inspector).getByLabelText('出处记录')).toHaveTextContent('Raw RSS excerpt remains source evidence only.');
    expect(inspector).not.toHaveTextContent('Unprocessed source body must not masquerade');
  });

  it('keeps OK model-backed items on the normal Summary/Core/Source Text path', () => {
    const okDetail: ItemDetail = {
      ...baseDetail,
      id: 'ok-model-backed-contract',
      title: 'OK model-backed contract item',
      summary: 'Model-backed digest explains durable feed retrieval behavior.',
      core_insight: 'Model-backed core insight remains visible.',
      extraction_status: 'full',
      model_status: 'ok',
      extracted_text: 'Full article text for normal source text rendering.'
    };

    render(Inspector, { props: { item: okDetail, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: okDetail.title });
    expect(within(inspector).getByLabelText('Summary')).toHaveTextContent('Model-backed digest explains durable feed retrieval behavior.');
    expect(within(inspector).getByLabelText('Core insight')).toHaveTextContent('Model-backed core insight remains visible.');
    expect(within(inspector).getByLabelText('Source text')).toHaveTextContent('Full article text for normal source text rendering.');
    expect(within(inspector).getByLabelText('Source text')).toHaveClass('inspector-source-text-section');
    expect(within(inspector).getByText('Full article text for normal source text rendering.')).toHaveClass('inspector-reading--source-text');
    expect(within(inspector).queryByLabelText('Source evidence')).not.toBeInTheDocument();
  });

  it('never falls back to generated summary or core insight in Source Text when source evidence is absent', () => {
    const generatedOnlyDetail: ItemDetail = {
      ...baseDetail,
      id: 'generated-only-source-text-contract',
      title: 'Generated only source text contract item',
      summary: 'Generated summary must remain only in Summary.',
      core_insight: 'Generated core insight must remain only in Core insight.',
      extraction_status: 'original_unavailable',
      model_status: 'ok',
      extracted_text: null,
      feed_excerpt: null,
      display_excerpt: null
    };

    render(Inspector, { props: { item: generatedOnlyDetail, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: generatedOnlyDetail.title });
    expect(within(inspector).getByLabelText('Summary')).toHaveTextContent('Generated summary must remain only in Summary.');
    expect(within(inspector).getByLabelText('Core insight')).toHaveTextContent('Generated core insight must remain only in Core insight.');
    expect(within(inspector).queryByLabelText('Source text')).not.toBeInTheDocument();
    expect(within(inspector).getByText('Source text unavailable; use original link.')).toHaveClass('contract-muted');
    expect(within(inspector).getByRole('link', { name: 'original link' })).toBeVisible();
  });

  it('does not mark generated content unavailable when only the original article is unavailable', () => {
    const originalUnavailableWithGeneratedContent: ItemDetail = {
      ...baseDetail,
      id: 'original-unavailable-generated-content-contract',
      title: 'Original unavailable generated content contract item',
      summary: '模型摘要仍然可用。',
      core_insight: '核心洞察仍然可用。',
      key_points: ['第一条要点仍然可见。', '第二条要点仍然可见。', '第三条要点仍然可见。'],
      extraction_status: 'original_unavailable',
      model_status: 'ok',
      extracted_text: null,
      feed_excerpt: 'RSS excerpt remains available as source evidence.'
    };

    render(Inspector, { props: { item: originalUnavailableWithGeneratedContent, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: originalUnavailableWithGeneratedContent.title });
    expect(within(inspector).getByText('模型支持 · 原文不可用 · 质量：高价值')).toBeVisible();
    expect(within(inspector).queryByText('原文不可用 · 摘要/核心洞察可用')).not.toBeInTheDocument();
    expect(inspector).not.toHaveTextContent('原文不可用 · 摘要/核心洞察不可用');
    expect(within(inspector).getByLabelText('摘要')).toHaveTextContent('模型摘要仍然可用。');
    expect(within(inspector).getByLabelText('核心洞察')).toHaveTextContent('核心洞察仍然可用。');
    expect(within(inspector).getByLabelText('要点')).toHaveTextContent('第三条要点仍然可见。');
  });

  it('keeps AI status as the only model-backed provenance line when content is available', () => {
    const detail: ItemDetail = {
      ...baseDetail,
      id: 'deduped-ai-status-provenance-contract',
      title: 'Deduped AI status provenance contract item',
      summary: '模型摘要可见。',
      core_insight: '模型核心洞察可见。',
      extraction_status: 'partial_extraction',
      model_status: 'ok',
      value_tier: 'high'
    };

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: detail.title });
    expect(within(inspector).getByText('模型支持 · 来源摘录 · 质量：高价值')).toBeVisible();
    expect(inspector.querySelector('[aria-label="AI 状态：模型支持，来源深度 来源摘录，质量 高价值"]')).toBeVisible();
    expect(inspector).not.toHaveTextContent('来源文本：仅 RSS 摘录 · 摘要来源：模型支持');
    expect(inspector).not.toHaveTextContent('摘要来源：模型支持');
  });

  it('localizes Chinese AI status quality tier in visible and accessibility text', () => {
    const detail: ItemDetail = {
      ...baseDetail,
      id: 'zh-ai-status-quality-tier-contract',
      title: 'Chinese AI status quality tier contract item',
      localized_title: '中文 AI 状态质量层级契约条目',
      summary: '模型摘要可见。',
      core_insight: '模型核心洞察可见。',
      extraction_status: 'full',
      model_status: 'ok',
      value_tier: 'brief'
    };

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: detail.title });
    expect(within(inspector).getAllByText(/质量：简报/).some((element) => element.tagName === 'DD')).toBe(true);
    expect(inspector).not.toHaveTextContent('quality: brief');
  });

  it('localizes Chinese high value tier in AI status', () => {
    const detail: ItemDetail = {
      ...baseDetail,
      id: 'zh-ai-status-high-tier-contract',
      title: 'Chinese AI status high tier contract item',
      localized_title: '中文 AI 状态高价值契约条目',
      summary: '模型摘要可见。',
      core_insight: '模型核心洞察可见。',
      extraction_status: 'full',
      model_status: 'ok',
      value_tier: 'high'
    };

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: detail.title });
    expect(within(inspector).getAllByText(/质量：高价值/).some((element) => element.tagName === 'DD')).toBe(true);
    expect(inspector).not.toHaveTextContent('quality: high');
  });

  it.each<ModelStatus>(['invalid_model', 'provider_error', 'rate_limited', 'decode_error', 'timeout', 'model_latency_error'])(
    'renders architecture model failure status %s as visible fallback UI copy',
    (modelStatus) => {
      const detail: ItemDetail = {
        ...baseDetail,
        id: `model-failure-${modelStatus}`,
        title: `Model failure ${modelStatus}`,
        summary: null,
        core_insight: null,
        extraction_status: 'partial_extraction',
        model_status: modelStatus,
        feed_excerpt: `Fallback excerpt for ${modelStatus}.`,
        extracted_text: null
      };

      render(Inspector, { props: { item: detail, mode: 'desktop-split' } });

      const inspector = screen.getByRole('complementary', { name: detail.title });
      expect(within(inspector).getByText(new RegExp(`target-language processing failed · ${modelStatus.replace(/_/g, ' ')}`))).toBeVisible();
      expect(within(inspector).getByLabelText('Source evidence')).toHaveTextContent(`Fallback excerpt for ${modelStatus}.`);
      expect(within(inspector).queryByLabelText('Summary')).not.toBeInTheDocument();
      expect(within(inspector).queryByLabelText('Core insight')).not.toBeInTheDocument();
    }
  );

  it.each([
    ['summary', '解码错误 · 摘要语言不匹配'],
    ['core_insight', '解码错误 · 洞察语言不匹配'],
    ['key_points', '解码错误 · 要点语言不匹配']
  ] as const)('localizes safe field-specific language diagnostic %s without exposing the raw backend code', (field, label) => {
    const rawCode = `decode_error:language_invalid:${field}`;
    const detail: ItemDetail = {
      ...baseDetail,
      id: `safe-field-language-diagnostic-${field}`,
      title: `Safe field language diagnostic ${field}`,
      last_reprocess_status: 'failed',
      last_reprocess_error_code: 'decode_error',
      last_reprocess_error_message: rawCode
    };

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: detail.title });
    expect(within(inspector).getByText(`失败 · ${label} · 已保留现有摘要和要点`)).toBeVisible();
    expect(within(inspector).getByText(`上次重处理失败 · ${label} · 已保留现有摘要和要点`)).toBeVisible();
    expect(inspector).not.toHaveTextContent(rawCode);
  });

  it('localizes safe source-grounding diagnostic subcodes in Chinese', () => {
    const detail: ItemDetail = {
      ...baseDetail,
      id: 'safe-source-grounding-diagnostic-contract',
      title: 'Safe source grounding diagnostic contract item',
      last_reprocess_status: 'failed',
      last_reprocess_error_code: 'decode_error',
      last_reprocess_error_message: 'decode_error:source_grounding'
    };

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: detail.title });
    expect(within(inspector).getByText('失败 · 解码错误 · 来源校验 · 已保留现有摘要和要点')).toBeVisible();
    expect(within(inspector).getByText('上次重处理失败 · 解码错误 · 来源校验 · 已保留现有摘要和要点')).toBeVisible();
    expect(inspector).not.toHaveTextContent('decode_error:source_grounding');
  });

  it('falls back safely for unknown unsafe-looking reprocess messages', () => {
    const unsafeMessage = 'provider_payload: prompt=<system>raw model output leaked</system>';
    const detail: ItemDetail = {
      ...baseDetail,
      id: 'unsafe-reprocess-message-fallback-contract',
      title: 'Unsafe reprocess message fallback contract item',
      last_reprocess_status: 'failed',
      last_reprocess_error_code: 'decode_error',
      last_reprocess_error_message: unsafeMessage
    };

    render(Inspector, { props: { item: detail, mode: 'desktop-split', language: 'zh' } });

    const inspector = screen.getByRole('complementary', { name: detail.title });
    expect(within(inspector).getByText('失败 · 解码错误 · 已保留现有摘要和要点')).toBeVisible();
    expect(within(inspector).getByText('上次重处理失败 · 解码错误 · 已保留现有摘要和要点')).toBeVisible();
    expect(inspector).not.toHaveTextContent(unsafeMessage);
    expect(inspector).not.toHaveTextContent('raw model output leaked');
  });
});
