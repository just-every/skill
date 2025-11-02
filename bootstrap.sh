#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

GREEN="$(tput setaf 2 2>/dev/null || true)"
YELLOW="$(tput setaf 3 2>/dev/null || true)"
RED="$(tput setaf 1 2>/dev/null || true)"
RESET="$(tput sgr0 2>/dev/null || true)"

DRY_RUN=${DRY_RUN:-0}
GENERATED_ENV_FILE="$ROOT_DIR/.env.local.generated"

log_info() {
  echo "${GREEN}[info]${RESET} $*"
}

log_warn() {
  echo "${YELLOW}[warn]${RESET} $*"
}

log_error() {
  echo "${RED}[error]${RESET} $*" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Command '$1' is required but was not found in PATH."
    exit 1
  fi
}

load_env_file() {
  local file=$1
  if [[ -f "$file" ]]; then
    log_info "Loading env vars from $file"
    # shellcheck disable=SC1090
    set -a
    source "$file"
    set +a
  fi
}

ensure_var() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      local placeholder="dry-run-${name,,}"
      log_warn "Environment variable '$name' missing; using placeholder '$placeholder' for dry-run."
      export "$name"="$placeholder"
      return
    fi
    log_error "Environment variable '$name' must be set before running bootstrap."
    exit 1
  fi
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[&/]/\\&/g'
}

run_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] $*"
    return 0
  fi
  "$@"
}

run_cmd_capture() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] $*"
    echo "{}"
    return 0
  fi
  "$@"
}

