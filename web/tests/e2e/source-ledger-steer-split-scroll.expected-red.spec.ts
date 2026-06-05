import type { Locator, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const tokenStorageKey = 'resofeed.ownerToken';
const longDiagnostic = 'err: timeout while fetching https://source.example.test/feed.xml after 20s';

const sources = [
  {
    id: 'src_srdct',
    url: 'https://source.example.test/feed.xml',
    title: 'Example Source',
    last_fetch_at: '2026-05-09T14:02:05Z',
    last_fetch_status: 'rss_fetch_error',
    last_fetch_error: longDiagnostic,
    is_active: true,
    revision: 2
  }
] as const;

const item = {
  id: 'item_srdct',
  source_id: 'src_srdct',
  source_title: 'Example Source',
  url: 'https://source.example.test/article',
  title: 'SQLite FTS changes ranking contract',
  summary: 'Dense factual summary for split scroll and mobile Inspector verification.',
  core_insight: 'Why this matters for retrieval.',
  value_tier: 'high',
  published_at: '2026-05-09T00:00:00Z',
  extraction_status: 'partial_extraction',
  model_status: 'ok',
  is_resonated: false,
  human_inspected_at: null,
  external_surfaced_at: null,
  story_key: null,
  duplicate_of_item_id: null
} as const;

const itemDetail = {
  ...item,
  feed_excerpt: 'RSS excerpt only text for mobile route verification.',
  extracted_text: Array.from({ length: 80 }, (_, index) => `Readable paragraph ${index + 1}.`).join(' '),
  provenance: {
    source_url: sources[0].url,
    canonical_url: item.url,
    original_url: item.url,
    story_key: null,
    duplicate_of_item_id: null,
    grouped_source_items: []
  }
} as const;

async function expectTopmostClickable(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} must be visible before hit-target proof`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} must have a real bounding box`).not.toBeNull();
  expect(box?.width, `${label} must meet the 44 CSS px bracket hit-target width`).toBeGreaterThanOrEqual(44);
  expect(box?.height, `${label} must meet the 44 CSS px bracket hit-target height`).toBeGreaterThanOrEqual(44);
  const topmost = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const candidate = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return candidate === element || Boolean(candidate && element.contains(candidate));
  });
  expect(topmost, `${label} center point must resolve to the intended topmost element or descendant`).toBe(true);
}

async function installFixtureApi(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => window.localStorage.setItem(key, token),
    { key: tokenStorageKey, token: ownerToken }
  );

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/runtime/language') return route.fulfill({ json: { language: { code: 'en', label: 'English' }, already_applied: false } });
    if (url.pathname === '/api/sources') return route.fulfill({ json: { sources } });
    if (url.pathname === '/api/feed/today') {
      return route.fulfill({
        json: {
          items: [
            item,
            ...Array.from({ length: 24 }, (_, index) => ({
              ...item,
              id: `item_srdct_extra_${index}`,
              title: `Additional scroll-preservation item ${index + 1}`,
              url: `https://source.example.test/article-${index + 1}`
            }))
          ]
        }
      });
    }
    if (url.pathname === '/api/items/item_srdct') return route.fulfill({ json: { item: itemDetail } });
    if (url.pathname === '/api/items/item_srdct/inspect') return route.fulfill({ json: { item_id: item.id, human_inspected_at: '2026-05-09T14:00:00Z', already_applied: false } });
    if (url.pathname === '/api/steer/active') return route.fulfill({ json: { rules: [] } });
    if (url.pathname === '/api/search') return route.fulfill({ json: { items: [item], query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 } } });
    if (url.pathname === '/api/doctor') return route.fulfill({ body: 'doctor: model latency 842ms\nrss: ok', contentType: 'text/plain' });
    if (url.pathname === '/api/steer' && request.method() === 'POST') {
      const body = request.postDataJSON() as { command?: string };
      if (body.command === 'add source') return route.fulfill({ status: 400, json: { error: { code: 'bad_request', message: 'url required', details: {} } } });
      return route.fulfill({ json: { receipt: { interpreted_as: 'steer_rule', message: 'less celebrity coverage', changed_rules: [{ id: 'rule_srdct', rule_text: 'less celebrity coverage', is_active: true, superseded_by: null, revision: 1 }] } } });
    }
    if (url.pathname === '/api/ingest' && request.method() === 'POST') {
      return route.fulfill({ json: { ingest: { scope: 'all', source_id: null, status: 'completed', started_at: '2026-05-09T14:00:00Z', completed_at: '2026-05-09T14:00:02Z', duration_ms: 2000, sources_attempted: 1, sources_succeeded: 1, sources_failed: 0, items_upserted: 1, errors: [] } } });
    }
    if (url.pathname === '/api/sources/src_srdct/fetch' && request.method() === 'POST') {
      return route.fulfill({ json: { ingest: { scope: 'source', source_id: 'src_srdct', status: 'failed', started_at: '2026-05-09T14:02:00Z', completed_at: '2026-05-09T14:02:20Z', duration_ms: 20000, sources_attempted: 1, sources_succeeded: 0, sources_failed: 1, items_upserted: 0, errors: [{ source_id: 'src_srdct', code: 'timeout', message: longDiagnostic }] }, source: sources[0] } });
    }
    if (url.pathname === '/api/state/export') {
      return route.fulfill({ json: { schema_version: 'resofeed.state.v1', exported_at: '2026-05-09T00:00:00Z', sources: [], steer_rules: [], resonated_items: [] } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'not found', details: {} } } });
  });
}

