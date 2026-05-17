import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

type ExtractionStatus = 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
type ModelStatus = 'ok' | 'summary_unavailable' | 'model_latency_error';

interface ItemSummary {
  readonly id: string;
  readonly source_id: string;
  readonly source_title: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string | null;
  readonly core_insight: string | null;
  readonly display_excerpt?: string | null;
  readonly value_tier: string | null;
  readonly published_at: string | null;
  readonly first_seen_at: string | null;
  readonly extraction_status: ExtractionStatus;
  readonly model_status: ModelStatus;
  readonly is_resonated: boolean;
  readonly human_inspected_at: string | null;
  readonly external_surfaced_at: string | null;
  readonly story_key: string | null;
  readonly duplicate_of_item_id: string | null;
}

interface Source {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly last_fetch_at: string | null;
  readonly last_fetch_status: 'ok' | 'rss_fetch_error' | 'not_fetched';
  readonly last_fetch_error?: string | null;
  readonly is_active: boolean;
  readonly revision: number;
}

interface ItemDetail extends ItemSummary {
  readonly feed_excerpt: string | null;
  readonly extracted_text: string | null;
  readonly provenance: {
    readonly source_url: string;
    readonly canonical_url: string | null;
    readonly original_url: string;
    readonly story_key: string | null;
    readonly duplicate_of_item_id: string | null;
    readonly grouped_source_items: readonly [];
  };
}

const contractSource: Source = {
  id: 'src_ui_preview_conformance',
  url: 'https://feeds.example.test/ui-preview.xml',
  title: 'UI Preview Contract Source',
  last_fetch_at: '2026-05-17T09:00:00Z',
  last_fetch_status: 'ok',
  is_active: true,
  revision: 1
};

const contractItem: ItemSummary = {
  id: 'item_ui_preview_conformance',
  source_id: contractSource.id,
  source_title: contractSource.title,
  url: 'https://articles.example.test/original-article',
  title: 'UI preview conformance article',
  summary: 'Dense rendered summary for the conformance repair regression contract.',
  core_insight: 'The browser-rendered UI must match the static preview before product fixes proceed.',
  display_excerpt: 'Fallback display excerpt for rendered proof.',
  value_tier: 'high',
  published_at: '2026-05-17T08:30:00Z',
  first_seen_at: '2026-05-17T08:35:00Z',
  extraction_status: 'full',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
};

const contractDetail: ItemDetail = {
  ...contractItem,
  feed_excerpt: 'Feed excerpt for the original article.',
  extracted_text: 'Full article text remains readable in the Inspector without raw provenance URL inventory rows.',
  provenance: {
    source_url: contractSource.url,
    canonical_url: 'https://articles.example.test/canonical-article',
    original_url: contractItem.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
};

async function fulfillJson(route: Route, payload: object, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installRenderedUiFixtures(page: Page, ownerToken: string, language: 'en' | 'zh' = 'en'): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
  }, ownerToken);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/sources') {
      await fulfillJson(route, { sources: [contractSource] });
      return;
    }
    if (url.pathname === '/api/feed/today') {
      await fulfillJson(route, { items: [contractItem] });
      return;
    }
    if (url.pathname === `/api/items/${contractItem.id}`) {
      await fulfillJson(route, { item: contractDetail });
      return;
    }
    if (url.pathname === '/api/runtime/language') {
      await fulfillJson(route, { language: language === 'zh' ? { code: 'zh', label: '中文' } : { code: 'en', label: 'English' } });
      return;
    }
    if (url.pathname === '/api/runtime/operation') {
      await fulfillJson(route, { operation: { running: false, kind: null, scope: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
      return;
    }
    if (url.pathname === '/api/steer/active') {
      await fulfillJson(route, { rules: [] });
      return;
    }

    await fulfillJson(route, { error: { code: 'not_found', message: `not found: ${url.pathname}`, details: {} } }, 404);
  });
}

async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'RESOFEED' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open Inspector for: ${contractItem.title}` })).toBeVisible();
}

async function attachRenderedEvidence(page: Page, testInfo: TestInfo, name: string, target = 'body'): Promise<void> {
  const evidenceDir = path.join(testInfo.outputDir, 'ui-preview-conformance-repair-evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const ariaPath = path.join(evidenceDir, `${name}.aria.txt`);
  const domPath = path.join(evidenceDir, `${name}.dom.txt`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.promises.writeFile(ariaPath, await page.locator(target).ariaSnapshot(), 'utf8');
  await fs.promises.writeFile(domPath, await page.locator(target).evaluate((element) => element.outerHTML), 'utf8');

  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${name}.aria.txt`, { path: ariaPath, contentType: 'text/plain' });
  await testInfo.attach(`${name}.dom.txt`, { path: domPath, contentType: 'text/plain' });
}