parse_stripe_products() {
  local raw=${STRIPE_PRODUCTS:-}
  [[ -z "$raw" ]] && return 0
  local IFS=';' entry
  local arr="[]"
  for entry in $raw; do
    [[ -z "$entry" ]] && continue
    local name part rest amount currency interval
    name=${entry%%:*}
    rest=${entry#*:}
    amount=${rest%%,*}
    part=${rest#*,}
    currency=${part%%,*}
    interval=${part##*,}
    arr=$(jq --arg name "$name" --arg amount "${amount:-0}" --arg currency "$currency" --arg interval "$interval" \
      '. + [{name: $name, amount: ($amount|tonumber?), currency: $currency, interval: $interval}]' <<<"$arr")
  done
  echo "$arr"
}

ensure_cloudflare_auth() {
  export CLOUDFLARE_ACCOUNT_ID
  export CLOUDFLARE_API_TOKEN
  [[ "$DRY_RUN" == "1" ]] && return
  log_info "Authenticating Wrangler session"
  run_cmd wrangler whoami >/dev/null
}

ensure_d1() {
  local name=${CLOUDFLARE_D1_NAME:-"${PROJECT_ID}-d1"}
  D1_DATABASE_NAME="$name"
  log_info "Ensuring D1 database '$name' exists"
  if [[ "$DRY_RUN" == "1" ]]; then
    D1_DATABASE_ID="dry-run-${name}"
    return
  fi
  local list_json
  if list_json=$(wrangler d1 list --json 2>/dev/null); then
    local existing
    existing=$(jq -r --arg name "$name" '.[] | select(.name==$name) | .uuid' <<<"$list_json")
    if [[ -n "$existing" && "$existing" != "null" ]]; then
      log_info "Found existing D1 database $existing"
      D1_DATABASE_ID="$existing"
      return
    fi
  fi
  local create_json
  create_json=$(wrangler d1 create "$name" --json)
  D1_DATABASE_ID=$(jq -r '.uuid // .id' <<<"$create_json")
  log_info "Created D1 database with id $D1_DATABASE_ID"
}

ensure_r2() {
  local bucket=${CLOUDFLARE_R2_BUCKET:-"${PROJECT_ID}-assets"}
  R2_BUCKET_NAME="$bucket"
  log_info "Ensuring R2 bucket '$bucket' exists"
  if [[ "$DRY_RUN" == "1" ]]; then
    R2_BUCKET_ID="$bucket"
    return
  fi
  local list_json
  if list_json=$(wrangler r2 bucket list --json 2>/dev/null); then
    local exists
    exists=$(jq -r --arg bucket "$bucket" '.[] | select(.name==$bucket) | .name' <<<"$list_json")
    if [[ -n "$exists" && "$exists" != "null" ]]; then
      log_info "Found existing R2 bucket $exists"
      R2_BUCKET_ID="$exists"
      return
    fi
  fi
  run_cmd wrangler r2 bucket create "$bucket"
  R2_BUCKET_ID="$bucket"
}

ensure_kv() {
  local binding="SESSION_KV"
  local namespace="${PROJECT_ID}-sessions"
  log_info "Ensuring KV namespace '$namespace' exists"
  if [[ "$DRY_RUN" == "1" ]]; then
    KV_NAMESPACE_ID="dry-run-${namespace}"
    return
  fi
  local list_json
  if list_json=$(wrangler kv namespace list --json 2>/dev/null); then
    local existing
    existing=$(jq -r --arg namespace "$namespace" '.[] | select(.title==$namespace or .name==$namespace) | .id' <<<"$list_json")
    if [[ -n "$existing" && "$existing" != "null" ]]; then
      log_info "Found existing KV namespace $existing"
      KV_NAMESPACE_ID="$existing"
      return
    fi
  fi
  local create_json
  create_json=$(wrangler kv namespace create --binding "$binding" --namespace "$namespace" --json)
  KV_NAMESPACE_ID=$(jq -r '.id // .result.id' <<<"$create_json")
}

update_wrangler_config() {
  local template="$ROOT_DIR/workers/api/wrangler.toml.template"
  local target="$ROOT_DIR/workers/api/wrangler.toml"
  if [[ ! -f "$template" ]]; then
    log_warn "wrangler.toml.template not found at $template; skipping templating"
    return
  fi
  log_info "Templating Wrangler config"
  local project_safe=$(escape_sed "$PROJECT_ID")
  local d1_safe=$(escape_sed "${D1_DATABASE_ID:-}")
  local bucket_safe=$(escape_sed "${R2_BUCKET_NAME:-}")
  local kv_safe=$(escape_sed "${KV_NAMESPACE_ID:-}")
  local landing_safe=$(escape_sed "${LANDING_URL:-}")
  local app_safe=$(escape_sed "${APP_URL:-}")
  local tmp
  tmp=$(mktemp)
  sed \
    -e "s/{{PROJECT_ID}}/${project_safe}/g" \
    -e "s/{{D1_DATABASE_ID}}/${d1_safe}/g" \
    -e "s/{{R2_BUCKET_NAME}}/${bucket_safe}/g" \
    -e "s/{{KV_NAMESPACE_ID}}/${kv_safe}/g" \
    -e "s#{{LANDING_URL}}#${landing_safe}#g" \
    -e "s#{{APP_URL}}#${app_safe}#g" \
    "$template" > "$tmp"
  if [[ -f "$target" ]]; then
    cp "$target" "$target.backup"
  fi
  mv "$tmp" "$target"
}

provision_stripe_products() {
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set; skipping Stripe provisioning"
    return
  fi
  local products_json
  products_json=$(parse_stripe_products)
  if [[ -z "$products_json" ]]; then
    log_warn "No STRIPE_PRODUCTS configured; skipping Stripe provisioning"
    return
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would create Stripe products: $products_json"
    STRIPE_PRODUCT_IDS="[]"
    return
  fi
  log_info "Provisioning Stripe products"
  local ids="[]"
  local index=0
  local length
  length=$(jq 'length' <<<"$products_json")
  while [[ $index -lt $length ]]; do
    local product_json
    product_json=$(jq -c --argjson idx "$index" '.[$idx]' <<<"$products_json")
    local name amount currency interval
    name=$(jq -r '.name' <<<"$product_json")
    amount=$(jq -r '.amount' <<<"$product_json")
    currency=$(jq -r '.currency' <<<"$product_json")
    interval=$(jq -r '.interval' <<<"$product_json")

    local product_response price_response product_id price_id
    product_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/products \
      -u "$STRIPE_SECRET_KEY:" \
      -d name="$name" \
      -d metadata[project_id]="$PROJECT_ID")
    product_id=$(jq -r '.id // empty' <<<"$product_response")
    price_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/prices \
      -u "$STRIPE_SECRET_KEY:" \
      -d unit_amount="$amount" \
      -d currency="$currency" \
      -d recurring[interval]="$interval" \
      -d product="$product_id")
    price_id=$(jq -r '.id // empty' <<<"$price_response")
    ids=$(jq --arg product "$product_id" --arg price "$price_id" '. + [{product: $product, price: $price}]' <<<"$ids")
    ((index++))
  done
  STRIPE_PRODUCT_IDS="$ids"
}

run_migrations() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] node workers/api/scripts/migrate.js"
    return
  fi
  log_info "Running D1 migrations"
  (cd "$ROOT_DIR/workers/api" && D1_DATABASE="${D1_DATABASE_NAME:-$PROJECT_ID-d1}" node scripts/migrate.js)
}

seed_project() {
  local project_slug="$PROJECT_ID"
  local landing_url="${LANDING_URL:-}"
  local app_url="${APP_URL:-}"
  local escaped_landing
  local escaped_app
  escaped_landing=$(printf "%s" "$landing_url" | sed "s/'/''/g")
  escaped_app=$(printf "%s" "$app_url" | sed "s/'/''/g")
  local sql
  read -r -d '' sql <<SQL || true
INSERT INTO projects (id, slug, landing_url, app_url, created_at)
VALUES ('${PROJECT_ID}', '${project_slug}', '${escaped_landing}', '${escaped_app}', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, landing_url=excluded.landing_url, app_url=excluded.app_url;
SQL
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] wrangler d1 execute ${D1_DATABASE_NAME:-$PROJECT_ID-d1} --command \"$sql\""
    return
  fi
  log_info "Seeding default project row"
  wrangler d1 execute "${D1_DATABASE_NAME:-$PROJECT_ID-d1}" --command "$sql" >/dev/null
}