async function openAcceptedShell(page: Page, ownerToken: string): Promise<void> {
  await installFixtureApi(page, ownerToken);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

test.describe('srdct expected-red Steer, Source Ledger, and split-scroll contracts', () => {
  test('Steer preview uses exact route chips, live region levels, Escape focus retention, and revocable-only undo', async ({ page, ownerToken }) => {
    await openAcceptedShell(page, ownerToken);
    const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
    const preview = page.getByRole('status', { name: 'Steer route preview' });

    await expect(preview).toBeVisible();
    await expect(preview).toHaveText(/^\s*$/);
    await expect(preview).not.toContainText('[IDLE]');
    await expect(steer).toHaveAttribute('aria-describedby', new RegExp(await preview.getAttribute('id') ?? 'steer-route-preview'));

    await steer.fill('https://example.com/feed.xml');
    await expect(preview).toContainText('[ADD SOURCE]');
    await steer.fill('search sqlite');
    await expect(preview).toContainText('[SEARCH]');
    await steer.fill('/doctor');
    await expect(preview).toContainText('[DOCTOR]');
    await steer.fill('less celebrity coverage');
    await expect(preview).toContainText('[STEER RULE]');
    await page.keyboard.press('Escape');
    await expect(steer).toBeFocused();
    await expect(steer).toHaveValue('');
    await steer.fill('add source');
    await expect(preview).toContainText('[INVALID]');
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  test('Source Ledger exposes flat canonical controls, source-info semantics, topmost 44px actions, and terse diagnostics', async ({ page, ownerToken }) => {
    await openAcceptedShell(page, ownerToken);
    await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
    await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
    const ledger = page.locator('.source-ledger');

    await expectTopmostClickable(ledger.getByRole('button', { name: '[RUN INGEST]' }), '[RUN INGEST]');
    await expectTopmostClickable(ledger.getByRole('button', { name: 'Fetch source Example Source' }), '[FETCH]');
    await expectTopmostClickable(ledger.getByRole('button', { name: 'Delete source: Example Source' }), '[DELETE]');
    await expectTopmostClickable(ledger.getByRole('button', { name: '[IMPORT OPML]' }), '[IMPORT OPML]');
    await expect(ledger.getByRole('button', { name: '[EXPORT STATE]' })).toBeVisible();
    await expect(ledger.getByRole('button', { name: '[IMPORT STATE]' })).toBeVisible();
    await expect(ledger.locator('input[type="url"], input[name*="url" i], textarea[name*="url" i]')).toHaveCount(0);

    await expect(ledger.getByText('[DETAILS]')).toHaveCount(0);
    const details = ledger.locator('details.source-diagnostic-details').first();
    await expect(details.locator('summary')).toHaveText('source info');
    await expect(details.locator('summary')).not.toHaveClass(/bracket-action/);
    await expect(details).not.toHaveAttribute('open', '');
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(ledger.locator('.source-ledger__status--error')).toHaveAttribute('title', longDiagnostic);
    await expect(ledger).toContainText(longDiagnostic);
    await expect(ledger).not.toContainText(/jobs|queues|dashboards|settings|activity logs|folders|tags|rule builders|semantic answer|chat|RAG/i);
  });

  test('desktop scroll regions are independent and mobile Inspector route preserves Feed scroll', async ({ page, ownerToken }) => {
    await openAcceptedShell(page, ownerToken);
    await page.setViewportSize({ width: 1280, height: 900 });
    const feedPane = page.locator('[data-scroll-region="feed-independent"]');
    const inspectorPane = page.locator('[data-scroll-region="inspector-independent"]');
    await expect(feedPane).toHaveAttribute('tabindex', '0');
    await expect(inspectorPane).toHaveAttribute('tabindex', '0');
    await expect(feedPane).toHaveAttribute('aria-describedby', /today-feed-scroll-contract/);
    await expect(inspectorPane).toHaveAttribute('aria-label', /INSPECTOR/);

    await page.setViewportSize({ width: 390, height: 844 });
    const openButton = page.getByRole('button', { name: 'Open Inspector for: SQLite FTS changes ranking contract' });
    await openButton.focus();
    await feedPane.evaluate((element) => {
      element.style.maxHeight = '260px';
      element.style.overflowY = 'auto';
      element.scrollTop = 120;
    });
    await expect.poll(() => feedPane.evaluate((element) => element.scrollTop)).toBe(120);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/items\/item_srdct$/);
    await expect(page.getByRole('heading', { name: 'SQLite FTS changes ranking contract' })).toBeFocused();
    await page.getByRole('button', { name: 'back to TODAY' }).click();
    await expect.poll(() => feedPane.evaluate((element) => element.scrollTop)).toBe(120);
  });
});
