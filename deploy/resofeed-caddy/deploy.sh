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
readonly RESOFEED_VOLUME="resofeed-caddy_resofeed-data"
readonly ORPHAN_LEDGER=".resofeed-oci-orphans.log"

MODE="deploy"
VERIFIED_COMMIT=""
IMMUTABLE_TAG=""
OCI_INDEX_DIGEST=""
AMD64_MANIFEST_DIGEST=""
ARM64_MANIFEST_DIGEST=""
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
RESOFEED :: IMMUTABLE OCI / CADDY / TAILSCALE DEPLOYMENT

Usage:
  ./deploy.sh --verified-commit <40-hex> --immutable-tag <git-40-hex> \
    --index-digest <sha256:64-hex> \
    --amd64-digest <sha256:64-hex> \
    --arm64-digest <sha256:64-hex>

  ./deploy.sh --record-orphan --verified-commit <40-hex> \
    --immutable-tag <git-40-hex> \
    --index-digest <sha256:64-hex> \
    --amd64-digest <sha256:64-hex> \
    --arm64-digest <sha256:64-hex>

The deploy mode verifies the caller-supplied commit/tag/index/platform chain for
exactly docker.io/tefx/resofeed, then updates only the tefx-mbp-personal
resofeed-caddy stack. Failure restores the prior digest and verifies readiness.
The record-orphan mode appends the complete non-secret chain to the local orphan
ledger. Registry tag deletion is outside this script and requires separate,
explicit registry authorization.
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

parse_arguments() {
  if [ "${1:-}" = "--record-orphan" ]; then
    MODE="record-orphan"
    shift
  fi

  while [ "$#" -gt 0 ]; do
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

validate_identity_arguments() {
  [[ "$VERIFIED_COMMIT" =~ ^[a-f0-9]{40}$ ]] || fatal "Verified commit must be exactly 40 lowercase hexadecimal characters."
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

validate_target_boundary() {
  [ "$(basename "$SCRIPT_DIR")" = "$STACK_NAME" ] || fatal "Deployment directory is not the authorized resofeed-caddy stack."
  [ "$SCRIPT_DIR" = "${HOME}/Projects/${STACK_NAME}" ] || fatal "Deployment directory is outside the authorized Tailnet stack path."
  [ "$(hostname -s)" = "${TAILNET_TARGET_HOST%%.*}" ] || fatal "Deployment host is outside the authorized Tailnet target."
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
validate_identity_arguments
if [ "$MODE" = "record-orphan" ]; then
  record_orphan
else
  deploy_immutable_image
fi
