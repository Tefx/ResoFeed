import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PENDING_PROFILE_PAIRS,
  PROFILES,
  captureGeneratedTreeState,
  childEnvironment,
  childEnvironmentForCommand,
  evidenceEnvelope,
  generatedTreesMatch,
  immutableDeploymentSources,
  parseEvidenceOutput,
  parseSelectionOutput,
  probeBuildIdentityRejection,
  runPromptingHarness,
  runTokenParityHarness,
  inventoryClosureRequirements,
  selectionEnvelope,
  validateClosureAuthorityOutputs,
  verifyImmutableDeploymentSources,
  withGeneratedTreeRestoration,
  withLockedWebDependencies
} from './vectl-check.mjs';
import { verifyIsolatedLane } from './rf-bug-010-standard-json.mjs';
import {
  BUILD_IDENTITY_ENV,
  canonicalBuildManifest,
  deriveSvelteBuildIdentity,
  resolveSvelteBuildIdentity
} from './resofeed-svelte-build-identity.mjs';

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
  ['rf-bug-v2-adapter-runtime-isolation-remediation', 'rf_bug_v2_adapter_runtime_isolation_green', [
    'RF-BUG-010 foundation smoke isolation',
    'RF-BUG-010 replacement runtime isolation'
  ]],
  ['rf-bug-v2-canonical-e2e-embedded-ui-build-remediation', 'rf_bug_v2_canonical_e2e_embedded_ui_build_green', [
    'RF-BUG-010 canonical fresh embedded UI build'
  ]],
  ['rf-bug-v2-deterministic-svelte-build-remediation', 'rf_bug_v2_deterministic_svelte_build_green', [
    'RF-BUG-010 deterministic canonical frontend builds'
  ]],
  ['rf-bug-v2-deterministic-adapter-identity-integration-remediation', 'rf_bug_v2_deterministic_adapter_identity_integration_green', [
    'RF-BUG-010 deterministic adapter identity integration'
  ]],
  ['rf-bug-v2-deterministic-profile-self-restoration-remediation', 'rf_bug_v2_deterministic_profile_self_restoration_green', [
    'RF-BUG-010 deterministic profile negative probes and restoration'
  ]],
  ['rf-bug-v2-generated-webui-baseline-sync', 'rf_bug_v2_generated_webui_baseline_sync_green', [
    'RF-BUG-010 canonical generated webui baseline equality'
  ]],
  ['rf-bug-v2-immutable-deployment-procedure', 'rf_bug_v2_immutable_deployment_procedure_green', [
    'RF-BUG-V2 immutable OCI and Tailnet deployment procedure'
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
  assert.equal(PENDING_PROFILE_PAIRS.length, 21);
  assert.equal(expectedPending.length, 21);

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

test('immutable OCI and Tailnet deployment procedure', () => {
  const profile = findProfile(
    'rf-bug-v2-immutable-deployment-procedure',
    'rf_bug_v2_immutable_deployment_procedure_green'
  );
  assert.ok(profile);
  assert.equal(profile.runner, 'immutable-deployment');
  assert.deepEqual(profile.identities, ['RF-BUG-V2 immutable OCI and Tailnet deployment procedure']);

  const sources = immutableDeploymentSources();
  const markers = verifyImmutableDeploymentSources(sources);
  assert.deepEqual(profile.requiredOutput, [
    'immutable OCI and Tailnet deployment procedure',
    ...markers
  ]);

  const selected = invoke('select', profile.suite, profile.checkID);
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(parseSelectionOutput(selected.stdout, profile), selectionEnvelope(profile));

  const commit = 'a'.repeat(40);
  const indexDigest = `sha256:${'1'.repeat(64)}`;
  const amd64Digest = `sha256:${'2'.repeat(64)}`;
  const arm64Digest = `sha256:${'3'.repeat(64)}`;
  const priorCommit = 'b'.repeat(40);
  const priorIndexDigest = `sha256:${'4'.repeat(64)}`;
  const priorAMD64Digest = `sha256:${'5'.repeat(64)}`;
  const priorARM64Digest = `sha256:${'6'.repeat(64)}`;
  const ociArguments = [
    '--verified-commit', commit,
    '--immutable-tag', `git-${commit}`,
    '--index-digest', indexDigest,
    '--amd64-digest', amd64Digest,
    '--arm64-digest', arm64Digest
  ];

  function executable(filePath, lines) {
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
    fs.chmodSync(filePath, 0o755);
  }

  function fileSHA256(filePath) {
    return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
  }

  function checked(command, args, options) {
    const result = spawnSync(command, args, { encoding: 'utf8', ...options });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  }

  function procedureStagingFixture({
    failComposeReplacement = false,
    tamperStagedCompose = false,
    driftPriorAfterTransfer = false,
    missingPriorCompose = false,
    hostKeyState = 'trusted',
    remoteHostname = 'unknown-internal-host'
  } = {}) {
    const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-procedure-stage-'));
    const sourceRoot = path.join(root, 'source');
    const sourceStack = path.join(sourceRoot, 'deploy', 'resofeed-caddy');
    const remoteHome = path.join(root, 'remote-home');
    const remoteStack = path.join(remoteHome, 'Projects', 'resofeed-caddy');
    const fakeBin = path.join(root, 'bin');
    fs.mkdirSync(sourceStack, { recursive: true });
    fs.mkdirSync(remoteStack, { recursive: true });
    fs.mkdirSync(fakeBin);

    for (const name of ['deploy.sh', 'compose.yml']) {
      fs.copyFileSync(path.join(repoRoot, 'deploy', 'resofeed-caddy', name), path.join(sourceStack, name));
    }
    fs.chmodSync(path.join(sourceStack, 'deploy.sh'), 0o755);
    fs.chmodSync(path.join(sourceStack, 'compose.yml'), 0o644);

    checked('git', ['init', '-q'], { cwd: sourceRoot });
    checked('git', ['config', 'user.name', 'Procedure Fixture'], { cwd: sourceRoot });
    checked('git', ['config', 'user.email', 'procedure@example.invalid'], { cwd: sourceRoot });
    checked('git', ['add', 'deploy/resofeed-caddy/deploy.sh', 'deploy/resofeed-caddy/compose.yml'], { cwd: sourceRoot });
    checked('git', ['commit', '-q', '-m', 'procedure fixture'], { cwd: sourceRoot });
    const sourceCommit = checked('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot });

    const priorDeploy = '#!/usr/bin/env bash\nset -Eeuo pipefail\nprintf "prior procedure\\n"\n';
    const priorCompose = `${fs.readFileSync(path.join(repoRoot, 'deploy', 'resofeed-caddy', 'compose.yml'), 'utf8')}# prior procedure\n`;
    fs.writeFileSync(path.join(remoteStack, 'deploy.sh'), priorDeploy, { mode: 0o755 });
    if (!missingPriorCompose) {
      fs.writeFileSync(path.join(remoteStack, 'compose.yml'), priorCompose, { mode: 0o644 });
    }

    const sshLog = path.join(root, 'ssh.log');
    const sshAttemptLog = path.join(root, 'ssh-attempt.log');
    const dockerLog = path.join(root, 'docker.log');
    const mvFailureMarker = path.join(root, 'mv-failed');
    fs.writeFileSync(sshLog, '');
    fs.writeFileSync(sshAttemptLog, '');
    fs.writeFileSync(dockerLog, '');

    executable(path.join(fakeBin, 'hostname'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$FAKE_REMOTE_HOSTNAME"'
    ]);
    executable(path.join(fakeBin, 'docker'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
      'if [[ "$1" == "compose" ]]; then exit 0; fi',
      'exit 1'
    ]);
    executable(path.join(fakeBin, 'mv'), [
      '#!/usr/bin/env bash',
      'if [[ "${FAKE_FAIL_COMPOSE_REPLACE:-0}" == "1" && "$*" == *".compose.yml.procedure."* && "${@: -1}" == "compose.yml" && ! -e "$FAKE_MV_FAILURE_MARKER" ]]; then',
      '  : > "$FAKE_MV_FAILURE_MARKER"',
      '  exit 73',
      'fi',
      'exec /bin/mv "$@"'
    ]);
    executable(path.join(fakeBin, 'ssh'), [
      '#!/usr/bin/env bash',
      'set -Euo pipefail',
      'expected=(-F none -T -o HostName=tefx-mbp-personal.platy-atlas.ts.net -o HostKeyAlias=tefx-mbp-personal.platy-atlas.ts.net -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o VerifyHostKeyDNS=no -o CanonicalizeHostname=no -o BatchMode=yes -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o NumberOfPasswordPrompts=0 -o AddKeysToAgent=no -o ForwardAgent=no -o ClearAllForwardings=yes -o ControlMaster=no -o ControlPath=none -o RequestTTY=no)',
      'for expected_argument in "${expected[@]}"; do',
      '  [[ "${1:-}" == "$expected_argument" ]] || { printf "unexpected SSH endpoint option: expected %s, got %s\\n" "$expected_argument" "${1:-<missing>}" >&2; exit 69; }',
      '  shift',
      'done',
      'host=${1:-}',
      'shift',
      '[[ "$host" == "tefx-mbp-personal.platy-atlas.ts.net" ]] || exit 70',
      'printf "%s %s\\n" "$FAKE_HOST_KEY_STATE" "$host" >> "$FAKE_SSH_ATTEMPT_LOG"',
      'case "$FAKE_HOST_KEY_STATE" in',
      '  trusted) ;;',
      '  unknown) printf "Host key verification failed: no existing key for literal FQDN\\n" >&2; exit 71 ;;',
      '  changed) printf "REMOTE HOST IDENTIFICATION HAS CHANGED for literal FQDN\\n" >&2; exit 72 ;;',
      '  *) exit 73 ;;',
      'esac',
      'command_text=$*',
      'printf "%s\\n" "$command_text" >> "$FAKE_SSH_LOG"',
      'export HOME="$FAKE_REMOTE_HOME"',
      'export PATH="$FAKE_REMOTE_BIN:$PATH"',
      'if [[ "$#" -eq 1 ]]; then',
      '  bash -c "$1"',
      '  status=$?',
      'elif [[ "$1 $2" == "bash -s" ]]; then',
      '  helper=$(cat)',
      '  helper=${helper//\\/Applications\\/OrbStack.app\\/Contents\\/MacOS\\/xbin/$FAKE_REMOTE_BIN}',
      '  printf "%s" "$helper" | "$@"',
      '  status=$?',
      'else',
      '  "$@"',
      '  status=$?',
      'fi',
      'if [[ "$status" -eq 0 && "$command_text" == *"cat >"* && "$command_text" == *"compose.yml"* ]]; then',
      '  if [[ "${FAKE_TAMPER_STAGED_COMPOSE:-0}" == "1" ]]; then printf "# transfer tamper\\n" >> "$FAKE_REMOTE_STACK/$FAKE_STAGE_NAME/compose.yml"; fi',
      '  if [[ "${FAKE_DRIFT_PRIOR_AFTER_TRANSFER:-0}" == "1" ]]; then printf "# target drift\\n" >> "$FAKE_REMOTE_STACK/compose.yml"; fi',
      'fi',
      'exit "$status"'
    ]);

    const environment = {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOME: process.env.HOME ?? root,
      TMPDIR: root,
      FAKE_REMOTE_HOME: remoteHome,
      FAKE_REMOTE_BIN: fakeBin,
      FAKE_REMOTE_STACK: remoteStack,
      FAKE_REMOTE_HOSTNAME: remoteHostname,
      FAKE_HOST_KEY_STATE: hostKeyState,
      FAKE_SSH_ATTEMPT_LOG: sshAttemptLog,
      FAKE_STAGE_NAME: `.resofeed-procedure-stage-${sourceCommit}`,
      FAKE_SSH_LOG: sshLog,
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_FAIL_COMPOSE_REPLACE: failComposeReplacement ? '1' : '0',
      FAKE_TAMPER_STAGED_COMPOSE: tamperStagedCompose ? '1' : '0',
      FAKE_DRIFT_PRIOR_AFTER_TRANSFER: driftPriorAfterTransfer ? '1' : '0',
      FAKE_MV_FAILURE_MARKER: mvFailureMarker
    };
    const stageArguments = ['--stage-procedure', '--verified-commit', sourceCommit];
    const runStage = () => spawnSync(path.join(sourceStack, 'deploy.sh'), stageArguments, {
      cwd: sourceRoot,
      encoding: 'utf8',
      env: environment
    });
    const runRecovery = (backupID) => spawnSync(path.join(sourceStack, 'deploy.sh'), [
      '--recover-procedure', '--backup-id', backupID
    ], {
      cwd: sourceRoot,
      encoding: 'utf8',
      env: environment
    });
    return {
      root,
      sourceRoot,
      sourceStack,
      remoteStack,
      sshLog,
      sshAttemptLog,
      dockerLog,
      sourceCommit,
      priorDeploy,
      priorCompose,
      runStage,
      runRecovery
    };
  }

  const staged = procedureStagingFixture();
  try {
    const result = staged.runStage();
    assert.equal(result.status, 0, `${result.stderr}\nDocker log:\n${fs.readFileSync(staged.dockerLog, 'utf8')}\nSSH log:\n${fs.readFileSync(staged.sshLog, 'utf8')}`);
    const sourceDeploy = path.join(staged.sourceStack, 'deploy.sh');
    const sourceCompose = path.join(staged.sourceStack, 'compose.yml');
    assert.equal(fs.readFileSync(path.join(staged.remoteStack, 'deploy.sh'), 'utf8'), fs.readFileSync(sourceDeploy, 'utf8'));
    assert.equal(fs.readFileSync(path.join(staged.remoteStack, 'compose.yml'), 'utf8'), fs.readFileSync(sourceCompose, 'utf8'));
    assert.equal(fs.statSync(path.join(staged.remoteStack, 'deploy.sh')).mode & 0o777, 0o755);
    assert.match(result.stdout, new RegExp(`PROCEDURE_SOURCE_COMMIT=${staged.sourceCommit}`, 'u'));
    assert.match(result.stdout, new RegExp(`PROCEDURE_DEPLOY_SHA256=${fileSHA256(sourceDeploy)}`, 'u'));
    assert.match(result.stdout, new RegExp(`PROCEDURE_COMPOSE_SHA256=${fileSHA256(sourceCompose)}`, 'u'));
    assert.match(result.stdout, /PROCEDURE_STAGE=verified/u);
    const backupID = result.stdout.match(/^PROCEDURE_BACKUP_ID=(sha256:[a-f0-9]{64})$/mu)?.[1];
    assert.ok(backupID, result.stdout);
    const backupDir = path.join(staged.remoteStack, '.resofeed-procedure-backups', backupID.slice('sha256:'.length));
    assert.equal(fs.readFileSync(path.join(backupDir, 'deploy.sh'), 'utf8'), staged.priorDeploy);
    assert.equal(fs.readFileSync(path.join(backupDir, 'compose.yml'), 'utf8'), staged.priorCompose);

    const sshEvidence = fs.readFileSync(staged.sshLog, 'utf8');
    const sshAttempts = fs.readFileSync(staged.sshAttemptLog, 'utf8').trim().split('\n');
    assert.equal(sshAttempts.length, 5);
    assert.ok(sshAttempts.every((line) => line === 'trusted tefx-mbp-personal.platy-atlas.ts.net'));
    assert.equal((sshEvidence.match(/cat >/gu) ?? []).length, 2);
    assert.match(sshEvidence, /deploy\.sh/u);
    assert.match(sshEvidence, /compose\.yml/u);
    assert.doesNotMatch(sshEvidence, /(?:scp|rsync|hostname -s)/u);
    assert.doesNotMatch(fs.readFileSync(staged.dockerLog, 'utf8'), /\b(?:pull|push|up|down|build|restart|stop)\b/u);

    const beforeDirtyProbe = fs.readFileSync(staged.sshLog, 'utf8');
    fs.writeFileSync(path.join(staged.sourceRoot, 'dirty-probe'), 'dirty\n');
    const dirty = staged.runStage();
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /source checkout is not clean/u);
    assert.equal(fs.readFileSync(staged.sshLog, 'utf8'), beforeDirtyProbe);
    fs.rmSync(path.join(staged.sourceRoot, 'dirty-probe'));

    const recovered = staged.runRecovery(backupID);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(fs.readFileSync(path.join(staged.remoteStack, 'deploy.sh'), 'utf8'), staged.priorDeploy);
    assert.equal(fs.readFileSync(path.join(staged.remoteStack, 'compose.yml'), 'utf8'), staged.priorCompose);
    assert.match(recovered.stdout, /PROCEDURE_RECOVERY_STATUS=verified/u);
  } finally {
    fs.rmSync(staged.root, { recursive: true, force: true });
  }

  const detached = procedureStagingFixture();
  try {
    checked('git', ['checkout', '--detach', '-q', detached.sourceCommit], { cwd: detached.sourceRoot });
    const detachedRef = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], {
      cwd: detached.sourceRoot,
      encoding: 'utf8'
    });
    assert.equal(detachedRef.status, 1);
    assert.equal(checked('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: detached.sourceRoot }), '');
    const result = detached.runStage();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source HEAD must be attached to a branch/u);
    assert.equal(fs.readFileSync(detached.sshAttemptLog, 'utf8'), '');
    assert.equal(fs.readFileSync(detached.sshLog, 'utf8'), '');
    assert.equal(fs.readFileSync(path.join(detached.remoteStack, 'deploy.sh'), 'utf8'), detached.priorDeploy);
    assert.equal(fs.readFileSync(path.join(detached.remoteStack, 'compose.yml'), 'utf8'), detached.priorCompose);
    assert.equal(fs.existsSync(path.join(detached.remoteStack, '.resofeed-procedure-transaction.lock')), false);
  } finally {
    fs.rmSync(detached.root, { recursive: true, force: true });
  }

  const partial = procedureStagingFixture({ failComposeReplacement: true });
  try {
    const result = partial.runStage();
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(path.join(partial.remoteStack, 'deploy.sh'), 'utf8'), partial.priorDeploy);
    assert.equal(fs.readFileSync(path.join(partial.remoteStack, 'compose.yml'), 'utf8'), partial.priorCompose);
    assert.match(result.stderr, /PROCEDURE_ROLLBACK=prior_bytes_restored/u);
  } finally {
    fs.rmSync(partial.root, { recursive: true, force: true });
  }

  const tampered = procedureStagingFixture({ tamperStagedCompose: true });
  try {
    const result = tampered.runStage();
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(path.join(tampered.remoteStack, 'deploy.sh'), 'utf8'), tampered.priorDeploy);
    assert.equal(fs.readFileSync(path.join(tampered.remoteStack, 'compose.yml'), 'utf8'), tampered.priorCompose);
    assert.match(result.stderr, /SHA-256 mismatch/u);
  } finally {
    fs.rmSync(tampered.root, { recursive: true, force: true });
  }

  const drifted = procedureStagingFixture({ driftPriorAfterTransfer: true });
  try {
    const result = drifted.runStage();
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(path.join(drifted.remoteStack, 'deploy.sh'), 'utf8'), drifted.priorDeploy);
    assert.match(fs.readFileSync(path.join(drifted.remoteStack, 'compose.yml'), 'utf8'), /# target drift/u);
    assert.match(result.stderr, /drifted before replacement/u);
    assert.equal(fs.existsSync(path.join(drifted.remoteStack, '.resofeed-procedure-transaction.lock')), false);
  } finally {
    fs.rmSync(drifted.root, { recursive: true, force: true });
  }

  const missingPrior = procedureStagingFixture({ missingPriorCompose: true });
  try {
    const result = missingPrior.runStage();
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(path.join(missingPrior.remoteStack, 'deploy.sh'), 'utf8'), missingPrior.priorDeploy);
    assert.match(result.stderr, /prior compose.yml is missing or unsafe/u);
    assert.equal(fs.existsSync(path.join(missingPrior.remoteStack, '.resofeed-procedure-transaction.lock')), false);
  } finally {
    fs.rmSync(missingPrior.root, { recursive: true, force: true });
  }

  const wrongMode = procedureStagingFixture();
  try {
    fs.chmodSync(path.join(wrongMode.remoteStack, 'compose.yml'), 0o600);
    const result = wrongMode.runStage();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /prior compose.yml mode is not 644/u);
    assert.equal(fs.existsSync(path.join(wrongMode.remoteStack, '.resofeed-procedure-transaction.lock')), false);
  } finally {
    fs.rmSync(wrongMode.root, { recursive: true, force: true });
  }

  for (const hostKeyState of ['unknown', 'changed']) {
    const untrusted = procedureStagingFixture({ hostKeyState });
    try {
      const result = untrusted.runStage();
      assert.equal(result.status, 1);
      assert.match(result.stderr, hostKeyState === 'unknown' ? /no existing key for literal FQDN/u : /HOST IDENTIFICATION HAS CHANGED/u);
      assert.equal(fs.readFileSync(untrusted.sshLog, 'utf8'), '');
      assert.equal(fs.readFileSync(path.join(untrusted.remoteStack, 'deploy.sh'), 'utf8'), untrusted.priorDeploy);
      assert.equal(fs.readFileSync(path.join(untrusted.remoteStack, 'compose.yml'), 'utf8'), untrusted.priorCompose);
      assert.equal(fs.existsSync(path.join(untrusted.remoteStack, '.resofeed-procedure-transaction.lock')), false);
      assert.equal(fs.readFileSync(untrusted.sshAttemptLog, 'utf8').trim(), `${hostKeyState} tefx-mbp-personal.platy-atlas.ts.net`);
    } finally {
      fs.rmSync(untrusted.root, { recursive: true, force: true });
    }
  }

  function deploymentFixture(failReplacementReadiness, invalidProcedureIdentity = false) {
    const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-immutable-deploy-'));
    const home = path.join(root, 'home');
    const stack = path.join(home, 'Projects', 'resofeed-caddy');
    const fakeBin = path.join(root, 'bin');
    fs.mkdirSync(stack, { recursive: true });
    fs.mkdirSync(fakeBin);
    for (const name of ['deploy.sh', 'compose.yml']) {
      fs.copyFileSync(path.join(repoRoot, 'deploy', 'resofeed-caddy', name), path.join(stack, name));
    }
    fs.chmodSync(path.join(stack, 'deploy.sh'), 0o755);

    const priorImage = `docker.io/tefx/resofeed@${priorIndexDigest}`;
    const targetImage = `docker.io/tefx/resofeed@${indexDigest}`;
    const envPath = path.join(stack, '.env');
    fs.writeFileSync(envPath, [
      'TAILSCALE_IP=100.64.0.8',
      'CADDY_LOCAL_HTTPS_PORT=8443',
      'RESOFEED_DOMAIN=resofeed.example.test',
      'CF_API_TOKEN=fixture-present',
      'OPENROUTER_KEY=',
      'TAVILY_API_KEY=',
      `RESOFEED_IMAGE=${priorImage}`,
      `RESOFEED_VERIFIED_COMMIT=${priorCommit}`,
      `RESOFEED_IMMUTABLE_TAG=git-${priorCommit}`,
      `RESOFEED_INDEX_DIGEST=${priorIndexDigest}`,
      `RESOFEED_AMD64_DIGEST=${priorAMD64Digest}`,
      `RESOFEED_ARM64_DIGEST=${priorARM64Digest}`,
      ''
    ].join('\n'), { mode: 0o600 });

    const statePath = path.join(root, 'current-image');
    const dockerLog = path.join(root, 'docker.log');
    fs.writeFileSync(statePath, `${priorImage}\n`);
    fs.writeFileSync(dockerLog, '');

    executable(path.join(fakeBin, 'hostname'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" tefx-mbp-personal'
    ]);
    executable(path.join(fakeBin, 'sleep'), ['#!/usr/bin/env bash', 'exit 0']);
    executable(path.join(fakeBin, 'tailscale'), [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "ip" ]]; then printf "%s\\n" 100.64.0.8; exit 0; fi',
      'if [[ "$1 $2" == "serve status" ]]; then printf "%s\\n" "TCP 443 -> tcp://127.0.0.1:8443"; exit 0; fi',
      'if [[ "$1" == "serve" ]]; then exit 0; fi',
      'exit 1'
    ]);
    executable(path.join(fakeBin, 'curl'), [
      '#!/usr/bin/env bash',
      'current=$(cat "$FAKE_STATE")',
      'url=${@: -1}',
      'if [[ "$FAKE_FAIL_READINESS" == "1" && "$current" == "$FAKE_TARGET_IMAGE" ]]; then printf "%s" 503; exit 0; fi',
      'if [[ "$url" == */api/doctor ]]; then printf "%s" 401; else printf "%s" 200; fi'
    ]);
    executable(path.join(fakeBin, 'docker'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
      'if [[ "$1 $2 $3" == "buildx imagetools inspect" ]]; then',
      '  if [[ " $* " == *" --format "* ]]; then',
      '    printf "{\\"org.opencontainers.image.revision\\":\\"%s\\"}\\n" "$FAKE_COMMIT"',
      '  else',
      '    cat <<EOF',
      'Name: $4',
      'MediaType: application/vnd.oci.image.index.v1+json',
      'Digest: $FAKE_INDEX_DIGEST',
      'Manifests:',
      '  Name: docker.io/tefx/resofeed@$FAKE_AMD64_DIGEST',
      '  Platform: linux/amd64',
      '  Name: docker.io/tefx/resofeed@$FAKE_ARM64_DIGEST',
      '  Platform: linux/arm64',
      'EOF',
      '  fi',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "container inspect" ]]; then',
      '  target=${@: -1}',
      '  if [[ "$target" == "resofeed-caddy" ]]; then exit 0; fi',
      '  if [[ " $* " == *" --format "* ]]; then',
      '    if [[ "$*" == *".Config.Image"* ]]; then cat "$FAKE_STATE"; exit 0; fi',
      '    if [[ "$*" == *".Image"* ]]; then printf "%s\\n" sha256:fixture-image-id; exit 0; fi',
      '    if [[ "$*" == *".Mounts"* ]]; then printf "%s\\n" "resofeed-caddy_resofeed-data | /data"; exit 0; fi',
      '  fi',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "image inspect" ]]; then printf "%s\\n" "$FAKE_PRIOR_IMAGE"; exit 0; fi',
      'if [[ "$1" == "compose" ]]; then',
      '  if [[ " $* " == *" up "* ]]; then awk -F= \'$1=="RESOFEED_IMAGE" {print substr($0, index($0,"=")+1)}\' "$FAKE_ENV" > "$FAKE_STATE"; fi',
      '  exit 0',
      'fi',
      'exit 1'
    ]);

    const environment = {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOME: home,
      TMPDIR: root,
      FAKE_STATE: statePath,
      FAKE_ENV: envPath,
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_COMMIT: commit,
      FAKE_INDEX_DIGEST: indexDigest,
      FAKE_AMD64_DIGEST: amd64Digest,
      FAKE_ARM64_DIGEST: arm64Digest,
      FAKE_PRIOR_IMAGE: priorImage,
      FAKE_TARGET_IMAGE: targetImage,
      FAKE_FAIL_READINESS: failReplacementReadiness ? '1' : '0'
    };
    const procedureDeployHash = fileSHA256(path.join(stack, 'deploy.sh'));
    const procedureComposeHash = fileSHA256(path.join(stack, 'compose.yml'));
    const procedureArguments = [
      '--procedure-deploy-sha256', invalidProcedureIdentity ? `sha256:${'f'.repeat(64)}` : procedureDeployHash,
      '--procedure-compose-sha256', procedureComposeHash
    ];
    const result = spawnSync(path.join(stack, 'deploy.sh'), [...ociArguments, ...procedureArguments], {
      cwd: stack,
      encoding: 'utf8',
      env: environment
    });
    return {
      root,
      stack,
      envPath,
      statePath,
      dockerLog,
      environment,
      priorImage,
      targetImage,
      procedureDeployHash,
      procedureComposeHash,
      result
    };
  }

  const identityRejected = deploymentFixture(false, true);
  try {
    assert.equal(identityRejected.result.status, 1);
    assert.match(identityRejected.result.stderr, /caller-bound procedure SHA-256/u);
    assert.equal(fs.readFileSync(identityRejected.dockerLog, 'utf8'), '');
    assert.equal(fs.readFileSync(identityRejected.statePath, 'utf8').trim(), identityRejected.priorImage);
  } finally {
    fs.rmSync(identityRejected.root, { recursive: true, force: true });
  }

  const successful = deploymentFixture(false);
  try {
    assert.equal(successful.result.status, 0, successful.result.stderr);
    assert.equal(fs.readFileSync(successful.statePath, 'utf8').trim(), successful.targetImage);
    const deployedEnv = fs.readFileSync(successful.envPath, 'utf8');
    assert.match(deployedEnv, new RegExp(`^RESOFEED_IMAGE=${successful.targetImage}$`, 'mu'));
    assert.match(deployedEnv, /^CF_API_TOKEN=fixture-present$/mu);
    assert.match(successful.result.stdout, /READINESS=root_200_doctor_401/u);
    assert.doesNotMatch(fs.readFileSync(successful.dockerLog, 'utf8'), /(?:down|volume rm|--volumes)/u);

    const orphan = spawnSync(path.join(successful.stack, 'deploy.sh'), ['--record-orphan', ...ociArguments], {
      cwd: successful.stack,
      encoding: 'utf8',
      env: successful.environment
    });
    assert.equal(orphan.status, 0, orphan.stderr);
    const ledger = fs.readFileSync(path.join(successful.stack, '.resofeed-oci-orphans.log'), 'utf8');
    assert.ok(ledger.includes(`verified_commit=${commit} immutable_tag=git-${commit} index=${indexDigest}`));
  } finally {
    fs.rmSync(successful.root, { recursive: true, force: true });
  }

  const failed = deploymentFixture(true);
  try {
    assert.equal(failed.result.status, 1);
    assert.equal(fs.readFileSync(failed.statePath, 'utf8').trim(), failed.priorImage);
    assert.match(fs.readFileSync(failed.envPath, 'utf8'), new RegExp(`^RESOFEED_IMAGE=${failed.priorImage}$`, 'mu'));
    assert.match(failed.result.stderr, /ROLLBACK=prior_digest_and_readiness restored/u);
    assert.doesNotMatch(fs.readFileSync(failed.dockerLog, 'utf8'), /(?:down|volume rm|--volumes)/u);
  } finally {
    fs.rmSync(failed.root, { recursive: true, force: true });
  }

  function mutation(relativePath, mutate) {
    return { ...sources, [relativePath]: mutate(sources[relativePath]) };
  }

  const deployPath = 'deploy/resofeed-caddy/deploy.sh';
  const composePath = 'deploy/resofeed-caddy/compose.yml';
  const movingTag = ['late', 'st'].join('');
  const clearData = ['--clear', '-data'].join('');
  const resetToken = ['--reset', '-token'].join('');
  const negativeCases = [
    mutation(deployPath, (body) => body.replace('docker.io/tefx/resofeed', 'docker.io/alternate/resofeed')),
    mutation(deployPath, (body) => body.replace('tefx-mbp-personal.platy-atlas.ts.net', 'alternate-host.invalid')),
    mutation(composePath, (body) => body.replace(
      'image: ${RESOFEED_IMAGE:?set RESOFEED_IMAGE to docker.io/tefx/resofeed@sha256:<digest>}',
      `image: \${RESOFEED_IMAGE:-docker.io/tefx/resofeed:${movingTag}}`
    )),
    mutation(deployPath, (body) => body.replace('expected_tag="git-${VERIFIED_COMMIT}"', 'expected_tag="$IMMUTABLE_TAG"')),
    mutation(deployPath, (body) => body.replace('verify_oci_descriptor "${OCI_REPOSITORY}@${OCI_INDEX_DIGEST}"', 'true')),
    mutation(deployPath, (body) => body.replace('application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json')),
    mutation(deployPath, (body) => body.replace("inspect_manifest_digest 'linux/amd64'", "inspect_manifest_digest 'linux/386'")),
    mutation(deployPath, (body) => body.replace("inspect_manifest_digest 'linux/arm64'", "inspect_manifest_digest 'linux/arm/v7'")),
    mutation(deployPath, (body) => body.replaceAll('rollback_previous_digest', 'rollback_without_readiness')),
    mutation(deployPath, (body) => body.replace('status --porcelain=v1 --untracked-files=all', 'status --short')),
    mutation(deployPath, (body) => body.replace('git -C "$repo_root" symbolic-ref -q HEAD', 'true')),
    mutation(deployPath, (body) => body.replace('remote_procedure_helper() {', 'remote_procedure_helper() {\n  docker compose up -d')),
    mutation(deployPath, (body) => body.replace('StrictHostKeyChecking=yes', 'StrictHostKeyChecking=no')),
    mutation(deployPath, (body) => body.replace('HostKeyAlias=${TAILNET_TARGET_HOST}', 'HostKeyAlias=tefx-mbp-personal')),
    mutation(deployPath, (body) => body.replace('-F none', '-F ~/.ssh/config')),
    mutation(deployPath, (body) => body.replace('BatchMode=yes', 'BatchMode=yes\n  -o UserKnownHostsFile=/tmp/alternate-known-hosts')),
    mutation(deployPath, (body) => body.replace('ssh "${TAILNET_SSH_OPTIONS[@]}" "$TAILNET_TARGET_HOST"', 'ssh "$TAILNET_TARGET_HOST"')),
    mutation(deployPath, (body) => `${body}\nhostname -s\n`),
    mutation(deployPath, (body) => body.replace('  verify_staged_procedure_identity\n  require_command docker', '  require_command docker')),
    mutation(deployPath, (body) => body.replace('PROCEDURE_ROLLBACK=prior_bytes_restored', 'PROCEDURE_ROLLBACK=unavailable')),
    mutation(deployPath, (body) => `${body}\ndocker manifest rm unauthorized\n`),
    mutation(deployPath, (body) => `${body}\nprintf '%s\\n' "$OPENROUTER_KEY"\n`),
    mutation(deployPath, (body) => `${body}\n${clearData}\n`),
    mutation(deployPath, (body) => `${body}\n${resetToken}\n`)
  ];
  for (const [caseIndex, invalid] of negativeCases.entries()) {
    assert.throws(
      () => verifyImmutableDeploymentSources(invalid),
      /immutable deployment/u,
      `immutable deployment negative case ${caseIndex} was accepted`
    );
  }

  console.log('immutable OCI and Tailnet deployment procedure');
  for (const marker of markers) console.log(marker);
});

