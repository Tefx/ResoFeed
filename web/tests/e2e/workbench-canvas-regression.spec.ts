import type { Page } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const timestamp = '2026-05-20T12:00:00.000Z';

const fixtureSource = {
  id: 'src_workbench_canvas',
  url: 'https://workbench-canvas.example.test/feed.xml',
  title: 'Workbench Canvas Source',
  last_fetch_at: timestamp,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
} as const;

const fixtureSecondSource = {
  id: 'src_workbench_notes',
  url: 'https://workbench-notes.example.test/feed.xml',
  title: 'Workbench Notes Source',
  last_fetch_at: timestamp,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
} as const;

const fixtureItems = [
  {
    id: 'item_workbench_canvas',
    source_id: fixtureSource.id,
    source_title: fixtureSource.title,
    source_item_title: 'Workbench split view item stays readable',
    localized_title: null,
    url: 'https://workbench-canvas.example.test/item',
    title: 'Workbench split view item stays readable',
    summary: Array.from({ length: 18 }, (_, index) => `Inspector paragraph ${index + 1} proves line measure can stay readable while the outer right pane owns scrolling.`).join(' '),
    core_insight: 'The wide workbench can grow without turning feed rows into long text banners.',
    key_points: [
      'The Inspector pane is the scrollport, not the reading measure wrapper.',
      'The readable text column remains left-aligned with dense pane padding.',
      'The pane absorbs available desktop width without creating an inner scroll island.'
    ],
    display_excerpt: 'A compact summary proves feed text measure stays bounded while the shell grows.',
    value_tier: 'high',
    content_status: 'ok',
    last_reprocess_status: null,
    last_reprocess_error_code: null,
    last_reprocess_error_message: null,
    last_reprocess_at: null,
    published_at: timestamp,
    first_seen_at: timestamp,
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  }
] as const;

const fixtureSearchItems = [
  {
    ...fixtureItems[0],
    id: 'item_search_canvas',
    source_id: fixtureSecondSource.id,
    source_title: fixtureSecondSource.title,
    source_item_title: 'Search-only result must not leak after Escape',
    title: 'Search-only result must not leak after Escape',
    url: 'https://workbench-notes.example.test/search-result',
    summary: 'Search result summary belongs to the Search surface only.',
    core_insight: 'Escape must restore TODAY Inspector context instead of preserving this Search result.'
  }
] as const;

const fixtureAllItems = [...fixtureItems, ...fixtureSearchItems] as const;

async function installFixtureApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' } } });
    if (url.pathname === '/api/runtime/operation') {
      return route.fulfill({
        json: {
          operation: {
            running: false,
            kind: null,
            actor_kind: null,
            phase: null,
            count: null,
            message: null,
            started_at: null,
            updated_at: null
          }
        }
      });
    }
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [fixtureSource, fixtureSecondSource] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: fixtureItems } });
    if (url.pathname === '/api/search') {
      return route.fulfill({
        json: {
          items: fixtureSearchItems,
          query: {
            q: url.searchParams.get('q') ?? '',
            source: url.searchParams.get('source'),
            from: url.searchParams.get('from'),
            to: url.searchParams.get('to'),
            resonated: null,
            limit: Number(url.searchParams.get('limit') ?? 50)
          }
        }
      });
    }
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(url.pathname.slice('/api/items/'.length));
      const item = fixtureAllItems.find((candidate) => candidate.id === itemId) ?? fixtureItems[0];
      const source = item.source_id === fixtureSecondSource.id ? fixtureSecondSource : fixtureSource;
      return route.fulfill({
        json: {
          item: {
            ...item,
            feed_excerpt: 'Source-backed excerpt remains secondary to the readable Inspector payload.',
            extracted_text: Array.from({ length: 40 }, (_, index) => `Source evidence line ${index + 1} remains inside the outer Inspector scrollport.`).join('\n'),
            provenance: {
              source_url: source.url,
              canonical_url: item.url,
              original_url: item.url,
              story_key: null,
              duplicate_of_item_id: null,
              grouped_source_items: []
            }
          }
        }
      });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

