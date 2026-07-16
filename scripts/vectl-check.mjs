#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suiteID = 'rf-bug-v2-harness-foundation';
const canonicalCheckID = 'rf_bug_v2_harness_foundation_green';
const identities = [
  'RF-BUG-010 adapter-envelope',
  'RF-BUG-010 artifact-contract',
  'RF-BUG-010 harness-isolation',
  'RF-BUG-010 lane-discovery'
];

function selectionDigest(selectedIDs) {
  return `sha256:${createHash('sha256').update(JSON.stringify({ identities: selectedIDs })).digest('hex')}`;
}

function selectionEnvelope(checkID) {
  return {
    schema_version: 'vectl.check.selection.v1',
    check_id: checkID,
    identities,
    digest: selectionDigest(identities)
  };
}

function evidenceEnvelope({ checkID, outcome, exitCode, observations, artifacts }) {
  return {
    schema_version: 'vectl.check.evidence.v1',
    check_id: checkID,
    selected_ids: identities,
    executed_ids: identities,
    outcome,
    exit_code: exitCode,
    observations,
    artifacts
  };
}

function redact(value) {
  return String(value)
    .replace(/rfeed_[A-Za-z0-9_-]+/gu, '<redacted-owner-token>')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gu, '<redacted-openrouter-key>')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"',}]+/giu, '$1<redacted>')
    .replace(/(cookie\s*[:=]\s*)[^\n]+/giu, '$1<redacted>')
    .replace(/((?:OPENROUTER_KEY|TAVILY_API_KEY)\s*=\s*)[^\s]+/gu, '$1<redacted>');
}

function fail(message, observations = []) {
  process.stdout.write(`${JSON.stringify(evidenceEnvelope({
    checkID: canonicalCheckID,
    outcome: 'red',
    exitCode: 1,
    observations: [message, ...observations].map(redact),
    artifacts: []
  }))}\n`);
  process.exit(1);
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
  if (files.length === 0) fail('generic evidence retained no artifact files');
  return files.map((filePath) => {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
      fail('generic evidence artifact escaped the repository');
    }
    return { path: relativePath, sha256: artifactDigest(filePath) };
  });
}

function childEnvironment(overrides = {}) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    CI: '1',
    NO_COLOR: '1',
    RESOFEED_E2E: '1',
    RESOFEED_E2E_LIVE_OPENROUTER: '',
    ...overrides
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: options.timeout ?? 900_000,
    env: childEnvironment(options.env)
  });
  if (result.error || result.status !== (options.expectedStatus ?? 0)) {
    const detail = redact(`${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`).slice(-6000);
    fail(`${command} execution did not satisfy its expected process outcome`, [detail]);
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
  if (changed.status !== 0 || changed.stdout.trim()) fail('protected acceptance baseline changed');
}

function assertAdapterEnvelope(checkID) {
  const selection = selectionEnvelope(checkID);
  if (
    selection.schema_version !== 'vectl.check.selection.v1'
    || selection.check_id !== canonicalCheckID
    || selection.identities.length !== 4
    || !selection.digest.startsWith('sha256:')
  ) {
    fail('generic selection envelope is invalid');
  }
  const evidence = evidenceEnvelope({
    checkID,
    outcome: 'green',
    exitCode: 0,
    observations: ['VECTL_GENERIC_EVIDENCE=valid'],
    artifacts: []
  });
  if (
    evidence.schema_version !== 'vectl.check.evidence.v1'
    || JSON.stringify(evidence.selected_ids) !== JSON.stringify(selection.identities)
    || JSON.stringify(evidence.executed_ids) !== JSON.stringify(selection.identities)
  ) {
    fail('generic evidence envelope is invalid');
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
    if (!artifactOutput.includes(marker)) fail(`artifact proof did not emit ${marker}`);
  }

  const htmlPath = path.join(artifactRoot, 'html-report', 'index.html');
  const resultPath = path.join(artifactRoot, 'results', 'results.json');
  for (const requiredPath of [htmlPath, resultPath]) {
    if (!fs.existsSync(requiredPath)) fail(`artifact proof did not retain ${path.relative(repoRoot, requiredPath)}`);
  }

  const attachments = collectAttachments(JSON.parse(fs.readFileSync(resultPath, 'utf8')));
  const requiredNames = [
    'screenshot',
    'video',
    'trace',
    'server.stdout.log',
    'server.stderr.log',
    'browser-diagnostics.log',
    'runtime-cleanup.txt'
  ];
  for (const name of requiredNames) {
    const attachment = attachments.find((candidate) => candidate.name === name && candidate.path);
    if (!attachment || !fs.existsSync(attachment.path)) fail(`artifact proof did not retain ${name}`);
  }

  for (const name of ['server.stdout.log', 'server.stderr.log', 'browser-diagnostics.log', 'runtime-cleanup.txt']) {
    const attachment = attachments.find((candidate) => candidate.name === name && candidate.path);
    const raw = fs.readFileSync(attachment.path, 'utf8');
    if (redact(raw) !== raw) fail(`artifact proof retained secret-bearing ${name}`);
  }
  const cleanup = fs.readFileSync(attachments.find((candidate) => candidate.name === 'runtime-cleanup.txt').path, 'utf8');
  for (const marker of ['process=stopped', 'port=closed', 'database_residue=0', 'cleanup=clean']) {
    if (!cleanup.includes(marker)) fail(`artifact proof cleanup did not record ${marker}`);
  }
}

