import fs from 'node:fs';
import path from 'node:path';

import type { Page, TestInfo } from 'playwright/test';

import { test, expect } from './fixtures';

test.use({ trace: 'on', screenshot: 'on' });

async function enterOwnerToken(page: Page, ownerToken: string, url = '/'): Promise<void> {
  await page.goto(url);
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function steer(page: Page, command: string, submit: 'enter' | 'apply' = 'enter'): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await input.fill(command);
  if (submit === 'enter') {
    await input.press('Enter');
    return;
  }
  await page.getByRole('button', { name: 'apply' }).click();
}

async function ensureSeededItem(page: Page, runInfo: { artifactRoot: string; fixtureServer: { url: string } }, ownerToken: string): Promise<void> {
  await enterOwnerToken(page, ownerToken);
  await steer(page, 'source ledger');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  // DEVIATION RECORD: type=test_error; artifact=prd-pbar-expected-red-browser-gaps.spec.ts; what_changed=OPML import receipt expects `OPML outlines flattened`; why=authority forbids folders as product semantics and OPML import only flattens outlines; impact=import/skipped receipt coverage remains unchanged.
  await expect(page.getByText(/imported \d+ sources; OPML outlines flattened|skipped \d+ existing sources/)).toBeVisible();
  const feedItem = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  const ingestButton = page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ });
  await expect(ingestButton).toBeVisible();
  await expect(page.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
  // [DEVIATION]: This expected-red helper owns fixture seeding. OPML import/source-add only configures sources; the production runtime requires the existing explicit Source Ledger ingest action to create TODAY rows.
  await ingestButton.click();
  await expect(page.locator('.source-ledger__row', { hasText: runInfo.fixtureServer.url })).toContainText(/last_fetch: \d{2}:\d{2}:\d{2}/, { timeout: 20_000 });
  await steer(page, 'today');
  await expect(feedItem).toBeVisible({ timeout: 10_000 });
  const localFixtureRow = page.locator('.contract-feed-item', { has: feedItem });
  const activeLocalFixtureResonance = localFixtureRow.getByRole('button', { name: /^Remove resonance/ });
  if (await activeLocalFixtureResonance.isVisible().catch(() => false)) {
    await activeLocalFixtureResonance.click();
    await expect(localFixtureRow.getByRole('button', { name: /^Resonate item/ })).toHaveAttribute('aria-pressed', 'false');
  }
}

