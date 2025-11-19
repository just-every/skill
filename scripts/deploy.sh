#!/usr/bin/env bash

set -euo pipefail

MODE="deploy"

usage() {
  cat <<'USAGE'
Unified deploy script

Usage: scripts/deploy.sh [--mode deploy|dry-run]

Examples:
  scripts/deploy.sh              # full deploy
  scripts/deploy.sh --mode dry-run
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "deploy" && "$MODE" != "dry-run" ]]; then
  echo "MODE must be 'deploy' or 'dry-run'" >&2
  usage
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  echo "[deploy] $*"
}

is_placeholder_token() {
  local value="${1:-}"
  [[ -z "$value" ]] && return 0
  if [[ "$value" =~ (placeholder|dummy|example) ]]; then
    return 0
  fi
  return 1
}

has_real_stripe_key() {
  local key="${STRIPE_SECRET_KEY:-}"
  if [[ -z "$key" ]]; then
    return 1
  fi
  if [[ "$key" != sk_live_* && "$key" != sk_test_* ]]; then
    return 1
  fi
  if is_placeholder_token "$key"; then
    return 1
  fi
  return 0
}

post_deploy_smoke() {
  local base="${PROJECT_DOMAIN:-}"
  if [[ -z "$base" ]]; then
    log "PROJECT_DOMAIN is not set; skipping HTTP smoke checks"
    return
  fi

  base="${base%/}"
  local status_url="${base}/api/status"
  local products_url="${base}/api/stripe/products"
  local max_attempts=4

  local attempt=1
  while true; do
    if response=$(curl -fsSL "$status_url" 2>/dev/null); then
      if echo "$response" | jq -e '.status == "ok"' >/dev/null; then
        log "Status endpoint healthy"
        break
      fi
      log "Status endpoint returned unexpected payload (attempt ${attempt})"
    else
      log "Status endpoint unreachable (attempt ${attempt})"
    fi

    if [[ $attempt -ge $max_attempts ]]; then
      echo "Status smoke check failed after ${attempt} attempts" >&2
      return 1
    fi
    sleep $((attempt * 3))
    attempt=$((attempt + 1))
  done

  attempt=1
  while true; do
    if response=$(curl -fsSL "$products_url" 2>/dev/null); then
      if echo "$response" | jq -e '.products | length > 0' >/dev/null; then
        log "Stripe products endpoint healthy"
        break
      fi
      log "Products endpoint returned empty payload (attempt ${attempt})"
    else
      log "Products endpoint unreachable (attempt ${attempt})"
    fi

    if [[ $attempt -ge $max_attempts ]]; then
      echo "Products smoke check failed after ${attempt} attempts" >&2
      return 1
    fi
    sleep $((attempt * 3))
    attempt=$((attempt + 1))
  done
}

log "Running Expo web build"
EXPO_NO_INTERACTIVE="${EXPO_NO_INTERACTIVE:-1}" pnpm --filter @justevery/web run build

log "Running client smoke tests"
pnpm smoke:client

if [[ "$MODE" == "deploy" ]]; then
  log "Auditing deployment environment"
  pnpm audit:deploy-env
else
  log "Skipping env audit in dry-run mode"
fi

if [[ "$MODE" == "deploy" || has_real_stripe_key ]]; then
  log "Rendering bootstrap deploy plan (dry run)"
  pnpm bootstrap:deploy:dry-run
else
  log "Skipping bootstrap dry run (placeholder Stripe credentials detected)"
fi

if [[ "$MODE" == "deploy" ]]; then
  log "Running remote migrations"
  pnpm --filter @justevery/worker run migrate -- --remote

  log "Applying bootstrap deploy plan"
  pnpm bootstrap:deploy

  log "Executing post-deploy smoke checks"
  post_deploy_smoke
else
  log "Dry run mode enabled; skipping migrations and deploy"
fi

log "Deploy script completed"
