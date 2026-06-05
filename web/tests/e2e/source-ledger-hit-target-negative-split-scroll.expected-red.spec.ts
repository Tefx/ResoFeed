import type { Locator, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const ownerTokenStorageKey = 'resofeed.ownerToken';

const forbiddenSurfaceCopy =
  /\b(jobs?|queues?|dashboards?|settings|activity logs?|folders?|tags?|rule builders?|semantic answer|RAG|chat|second URL field|add source URL|paste URL here|duplicate URL subscription)\b/i;

const sources = [
  {
    id: 'src_expected_red_hit_target',
    url: 'https://example.com/feed.xml',
    title: 'Example Source',
    last_fetch_at: '2026-05-15T14:02:05Z',
    last_fetch_status: 'rss_fetch_error',
    last_fetch_error: 'err: timeout while fetching https://example.com/feed.xml after 20s',
    is_active: true,
    revision: 1
  }
] as const;

async function installContractApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: ownerTokenStorageKey, token: ownerToken }
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources } });
    if (url.pathname === '/api/feed/today') {
      return route.fulfill({
        json: {
          items: Array.from({ length: 18 }, (_, index) => ({
            id: `item_expected_red_scroll_${index}`,
            source_id: 'src_expected_red_hit_target',
            source_title: 'Example Source',
            url: `https://example.com/articles/${index}`,
            title: `Expected red split scroll item ${index}`,
            summary: 'Dense factual summary for split scroll preservation.',
            core_insight: 'Scroll preservation is a layout contract.',
            value_tier: 'high',
            published_at: '2026-05-15T14:00:00Z',
            extraction_status: 'full',
            model_status: 'ok',
            is_resonated: false,
            human_inspected_at: null,
            external_surfaced_at: null,
            story_key: null,
            duplicate_of_item_id: null
          }))
        }
      });
    }
    if (url.pathname.startsWith('/api/items/') && url.pathname.endsWith('/inspect')) {
      return route.fulfill({ json: { item_id: url.pathname.split('/')[3], human_inspected_at: '2026-05-15T14:10:00Z', already_applied: false } });
    }
    if (url.pathname.startsWith('/api/items/')) {
      const id = url.pathname.split('/').pop() ?? 'item_expected_red_scroll_0';
      return route.fulfill({
        json: {
          item: {
            id,
            source_id: 'src_expected_red_hit_target',
            source_title: 'Example Source',
            url: `https://example.com/articles/${id}`,
            title: `Expected red split scroll item ${id.replace('item_expected_red_scroll_', '')}`,
            summary: 'Dense factual summary for split scroll preservation.',
            core_insight: 'Scroll preservation is a layout contract.',
            value_tier: 'high',
            published_at: '2026-05-15T14:00:00Z',
            extraction_status: 'full',
            model_status: 'ok',
            feed_excerpt: 'RSS excerpt for split scroll preservation.',
            extracted_text: Array.from({ length: 30 }, (_, index) => `Readable Inspector paragraph ${index}.`).join('\n'),
            is_resonated: false,
            human_inspected_at: null,
            external_surfaced_at: null,
            story_key: null,
            duplicate_of_item_id: null,
            provenance: {
              source_url: 'https://example.com/feed.xml',
              canonical_url: `https://example.com/articles/${id}`,
              original_url: `https://example.com/articles/${id}`,
              story_key: null,
              duplicate_of_item_id: null,
              grouped_source_items: []
            }
          }
        }
      });
    }
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openLedger(page: Page, ownerToken: string): Promise<void> {
  await installContractApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);
}

