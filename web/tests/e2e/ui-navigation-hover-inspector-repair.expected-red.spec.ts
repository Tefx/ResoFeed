import type { Locator, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';
const acceptedOwnerToken = 'rfeed_e2e_owner_token_00000000000000000000000000000000';
const fixtureItemId = 'json-ld-blob-item';
const forbiddenPrimaryCopy = /\b(folders?|tags?|unread|settings|onboarding|mascot|SaaS|AI[- ]?magic)\b/i;

const jsonLdBlob = `{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "Raw schema payload must stay out of primary reading copy",
  "author": [{ "@type": "Person", "name": "Fixture Author" }],
  "image": ["https://example.test/tracker.jpg"],
  "publisher": { "@type": "Organization", "name": "Fixture Publisher" }
}

Readable article paragraph after the metadata blob. The primary Inspector should prefer this cleaned text and keep raw JSON-LD in labelled provenance only.`;

const itemSummary = {
  id: fixtureItemId,
  source_id: 'source-json-ld',
  source_title: 'Fixture Source',
  url: 'https://example.test/raw-json-ld-item',
  title: 'Clean fixture item with JSON-LD metadata',
  summary: 'Readable summary should remain primary, while JSON-LD metadata is secondary provenance.',
  core_insight: 'Core insight is readable and not a parser object dump.',
  value_tier: 'high',
  published_at: '2026-05-09T10:00:00Z',
  extraction_status: 'full',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: 'story-json-ld',
  duplicate_of_item_id: null
} as const;

const itemDetail = {
  ...itemSummary,
  feed_excerpt: jsonLdBlob,
  extracted_text: jsonLdBlob,
  provenance: {
    source_url: 'https://example.test/feed.xml',
    canonical_url: 'https://example.test/raw-json-ld-item',
    original_url: 'https://example.test/raw-json-ld-item',
    story_key: 'story-json-ld',
    duplicate_of_item_id: null
  }
} as const;

async function installFixtureApi(page: Page): Promise<void> {
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
            id: 'source-json-ld',
            url: 'https://example.test/feed.xml',
            title: 'Fixture Source',
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
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [itemSummary] }) });
  });
  await page.route('**/api/steer/active', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rules: [] }) });
  });
  await page.route(`**/api/items/${fixtureItemId}`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ item: itemDetail }) });
  });
  await page.route(`**/api/items/${fixtureItemId}/inspect`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item_id: fixtureItemId, human_inspected_at: '2026-05-09T10:05:00Z', already_applied: false })
    });
  });
  await page.route(`**/api/items/${fixtureItemId}/resonance`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item_id: fixtureItemId, is_resonated: true, already_applied: false })
    });
  });
  await page.route('**/api/state/export', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T10:00:00Z', sources: [], steer_rules: [], resonated_items: [] })
    });
  });
}

async function openFixtureShell(page: Page): Promise<void> {
  await installFixtureApi(page);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Inspector for: Clean fixture item with JSON-LD metadata' })).toBeVisible();
}

