import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const timestamp = '2026-05-20T12:00:00.000Z';

type InspectorItemId = 'item_full_model_backed' | 'item_excerpt_model_backed';

type TypographyStyle = {
  readonly color: string;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly lineHeight: string;
  readonly letterSpacing: string;
};

type OriginalLinkStyle = TypographyStyle & {
  readonly display: string;
  readonly minHeight: string;
  readonly paddingInlineStart: string;
  readonly paddingInlineEnd: string;
  readonly borderTopWidth: string;
  readonly borderRightWidth: string;
  readonly borderBottomWidth: string;
  readonly borderLeftWidth: string;
  readonly backgroundColor: string;
  readonly boxShadow: string;
  readonly height: number;
};

type InspectorStyleSnapshot = {
  readonly aiStatusValue: TypographyStyle;
  readonly sectionLabel: TypographyStyle;
  readonly sectionBody: TypographyStyle;
  readonly originalLink: OriginalLinkStyle;
};

const fixtureSource = {
  id: 'src_visual_uniformity',
  url: 'https://visual-uniformity.example.test/feed.xml',
  title: 'Visual Uniformity Source',
  last_fetch_at: timestamp,
  last_fetch_status: 'ok',
  last_fetch_error: null,
  is_active: true,
  revision: 1
} as const;

const fixtureItems = [
  {
    id: 'item_full_model_backed',
    source_id: fixtureSource.id,
    source_title: fixtureSource.title,
    url: 'https://visual-uniformity.example.test/full-model-backed',
    title: 'Full extraction model backed item',
    summary: 'A concise model-backed summary for the full extraction item.',
    core_insight: 'Full source text should not alter Inspector typography.',
    display_excerpt: 'A concise model-backed summary for the full extraction item.',
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
  },
  {
    id: 'item_excerpt_model_backed',
    source_id: fixtureSource.id,
    source_title: fixtureSource.title,
    url: 'https://visual-uniformity.example.test/source-excerpt-model-backed',
    title: 'Source excerpt model backed item',
    summary: 'A concise model-backed summary for the source excerpt item.',
    core_insight: 'RSS excerpt provenance should keep the same low-chrome metadata rhythm.',
    display_excerpt: 'A concise model-backed summary for the source excerpt item.',
    value_tier: 'source-claim',
    published_at: timestamp,
    first_seen_at: timestamp,
    extraction_status: 'partial_extraction',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: null,
    duplicate_of_item_id: null
  }
] as const;

