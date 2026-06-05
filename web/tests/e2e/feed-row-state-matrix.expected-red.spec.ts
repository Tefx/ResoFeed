import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const acceptedOwnerToken = 'rfeed_e2e_owner_token_00000000000000000000000000000000';
const selectedItemId = 'state-matrix-selected-item';

const fixtureItems = [
  {
    id: selectedItemId,
    source_id: 'state-matrix-source',
    source_title: 'State Matrix Source',
    url: 'https://example.test/state-matrix-selected',
    title: 'Selected item must avoid standalone markers through hover and focus',
    summary: 'Fixture summary for selected row state matrix verification.',
    core_insight: 'Selected row remains distinguishable without an extra active block.',
    value_tier: 'high',
    published_at: '2026-05-09T10:00:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'state-matrix-selected-story',
    duplicate_of_item_id: null
  },
  {
    id: 'state-matrix-normal-item',
    source_id: 'state-matrix-source',
    source_title: 'State Matrix Source',
    url: 'https://example.test/state-matrix-normal',
    title: 'Normal item baseline for hover and focus comparison',
    summary: 'Fixture summary for normal row state matrix verification.',
    core_insight: 'Normal row baseline keeps flat feed anatomy.',
    value_tier: null,
    published_at: '2026-05-09T09:00:00Z',
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: true,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'state-matrix-normal-story',
    duplicate_of_item_id: null
  }
] as const;

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type RowStyleSnapshot = {
  readonly ariaCurrent: string | null;
  readonly rowBackground: string;
  readonly markerBackground: string;
  readonly openBackground: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
  readonly box: Box;
  readonly standaloneMarkerVisible: boolean;
  readonly focusIndicatorVisible: boolean;
};

async function installStateMatrixApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: acceptedOwnerToken }
  );

  await page.route('**/api/sources', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        sources: [
          {
            id: 'state-matrix-source',
            url: 'https://example.test/feed.xml',
            title: 'State Matrix Source',
            last_fetch_at: '2026-05-09T10:00:00Z',
            last_fetch_status: 'ok',
            is_active: true,
            revision: 1
          }
        ]
      })
    });
  });
  await page.route('**/api/feed/today', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: fixtureItems }) });
  });
  await page.route('**/api/steer/active', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rules: [] }) });
  });
  for (const item of fixtureItems) {
    await page.route(`**/api/items/${item.id}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          item: {
            ...item,
            feed_excerpt: item.summary,
            extracted_text: `${item.summary} Full text stays readable in Inspector.`,
            provenance: {
              source_url: 'https://example.test/feed.xml',
              canonical_url: item.url,
              original_url: item.url,
              story_key: item.story_key,
              duplicate_of_item_id: null
            }
          }
        })
      });
    });
    await page.route(`**/api/items/${item.id}/inspect`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ item_id: item.id, human_inspected_at: '2026-05-09T10:05:00Z', already_applied: false })
      });
    });
  }
  await page.route('**/api/items/**/resonance', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item_id: selectedItemId, is_resonated: true, already_applied: false })
    });
  });
  await page.route('**/api/state/export', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T10:00:00Z', sources: [], steer_rules: [], resonated_items: [] })
    });
  });
}

async function openStateMatrixShell(page: Page): Promise<void> {
  await installStateMatrixApi(page);
  await page.goto('/');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open Inspector for: ${fixtureItems[0].title}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open Inspector for: ${fixtureItems[1].title}` })).toBeVisible();
}

function rowByTitle(page: Page, title: string): Locator {
  return page.locator('.contract-feed-item').filter({ has: page.getByRole('button', { name: `Open Inspector for: ${title}` }) });
}

async function rowStyle(row: Locator): Promise<RowStyleSnapshot> {
  return row.evaluate<RowStyleSnapshot>((element) => {
    const open = element.querySelector('.contract-feed-open');
    if (!(open instanceof HTMLElement)) throw new Error('feed open control missing');
    const rowStyleValue = window.getComputedStyle(element);
    const markerStyle = window.getComputedStyle(element, '::before');
    const openStyle = window.getComputedStyle(open);
    const rect = element.getBoundingClientRect();
    const outlineWidth = Number.parseFloat(openStyle.outlineWidth || '0');
    const markerBackground = markerStyle.backgroundColor;
    return {
      ariaCurrent: element.getAttribute('aria-current'),
      rowBackground: rowStyleValue.backgroundColor,
      markerBackground,
      openBackground: openStyle.backgroundColor,
      outlineStyle: openStyle.outlineStyle,
      outlineWidth: openStyle.outlineWidth,
      outlineColor: openStyle.outlineColor,
      boxShadow: openStyle.boxShadow,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      standaloneMarkerVisible: markerBackground !== 'rgba(0, 0, 0, 0)' && markerBackground !== 'transparent',
      focusIndicatorVisible: (outlineWidth >= 2 && openStyle.outlineStyle !== 'none') || openStyle.boxShadow !== 'none'
    };
  });
}

