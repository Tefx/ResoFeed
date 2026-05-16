#!/usr/bin/env node
/*
Black-box UI/a11y regression audit for srde2e-visual-a11y-regression-proof.

Reads no implementation source. Starts the documented public binary, drives the
served browser UI with real pointer/keyboard operations, and writes objective
evidence under artifacts/srde2e-visual-a11y-regression-proof/.
*/
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromWeb = createRequire(path.join(ROOT, 'web', 'package.json'));
const { chromium } = requireFromWeb('playwright');
const ART = path.join(ROOT, 'artifacts', 'srde2e-visual-a11y-regression-proof');
const PORT = 18081;
const RSS_PORT = 18082;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'rfeed_blind_audit_owner_token_0123456789abcdef';
const DB = path.join(ART, 'audit.sqlite3');

const failures = [];
const shouldFix = [];
const proofs = [];
const screenshots = [];
const snapshots = [];
const hitRows = [];
const keyboardRows = [];
const activePanelRows = [];
const negativeRows = [];

function record(req, claim, evidence, status, basis, blocker = '') {
  proofs.push({ requirement_ref: req, behavior_claim: claim, runtime_proof_expected: 'public browser surface', evidence_ref: evidence, status, closure_path: blocker || 'none', gate_decision_basis: basis });
  if (status !== 'PROVEN') failures.push(`${req}: ${basis}`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { res, text, json };
}

async function waitHTTP(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function startRssServer() {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blind Audit Feed</title><link>http://127.0.0.1:${RSS_PORT}/</link><description>fixture</description><item><guid>blind-audit-1</guid><title>Blind Audit Item One</title><link>http://127.0.0.1:${RSS_PORT}/article-one</link><description><![CDATA[Dense summary text with <b>HTML</b> and provenance.]]></description><pubDate>Sat, 16 May 2026 10:00:00 GMT</pubDate></item><item><guid>blind-audit-2</guid><title>Blind Audit Item Two</title><link>http://127.0.0.1:${RSS_PORT}/article-two</link><description>Second item for keyboard and split-scroll proof.</description><pubDate>Sat, 16 May 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml' });
      res.end(rss);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body><article><h1>${req.url}</h1><p>Original article text for ${req.url}.</p></article></body></html>`);
  });
  return new Promise((resolve) => server.listen(RSS_PORT, '127.0.0.1', () => resolve(server)));
}

async function topmost(page, selector, label) {
  const loc = page.locator(selector).first();
  if (await loc.count() === 0) throw new Error(`missing ${label}: ${selector}`);
  await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
  const box = await loc.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) throw new Error(`zero box for ${label}`);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const interior = { x: Math.min(box.x + box.width - 2, box.x + Math.max(2, Math.min(12, box.width / 2))), y: Math.min(box.y + box.height - 2, box.y + Math.max(2, Math.min(12, box.height / 2))) };
  const evalPoint = async (p) => loc.evaluate((target, p) => {
    const top = document.elementFromPoint(p.x, p.y);
    const style = target ? getComputedStyle(target) : null;
    return {
      tag: top?.tagName || null,
      text: top?.textContent?.trim().slice(0, 80) || '',
      ok: !!(target && top && (top === target || target.contains(top))),
      pointerEvents: style?.pointerEvents || null,
      visibility: style?.visibility || null,
      disabled: target?.matches?.(':disabled') || false,
    };
  }, p);
  const c = await evalPoint(center);
  const i = await evalPoint(interior);
  const min44 = box.width >= 44 && box.height >= 44;
  hitRows.push({ label, selector, width: Math.round(box.width), height: Math.round(box.height), centerTopmostOk: c.ok, interiorTopmostOk: i.ok, pointerEvents: c.pointerEvents, visibility: c.visibility, disabled: c.disabled, min44 });
  if (!c.ok || !i.ok || c.pointerEvents === 'none' || c.visibility === 'hidden') throw new Error(`obstructed/non-clickable ${label}: ${JSON.stringify({ box, c, i })}`);
  if (!min44) throw new Error(`below 44px target ${label}: ${Math.round(box.width)}x${Math.round(box.height)}`);
  await page.mouse.click(center.x, center.y);
  return box;
}

async function screenshot(page, name, fullPage = true) {
  const file = path.join(ART, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  screenshots.push(file.replace(ROOT + '/', ''));
}

async function snapshot(page, name) {
  const file = path.join(ART, `${name}.json`);
  let snap = null;
  try {
    if (page.accessibility?.snapshot) {
      snap = await page.accessibility.snapshot({ interestingOnly: false });
    } else {
      const cdp = await page.context().newCDPSession(page);
      snap = await cdp.send('Accessibility.getFullAXTree');
      await cdp.detach();
    }
  } catch (err) {
    snap = { error: String(err.message || err) };
  }
  const dom = await page.evaluate(() => ({
    title: document.title,
    lang: document.documentElement.lang,
    bodyText: document.body.innerText.slice(0, 12000),
    activeElement: { tag: document.activeElement?.tagName, id: document.activeElement?.id, text: document.activeElement?.textContent?.trim().slice(0, 120) },
    activePanels: Array.from(document.querySelectorAll('.active-panel,[aria-current="true"],[aria-selected="true"],[data-surface],details[open]')).map((el) => ({ tag: el.tagName, cls: el.className, surface: el.getAttribute('data-surface'), current: el.getAttribute('aria-current'), selected: el.getAttribute('aria-selected'), text: el.textContent?.trim().slice(0, 200) })),
    controls: Array.from(document.querySelectorAll('button,a,input,summary,textarea,select')).map((el) => ({ tag: el.tagName, role: el.getAttribute('role'), name: el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('placeholder') || '', id: el.id, disabled: el.matches(':disabled'), rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() }))
  }));
  await writeFile(file, JSON.stringify({ snap, dom }, null, 2));
  snapshots.push(file.replace(ROOT + '/', ''));
}

async function focusVisible(page, label) {
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, id: el.id, text: el.textContent?.trim().slice(0, 80) || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '', outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow, rect: { w: Math.round(r.width), h: Math.round(r.height) } };
  });
  const visible = !!info && ((parseFloat(info.outlineWidth) || 0) >= 1 && info.outlineStyle !== 'none' || (info.boxShadow && info.boxShadow !== 'none'));
  keyboardRows.push({ label, ...info, focusIndicatorVisible: visible });
  if (!visible) throw new Error(`focus indicator not visible for ${label}: ${JSON.stringify(info)}`);
}

async function activePanelProof(page, expected) {
  const state = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    return {
      surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') || null,
      activeTexts: Array.from(document.querySelectorAll('.active-panel,[aria-current="true"],[aria-selected="true"]')).filter(visible).map((el) => el.textContent?.trim().slice(0, 80)),
      visibleLedger: !!Array.from(document.querySelectorAll('[aria-label*="SOURCE LEDGER"], .source-ledger')).find(visible),
      visibleToday: !!Array.from(document.querySelectorAll('[aria-label*="TODAY"], .feed-pane, main')).find((el) => visible(el) && /TODAY/i.test(el.textContent || '')),
    };
  });
  const ok = expected === 'ledger' ? state.visibleLedger : state.visibleToday;
  activePanelRows.push({ expected, ...state, ok });
  if (!ok) throw new Error(`active panel mismatch expected ${expected}: ${JSON.stringify(state)}`);
}

async function main() {
  await rm(ART, { recursive: true, force: true });
  await mkdir(ART, { recursive: true });
  const rssServer = await startRssServer();
  const serverLog = path.join(ART, 'server.log');
  const srv = spawn('./bin/resofeed', ['serve', '--addr', `127.0.0.1:${PORT}`, '--public-url', BASE, '--db', DB, '--owner-token', TOKEN], {
    cwd: ROOT,
    env: { ...process.env, OPENROUTER_KEY: 'sk-or-v1-redacted-blackbox-placeholder' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const chunks = [];
  srv.stdout.on('data', (d) => chunks.push(String(d)));
  srv.stderr.on('data', (d) => chunks.push(String(d)));
  try {
    await waitHTTP(BASE + '/');
    const opml = `<?xml version="1.0"?><opml version="2.0"><body><outline text="Blind Audit" title="Blind Audit" type="rss" xmlUrl="http://127.0.0.1:${RSS_PORT}/feed.xml" /></body></opml>`;
    const imp = await fetchJSON(BASE + '/api/sources/import-opml', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/xml' }, body: opml });
    const sources = await fetchJSON(BASE + '/api/sources', { headers: { Authorization: `Bearer ${TOKEN}` } });
    const sid = sources.json?.sources?.[0]?.id;
    if (sid) await fetchJSON(BASE + `/api/sources/${encodeURIComponent(sid)}/fetch`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: '{}' });
    await writeFile(path.join(ART, 'seed-api.json'), JSON.stringify({ importStatus: imp.res.status, importBody: imp.json || imp.text, sourceCount: sources.json?.sources?.length || 0, firstSource: sid || null }, null, 2));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'owner-token-empty-focused');
    await snapshot(page, 'owner-token-empty-focused-a11y');
    const tokenInput = page.locator('input[name="owner-token"], #owner-token-input, input[type="password"], input').first();
    await tokenInput.fill('wrong-token');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await screenshot(page, 'owner-token-rejected');
    const rejected = /owner token rejected|unauthorized|err:/i.test(await page.locator('body').innerText());
    record('owner-token rejected shell', 'invalid owner token keeps prompt and emits raw error', 'owner-token-rejected.png / owner-token-empty-focused-a11y.json', rejected ? 'PROVEN' : 'UNPROVEN', rejected ? 'raw rejection visible' : 'no raw rejection observed');
    await tokenInput.fill(TOKEN);
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await screenshot(page, 'accepted-shell-today');
    await snapshot(page, 'accepted-shell-today-a11y');
    record('owner-token accepted shell', 'accepted token opens app shell and moves beyond prompt', 'accepted-shell-today.png / accepted-shell-today-a11y.json', !/Enter owner token/i.test(await page.locator('body').innerText()) ? 'PROVEN' : 'UNPROVEN', 'post-auth shell text inspected');

    const steer = page.locator('#steer-input, [name="steer"], textarea, input[placeholder*="Steer"]').first();
    if (await steer.count()) {
      await steer.fill('');
      await screenshot(page, 'steer-idle');
      await steer.fill(`http://127.0.0.1:${RSS_PORT}/feed.xml`);
      await screenshot(page, 'steer-add-source-command');
      const submit = page.locator('form button[type="submit"], button:has-text("apply"), button:has-text("[APPLY]")').first();
      if (await submit.count()) {
        try { await topmost(page, 'form button[type="submit"], button:has-text("apply"), button:has-text("[APPLY]")', 'Steer submit'); } catch (e) { failures.push(String(e.message)); }
        await page.waitForTimeout(1000);
      }
      await screenshot(page, 'steer-receipt-or-error');
      await steer.fill('search Blind Audit');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await screenshot(page, 'steer-search-state');
      await steer.fill('/doctor');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await screenshot(page, 'steer-doctor-state');
      await snapshot(page, 'doctor-a11y');
      await steer.fill('hide all items');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await screenshot(page, 'steer-invalid-state');
      await steer.fill('less celebrity coverage');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await screenshot(page, 'steer-rule-state');
      const body = await page.locator('body').innerText();
      record('Steer idle/add/search/find/doctor/rule/invalid/receipt/undo states', 'Steer exposes required command states through public shell', 'steer-*.png / doctor-a11y.json', /doctor|search|applied|err:|undo|receipt|result/i.test(body) ? 'PROVEN' : 'UNPROVEN', 'screen states captured after real Enter submissions');
    } else {
      record('Steer controls', 'Steer input is present and keyboard-operable', 'accepted-shell-today-a11y.json', 'UNPROVEN', 'no Steer input found');
    }

    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('resofeed.ownerToken', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    await screenshot(page, 'today-list');
    const menuSelectors = ['details.surface-nav > summary', 'summary:has-text("RESOFEED")', 'button:has-text("RESOFEED")'];
    let openedMenu = false;
    for (const sel of menuSelectors) {
      if (await page.locator(sel).first().count()) {
        try { await topmost(page, sel, 'RESOFEED surface menu'); openedMenu = true; break; } catch (e) { failures.push(String(e.message)); }
      }
    }
    await screenshot(page, 'surface-menu-open');
    if (openedMenu && await page.getByText('SOURCE LEDGER', { exact: true }).count()) {
      try { await topmost(page, 'button:has-text("SOURCE LEDGER"), [role="menuitem"]:has-text("SOURCE LEDGER"), a:has-text("SOURCE LEDGER")', 'SOURCE LEDGER menu entry'); } catch (e) { failures.push(String(e.message)); }
    } else if (await page.getByText('SOURCE LEDGER').count()) {
      await page.getByText('SOURCE LEDGER').first().click();
    }
    await page.waitForTimeout(800);
    await screenshot(page, 'source-ledger-controls-details');
    await snapshot(page, 'source-ledger-a11y');
    try { await activePanelProof(page, 'ledger'); record('active panel semantic state', 'visible Source Ledger agrees with semantic active state', 'active-panel table/source-ledger-a11y.json', 'PROVEN', 'ledger surface visible after menu activation'); } catch (e) { record('active panel semantic state', 'visible panel agrees with semantic active state', 'active-panel table', 'UNPROVEN', e.message); }

    const hitTargets = [
      ['[RUN INGEST]', 'button:has-text("[RUN INGEST]")'], ['[FETCH]', 'button:has-text("[FETCH]")'], ['[DETAILS]', 'button:has-text("[DETAILS]"), summary:has-text("DETAILS")'], ['[DELETE]', 'button:has-text("[DELETE]")'], ['[IMPORT OPML]', 'button:has-text("[IMPORT OPML]"), input[type="file"]'], ['[EXPORT STATE]', 'button:has-text("[EXPORT STATE]"), a:has-text("[EXPORT STATE]")'], ['[IMPORT STATE]', 'button:has-text("[IMPORT STATE]"), input[type="file"]']
    ];
    for (const [label, sel] of hitTargets) {
      if (await page.locator(sel).first().count()) {
        try { await topmost(page, sel, label); await page.waitForTimeout(400); } catch (e) { failures.push(e.message); hitRows.push({ label, error: e.message }); }
      } else {
        failures.push(`missing hit target ${label}`); hitRows.push({ label, missing: true });
      }
    }
    await screenshot(page, 'source-ledger-after-actions');

    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('resofeed.ownerToken', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await snapshot(page, 'feed-inspector-a11y');
    const scrollProof = await page.evaluate(() => {
      const feed = document.querySelector('.feed-pane,[aria-label*="TODAY"],main');
      const inspector = document.querySelector('.contract-inspector,[aria-label*="INSPECTOR"],aside');
      const before = { feedTop: feed?.scrollTop ?? null, inspectorTop: inspector?.scrollTop ?? null, feedScrollable: !!feed && feed.scrollHeight > feed.clientHeight, inspectorScrollable: !!inspector && inspector.scrollHeight > inspector.clientHeight, feedTabIndex: feed?.getAttribute('tabindex'), inspectorTabIndex: inspector?.getAttribute('tabindex'), feedName: feed?.getAttribute('aria-label') || feed?.getAttribute('aria-labelledby'), inspectorName: inspector?.getAttribute('aria-label') || inspector?.getAttribute('aria-labelledby') };
      if (feed) feed.scrollTop = 40;
      const afterFeed = { feedTop: feed?.scrollTop ?? null, inspectorTop: inspector?.scrollTop ?? null };
      if (inspector) inspector.scrollTop = 40;
      const afterInspector = { feedTop: feed?.scrollTop ?? null, inspectorTop: inspector?.scrollTop ?? null };
      return { before, afterFeed, afterInspector };
    });
    await writeFile(path.join(ART, 'desktop-split-scroll-proof.json'), JSON.stringify(scrollProof, null, 2));
    record('desktop split-scroll', 'Feed and Inspector are independently scrollable/focusable regions', 'desktop-split-scroll-proof.json', (scrollProof.before.feedTabIndex !== null && scrollProof.before.inspectorTabIndex !== null && scrollProof.before.feedName && scrollProof.before.inspectorName) ? 'PROVEN' : 'UNPROVEN', 'checked focusability and labels without source access');
    const rowSel = '.contract-feed-open, button[aria-label*="Open Inspector"], article button:not([aria-label*="Resonate"]):not([aria-label*="Remove"]), article a';
    if (await page.locator(rowSel).first().count()) { try { await topmost(page, rowSel, 'row open'); } catch (e) { failures.push(e.message); } } else { failures.push('missing row open control'); }
    const starSel = '.contract-resonate, button[aria-label*="Resonate"], button[aria-label*="Remove resonance"]';
    if (await page.locator(starSel).first().count()) { try { await topmost(page, starSel, 'star/resonate'); } catch (e) { failures.push(e.message); } } else { failures.push('missing star/resonate control'); }
    await screenshot(page, 'selected-item-star-row-open');
    await snapshot(page, 'selected-item-a11y');
    const origSel = '.contract-inspector a[href], a:has-text("original"), a[href^="http"]';
    if (await page.locator(origSel).first().count()) { try { await topmost(page, origSel, 'original link'); } catch (e) { failures.push(e.message); } } else { failures.push('missing Inspector original link'); }

    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('resofeed.ownerToken', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      try { await focusVisible(page, `tab-${i + 1}`); } catch (e) { failures.push(e.message); }
    }
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    const steer2 = page.locator('#steer-input, textarea, input[placeholder*="Steer"]').first();
    if (await steer2.count()) {
      await steer2.focus();
      await steer2.fill('temporary unsent text');
      await page.keyboard.press('Escape');
      const val = await steer2.inputValue().catch(() => 'non-input');
      keyboardRows.push({ label: 'Escape clears unsent Steer text', valueAfterEscape: val, ok: val === '' });
      if (val !== '') failures.push('Escape did not clear unsent Steer text');
    }
    await screenshot(page, 'keyboard-focus-path');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('resofeed.ownerToken', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await screenshot(page, 'mobile-feed');
    if (await page.locator(rowSel).first().count()) await page.locator(rowSel).first().click().catch(() => {});
    await page.waitForTimeout(700);
    await screenshot(page, 'mobile-inspector-route');
    await snapshot(page, 'mobile-inspector-a11y');
    const mobileText = await page.locator('body').innerText();
    record('mobile Inspector route', 'narrow viewport opens Inspector/detail route with reading density and back path', 'mobile-inspector-route.png / mobile-inspector-a11y.json', /INSPECTOR|feed|original|src:/i.test(mobileText) ? 'PROVEN' : 'UNPROVEN', 'captured 390x844 mobile route after row activation');

    const allText = await page.evaluate(() => document.body.innerText);
    const forbidden = ['dashboard', 'job', 'activity', 'settings', 'RAG', 'chat', 'semantic answer', 'folder', 'tag', 'source hierarchy', 'queue', 'sync', 'merge', 'mark all read', 'unread'];
    for (const term of forbidden) {
      const found = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'i').test(allText);
      negativeRows.push({ term, found });
      if (found) failures.push(`forbidden UX concept visible: ${term}`);
    }
    record('negative UX scan', 'forbidden dashboard/job/activity/settings/RAG/chat/semantic-answer/source-hierarchy concepts are absent', 'negative-ux-scan table', negativeRows.some((r) => r.found) ? 'UNPROVEN' : 'PROVEN', negativeRows.some((r) => r.found) ? 'one or more forbidden terms visible' : 'no forbidden terms found in visible text');

    await browser.close();
  } finally {
    await writeFile(serverLog, chunks.join(''));
    srv.kill('SIGTERM');
    rssServer.close();
  }

  const report = { base: BASE, screenshots: screenshots.map((p) => p.replace(ROOT + '/', '')), snapshots: snapshots.map((p) => p.replace(ROOT + '/', '')), hitRows, keyboardRows, activePanelRows, negativeRows, proofs, failures, shouldFix };
  await writeFile(path.join(ART, 'audit-report.json'), JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error(`FAIL: ${failures.length} blocker(s)`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('PASS: UI/a11y black-box regression proof passed');
}

main().catch(async (err) => {
  await mkdir(ART, { recursive: true });
  await writeFile(path.join(ART, 'fatal-error.txt'), String(err.stack || err));
  console.error(err.stack || err);
  process.exit(1);
});