test('wide desktop shell expands as a full-height workbench while Feed and Inspector stay bounded', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Inspector for: Workbench split view item stays readable' })).toBeVisible();
  await expect(page.locator('.detail-pane')).toBeVisible();
  await expect(page.locator('.contract-feed-item').first()).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Workbench split view item stays readable' })).toBeVisible();

  const layout = await page.evaluate(() => {
    const shell = document.querySelector('.contract-shell');
    const grid = document.querySelector('.shell-grid');
    const feedPane = document.querySelector('.feed-pane');
    const inspectorPane = document.querySelector('.detail-pane');
    const feedTitle = document.querySelector('.contract-feed-item .contract-feed-title');
    const readingGroupParts = Array.from(
      document.querySelectorAll(
        '.contract-inspector .inspector-title-row, .contract-inspector .inspector-frontmatter, .contract-inspector .inspector-text-section, .contract-inspector .inspector-points-section, .contract-inspector .inspector-reingest-panel, .contract-inspector .contract-source-details'
      )
    );
    if (!shell || !grid || !feedPane || !inspectorPane || !feedTitle || readingGroupParts.length === 0) throw new Error('wide workbench layout target missing');

    const shellRect = shell.getBoundingClientRect();
    const feedRect = feedPane.getBoundingClientRect();
    const inspectorRect = inspectorPane.getBoundingClientRect();
    const feedTitleRect = feedTitle.getBoundingClientRect();
    const readingGroupRects = readingGroupParts.map((element) => element.getBoundingClientRect());
    const readingGroupLeft = Math.min(...readingGroupRects.map((rect) => rect.left));
    const readingGroupRight = Math.max(...readingGroupRects.map((rect) => rect.right));
    const gridColumns = window.getComputedStyle(grid).gridTemplateColumns;
    const inspectorStyle = window.getComputedStyle(inspectorPane);

    return {
      shellWidth: shellRect.width,
      shellHeight: shellRect.height,
      shellLeft: shellRect.left,
      shellRight: window.innerWidth - shellRect.right,
      feedWidth: feedRect.width,
      inspectorWidth: inspectorRect.width,
      shellInnerToInspectorRight: shellRect.right - inspectorRect.right - parseFloat(window.getComputedStyle(shell).borderRightWidth),
      gutterWidth: inspectorRect.left - feedRect.right,
      inspectorBorderLeftWidth: parseFloat(inspectorStyle.borderLeftWidth),
      splitLineToReadingGroup: readingGroupLeft - inspectorRect.left,
      readingGroupToPaneRight: inspectorRect.right - readingGroupRight,
      readingGroupWidth: readingGroupRight - readingGroupLeft,
      shellInnerToFeedTextLeft: feedTitleRect.left - shellRect.left - parseFloat(window.getComputedStyle(shell).borderLeftWidth),
      gridColumns
    };
  });

  expect(layout.shellWidth).toBeGreaterThan(1216);
  expect(layout.shellWidth).toBeLessThanOrEqual(1538);
  expect(layout.shellHeight).toBeGreaterThanOrEqual(880);
  expect(layout.shellLeft).toBeGreaterThanOrEqual(16);
  expect(layout.shellRight).toBeGreaterThanOrEqual(16);
  expect(layout.feedWidth).toBeLessThanOrEqual(760);
  expect(layout.inspectorWidth).toBeGreaterThanOrEqual(560);
  expect(layout.inspectorWidth).toBeLessThanOrEqual(760);
  expect(layout.shellInnerToInspectorRight, 'Inspector pane absorbs trailing desktop width so its scrollbar belongs at the pane edge, not an inner column').toBeLessThanOrEqual(1);
  expect(layout.gutterWidth).toBeGreaterThanOrEqual(0);
  expect(layout.gutterWidth, 'Desktop split keeps Feed and Inspector adjacent without a phantom middle slab').toBeLessThanOrEqual(12);
  expect(layout.inspectorBorderLeftWidth, 'Visible split line sits on the Inspector pane boundary, not the Feed edge before the gutter').toBeGreaterThanOrEqual(1);
  expect(Math.abs(layout.splitLineToReadingGroup - layout.readingGroupToPaneRight), 'Wide desktop Inspector reading group balances split-line-to-content and content-to-pane-edge whitespace').toBeLessThanOrEqual(12);
  expect(layout.readingGroupWidth, 'Inspector reading group keeps a measured line length instead of stretching across the full pane').toBeLessThan(layout.inspectorWidth - 32);
  expect(layout.shellInnerToFeedTextLeft, 'Feed text anchors near shell inner left edge without a leading blank band').toBeGreaterThanOrEqual(32);
  expect(layout.shellInnerToFeedTextLeft, 'Feed text anchors near shell inner left edge without a leading blank band').toBeLessThanOrEqual(48);
  expect(layout.gridColumns.split(' ').length, 'Desktop split uses column-gap breathing room, not an explicit phantom middle slab track').toBe(2);
});

