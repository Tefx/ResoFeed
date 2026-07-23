#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"
umask 077

readonly COMPOSE_FILE="compose.yml"
readonly ENV_FILE=".env"
readonly OCI_REPOSITORY="docker.io/tefx/resofeed"
readonly STACK_NAME="resofeed-caddy"
readonly TAILNET_TARGET_HOST="tefx-mbp-personal.platy-atlas.ts.net"
readonly TAILNET_STACK_PATH="Projects/${STACK_NAME}"
readonly PROCEDURE_DEPLOY_PATH="deploy/resofeed-caddy/deploy.sh"
readonly PROCEDURE_COMPOSE_PATH="deploy/resofeed-caddy/compose.yml"
readonly PROCEDURE_BACKUP_ROOT=".resofeed-procedure-backups"
readonly RESOFEED_VOLUME="resofeed-caddy_resofeed-data"
readonly ORPHAN_LEDGER=".resofeed-oci-orphans.log"

MODE="deploy"
VERIFIED_COMMIT=""
IMMUTABLE_TAG=""
OCI_INDEX_DIGEST=""
AMD64_MANIFEST_DIGEST=""
ARM64_MANIFEST_DIGEST=""
PROCEDURE_DEPLOY_SHA256=""
PROCEDURE_COMPOSE_SHA256=""
PROCEDURE_BACKUP_ID=""
RESOFEED_IMAGE=""

TAILSCALE_IP=""
CADDY_LOCAL_HTTPS_PORT=""
RESOFEED_DOMAIN=""
CF_API_TOKEN=""
OPENROUTER_KEY=""
TAVILY_API_KEY=""
ENV_VERIFIED_COMMIT=""
ENV_IMMUTABLE_TAG=""
ENV_INDEX_DIGEST=""
ENV_AMD64_DIGEST=""
ENV_ARM64_DIGEST=""

PREVIOUS_IMAGE=""
PREVIOUS_VERIFIED_COMMIT=""
PREVIOUS_IMMUTABLE_TAG=""
PREVIOUS_INDEX_DIGEST=""
PREVIOUS_AMD64_DIGEST=""
PREVIOUS_ARM64_DIGEST=""
REPLACEMENT_STARTED=0

usage() {
  cat <<'EOF'
RESOFEED :: IMMUTABLE PROCEDURE / OCI / CADDY / TAILSCALE

Usage:
  ./deploy/resofeed-caddy/deploy.sh --stage-procedure \
    --verified-commit <40-hex>

  ./deploy/resofeed-caddy/deploy.sh --recover-procedure \
    --backup-id <sha256:64-hex>

  ./deploy.sh --verified-commit <40-hex> --immutable-tag <git-40-hex> \
    --index-digest <sha256:64-hex> \
    --amd64-digest <sha256:64-hex> \
    --arm64-digest <sha256:64-hex> \
    --procedure-deploy-sha256 <sha256:64-hex> \
    --procedure-compose-sha256 <sha256:64-hex>

  ./deploy.sh --record-orphan --verified-commit <40-hex> \
    --immutable-tag <git-40-hex> \
    --index-digest <sha256:64-hex> \
    --amd64-digest <sha256:64-hex> \
    --arm64-digest <sha256:64-hex>

The stage-procedure mode runs only from the exact clean verified commit. It sends
only that commit's deploy.sh and compose.yml bytes to the fixed Tailnet stack,
validates their SHA-256 identities, preserves the prior procedure as a named
backup, and atomically replaces each target file within one rollback transaction.
It does not read runtime configuration or publish, deploy, stop, or restart.
The recover-procedure mode restores one reported content-addressed backup through
the same fixed interface. Downstream operators must not substitute copy commands.

The deploy mode first verifies the staged procedure commit and both caller-bound
SHA-256 identities, then verifies the OCI chain and updates only the existing
tefx-mbp-personal resofeed-caddy stack. Failure restores the prior digest and
verifies readiness. The record-orphan mode appends the complete non-secret chain
to the local orphan ledger. Registry tag deletion is outside this script and
requires separate, explicit registry authorization.
EOF
}

section() {
  printf '\n%s\n' "$1"
}

ok() {
  printf '[ OK ] %s\n' "$1"
}

fail() {
  printf '[ FAIL ] %s\n' "$1" >&2
}

fatal() {
  fail "$1"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fatal "Required command is unavailable: $1"
  ok "Command available: $1"
}

is_digest() {
  [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]
}

sha256_file() {
  printf 'sha256:%s' "$(shasum -a 256 "$1" | awk '{print $1}')"
}

mark_argument() {
  case "$SEEN_ARGUMENTS" in
    *"|$1|"*) fatal "Duplicate option is refused: $1" ;;
  esac
  SEEN_ARGUMENTS="${SEEN_ARGUMENTS}$1|"
}

parse_arguments() {
  case "${1:-}" in
    --stage-procedure) MODE="stage-procedure"; shift ;;
    --recover-procedure) MODE="recover-procedure"; shift ;;
    --record-orphan) MODE="record-orphan"; shift ;;
  esac

  SEEN_ARGUMENTS='|'
  while [ "$#" -gt 0 ]; do
    mark_argument "$1"
    case "$1" in
      --verified-commit)
        [ "$#" -ge 2 ] || fatal "--verified-commit requires a value."
        VERIFIED_COMMIT=$2
        shift 2
        ;;
      --immutable-tag)
        [ "$#" -ge 2 ] || fatal "--immutable-tag requires a value."
        IMMUTABLE_TAG=$2
        shift 2
        ;;
      --index-digest)
        [ "$#" -ge 2 ] || fatal "--index-digest requires a value."
        OCI_INDEX_DIGEST=$2
        shift 2
        ;;
      --amd64-digest)
        [ "$#" -ge 2 ] || fatal "--amd64-digest requires a value."
        AMD64_MANIFEST_DIGEST=$2
        shift 2
        ;;
      --arm64-digest)
        [ "$#" -ge 2 ] || fatal "--arm64-digest requires a value."
        ARM64_MANIFEST_DIGEST=$2
        shift 2
        ;;
      --procedure-deploy-sha256)
        [ "$#" -ge 2 ] || fatal "--procedure-deploy-sha256 requires a value."
        PROCEDURE_DEPLOY_SHA256=$2
        shift 2
        ;;
      --procedure-compose-sha256)
        [ "$#" -ge 2 ] || fatal "--procedure-compose-sha256 requires a value."
        PROCEDURE_COMPOSE_SHA256=$2
        shift 2
        ;;
      --backup-id)
        [ "$#" -ge 2 ] || fatal "--backup-id requires a value."
        PROCEDURE_BACKUP_ID=$2
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        fatal "Unsupported option. Mutable, destructive, credential, and alternate-target modes are refused."
        ;;
    esac
  done
}

validate_verified_commit() {
  [[ "$VERIFIED_COMMIT" =~ ^[a-f0-9]{40}$ ]] || fatal "Verified commit must be exactly 40 lowercase hexadecimal characters."
}

