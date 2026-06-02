import path from 'node:path';

import type { Locator, Page } from 'playwright/test';

import { expect, test } from './fixtures';

type HitTargetDiagnostic = {
  readonly label: string;
  readonly selector: string | null;
  readonly point: { readonly x: number; readonly y: number };
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly viewport: { readonly width: number; readonly height: number } | null;
  readonly target: ElementClue | null;
  readonly top: ElementClue | null;
  readonly targetContainsTop: boolean;
  readonly disabled: boolean;
  readonly activeSurface: string | null;
  readonly activePanels: readonly string[];
};

type ElementClue = {
  readonly tagName: string;
  readonly id: string;
  readonly className: string;
  readonly text: string;
  readonly ariaLabel: string | null;
  readonly pointerEvents: string;
  readonly position: string;
  readonly zIndex: string;
  readonly visibility: string;
  readonly display: string;
  readonly outerHTML: string;
};

async function enterOwnerToken(page: Page, ownerToken: string): Promise<void> {
  await page.goto('/');
  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
}

async function openSurfaceViaMenu(page: Page, name: 'TODAY' | 'SOURCE LEDGER', label: string): Promise<void> {
  const menu = page.locator('details.surface-nav[aria-label="RESOFEED surface menu"]');
  const trigger = menu.locator('summary');
  await pointerClick(page, trigger, `${label} RESOFEED menu trigger`);
  await expect(menu).toHaveAttribute('open', '');
  await pointerClick(page, menu.getByRole('button', { name, exact: true }), label);
}

async function prepareImportedFeed(page: Page, ownerToken: string, opmlPath: string): Promise<void> {
  await enterOwnerToken(page, ownerToken);
  await openSurfaceViaMenu(page, 'SOURCE LEDGER', 'SOURCE LEDGER nav');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expectHitTarget(page, page.getByRole('button', { name: '[IMPORT OPML]' }), 'OPML import button', { minHeight: 44 });
  const sourceRow = page.locator('.source-ledger__row', { hasText: 'ResoFeed E2E Local Source' }).first();
  if (!(await sourceRow.isVisible())) {
    await page.locator('#opml-file').setInputFiles(opmlPath);
    // DEVIATION RECORD: type=test_error; artifact=hit-target-clickability.spec.ts; what_changed=OPML import receipt expects `OPML outlines flattened`; why=folder terminology is forbidden product-surface drift; impact=hit-target setup still waits on successful OPML import.
    await expect(page.getByText(/imported \d+ sources; OPML outlines flattened/)).toBeVisible();
  }
  const runIngestButton = page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]/ });
  await expect(runIngestButton).toBeVisible();
  await expect(page.getByRole('button', { name: /Fetch source|\[FETCH\]|\[FETCHING\.\.\.\]/ }).first()).toBeVisible();
  await pointerClick(page, runIngestButton, 'Source Ledger [RUN INGEST]', { minHeight: 44 });
  await expect(sourceRow.locator('.source-ledger__status', { hasText: /last_fetch:/ })).toBeVisible({ timeout: 15_000 });
}

async function collectHitTargetDiagnostic(page: Page, locator: Locator, label: string): Promise<HitTargetDiagnostic> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const point = box
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : { x: Number.NaN, y: Number.NaN };

  return await locator.evaluate((element, args): HitTargetDiagnostic => {
    const clue = (candidate: Element | null): ElementClue | null => {
      if (!candidate) return null;
      const style = window.getComputedStyle(candidate);
      return {
        tagName: candidate.tagName,
        id: candidate.id,
        className: candidate instanceof HTMLElement ? candidate.className : '',
        text: (candidate.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        ariaLabel: candidate.getAttribute('aria-label'),
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
        visibility: style.visibility,
        display: style.display,
        outerHTML: candidate.outerHTML.slice(0, 500)
      };
    };
    const top = document.elementFromPoint(args.point.x, args.point.y);
    const shell = document.querySelector('.shell-grid');
    return {
      label: args.label,
      selector: args.selector,
      point: args.point,
      box: args.box,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      target: clue(element),
      top: clue(top),
      targetContainsTop: top ? element === top || element.contains(top) : false,
      disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.disabled : false,
      activeSurface: shell?.getAttribute('data-surface') ?? null,
      activePanels: Array.from(document.querySelectorAll('.active-panel')).map((panel) => {
        const aria = panel.getAttribute('aria-label');
        const id = panel.id ? `#${panel.id}` : '';
        const klass = panel instanceof HTMLElement ? panel.className : '';
        return `${panel.tagName.toLowerCase()}${id}.${klass}${aria ? `[aria-label="${aria}"]` : ''}`;
      })
    };
  }, { label, selector: null, point, box });
}