async function expectTopmostClickable(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} must be visible before clickability audit`).toBeVisible();
  const audit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(rect.width - 1, 8), rect.top + Math.min(rect.height - 1, 8)]
    ];
    return points.map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      const style = window.getComputedStyle(element);
      return {
        width: rect.width,
        height: rect.height,
        pointerEvents: style.pointerEvents,
        visibility: style.visibility,
        topmost: top === element || Boolean(top && element.contains(top)),
        topText: top?.textContent?.trim().slice(0, 80) ?? null
      };
    });
  });
  for (const point of audit) {
    expect(point.width, `${label} width must be at least 44 CSS px`).toBeGreaterThanOrEqual(44);
    expect(point.height, `${label} height must be at least 44 CSS px`).toBeGreaterThanOrEqual(44);
    expect(point.pointerEvents, `${label} must receive pointer events`).toBe('auto');
    expect(point.visibility, `${label} must be visible`).toBe('visible');
    expect(point.topmost, `${label} must be topmost at click point; saw ${point.topText ?? '<none>'}`).toBe(true);
  }
}

test.describe('expected-red Source Ledger hit targets, negative UX, and split scroll contracts', () => {
  test('Source Ledger exposes 44px topmost bracket hit targets, disclosures, OPML/state actions, and terse diagnostics only', async ({ page, ownerToken }) => {
    await openLedger(page, ownerToken);
    const ledger = page.locator('.source-ledger');

    await expectTopmostClickable(ledger.getByRole('button', { name: '[RUN INGEST]' }), '[RUN INGEST]');
    await expectTopmostClickable(ledger.getByRole('button', { name: /\[FETCH\]|Fetch source Example Source/ }), '[FETCH]');
    await expectTopmostClickable(ledger.getByRole('button', { name: 'Delete source: Example Source' }), '[DELETE]');
    await expectTopmostClickable(ledger.getByRole('button', { name: '[IMPORT OPML]' }), '[IMPORT OPML]');
    await expectTopmostClickable(ledger.getByRole('button', { name: '[EXPORT STATE]' }), '[EXPORT STATE]');
    await expectTopmostClickable(ledger.getByRole('button', { name: '[IMPORT STATE]' }), '[IMPORT STATE]');

    await expect(ledger.getByText('[DETAILS]')).toHaveCount(0);
    const sourceInfo = ledger.getByText('source info');
    await expectTopmostClickable(sourceInfo, 'source info');
    const disclosureAudit = await sourceInfo.evaluate((element) => {
      const disclosure = element.closest('details');
      return {
        nativeDetails: disclosure instanceof HTMLDetailsElement,
        ariaExpanded: element.getAttribute('aria-expanded'),
        ariaControls: element.getAttribute('aria-controls'),
        bracketAction: element.classList.contains('bracket-action')
      };
    });
    expect(
      disclosureAudit.nativeDetails ||
        (disclosureAudit.ariaExpanded !== null && Boolean(disclosureAudit.ariaControls)),
      'source info must use native <details> or aria-expanded/aria-controls disclosure semantics'
    ).toBe(true);
    expect(disclosureAudit.bracketAction, 'source info is a low-chrome disclosure, not a bracket command').toBe(false);
    await sourceInfo.click();
    await expect(ledger.locator('.source-ledger__status--error')).toContainText('err: timeout while fetching https://example.com/feed.xml after 20s');
    await expect(ledger).not.toContainText(/sorry|oops|try again later|friendly|dashboard/i);
  });

  test('forbidden source-management and retrieval concepts are absent from visible primary UI', async ({ page, ownerToken }) => {
    await openLedger(page, ownerToken);
    const primaryVisibleText = await page.locator('main.contract-shell').evaluate((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const text: string[] = [];
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && parent.getClientRects().length > 0 && window.getComputedStyle(parent).visibility !== 'hidden') {
          text.push(node.textContent ?? '');
        }
        node = walker.nextNode();
      }
      return text.join(' ').replace(/\s+/g, ' ');
    });
    expect(primaryVisibleText).not.toMatch(forbiddenSurfaceCopy);
    await expect(page.locator('.source-ledger input[aria-label="Source URL"], .source-ledger input[placeholder*="URL"], .source-ledger input[name="sourceUrl"]')).toHaveCount(0);
  });

  test('desktop Feed and Inspector scroll independently; mobile Inspector is a full-screen route with Feed scroll preserved', async ({ page, ownerToken }) => {
    await installContractApi(page, ownerToken);
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    // The split-scroll contract targets the outer scroll containers, including
    // the preserved-but-inert Feed container while the mobile Inspector route is active.
    const feedPane = page.locator('[data-scroll-region="feed-independent"]');
    // Target the outer Inspector scroll container, not the nested article
    // Inspector landmark whose accessible name follows the opened item.
    const inspectorPane = page.locator('[data-scroll-region="inspector-independent"]');
    await expect(feedPane).toHaveAttribute('tabindex', '0');
    await expect(inspectorPane).toHaveAttribute('tabindex', '0');
    await feedPane.evaluate((element) => { element.scrollTop = 420; });
    const desktopOpenButton = page.getByRole('button', { name: 'Open Inspector for: Expected red split scroll item 12' });
    await desktopOpenButton.scrollIntoViewIfNeeded();
    const desktopFeedScroll = await feedPane.evaluate((element) => element.scrollTop);
    await desktopOpenButton.click();
    await expect.poll(() => feedPane.evaluate((element) => element.scrollTop)).toBe(desktopFeedScroll);
    await expect.poll(() => inspectorPane.evaluate((element) => element.scrollTop)).toBe(0);

    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await feedPane.evaluate((element) => { element.scrollTop = 360; });
    const mobileOpenButton = page.getByRole('button', { name: 'Open Inspector for: Expected red split scroll item 13' });
    await mobileOpenButton.scrollIntoViewIfNeeded();
    const mobileFeedScroll = await feedPane.evaluate((element) => element.scrollTop);
    await mobileOpenButton.click();
    await expect(page.getByRole('button', { name: /back to TODAY/i })).toBeVisible();
    await expect(page.locator('.detail-pane')).toHaveClass(/active-panel/);
    await page.getByRole('button', { name: /back to TODAY/i }).click();
    await expect.poll(() => feedPane.evaluate((element) => element.scrollTop)).toBe(mobileFeedScroll);
  });

  test('processing language and reprocess controls remain low-chrome runtime operations, not settings surfaces', async ({ page, ownerToken }) => {
    await installContractApi(page, ownerToken);
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
    // [DEVIATION]: DESIGN.md keeps processing language and library reprocess inside the opened RESOFEED utility menu, not persistent top chrome; open the canonical menu before asserting their accessible names.
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await expect(page.getByRole('button', { name: /processing language|LANG:/i })).toHaveClass(/bracket-action/);
    await expect(page.getByRole('button', { name: /Reprocess existing library and rebuild search index/i })).toHaveText(/\[REPROCESS LIBRARY\]|\[重处理资料库\]/);
    await expect(page.getByRole('heading', { name: /settings|preferences|onboarding|language dashboard/i })).toHaveCount(0);
    await expect(page.getByText(/Existing readable item content will be rewritten\.|Source identifiers remain unchanged\./).first()).toBeVisible();
  });
});