validate_identity_arguments() {
  validate_verified_commit
  expected_tag="git-${VERIFIED_COMMIT}"
  [ "$IMMUTABLE_TAG" = "$expected_tag" ] || fatal "Immutable tag must be the git-<verified-commit> binding."

  is_digest "$OCI_INDEX_DIGEST" || fatal "OCI index digest is missing or malformed."
  is_digest "$AMD64_MANIFEST_DIGEST" || fatal "linux/amd64 manifest digest is missing or malformed."
  is_digest "$ARM64_MANIFEST_DIGEST" || fatal "linux/arm64 manifest digest is missing or malformed."
  [ "$OCI_INDEX_DIGEST" != "$AMD64_MANIFEST_DIGEST" ] || fatal "OCI index and linux/amd64 manifest digests must differ."
  [ "$OCI_INDEX_DIGEST" != "$ARM64_MANIFEST_DIGEST" ] || fatal "OCI index and linux/arm64 manifest digests must differ."
  [ "$AMD64_MANIFEST_DIGEST" != "$ARM64_MANIFEST_DIGEST" ] || fatal "Platform manifest digests must differ."

  RESOFEED_IMAGE="${OCI_REPOSITORY}@${OCI_INDEX_DIGEST}"
}

validate_procedure_identity_arguments() {
  is_digest "$PROCEDURE_DEPLOY_SHA256" || fatal "deploy.sh procedure SHA-256 is missing or malformed."
  is_digest "$PROCEDURE_COMPOSE_SHA256" || fatal "compose.yml procedure SHA-256 is missing or malformed."
}

require_empty_deployment_arguments() {
  [ -z "$IMMUTABLE_TAG$OCI_INDEX_DIGEST$AMD64_MANIFEST_DIGEST$ARM64_MANIFEST_DIGEST$PROCEDURE_DEPLOY_SHA256$PROCEDURE_COMPOSE_SHA256$PROCEDURE_BACKUP_ID" ] \
    || fatal "Procedure staging accepts only one verified commit identity."
}

validate_target_boundary() {
  [ "$(basename "$SCRIPT_DIR")" = "$STACK_NAME" ] || fatal "Deployment directory is not the authorized resofeed-caddy stack."
  [ "$SCRIPT_DIR" = "${HOME}/Projects/${STACK_NAME}" ] || fatal "Deployment directory is outside the authorized Tailnet stack path."
  [ "$(hostname -s)" = "${TAILNET_TARGET_HOST%%.*}" ] || fatal "Deployment host is outside the authorized Tailnet target."
}

