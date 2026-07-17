#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_dir="${repo_root}/internal/resofeed"
source_dir="${repo_root}/web/build"
e2e_build=0

case "$#" in
  0)
    output_arg="bin/resofeed"
    ;;
  1)
    if [[ "$1" == "--e2e" ]]; then
      printf 'usage: %s [--e2e] [output]\n' "$0" >&2
      exit 2
    fi
    output_arg="$1"
    ;;
  2)
    if [[ "$1" != "--e2e" ]]; then
      printf 'usage: %s [--e2e] [output]\n' "$0" >&2
      exit 2
    fi
    e2e_build=1
    output_arg="$2"
    ;;
  *)
    printf 'usage: %s [--e2e] [output]\n' "$0" >&2
    exit 2
    ;;
esac

if [[ "${output_arg}" = /* ]]; then
  output="${output_arg}"
else
  output="${repo_root}/${output_arg}"
fi

stage_dir="$(mktemp -d "${package_dir}/.webui-stage.XXXXXX")"
staged_ui="${stage_dir}/next-webui"
previous_ui="${stage_dir}/previous-webui"
package_ui="${package_dir}/webui"
replacement_started=0
completed=0
had_previous=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "${replacement_started}" -eq 1 && "${completed}" -ne 1 ]]; then
    rm -rf "${package_ui}"
    if [[ "${had_previous}" -eq 1 && -d "${previous_ui}" ]]; then
      mv "${previous_ui}" "${package_ui}"
    fi
  fi
  rm -rf "${stage_dir}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

validate_bootstrap() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2]);
const indexPath = path.join(root, 'index.html');
if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile() || fs.statSync(indexPath).size === 0) {
  throw new Error('built UI index.html is missing or empty');
}
const document = fs.readFileSync(indexPath, 'utf8');
const scripts = [...document.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)];
if (scripts.length === 0) throw new Error('built UI executable bootstrap is missing');

function attribute(attrs, name) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'iu'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}
function executable(type) {
  return ['', 'module', 'text/javascript', 'application/javascript', 'importmap'].includes(type.trim().toLowerCase());
}
function validateReference(reference) {
  if (!reference || reference.startsWith('//')) throw new Error(`invalid package-local UI reference: ${reference}`);
  let parsed;
  try { parsed = new URL(reference, 'https://package.local/'); } catch { throw new Error(`invalid UI reference: ${reference}`); }
  if (parsed.origin !== 'https://package.local') throw new Error(`external UI reference: ${reference}`);
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  if (!relative || (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`escaping UI reference: ${reference}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`missing UI reference: ${reference}`);
}

let bootstrapReady = false;
for (const script of scripts) {
  const attrs = script[1];
  const body = script[2].replace(/\r\n?/gu, '\n');
  const source = attribute(attrs, 'src');
  if (source) {
    validateReference(source);
    bootstrapReady = true;
    continue;
  }
  if (!executable(attribute(attrs, 'type'))) continue;
  if (!body.trim()) throw new Error('built UI executable bootstrap is empty');
  bootstrapReady = true;
  for (const imported of body.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/giu)) validateReference(imported[1]);
}
if (!bootstrapReady) throw new Error('built UI executable bootstrap is missing');
for (const link of document.matchAll(/<link\b([^>]*)>/giu)) {
  const href = attribute(link[1], 'href');
  if (href) validateReference(href);
}
NODE
}

cd "${repo_root}"
if [[ "${RESOFEED_SVELTE_BUILD_IDENTITY+x}" == "x" ]]; then
  printf 'RESOFEED_SVELTE_BUILD_IDENTITY is private to the canonical build pipeline\n' >&2
  exit 2
fi

build_identity="$(node "${repo_root}/scripts/resofeed-svelte-build-identity.mjs" derive "${repo_root}")"
if [[ ! "${build_identity}" =~ ^rf-[a-f0-9]{64}$ ]]; then
  printf 'canonical Svelte build identity derivation failed\n' >&2
  exit 2
fi

env -i \
  PATH="${PATH}" \
  HOME="${HOME:-}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  CI=1 \
  NO_COLOR=1 \
  RESOFEED_SVELTE_BUILD_IDENTITY="${build_identity}" \
  npm --prefix web run build
validate_bootstrap "${source_dir}"
mkdir -p "${staged_ui}"
cp -R "${source_dir}/." "${staged_ui}/"
validate_bootstrap "${staged_ui}"

replacement_started=1
if [[ -d "${package_ui}" ]]; then
  had_previous=1
  mv "${package_ui}" "${previous_ui}"
fi
mv "${staged_ui}" "${package_ui}"

go test ./internal/resofeed -run '^TestEmbeddedUIBootstrapValidation$' -count=1
mkdir -p "$(dirname "${output}")"
if [[ "${e2e_build}" -eq 1 ]]; then
  go build -trimpath -tags resofeed_e2e -o "${output}" ./cmd/resofeed
else
  go build -trimpath -o "${output}" ./cmd/resofeed
fi
completed=1
