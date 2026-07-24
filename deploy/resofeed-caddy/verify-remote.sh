#!/usr/bin/env bash
set -Eeuo pipefail

probe_phase=canonical_stack
probe_failure_emitted=0

emit_probe_failure() {
  local status=$1
  if [ "$probe_failure_emitted" -eq 0 ]; then
    probe_failure_emitted=1
    printf 'PROBE_FAIL phase=%s status=%s\n' "$probe_phase" "$status"
  fi
}

on_probe_error() {
  local status=$?
  trap - ERR
  emit_probe_failure "$status"
  exit "$status"
}

on_probe_exit() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    emit_probe_failure "$status"
  fi
}

trap on_probe_error ERR
trap on_probe_exit EXIT
printf 'PROBE_PHASE=canonical_stack\n'

[ "$#" -eq 0 ]
readonly SOURCE_COMMIT=${RESOFEED_PROBE_SOURCE_COMMIT:-}
readonly EXPECTED_DEPLOY_SHA256=${RESOFEED_PROBE_DEPLOY_SHA256:-}
readonly EXPECTED_DEPLOY_MODE=${RESOFEED_PROBE_DEPLOY_MODE:-}
readonly EXPECTED_COMPOSE_SHA256=${RESOFEED_PROBE_COMPOSE_SHA256:-}
readonly EXPECTED_COMPOSE_MODE=${RESOFEED_PROBE_COMPOSE_MODE:-}
readonly BACKUP_ID=${RESOFEED_PROBE_BACKUP_ID:-}
readonly EXPECTED_BACKUP_MANIFEST_SHA256=${RESOFEED_PROBE_BACKUP_MANIFEST_SHA256:-}
readonly EXPECTED_BACKUP_MANIFEST_MODE=${RESOFEED_PROBE_BACKUP_MANIFEST_MODE:-}
readonly EXPECTED_PRIOR_DEPLOY_SHA256=${RESOFEED_PROBE_PRIOR_DEPLOY_SHA256:-}
readonly EXPECTED_PRIOR_DEPLOY_MODE=${RESOFEED_PROBE_PRIOR_DEPLOY_MODE:-}
readonly EXPECTED_PRIOR_COMPOSE_SHA256=${RESOFEED_PROBE_PRIOR_COMPOSE_SHA256:-}
readonly EXPECTED_PRIOR_COMPOSE_MODE=${RESOFEED_PROBE_PRIOR_COMPOSE_MODE:-}
readonly STACK_NAME="resofeed-caddy"
readonly CANONICAL_HOME=$(CDPATH= cd -P -- "$HOME" && pwd -P)
readonly STACK_DIR="${CANONICAL_HOME}/Projects/${STACK_NAME}"
readonly BACKUP_DIR=".resofeed-procedure-backups/${BACKUP_ID#sha256:}"

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

