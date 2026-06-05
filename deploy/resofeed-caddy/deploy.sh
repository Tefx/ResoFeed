#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

COMPOSE_FILE="compose.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
RESOFEED_IMAGE="tefx/resofeed:latest"
RESOFEED_VOLUME="resofeed-caddy_resofeed-data"

TAILSCALE_IP=""
CADDY_LOCAL_HTTPS_PORT=""
RESOFEED_DOMAIN=""
CF_API_TOKEN=""
OPENROUTER_KEY=""

usage() {
  cat <<'EOF'
RESOFEED :: CADDY/TAILSCALE DEPLOYMENT

Usage:
  ./deploy.sh
  ./deploy.sh --reset-token
  ./deploy.sh --help

Default mode creates/starts the Docker Compose stack and ensures Tailscale Serve
forwards Tailnet TCP/443 to the local Caddy HTTPS listener.

Options:
  --reset-token   Stop ResoFeed, reset the stored owner token hash, restart, and
                  print the newly generated owner token if it appears in logs.
  --help          Show this help.
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
  printf 'Diagnostics: inspect docker logs resofeed-caddy and docker logs resofeed.\n' >&2
  exit 1
}

run_quiet() {
  desc=$1
  shift
  tmp=$(mktemp "${TMPDIR:-/tmp}/resofeed-deploy.XXXXXX")
  if "$@" >"$tmp" 2>&1; then
    rm -f "$tmp"
    ok "$desc"
    return 0
  fi
  rm -f "$tmp"
  die "$desc failed. Inspect Docker/Tailscale status and service logs."
}

mask_if_secret_key() {
  case "$1" in
    CF_API_TOKEN|OPENROUTER_KEY) printf '[masked]' ;;
    *) printf '%s' "$2" ;;
  esac
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Required command not found: $1"
  fi
  ok "Command available: $1"
}

detect_tailscale_ip() {
  if command -v tailscale >/dev/null 2>&1; then
    tailscale ip -4 2>/dev/null | awk 'NF { print; exit }'
  fi
}

set_env_key() {
  key=$1
  value=$2
  tmp=$(mktemp "${ENV_FILE}.XXXXXX")
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^" k "=" {print k "=" v; done=1; next} {print} END{if(!done) print k "=" v}' "$ENV_FILE" > "$tmp"
  else
    awk -v k="$key" -v v="$value" '{print} END{print k "=" v}' "$ENV_FILE" > "$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}

load_env() {
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    case "$line" in
      TAILSCALE_IP=*|CADDY_LOCAL_HTTPS_PORT=*|RESOFEED_DOMAIN=*|CF_API_TOKEN=*|OPENROUTER_KEY=*|RESOFEED_IMAGE=*)
        key=${line%%=*}
        value=${line#*=}
        value=${value%$'\r'}
        case "$key" in
          TAILSCALE_IP) TAILSCALE_IP=$value ;;
          CADDY_LOCAL_HTTPS_PORT) CADDY_LOCAL_HTTPS_PORT=$value ;;
          RESOFEED_DOMAIN) RESOFEED_DOMAIN=$value ;;
          CF_API_TOKEN) CF_API_TOKEN=$value ;;
          OPENROUTER_KEY) OPENROUTER_KEY=$value ;;
          RESOFEED_IMAGE) RESOFEED_IMAGE=$value ;;
        esac
        ;;
    esac
  done < "$ENV_FILE"
}

ensure_env_file() {
  section '[ STATE ]'
  if [ ! -f "$ENV_FILE" ]; then
    [ -f "$ENV_EXAMPLE" ] || die "Missing ${ENV_EXAMPLE}; cannot create ${ENV_FILE}."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    ok "Created local .env from .env.example"

    detected_ip=$(detect_tailscale_ip || true)
    if [ -n "$detected_ip" ]; then
      set_env_key TAILSCALE_IP "$detected_ip"
      ok "Detected Tailscale IP and wrote TAILSCALE_IP to .env"
    else
      fail "Could not auto-detect TAILSCALE_IP; edit .env manually."
    fi

    section '[ ACTION REQUIRED: AUTHENTICATION ]'
    printf '[ FAIL ] Edit .env and set CF_API_TOKEN=[masked]. OPENROUTER_KEY=[masked] is optional.\n' >&2
    printf 'Then rerun ./deploy.sh. The local .env file is ignored by git.\n' >&2
    exit 2
  fi
  ok "Found local .env"
}

validate_and_normalize_env() {
  load_env

  if [ -z "$TAILSCALE_IP" ]; then
    detected_ip=$(detect_tailscale_ip || true)
    if [ -n "$detected_ip" ]; then
      TAILSCALE_IP=$detected_ip
      set_env_key TAILSCALE_IP "$TAILSCALE_IP"
      ok "Detected Tailscale IP and updated .env"
    else
      die "TAILSCALE_IP is empty and tailscale ip -4 did not return an address."
    fi
  else
    ok "TAILSCALE_IP configured: $TAILSCALE_IP"
  fi

  if [ -z "$CADDY_LOCAL_HTTPS_PORT" ]; then
    CADDY_LOCAL_HTTPS_PORT=8443
    set_env_key CADDY_LOCAL_HTTPS_PORT "$CADDY_LOCAL_HTTPS_PORT"
    ok "CADDY_LOCAL_HTTPS_PORT defaulted to 8443 in .env"
  else
    ok "CADDY_LOCAL_HTTPS_PORT configured: $CADDY_LOCAL_HTTPS_PORT"
  fi

  if [ -z "$RESOFEED_DOMAIN" ]; then
    die "RESOFEED_DOMAIN is empty in .env. Set it before deploying."
  fi
  ok "RESOFEED_DOMAIN configured: $RESOFEED_DOMAIN"

  if [ -z "$CF_API_TOKEN" ] || [ "$CF_API_TOKEN" = "replace_with_cloudflare_dns01_token" ]; then
    section '[ ACTION REQUIRED: AUTHENTICATION ]'
    fail "CF_API_TOKEN=[masked] must be set in .env before Caddy can issue certificates."
    exit 2
  fi
  ok "CF_API_TOKEN configured: [masked]"

  if [ -n "$OPENROUTER_KEY" ]; then
    ok "OPENROUTER_KEY configured: [masked]"
  else
    ok "OPENROUTER_KEY empty; model-backed features remain disabled"
  fi
}