remote_procedure_helper() {
  ssh "$TAILNET_TARGET_HOST" bash -s -- "$@" <<'REMOTE_PROCEDURE'
set -Eeuo pipefail
umask 077

readonly EXPECTED_HOST="tefx-mbp-personal"
readonly STACK_NAME="resofeed-caddy"
readonly STACK_DIR="${HOME}/Projects/${STACK_NAME}"
readonly BACKUP_ROOT=".resofeed-procedure-backups"
readonly TRANSACTION_LOCK=".resofeed-procedure-transaction.lock"

fatal() {
  printf '[ FAIL ] procedure staging: %s\n' "$1" >&2
  exit 1
}

is_sha256() {
  [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]
}

sha256_file() {
  printf 'sha256:%s' "$(shasum -a 256 "$1" | awk '{print $1}')"
}

file_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

validate_target() {
  [ "$(hostname -s)" = "$EXPECTED_HOST" ] || fatal "target host identity drifted"
  [ -d "$STACK_DIR" ] || fatal "target stack directory is missing"
  cd "$STACK_DIR"
  [ "$PWD" = "$STACK_DIR" ] || fatal "target stack directory identity drifted"
  [ "$(basename "$PWD")" = "$STACK_NAME" ] || fatal "target stack name drifted"
}

validate_target_files() {
  [ -f deploy.sh ] && [ ! -L deploy.sh ] || fatal "prior deploy.sh is missing or unsafe"
  [ -f compose.yml ] && [ ! -L compose.yml ] || fatal "prior compose.yml is missing or unsafe"
  [ -x deploy.sh ] || fatal "prior deploy.sh is not executable"
}

validate_compose_shape() {
  local compose_path=$1
  export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"
  command -v docker >/dev/null 2>&1 || fatal "Docker CLI is unavailable for procedure validation"
  docker compose version >/dev/null 2>&1 || fatal "Compose is unavailable for procedure validation"
  CADDY_LOCAL_HTTPS_PORT=8443 \
  CF_API_TOKEN=procedure-validation \
  RESOFEED_DOMAIN=procedure.invalid \
  RESOFEED_IMAGE="docker.io/tefx/resofeed@sha256:$(printf '0%.0s' {1..64})" \
  OPENROUTER_KEY= \
  TAVILY_API_KEY= \
  COMPOSE_DISABLE_ENV_FILE=1 \
    docker compose --project-directory "$PWD" --env-file /dev/null -f "$compose_path" config --quiet >/dev/null 2>&1 \
    || fatal "Compose procedure shape is invalid"
}

validate_pair() {
  local directory=$1
  local deploy_hash=$2
  local compose_hash=$3
  local deploy_mode=$4
  local compose_mode=$5
  [ -f "$directory/deploy.sh" ] && [ ! -L "$directory/deploy.sh" ] || fatal "deploy.sh procedure bytes are unavailable"
  [ -f "$directory/compose.yml" ] && [ ! -L "$directory/compose.yml" ] || fatal "compose.yml procedure bytes are unavailable"
  [ "$(sha256_file "$directory/deploy.sh")" = "$deploy_hash" ] || fatal "deploy.sh SHA-256 mismatch"
  [ "$(sha256_file "$directory/compose.yml")" = "$compose_hash" ] || fatal "compose.yml SHA-256 mismatch"
  [ "$(file_mode "$directory/deploy.sh")" = "$deploy_mode" ] || fatal "deploy.sh mode mismatch"
  [ "$(file_mode "$directory/compose.yml")" = "$compose_mode" ] || fatal "compose.yml mode mismatch"
  bash -n "$directory/deploy.sh" >/dev/null 2>&1 || fatal "deploy.sh procedure shape is invalid"
  validate_compose_shape "$directory/compose.yml"
}

backup_identity() {
  printf 'resofeed.procedure-backup.v1\ndeploy.sh=%s mode=%s\ncompose.yml=%s mode=%s\n' \
    "$1" "$3" "$2" "$4" | shasum -a 256 | awk '{print "sha256:" $1}'
}

validate_backup() {
  local backup_dir=$1
  local backup_id=$2
  local deploy_hash=$3
  local compose_hash=$4
  local deploy_mode=$5
  local compose_mode=$6
  [ -d "$backup_dir" ] && [ ! -L "$backup_dir" ] || fatal "procedure backup is unavailable"
  [ -f "$backup_dir/manifest" ] && [ ! -L "$backup_dir/manifest" ] || fatal "procedure backup manifest is unavailable"
  grep -Fxq 'schema_version=resofeed.procedure-backup.v1' "$backup_dir/manifest" || fatal "procedure backup schema is invalid"
  grep -Fxq "backup_id=$backup_id" "$backup_dir/manifest" || fatal "procedure backup identity is invalid"
  grep -Fxq "deploy.sh=$deploy_hash mode=$deploy_mode" "$backup_dir/manifest" || fatal "procedure deploy backup manifest drifted"
  grep -Fxq "compose.yml=$compose_hash mode=$compose_mode" "$backup_dir/manifest" || fatal "procedure Compose backup manifest drifted"
  validate_pair "$backup_dir" "$deploy_hash" "$compose_hash" "$deploy_mode" "$compose_mode"
}

create_backup() {
  local deploy_hash=$1
  local compose_hash=$2
  local deploy_mode=$3
  local compose_mode=$4
  local backup_id backup_hex backup_dir backup_tmp
  backup_id=$(backup_identity "$deploy_hash" "$compose_hash" "$deploy_mode" "$compose_mode")
  backup_hex=${backup_id#sha256:}
  backup_dir="${BACKUP_ROOT}/${backup_hex}"
  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"
  if [ -e "$backup_dir" ]; then
    validate_backup "$backup_dir" "$backup_id" "$deploy_hash" "$compose_hash" "$deploy_mode" "$compose_mode"
  else
    backup_tmp="${BACKUP_ROOT}/.${backup_hex}.tmp.$$"
    [ ! -e "$backup_tmp" ] || fatal "procedure backup temporary path is occupied"
    mkdir "$backup_tmp"
    cp -p deploy.sh "$backup_tmp/deploy.sh"
    cp -p compose.yml "$backup_tmp/compose.yml"
    printf '%s\n' \
      'schema_version=resofeed.procedure-backup.v1' \
      "backup_id=$backup_id" \
      "deploy.sh=$deploy_hash mode=$deploy_mode" \
      "compose.yml=$compose_hash mode=$compose_mode" > "$backup_tmp/manifest"
    chmod 600 "$backup_tmp/manifest"
    validate_backup "$backup_tmp" "$backup_id" "$deploy_hash" "$compose_hash" "$deploy_mode" "$compose_mode"
    mv -f "$backup_tmp" "$backup_dir"
  fi
  CREATED_BACKUP_ID=$backup_id
  CREATED_BACKUP_DIR=$backup_dir
}

replace_pair() {
  local source_dir=$1
  local deploy_hash=$2
  local compose_hash=$3
  local deploy_mode=$4
  local compose_mode=$5
  local deploy_tmp=".deploy.sh.procedure.$$"
  local compose_tmp=".compose.yml.procedure.$$"
  validate_pair "$source_dir" "$deploy_hash" "$compose_hash" "$deploy_mode" "$compose_mode"
  cp "$source_dir/deploy.sh" "$deploy_tmp"
  cp "$source_dir/compose.yml" "$compose_tmp"
  chmod "$deploy_mode" "$deploy_tmp"
  chmod "$compose_mode" "$compose_tmp"
  [ "$(sha256_file "$deploy_tmp")" = "$deploy_hash" ] || fatal "target-local deploy.sh temporary bytes drifted"
  [ "$(sha256_file "$compose_tmp")" = "$compose_hash" ] || fatal "target-local compose.yml temporary bytes drifted"
  mv -f "$deploy_tmp" deploy.sh
  mv -f "$compose_tmp" compose.yml
  [ "$(sha256_file deploy.sh)" = "$deploy_hash" ] || fatal "installed deploy.sh SHA-256 mismatch"
  [ "$(sha256_file compose.yml)" = "$compose_hash" ] || fatal "installed compose.yml SHA-256 mismatch"
  [ -x deploy.sh ] || fatal "installed deploy.sh lost executable mode"
}

operation=${1:-}
shift || true
validate_target

case "$operation" in
  inspect)
    [ "$#" -eq 0 ] || fatal "inspection arguments are invalid"
    validate_target_files
    bash -n deploy.sh >/dev/null 2>&1 || fatal "prior deploy.sh procedure shape is invalid"
    validate_compose_shape compose.yml
    printf 'PRIOR_DEPLOY_SHA256=%s\n' "$(sha256_file deploy.sh)"
    printf 'PRIOR_COMPOSE_SHA256=%s\n' "$(sha256_file compose.yml)"
    printf 'PRIOR_DEPLOY_MODE=%s\n' "$(file_mode deploy.sh)"
    printf 'PRIOR_COMPOSE_MODE=%s\n' "$(file_mode compose.yml)"
    ;;
  prepare)
    [ "$#" -eq 3 ] || fatal "prepare arguments are invalid"
    stage_name=$1
    prior_deploy_hash=$2
    prior_compose_hash=$3
    [[ "$stage_name" =~ ^\.resofeed-procedure-stage-[a-f0-9]{40}$ ]] || fatal "stage identity is invalid"
    is_sha256 "$prior_deploy_hash" && is_sha256 "$prior_compose_hash" || fatal "prior SHA-256 identity is invalid"
    validate_target_files
    [ "$(sha256_file deploy.sh)" = "$prior_deploy_hash" ] || fatal "prior deploy.sh drifted before staging"
    [ "$(sha256_file compose.yml)" = "$prior_compose_hash" ] || fatal "prior compose.yml drifted before staging"
    [ ! -e "$stage_name" ] || fatal "procedure stage already exists"
    mkdir "$TRANSACTION_LOCK" 2>/dev/null || fatal "another procedure transaction is active"
    if ! mkdir "$stage_name"; then
      rmdir "$TRANSACTION_LOCK" || true
      fatal "procedure stage could not be created"
    fi
    chmod 700 "$TRANSACTION_LOCK" "$stage_name"
    ;;
  finalize)
    [ "$#" -eq 8 ] || fatal "finalize arguments are invalid"
    stage_name=$1
    source_commit=$2
    source_deploy_hash=$3
    source_compose_hash=$4
    prior_deploy_hash=$5
    prior_compose_hash=$6
    prior_deploy_mode=$7
    prior_compose_mode=$8
    [[ "$stage_name" =~ ^\.resofeed-procedure-stage-[a-f0-9]{40}$ ]] || fatal "stage identity is invalid"
    [[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || fatal "source commit identity is invalid"
    is_sha256 "$source_deploy_hash" && is_sha256 "$source_compose_hash" || fatal "source SHA-256 identity is invalid"
    is_sha256 "$prior_deploy_hash" && is_sha256 "$prior_compose_hash" || fatal "prior SHA-256 identity is invalid"
    [[ "$prior_deploy_mode" =~ ^[0-7]{3,4}$ ]] && [[ "$prior_compose_mode" =~ ^[0-7]{3,4}$ ]] || fatal "prior mode identity is invalid"
    [ -d "$TRANSACTION_LOCK" ] && [ ! -L "$TRANSACTION_LOCK" ] || fatal "procedure transaction lock is unavailable"
    [ -d "$stage_name" ] && [ ! -L "$stage_name" ] || fatal "procedure stage is unavailable"
    [ "$(find "$stage_name" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')" = 2 ] || fatal "procedure stage must contain exactly two regular files"
    chmod 755 "$stage_name/deploy.sh"
    chmod 644 "$stage_name/compose.yml"
    validate_pair "$stage_name" "$source_deploy_hash" "$source_compose_hash" 755 644
    validate_target_files
    [ "$(sha256_file deploy.sh)" = "$prior_deploy_hash" ] || fatal "prior deploy.sh drifted before replacement"
    [ "$(sha256_file compose.yml)" = "$prior_compose_hash" ] || fatal "prior compose.yml drifted before replacement"
    [ "$(file_mode deploy.sh)" = "$prior_deploy_mode" ] || fatal "prior deploy.sh mode drifted before replacement"
    [ "$(file_mode compose.yml)" = "$prior_compose_mode" ] || fatal "prior compose.yml mode drifted before replacement"
    create_backup "$prior_deploy_hash" "$prior_compose_hash" "$prior_deploy_mode" "$prior_compose_mode"

    replacement_started=0
    replacement_complete=0
    rollback_finalize() {
      status=$?
      trap - ERR INT TERM EXIT
      set +e
      if [ "$replacement_started" -eq 1 ] && [ "$replacement_complete" -eq 0 ]; then
        replace_pair "$CREATED_BACKUP_DIR" "$prior_deploy_hash" "$prior_compose_hash" "$prior_deploy_mode" "$prior_compose_mode"
        restore_status=$?
        if [ "$restore_status" -eq 0 ]; then
          printf '[ FAIL ] PROCEDURE_ROLLBACK=prior_bytes_restored\n' >&2
        else
          printf '[ FAIL ] PROCEDURE_ROLLBACK=manual_intervention_required\n' >&2
        fi
      fi
      rm -f .deploy.sh.procedure.* .compose.yml.procedure.*
      rm -rf "$stage_name"
      rmdir "$TRANSACTION_LOCK" 2>/dev/null || true
      exit "$status"
    }
    trap rollback_finalize ERR INT TERM EXIT
    replacement_started=1
    replace_pair "$stage_name" "$source_deploy_hash" "$source_compose_hash" 755 644
    printf 'PROCEDURE_BACKUP_ID=%s\n' "$CREATED_BACKUP_ID"
    printf 'PROCEDURE_PRIOR_DEPLOY_SHA256=%s\n' "$prior_deploy_hash"
    printf 'PROCEDURE_PRIOR_COMPOSE_SHA256=%s\n' "$prior_compose_hash"
    printf 'PROCEDURE_STAGE=verified\n'
    rm -rf "$stage_name"
    rmdir "$TRANSACTION_LOCK" || fatal "procedure transaction lock could not be released"
    replacement_complete=1
    trap - ERR INT TERM EXIT
    ;;
  cleanup)
    [ "$#" -eq 1 ] || fatal "cleanup arguments are invalid"
    stage_name=$1
    [[ "$stage_name" =~ ^\.resofeed-procedure-stage-[a-f0-9]{40}$ ]] || fatal "stage identity is invalid"
    rm -rf "$stage_name"
    rmdir "$TRANSACTION_LOCK" 2>/dev/null || true
    ;;
  recover)
    [ "$#" -eq 1 ] || fatal "recovery arguments are invalid"
    backup_id=$1
    is_sha256 "$backup_id" || fatal "procedure backup identity is invalid"
    validate_target_files
    backup_dir="${BACKUP_ROOT}/${backup_id#sha256:}"
    [ -f "$backup_dir/manifest" ] || fatal "procedure backup is unavailable"
    deploy_row=$(awk -F'[ =]' '$1=="deploy.sh" {print $2 " " $4}' "$backup_dir/manifest")
    compose_row=$(awk -F'[ =]' '$1=="compose.yml" {print $2 " " $4}' "$backup_dir/manifest")
    read -r backup_deploy_hash backup_deploy_mode <<EOF
