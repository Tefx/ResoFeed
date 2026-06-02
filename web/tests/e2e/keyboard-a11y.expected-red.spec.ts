import path from 'node:path';

import { test, expect } from './fixtures';
import {
  attachCoverageTable,
  attachRoleAriaSnapshot,
  enterOwnerToken,
  expectActiveState,
  focusAndAudit,
  importFixtureAndIngest
} from './keyboard-a11y-helpers';

test.use({ trace: 'on', screenshot: 'on' });

test('expected-red keyboard a11y primary nav tab order and active surface semantics', async ({ page, ownerToken }, testInfo) => {
  await enterOwnerToken(page, ownerToken);
  await attachCoverageTable(testInfo);

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await expect(steer).toBeFocused();
  await focusAndAudit(steer, 'Steer input');

  await page.keyboard.press('Tab');
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  const summary = menu.locator('summary');
  await expect(summary).toBeFocused();
  await focusAndAudit(summary, 'RESOFEED menu trigger');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.getByRole('button', { name: 'TODAY' })).toHaveAttribute('tabindex', '0');

  await page.keyboard.press('Tab');
  const today = menu.getByRole('button', { name: 'TODAY' });
  await expect(today).toBeFocused();
  await focusAndAudit(today, 'TODAY menu entry');
  await expectActiveState(today, 'TODAY menu entry initial selected surface');

  await page.keyboard.press('Tab');
  const sourceLedger = menu.getByRole('button', { name: 'SOURCE LEDGER' });
  await expect(sourceLedger).toBeFocused();
  await focusAndAudit(sourceLedger, 'SOURCE LEDGER menu entry');
  await page.keyboard.press('Space');

  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'ledger');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).toHaveClass(/active-panel/);
  await expect(page.locator('.feed-pane')).not.toHaveClass(/active-panel/);
  await expect(page.locator('.shell-grid'), 'SOURCE LEDGER activation exposes semantic surface state').toHaveAttribute('data-surface', 'ledger');

  await attachRoleAriaSnapshot(page, testInfo, 'primary-nav-role-aria-output.json');
  await testInfo.attach('primary-nav-keyboard-a11y.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});

test('expected-red keyboard a11y feed row star inspector activation and selected state', async ({ page, ownerToken, runInfo }, testInfo) => {
  await enterOwnerToken(page, ownerToken);
  await importFixtureAndIngest(page, runInfo);

  const rowOpen = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await focusAndAudit(rowOpen, 'Feed row Open Inspector button');
  await page.keyboard.press('Space');

  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'inspector');
  await expect(page.locator('.detail-pane')).toHaveClass(/active-panel/);
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"]')).not.toHaveClass(/active-panel/);
  await expect(page.locator('.contract-feed-item', { has: rowOpen })).toHaveAttribute('aria-current', 'true');

  const star = page.getByRole('button', { name: /^Resonate item/ }).first();
  await focusAndAudit(star, 'Feed Resonate star');
  const starBox = await star.boundingBox();
  expect.soft(starBox?.width ?? 0, 'Resonate target width is at least 44 CSS px').toBeGreaterThanOrEqual(44);
  expect.soft(starBox?.height ?? 0, 'Resonate target height is at least 44 CSS px').toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Remove resonance/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove resonance/ }).first()).toContainText('★');
  await expectActiveState(page.getByRole('button', { name: /^Remove resonance/ }).first(), 'Resonate active star state');

  await attachRoleAriaSnapshot(page, testInfo, 'feed-row-star-role-aria-output.json');
  await testInfo.attach('feed-row-star-keyboard-a11y.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});

test('expected-red keyboard a11y Steer submit doctor log and Inspector original link', async ({ page, ownerToken, runInfo }, testInfo) => {
  await enterOwnerToken(page, ownerToken);
  await importFixtureAndIngest(page, runInfo);

  await page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' }).click();
  const originalLink = page.getByRole('link', { name: 'original link' });
  await expect(originalLink).toHaveAttribute('href', /https?:\/\//);
  await focusAndAudit(originalLink, 'Inspector original link');

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.focus();
  await steer.fill('/doctor');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '/doctor' })).toBeVisible();
  await expect(page.getByRole('log', { name: '/doctor diagnostics' })).toContainText('openrouter:');
  await expect(page.getByRole('log', { name: '/doctor diagnostics' })).toHaveCSS('overflow-wrap', 'anywhere');

  await attachRoleAriaSnapshot(page, testInfo, 'steer-doctor-inspector-role-aria-output.json');
  await testInfo.attach('steer-doctor-inspector-keyboard-a11y.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});

test('expected-red keyboard a11y Source Ledger OPML state with manual fetch controls', async ({ page, ownerToken, runInfo }, testInfo) => {
  await enterOwnerToken(page, ownerToken);
  // [DEVIATION]: DESIGN.md makes SOURCE LEDGER available through the opened RESOFEED utility menu, not as persistent closed-menu top chrome.
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  const ledgerNav = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]').getByRole('button', { name: 'SOURCE LEDGER' });
  await ledgerNav.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await expectActiveState(page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]').getByRole('button', { name: 'SOURCE LEDGER' }), 'SOURCE LEDGER nav active state before ledger controls');

  const opmlButton = page.getByRole('button', { name: '[IMPORT OPML]' });
  await focusAndAudit(opmlButton, 'OPML import visible button');
  const opmlBox = await opmlButton.boundingBox();
  expect.soft(opmlBox?.width ?? 0, 'OPML import control has detectable keyboard hit width').toBeGreaterThanOrEqual(44);
  expect.soft(opmlBox?.height ?? 0, 'OPML import control has detectable keyboard hit height').toBeGreaterThanOrEqual(44);
  await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
    // DEVIATION RECORD: type=test_error; artifact=keyboard-a11y.expected-red.spec.ts; what_changed=OPML import receipt expects `OPML outlines flattened`; why=folder terminology is forbidden while source-subscription outline flattening remains; impact=keyboard OPML proof still waits for import completion.
    await expect(page.getByText(/imported \d+ sources; OPML outlines flattened/)).toBeVisible();

  await focusAndAudit(page.getByRole('button', { name: '[RUN INGEST]' }), 'Source Ledger run ingest action');
  await focusAndAudit(page.getByRole('button', { name: '[FETCH]' }).first(), 'Source Ledger fetch source action');

  await focusAndAudit(page.getByRole('button', { name: 'Delete source: ResoFeed E2E Local Source' }), 'Source Ledger delete source');
  await focusAndAudit(page.getByRole('button', { name: 'export state' }), 'State export action');
  await page.getByRole('button', { name: 'import state' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Choose state JSON')).toBeFocused();

  await attachRoleAriaSnapshot(page, testInfo, 'source-ledger-opml-role-aria-output.json');
  await testInfo.attach('source-ledger-opml-keyboard-a11y.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});
