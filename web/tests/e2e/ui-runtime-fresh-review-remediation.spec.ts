import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';

const exposedGaps = {
  'FR-01/FR-10': 'RESOFEED surface menu is closed by default, keyboard reachable, and toggles TODAY/SOURCE LEDGER at desktop and 390x844 mobile.',
  'FR-02': 'Feed time-group labels are contiguous chronological groups, never TODAY > YESTERDAY > TODAY for one feed page.',
  'FR-04': 'Inspector primary story surface discloses grouped duplicate/source items and provenance.',
  'FR-05': 'Each visible [FETCH] button keeps that text but has source-contextual accessible name.',
  'FR-06': 'Collapsed [DETAILS] controls do not inflate every Source Ledger row.',
  'FR-07': 'Source Ledger section is labelled by h1#source-ledger-title through aria-labelledby.',
  'FR-09': 'Mobile feed metadata remains one flat inline monospace truncating line with ellipsis, not multi-line wrapping.'
} as const;

type ItemFixture = {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string;
  readonly core_insight: string;
  readonly value_tier: string;
  readonly published_at: string;
  readonly first_seen_at: string;
  readonly extraction_status: 'full' | 'partial_extraction';
  readonly model_status: 'ok';
  readonly is_resonated: boolean;
  readonly human_inspected_at: null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
};

const sources = [
  {
    id: 'src_primary_story',
    url: 'https://primary.example.test/rss.xml',
    title: 'Primary Wire',
    last_fetch_at: '2026-05-15T14:02:05Z',
    last_fetch_status: 'ok',
    last_fetch_error: null,
    is_active: true,
    revision: 1
  },
  {
    id: 'src_duplicate_story',
    url: 'https://duplicate.example.test/rss.xml',
    title: 'Duplicate Ledger',
    last_fetch_at: '2026-05-15T14:03:06Z',
    last_fetch_status: 'rss_fetch_error',
    last_fetch_error: 'err: upstream timeout while retaining raw source provenance',
    is_active: true,
    revision: 2
  }
] as const;

const items: readonly ItemFixture[] = [
  {
    id: 'item_today_primary_story',
    source_id: 'src_primary_story',
    source_title: 'Primary Wire',
    url: 'https://primary.example.test/story',
    title: 'Primary grouped story keeps every source visible',
    summary: 'A primary story fixture whose duplicate source must stay visible in Inspector provenance.',
    core_insight: 'Grouping is transparent and does not suppress original source items.',
    value_tier: 'high',
    published_at: '2026-05-15T10:00:00Z',
    first_seen_at: '2026-05-15T10:00:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'story-shared-runtime-review',
    duplicate_of_item_id: null
  },
  {
    id: 'item_yesterday_between_today_groups',
    source_id: 'src_primary_story',
    source_title: 'Primary Wire',
    url: 'https://primary.example.test/yesterday',
    title: 'Yesterday item placed between today fixtures',
    summary: 'This fixture exposes repeated time label rendering if the UI does not derive contiguous groups.',
    core_insight: 'A single page must not render TODAY then YESTERDAY then TODAY.',
    value_tier: 'brief',
    published_at: '2026-05-14T13:00:00Z',
    first_seen_at: '2026-05-14T13:00:00Z',
    extraction_status: 'partial_extraction',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  },
  {
    id: 'item_today_duplicate_story',
    source_id: 'src_duplicate_story',
    source_title: 'Duplicate Ledger',
    url: 'https://duplicate.example.test/story-copy',
    title: 'Duplicate source item for primary grouped story',
    summary: 'A duplicate/source item sharing the primary story key for Inspector disclosure tests.',
    core_insight: 'Duplicate source provenance remains accessible.',
    value_tier: 'source-claim',
    published_at: '2026-05-15T09:30:00Z',
    first_seen_at: '2026-05-15T09:30:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: '2026-05-15T11:00:00Z',
    story_key: 'story-shared-runtime-review',
    duplicate_of_item_id: 'item_today_primary_story'
  }
] as const;

