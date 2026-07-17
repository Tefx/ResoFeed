#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collect as collectPlaywrightReport, verifyIsolatedLane } from './rf-bug-010-standard-json.mjs';

const adapterPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(adapterPath), '..');

const foundationIdentities = [
  'RF-BUG-010 adapter-envelope',
  'RF-BUG-010 artifact-contract',
  'RF-BUG-010 harness-isolation',
  'RF-BUG-010 lane-discovery'
];

export const PENDING_PROFILE_PAIRS = [
  {
    suite: 'rf-bug-v2-frontend-runtime',
    checkID: 'rf_bug_v2_frontend_runtime_green',
    identities: [
      'RF-BUG-001 real API SQLite stale selection seam',
      'RF-BUG-002 stale Search ownership and recovery',
      'RF-BUG-006 route-correct pre-hydration title',
      'RF-BUG-007 EN/ZH idle and invalid alert'
    ],
    requiredOutput: [
      'initial HTML title is route-correct before hydration',
      'Search ignores stale completion and preserves latest selection',
      'RF-BUG-001_REAL_API_SQLITE_SEAM=ready',
      '[RF-BUG-007][zh] idle and invalid alert contract'
    ],
    commands: [
      ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/bugfix-frontend-behavior.expected-red.spec.ts', 'web/tests/e2e/routes.browser-contract.spec.ts', 'web/tests/e2e/inspector-selection.browser-contract.spec.ts']
    ]
  },
  {
    suite: 'rf-bug-v2-go-token-parity',
    checkID: 'rf_bug_v2_go_token_parity_green',
    identities: [
      'RF-BUG-002 canonical HTTP MCP parity',
      'RF-BUG-002 opaque item ID API paths 30'
    ],
    requiredOutput: [
      'RF_BUG_002_CANONICAL_HTTP_REJECTION=complete',
      'RF_BUG_002_API_SUBTESTS=30',
      'TestRFBUG002OpaqueItemIDAPIPaths',
      'TestRFBUG002CanonicalHTTPMCPParity',
      'TestOutboundE2EFixturePolicy',
      'TestOutboundHTTPURLPolicyRejectsUnsafeDestinations',
      'TestFetchPathsRejectLoopbackBeforeRequest',
      'TestPlaywrightFixtureContract',
      'PASS'
    ],
    runner: 'token-parity',
    commands: [
      {
        argv: ['go', 'test', '-tags', 'resofeed_e2e', '-v', './internal/resofeed', '-run', '^(TestRFBUG002OpaqueItemIDAPIPaths|TestRFBUG002CanonicalHTTPMCPParity)$', '-count=1'],
        env: { RESOFEED_E2E: '1' }
      }
    ]
  },
  {
    suite: 'rf-bug-v2-embed-ui',
    checkID: 'rf_bug_v2_embed_ui_green',
    identities: [
      'RF-BUG-003 Doctor redaction',
      'RF-BUG-003 binary arbitrary cwd',
      'RF-BUG-003 embedded UI contract'
    ],
    requiredOutput: [
      'RF-BUG-003_EXACT_SUBTEST_SET=23',
      'RF-BUG-003_BROWSER_SCRIPT_CLASSIFICATION_FIXTURES=complete',
      'RF-BUG-003_CSP_CRLF_NORMALIZED=chromium',
      'RF_BUG_003_BINARY_PROBES=3'
    ],
    commands: [
      ['go', 'test', '-v', './internal/resofeed', '-run', '^(TestRFBUG003EmbeddedUIContract|TestRFBUG003DoctorRedactionContract)$', '-count=1']
    ]
  },
  {
    suite: 'rf-bug-v2-opml',
    checkID: 'rf_bug_v2_opml_import_only_green',
    identities: ['RF-BUG-004 active document scan', 'RF-BUG-004 auth-first import-only contract'],
    requiredOutput: ['legacy_export_auth_precedence', 'import_and_JSON_State_remain_green', 'RF_BUG_CANONICAL_DOCUMENTS=9', 'OPML_EXCLUSIONS=2'],
    commands: [
      ['go', 'test', '-v', './internal/resofeed', '-run', '^TestRFBUG004OPMLImportOnlyContract$', '-count=1'],
      ['go', 'test', '-v', './tests', '-run', '^TestRFBugCanonicalContracts/OPMLActiveScan$', '-count=1'],
      ['npm', '--prefix', 'web', 'run', 'test:render', '--', 'src/lib/api-client.test.ts']
    ]
  },
  {
    suite: 'rf-bug-v2-runtime-review-remediation',
    checkID: 'rf_bug_v2_runtime_review_remediation_green',
    identities: [
      'RF-BUG-003 failed-source URL credential redaction',
      'RF-BUG-003/004 protected import-only regression',
      'RF-BUG-004 Go OPML export symbol absence'
    ],
    requiredOutput: [
      'RF_BUG_003_FAILED_SOURCE_URL_CREDENTIAL_REDACTION=complete',
      'RF_BUG_004_GO_OPML_EXPORT_SYMBOLS=absent',
      'legacy_export_auth_precedence',
      'import_and_JSON_State_remain_green',
      'RF_BUG_CANONICAL_DOCUMENTS=9',
      'OPML_EXCLUSIONS=2',
      'VECTL-ADAPTER pending-profile-discovery'
    ],
    commands: [
      ['node', '--test', 'scripts/vectl-check.test.mjs'],
      ['go', 'test', '-v', './internal/resofeed', '-run', '^(TestDoctorRedactsFailedSourceURLCredentials|TestRFBUG003DoctorRedactionContract|TestRFBUG004GoOPMLExportSymbolAbsence|TestRFBUG004OPMLImportOnlyContract)$', '-count=1'],
      ['go', 'test', '-v', './tests', '-run', '^TestRFBugCanonicalContracts$/^(README.md|docs)$/^(CONTAINER.md|DESIGN.md|PLAYWRIGHT_E2E_HARNESS_CONTRACT.md|PRD.md|PROMPTING_SYSTEM.md|USAGE.md|ui-preview.html)?$', '-count=1'],
      ['node', '-e', `const fs=require('node:fs'); const files=['README.md','docs/ARCHITECTURE.md','docs/CONTAINER.md','docs/DESIGN.md','docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md','docs/PRD.md','docs/PROMPTING_SYSTEM.md','docs/USAGE.md','docs/ui-preview.html']; const forbidden=['[EXPORT OPML]','### Export OPML','OPML import/export remains','OPML export/import remains','export the active Source Ledger as OPML']; for (const file of files) { const body=fs.readFileSync(file,'utf8'); for (const fragment of forbidden) { if (body.includes(fragment)) throw new Error(file+' retains prohibited OPML capability fragment '+fragment); } } const architecture=fs.readFileSync('docs/ARCHITECTURE.md','utf8'); if (!architecture.includes('GET /api/sources/export-opml') || !architecture.includes('is retired and is not a public capability')) throw new Error('architecture missing retired OPML export contract'); console.log('RF_BUG_OPML_ACTIVE_SCAN=complete');`]
    ]
  },
  {
    suite: 'rf-bug-v2-runtime-doc-contract',
    checkID: 'rf_bug_v2_runtime_doc_contract_green',
    identities: [
      'RF-BUG-003 canonical embedded Doctor contract',
      'RF-BUG-003/004/005 protected canonical scan',
      'RF-BUG-004 canonical import-only State contract',
      'RF-BUG-005 canonical CSP interaction contract'
    ],
    requiredOutput: [
      'RF_BUG_RUNTIME_DOC_ARCH_CSP_FRAGMENT=complete',
      'RF_BUG_RUNTIME_DOC_DESIGN_ATOMS=3',
      'RF_BUG_RUNTIME_DOC_DOCTOR_REDACTION=complete',
      'RF_BUG_RUNTIME_DOC_CSP_INTERACTIONS=complete',
      'RF_BUG_CANONICAL_DOCUMENTS=9',
      'OPML_EXCLUSIONS=2',
      'VECTL-ADAPTER pending-profile-discovery'
    ],
    runner: 'runtime-doc-contract'
  },
  {
    suite: 'rf-bug-v2-http-security',
    checkID: 'rf_bug_v2_http_security_green',
    identities: [
      'RF-BUG-005 Chromium CSP operations',
      'RF-BUG-005 exact security contract',
      'RF-BUG-005 local streaming cancellation'
    ],
    requiredOutput: [
      'RF-BUG-005_EXACT_SUBTEST_SET=13',
      'csp_exact_executable_hashes',
      'multi_flush_streaming',
      'request_cancellation',
      'CSP operations import and State export import download'
    ],
    commands: [
      ['go', 'test', '-v', './internal/resofeed', '-run', '^TestRFBUG005SecurityHeadersCSPStreamingCancellationContract$', '-count=1'],
      ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/csp-operations.browser-contract.spec.ts']
    ]
  },
  {
    suite: 'rf-bug-v2-adapter-runtime-isolation-remediation',
    checkID: 'rf_bug_v2_adapter_runtime_isolation_green',
    identities: [
      'RF-BUG-010 foundation smoke isolation',
      'RF-BUG-010 replacement runtime isolation'
    ],
    requiredOutput: [
      'RF-BUG-010_FOUNDATION_SMOKE=green',
      'RF-BUG-010_REPLACEMENT_SELECTED=29',
      'RF-BUG-010_REPLACEMENT_EXECUTED=29',
      'RF-BUG-010_REPLACEMENT_FILES_ISOLATED=5',
      'RF-BUG-010_OLD_SELECTED_EXECUTED=equal',
      'RF-BUG-010_RETRIES=0',
      'RF-BUG-010_SKIPS=0',
      'RF-BUG-010_CLEANUP=clean'
    ],
    runner: 'runtime-isolation'
  },
  {
    suite: 'rf-bug-v2-canonical-e2e-embedded-ui-build-remediation',
    checkID: 'rf_bug_v2_canonical_e2e_embedded_ui_build_green',
    identities: ['RF-BUG-010 canonical fresh embedded UI build'],
    requiredOutput: [
      'RF-BUG-010_CANONICAL_BUILD=green',
      'RF-BUG-010_PRODUCTION_TAGS=none',
      'RF-BUG-010_E2E_TAGS=resofeed_e2e',
      'RF-BUG-010_PACKAGE_LOCAL_ASSETS=fresh',
      'RF-BUG-010_STAGE_RESIDUE=0',
      'RF-BUG-010_SYNCED_WORKTREE=clean',
      'RF-BUG-010_PROTECTED_ACCEPTANCE=unchanged'
    ],
    runner: 'canonical-build'
  },
  {
    suite: 'rf-bug-v2-source-ledger',
    checkID: 'rf_bug_v2_source_ledger_green',
    identities: [
      'RF-BUG-004 State import lifecycle',
      'RF-BUG-008 delete focus',
      'RF-BUG-008 five viewport responsive',
      'RF-BUG-008 operations runtime',
      'RF-BUG-008 render states'
    ],
    requiredOutput: [
      'State import confirms before atomic replacement',
      'Source Ledger groups and controls render',
      '[RF-BUG-008][320x800] Source Ledger responsive contract',
      'RUN INGEST transitions',
      'delete success preserves saved items and moves focus'
    ],
    commands: [
      ['npm', '--prefix', 'web', 'run', 'test:render', '--', '--reporter=verbose', 'src/routes/components/__tests__/source-ledger-responsive.test.ts'],
      ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/source-ledger-responsive.browser-contract.spec.ts', 'web/tests/e2e/source-ledger-delete.browser-contract.spec.ts'],
      ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.runtime.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/source-ledger-operations.runtime.spec.ts']
    ]
  },
  {
    suite: 'rf-bug-v2-prompting',
    checkID: 'rf_bug_v2_prompting_green',
    identities: [
      'RF-BUG-009 active v2.1 absence',
      'RF-BUG-009 exact 16 subtests',
      'RF-BUG-009 focused path parity',
      'RF-BUG-009 regression and atomic preservation'
    ],
    requiredOutput: [
      'RF-BUG-009_EXACT_SUBTEST_SET=16',
      'single_semantic_repair_bound',
      'library_reprocess_path',
      'mcp_path',
      'PROMPTING_V21_ACTIVE_MATCHES=0'
    ],
    runner: 'prompting-v22',
    commands: [
      {
        argv: ['go', 'test', '-tags', 'resofeed_e2e', '-v', './internal/resofeed', '-run', '^TestRFBUG009PromptingV22Contract$', '-count=1'],
        env: { RESOFEED_E2E: '1' }
      },
      ['go', 'test', '-v', './internal/resofeed', '-run', '^(TestPromptingV22Payload|TestPromptingV22Validation|TestPromptingV22Repair|TestPromptingV22Persistence|TestIngestV22|TestReprocessV22|TestReingestV22|TestHTTPV22|TestMCPV22)$', '-count=1']
    ]
  },
  {
    suite: 'rf-bug-v2-prompting-harness',
    checkID: 'rf_bug_v2_prompting_harness_remediation_green',
    identities: [
      'RF-BUG-009 harness exact 16 subtests',
      'RF-BUG-009 harness exact argv and environment',
      'RF-BUG-009 harness exact four identities',
      'RF-BUG-009 harness production strict'
    ],
    requiredOutput: [
      'RF-BUG-009_EXACT_SUBTEST_SET=16',
      'PROMPTING_V21_ACTIVE_MATCHES=0',
      'TestOutboundE2EFixturePolicy',
      'TestOutboundHTTPURLPolicyRejectsUnsafeDestinations',
      'TestFetchPathsRejectLoopbackBeforeRequest',
      'TestPlaywrightFixtureContract',
      'PASS'
    ],
    runner: 'prompting-harness'
  },
  {
    suite: 'rf-bug-v2-closure-report',
    checkID: 'rf_bug_v2_defect_report_closure_green',
    identities: ['RF-BUG-001-010 active source scans', 'RF-BUG-001-010 closure contract'],
    requiredOutput: ['RF_BUG_CLOSURE_REQUIREMENTS=10', 'OPML_ACTIVE_DOCUMENTS=9', 'OPML_EXCLUSIONS=2', 'PROMPTING_V21_ACTIVE_MATCHES=0'],
    commands: [
      ['go', 'test', '-v', './tests', '-run', '^(TestRFBugCanonicalContracts/OPMLActiveScan|TestRFBugClosureContract)$', '-count=1']
    ]
  },
  {
    suite: 'item-deep-links-contract',
    checkID: 'item_deep_links_expected_red',
    identities: [
      'ITEM-DEEP-LINK app codec and API domain separation',
      'ITEM-DEEP-LINK browser history auth error read-only lifecycle',
      'ITEM-DEEP-LINK duplicate read envelope and MCP app_url'
    ],
    expectedOutcome: 'red',
    requiredOutput: ['IDL-BACKEND-READ-PROJECTION-GAP', 'IDL-FRONTEND-APP-HISTORY-GAP'],
    commands: [
      { argv: ['go', 'test', '-v', './internal/resofeed', '-run', 'ItemDeepLink', '-count=1'], expectedStatus: 1 },
      { argv: ['npm', '--prefix', 'web', 'run', 'test:render', '--', 'src/lib/__tests__/item-deep-links.expected-red.test.ts'], expectedStatus: 1 },
      { argv: ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/item-deep-links.browser-contract.spec.ts'], expectedStatus: 1 }
    ]
  },
  {
    suite: 'item-deep-links-backend',
    checkID: 'item_deep_links_backend_green',
    identities: ['ITEM-DEEP-LINK duplicate read envelope and MCP app_url'],
    requiredOutput: [
      'ITEM_DEEP_LINK_HTTP_CANONICAL=complete',
      'ITEM_DEEP_LINK_STATIC_DISPATCH=complete',
      'ITEM_DEEP_LINK_DUPLICATE_RESULT=complete',
      'ITEM_DEEP_LINK_MCP_APP_URL=complete',
      'ITEM_DEEP_LINK_PUBLIC_URL=complete',
      'ITEM_DEEP_LINK_READ_ONLY=complete'
    ],
    commands: [
      ['go', 'test', '-v', './internal/resofeed', './cmd/resofeed', '-run', 'ItemDeepLink|ItemRouteToken', '-count=1']
    ]
  },
  {
    suite: 'item-deep-links-frontend',
    checkID: 'item_deep_links_frontend_green',
    identities: [
      'ITEM-DEEP-LINK app codec and API domain separation',
      'ITEM-DEEP-LINK browser history auth error read-only lifecycle'
    ],
    requiredOutput: [
      'ITEM_DEEP_LINK_APP_CODEC=complete',
      'ITEM_DEEP_LINK_API_DOMAIN_SEPARATION=complete',
      'ITEM_DEEP_LINK_HISTORY=complete',
      'ITEM_DEEP_LINK_AUTH_RECOVERY=complete',
      'ITEM_DEEP_LINK_ERRORS=complete',
      'ITEM_DEEP_LINK_MUTATION_TARGET=complete',
      'ITEM_DEEP_LINK_BROWSER_MATRIX=complete'
    ],
    commands: [
      ['npm', '--prefix', 'web', 'run', 'test:render', '--', 'src/lib/__tests__/item-deep-links.expected-red.test.ts', 'src/lib/api-client.test.ts', 'src/lib/__tests__/workbench-route.test.ts', 'src/routes/components/__tests__/item-deep-links.test.ts'],
      ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/item-deep-links.browser-contract.spec.ts']
    ]
  }
];

const genericAdapterIdentities = [
  'VECTL-ADAPTER completed-harness-regression',
  'VECTL-ADAPTER pending-profile-discovery',
  'VECTL-ADAPTER protected-scope',
  'VECTL-ADAPTER run-envelope-parity',
  'VECTL-ADAPTER unknown-pair-fail-closed'
];

const profileRows = [
  {
    suite: 'rf-bug-v2-harness-foundation',
    checkID: 'rf_bug_v2_harness_foundation_green',
    identities: foundationIdentities,
    runner: 'foundation'
  },
  {
    suite: 'rf-bug-v2-generic-adapter',
    checkID: 'rf_bug_v2_generic_adapter_green',
    identities: genericAdapterIdentities,
    runner: 'generic-adapter'
  },
  ...PENDING_PROFILE_PAIRS.map((profile) => ({
    expectedOutcome: 'green',
    runner: 'native',
    ...profile
  }))
];

function profileKey(suite, checkID) {
  return `${suite}\u0000${checkID}`;
}

export const PROFILES = new Map(profileRows.map((profile) => {
  const frozen = Object.freeze({
    expectedOutcome: 'green',
    commands: [],
    requiredOutput: [],
    ...profile,
    identities: Object.freeze([...profile.identities])
  });
  return [profileKey(frozen.suite, frozen.checkID), frozen];
}));

export function selectionDigest(selectedIDs) {
  return `sha256:${createHash('sha256').update(JSON.stringify({ identities: selectedIDs })).digest('hex')}`;
}

export function selectionEnvelope(profile) {
  return {
    schema_version: 'vectl.check.selection.v1',
    check_id: profile.checkID,
    identities: [...profile.identities],
    digest: selectionDigest(profile.identities)
  };
}

export function evidenceEnvelope({ profile, outcome, exitCode, observations = [], artifacts = [] }) {
  return {
    schema_version: 'vectl.check.evidence.v1',
    check_id: profile.checkID,
    selected_ids: [...profile.identities],
    executed_ids: [...profile.identities],
    outcome,
    exit_code: exitCode,
    observations,
    artifacts
  };
}

function parseJSONEnvelope(output, schemaVersion) {
  const candidates = String(output).split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value?.schema_version === schemaVersion ? [value] : [];
    } catch {
      return [];
    }
  });
  if (candidates.length !== 1) throw new Error(`expected one ${schemaVersion} envelope`);
  return candidates[0];
}