test('Search filters are collapsed, typed system controls, and Escape restores TODAY Inspector', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search canvas');
  await page.getByRole('button', { name: 'apply' }).click();

  const search = page.locator('.contract-search');
  await expect(search).toBeVisible();
  const filters = search.locator('.search-secondary-filters');
  await expect(filters).not.toHaveAttribute('open', /.+/);
  const summary = filters.locator('summary');

  const closedDisclosureBox = await filters.boundingBox();
  const closedSummaryBox = await summary.boundingBox();
  if (!closedDisclosureBox || !closedSummaryBox) throw new Error('search filter disclosure target missing');
  await page.mouse.click(closedDisclosureBox.x + closedDisclosureBox.width - 4, closedSummaryBox.y + closedSummaryBox.height / 2);
  await expect(filters, 'Blank row space to the right of the text-sized summary must not toggle filters').not.toHaveAttribute('open', /.+/);

  await summary.click();

  const source = search.locator('#search-source');
  const from = search.locator('#search-from');
  const to = search.locator('#search-to');
  const checkboxLabel = search.locator('.search-filter-checkbox');
  await expect.poll(async () => source.evaluate((element) => element.tagName)).toBe('SELECT');
  await expect(source.locator('option')).toHaveText(['All sources', 'Workbench Canvas Source', 'Workbench Notes Source']);
  await expect(from).toHaveAttribute('type', 'text');
  await expect(from).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  await expect(to).toHaveAttribute('type', 'text');
  await expect(to).toHaveAttribute('placeholder', 'YYYY-MM-DD');

  const filterMetrics = await search.evaluate(() => {
    const label = document.querySelector<HTMLElement>('.search-filter-checkbox');
    const input = document.querySelector<HTMLInputElement>('#search-resonated');
    const toInput = document.querySelector<HTMLInputElement>('#search-to');
    const details = document.querySelector<HTMLElement>('.search-secondary-filters');
    const summary = document.querySelector<HTMLElement>('.search-secondary-filters summary');
    const grid = document.querySelector<HTMLElement>('.search-secondary-grid');
    const status = document.querySelector<HTMLElement>('#search-status');
    const firstResult = document.querySelector<HTMLElement>('.contract-search-result');
    if (!label || !input || !toInput || !details || !summary || !grid || !status || !firstResult) throw new Error('search filter controls missing');
    const labelRect = label.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const toRect = toInput.getBoundingClientRect();
    const detailsRect = details.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const resultRect = firstResult.getBoundingClientRect();
    const labelStyle = window.getComputedStyle(label);
    return {
      checkboxDisplay: labelStyle.display,
      checkboxAlignItems: labelStyle.alignItems,
      hitTargetHeight: labelRect.height,
      summaryDisplay: window.getComputedStyle(summary).display,
      summaryWidth: summaryRect.width,
      detailsWidth: detailsRect.width,
      summaryMinHeight: parseFloat(window.getComputedStyle(summary).minHeight),
      summaryToGridGap: gridRect.top - summaryRect.bottom,
      gridToStatusGap: statusRect.top - gridRect.bottom,
      statusToFirstResultGap: resultRect.top - statusRect.bottom,
      centerDelta: Math.abs((labelRect.top + labelRect.height / 2) - (inputRect.top + inputRect.height / 2)),
      endDateWidth: toRect.width
    };
  });
  expect(filterMetrics.checkboxDisplay).toBe('flex');
  expect(filterMetrics.checkboxAlignItems).toBe('center');
  expect(filterMetrics.hitTargetHeight).toBeGreaterThanOrEqual(44);
  expect(filterMetrics.summaryDisplay).toBe('inline-flex');
  expect(filterMetrics.summaryMinHeight).toBeGreaterThanOrEqual(44);
  expect(filterMetrics.summaryWidth, 'Search summary is text-sized chrome, not a full clickable row').toBeLessThan(filterMetrics.detailsWidth / 2);
  expect(filterMetrics.summaryToGridGap, 'No unrelated blank band between filter summary and controls').toBeLessThanOrEqual(8);
  expect(filterMetrics.gridToStatusGap, 'No unrelated blank band between filters and status').toBeLessThanOrEqual(16);
  expect(filterMetrics.statusToFirstResultGap, 'No unrelated blank band between status and first search result').toBeLessThanOrEqual(16);
  expect(filterMetrics.centerDelta).toBeLessThanOrEqual(1);
  expect(filterMetrics.endDateWidth, 'End date text input is wide enough for YYYY-MM-DD').toBeGreaterThanOrEqual(144);

  await expect(page.getByRole('heading', { name: 'Search-only result must not leak after Escape' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'feed');
  await expect(page.getByRole('heading', { name: 'Workbench split view item stays readable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Search-only result must not leak after Escape' })).toHaveCount(0);
});

test('desktop split Inspector aligns to feed rows and Escape preserves the selected pane', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  await page.getByRole('button', { name: 'Open Inspector for: Workbench split view item stays readable' }).click();
  await expect(page.getByRole('heading', { name: 'Workbench split view item stays readable' })).toBeFocused();

  const layout = await page.evaluate(() => {
    const feedRow = document.querySelector('.contract-feed-item');
    const detailPane = document.querySelector('.detail-pane');
    const inspectorSurface = document.querySelector('.contract-inspector');
    const inspectorTitle = document.querySelector('.contract-inspector h2');
    if (!feedRow || !detailPane || !inspectorSurface || !inspectorTitle) throw new Error('desktop Inspector alignment target missing');

    const feedRect = feedRow.getBoundingClientRect();
    const detailRect = detailPane.getBoundingClientRect();
    const surfaceRect = inspectorSurface.getBoundingClientRect();
    const titleRect = inspectorTitle.getBoundingClientRect();
    const detailStyle = window.getComputedStyle(detailPane);
    const surfaceStyle = window.getComputedStyle(inspectorSurface);

    return {
      feedTop: feedRect.top,
      titleTop: titleRect.top,
      titleInset: titleRect.left - detailRect.left,
      detailWidth: detailRect.width,
      titleLeft: titleRect.left,
      detailLeft: detailRect.left,
      detailRight: detailRect.right,
      surfaceRight: surfaceRect.right,
      surfaceLeft: surfaceRect.left,
      detailOverflowY: detailStyle.overflowY,
      surfaceOverflowY: surfaceStyle.overflowY,
      surfaceTabIndex: inspectorSurface.getAttribute('tabindex'),
      detailCanScroll: detailPane.scrollHeight > detailPane.clientHeight,
      surfaceCanScroll: inspectorSurface.scrollHeight > inspectorSurface.clientHeight
    };
  });

  expect(Math.abs(layout.titleTop - layout.feedTop), 'Inspector title top aligns with feed row content top').toBeLessThanOrEqual(1);
  expect(layout.titleInset, 'Inspector content is left-aligned inside its pane, not centered').toBeGreaterThanOrEqual(20);
  expect(layout.titleInset, 'Inspector side inset remains dense').toBeLessThanOrEqual(28);
  expect(layout.detailWidth).toBeGreaterThan(layout.titleInset * 2);
  expect(Math.abs(layout.surfaceLeft - layout.detailLeft), 'Inspector surface spans from the detail pane left edge').toBeLessThanOrEqual(1);
  expect(Math.abs(layout.surfaceRight - layout.detailRight), 'Inspector surface spans to the detail pane right edge').toBeLessThanOrEqual(1);
  expect(layout.detailOverflowY, 'Desktop .detail-pane owns Inspector vertical scrolling').toBe('auto');
  expect(layout.surfaceOverflowY, 'Desktop .contract-inspector must not become an inner vertical scroll island').toBe('visible');
  expect(layout.surfaceTabIndex, 'Desktop .contract-inspector does not compete with .detail-pane as scroll focus owner').toBeNull();
  expect(layout.detailCanScroll, 'Fixture makes the right pane a real scrollport').toBe(true);
  expect(layout.surfaceCanScroll, 'The inner Inspector surface is not clipped into its own scrollport').toBe(false);

  await page.locator('.detail-pane').focus();
  await expect(page.locator('.detail-pane')).toBeFocused();
  await page.locator('.detail-pane').dispatchEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'inspector');
  await expect(page.locator('.detail-pane')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Workbench split view item stays readable' })).toBeVisible();
  await expect(page.locator('.contract-feed-item').first()).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.feed-pane')).toBeFocused();
  const focusStyle = await page.locator('.feed-pane').evaluate((element) => {
    const style = window.getComputedStyle(element);
    const row = document.querySelector('.contract-feed-item')!;
    const rowStyle = window.getComputedStyle(row);
    const rowMarker = window.getComputedStyle(row, '::before');
    return {
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      rowBackground: rowStyle.backgroundColor,
      markerColor: rowMarker.backgroundColor,
      markerWidth: rowMarker.width
    };
  });
  expect(focusStyle.outlineWidth, 'Feed focus is visible but quiet').toBe('1px');
  expect(focusStyle.outlineColor, 'Feed focus does not use bright cyan focus ink as a full pane strip').not.toBe('rgb(47, 111, 126)');
  expect(focusStyle.boxShadow, 'Feed focus remains an inset low-chrome line').toContain('inset');
  expect(focusStyle.rowBackground, 'Selected row relies on aria-current + Inspector context, not a large selected flood').toBe('rgba(0, 0, 0, 0)');
  expect(focusStyle.markerWidth, 'Feed layout keeps the scan rhythm gutter without widening the row').toBe('3px');
  expect(focusStyle.markerColor, 'Selected Feed row must not render a visible left pseudo-element marker/color block').toBe('rgba(0, 0, 0, 0)');
});