function detailFor(id: InspectorItemId) {
  const item = fixtureItems.find((candidate) => candidate.id === id) ?? fixtureItems[0];
  return {
    ...item,
    feed_excerpt: `${item.title} feed excerpt remains readable provenance text.`,
    extracted_text: item.extraction_status === 'full'
      ? `${item.title} full article body. This body is long enough to render as reading copy without changing labels.`
      : null,
    provenance: {
      source_url: fixtureSource.url,
      canonical_url: item.url,
      original_url: item.url,
      story_key: null,
      duplicate_of_item_id: null,
      grouped_source_items: []
    }
  };
}

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
    if (url.pathname.startsWith('/api/items/') && url.pathname.endsWith('/inspect')) {
      const id = decodeURIComponent(url.pathname.split('/api/items/')[1]?.replace('/inspect', '') ?? fixtureItems[0].id) as InspectorItemId;
      return route.fulfill({ json: { item_id: id, human_inspected_at: timestamp, already_applied: false } });
    }
    if (url.pathname.startsWith('/api/items/')) {
      const id = decodeURIComponent(url.pathname.split('/api/items/')[1] ?? fixtureItems[0].id) as InspectorItemId;
      return route.fulfill({ json: { item: detailFor(id) } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function inspectorStyleSnapshot(inspector: Locator): Promise<InspectorStyleSnapshot> {
  return inspector.evaluate<InspectorStyleSnapshot>((element) => {
    function typographyStyle(target: Element): TypographyStyle {
      const style = window.getComputedStyle(target);
      return {
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing
      };
    }

    const aiStatusValue = element.querySelector('.inspector-frontmatter dd[aria-label^="AI status:"]');
    const sectionLabel = element.querySelector('.inspector-section-label');
    const sectionBody = element.querySelector('.inspector-section-copy');
    const originalLink = element.querySelector('.inspector-original-link');
    if (!aiStatusValue || !sectionLabel || !sectionBody || !originalLink) throw new Error('Inspector style target missing');
    const linkStyle = window.getComputedStyle(originalLink);
    const linkRect = originalLink.getBoundingClientRect();
    return {
      aiStatusValue: typographyStyle(aiStatusValue),
      sectionLabel: typographyStyle(sectionLabel),
      sectionBody: typographyStyle(sectionBody),
      originalLink: {
        ...typographyStyle(originalLink),
        display: linkStyle.display,
        minHeight: linkStyle.minHeight,
        paddingInlineStart: linkStyle.paddingInlineStart,
        paddingInlineEnd: linkStyle.paddingInlineEnd,
        borderTopWidth: linkStyle.borderTopWidth,
        borderRightWidth: linkStyle.borderRightWidth,
        borderBottomWidth: linkStyle.borderBottomWidth,
        borderLeftWidth: linkStyle.borderLeftWidth,
        backgroundColor: linkStyle.backgroundColor,
        boxShadow: linkStyle.boxShadow,
        height: linkRect.height
      }
    };
  });
}

async function openItem(page: Page, title: string): Promise<Locator> {
  await page.getByRole('button', { name: `Open Inspector for: ${title}` }).click();
  await expect(page.getByRole('heading', { name: title })).toBeFocused();
  return page.locator('.contract-inspector');
}

async function screenshotInspector(inspector: Locator, testInfo: TestInfo, name: string): Promise<string> {
  const screenshotDir = path.join(testInfo.outputDir, 'inspector-visual-uniformity');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  await inspector.screenshot({ path: screenshotPath });
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
  return screenshotPath;
}

test('Inspector provenance/source metadata typography is uniform for full and source-excerpt model-backed states', async ({ page, ownerToken }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixtureApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

  const fullInspector = await openItem(page, 'Full extraction model backed item');
  await expect(fullInspector.locator('.inspector-frontmatter dt').filter({ hasText: 'AI STATUS' })).toBeVisible();
  await expect(fullInspector.locator('.inspector-frontmatter dd[aria-label^="AI status:"]')).toHaveText('model-backed · full · quality: high');
  await expect(fullInspector.locator('.inspector-status-line')).toHaveCount(0);
  const fullStyles = await inspectorStyleSnapshot(fullInspector);
  const fullScreenshot = await screenshotInspector(fullInspector, testInfo, 'inspector-full-model-backed');

  const excerptInspector = await openItem(page, 'Source excerpt model backed item');
  await expect(excerptInspector.locator('.inspector-frontmatter dt').filter({ hasText: 'AI STATUS' })).toBeVisible();
  await expect(excerptInspector.locator('.inspector-frontmatter dd[aria-label^="AI status:"]')).toHaveText('model-backed · source excerpt · quality: source-claim');
  await expect(excerptInspector.locator('.inspector-status-line')).toHaveCount(0);
  const excerptStyles = await inspectorStyleSnapshot(excerptInspector);
  const excerptScreenshot = await screenshotInspector(excerptInspector, testInfo, 'inspector-source-excerpt-model-backed');

  expect.soft(excerptStyles.aiStatusValue, 'AI STATUS frontmatter value typography must match across extraction states').toEqual(fullStyles.aiStatusValue);
  expect.soft(excerptStyles.sectionLabel, 'section label typography must match across extraction states').toEqual(fullStyles.sectionLabel);
  expect.soft(excerptStyles.sectionBody, 'section body typography must match across extraction states').toEqual(fullStyles.sectionBody);
  expect.soft(excerptStyles.originalLink, 'original link low-chrome typography and box model must match across extraction states').toEqual(fullStyles.originalLink);

  expect(fullStyles.aiStatusValue.fontSize).toBe('12px');
  expect(fullStyles.aiStatusValue.lineHeight).toBe('16px');
  expect(fullStyles.sectionLabel.fontSize).toBe('12px');
  expect(fullStyles.sectionLabel.lineHeight).toBe('16px');
  expect(fullStyles.sectionBody.fontSize).toBe('18px');
  expect(fullStyles.sectionBody.lineHeight).toBe('28px');
  expect(fullStyles.originalLink.display).toBe('inline');
  expect(fullStyles.originalLink.paddingInlineStart).toBe('0px');
  expect(fullStyles.originalLink.paddingInlineEnd).toBe('0px');
  expect(fullStyles.originalLink.borderTopWidth).toBe('0px');
  expect(fullStyles.originalLink.borderRightWidth).toBe('0px');
  expect(fullStyles.originalLink.borderBottomWidth).toBe('0px');
  expect(fullStyles.originalLink.borderLeftWidth).toBe('0px');
  expect(fullStyles.originalLink.boxShadow).toBe('none');
  expect(fullStyles.originalLink.height).toBeLessThan(24);

  await testInfo.attach('inspector-visual-uniformity-screenshots.json', {
    body: JSON.stringify({ fullScreenshot, excerptScreenshot }, null, 2),
    contentType: 'application/json'
  });
});

test('narrow Inspector keeps Resonate in the title row with readable measure and command-bar clearance', async ({ page, ownerToken }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

  const inspector = await openItem(page, 'Full extraction model backed item');
  await expect(page).toHaveURL(/\/items\/item_full_model_backed$/);

  const titleRow = inspector.locator('.inspector-title-row');
  await expect(titleRow.getByRole('heading', { name: 'Full extraction model backed item' })).toBeVisible();
  await expect(titleRow.getByRole('button', { name: 'Resonate item: Full extraction model backed item' })).toBeVisible();
  await expect(inspector.locator('.inspector-header-row .contract-resonate')).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const shellCommand = document.querySelector('.shell-command');
    const detailPane = document.querySelector('.detail-pane.active-panel');
    const inspectorElement = document.querySelector('.contract-inspector');
    const title = document.querySelector('.inspector-title-row h2');
    const frontmatter = document.querySelector('.inspector-frontmatter');
    if (!shellCommand || !detailPane || !inspectorElement || !title || !frontmatter) throw new Error('narrow Inspector layout target missing');

    const commandRect = shellCommand.getBoundingClientRect();
    const detailRect = detailPane.getBoundingClientRect();
    const inspectorRect = inspectorElement.getBoundingClientRect();
    const titleStyle = window.getComputedStyle(title);
    const frontmatterStyle = window.getComputedStyle(frontmatter);

    return {
      commandTop: commandRect.top,
      detailBottom: detailRect.bottom,
      inspectorWidth: inspectorRect.width,
      titleFontSize: titleStyle.fontSize,
      titleLineHeight: titleStyle.lineHeight,
      frontmatterColumns: frontmatterStyle.gridTemplateColumns
    };
  });

  expect(layout.inspectorWidth).toBeLessThanOrEqual(390);
  expect(layout.titleFontSize).toBe('24px');
  expect(layout.titleLineHeight).toBe('30px');
  expect(layout.frontmatterColumns).toContain('px');
  expect(layout.detailBottom).toBeLessThanOrEqual(layout.commandTop + 1);

  const screenshotPath = await screenshotInspector(inspector, testInfo, 'narrow-inspector-title-row-measure');
  await testInfo.attach('narrow-inspector-layout.json', {
    body: JSON.stringify({ ...layout, screenshotPath }, null, 2),
    contentType: 'application/json'
  });
});

test('desktop item switch keeps Inspector mounted while new detail loads', async ({ page, ownerToken }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixtureApi(page, ownerToken);
  await page.route('**/api/items/item_excerpt_model_backed', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({ json: { item: detailFor('item_excerpt_model_backed') } });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Full extraction model backed item' })).toBeVisible();

  const before = await page.locator('.contract-inspector').evaluate((element) => {
    const title = element.querySelector('h2');
    const frontmatter = element.querySelector('.inspector-frontmatter');
    const body = element.querySelector('.inspector-section-copy');
    if (!title || !frontmatter || !body) throw new Error('initial Inspector geometry target missing');
    return {
      titleTop: title.getBoundingClientRect().top,
      frontmatterTop: frontmatter.getBoundingClientRect().top,
      bodyTop: body.getBoundingClientRect().top
    };
  });

  await page.getByRole('button', { name: 'Open Inspector for: Source excerpt model backed item' }).click();
  await expect(page.locator('.contract-inspector')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Full extraction model backed item' })).toBeVisible();
  await expect(page.locator('.inspector-transition-status')).toBeVisible();

  const during = await page.locator('.contract-inspector').evaluate((element) => {
    const title = element.querySelector('h2');
    const frontmatter = element.querySelector('.inspector-frontmatter');
    const body = element.querySelector('.inspector-section-copy');
    if (!title || !frontmatter || !body) throw new Error('loading Inspector geometry target missing');
    return {
      titleTop: title.getBoundingClientRect().top,
      frontmatterTop: frontmatter.getBoundingClientRect().top,
      bodyTop: body.getBoundingClientRect().top
    };
  });

  expect(during.titleTop).toBe(before.titleTop);
  expect(during.frontmatterTop).toBe(before.frontmatterTop);
  expect(during.bodyTop).toBe(before.bodyTop);
  await expect(page.getByRole('heading', { name: 'Source excerpt model backed item' })).toBeFocused();
});