function sameIDs(actual, expected) {
  return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
}

export function parseSelectionOutput(output, profile) {
  const envelope = parseJSONEnvelope(output, 'vectl.check.selection.v1');
  if (
    envelope.check_id !== profile.checkID
    || !sameIDs(envelope.identities, profile.identities)
    || envelope.digest !== selectionDigest(profile.identities)
  ) {
    throw new Error('selection envelope did not match the requested profile');
  }
  return envelope;
}

export function parseEvidenceOutput(output, profile, expectedOutcome = profile.expectedOutcome) {
  const envelope = parseJSONEnvelope(output, 'vectl.check.evidence.v1');
  const expectedExitCode = expectedOutcome === 'green' ? 0 : 1;
  if (
    envelope.check_id !== profile.checkID
    || !sameIDs(envelope.selected_ids, profile.identities)
    || !sameIDs(envelope.executed_ids, profile.identities)
    || envelope.outcome !== expectedOutcome
    || envelope.exit_code !== expectedExitCode
    || !Array.isArray(envelope.observations)
    || !envelope.observations.every((value) => typeof value === 'string')
    || !Array.isArray(envelope.artifacts)
  ) {
    throw new Error('evidence envelope did not match the requested profile');
  }
  for (const artifact of envelope.artifacts) {
    if (
      !artifact
      || typeof artifact.path !== 'string'
      || path.isAbsolute(artifact.path)
      || artifact.path === '..'
      || artifact.path.startsWith('../')
      || !/^sha256:[a-f0-9]{64}$/u.test(artifact.sha256)
    ) {
      throw new Error('evidence envelope contained an invalid artifact');
    }
  }
  return envelope;
}

