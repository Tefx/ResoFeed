import path from 'node:path';

import type { Locator, Page, TestInfo } from 'playwright/test';
import { expect } from './fixtures';
import type { E2ERunInfo } from './e2e-contract';

export type FocusAudit = {
  readonly label: string;
  readonly activeTag: string;
  readonly activeName: string;
  readonly before: BoundingBox;
  readonly after: BoundingBox;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
  readonly focusVisible: boolean;
  readonly layoutStable: boolean;
};

type BoundingBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

export async function importFixtureAndIngest(page: Page, runInfo: E2ERunInfo): Promise<void> {
  // [DEVIATION]: DESIGN.md places SOURCE LEDGER inside the RESOFEED utility menu; opening the menu preserves the low-chrome contract instead of assuming forbidden persistent shortcut chrome.
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await page.getByRole('button', { name: 'SOURCE LEDGER' }).click();
  await expect(page.getByRole('heading', { name: 'SOURCE LEDGER' })).toBeVisible();
  const sourceText = page.getByTestId('source-row').filter({ hasText: /ResoFeed E2E Local Source/ });
  if (!(await sourceText.isVisible().catch(() => false))) {
    await page.locator('#opml-file').setInputFiles(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
    // DEVIATION RECORD: type=test_error; artifact=keyboard-a11y-helpers.ts; what_changed=shared OPML helper expects `OPML outlines flattened`; why=folder terminology is forbidden product-surface drift; impact=helper still proves successful OPML import before keyboard checks proceed.
    await expect(page.getByText(/imported \d+ sources; OPML outlines flattened/)).toBeVisible();
    await expect(sourceText).toBeVisible({ timeout: 15_000 });
  }
  const runIngest = page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ });
  await expect(runIngest).toBeVisible();
  await expect(page.getByRole('button', { name: /\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
  await runIngest.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ })).toBeVisible();
  await page.locator('details.surface-nav[aria-label="RESOFEED surface menu"] summary').click();
  await page.getByRole('button', { name: 'TODAY' }).click();
  await expect(page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' })).toBeVisible();
}

export async function focusAndAuditKeyboardVisible(page: Page, locator: Locator, label: string): Promise<FocusAudit> {
  await expect(locator).toBeVisible();
  const before = await locator.boundingBox();
  expect(before, `${label} has a layout box before focus`).not.toBeNull();

  if (!(await locator.evaluate((element) => element.matches(':focus-visible')).catch(() => false))) {
    if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) {
      await page.keyboard.press('Shift+Tab');
    }
    const reachedWithForwardTab = await tabUntilFocused(page, locator, 'Tab');
    if (!reachedWithForwardTab) {
      await tabUntilFocused(page, locator, 'Shift+Tab');
    }
  }

  await expect(locator).toBeFocused();
  const audit = await locator.evaluate<FocusAudit, { label: string; before: BoundingBox }>((element, payload) => {
    const active = document.activeElement;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const after = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const outlineWidth = Number.parseFloat(style.outlineWidth || '0');
    const focusVisible = element.matches(':focus-visible') && ((outlineWidth > 0 && style.outlineStyle !== 'none') || style.boxShadow !== 'none');
    const layoutStable = Math.abs(after.width - payload.before.width) < 0.5 && Math.abs(after.height - payload.before.height) < 0.5;
    return {
      label: payload.label,
      activeTag: active?.tagName.toLowerCase() ?? '',
      activeName: active?.getAttribute('aria-label') ?? active?.textContent?.trim() ?? '',
      before: payload.before,
      after,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      focusVisible,
      layoutStable
    };
  }, { label, before: before as BoundingBox });
  expect.soft(audit.focusVisible, `${label} focus indicator is visible independent of active/accent state`).toBe(true);
  expect.soft(audit.layoutStable, `${label} focus must not shift layout bounds`).toBe(true);
  return audit;
}

async function tabUntilFocused(page: Page, locator: Locator, key: 'Tab' | 'Shift+Tab'): Promise<boolean> {
  for (let index = 0; index < 80; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) {
      return true;
    }
    await page.keyboard.press(key);
  }
  return await locator.evaluate((element) => element === document.activeElement).catch(() => false);
}

export async function expectActiveState(locator: Locator, label: string): Promise<void> {
  const state = await locator.evaluate((element) => ({
    ariaCurrent: element.getAttribute('aria-current'),
    ariaSelected: element.getAttribute('aria-selected'),
    ariaPressed: element.getAttribute('aria-pressed'),
    ariaExpanded: element.getAttribute('aria-expanded'),
    dataState: element.getAttribute('data-state'),
    className: element.getAttribute('class') ?? ''
  }));
  const hasMachineState =
    state.ariaCurrent === 'true' ||
    state.ariaSelected === 'true' ||
    state.ariaPressed === 'true' ||
    state.ariaExpanded === 'true' ||
    /active|selected|current/.test(`${state.dataState ?? ''} ${state.className}`);
  expect.soft(hasMachineState, `${label} exposes selected/active state via aria-current/aria-selected/aria-pressed/aria-expanded/data/class equivalent: ${JSON.stringify(state)}`).toBe(true);
}

export async function attachRoleAriaSnapshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const snapshot = await page.locator('main').evaluate((main) => {
    const nodes = Array.from(main.querySelectorAll('button, a[href], input, [role], [aria-current], [aria-selected], [aria-pressed]'));
    return nodes.map((node) => ({
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role'),
      ariaLabel: node.getAttribute('aria-label'),
      ariaCurrent: node.getAttribute('aria-current'),
      ariaSelected: node.getAttribute('aria-selected'),
      ariaPressed: node.getAttribute('aria-pressed'),
      text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
      id: node.getAttribute('id'),
      className: node.getAttribute('class')
    }));
  });
  await testInfo.attach(name, {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json'
  });
}

export async function attachCoverageTable(testInfo: TestInfo): Promise<void> {
  const coverage = [
    ['Primary nav', 'Tab reaches TODAY/SOURCE LEDGER; Enter/Space activation; active panel state does not disagree'],
    ['Feed row/action controls', 'Open Inspector button focus visibility, Space activation, aria-current selected row'],
    ['Star/Resonate', '44px target, Enter/Space toggle, label/glyph state, aria-pressed/equivalent expected'],
    ['Steer submit and /doctor', 'Textbox label, Enter submit, live/status/log output for diagnostics'],
    ['Inspector links', 'Original link role/name/href, focus visibility, Enter-reachable anchor'],
    ['Source Ledger controls', 'OPML import, source details/delete, state export/import, named buttons, stable focus targets'],
    ['OPML/state portability', 'Import OPML and state export/import controls are keyboard-reachable with live status']
  ];
  await testInfo.attach('keyboard-a11y-focus-activation-coverage.json', {
    body: JSON.stringify(coverage.map(([control, proof]) => ({ control, proof })), null, 2),
    contentType: 'application/json'
  });
}
