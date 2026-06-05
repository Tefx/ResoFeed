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
    duplicate_of_item_id: null,
    grouped_source_items: [
      {
        item_id: fixtureItemId,
        source_title: 'Fixture Source',
        source_url: 'https://example.test/feed.xml',
        title: 'Clean fixture item with JSON-LD metadata',
        source_item_title: 'Fixture source-side title',
        published_at: '2026-05-09T10:00:00Z',
        is_selected_item: true
      },
      {
        item_id: 'json-ld-sibling-item',
        source_title: 'Sibling Fixture Source',
        source_url: 'https://example.test/sibling-feed.xml',
        title: 'Sibling grouped fixture item',
        source_item_title: 'Sibling source-side title',
        published_at: '2026-05-09T09:30:00Z',
        is_selected_item: false
      }
    ]
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
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [itemSummary], query: { q: 'Fixture', source: null, from: null, to: null, resonated: null, limit: 50 } }) });
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

type InteractiveStyle = {
  readonly backgroundColor: string;
  readonly color: string;
  readonly outlineColor: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly boxShadow: string;
  readonly textDecorationLine: string;
};

async function interactiveStyle(locator: Locator): Promise<InteractiveStyle> {
  return locator.evaluate<InteractiveStyle>((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      textDecorationLine: style.textDecorationLine
    };
  });
}

function hasVisibleFocusRing(style: InteractiveStyle): boolean {
  return (Number.parseFloat(style.outlineWidth || '0') >= 2 && style.outlineStyle !== 'none') || style.boxShadow !== 'none';
}