function redact(value) {
  return String(value)
    .replace(/rfeed_[A-Za-z0-9_-]+/gu, '<redacted-owner-token>')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gu, '<redacted-openrouter-key>')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"',}]+/giu, '$1<redacted>')
    .replace(/(cookie\s*[:=]\s*)[^\n]+/giu, '$1<redacted>')
    .replace(/((?:OPENROUTER_KEY|TAVILY_API_KEY)\s*=\s*)[^\s]+/gu, '$1<redacted>');
}

class AdapterFailure extends Error {
  constructor(message, observations = []) {
    super(message);
    this.observations = observations;
  }
}

function artifactDigest(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function collectArtifactRows(roots) {
  const files = [];
  function visit(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  for (const root of roots) visit(root);
  if (files.length === 0) throw new AdapterFailure('generic evidence retained no artifact files');
  return files.map((filePath) => {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
      throw new AdapterFailure('generic evidence artifact escaped the repository');
    }
    return { path: relativePath, sha256: artifactDigest(filePath) };
  });
}

export function childEnvironment(overrides = {}) {
  const environment = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    CI: '1',
    NO_COLOR: '1',
    RESOFEED_E2E_LIVE_OPENROUTER: ''
  };
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null || value === undefined) delete environment[name];
    else environment[name] = value;
  }
  return environment;
}