test('RF-BUG-010 runtime isolation adapter contract', () => {
  const profile = findProfile('rf-bug-v2-adapter-runtime-isolation-remediation', 'rf_bug_v2_adapter_runtime_isolation_green');
  assert.ok(profile);
  assert.equal(profile.runner, 'runtime-isolation');
  assert.deepEqual(profile.identities, [
    'RF-BUG-010 foundation smoke isolation',
    'RF-BUG-010 replacement runtime isolation'
  ]);

  const files = [
    'web/tests/e2e/inspector-selection.browser-contract.spec.ts',
    'web/tests/e2e/initial-route.browser-contract.spec.ts',
    'web/tests/e2e/routes.browser-contract.spec.ts',
    'web/tests/e2e/source-ledger-responsive.browser-contract.spec.ts',
    'web/tests/e2e/source-ledger-delete.browser-contract.spec.ts'
  ];
  const counts = [2, 12, 6, 7, 2];
  const rows = files.flatMap((file, fileIndex) => Array.from({ length: counts[fileIndex] }, (_, testIndex) => ({
    file,
    title: `isolated case ${fileIndex + 1}.${testIndex + 1}`
  })));
  const report = (selectedRows, result = null) => ({
    suites: selectedRows.map((row) => ({
      specs: [{
        file: row.file,
        title: row.title,
        tests: [{ results: result ? [{ status: result.status, retry: result.retry }] : [] }]
      }]
    }))
  });
  const listedReport = report(rows);
  const runReports = files.map((file) => report(rows.filter((row) => row.file === file), { status: 'passed', retry: 0 }));
  const verified = verifyIsolatedLane({ listedReport, runReports, expectedFiles: files, expectedCount: 29 });
  assert.equal(verified.selected.length, 29);
  assert.deepEqual(verified.selected, verified.executed);
  assert.equal(verified.outcomes.length, 29);

  assert.throws(
    () => verifyIsolatedLane({ listedReport, runReports: [report(rows, { status: 'passed', retry: 0 })], expectedFiles: files, expectedCount: 29 }),
    /shared replacement runtime/u
  );
  assert.throws(
    () => verifyIsolatedLane({ listedReport: report(rows.slice(0, -1)), runReports, expectedFiles: files, expectedCount: 29 }),
    /expected exactly 29/u
  );
  const skippedReports = [...runReports];
  skippedReports[0] = report(rows.filter((row) => row.file === files[0]), { status: 'skipped', retry: 0 });
  assert.throws(
    () => verifyIsolatedLane({ listedReport, runReports: skippedReports, expectedFiles: files, expectedCount: 29 }),
    /contained a skip/u
  );
  const retriedReports = [...runReports];
  retriedReports[0] = report(rows.filter((row) => row.file === files[0]), { status: 'passed', retry: 1 });
  assert.throws(
    () => verifyIsolatedLane({ listedReport, runReports: retriedReports, expectedFiles: files, expectedCount: 29 }),
    /contained a retry/u
  );

  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  const foundationIndex = adapterSource.indexOf('const foundation = runFoundation(profile)');
  const replacementIndex = adapterSource.indexOf("executeIsolatedLane(profile, laneRoot, 'replacement'");
  const oldIndex = adapterSource.indexOf("executeIsolatedLane(profile, laneRoot, 'old-execution'");
  assert.ok(foundationIndex > 0 && foundationIndex < replacementIndex && replacementIndex < oldIndex, 'foundation, replacement, and old lane sequencing must remain ordered');
  const invocationStart = adapterSource.indexOf('function runPlaywrightFile');
  const cleanupIndex = adapterSource.indexOf('cleanupGlobalRuntime(invocationRoot)', invocationStart);
  const rethrowIndex = adapterSource.indexOf('if (failure) throw failure', invocationStart);
  assert.ok(invocationStart > 0 && cleanupIndex > invocationStart && cleanupIndex < rethrowIndex, 'Playwright failure must still reach runtime cleanup before rethrow');
  assert.match(adapterSource, /copyRedactedArtifact/u);
  assert.equal((adapterSource.match(/ensureNoProtectedMutation\(\);/gu) ?? []).length >= 4, true);
  assert.match(adapterSource, /for \(const isolatedRoot of \[smokeRoot, runtimeRoot\]\) fs\.rmSync/u);
});

