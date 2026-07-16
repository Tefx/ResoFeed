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

export const playwrightHarnessContract = {
  commands: {
    backendBuild: 'mkdir -p ./.test-artifacts/bin && go build -o ./.test-artifacts/bin/resofeed ./cmd/resofeed',
    realServerLaunch: './.test-artifacts/bin/resofeed serve --db "$TEST_DB" --owner-token "$RESOFEED_OWNER_TOKEN"',
    browserFallback: 'npm --prefix web exec playwright test -- --config web/playwright.config.ts',
    preferredBrowserScript: 'npm --prefix web run test:e2e',
    liveOpenRouterSmoke: 'npm --prefix web run test:e2e -- --grep @live-openrouter'
  },
  matrix: [
    'real-server-ui-boot', 'first-use-owner-token', 'source-feed-operations', 'manual-global-ingest',
    'per-source-fetch', 'today-feed', 'inspect-retrieve-search', 'llm-failure-mock', 'llm-live-smoke',
    'api-mcp-parity-probes', 'visual-ux-invariants'
  ] as const satisfies readonly HarnessFlowCategory[],
  forbiddenScope: ['accounts', 'sync-merge-machinery', 'sidecar-workers-or-queues', 'vector-db-or-rag', 'new-product-concepts', 'committed-llm-secrets'] as const,
  runClasses: ['ci-safe', 'live-openrouter'] as const,
  liveOpenRouterBoundary: [
    'runtime-env-or-local-env-only', 'deterministic-skip-when-openrouter-key-absent',
    'invalid-key-startup-failure-path', 'redacted-evidence-only', 'tagged-live-openrouter-separation'
  ] as const,
  evidence: {
    artifacts: ['trace-archive', 'screenshots', 'video-where-applicable', 'server-stdout-stderr', 'sqlite-db-fixture-path', 'sanitized-environment-notes'] as const,
    redactions: ['owner-token', 'authorization-header', 'openrouter-key'] as const
  }
} as const;

export const RF_BUG_010_IDENTITIES = [
  'RF-BUG-010 adapter-envelope',
  'RF-BUG-010 artifact-contract',
  'RF-BUG-010 harness-isolation',
  'RF-BUG-010 lane-discovery'
] as const;

export const RF_BUG_010_OLD_LANE = [
  'search-click-inspector-contract.expected-red.spec.ts',
  'mobile-inspector-token-hydration.spec.ts',
  'source-ledger-navigation-regression.expected-red.spec.ts'
] as const;

export const RF_BUG_010_REPLACEMENT_LANE = [
  'inspector-selection.browser-contract.spec.ts',
  'initial-route.browser-contract.spec.ts',
  'routes.browser-contract.spec.ts',
  'source-ledger-responsive.browser-contract.spec.ts',
  'source-ledger-delete.browser-contract.spec.ts'
] as const;

const SECRET_PATTERNS = [
  /rfeed_[A-Za-z0-9_-]+/gu,
  /sk-or-v1-[A-Za-z0-9_-]+/gu,
  /(authorization\s*[:=]\s*bearer\s+)[^\s"',}]+/giu,
  /(cookie\s*[:=]\s*)[^\n]+/giu,
  /((?:OPENROUTER_KEY|TAVILY_API_KEY)\s*=\s*)[^\s]+/gu,
  /(https?:\/\/)[^/\s:@]+:[^@\s/]+@/giu,
  /([?&](?:token|key|authorization|cookie)=)[^&#\s]+/giu
] as const;

export function redactHarnessEvidence(value: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, (_match, prefix?: string) => `${prefix ?? ''}<redacted>`), value);
}

export function hasExactLaneFiles(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}
