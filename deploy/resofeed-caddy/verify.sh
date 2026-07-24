#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
readonly WRAPPER_PROGRAM="${SCRIPT_DIR}/verify.sh"
readonly REMOTE_PROGRAM="${SCRIPT_DIR}/verify-remote.sh"
readonly SOURCE_DEPLOY_PATH="deploy/resofeed-caddy/deploy.sh"
readonly SOURCE_COMPOSE_PATH="deploy/resofeed-caddy/compose.yml"
readonly SOURCE_WRAPPER_PATH="deploy/resofeed-caddy/verify.sh"
readonly SOURCE_REMOTE_PATH="deploy/resofeed-caddy/verify-remote.sh"
readonly TAILNET_TARGET_HOST="tefx-mbp-personal.platy-atlas.ts.net"
readonly -a TAILNET_SSH_OPTIONS=(
  -o "HostName=${TAILNET_TARGET_HOST}"
  -o "HostKeyAlias=${TAILNET_TARGET_HOST}"
  -o StrictHostKeyChecking=yes
  -o UpdateHostKeys=no
  -o VerifyHostKeyDNS=no
  -o CanonicalizeHostname=no
  -o BatchMode=yes
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -o KbdInteractiveAuthentication=no
  -o NumberOfPasswordPrompts=0
  -o AddKeysToAgent=no
  -o ForwardAgent=no
  -o ClearAllForwardings=yes
  -o ControlMaster=no
  -o ControlPath=none
  -o RequestTTY=no
)

SOURCE_COMMIT=""
DEPLOY_SHA256=""
DEPLOY_MODE=""
COMPOSE_SHA256=""
COMPOSE_MODE=""
BACKUP_ID=""
BACKUP_MANIFEST_MODE=""
PRIOR_DEPLOY_SHA256=""
PRIOR_DEPLOY_MODE=""
PRIOR_COMPOSE_SHA256=""
PRIOR_COMPOSE_MODE=""
SEEN_ARGUMENTS='|'

construction_fail() {
  printf 'PROBE_CONSTRUCTION_FAIL status=2\n'
  exit 2
}

is_sha256() {
  [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]
}

file_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    printf 'sha256:%s' "$(shasum -a 256 "$1" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    printf 'sha256:%s' "$(sha256sum "$1" | awk '{print $1}')"
  else
    return 1
  fi
}

stream_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print "sha256:" $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print "sha256:" $1}'
  else
    return 1
  fi
}

file_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

mark_argument() {
  case "$SEEN_ARGUMENTS" in
    *"|$1|"*) construction_fail ;;
  esac
  SEEN_ARGUMENTS="${SEEN_ARGUMENTS}$1|"
}

while [ "$#" -gt 0 ]; do
  option=$1
  [ "$#" -ge 2 ] || construction_fail
  mark_argument "$option"
  value=$2
  case "$option" in
    --source-commit) SOURCE_COMMIT=$value ;;
    --deploy-sha256) DEPLOY_SHA256=$value ;;
    --deploy-mode) DEPLOY_MODE=$value ;;
    --compose-sha256) COMPOSE_SHA256=$value ;;
    --compose-mode) COMPOSE_MODE=$value ;;
    --backup-id) BACKUP_ID=$value ;;
    --backup-manifest-mode) BACKUP_MANIFEST_MODE=$value ;;
    --prior-deploy-sha256) PRIOR_DEPLOY_SHA256=$value ;;
    --prior-deploy-mode) PRIOR_DEPLOY_MODE=$value ;;
    --prior-compose-sha256) PRIOR_COMPOSE_SHA256=$value ;;
    --prior-compose-mode) PRIOR_COMPOSE_MODE=$value ;;
    *) construction_fail ;;
  esac
  shift 2
done

[ "$SEEN_ARGUMENTS" = '|--source-commit|--deploy-sha256|--deploy-mode|--compose-sha256|--compose-mode|--backup-id|--backup-manifest-mode|--prior-deploy-sha256|--prior-deploy-mode|--prior-compose-sha256|--prior-compose-mode|' ] \
  || construction_fail