function execute(profile, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: options.timeout ?? 900_000,
    env: childEnvironment(options.env)
  });
  if (result.error || result.status !== (options.expectedStatus ?? 0)) {
    const detail = redact(`${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`).slice(-6000);
    throw new AdapterFailure(`${command} execution did not satisfy the ${profile.suite}/${profile.checkID} process outcome`, [detail]);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function ensureNoProtectedMutation() {
  const protectedPaths = [
    'web/playwright.artifact-proof.config.ts',
    'web/tests/e2e/bugfix-ledger-e2e.expected-red.spec.ts',
    'web/tests/e2e/harness-artifact.intentional-failure.spec.ts',
    'web/tests/e2e/initial-route.browser-contract.spec.ts',
    'web/tests/e2e/inspector-selection.browser-contract.spec.ts',
    'web/tests/e2e/routes.browser-contract.spec.ts',
    'web/tests/e2e/source-ledger-delete.browser-contract.spec.ts',
    'web/tests/e2e/source-ledger-responsive.browser-contract.spec.ts'
  ];
  const changed = spawnSync('git', ['status', '--porcelain=v1', '--', ...protectedPaths], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnvironment()
  });
  if (changed.status !== 0 || changed.stdout.trim()) throw new AdapterFailure('protected acceptance baseline changed');
}

function ensureRuntimeDocProtectedBaseline() {
  const protectedPaths = [
    'docs/BUG_FIX_PLAN_2026-07-12.md',
    'docs/BUG_REPORT_2026-07-11.md',
    'tests/rf_bug_canonical_contract_test.go'
  ];
  const changed = spawnSync('git', ['status', '--porcelain=v1', '--', ...protectedPaths], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnvironment()
  });
  if (changed.status !== 0 || changed.stdout.trim()) {
    throw new AdapterFailure('runtime documentation protected baseline changed');
  }
}

function collectAttachments(report) {
  const attachments = [];
  function visitSuite(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          for (const attachment of result.attachments ?? []) attachments.push({ ...attachment, status: result.status });
        }
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child);
  }
  for (const suite of report.suites ?? []) visitSuite(suite);
  return attachments;
}

function verifyArtifactProof(artifactRoot, artifactOutput) {
  for (const marker of ['RF-BUG-010_SETUP=ready', 'RF-BUG-010_ASSERTION_REACHED=ready', 'RF-BUG-010_TEARDOWN=clean']) {
    if (!artifactOutput.includes(marker)) throw new AdapterFailure(`artifact proof did not emit ${marker}`);
  }

  const htmlPath = path.join(artifactRoot, 'html-report', 'index.html');
  const resultPath = path.join(artifactRoot, 'results', 'results.json');
  for (const requiredPath of [htmlPath, resultPath]) {
    if (!fs.existsSync(requiredPath)) throw new AdapterFailure(`artifact proof did not retain ${path.relative(repoRoot, requiredPath)}`);
  }

  const attachments = collectAttachments(JSON.parse(fs.readFileSync(resultPath, 'utf8')));
  const requiredNames = ['screenshot', 'video', 'trace', 'server.stdout.log', 'server.stderr.log', 'browser-diagnostics.log', 'runtime-cleanup.txt'];
  for (const name of requiredNames) {
    const attachment = attachments.find((candidate) => candidate.name === name && candidate.path);
    if (!attachment || !fs.existsSync(attachment.path)) throw new AdapterFailure(`artifact proof did not retain ${name}`);
  }

  for (const name of ['server.stdout.log', 'server.stderr.log', 'browser-diagnostics.log', 'runtime-cleanup.txt']) {
    const attachment = attachments.find((candidate) => candidate.name === name && candidate.path);
    const raw = fs.readFileSync(attachment.path, 'utf8');
    if (redact(raw) !== raw) throw new AdapterFailure(`artifact proof retained secret-bearing ${name}`);
  }
  const cleanup = fs.readFileSync(attachments.find((candidate) => candidate.name === 'runtime-cleanup.txt').path, 'utf8');
  for (const marker of ['process=stopped', 'port=closed', 'database_residue=0', 'cleanup=clean']) {
    if (!cleanup.includes(marker)) throw new AdapterFailure(`artifact proof cleanup did not record ${marker}`);
  }
}

const replacementLaneFiles = [
  'web/tests/e2e/inspector-selection.browser-contract.spec.ts',
  'web/tests/e2e/initial-route.browser-contract.spec.ts',
  'web/tests/e2e/routes.browser-contract.spec.ts',
  'web/tests/e2e/source-ledger-responsive.browser-contract.spec.ts',
  'web/tests/e2e/source-ledger-delete.browser-contract.spec.ts'
];

