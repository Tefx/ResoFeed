import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PENDING_PROFILE_PAIRS,
  PROFILES,
  childEnvironment,
  evidenceEnvelope,
  parseEvidenceOutput,
  parseSelectionOutput,
  runPromptingHarness,
  selectionEnvelope
} from './vectl-check.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterPath = path.join(repoRoot, 'scripts', 'vectl-check.mjs');

const expectedPending = [
  ['rf-bug-v2-frontend-runtime', 'rf_bug_v2_frontend_runtime_green', [
    'RF-BUG-001 real API SQLite stale selection seam',
    'RF-BUG-002 stale Search ownership and recovery',
    'RF-BUG-006 route-correct pre-hydration title',
    'RF-BUG-007 EN/ZH idle and invalid alert'
  ]],
  ['rf-bug-v2-go-token-parity', 'rf_bug_v2_go_token_parity_green', [
    'RF-BUG-002 canonical HTTP MCP parity',
    'RF-BUG-002 opaque item ID API paths 30'
  ]],
  ['rf-bug-v2-embed-ui', 'rf_bug_v2_embed_ui_green', [
    'RF-BUG-003 Doctor redaction',
    'RF-BUG-003 binary arbitrary cwd',
    'RF-BUG-003 embedded UI contract'
  ]],
  ['rf-bug-v2-opml', 'rf_bug_v2_opml_import_only_green', [
    'RF-BUG-004 active document scan',
    'RF-BUG-004 auth-first import-only contract'
  ]],
  ['rf-bug-v2-runtime-review-remediation', 'rf_bug_v2_runtime_review_remediation_green', [
    'RF-BUG-003 failed-source URL credential redaction',
    'RF-BUG-003/004 protected import-only regression',
    'RF-BUG-004 Go OPML export symbol absence'
  ]],
  ['rf-bug-v2-runtime-doc-contract', 'rf_bug_v2_runtime_doc_contract_green', [
    'RF-BUG-003 canonical embedded Doctor contract',
    'RF-BUG-003/004/005 protected canonical scan',
    'RF-BUG-004 canonical import-only State contract',
    'RF-BUG-005 canonical CSP interaction contract'
  ]],
  ['rf-bug-v2-http-security', 'rf_bug_v2_http_security_green', [
    'RF-BUG-005 Chromium CSP operations',
    'RF-BUG-005 exact security contract',
    'RF-BUG-005 local streaming cancellation'
  ]],
  ['rf-bug-v2-source-ledger', 'rf_bug_v2_source_ledger_green', [
    'RF-BUG-004 State import lifecycle',
    'RF-BUG-008 delete focus',
    'RF-BUG-008 five viewport responsive',
    'RF-BUG-008 operations runtime',
    'RF-BUG-008 render states'
  ]],
  ['rf-bug-v2-prompting', 'rf_bug_v2_prompting_green', [
    'RF-BUG-009 active v2.1 absence',
    'RF-BUG-009 exact 16 subtests',
    'RF-BUG-009 focused path parity',
    'RF-BUG-009 regression and atomic preservation'
  ]],
  ['rf-bug-v2-prompting-harness', 'rf_bug_v2_prompting_harness_remediation_green', [
    'RF-BUG-009 harness exact 16 subtests',
    'RF-BUG-009 harness exact argv and environment',
    'RF-BUG-009 harness exact four identities',
    'RF-BUG-009 harness production strict'
  ]],
  ['rf-bug-v2-closure-report', 'rf_bug_v2_defect_report_closure_green', [
    'RF-BUG-001-010 active source scans',
    'RF-BUG-001-010 closure contract'
  ]],
  ['item-deep-links-contract', 'item_deep_links_expected_red', [
    'ITEM-DEEP-LINK app codec and API domain separation',
    'ITEM-DEEP-LINK browser history auth error read-only lifecycle',
    'ITEM-DEEP-LINK duplicate read envelope and MCP app_url'
  ]],
  ['item-deep-links-backend', 'item_deep_links_backend_green', [
    'ITEM-DEEP-LINK duplicate read envelope and MCP app_url'
  ]],
  ['item-deep-links-frontend', 'item_deep_links_frontend_green', [
    'ITEM-DEEP-LINK app codec and API domain separation',
    'ITEM-DEEP-LINK browser history auth error read-only lifecycle'
  ]]
];