ensure_stripe_webhook() {
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set; skipping Stripe webhook provisioning"
    return
  fi
  if [[ -n "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" ]]; then
    log_info "Stripe webhook endpoint already tracked (${STRIPE_WEBHOOK_ENDPOINT_ID}); skipping"
    return
  fi

  local target_url
  target_url="${LANDING_URL%/}/webhook/stripe"
  if [[ "$DRY_RUN" == "1" ]]; then
    STRIPE_WEBHOOK_ENDPOINT_ID="dry-run-webhook"
    STRIPE_WEBHOOK_SECRET="whsec_dry_run"
    log_info "[dry-run] Would create Stripe webhook at $target_url"
    return
  fi

  log_info "Creating Stripe webhook endpoint"
  local response
  response=$(curl -sS -X POST https://api.stripe.com/v1/webhook_endpoints \
    -u "$STRIPE_SECRET_KEY:" \
    -d url="$target_url" \
    -d enabled_events[]="checkout.session.completed" \
    -d enabled_events[]="customer.subscription.created" \
    -d enabled_events[]="customer.subscription.updated" \
    -d enabled_events[]="invoice.payment_succeeded" \
    -d enabled_events[]="invoice.payment_failed")
  STRIPE_WEBHOOK_ENDPOINT_ID=$(jq -r '.id // empty' <<<"$response")
  STRIPE_WEBHOOK_SECRET=$(jq -r '.secret // empty' <<<"$response")
  if [[ -z "$STRIPE_WEBHOOK_ENDPOINT_ID" ]]; then
    log_warn "Failed to create Stripe webhook endpoint: $response"
  else
    log_info "Stripe webhook endpoint created: $STRIPE_WEBHOOK_ENDPOINT_ID"
  fi
}

upload_r2_placeholder() {
  local object_key="welcome.txt"
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] wrangler r2 object put ${R2_BUCKET_NAME:-$PROJECT_ID-assets}/$object_key"
    return
  fi
  log_info "Uploading placeholder asset to R2"
  local tmp_file
  tmp_file=$(mktemp)
  printf 'Welcome to %s!\n' "$PROJECT_ID" >"$tmp_file"
  wrangler r2 object put "${R2_BUCKET_NAME:-$PROJECT_ID-assets}/$object_key" --file "$tmp_file"
  rm -f "$tmp_file"
}

write_generated_env() {
  log_info "Writing $GENERATED_ENV_FILE"
  {
    printf '# Autogenerated by bootstrap.sh on %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '# Do not edit manually – rerun bootstrap.sh instead.\n\n'
    printf 'PROJECT_ID=%s\n' "${PROJECT_ID:-}"
    printf 'LANDING_URL=%s\n' "${LANDING_URL:-}"
    printf 'APP_URL=%s\n' "${APP_URL:-}"
    printf 'D1_DATABASE_NAME=%s\n' "${D1_DATABASE_NAME:-}"
    printf 'D1_DATABASE_ID=%s\n' "${D1_DATABASE_ID:-}"
    printf 'R2_BUCKET_NAME=%s\n' "${R2_BUCKET_NAME:-}"
    printf 'KV_NAMESPACE_ID=%s\n' "${KV_NAMESPACE_ID:-}"
    printf 'STRIPE_PRODUCT_IDS=%s\n' "${STRIPE_PRODUCT_IDS:-[]}"
    printf 'STRIPE_WEBHOOK_ENDPOINT_ID=%s\n' "${STRIPE_WEBHOOK_ENDPOINT_ID:-}"
    printf 'STRIPE_WEBHOOK_SECRET=%s\n' "${STRIPE_WEBHOOK_SECRET:-}"
  } >"$GENERATED_ENV_FILE"
}

main() {
  log_info "Bootstrapping justevery stack (dry-run=$DRY_RUN)"

  require_command wrangler
  require_command jq
  require_command curl
  require_command sed
  require_command node

  load_env_file "/home/azureuser/.env"
  load_env_file "$ROOT_DIR/.env"

  ensure_var PROJECT_ID
  ensure_var CLOUDFLARE_ACCOUNT_ID
  ensure_var CLOUDFLARE_API_TOKEN
  ensure_var LANDING_URL
  ensure_var APP_URL

  ensure_cloudflare_auth
  ensure_d1
  ensure_r2
  ensure_kv
  update_wrangler_config
  run_migrations
  seed_project
  provision_stripe_products
  ensure_stripe_webhook
  upload_r2_placeholder
  write_generated_env

  log_info "Bootstrap complete"
  log_info "Review $GENERATED_ENV_FILE for generated identifiers."
}

main "$@"