test('narrow dark canvas has no light gutters and keeps top chrome plus bottom Steer visible', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  await expect(page.getByText('RESOFEED')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

  const canvas = await page.evaluate(() => {
    const appRoot = document.body.firstElementChild;
    const shell = document.querySelector('.contract-shell');
    const command = document.querySelector('.shell-command');
    const nav = document.querySelector('.shell-command > .surface-nav');
    const brand = document.querySelector('.contract-brand');
    const feed = document.querySelector('.feed-pane');
    const input = document.querySelector('#steer-input');
    if (!appRoot || !shell || !command || !nav || !brand || !feed || !input) throw new Error('narrow dark canvas target missing');

    const inputRect = input.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const styles = [document.documentElement, document.body, appRoot, shell, command, nav, brand, feed].map((element) => window.getComputedStyle(element).backgroundColor);

    return {
      styles,
      inputTop: inputRect.top,
      inputBottom: inputRect.bottom,
      shellLeft: shellRect.left,
      shellRight: window.innerWidth - shellRect.right,
      shellHeight: shellRect.height
    };
  });

  const disallowedLightCanvas = new Set(['rgb(243, 240, 231)', 'rgb(251, 248, 239)', 'rgb(236, 230, 216)']);
  for (const color of canvas.styles) expect(disallowedLightCanvas.has(color), `unexpected light canvas band: ${color}`).toBe(false);
  expect(canvas.inputTop).toBeGreaterThanOrEqual(0);
  expect(canvas.inputBottom).toBeLessThanOrEqual(844);
  expect(canvas.shellLeft).toBe(0);
  expect(canvas.shellRight).toBe(0);
  expect(canvas.shellHeight).toBeGreaterThanOrEqual(844);
});