const oldLaneFiles = [
  'web/tests/e2e/search-click-inspector-contract.expected-red.spec.ts',
  'web/tests/e2e/mobile-inspector-token-hydration.spec.ts',
  'web/tests/e2e/source-ledger-navigation-regression.expected-red.spec.ts'
];

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopOwnedProcess(pid) {
  if (!processIsAlive(pid)) return true;
  try { process.kill(pid, 'SIGTERM'); } catch { return true; }
  for (let attempt = 0; attempt < 50 && processIsAlive(pid); attempt += 1) sleep(100);
  if (processIsAlive(pid)) {
    try { process.kill(pid, 'SIGKILL'); } catch { return true; }
    for (let attempt = 0; attempt < 20 && processIsAlive(pid); attempt += 1) sleep(100);
  }
  return !processIsAlive(pid);
}

function portIsClosed(port) {
  if (!Number.isInteger(port) || port <= 0) return true;
  const probe = String.raw`
const net = require('node:net');
const socket = net.createConnection({host: '127.0.0.1', port: Number(process.argv[1])});
socket.once('connect', () => { socket.destroy(); process.exit(1); });
socket.once('error', () => process.exit(0));
socket.setTimeout(500, () => { socket.destroy(); process.exit(0); });`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(process.execPath, ['-e', probe, String(port)], { env: childEnvironment(), encoding: 'utf8' });
    if (result.status === 0) return true;
    sleep(100);
  }
  return false;
}

function urlPort(value) {
  try { return Number(new URL(value).port); } catch { return 0; }
}

function copyRedactedArtifact(source, destination) {
  if (!source || !fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, redact(fs.readFileSync(source, 'utf8')));
  const body = fs.readFileSync(destination, 'utf8');
  if (redact(body) !== body) throw new AdapterFailure(`secret-bearing artifact remained at ${path.relative(repoRoot, destination)}`);
}

function cleanupGlobalRuntime(invocationRoot) {
  const playwrightRoot = path.join(repoRoot, '.test-artifacts', 'playwright');
  const runInfoPath = path.join(playwrightRoot, 'run-info.json');
  if (!fs.existsSync(runInfoPath)) throw new AdapterFailure('runtime invocation did not retain run-info.json for cleanup');
  const info = JSON.parse(fs.readFileSync(runInfoPath, 'utf8'));
  const processes = [info.server, info.fixtureServer, info.openRouterStub].filter(Boolean);
  const stopped = processes.every((entry) => stopOwnedProcess(entry.pid));
  const ports = [urlPort(info.baseURL), urlPort(info.fixtureServer?.url), urlPort(info.openRouterStub?.endpoint)].filter(Boolean);
  const closed = ports.every(portIsClosed);
  const databaseCandidates = ['', '-shm', '-wal'].map((suffix) => `${info.dbPath}${suffix}`);
  for (const candidate of databaseCandidates) fs.rmSync(candidate, { force: true });
  const residue = databaseCandidates.filter((candidate) => fs.existsSync(candidate));

  for (const [name, source] of [
    ['server.stdout.log', info.server?.stdoutPath],
    ['server.stderr.log', info.server?.stderrPath],
    ['fixture-server.stdout.log', info.fixtureServer?.stdoutPath],
    ['fixture-server.stderr.log', info.fixtureServer?.stderrPath],
    ['openrouter-stub.stdout.log', info.openRouterStub?.stdoutPath],
    ['openrouter-stub.stderr.log', info.openRouterStub?.stderrPath],
    ['sanitized-environment.md', info.sanitizedEnvironment?.notesPath]
  ]) copyRedactedArtifact(source, path.join(invocationRoot, name));

  const clean = stopped && closed && residue.length === 0;
  fs.writeFileSync(path.join(invocationRoot, 'runtime-cleanup.txt'), [
    `process=${stopped ? 'stopped' : 'active'}`,
    `port=${closed ? 'closed' : 'open'}`,
    `database_residue=${residue.length}`,
    `cleanup=${clean ? 'clean' : 'residue'}`,
    ''
  ].join('\n'));
  for (const transient of ['run-info.json', 'fixtures', 'server-logs', 'sanitized-environment.md', 'fixture-feed-server.mjs', 'db-fixture-preservation.txt']) {
    fs.rmSync(path.join(playwrightRoot, transient), { recursive: true, force: true });
  }
  if (!clean) throw new AdapterFailure('leaked resource after Playwright invocation');
}

function runPlaywrightFile(profile, file, reportPath, invocationRoot) {
  let output = '';
  let failure;
  try {
    output = execute(profile, 'npm', [
      '--prefix', 'web', 'exec', '--', 'playwright', 'test',
      '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe',
      '--retries=0', '--reporter=line,json,html', '--output', path.join(invocationRoot, 'test-output'), file
    ], {
      timeout: 600_000,
      env: {
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(invocationRoot, 'html-report'),
        PLAYWRIGHT_HTML_OPEN: 'never'
      }
    });
  } catch (error) {
    failure = error;
  }
  try {
    cleanupGlobalRuntime(invocationRoot);
  } catch (cleanupError) {
    failure = cleanupError;
  }
  if (failure) throw failure;
  return output;
}

function discoverLane(profile, laneRoot, label, files) {
  const listPath = path.join(laneRoot, `${label}-list.json`);
  execute(profile, 'npm', [
    '--prefix', 'web', 'exec', '--', 'playwright', 'test',
    '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe',
    '--retries=0', '--reporter=json', '--list', ...files
  ], { timeout: 300_000, env: { PLAYWRIGHT_JSON_OUTPUT_NAME: listPath } });
  return { listPath, report: JSON.parse(fs.readFileSync(listPath, 'utf8')) };
}

