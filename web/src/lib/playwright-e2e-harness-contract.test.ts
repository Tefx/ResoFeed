import { describe, expect, it } from 'vitest';

import { playwrightHarnessContract, type HarnessFlowCategory } from './playwright-e2e-harness-contract';

describe('comprehensive Playwright E2E harness contract lock', () => {
  it('pins the real binary launch and browser command contracts', () => {
    expect(playwrightHarnessContract.commands.backendBuild).toBe(
      'mkdir -p ./.test-artifacts/bin && go build -o ./.test-artifacts/bin/resofeed ./cmd/resofeed'
    );
    expect(playwrightHarnessContract.commands.realServerLaunch).toContain('./.test-artifacts/bin/resofeed serve');
    expect(playwrightHarnessContract.commands.realServerLaunch).toContain('--db "$TEST_DB"');
    expect(playwrightHarnessContract.commands.realServerLaunch).toContain('--owner-token "$RESOFEED_OWNER_TOKEN"');
    expect(playwrightHarnessContract.commands.browserFallback).toBe(
      'npm --prefix web exec playwright test -- --config web/playwright.config.ts'
    );
    expect(playwrightHarnessContract.commands.preferredBrowserScript).toBe('npm --prefix web run test:e2e');
  });

  it('lists every required E2E flow category without product expansion', () => {
    const required: readonly HarnessFlowCategory[] = [
      'real-server-ui-boot',
      'first-use-owner-token',
      'source-feed-operations',
      'manual-global-ingest',
      'per-source-fetch',
      'today-feed',
      'inspect-retrieve-search',
      'llm-failure-mock',
      'llm-live-smoke',
      'api-mcp-parity-probes',
      'visual-ux-invariants'
    ];

    expect(playwrightHarnessContract.matrix).toEqual(required);
    expect(playwrightHarnessContract.forbiddenScope).toEqual(
      expect.arrayContaining([
        'accounts',
        'sync-merge-machinery',
        'sidecar-workers-or-queues',
        'vector-db-or-rag',
        'new-product-concepts',
        'committed-llm-secrets'
      ])
    );
  });

  it('separates deterministic CI-safe tests from live OpenRouter smoke tests', () => {
    expect(playwrightHarnessContract.runClasses).toEqual(['ci-safe', 'live-openrouter']);
    expect(playwrightHarnessContract.commands.liveOpenRouterSmoke).toContain('--grep @live-openrouter');
    expect(playwrightHarnessContract.liveOpenRouterBoundary).toEqual(
      expect.arrayContaining([
        'runtime-env-or-local-env-only',
        'deterministic-skip-when-openrouter-key-absent',
        'invalid-key-startup-failure-path',
        'redacted-evidence-only',
        'tagged-live-openrouter-separation'
      ])
    );
  });

  it('requires trace, screenshot/video, server logs, DB path, and sanitized environment evidence', () => {
    expect(playwrightHarnessContract.evidence.artifacts).toEqual(
      expect.arrayContaining([
        'trace-archive',
        'screenshots',
        'video-where-applicable',
        'server-stdout-stderr',
        'sqlite-db-fixture-path',
        'sanitized-environment-notes'
      ])
    );
    expect(playwrightHarnessContract.evidence.redactions).toEqual(
      expect.arrayContaining(['owner-token', 'authorization-header', 'openrouter-key'])
    );
  });
});
