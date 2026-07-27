import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  runNative,
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
  const procedureCommit = 'c'.repeat(40);
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
  const separatelyAuthorizedServeRepair = 'tailscale serve --yes --bg --tcp=443 tcp://127.0.0.1:8443';
  for (const relativePath of [
    '.agents/skills/resofeed-tailnet-deploy/SKILL.md',
    'deploy/resofeed-caddy/README.md',
    'docs/CONTAINER.md',
    'docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md'
  ]) {
    assert.equal(
      sources[relativePath].split(separatelyAuthorizedServeRepair).length - 1,
      1,
      `${relativePath} must document the separately authorized noninteractive repair exactly once`
    );
  }
  for (const relativePath of [
    'deploy/resofeed-caddy/deploy.sh',
    'deploy/resofeed-caddy/verify.sh',
    'deploy/resofeed-caddy/verify-remote.sh'
  ]) {
    assert.equal(sources[relativePath].includes(separatelyAuthorizedServeRepair), false);
  }

  function executable(filePath, lines) {
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
    fs.chmodSync(filePath, 0o755);
  }

  function fileSHA256(filePath) {
    return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
  }

  const stagedDeployPath = path.join(repoRoot, 'deploy', 'resofeed-caddy', 'deploy.sh');
  const stagedComposePath = path.join(repoRoot, 'deploy', 'resofeed-caddy', 'compose.yml');
  assert.equal(fileSHA256(stagedDeployPath), 'sha256:e27bc178546bdc0e0410a18a55d6501bc38ff3122b5782db9c7e94754380ff27');
  assert.equal(fileSHA256(stagedComposePath), 'sha256:eaefdf63415a722a426a33a48e46f5c7ab9bce9304628fd4547695f5f672517c');
  assert.equal(fs.statSync(stagedDeployPath).mode & 0o777, 0o755);
  assert.equal(fs.statSync(stagedComposePath).mode & 0o777, 0o644);

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
    remoteHostname = 'unknown-internal-host',
    attachedHead = false
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
    if (!attachedHead) {
      checked('git', ['checkout', '--detach', '-q', sourceCommit], { cwd: sourceRoot });
    }
    const sourceRef = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], {
      cwd: sourceRoot,
      encoding: 'utf8'
    });
    assert.equal(sourceRef.status, attachedHead ? 0 : 1);
    assert.equal(checked('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot }), sourceCommit);
    assert.equal(checked('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: sourceRoot }), '');

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

  const attached = procedureStagingFixture({ attachedHead: true });
  try {
    const attachedRef = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], {
      cwd: attached.sourceRoot,
      encoding: 'utf8'
    });
    assert.equal(attachedRef.status, 0);
    assert.equal(checked('git', ['rev-parse', 'HEAD'], { cwd: attached.sourceRoot }), attached.sourceCommit);
    assert.equal(checked('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: attached.sourceRoot }), '');
    const result = attached.runStage();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source HEAD must be detached/u);
    assert.equal(fs.readFileSync(attached.sshAttemptLog, 'utf8'), '');
    assert.equal(fs.readFileSync(attached.sshLog, 'utf8'), '');
    assert.equal(fs.readFileSync(path.join(attached.remoteStack, 'deploy.sh'), 'utf8'), attached.priorDeploy);
    assert.equal(fs.readFileSync(path.join(attached.remoteStack, 'compose.yml'), 'utf8'), attached.priorCompose);
    assert.equal(fs.existsSync(path.join(attached.remoteStack, '.resofeed-procedure-transaction.lock')), false);
    assert.equal(fs.existsSync(path.join(attached.remoteStack, '.resofeed-procedure-backups')), false);
  } finally {
    fs.rmSync(attached.root, { recursive: true, force: true });
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

  function deploymentFixture({
    failReplacementReadiness = false,
    invalidProcedureIdentity = false,
    noRollback = false,
    hasPrior = true,
    failComposeCommand = '',
    routeState = 'canonical',
    labelState = 'spaced-valid',
    procedureSourceCommit = procedureCommit
  } = {}) {
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
    const tailscaleLog = path.join(root, 'tailscale.log');
    fs.writeFileSync(statePath, hasPrior ? `${priorImage}\n` : '');
    fs.writeFileSync(dockerLog, '');
    fs.writeFileSync(tailscaleLog, '');

    executable(path.join(fakeBin, 'hostname'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" tefx-mbp-personal'
    ]);
    executable(path.join(fakeBin, 'sleep'), ['#!/usr/bin/env bash', 'exit 0']);
    executable(path.join(fakeBin, 'tailscale'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_TAILSCALE_LOG"',
      'if [[ "$1" == "ip" ]]; then printf "%s\\n" 100.64.0.8; exit 0; fi',
      'if [[ "$1 $2 $3" == "serve status --json" ]]; then',
      '  case "$FAKE_ROUTE_STATE" in',
      '    canonical) printf \'%s\\n\' \'{"TCP":{"443":{"TCPForward":"127.0.0.1:8443"}},"Version":"fixture"}\' ;;',
      '    absent) printf \'%s\\n\' \'{"TCP":{}}\' ;;',
      '    malformed) printf \'%s\\n\' \'{"TCP":\' ;;',
      '    duplicate) printf \'%s\\n\' \'{"TCP":{"443":{"TCPForward":"127.0.0.1:8443"},"443":{"TCPForward":"127.0.0.1:8443"}}}\' ;;',
      '    drifted) printf \'%s\\n\' \'{"TCP":{"443":{"TCPForward":"127.0.0.1:9443"}}}\' ;;',
      '    *) exit 96 ;;',
      '  esac',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "serve status" ]]; then printf "%s\\n" "TCP 443 -> tcp://127.0.0.1:8443"; exit 0; fi',
      'if [[ "$1" == "serve" ]]; then exit 97; fi',
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
      '    case "$FAKE_LABEL_STATE" in',
      '      spaced-valid) printf \'{ "fixture.other" : "retained", "org.opencontainers.image.revision" : "%s" }\\n\' "$FAKE_COMMIT" ;;',
      '      malformed) printf \'{ "org.opencontainers.image.revision" : \' ;;',
      '      nonobject) printf \'["fixture-label-value"]\\n\' ;;',
      '      wrongtype) printf \'{ "org.opencontainers.image.revision" : 8675309 }\\n\' ;;',
      '      missing) printf \'{ "fixture.other" : "fixture-label-value" }\\n\' ;;',
      '      wrongvalue) printf \'{ "org.opencontainers.image.revision" : "sensitive-wrong-revision" }\\n\' ;;',
      '      duplicate) printf \'{ "org.opencontainers.image.revision" : "%s", "org.opencontainers.image.revision" : "%s" }\\n\' "$FAKE_COMMIT" "$FAKE_COMMIT" ;;',
      '      *) exit 95 ;;',
      '    esac',
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
      '  current=$(cat "$FAKE_STATE")',
      '  [[ -n "$current" ]] || exit 1',
      '  if [[ " $* " == *" --format "* ]]; then',
      '    if [[ "$*" == *".Config.Image"* ]]; then cat "$FAKE_STATE"; exit 0; fi',
      '    if [[ "$*" == *".Image"* ]]; then printf "%s\\n" sha256:fixture-image-id; exit 0; fi',
      '    if [[ "$*" == *".Mounts"* ]]; then printf "%s\\n" "resofeed-caddy_resofeed-data | /data"; exit 0; fi',
      '  fi',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "image inspect" ]]; then printf "%s\\n" "$FAKE_PRIOR_IMAGE"; exit 0; fi',
      'if [[ "$1" == "compose" ]]; then',
      '  if [[ -n "${FAKE_FAIL_COMPOSE_COMMAND:-}" && " $* " == *" $FAKE_FAIL_COMPOSE_COMMAND "* ]]; then exit 88; fi',
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
      FAKE_TAILSCALE_LOG: tailscaleLog,
      FAKE_COMMIT: commit,
      FAKE_INDEX_DIGEST: indexDigest,
      FAKE_AMD64_DIGEST: amd64Digest,
      FAKE_ARM64_DIGEST: arm64Digest,
      FAKE_PRIOR_IMAGE: priorImage,
      FAKE_TARGET_IMAGE: targetImage,
      FAKE_FAIL_READINESS: failReplacementReadiness ? '1' : '0',
      FAKE_FAIL_COMPOSE_COMMAND: failComposeCommand,
      FAKE_ROUTE_STATE: routeState,
      FAKE_LABEL_STATE: labelState
    };
    const procedureDeployHash = fileSHA256(path.join(stack, 'deploy.sh'));
    const procedureComposeHash = fileSHA256(path.join(stack, 'compose.yml'));
    const procedureArguments = [
      '--procedure-source-commit', procedureSourceCommit,
      '--procedure-deploy-sha256', invalidProcedureIdentity ? `sha256:${'f'.repeat(64)}` : procedureDeployHash,
      '--procedure-compose-sha256', procedureComposeHash
    ];
    const deploymentArguments = [
      ...(noRollback ? ['--no-rollback'] : []),
      ...ociArguments,
      ...procedureArguments
    ];
    const run = (args = deploymentArguments) => spawnSync(path.join(stack, 'deploy.sh'), args, {
      cwd: stack,
      encoding: 'utf8',
      env: environment
    });
    const result = run();
    return {
      root,
      stack,
      envPath,
      statePath,
      dockerLog,
      tailscaleLog,
      environment,
      priorImage,
      targetImage,
      procedureDeployHash,
      procedureComposeHash,
      deploymentArguments,
      run,
      result
    };
  }

  for (const labelState of ['malformed', 'nonobject', 'wrongtype', 'missing', 'wrongvalue', 'duplicate']) {
    const labelRejected = deploymentFixture({ labelState });
    try {
      assert.equal(labelRejected.result.status, 1, labelState);
      assert.match(labelRejected.result.stderr, /OCI platform image is not bound to the verified commit/u);
      assert.equal(fs.readFileSync(labelRejected.statePath, 'utf8').trim(), labelRejected.priorImage);
      assert.doesNotMatch(fs.readFileSync(labelRejected.dockerLog, 'utf8'), /^compose /mu);
      assert.doesNotMatch(
        labelRejected.result.stdout + labelRejected.result.stderr,
        /(?:org\.opencontainers\.image\.revision|fixture-label-value|8675309|sensitive-wrong-revision)/u
      );
    } finally {
      fs.rmSync(labelRejected.root, { recursive: true, force: true });
    }
  }

  const identityRejected = deploymentFixture({ invalidProcedureIdentity: true });
  try {
    assert.equal(identityRejected.result.status, 1);
    assert.match(identityRejected.result.stderr, /caller-bound procedure SHA-256/u);
    assert.equal(fs.readFileSync(identityRejected.dockerLog, 'utf8'), '');
    assert.equal(fs.readFileSync(identityRejected.statePath, 'utf8').trim(), identityRejected.priorImage);
  } finally {
    fs.rmSync(identityRejected.root, { recursive: true, force: true });
  }

  const successful = deploymentFixture();
  try {
    assert.equal(successful.result.status, 0, successful.result.stderr);
    assert.equal(fs.readFileSync(successful.statePath, 'utf8').trim(), successful.targetImage);
    const deployedEnv = fs.readFileSync(successful.envPath, 'utf8');
    assert.match(deployedEnv, new RegExp(`^RESOFEED_IMAGE=${successful.targetImage}$`, 'mu'));
    assert.match(deployedEnv, /^CF_API_TOKEN=fixture-present$/mu);
    assert.match(successful.result.stdout, /READINESS=root_200_doctor_401/u);
    assert.match(successful.result.stdout, new RegExp(`PROCEDURE_SOURCE_COMMIT=${procedureCommit}`, 'u'));
    assert.match(successful.result.stdout, new RegExp(`OCI_APPLICATION_SOURCE_COMMIT=${commit}`, 'u'));
    assert.match(successful.result.stdout, /RESULT_CLASSIFICATION=success/u);
    assert.doesNotMatch(successful.result.stdout + successful.result.stderr, /fixture-present/u);
    assert.doesNotMatch(fs.readFileSync(successful.dockerLog, 'utf8'), /(?:down|volume rm|--volumes)/u);
    assert.deepEqual(
      fs.readFileSync(successful.tailscaleLog, 'utf8').trim().split('\n'),
      ['serve status', 'serve status'],
      'the unchanged staged deploy procedure must observe the canonical route without mutating Serve'
    );

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

  const failed = deploymentFixture({ failReplacementReadiness: true });
  try {
    assert.equal(failed.result.status, 1);
    assert.equal(fs.readFileSync(failed.statePath, 'utf8').trim(), failed.priorImage);
    assert.match(fs.readFileSync(failed.envPath, 'utf8'), new RegExp(`^RESOFEED_IMAGE=${failed.priorImage}$`, 'mu'));
    assert.match(failed.result.stderr, /ROLLBACK=prior_digest_and_readiness restored/u);
    assert.match(failed.result.stderr, /RESULT_CLASSIFICATION=no_effect/u);
    assert.doesNotMatch(fs.readFileSync(failed.dockerLog, 'utf8'), /(?:down|volume rm|--volumes)/u);
    assert.doesNotMatch(fs.readFileSync(failed.tailscaleLog, 'utf8'), /--yes|--bg|--tcp/u);
  } finally {
    fs.rmSync(failed.root, { recursive: true, force: true });
  }

  const defaultWithoutPrior = deploymentFixture({ hasPrior: false });
  try {
    assert.equal(defaultWithoutPrior.result.status, 1);
    assert.match(defaultWithoutPrior.result.stderr, /Default deployment requires a recoverable prior image digest/u);
    assert.match(defaultWithoutPrior.result.stderr, /RESULT_CLASSIFICATION=no_effect/u);
    assert.equal(fs.readFileSync(defaultWithoutPrior.statePath, 'utf8'), '');
    assert.doesNotMatch(fs.readFileSync(defaultWithoutPrior.dockerLog, 'utf8'), /compose .* (?:pull|up) /u);
  } finally {
    fs.rmSync(defaultWithoutPrior.root, { recursive: true, force: true });
  }

  const forwardOnly = deploymentFixture({ noRollback: true, hasPrior: false });
  try {
    assert.equal(forwardOnly.result.status, 0, forwardOnly.result.stderr);
    assert.equal(fs.readFileSync(forwardOnly.statePath, 'utf8').trim(), forwardOnly.targetImage);
    assert.match(forwardOnly.result.stdout, /NO_ROLLBACK=explicit_forward_only/u);
    assert.match(forwardOnly.result.stdout, /ROLLBACK=explicit_forward_only/u);
    assert.match(forwardOnly.result.stdout, /SQLITE_VOLUME=preserved/u);
    assert.match(forwardOnly.result.stdout, new RegExp(`PROCEDURE_SOURCE_COMMIT=${procedureCommit}`, 'u'));
    assert.match(forwardOnly.result.stdout, new RegExp(`OCI_APPLICATION_SOURCE_COMMIT=${commit}`, 'u'));
    assert.match(forwardOnly.result.stdout, /RESULT_CLASSIFICATION=success/u);
    assert.doesNotMatch(forwardOnly.result.stdout + forwardOnly.result.stderr, /fixture-present/u);
    const dockerEvidence = fs.readFileSync(forwardOnly.dockerLog, 'utf8');
    assert.doesNotMatch(dockerEvidence, /image inspect/u);
    assert.doesNotMatch(dockerEvidence, /(?:down|volume rm|--volumes|restart|--force-recreate|--always-recreate-deps)/u);
    const composeArgv = dockerEvidence.split('\n').filter((line) => line.startsWith('compose '));
    assert.deepEqual(composeArgv, [
      'compose --env-file .env -f compose.yml config --quiet resofeed',
      'compose --env-file .env -f compose.yml pull resofeed',
      'compose --env-file .env -f compose.yml up -d --no-build --no-deps resofeed'
    ]);
    assert.ok(composeArgv.every((line) => !/(?:^| )caddy(?: |$)/u.test(line)));
    assert.deepEqual(fs.readFileSync(forwardOnly.tailscaleLog, 'utf8').trim().split('\n'), ['serve status --json']);
  } finally {
    fs.rmSync(forwardOnly.root, { recursive: true, force: true });
  }

  for (const routeState of ['absent', 'malformed', 'duplicate', 'drifted']) {
    const routeRejected = deploymentFixture({ noRollback: true, hasPrior: false, routeState });
    try {
      assert.equal(routeRejected.result.status, 1, routeState);
      assert.match(routeRejected.result.stderr, /canonical duplicate-free Tailscale Serve JSON route/u);
      assert.match(routeRejected.result.stderr, /RESULT_CLASSIFICATION=no_effect/u);
      assert.equal(fs.readFileSync(routeRejected.statePath, 'utf8'), '');
      assert.equal(
        fs.readFileSync(routeRejected.envPath, 'utf8').includes(`RESOFEED_IMAGE=${routeRejected.targetImage}`),
        false
      );
      const dockerEvidence = fs.readFileSync(routeRejected.dockerLog, 'utf8');
      assert.doesNotMatch(dockerEvidence, /^compose /mu);
      assert.deepEqual(fs.readFileSync(routeRejected.tailscaleLog, 'utf8').trim().split('\n'), ['serve status --json']);
      assert.doesNotMatch(fs.readFileSync(routeRejected.tailscaleLog, 'utf8'), /(?:--yes|--bg|--tcp)/u);
    } finally {
      fs.rmSync(routeRejected.root, { recursive: true, force: true });
    }
  }

  const forwardKnownPartial = deploymentFixture({
    noRollback: true,
    hasPrior: false,
    failComposeCommand: 'pull'
  });
  try {
    assert.equal(forwardKnownPartial.result.status, 1);
    assert.match(forwardKnownPartial.result.stderr, /ROLLBACK=suppressed_by_explicit_no_rollback/u);
    assert.match(forwardKnownPartial.result.stderr, /RESULT_CLASSIFICATION=known_partial/u);
    assert.equal(fs.readFileSync(forwardKnownPartial.statePath, 'utf8'), '');
    assert.doesNotMatch(fs.readFileSync(forwardKnownPartial.dockerLog, 'utf8'), /compose .* up /u);
  } finally {
    fs.rmSync(forwardKnownPartial.root, { recursive: true, force: true });
  }

  const forwardUnknownPartial = deploymentFixture({
    noRollback: true,
    hasPrior: false,
    failReplacementReadiness: true
  });
  try {
    assert.equal(forwardUnknownPartial.result.status, 1);
    assert.equal(fs.readFileSync(forwardUnknownPartial.statePath, 'utf8').trim(), forwardUnknownPartial.targetImage);
    assert.match(forwardUnknownPartial.result.stderr, /ROLLBACK=suppressed_by_explicit_no_rollback/u);
    assert.match(forwardUnknownPartial.result.stderr, /RESULT_CLASSIFICATION=unknown_partial/u);
    const dockerEvidence = fs.readFileSync(forwardUnknownPartial.dockerLog, 'utf8');
    assert.equal((dockerEvidence.match(/compose .* up -d --no-build --no-deps resofeed/gu) ?? []).length, 1);
    assert.doesNotMatch(dockerEvidence, new RegExp(priorIndexDigest, 'u'));
    assert.doesNotMatch(dockerEvidence, /(?:down|volume rm|--volumes)/u);
  } finally {
    fs.rmSync(forwardUnknownPartial.root, { recursive: true, force: true });
  }

  const equalSourceIdentities = deploymentFixture({
    noRollback: true,
    hasPrior: false,
    procedureSourceCommit: commit
  });
  try {
    assert.equal(equalSourceIdentities.result.status, 0, equalSourceIdentities.result.stderr);
    assert.match(equalSourceIdentities.result.stdout, new RegExp(`PROCEDURE_SOURCE_COMMIT=${commit}`, 'u'));
    assert.match(equalSourceIdentities.result.stdout, new RegExp(`OCI_APPLICATION_SOURCE_COMMIT=${commit}`, 'u'));
  } finally {
    fs.rmSync(equalSourceIdentities.root, { recursive: true, force: true });
  }

  const parserFixture = deploymentFixture({ noRollback: true, hasPrior: false });
  try {
    const withoutPair = (args, option) => {
      const index = args.indexOf(option);
      return index < 0 ? [...args] : [...args.slice(0, index), ...args.slice(index + 2)];
    };
    const replaceValue = (args, option, value) => {
      const copy = [...args];
      copy[copy.indexOf(option) + 1] = value;
      return copy;
    };
    const invalidArguments = [
      withoutPair(parserFixture.deploymentArguments, '--verified-commit'),
      withoutPair(parserFixture.deploymentArguments, '--procedure-source-commit'),
      replaceValue(parserFixture.deploymentArguments, '--verified-commit', 'A'.repeat(40)),
      replaceValue(parserFixture.deploymentArguments, '--procedure-source-commit', 'C'.repeat(40)),
      [...parserFixture.deploymentArguments, '--verified-commit', commit],
      [...parserFixture.deploymentArguments, '--procedure-source-commit', procedureCommit],
      [...parserFixture.deploymentArguments, '--no-rollback'],
      ['--stage-procedure', '--no-rollback', '--verified-commit', commit],
      ['--recover-procedure', '--no-rollback', '--backup-id', `sha256:${'9'.repeat(64)}`],
      ['--record-orphan', ...ociArguments, '--procedure-source-commit', procedureCommit]
    ];
    const beforeDocker = fs.readFileSync(parserFixture.dockerLog, 'utf8');
    const beforeState = fs.readFileSync(parserFixture.statePath, 'utf8');
    for (const args of invalidArguments) {
      const result = parserFixture.run(args);
      assert.equal(result.status, 1, args.join(' '));
      assert.match(result.stderr, /RESULT_CLASSIFICATION=no_effect/u);
    }
    assert.equal(fs.readFileSync(parserFixture.dockerLog, 'utf8'), beforeDocker);
    assert.equal(fs.readFileSync(parserFixture.statePath, 'utf8'), beforeState);
  } finally {
    fs.rmSync(parserFixture.root, { recursive: true, force: true });
  }

  function mutation(relativePath, mutate) {
    return { ...sources, [relativePath]: mutate(sources[relativePath]) };
  }

  const deployPath = 'deploy/resofeed-caddy/deploy.sh';
  const composePath = 'deploy/resofeed-caddy/compose.yml';
  const remoteProbePath = 'deploy/resofeed-caddy/verify-remote.sh';
  const orbStackPathLine = 'export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"';
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
    mutation(deployPath, (body) => body.replace('json.load(sys.stdin, object_pairs_hook=reject_duplicate_members)', 'json.load(sys.stdin)')),
    mutation(deployPath, (body) => body.replace('if type(document) is not dict:', 'if False:')),
    mutation(deployPath, (body) => body.replace('if type(revision) is not str or revision != sys.argv[1]:', 'if revision != sys.argv[1]:')),
    mutation(deployPath, (body) => body.replace('revision != sys.argv[1]', 'revision != VERIFIED_COMMIT')),
    mutation(deployPath, (body) => body.replace("inspect_manifest_digest 'linux/amd64'", "inspect_manifest_digest 'linux/386'")),
    mutation(deployPath, (body) => body.replace("inspect_manifest_digest 'linux/arm64'", "inspect_manifest_digest 'linux/arm/v7'")),
    mutation(deployPath, (body) => body.replaceAll('rollback_previous_digest', 'rollback_without_readiness')),
    mutation(deployPath, (body) => body.replace('[[ "$PROCEDURE_SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]]', '[[ "$PROCEDURE_SOURCE_COMMIT" =~ ^[a-f0-9]{7,40}$ ]]')),
    mutation(deployPath, (body) => body.replace('validate_procedure_source_commit', 'PROCEDURE_SOURCE_COMMIT=$VERIFIED_COMMIT #')),
    mutation(deployPath, (body) => body.replace('trap forward_only_failure ERR', 'trap rollback_previous_digest ERR')),
    mutation(deployPath, (body) => body.replace(
      '    validate_no_rollback_tailscale_route\n',
      '    validate_tailscale_boundary\n'
    )),
    mutation(deployPath, (body) => body.replace(
      'up -d --no-build --no-deps resofeed',
      'up -d --build'
    )),
    mutation(deployPath, (body) => body.replace(
      'run_quiet "Existing ResoFeed service updated"',
      'ensure_tailscale_serve\n    run_quiet "Existing ResoFeed service updated"'
    )),
    mutation(deployPath, (body) => body.replace('RESULT_CLASSIFICATION_STATE="known_partial"', 'RESULT_CLASSIFICATION_STATE="success"')),
    mutation(deployPath, (body) => body.replace('status --porcelain=v1 --untracked-files=all', 'status --short')),
    mutation(deployPath, (body) => body.replace(
      'if git -C "$repo_root" symbolic-ref -q HEAD >/dev/null 2>&1; then',
      'if ! git -C "$repo_root" symbolic-ref -q HEAD >/dev/null 2>&1; then'
    )),
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
    mutation(remoteProbePath, (body) => body.replace(orbStackPathLine, 'export PATH="$PATH"')),
    mutation(remoteProbePath, (body) => body.replace(orbStackPathLine, `${orbStackPathLine}\n${orbStackPathLine}`)),
    mutation(remoteProbePath, (body) => `${body}\nexport DOCKER_HOST=unix:///alternate/docker.sock\n`),
    mutation(remoteProbePath, (body) => `${body}\nprintf '%s\\n' "$PATH"\n`),
    mutation(remoteProbePath, (body) => body.replace('tailscale serve status --json', 'tailscale serve status')),
    mutation(remoteProbePath, (body) => body.replace('object_pairs_hook=reject_duplicate_members', 'object_pairs_hook=dict')),
    mutation(remoteProbePath, (body) => body.replace('set(listener) != {"TCPForward"}', 'False')),
    mutation(remoteProbePath, (body) => `${body}\n${separatelyAuthorizedServeRepair}\n`),
    mutation('deploy/resofeed-caddy/README.md', (body) => body.replace(separatelyAuthorizedServeRepair, 'tailscale serve --bg --tcp=443 tcp://127.0.0.1:8443')),
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

test('RF-BUG-V2 tracked read-only probe harness', () => {
  const wrapperPath = path.join(repoRoot, 'deploy', 'resofeed-caddy', 'verify.sh');
  const remoteProgramPath = path.join(repoRoot, 'deploy', 'resofeed-caddy', 'verify-remote.sh');
  const wrapperSource = fs.readFileSync(wrapperPath, 'utf8');
  const remoteSource = fs.readFileSync(remoteProgramPath, 'utf8');
  const successLedger = [
    'PROBE_PHASE=canonical_stack',
    'CANONICAL_STACK=verified',
    'PROBE_PHASE=procedure_current',
    'PROCEDURE_CURRENT=verified',
    'PROBE_PHASE=backup',
    'BACKUP=verified',
    'PROBE_PHASE=docker_identity',
    'DOCKER_IDENTITY=verified',
    'PROBE_PHASE=volume',
    'VOLUME=verified',
    'PROBE_PHASE=tailnet_route',
    'TAILNET_ROUTE=verified',
    'PROBE_PHASE=public_url',
    'PUBLIC_URL_HOST=validated',
    'PROBE_PHASE=readiness',
    'READINESS=verified',
    'PROBE_PHASE=protected_after',
    'PROTECTED_STATE=unchanged',
    'PROBE_OK',
    ''
  ].join('\n');

  function executable(filePath, source) {
    fs.writeFileSync(filePath, source, { mode: 0o755 });
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

  function probeFixture({ attached = false } = {}) {
    const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-read-only-probe-'));
    const sourceRoot = path.join(root, 'source');
    const sourceStack = path.join(sourceRoot, 'deploy', 'resofeed-caddy');
    const remoteHome = path.join(root, 'remote-home');
    const remoteStack = path.join(remoteHome, 'Projects', 'resofeed-caddy');
    const fakeBin = path.join(root, 'fake-bin');
    const orbStackBin = path.join(root, 'orbstack-xbin');
    const evidence = path.join(root, 'evidence');
    for (const directory of [sourceStack, remoteStack, fakeBin, orbStackBin, evidence]) fs.mkdirSync(directory, { recursive: true });

    for (const name of ['deploy.sh', 'compose.yml']) {
      fs.copyFileSync(path.join(repoRoot, 'deploy', 'resofeed-caddy', name), path.join(sourceStack, name));
    }
    fs.chmodSync(path.join(sourceStack, 'deploy.sh'), 0o755);
    fs.chmodSync(path.join(sourceStack, 'compose.yml'), 0o644);

    checked('git', ['init', '-q'], { cwd: sourceRoot });
    checked('git', ['config', 'user.name', 'Probe Fixture'], { cwd: sourceRoot });
    checked('git', ['config', 'user.email', 'probe@example.invalid'], { cwd: sourceRoot });
    checked('git', ['add', '.'], { cwd: sourceRoot });
    checked('git', ['commit', '-qm', 'staged procedure fixture'], { cwd: sourceRoot });
    const sourceCommit = checked('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot });

    for (const name of ['verify.sh', 'verify-remote.sh']) {
      fs.copyFileSync(path.join(repoRoot, 'deploy', 'resofeed-caddy', name), path.join(sourceStack, name));
      fs.chmodSync(path.join(sourceStack, name), 0o755);
    }
    checked('git', ['add', '.'], { cwd: sourceRoot });
    checked('git', ['commit', '-qm', 'integrated tracked helpers'], { cwd: sourceRoot });
    const integratedCommit = checked('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot });
    assert.notEqual(integratedCommit, sourceCommit);
    assert.notEqual(spawnSync('git', ['cat-file', '-e', `${sourceCommit}:deploy/resofeed-caddy/verify.sh`], {
      cwd: sourceRoot,
      encoding: 'utf8'
    }).status, 0, 'the staged source commit must not contain the later helper');
    if (!attached) checked('git', ['checkout', '--detach', '-q', integratedCommit], { cwd: sourceRoot });

    for (const name of ['deploy.sh', 'compose.yml']) {
      fs.copyFileSync(path.join(sourceStack, name), path.join(remoteStack, name));
    }
    fs.chmodSync(path.join(remoteStack, 'deploy.sh'), 0o755);
    fs.chmodSync(path.join(remoteStack, 'compose.yml'), 0o644);

    const priorDeploy = path.join(root, 'prior-deploy.sh');
    const priorCompose = path.join(root, 'prior-compose.yml');
    fs.writeFileSync(priorDeploy, '#!/usr/bin/env bash\nprintf prior\\n\n', { mode: 0o755 });
    fs.writeFileSync(priorCompose, 'services: {}\n', { mode: 0o644 });
    const priorDeploySHA256 = fileSHA256(priorDeploy);
    const priorComposeSHA256 = fileSHA256(priorCompose);
    const backupIdentityInput = `resofeed.procedure-backup.v1\ndeploy.sh=${priorDeploySHA256} mode=755\ncompose.yml=${priorComposeSHA256} mode=644\n`;
    const backupID = `sha256:${createHash('sha256').update(backupIdentityInput).digest('hex')}`;
    const backupDir = path.join(remoteStack, '.resofeed-procedure-backups', backupID.slice('sha256:'.length));
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(priorDeploy, path.join(backupDir, 'deploy.sh'));
    fs.copyFileSync(priorCompose, path.join(backupDir, 'compose.yml'));
    fs.chmodSync(path.join(backupDir, 'deploy.sh'), 0o755);
    fs.chmodSync(path.join(backupDir, 'compose.yml'), 0o644);
    const manifestPath = path.join(backupDir, 'manifest');
    fs.writeFileSync(manifestPath, [
      'schema_version=resofeed.procedure-backup.v1',
      `backup_id=${backupID}`,
      `deploy.sh=${priorDeploySHA256} mode=755`,
      `compose.yml=${priorComposeSHA256} mode=644`,
      ''
    ].join('\n'), { mode: 0o600 });
    fs.chmodSync(manifestPath, 0o600);

    const sshArgumentsPath = path.join(evidence, 'ssh-arguments');
    const sshStdinPath = path.join(evidence, 'ssh-stdin');
    const sshAttemptsPath = path.join(evidence, 'ssh-attempts');
    const remoteOutputPath = path.join(evidence, 'remote-output');
    const curlLogPath = path.join(evidence, 'curl-arguments');
    const curlCountPath = path.join(evidence, 'curl-count');
    const surfaceLogPath = path.join(evidence, 'surfaces');
    const dockerPathChecksPath = path.join(evidence, 'docker-path-checks');
    const tailscaleCountPath = path.join(evidence, 'tailscale-count');
    fs.writeFileSync(sshAttemptsPath, '');
    fs.writeFileSync(curlLogPath, '');
    fs.writeFileSync(curlCountPath, '0\n');
    fs.writeFileSync(surfaceLogPath, '');
    fs.writeFileSync(dockerPathChecksPath, '');
    fs.writeFileSync(tailscaleCountPath, '0\n');

    executable(path.join(fakeBin, 'ssh'), `#!/usr/bin/env bash
set -Eeuo pipefail
printf 'attempt\\n' >> "$FAKE_SSH_ATTEMPTS"
printf '%s\\0' "$@" > "$FAKE_SSH_ARGUMENTS"
/bin/cat > "$FAKE_SSH_STDIN"
if [[ "\${FAKE_TRANSPORT_FAIL:-0}" == 1 ]]; then exit 87; fi
expected=(-Fnone -T -o HostName=tefx-mbp-personal.platy-atlas.ts.net -o HostKeyAlias=tefx-mbp-personal.platy-atlas.ts.net -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o VerifyHostKeyDNS=no -o CanonicalizeHostname=no -o BatchMode=yes -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o NumberOfPasswordPrompts=0 -o AddKeysToAgent=no -o ForwardAgent=no -o ClearAllForwardings=yes -o ControlMaster=no -o ControlPath=none -o RequestTTY=no tefx-mbp-personal.platy-atlas.ts.net bash -s --)
for expected_argument in "\${expected[@]}"; do
  [[ "\${1:-}" == "$expected_argument" ]] || exit 68
  shift
done
[[ "$#" -eq 11 ]]
for transported in "$@"; do [[ "$transported" != *=* ]]; done
set +e
remote_output=$(/usr/bin/sed "s|/Applications/OrbStack.app/Contents/MacOS/xbin|$FAKE_ORBSTACK_BIN|g" "$FAKE_SSH_STDIN" | HOME="$FAKE_REMOTE_HOME" PATH="$FAKE_REMOTE_BIN:$REAL_PATH" /bin/bash -s -- "$@" 2>> "$FAKE_SURFACE_LOG")
remote_status=$?
set -e
printf '%s\\n' "$remote_output" > "$FAKE_REMOTE_OUTPUT"
printf '%s\\n' "$remote_output"
exit "$remote_status"
`);
    executable(path.join(orbStackBin, 'docker'), `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$PATH" == "$FAKE_ORBSTACK_BIN:$FAKE_REMOTE_BIN:$REAL_PATH" ]] || exit 43
[[ "$(command -v docker)" == "$FAKE_ORBSTACK_BIN/docker" ]] || exit 44
printf 'verified\\n' >> "$FAKE_DOCKER_PATH_CHECKS"
printf 'orbstack-docker %s\\n' "$*" >> "$FAKE_SURFACE_LOG"
if [[ "\${FAKE_DOCKER_FAIL:-0}" == 1 ]]; then exit 41; fi
if [[ "$1 $2" == 'container inspect' ]]; then
  format=$4
  target=$5
  if [[ "$format" == '{{.Id}}' ]]; then
    if [[ "$target" == resofeed ]]; then
      count=$(<"$FAKE_CURL_COUNT")
      if [[ "\${FAKE_PROJECTION_DRIFT:-0}" == 1 && "$count" -ge 2 ]]; then printf '%064x\\n' 9; else printf '%064x\\n' 1; fi
    else printf '%064x\\n' 2; fi
    exit 0
  fi
  if [[ "$format" == '{{.Image}}' ]]; then
    if [[ "$target" == resofeed ]]; then printf 'sha256:%064d\\n' 3; else printf 'sha256:%064d\\n' 4; fi
    exit 0
  fi
  if [[ "$format" == *'.Mounts'* ]]; then printf 'volume|/data|resofeed-caddy_resofeed-data\\n'; exit 0; fi
  if [[ "$format" == *'.Config.Cmd'* ]]; then printf '%s\\n' serve --public-url "\${FAKE_PUBLIC_URL:-https://resofeed.example.test}" --db /data/resofeed.sqlite3; exit 0; fi
fi
if [[ "$1 $2" == 'volume inspect' ]]; then printf '%s\\n' "\${FAKE_VOLUME_LABEL:-resofeed-data}"; exit 0; fi
exit 42
`);
    executable(path.join(fakeBin, 'tailscale'), `#!/usr/bin/env bash
set -Eeuo pipefail
printf 'tailscale %s\\n' "$*" >> "$FAKE_SURFACE_LOG"
[[ "$#" -eq 3 && "$1 $2 $3" == 'serve status --json' ]]
count=$(<"$FAKE_TAILSCALE_COUNT")
count=$((count + 1))
printf '%s\\n' "$count" > "$FAKE_TAILSCALE_COUNT"
if [[ "\${FAKE_TAILNET_VOLATILE_SEQUENCE:-0}" == 1 ]]; then
  printf '{"TCP":{"443":{"TCPForward":"127.0.0.1:8443"}},"PeerTelemetry":{"sequence":%s}}\\n' "$count"
elif [[ -n "\${FAKE_TAILNET_ROUTE_JSON+x}" ]]; then
  printf '%s\\n' "$FAKE_TAILNET_ROUTE_JSON"
else
  printf '%s\\n' '{"TCP":{"443":{"TCPForward":"127.0.0.1:8443"}},"PeerTelemetry":"peer-session-volatile"}'
fi
`);
    executable(path.join(fakeBin, 'curl'), `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\\0' "$@" >> "$FAKE_CURL_LOG"
count=$(<"$FAKE_CURL_COUNT")
count=$((count + 1))
printf '%s\\n' "$count" > "$FAKE_CURL_COUNT"
url=\${@: -1}
if [[ "\${FAKE_READINESS_FAIL:-0}" == 1 ]]; then printf 503; elif [[ "$url" == */api/doctor ]]; then printf 401; else printf 200; fi
`);
    const realStat = checked('which', ['stat']);
    const realShasum = checked('which', ['shasum']);
    executable(path.join(fakeBin, 'stat'), `#!/usr/bin/env bash
printf 'stat %s\\n' "$*" >> "$FAKE_SURFACE_LOG"
exec "$REAL_STAT" "$@"
`);
    executable(path.join(fakeBin, 'shasum'), `#!/usr/bin/env bash
printf 'shasum %s\\n' "$*" >> "$FAKE_SURFACE_LOG"
exec "$REAL_SHASUM" "$@"
`);

    const deploySHA256 = fileSHA256(path.join(sourceStack, 'deploy.sh'));
    const composeSHA256 = fileSHA256(path.join(sourceStack, 'compose.yml'));
    const probeArguments = [
      '--source-commit', sourceCommit,
      '--deploy-sha256', deploySHA256,
      '--deploy-mode', '755',
      '--compose-sha256', composeSHA256,
      '--compose-mode', '644',
      '--backup-id', backupID,
      '--backup-manifest-mode', '600',
      '--prior-deploy-sha256', priorDeploySHA256,
      '--prior-deploy-mode', '755',
      '--prior-compose-sha256', priorComposeSHA256,
      '--prior-compose-mode', '644'
    ];
    const environment = {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOME: process.env.HOME ?? root,
      TMPDIR: root,
      FAKE_REMOTE_HOME: remoteHome,
      FAKE_REMOTE_BIN: fakeBin,
      FAKE_ORBSTACK_BIN: orbStackBin,
      FAKE_DOCKER_PATH_CHECKS: dockerPathChecksPath,
      FAKE_SSH_ARGUMENTS: sshArgumentsPath,
      FAKE_SSH_STDIN: sshStdinPath,
      FAKE_SSH_ATTEMPTS: sshAttemptsPath,
      FAKE_REMOTE_OUTPUT: remoteOutputPath,
      FAKE_CURL_LOG: curlLogPath,
      FAKE_CURL_COUNT: curlCountPath,
      FAKE_SURFACE_LOG: surfaceLogPath,
      FAKE_TAILSCALE_COUNT: tailscaleCountPath,
      REAL_PATH: process.env.PATH ?? '',
      REAL_STAT: realStat,
      REAL_SHASUM: realShasum
    };
    const run = (extraEnvironment = {}, replacementArguments = probeArguments) => spawnSync(path.join(sourceStack, 'verify.sh'), replacementArguments, {
      cwd: sourceRoot,
      encoding: 'utf8',
      env: { ...environment, ...extraEnvironment }
    });
    return {
      root,
      sourceRoot,
      sourceStack,
      remoteStack,
      backupDir,
      manifestPath,
      probeArguments,
      environment,
      run,
      sourceCommit,
      integratedCommit,
      sshArgumentsPath,
      sshStdinPath,
      sshAttemptsPath,
      remoteOutputPath,
      curlLogPath,
      curlCountPath,
      surfaceLogPath,
      dockerPathChecksPath,
      tailscaleCountPath,
      orbStackBin
    };
  }

  const happy = probeFixture();
  try {
    const result = happy.run({ FAKE_TAILNET_VOLATILE_SEQUENCE: '1' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${fs.readFileSync(happy.surfaceLogPath, 'utf8')}`);
    assert.equal(result.stdout, successLedger);
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(happy.sshStdinPath), fs.readFileSync(path.join(happy.sourceStack, 'verify-remote.sh')));
    const sshArguments = fs.readFileSync(happy.sshArgumentsPath).toString().split('\0').filter(Boolean);
    const transportedValues = happy.probeArguments.filter((_, index) => index % 2 === 1);
    const destinationIndex = sshArguments.indexOf('tefx-mbp-personal.platy-atlas.ts.net');
    assert.deepEqual(sshArguments.slice(0, 3), ['-Fnone', '-T', '-o']);
    assert.equal(sshArguments.includes('-F'), false);
    assert.equal(sshArguments.includes('none'), false);
    assert.deepEqual(sshArguments.slice(destinationIndex), [
      'tefx-mbp-personal.platy-atlas.ts.net',
      'bash', '-s', '--',
      ...transportedValues
    ]);
    assert.equal(transportedValues.length, 11);
    assert.equal(sshArguments.some((argument) => /^[A-Z_]+=/u.test(argument)), false);
    assert.notEqual(happy.sourceCommit, happy.integratedCommit);
    assert.equal(fs.readFileSync(happy.sshAttemptsPath, 'utf8'), 'attempt\n');
    assert.equal(fs.readFileSync(happy.curlCountPath, 'utf8'), '2\n');
    assert.equal(fs.readFileSync(happy.tailscaleCountPath, 'utf8'), '3\n');
    assert.equal(fs.existsSync(path.join(happy.environment.FAKE_REMOTE_BIN, 'docker')), false);
    const dockerPathChecks = fs.readFileSync(happy.dockerPathChecksPath, 'utf8').trim().split('\n');
    assert.equal(dockerPathChecks.length, 21);
    assert.equal(dockerPathChecks.every((row) => row === 'verified'), true);
    const surfaceLog = fs.readFileSync(happy.surfaceLogPath, 'utf8');
    const dockerObservations = surfaceLog.split('\n').filter((row) => row.startsWith('orbstack-docker '));
    assert.equal(dockerObservations.length, 21);
    assert.equal(surfaceLog.split('\n').some((row) => row.startsWith('docker ')), false);
    const tailscaleObservations = surfaceLog.split('\n').filter((row) => row.startsWith('tailscale '));
    assert.deepEqual(tailscaleObservations, Array(3).fill('tailscale serve status --json'));
    const disclosedSurfaces = [result.stdout, result.stderr, fs.readFileSync(happy.remoteOutputPath, 'utf8'), surfaceLog].join('\n');
    assert.doesNotMatch(disclosedSurfaces, /\/Applications\/OrbStack\.app\/Contents\/MacOS\/xbin/u);
    assert.doesNotMatch(disclosedSurfaces, /TCPForward|PeerTelemetry|peer-session-volatile|127\.0\.0\.1:8443/u);
    assert.equal(disclosedSurfaces.includes(`${happy.orbStackBin}:${happy.environment.FAKE_REMOTE_BIN}:${happy.environment.REAL_PATH}`), false);
    const curlArguments = fs.readFileSync(happy.curlLogPath).toString();
    assert.match(curlArguments, /resofeed\.example\.test:443:127\.0\.0\.1:8443/u);
    assert.doesNotMatch(curlArguments, /tefx-mbp-personal\.platy-atlas\.ts\.net/u);
    assert.doesNotMatch(result.stdout, /resofeed\.example\.test|peer-session-volatile|sqlite|\.env|token|secret/iu);
    assert.match(surfaceLog, /orbstack-docker container inspect/u);
    assert.match(surfaceLog, /orbstack-docker volume inspect/u);
    assert.match(surfaceLog, /tailscale serve status --json/u);
    assert.doesNotMatch(surfaceLog, /tailscale serve (?:--yes|--bg|--tcp)/u);
    const procedurePaths = [
      wrapperSource.match(/SOURCE_DEPLOY_PATH="([^"]+)"/u)?.[1],
      wrapperSource.match(/SOURCE_COMPOSE_PATH="([^"]+)"/u)?.[1]
    ];
    assert.deepEqual(procedurePaths, ['deploy/resofeed-caddy/deploy.sh', 'deploy/resofeed-caddy/compose.yml']);
    assert.match(wrapperSource, /merge-base --is-ancestor "\$SOURCE_COMMIT" "\$integrated_head"/u);
    assert.match(wrapperSource, /SOURCE_WRAPPER_PATH="deploy\/resofeed-caddy\/verify\.sh"/u);
    assert.match(wrapperSource, /SOURCE_REMOTE_PATH="deploy\/resofeed-caddy\/verify-remote\.sh"/u);
    assert.doesNotMatch(wrapperSource, /--backup-manifest-sha256|RESOFEED_PROBE_/u);
    assert.doesNotMatch(remoteSource, /RESOFEED_PROBE_/u);
  } finally {
    fs.rmSync(happy.root, { recursive: true, force: true });
  }

  const phaseCases = [
    ['canonical_stack', (fixture) => fs.renameSync(fixture.remoteStack, `${fixture.remoteStack}-missing`), {}],
    ['procedure_current', (fixture) => fs.appendFileSync(path.join(fixture.remoteStack, 'deploy.sh'), '# drift\n'), {}],
    ['backup', (fixture) => fs.appendFileSync(fixture.manifestPath, 'drift=yes\n'), {}],
    ['backup', (fixture) => fs.chmodSync(fixture.manifestPath, 0o644), {}],
    ['backup', (fixture) => fs.writeFileSync(
      fixture.manifestPath,
      fs.readFileSync(fixture.manifestPath, 'utf8').slice(0, -1),
      { mode: 0o600 }
    ), {}],
    ['docker_identity', () => {}, { FAKE_DOCKER_FAIL: '1' }],
    ['volume', () => {}, { FAKE_VOLUME_LABEL: 'wrong-volume' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: '{"TCP":' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: '{"TCP":{}}' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: '{"TCP":{"443":{"TCPForward":8443}}}' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: '{"TCP":{"443":{"TCPForward":"127.0.0.1:9443"}}}' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: '{"TCP":{"443":{"TCPForward":"127.0.0.1:8443"},"443":{"TCPForward":"127.0.0.1:8443"}}}' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: '{"TCP":{"443":{"TCPForward":"127.0.0.1:8443","TerminateTLS":"resofeed.example.test"}}}' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: 'TCP 443 -> tcp://127.0.0.1:8443' }],
    ['tailnet_route', () => {}, { FAKE_TAILNET_ROUTE_JSON: 'TCP 443\n|-- tcp://127.0.0.1:8443' }],
    ['public_url', () => {}, { FAKE_PUBLIC_URL: 'http://resofeed.example.test' }],
    ['readiness', () => {}, { FAKE_READINESS_FAIL: '1' }],
    ['protected_after', () => {}, { FAKE_PROJECTION_DRIFT: '1' }]
  ];
  for (const [phase, mutate, extraEnvironment] of phaseCases) {
    const fixture = probeFixture();
    try {
      mutate(fixture);
      const result = fixture.run(extraEnvironment);
      assert.notEqual(result.status, 0, phase);
      assert.match(result.stdout, new RegExp(`PROBE_FAIL phase=${phase} status=[1-9][0-9]*\\n$`, 'u'), `${phase}: ${result.stdout}\nremote:\n${fs.readFileSync(fixture.remoteOutputPath, 'utf8')}\n${result.stderr}`);
      assert.equal((result.stdout.match(/PROBE_FAIL/gu) ?? []).length, 1, phase);
      assert.doesNotMatch(result.stdout, /PROBE_OK/u, phase);
      assert.equal(fs.readFileSync(fixture.sshAttemptsPath, 'utf8'), 'attempt\n', phase);
      if (phase === 'tailnet_route') {
        assert.equal(fs.readFileSync(fixture.tailscaleCountPath, 'utf8'), '1\n');
        assert.deepEqual(
          fs.readFileSync(fixture.surfaceLogPath, 'utf8').split('\n').filter((row) => row.startsWith('tailscale ')),
          ['tailscale serve status --json']
        );
        assert.doesNotMatch(result.stdout, /TCPForward|127\.0\.0\.1:8443/u);
      }
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  const transport = probeFixture();
  try {
    const result = transport.run({ FAKE_TRANSPORT_FAIL: '1' });
    assert.equal(result.status, 87);
    assert.equal(result.stdout, 'PROBE_TRANSPORT_FAIL status=87\n');
    assert.equal(fs.readFileSync(transport.sshAttemptsPath, 'utf8'), 'attempt\n');
  } finally {
    fs.rmSync(transport.root, { recursive: true, force: true });
  }

  const invalidCallerArguments = [
    ['--source-commit', 'A'.repeat(40)],
    ['--source-commit', `${'a'.repeat(39)};`],
    ['--deploy-sha256', 'sha256:malformed'],
    ['--compose-sha256', `sha256:${'1'.repeat(64)} `],
    ['--backup-id', `sha256:${'2'.repeat(63)}$`],
    ['--prior-deploy-sha256', 'sha256:malformed'],
    ['--prior-compose-sha256', `sha256:${'3'.repeat(64)}\n`],
    ['--deploy-mode', '755;id'],
    ['--compose-mode', '600'],
    ['--backup-manifest-mode', '644'],
    ['--prior-deploy-mode', '0755'],
    ['--prior-compose-mode', '644 ']
  ];
  const argumentMutations = [
    (args) => args.map((value) => value === '--source-commit' ? '--unknown' : value),
    ...invalidCallerArguments.map(([option, invalid]) => (
      (args) => args.map((value, index) => args[index - 1] === option ? invalid : value)
    ))
  ];
  for (const mutateArguments of argumentMutations) {
    const fixture = probeFixture();
    try {
      const result = fixture.run({}, mutateArguments([...fixture.probeArguments]));
      assert.equal(result.status, 2);
      assert.equal(result.stdout, 'PROBE_CONSTRUCTION_FAIL status=2\n');
      assert.equal(fs.readFileSync(fixture.sshAttemptsPath, 'utf8'), '');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  for (const sourceState of ['attached', 'dirty']) {
    const fixture = probeFixture({ attached: sourceState === 'attached' });
    try {
      if (sourceState === 'dirty') fs.writeFileSync(path.join(fixture.sourceRoot, 'dirty-probe'), 'dirty\n');
      const result = fixture.run();
      assert.equal(result.status, 2, sourceState);
      assert.equal(result.stdout, 'PROBE_CONSTRUCTION_FAIL status=2\n');
      assert.equal(fs.readFileSync(fixture.sshAttemptsPath, 'utf8'), '');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  const volatileOne = probeFixture();
  const volatileTwo = probeFixture();
  try {
    const first = volatileOne.run({
      FAKE_TAILNET_ROUTE_JSON: '{"TCP":{"443":{"TCPForward":"127.0.0.1:8443"}},"PeerTelemetry":"peer=one timestamp=111 sqlite-wal=4 log-counter=8"}'
    });
    const second = volatileTwo.run({
      FAKE_TAILNET_ROUTE_JSON: '{"PeerTelemetry":"peer=two timestamp=999 sqlite-wal=900 log-counter=77","TCP":{"443":{"TCPForward":"127.0.0.1:8443"}}}'
    });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(first.stdout, successLedger);
  } finally {
    fs.rmSync(volatileOne.root, { recursive: true, force: true });
    fs.rmSync(volatileTwo.root, { recursive: true, force: true });
  }

  assert.equal((wrapperSource.match(/\bssh\b/gu) ?? []).length, 1);
  assert.match(wrapperSource, /ssh -Fnone -T/u);
  assert.doesNotMatch(wrapperSource, /ssh -F none|--backup-manifest-sha256|RESOFEED_PROBE_/u);
  assert.equal((remoteSource.match(/^shift$/gmu) ?? []).length, 11);
  assert.match(remoteSource, /expected_manifest_sha256=\$\(printf 'schema_version=resofeed\.procedure-backup\.v1\\nbackup_id=%s\\ndeploy\.sh=%s mode=%s\\ncompose\.yml=%s mode=%s\\n'/u);
  const orbStackPathLine = 'export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"';
  assert.equal(remoteSource.split(orbStackPathLine).length - 1, 1);
  assert.ok(remoteSource.indexOf(orbStackPathLine) > remoteSource.indexOf('[ "$EXPECTED_PRIOR_COMPOSE_MODE" = 644 ]'));
  assert.ok(remoteSource.indexOf(orbStackPathLine) < remoteSource.indexOf('\nprobe_phase=docker_identity\n'));
  assert.doesNotMatch(remoteSource, /EXPECTED_BACKUP_MANIFEST_SHA256|RESOFEED_PROBE_|DOCKER_HOST|CONTAINER_HOST|docker\.sock|\/usr\/local\/bin\/docker|\/opt\/homebrew\/bin\/docker|\/Applications\/Docker\.app|--host| -H /u);
  assert.doesNotMatch(remoteSource, /(?:printf|echo)[^\n]*\$\{?PATH\}?/u);
  assert.equal((remoteSource.match(/\bcurl\b/gu) ?? []).length, 2);
  assert.equal(remoteSource.split('tailscale serve status --json').length - 1, 1);
  assert.match(remoteSource, /\/usr\/bin\/python3 -c/u);
  assert.match(remoteSource, /object_pairs_hook=reject_duplicate_members/u);
  assert.match(remoteSource, /set\(listener\) != \{"TCPForward"\}/u);
  assert.match(remoteSource, /target != "127\.0\.0\.1:8443"/u);
  assert.doesNotMatch(remoteSource, /TCP 443 -> tcp:\/\/127\.0\.0\.1:8443|tailscale serve status \|/u);
  assert.match(remoteSource, /com\.docker\.compose\.volume/u);
  assert.match(remoteSource, /DATA_VOLUME_LABEL.*resofeed-data/su);
  assert.match(remoteSource, /BASELINE_PROJECTION=\$\(stable_projection\)/u);
  assert.match(remoteSource, /AFTER_PROJECTION=\$\(stable_projection\)/u);
  assert.doesNotMatch(remoteSource, /\b(?:eval|systemctl|sqlite3|scp|rsync|sleep|mktemp|mkdir|rm|mv|cp)\b|docker\s+compose|tailscale\s+serve\s+--|\.env/u);
  assert.doesNotMatch(`${wrapperSource}\n${remoteSource}`, /bash\s+-c|StrictHostKeyChecking=(?:no|accept-new)|Proxy(?:Command|Jump)/u);
  console.log('PROBE_HARNESS=tracked_read_only');
  console.log('PROBE_TRANSPORT=one_ssh_stdin');
  console.log('PROBE_PROTECTED_STATE=stable_projection');
  console.log('PROCEDURE_ORBSTACK_DOCKER_PATH=verified');
  console.log('PROCEDURE_TAILSCALE_ROUTE_JSON=verified');
  console.log('PROCEDURE_TAILSCALE_SERVE_MUTATION=canonical_noop');
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

  await context.test('item-deep-links frontend native profile restores success and failure exactly', () => {
    const frontendProfile = findProfile('item-deep-links-frontend', 'item_deep_links_frontend_green');
    assert.ok(frontendProfile);
    assert.deepEqual(frontendProfile.identities, [
      'ITEM-DEEP-LINK app codec and API domain separation',
      'ITEM-DEEP-LINK browser history auth error read-only lifecycle'
    ]);
    assert.deepEqual(frontendProfile.commands, [
      ['npm', '--prefix', 'web', 'run', 'test:render', '--', 'src/lib/__tests__/item-deep-links.expected-red.test.ts', 'src/lib/api-client.test.ts', 'src/lib/__tests__/workbench-route.test.ts', 'src/routes/components/__tests__/item-deep-links.test.ts'],
      ['npm', '--prefix', 'web', 'exec', '--', 'playwright', 'test', '--config', 'web/playwright.ci-safe.config.ts', '--project=chromium-ci-safe', '--retries=0', '--reporter=line', 'web/tests/e2e/item-deep-links.browser-contract.spec.ts']
    ]);

    function gitOutput(root, args) {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    }

    function repositoryState(current) {
      return {
        trees: captureGeneratedTreeState(current.root),
        status: current.readStatus(),
        indexTree: gitOutput(current.root, ['write-tree']),
        indexPatch: gitOutput(current.root, ['diff', '--cached', '--binary']),
        trackedPatch: gitOutput(current.root, ['diff', '--binary'])
      };
    }

    function exercise({ fails }) {
      const current = fixture({ preexisting: true });
      try {
        fs.writeFileSync(path.join(current.root, 'tracked.txt'), 'staged baseline\n');
        gitOutput(current.root, ['add', 'tracked.txt']);
        fs.appendFileSync(path.join(current.root, 'tracked.txt'), 'unstaged baseline\n');
        const before = repositoryState(current);
        let callIndex = 0;
        const run = (_profile, command, args) => {
          const expected = frontendProfile.commands[callIndex];
          assert.equal(command, expected[0]);
          assert.deepEqual(args, expected.slice(1));
          callIndex += 1;
          if (callIndex === 1) mutate(current);
          if (fails && callIndex === frontendProfile.commands.length) throw new Error('frontend-profile-operation-failure');
          return frontendProfile.requiredOutput.join('\n');
        };

        if (fails) {
          assert.throws(
            () => runNative(frontendProfile, run, current.root, current.readStatus),
            /frontend-profile-operation-failure/u
          );
        } else {
          const result = runNative(frontendProfile, run, current.root, current.readStatus);
          assert.equal(result.outcome, 'green');
          assert.deepEqual(result.observations, [...frontendProfile.requiredOutput, 'VECTL_GENERIC_EVIDENCE=valid']);
        }
        assert.equal(callIndex, frontendProfile.commands.length);
        assert.deepEqual(repositoryState(current), before);
        assert.deepEqual(
          fs.readdirSync(path.join(current.root, 'internal', 'resofeed')).filter((name) => name.startsWith('.webui-stage.')),
          []
        );
      } finally {
        fs.rmSync(current.root, { recursive: true, force: true });
      }
    }

    exercise({ fails: false });
    exercise({ fails: true });
  });

  console.log('ITEM_DEEP_LINK_FRONTEND_RESTORATION=complete');
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

test('RF-BUG-V2 container build context derives trusted identity in dual-platform no-push build', { timeout: 1_780_000 }, () => {
  const sha256 = (value) => createHash('sha256').update(value).digest('hex');
  const commandOutput = (result) => `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const outputSHA256 = (result) => sha256(commandOutput(result));
  const runCommand = (command, args, {
    cwd = repoRoot,
    env,
    timeout = 120_000
  } = {}) => spawnSync(command, args, {
    cwd,
    env,
    timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const requireGreen = (label, result) => {
    assert.equal(
      result.error,
      undefined,
      `${label} could not execute (output_sha256=${outputSHA256(result)})`
    );
    assert.equal(
      result.status,
      0,
      `${label} failed (exit=${String(result.status)}, signal=${String(result.signal)}, output_sha256=${outputSHA256(result)})`
    );
  };
  const safeError = (error) => sha256(error instanceof Error ? `${error.name}\0${error.message}` : String(error));

  const dockerfilePath = path.join(repoRoot, 'Dockerfile');
  const dockerfileSource = fs.readFileSync(dockerfilePath, 'utf8');
  const helperCopy = 'COPY scripts/resofeed-svelte-build-identity.mjs scripts/build-resofeed.sh ./scripts/';
  const deriveCommand = 'build_identity="$(env -i PATH="$PATH" node ./scripts/resofeed-svelte-build-identity.mjs derive /src)"';
  const buildCommand = 'env -i PATH="$PATH" RESOFEED_SVELTE_BUILD_IDENTITY="$build_identity" npm --prefix web run build';
  const helperCopyIndex = dockerfileSource.indexOf(helperCopy);
  const webCopyIndex = dockerfileSource.indexOf('COPY web ./web');
  const deriveIndex = dockerfileSource.indexOf(deriveCommand);
  const buildIndex = dockerfileSource.indexOf(buildCommand);
  assert.notEqual(helperCopyIndex, -1, 'the web builder must copy both canonical identity helper inputs');
  assert.notEqual(webCopyIndex, -1, 'the web build context must be copied');
  assert.notEqual(deriveIndex, -1, 'the web builder must derive its private identity in a clean environment');
  assert.notEqual(buildIndex, -1, 'the web build must receive only the helper-derived private identity');
  assert.ok(helperCopyIndex < deriveIndex, 'canonical identity helper inputs must exist before derivation');
  assert.ok(webCopyIndex < deriveIndex, 'the complete web manifest must exist before derivation');
  assert.ok(deriveIndex < buildIndex, 'trusted derivation must precede the web build');
  const webBuilderSource = dockerfileSource.slice(
    0,
    dockerfileSource.indexOf('FROM --platform=$BUILDPLATFORM golang:1.22-bookworm AS go-builder')
  );
  assert.match(webBuilderSource, /RUN set -eu;/u);
  assert.doesNotMatch(webBuilderSource, /RUN set -eux;/u);
  assert.doesNotMatch(webBuilderSource, /(?:ARG|ENV)\s+(?:VITE_GIT_COMMIT|RESOFEED_SVELTE_BUILD_IDENTITY)\b/u);

  const identity = deriveSvelteBuildIdentity(repoRoot);
  assert.match(identity, /^rf-[a-f0-9]{64}$/u);
  assert.equal(
    canonicalBuildManifest(repoRoot).some(([relativePath]) => relativePath === 'scripts/build-resofeed.sh'),
    true,
    'the canonical build script must remain an identity manifest input'
  );
  const identityResult = runCommand(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'resofeed-svelte-build-identity.mjs'), 'derive', repoRoot],
    { env: { PATH: process.env.PATH ?? '' } }
  );
  requireGreen('sanitized trusted identity derivation', identityResult);
  assert.equal(identityResult.stdout, identity);
  assert.equal(identityResult.stderr, '');

  const repositoryEnvironment = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    LANG: 'C',
    LC_ALL: 'C'
  };
  const allowedDirtyPaths = new Set(['Dockerfile', 'docs/CONTAINER.md', 'scripts/vectl-check.test.mjs']);
  function sourceFingerprint() {
    const status = runCommand('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      env: repositoryEnvironment
    });
    requireGreen('source cleanliness probe', status);
    for (const row of status.stdout.split('\0').filter(Boolean)) {
      assert.equal(row.slice(0, 2), ' M', 'source may contain only unstaged modifications in the admitted scope');
      assert.equal(allowedDirtyPaths.has(row.slice(3)), true, 'source modification escaped the admitted scope');
    }
    const head = runCommand('git', ['rev-parse', 'HEAD'], { env: repositoryEnvironment });
    requireGreen('source HEAD probe', head);
    const allowedContent = [...allowedDirtyPaths]
      .sort()
      .map((relativePath) => `${relativePath}\0${sha256(fs.readFileSync(path.join(repoRoot, relativePath)))}`)
      .join('\0');
    return sha256(`${head.stdout}\0${status.stdout}\0${allowedContent}`);
  }

  const inspectionEnvironment = { ...repositoryEnvironment, NO_COLOR: '1' };
  for (const name of ['DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) {
    if (process.env[name] !== undefined) inspectionEnvironment[name] = process.env[name];
  }
  const runDocker = (args, env = inspectionEnvironment, timeout = 120_000) => runCommand(
    'docker',
    args,
    { env, timeout }
  );
  const daemonIdentity = (env) => {
    const result = runDocker([
      'info',
      '--format',
      '{{.ID}}\\n{{.Name}}\\n{{.ServerVersion}}\\n{{.OperatingSystem}}\\n{{.Architecture}}\\n{{.DockerRootDir}}'
    ], env);
    requireGreen('Docker daemon identity probe', result);
    return sha256(result.stdout);
  };
  function captureDockerBoundary() {
    const currentContext = runDocker(['context', 'show']);
    requireGreen('selected Docker context probe', currentContext);
    const contextName = currentContext.stdout.trim();
    assert.match(contextName, /^[^\r\n]+$/u, 'selected Docker context must be singular');
    const contextInspect = runDocker(['context', 'inspect', contextName]);
    requireGreen('selected Docker context inspection', contextInspect);
    const rows = JSON.parse(contextInspect.stdout);
    assert.equal(rows.length, 1, 'selected Docker context inspection must return one row');
    const endpoint = rows[0]?.Endpoints?.docker?.Host;
    assert.equal(typeof endpoint, 'string', 'selected Docker context must expose one Docker endpoint');
    assert.match(endpoint, /^(?:unix|npipe|tcp):\/\//u, 'selected Docker endpoint must not require SSH or another credential transport');
    const tlsMaterial = rows[0]?.TLSMaterial?.docker ?? [];
    assert.equal(Array.isArray(tlsMaterial), true, 'selected Docker TLS material must be explicit');
    assert.equal(tlsMaterial.length, 0, 'the no-secret build boundary cannot consume Docker TLS credentials');

    const activeBuilder = runDocker(['buildx', 'inspect']);
    requireGreen('active buildx builder probe', activeBuilder);
    const defaultBuilder = runDocker(['buildx', 'inspect', 'default']);
    requireGreen('default buildx builder probe', defaultBuilder);
    const containers = runDocker([
      'ps', '-a', '--no-trunc', '--format', '{{.ID}}\\t{{.State}}\\t{{.Names}}'
    ]);
    requireGreen('unrelated container fingerprint probe', containers);
    const containerRows = containers.stdout.split(/\r?\n/u).filter(Boolean).sort().join('\n');
    return {
      endpoint,
      fingerprints: {
        context: sha256(`${contextName}\0${contextInspect.stdout}`),
        daemon: daemonIdentity(inspectionEnvironment),
        activeBuilder: sha256(activeBuilder.stdout),
        defaultBuilder: sha256(defaultBuilder.stdout),
        unrelatedContainers: sha256(containerRows)
      }
    };
  }

  const sourceBefore = sourceFingerprint();
  const boundaryBefore = captureDockerBoundary();
  const temporaryRoot = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'resofeed-rf-bug-v2-container-'));
  const dockerConfig = path.join(temporaryRoot, 'docker');
  const buildxConfig = path.join(temporaryRoot, 'buildx');
  const isolatedTmp = path.join(temporaryRoot, 'tmp');
  fs.mkdirSync(dockerConfig, { recursive: true });
  fs.mkdirSync(buildxConfig, { recursive: true });
  fs.mkdirSync(isolatedTmp, { recursive: true });
  fs.writeFileSync(path.join(dockerConfig, 'config.json'), '{}\n', { mode: 0o600 });
  assert.equal(fs.readFileSync(path.join(dockerConfig, 'config.json'), 'utf8'), '{}\n');
  const pluginInventory = runDocker(['info', '--format', '{{json .ClientInfo.Plugins}}']);
  requireGreen('Docker client plugin inventory', pluginInventory);
  const buildxPlugin = JSON.parse(pluginInventory.stdout).find(({ Name, Err }) => Name === 'buildx' && !Err);
  assert.equal(typeof buildxPlugin?.Path, 'string', 'the current Docker client must expose a healthy buildx plugin');
  assert.equal(path.basename(buildxPlugin.Path), 'docker-buildx');
  const isolatedPluginDirectory = path.join(dockerConfig, 'cli-plugins');
  fs.mkdirSync(isolatedPluginDirectory);
  fs.symlinkSync(buildxPlugin.Path, path.join(isolatedPluginDirectory, 'docker-buildx'));

  const uniquePart = sha256(`${process.pid}\0${Date.now()}\0${repoRoot}`).slice(0, 12);
  const builderName = `rfv2-${process.pid}-${uniquePart}`;
  const nodeName = `${builderName}-node`;
  const isolatedEnvironment = {
    PATH: process.env.PATH ?? '',
    HOME: temporaryRoot,
    TMPDIR: isolatedTmp,
    LANG: 'C',
    LC_ALL: 'C',
    NO_COLOR: '1',
    DOCKER_CONFIG: dockerConfig,
    BUILDX_CONFIG: buildxConfig,
    DOCKER_HOST: boundaryBefore.endpoint
  };
  assert.equal('DOCKER_AUTH_CONFIG' in isolatedEnvironment, false);
  assert.deepEqual(
    Object.keys(isolatedEnvironment).filter((name) => /(?:AUTH|TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$)/u.test(name)),
    []
  );
  assert.equal(daemonIdentity(isolatedEnvironment), boundaryBefore.fingerprints.daemon);

  const attributableContainers = () => {
    const result = runDocker([
      'ps', '-a', '--no-trunc', '--filter', `name=${builderName}`, '--format', '{{.ID}}\\t{{.Names}}'
    ], isolatedEnvironment);
    requireGreen('transient BuildKit container probe', result);
    return result.stdout.split(/\r?\n/u).filter(Boolean).map((row) => {
      const [id, name] = row.split('\t');
      assert.match(id, /^[a-f0-9]{64}$/u, 'attributable BuildKit container ID must be canonical');
      assert.equal(name.includes(builderName), true, 'transient container must be attributable to the unique builder');
      return { id, name };
    });
  };

  let operationFailure;
  let operationPhase = 'pre-create';
  let createAttempted = false;
  const cleanupFailures = [];
  try {
    const missingBuilder = runDocker(['buildx', 'inspect', builderName], isolatedEnvironment);
    assert.notEqual(missingBuilder.status, 0, 'the transient builder name must start unused');
    assert.deepEqual(attributableContainers(), []);

    const createArguments = [
      'buildx', 'create',
      '--name', builderName,
      '--driver', 'docker-container',
      '--node', nodeName,
      boundaryBefore.endpoint
    ];
    assert.equal(createArguments.includes('--use'), false);
    operationPhase = 'create';
    createAttempted = true;
    const created = runDocker(createArguments, isolatedEnvironment);
    requireGreen('transient docker-container builder creation', created);
    const builderInspect = runDocker(['buildx', 'inspect', builderName], isolatedEnvironment);
    requireGreen('transient builder inspection', builderInspect);

    const buildArguments = [
      'buildx', 'build',
      '--builder', builderName,
      '--platform', 'linux/amd64,linux/arm64',
      '--progress=plain',
      '--provenance=false',
      '--sbom=false',
      '--output', 'type=cacheonly',
      '.'
    ];
    for (const forbidden of ['--push', '--load', '--tag', '-t', '--secret', '--ssh', '--build-arg']) {
      assert.equal(buildArguments.includes(forbidden), false, `${forbidden} is outside the no-publication proof`);
    }
    assert.deepEqual(buildArguments.slice(-3), ['--output', 'type=cacheonly', '.']);
    operationPhase = 'build';
    const built = runDocker(buildArguments, isolatedEnvironment, 1_500_000);
    const rawBuildOutput = commandOutput(built);
    const suspectOutput = [
      /RESOFEED_SVELTE_BUILD_IDENTITY is private/u,
      /OPENROUTER_KEY\s*=/iu,
      /DOCKER_AUTH_CONFIG\s*=/iu,
      /(?:authorization|password|passwd|token|secret)\s*[:=]\s*\S+/iu
    ].some((pattern) => pattern.test(rawBuildOutput));
    if (suspectOutput) {
      throw new Error(`suspect build output rejected (output_sha256=${sha256(rawBuildOutput)})`);
    }
    for (const privateValue of [process.env.PATH ?? '', dockerConfig, buildxConfig]) {
      if (privateValue !== '' && rawBuildOutput.includes(privateValue)) {
        throw new Error(`private environment output rejected (output_sha256=${sha256(rawBuildOutput)})`);
      }
    }
    requireGreen('dual-platform cache-only container build', built);
    assert.equal(rawBuildOutput.includes('resofeed-svelte-build-identity.mjs derive /src'), true);
    assert.equal(rawBuildOutput.includes('RESOFEED_SVELTE_BUILD_IDENTITY'), true);
    assert.equal(rawBuildOutput.includes('npm --prefix web run build'), true);
    operationPhase = 'post-build';
    const buildkitContainers = attributableContainers();
    assert.equal(buildkitContainers.length, 1, 'the build must use exactly one attributable BuildKit container');
  } catch (error) {
    operationFailure = { phase: operationPhase, error_sha256: safeError(error) };
  } finally {
    if (createAttempted) {
      runDocker(['buildx', 'rm', '--force', builderName], isolatedEnvironment);
    }
    try {
      const residue = attributableContainers();
      if (residue.length > 0) {
        const removed = runDocker(['rm', '--force', ...residue.map(({ id }) => id)], isolatedEnvironment);
        if (removed.status !== 0 || removed.error !== undefined) {
          cleanupFailures.push(`container-removal:${outputSHA256(removed)}`);
        }
      }
      const remaining = attributableContainers();
      if (remaining.length !== 0) cleanupFailures.push(`container-residue:${remaining.length}`);
    } catch (error) {
      cleanupFailures.push(`container-probe:${safeError(error)}`);
    }
    try {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push(`local-config:${safeError(error)}`);
    }
  }

  const boundaryAfter = captureDockerBoundary();
  assert.equal(sha256(boundaryAfter.endpoint), sha256(boundaryBefore.endpoint));
  assert.deepEqual(boundaryAfter.fingerprints, boundaryBefore.fingerprints);
  assert.equal(sourceFingerprint(), sourceBefore);
  if (operationFailure !== undefined || cleanupFailures.length > 0) {
    throw new Error(JSON.stringify({ operationFailure, cleanupFailures }));
  }

  console.log('BUILD_IDENTITY=trusted_canonical_derivation');
  console.log('PLATFORMS=linux/amd64,linux/arm64');
  console.log('PUBLISH=none');
  console.log('SECRETS=absent');
  console.log('RESIDUE=none');
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
    'deploy/resofeed-caddy/verify-remote.sh',
    'deploy/resofeed-caddy/verify.sh',
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

test('selected-execution adapter separates process exit from evidence result', () => {
  const moduleURL = pathToFileURL(adapterPath).href;
  const runCase = (caseName) => {
    const script = `
import { PROFILES, emitSelectedExecution } from ${JSON.stringify(moduleURL)};
const caseName = ${JSON.stringify(caseName)};
const profile = [...PROFILES.values()].find((candidate) => caseName === 'green'
  ? candidate.suite === 'rf-bug-v2-frontend-runtime' && candidate.checkID === 'rf_bug_v2_frontend_runtime_green'
  : candidate.suite === 'item-deep-links-contract' && candidate.checkID === 'item_deep_links_expected_red');
if (!profile) throw new Error('selected execution fixture profile missing');
emitSelectedExecution(profile, () => caseName === 'green'
  ? { outcome: 'green', exitCode: 0, observations: ['fixture=green'], artifacts: [] }
  : {
      outcome: 'red',
      exitCode: 1,
      observations: ['IDL-BACKEND-READ-PROJECTION-GAP', 'IDL-FRONTEND-APP-HISTORY-GAP', 'VECTL_GENERIC_EVIDENCE=valid'],
      artifacts: []
    });
`;
    return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: childEnvironment()
    });
  };

  const greenResult = runCase('green');
  const redResult = runCase('red');
  assert.equal(greenResult.status, 0, greenResult.stderr);
  assert.equal(redResult.status, 0, redResult.stderr);

  const greenProfile = findProfile('rf-bug-v2-frontend-runtime', 'rf_bug_v2_frontend_runtime_green');
  const redProfile = findProfile('item-deep-links-contract', 'item_deep_links_expected_red');
  assert.ok(greenProfile);
  assert.ok(redProfile);
  const greenEnvelope = parseEvidenceOutput(greenResult.stdout, greenProfile, 'green');
  const redEnvelope = parseEvidenceOutput(redResult.stdout, redProfile, 'red');
  assert.equal(greenResult.stdout.trim().split(/\r?\n/u).length, 1);
  assert.equal(redResult.stdout.trim().split(/\r?\n/u).length, 1);
  assert.equal(greenEnvelope.exit_code, 0);
  assert.equal(redEnvelope.exit_code, 1);
  assert.deepEqual(redEnvelope.selected_ids, [
    'ITEM-DEEP-LINK app codec and API domain separation',
    'ITEM-DEEP-LINK browser history auth error read-only lifecycle',
    'ITEM-DEEP-LINK duplicate read envelope and MCP app_url'
  ]);
  assert.deepEqual(redEnvelope.selected_ids, redEnvelope.executed_ids);
  assert.deepEqual(redEnvelope.observations, [
    'IDL-BACKEND-READ-PROJECTION-GAP',
    'IDL-FRONTEND-APP-HISTORY-GAP',
    'VECTL_GENERIC_EVIDENCE=valid'
  ]);

  const refusal = invoke('run', 'unknown-suite', 'unknown-check');
  assert.notEqual(refusal.status, 0);
  assert.equal(refusal.stdout, '');
  assert.match(refusal.stderr, /refused: unknown or mismatched suite\/check pair/u);

  console.info('VECTL_ADAPTER_KNOWN_GREEN_PROCESS_EXIT=0');
  console.info('VECTL_ADAPTER_KNOWN_RED_PROCESS_EXIT=0');
  console.info('VECTL_ADAPTER_GREEN_ENVELOPE_RESULT=green:0');
  console.info('VECTL_ADAPTER_RED_ENVELOPE_RESULT=red:1');
  console.info('VECTL_ADAPTER_ONE_ENVELOPE=valid');
  console.info('VECTL_ADAPTER_PRE_ENVELOPE_REFUSAL=nonzero');
  console.info('VECTL_ADAPTER_ITEM_DEEP_LINK_PROFILE=preserved');
  console.info('IDL-BACKEND-READ-PROJECTION-GAP');
  console.info('IDL-FRONTEND-APP-HISTORY-GAP');
  console.info('VECTL_GENERIC_EVIDENCE=valid');
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
