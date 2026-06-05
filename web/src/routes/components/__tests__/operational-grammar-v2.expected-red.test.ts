import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import type { ItemDetail, Source, StateBundleV1 } from '$lib/api-contract';
import Inspector from '../Inspector.svelte';
import SourceLedger from '../SourceLedger.svelte';
import StatePortability from '../StatePortability.svelte';
import { expectedRedItem, expectedRedSource } from '../../../test/contract-fixtures';
import { frontendAcceptanceContractLock } from '../../../test/frontend-acceptance-contract-lock';

const ogv2Detail: ItemDetail = {
  ...expectedRedItem,
  id: 'item_ogv2_render_contract',
  title: 'Operational Grammar v2 selected item',
  source_item_title: 'Operational Grammar v2 selected item',
  localized_title: '操作语法 v2 选中条目',
  summary: 'Model-backed summary remains primary reading copy.',
  core_insight: 'Regeneration is a direct selected-item command.',
  key_points: [
    'Direct regenerate is scoped to the selected Inspector item.',
    'Options disclose temporary model and prompt controls.',
    'Text evidence and source info remain secondary disclosures.'
  ],
  content_status: 'ok',
  model_status: 'ok',
  extraction_status: 'full',
  feed_excerpt: 'RSS excerpt evidence for the selected item.',
  extracted_text: 'Full extracted source text used as verification evidence.',
  provenance: {
    source_url: expectedRedSource.url,
    canonical_url: 'https://example.com/ogv2-render-contract',
    original_url: 'https://example.com/ogv2-render-contract',
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

const ogv2Source: Source = {
  ...expectedRedSource,
  id: 'src_ogv2_render_contract',
  title: 'OGV2 Source',
  last_fetch_error: 'timeout while fetching feed body'
};

const portableBundle: StateBundleV1 = {
  schema_version: 'resofeed.state.v1',
  exported_at: '2026-06-06T00:00:00Z',
  sources: [],
  steer_rules: [],
  resonated_items: []
};

function disclosureTriggerContract(trigger: HTMLElement, expectedText: RegExp): void {
  expect(trigger).toHaveTextContent(expectedText);
  expect(trigger).not.toHaveTextContent(/^\[[^\]]+\]$/u);
  expect(trigger).not.toHaveClass('bracket-action');

  const owningDetails = trigger.closest('details');
  const hasNativeDetails = owningDetails instanceof HTMLDetailsElement;
  const hasAriaDisclosure = trigger.hasAttribute('aria-expanded') && trigger.hasAttribute('aria-controls');
  expect(hasNativeDetails || hasAriaDisclosure, 'disclosure must be native <details> or aria-expanded/aria-controls').toBe(true);

  const hookClass = `${trigger.getAttribute('class') ?? ''} ${owningDetails?.getAttribute('class') ?? ''}`;
  expect(hookClass, 'disclosure must expose a low-chrome/source-disclosure styling hook').toMatch(/(?:source|text|info|disclosure|low-chrome)/iu);
}

function renderLedger(language: 'en' | 'zh' = 'en'): HTMLElement {
  render(SourceLedger, {
    props: {
      sources: [ogv2Source],
      onDeleteSource: vi.fn(),
      onImportOpml: vi.fn(),
      onExportState: async () => portableBundle,
      onImportState: vi.fn(),
      language
    }
  });
  return screen.getByRole('region', { name: 'SOURCE LEDGER' });
}

function collectProductionRouteFiles(dir = path.resolve(process.cwd(), 'src', 'routes')): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return collectProductionRouteFiles(fullPath);
    }
    if (!/\.(?:svelte|ts)$/u.test(entry.name)) return [];
    if (/\.test\.ts$/u.test(entry.name)) return [];
    return [fullPath];
  });
}

