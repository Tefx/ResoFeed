import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_IDENTITY_ENV = 'RESOFEED_SVELTE_BUILD_IDENTITY';
export const BUILD_IDENTITY_PATTERN = /^rf-[a-f0-9]{64}$/u;

const explicitFiles = [
  'scripts/build-resofeed.sh',
  'web/package-lock.json',
  'web/package.json',
  'web/svelte.config.js',
  'web/tsconfig.json',
  'web/vite.config.ts'
];
const recursiveRoots = ['web/src', 'web/static'];

/** @param {string} left @param {string} right */
function byteOrder(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

/** @param {string} root @param {string} relativePath */
function regularFile(root, relativePath) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch {
    throw new Error(`missing deterministic build input: ${relativePath}`);
  }
  if (!stat.isFile()) throw new Error(`non-regular deterministic build input: ${relativePath}`);
  return absolutePath;
}

/** @param {string} repoRoot @returns {Array<[string, string]>} */
export function canonicalBuildManifest(repoRoot) {
  const root = path.resolve(repoRoot);
  const files = [...explicitFiles];
  /** @param {string} relativeDirectory */
  function visit(relativeDirectory) {
    const absoluteDirectory = path.join(root, ...relativeDirectory.split('/'));
    let entries;
    try {
      entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
    } catch {
      throw new Error(`missing deterministic build input directory: ${relativeDirectory}`);
    }
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) files.push(relativePath);
      else throw new Error(`non-regular deterministic build input: ${relativePath}`);
    }
  }
  for (const relativeRoot of recursiveRoots) visit(relativeRoot);
  files.sort(byteOrder);
  if (files.length === 0 || new Set(files).size !== files.length) {
    throw new Error('invalid deterministic build input manifest');
  }
  return files.map((relativePath) => [
    relativePath,
    createHash('sha256').update(fs.readFileSync(regularFile(root, relativePath))).digest('hex')
  ]);
}

/** @param {string} repoRoot */
export function deriveSvelteBuildIdentity(repoRoot) {
  const manifest = canonicalBuildManifest(repoRoot);
  const digest = createHash('sha256').update(JSON.stringify(manifest), 'utf8').digest('hex');
  const identity = `rf-${digest}`;
  if (!BUILD_IDENTITY_PATTERN.test(identity)) throw new Error('canonical Svelte build identity derivation failed');
  return identity;
}

/** @param {string} repoRoot @param {NodeJS.ProcessEnv} environment */
export function resolveSvelteBuildIdentity(repoRoot, environment = process.env) {
  if (!Object.prototype.hasOwnProperty.call(environment, BUILD_IDENTITY_ENV)) {
    throw new Error(`${BUILD_IDENTITY_ENV} trusted derivation is missing`);
  }
  const identity = deriveSvelteBuildIdentity(repoRoot);
  if (environment[BUILD_IDENTITY_ENV] !== identity) {
    throw new Error(`${BUILD_IDENTITY_ENV} cannot override the trusted canonical derivation`);
  }
  return identity;
}

/** @param {string} repoRoot @param {NodeJS.ProcessEnv} environment */
export function installSvelteBuildIdentity(repoRoot, environment = process.env) {
  const identity = deriveSvelteBuildIdentity(repoRoot);
  if (
    Object.prototype.hasOwnProperty.call(environment, BUILD_IDENTITY_ENV)
    && environment[BUILD_IDENTITY_ENV] !== identity
  ) {
    throw new Error(`${BUILD_IDENTITY_ENV} cannot override the trusted canonical derivation`);
  }
  environment[BUILD_IDENTITY_ENV] = identity;
  return identity;
}

function main() {
  const [command, rootArgument] = process.argv.slice(2);
  if (command !== 'derive' || !rootArgument) {
    process.stderr.write(`usage: ${path.basename(process.argv[1])} derive <repo-root>\n`);
    process.exitCode = 2;
    return;
  }
  if (Object.prototype.hasOwnProperty.call(process.env, BUILD_IDENTITY_ENV)) {
    process.stderr.write(`${BUILD_IDENTITY_ENV} is private to the canonical build pipeline\n`);
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(deriveSvelteBuildIdentity(rootArgument));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) main();
