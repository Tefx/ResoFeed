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
  readonly realServerLaunch: '.test-artifacts/bin/resofeed serve --addr 127.0.0.1:<reserved_port> --public-url <baseURL> --db <dbPath> --owner-token <E2E_OWNER_TOKEN>';
  readonly browserFallback: 'npm --prefix web exec playwright test -- --config web/playwright.config.ts';
  readonly preferredBrowserScript: 'npm --prefix web run test:e2e';
  readonly liveOpenRouterSmoke: 'OPENROUTER_KEY="$OPENROUTER_KEY" npm --prefix web exec playwright test -- --config web/playwright.config.ts --grep @live-openrouter';
}

export interface PlaywrightHarnessRuntimeProvenanceContract {
  readonly reservePort: 'reservePort()';
  readonly artifactRoot: '.test-artifacts/playwright';
  readonly binaryDir: '.test-artifacts/bin';
  readonly runInfoJson: '.test-artifacts/playwright/run-info.json';
  readonly baseURL: 'baseURL = http://127.0.0.1:<reserved_port>; exported as RESOFEED_E2E_BASE_URL';
  readonly dbPathPattern: '.test-artifacts/playwright/fixtures/resofeed-e2e-<Date.now()>-<process.pid>.sqlite3';
  readonly runInfoEnv: 'RESOFEED_E2E_RUN_INFO';
  readonly ownerTokenEnv: 'RESOFEED_E2E_OWNER_TOKEN';
  readonly runtimeEnvFactory: 'sanitizedRuntimeEnv(openRouterEndpoint)';
  readonly seededItem: 'deterministic fixture item from fixtureFeedXml/fixtureOpml, selected from runtime API or DB for re-ingest proof';
  readonly dbFtsBeforeAfterCapture: 'capture item row fields and search_fts row/match evidence before and after POST /api/items/<id>/reingest';
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
    'browser-console-network-summaries',
    'dom-snapshots',
    'aria-snapshots',
    'db-fts-before-after-captures'
  ];
  readonly redactions: readonly ['owner-token', 'authorization-header', 'openrouter-key', 'env-file-path-when-secret-bearing'];
  readonly artifactPaths: readonly [
    '.test-artifacts/playwright/server-logs/server.stdout.log',
    '.test-artifacts/playwright/server-logs/server.stderr.log',
    '.test-artifacts/playwright/server-logs/openrouter-stub.stdout.log',
    '.test-artifacts/playwright/server-logs/openrouter-stub.stderr.log',
    '.test-artifacts/playwright/server-logs/fixture-server.stdout.log',
    '.test-artifacts/playwright/server-logs/fixture-server.stderr.log',
    '.test-artifacts/playwright/sanitized-environment.md',
    '.test-artifacts/playwright/html-report',
    '.test-artifacts/playwright/results/results.json',
    '.test-artifacts/playwright/test-output/**/trace.zip',
    '.test-artifacts/playwright/test-output/**/*.png',
    '.test-artifacts/playwright/test-output/**/*.dom.html',
    '.test-artifacts/playwright/test-output/**/*.aria.txt'
  ];
  readonly redactLogFileBehavior: readonly [
    'replace E2E_OWNER_TOKEN with <redacted-owner-token>',
    'replace E2E_FAKE_OPENROUTER_KEY with <redacted-openrouter-key>',
    'replace live OPENROUTER_KEY with <redacted-openrouter-key>',
    'replace OPENROUTER_KEY=... with OPENROUTER_KEY=<redacted>',
    'replace Authorization bearer values with Authorization: Bearer <redacted>'
  ];
}

