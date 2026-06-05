import path from 'node:path';

import { test, expect } from './fixtures';

async function enterOwnerToken(page: import('playwright/test').Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function runSteerCommand(page: import('playwright/test').Page, command: string, receipt: RegExp | string): Promise<void> {
  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill(command);
  await steer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: receipt })).toBeVisible();
}

test('Inspector original link renders as low-chrome provenance text in a real browser', async ({ page, ownerToken, runInfo }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterOwnerToken(page, ownerToken);

  await runSteerCommand(page, 'source ledger', 'source ledger');
  await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expect(page.getByText(/imported 1 sources|skipped 1 existing sources/)).toBeVisible();

  const sourceRow = page.locator('.source-ledger__row', { hasText: runInfo.fixtureServer.url }).first();
  await expect(sourceRow).toBeVisible();
  await sourceRow.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).click();
  await expect(sourceRow.locator('.source-ledger__status', { hasText: /last_fetch: \d{2}:\d{2}:\d{2}/ })).toBeVisible({ timeout: 20_000 });

  await runSteerCommand(page, 'today', 'today');
  await page.getByRole('button', { name: /Open Inspector for: Local fixture item one/ }).click();

  const inspector = page.locator('.contract-inspector');
  await expect(inspector).toContainText('INSPECTOR');
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();

  const originalLink = inspector.getByRole('link', { name: 'original link' });
  await expect(originalLink).toBeVisible();
  const idleStyle = await originalLink.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      minHeight: style.minHeight,
      paddingInlineStart: style.paddingInlineStart,
      paddingInlineEnd: style.paddingInlineEnd,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      textDecorationLine: style.textDecorationLine,
      height: rect.height
    };
  });
  expect(idleStyle.display).toBe('inline');
  expect(idleStyle.paddingInlineStart).toBe('0px');
  expect(idleStyle.paddingInlineEnd).toBe('0px');
  expect(idleStyle.borderTopWidth).toBe('0px');
  expect(idleStyle.borderRightWidth).toBe('0px');
  expect(idleStyle.borderBottomWidth).toBe('0px');
  expect(idleStyle.borderLeftWidth).toBe('0px');
  expect(idleStyle.boxShadow).toBe('none');
  expect(idleStyle.height).toBeLessThan(24);

  await originalLink.focus();
  const focusStyle = await originalLink.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      textDecorationLine: style.textDecorationLine,
      textDecorationColor: style.textDecorationColor,
      color: style.color,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow
    };
  });
  expect(focusStyle.outlineStyle).toBe('none');
  expect(focusStyle.outlineWidth).toBe('0px');
  expect(focusStyle.textDecorationLine).toContain('underline');
  expect(focusStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(focusStyle.boxShadow).toBe('none');

  const inspectorSections = await inspector.locator('.inspector-text-section').evaluateAll((sections) => sections.map((section) => ({
    label: section.getAttribute('aria-label'),
    classes: section.getAttribute('class'),
    heading: section.querySelector('.inspector-section-label')?.textContent?.trim() ?? ''
  })));
  // Current content-contract fallback semantics must not render ghost Summary/Core
  // sections when model-backed generated content is unavailable. The original-link
  // polish proof is about low-chrome provenance; the only text section for this
  // fixture is the Text evidence disclosure.
  expect(inspectorSections).toEqual([
    { label: 'Text evidence', classes: 'inspector-text-section inspector-source-evidence-section', heading: 'Text evidence · RSS excerpt' }
  ]);

  const screenshotPath = path.join(testInfo.outputDir, 'inspector-original-link-low-chrome.png');
  await inspector.screenshot({ path: screenshotPath });
  await testInfo.attach('inspector-original-link-low-chrome.png', { path: screenshotPath, contentType: 'image/png' });
});
