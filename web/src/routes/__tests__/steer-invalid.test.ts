import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Page from '../+page.svelte';

const ownerToken = 'rfeed_rfbug007_steer_invalid_unit_owner_token_0000';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installAPI(language: 'en' | 'zh', previewFailure = false) {
  const mutationCalls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://resofeed.test');
    if (url.pathname === '/api/sources') return json({ sources: [] });
    if (url.pathname === '/api/feed/today') return json({ items: [] });
    if (url.pathname === '/api/runtime/language') return json({ language: { code: language, label: language === 'zh' ? '中文' : 'English' } });
    if (url.pathname === '/api/runtime/operation') return json({ operation: { running: false, kind: null, actor_kind: null, phase: null, count: null, message: null, started_at: null, updated_at: null } });
    if (url.pathname === '/api/runtime/openrouter-models' || url.pathname === '/api/runtime/openrouter/models') return json({ models: [] });
    if (url.pathname === '/api/steer/active') return json({ rules: [] });
    if (url.pathname === '/api/steer/preview') {
      if (previewFailure) return json({ error: { code: 'provider_unavailable', message: 'preview unavailable', details: {} } }, 503);
      return json({ preview: { route_kind: 'unknown', interpreted_as: 'source_command_missing_url', will_mutate: false, changed_rules: [], message: language === 'zh' ? '需要 URL' : 'URL required' } });
    }
    if (url.pathname === '/api/steer' && init?.method === 'POST') mutationCalls.push(url.pathname);
    return json({ error: { code: 'not_found', message: 'not found', details: {} } }, 404);
  }));
  return mutationCalls;
}

async function renderAccepted(language: 'en' | 'zh', previewFailure = false) {
  const mutationCalls = installAPI(language, previewFailure);
  render(Page);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner token'), ownerToken);
  await user.click(screen.getByRole('button', { name: '[SUBMIT]' }));
  const steer = await screen.findByRole('textbox', { name: /Steer or paste RSS URL|导向或粘贴 RSS URL/ });
  return { mutationCalls, steer, user };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('RF-BUG-007 Steer invalid-state accessibility', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`[${language}] exposes no missing-URL error while idle and clears the submitted error on edit`, async () => {
      const { mutationCalls, steer, user } = await renderAccepted(language);
      const localizedError = language === 'zh' ? /需要 URL/u : /URL required/i;
      expect(steer).not.toHaveAccessibleDescription(localizedError);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await user.type(steer, 'add source');
      await waitFor(() => expect(screen.getByText('[INVALID]')).toBeVisible());
      await user.click(screen.getByRole('button', { name: 'apply' }));
      const firstAlert = await screen.findByRole('alert');
      expect(firstAlert).toHaveTextContent(localizedError);
      expect(steer).toHaveValue('add source');
      expect(steer).toHaveFocus();
      expect(mutationCalls).toEqual([]);

      await user.type(steer, ' edited');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await user.clear(steer);
      await user.type(steer, 'add source');
      await user.click(screen.getByRole('button', { name: 'apply' }));
      const secondAlert = await screen.findByRole('alert');
      expect(secondAlert).not.toBe(firstAlert);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(steer).toHaveFocus();
      expect(mutationCalls).toEqual([]);
    });
  }

  it('keeps preview transport failure distinct from a missing-URL invalid state', async () => {
    const { steer, user } = await renderAccepted('en', true);
    await user.type(steer, 'add source');
    await waitFor(() => expect(screen.getByLabelText('Steer route preview')).toBeVisible());
    expect(steer).not.toHaveAccessibleDescription(/URL required/i);
    expect(screen.getByLabelText('Steer route preview')).not.toHaveTextContent('[INVALID]');
  });
});