$deploy_row
EOF
    read -r backup_compose_hash backup_compose_mode <<EOF
$compose_row
EOF
    is_sha256 "$backup_deploy_hash" && is_sha256 "$backup_compose_hash" || fatal "procedure backup manifest hashes are invalid"
    validate_backup "$backup_dir" "$backup_id" "$backup_deploy_hash" "$backup_compose_hash" "$backup_deploy_mode" "$backup_compose_mode"

    mkdir "$TRANSACTION_LOCK" 2>/dev/null || fatal "another procedure transaction is active"
    chmod 700 "$TRANSACTION_LOCK"
    rescue_dir=".resofeed-procedure-recovery.$$"
    rescue_ready=0
    rollback_recovery() {
      status=$?
      trap - ERR INT TERM EXIT
      set +e
      restore_status=0
      if [ "$rescue_ready" -eq 1 ]; then
        replace_pair "$rescue_dir" "$rescue_deploy_hash" "$rescue_compose_hash" "$rescue_deploy_mode" "$rescue_compose_mode"
        restore_status=$?
      fi
      rm -f .deploy.sh.procedure.* .compose.yml.procedure.*
      rm -rf "$rescue_dir"
      rmdir "$TRANSACTION_LOCK" 2>/dev/null || true
      if [ "$rescue_ready" -eq 0 ]; then
        printf '[ FAIL ] PROCEDURE_RECOVERY_ROLLBACK=not_started\n' >&2
      elif [ "$restore_status" -eq 0 ]; then
        printf '[ FAIL ] PROCEDURE_RECOVERY_ROLLBACK=current_bytes_restored\n' >&2
      else
        printf '[ FAIL ] PROCEDURE_RECOVERY_ROLLBACK=manual_intervention_required\n' >&2
      fi
      exit "$status"
    }
    trap rollback_recovery ERR INT TERM EXIT
    mkdir "$rescue_dir"
    cp -p deploy.sh "$rescue_dir/deploy.sh"
    cp -p compose.yml "$rescue_dir/compose.yml"
    rescue_deploy_hash=$(sha256_file deploy.sh)
    rescue_compose_hash=$(sha256_file compose.yml)
    rescue_deploy_mode=$(file_mode deploy.sh)
    rescue_compose_mode=$(file_mode compose.yml)
    validate_pair "$rescue_dir" "$rescue_deploy_hash" "$rescue_compose_hash" "$rescue_deploy_mode" "$rescue_compose_mode"
    rescue_ready=1
    replace_pair "$backup_dir" "$backup_deploy_hash" "$backup_compose_hash" "$backup_deploy_mode" "$backup_compose_mode"
    printf 'PROCEDURE_RECOVERY=%s\n' "$backup_id"
    printf 'PROCEDURE_RECOVERY_STATUS=verified\n'
    rmdir "$TRANSACTION_LOCK" || fatal "procedure transaction lock could not be released"
    trap - ERR INT TERM EXIT
    rm -rf "$rescue_dir"
    ;;
  *) fatal "unsupported procedure operation" ;;
esac
REMOTE_PROCEDURE
}

procedure_output_value() {
  local output=$1
  local key=$2
  printf '%s\n' "$output" | awk -F= -v wanted="$key" '$1 == wanted {print substr($0, index($0, "=") + 1)}'
}