[[ "$SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]] || construction_fail
for digest in "$DEPLOY_SHA256" "$COMPOSE_SHA256" "$BACKUP_ID" "$PRIOR_DEPLOY_SHA256" "$PRIOR_COMPOSE_SHA256"; do
  is_sha256 "$digest" || construction_fail
done
[ "$DEPLOY_MODE" = 755 ] || construction_fail
[ "$COMPOSE_MODE" = 644 ] || construction_fail
[ "$BACKUP_MANIFEST_MODE" = 600 ] || construction_fail
[ "$PRIOR_DEPLOY_MODE" = 755 ] || construction_fail
[ "$PRIOR_COMPOSE_MODE" = 644 ] || construction_fail

repo_root=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null) || construction_fail
[ "$SCRIPT_DIR" -ef "${repo_root}/deploy/resofeed-caddy" ] || construction_fail
[ -f "$WRAPPER_PROGRAM" ] && [ ! -L "$WRAPPER_PROGRAM" ] && [ -x "$WRAPPER_PROGRAM" ] || construction_fail
[ -f "$REMOTE_PROGRAM" ] && [ ! -L "$REMOTE_PROGRAM" ] && [ -x "$REMOTE_PROGRAM" ] || construction_fail
if git -C "$repo_root" symbolic-ref -q HEAD >/dev/null 2>&1; then
  construction_fail
fi
integrated_head=$(git -C "$repo_root" rev-parse HEAD 2>/dev/null) || construction_fail
[[ "$integrated_head" =~ ^[a-f0-9]{40}$ ]] || construction_fail
[ -z "$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all 2>/dev/null)" ] || construction_fail
git -C "$repo_root" cat-file -e "${SOURCE_COMMIT}^{commit}" 2>/dev/null || construction_fail
git -C "$repo_root" merge-base --is-ancestor "$SOURCE_COMMIT" "$integrated_head" 2>/dev/null || construction_fail

source_deploy="${repo_root}/${SOURCE_DEPLOY_PATH}"
source_compose="${repo_root}/${SOURCE_COMPOSE_PATH}"
[ -f "$source_deploy" ] && [ ! -L "$source_deploy" ] || construction_fail
[ -f "$source_compose" ] && [ ! -L "$source_compose" ] || construction_fail
[ "$(file_mode "$source_deploy")" = "$DEPLOY_MODE" ] || construction_fail
[ "$(file_mode "$source_compose")" = "$COMPOSE_MODE" ] || construction_fail
[ "$(file_sha256 "$source_deploy")" = "$DEPLOY_SHA256" ] || construction_fail
[ "$(file_sha256 "$source_compose")" = "$COMPOSE_SHA256" ] || construction_fail

expected_deploy_entry="100755 blob $(git -C "$repo_root" rev-parse "${SOURCE_COMMIT}:${SOURCE_DEPLOY_PATH}" 2>/dev/null)"$'\t'"${SOURCE_DEPLOY_PATH}"
expected_compose_entry="100644 blob $(git -C "$repo_root" rev-parse "${SOURCE_COMMIT}:${SOURCE_COMPOSE_PATH}" 2>/dev/null)"$'\t'"${SOURCE_COMPOSE_PATH}"
[ "$(git -C "$repo_root" ls-tree "$SOURCE_COMMIT" -- "$SOURCE_DEPLOY_PATH")" = "$expected_deploy_entry" ] || construction_fail
[ "$(git -C "$repo_root" ls-tree "$SOURCE_COMMIT" -- "$SOURCE_COMPOSE_PATH")" = "$expected_compose_entry" ] || construction_fail
[ "$(git -C "$repo_root" cat-file blob "${SOURCE_COMMIT}:${SOURCE_DEPLOY_PATH}" | stream_sha256)" = "$DEPLOY_SHA256" ] || construction_fail
[ "$(git -C "$repo_root" cat-file blob "${SOURCE_COMMIT}:${SOURCE_COMPOSE_PATH}" | stream_sha256)" = "$COMPOSE_SHA256" ] || construction_fail

for helper_binding in "${SOURCE_WRAPPER_PATH}|${WRAPPER_PROGRAM}" "${SOURCE_REMOTE_PATH}|${REMOTE_PROGRAM}"; do
  helper_path=${helper_binding%%|*}
  helper_file=${helper_binding#*|}
  helper_oid=$(git -C "$repo_root" rev-parse "${integrated_head}:${helper_path}" 2>/dev/null) || construction_fail
  expected_helper_entry="100755 blob ${helper_oid}"$'\t'"${helper_path}"
  [ "$(git -C "$repo_root" ls-tree "$integrated_head" -- "$helper_path")" = "$expected_helper_entry" ] || construction_fail
  [ "$(file_mode "$helper_file")" = 755 ] || construction_fail
  [ "$(git -C "$repo_root" cat-file blob "${integrated_head}:${helper_path}" | stream_sha256)" = "$(file_sha256 "$helper_file")" ] || construction_fail
done

ssh_status=0
if probe_output=$(ssh -Fnone -T "${TAILNET_SSH_OPTIONS[@]}" "$TAILNET_TARGET_HOST" \
  bash -s -- \
  "$SOURCE_COMMIT" \
  "$DEPLOY_SHA256" \
  "$DEPLOY_MODE" \
  "$COMPOSE_SHA256" \
  "$COMPOSE_MODE" \
  "$BACKUP_ID" \
  "$BACKUP_MANIFEST_MODE" \
  "$PRIOR_DEPLOY_SHA256" \
  "$PRIOR_DEPLOY_MODE" \
  "$PRIOR_COMPOSE_SHA256" \
  "$PRIOR_COMPOSE_MODE" \
  < "$REMOTE_PROGRAM" 2>/dev/null); then
  ssh_status=0
else
  ssh_status=$?
fi

if [ -z "$probe_output" ]; then
  printf 'PROBE_TRANSPORT_FAIL status=%s\n' "$ssh_status"
  [ "$ssh_status" -ne 0 ] && exit "$ssh_status"
  exit 1
fi

fail_count=0
ok_count=0
while IFS= read -r marker; do
  case "$marker" in
    PROBE_PHASE=canonical_stack|CANONICAL_STACK=verified|PROBE_PHASE=procedure_current|PROCEDURE_CURRENT=verified|PROBE_PHASE=backup|BACKUP=verified|PROBE_PHASE=docker_identity|DOCKER_IDENTITY=verified|PROBE_PHASE=volume|VOLUME=verified|PROBE_PHASE=tailnet_route|TAILNET_ROUTE=verified|PROBE_PHASE=public_url|PUBLIC_URL_HOST=validated|PROBE_PHASE=readiness|READINESS=verified|PROBE_PHASE=protected_after|PROTECTED_STATE=unchanged) ;;
    PROBE_OK) ok_count=$((ok_count + 1)) ;;
    PROBE_FAIL\ phase=*\ status=*) fail_count=$((fail_count + 1)) ;;
    *) printf 'PROBE_TRANSPORT_FAIL status=%s\n' "$ssh_status"; exit 1 ;;
  esac