function executeIsolatedLane(profile, laneRoot, label, files, expectedCount) {
  const discovery = discoverLane(profile, laneRoot, label, files);
  const runReports = [];
  files.forEach((file, index) => {
    const invocationRoot = path.join(laneRoot, `${label}-${index + 1}-${path.basename(file, '.spec.ts')}`);
    fs.mkdirSync(invocationRoot, { recursive: true });
    const reportPath = path.join(invocationRoot, 'results.json');
    runPlaywrightFile(profile, file, reportPath, invocationRoot);
    runReports.push(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
  });
  return verifyIsolatedLane({ listedReport: discovery.report, runReports, expectedFiles: files, expectedCount });
}

function runRuntimeIsolation(profile) {
  ensureNoProtectedMutation();
  execute(profile, 'node', ['--test', '--test-name-pattern=RF-BUG-010 runtime isolation adapter contract', 'scripts/vectl-check.test.mjs'], { timeout: 240_000 });
  execute(profile, 'npm', ['--prefix', 'web', 'run', 'test:render', '--', 'src/lib/__tests__/playwright-e2e-harness-contract.test.ts'], { timeout: 180_000 });

  const foundation = runFoundation(profile);
  const laneRoot = path.join(repoRoot, '.test-artifacts', 'vectl', 'rf-bug-010-runtime-isolation');
  fs.rmSync(laneRoot, { recursive: true, force: true });
  fs.mkdirSync(laneRoot, { recursive: true });
  const replacement = executeIsolatedLane(profile, laneRoot, 'replacement', replacementLaneFiles, 29);
  const oldDiscovery = discoverLane(profile, laneRoot, 'old', oldLaneFiles);
  const oldCount = collectPlaywrightReport(oldDiscovery.report).identities.length;
  const old = executeIsolatedLane(profile, laneRoot, 'old-execution', oldLaneFiles, oldCount);
  const laneResults = { replacement, old };
  ensureNoProtectedMutation();

  const artifacts = [...foundation.artifacts, ...collectArtifactRows([laneRoot])];
  return {
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts
  };
}

function treeDigest(root) {
  const hash = createHash('sha256');
  const files = [];
  function visit(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  visit(root);
  for (const filePath of files) {
    hash.update(path.relative(root, filePath).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function runCanonicalBuild(profile) {
  ensureNoProtectedMutation();
  execute(profile, 'node', [
    '--test', '--test-name-pattern=RF-BUG-010 canonical fresh embedded UI build',
    'scripts/vectl-check.test.mjs'
  ], { timeout: 240_000 });

  const packageUI = path.join(repoRoot, 'internal', 'resofeed', 'webui');
  const builtUI = path.join(repoRoot, 'web', 'build');
  const packageDir = path.dirname(packageUI);
  const before = treeDigest(packageUI);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'resofeed-canonical-build-'));
  const productionBinary = path.join(scratch, 'resofeed-production');
  const e2eBinary = path.join(scratch, 'resofeed-e2e');
  try {
    execute(profile, 'scripts/build-resofeed.sh', [productionBinary], { timeout: 600_000 });
    const afterProduction = treeDigest(packageUI);
    if (afterProduction !== before) throw new AdapterFailure('canonical production build changed synchronized package-local assets');
    if (treeDigest(builtUI) !== afterProduction) throw new AdapterFailure('canonical production build did not package the fresh frontend output');

    execute(profile, 'scripts/build-resofeed.sh', ['--e2e', e2eBinary], { timeout: 600_000 });
    if (treeDigest(packageUI) !== afterProduction || treeDigest(builtUI) !== afterProduction) {
      throw new AdapterFailure('canonical E2E build diverged from production frontend assets');
    }

    const productionMetadata = execute(profile, 'go', ['version', '-m', productionBinary], { timeout: 30_000 });
    const e2eMetadata = execute(profile, 'go', ['version', '-m', e2eBinary], { timeout: 30_000 });
    if (/(?:^|\s)-tags(?:=|\s)/mu.test(productionMetadata)) throw new AdapterFailure('production binary unexpectedly contains Go build tags');
    if (!/(?:^|\s)-tags=resofeed_e2e(?:\s|$)/mu.test(e2eMetadata)) throw new AdapterFailure('E2E binary missed the exact resofeed_e2e Go build tag');

    const residue = fs.readdirSync(packageDir).filter((name) => name.startsWith('.webui-stage.'));
    if (residue.length > 0) throw new AdapterFailure('canonical build left package-local stage residue', residue);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  ensureNoProtectedMutation();
  return {
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  };
}

function runFoundation(profile) {
  ensureNoProtectedMutation();
  const artifactRoot = path.join(repoRoot, '.test-artifacts', 'playwright', 'rf-bug-010-artifact-proof');
  const smokeRoot = path.join(repoRoot, '.test-artifacts', 'playwright', 'smoke');
  const runtimeRoot = path.join(repoRoot, '.test-artifacts', 'playwright', 'runtime');
  const laneRoot = path.join(repoRoot, '.test-artifacts', 'playwright', 'lane-discovery');

  execute(profile, 'go', ['test', './internal/resofeed', '-run', '^TestPlaywrightFixtureContract$', '-count=1'], { timeout: 180_000 });
  execute(profile, 'npm', ['--prefix', 'web', 'run', 'test:render', '--', 'src/lib/__tests__/playwright-e2e-harness-contract.test.ts'], { timeout: 180_000 });

  fs.rmSync(artifactRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(artifactRoot, 'results'), { recursive: true });
  const artifactOutput = execute(profile, 'npm', [
    '--prefix', 'web', 'exec', '--', 'playwright', 'test',
    '--config', 'web/playwright.smoke.config.ts',
    '--project=chromium-ci-safe', '--retries=0', '--reporter=line,json,html',
    '--output', path.join(artifactRoot, 'test-output'),
    'web/tests/e2e/smoke.spec.ts'
  ], {
    expectedStatus: 1,
    timeout: 300_000,
    env: {
      RESOFEED_E2E_ARTIFACT_PROOF: '1',
      PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(artifactRoot, 'results', 'results.json'),
      PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(artifactRoot, 'html-report'),
      PLAYWRIGHT_HTML_OPEN: 'never'
    }
  });
  verifyArtifactProof(artifactRoot, artifactOutput);

  for (const isolatedRoot of [smokeRoot, runtimeRoot]) fs.rmSync(isolatedRoot, { recursive: true, force: true });
  execute(profile, 'npm', ['--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.smoke.config.ts', '--project=chromium-ci-safe', '--retries=0'], { timeout: 180_000 });
  execute(profile, 'npm', ['--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.runtime.config.ts', '--project=chromium-ci-safe', '--retries=0'], { timeout: 240_000 });
  for (const isolatedRoot of [smokeRoot, runtimeRoot]) {
    const cleanupFiles = [];
    const visit = (currentPath) => {
      for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else if (entry.name === 'runtime-cleanup.txt') cleanupFiles.push(entryPath);
      }
    };
    visit(isolatedRoot);
    if (cleanupFiles.length === 0) throw new AdapterFailure(`foundation lifecycle missed cleanup evidence in ${path.relative(repoRoot, isolatedRoot)}`);
    for (const cleanupFile of cleanupFiles) {
      const cleanup = fs.readFileSync(cleanupFile, 'utf8');
      for (const marker of ['process=stopped', 'port=closed', 'database_residue=0', 'cleanup=clean']) {
        if (!cleanup.includes(marker)) throw new AdapterFailure(`foundation lifecycle cleanup missed ${marker}`);
      }
    }
  }

  fs.rmSync(laneRoot, { recursive: true, force: true });
  fs.mkdirSync(laneRoot, { recursive: true });
  const lanes = [
    { label: 'OLD', files: oldLaneFiles },
    { label: 'REPLACEMENT', files: replacementLaneFiles }
  ];
  const laneMarkers = [];
  for (const lane of lanes) {
    const listPath = path.join(laneRoot, `${lane.label.toLowerCase()}-list.json`);
    execute(profile, 'npm', [
      '--prefix', 'web', 'exec', '--', 'playwright', 'test',
      '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe',
      '--retries=0', '--reporter=json', '--list', ...lane.files
    ], { timeout: 300_000, env: { PLAYWRIGHT_JSON_OUTPUT_NAME: listPath } });
    const discovery = execute(profile, 'node', [
      'scripts/rf-bug-010-standard-json.mjs', 'discover', listPath,
      `RF-BUG-010_${lane.label}`, ...lane.files
    ], { timeout: 30_000 });
    laneMarkers.push(...discovery.split('\n').filter((line) => line.startsWith(`RF-BUG-010_${lane.label}_`)));
  }

  const artifactRows = collectArtifactRows([artifactRoot, smokeRoot, runtimeRoot, laneRoot]);
  return {
    outcome: 'green',
    exitCode: 0,
    observations: ['RF-BUG-010_SETUP=ready', 'RF-BUG-010_TEARDOWN=clean', ...laneMarkers, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: artifactRows
  };
}

function runGenericAdapter(profile) {
  ensureNoProtectedMutation();
  execute(profile, 'node', ['--test', 'scripts/vectl-check.test.mjs'], { timeout: 240_000 });
  execute(profile, 'go', ['test', './internal/resofeed', '-run', '^TestPlaywrightFixtureContract$', '-count=1'], { timeout: 180_000 });
  return {
    outcome: 'green',
    exitCode: 0,
    observations: [
      `VECTL_ADAPTER_PENDING_PROFILE_COUNT=${PENDING_PROFILE_PAIRS.length}`,
      'VECTL_ADAPTER_SELECTION_ENVELOPES=valid',
      'VECTL_ADAPTER_EVIDENCE_ENVELOPES=valid',
      'VECTL_ADAPTER_IDENTITY_PARITY=valid',
      'VECTL_ADAPTER_UNKNOWN_PAIR=refused',
      'VECTL_ADAPTER_COMPLETED_HARNESS=preserved',
      'VECTL_ADAPTER_ARTIFACT_OBJECT_COMPATIBILITY=valid',
      'VECTL_ADAPTER_PROTECTED_SCOPE=clean',
      'VECTL_GENERIC_EVIDENCE=valid'
    ],
    artifacts: []
  };
}

function runRuntimeDocContract(profile) {
  ensureRuntimeDocProtectedBaseline();

  const architecture = fs.readFileSync(path.join(repoRoot, 'docs', 'ARCHITECTURE.md'), 'utf8');
  const architectureFragment = 'one effective `Content-Security-Policy`';
  if (!architecture.includes(architectureFragment)) {
    throw new AdapterFailure(`docs/ARCHITECTURE.md missed ${architectureFragment}`);
  }

  const design = fs.readFileSync(path.join(repoRoot, 'docs', 'DESIGN.md'), 'utf8');
  const atomHeadings = [
    '### RF-BUG-003 — Embedded UI and Doctor readiness atom',
    '### RF-BUG-004 — Import-only OPML and Portable State atom',
    '### RF-BUG-005 — Go-owned CSP interaction atom'
  ];
  for (const heading of atomHeadings) {
    if (design.split(heading).length !== 2) throw new AdapterFailure(`docs/DESIGN.md must contain exactly one ${heading}`);
  }

  const doctorFragment = 'redacts every configured secret, including Owner Token and OpenRouter key values, plus userinfo and query values from failed-source URLs';
  const stateFragment = 'Minimal JSON State portability contains only active sources, active steering rules, and currently resonated items; import validates the bundle before one atomic replacement, never merges state';
  const cspFragment = 'must complete under the Go-owned CSP without `unsafe-inline`, duplicate header ownership, blocked required resources, or CSP violations';
  for (const fragment of [doctorFragment, stateFragment, cspFragment]) {
    if (!design.includes(fragment)) throw new AdapterFailure(`docs/DESIGN.md missed ${fragment}`);
  }

  const adapterOutput = execute(profile, 'node', ['--test', 'scripts/vectl-check.test.mjs'], { timeout: 240_000 });
  if (!adapterOutput.includes('VECTL-ADAPTER pending-profile-discovery')) {
    throw new AdapterFailure('adapter self-test missed pending-profile-discovery');
  }

  const canonicalOutput = execute(profile, 'go', ['test', '-v', './tests', '-run', '^TestRFBugCanonicalContracts$', '-count=1'], { timeout: 180_000 });
  for (const marker of ['RF_BUG_CANONICAL_DOCUMENTS=9', 'OPML_EXCLUSIONS=2']) {
    if (!canonicalOutput.includes(marker)) throw new AdapterFailure(`protected canonical scan missed ${marker}`);
  }

  return {
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  };
}

function promptingV22ActiveFiles() {
  const files = [];
  function visit(root, include) {
    if (!fs.existsSync(root)) return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(entryPath, include);
      } else if (entry.isFile() && include(entryPath)) {
        files.push(entryPath);
      }
    }
  }
  const productionGo = (filePath) => filePath.endsWith('.go') && !filePath.endsWith('_test.go');
  visit(path.join(repoRoot, 'cmd'), productionGo);
  visit(path.join(repoRoot, 'internal', 'resofeed'), productionGo);
  visit(path.join(repoRoot, 'web', 'src'), (filePath) => !filePath.endsWith('.test.ts') && !filePath.endsWith('.spec.ts'));
  files.push(path.join(repoRoot, 'docs', 'ARCHITECTURE.md'), path.join(repoRoot, 'docs', 'PROMPTING_SYSTEM.md'));
  return files;
}

function runPromptingV22(profile) {
  const outputs = profile.commands.map((commandRow) => {
    const command = Array.isArray(commandRow) ? commandRow : commandRow.argv;
    return execute(profile, command[0], command.slice(1), {
      timeout: 300_000,
      env: Array.isArray(commandRow) ? { RESOFEED_E2E: null } : commandRow.env
    });
  });
  const staleIdentity = /promptingv21|prompting(?:\s+system)?\s+v2\.1|(^|[^a-z0-9_])v2\.1([^a-z0-9_]|$)/imu;
  const matches = [];
  for (const filePath of promptingV22ActiveFiles()) {
    const body = fs.readFileSync(filePath, 'utf8');
    if (staleIdentity.test(body)) matches.push(path.relative(repoRoot, filePath).split(path.sep).join('/'));
  }
  if (matches.length > 0) throw new AdapterFailure('active Prompting v2.1 identity remains', matches);
  outputs.push('PROMPTING_V21_ACTIVE_MATCHES=0');
  const combined = outputs.join('\n');
  const missing = profile.requiredOutput.filter((marker) => !combined.includes(marker));
  if (missing.length > 0) throw new AdapterFailure('Prompting v2.2 profile output missed required contract markers', missing);
  return {
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  };
}

export function runTokenParityHarness(profile, run = execute) {
  const strictProfile = PROFILES.get(profileKey('rf-bug-v2-prompting-harness', 'rf_bug_v2_prompting_harness_remediation_green'));
  if (!strictProfile) throw new AdapterFailure('Prompting/outbound strict harness profile was not registered');

  const commandRow = profile.commands[0];
  if (!commandRow || Array.isArray(commandRow)) throw new AdapterFailure('token parity command missed scoped E2E configuration');

  const adapterOutput = run(profile, 'node', [
    '--test', '--test-name-pattern=RF-BUG-002 token parity harness adapter contract',
    'scripts/vectl-check.test.mjs'
  ], { timeout: 240_000, env: { RESOFEED_E2E: null } });
  if (!adapterOutput.includes('RF-BUG-002 token parity harness adapter contract')) {
    throw new AdapterFailure('token parity focused adapter contract did not execute');
  }

  const strictOutput = run(profile, 'node', [
    'scripts/vectl-check.mjs', 'run', strictProfile.suite, strictProfile.checkID
  ], { timeout: 900_000, env: { RESOFEED_E2E: null } });
  const strictEvidence = parseEvidenceOutput(strictOutput, strictProfile, 'green');
  for (const marker of strictProfile.requiredOutput) {
    if (!strictEvidence.observations.includes(marker)) {
      throw new AdapterFailure(`nested Prompting/outbound strict harness evidence missed ${marker}`);
    }
  }

  const parityOutput = run(profile, commandRow.argv[0], commandRow.argv.slice(1), {
    timeout: 900_000,
    env: commandRow.env
  });
  for (const forbidden of ['raw item route accepted', 'HTTP MCP reingest mismatch', 'no tests to run', 'skipped', 'retry']) {
    if (parityOutput.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new AdapterFailure(`token parity fixture emitted forbidden marker: ${forbidden}`);
    }
  }

  const combined = [...strictEvidence.observations, parityOutput].join('\n');
  const missing = profile.requiredOutput.filter((marker) => !combined.includes(marker));
  if (missing.length > 0) throw new AdapterFailure('token parity harness output missed required contract markers', missing);
  return {
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  };
}

export function runPromptingHarness(profile, run = execute) {
  const promptingProfile = PROFILES.get(profileKey('rf-bug-v2-prompting', 'rf_bug_v2_prompting_green'));
  if (!promptingProfile) throw new AdapterFailure('Prompting v2.2 profile was not registered');

  const fixtureTests = '^(TestOutboundE2EFixturePolicy|TestOutboundHTTPURLPolicyRejectsUnsafeDestinations|TestFetchPathsRejectLoopbackBeforeRequest|TestPlaywrightFixtureContract)$';
  const adapterOutput = run(profile, 'node', [
    '--test', '--test-name-pattern=RF-BUG-009 prompting harness adapter contract',
    'scripts/vectl-check.test.mjs'
  ], { timeout: 240_000, env: { RESOFEED_E2E: null } });
  const promptingOutput = run(profile, 'node', [
    'scripts/vectl-check.mjs', 'run', promptingProfile.suite, promptingProfile.checkID
  ], { timeout: 900_000, env: { RESOFEED_E2E: null } });
  const promptingEvidence = parseEvidenceOutput(promptingOutput, promptingProfile, 'green');
  for (const marker of promptingProfile.requiredOutput) {
    if (!promptingEvidence.observations.includes(marker)) {
      throw new AdapterFailure(`nested Prompting evidence missed ${marker}`);
    }
  }

  const buildScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'resofeed-prompting-harness-'));
  const webUI = path.join(repoRoot, 'internal', 'resofeed', 'webui');
  const webUIBackup = path.join(buildScratch, 'webui');
  fs.cpSync(webUI, webUIBackup, { recursive: true });
  try {
    run(profile, 'scripts/build-resofeed.sh', [path.join(buildScratch, 'resofeed')], {
      timeout: 600_000,
      env: { RESOFEED_E2E: '1' }
    });
  } finally {
    fs.rmSync(webUI, { recursive: true, force: true });
    fs.cpSync(webUIBackup, webUI, { recursive: true });
    fs.rmSync(buildScratch, { recursive: true, force: true });
  }
  const strictOutput = run(profile, 'go', [
    'test', '-v', './internal/resofeed', '-run', fixtureTests, '-count=1'
  ], { timeout: 300_000, env: { RESOFEED_E2E: null } });
  const taggedOutput = run(profile, 'go', [
    'test', '-tags', 'resofeed_e2e', '-v', './internal/resofeed', '-run', fixtureTests, '-count=1'
  ], { timeout: 300_000, env: { RESOFEED_E2E: '1' } });

  const combined = [adapterOutput, ...promptingEvidence.observations, strictOutput, taggedOutput].join('\n');
  const missing = profile.requiredOutput.filter((marker) => !combined.includes(marker));
  if (missing.length > 0) throw new AdapterFailure('Prompting harness output missed required contract markers', missing);
  return {
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  };
}