transfer_procedure_file() {
  local source_path=$1
  local stage_name=$2
  local target_name=$3
  ssh "$TAILNET_TARGET_HOST" "set -Eeuo pipefail
umask 077
[ \"\$(hostname -s)\" = \"${TAILNET_TARGET_HOST%%.*}\" ]
cd \"\$HOME/${TAILNET_STACK_PATH}\"
[ \"\$PWD\" = \"\$HOME/${TAILNET_STACK_PATH}\" ]
[ -d \".resofeed-procedure-transaction.lock\" ] && [ ! -L \".resofeed-procedure-transaction.lock\" ]
[ -d \"${stage_name}\" ] && [ ! -L \"${stage_name}\" ]
[ ! -e \"${stage_name}/${target_name}\" ]
cat > \"${stage_name}/${target_name}\"" < "$source_path"
}

stage_procedure() {
  validate_verified_commit
  require_empty_deployment_arguments
  for command_name in git shasum ssh; do
    command -v "$command_name" >/dev/null 2>&1 || fatal "Required staging command is unavailable: $command_name"
  done

  repo_root=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null) \
    || fatal "Procedure staging must run from an integrated repository checkout."
  [ "$SCRIPT_DIR" -ef "${repo_root}/deploy/resofeed-caddy" ] \
    || fatal "Procedure staging source directory is outside the integrated checkout."
  [ "$(git -C "$repo_root" rev-parse HEAD)" = "$VERIFIED_COMMIT" ] \
    || fatal "Procedure source HEAD does not equal the verified commit."
  git -C "$repo_root" cat-file -e "${VERIFIED_COMMIT}^{commit}" 2>/dev/null \
    || fatal "Verified procedure commit is unavailable."
  [ -z "$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)" ] \
    || fatal "Procedure source checkout is not clean."

  source_deploy="${repo_root}/${PROCEDURE_DEPLOY_PATH}"
  source_compose="${repo_root}/${PROCEDURE_COMPOSE_PATH}"
  [ -f "$source_deploy" ] && [ ! -L "$source_deploy" ] && [ -x "$source_deploy" ] \
    || fatal "Verified deploy.sh source is missing, unsafe, or non-executable."
  [ -f "$source_compose" ] && [ ! -L "$source_compose" ] \
    || fatal "Verified compose.yml source is missing or unsafe."
  deploy_tree_entry=$(git -C "$repo_root" ls-tree "$VERIFIED_COMMIT" -- "$PROCEDURE_DEPLOY_PATH")
  compose_tree_entry=$(git -C "$repo_root" ls-tree "$VERIFIED_COMMIT" -- "$PROCEDURE_COMPOSE_PATH")
  [[ "$deploy_tree_entry" == 100755\ blob\ *$'\t'"$PROCEDURE_DEPLOY_PATH" ]] \
    || fatal "Verified deploy.sh Git mode is not 100755."
  [[ "$compose_tree_entry" == 100644\ blob\ *$'\t'"$PROCEDURE_COMPOSE_PATH" ]] \
    || fatal "Verified compose.yml Git mode is not 100644."

  source_deploy_hash=$(sha256_file "$source_deploy")
  source_compose_hash=$(sha256_file "$source_compose")
  commit_deploy_hash="sha256:$(git -C "$repo_root" cat-file blob "${VERIFIED_COMMIT}:${PROCEDURE_DEPLOY_PATH}" | shasum -a 256 | awk '{print $1}')"
  commit_compose_hash="sha256:$(git -C "$repo_root" cat-file blob "${VERIFIED_COMMIT}:${PROCEDURE_COMPOSE_PATH}" | shasum -a 256 | awk '{print $1}')"
  [ "$source_deploy_hash" = "$commit_deploy_hash" ] || fatal "deploy.sh bytes differ from the verified commit."
  [ "$source_compose_hash" = "$commit_compose_hash" ] || fatal "compose.yml bytes differ from the verified commit."

  inspection=$(remote_procedure_helper inspect) || fatal "Read-only procedure target inspection failed."
  prior_deploy_hash=$(procedure_output_value "$inspection" PRIOR_DEPLOY_SHA256)
  prior_compose_hash=$(procedure_output_value "$inspection" PRIOR_COMPOSE_SHA256)
  prior_deploy_mode=$(procedure_output_value "$inspection" PRIOR_DEPLOY_MODE)
  prior_compose_mode=$(procedure_output_value "$inspection" PRIOR_COMPOSE_MODE)
  is_digest "$prior_deploy_hash" && is_digest "$prior_compose_hash" \
    || fatal "Read-only target inspection returned invalid prior identities."
  [[ "$prior_deploy_mode" =~ ^[0-7]{3,4}$ ]] && [[ "$prior_compose_mode" =~ ^[0-7]{3,4}$ ]] \
    || fatal "Read-only target inspection returned invalid prior modes."

  stage_name=".resofeed-procedure-stage-${VERIFIED_COMMIT}"
  stage_prepared=0
  cleanup_stage() {
    if [ "$stage_prepared" -eq 1 ]; then
      remote_procedure_helper cleanup "$stage_name" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_stage EXIT
  remote_procedure_helper prepare "$stage_name" "$prior_deploy_hash" "$prior_compose_hash" >/dev/null \
    || fatal "Target-local procedure stage preparation failed."
  stage_prepared=1
  transfer_procedure_file "$source_deploy" "$stage_name" deploy.sh \
    || fatal "deploy.sh transfer to target-local staging failed."
  transfer_procedure_file "$source_compose" "$stage_name" compose.yml \
    || fatal "compose.yml transfer to target-local staging failed."
  [ "$(sha256_file "$source_deploy")" = "$source_deploy_hash" ] \
    || fatal "Local deploy.sh changed during procedure staging."
  [ "$(sha256_file "$source_compose")" = "$source_compose_hash" ] \
    || fatal "Local compose.yml changed during procedure staging."
  [ "$(git -C "$repo_root" rev-parse HEAD)" = "$VERIFIED_COMMIT" ] \
    || fatal "Procedure source HEAD changed during staging."
  [ -z "$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)" ] \
    || fatal "Procedure source checkout changed during staging."

  finalize_output=$(remote_procedure_helper finalize \
    "$stage_name" "$VERIFIED_COMMIT" "$source_deploy_hash" "$source_compose_hash" \
    "$prior_deploy_hash" "$prior_compose_hash" "$prior_deploy_mode" "$prior_compose_mode") \
    || fatal "Atomic procedure replacement failed."
  stage_prepared=0
  trap - EXIT

  printf 'PROCEDURE_SOURCE_COMMIT=%s\n' "$VERIFIED_COMMIT"
  printf 'PROCEDURE_DEPLOY_SHA256=%s\n' "$source_deploy_hash"
  printf 'PROCEDURE_COMPOSE_SHA256=%s\n' "$source_compose_hash"
  printf '%s\n' "$finalize_output"
}

recover_procedure() {
  [ -z "$VERIFIED_COMMIT$IMMUTABLE_TAG$OCI_INDEX_DIGEST$AMD64_MANIFEST_DIGEST$ARM64_MANIFEST_DIGEST$PROCEDURE_DEPLOY_SHA256$PROCEDURE_COMPOSE_SHA256" ] \
    || fatal "Procedure recovery accepts only one backup identity."
  is_digest "$PROCEDURE_BACKUP_ID" || fatal "Procedure backup identity is missing or malformed."
  command -v ssh >/dev/null 2>&1 || fatal "Required recovery command is unavailable: ssh"
  remote_procedure_helper recover "$PROCEDURE_BACKUP_ID"
}

verify_staged_procedure_identity() {
  section '[ PROCEDURE IDENTITY ]'
  require_command shasum
  [ "$(sha256_file "$SCRIPT_DIR/deploy.sh")" = "$PROCEDURE_DEPLOY_SHA256" ] \
    || fatal "Installed deploy.sh does not match the caller-bound procedure SHA-256."
  [ "$(sha256_file "$SCRIPT_DIR/$COMPOSE_FILE")" = "$PROCEDURE_COMPOSE_SHA256" ] \
    || fatal "Installed compose.yml does not match the caller-bound procedure SHA-256."
  ok "PROCEDURE_SOURCE_COMMIT=${VERIFIED_COMMIT}"
  ok "PROCEDURE_DEPLOY_SHA256=${PROCEDURE_DEPLOY_SHA256}"
  ok "PROCEDURE_COMPOSE_SHA256=${PROCEDURE_COMPOSE_SHA256}"
}

record_orphan() {
  validate_target_boundary
  printf '%s verified_commit=%s immutable_tag=%s index=%s linux_amd64=%s linux_arm64=%s\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    "$VERIFIED_COMMIT" "$IMMUTABLE_TAG" "$OCI_INDEX_DIGEST" \
    "$AMD64_MANIFEST_DIGEST" "$ARM64_MANIFEST_DIGEST" >> "$ORPHAN_LEDGER"
  ok "ORPHAN_CHAIN=recorded_for_authorized_follow_up"
}

load_env() {
  local seen_keys='|'
  [ -f "$ENV_FILE" ] || fatal "Missing .env. Copy .env.example, configure it locally, and retry."
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key=${line%%=*}
    value=${line#*=}
    value=${value%$'\r'}
    case "$key" in
      TAILSCALE_IP|CADDY_LOCAL_HTTPS_PORT|RESOFEED_DOMAIN|CF_API_TOKEN|OPENROUTER_KEY|TAVILY_API_KEY|RESOFEED_IMAGE|RESOFEED_VERIFIED_COMMIT|RESOFEED_IMMUTABLE_TAG|RESOFEED_INDEX_DIGEST|RESOFEED_AMD64_DIGEST|RESOFEED_ARM64_DIGEST)
        case "$seen_keys" in
          *"|${key}|"*) fatal "Duplicate deployment configuration key is refused: ${key}" ;;
        esac
        seen_keys="${seen_keys}${key}|"
        ;;
      *) continue ;;
    esac
    case "$key" in
      TAILSCALE_IP) TAILSCALE_IP=$value ;;
      CADDY_LOCAL_HTTPS_PORT) CADDY_LOCAL_HTTPS_PORT=$value ;;
      RESOFEED_DOMAIN) RESOFEED_DOMAIN=$value ;;
      CF_API_TOKEN) CF_API_TOKEN=$value ;;
      OPENROUTER_KEY) OPENROUTER_KEY=$value ;;
      TAVILY_API_KEY) TAVILY_API_KEY=$value ;;
      RESOFEED_IMAGE) : ;;
      RESOFEED_VERIFIED_COMMIT) ENV_VERIFIED_COMMIT=$value ;;
      RESOFEED_IMMUTABLE_TAG) ENV_IMMUTABLE_TAG=$value ;;
      RESOFEED_INDEX_DIGEST) ENV_INDEX_DIGEST=$value ;;
      RESOFEED_AMD64_DIGEST) ENV_AMD64_DIGEST=$value ;;
      RESOFEED_ARM64_DIGEST) ENV_ARM64_DIGEST=$value ;;
    esac
  done < "$ENV_FILE"
}