const runtimeSameUrlSources = [
  {
    id: 'src_fresh_runtime_a',
    url: 'https://fresh-runtime-a.example.test/rss.xml',
    title: 'Fresh Runtime A',
    last_fetch_at: '2026-05-15T14:10:00Z',
    last_fetch_status: 'ok',
    last_fetch_error: null,
    is_active: true,
    revision: 1
  },
  {
    id: 'src_fresh_runtime_b',
    url: 'https://fresh-runtime-b.example.test/rss.xml',
    title: 'Fresh Runtime B',
    last_fetch_at: '2026-05-15T14:11:00Z',
    last_fetch_status: 'ok',
    last_fetch_error: null,
    is_active: true,
    revision: 1
  }
] as const;

const runtimeSameUrlItems: readonly ItemFixture[] = [
  {
    id: 'item_fresh_runtime_a_primary',
    source_id: 'src_fresh_runtime_a',
    source_title: 'Fresh Runtime A',
    url: 'https://fresh-runtime.example.test/alpha-today-primary-story',
    title: 'Alpha Today Primary Story',
    summary: 'Primary same-URL runtime story from source A.',
    core_insight: 'The Inspector must not infer grouped-source rows from same runtime URLs on mobile.',
    value_tier: 'high',
    published_at: '2026-05-15T10:00:00Z',
    first_seen_at: '2026-05-15T10:00:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  },
  {
    id: 'item_fresh_runtime_b_same_url',
    source_id: 'src_fresh_runtime_b',
    source_title: 'Fresh Runtime B',
    url: 'https://fresh-runtime.example.test/alpha-today-primary-story',
    title: 'Alpha Today Primary Story',
    summary: 'Same URL runtime story from source B.',
    core_insight: 'Same URL without backend grouping authority remains standalone provenance.',
    value_tier: 'high',
    published_at: '2026-05-15T09:50:00Z',
    first_seen_at: '2026-05-15T09:50:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  }
] as const;

async function writeProof(testInfo: TestInfo, name: string, proof: unknown): Promise<void> {
  const outputDir = path.join(testInfo.outputDir, 'ui-runtime-fresh-review-remediation-proof');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${name}.json`);
  await fs.promises.writeFile(outputPath, JSON.stringify(proof, null, 2), 'utf8');
  await testInfo.attach(`${name}.json`, { path: outputPath, contentType: 'application/json' });
}

function itemDetail(item: ItemFixture): Record<string, unknown> {
  const groupedSourceItems = items
    .filter((candidate) => candidate.story_key !== null && candidate.story_key === item.story_key)
    .map((candidate) => ({
      item_id: candidate.id,
      source_id: candidate.source_id,
      source_title: candidate.source_title,
      source_url: sources.find((source) => source.id === candidate.source_id)?.url ?? 'https://unknown.example.test/rss.xml',
      url: candidate.url,
      canonical_url: candidate.url,
      title: candidate.title,
      published_at: candidate.published_at,
      first_seen_at: candidate.first_seen_at,
      extraction_status: candidate.extraction_status,
      model_status: candidate.model_status,
      story_key: candidate.story_key,
      duplicate_of_item_id: candidate.duplicate_of_item_id,
      is_selected_item: candidate.id === item.id
    }));

  return {
    ...item,
    feed_excerpt: `${item.title} feed excerpt`,
    extracted_text: `${item.title} extracted article text.`,
    provenance: {
      source_url: sources.find((source) => source.id === item.source_id)?.url ?? 'https://unknown.example.test/rss.xml',
      canonical_url: item.url,
      original_url: item.url,
      story_key: item.story_key,
      duplicate_of_item_id: item.duplicate_of_item_id,
      grouped_source_items: groupedSourceItems
    }
  };
}

async function installContractFixtureApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items } });
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname.startsWith('/api/items/') && request.method() === 'GET') {
      const id = url.pathname.split('/').at(-1) ?? '';
      const item = items.find((candidate) => candidate.id === id) ?? items[0];
      return route.fulfill({ json: { item: itemDetail(item) } });
    }
    if (url.pathname.endsWith('/inspect')) {
      return route.fulfill({ json: { item_id: items[0].id, human_inspected_at: '2026-05-15T12:00:00Z', already_applied: false } });
    }
    if (url.pathname === '/api/ingest' && request.method() === 'POST') {
      return route.fulfill({ json: { ingest: { scope: 'all', source_id: null, status: 'completed', started_at: '2026-05-15T14:00:00Z', completed_at: '2026-05-15T14:00:01Z', duration_ms: 1000, sources_attempted: 2, sources_succeeded: 2, sources_failed: 0, items_upserted: 0, errors: [] } } });
    }
    if (url.pathname.endsWith('/fetch') && request.method() === 'POST') {
      return route.fulfill({ json: { ingest: { scope: 'source', source_id: 'src_primary_story', status: 'completed', started_at: '2026-05-15T14:00:00Z', completed_at: '2026-05-15T14:00:01Z', duration_ms: 1000, sources_attempted: 1, sources_succeeded: 1, sources_failed: 0, items_upserted: 0, errors: [] }, source: sources[0] } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function installRuntimeSameUrlApi(page: Page): Promise<void> {
  await page.unroute('**/api/**');
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: runtimeSameUrlItems } });
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: runtimeSameUrlSources } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname.startsWith('/api/items/') && request.method() === 'GET') {
      const id = url.pathname.split('/').at(-1) ?? '';
      const item = runtimeSameUrlItems.find((candidate) => candidate.id === id) ?? runtimeSameUrlItems[0];
      const source = runtimeSameUrlSources.find((candidate) => candidate.id === item.source_id) ?? runtimeSameUrlSources[0];
      return route.fulfill({
        json: {
          item: {
            ...item,
            feed_excerpt: `${item.title} feed excerpt`,
            extracted_text: `${item.title} extracted article text.`,
            provenance: {
              source_url: source.url,
              canonical_url: item.url,
              original_url: item.url,
              story_key: item.story_key,
              duplicate_of_item_id: item.duplicate_of_item_id,
              grouped_source_items: []
            }
          }
        }
      });
    }
    if (url.pathname.endsWith('/inspect')) {
      return route.fulfill({ json: { item_id: runtimeSameUrlItems[0].id, human_inspected_at: '2026-05-15T12:00:00Z', already_applied: false } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openShell(page: Page, ownerToken: string): Promise<void> {
  await installContractFixtureApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

function surfaceMenu(page: Page): Locator {
  return page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
}

async function openLedger(page: Page): Promise<Locator> {
  const menu = surfaceMenu(page);
  if (!(await menu.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await menu.locator('summary').click();
  }
  await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  const ledgerSurface = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]');
  await expect(ledgerSurface).toHaveClass(/active-panel/);
  return ledgerSurface.locator('.source-ledger');
}

async function assertSurfaceMenuContract(page: Page, viewport: { readonly width: number; readonly height: number }, testInfo: TestInfo): Promise<void> {
  await page.setViewportSize(viewport);
  const menu = surfaceMenu(page);
  const summary = menu.locator('summary');
  await expect(summary, `RESOFEED summary must be visible at ${viewport.width}px`).toBeVisible();
  await expect(menu, `FR-01/FR-10 menu must be closed by default at ${viewport.width}px`).not.toHaveAttribute('open', '');
  await expect(menu.getByRole('button', { name: 'TODAY' }), `TODAY must not be visible while menu is closed at ${viewport.width}px`).toBeHidden();
  await expect(menu.getByRole('button', { name: 'SOURCE LEDGER' }), `SOURCE LEDGER must not be visible while menu is closed at ${viewport.width}px`).toBeHidden();

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(summary, `RESOFEED summary must be keyboard reachable at ${viewport.width}px`).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu, `keyboard activation opens RESOFEED menu at ${viewport.width}px`).toHaveAttribute('open', '');
  await expect(menu.getByRole('button', { name: 'TODAY' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'SOURCE LEDGER' })).toBeVisible();

  await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);
  await menu.locator('summary').click();
  await menu.getByRole('button', { name: 'TODAY' }).click();
  await expect(page.locator('.feed-pane[aria-label="TODAY surface independent scroll"]')).toHaveClass(/active-panel/);

  await writeProof(testInfo, `fr-01-fr-10-surface-menu-${viewport.width}`, { viewport, exposedGap: exposedGaps['FR-01/FR-10'] });
}

test.describe('ui-runtime fresh review contract expected-red coverage', () => {
  test.beforeEach(async ({ page, ownerToken }, testInfo) => {
    await openShell(page, ownerToken);
    await writeProof(testInfo, 'exposed-gaps', exposedGaps);
  });

  test('FR-01/FR-10: RESOFEED surface menu is closed by default, keyboard reachable, and toggles TODAY/SOURCE LEDGER on desktop and mobile', async ({ page }, testInfo) => {
    await assertSurfaceMenuContract(page, { width: 1280, height: 900 }, testInfo);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
    await assertSurfaceMenuContract(page, { width: 390, height: 844 }, testInfo);
  });

  test('FR-02: time labels are contiguous chronological groups, never TODAY > YESTERDAY > TODAY', async ({ page }, testInfo) => {
    const labels = await page.locator('.contract-feed-meta').evaluateAll((metas) => metas
      .map((meta) => (meta.textContent ?? '').match(/\b(TODAY|YESTERDAY|EARLIER)\b/)?.[1] ?? null)
      .filter((label): label is string => label !== null));
    await writeProof(testInfo, 'fr-02-time-label-sequence', { labels, exposedGap: exposedGaps['FR-02'] });
    expect(labels, 'time-group labels must not repeat after another group intervenes').toEqual(['TODAY', 'YESTERDAY']);
  });

  test('FR-04: primary Inspector story surface discloses grouped duplicate/source items and provenance', async ({ page }, testInfo) => {
    const primary = page.locator('.contract-feed-item', { hasText: 'Primary grouped story keeps every source visible' }).first();
    await primary.getByRole('button', { name: /Open Inspector for:/ }).click();
    const inspector = page.locator('.contract-inspector');
    await expect(inspector).toBeVisible();
    await writeProof(testInfo, 'fr-04-duplicate-story-fixture', {
      primary_item_id: items[0].id,
      duplicate_item_id: items[2].id,
      shared_story_key: 'story-shared-runtime-review',
      exposedGap: exposedGaps['FR-04']
    });
    await expect(inspector, 'Inspector must disclose the grouped story source count').toContainText(/Grouped story with 2 source items/i);
    await expect(inspector, 'Inspector must disclose primary source provenance').toContainText('Primary Wire');
    await expect(inspector, 'Inspector must disclose duplicate/source item provenance').toContainText('Duplicate Ledger');
    await expect(inspector, 'Inspector must expose shared story_key provenance').toContainText('story-shared-runtime-review');
    await writeProof(testInfo, 'fr-04-rendered-inspector-grouped-sources', await inspector.locator('.contract-grouped-sources').evaluate((element) => ({
      text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      summary: element.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      accessibleName: element.querySelector('summary')?.getAttribute('aria-label') ?? '',
      sourceLinks: Array.from(element.querySelectorAll('a')).map((anchor) => ({
        text: anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        href: anchor.getAttribute('href') ?? '',
        ariaLabel: anchor.getAttribute('aria-label')
      }))
    })));
  });

  test('B1: mobile served-app Inspector does not infer grouped sources from exact same runtime URLs', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installRuntimeSameUrlApi(page);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

    const primary = page.locator('.contract-feed-item', { hasText: 'Alpha Today Primary Story' }).first();
    await primary.getByRole('button', { name: /Open Inspector for:/ }).click();
    const inspector = page.locator('.contract-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector, 'mobile Inspector must still show the primary source provenance').toContainText('Fresh Runtime A');
    await expect(inspector, 'mobile Inspector must not disclose a same-URL source without backend grouping authority').not.toContainText('Fresh Runtime B');
    await expect(inspector.locator('.contract-grouped-sources'), 'same URL alone must not create grouped-source disclosure').toHaveCount(0);
    await writeProof(testInfo, 'b1-mobile-runtime-same-url-no-client-inference', {
      viewport: { width: 390, height: 844 },
      inspectorText: await inspector.evaluate((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      groupedSourceDisclosureCount: await inspector.locator('.contract-grouped-sources').count(),
      detailProvidedGroupedItems: 0,
      feedProvidedSameUrlItems: 2,
      authority: 'docs/DESIGN.md Source Text Disclosure: grouped-source disclosure only for backend story_key, duplicate_of_item_id, or provenance.grouped_source_items; never by URL equality/normalization.',
      exposedGap: 'B1 public runtime mobile Inspector must not expose Fresh Runtime B solely because it has the same URL as Fresh Runtime A.'
    });
  });

  test('FR-05/FR-07: Source Ledger DOM contract and contextual [FETCH] accessible names hold at desktop and mobile', async ({ page }, testInfo) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }] as const) {
      await page.setViewportSize(viewport);
      const ledger = await openLedger(page);
      await expect(ledger, `FR-07 Source Ledger section must use aria-labelledby at ${viewport.width}px`).toHaveAttribute('aria-labelledby', 'source-ledger-title');
      await expect(ledger.locator('h1#source-ledger-title'), `FR-07 Source Ledger title h1 must be present at ${viewport.width}px`).toHaveText('SOURCE LEDGER');
      for (const source of sources) {
        const fetchButton = ledger.getByRole('button', { name: `Fetch source ${source.title}` });
        await expect(fetchButton, `FR-05 [FETCH] button must have contextual accessible name at ${viewport.width}px`).toHaveText('[FETCH]');
      }
      await writeProof(testInfo, `fr-05-fr-07-ledger-dom-${viewport.width}`, { viewport, exposedGaps: [exposedGaps['FR-05'], exposedGaps['FR-07']] });
    }
  });

  test('FR-06: collapsed [DETAILS] controls do not inflate every Source Ledger row', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const ledger = await openLedger(page);
    const rows = ledger.locator('.source-ledger__row');
    const firstRow = rows.first();
    const firstDetails = firstRow.locator('details.source-diagnostic-details');
    await expect(firstDetails).not.toHaveAttribute('open', '');
    const rowHeights = await rows.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    await writeProof(testInfo, 'fr-06-collapsed-details-row-heights', { rowHeights, exposedGap: exposedGaps['FR-06'] });
    for (const height of rowHeights) {
      expect(height, 'collapsed details must not inflate every Source Ledger row beyond compact 72px row geometry').toBeLessThanOrEqual(72);
    }
  });

  test('FR-09: mobile feed metadata stays a single flat inline monospace line with ellipsis/truncation, not wrapping', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const metadata = page.locator('.contract-feed-meta').first();
    const proof = await metadata.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        height: rect.height,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        display: style.display
      };
    });
    await writeProof(testInfo, 'fr-09-mobile-feed-metadata-style', { proof, exposedGap: exposedGaps['FR-09'] });
    expect(proof.fontFamily, 'metadata must use monospace chrome typography').toMatch(/Mono|monospace|Consolas|SFMono/i);
    expect(proof.whiteSpace, 'mobile metadata must remain a single flat inline row').toBe('nowrap');
    expect(proof.overflow, 'mobile metadata uses ellipsis instead of wrapping into a second line').toBe('hidden');
    expect(proof.textOverflow, 'mobile metadata truncates with ellipsis when the viewport is narrow').toBe('ellipsis');
    expect(proof.height, 'one metadata line should stay within the 16px metadata line-height plus minor browser rounding').toBeLessThanOrEqual(18);
  });
});
