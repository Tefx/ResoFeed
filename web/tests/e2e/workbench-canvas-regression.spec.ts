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

const fixtureItems = [
  {
    id: 'item_workbench_canvas',
    source_id: fixtureSource.id,
    source_title: fixtureSource.title,
    url: 'https://workbench-canvas.example.test/item',
    title: 'Workbench split view item stays readable',
    summary: 'A compact summary proves feed text measure stays bounded while the shell grows.',
    core_insight: 'The wide workbench can grow without turning feed rows into long text banners.',
    display_excerpt: 'A compact summary proves feed text measure stays bounded while the shell grows.',
    value_tier: 'high',
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
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [fixtureSource] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: fixtureItems } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname.startsWith('/api/items/')) {
      return route.fulfill({
        json: {
          item: {
            ...fixtureItems[0],
            feed_excerpt: 'Source-backed excerpt remains secondary to the readable Inspector payload.',
            extracted_text: 'Readable source text is available without changing the Inspector measure.',
            provenance: {
              source_url: fixtureSource.url,
              canonical_url: fixtureItems[0].url,
              original_url: fixtureItems[0].url,
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
    if (!shell || !grid || !feedPane || !inspectorPane || !feedTitle) throw new Error('wide workbench layout target missing');

    const shellRect = shell.getBoundingClientRect();
    const feedRect = feedPane.getBoundingClientRect();
    const inspectorRect = inspectorPane.getBoundingClientRect();
    const feedTitleRect = feedTitle.getBoundingClientRect();
    const gridColumns = window.getComputedStyle(grid).gridTemplateColumns;

    return {
      shellWidth: shellRect.width,
      shellHeight: shellRect.height,
      shellLeft: shellRect.left,
      shellRight: window.innerWidth - shellRect.right,
      feedWidth: feedRect.width,
      inspectorWidth: inspectorRect.width,
      gutterWidth: inspectorRect.left - feedRect.right,
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
  expect(layout.inspectorWidth).toBeGreaterThanOrEqual(420);
  expect(layout.inspectorWidth).toBeLessThanOrEqual(560);
  expect(layout.gutterWidth).toBeGreaterThanOrEqual(32);
  expect(layout.gutterWidth).toBeLessThanOrEqual(64);
  expect(layout.shellInnerToFeedTextLeft, 'Feed text anchors near shell inner left edge without a leading blank band').toBeGreaterThanOrEqual(32);
  expect(layout.shellInnerToFeedTextLeft, 'Feed text anchors near shell inner left edge without a leading blank band').toBeLessThanOrEqual(48);
  expect(layout.gridColumns.split(' ').length).toBeGreaterThanOrEqual(3);
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
    const inspectorTitle = document.querySelector('.contract-inspector h2');
    if (!feedRow || !detailPane || !inspectorTitle) throw new Error('desktop Inspector alignment target missing');

    const feedRect = feedRow.getBoundingClientRect();
    const detailRect = detailPane.getBoundingClientRect();
    const titleRect = inspectorTitle.getBoundingClientRect();

    return {
      feedTop: feedRect.top,
      titleTop: titleRect.top,
      titleInset: titleRect.left - detailRect.left,
      detailWidth: detailRect.width,
      titleLeft: titleRect.left
    };
  });

  expect(Math.abs(layout.titleTop - layout.feedTop), 'Inspector title top aligns with feed row content top').toBeLessThanOrEqual(1);
  expect(layout.titleInset, 'Inspector content is left-aligned inside its pane, not centered').toBeGreaterThanOrEqual(20);
  expect(layout.titleInset, 'Inspector side inset remains dense').toBeLessThanOrEqual(28);
  expect(layout.detailWidth).toBeGreaterThan(layout.titleInset * 2);

  await page.locator('.contract-inspector').focus();
  await expect(page.locator('.contract-inspector')).toBeFocused();
  await page.locator('.contract-inspector').dispatchEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
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
      backText: back.textContent?.trim() ?? ''
    };
  });

  expect(chrome.detailTop).toBe(0);
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
