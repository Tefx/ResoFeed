import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from './fixtures';

test('ci-safe real server/UI boot uses the Go binary and owner-token gate', async ({ page, request, runInfo, ownerToken }) => {
  const unauthorized = await request.get(`${runInfo.baseURL}/api/feed/today`);
  expect(unauthorized.status()).toBe(401);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();
  await expect(page.locator('#owner-token-input')).toBeFocused();

  await page.locator('#owner-token-input').fill('wrong-token-with-at-least-thirty-two-chars');
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByText('err: owner token rejected')).toBeVisible();

  await page.locator('#owner-token-input').fill(ownerToken);
  await page.getByRole('button', { name: 'submit' }).click();
  await expect(page.getByRole('textbox', { name: 'Steer or paste RSS URL' })).toBeVisible();
  await expect(page.getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();
  await expect(page.getByText('Inspect opens the item.')).toBeVisible();
  await expect(page.getByText('Star preserves durable value.')).toBeVisible();
  await expect(page.getByText('Steer is optional correction.')).toBeVisible();
});

test('ci-safe harness records required artifact paths and sanitized runtime notes', async ({ runInfo }) => {
  expect(fs.existsSync(runInfo.binaryPath)).toBe(true);
  expect(fs.existsSync(runInfo.server.stdoutPath)).toBe(true);
  expect(fs.existsSync(runInfo.server.stderrPath)).toBe(true);
  expect(fs.existsSync(runInfo.sanitizedEnvironment.notesPath)).toBe(true);
  expect(fs.existsSync(path.join(runInfo.artifactRoot, 'fixtures', 'local-feed.xml'))).toBe(true);
  expect(fs.existsSync(path.join(runInfo.artifactRoot, 'fixtures', 'flattened.opml'))).toBe(true);
  expect(runInfo.sanitizedEnvironment.openRouterKey).toBe('ci-safe-fake-key');
});

test('ci-safe missing and invalid OPENROUTER_KEY startup paths exit before browser binding', async ({ runInfo }) => {
  const runtimeCwd = path.join(runInfo.artifactRoot, 'runtime-cwd-without-dotenv');
  fs.mkdirSync(runtimeCwd, { recursive: true });

  const commonArgs = [
    'serve',
    '--addr', '127.0.0.1:1',
    '--public-url', 'http://127.0.0.1:1',
    '--db', path.join(runInfo.artifactRoot, 'fixtures', 'missing-openrouter.sqlite3'),
    '--owner-token', runInfo.ownerToken
  ];

  const missing = spawnSync(runInfo.binaryPath, commonArgs, {
    cwd: runtimeCwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', RESOFEED_E2E: '1' },
    encoding: 'utf8'
  });
  expect(missing.status).toBe(2);
  expect(missing.stderr).toContain('invalid_openrouter_key: value required');
  expect(missing.stdout).not.toContain('serving ResoFeed on');

  const invalid = spawnSync(runInfo.binaryPath, commonArgs, {
    cwd: runtimeCwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', RESOFEED_E2E: '1', OPENROUTER_KEY: '   ' },
    encoding: 'utf8'
  });
  expect(invalid.status).toBe(2);
  expect(invalid.stderr).toContain('invalid_openrouter_key: value required');
  expect(invalid.stdout).not.toContain('serving ResoFeed on');
});

test('@live-openrouter live OpenRouter smoke is opt-in and skipped without runtime key', async ({ runInfo }) => {
  test.skip(!process.env.OPENROUTER_KEY?.trim(), 'OPENROUTER_KEY absent; live OpenRouter smoke skipped deterministically');
  expect(runInfo.sanitizedEnvironment.openRouterKey).toBe('live-redacted');
});