test('RF-BUG-010 canonical fresh embedded UI build', () => {
  const profile = findProfile(
    'rf-bug-v2-canonical-e2e-embedded-ui-build-remediation',
    'rf_bug_v2_canonical_e2e_embedded_ui_build_green'
  );
  assert.ok(profile);
  assert.equal(profile.runner, 'canonical-build');
  assert.deepEqual(profile.identities, ['RF-BUG-010 canonical fresh embedded UI build']);

  const scriptPath = path.join(repoRoot, 'scripts', 'build-resofeed.sh');
  const scriptSource = fs.readFileSync(scriptPath, 'utf8');
  assert.match(scriptSource, /e2e_build=0/u);
  assert.match(scriptSource, /e2e_build=1/u);
  assert.match(scriptSource, /mktemp -d "\$\{package_dir\}\/\.webui-stage\./u);
  assert.match(scriptSource, /validate_bootstrap "\$\{staged_ui\}"/u);
  assert.match(scriptSource, /RESOFEED_SVELTE_BUILD_IDENTITY/u);
  assert.match(scriptSource, /resofeed-svelte-build-identity\.mjs" derive/u);
  assert.match(scriptSource, /env -i/u);
  assert.match(scriptSource, /go build -trimpath -tags resofeed_e2e -o/u);
  assert.match(scriptSource, /go build -trimpath -o/u);

  for (const consumer of ['web/tests/e2e/global-setup.ts', 'web/tests/e2e/fixtures/runtime-fixture.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, consumer), 'utf8');
    assert.match(source, /scripts['"], ['"]build-resofeed\.sh/u, `${consumer} must use the canonical build script`);
    assert.doesNotMatch(source, /npm['"], \[['"]--prefix['"], ['"]web['"], ['"]run['"], ['"]build/u);
    assert.doesNotMatch(source, /spawnSync\(['"]go['"], \[['"]build/u);
  }
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  assert.doesNotMatch(adapterSource, /withCurrentEmbeddedUI/u);
  assert.match(adapterSource, /runner: 'canonical-build'/u);

  function fixture() {
    const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-build-contract-'));
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'web', 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'web', 'static'), { recursive: true });
    fs.mkdirSync(path.join(root, 'internal', 'resofeed', 'webui'), { recursive: true });
    fs.copyFileSync(scriptPath, path.join(root, 'scripts', 'build-resofeed.sh'));
    fs.copyFileSync(path.join(repoRoot, 'scripts', 'resofeed-svelte-build-identity.mjs'), path.join(root, 'scripts', 'resofeed-svelte-build-identity.mjs'));
    for (const relativePath of ['package-lock.json', 'package.json', 'svelte.config.js', 'tsconfig.json', 'vite.config.ts']) {
      fs.writeFileSync(path.join(root, 'web', relativePath), `${relativePath}\n`);
    }
    fs.writeFileSync(path.join(root, 'web', 'src', 'app.html'), '<html></html>');
    fs.writeFileSync(path.join(root, 'web', 'static', 'favicon.svg'), '<svg></svg>');
    fs.chmodSync(path.join(root, 'scripts', 'build-resofeed.sh'), 0o755);
    fs.writeFileSync(path.join(root, 'internal', 'resofeed', 'webui', 'old.js'), 'old');
    fs.writeFileSync(path.join(root, 'internal', 'resofeed', 'webui', 'index.html'), '<script src="/old.js"></script>');

    const fakeBin = path.join(root, 'fake-bin');
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(path.join(fakeBin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
rm -rf "$PWD/web/build"
mkdir -p "$PWD/web/build"
case "$(cat "$PWD/build-fixture" 2>/dev/null || printf valid)" in
  missing) ;;
  empty) : > "$PWD/web/build/index.html" ;;
  invalid) printf '%s' '<script src="https://example.test/app.js"></script>' > "$PWD/web/build/index.html" ;;
  valid)
    printf '%s' 'fresh' > "$PWD/web/build/app.js"
    printf '%s' '<link href="/app.js"><script type="module">import("/app.js")</script>' > "$PWD/web/build/index.html"
    ;;
esac
`);
    fs.writeFileSync(path.join(fakeBin, 'go'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$PWD/go-args.log"
if [[ "$1" == "test" ]]; then
  grep -q fresh "$PWD/internal/resofeed/webui/app.js"
  if [[ "\${FAIL_GO:-}" == "test" ]]; then exit 31; fi
  exit 0
fi
if [[ "\${FAIL_GO:-}" == "build" ]]; then exit 32; fi
output=''
previous=''
for argument in "$@"; do
  if [[ "$previous" == "-o" ]]; then output="$argument"; fi
  previous="$argument"
done
mkdir -p "$(dirname "$output")"
printf '%s' binary > "$output"
`);
    fs.writeFileSync(path.join(fakeBin, 'cp'), `#!/usr/bin/env bash
if [[ "\${FAIL_COPY:-}" == "1" ]]; then exit 23; fi
exec /bin/cp "$@"
`);
    for (const command of ['npm', 'go', 'cp']) fs.chmodSync(path.join(fakeBin, command), 0o755);
    return { root, fakeBin };
  }

  function runFixture(options = {}) {
    const current = fixture();
    const output = path.join(current.root, 'out', 'resofeed');
    fs.writeFileSync(path.join(current.root, 'build-fixture'), options.buildFixture ?? 'valid');
    const result = spawnSync(path.join(current.root, 'scripts', 'build-resofeed.sh'), [...(options.e2e ? ['--e2e'] : []), output], {
      cwd: current.root,
      encoding: 'utf8',
      env: {
        PATH: `${current.fakeBin}:${process.env.PATH ?? ''}`,
        HOME: process.env.HOME ?? '',
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        FAIL_COPY: options.failCopy ? '1' : '',
        FAIL_GO: options.failGo ?? ''
      }
    });
    return { ...current, output, result };
  }

  for (const e2e of [false, true]) {
    const current = runFixture({ e2e });
    try {
      assert.equal(current.result.status, 0, current.result.stderr);
      const packagedApp = path.join(current.root, 'internal', 'resofeed', 'webui', 'app.js');
      assert.equal(fs.existsSync(packagedApp), true, `${current.result.stdout}\n${current.result.stderr}`);
      assert.equal(fs.readFileSync(packagedApp, 'utf8'), 'fresh');
      assert.equal(fs.existsSync(current.output), true);
      const args = fs.readFileSync(path.join(current.root, 'go-args.log'), 'utf8');
      if (e2e) assert.match(args, /build -trimpath -tags resofeed_e2e -o/u);
      else assert.doesNotMatch(args, /-tags/u);
      assert.equal(fs.readdirSync(path.join(current.root, 'internal', 'resofeed')).some((name) => name.startsWith('.webui-stage.')), false);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  }

  for (const failure of [
    { buildFixture: 'missing' },
    { buildFixture: 'empty' },
    { buildFixture: 'invalid' },
    { failCopy: true },
    { failGo: 'test' },
    { failGo: 'build' }
  ]) {
    const current = runFixture(failure);
    try {
      assert.notEqual(current.result.status, 0, JSON.stringify(failure));
      assert.equal(fs.readFileSync(path.join(current.root, 'internal', 'resofeed', 'webui', 'old.js'), 'utf8'), 'old');
      assert.equal(fs.readdirSync(path.join(current.root, 'internal', 'resofeed')).some((name) => name.startsWith('.webui-stage.')), false);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  }
});

test('RF-BUG-010 deterministic canonical frontend build contract', () => {
  const profile = findProfile(
    'rf-bug-v2-deterministic-svelte-build-remediation',
    'rf_bug_v2_deterministic_svelte_build_green'
  );
  assert.ok(profile);
  assert.equal(profile.runner, 'deterministic-build');
  assert.deepEqual(profile.identities, ['RF-BUG-010 deterministic canonical frontend builds']);
  assert.deepEqual(profile.requiredOutput, [
    'RF-BUG-010_REPRODUCIBLE_BUILDS=green',
    'RF-BUG-010_PRODUCTION_REPEAT=identical',
    'RF-BUG-010_PRODUCTION_E2E=identical',
    'RF-BUG-010_SENTINEL_INVALIDATION=changed_and_embedded',
    'RF-BUG-010_VERSION_INPUT=fail_closed',
    'RF-BUG-010_AMBIENT_OVERRIDE=rejected',
    'RF-BUG-010_SYNCED_WORKTREE=clean',
    'RF-BUG-010_STAGE_RESIDUE=0',
    'RF-BUG-010_PROTECTED_ACCEPTANCE=unchanged'
  ]);

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-resofeed.sh'), 'utf8');
  const helperSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'resofeed-svelte-build-identity.mjs'), 'utf8');
  assert.match(scriptSource, /resofeed-svelte-build-identity\.mjs" derive/u);
  assert.match(helperSource, /scripts\/build-resofeed\.sh/u);
  assert.match(helperSource, /web\/package-lock\.json/u);
  assert.match(helperSource, /recursiveRoots = \['web\/src', 'web\/static'\]/u);
  assert.match(helperSource, /Buffer\.compare\(Buffer\.from\(left, 'utf8'\), Buffer\.from\(right, 'utf8'\)\)/u);
  assert.match(helperSource, /JSON\.stringify\(manifest\), 'utf8'/u);
  assert.match(helperSource, /\^rf-\[a-f0-9\]\{64\}\$/u);
  assert.match(scriptSource, /env -i/u);
  assert.doesNotMatch(`${scriptSource}\n${helperSource}`, /deterministic-clock|Date\.now|NODE_OPTIONS/u);

  const svelteConfig = fs.readFileSync(path.join(repoRoot, 'web', 'svelte.config.js'), 'utf8');
  assert.match(svelteConfig, /version:\s*\{\s*name: buildIdentity\s*\}/u);
  assert.match(svelteConfig, /resolveSvelteBuildIdentity/u);
  const viteConfig = fs.readFileSync(path.join(repoRoot, 'web', 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /const commitHash = buildIdentity\.slice\(3, 11\)/u);
  assert.doesNotMatch(viteConfig, /execSync|git rev-parse|process\.env\.VITE_GIT_COMMIT/u);

  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  assert.match(adapterSource, /runner: 'deterministic-build'/u);
  assert.match(adapterSource, /tracked frontend sentinel did not reach embedded binary/u);
  assert.match(adapterSource, /noncanonical private version input was accepted/u);
  const selected = invoke('select', profile.suite, profile.checkID);
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(parseSelectionOutput(selected.stdout, profile), selectionEnvelope(profile));
});

test('RF-BUG-010 generated webui baseline adapter contract', () => {
  const profile = findProfile(
    'rf-bug-v2-generated-webui-baseline-sync',
    'rf_bug_v2_generated_webui_baseline_sync_green'
  );
  assert.ok(profile);
  assert.equal(profile.runner, 'generated-webui-baseline');
  assert.deepEqual(profile.identities, ['RF-BUG-010 canonical generated webui baseline equality']);
  assert.deepEqual(profile.requiredOutput, [
    'RF-BUG-010_DEPENDENCY_SETUP=single_locked',
    'RF-BUG-010_PRODUCTION_BUILD=canonical',
    'RF-BUG-010_E2E_BUILD=canonical',
    'RF-BUG-010_WEBUI_BASELINE=exact',
    'RF-BUG-010_TRACKED_STATUS=clean',
    'RF-BUG-010_IDENTITY_CONFIG_PRODUCT=unchanged',
    'RF-BUG-010_PROTECTED_ACCEPTANCE=unchanged',
    'RF-BUG-010_STAGE_RESIDUE=0',
    'RF-BUG-010_ONE_ENVELOPE=green'
  ]);

  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-generated-baseline-contract-'));
  try {
    const build = path.join(root, 'web', 'build');
    const webui = path.join(root, 'internal', 'resofeed', 'webui');
    for (const tree of [build, webui]) {
      fs.mkdirSync(path.join(tree, '_app'), { recursive: true, mode: 0o755 });
      fs.writeFileSync(path.join(tree, 'index.html'), 'canonical\n', { mode: 0o644 });
      fs.writeFileSync(path.join(tree, '_app', 'entry.js'), 'entry\n', { mode: 0o644 });
    }
    assert.equal(generatedTreesMatch(root), true);
    fs.writeFileSync(path.join(webui, '_app', 'entry.js'), 'changed\n');
    assert.equal(generatedTreesMatch(root), false, 'byte mismatch must fail equality');
    fs.writeFileSync(path.join(webui, '_app', 'entry.js'), 'entry\n');
    fs.writeFileSync(path.join(webui, 'extra.js'), 'extra\n');
    assert.equal(generatedTreesMatch(root), false, 'extra path must fail equality');
    fs.rmSync(path.join(webui, 'extra.js'));
    fs.chmodSync(path.join(webui, '_app', 'entry.js'), 0o600);
    assert.equal(generatedTreesMatch(root), false, 'mode mismatch must fail equality');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const selected = invoke('select', profile.suite, profile.checkID);
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(parseSelectionOutput(selected.stdout, profile), selectionEnvelope(profile));
  const envelope = evidenceEnvelope({
    profile,
    outcome: 'green',
    exitCode: 0,
    observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']
  });
  assert.deepEqual(parseEvidenceOutput(JSON.stringify(envelope), profile, 'green'), envelope);
  assert.throws(
    () => parseEvidenceOutput(`${JSON.stringify(envelope)}\n${JSON.stringify(envelope)}`, profile, 'green'),
    /expected one vectl.check.evidence.v1 envelope/u
  );
});

test('RF-BUG-010 deterministic profile self-restoration contract', async (context) => {
  const profile = findProfile(
    'rf-bug-v2-deterministic-profile-self-restoration-remediation',
    'rf_bug_v2_deterministic_profile_self_restoration_green'
  );
  assert.ok(profile);
  assert.equal(profile.runner, 'deterministic-self-restoration');
  assert.deepEqual(profile.identities, ['RF-BUG-010 deterministic profile negative probes and restoration']);
  assert.throws(
    () => childEnvironment({ [BUILD_IDENTITY_ENV]: `rf-${'1'.repeat(64)}` }),
    /controlled by the trusted derivation helper/u
  );

  const rejection = probeBuildIdentityRejection(repoRoot, 'malformed-profile-input');
  assert.match(rejection, /cannot override the trusted canonical derivation/u);

  await context.test('dependency-absent bootstrap uses the locked manifest and leaves no worktree residue', () => {
    const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-dependency-bootstrap-contract-'));
    try {
      fs.mkdirSync(path.join(root, 'web'), { recursive: true });
      for (const name of ['package.json', 'package-lock.json']) {
        fs.copyFileSync(path.join(repoRoot, 'web', name), path.join(root, 'web', name));
      }
      const calls = [];
      const fakeRun = (_profile, command, args, options) => {
        calls.push({ command, args, options });
        const prefix = options.cwd;
        fs.mkdirSync(path.join(prefix, 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(prefix, 'node_modules', 'locked-marker'), 'locked\n');
      };
      const result = withLockedWebDependencies(profile, () => {
        const dependencyPath = path.join(root, 'web', 'node_modules');
        assert.equal(fs.lstatSync(dependencyPath).isSymbolicLink(), true);
        assert.equal(fs.readFileSync(path.join(dependencyPath, 'locked-marker'), 'utf8'), 'locked\n');
        return 'bootstrapped';
      }, fakeRun, root);
      assert.equal(result, 'bootstrapped');
      assert.equal(fs.existsSync(path.join(root, 'web', 'node_modules')), false);
      assert.deepEqual(calls, [{
        command: 'npm',
        args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
        options: { cwd: calls[0].options.cwd, timeout: 600_000 }
      }]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture({ preexisting }) {
    const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-restoration-contract-'));
    fs.mkdirSync(path.join(root, 'web'), { recursive: true });
    fs.mkdirSync(path.join(root, 'internal', 'resofeed'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
    if (preexisting) {
      fs.mkdirSync(path.join(root, 'web', 'build'), { recursive: true, mode: 0o750 });
      fs.writeFileSync(path.join(root, 'web', 'build', 'index.html'), 'original build\n', { mode: 0o640 });
      fs.mkdirSync(path.join(root, 'internal', 'resofeed', 'webui'), { recursive: true, mode: 0o751 });
      fs.writeFileSync(path.join(root, 'internal', 'resofeed', 'webui', 'app.js'), 'original webui\n', { mode: 0o600 });
    }
    for (const args of [
      ['init', '-q'],
      ['add', '.'],
      ['-c', 'user.name=ResoFeed Test', '-c', 'user.email=resofeed@example.test', 'commit', '-qm', 'fixture']
    ]) {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const readStatus = () => {
      const result = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    return { root, readStatus, before: captureGeneratedTreeState(root) };
  }

  function mutate(current) {
    fs.mkdirSync(path.join(current.root, 'web', 'build'), { recursive: true });
    fs.writeFileSync(path.join(current.root, 'web', 'build', 'generated.js'), 'mutated\n');
    fs.mkdirSync(path.join(current.root, 'internal', 'resofeed', 'webui'), { recursive: true });
    fs.writeFileSync(path.join(current.root, 'internal', 'resofeed', 'webui', 'generated.js'), 'mutated\n');
    fs.mkdirSync(path.join(current.root, 'internal', 'resofeed', '.webui-stage.failure'));
  }

  await context.test('negative rejection preserves the primary failure and preexisting trees', () => {
    const current = fixture({ preexisting: true });
    try {
      const originalFailure = new Error('negative-probe-original-failure');
      assert.throws(() => withGeneratedTreeRestoration(current.root, () => {
        mutate(current);
        probeBuildIdentityRejection(repoRoot, '', () => ({ status: 1, stdout: '', stderr: 'trusted rejection' }));
        throw originalFailure;
      }, current.readStatus), (error) => error === originalFailure);
      assert.deepEqual(captureGeneratedTreeState(current.root), current.before);
      assert.equal(current.readStatus(), '');
      assert.deepEqual(fs.readdirSync(path.join(current.root, 'internal', 'resofeed')).filter((name) => name.startsWith('.webui-stage.')), []);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await context.test('later deterministic failure restores absent trees', () => {
    const current = fixture({ preexisting: false });
    try {
      assert.throws(() => withGeneratedTreeRestoration(current.root, () => {
        mutate(current);
        throw new Error('later-deterministic-check-failure');
      }, current.readStatus), /later-deterministic-check-failure/u);
      assert.deepEqual(captureGeneratedTreeState(current.root), current.before);
      assert.equal(current.readStatus(), '');
      assert.deepEqual(fs.readdirSync(path.join(current.root, 'internal', 'resofeed')).filter((name) => name.startsWith('.webui-stage.')), []);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await context.test('successful profile work restores exact trees and emits one envelope', () => {
    const current = fixture({ preexisting: true });
    try {
      const result = withGeneratedTreeRestoration(current.root, () => {
        mutate(current);
        return 'green';
      }, current.readStatus);
      assert.equal(result, 'green');
      assert.deepEqual(captureGeneratedTreeState(current.root), current.before);
      assert.equal(current.readStatus(), '');
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }

    const envelope = evidenceEnvelope({
      profile,
      outcome: 'green',
      exitCode: 0,
      observations: [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']
    });
    const output = `${JSON.stringify(envelope)}\n`;
    const parsed = parseEvidenceOutput(output, profile, 'green');
    assert.deepEqual(parsed.selected_ids, profile.identities);
    assert.deepEqual(parsed.executed_ids, profile.identities);
    assert.equal(output.trim().split(/\r?\n/u).length, 1);
    assert.throws(() => parseEvidenceOutput(`${output}${output}`, profile, 'green'), /expected one vectl.check.evidence.v1 envelope/u);
  });
});

test('RF-BUG-010 deterministic adapter identity integration contract', () => {
  const profile = findProfile(
    'rf-bug-v2-deterministic-adapter-identity-integration-remediation',
    'rf_bug_v2_deterministic_adapter_identity_integration_green'
  );
  assert.ok(profile);
  assert.equal(profile.runner, 'identity-integration');
  assert.deepEqual(profile.identities, ['RF-BUG-010 deterministic adapter identity integration']);

  const identity = deriveSvelteBuildIdentity(repoRoot);
  assert.match(identity, /^rf-[a-f0-9]{64}$/u);
  assert.equal(deriveSvelteBuildIdentity(repoRoot), identity);
  const manifest = canonicalBuildManifest(repoRoot);
  const paths = manifest.map(([relativePath]) => relativePath);
  assert.deepEqual(paths, [...paths].sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))));
  assert.equal(paths.every((relativePath) => !relativePath.includes('\\')), true);

  const helperPath = path.join(repoRoot, 'scripts', 'resofeed-svelte-build-identity.mjs');
  const cli = spawnSync(process.execPath, [helperPath, 'derive', repoRoot], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnvironment()
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, identity);

  const npmEnvironment = childEnvironmentForCommand('npm');
  assert.equal(npmEnvironment[BUILD_IDENTITY_ENV], identity);
  assert.equal(BUILD_IDENTITY_ENV in childEnvironmentForCommand('node'), false);
  assert.throws(
    () => childEnvironmentForCommand('npm', { [BUILD_IDENTITY_ENV]: 'rf-user-selected' }),
    /controlled by the trusted derivation helper/u
  );
  assert.throws(
    () => resolveSvelteBuildIdentity(repoRoot, {}),
    /trusted derivation is missing/u
  );
  assert.throws(
    () => resolveSvelteBuildIdentity(repoRoot, { [BUILD_IDENTITY_ENV]: `rf-${'0'.repeat(64)}` }),
    /cannot override the trusted canonical derivation/u
  );

  const fixtureRoot = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-identity-contract-'));
  try {
    for (const relativePath of ['scripts/build-resofeed.sh', 'web/package-lock.json', 'web/package.json', 'web/svelte.config.js', 'web/tsconfig.json', 'web/vite.config.ts']) {
      const destination = path.join(fixtureRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, relativePath), destination);
    }
    fs.cpSync(path.join(repoRoot, 'web', 'src'), path.join(fixtureRoot, 'web', 'src'), { recursive: true });
    fs.cpSync(path.join(repoRoot, 'web', 'static'), path.join(fixtureRoot, 'web', 'static'), { recursive: true });
    const baseline = deriveSvelteBuildIdentity(fixtureRoot);
    const sentinelPath = path.join(fixtureRoot, 'web', 'src', 'app.html');
    fs.appendFileSync(sentinelPath, '\n<!-- deterministic-identity-sentinel -->\n');
    const changed = deriveSvelteBuildIdentity(fixtureRoot);
    assert.notEqual(changed, baseline);
    assert.equal(deriveSvelteBuildIdentity(fixtureRoot), changed);
    fs.rmSync(path.join(fixtureRoot, 'web', 'package-lock.json'));
    assert.throws(() => deriveSvelteBuildIdentity(fixtureRoot), /missing deterministic build input/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const buildScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-resofeed.sh'), 'utf8');
  assert.match(buildScript, /resofeed-svelte-build-identity\.mjs" derive/u);
  assert.doesNotMatch(buildScript, /const explicitFiles|createHash\('sha256'\)/u);
  for (const configPath of ['web/svelte.config.js', 'web/vite.config.ts']) {
    assert.match(fs.readFileSync(path.join(repoRoot, configPath), 'utf8'), /resolveSvelteBuildIdentity/u);
  }
  assert.match(fs.readFileSync(path.join(repoRoot, 'web/playwright.base.config.ts'), 'utf8'), /installSvelteBuildIdentity/u);

  const fixtureSource = fs.readFileSync(path.join(repoRoot, 'web/tests/e2e/fixtures/runtime-fixture.ts'), 'utf8');
  assert.match(fixtureSource, /scripts['"], ['"]build-resofeed\.sh/u);
  assert.match(fixtureSource, /\['--e2e', binaryPath\]/u);
  assert.match(fixtureSource, /RESOFEED_E2E: '1'/u);
  assert.doesNotMatch(fixtureSource, /spawnSync\(\s*['"]go['"]|\['build', '-tags', 'resofeed_e2e'/u);
});

test('RF-BUG-002 token parity harness adapter contract', () => {
  const profile = findProfile('rf-bug-v2-go-token-parity', 'rf_bug_v2_go_token_parity_green');
  const strict = findProfile('rf-bug-v2-prompting-harness', 'rf_bug_v2_prompting_harness_remediation_green');
  assert.ok(profile);
  assert.ok(strict);
  assert.equal(profile.runner, 'token-parity');
  assert.deepEqual(profile.identities, [
    'RF-BUG-002 canonical HTTP MCP parity',
    'RF-BUG-002 opaque item ID API paths 30'
  ]);
  assert.deepEqual(profile.commands, [{
    argv: ['go', 'test', '-tags', 'resofeed_e2e', '-v', './internal/resofeed', '-run', '^(TestRFBUG002OpaqueItemIDAPIPaths|TestRFBUG002CanonicalHTTPMCPParity)$', '-count=1'],
    env: { RESOFEED_E2E: '1' }
  }]);
  assert.equal('RESOFEED_E2E' in childEnvironment(), false, 'general child environment must remain strict');

  const strictEnvelope = evidenceEnvelope({
    profile: strict,
    outcome: 'green',
    exitCode: 0,
    observations: [...strict.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']
  });
  const parityOutput = [
    '=== RUN   TestRFBUG002OpaqueItemIDAPIPaths',
    'RF_BUG_002_API_SUBTESTS=30',
    '--- PASS: TestRFBUG002OpaqueItemIDAPIPaths',
    '=== RUN   TestRFBUG002CanonicalHTTPMCPParity',
    'RF_BUG_002_CANONICAL_HTTP_REJECTION=complete',
    '--- PASS: TestRFBUG002CanonicalHTTPMCPParity',
    'PASS'
  ].join('\n');
  const calls = [];
  const fakeRun = (_profile, command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'node' && args[0] === '--test') return 'RF-BUG-002 token parity harness adapter contract';
    if (command === 'node') return `${JSON.stringify(strictEnvelope)}\n`;
    return parityOutput;
  };

  const result = runTokenParityHarness(profile, fakeRun);
  assert.equal(result.outcome, 'green');
  assert.deepEqual(result.observations, [...profile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], {
    command: 'node',
    args: ['--test', '--test-name-pattern=RF-BUG-002 token parity harness adapter contract', 'scripts/vectl-check.test.mjs'],
    options: { timeout: 240_000, env: { RESOFEED_E2E: null } }
  });
  assert.deepEqual(calls[1], {
    command: 'node',
    args: ['scripts/vectl-check.mjs', 'run', 'rf-bug-v2-prompting-harness', 'rf_bug_v2_prompting_harness_remediation_green'],
    options: { timeout: 900_000, env: { RESOFEED_E2E: null } }
  });
  assert.deepEqual(calls[2], {
    command: 'go',
    args: ['test', '-tags', 'resofeed_e2e', '-v', './internal/resofeed', '-run', '^(TestRFBUG002OpaqueItemIDAPIPaths|TestRFBUG002CanonicalHTTPMCPParity)$', '-count=1'],
    options: { timeout: 900_000, env: { RESOFEED_E2E: '1' } }
  });

  const envelopeOutput = `${JSON.stringify(evidenceEnvelope({ profile, ...result }))}\n`;
  assert.equal(envelopeOutput.trim().split(/\r?\n/u).length, 1, 'token parity run must emit one envelope');
  const parsed = parseEvidenceOutput(envelopeOutput, profile, 'green');
  assert.deepEqual(parsed.selected_ids, profile.identities);
  assert.deepEqual(parsed.executed_ids, profile.identities);
  assert.equal(parsed.selected_ids.length, 2);
  assert.throws(
    () => parseEvidenceOutput(`${envelopeOutput}${envelopeOutput}`, profile, 'green'),
    /expected one vectl.check.evidence.v1 envelope/u
  );

  const invalidNestedRun = (_profile, command, args) => {
    if (command === 'node' && args[0] === '--test') return 'RF-BUG-002 token parity harness adapter contract';
    if (command === 'node') return '{"schema_version":"vectl.check.evidence.v1"}\n';
    return parityOutput;
  };
  assert.throws(
    () => runTokenParityHarness(profile, invalidNestedRun),
    /evidence envelope did not match the requested profile/u
  );

  const missingStrictMarker = { ...strictEnvelope, observations: strictEnvelope.observations.filter((marker) => marker !== 'TestOutboundE2EFixturePolicy') };
  const missingStrictRun = (_profile, command, args) => {
    if (command === 'node' && args[0] === '--test') return 'RF-BUG-002 token parity harness adapter contract';
    if (command === 'node') return `${JSON.stringify(missingStrictMarker)}\n`;
    return parityOutput;
  };
  assert.throws(
    () => runTokenParityHarness(profile, missingStrictRun),
    /nested Prompting\/outbound strict harness evidence missed TestOutboundE2EFixturePolicy/u
  );

  const forbiddenRun = (_profile, command, args) => {
    if (command === 'node' && args[0] === '--test') return 'RF-BUG-002 token parity harness adapter contract';
    if (command === 'node') return `${JSON.stringify(strictEnvelope)}\n`;
    return `${parityOutput}\nno tests to run`;
  };
  assert.throws(
    () => runTokenParityHarness(profile, forbiddenRun),
    /token parity fixture emitted forbidden marker: no tests to run/u
  );
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

test('RF-BUG closure authority aggregation false-green guard', () => {
  const profile = findProfile('rf-bug-v2-closure-report', 'rf_bug_v2_defect_report_closure_green');
  assert.ok(profile);
  assert.equal(profile.runner, 'closure-report');
  assert.deepEqual(profile.identities, [
    'RF-BUG-001-010 active source scans',
    'RF-BUG-001-010 closure contract'
  ]);
  assert.deepEqual(profile.commands, [
    ['go', 'test', '-v', './tests', '-run', '^TestRFBugCanonicalContracts$', '-count=1'],
    ['npm', '--prefix', 'web', 'run', 'test:render', '--', '--reporter=verbose', 'src/lib/api-client.test.ts']
  ]);

  const goOutput = [
    '=== RUN   TestRFBugCanonicalContracts',
    '    rf_bug_canonical_contract_test.go:170: RF_BUG_CANONICAL_DOCUMENTS=9',
    '    rf_bug_canonical_contract_test.go:171: OPML_EXCLUSIONS=2',
    '--- PASS: TestRFBugCanonicalContracts (0.00s)',
    'PASS'
  ].join('\n');
  const webOutput = [
    'stdout | src/lib/api-client.test.ts > ResoFeed API client and rendered sinks > keeps all nine active documents free of OPML export capabilities',
    'OPML_ACTIVE_DOCUMENTS=9',
    ' ✓ src/lib/api-client.test.ts > ResoFeed API client and rendered sinks > keeps all nine active documents free of OPML export capabilities 7ms'
  ].join('\n');
  assert.doesNotThrow(() => validateClosureAuthorityOutputs(goOutput, webOutput));
  assert.equal(inventoryClosureRequirements(repoRoot), 'RF_BUG_CLOSURE_REQUIREMENTS=10');

  for (const invalidGo of [
    '',
    '[no tests to run]',
    'RF_BUG_CANONICAL_DOCUMENTS=9\nOPML_EXCLUSIONS=2\nPASS',
    goOutput.replace('RF_BUG_CANONICAL_DOCUMENTS=9', 'RF_BUG_CANONICAL_DOCUMENTS=8')
  ]) {
    assert.throws(() => validateClosureAuthorityOutputs(invalidGo, webOutput), /authority output/u);
  }
  for (const invalidWeb of [
    '',
    '[no tests to run]',
    'OPML_ACTIVE_DOCUMENTS=9\nPASS',
    webOutput.replace('OPML_ACTIVE_DOCUMENTS=9', 'OPML_ACTIVE_DOCUMENTS=8')
  ]) {
    assert.throws(() => validateClosureAuthorityOutputs(goOutput, invalidWeb), /authority output/u);
  }

  const fixtureRoot = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-closure-inventory-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'docs'));
    const complete = Array.from({ length: 10 }, (_, index) => `## RF-BUG-${String(index + 1).padStart(3, '0')} — contract`).join('\n');
    fs.writeFileSync(path.join(fixtureRoot, 'docs', 'BUG_REPORT_2026-07-11.md'), complete);
    fs.writeFileSync(path.join(fixtureRoot, 'docs', 'BUG_FIX_PLAN_2026-07-12.md'), complete.replace('## RF-BUG-010 — contract', ''));
    assert.throws(() => inventoryClosureRequirements(fixtureRoot), /exact RF-BUG-001 through RF-BUG-010 heading inventory/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
    '.agents/skills/resofeed-tailnet-deploy/SKILL.md',
    'deploy/resofeed-caddy/.env.example',
    'deploy/resofeed-caddy/README.md',
    'deploy/resofeed-caddy/compose.yml',
    'deploy/resofeed-caddy/deploy.sh',
    'docs/ARCHITECTURE.md',
    'docs/CONTAINER.md',
    'docs/DESIGN.md',
    'docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md',
    'docs/USAGE.md',
    'internal/resofeed/doctor.go',
    'internal/resofeed/doctor_test.go',
    'internal/resofeed/ingest.go',
    'internal/resofeed/playwright_fixture_test.go',
    'internal/resofeed/rf_bug_opml_import_only_test.go',
    'scripts/build-resofeed.sh',
    'scripts/rf-bug-010-standard-json.mjs',
    'scripts/resofeed-svelte-build-identity.mjs',
    'scripts/vectl-check.mjs',
    'scripts/vectl-check.test.mjs',
    'web/svelte.config.js',
    'web/vite.config.ts',
    'web/src/lib/playwright-e2e-harness-contract.ts',
    'web/src/lib/__tests__/playwright-e2e-harness-contract.test.ts',
    'web/tests/e2e/fixtures/runtime-fixture.ts',
    'web/tests/e2e/fixtures/test-db.ts',
    'web/tests/e2e/global-setup.ts',
    'web/playwright.base.config.ts',
    'web/playwright.browser-contract.config.ts',
    'web/playwright.ci-safe.config.ts',
    'web/playwright.smoke.config.ts',
    'web/playwright.runtime.config.ts'
  ]);
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }
  });
  assert.equal(result.status, 0, result.stderr);

  const changed = result.stdout.split('\0').filter(Boolean).map((row) => row.slice(3));
  for (const changedPath of changed) {
    assert.ok(
      allowed.has(changedPath) || changedPath.startsWith('internal/resofeed/webui/'),
      `protected or out-of-scope path changed: ${changedPath}`
    );
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