export interface PlaywrightHarnessContract {
  readonly runClasses: readonly HarnessRunClass[];
  readonly matrix: readonly HarnessFlowCategory[];
  readonly commands: PlaywrightHarnessCommandContract;
  readonly runtimeProvenance: PlaywrightHarnessRuntimeProvenanceContract;
  readonly evidence: PlaywrightHarnessEvidenceContract;
  readonly openRouterModes: {
    readonly ciSafeStub: readonly ['startOpenRouterStub', '/healthz', 'E2E_FAKE_OPENROUTER_KEY'];
    readonly live: readonly ['RESOFEED_E2E_LIVE_OPENROUTER=1', '@live-openrouter', '@llm-live', 'OPENROUTER_KEY'];
  };
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
      '.test-artifacts/bin/resofeed serve --addr 127.0.0.1:<reserved_port> --public-url <baseURL> --db <dbPath> --owner-token <E2E_OWNER_TOKEN>',
    browserFallback: 'npm --prefix web exec playwright test -- --config web/playwright.config.ts',
    preferredBrowserScript: 'npm --prefix web run test:e2e',
    liveOpenRouterSmoke:
      'OPENROUTER_KEY="$OPENROUTER_KEY" npm --prefix web exec playwright test -- --config web/playwright.config.ts --grep @live-openrouter'
  },
  runtimeProvenance: {
    reservePort: 'reservePort()',
    artifactRoot: '.test-artifacts/playwright',
    binaryDir: '.test-artifacts/bin',
    runInfoJson: '.test-artifacts/playwright/run-info.json',
    baseURL: 'baseURL = http://127.0.0.1:<reserved_port>; exported as RESOFEED_E2E_BASE_URL',
    dbPathPattern: '.test-artifacts/playwright/fixtures/resofeed-e2e-<Date.now()>-<process.pid>.sqlite3',
    runInfoEnv: 'RESOFEED_E2E_RUN_INFO',
    ownerTokenEnv: 'RESOFEED_E2E_OWNER_TOKEN',
    runtimeEnvFactory: 'sanitizedRuntimeEnv(openRouterEndpoint)',
    seededItem: 'deterministic fixture item from fixtureFeedXml/fixtureOpml, selected from runtime API or DB for re-ingest proof',
    dbFtsBeforeAfterCapture:
      'capture item row fields and search_fts row/match evidence before and after POST /api/items/<id>/reingest'
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
      'browser-console-network-summaries',
      'dom-snapshots',
      'aria-snapshots',
      'db-fts-before-after-captures'
    ],
    redactions: ['owner-token', 'authorization-header', 'openrouter-key', 'env-file-path-when-secret-bearing'],
    artifactPaths: [
      '.test-artifacts/playwright/server-logs/server.stdout.log',
      '.test-artifacts/playwright/server-logs/server.stderr.log',
      '.test-artifacts/playwright/server-logs/openrouter-stub.stdout.log',
      '.test-artifacts/playwright/server-logs/openrouter-stub.stderr.log',
      '.test-artifacts/playwright/server-logs/fixture-server.stdout.log',
      '.test-artifacts/playwright/server-logs/fixture-server.stderr.log',
      '.test-artifacts/playwright/sanitized-environment.md',
      '.test-artifacts/playwright/html-report',
      '.test-artifacts/playwright/results/results.json',
      '.test-artifacts/playwright/test-output/**/trace.zip',
      '.test-artifacts/playwright/test-output/**/*.png',
      '.test-artifacts/playwright/test-output/**/*.dom.html',
      '.test-artifacts/playwright/test-output/**/*.aria.txt'
    ],
    redactLogFileBehavior: [
      'replace E2E_OWNER_TOKEN with <redacted-owner-token>',
      'replace E2E_FAKE_OPENROUTER_KEY with <redacted-openrouter-key>',
      'replace live OPENROUTER_KEY with <redacted-openrouter-key>',
      'replace OPENROUTER_KEY=... with OPENROUTER_KEY=<redacted>',
      'replace Authorization bearer values with Authorization: Bearer <redacted>'
    ]
  },
  openRouterModes: {
    ciSafeStub: ['startOpenRouterStub', '/healthz', 'E2E_FAKE_OPENROUTER_KEY'],
    live: ['RESOFEED_E2E_LIVE_OPENROUTER=1', '@live-openrouter', '@llm-live', 'OPENROUTER_KEY']
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
