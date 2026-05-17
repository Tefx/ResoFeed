import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.RESOFEED_BASE_URL ?? 'http://127.0.0.1:18081';
const ownerToken = process.env.RESOFEED_OWNER_TOKEN ?? 'rfeed_blind-render-retest-token';
const outDir = path.resolve('artifacts/ui-preview-runtime-conformance-audit-remediation.browser-render-retest');

async function authenticate(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const hasPrompt = await page.getByText('OWNER TOKEN', { exact: false }).count().catch(() => 0);
  if (hasPrompt) {
    const tokenInput = page.locator('input').first();
    await tokenInput.fill(ownerToken);
    const button = page.locator('button').filter({ hasText: /unlock|enter|submit|continue|authenticate/i }).first();
    if (await button.count()) await button.click();
    else await tokenInput.press('Enter');
    await page.waitForLoadState('networkidle');
  }
}

async function openMenu(page) {
  const menu = page.getByText('RESOFEED', { exact: true }).last();
  await menu.click();
  await page.waitForTimeout(100);
}

async function activateSurface(page, label) {
  await openMenu(page);
  await page.evaluate((wanted) => {
    const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === wanted);
    if (!button) throw new Error(`surface button not found: ${wanted}`);
    button.click();
  }, label);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

async function runDoctor(page) {
  const steer = page.locator('#steer-input, input[placeholder*="Steer"]').first();
  await steer.fill('/doctor');
  await page.waitForTimeout(100);
  const apply = page.getByRole('button', { name: /apply/i }).first();
  if (await apply.count()) await apply.click();
  else await steer.press('Enter');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

async function captureState(page, prefix) {
  await page.screenshot({ path: path.join(outDir, `${prefix}.png`), fullPage: true });
  await writeFile(path.join(outDir, `${prefix}.dom.html`), await page.locator('body').evaluate((n) => n.outerHTML));
  let aria = '';
  try {
    aria = await page.locator('body').ariaSnapshot({ timeout: 5000 });
  } catch (error) {
    aria = `ARIA_SNAPSHOT_UNAVAILABLE: ${error.message}`;
  }
  await writeFile(path.join(outDir, `${prefix}.aria.txt`), aria);
}

async function collectMeasurements(page) {
  return await page.evaluate(() => {
    const read = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { missing: true };
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 160) ?? '',
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily,
        backgroundColor: style.backgroundColor,
        color: style.color,
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        minHeight: style.minHeight,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
      };
    };
    const overlaps = (a, b) => {
      const ae = document.querySelector(a);
      const be = document.querySelector(b);
      if (!ae || !be) return null;
      const ar = ae.getBoundingClientRect();
      const br = be.getBoundingClientRect();
      return !(ar.right <= br.left || ar.left >= br.right || ar.bottom <= br.top || ar.top >= br.bottom);
    };
    return {
      location: location.href,
      shellBrand: read('.contract-brand'),
      surfaceNavLabel: read('.surface-nav-label'),
      utilityMenu: read('.surface-nav-menu'),
      runtimeWarning: read('.runtime-language-warning'),
      menuButton: read('.surface-nav-menu button'),
      steerRoutePreview: read('.steer-route-preview'),
      steerSubmit: read('.steer-submit, button[type="submit"]'),
      sourceLedger: read('.source-ledger'),
      sourceLedgerTitle: read('#source-ledger-title, .source-ledger__title'),
      sourceLedgerStatus: read('.source-ledger__status'),
      runIngest: read('.bracket-action--run-ingest'),
      sourceLedgerTools: read('.source-ledger__tools'),
      searchSecondarySummary: read('.search-secondary-filters summary'),
      searchInput: read('.search-secondary-grid input, input[type="search"], input[name="q"]'),
      searchSelect: read('.search-secondary-grid select, select'),
      firstMetadataLine: read('.contract-feed-meta, .meta-row'),
      firstStar: read('.star, .resonate-button'),
      metadataStarOverlap: overlaps('.contract-feed-meta, .meta-row', '.star, .resonate-button'),
      doctorSurface: read('.doctor-surface, .doctor, pre'),
      globalTopErrors: Array.from(document.querySelectorAll('.shell-status, .raw-error-line, [role="alert"]')).map((el) => el.textContent?.trim()).filter(Boolean),
      visibleTextSample: document.body.innerText.slice(0, 2000),
    };
  });
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await authenticate(desktop);
await captureState(desktop, 'desktop-1280x720-today');
const desktopTodayMeasurements = await collectMeasurements(desktop);
await openMenu(desktop);
await captureState(desktop, 'desktop-1280x720-menu-open');
const desktopMenuMeasurements = await collectMeasurements(desktop);
await activateSurface(desktop, 'SOURCE LEDGER');
await captureState(desktop, 'desktop-1280x720-source-ledger');
const desktopSourceLedgerMeasurements = await collectMeasurements(desktop);
await runDoctor(desktop);
await captureState(desktop, 'desktop-1280x720-doctor');
const desktopDoctorMeasurements = await collectMeasurements(desktop);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await authenticate(mobile);
await captureState(mobile, 'mobile-390x844-today');
const mobileTodayMeasurements = await collectMeasurements(mobile);
await activateSurface(mobile, 'SOURCE LEDGER');
await captureState(mobile, 'mobile-390x844-source-ledger');
const mobileSourceLedgerMeasurements = await collectMeasurements(mobile);
await runDoctor(mobile);
await captureState(mobile, 'mobile-390x844-doctor');
const mobileDoctorMeasurements = await collectMeasurements(mobile);

await writeFile(path.join(outDir, 'computed-style-measurements.json'), JSON.stringify({
  baseURL,
  desktop: {
    today: desktopTodayMeasurements,
    menuOpen: desktopMenuMeasurements,
    sourceLedger: desktopSourceLedgerMeasurements,
    doctor: desktopDoctorMeasurements,
  },
  mobile: {
    today: mobileTodayMeasurements,
    sourceLedger: mobileSourceLedgerMeasurements,
    doctor: mobileDoctorMeasurements,
  },
}, null, 2));
await browser.close();