validate_runtime_configuration() {
  if [ -z "$TAILSCALE_IP" ]; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null | awk 'NF {print; exit}')
  fi
  [ -n "$TAILSCALE_IP" ] || fatal "TAILSCALE_IP is unavailable."
  [[ "$CADDY_LOCAL_HTTPS_PORT" =~ ^[0-9]+$ ]] || fatal "CADDY_LOCAL_HTTPS_PORT must be numeric."
  [ "$CADDY_LOCAL_HTTPS_PORT" -ge 1 ] && [ "$CADDY_LOCAL_HTTPS_PORT" -le 65535 ] \
    || fatal "CADDY_LOCAL_HTTPS_PORT is outside the TCP port range."
  [ -n "$RESOFEED_DOMAIN" ] || fatal "RESOFEED_DOMAIN is required."
  [ -n "$CF_API_TOKEN" ] && [ "$CF_API_TOKEN" != "replace_with_cloudflare_dns01_token" ] \
    || fatal "CF_API_TOKEN=[masked] must be configured."

  ok "CF_API_TOKEN=[masked-present]"
  if [ -n "$OPENROUTER_KEY" ]; then ok "OPENROUTER_KEY=[masked-present]"; else ok "OPENROUTER_KEY=[masked-empty]"; fi
  if [ -n "$TAVILY_API_KEY" ]; then ok "TAVILY_API_KEY=[masked-present]"; else ok "TAVILY_API_KEY=[masked-empty]"; fi
}

inspect_manifest_digest() {
  platform=$1
  awk -v wanted="$platform" '
    $1 == "Name:" && $2 ~ /@sha256:/ { digest=$2; sub(/^.*@/, "", digest) }
    $1 == "Platform:" && $2 == wanted { print digest }
  '
}

verify_oci_descriptor() {
  reference=$1
  output=$(docker buildx imagetools inspect "$reference" 2>/dev/null) \
    || fatal "OCI identity inspection failed."

  observed_media_type=$(printf '%s\n' "$output" | awk '$1 == "MediaType:" {print $2; exit}')
  observed_index=$(printf '%s\n' "$output" | awk '$1 == "Digest:" {print $2; exit}')
  observed_amd64=$(printf '%s\n' "$output" | inspect_manifest_digest 'linux/amd64')
  observed_arm64=$(printf '%s\n' "$output" | inspect_manifest_digest 'linux/arm64')
  platform_count=$(printf '%s\n' "$output" | awk '$1 == "Platform:" {count++} END {print count+0}')
  unexpected_platforms=$(printf '%s\n' "$output" | awk '$1 == "Platform:" && $2 != "linux/amd64" && $2 != "linux/arm64" {count++} END {print count+0}')

  [ "$observed_media_type" = "application/vnd.oci.image.index.v1+json" ] \
    || fatal "Published descriptor is not an OCI image index."
  [ "$observed_index" = "$OCI_INDEX_DIGEST" ] || fatal "OCI index digest does not match the caller-supplied chain."
  [ "$observed_amd64" = "$AMD64_MANIFEST_DIGEST" ] || fatal "linux/amd64 manifest digest does not match the caller-supplied chain."
  [ "$observed_arm64" = "$ARM64_MANIFEST_DIGEST" ] || fatal "linux/arm64 manifest digest does not match the caller-supplied chain."
  [ "$platform_count" -eq 2 ] && [ "$unexpected_platforms" -eq 0 ] \
    || fatal "OCI index must contain exactly linux/amd64 and linux/arm64 manifests."
}

