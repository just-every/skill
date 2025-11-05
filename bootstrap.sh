#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PATH="$ROOT_DIR/node_modules/.bin:$PATH"

DRY_RUN="${DRY_RUN:-0}"
SYNC_SECRETS="${SYNC_SECRETS:-1}"
GENERATED_ENV_FILE="$ROOT_DIR/.env.local.generated"

source "$ROOT_DIR/scripts/bootstrap/common.sh"
source "$ROOT_DIR/scripts/bootstrap/cloudflare.sh"
source "$ROOT_DIR/scripts/bootstrap/logto.sh"
source "$ROOT_DIR/scripts/bootstrap/stripe.sh"
source "$ROOT_DIR/scripts/bootstrap/expo.sh"
source "$ROOT_DIR/scripts/bootstrap/runtime.sh"

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
  log_info "Bootstrapping justevery stack (dry-run=$DRY_RUN)"

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

  ensure_cloudflare_auth
  ensure_d1
  ensure_r2
  update_wrangler_config
  run_migrations
  seed_project
  provision_stripe_products
  ensure_stripe_webhook
  sync_worker_secrets
  upload_r2_placeholder
  build_web_bundle
  bootstrap_generate_env
  deploy_worker

  post_deploy_guidance

  log_info "Bootstrap complete"
  log_info "Review ${GENERATED_ENV_FILE#$ROOT_DIR/} for generated identifiers."
}

run_bootstrap "$@"