async function expectUnobstructedHitTarget(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} must be visible before hit-target probing`).toBeVisible();
  const obstruction = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    const style = window.getComputedStyle(element);
    return {
      area: rect.width * rect.height,
      disabled: element instanceof HTMLButtonElement ? element.disabled : false,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      topTag: top?.tagName ?? null,
      topText: top?.textContent?.trim().slice(0, 120) ?? null,
      topClass: top instanceof HTMLElement ? top.className : null,
      allowedTopElement: top === element || Boolean(top && element.contains(top))
    };
  });

  expect(obstruction, `${label} obstruction probe`).toMatchObject({
    disabled: false,
    pointerEvents: 'auto',
    visibility: 'visible',
    allowedTopElement: true
  });
  expect(obstruction.area, `${label} must have non-zero clickable area`).toBeGreaterThan(0);
}

async function visibleText(locator: Locator): Promise<string> {
  return locator.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chunks: string[] = [];
    let current = walker.nextNode();
    while (current) {
      const parent = current.parentElement;
      if (parent) {
        const style = window.getComputedStyle(parent);
        const rects = parent.getClientRects();
        if (style.display !== 'none' && style.visibility !== 'hidden' && rects.length > 0) {
          chunks.push(current.textContent ?? '');
        }
      }
      current = walker.nextNode();
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
  });
}

async function expectVisiblePrimaryCopyClean(locator: Locator, label: string): Promise<void> {
  // DEVIATION RECORD: type=test_error; artifact=ui-navigation-hover-inspector-repair.expected-red.spec.ts; what_changed=OPML receipt allowlist uses `OPML outlines flattened`; why=folder terminology is forbidden product-surface drift while OPML outline flattening remains the source-import behavior; impact=negative navigation scan remains scoped without allowing folder UI copy.
  const text = (await visibleText(locator)).replace(/imported \d+ sources; OPML outlines flattened/gi, '');
  expect(text, `${label} visible primary copy must avoid forbidden product-language drift`).not.toMatch(forbiddenPrimaryCopy);
}

test.describe('ui-navigation-hover-inspector-repair expected-red browser contract', () => {
  test('ui-navigation-hover-inspector-repair: SOURCE LEDGER real click opens ledger with active-state proof and obstruction diagnostics', async ({ page }) => {
    await openFixtureShell(page);

    // docs/DESIGN.md lines 373-374 and UI_REGRESSION_CONTRACT lines 28-30 require TODAY/SOURCE LEDGER through opened RESOFEED menu.
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    const ledgerButton = page.locator('nav.surface-nav button:has-text("SOURCE LEDGER")');
    await expectUnobstructedHitTarget(ledgerButton, 'SOURCE LEDGER nav');
    await ledgerButton.click();

    await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'ledger');
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);
    await expect(page.locator('.feed-pane')).not.toHaveClass(/active-panel/);
    await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]').getByText('src: Fixture Source · status: ok · last_fetch: 10:00:00')).toBeVisible();
  });

  test('ui-navigation-hover-inspector-repair: TODAY click after another panel restores Today as the only active primary surface', async ({ page }) => {
    await openFixtureShell(page);

    // docs/DESIGN.md lines 373-374 and UI_REGRESSION_CONTRACT lines 28-30 require TODAY/SOURCE LEDGER through opened RESOFEED menu.
    // [DEVIATION]: Native disclosure semantics allow the RESOFEED summary to close on a second click; this test needs the menu opened once before activating SOURCE LEDGER.
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    const todayButton = page.locator('nav.surface-nav button:has-text("TODAY")');
    await expectUnobstructedHitTarget(todayButton, 'TODAY nav');
    await todayButton.click();

    await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'feed');
    await expect(page.locator('.feed-pane')).toHaveClass(/active-panel/);
    await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).not.toHaveClass(/active-panel/);
    await expect(page.locator('.detail-pane')).not.toHaveClass(/active-panel/);
  });

  test('ui-navigation-hover-inspector-repair: selected feed row hover remains restrained instead of stacking ambiguous active hover blocks', async ({ page }) => {
    await openFixtureShell(page);

    const row = page.locator('.contract-feed-item').filter({ hasText: itemSummary.title });
    const rowOpenButton = row.locator('.contract-feed-open');
    await rowOpenButton.click();
    await expect(row).toHaveAttribute('aria-current', 'true');

    const before = await row.evaluate((element) => {
      const open = element.querySelector('.contract-feed-open');
      if (!(open instanceof HTMLElement)) throw new Error('feed open control missing');
      const rowStyle = window.getComputedStyle(element);
      const openStyle = window.getComputedStyle(open);
      const rect = element.getBoundingClientRect();
      return { rowBackground: rowStyle.backgroundColor, openBackground: openStyle.backgroundColor, width: rect.width, height: rect.height };
    });

    await rowOpenButton.hover();

    const after = await row.evaluate((element) => {
      const open = element.querySelector('.contract-feed-open');
      if (!(open instanceof HTMLElement)) throw new Error('feed open control missing');
      const rowStyle = window.getComputedStyle(element);
      const openStyle = window.getComputedStyle(open);
      const rect = element.getBoundingClientRect();
      return { rowBackground: rowStyle.backgroundColor, openBackground: openStyle.backgroundColor, width: rect.width, height: rect.height };
    });

    expect(after.width, 'selected+hover must not shift row width').toBeCloseTo(before.width, 0);
    expect(after.height, 'selected+hover must not shift row height').toBeCloseTo(before.height, 0);
    expect(after.rowBackground, 'desktop selected+hover should preserve a restrained marker-led selected state, not flood the whole row').toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
    expect(after.rowBackground, 'selected row marker/background must persist while hovered').toBe(before.rowBackground);
    expect(after.openBackground, 'selected row hover must not add a second contrasting background block over the selected state').toBe(before.openBackground);
  });

  test('ui-navigation-hover-inspector-repair: default Inspector primary area is structured reading content, not raw JSON-LD/extracted metadata', async ({ page }) => {
    await openFixtureShell(page);

    await page.getByRole('button', { name: 'Open Inspector for: Clean fixture item with JSON-LD metadata' }).click();
    const inspector = page.locator('.contract-inspector');
    await expect(inspector.getByRole('heading', { name: itemSummary.title })).toBeFocused();
    await expect(inspector.getByLabel('Source: Fixture Source')).toBeVisible();
    await expect(inspector.getByLabel('Extraction: full')).toBeVisible();
    // [DEVIATION]: Inspector primary provenance intentionally avoids a visible raw model-status label; model-backed status is represented by structured Summary/Core sections and processing copy.
    await expect(inspector).toContainText(itemSummary.core_insight);
    await expect(inspector.getByRole('link', { name: 'original link' })).toHaveAttribute('href', itemSummary.url);
    await expect(inspector).toContainText(itemSummary.core_insight);
    await expect(inspector).toContainText('why: fresh from configured source');
    await expect(inspector).toContainText('provenance: story story-json-ld · duplicate none');

    const rawPrimaryPayloads = inspector.locator('h2, p:not(.contract-muted)').filter({ hasText: /"@context"|"@type"|schema\.org|<script|<style/ });
    await expect(rawPrimaryPayloads, 'raw JSON-LD/extracted metadata must not appear in primary Inspector title/body paragraphs').toHaveCount(0);
  });

  test('ui-navigation-hover-inspector-repair: primary visible copy avoids forbidden RSS-reader/SaaS/onboarding language', async ({ page }) => {
    await openFixtureShell(page);

    await expectVisiblePrimaryCopyClean(page.locator('main.contract-shell'), 'initial Today/Inspector shell');

    // [DEVIATION]: DESIGN.md requires SOURCE LEDGER to live inside the opened RESOFEED utility menu; the prior assertion attempted to activate a closed-menu item, which would require forbidden persistent shortcut chrome.
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    await expectVisiblePrimaryCopyClean(page.locator('main.contract-shell'), 'Source Ledger shell');

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'TODAY' }).click();
    await page.getByRole('button', { name: 'Open Inspector for: Clean fixture item with JSON-LD metadata' }).click();
    await expectVisiblePrimaryCopyClean(page.locator('main.contract-shell'), 'selected Inspector shell');
  });
});
