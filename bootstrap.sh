#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

PATH="$ROOT_DIR/node_modules/.bin:$PATH"

GREEN="$(tput setaf 2 2>/dev/null || true)"
YELLOW="$(tput setaf 3 2>/dev/null || true)"
RED="$(tput setaf 1 2>/dev/null || true)"
RESET="$(tput sgr0 2>/dev/null || true)"

DRY_RUN=${DRY_RUN:-0}
GENERATED_ENV_FILE="$ROOT_DIR/.env.local.generated"
STRIPE_SECRET_SOURCE="STRIPE_SECRET_KEY"
CLOUDFLARE_AUTH_METHOD=""
CLOUDFLARE_AUTH_SOURCE=""
CLOUDFLARE_AUTH_HEADERS=()
APP_BASE_URL_RESOLVED=""
WORKER_ROUTE_PATTERN=""
DNS_RECORD_NAMES=()
SYNCED_SECRET_NAMES=()
SYNC_SECRETS=${SYNC_SECRETS:-1}

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
  printf '%s' "$1" | sed -e 's/[&/]/\\&/g' -e 's/"/\\"/g'
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

resolve_stripe_secret() {
  local mode="${STRIPE_MODE:-test}"
  local normalized="${mode,,}"
  local candidate=""
  local source="STRIPE_SECRET_KEY"

  if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
    STRIPE_MODE="$normalized"
    export STRIPE_MODE
    STRIPE_SECRET_SOURCE="STRIPE_SECRET_KEY"
    log_info "Using provided STRIPE_SECRET_KEY for Stripe mode '$normalized'"
    return
  fi

  case "$normalized" in
    live)
      candidate="${STRIPE_LIVE_SECRET_KEY:-}"
      source="STRIPE_LIVE_SECRET_KEY"
      ;;
    test|sandbox|*)
      candidate="${STRIPE_TEST_SECRET_KEY:-}"
      source="STRIPE_TEST_SECRET_KEY"
      normalized="test"
      ;;
  esac

  if [[ -z "$candidate" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      STRIPE_SECRET_KEY="sk_${normalized}_dry_run_placeholder"
      STRIPE_SECRET_SOURCE="dry-run placeholder"
      STRIPE_MODE="$normalized"
      export STRIPE_SECRET_KEY STRIPE_MODE
      log_warn "Stripe secret key missing for mode '$normalized'; using placeholder for dry-run"
      return
    fi
    log_error "Stripe secret key not configured. Set STRIPE_SECRET_KEY or ${source}."
    exit 1
  fi

  STRIPE_SECRET_KEY="$candidate"
  STRIPE_SECRET_SOURCE="$source"
  STRIPE_MODE="$normalized"
  export STRIPE_SECRET_KEY STRIPE_MODE
  log_info "Resolved Stripe secret key from ${source} for mode '$normalized'"
}

resolve_cloudflare_auth() {
  local token="${CLOUDFLARE_API_TOKEN:-}"
  local email="${CLOUDFLARE_EMAIL:-}"
  local api_key="${CLOUDFLARE_API_KEY:-}"

  if [[ -n "$token" ]]; then
    CLOUDFLARE_AUTH_METHOD="api_token"
    CLOUDFLARE_AUTH_SOURCE="CLOUDFLARE_API_TOKEN"
    export CLOUDFLARE_API_TOKEN
    CLOUDFLARE_AUTH_HEADERS=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
  elif [[ -n "$email" && -n "$api_key" ]]; then
    CLOUDFLARE_AUTH_METHOD="api_key"
    CLOUDFLARE_AUTH_SOURCE="CLOUDFLARE_EMAIL+CLOUDFLARE_API_KEY"
    export CLOUDFLARE_EMAIL CLOUDFLARE_API_KEY
    log_warn "CLOUDFLARE_API_TOKEN not provided; Wrangler operations may be limited with API key auth."
    CLOUDFLARE_AUTH_HEADERS=(
      -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}"
      -H "X-Auth-Key: ${CLOUDFLARE_API_KEY}"
    )
  elif [[ "$DRY_RUN" == "1" ]]; then
    CLOUDFLARE_AUTH_METHOD="dry-run"
    CLOUDFLARE_AUTH_SOURCE="placeholders"
    if [[ -z "$token" ]]; then
      CLOUDFLARE_API_TOKEN="dry-run-cloudflare-api-token"
      export CLOUDFLARE_API_TOKEN
      log_warn "CLOUDFLARE_API_TOKEN missing; using placeholder during dry-run."
    fi
    if [[ -z "$email" ]]; then
      CLOUDFLARE_EMAIL="dry-run@example.com"
      export CLOUDFLARE_EMAIL
      log_warn "CLOUDFLARE_EMAIL missing; using placeholder during dry-run."
    fi
    if [[ -z "$api_key" ]]; then
      CLOUDFLARE_API_KEY="dry-run-cloudflare-api-key"
      export CLOUDFLARE_API_KEY
      log_warn "CLOUDFLARE_API_KEY missing; using placeholder during dry-run."
    fi
    CLOUDFLARE_AUTH_HEADERS=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
  else
    log_error "Cloudflare credentials missing. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY."
    exit 1
  fi

  if [[ -z "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      CLOUDFLARE_ZONE_ID="dry-run-zone-id"
      export CLOUDFLARE_ZONE_ID
      log_warn "CLOUDFLARE_ZONE_ID missing; using placeholder 'dry-run-zone-id' during dry-run."
    else
      log_error "CLOUDFLARE_ZONE_ID must be set before running bootstrap."
      exit 1
    fi
  else
    export CLOUDFLARE_ZONE_ID
  fi
}

derive_app_base_from_url() {
  local url=$1
  if [[ -z "$url" ]]; then
    echo "/app"
    return
  fi
  if [[ "$url" =~ ^https?://[^/]+(/.*)$ ]]; then
    local path="${BASH_REMATCH[1]}"
    if [[ -z "$path" || "$path" == "/" ]]; then
      echo "/app"
    else
      echo "$path"
    fi
    return
  fi
  echo "$url"
}

resolve_app_base_url() {
  local resolved="${APP_BASE_URL:-}"
  if [[ -z "$resolved" ]]; then
    resolved=$(derive_app_base_from_url "${APP_URL:-}")
  fi
  APP_BASE_URL_RESOLVED="$resolved"
  export APP_BASE_URL="$resolved"
}

derive_host() {
  local url=$1
  if [[ -z "$url" ]]; then
    echo ""
    return
  fi
  printf '%s' "$url" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#/.*$##'
}

ensure_dns_record() {
  local host=$1
  local content=${CLOUDFLARE_DNS_CONTENT:-192.0.2.1}

  if [[ -z "$host" ]]; then
    log_warn "No host provided for DNS record provisioning; skipping"
    return
  fi

  if [[ -z "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    log_warn "CLOUDFLARE_ZONE_ID unset; skipping DNS record provisioning"
    return
  fi

  log_info "Ensuring DNS record ${host} → ${content}"

  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would ensure DNS A record for ${host} proxied=true"
    DNS_RECORD_NAMES+=("$host")
    return
  fi

  local base_url="https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records"
  local list_response
  if ! list_response=$(run_cmd_capture curl -sS --fail-with-body -G "${CLOUDFLARE_AUTH_HEADERS[@]}" \
    --data-urlencode "type=A" \
    --data-urlencode "name=${host}" \
    "$base_url"); then
    log_warn "Failed to list DNS records for ${host}"
    return
  fi

  local record_id
  record_id=$(jq -r '.result[0].id // empty' <<<"$list_response" 2>/dev/null || true)
  if [[ -n "$record_id" ]]; then
    local existing_content
    local existing_proxied
    existing_content=$(jq -r '.result[0].content // empty' <<<"$list_response" 2>/dev/null || true)
    existing_proxied=$(jq -r '.result[0].proxied // false' <<<"$list_response" 2>/dev/null || true)
    if [[ "$existing_content" == "$content" && "$existing_proxied" == "true" ]]; then
      log_info "DNS record ${host} already configured"
      DNS_RECORD_NAMES+=("$host")
      return
    fi

    local payload
    payload=$(jq -nc --arg type "A" --arg name "$host" --arg content "$content" '{type:$type,name:$name,content:$content,ttl:1,proxied:true}')
    local update_response
  if ! update_response=$(run_cmd_capture curl -sS --fail-with-body -X PUT "${CLOUDFLARE_AUTH_HEADERS[@]}" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "$base_url/${record_id}"); then
      log_warn "Failed to update DNS record ${host}: $update_response"
      return
    fi
    if jq -e '.success == true' <<<"$update_response" >/dev/null 2>&1; then
      log_info "Updated DNS record ${host}"
      DNS_RECORD_NAMES+=("$host")
    else
      log_warn "Unexpected response updating DNS record ${host}: $update_response"
    fi
    return
  fi

  local create_payload
  create_payload=$(jq -nc --arg type "A" --arg name "$host" --arg content "$content" '{type:$type,name:$name,content:$content,ttl:1,proxied:true}')
  local create_response
  if ! create_response=$(run_cmd_capture curl -sS --fail-with-body -X POST "${CLOUDFLARE_AUTH_HEADERS[@]}" \
    -H "Content-Type: application/json" \
    -d "$create_payload" \
    "$base_url"); then
    log_warn "Failed to create DNS record ${host}: $create_response"
    return
  fi
  if jq -e '.success == true' <<<"$create_response" >/dev/null 2>&1; then
    log_info "Created DNS record ${host}"
    DNS_RECORD_NAMES+=("$host")
  else
    log_warn "Unexpected response creating DNS record ${host}: $create_response"
  fi
}

ensure_dns_records() {
  local landing_host app_host
  landing_host=$(derive_host "${LANDING_URL:-}")
  app_host=$(derive_host "${APP_URL:-}")

  if [[ -z "$landing_host" && -z "$app_host" ]]; then
    log_warn "Unable to derive hosts for DNS provisioning; skipping"
    return
  fi

  if [[ -n "$landing_host" ]]; then
    ensure_dns_record "$landing_host"
  fi
  if [[ -n "$app_host" && "$app_host" != "$landing_host" ]]; then
    ensure_dns_record "$app_host"
  fi
}

ensure_worker_secret() {
  local name=$1
  local value=$2

  if [[ -z "$value" ]]; then
    log_warn "Worker secret '$name' is empty; skipping"
    return
  fi

  if [[ "$SYNC_SECRETS" == "0" ]]; then
    log_info "Secret sync disabled (SYNC_SECRETS=0); skipping $name"
    return
  fi

  log_info "Syncing Worker secret $name"

  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] ${WRANGLER_LABEL} secret put ${name}"
    SYNCED_SECRET_NAMES+=("$name")
    return
  fi

  local tmp
  tmp=$(mktemp)
  printf '%s' "$value" >"$tmp"
  local output
  if output=$("${WRANGLER_BASE[@]}" secret put "$name" <"$tmp" 2>&1); then
    SYNCED_SECRET_NAMES+=("$name")
  else
    if [[ "$output" == *"Binding name '${name}' already in use"* ]]; then
      log_info "Worker secret $name already present; leaving as-is"
      SYNCED_SECRET_NAMES+=("$name")
    else
      log_warn "Failed to sync Worker secret $name: $output"
    fi
  fi
  rm -f "$tmp"
}

sync_worker_secrets() {
  ensure_worker_secret STYTCH_SECRET "${STYTCH_SECRET:-}"
  ensure_worker_secret STRIPE_SECRET_KEY "${STRIPE_SECRET_KEY:-}"
  ensure_worker_secret STRIPE_WEBHOOK_SECRET "${STRIPE_WEBHOOK_SECRET:-}"
}

ensure_worker_route() {
  local script=$1
  local pattern=$2

  if [[ -z "$pattern" ]]; then
    log_warn "Empty worker route pattern provided; skipping"
    return
  fi
  if [[ -z "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    log_warn "CLOUDFLARE_ZONE_ID unset; skipping worker route provisioning"
    return
  fi

  log_info "Ensuring Cloudflare Worker route '${pattern}' → '${script}'"

  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would ensure worker route pattern=${pattern} script=${script}"
    return
  fi

  local base_url="https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/workers/routes"
  local list_response
  if ! list_response=$(run_cmd_capture curl -sS --fail-with-body -X GET "${CLOUDFLARE_AUTH_HEADERS[@]}" "$base_url"); then
    log_warn "Failed to list Cloudflare worker routes for zone ${CLOUDFLARE_ZONE_ID}"
    return
  fi

  if jq -e --arg pattern "$pattern" '.result[]? | select(.pattern == $pattern)' <<<"$list_response" >/dev/null 2>&1; then
    local existing_script
    existing_script=$(jq -r --arg pattern "$pattern" '.result[]? | select(.pattern == $pattern) | .script // empty' <<<"$list_response" 2>/dev/null || true)
    if [[ -n "$existing_script" && "$existing_script" != "$script" ]]; then
      log_warn "Route ${pattern} already mapped to ${existing_script}; leaving unchanged"
    else
      log_info "Route ${pattern} already exists; skipping"
    fi
    return
  fi

  local payload
  payload=$(jq -nc --arg pattern "$pattern" --arg script "$script" '{pattern: $pattern, script: $script}')
  local create_response
  if ! create_response=$(run_cmd_capture curl -sS --fail-with-body -X POST "${CLOUDFLARE_AUTH_HEADERS[@]}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$base_url"); then
    log_warn "Failed to create Cloudflare worker route ${pattern}"
    return
  fi

  if jq -e '.success == true' <<<"$create_response" >/dev/null 2>&1; then
    log_info "Created worker route ${pattern}"
  else
    log_warn "Cloudflare worker route creation response: ${create_response}"
  fi
}

ensure_worker_routes() {
  local landing_host app_host base_host script
  landing_host=$(derive_host "${LANDING_URL:-}")
  app_host=$(derive_host "${APP_URL:-}")

  if [[ -z "$landing_host" && -z "$app_host" ]]; then
    log_warn "Unable to derive host from LANDING_URL or APP_URL; skipping worker route provisioning"
    return
  fi

  base_host="$landing_host"
  if [[ -z "$base_host" ]]; then
    base_host="$app_host"
  fi

  script="${PROJECT_ID}-worker"
  local patterns=()
  patterns+=("${base_host}/*")

  if [[ -n "$app_host" && "$app_host" != "$base_host" ]]; then
    patterns+=("${app_host}/*")
  else
    local app_path
    app_path=$(derive_app_base_from_url "${APP_URL:-}")
    if [[ -n "$app_path" && "$app_path" != "/" ]]; then
      local normalized="${app_path#/}"
      normalized="${normalized%/}"
      if [[ -n "$normalized" ]]; then
        patterns+=("${base_host}/${normalized}*")
      fi
    fi
  fi

  local unique_patterns=()
  for pattern in "${patterns[@]}"; do
    local exists=0
    for existing in "${unique_patterns[@]}"; do
      if [[ "$existing" == "$pattern" ]]; then
        exists=1
        break
      fi
    done
    if [[ $exists -eq 0 ]]; then
      unique_patterns+=("$pattern")
    fi
  done

  for pattern in "${unique_patterns[@]}"; do
    ensure_worker_route "$script" "$pattern"
  done

  if [[ ${#unique_patterns[@]} -gt 0 ]]; then
    local old_ifs="$IFS"
    IFS=,
    WORKER_ROUTE_PATTERN="${unique_patterns[*]}"
    IFS="$old_ifs"
  fi
}

WRANGLER_BIN=()
WRANGLER_BASE=()
WRANGLER_LABEL="wrangler"

detect_wrangler() {
  if [[ -x "$ROOT_DIR/node_modules/.bin/wrangler" ]]; then
    WRANGLER_BIN=("$ROOT_DIR/node_modules/.bin/wrangler")
    WRANGLER_LABEL="$ROOT_DIR/node_modules/.bin/wrangler"
    WRANGLER_BASE=("${WRANGLER_BIN[@]}" "--config" "$ROOT_DIR/workers/api/wrangler.toml")
    return
  fi

  if command -v wrangler >/dev/null 2>&1; then
    WRANGLER_BIN=("wrangler")
    WRANGLER_LABEL="wrangler"
    WRANGLER_BASE=("${WRANGLER_BIN[@]}" "--config" "$ROOT_DIR/workers/api/wrangler.toml")
    return
  fi

  if command -v npx >/dev/null 2>&1; then
    WRANGLER_BIN=("npx" "--yes" "wrangler")
    WRANGLER_LABEL="npx wrangler"
    WRANGLER_BASE=("${WRANGLER_BIN[@]}" "--config" "$ROOT_DIR/workers/api/wrangler.toml")
    return
  fi

  log_error "Wrangler CLI not found. Install it by running 'npm install --workspace workers/api' or 'npm install -D wrangler'."
  exit 1
}

wrangler_cmd() {
  run_cmd "${WRANGLER_BASE[@]}" "$@"
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
  [[ "$DRY_RUN" == "1" ]] && return

  if [[ "$CLOUDFLARE_AUTH_METHOD" == "api_token" ]]; then
    log_info "Authenticating Wrangler session"
    wrangler_cmd whoami >/dev/null
  else
    log_warn "Skipping Wrangler authentication; current Cloudflare auth method '$CLOUDFLARE_AUTH_METHOD' is not compatible with Wrangler login."
  fi
}

ensure_d1() {
  local name=${CLOUDFLARE_D1_NAME:-"${PROJECT_ID}-d1"}
  D1_DATABASE_NAME="$name"
  log_info "Ensuring D1 database '$name' exists"
  if [[ "$DRY_RUN" == "1" ]]; then
    D1_DATABASE_ID="dry-run-${name}"
    return
  fi

  local list_json=""
  if ! list_json=$("${WRANGLER_BASE[@]}" d1 list --json 2>/dev/null); then
    list_json=""
  fi
  if [[ -n "$list_json" ]]; then
    local existing
    existing=$(jq -r --arg name "$name" '.[] | select(.name==$name) | .uuid' <<<"$list_json")
    if [[ -n "$existing" && "$existing" != "null" ]]; then
      log_info "Found existing D1 database $existing"
      D1_DATABASE_ID="$existing"
      return
    fi
  fi

  wrangler_cmd d1 create "$name" >/dev/null

  list_json=""
  if ! list_json=$("${WRANGLER_BASE[@]}" d1 list --json 2>/dev/null); then
    list_json=""
  fi
  if [[ -z "$list_json" ]]; then
    log_warn "Unable to fetch D1 database id after creation; leaving D1_DATABASE_ID unset"
    return
  fi
  D1_DATABASE_ID=$(jq -r --arg name "$name" '.[] | select(.name==$name) | .uuid' <<<"$list_json")
  log_info "Created D1 database with id ${D1_DATABASE_ID:-unknown}"
}

ensure_r2() {
  local bucket=${CLOUDFLARE_R2_BUCKET:-"${PROJECT_ID}-assets"}
  R2_BUCKET_NAME="$bucket"
  log_info "Ensuring R2 bucket '$bucket' exists"
  if [[ "$DRY_RUN" == "1" ]]; then
    R2_BUCKET_ID="$bucket"
    return
  fi
  local list_output=""
  if ! list_output=$("${WRANGLER_BASE[@]}" r2 bucket list 2>/dev/null); then
    list_output=""
  fi
  if [[ -n "$list_output" ]] && [[ "$list_output" == *"name:           $bucket"* ]]; then
    log_info "Found existing R2 bucket $bucket"
    R2_BUCKET_ID="$bucket"
    return
  fi
  wrangler_cmd r2 bucket create "$bucket"
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
  local list_json=""
  if ! list_json=$("${WRANGLER_BASE[@]}" kv namespace list 2>/dev/null); then
    list_json=""
  fi
  if [[ -n "$list_json" ]]; then
    local existing
    existing=$(jq -r --arg namespace "$namespace" '.[] | select(.title==$namespace or .title=="worker-" + $namespace) | .id' <<<"$list_json" 2>/dev/null || true)
    if [[ -n "$existing" && "$existing" != "null" ]]; then
      log_info "Found existing KV namespace $existing"
      KV_NAMESPACE_ID="$existing"
      return
    fi
  fi
  wrangler_cmd kv namespace create "$namespace" >/dev/null
  list_json=$("${WRANGLER_BASE[@]}" kv namespace list 2>/dev/null || true)
  KV_NAMESPACE_ID=$(jq -r --arg namespace "$namespace" '.[] | select(.title==$namespace or .title=="worker-" + $namespace) | .id' <<<"$list_json" 2>/dev/null || true)
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
  local stytch_project_safe=$(escape_sed "${STYTCH_PROJECT_ID:-}")
  local stytch_secret_safe=$(escape_sed "${STYTCH_SECRET:-}")
  local stytch_public_token_safe=$(escape_sed "${STYTCH_PUBLIC_TOKEN:-}")
  local stytch_login_safe=$(escape_sed "${STYTCH_LOGIN_URL:-}")
  local stytch_redirect_safe=$(escape_sed "${STYTCH_REDIRECT_URL:-}")
  local stytch_sso_connection_safe=$(escape_sed "${STYTCH_SSO_CONNECTION_ID:-}")
  local stytch_org_slug_safe=$(escape_sed "${STYTCH_ORGANIZATION_SLUG:-}")
  local stytch_org_id_safe=$(escape_sed "${STYTCH_ORGANIZATION_ID:-}")
  local stytch_sso_domain_safe=$(escape_sed "${STYTCH_SSO_DOMAIN:-}")
  local app_base_safe=$(escape_sed "${APP_BASE_URL_RESOLVED:-${APP_BASE_URL:-}}")
  local stripe_products_safe=$(escape_sed "${STRIPE_PRODUCTS:-[]}")
  local stripe_webhook_safe=$(escape_sed "${STRIPE_WEBHOOK_SECRET:-}")
  local cloudflare_zone_safe=$(escape_sed "${CLOUDFLARE_ZONE_ID:-}")
  local tmp
  tmp=$(mktemp)
  sed \
    -e "s/{{PROJECT_ID}}/${project_safe}/g" \
    -e "s/{{D1_DATABASE_ID}}/${d1_safe}/g" \
    -e "s/{{R2_BUCKET_NAME}}/${bucket_safe}/g" \
    -e "s/{{KV_NAMESPACE_ID}}/${kv_safe}/g" \
    -e "s#{{LANDING_URL}}#${landing_safe}#g" \
    -e "s#{{APP_URL}}#${app_safe}#g" \
    -e "s#{{APP_BASE_URL}}#${app_base_safe}#g" \
    -e "s#{{STYTCH_PROJECT_ID}}#${stytch_project_safe}#g" \
    -e "s#{{STYTCH_PUBLIC_TOKEN}}#${stytch_public_token_safe}#g" \
    -e "s#{{STYTCH_SECRET}}#${stytch_secret_safe}#g" \
    -e "s#{{STYTCH_LOGIN_URL}}#${stytch_login_safe}#g" \
    -e "s#{{STYTCH_REDIRECT_URL}}#${stytch_redirect_safe}#g" \
    -e "s#{{STYTCH_SSO_CONNECTION_ID}}#${stytch_sso_connection_safe}#g" \
    -e "s#{{STYTCH_ORGANIZATION_SLUG}}#${stytch_org_slug_safe}#g" \
    -e "s#{{STYTCH_ORGANIZATION_ID}}#${stytch_org_id_safe}#g" \
    -e "s#{{STYTCH_SSO_DOMAIN}}#${stytch_sso_domain_safe}#g" \
    -e "s#{{STRIPE_PRODUCTS}}#${stripe_products_safe}#g" \
    -e "s#{{STRIPE_WEBHOOK_SECRET}}#${stripe_webhook_safe}#g" \
    -e "s#{{CLOUDFLARE_ZONE_ID}}#${cloudflare_zone_safe}#g" \
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
    log_info "[dry-run] ${WRANGLER_LABEL} d1 execute ${D1_DATABASE_NAME:-$PROJECT_ID-d1} --command \"$sql\""
    return
  fi
  log_info "Seeding default project row"
  "${WRANGLER_BASE[@]}" d1 execute "${D1_DATABASE_NAME:-$PROJECT_ID-d1}" --command "$sql" >/dev/null
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

sync_stytch_redirects() {
  if [[ -z "${STYTCH_PROJECT_ID:-}" || -z "${STYTCH_SECRET:-}" ]]; then
    log_warn "STYTCH_PROJECT_ID or STYTCH_SECRET missing; skipping Stytch redirect sync"
    return
  fi

  local landing_url="${LANDING_URL:-}"
  local app_url="${APP_URL:-}"
  if [[ -z "$landing_url" || -z "$app_url" ]]; then
    log_warn "LANDING_URL or APP_URL missing; skipping Stytch redirect sync"
    return
  fi

  local callback_url="${app_url%/}/auth/callback"
  local desired_urls=("$landing_url" "$callback_url")

  log_info "Syncing Stytch redirect URLs"

  if [[ "$DRY_RUN" == "1" ]]; then
    for url in "${desired_urls[@]}"; do
      log_info "[dry-run] Would ensure Stytch redirect URL: $url"
    done
    return
  fi

  local auth="${STYTCH_PROJECT_ID}:${STYTCH_SECRET}"
  local stytch_base="https://api.stytch.com/v1/projects/${STYTCH_PROJECT_ID}"
  local redirect_endpoint="${stytch_base}/redirect_urls"

  local list_response
  if ! list_response=$(run_cmd_capture curl -sS --fail-with-body -u "$auth" "$redirect_endpoint"); then
    log_warn "Failed to list Stytch redirect URLs"
    return
  fi

  for url in "${desired_urls[@]}"; do
    if [[ -z "$url" ]]; then
      continue
    fi
    if jq -e --arg url "$url" '.redirect_urls // [] | map(.url) | index($url)' <<<"$list_response" >/dev/null 2>&1; then
      log_info "Stytch redirect URL already present: $url"
      continue
    fi

    local payload
    payload=$(jq -nc --arg url "$url" '{url: $url}')
    local create_response
    if ! create_response=$(run_cmd_capture curl -sS --fail-with-body -X POST -u "$auth" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "$redirect_endpoint"); then
      log_warn "Failed to create Stytch redirect URL: $url"
      continue
    fi

    if jq -e --arg url "$url" '.redirect_url.url == $url' <<<"$create_response" >/dev/null 2>&1; then
      log_info "Created Stytch redirect URL: $url"
      list_response=$(jq --arg url "$url" '
        .redirect_urls = (
          (.redirect_urls // []) + [{url: $url}]
        )
      ' <<<"$list_response" 2>/dev/null || printf '{"redirect_urls":[{"url":"%s"}]}' "$url")
      continue
    fi

    log_warn "Unexpected response while creating Stytch redirect URL $url: $create_response"
  done
}

sync_stytch_sso_helpers() {
  if [[ -z "${STYTCH_SSO_CONNECTION_ID:-}" && -z "${STYTCH_SSO_DOMAIN:-}" ]]; then
    return
  fi

  if [[ -z "${STYTCH_PROJECT_ID:-}" || -z "${STYTCH_SECRET:-}" ]]; then
    log_warn "Missing Stytch credentials; skipping SSO helper sync"
    return
  fi

  local auth="${STYTCH_PROJECT_ID}:${STYTCH_SECRET}"

  if [[ -n "${STYTCH_SSO_CONNECTION_ID:-}" ]]; then
    local connection_id="${STYTCH_SSO_CONNECTION_ID}"
    local stytch_base="https://api.stytch.com/v1/projects/${STYTCH_PROJECT_ID}"
    local connection_endpoint="${stytch_base}/sso/connections/${connection_id}"
    log_info "Syncing Stytch SSO connection ${connection_id}"

    if [[ "$DRY_RUN" == "1" ]]; then
      if [[ -n "${STYTCH_SSO_DOMAIN:-}" ]]; then
        log_info "[dry-run] Would ensure Stytch SSO domain '${STYTCH_SSO_DOMAIN}' is attached to connection ${connection_id}"
      fi
    else
      local connection_response
      connection_response=$(run_cmd_capture curl -sS --fail-with-body -u "$auth" "$connection_endpoint") || {
        log_warn "Unable to fetch Stytch SSO connection ${connection_id}"
        return
      }

      if [[ -n "${STYTCH_SSO_DOMAIN:-}" ]]; then
        local domain="${STYTCH_SSO_DOMAIN}"
        if ! jq -e --arg domain "$domain" '.connection.domains // [] | map(.domain // .slug // "") | index($domain)' <<<"$connection_response" >/dev/null 2>&1; then
          local domain_payload
          domain_payload=$(jq -nc --arg domain "$domain" '{domain: $domain}')
          local domain_response
          domain_response=$(run_cmd_capture curl -sS --fail-with-body -X POST -u "$auth" \
            -H "Content-Type: application/json" \
            -d "$domain_payload" \
            "${connection_endpoint}/domains") || {
              log_warn "Failed to register Stytch SSO domain ${domain} for connection ${connection_id}"
              return
            }
          if jq -e '.domain.domain == $domain or .domain.slug == $domain' --arg domain "$domain" <<<"$domain_response" >/dev/null 2>&1; then
            log_info "Added Stytch SSO domain ${domain} to connection ${connection_id}"
          else
            log_warn "Unexpected response when adding Stytch SSO domain ${domain}: ${domain_response}"
          fi
        else
          log_info "Stytch SSO domain ${domain} already attached to ${connection_id}"
        fi
      fi
    fi
  fi

  if [[ -n "${STYTCH_ORGANIZATION_ID:-}" ]]; then
    log_info "Stytch organization ID present (${STYTCH_ORGANIZATION_ID}); ensure permissions are configured in Stytch Console"
  fi
  if [[ -n "${STYTCH_ORGANIZATION_SLUG:-}" ]]; then
    log_info "Stytch organization slug configured (${STYTCH_ORGANIZATION_SLUG})"
  fi
}

upload_r2_placeholder() {
  local object_key="welcome.txt"
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] ${WRANGLER_LABEL} r2 object put ${R2_BUCKET_NAME:-$PROJECT_ID-assets}/$object_key"
    return
  fi
  log_info "Uploading placeholder asset to R2"
  local tmp_file
  tmp_file=$(mktemp)
  printf 'Welcome to %s!\n' "$PROJECT_ID" >"$tmp_file"
  wrangler_cmd r2 object put "${R2_BUCKET_NAME:-$PROJECT_ID-assets}/$object_key" --file "$tmp_file"
  rm -f "$tmp_file"
}

write_generated_env() {
  log_info "Writing $GENERATED_ENV_FILE"
  local dns_records=""
  if [[ ${#DNS_RECORD_NAMES[@]} -gt 0 ]]; then
    dns_records=$(printf '%s\n' "${DNS_RECORD_NAMES[@]}" | awk '!seen[$0]++' | paste -sd',' -)
  fi
  local secret_names=""
  if [[ ${#SYNCED_SECRET_NAMES[@]} -gt 0 ]]; then
    secret_names=$(printf '%s\n' "${SYNCED_SECRET_NAMES[@]}" | awk '!seen[$0]++' | paste -sd',' -)
  fi
  {
    printf '# Autogenerated by bootstrap.sh on %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '# Do not edit manually – rerun bootstrap.sh instead.\n\n'
    printf 'PROJECT_ID=%s\n' "${PROJECT_ID:-}"
    printf 'LANDING_URL=%s\n' "${LANDING_URL:-}"
    printf 'APP_URL=%s\n' "${APP_URL:-}"
    printf 'APP_BASE_URL=%s\n' "${APP_BASE_URL_RESOLVED:-${APP_BASE_URL:-}}"
    printf 'D1_DATABASE_NAME=%s\n' "${D1_DATABASE_NAME:-}"
    printf 'D1_DATABASE_ID=%s\n' "${D1_DATABASE_ID:-}"
    printf 'R2_BUCKET_NAME=%s\n' "${R2_BUCKET_NAME:-}"
    printf 'KV_NAMESPACE_ID=%s\n' "${KV_NAMESPACE_ID:-}"
    printf 'CLOUDFLARE_ZONE_ID=%s\n' "${CLOUDFLARE_ZONE_ID:-}"
    printf 'CLOUDFLARE_AUTH_METHOD=%s\n' "${CLOUDFLARE_AUTH_METHOD:-}"
    printf 'CLOUDFLARE_AUTH_SOURCE=%s\n' "${CLOUDFLARE_AUTH_SOURCE:-}"
    printf 'DNS_RECORD_NAMES=%s\n' "${dns_records:-}"
    printf 'WORKER_ROUTE_PATTERN=%s\n' "${WORKER_ROUTE_PATTERN:-}"
    printf 'SYNCED_SECRET_NAMES=%s\n' "${secret_names:-}"
    printf 'STRIPE_PRODUCT_IDS=%s\n' "${STRIPE_PRODUCT_IDS:-[]}"
    printf 'STRIPE_WEBHOOK_ENDPOINT_ID=%s\n' "${STRIPE_WEBHOOK_ENDPOINT_ID:-}"
    printf 'STRIPE_WEBHOOK_SECRET=%s\n' "${STRIPE_WEBHOOK_SECRET:-}"
    printf 'STRIPE_MODE=%s\n' "${STRIPE_MODE:-}"
    printf 'STRIPE_SECRET_SOURCE=%s\n' "${STRIPE_SECRET_SOURCE:-}"
  } >"$GENERATED_ENV_FILE"
}

main() {
  log_info "Bootstrapping justevery stack (dry-run=$DRY_RUN)"

  detect_wrangler
  require_command jq
  require_command curl
  require_command sed
  require_command node

  load_env_file "/home/azureuser/.env"
  load_env_file "$ROOT_DIR/.env"

  ensure_var PROJECT_ID
  ensure_var CLOUDFLARE_ACCOUNT_ID
  ensure_var LANDING_URL
  ensure_var APP_URL
  ensure_var STYTCH_PROJECT_ID
  ensure_var STYTCH_SECRET

  resolve_stripe_secret
  resolve_cloudflare_auth
  resolve_app_base_url

  ensure_cloudflare_auth
  ensure_d1
  ensure_r2
  ensure_kv
  update_wrangler_config
  ensure_dns_records
  ensure_worker_routes
  run_migrations
  seed_project
  provision_stripe_products
  ensure_stripe_webhook
  sync_worker_secrets
  sync_stytch_redirects
  sync_stytch_sso_helpers
  upload_r2_placeholder
  write_generated_env

  log_info "Bootstrap complete"
  log_info "Review $GENERATED_ENV_FILE for generated identifiers."
}

main "$@"