test('narrow dark Search chrome shares the active utility canvas', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search canvas');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.locator('.resofeed-shell')).toHaveAttribute('data-surface', 'search');
  await expect(page.locator('.search-surface.active-panel .contract-search')).toBeVisible();

  const canvas = await page.evaluate(() => {
    const command = document.querySelector<HTMLElement>('.shell-command');
    const nav = document.querySelector<HTMLElement>('.shell-command > .surface-nav');
    const utility = document.querySelector<HTMLElement>('.search-surface.active-panel');
    const search = document.querySelector<HTMLElement>('.search-surface.active-panel .contract-search');
    if (!command || !nav || !utility || !search) throw new Error('narrow Search canvas target missing');
    return {
      commandBackground: window.getComputedStyle(command).backgroundColor,
      navBackground: window.getComputedStyle(nav).backgroundColor,
      utilityBackground: window.getComputedStyle(utility).backgroundColor,
      searchBackground: window.getComputedStyle(search).backgroundColor
    };
  });

  expect(canvas.commandBackground, 'bottom Steer chrome matches narrow Search canvas').toBe(canvas.searchBackground);
  expect(canvas.navBackground, 'top nav chrome matches narrow Search canvas').toBe(canvas.searchBackground);
  expect(canvas.utilityBackground, 'active Search surface does not expose an outer color band').toBe(canvas.searchBackground);
});

