#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

COMPOSE_FILE="compose.yml"
ENV_FILE=".env"
CLEAR_DATA=0
ASSUME_YES=0
CONFIRM_TEXT="CLEAR RESOFEED DATA"

usage() {
  cat <<'EOF'
RESOFEED :: CADDY/TAILSCALE STOP

Usage:
  ./stop.sh
  ./stop.sh --clear-data
  ./stop.sh --clear-data --yes
  ./stop.sh --help

Default mode disables host-level Tailscale Serve TCP/443 for this deployment
when tailscale is installed, then stops the Docker Compose stack. Docker
volumes are preserved by default.

Options:
  --clear-data   Stop the stack, then remove deployment-owned Compose volumes.
                 This removes ResoFeed SQLite data and Caddy certificate/config
                 cache.
  --yes          Skip the interactive confirmation required by --clear-data.
  --help         Show this help.
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

die() {
  fail "$1"
  exit 1
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --clear-data)
        CLEAR_DATA=1
        ;;
      --yes)
        ASSUME_YES=1
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "Unknown argument: $1"
        ;;
    esac
    shift
  done

  if [ "$ASSUME_YES" -eq 1 ] && [ "$CLEAR_DATA" -ne 1 ]; then
    die "--yes is only valid with --clear-data."
  fi
}

compose_args() {
  if [ -f "$ENV_FILE" ]; then
    printf '%s\0' docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE"
  else
    printf '%s\0' env TAILSCALE_IP=127.0.0.1 CADDY_LOCAL_HTTPS_PORT=8443 RESOFEED_DOMAIN=stop.invalid CF_API_TOKEN=stop-placeholder docker compose -f "$COMPOSE_FILE"
  fi
}

run_compose_down() {
  volumes_flag=$1
  tmp=$(mktemp "${TMPDIR:-/tmp}/resofeed-stop.XXXXXX")

  args=()
  while IFS= read -r -d '' arg; do
    args+=("$arg")
  done < <(compose_args)

  cmd=("${args[@]}" down)
  if [ "$volumes_flag" = "with-volumes" ]; then
    cmd+=(--volumes --remove-orphans)
  fi

  if "${cmd[@]}" >"$tmp" 2>&1; then
    rm -f "$tmp"
    if [ "$volumes_flag" = "with-volumes" ]; then
      ok "Docker Compose stack stopped and deployment volumes removed"
    else
      ok "Docker Compose stack stopped; volumes preserved"
    fi
    return 0
  fi

  rm -f "$tmp"
  if [ -f "$ENV_FILE" ]; then
    die "Docker Compose down failed. Inspect Docker status and compose.yml."
  fi
  die "Docker Compose down failed without .env. Create .env from .env.example if compose.yml requires local values."
}

stop_tailscale_serve() {
  if ! command -v tailscale >/dev/null 2>&1; then
    ok "tailscale command not found; skipped Tailscale Serve stop"
    return 0
  fi

  tmp=$(mktemp "${TMPDIR:-/tmp}/resofeed-tailscale-stop.XXXXXX")
  if tailscale serve --tcp=443 off >"$tmp" 2>&1; then
    rm -f "$tmp"
    ok "Tailscale Serve TCP/443 disabled"
    return 0
  fi

  if grep -Eqi 'no serve config|not configured|no.*rule|not found|not running' "$tmp"; then
    rm -f "$tmp"
    ok "Tailscale Serve TCP/443 already off or no rule existed"
    return 0
  fi

  rm -f "$tmp"
  fail "Tailscale Serve TCP/443 stop failed; continuing with Docker Compose stop"
  return 0
}

confirm_clear_data() {
  if [ "$ASSUME_YES" -eq 1 ]; then
    ok "Data deletion confirmation bypassed by --yes"
    return 0
  fi

  if [ ! -t 0 ]; then
    die "--clear-data requires an interactive terminal or --yes."
  fi

  printf 'Type %s to continue: ' "$CONFIRM_TEXT"
  IFS= read -r answer
  if [ "$answer" != "$CONFIRM_TEXT" ]; then
    die "Confirmation did not match; data deletion aborted."
  fi
  ok "Data deletion confirmed"
}

print_state() {
  section '[ STATE ]'
  if [ -f "$ENV_FILE" ]; then
    ok "Found local .env for Docker Compose"
  else
    ok "No .env found; will attempt Docker Compose stop without secrets"
  fi

  if [ "$CLEAR_DATA" -eq 1 ]; then
    printf 'MODE: stop and clear deployment data\n'
  else
    printf 'MODE: stop only\n'
  fi
}

main() {
  parse_args "$@"

  printf 'RESOFEED :: CADDY/TAILSCALE STOP\n'
  print_state

  section '[ ACTIONS ]'
  stop_tailscale_serve

  if [ "$CLEAR_DATA" -eq 1 ]; then
    run_compose_down preserve-volumes
    section '[ WARNING: DATA DELETION ]'
    printf 'This removes deployment-owned Compose volumes for ResoFeed SQLite data and Caddy certificate/config cache.\n'
    confirm_clear_data
    run_compose_down with-volumes
  else
    run_compose_down preserve-volumes
  fi

  section '[ SUCCESS ]'
  if [ "$CLEAR_DATA" -eq 1 ]; then
    ok "ResoFeed stopped and deployment data cleared"
  else
    ok "ResoFeed stopped; deployment volumes preserved"
  fi
}

main "$@"