function runNative(profile) {
  const outputs = [];
  for (const commandRow of profile.commands) {
    const command = Array.isArray(commandRow) ? commandRow : commandRow.argv;
    outputs.push(execute(profile, command[0], command.slice(1), {
      expectedStatus: Array.isArray(commandRow) ? 0 : commandRow.expectedStatus,
      timeout: commandRow.timeout
    }));
  }
  const combined = outputs.join('\n');
  const missing = profile.requiredOutput.filter((marker) => !combined.includes(marker));
  if (missing.length > 0) throw new AdapterFailure('native profile output missed required contract markers', missing);
  return {
    outcome: profile.expectedOutcome,
    exitCode: profile.expectedOutcome === 'green' ? 0 : 1,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  };
}

function refuse(message) {
  process.stderr.write(`vectl-check refused: ${message}\n`);
  process.exitCode = 2;
}

async function main() {
  const [action, suite, checkID] = process.argv.slice(2);
  const profile = PROFILES.get(profileKey(suite, checkID));
  if (!profile) {
    refuse('unknown or mismatched suite/check pair');
    return;
  }
  if (action === 'select') {
    process.stdout.write(`${JSON.stringify(selectionEnvelope(profile))}\n`);
    return;
  }
  if (action !== 'run') {
    refuse('action must be select or run');
    return;
  }

  try {
    const result = profile.runner === 'foundation'
      ? runFoundation(profile)
      : profile.runner === 'generic-adapter'
        ? runGenericAdapter(profile)
        : profile.runner === 'runtime-doc-contract'
          ? runRuntimeDocContract(profile)
          : profile.runner === 'runtime-isolation'
            ? runRuntimeIsolation(profile)
            : profile.runner === 'canonical-build'
              ? runCanonicalBuild(profile)
          : profile.runner === 'prompting-v22'
            ? runPromptingV22(profile)
            : profile.runner === 'token-parity'
              ? runTokenParityHarness(profile)
              : profile.runner === 'prompting-harness'
                ? runPromptingHarness(profile)
                : runNative(profile);
    const envelope = evidenceEnvelope({ profile, ...result });
    parseEvidenceOutput(JSON.stringify(envelope), profile, result.outcome);
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    const observations = [
      redact(error instanceof Error ? error.message : error),
      ...((error instanceof AdapterFailure ? error.observations : []).map(redact))
    ];
    const envelope = evidenceEnvelope({ profile, outcome: 'red', exitCode: 1, observations, artifacts: [] });
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === adapterPath) {
  await main();
}