test('narrow Inspector route uses one back header row and Escape returns to TODAY', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  await page.getByRole('button', { name: 'Open Inspector for: Workbench split view item stays readable' }).click();
  await expect(page).toHaveURL(/\/items\/item_workbench_canvas$/);
  await expect(page.getByRole('button', { name: 'back to TODAY' })).toBeVisible();
  await expect(page.locator('.shell-command > .surface-nav')).toBeHidden();

  const chrome = await page.evaluate(() => {
    const back = document.querySelector('.detail-pane.active-panel > .back-command');
    const detail = document.querySelector('.detail-pane.active-panel');
    if (!back || !detail) throw new Error('narrow Inspector chrome target missing');
    const backRect = back.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    return {
      backTop: backRect.top,
      detailTop: detailRect.top,
      detailBottomGap: window.innerHeight - detailRect.bottom,
      backText: back.textContent?.trim() ?? ''
    };
  });

  expect(chrome.detailTop).toBe(0);
  expect(chrome.detailBottomGap, 'narrow Inspector covers the bottom Steer chrome instead of leaving a color slab').toBe(0);
  expect(chrome.backTop).toBeGreaterThanOrEqual(0);
  expect(chrome.backTop).toBeLessThanOrEqual(1);
  expect(chrome.backText).toMatch(/TODAY/);

  await page.locator('.detail-pane.active-panel').evaluate((element) => { element.scrollTop = 240; });
  const scrolledBackTop = await page.locator('.detail-pane.active-panel > .back-command').evaluate((element) => element.getBoundingClientRect().top);
  expect(scrolledBackTop, 'narrow Inspector back row stays sticky while reading').toBeGreaterThanOrEqual(0);
  expect(scrolledBackTop, 'narrow Inspector back row stays sticky while reading').toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'feed');
});