function expectSelectedWithoutStandaloneMarker(selected: RowStyleSnapshot, label: string): void {
  expect.soft(selected.standaloneMarkerVisible, `${label} must not expose a standalone selected marker`).toBe(false);
}

function hasQuietRowTone(selected: RowStyleSnapshot, normal: RowStyleSnapshot): boolean {
  return selected.rowBackground !== normal.rowBackground && selected.rowBackground !== 'rgba(0, 0, 0, 0)' && selected.rowBackground !== 'transparent';
}

function expectStableBox(before: RowStyleSnapshot, after: RowStyleSnapshot, label: string): void {
  expect.soft(after.box.width, `${label} must not shift row width`).toBeCloseTo(before.box.width, 0);
  expect.soft(after.box.height, `${label} must not shift row height`).toBeCloseTo(before.box.height, 0);
  expect.soft(after.box.x, `${label} must not translate row horizontally`).toBeCloseTo(before.box.x, 0);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
}

test.describe('expected-red feed row state matrix screenshot contract', () => {
  test('state matrix: normal hover selected selected-hover focus and selected-focus keep selected state readable without layout shift', async ({ page }, testInfo) => {
    await openStateMatrixShell(page);

    const selectedRow = rowByTitle(page, fixtureItems[0].title);
    const normalRow = rowByTitle(page, fixtureItems[1].title);
    const selectedOpen = selectedRow.locator('.contract-feed-open');
    const normalOpen = normalRow.locator('.contract-feed-open');

    const normal = await rowStyle(normalRow);
    expect(normal.ariaCurrent, 'normal row must not start selected/current').toBeNull();
    await attachScreenshot(page, testInfo, 'today-list');

    await normalOpen.hover();
    const hover = await rowStyle(normalRow);
    expectStableBox(normal, hover, 'hover state');

    await selectedOpen.click();
    await expect(selectedRow).toHaveAttribute('aria-current', 'true');
    const selected = await rowStyle(selectedRow);
    expectSelectedWithoutStandaloneMarker(selected, 'selected state');
    await attachScreenshot(page, testInfo, 'selected-item');

    await selectedOpen.hover();
    const selectedHover = await rowStyle(selectedRow);
    expectStableBox(selected, selectedHover, 'selected-hover state');
    expect(selectedHover.ariaCurrent, 'selected-hover must preserve selected/current semantics').toBe('true');
    expectSelectedWithoutStandaloneMarker(selectedHover, 'selected-hover state');
    await attachScreenshot(page, testInfo, 'selected-hover');

    await normalOpen.focus();
    const focus = await rowStyle(normalRow);
    expectStableBox(hover, focus, 'focus state');
    await attachScreenshot(page, testInfo, 'focus-feed-row');
    expect.soft(focus.focusIndicatorVisible, 'focus state must expose visible focus indicator').toBe(true);

    await selectedOpen.focus();
    const selectedFocus = await rowStyle(selectedRow);
    expectStableBox(selectedHover, selectedFocus, 'selected-focus state');
    expect(selectedFocus.ariaCurrent, 'selected-focus must preserve selected/current semantics').toBe('true');
    expectSelectedWithoutStandaloneMarker(selectedFocus, 'selected-focus state');
    await attachScreenshot(page, testInfo, 'selected-focus');
    expect.soft(selectedFocus.focusIndicatorVisible, 'selected-focus must expose focus ring independent of selected tone').toBe(true);

    await page.emulateMedia({ colorScheme: 'dark' });
    await selectedOpen.focus();
    const normalDark = await rowStyle(normalRow);
    const selectedFocusDark = await rowStyle(selectedRow);
    expectStableBox(selectedFocus, selectedFocusDark, 'selected-focus dark mode state');
    expect(selectedFocusDark.ariaCurrent, 'selected-focus dark mode must preserve selected/current semantics').toBe('true');
    expectSelectedWithoutStandaloneMarker(selectedFocusDark, 'selected-focus dark mode state');
    expect.soft(selectedFocusDark.focusIndicatorVisible, 'selected-focus dark mode must expose focus ring independent of selected tone').toBe(true);

    await testInfo.attach('feed-row-state-matrix-style-dump.json', {
      body: JSON.stringify({ normal, hover, selected, selectedHover, focus, selectedFocus, normalDark, selectedFocusDark }, null, 2),
      contentType: 'application/json'
    });

    if (hasQuietRowTone(selected, normal)) {
      expect(
        selectedHover.rowBackground,
        'selected-hover must preserve the current quiet selected row tone when that implementation is present'
      ).toBe(selected.rowBackground);
      expect(
        selectedFocus.rowBackground,
        'selected-focus must preserve the current quiet selected row tone when that implementation is present'
      ).toBe(selected.rowBackground);
    }
    expect(
      selectedHover.openBackground,
      'selected-hover must not add a second hover background block over selected state per docs/DESIGN.md:540-545'
    ).toBe(selected.openBackground);
  });
});
