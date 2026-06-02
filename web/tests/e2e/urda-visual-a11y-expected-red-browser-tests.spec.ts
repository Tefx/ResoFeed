import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locator, Page, TestInfo } from 'playwright/test';

import { expect, test } from './fixtures';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ownerTokenStorageKey = 'resofeed.ownerToken';
const timestamp = '2026-05-15T12:34:56.000Z';

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type StyleProof = {
  readonly backgroundColor: string;
  readonly color: string;
  readonly outlineColor: string;
  readonly outlineStyle: string;
  readonly transitionDuration: string;
  readonly transform: string;
};

type MetadataProof = {
  readonly text: string;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly whiteSpace: string;
  readonly overflow: string;
  readonly visibleSourceWidth: number;
  readonly fullSourceWidth: number;
};

type LinkProof = {
  readonly color: string;
  readonly textDecorationLine: string;
};

type HeadingProof = {
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly lineHeight: string;
  readonly fontWeight: string;
};

const fixtureSource = {
  id: 'src_urda_visual_a11y',
  url: 'https://very-long-source.example.com/feeds/research/2026/05/14/extremely/deep/path/that/should/ellipsis.xml',
  title: 'simonwillison.net extremely long source label for mobile metadata legibility',
  last_fetch_at: timestamp,
  last_fetch_status: 'rss_fetch_error',
  last_fetch_error: 'err: timeout contacting origin after 30000ms',
  is_active: true,
  revision: 1
} as const;

const unresonatedItems = [
  {
    id: 'item_urda_agents_shell',
    source_id: fixtureSource.id,
    source_title: fixtureSource.title,
    url: 'https://very-long-source.example.com/items/agents-shell',
    title: 'Agents are the new shell scripts',
    summary: 'Agent workflows are becoming small composable automation units.',
    core_insight: 'Agent workflows should stay inspectable.',
    display_excerpt: 'Agent workflows are becoming small composable automation units.',
    value_tier: 'high',
    published_at: timestamp,
    first_seen_at: timestamp,
    extraction_status: 'full',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: timestamp,
    story_key: 'story-urda-agents-shell',
    duplicate_of_item_id: null
  },
  {
    id: 'item_urda_sqlite_edge',
    source_id: fixtureSource.id,
    source_title: fixtureSource.title,
    url: 'https://very-long-source.example.com/items/sqlite-edge',
    title: 'SQLite on the edge without a platform',
    summary: 'SQLite replicas can stay close to users without managed platform lock-in.',
    core_insight: 'Durable local state can remain simple.',
    display_excerpt: 'SQLite replicas can stay close to users without managed platform lock-in.',
    value_tier: 'source-claim',
    published_at: '2026-05-15T10:00:00.000Z',
    first_seen_at: '2026-05-15T10:00:00.000Z',
    extraction_status: 'partial_extraction',
    model_status: 'ok',
    is_resonated: false,
    human_inspected_at: null,
    external_surfaced_at: null,
    story_key: 'story-urda-sqlite-edge',
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
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources: [fixtureSource] } });
    if (url.pathname === '/api/feed/today') return route.fulfill({ json: { items: unresonatedItems } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') {
      return route.fulfill({
        json: {
          items: unresonatedItems,
          query: { q: url.searchParams.get('q') ?? '', source: null, from: null, to: null, resonated: null, limit: 50 }
        }
      });
    }
    if (url.pathname.startsWith('/api/items/')) {
      const matched = unresonatedItems.find((item) => url.pathname.includes(item.id)) ?? unresonatedItems[0];
      return route.fulfill({
        json: {
          item: {
            ...matched,
            feed_excerpt: matched.display_excerpt,
            extracted_text: `${matched.title} full article text remains source-backed and readable.`,
            provenance: {
              source_url: fixtureSource.url,
              canonical_url: matched.url,
              original_url: matched.url,
              story_key: matched.story_key,
              duplicate_of_item_id: null
            }
          }
        }
      });
    }
    if (url.pathname.endsWith('/inspect')) return route.fulfill({ json: { item_id: unresonatedItems[0].id, human_inspected_at: timestamp, already_applied: false } });
    if (url.pathname.endsWith('/resonance')) return route.fulfill({ json: { item_id: unresonatedItems[0].id, is_resonated: true, already_applied: false } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openShell(page: Page, ownerToken: string): Promise<void> {
  await installFixtureApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function openSurfaceMenu(page: Page): Promise<Locator> {
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  await menu.locator('summary').click();
  return menu;
}

async function openSourceLedger(page: Page): Promise<Locator> {
  const menu = await openSurfaceMenu(page);
  await menu.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  const ledger = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]');
  await expect(ledger).toHaveClass(/active-panel/);
  return ledger;
}

async function openSearch(page: Page): Promise<Locator> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('search sqlite');
  await steer.press('Enter');
  await expect(page.locator('.shell-grid[data-surface="search"]')).toBeVisible();
  const search = page.locator('.feed-pane.active-panel[aria-label="Search surface independent scroll"]');
  await expect(search).toBeVisible();
  return search;
}

async function writeProof(testInfo: TestInfo, name: string, proof: unknown): Promise<void> {
  const outDir = path.join(testInfo.outputDir, 'urda-visual-a11y-expected-red-proof');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.json`);
  await fs.promises.writeFile(outPath, JSON.stringify(proof, null, 2), 'utf8');
  await testInfo.attach(`${name}.json`, { path: outPath, contentType: 'application/json' });
}

async function saveScreenshot(locator: Locator, testInfo: TestInfo, name: string): Promise<void> {
  const outDir = path.join(testInfo.outputDir, 'urda-visual-a11y-expected-red-proof');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.png`);
  await locator.screenshot({ path: outPath });
  await testInfo.attach(`${name}.png`, { path: outPath, contentType: 'image/png' });
}

function remember(violations: string[], issue: number, message: string): void {
  violations.push(`Issue ${issue}: ${message}`);
}

async function styleProof(locator: Locator): Promise<StyleProof> {
  return locator.evaluate<StyleProof>((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      transitionDuration: style.transitionDuration,
      transform: style.transform
    };
  });
}