verify_commit_label() {
  digest=$1
  labels=$(docker buildx imagetools inspect "${OCI_REPOSITORY}@${digest}" \
    --format '{{json .Image.Config.Labels}}' 2>/dev/null) \
    || fatal "OCI platform commit-label inspection failed."
  printf '%s' "$labels" | grep -Fq "\"org.opencontainers.image.revision\":\"${VERIFIED_COMMIT}\"" \
    || fatal "OCI platform image is not bound to the verified commit."
}

verify_oci_identity() {
  section '[ OCI IDENTITY ]'
  verify_oci_descriptor "${OCI_REPOSITORY}:${IMMUTABLE_TAG}"
  verify_oci_descriptor "${OCI_REPOSITORY}@${OCI_INDEX_DIGEST}"
  verify_commit_label "$AMD64_MANIFEST_DIGEST"
  verify_commit_label "$ARM64_MANIFEST_DIGEST"
  ok "VERIFIED_COMMIT=${VERIFIED_COMMIT}"
  ok "IMMUTABLE_TAG=${IMMUTABLE_TAG}"
  ok "OCI_INDEX_DIGEST=${OCI_INDEX_DIGEST}"
  ok "LINUX_AMD64_DIGEST=${AMD64_MANIFEST_DIGEST}"
  ok "LINUX_ARM64_DIGEST=${ARM64_MANIFEST_DIGEST}"
}

canonical_repository_digest() {
  local candidate digest
  case "$1" in
    "${OCI_REPOSITORY}@"sha256:*) candidate=$1 ;;
    "tefx/resofeed@"sha256:*) candidate="docker.io/$1" ;;
    *) return 1 ;;
  esac
  digest=${candidate#*@}
  is_digest "$digest" || return 1
  printf '%s' "$candidate"
}

resolve_previous_image() {
  if ! docker container inspect resofeed >/dev/null 2>&1; then
    return 0
  fi

  configured=$(docker container inspect --format '{{.Config.Image}}' resofeed 2>/dev/null) \
    || fatal "Unable to inspect the currently deployed ResoFeed container."
  if previous=$(canonical_repository_digest "$configured"); then
    PREVIOUS_IMAGE=$previous
    return 0
  fi

  image_id=$(docker container inspect --format '{{.Image}}' resofeed 2>/dev/null) \
    || fatal "Unable to inspect the currently deployed image ID."
  candidates=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" 2>/dev/null) \
    || fatal "Unable to resolve the prior repository digest."
  resolved=""
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if canonical=$(canonical_repository_digest "$candidate"); then
      if [ -n "$resolved" ] && [ "$resolved" != "$canonical" ]; then
        fatal "The prior image resolves to multiple repository digests."
      fi
      resolved=$canonical
    fi
  done <<EOF
$candidates
EOF
  [ -n "$resolved" ] || fatal "The current deployment has no recoverable immutable repository digest."
  PREVIOUS_IMAGE=$resolved
}

validate_existing_state() {
  resolve_previous_image
  if [ -z "$PREVIOUS_IMAGE" ]; then
    ok "No prior ResoFeed container; first immutable deployment will retain the named SQLite volume."
    return
  fi

  mounts=$(docker container inspect --format '{{range .Mounts}}{{println .Name "|" .Destination}}{{end}}' resofeed 2>/dev/null) \
    || fatal "Unable to inspect the existing ResoFeed mounts."
  printf '%s\n' "$mounts" | grep -Fq "${RESOFEED_VOLUME} | /data" \
    || fatal "Existing ResoFeed does not use the preserved SQLite volume."
  docker container inspect resofeed-caddy >/dev/null 2>&1 \
    || fatal "Existing ResoFeed deployment is missing the resofeed-caddy container."
  ok "Prior immutable digest captured for readiness rollback."
  ok "SQLite volume preservation verified."
}

validate_tailscale_boundary() {
  target="tcp://127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}"
  status=$(tailscale serve status 2>&1 || true)
  if printf '%s\n' "$status" | grep -qi 'No serve config'; then
    return 0
  fi
  if printf '%s\n' "$status" | grep -Fq "$target"; then
    return 0
  fi
  if printf '%s\n' "$status" | grep -Eq '(^|[^0-9])443([^0-9]|$)'; then
    fatal "Tailnet TCP/443 is owned by a different target."
  fi
}

ensure_tailscale_serve() {
  target="tcp://127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}"
  status=$(tailscale serve status 2>&1 || true)
  if ! printf '%s\n' "$status" | grep -Fq "$target"; then
    tailscale serve --bg --tcp=443 "$target" >/dev/null
  fi
  ok "Tailnet TCP/443 forwards to the existing local Caddy HTTPS listener."
}

write_image_chain() {
  local image=$1
  local commit=$2
  local tag=$3
  local index_digest=$4
  local amd64_digest=$5
  local arm64_digest=$6
  local tmp
  tmp=$(mktemp "${ENV_FILE}.identity.XXXXXX")
  chmod 600 "$tmp" || { rm -f "$tmp"; return 1; }
  if ! awk \
    -v image="$image" \
    -v commit="$commit" \
    -v tag="$tag" \
    -v index_digest="$index_digest" \
    -v amd64_digest="$amd64_digest" \
    -v arm64_digest="$arm64_digest" '
      BEGIN {
        values["RESOFEED_IMAGE"]=image
        values["RESOFEED_VERIFIED_COMMIT"]=commit
        values["RESOFEED_IMMUTABLE_TAG"]=tag
        values["RESOFEED_INDEX_DIGEST"]=index_digest
        values["RESOFEED_AMD64_DIGEST"]=amd64_digest
        values["RESOFEED_ARM64_DIGEST"]=arm64_digest
      }
      /^[A-Z0-9_]+=/ {
        key=$0; sub(/=.*/, "", key)
        if (key in values) { print key "=" values[key]; seen[key]=1; next }
      }
      { print }
      END {
        order[1]="RESOFEED_IMAGE"
        order[2]="RESOFEED_VERIFIED_COMMIT"
        order[3]="RESOFEED_IMMUTABLE_TAG"
        order[4]="RESOFEED_INDEX_DIGEST"
        order[5]="RESOFEED_AMD64_DIGEST"
        order[6]="RESOFEED_ARM64_DIGEST"
        for (i=1; i<=6; i++) if (!(order[i] in seen)) print order[i] "=" values[order[i]]
      }
    ' "$ENV_FILE" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$ENV_FILE" || { rm -f "$tmp"; return 1; }
}