describe('expected-red Operational Grammar v2 render contract lock', () => {
  it('OGV2-REGENERATE-EN: selected item exposes one direct [REGENERATE] command with no duplicate section label or confirm/cancel path', async () => {
    const user = userEvent.setup();
    const onReingestItem = vi.fn(async () => ({
      already_applied: false,
      reingest: {
        item_id: ogv2Detail.id,
        status: 'completed' as const,
        item_updated: true,
        fts_updated: true,
        language: 'en' as const,
        error: null,
        item: ogv2Detail
      }
    }));

    render(Inspector, {
      props: {
        item: ogv2Detail,
        mode: 'desktop-split',
        showReingest: true,
        onReingestItem,
        openRouterModels: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }],
        openRouterModelListState: 'available'
      }
    });

    const panel = within(screen.getByRole('complementary', { name: ogv2Detail.title })).getByLabelText('Item re-ingest');
    expect(within(panel).queryByText(/^REGENERATE$/u), 'section label must not duplicate adjacent command').not.toBeInTheDocument();
    const regenerate = within(panel).getByRole('button', { name: '[REGENERATE]' });
    expect(regenerate).toHaveTextContent('[REGENERATE]');
    expect(within(panel).queryByRole('button', { name: '[CONFIRM RE-INGEST]' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '[CANCEL]' })).not.toBeInTheDocument();

    await user.click(regenerate);
    await waitFor(() => expect(onReingestItem).toHaveBeenCalledTimes(1));
    expect(within(panel).queryByRole('button', { name: '[CONFIRM RE-INGEST]' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '[CANCEL]' })).not.toBeInTheDocument();
  });

  it('OGV2-REGENERATE-ZH: selected item exposes one direct [重新生成] command with no duplicate label or [确认重处理]/[取消]', async () => {
    const user = userEvent.setup();
    const onReingestItem = vi.fn(async () => ({
      already_applied: false,
      reingest: {
        item_id: ogv2Detail.id,
        status: 'completed' as const,
        item_updated: true,
        fts_updated: true,
        language: 'zh' as const,
        error: null,
        item: ogv2Detail
      }
    }));

    render(Inspector, {
      props: {
        item: ogv2Detail,
        mode: 'desktop-split',
        language: 'zh',
        showReingest: true,
        onReingestItem,
        openRouterModels: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }],
        openRouterModelListState: 'available'
      }
    });

    const panel = within(screen.getByRole('complementary', { name: ogv2Detail.localized_title ?? ogv2Detail.title })).getByLabelText('本文重处理');
    expect(within(panel).queryByText(/^重新生成$/u), 'section label must not duplicate adjacent command').not.toBeInTheDocument();
    const regenerate = within(panel).getByRole('button', { name: '[重新生成]' });
    expect(regenerate).toHaveTextContent('[重新生成]');
    expect(within(panel).queryByRole('button', { name: '[确认重处理]' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '[取消]' })).not.toBeInTheDocument();

    await user.click(regenerate);
    await waitFor(() => expect(onReingestItem).toHaveBeenCalledTimes(1));
    expect(within(panel).queryByRole('button', { name: '[确认重处理]' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '[取消]' })).not.toBeInTheDocument();
  });

  it('OGV2-DISCLOSURES-INSPECTOR: Options, Text evidence, and Source info are low-chrome disclosures, not bracket commands', () => {
    render(Inspector, {
      props: {
        item: ogv2Detail,
        mode: 'desktop-split',
        showReingest: true,
        onReingestItem: vi.fn(),
        openRouterModels: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }],
        openRouterModelListState: 'available'
      }
    });

    const inspector = screen.getByRole('complementary', { name: ogv2Detail.title });
    disclosureTriggerContract(within(inspector).getByText(/^Options$/u), /^Options$/u);
    disclosureTriggerContract(within(inspector).getByText(/^Text evidence(?:\b|:)/u), /^Text evidence/u);
    disclosureTriggerContract(within(inspector).getByText(/^Source info$/u), /^Source info$/u);
  });

  it('OGV2-DISCLOSURES-ZH: 选项、文本证据、来源信息 are low-chrome disclosures, not bracket commands', () => {
    render(Inspector, {
      props: {
        item: ogv2Detail,
        mode: 'desktop-split',
        language: 'zh',
        showReingest: true,
        onReingestItem: vi.fn(),
        openRouterModels: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }],
        openRouterModelListState: 'available'
      }
    });

    const inspector = screen.getByRole('complementary', { name: ogv2Detail.localized_title ?? ogv2Detail.title });
    disclosureTriggerContract(within(inspector).getByText(/^选项$/u), /^选项$/u);
    disclosureTriggerContract(within(inspector).getByText(/^文本证据/u), /^文本证据/u);
    disclosureTriggerContract(within(inspector).getByText(/^来源信息$/u), /^来源信息$/u);
  });

  it('OGV2-SOURCE-LEDGER-DISCLOSURE: source diagnostics use source info / 来源信息 disclosure semantics and never [DETAILS]', () => {
    const englishLedger = renderLedger('en');
    expect(within(englishLedger).queryByText('[DETAILS]')).not.toBeInTheDocument();
    disclosureTriggerContract(within(englishLedger).getByText(/^source info$/iu), /^source info$/iu);

    renderLedger('zh');
    const zhLedgers = screen.getAllByRole('region', { name: 'SOURCE LEDGER' });
    const zhLedger = zhLedgers[zhLedgers.length - 1];
    expect(within(zhLedger).queryByText('[DETAILS]')).not.toBeInTheDocument();
    disclosureTriggerContract(within(zhLedger).getByText(/^来源信息$/u), /^来源信息$/u);
  });

  it('OGV2-STATE-IMPORT-CONFIRM: State import validates a selected bundle into inline [CONFIRM IMPORT] / [CANCEL] before replacement', async () => {
    const user = userEvent.setup();
    const onImportState = vi.fn(async () => {});
    render(StatePortability, {
      props: {
        onExportState: async () => portableBundle,
        onImportState
      }
    });

    const portability = screen.getByRole('group', { name: 'State portability' });
    const input = within(portability).getByLabelText('Choose state JSON') as HTMLInputElement;
    const file = new File([JSON.stringify(portableBundle)], 'state.json', { type: 'application/json' });
    await user.upload(input, file);

    const confirm = await within(portability).findByRole('button', { name: '[CONFIRM IMPORT]' });
    expect(confirm).toHaveFocus();
    expect(within(portability).getByRole('button', { name: '[CANCEL]' })).toBeVisible();
    expect(within(portability).getByText('Import State replaces active sources, rules, and stars.')).toBeVisible();
    expect(onImportState, 'destructive replacement must not begin before inline confirmation').not.toHaveBeenCalled();

    await user.click(within(portability).getByRole('button', { name: '[CANCEL]' }));
    expect(within(portability).getByRole('button', { name: '[IMPORT STATE]' })).toHaveFocus();
    expect(within(portability).queryByRole('button', { name: '[CONFIRM IMPORT]' })).not.toBeInTheDocument();
    expect(input.files).toHaveLength(0);

    await user.upload(input, file);
    await user.click(await within(portability).findByRole('button', { name: '[CONFIRM IMPORT]' }));
    await waitFor(() => expect(onImportState).toHaveBeenCalledTimes(1));
  });

  it('OGV2-NEGATIVE-DRIFT: product drift scans cover jobs/dashboards/queues/history/settings/backup-management/provider tabs/marketplace UI', () => {
    const forbiddenSurfacePatterns = [
      { id: 'jobs', pattern: /\b(?:jobs?|job dashboard|job list|job view)\b/iu },
      { id: 'dashboards', pattern: /\b(?:dashboards?|settings dashboard|retry dashboard|provider dashboard)\b/iu },
      { id: 'queues', pattern: /\b(?:queues?|queue view|queued jobs?)\b/iu },
      { id: 'history', pattern: /\b(?:operation history|command history|activity history|reading history|history surface)\b/iu },
      { id: 'settings', pattern: /\b(?:settings|preferences|preference center)\b/iu },
      { id: 'backup-management', pattern: /\bbackup[- ]management\b/iu },
      { id: 'provider tabs', pattern: /\bprovider tabs?\b|\b(?:openai|anthropic) tab\b/iu },
      { id: 'marketplace UI', pattern: /\b(?:provider marketplace|marketplace UI|marketplace)\b/iu }
    ];

    const fixtureCoverage = new Set(frontendAcceptanceContractLock.negativeUxForbiddenConcepts.map((concept) => concept.toLowerCase()));
    expect(fixtureCoverage, 'fixture must explicitly lock backup-management drift').toContain('backup-management ui');
    expect(fixtureCoverage, 'fixture must explicitly lock provider tab drift').toContain('provider tabs');
    expect(fixtureCoverage, 'fixture must explicitly lock marketplace drift').toContain('marketplace ui');

    const offenders = collectProductionRouteFiles().flatMap((file) => {
      const rel = path.relative(process.cwd(), file);
      const source = fs.readFileSync(file, 'utf8');
      return forbiddenSurfacePatterns
        .filter(({ pattern }) => pattern.test(source))
        .map(({ id }) => `${id}: ${rel}`);
    });

    expect(offenders).toEqual([]);
  });
});