async function captureEvidence(page: Page, testInfo: TestInfo, label: string): Promise<string[]> {
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const screenshotPath = testInfo.outputPath(`${safeLabel}.png`);
  const domPath = testInfo.outputPath(`${safeLabel}.dom.txt`);
  const accessibilityPath = testInfo.outputPath(`${safeLabel}.a11y.json`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(domPath, await page.locator('body').innerText().catch(async () => page.content()));
  const roleSnapshot = await page.locator('main').evaluate((main) => Array.from(main.querySelectorAll('button, a[href], input, select, textarea, [role], [aria-label], [aria-current], [aria-pressed], [aria-hidden], [inert]')).map((node) => ({
    tag: node.tagName.toLowerCase(),
    role: node.getAttribute('role'),
    ariaLabel: node.getAttribute('aria-label'),
    ariaCurrent: node.getAttribute('aria-current'),
    ariaPressed: node.getAttribute('aria-pressed'),
    ariaHidden: node.getAttribute('aria-hidden'),
    inert: node.hasAttribute('inert'),
    id: node.getAttribute('id'),
    className: node.getAttribute('class'),
    text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? ''
  })));
  fs.writeFileSync(accessibilityPath, JSON.stringify(roleSnapshot, null, 2));
  await testInfo.attach(`${safeLabel}-screenshot`, { path: screenshotPath, contentType: 'image/png' });
  await testInfo.attach(`${safeLabel}-dom`, { path: domPath, contentType: 'text/plain' });
  await testInfo.attach(`${safeLabel}-a11y`, { path: accessibilityPath, contentType: 'application/json' });
  return [screenshotPath, domPath, accessibilityPath];
}

test.describe('pbar expected-red PRD browser gaps', () => {
  test('B5/U2 source-add receipt orients to background ingest without removed Source Ledger controls', async ({ page, runInfo, ownerToken }) => {
    await enterOwnerToken(page, ownerToken);
    await steer(page, runInfo.fixtureServer.url);

    const sourceReceipt = page.getByRole('status').last();
    await expect(sourceReceipt).toContainText(/source added: .*127\.0\.0\.1|source added: .*e2e-feed\.xml/i);
    await expect(sourceReceipt).toContainText(/source ledger.*background ingest|background ingest.*source ledger/i);
    await expect(sourceReceipt).not.toContainText(/run ingest|\[RUN INGEST\]|\[FETCH\]|source ledger.*fetch|source ledger.*run/i);
  });

  test('B1/B2/B3/B11/B13/U1 expected-red: Search UI executes real lexical query and has compact accessible mobile anatomy', async ({ page, runInfo, ownerToken }, testInfo) => {
    await ensureSeededItem(page, runInfo, ownerToken);

    await steer(page, 'search Local fixture', 'enter');
    await expect(page.getByRole('heading', { name: 'SEARCH' })).toBeVisible();
    await captureEvidence(page, testInfo, 'desktop-search-command-seeded');

    await expect.soft(page.locator('#search-status'), 'B1: search <query> should execute immediately, not only seed a form').toContainText('1 results');
    await expect.soft(page.getByRole('button', { name: 'submit search' }), 'B3: Search submit control needs an unambiguous accessible name').toBeVisible();

    await page.getByLabel('Plain text query').fill('no-match-pbar-expected-red-zzzz');
    // [DEVIATION]: The Search submit control's accessible name is `submit search` to satisfy the same test's unambiguous-name requirement while preserving exactly one visible submit control.
    await page.getByRole('button', { name: 'submit search' }).click();
    await captureEvidence(page, testInfo, 'desktop-search-no-match');
    await expect.soft(page.locator('#search-status'), 'B2: no-match should be a stable empty state').toContainText('0 results');
    await expect.soft(page.getByRole('region', { name: 'Search results' }), 'B2: no-match should clear stale/default feed rows').not.toContainText('Local fixture item one');
    await expect.soft(page.getByRole('region', { name: 'Search results' }), 'B2: no-match should not expose generic internal errors').not.toContainText(/err: internal/i);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Plain text query').fill('Local fixture');
    await page.getByRole('button', { name: 'submit search' }).click();
    await expect(page.getByRole('region', { name: 'Search results' })).toContainText('Local fixture item one');
    await captureEvidence(page, testInfo, 'mobile-search-result-anatomy');
    const searchFormBox = await page.locator('.contract-search-form').boundingBox();
    const firstResultBox = await page.locator('.contract-search-result').first().boundingBox();
    expect.soft(searchFormBox?.height ?? 9999, 'U1: mobile Search form should be compact enough for first-screen results').toBeLessThanOrEqual(170);
    expect.soft(firstResultBox?.y ?? 9999, 'U1: first mobile result should start in the initial viewport').toBeLessThan(620);
    await expect.soft(page.locator('.contract-search-result').first().locator('.contract-search-match'), 'B11: mobile result needs explicit match/provenance metadata').toContainText(/match: .*provenance:/i);
    await expect.soft(page.locator('.contract-search-result').first().locator('.contract-time-label'), 'B13: time marker must not compete inline with mobile Search metadata').toHaveCount(0);
  });

  test('B4/B5/B14/B15/B23/U2 expected-red: Steer receipts expose interpretation and source-add orientation across surfaces', async ({ page, runInfo, ownerToken }, testInfo) => {
    await ensureSeededItem(page, runInfo, ownerToken);
    const commands = [
      { surface: 'feed', prep: async () => steer(page, 'today'), command: 'reduce celebrity gossip in future summaries' },
      { surface: 'inspector', prep: async () => page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click(), command: 'hide low quality celebrity items but boost primary-source database research' },
      { surface: 'search', prep: async () => steer(page, 'search Local fixture', 'apply'), command: 'show fewer shallow listicles' },
      { surface: 'ledger', prep: async () => steer(page, 'source ledger', 'apply'), command: runInfo.fixtureServer.url }
    ];

    for (const entry of commands) {
      await entry.prep();
      await steer(page, entry.command, entry.surface === 'feed' ? 'enter' : 'apply');
      await captureEvidence(page, testInfo, `steer-${entry.surface}-receipt`);
      const receiptOrAlert = page.getByRole('status').or(page.getByRole('alert')).last();
      await expect.soft(receiptOrAlert, `B23: Enter/apply should complete from ${entry.surface}`).toBeVisible();
      await expect.soft(receiptOrAlert, `B4/B14/B15: ${entry.surface} receipt should expose interpreted_as or specific safe rejection`).toContainText(/interpreted_as|normalized|rejected:|applied:/i);
      await expect.soft(receiptOrAlert, `B4/B14/B15: ${entry.surface} receipt must not be generic internal error`).not.toContainText(/err: internal: internal error/i);
    }

    const sourceReceipt = page.getByRole('status').last();
    await expect.soft(sourceReceipt, 'B5/U2: source-add receipt should include source title/host identity').toContainText(/127\.0\.0\.1|ResoFeed E2E Local Source|e2e-feed\.xml/i);
    await expect.soft(sourceReceipt, 'B5/U2: source-add receipt should orient user toward background ingest without removed Source Ledger controls').toContainText(/source ledger.*background ingest|background ingest.*source ledger/i);
    await expect.soft(sourceReceipt, 'B5/U2: source-add receipt must not mention removed Source Ledger ingest controls').not.toContainText(/run ingest|\[RUN INGEST\]|\[FETCH\]|source ledger.*fetch|source ledger.*run/i);
  });

  test('B9/B20/U4 expected-red: direct /doctor route renders scan-readable raw diagnostics without Today chrome', async ({ page, ownerToken }, testInfo) => {
    await enterOwnerToken(page, ownerToken, '/doctor');
    await captureEvidence(page, testInfo, 'desktop-direct-doctor-route');
    await expect.soft(page.getByRole('heading', { name: '/doctor' }), 'B9: direct /doctor route should show diagnostics surface').toBeVisible();
    await expect.soft(page.getByLabel('/doctor diagnostics'), 'B20/U4: diagnostics need provider/model/item-transform keys').toContainText(/provider_reachable:/i);
    await expect.soft(page.getByLabel('/doctor diagnostics'), 'B20/U4: diagnostics need model resolution key').toContainText(/model_resolved:/i);
    await expect.soft(page.getByLabel('/doctor diagnostics'), 'B20/U4: diagnostics need item transform failures key').toContainText(/item_transform_failures:/i);
    await expect.soft(page.getByRole('list', { name: 'Today feed items' }), 'B9: direct /doctor must not render Today as the active surface').toBeHidden();
  });

  test('B6/B7/B8/B19/B21/B22 expected-red: feed and Inspector expose fallback/provenance, sanitation, resonate state, and value metadata', async ({ page, runInfo, ownerToken }, testInfo) => {
    await ensureSeededItem(page, runInfo, ownerToken);
    await captureEvidence(page, testInfo, 'desktop-feed-presentation');
    const itemButton = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
    await expect.soft(itemButton, 'B21: Feed rows need visible quality/value tier metadata').toContainText(/value:|quality:|tier:/i);

    const resonate = page.locator('.contract-feed-item', { has: itemButton }).getByRole('button', { name: /^Resonate item/ });
    await expect.soft(resonate, 'B8: Resonate starts with programmatic unpressed state').toHaveAttribute('aria-pressed', 'false');
    await resonate.click();
    await expect.soft(page.locator('.contract-feed-item', { has: itemButton }).getByRole('button', { name: /^Remove resonance/ }), 'B8: Resonate state changes after click').toHaveAttribute('aria-pressed', 'true');

    await itemButton.click();
    await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
    await captureEvidence(page, testInfo, 'desktop-inspector-presentation');
    const inspector = page.getByRole('complementary', { name: 'INSPECTOR' });
    await expect.soft(inspector, 'B6/B19: Inspector should plainly label fallback/partial/excerpt provenance').toContainText(/fallback|partial|excerpt-only|model_status|summary provenance/i);
    await expect.soft(inspector, 'B7/B22: Inspector should not leak source furniture or related-story tail').not.toContainText(/related stories|follow us|sign up|personalized feed|more from/i);
    await expect.soft(inspector, 'B22: core insight should be distinct and clean or explicitly unavailable').toContainText(/core insight|insight unavailable|fallback/i);
  });

  test('B10/B12/U3/U5 expected-red: mobile non-feed surfaces contain inactive feed, focus, full errors, and stable ledger rows', async ({ page, runInfo, ownerToken }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureSeededItem(page, runInfo, ownerToken);
    await steer(page, 'source ledger');
    await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
    await captureEvidence(page, testInfo, 'mobile-source-ledger-surface');
    await expect.soft(page.locator('#today-feed'), 'B10/U5: inactive mobile feed should be hidden/unmounted/inert').toHaveAttribute('inert', '');
    await expect.soft(page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }), 'B10: Today rows should not remain in active accessibility flow on ledger').toHaveCount(0);
    await expect.soft(page.getByRole('heading', { name: 'SOURCE LEDGER' }), 'U5: focus should move to active surface heading or back command').toBeFocused();

    const sourceRow = page.getByTestId('source-row').first();
    await expect.soft(sourceRow, 'U3: ledger row grammar includes src/status/last_fetch/url/actions anchors').toContainText(/src: .*status: .*last_fetch: .*url:/s);
    const fullErrAffordance = sourceRow.getByRole('button', { name: /full error|show error|diagnostic|details/i }).or(sourceRow.locator('details'));
    await expect.soft(fullErrAffordance, 'B12: source diagnostics need keyboard/AT reachable full-view affordance').toHaveCount(1);

    await steer(page, 'search Local fixture');
    await captureEvidence(page, testInfo, 'mobile-search-surface-containment');
    await expect.soft(page.locator('#today-feed'), 'U5: inactive feed containment also applies to mobile Search').toHaveAttribute('inert', '');
    await steer(page, '/doctor');
    await captureEvidence(page, testInfo, 'mobile-doctor-surface-containment');
    await expect.soft(page.locator('#today-feed'), 'U5: inactive feed containment also applies to mobile Doctor').toHaveAttribute('inert', '');
  });
});