test('Source Ledger and RESOFEED utility menu stay compact and top-clustered', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureApi(page, ownerToken);

  await page.goto('/');
  await page.getByText('RESOFEED').click();
  const menuMetrics = await page.locator('.surface-nav-menu').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const firstButton = element.querySelector('button');
    const firstButtonRect = firstButton?.getBoundingClientRect();
    return {
      height: rect.height,
      firstButtonOffset: firstButtonRect ? firstButtonRect.top - rect.top : Number.POSITIVE_INFINITY,
      alignContent: window.getComputedStyle(element).alignContent
    };
  });
  expect(menuMetrics.height, 'utility menu is compact chrome, not a sparse dashboard').toBeLessThan(320);
  expect(menuMetrics.firstButtonOffset, 'utility menu controls cluster near the top').toBeLessThan(44);

  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  const ledgerCanvas = await page.evaluate(() => {
    const command = document.querySelector<HTMLElement>('.shell-command');
    const nav = document.querySelector<HTMLElement>('.shell-command > .surface-nav');
    const utility = document.querySelector<HTMLElement>('.utility-surface.active-panel:not(.feed-pane)');
    const ledger = document.querySelector<HTMLElement>('.contract-source-ledger');
    if (!command || !nav || !utility || !ledger) throw new Error('narrow Source Ledger canvas target missing');
    return {
      commandBackground: window.getComputedStyle(command).backgroundColor,
      navBackground: window.getComputedStyle(nav).backgroundColor,
      utilityBackground: window.getComputedStyle(utility).backgroundColor,
      ledgerBackground: window.getComputedStyle(ledger).backgroundColor
    };
  });
  expect(ledgerCanvas.commandBackground, 'bottom Steer chrome matches narrow Source Ledger canvas').toBe(ledgerCanvas.ledgerBackground);
  expect(ledgerCanvas.navBackground, 'top nav chrome matches narrow Source Ledger canvas').toBe(ledgerCanvas.ledgerBackground);
  expect(ledgerCanvas.utilityBackground, 'active Source Ledger surface does not expose an outer color band').toBe(ledgerCanvas.ledgerBackground);
  const ledgerMetrics = await page.locator('.contract-source-ledger').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const header = element.querySelector('.source-ledger__header');
    const tools = element.querySelector('.source-ledger__tools');
    const row = element.querySelector('.source-ledger-row');
    const headerRect = header?.getBoundingClientRect();
    const toolsRect = tools?.getBoundingClientRect();
    const rowRect = row?.getBoundingClientRect();
    return {
      paddingTop: parseFloat(window.getComputedStyle(element).paddingTop),
      headerTop: headerRect ? headerRect.top - rect.top : Number.POSITIVE_INFINITY,
      toolsGap: headerRect && toolsRect ? toolsRect.top - headerRect.bottom : Number.POSITIVE_INFINITY,
      rowGap: toolsRect && rowRect ? rowRect.top - toolsRect.bottom : Number.POSITIVE_INFINITY,
      rowTop: rowRect ? rowRect.top - rect.top : Number.POSITIVE_INFINITY
    };
  });
  expect(ledgerMetrics.paddingTop).toBeLessThanOrEqual(16);
  expect(ledgerMetrics.headerTop).toBeLessThanOrEqual(16);
  expect(ledgerMetrics.toolsGap).toBeLessThanOrEqual(8);
  expect(ledgerMetrics.rowGap).toBeLessThanOrEqual(8);
  expect(ledgerMetrics.rowTop, 'ledger rows cluster near top').toBeLessThan(220);
});