function invoke(...args) {
  return spawnSync(process.execPath, [adapterPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      CI: '1',
      NO_COLOR: '1'
    }
  });
}

function findProfile(suite, checkID) {
  return [...PROFILES.values()].find((profile) => profile.suite === suite && profile.checkID === checkID);
}

test('VECTL-ADAPTER completed-harness-regression', () => {
  const profile = findProfile('rf-bug-v2-harness-foundation', 'rf_bug_v2_harness_foundation_green');
  assert.ok(profile);
  assert.deepEqual(profile.identities, [
    'RF-BUG-010 adapter-envelope',
    'RF-BUG-010 artifact-contract',
    'RF-BUG-010 harness-isolation',
    'RF-BUG-010 lane-discovery'
  ]);

  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  assert.ok(
    adapterSource.includes('artifacts: artifactRows'),
    'foundation evidence must retain the literal artifacts: artifactRows compatibility contract'
  );

  const result = invoke('select', profile.suite, profile.checkID);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseSelectionOutput(result.stdout, profile), selectionEnvelope(profile));
});

test('VECTL-ADAPTER pending-profile-discovery', () => {
  assert.equal(PENDING_PROFILE_PAIRS.length, 14);
  assert.equal(expectedPending.length, 14);

  for (const [suite, checkID, identities] of expectedPending) {
    const profile = findProfile(suite, checkID);
    assert.ok(profile, `${suite}/${checkID} was not registered`);
    assert.deepEqual(profile.identities, identities);

    const result = invoke('select', suite, checkID);
    assert.equal(result.status, 0, `${suite}/${checkID}: ${result.stderr}`);
    const selection = parseSelectionOutput(result.stdout, profile);
    assert.equal(selection.check_id, checkID);
    assert.deepEqual(selection.identities, identities);
    assert.equal(selection.identities.length, identities.length);
  }
});

