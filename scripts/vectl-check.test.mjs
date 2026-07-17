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
  childEnvironmentForCommand,
  evidenceEnvelope,
  parseEvidenceOutput,
  parseSelectionOutput,
  runPromptingHarness,
  runTokenParityHarness,
  selectionEnvelope
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
  assert.equal(PENDING_PROFILE_PAIRS.length, 18);
  assert.equal(expectedPending.length, 18);

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
