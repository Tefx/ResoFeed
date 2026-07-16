#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_arg="${1:-bin/resofeed}"
if [[ "${output_arg}" = /* ]]; then
  output="${output_arg}"
else
  output="${repo_root}/${output_arg}"
fi
source_dir="${repo_root}/web/build"
package_dir="${repo_root}/internal/resofeed"
stage_dir="$(mktemp -d "${package_dir}/.webui-stage.XXXXXX")"
trap 'rm -rf "${stage_dir}"' EXIT

cd "${repo_root}"
npm --prefix web run build

test -s "${source_dir}/index.html"
mkdir -p "${stage_dir}/webui"
cp -R "${source_dir}/." "${stage_dir}/webui/"
rm -rf "${package_dir}/webui"
mv "${stage_dir}/webui" "${package_dir}/webui"

go test ./internal/resofeed -run '^TestEmbeddedUIBootstrapValidation$' -count=1
mkdir -p "$(dirname "${output}")"
go build -trimpath -o "${output}" ./cmd/resofeed