test('RF-BUG-009 prompting harness adapter contract', () => {
  const profile = findProfile('rf-bug-v2-prompting-harness', 'rf_bug_v2_prompting_harness_remediation_green');
  const prompting = findProfile('rf-bug-v2-prompting', 'rf_bug_v2_prompting_green');
  assert.ok(profile);
  assert.ok(prompting);
  assert.equal(profile.identities.length, 4);
  assert.deepEqual(evidenceEnvelope({ profile, outcome: 'green', exitCode: 0 }).selected_ids, profile.identities);
  assert.deepEqual(evidenceEnvelope({ profile, outcome: 'green', exitCode: 0 }).executed_ids, profile.identities);

  assert.deepEqual(prompting.commands[0], {
    argv: ['go', 'test', '-tags', 'resofeed_e2e', '-v', './internal/resofeed', '-run', '^TestRFBUG009PromptingV22Contract$', '-count=1'],
    env: { RESOFEED_E2E: '1' }
  });
  assert.equal(Array.isArray(prompting.commands[1]), true);
  assert.equal(prompting.commands[1].includes('-tags'), false);
  assert.equal('RESOFEED_E2E' in childEnvironment(), false, 'general child environment must remain strict');
  assert.equal(childEnvironment({ RESOFEED_E2E: '1' }).RESOFEED_E2E, '1');

  const calls = [];
  const promptingEnvelope = evidenceEnvelope({
    profile: prompting,
    outcome: 'green',
    exitCode: 0,
    observations: [...prompting.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']
  });
  const markers = [
    'TestOutboundE2EFixturePolicy',
    'TestOutboundHTTPURLPolicyRejectsUnsafeDestinations',
    'TestFetchPathsRejectLoopbackBeforeRequest',
    'TestPlaywrightFixtureContract',
    'PASS'
  ].join('\n');
  const fakeRun = (_profile, command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'node' && args[0] === '--test') return 'RF-BUG-009 prompting harness adapter contract\nPASS';
    if (command === 'node') return `${JSON.stringify(promptingEnvelope)}\n`;
    if (command === 'scripts/build-resofeed.sh') return 'production build complete';
    return markers;
  };

  const result = runPromptingHarness(profile, fakeRun);
  assert.equal(result.outcome, 'green');
  assert.deepEqual(result.observations, [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[0].args, ['--test', '--test-name-pattern=RF-BUG-009 prompting harness adapter contract', 'scripts/vectl-check.test.mjs']);
  assert.deepEqual(calls[1].args, ['scripts/vectl-check.mjs', 'run', 'rf-bug-v2-prompting', 'rf_bug_v2_prompting_green']);
  assert.equal(calls[2].command, 'scripts/build-resofeed.sh');
  assert.equal(calls[2].args.length, 1);
  assert.equal(path.basename(calls[2].args[0]), 'resofeed');
  assert.deepEqual(calls[2].options, { timeout: 600_000, env: { RESOFEED_E2E: '1' } });
  assert.equal(calls[3].args.includes('-tags'), false);
  assert.deepEqual(calls[3].options.env, { RESOFEED_E2E: null });
  assert.deepEqual(calls[4].args.slice(0, 4), ['test', '-tags', 'resofeed_e2e', '-v']);
  assert.deepEqual(calls[4].options.env, { RESOFEED_E2E: '1' });

  const invalidNestedRun = (_profile, command, args) => {
    if (command === 'node' && args[0] !== '--test') return '{"schema_version":"vectl.check.evidence.v1"}\n';
    return markers;
  };
  assert.throws(
    () => runPromptingHarness(profile, invalidNestedRun),
    /evidence envelope did not match the requested profile/u
  );
});

test('VECTL-ADAPTER Source Ledger reporter-marker correlation', () => {
  const profile = findProfile('rf-bug-v2-source-ledger', 'rf_bug_v2_source_ledger_green');
  assert.ok(profile);

  const requiredTitle = 'Source Ledger groups and controls render';
  assert.ok(profile.requiredOutput.includes(requiredTitle));

  const [vitestCommand, ...playwrightCommands] = profile.commands;
  const markerCommand = profile.commands.find((command) => command.includes('--reporter=verbose'));
  assert.equal(markerCommand, vitestCommand);
  assert.deepEqual(markerCommand, [
    'npm', '--prefix', 'web', 'run', 'test:render', '--', '--reporter=verbose',
    'src/routes/components/__tests__/source-ledger-responsive.test.ts'
  ]);
  assert.equal(vitestCommand.filter((argument) => argument === '--reporter=verbose').length, 1);
  assert.match(vitestCommand.at(-1), /source-ledger-responsive\.test\.ts$/u);

  assert.equal(playwrightCommands.length, 2);
  for (const command of playwrightCommands) {
    assert.equal(command.includes('--reporter=verbose'), false);
    assert.ok(command.includes('playwright'));
  }
});

test('RF-BUG runtime documentation contract profile', () => {
  const profile = findProfile('rf-bug-v2-runtime-doc-contract', 'rf_bug_v2_runtime_doc_contract_green');
  assert.ok(profile);
  assert.equal(profile.runner, 'runtime-doc-contract');
  assert.deepEqual(profile.requiredOutput, [
    'RF_BUG_RUNTIME_DOC_ARCH_CSP_FRAGMENT=complete',
    'RF_BUG_RUNTIME_DOC_DESIGN_ATOMS=3',
    'RF_BUG_RUNTIME_DOC_DOCTOR_REDACTION=complete',
    'RF_BUG_RUNTIME_DOC_CSP_INTERACTIONS=complete',
    'RF_BUG_CANONICAL_DOCUMENTS=9',
    'OPML_EXCLUSIONS=2',
    'VECTL-ADAPTER pending-profile-discovery'
  ]);

  const result = invoke('select', profile.suite, profile.checkID);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseSelectionOutput(result.stdout, profile), selectionEnvelope(profile));
});