test.describe('expected-red BUG_NOT_CHANGE UI preview conformance regressions', () => {
  test('DESIGN/UI preview: idle top command/header does not reserve a blank strip below the command row', async ({ page, ownerToken }, testInfo) => {
    // Contract basis: docs/DESIGN.md wireframe shows Steer/RESOFEED immediately followed by feed/Inspector content;
    // docs/ui-preview.html only renders a populated runtime strip, not an empty idle spacer under the command bar.
    await page.setViewportSize({ width: 1280, height: 720 });
    await installRenderedUiFixtures(page, ownerToken);
    await page.goto('/');
    await waitForShell(page);
    await attachRenderedEvidence(page, testInfo, 'idle-top-command-blank-strip', '.resofeed-shell');

    const routePreview = page.locator('.steer-route-preview[data-route-kind="idle"]');
    const routePreviewBox = await routePreview.boundingBox();
    expect(routePreviewBox, 'idle route preview element is rendered').not.toBeNull();
    expect(routePreviewBox?.height ?? 0, 'idle command/header area must not reserve a visible blank strip below the command row').toBeLessThanOrEqual(1);
  });

  test('DESIGN/UI preview: Inspector exposes exactly one user-facing original article link and no redundant raw URL list', async ({ page, ownerToken }, testInfo) => {
    // Contract basis: docs/DESIGN.md Inspector anatomy calls for title + original link + provenance lines;
    // docs/ui-preview.html renders a single `original ↗` affordance rather than url/source url/canonical url/original link rows.
    await page.setViewportSize({ width: 1280, height: 720 });
    await installRenderedUiFixtures(page, ownerToken);
    await page.goto('/');
    await waitForShell(page);
    await page.getByRole('button', { name: `Open Inspector for: ${contractItem.title}` }).click();
    const inspector = page.locator('.contract-inspector');
    await expect(inspector.getByRole('heading', { name: contractItem.title })).toBeVisible();
    await attachRenderedEvidence(page, testInfo, 'inspector-original-link-raw-url-list', '.detail-pane');

    const originalArticleHrefCount = await inspector.locator('a').evaluateAll((anchors, href) => anchors.filter((anchor) => anchor instanceof HTMLAnchorElement && anchor.href === href).length, contractItem.url);
    await expect(inspector.getByRole('link', { name: /^original link$/i }), 'one visible original article link label is required').toHaveCount(1);
    expect(originalArticleHrefCount, 'the original article URL must appear as exactly one user-facing link').toBe(1);
    await expect(inspector.locator('.contract-provenance-anchors'), 'raw URL provenance list must not be visible in Inspector').toHaveCount(0);
    await expect(inspector.getByText(/^(url|source url|canonical url)$/i), 'raw provenance labels must not render as redundant user-facing URL rows').toHaveCount(0);
  });

  test('DESIGN/UI preview: opened RESOFEED menu uses preview grid/grouping with Chinese labels fitting without overflow', async ({ page, ownerToken }, testInfo) => {
    // Contract basis: docs/DESIGN.md App Shell permits TODAY/SOURCE LEDGER inside the discreet RESOFEED menu;
    // docs/ui-preview.html groups runtime language/reprocess controls with low-chrome actions and includes Chinese labels in the narrow preview.
    await page.setViewportSize({ width: 390, height: 844 });
    await installRenderedUiFixtures(page, ownerToken, 'zh');
    await page.goto('/');
    await waitForShell(page);
    const menuRoot = page.locator('details[aria-label="RESOFEED surface menu"]');
    await menuRoot.locator('summary', { hasText: 'RESOFEED' }).click();
    await expect(menuRoot).toHaveAttribute('open', '');
    const menu = menuRoot.locator('.surface-nav-menu');
    await attachRenderedEvidence(page, testInfo, 'resofeed-menu-open-chinese-layout', 'details[aria-label="RESOFEED surface menu"]');

    await expect(menu.getByRole('button', { name: 'TODAY' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'SOURCE LEDGER' })).toBeVisible();
    await expect(menu.getByRole('button', { name: /处理语言 中文; set English/i })).toBeVisible();
    await expect(menu.getByRole('button', { name: /重处理现有资料库并重建搜索索引|Reprocess existing library/i })).toBeVisible();

    const layout = await menu.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const menuBox = element.getBoundingClientRect();
      const children = Array.from(element.querySelectorAll('button, .runtime-language-controls')).map((child) => {
        const box = child.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, text: child.textContent?.trim() ?? '' };
      });
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        menuLeft: menuBox.left,
        menuRight: menuBox.right,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        children
      };
    });

    expect(layout.display, 'opened RESOFEED menu must use a grid layout matching docs/ui-preview.html grouping rather than an unstructured flex wrap').toBe('grid');
    expect(layout.gridTemplateColumns, 'menu grid must expose grouped navigation and runtime utility columns').not.toBe('none');
    expect(layout.scrollWidth, 'opened RESOFEED menu must not horizontally overflow the narrow viewport').toBeLessThanOrEqual(layout.clientWidth);
    for (const child of layout.children) {
      expect(child.left, `${child.text} must not overflow left edge`).toBeGreaterThanOrEqual(layout.menuLeft - 0.5);
      expect(child.right, `${child.text} must not overflow right edge`).toBeLessThanOrEqual(layout.menuRight + 0.5);
      expect(child.width, `${child.text} must retain positive measurable width for Chinese label fit`).toBeGreaterThan(0);
    }
  });
});