test.describe('URDA expected-red visual and accessibility coverage', () => {
  test('Issue 3: docs/ui-preview Source Ledger fixture includes manual ingest, row fetch, timestamp, and raw err examples', async ({ page }, testInfo) => {
    const violations: string[] = [];
    const previewHtml = await fs.promises.readFile(path.join(repoRoot, 'docs', 'ui-preview.html'), 'utf8');
    await page.setContent(previewHtml, { waitUntil: 'domcontentloaded' });
    const ledger = page.locator('.source-ledger');
    await expect(ledger).toBeVisible();
    await saveScreenshot(ledger, testInfo, 'issue-3-ui-preview-ledger-rendered');

    const ledgerText = await ledger.innerText();
    if (!ledgerText.includes('[RUN INGEST]')) remember(violations, 3, 'docs/ui-preview.html rendered Source Ledger does not show [RUN INGEST].');
    if (!ledgerText.includes('[FETCH]')) remember(violations, 3, 'docs/ui-preview.html rendered source rows do not show row-level [FETCH].');
    if (!/last_ingest:\s*\d{2}:\d{2}:\d{2}/.test(ledgerText)) remember(violations, 3, 'docs/ui-preview.html rendered Source Ledger does not show last_ingest: HH:MM:SS.');
    if (!/err:\s*\S+/.test(ledgerText)) remember(violations, 3, 'docs/ui-preview.html rendered source rows do not include raw err: examples.');
    await writeProof(testInfo, 'issue-3-preview-text-proof', { ledgerText, violations });

    expect(violations).toEqual([]);
  });

  test('Issues 7-14: rendered app visual/a11y checks expose current runtime divergences', async ({ page, ownerToken, browser }, testInfo) => {
    const violations: string[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await openShell(page, ownerToken);

    const ledger = await openSourceLedger(page);
    const bracketAction = ledger.locator('.bracket-action').filter({ hasText: '[EXPORT STATE]' }).first();
    await expect(bracketAction).toBeVisible();
    await bracketAction.hover();
    const hoverStyle = await styleProof(bracketAction);
    await bracketAction.focus();
    const focusStyle = await styleProof(bracketAction);
    await writeProof(testInfo, 'issue-7-bracket-action-computed-styles', { hoverStyle, focusStyle });
    if (hoverStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || hoverStyle.backgroundColor === 'transparent') remember(violations, 7, `hover background remains transparent (${hoverStyle.backgroundColor}) instead of token inversion/highlight.`);
    if (focusStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || focusStyle.backgroundColor === 'transparent') remember(violations, 7, `focus-visible background remains transparent (${focusStyle.backgroundColor}) instead of token inversion/highlight.`);
    if (hoverStyle.transitionDuration !== '0s' || focusStyle.transitionDuration !== '0s') remember(violations, 7, `hover/focus transition duration is not immediate: hover=${hoverStyle.transitionDuration}, focus=${focusStyle.transitionDuration}.`);
    if (hoverStyle.transform !== 'none' || focusStyle.transform !== 'none') remember(violations, 7, `hover/focus transform must remain none: hover=${hoverStyle.transform}, focus=${focusStyle.transform}.`);

    const search = await openSearch(page);
    await saveScreenshot(search, testInfo, 'issues-8-9-search-rendered-1280');
    const architectureNote = 'Lexical and metadata retrieval only; results stay source-backed.';
    if (await search.getByText(architectureNote, { exact: true }).count() > 0) remember(violations, 8, `Search renders internal architecture/design explanation prose: "${architectureNote}".`);

    const alignment = await page.evaluate<Record<string, { readonly label: Box; readonly control: Box; readonly centerDelta: number; readonly gap: number }>>(() => {
      function boxFor(selector: string): Box {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return { x: rect?.x ?? -1, y: rect?.y ?? -1, width: rect?.width ?? 0, height: rect?.height ?? 0 };
      }
      const pairs = {
        source: ['label[for="search-source"]', '#search-source'],
        from: ['label[for="search-from"]', '#search-from'],
        to: ['label[for="search-to"]', '#search-to'],
        limit: ['label[for="search-limit"]', '#search-limit']
      } as const;
      return Object.fromEntries(
        Object.entries(pairs).map(([name, [labelSelector, controlSelector]]) => {
          const label = boxFor(labelSelector);
          const control = boxFor(controlSelector);
          return [name, {
            label,
            control,
            centerDelta: Math.abs((label.y + label.height / 2) - (control.y + control.height / 2)),
            gap: control.x - (label.x + label.width)
          }];
        })
      );
    });
    await writeProof(testInfo, 'issue-9-search-filter-alignment-1280', alignment);
    for (const [name, pair] of Object.entries(alignment)) {
      if (pair.centerDelta > 6 || pair.gap < 0 || pair.gap > 24) remember(violations, 9, `${name} label/control pair is visually disconnected at 1280px: centerDelta=${pair.centerDelta}, gap=${pair.gap}.`);
    }

    const menu = await openSurfaceMenu(page);
    await menu.getByRole('button', { name: 'TODAY' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const firstRow = page.locator('.contract-feed-item').first();
    await expect(firstRow).toBeVisible();
    await saveScreenshot(firstRow, testInfo, 'issue-10-mobile-feed-row-rendered-390');
    const metadataProof = await firstRow.locator('.contract-feed-meta').evaluate<MetadataProof>((element) => {
      const source = element.querySelector('.feed-meta-source');
      const range = document.createRange();
      if (source?.firstChild) range.selectNodeContents(source);
      const sourceTextWidth = source?.firstChild ? range.getBoundingClientRect().width : 0;
      const sourceBox = source?.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        visibleSourceWidth: sourceBox?.width ?? 0,
        fullSourceWidth: sourceTextWidth
      };
    });
    await writeProof(testInfo, 'issue-10-mobile-metadata-rendered-proof', metadataProof);
    if (metadataProof.whiteSpace !== 'nowrap' || metadataProof.overflow !== 'hidden') remember(violations, 10, `mobile metadata row no longer uses compact nowrap/hidden scan anatomy (${metadataProof.whiteSpace}/${metadataProof.overflow}).`);
    for (const requiredSignal of ['simonwillison.net', 'TODAY'] as const) {
      if (!metadataProof.text.includes(requiredSignal)) remember(violations, 10, `mobile metadata missing readable ${requiredSignal} signal: ${metadataProof.text}`);
    }
    if (metadataProof.text.includes('src:')) remember(violations, 10, `mobile metadata reintroduced forbidden src: prefix: ${metadataProof.text}`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await firstRow.getByRole('button', { name: /Open Inspector for:/ }).click();
    const originalLink = page.getByRole('link', { name: /original link/i });
    await expect(originalLink).toBeVisible();
    const originalLinkStyle = await originalLink.evaluate<LinkProof>((element) => {
      const style = window.getComputedStyle(element);
      return { color: style.color, textDecorationLine: style.textDecorationLine };
    });
    await writeProof(testInfo, 'issue-11-inspector-original-link-style', originalLinkStyle);
    if (originalLinkStyle.color === 'rgb(0, 0, 238)' || originalLinkStyle.textDecorationLine.includes('underline')) remember(violations, 11, `Inspector original link uses browser-default styling: color=${originalLinkStyle.color}, decoration=${originalLinkStyle.textDecorationLine}.`);

    const promptPage = await browser.newPage();
    await promptPage.goto(process.env.RESOFEED_E2E_BASE_URL ?? '/');
    const ownerHeading = promptPage.locator('#owner-token-heading');
    await expect(ownerHeading).toBeVisible();
    const headingProof = await ownerHeading.evaluate<HeadingProof>((element) => {
      const style = window.getComputedStyle(element);
      return { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight };
    });
    await writeProof(testInfo, 'issue-12-owner-token-heading-style', headingProof);
    await promptPage.close();
    if (Number.parseFloat(headingProof.fontSize) > 16 || Number.parseFloat(headingProof.lineHeight) > 24) remember(violations, 12, `Owner Token Prompt heading is larger than chrome/prompt scale: ${headingProof.fontSize}/${headingProof.lineHeight}.`);

    await openShell(page, ownerToken);
    const stars = await page.locator('.contract-feed-item .contract-resonate').evaluateAll((buttons) => buttons.map((button) => ({
      label: button.getAttribute('aria-label') ?? '',
      visibleGlyph: button.textContent?.trim() ?? ''
    })));
    await writeProof(testInfo, 'issue-14-resonate-accessible-names', stars);
    const labels = stars.map((star) => star.label);
    if (new Set(labels).size !== labels.length) remember(violations, 14, `Repeated Resonate buttons do not have unique accessible names: ${labels.join(' | ')}.`);
    for (const item of unresonatedItems) {
      if (!labels.some((label) => label.includes(item.title))) remember(violations, 14, `No Resonate accessible name includes item context/title: ${item.title}.`);
    }
    for (const star of stars) {
      if (star.visibleGlyph !== '☆') remember(violations, 14, `Visible unresonated star glyph changed unexpectedly: ${star.visibleGlyph}.`);
    }

    await writeProof(testInfo, 'issues-7-14-violations', violations);
    expect(violations).toEqual([]);
  });
});
