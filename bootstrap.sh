#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PATH="$ROOT_DIR/node_modules/.bin:$PATH"

BOOTSTRAP_DEPLOY=0
GENERATED_ENV_FILE="$ROOT_DIR/.env.local.generated"

source "$ROOT_DIR/scripts/bootstrap/common.sh"
source "$ROOT_DIR/scripts/bootstrap/cloudflare.sh"
source "$ROOT_DIR/scripts/bootstrap/logto.sh"
source "$ROOT_DIR/scripts/bootstrap/stripe.sh"
source "$ROOT_DIR/scripts/bootstrap/expo.sh"
source "$ROOT_DIR/scripts/bootstrap/runtime.sh"

parse_args() {
  local arg
  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      --deploy)
        BOOTSTRAP_DEPLOY=1
        shift
        ;;
      --help|-h)
        cat <<'USAGE'
Usage: ./bootstrap.sh [--deploy]

  --deploy   Build and deploy the worker to Cloudflare after local setup
USAGE
        exit 0
        ;;
      *)
        log_error "Unknown option: $arg"
        exit 1
        ;;
    esac
  done
}

bootstrap_load_env() {
  load_env_file "$HOME/.env"
  load_env_file "$ROOT_DIR/.env"
  load_env_file "$GENERATED_ENV_FILE"
}

bootstrap_requirements() {
  require_command jq
  require_command curl
  require_command sed
  require_command node
}

bootstrap_defaults() {
  ensure_var PROJECT_ID

  if [[ -z "${PROJECT_DOMAIN:-}" ]]; then
    PROJECT_DOMAIN="https://${PROJECT_ID}.justevery.com"
    export PROJECT_DOMAIN
    log_info "Defaulting PROJECT_DOMAIN to ${PROJECT_DOMAIN}"
  fi

  if [[ -z "${APP_BASE_URL:-}" ]]; then
    APP_BASE_URL="/app"
    export APP_BASE_URL
    log_info "Defaulting APP_BASE_URL to ${APP_BASE_URL}"
  fi

  if [[ -z "${APP_URL:-}" && -n "${PROJECT_DOMAIN:-}" ]]; then
    local landing_trimmed="${PROJECT_DOMAIN%/}"
    APP_URL="${landing_trimmed}${APP_BASE_URL:-/app}"
    export APP_URL
    log_info "Defaulting APP_URL to ${APP_URL}"
  fi

  ensure_var PROJECT_DOMAIN
  ensure_var APP_URL
  ensure_var CLOUDFLARE_ACCOUNT_ID
  ensure_var LOGTO_MANAGEMENT_ENDPOINT
  ensure_var LOGTO_MANAGEMENT_AUTH_BASIC
}

bootstrap_generate_env() {
  export_expo_runtime_vars
  write_generated_env
}

run_bootstrap() {
  log_info "Bootstrapping justevery stack (deploy=$BOOTSTRAP_DEPLOY)"

  bootstrap_requirements
  bootstrap_load_env
  bootstrap_defaults

  detect_wrangler
  prepare_cloudflare_env

  resolve_stripe_secret
  derive_logto_defaults
  export_expo_runtime_vars

  mint_logto_management_token
  ensure_logto_application
  ensure_logto_api_resource
  ensure_logto_m2m_application

  if [[ "${BOOTSTRAP_DEPLOY}" == "1" ]]; then
    ensure_cloudflare_auth
    ensure_d1
    ensure_r2
  else
    log_info "Local mode: skipping Cloudflare resource reconciliation (D1/R2)."
  fi

  update_wrangler_config
  run_migrations
  seed_project

  if [[ "${BOOTSTRAP_DEPLOY}" == "1" ]]; then
    provision_stripe_products
    ensure_stripe_webhook
    sync_worker_secrets
    upload_r2_placeholder
  else
    log_info "Local mode: skipping Stripe provisioning and Worker secret sync."
  fi
  build_web_bundle
  bootstrap_generate_env

  if [[ "${BOOTSTRAP_DEPLOY}" == "1" ]]; then
    deploy_worker
  else
    log_info "Skipping remote deploy; local worker only."
    if lsof -ti tcp:8787 >/dev/null 2>&1; then
      log_warn "Port 8787 is already in use; not starting an additional dev server."
      log_warn "If you want the worker to serve the app locally, stop the existing process or run 'npm run dev:worker' yourself."
    else
      log_info "Launching local worker dev server on http://127.0.0.1:8787. Press Ctrl+C to stop it."
      (cd "$ROOT_DIR" && npm run dev:worker)
    fi
  fi

  post_deploy_guidance

  log_info "Bootstrap complete"
  log_info "Review ${GENERATED_ENV_FILE#$ROOT_DIR/} for generated identifiers."
}

parse_args "$@"
run_bootstrap