test('VECTL-ADAPTER protected-scope', () => {
  const allowed = new Set([
    'docs/ARCHITECTURE.md',
    'docs/DESIGN.md',
    'docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md',
    'internal/resofeed/doctor.go',
    'internal/resofeed/doctor_test.go',
    'internal/resofeed/ingest.go',
    'internal/resofeed/rf_bug_opml_import_only_test.go',
    'scripts/vectl-check.mjs',
    'scripts/vectl-check.test.mjs'
  ]);
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }
  });
  assert.equal(result.status, 0, result.stderr);

  const changed = result.stdout.split('\0').filter(Boolean).map((row) => row.slice(3));
  for (const changedPath of changed) {
    assert.ok(allowed.has(changedPath), `protected or out-of-scope path changed: ${changedPath}`);
  }
});

test('VECTL-ADAPTER run-envelope-parity', () => {
  const greenProfile = findProfile('rf-bug-v2-frontend-runtime', 'rf_bug_v2_frontend_runtime_green');
  const redProfile = findProfile('item-deep-links-contract', 'item_deep_links_expected_red');
  assert.ok(greenProfile);
  assert.ok(redProfile);

  const artifact = {
    path: '.test-artifacts/playwright/results.json',
    sha256: `sha256:${'a'.repeat(64)}`
  };
  const green = evidenceEnvelope({
    profile: greenProfile,
    outcome: 'green',
    exitCode: 0,
    observations: ['fixture=green'],
    artifacts: [artifact]
  });
  const red = evidenceEnvelope({
    profile: redProfile,
    outcome: 'red',
    exitCode: 1,
    observations: ['IDL-BACKEND-READ-PROJECTION-GAP', 'IDL-FRONTEND-APP-HISTORY-GAP'],
    artifacts: []
  });

  assert.deepEqual(parseEvidenceOutput(JSON.stringify(green), greenProfile, 'green'), green);
  assert.deepEqual(parseEvidenceOutput(JSON.stringify(red), redProfile, 'red'), red);
  assert.deepEqual(green.artifacts, [artifact]);
  assert.deepEqual(green.selected_ids, green.executed_ids);
  assert.deepEqual(red.selected_ids, red.executed_ids);

  for (const invalidArtifact of [
    '.test-artifacts/playwright/results.json',
    { path: '/tmp/results.json', sha256: artifact.sha256 },
    { path: '../results.json', sha256: artifact.sha256 },
    { path: artifact.path, sha256: 'sha256:invalid' }
  ]) {
    const invalid = { ...green, artifacts: [invalidArtifact] };
    assert.throws(
      () => parseEvidenceOutput(JSON.stringify(invalid), greenProfile, 'green'),
      /invalid artifact/u
    );
  }

  const mismatched = { ...green, executed_ids: [...green.executed_ids].reverse() };
  assert.throws(
    () => parseEvidenceOutput(JSON.stringify(mismatched), greenProfile, 'green'),
    /did not match the requested profile/u
  );
});

test('VECTL-ADAPTER unknown-pair-fail-closed', () => {
  const probes = [
    ['select', 'unknown-suite', 'unknown-check'],
    ['select', 'rf-bug-v2-frontend-runtime', 'rf_bug_v2_go_token_parity_green'],
    ['run', 'rf-bug-v2-go-token-parity', 'rf_bug_v2_frontend_runtime_green']
  ];

  for (const probe of probes) {
    const result = invoke(...probe);
    assert.notEqual(result.status, 0, probe.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /refused: unknown or mismatched suite\/check pair/u);
  }
});
