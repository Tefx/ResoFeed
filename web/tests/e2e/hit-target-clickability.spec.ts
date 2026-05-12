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

async function prepareImportedFeed(page: Page, ownerToken: string, opmlPath: string): Promise<void> {
  await enterOwnerToken(page, ownerToken);
  await pointerClick(page, page.getByRole('button', { name: 'SOURCE LEDGER' }), 'SOURCE LEDGER nav');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expectHitTarget(page, page.locator('label[for="opml-file"]'), 'OPML import label', { minHeight: 20 });
  if (await page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/).isVisible()) return;
  if (!(await page.getByText(/ResoFeed E2E Local Source · /).isVisible())) {
    await page.getByLabel('import OPML').setInputFiles(opmlPath);
    await expect(page.getByText(/imported \d+ sources; folders flattened/)).toBeVisible();
  }
  if (!(await page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/).isVisible())) {
    await expect(page.getByRole('button', { name: /\[RUN INGEST\]|\[INGESTING\.\.\.\]|\[FETCH\]|\[FETCHING\.\.\.\]/ })).toHaveCount(0);
    await triggerFixtureIngest(page);
    await expect(page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/)).toBeVisible({ timeout: 15_000 });
  }
}

async function triggerFixtureIngest(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const token = window.localStorage.getItem('resofeed.ownerToken');
    const response = await window.fetch('/api/ingest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  });
  if (!result.ok && result.status !== 409) throw new Error(`fixture ingest failed: ${result.status} ${result.body}`);
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

  const sourceFetch = page.getByRole('button', { name: 'Fetch ResoFeed E2E Local Source' });
  await pointerClick(page, sourceFetch, 'Source fetch button', { minHeight: 44 });
  await expect(sourceFetch).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/ResoFeed E2E Local Source · ok · last fetch:/)).toBeVisible();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);

  await pointerClick(page, page.getByRole('button', { name: 'TODAY' }), 'TODAY nav');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'feed');
  await expect(page.locator('.feed-pane.active-panel')).toBeVisible();
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toHaveCount(0);
  await expect(await activePanelTexts(page), 'TODAY click must not leave Source Ledger as the active panel').not.toContain(expect.stringContaining('SOURCE LEDGER'));

  const feedOpen = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  const row = page.locator('.contract-feed-item').filter({ has: feedOpen });
  const rowBoxBefore = await row.boundingBox();
  await pointerClick(page, feedOpen, 'Feed row Inspect/open');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'inspector');
  await expect(page.getByRole('heading', { name: 'Local fixture item one' })).toBeFocused();
  await expect(row).toHaveAttribute('aria-current', 'true');
  expect(await row.boundingBox(), 'selected Inspect/open must not shift row bounds').toEqual(rowBoxBefore);

  await pointerClick(page, page.getByRole('button', { name: 'TODAY' }), 'TODAY nav after Inspect');
  const star = row.locator('.contract-resonate');
  const starLabelBefore = await star.getAttribute('aria-label');
  await pointerClick(page, star, 'Star / Resonate', { minWidth: 44, minHeight: 44 });
  await expect(star, 'star label changes after real pointer activation').not.toHaveAttribute('aria-label', starLabelBefore ?? '');
  await expect(star, 'star shape changes in addition to color').toContainText(starLabelBefore === 'Resonate item' ? '★' : '☆');

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
  expect(await submit.boundingBox(), 'Steer submit dimensions remain stable through submit/pending result').toEqual(submitBoxBefore);

  await pointerClick(page, page.getByRole('button', { name: 'SOURCE LEDGER' }), 'SOURCE LEDGER nav after /doctor');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'ledger');
  await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);
});

test('ui-navigation-hover-inspector-repair hit-target diagnostics: nav clicks never leave the wrong panel active', async ({ page, runInfo, ownerToken }) => {
  await prepareImportedFeed(page, ownerToken, path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'));
  await expectHitTarget(page, page.locator('label[for="opml-file"]'), 'OPML import action must be a touch-safe hit target', { minHeight: 44 });
  await pointerClick(page, page.getByRole('button', { name: 'TODAY' }), 'TODAY nav repair probe');
  const feedOpen = page.getByRole('button', { name: 'Open Inspector for: Local fixture item one' });
  await pointerClick(page, feedOpen, 'Inspector open repair probe');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'inspector');
  await pointerClick(page, page.getByRole('button', { name: 'SOURCE LEDGER' }), 'SOURCE LEDGER nav repair probe');
  await expect(page.locator('.shell-grid')).toHaveAttribute('data-surface', 'ledger');
  await expect(page.locator('.utility-surface[aria-label="SOURCE LEDGER surface"].active-panel')).toBeVisible();
  await expect(page.locator('.detail-pane.active-panel')).toHaveCount(0);
  await expect(page.locator('.feed-pane.active-panel')).toHaveCount(0);
});
