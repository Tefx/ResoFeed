import { Buffer } from 'node:buffer';
import type { APIRequestContext, Page } from 'playwright/test';

import { expect, test } from './fixtures';

const auth = (ownerToken: string) => ({ Authorization: `Bearer ${ownerToken}` });

async function setLanguage(request: APIRequestContext, baseURL: string, ownerToken: string, language: 'en' | 'zh'): Promise<void> {
  const response = await request.put(`${baseURL}/api/runtime/language`, {
    headers: { ...auth(ownerToken), 'Content-Type': 'application/json' },
    data: {
      language,
      actor_kind: 'human',
      actor_id: 'owner',
      idempotency_key: `rfbug002-route-language-${language}-${Date.now()}`
    }
  });
  expect(response.status()).toBe(200);
}

async function installFirstSurfaceProbe(page: Page, ownerToken: string): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('resofeed.ownerToken', token);
    const observed: Array<{ surface: string; title: string }> = [];
    Object.defineProperty(window, '__rfbug002FirstSurfaces', { value: observed, configurable: true });
    const record = () => {
      const shell = document.querySelector<HTMLElement>('main[data-surface]');
      if (!shell) return;
      const surface = shell.dataset.surface ?? '';
      const sample = { surface, title: document.title };
      const prior = observed.at(-1);
      if (!prior || prior.surface !== sample.surface || prior.title !== sample.title) observed.push(sample);
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true, attributes: true });
    document.addEventListener('DOMContentLoaded', record);
  }, ownerToken);
}

async function assertOpaqueColdLoadAndRefresh(page: Page, item: { id: string }): Promise<void> {
  const token = `~${Buffer.from(item.id, 'utf8').toString('base64url')}`;
  const route = `/items/${token}`;

  for (const transition of ['cold load', 'refresh'] as const) {
    if (transition === 'cold load') await page.goto(route);
    else await page.reload();

    await expect(page.getByRole('textbox', { name: /Steer or paste RSS URL|导向或粘贴 RSS URL/ })).toBeVisible();
    const samples = await page.evaluate(() => (window as typeof window & {
      __rfbug002FirstSurfaces: Array<{ surface: string; title: string }>;
    }).__rfbug002FirstSurfaces);
    expect(samples[0]?.surface, `Expected canonical opaque item surface before TODAY during ${transition}`).toBe('inspector');
    expect(samples.some((sample) => sample.surface === 'feed'), `Expected canonical opaque item surface before TODAY during ${transition}`).toBe(false);
    await expect(page).toHaveURL(new RegExp(`/items/${token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`));
    expect(await page.title(), 'Expected canonical opaque item surface before TODAY').toBe('RESOFEED · INSPECTOR');
  }
}

for (const language of ['en', 'zh'] as const) {
  test(`[RF-BUG-002][${language}] opaque item cold load and refresh`, async ({ page, request, runInfo, ownerToken }) => {
    await setLanguage(request, runInfo.baseURL, ownerToken, language);
    const item = { id: '项目/百分号%?query#fragment' };
    await installFirstSurfaceProbe(page, ownerToken);
    await assertOpaqueColdLoadAndRefresh(page, item);
  });
}