print_state_summary() {
  mode=$1
  printf 'MODE: %s\n' "$mode"
  printf 'DOMAIN: %s\n' "$RESOFEED_DOMAIN"
  printf 'TAILSCALE IP: %s\n' "$TAILSCALE_IP"
  printf 'LOCAL CADDY HTTPS: 127.0.0.1:%s\n' "$CADDY_LOCAL_HTTPS_PORT"
}

dns_host_label() {
  printf '%s' "${RESOFEED_DOMAIN%%.*}"
}

print_dns_guidance() {
  section '[ ACTION REQUIRED: DNS ]'
  printf 'Create or verify this Cloudflare DNS record:\n'
  printf 'Type: A\n'
  printf 'Name: %s\n' "$(dns_host_label)"
  printf 'Content: %s\n' "$TAILSCALE_IP"
  printf 'Proxy status: DNS only / gray cloud\n'
}

compose_pull_resofeed() {
  run_quiet "Pulled latest ResoFeed image: ${RESOFEED_IMAGE}" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull resofeed
}

compose_up_all() {
  compose_pull_resofeed
  run_quiet "Docker Compose stack is running" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
}

compose_stop_resofeed() {
  run_quiet "Stopped resofeed service" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop resofeed
}

compose_up_resofeed() {
  compose_pull_resofeed
  run_quiet "Started resofeed service" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d resofeed
}

ensure_tailscale_serve() {
  target="tcp://127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}"
  status=$(tailscale serve status 2>&1 || true)

  if printf '%s\n' "$status" | grep -qi 'No serve config'; then
    tailscale serve --bg --tcp=443 "$target"
    ok "Tailscale Serve configured: TCP/443 to $target"
    return
  fi

  if printf '%s\n' "$status" | grep -Fq "$target"; then
    ok "Tailscale Serve already forwards TCP/443 to $target"
    return
  fi

  if printf '%s\n' "$status" | grep -Eq '(^|[^0-9])443([^0-9]|$)'; then
    fail "Tailscale Serve already has a different 443 rule."
    printf 'Inspect with: tailscale serve status\n' >&2
    printf 'Reset manually only if you intend this host to serve ResoFeed on Tailnet TCP/443.\n' >&2
    exit 1
  fi

  tailscale serve --bg --tcp=443 "$target"
  ok "Tailscale Serve configured: TCP/443 to $target"
}

extract_owner_token() {
  since_ts=$1
  docker logs resofeed --since "$since_ts" 2>&1 \
    | grep -Eo 'owner token generated: rfeed_[A-Za-z0-9_-]+' \
    | awk '{print $4}' \
    | tail -n 1 || true
}

print_authentication_result() {
  since_ts=$1
  token=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    token=$(extract_owner_token "$since_ts")
    [ -n "$token" ] && break
    sleep 1
  done
  section '[ ACTION REQUIRED: AUTHENTICATION ]'
  if [ -n "$token" ]; then
    printf 'Owner token generated in this run/reset flow:\n'
    printf '%s\n' "$token"
    printf 'Store it securely; it is not shown here unless ResoFeed generated it in this run.\n'
  else
    printf 'Owner token was not generated in this run. Use the existing token or run ./deploy.sh --reset-token.\n'
    printf 'Inspect logs if needed: docker logs resofeed\n'
  fi
}

default_deploy() {
  printf 'RESOFEED :: CADDY/TAILSCALE DEPLOYMENT\n'
  ensure_env_file
  validate_and_normalize_env
  print_state_summary 'Initial Deployment / Update'

  section '[ ACTIONS ]'
  require_command docker
  require_command tailscale

  start_ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  compose_up_all
  ensure_tailscale_serve

  print_dns_guidance
  print_authentication_result "$start_ts"

  section '[ SUCCESS ]'
  printf 'Open from a Tailnet-connected device: https://%s\n' "$RESOFEED_DOMAIN"
}

reset_token() {
  printf 'RESOFEED :: CADDY/TAILSCALE DEPLOYMENT\n'
  ensure_env_file
  validate_and_normalize_env
  print_state_summary 'Owner Token Reset'

  section '[ ACTIONS ]'
  require_command docker
  require_command tailscale

  compose_stop_resofeed

  compose_pull_resofeed

  run_quiet "Stored owner token hash reset" docker run --rm \
    -v "${RESOFEED_VOLUME}:/data" \
    "$RESOFEED_IMAGE" \
    owner-token reset --db /data/resofeed.sqlite3 --confirm-reset

  restart_ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  compose_up_resofeed
  ensure_tailscale_serve

  print_dns_guidance
  print_authentication_result "$restart_ts"

  section '[ SUCCESS ]'
  printf 'Owner-token reset flow complete. Open: https://%s\n' "$RESOFEED_DOMAIN"
}

case "${1:-}" in
  --help|-h)
    usage
    ;;
  --reset-token)
    if [ "$#" -ne 1 ]; then
      usage >&2
      exit 2
    fi
    reset_token
    ;;
  '')
    default_deploy
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