public_url_host() {
  local command_lines public_urls public_count public_url host
  command_lines=$(docker container inspect --format '{{range .Config.Cmd}}{{println .}}{{end}}' resofeed)
  public_urls=$(printf '%s\n' "$command_lines" | awk 'previous == "--public-url" {print; previous=""; next} {previous=$0}')
  public_count=$(printf '%s\n' "$public_urls" | awk 'NF {count++} END {print count+0}')
  if [ "$public_count" -ne 1 ]; then return 1; fi
  public_url=$(printf '%s\n' "$public_urls" | awk 'NF {print; exit}')
  if ! [[ "$public_url" =~ ^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then return 1; fi
  host=${public_url#https://}
  if [ "$host" = "tefx-mbp-personal.platy-atlas.ts.net" ]; then return 1; fi
  printf '%s' "$host"
}

canonical_tailnet_route() {
  local route_count
  route_count=$(tailscale serve status | awk '$0 == "TCP 443 -> tcp://127.0.0.1:8443" {count++} END {print count+0}')
  [ "$route_count" -eq 1 ]
  CANONICAL_ROUTE='TCP/HTTPS 443 -> 127.0.0.1:8443'
}

read_docker_identity() {
  RESOFEED_CONTAINER_ID=$(docker container inspect --format '{{.Id}}' resofeed)
  RESOFEED_IMAGE_ID=$(docker container inspect --format '{{.Image}}' resofeed)
  CADDY_CONTAINER_ID=$(docker container inspect --format '{{.Id}}' resofeed-caddy)
  CADDY_IMAGE_ID=$(docker container inspect --format '{{.Image}}' resofeed-caddy)
  [[ "$RESOFEED_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]]
  [[ "$CADDY_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]]
  is_sha256 "$RESOFEED_IMAGE_ID"
  is_sha256 "$CADDY_IMAGE_ID"
}

read_volume_identity() {
  local mount_row
  mount_row=$(docker container inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Destination}}|{{.Name}}{{println}}{{end}}{{end}}' resofeed)
  [ "$(printf '%s\n' "$mount_row" | awk 'NF {count++} END {print count+0}')" -eq 1 ]
  IFS='|' read -r DATA_MOUNT_TYPE DATA_MOUNT_DESTINATION DATA_VOLUME_NAME <<EOF
$mount_row
EOF
  [ "$DATA_MOUNT_TYPE" = volume ]
  [ "$DATA_MOUNT_DESTINATION" = /data ]
  [[ "$DATA_VOLUME_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]
  DATA_VOLUME_LABEL=$(docker volume inspect --format '{{index .Labels "com.docker.compose.volume"}}' "$DATA_VOLUME_NAME")
  [ "$DATA_VOLUME_LABEL" = resofeed-data ]
}

stable_projection() {
  local current_deploy_hash current_deploy_mode current_compose_hash current_compose_mode
  local manifest_hash manifest_mode prior_deploy_hash prior_deploy_mode prior_compose_hash prior_compose_mode
  local route host host_hash
  current_deploy_hash=$(file_sha256 deploy.sh)
  current_deploy_mode=$(file_mode deploy.sh)
  current_compose_hash=$(file_sha256 compose.yml)
  current_compose_mode=$(file_mode compose.yml)
  manifest_hash=$(file_sha256 "$BACKUP_DIR/manifest")
  manifest_mode=$(file_mode "$BACKUP_DIR/manifest")
  prior_deploy_hash=$(file_sha256 "$BACKUP_DIR/deploy.sh")
  prior_deploy_mode=$(file_mode "$BACKUP_DIR/deploy.sh")
  prior_compose_hash=$(file_sha256 "$BACKUP_DIR/compose.yml")
  prior_compose_mode=$(file_mode "$BACKUP_DIR/compose.yml")
  read_docker_identity
  read_volume_identity
  canonical_tailnet_route
  route=$CANONICAL_ROUTE
  host=$(public_url_host)
  host_hash=$(printf '%s' "$host" | stream_sha256)

  printf '%s\n' \
    "backup.manifest.hash=${manifest_hash}" \
    "backup.manifest.mode=${manifest_mode}" \
    "backup.prior.compose.hash=${prior_compose_hash}" \
    "backup.prior.compose.mode=${prior_compose_mode}" \
    "backup.prior.deploy.hash=${prior_deploy_hash}" \
    "backup.prior.deploy.mode=${prior_deploy_mode}" \
    "container.caddy.id=${CADDY_CONTAINER_ID}" \
    "container.caddy.image=${CADDY_IMAGE_ID}" \
    "container.resofeed.id=${RESOFEED_CONTAINER_ID}" \
    "container.resofeed.image=${RESOFEED_IMAGE_ID}" \
    "procedure.compose.hash=${current_compose_hash}" \
    "procedure.compose.mode=${current_compose_mode}" \
    "procedure.deploy.hash=${current_deploy_hash}" \
    "procedure.deploy.mode=${current_deploy_mode}" \
    "public_url.host.sha256=${host_hash}" \
    "tailnet.route=${route}" \
    "volume.actual=${DATA_VOLUME_NAME}" \
    "volume.destination=${DATA_MOUNT_DESTINATION}" \
    "volume.logical=${DATA_VOLUME_LABEL}" \
    "volume.type=${DATA_MOUNT_TYPE}" \
    | sort | stream_sha256
}

[[ "$SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
for digest in "$EXPECTED_DEPLOY_SHA256" "$EXPECTED_COMPOSE_SHA256" "$BACKUP_ID" "$EXPECTED_BACKUP_MANIFEST_SHA256" "$EXPECTED_PRIOR_DEPLOY_SHA256" "$EXPECTED_PRIOR_COMPOSE_SHA256"; do
  is_sha256 "$digest"
done
[ "$EXPECTED_DEPLOY_MODE" = 755 ]
[ "$EXPECTED_COMPOSE_MODE" = 644 ]
[ "$EXPECTED_BACKUP_MANIFEST_MODE" = 600 ]
[ "$EXPECTED_PRIOR_DEPLOY_MODE" = 755 ]
[ "$EXPECTED_PRIOR_COMPOSE_MODE" = 644 ]
[ -d "$STACK_DIR" ] && [ ! -L "$STACK_DIR" ]
cd -P "$STACK_DIR"
[ "$(pwd -P)" = "$STACK_DIR" ]
[ "$PWD" = "$STACK_DIR" ]
[ "${PWD##*/}" = "$STACK_NAME" ]
printf 'CANONICAL_STACK=verified\n'

probe_phase=procedure_current
printf 'PROBE_PHASE=procedure_current\n'
[ -f deploy.sh ] && [ ! -L deploy.sh ]
[ -f compose.yml ] && [ ! -L compose.yml ]
[ "$(file_sha256 deploy.sh)" = "$EXPECTED_DEPLOY_SHA256" ]
[ "$(file_mode deploy.sh)" = "$EXPECTED_DEPLOY_MODE" ]
[ "$(file_sha256 compose.yml)" = "$EXPECTED_COMPOSE_SHA256" ]
[ "$(file_mode compose.yml)" = "$EXPECTED_COMPOSE_MODE" ]
printf 'PROCEDURE_CURRENT=verified\n'

probe_phase=backup
printf 'PROBE_PHASE=backup\n'
computed_backup_id=$(printf 'resofeed.procedure-backup.v1\ndeploy.sh=%s mode=%s\ncompose.yml=%s mode=%s\n' \
  "$EXPECTED_PRIOR_DEPLOY_SHA256" "$EXPECTED_PRIOR_DEPLOY_MODE" \
  "$EXPECTED_PRIOR_COMPOSE_SHA256" "$EXPECTED_PRIOR_COMPOSE_MODE" | stream_sha256)
[ "$computed_backup_id" = "$BACKUP_ID" ]
[ -d "$BACKUP_DIR" ] && [ ! -L "$BACKUP_DIR" ]
[ -f "$BACKUP_DIR/manifest" ] && [ ! -L "$BACKUP_DIR/manifest" ]
[ "$(file_sha256 "$BACKUP_DIR/manifest")" = "$EXPECTED_BACKUP_MANIFEST_SHA256" ]
[ "$(file_mode "$BACKUP_DIR/manifest")" = "$EXPECTED_BACKUP_MANIFEST_MODE" ]
grep -Fxq 'schema_version=resofeed.procedure-backup.v1' "$BACKUP_DIR/manifest"
grep -Fxq "backup_id=$BACKUP_ID" "$BACKUP_DIR/manifest"
grep -Fxq "deploy.sh=$EXPECTED_PRIOR_DEPLOY_SHA256 mode=$EXPECTED_PRIOR_DEPLOY_MODE" "$BACKUP_DIR/manifest"
grep -Fxq "compose.yml=$EXPECTED_PRIOR_COMPOSE_SHA256 mode=$EXPECTED_PRIOR_COMPOSE_MODE" "$BACKUP_DIR/manifest"
[ "$(file_sha256 "$BACKUP_DIR/deploy.sh")" = "$EXPECTED_PRIOR_DEPLOY_SHA256" ]
[ "$(file_mode "$BACKUP_DIR/deploy.sh")" = "$EXPECTED_PRIOR_DEPLOY_MODE" ]
[ "$(file_sha256 "$BACKUP_DIR/compose.yml")" = "$EXPECTED_PRIOR_COMPOSE_SHA256" ]
[ "$(file_mode "$BACKUP_DIR/compose.yml")" = "$EXPECTED_PRIOR_COMPOSE_MODE" ]
printf 'BACKUP=verified\n'

probe_phase=docker_identity
printf 'PROBE_PHASE=docker_identity\n'
read_docker_identity
printf 'DOCKER_IDENTITY=verified\n'

probe_phase=volume
printf 'PROBE_PHASE=volume\n'
read_volume_identity
printf 'VOLUME=verified\n'

probe_phase=tailnet_route
printf 'PROBE_PHASE=tailnet_route\n'
canonical_tailnet_route
printf 'TAILNET_ROUTE=verified\n'

probe_phase=public_url
printf 'PROBE_PHASE=public_url\n'
PUBLIC_HOST=$(public_url_host)
BASELINE_PROJECTION=$(stable_projection)
printf 'PUBLIC_URL_HOST=validated\n'

probe_phase=readiness
printf 'PROBE_PHASE=readiness\n'
root_code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --connect-to "${PUBLIC_HOST}:443:127.0.0.1:8443" "https://${PUBLIC_HOST}/")
doctor_code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --connect-to "${PUBLIC_HOST}:443:127.0.0.1:8443" "https://${PUBLIC_HOST}/api/doctor")
[ "$root_code" = 200 ]
[ "$doctor_code" = 401 ]
printf 'READINESS=verified\n'

probe_phase=protected_after
printf 'PROBE_PHASE=protected_after\n'
AFTER_PROJECTION=$(stable_projection)
[ "$AFTER_PROJECTION" = "$BASELINE_PROJECTION" ]
printf 'PROTECTED_STATE=unchanged\n'

trap - ERR EXIT
printf 'PROBE_OK\n'