const [action, suite, checkID] = process.argv.slice(2);
if (action === 'select') {
  if (suite !== suiteID || checkID !== canonicalCheckID) fail('invalid selection request');
  process.stdout.write(`${JSON.stringify(selectionEnvelope(checkID))}\n`);
  process.exit(0);
}
if (action !== 'run' || suite !== suiteID || checkID !== canonicalCheckID) {
  fail(`usage: vectl-check.mjs run ${suiteID} ${canonicalCheckID}`);
}

ensureNoProtectedMutation();
assertAdapterEnvelope(checkID);
run('go', ['test', './internal/resofeed', '-run', '^TestPlaywrightFixtureContract$', '-count=1'], { timeout: 180_000 });
run('npm', ['--prefix', 'web', 'run', 'test:render', '--', 'src/lib/__tests__/playwright-e2e-harness-contract.test.ts'], { timeout: 180_000 });

const artifactRoot = path.join(repoRoot, '.test-artifacts', 'playwright', 'rf-bug-010-artifact-proof');
fs.rmSync(artifactRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(artifactRoot, 'results'), { recursive: true });
const artifactOutput = run('npm', [
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

run('npm', ['--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.smoke.config.ts', '--project=chromium-ci-safe', '--retries=0'], { timeout: 180_000 });
run('npm', ['--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.runtime.config.ts', '--project=chromium-ci-safe', '--retries=0'], { timeout: 240_000 });

const laneRoot = path.join(repoRoot, '.test-artifacts', 'playwright', 'lane-discovery');
fs.rmSync(laneRoot, { recursive: true, force: true });
fs.mkdirSync(laneRoot, { recursive: true });
const lanes = [
  {
    label: 'OLD',
    files: [
      'web/tests/e2e/search-click-inspector-contract.expected-red.spec.ts',
      'web/tests/e2e/mobile-inspector-token-hydration.spec.ts',
      'web/tests/e2e/source-ledger-navigation-regression.expected-red.spec.ts'
    ]
  },
  {
    label: 'REPLACEMENT',
    files: [
      'web/tests/e2e/inspector-selection.browser-contract.spec.ts',
      'web/tests/e2e/initial-route.browser-contract.spec.ts',
      'web/tests/e2e/routes.browser-contract.spec.ts',
      'web/tests/e2e/source-ledger-responsive.browser-contract.spec.ts',
      'web/tests/e2e/source-ledger-delete.browser-contract.spec.ts'
    ]
  }
];
const laneMarkers = [];
for (const lane of lanes) {
  const listPath = path.join(laneRoot, `${lane.label.toLowerCase()}-list.json`);
  run('npm', [
    '--prefix', 'web', 'exec', '--', 'playwright', 'test',
    '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe',
    '--retries=0', '--reporter=json', '--list', ...lane.files
  ], { timeout: 300_000, env: { PLAYWRIGHT_JSON_OUTPUT_NAME: listPath } });
  const discovery = run('node', [
    'scripts/rf-bug-010-standard-json.mjs', 'discover', listPath,
    `RF-BUG-010_${lane.label}`, ...lane.files
  ], { timeout: 30_000 });
  laneMarkers.push(...discovery.split('\n').filter((line) => line.startsWith(`RF-BUG-010_${lane.label}_`)));
}

const observations = [
  'RF-BUG-010_SETUP=ready',
  'RF-BUG-010_TEARDOWN=clean',
  ...laneMarkers,
  'VECTL_GENERIC_EVIDENCE=valid'
];
const artifactRows = collectArtifactRows([artifactRoot, laneRoot]);
process.stdout.write(`${JSON.stringify(evidenceEnvelope({
  checkID,
  outcome: 'green',
  exitCode: 0,
  observations,
  artifacts: artifactRows
}))}\n`);