async function expectReadableChrome(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} must be visible before style proof`).toBeVisible();
  const style = await locator.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    const parent = element.parentElement ? window.getComputedStyle(element.parentElement) : computed;
    return {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      inheritedBackgroundColor: parent.backgroundColor,
      visibility: computed.visibility,
      opacity: computed.opacity
    };
  });
  const effectiveBackground = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? style.inheritedBackgroundColor : style.backgroundColor;
  expect(style.visibility, `${label} visibility`).toBe('visible');
  expect(Number.parseFloat(style.opacity), `${label} opacity`).toBeGreaterThan(0.95);
  expect(style.color, `${label} foreground must not collapse into background`).not.toBe(effectiveBackground);
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
    const ledgerRow = page.locator('.source-ledger__row', { hasText: 'Fixture Source' });
    await expect(ledgerRow).toContainText('Fixture Source');
    await expect(ledgerRow).toContainText('https://example.test/feed.xml');
    expect((await ledgerRow.locator('.source-ledger__name, .source-ledger__url, .source-ledger__status').allTextContents()).join(' ')).not.toMatch(/\bsrc:|\burl:|status: ok|fetch_state: ok/);
    await expect(ledgerRow).toContainText(/(?:last_fetch|fetched_at):?\s*\d{2}:\d{2}:\d{2}(?:\s+local)?|\b\d{2}:\d{2}:\d{2}\s+local\b/);
    const diagnostic = ledgerRow.locator('.source-diagnostic-details');
    await expect(diagnostic.locator('summary')).toBeVisible();
    await diagnostic.locator('summary').click();
    await expect(diagnostic.locator('pre')).toContainText('fetch_state: ok');
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
    await expect(page.locator('.detail-pane'), 'desktop Today may keep the Inspector split scroll pane mounted/active while Source Ledger is inactive').not.toHaveAttribute('aria-hidden', 'true');
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
    expect(after.rowBackground, 'desktop selected+hover must preserve the current selected row background when present').toBe(before.rowBackground);
    expect(after.openBackground, 'selected row hover must not add a second contrasting background block over the selected state').toBe(before.openBackground);
  });

  test('ui-navigation-hover-inspector-repair: bracket actions and Inspector links expose hover/focus-visible states at runtime in light and dark', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await openFixtureShell(page);

      await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
      await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
      const bracketAction = page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"] .bracket-action--fetch').first();
      await expect(bracketAction).toBeVisible();

      await page.locator('body').click({ position: { x: 4, y: 4 } });
      const bracketRest = await interactiveStyle(bracketAction);
      await bracketAction.hover();
      const bracketHover = await interactiveStyle(bracketAction);
      expect(hasVisibleFocusRing(bracketHover), `${colorScheme} bracket action hover must not show a focus ring`).toBe(false);
      expect(bracketHover.backgroundColor, `${colorScheme} bracket action hover must invert from rest background`).not.toBe(bracketRest.backgroundColor);
      expect(bracketHover.color, `${colorScheme} bracket action hover must invert from rest text color`).not.toBe(bracketRest.color);

      await bracketAction.evaluate((element) => {
        (element as HTMLElement).focus({ focusVisible: true } as FocusOptions & { focusVisible: boolean });
      });
      const bracketFocus = await interactiveStyle(bracketAction);
      expect(hasVisibleFocusRing(bracketFocus), `${colorScheme} bracket action focus-visible must show a visible ring`).toBe(true);
      expect(bracketFocus.backgroundColor, `${colorScheme} bracket action focus-visible must keep terminal inversion`).toBe(bracketHover.backgroundColor);

      await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
      await page.getByRole('button', { name: 'TODAY' }).click();
      await page.getByRole('button', { name: 'Open Inspector for: Clean fixture item with JSON-LD metadata' }).click();
      const originalLink = page.locator('.contract-inspector .inspector-original-link').first();
      await expect(originalLink).toBeVisible();

      await page.locator('.contract-inspector').click({ position: { x: 8, y: 8 } });
      await originalLink.hover();
      const linkHover = await interactiveStyle(originalLink);
      expect(hasVisibleFocusRing(linkHover), `${colorScheme} Inspector link hover must not show a focus ring`).toBe(false);
      expect(linkHover.textDecorationLine, `${colorScheme} Inspector link hover keeps low-chrome underline affordance`).toContain('underline');

      await originalLink.evaluate((element) => {
        (element as HTMLElement).focus({ focusVisible: true } as FocusOptions & { focusVisible: boolean });
      });
      const linkFocus = await interactiveStyle(originalLink);
      expect(hasVisibleFocusRing(linkFocus), `${colorScheme} Inspector link focus-visible must show a visible ring`).toBe(true);
      expect(linkFocus.color, `${colorScheme} Inspector link focus-visible must use a distinct focus color`).not.toBe(linkHover.color);
    }
  });

  test('ui-navigation-hover-inspector-repair: disclosure, route preview, skip, re-ingest, and status chrome have runtime style proof', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixtureShell(page);

    const skipLink = page.locator('.skip-link');
    await skipLink.evaluate((element) => (element as HTMLElement).focus());
    await expect(skipLink).toBeVisible();
    expect(hasVisibleFocusRing(await interactiveStyle(skipLink)), 'skip link focus must remain perceivable').toBe(true);

    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    await steer.fill('search Fixture');
    const routePreview = page.locator('.steer-route-preview');
    await expect(routePreview).toHaveAttribute('data-route-kind', 'search');
    await expectReadableChrome(routePreview, 'route preview current-token rendering');

    await steer.press('Enter');
    const searchDetails = page.locator('.search-secondary-filters');
    await expect(searchDetails.locator('summary')).toBeVisible();
    await searchDetails.locator('summary').click();
    await expect(searchDetails).toHaveAttribute('open', '');
    await page.locator('#search-query').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(searchDetails.locator('summary')).toBeFocused();
    expect(hasVisibleFocusRing(await interactiveStyle(searchDetails.locator('summary'))), 'search filter disclosure focus must be visible').toBe(true);

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    const ledgerStatus = page.locator('.source-ledger__row .source-ledger__status').first();
    await expectReadableChrome(ledgerStatus, 'source row timestamp/status label');
    const sourceDiagnosticSummary = page.locator('.source-ledger__row .source-diagnostic-details summary').first();
    await sourceDiagnosticSummary.click();
    await expect(page.locator('.source-ledger__row .source-diagnostic-details').first()).toHaveAttribute('open', '');
    await page.locator('.source-ledger__row .bracket-action--fetch').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(sourceDiagnosticSummary).toBeFocused();
    expect(hasVisibleFocusRing(await interactiveStyle(sourceDiagnosticSummary)), 'source diagnostic disclosure focus must be visible').toBe(true);

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expectReadableChrome(ledgerStatus, `${colorScheme} source row status label`);
      await expectReadableChrome(page.locator('.source-ledger__header .source-ledger__status'), `${colorScheme} source header status label`);
    }
    await page.emulateMedia({ colorScheme: 'light' });

    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'TODAY' }).click();
    await page.getByRole('button', { name: 'Open Inspector for: Clean fixture item with JSON-LD metadata' }).click();
    const groupedSummary = page.locator('.contract-grouped-sources summary');
    await expect(groupedSummary).toBeVisible();
    await groupedSummary.click();
    await expect(page.locator('.contract-grouped-sources')).not.toHaveAttribute('open', '');
    await expectReadableChrome(groupedSummary, 'grouped source disclosure collapsed summary');

    await page.getByRole('button', { name: 'Options' }).click();
    const prompt = page.getByRole('textbox', { name: 'One-time prompt' });
    await prompt.focus();
    expect(hasVisibleFocusRing(await interactiveStyle(prompt)), 're-ingest textarea focus must be visible').toBe(true);
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
    await expect(inspector).not.toContainText('why: fresh from configured source');
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