async function expectHitTarget(
  page: Page,
  locator: Locator,
  label: string,
  options: { readonly minWidth?: number; readonly minHeight?: number } = {}
): Promise<HitTargetDiagnostic> {
  await expect(locator, `${label} visible before hit-target probe`).toBeVisible();
  const diagnostic = await collectHitTargetDiagnostic(page, locator, label);
  expect(diagnostic.box, `${label} bounding box diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).not.toBeNull();
  if (diagnostic.box) {
    expect(diagnostic.box.width, `${label} width diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).toBeGreaterThan(0);
    expect(diagnostic.box.height, `${label} height diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).toBeGreaterThan(0);
    if (options.minWidth !== undefined) {
      expect(diagnostic.box.width, `${label} min-width diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).toBeGreaterThanOrEqual(options.minWidth);
    }
    if (options.minHeight !== undefined) {
      expect(diagnostic.box.height, `${label} min-height diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).toBeGreaterThanOrEqual(options.minHeight);
    }
  }
  expect(diagnostic.target?.pointerEvents, `${label} pointer-events diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).not.toBe('none');
  expect(diagnostic.target?.visibility, `${label} visibility diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).not.toBe('hidden');
  expect(diagnostic.targetContainsTop, `${label} obstruction diagnostic: ${JSON.stringify(diagnostic, null, 2)}`).toBe(true);
  return diagnostic;
}

async function pointerClick(
  page: Page,
  locator: Locator,
  label: string,
  options: { readonly minWidth?: number; readonly minHeight?: number } = {}
): Promise<void> {
  const diagnostic = await expectHitTarget(page, locator, label, options);
  if (!diagnostic.box) return;
  try {
    await page.mouse.move(diagnostic.point.x, diagnostic.point.y);
    await page.mouse.down();
    await page.mouse.up();
  } catch (error) {
    const postClickDiagnostic = await collectHitTargetDiagnostic(page, locator, label);
    throw new Error(`${label} pointer click failed: ${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(postClickDiagnostic, null, 2)}`);
  }
}

function activePanelTexts(page: Page): Promise<readonly string[]> {
  return page.locator('.active-panel').evaluateAll((panels) => panels.map((panel) => (panel.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

test('hit-target clickability: SOURCE LEDGER, TODAY, Steer submit, star, Inspector links, /doctor, and OPML import controls', async ({ page, runInfo, ownerToken }) => {
  const opmlPath = path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml');
  await prepareImportedFeed(page, ownerToken, opmlPath);

  const sourceFetch = page.getByRole('button', { name: 'Fetch source ResoFeed E2E Local Source' });
  await pointerClick(page, sourceFetch, 'Source fetch button', { minHeight: 44 });
  await expect(sourceFetch).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.source-ledger__row', { hasText: 'ResoFeed E2E Local Source' }).locator('.source-ledger__status', { hasText: /last_fetch:/ })).toBeVisible();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);

  await openSurfaceViaMenu(page, 'TODAY', 'TODAY nav');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'feed');
  await expect(page.locator('.feed-pane.active-panel')).toBeVisible();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toHaveCount(0);
  await expect(await activePanelTexts(page), 'TODAY click must not leave Source Ledger as the active panel').not.toContain(expect.stringContaining('SOURCE LEDGER'));

  const feedOpen = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  const row = page.locator('.contract-feed-item', { hasText: 'Local fixture item one' }).first();
  await expect(row).toBeVisible();
  await feedOpen.scrollIntoViewIfNeeded();
  const rowBoxBefore = await row.boundingBox();
  const feedScrollBefore = await page.locator('#today-feed').evaluate((element) => element.scrollTop);
  await pointerClick(page, feedOpen, 'Feed row Inspect/open');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'inspector');
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  await expect(row).toHaveAttribute('aria-current', 'true');
  const rowBoxAfter = await row.boundingBox();
  expect(rowBoxAfter && rowBoxBefore ? { x: rowBoxAfter.x, width: rowBoxAfter.width, height: rowBoxAfter.height } : rowBoxAfter, 'selected Inspect/open must preserve dimensions and x-position').toEqual(
    rowBoxBefore ? { x: rowBoxBefore.x, width: rowBoxBefore.width, height: rowBoxBefore.height } : rowBoxBefore
  );
  await expect(page.locator('#today-feed'), 'selected Inspect/open must preserve feed scroll container position').toHaveJSProperty('scrollTop', feedScrollBefore);

  await openSurfaceViaMenu(page, 'TODAY', 'TODAY nav after Inspect');
  const star = row.locator('.contract-resonate');
  const starLabelBefore = await star.getAttribute('aria-label');
  await pointerClick(page, star, 'Star / Resonate', { minWidth: 44, minHeight: 44 });
  await expect(star, 'star label changes after real pointer activation').not.toHaveAttribute('aria-label', starLabelBefore ?? '');
  await expect(star, 'star shape changes in addition to color').toContainText(starLabelBefore?.startsWith('Resonate item') ? '★' : '☆');

  await pointerClick(page, feedOpen, 'Feed row Inspect/open after star');
  const originalLink = page.locator('.contract-inspector a[href]').filter({ hasText: 'original link' }).first();
  await expectHitTarget(page, originalLink, 'Inspector original link');
  await expect(originalLink).toHaveAttribute('href', /.+/);
  await expect(page.locator('.contract-inspector')).toContainText('summary unavailable');

  const steer = page.getByRole('textbox', { name: 'Steer or paste RSS URL' });
  await steer.fill('/doctor');
  const submit = page.locator('form.steer-form button[type="submit"]');
  const submitBoxBefore = await submit.boundingBox();
  await pointerClick(page, submit, 'Steer submit /doctor', { minHeight: 20 });
  await expect(page.locator('.doctor-surface')).toBeVisible();
  await expect(page.getByRole('heading', { name: '/doctor' })).toBeVisible();
  await expect(page.locator('pre.contract-diagnostics[role="log"]')).toContainText('openrouter:');
  expect(submitBoxBefore, 'Steer submit has measurable dimensions before activation').not.toBeNull();
  await expect(submit, 'Steer submit hides after the submitted command is cleared').toHaveCount(0);

  await openSurfaceViaMenu(page, 'SOURCE LEDGER', 'SOURCE LEDGER nav after /doctor');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'ledger');
  await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);
});

test('ui-navigation-hover-inspector-repair hit-target diagnostics: nav clicks never leave the wrong panel active', async ({ page, runInfo, ownerToken }) => {
  await prepareImportedFeed(page, ownerToken, path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expectHitTarget(page, page.getByRole('button', { name: '[IMPORT OPML]' }), 'OPML import action must be a touch-safe hit target', { minHeight: 44 });
  await openSurfaceViaMenu(page, 'TODAY', 'TODAY nav repair probe');
  const feedOpen = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await pointerClick(page, feedOpen, 'Inspector open repair probe');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'inspector');
  await openSurfaceViaMenu(page, 'SOURCE LEDGER', 'SOURCE LEDGER nav repair probe');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'ledger');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expect(page.locator('.detail-pane.active-panel')).toHaveCount(0);
  await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);
});