wait_for_readiness() {
  attempts=${1:-30}
  for ((attempt=1; attempt<=attempts; attempt++)); do
    root_code=$(curl -k -sS -o /dev/null -w '%{http_code}' \
      --resolve "${RESOFEED_DOMAIN}:${CADDY_LOCAL_HTTPS_PORT}:127.0.0.1" \
      "https://${RESOFEED_DOMAIN}:${CADDY_LOCAL_HTTPS_PORT}/" 2>/dev/null || true)
    doctor_code=$(curl -k -sS -o /dev/null -w '%{http_code}' \
      --resolve "${RESOFEED_DOMAIN}:${CADDY_LOCAL_HTTPS_PORT}:127.0.0.1" \
      "https://${RESOFEED_DOMAIN}:${CADDY_LOCAL_HTTPS_PORT}/api/doctor" 2>/dev/null || true)
    if [ "$root_code" = "200" ] && [ "$doctor_code" = "401" ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

run_quiet() {
  description=$1
  shift
  tmp=$(mktemp "${TMPDIR:-/tmp}/resofeed-deploy-output.XXXXXX")
  if "$@" >"$tmp" 2>&1; then
    rm -f "$tmp"
    ok "$description"
    return 0
  fi
  rm -f "$tmp"
  fail "$description failed; inspect local Docker/Tailscale status without exposing secrets."
  return 1
}

rollback_previous_digest() {
  set +e
  trap - ERR
  fail "Immutable deployment failed; starting bounded recovery."

  write_image_chain \
    "$PREVIOUS_IMAGE" "$PREVIOUS_VERIFIED_COMMIT" "$PREVIOUS_IMMUTABLE_TAG" \
    "$PREVIOUS_INDEX_DIGEST" "$PREVIOUS_AMD64_DIGEST" "$PREVIOUS_ARM64_DIGEST"
  restore_env_status=$?

  rollback_status=0
  if [ -n "$PREVIOUS_IMAGE" ]; then
    if [ "$REPLACEMENT_STARTED" -eq 1 ]; then
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull resofeed >/dev/null 2>&1 || rollback_status=1
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d resofeed >/dev/null 2>&1 || rollback_status=1
    fi
    wait_for_readiness 30 || rollback_status=1
  else
    rollback_status=1
  fi

  if [ "$restore_env_status" -eq 0 ] && [ "$rollback_status" -eq 0 ]; then
    fail "ROLLBACK=prior_digest_and_readiness restored"
  else
    fail "ROLLBACK=manual_intervention_required; SQLite volume was not removed"
  fi
  exit 1
}

capture_previous_chain() {
  PREVIOUS_VERIFIED_COMMIT=$ENV_VERIFIED_COMMIT
  PREVIOUS_IMMUTABLE_TAG=$ENV_IMMUTABLE_TAG
  PREVIOUS_AMD64_DIGEST=$ENV_AMD64_DIGEST
  PREVIOUS_ARM64_DIGEST=$ENV_ARM64_DIGEST

  if [ -z "$PREVIOUS_IMAGE" ]; then
    PREVIOUS_VERIFIED_COMMIT=""
    PREVIOUS_IMMUTABLE_TAG=""
    PREVIOUS_INDEX_DIGEST=""
    PREVIOUS_AMD64_DIGEST=""
    PREVIOUS_ARM64_DIGEST=""
    return
  fi

  PREVIOUS_INDEX_DIGEST=${PREVIOUS_IMAGE#*@}
  if ! [[ "$PREVIOUS_VERIFIED_COMMIT" =~ ^[a-f0-9]{40}$ ]] \
    || [ "$PREVIOUS_IMMUTABLE_TAG" != "git-${PREVIOUS_VERIFIED_COMMIT}" ] \
    || [ "$ENV_INDEX_DIGEST" != "$PREVIOUS_INDEX_DIGEST" ] \
    || ! is_digest "$PREVIOUS_AMD64_DIGEST" \
    || ! is_digest "$PREVIOUS_ARM64_DIGEST" \
    || [ "$PREVIOUS_INDEX_DIGEST" = "$PREVIOUS_AMD64_DIGEST" ] \
    || [ "$PREVIOUS_INDEX_DIGEST" = "$PREVIOUS_ARM64_DIGEST" ] \
    || [ "$PREVIOUS_AMD64_DIGEST" = "$PREVIOUS_ARM64_DIGEST" ]; then
    PREVIOUS_VERIFIED_COMMIT=""
    PREVIOUS_IMMUTABLE_TAG=""
    PREVIOUS_AMD64_DIGEST=""
    PREVIOUS_ARM64_DIGEST=""
  fi
}

deploy_immutable_image() {
  printf 'RESOFEED :: IMMUTABLE OCI / CADDY / TAILSCALE DEPLOYMENT\n'
  validate_target_boundary
  verify_staged_procedure_identity
  require_command docker
  require_command tailscale
  require_command curl
  load_env
  validate_runtime_configuration
  verify_oci_identity
  validate_existing_state
  capture_previous_chain
  validate_tailscale_boundary

  trap rollback_previous_digest ERR
  write_image_chain \
    "$RESOFEED_IMAGE" "$VERIFIED_COMMIT" "$IMMUTABLE_TAG" \
    "$OCI_INDEX_DIGEST" "$AMD64_MANIFEST_DIGEST" "$ARM64_MANIFEST_DIGEST"

  run_quiet "Compose contract validated" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
  REPLACEMENT_STARTED=1
  run_quiet "Immutable ResoFeed digest pulled" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull resofeed
  run_quiet "Existing resofeed-caddy stack updated" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
  ensure_tailscale_serve
  wait_for_readiness 30 || false

  deployed_reference=$(docker container inspect --format '{{.Config.Image}}' resofeed 2>/dev/null)
  [ "$deployed_reference" = "$RESOFEED_IMAGE" ] || false
  trap - ERR

  section '[ SUCCESS ]'
  ok "OCI_REPOSITORY=${OCI_REPOSITORY}"
  ok "OCI_IDENTITY=index_and_platform_digests"
  ok "TAILNET_TARGET=tefx-mbp-personal:resofeed-caddy"
  ok "MUTABLE_LATEST=forbidden"
  ok "ROLLBACK=prior_digest_and_readiness"
  ok "SECRETS=masked_presence_only"
  ok "READINESS=root_200_doctor_401"
  printf 'Open from a Tailnet-connected device: https://%s\n' "$RESOFEED_DOMAIN"
}

parse_arguments "$@"
case "$MODE" in
  stage-procedure)
    stage_procedure
    ;;
  recover-procedure)
    recover_procedure
    ;;
  record-orphan)
    [ -z "$PROCEDURE_DEPLOY_SHA256$PROCEDURE_COMPOSE_SHA256$PROCEDURE_BACKUP_ID" ] \
      || fatal "Orphan recording does not accept procedure identities."
    validate_identity_arguments
    record_orphan
    ;;
  deploy)
    [ -z "$PROCEDURE_BACKUP_ID" ] || fatal "Deployment does not accept a procedure backup identity."
    validate_identity_arguments
    validate_procedure_identity_arguments
    deploy_immutable_image
    ;;
  *) fatal "Unsupported operation mode." ;;
esac