done <<EOF
$probe_output
EOF

readonly SUCCESS_LEDGER='PROBE_PHASE=canonical_stack
CANONICAL_STACK=verified
PROBE_PHASE=procedure_current
PROCEDURE_CURRENT=verified
PROBE_PHASE=backup
BACKUP=verified
PROBE_PHASE=docker_identity
DOCKER_IDENTITY=verified
PROBE_PHASE=volume
VOLUME=verified
PROBE_PHASE=tailnet_route
TAILNET_ROUTE=verified
PROBE_PHASE=public_url
PUBLIC_URL_HOST=validated
PROBE_PHASE=readiness
READINESS=verified
PROBE_PHASE=protected_after
PROTECTED_STATE=unchanged
PROBE_OK'

if [ "$ssh_status" -eq 0 ]; then
  [ "$ok_count" -eq 1 ] && [ "$fail_count" -eq 0 ] && [ "$probe_output" = "$SUCCESS_LEDGER" ] \
    || { printf 'PROBE_TRANSPORT_FAIL status=0\n'; exit 1; }
else
  [ "$ok_count" -eq 0 ] && [ "$fail_count" -eq 1 ] \
    || { printf 'PROBE_TRANSPORT_FAIL status=%s\n' "$ssh_status"; exit "$ssh_status"; }
fi

printf '%s\n' "$probe_output"
exit "$ssh_status"
