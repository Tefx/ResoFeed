export type HarnessFlowCategory =
  | 'real-server-ui-boot'
  | 'first-use-owner-token'
  | 'source-feed-operations'
  | 'manual-global-ingest'
  | 'per-source-fetch'
  | 'today-feed'
  | 'inspect-retrieve-search'
  | 'llm-failure-mock'
  | 'llm-live-smoke'
  | 'api-mcp-parity-probes'
  | 'visual-ux-invariants';

export type HarnessRunClass = 'ci-safe' | 'live-openrouter';

export interface PlaywrightHarnessCommandContract {
  readonly backendBuild: 'mkdir -p ./.test-artifacts/bin && go build -o ./.test-artifacts/bin/resofeed ./cmd/resofeed';
  readonly realServerLaunch: 'env -i PATH="$PATH" HOME="$HOME" RESOFEED_E2E=1 ./.test-artifacts/bin/resofeed serve --addr 127.0.0.1:0 --public-url http://127.0.0.1:0 --db "$TEST_DB" --owner-token "$RESOFEED_OWNER_TOKEN"';
  readonly browserFallback: 'npm --prefix web exec playwright test -- --config web/playwright.config.ts';
  readonly preferredBrowserScript: 'npm --prefix web run test:e2e';
  readonly liveOpenRouterSmoke: 'OPENROUTER_KEY="$OPENROUTER_KEY" npm --prefix web exec playwright test -- --config web/playwright.config.ts --grep @live-openrouter';
}

export interface PlaywrightHarnessEvidenceContract {
  readonly artifacts: readonly [
    'playwright-html-report',
    'machine-readable-results',
    'trace-archive',
    'screenshots',
    'video-where-applicable',
    'server-stdout-stderr',
    'sqlite-db-fixture-path',
    'sanitized-environment-notes',
    'launch-command-with-redactions',
    'browser-console-network-summaries'
  ];
  readonly redactions: readonly ['owner-token', 'authorization-header', 'openrouter-key', 'env-file-path-when-secret-bearing'];
}

export interface PlaywrightHarnessContract {
  readonly runClasses: readonly HarnessRunClass[];
  readonly matrix: readonly HarnessFlowCategory[];
  readonly commands: PlaywrightHarnessCommandContract;
  readonly evidence: PlaywrightHarnessEvidenceContract;
  readonly liveOpenRouterBoundary: readonly [
    'runtime-env-or-local-env-only',
    'deterministic-skip-when-openrouter-key-absent',
    'invalid-key-startup-failure-path',
    'redacted-evidence-only',
    'tagged-live-openrouter-separation'
  ];
  readonly forbiddenScope: readonly [
    'accounts',
    'sync-merge-machinery',
    'sidecar-workers-or-queues',
    'vector-db-or-rag',
    'new-product-concepts',
    'committed-llm-secrets'
  ];
}

export const playwrightHarnessContract: PlaywrightHarnessContract = {
  runClasses: ['ci-safe', 'live-openrouter'],
  matrix: [
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
  ],
  commands: {
    backendBuild: 'mkdir -p ./.test-artifacts/bin && go build -o ./.test-artifacts/bin/resofeed ./cmd/resofeed',
    realServerLaunch:
      'env -i PATH="$PATH" HOME="$HOME" RESOFEED_E2E=1 ./.test-artifacts/bin/resofeed serve --addr 127.0.0.1:0 --public-url http://127.0.0.1:0 --db "$TEST_DB" --owner-token "$RESOFEED_OWNER_TOKEN"',
    browserFallback: 'npm --prefix web exec playwright test -- --config web/playwright.config.ts',
    preferredBrowserScript: 'npm --prefix web run test:e2e',
    liveOpenRouterSmoke:
      'OPENROUTER_KEY="$OPENROUTER_KEY" npm --prefix web exec playwright test -- --config web/playwright.config.ts --grep @live-openrouter'
  },
  evidence: {
    artifacts: [
      'playwright-html-report',
      'machine-readable-results',
      'trace-archive',
      'screenshots',
      'video-where-applicable',
      'server-stdout-stderr',
      'sqlite-db-fixture-path',
      'sanitized-environment-notes',
      'launch-command-with-redactions',
      'browser-console-network-summaries'
    ],
    redactions: ['owner-token', 'authorization-header', 'openrouter-key', 'env-file-path-when-secret-bearing']
  },
  liveOpenRouterBoundary: [
    'runtime-env-or-local-env-only',
    'deterministic-skip-when-openrouter-key-absent',
    'invalid-key-startup-failure-path',
    'redacted-evidence-only',
    'tagged-live-openrouter-separation'
  ],
  forbiddenScope: [
    'accounts',
    'sync-merge-machinery',
    'sidecar-workers-or-queues',
    'vector-db-or-rag',
    'new-product-concepts',
    'committed-llm-secrets'
  ]
};
