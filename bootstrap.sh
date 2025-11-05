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
SYNCED_SECRET_NAMES=()
SYNC_SECRETS=${SYNC_SECRETS:-1}
FORCE_SECRET_SYNC=${FORCE_SECRET_SYNC:-0}

log_info() {
  echo "${GREEN}[info]${RESET} $*"
}

log_warn() {
  echo "${YELLOW}[warn]${RESET} $*"
}

log_error() {
  echo "${RED}[error]${RESET} $*" >&2
}

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
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
      local placeholder="dry-run-$(to_lower "$name")"
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
  local normalized="$(to_lower "$mode")"
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

prepare_cloudflare_env() {
  if [[ -z "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    log_warn "CLOUDFLARE_ZONE_ID not set; Wrangler will infer the zone from custom domains."
  else
    export CLOUDFLARE_ZONE_ID
  fi
}

extract_origin() {
  local url=$1
  if [[ -z "$url" ]]; then
    echo ""
    return
  fi
  if [[ "$url" =~ ^https?://[^/]+ ]]; then
    echo "${BASH_REMATCH[0]}"
    return
  fi
  echo "$url"
}

derive_host() {
  local url=$1
  if [[ -z "$url" ]]; then
    echo ""
    return
  fi
  printf '%s' "$url" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#/.*$##'
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

  # Check if this secret was already synced in a previous run (unless forced)
  if [[ "$FORCE_SECRET_SYNC" != "1" && -f "$GENERATED_ENV_FILE" ]]; then
    local synced_secrets
    synced_secrets=$(grep -E '^SYNCED_SECRET_NAMES=' "$GENERATED_ENV_FILE" 2>/dev/null | cut -d= -f2)
    if [[ -n "$synced_secrets" ]] && [[ ",$synced_secrets," == *",$name,"* ]]; then
      log_info "Worker secret $name already synced in previous run; skipping (set FORCE_SECRET_SYNC=1 to override)"
      SYNCED_SECRET_NAMES+=("$name")
      return
    fi
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

mint_logto_management_token() {
  if [[ -n "${LOGTO_MANAGEMENT_TOKEN:-}" ]]; then
    return
  fi

  if [[ -z "${LOGTO_MANAGEMENT_ENDPOINT:-}" || -z "${LOGTO_MANAGEMENT_AUTH_BASIC:-}" ]]; then
    log_error "Missing LOGTO_MANAGEMENT_ENDPOINT or LOGTO_MANAGEMENT_AUTH_BASIC; cannot mint management token"
    exit 1
  fi

  local endpoint="${LOGTO_MANAGEMENT_ENDPOINT%/}"
  local token_url="${endpoint}/oidc/token"
  local resource="${endpoint}/api"

  if [[ "$DRY_RUN" == "1" ]]; then
    LOGTO_MANAGEMENT_TOKEN="dry-run-logto-token"
    export LOGTO_MANAGEMENT_TOKEN
    log_info "[dry-run] Would mint Logto management token via ${token_url}"
    return
  fi

  log_info "Minting Logto management token"

  local response
  if ! response=$(run_cmd_capture curl -sS --fail-with-body -X POST \
    -H "Authorization: Basic ${LOGTO_MANAGEMENT_AUTH_BASIC}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" \
    -d "resource=${resource}" \
    -d "scope=all" \
    "$token_url"); then
    log_error "Failed to obtain Logto management token"
    exit 1
  fi

  local token
  token=$(jq -r '.access_token // empty' <<<"$response" 2>/dev/null || true)
  if [[ -z "$token" ]]; then
    log_error "Unable to parse Logto management token from response: $response"
    exit 1
  fi

  LOGTO_MANAGEMENT_TOKEN="$token"
  export LOGTO_MANAGEMENT_TOKEN
}

derive_logto_defaults() {
  if [[ -z "${LOGTO_ENDPOINT:-}" && -n "${LOGTO_MANAGEMENT_ENDPOINT:-}" ]]; then
    LOGTO_ENDPOINT="${LOGTO_MANAGEMENT_ENDPOINT%/}"
    log_info "Using LOGTO_MANAGEMENT_ENDPOINT as LOGTO_ENDPOINT (${LOGTO_ENDPOINT})"
  fi

  if [[ -z "${LOGTO_ENDPOINT:-}" ]]; then
    LOGTO_ENDPOINT="https://login.justevery.com"
    log_info "Defaulting LOGTO_ENDPOINT to ${LOGTO_ENDPOINT}"
  fi
  export LOGTO_ENDPOINT

  if [[ -z "${LOGTO_ISSUER:-}" ]]; then
    LOGTO_ISSUER="${LOGTO_ENDPOINT%/}/oidc"
    log_info "Derived LOGTO_ISSUER=${LOGTO_ISSUER}"
  fi
  export LOGTO_ISSUER

  if [[ -z "${LOGTO_JWKS_URI:-}" ]]; then
    LOGTO_JWKS_URI="${LOGTO_ENDPOINT%/}/oidc/jwks"
    log_info "Derived LOGTO_JWKS_URI=${LOGTO_JWKS_URI}"
  fi
  export LOGTO_JWKS_URI

  if [[ -z "${LOGTO_API_RESOURCE:-}" ]]; then
    LOGTO_API_RESOURCE="https://${PROJECT_ID}.justevery.com/api"
    log_info "Defaulting LOGTO_API_RESOURCE to ${LOGTO_API_RESOURCE}"
  fi
  export LOGTO_API_RESOURCE
}

build_logto_application_payload() {
  local display_name=$1
  local include_type=${2:-0}
  local description=$3
  local redirect_uri=$4
  local logout_uri=$5
  local subdomain=$6

  jq -nc \
    --arg name "$display_name" \
    --arg desc "$description" \
    --arg redirect "$redirect_uri" \
    --arg logout "$logout_uri" \
    --arg subdomain "$subdomain" \
    --arg include_type "$include_type" \
    '{
      name: $name,
      description: $desc,
      oidcClientMetadata: {
        redirectUris: [$redirect],
        postLogoutRedirectUris: [$logout]
      },
      customClientMetadata: {
        alwaysIssueRefreshToken: true,
        rotateRefreshToken: true
      },
      protectedAppMetadata: {
        subDomain: $subdomain,
        origin: "justevery.com"
      }
    }
    | if $include_type == "1" then . + {type: "SPA"} else . end'
}

reconcile_logto_application_metadata() {
  local app_id=$1
  local apps_url=$2
  local display_name=$3
  local description=$4
  local redirect_uri=$5
  local logout_uri=$6
  local subdomain=$7

  local expected_payload existing_response
  expected_payload=$(build_logto_application_payload "$display_name" 0 "$description" "$redirect_uri" "$logout_uri" "$subdomain")

  if ! existing_response=$(run_cmd_capture curl -sS --fail-with-body -X GET \
    -H "Authorization: Bearer ${LOGTO_MANAGEMENT_TOKEN}" \
    "${apps_url}/${app_id}"); then
    log_warn "Failed to fetch Logto application ${app_id}; will attempt to recreate"
    return 1
  fi

  local patch_required=0
  local current_name current_description current_subdomain has_redirect has_logout always_issue rotate_refresh
  current_name=$(jq -r '.name // empty' <<<"$existing_response" 2>/dev/null || true)
  if [[ "$current_name" != "$display_name" ]]; then
    patch_required=1
  fi

  current_description=$(jq -r '.description // empty' <<<"$existing_response" 2>/dev/null || true)
  if [[ "$current_description" != "$description" ]]; then
    patch_required=1
  fi

  has_redirect=$(jq --arg redirect "$redirect_uri" '.oidcClientMetadata.redirectUris // [] | index($redirect)' <<<"$existing_response" 2>/dev/null || echo "null")
  if [[ "$has_redirect" == "null" ]]; then
    patch_required=1
  fi

  has_logout=$(jq --arg logout "$logout_uri" '.oidcClientMetadata.postLogoutRedirectUris // [] | index($logout)' <<<"$existing_response" 2>/dev/null || echo "null")
  if [[ "$has_logout" == "null" ]]; then
    patch_required=1
  fi

  current_subdomain=$(jq -r '.protectedAppMetadata.subDomain // empty' <<<"$existing_response" 2>/dev/null || true)
  if [[ "$current_subdomain" != "$subdomain" ]]; then
    patch_required=1
  fi

  always_issue=$(jq -r '.customClientMetadata.alwaysIssueRefreshToken // empty' <<<"$existing_response" 2>/dev/null || true)
  if [[ "$always_issue" != "true" ]]; then
    patch_required=1
  fi

  rotate_refresh=$(jq -r '.customClientMetadata.rotateRefreshToken // empty' <<<"$existing_response" 2>/dev/null || true)
  if [[ "$rotate_refresh" != "true" ]]; then
    patch_required=1
  fi

  if [[ $patch_required -eq 0 ]]; then
    log_info "Existing Logto application ${display_name} (${app_id}) is up-to-date"
    LOGTO_APPLICATION_ID="$app_id"
    export LOGTO_APPLICATION_ID
    return 0
  fi

  log_info "Updating Logto application ${display_name} (${app_id})"

  local patch_response=""
  local patch_status=0
  patch_response=$(run_cmd_capture curl -sS --fail-with-body -X PATCH \
    -H "Authorization: Bearer ${LOGTO_MANAGEMENT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$expected_payload" \
    "${apps_url}/${app_id}") || patch_status=$?

  if [[ $patch_status -eq 0 ]]; then
    LOGTO_APPLICATION_ID="$app_id"
    export LOGTO_APPLICATION_ID
    log_info "Updated Logto application metadata for ${display_name} (${app_id})"
    return 0
  fi

  log_warn "Failed to update Logto application ${app_id}: ${patch_response}"
  return 1
}

ensure_logto_application() {
  if [[ -z "${LOGTO_MANAGEMENT_TOKEN:-}" ]]; then
    mint_logto_management_token
  fi

  local endpoint="${LOGTO_MANAGEMENT_ENDPOINT%/}"
  local apps_url="${endpoint}/api/applications"
  local display_name="${PROJECT_NAME:-$PROJECT_ID}"
  [[ -z "$display_name" ]] && display_name="$PROJECT_ID"

  local description="Managed for ${PROJECT_ID} project"
  if [[ -n "${PROJECT_NAME:-}" ]]; then
    description="Managed for ${PROJECT_NAME} (${PROJECT_ID}) project"
  fi

  local redirect_uri="https://${PROJECT_ID}.justevery.com/callback"
  local logout_uri="https://${PROJECT_ID}.justevery.com/logout"
  local subdomain="${PROJECT_ID}.justevery.com"

  local -a search_names=()
  if [[ -n "$display_name" ]]; then
    search_names+=("$display_name")
  fi
  if [[ "$display_name" != "$PROJECT_ID" ]]; then
    search_names+=("$PROJECT_ID")
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    LOGTO_APPLICATION_ID="dry-run-logto-app"
    export LOGTO_APPLICATION_ID
    log_info "[dry-run] Would ensure Logto application ${display_name}"
    return
  fi

  if [[ -n "${LOGTO_APPLICATION_ID:-}" ]]; then
    if reconcile_logto_application_metadata "$LOGTO_APPLICATION_ID" "$apps_url" "$display_name" "$description" "$redirect_uri" "$logout_uri" "$subdomain"; then
      return
    fi
    log_warn "Configured LOGTO_APPLICATION_ID (${LOGTO_APPLICATION_ID}) could not be reconciled; attempting lookup by name"
    LOGTO_APPLICATION_ID=""
  fi

  local list_response
  if ! list_response=$(run_cmd_capture curl -sS --fail-with-body -X GET \
    -H "Authorization: Bearer ${LOGTO_MANAGEMENT_TOKEN}" \
    "$apps_url"); then
    log_error "Failed to list Logto applications"
    exit 1
  fi

  local existing_id=""
  local matched_name=""
  for candidate_name in "${search_names[@]}"; do
    [[ -z "$candidate_name" ]] && continue
    existing_id=$(jq -r --arg name "$candidate_name" '((.items // []) + (.data // [])) | map(select(.name == $name) | .id) | .[0] // empty' <<<"$list_response" 2>/dev/null || true)
    if [[ -n "$existing_id" ]]; then
      matched_name="$candidate_name"
      break
    fi
  done

  if [[ -n "$existing_id" ]]; then
    LOGTO_APPLICATION_ID="$existing_id"
    export LOGTO_APPLICATION_ID
    log_info "Found existing Logto application ${matched_name} (${existing_id})"
    reconcile_logto_application_metadata "$existing_id" "$apps_url" "$display_name" "$description" "$redirect_uri" "$logout_uri" "$subdomain" || true
    return
  fi

  log_info "Creating Logto application ${display_name}"
  local payload
  payload=$(build_logto_application_payload "$display_name" 1 "$description" "$redirect_uri" "$logout_uri" "$subdomain")

  local create_response
  if ! create_response=$(run_cmd_capture curl -sS --fail-with-body -X POST \
    -H "Authorization: Bearer ${LOGTO_MANAGEMENT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$apps_url"); then
    log_error "Failed to create Logto application ${display_name}"
    exit 1
  fi

  local new_id
  new_id=$(jq -r '.id // empty' <<<"$create_response" 2>/dev/null || true)
  if [[ -z "$new_id" ]]; then
    log_error "Unable to extract application id from Logto response: $create_response"
    exit 1
  fi

  LOGTO_APPLICATION_ID="$new_id"
  export LOGTO_APPLICATION_ID
  log_info "Created Logto application ${display_name} (${LOGTO_APPLICATION_ID})"
}

sync_worker_secrets() {
  ensure_worker_secret LOGTO_APPLICATION_ID "${LOGTO_APPLICATION_ID:-}"
  ensure_worker_secret STRIPE_SECRET_KEY "${STRIPE_SECRET_KEY:-}"
  ensure_worker_secret STRIPE_WEBHOOK_SECRET "${STRIPE_WEBHOOK_SECRET:-}"
}

ensure_worker_route() {
  log_info "Skipping worker route provisioning; managed via wrangler.toml routes"
  return
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
  log_info "Skipping worker route provisioning; managed via wrangler.toml routes"
  return
  local landing_host app_host base_host script
  landing_host=$(derive_host "${PROJECT_DOMAIN:-}")
  app_host=$(derive_host "${APP_URL:-}")

  if [[ -z "$landing_host" && -z "$app_host" ]]; then
    log_warn "Unable to derive host from PROJECT_DOMAIN or APP_URL; skipping worker route provisioning"
    return
  fi

  base_host="$landing_host"
  if [[ -z "$base_host" ]]; then
    base_host="$app_host"
  fi

  script="${PROJECT_ID}-worker"
  local -a patterns=()
  patterns+=("${base_host}/*")

  if [[ -n "$app_host" && "$app_host" != "$base_host" ]]; then
    patterns+=("${app_host}/*")
  fi

  local -a unique_patterns=()
  for pattern in "${patterns[@]}"; do
    local exists=0
    if [[ ${#unique_patterns[@]} -gt 0 ]]; then
      for existing in "${unique_patterns[@]}"; do
        if [[ "$existing" == "$pattern" ]]; then
          exists=1
          break
        fi
      done
    fi
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
  if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    export CLOUDFLARE_ACCOUNT_ID
  fi

  [[ "$DRY_RUN" == "1" ]] && return

  if ! wrangler_cmd whoami >/dev/null 2>&1; then
    log_error "Wrangler is not authenticated. Run 'wrangler login' before executing bootstrap.sh."
    exit 1
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

  # Check if .env.local.generated has a D1_DATABASE_ID
  if [[ -f "$GENERATED_ENV_FILE" ]]; then
    local cached_id
    cached_id=$(grep -E '^D1_DATABASE_ID=' "$GENERATED_ENV_FILE" 2>/dev/null | cut -d= -f2)
    if [[ -n "$cached_id" && "$cached_id" != "null" ]]; then
      log_info "Found D1 database ID in .env.local.generated: $cached_id"
      # Verify it still exists remotely
      local list_json=""
      if ! list_json=$("${WRANGLER_BASE[@]}" d1 list --json 2>/dev/null); then
        list_json=""
      fi
      if [[ -n "$list_json" ]]; then
        local remote_exists
        remote_exists=$(jq -r --arg id "$cached_id" '.[] | select(.uuid==$id) | .uuid' <<<"$list_json")
        if [[ -n "$remote_exists" && "$remote_exists" != "null" ]]; then
          log_info "Verified D1 database $cached_id exists remotely"
          D1_DATABASE_ID="$cached_id"
          return
        else
          log_warn "Cached D1 database ID $cached_id not found remotely; falling back to name search"
        fi
      fi
    fi
  fi

  # Fallback: search by name
  local list_json=""
  if ! list_json=$("${WRANGLER_BASE[@]}" d1 list --json 2>/dev/null); then
    list_json=""
  fi
  if [[ -n "$list_json" ]]; then
    local existing
    existing=$(jq -r --arg name "$name" '.[] | select(.name==$name) | .uuid' <<<"$list_json")
    if [[ -n "$existing" && "$existing" != "null" ]]; then
      log_info "Found existing D1 database by name: $existing"
      D1_DATABASE_ID="$existing"
      return
    fi
  fi

  # Create new database
  log_info "Creating new D1 database '$name'"
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

  # Check if .env.local.generated has a R2_BUCKET_NAME
  if [[ -f "$GENERATED_ENV_FILE" ]]; then
    local cached_bucket
    cached_bucket=$(grep -E '^R2_BUCKET_NAME=' "$GENERATED_ENV_FILE" 2>/dev/null | cut -d= -f2)
    if [[ -n "$cached_bucket" && "$cached_bucket" != "null" ]]; then
      log_info "Found R2 bucket name in .env.local.generated: $cached_bucket"
      # Verify it still exists remotely
      local list_output=""
      if ! list_output=$("${WRANGLER_BASE[@]}" r2 bucket list 2>/dev/null); then
        list_output=""
      fi
      if [[ -n "$list_output" ]] && [[ "$list_output" == *"name:           $cached_bucket"* ]]; then
        log_info "Verified R2 bucket $cached_bucket exists remotely"
        R2_BUCKET_ID="$cached_bucket"
        R2_BUCKET_NAME="$cached_bucket"
        return
      else
        log_warn "Cached R2 bucket $cached_bucket not found remotely; falling back to configured name"
      fi
    fi
  fi

  # Search by configured bucket name
  local list_output=""
  if ! list_output=$("${WRANGLER_BASE[@]}" r2 bucket list 2>/dev/null); then
    list_output=""
  fi
  if [[ -n "$list_output" ]] && [[ "$list_output" == *"name:           $bucket"* ]]; then
    log_info "Found existing R2 bucket: $bucket"
    R2_BUCKET_ID="$bucket"
    return
  fi

  # Create new bucket
  log_info "Creating new R2 bucket '$bucket'"
  wrangler_cmd r2 bucket create "$bucket"
  R2_BUCKET_ID="$bucket"
}

update_wrangler_config() {
  local template="$ROOT_DIR/workers/api/wrangler.toml.template"
  local target="$ROOT_DIR/workers/api/wrangler.toml"
  if [[ ! -f "$template" ]]; then
    log_warn "wrangler.toml.template not found at $template; skipping templating"
    return
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would render workers/api/wrangler.toml from template"
    return
  fi
  log_info "Templating Wrangler config"
  local project_safe=$(escape_sed "$PROJECT_ID")
  local d1_safe=$(escape_sed "${D1_DATABASE_ID:-}")
  local d1_name_safe=$(escape_sed "${D1_DATABASE_NAME:-}")
  local bucket_safe=$(escape_sed "${R2_BUCKET_NAME:-}")
  local landing_safe=$(escape_sed "${PROJECT_DOMAIN:-}")
  local app_safe=$(escape_sed "${APP_URL:-}")
  local logto_issuer_safe=$(escape_sed "${LOGTO_ISSUER:-}")
  local logto_jwks_safe=$(escape_sed "${LOGTO_JWKS_URI:-}")
  local logto_resource_safe=$(escape_sed "${LOGTO_API_RESOURCE:-}")
  local logto_endpoint_safe=$(escape_sed "${LOGTO_ENDPOINT:-}")
  local logto_app_id_safe=$(escape_sed "${LOGTO_APPLICATION_ID:-}")
  local app_base_safe=$(escape_sed "${APP_BASE_URL:-}")
  local stripe_products_safe=$(escape_sed "${STRIPE_PRODUCTS:-[]}")
  local stripe_webhook_safe=$(escape_sed "${STRIPE_WEBHOOK_SECRET:-}")
  local cloudflare_zone_safe=$(escape_sed "${CLOUDFLARE_ZONE_ID:-}")
  local expo_logto_endpoint_safe=$(escape_sed "${EXPO_PUBLIC_LOGTO_ENDPOINT:-${LOGTO_ENDPOINT:-}}")
  local expo_logto_app_safe=$(escape_sed "${EXPO_PUBLIC_LOGTO_APP_ID:-${LOGTO_APPLICATION_ID:-}}")
  local expo_resource_safe=$(escape_sed "${EXPO_PUBLIC_API_RESOURCE:-${LOGTO_API_RESOURCE:-}}")
  local expo_logout_safe=$(escape_sed "${EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI:-}")
  local expo_worker_origin_safe=$(escape_sed "${EXPO_PUBLIC_WORKER_ORIGIN:-}")
  local tmp
  tmp=$(mktemp)
  sed \
    -e "s/{{PROJECT_ID}}/${project_safe}/g" \
    -e "s/{{D1_DATABASE_ID}}/${d1_safe}/g" \
    -e "s/{{D1_DATABASE_NAME}}/${d1_name_safe}/g" \
    -e "s/{{R2_BUCKET_NAME}}/${bucket_safe}/g" \
    -e "s#{{PROJECT_DOMAIN}}#${landing_safe}#g" \
    -e "s#{{APP_URL}}#${app_safe}#g" \
    -e "s#{{APP_BASE_URL}}#${app_base_safe}#g" \
    -e "s#{{LOGTO_ISSUER}}#${logto_issuer_safe}#g" \
    -e "s#{{LOGTO_JWKS_URI}}#${logto_jwks_safe}#g" \
    -e "s#{{LOGTO_API_RESOURCE}}#${logto_resource_safe}#g" \
    -e "s#{{LOGTO_ENDPOINT}}#${logto_endpoint_safe}#g" \
    -e "s#{{LOGTO_APPLICATION_ID}}#${logto_app_id_safe}#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_ENDPOINT}}#${expo_logto_endpoint_safe}#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_APP_ID}}#${expo_logto_app_safe}#g" \
    -e "s#{{EXPO_PUBLIC_API_RESOURCE}}#${expo_resource_safe}#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI}}#${expo_logout_safe}#g" \
    -e "s#{{STRIPE_PRODUCTS}}#${stripe_products_safe}#g" \
    -e "s#{{STRIPE_WEBHOOK_SECRET}}#${stripe_webhook_safe}#g" \
    -e "s#{{EXPO_PUBLIC_WORKER_ORIGIN}}#${expo_worker_origin_safe}#g" \
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
    log_info "[dry-run] Would reconcile Stripe products: $products_json"
    STRIPE_PRODUCT_IDS="[]"
    return
  fi
  log_info "Reconciling Stripe products"

  # Fetch existing products with metadata.project_id matching PROJECT_ID
  local existing_products
  existing_products=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/products?limit=100" \
    -u "$STRIPE_SECRET_KEY:" 2>&1 || echo '{"data":[]}')

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

    # Check if a product with this name and metadata.project_id already exists
    local existing_product_id
    existing_product_id=$(jq -r --arg project_id "$PROJECT_ID" --arg name "$name" \
      '.data[] | select(.metadata.project_id == $project_id and .name == $name) | .id // empty' \
      <<<"$existing_products" | head -1)

    local product_id price_id
    if [[ -n "$existing_product_id" ]]; then
      log_info "Found existing Stripe product '$name' (${existing_product_id})"
      product_id="$existing_product_id"

      # Fetch prices for this product
      local existing_prices
      existing_prices=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/prices?product=${product_id}&limit=100" \
        -u "$STRIPE_SECRET_KEY:" 2>&1 || echo '{"data":[]}')

      # Look for a matching price (amount, currency, interval)
      price_id=$(jq -r --argjson amount "$amount" --arg currency "$currency" --arg interval "$interval" \
        '.data[] | select(.unit_amount == $amount and .currency == $currency and .recurring.interval == $interval and .active == true) | .id // empty' \
        <<<"$existing_prices" | head -1)

      if [[ -n "$price_id" ]]; then
        log_info "Found existing matching price for '$name' (${price_id})"
      else
        log_info "No matching price found for '$name'; creating new price"
        local price_response
        price_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/prices \
          -u "$STRIPE_SECRET_KEY:" \
          -d unit_amount="$amount" \
          -d currency="$currency" \
          -d recurring[interval]="$interval" \
          -d product="$product_id")
        price_id=$(jq -r '.id // empty' <<<"$price_response")
      fi
    else
      # Create new product with metadata
      log_info "Creating new Stripe product '$name'"
      local product_response
      product_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/products \
        -u "$STRIPE_SECRET_KEY:" \
        -d name="$name" \
        -d metadata[project_id]="$PROJECT_ID")
      product_id=$(jq -r '.id // empty' <<<"$product_response")

      # Create price for new product
      local price_response
      price_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/prices \
        -u "$STRIPE_SECRET_KEY:" \
        -d unit_amount="$amount" \
        -d currency="$currency" \
        -d recurring[interval]="$interval" \
        -d product="$product_id")
      price_id=$(jq -r '.id // empty' <<<"$price_response")
    fi

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
  log_info "Running D1 migrations against remote database"
  (cd "$ROOT_DIR/workers/api" && node scripts/migrate.js --remote)

  log_info "Running D1 migrations against local preview database"
  (cd "$ROOT_DIR/workers/api" && node scripts/migrate.js)
}

get_d1_database_name() {
  local wrangler_toml="$ROOT_DIR/workers/api/wrangler.toml"
  if [[ -f "$wrangler_toml" ]]; then
    local db_name
    db_name=$(grep -E '^\s*database_name\s*=' "$wrangler_toml" | head -1 | sed -E 's/.*database_name\s*=\s*"([^"]+)".*/\1/')
    if [[ -n "$db_name" ]]; then
      echo "$db_name"
      return
    fi
  fi
  echo "${D1_DATABASE_NAME:-$PROJECT_ID-d1}"
}

seed_project() {
  local project_slug="$PROJECT_ID"
  local PROJECT_DOMAIN="${PROJECT_DOMAIN:-}"
  local app_url="${APP_URL:-}"
  local escaped_landing
  local escaped_app
  escaped_landing=$(printf "%s" "$PROJECT_DOMAIN" | sed "s/'/''/g")
  escaped_app=$(printf "%s" "$app_url" | sed "s/'/''/g")
  local db_name
  db_name=$(get_d1_database_name)
  local sql
  read -r -d '' sql <<SQL || true
INSERT INTO projects (id, slug, PROJECT_DOMAIN, app_url, created_at)
VALUES ('${PROJECT_ID}', '${project_slug}', '${escaped_landing}', '${escaped_app}', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, PROJECT_DOMAIN=excluded.PROJECT_DOMAIN, app_url=excluded.app_url;
SQL
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] ${WRANGLER_LABEL} d1 execute ${db_name} --command \"$sql\""
    return
  fi
  log_info "Seeding default project row into database '${db_name}' (remote)"
  "${WRANGLER_BASE[@]}" d1 execute "${db_name}" --remote --command "$sql" >/dev/null

  log_info "Seeding default project row into database '${db_name}' (local preview)"
  "${WRANGLER_BASE[@]}" d1 execute "${db_name}" --command "$sql" >/dev/null

  # Verify seed succeeded
  log_info "Verifying seed in remote database..."
  local verify_sql="SELECT COUNT(*) as count FROM projects WHERE id='${PROJECT_ID}';"
  local verify_result
  verify_result=$("${WRANGLER_BASE[@]}" d1 execute "${db_name}" --remote --json --command "$verify_sql" 2>/dev/null || echo '[]')
  local count
  count=$(jq -r '.[0].results[0].count // 0' <<<"$verify_result" 2>/dev/null || echo "0")
  if [[ "$count" -ge 1 ]]; then
    log_info "✅ Seed verification passed: found ${count} row(s) for project '${PROJECT_ID}'"
  else
    log_error "❌ Seed verification failed: no rows found for project '${PROJECT_ID}' in remote database"
    log_error "Verification result: $verify_result"
    exit 1
  fi
}

ensure_stripe_webhook() {
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set; skipping Stripe webhook provisioning"
    return
  fi

  local target_url
  target_url="${PROJECT_DOMAIN%/}/webhook/stripe"

  local cached_endpoint_id=""
  local cached_secret=""
  if [[ -f "$GENERATED_ENV_FILE" ]]; then
    cached_endpoint_id=$(grep -E '^STRIPE_WEBHOOK_ENDPOINT_ID=' "$GENERATED_ENV_FILE" 2>/dev/null | cut -d= -f2-)
    cached_secret=$(grep -E '^STRIPE_WEBHOOK_SECRET=' "$GENERATED_ENV_FILE" 2>/dev/null | cut -d= -f2-)
  fi

  if [[ -z "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" && -n "$cached_endpoint_id" ]]; then
    STRIPE_WEBHOOK_ENDPOINT_ID="$cached_endpoint_id"
  fi

  if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" && -n "$cached_secret" ]]; then
    STRIPE_WEBHOOK_SECRET="$cached_secret"
  fi

  if [[ -n "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" && -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
    log_info "Stripe webhook already configured (${STRIPE_WEBHOOK_ENDPOINT_ID}); skipping provisioning"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    STRIPE_WEBHOOK_ENDPOINT_ID="dry-run-webhook"
    STRIPE_WEBHOOK_SECRET="whsec_dry_run"
    log_info "[dry-run] Would reconcile Stripe webhook at $target_url"
    return
  fi

  log_info "Reconciling Stripe webhook endpoint for $target_url"

  create_new_endpoint() {
    log_info "Creating new Stripe webhook endpoint for $target_url"
    local response
    if ! response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/webhook_endpoints \
      -u "$STRIPE_SECRET_KEY:" \
      -d url="$target_url" \
      -d enabled_events[]="checkout.session.completed" \
      -d enabled_events[]="customer.subscription.created" \
      -d enabled_events[]="customer.subscription.updated" \
      -d enabled_events[]="invoice.payment_succeeded" \
      -d enabled_events[]="invoice.payment_failed"); then
      log_warn "Failed to create Stripe webhook endpoint: $response"
      return 1
    fi

    STRIPE_WEBHOOK_ENDPOINT_ID=$(jq -r '.id // empty' <<<"$response")
    STRIPE_WEBHOOK_SECRET=$(jq -r '.secret // empty' <<<"$response")

    if [[ -z "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" ]]; then
      log_warn "Stripe webhook creation response did not include an endpoint id: $response"
      return 1
    fi

    if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" || "${STRIPE_WEBHOOK_SECRET}" == "null" ]]; then
      log_warn "Stripe webhook creation response did not include a secret; manual intervention required."
      STRIPE_WEBHOOK_SECRET=""
    else
      log_info "Created Stripe webhook endpoint: $STRIPE_WEBHOOK_ENDPOINT_ID"
    fi

    return 0
  }

  # List all existing webhook endpoints
  local list_response
  if ! list_response=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/webhook_endpoints?limit=100" \
    -u "$STRIPE_SECRET_KEY:" 2>&1); then
    log_warn "Failed to list Stripe webhook endpoints: $list_response"
    return
  fi

  # Find all endpoints matching the target URL
  local matching_endpoints
  matching_endpoints=$(jq -r --arg url "$target_url" '.data[] | select(.url == $url) | .id' <<<"$list_response")

  local endpoint_count
  endpoint_count=$(echo "$matching_endpoints" | grep -c . || true)

  # Define expected events
  local expected_events=("checkout.session.completed" "customer.subscription.created" "customer.subscription.updated" "invoice.payment_succeeded" "invoice.payment_failed")

  if [[ "$endpoint_count" -eq 0 ]]; then
    log_info "No existing webhook endpoint found for $target_url; creating new endpoint"
    create_new_endpoint
    return
  fi

  local selected_id=""

  if [[ "$endpoint_count" -eq 1 ]]; then
    selected_id=$(echo "$matching_endpoints" | head -1)
    log_info "Found existing Stripe webhook endpoint: $selected_id"
  else
    if [[ "${STRIPE_PRUNE_DUPLICATE_WEBHOOKS:-0}" == "1" ]]; then
      log_info "Found $endpoint_count webhook endpoints for $target_url; pruning duplicates (STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1)"
      local kept_id=""
      while IFS= read -r endpoint_id; do
        [[ -z "$endpoint_id" ]] && continue
        if [[ -z "$kept_id" ]]; then
          kept_id="$endpoint_id"
          log_info "Keeping webhook endpoint: $kept_id"
        else
          log_info "Deleting duplicate webhook endpoint: $endpoint_id"
          run_cmd_capture curl -sS -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$endpoint_id" \
            -u "$STRIPE_SECRET_KEY:" >/dev/null
        fi
      done <<<"$matching_endpoints"
      selected_id="$kept_id"
    else
      selected_id=$(echo "$matching_endpoints" | head -1)
      log_warn "Found $endpoint_count webhook endpoints for $target_url; using first one ($selected_id). Set STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1 to clean up duplicates."
    fi
  fi

  if [[ -z "$selected_id" ]]; then
    log_warn "Unable to determine Stripe webhook endpoint to reuse; creating new endpoint"
    create_new_endpoint
    return
  fi

  local endpoint_response
  endpoint_response=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/webhook_endpoints/$selected_id" \
    -u "$STRIPE_SECRET_KEY:" 2>&1)

  STRIPE_WEBHOOK_ENDPOINT_ID="$selected_id"
  STRIPE_WEBHOOK_SECRET=$(jq -r '.secret // empty' <<<"$endpoint_response")

  if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" || "${STRIPE_WEBHOOK_SECRET}" == "null" ]]; then
    log_warn "Existing Stripe webhook endpoint $selected_id does not expose a secret; replacing it with a fresh endpoint"
    run_cmd_capture curl -sS -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$selected_id" \
      -u "$STRIPE_SECRET_KEY:" >/dev/null || true
    create_new_endpoint
    return
  fi

  local current_events
  current_events=$(jq -r '.enabled_events[]' <<<"$endpoint_response" | sort | tr '\n' ',' | sed 's/,$//')
  local expected_events_sorted
  expected_events_sorted=$(printf '%s\n' "${expected_events[@]}" | sort | tr '\n' ',' | sed 's/,$//')

  if [[ "$current_events" != "$expected_events_sorted" ]]; then
    log_info "Webhook events mismatch; updating endpoint $selected_id"
    run_cmd_capture curl -sS -X POST "https://api.stripe.com/v1/webhook_endpoints/$selected_id" \
      -u "$STRIPE_SECRET_KEY:" \
      -d enabled_events[]="checkout.session.completed" \
      -d enabled_events[]="customer.subscription.created" \
      -d enabled_events[]="customer.subscription.updated" \
      -d enabled_events[]="invoice.payment_succeeded" \
      -d enabled_events[]="invoice.payment_failed" >/dev/null
  else
    log_info "Webhook endpoint events already match; no update needed"
  fi
}


post_deploy_guidance() {
  logto_post_deploy_note
  stripe_post_deploy_note
}

logto_post_deploy_note() {
  local endpoint="${LOGTO_MANAGEMENT_ENDPOINT%/}"
  local callback="https://${PROJECT_ID}.justevery.com/callback"
  local logout="https://${PROJECT_ID}.justevery.com/logout"

  log_info "Logto follow-up: confirm the SPA application allows the following redirect URIs:"
  log_info "  - ${callback}"
  log_info "  - ${logout}"

  if [[ -n "${LOGTO_APPLICATION_ID:-}" ]]; then
    log_info "Application ID: ${LOGTO_APPLICATION_ID}"
  fi

  if [[ -n "$endpoint" ]]; then
    log_info "Manage the application at ${endpoint}/applications"
  else
    log_info "Manage the application via the Logto Console."
  fi
}

stripe_post_deploy_note() {
  local target_url="${PROJECT_DOMAIN%/}/webhook/stripe"

  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "Stripe follow-up: STRIPE_SECRET_KEY not provided; webhook secret could not be managed."
    return
  fi

  if [[ -z "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" || -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
    log_warn "Stripe follow-up: webhook endpoint for $target_url not created or secret unavailable (likely quota)."
    log_warn "Visit https://dashboard.stripe.com/${STRIPE_MODE:-test}/webhooks to delete old endpoints, then rerun bootstrap to capture a fresh secret."
  else
    log_info "Stripe follow-up: webhook endpoint ${STRIPE_WEBHOOK_ENDPOINT_ID} configured for $target_url."
    log_info "Secret stored in STRIPE_WEBHOOK_SECRET and synced to the Worker; rotate via dashboard when needed."
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

write_expo_env_file() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would write apps/web/.env.local"
    return
  fi

  local target="$ROOT_DIR/apps/web/.env.local"
  log_info "Writing Expo env file to ${target#$ROOT_DIR/}"
  {
    printf 'EXPO_PUBLIC_LOGTO_ENDPOINT=%s\n' "${EXPO_PUBLIC_LOGTO_ENDPOINT:-}"
    printf 'EXPO_PUBLIC_LOGTO_APP_ID=%s\n' "${EXPO_PUBLIC_LOGTO_APP_ID:-}"
    printf 'EXPO_PUBLIC_API_RESOURCE=%s\n' "${EXPO_PUBLIC_API_RESOURCE:-}"
    printf 'EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI=%s\n' "${EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI:-}"
    printf 'EXPO_PUBLIC_WORKER_ORIGIN=%s\n' "${EXPO_PUBLIC_WORKER_ORIGIN:-}"
  } >"$target"
}

export_expo_runtime_vars() {
  if [[ -z "${EXPO_PUBLIC_LOGTO_ENDPOINT:-}" && -n "${LOGTO_ENDPOINT:-}" ]]; then
    EXPO_PUBLIC_LOGTO_ENDPOINT="$LOGTO_ENDPOINT"
    log_info "Using LOGTO_ENDPOINT for EXPO_PUBLIC_LOGTO_ENDPOINT"
  fi
  [[ -n "${EXPO_PUBLIC_LOGTO_ENDPOINT:-}" ]] && export EXPO_PUBLIC_LOGTO_ENDPOINT

  if [[ -z "${EXPO_PUBLIC_LOGTO_APP_ID:-}" && -n "${LOGTO_APPLICATION_ID:-}" ]]; then
    EXPO_PUBLIC_LOGTO_APP_ID="$LOGTO_APPLICATION_ID"
    log_info "Using LOGTO_APPLICATION_ID for EXPO_PUBLIC_LOGTO_APP_ID"
  fi
  [[ -n "${EXPO_PUBLIC_LOGTO_APP_ID:-}" ]] && export EXPO_PUBLIC_LOGTO_APP_ID

  if [[ -z "${EXPO_PUBLIC_API_RESOURCE:-}" && -n "${LOGTO_API_RESOURCE:-}" ]]; then
    EXPO_PUBLIC_API_RESOURCE="$LOGTO_API_RESOURCE"
    log_info "Using LOGTO_API_RESOURCE for EXPO_PUBLIC_API_RESOURCE"
  fi
  [[ -n "${EXPO_PUBLIC_API_RESOURCE:-}" ]] && export EXPO_PUBLIC_API_RESOURCE

  if [[ -z "${EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI:-}" ]]; then
    EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI="https://${PROJECT_ID}.justevery.com"
    log_info "Defaulting EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI to ${EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI}"
  fi
  export EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI

  if [[ -z "${EXPO_PUBLIC_WORKER_ORIGIN:-}" ]]; then
    local resolved_origin=""
    if [[ -n "${WORKER_ORIGIN:-}" ]]; then
      resolved_origin="$WORKER_ORIGIN"
    elif [[ -n "${APP_URL:-}" ]]; then
      resolved_origin="$(extract_origin "$APP_URL")"
    elif [[ -n "${PROJECT_DOMAIN:-}" ]]; then
      resolved_origin="$(extract_origin "$PROJECT_DOMAIN")"
    fi

    if [[ -n "$resolved_origin" ]]; then
      EXPO_PUBLIC_WORKER_ORIGIN="$resolved_origin"
      export EXPO_PUBLIC_WORKER_ORIGIN
      log_info "Resolved EXPO_PUBLIC_WORKER_ORIGIN to $EXPO_PUBLIC_WORKER_ORIGIN"
    else
      log_warn "Unable to derive EXPO_PUBLIC_WORKER_ORIGIN; worker calls from the web app will fail"
    fi
  else
    export EXPO_PUBLIC_WORKER_ORIGIN
  fi

}

build_web_bundle() {
  if [[ "${BUILD_WEB_BUNDLE:-1}" != "1" ]]; then
    log_info "Skipping Expo web bundle build (BUILD_WEB_BUNDLE=${BUILD_WEB_BUNDLE:-0})"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] pnpm --filter @justevery/web build"
    return
  fi

  log_info "Building Expo web bundle"

  export_expo_runtime_vars
  write_expo_env_file

  if command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT_DIR/apps/web" && run_cmd pnpm build)
    return
  fi

  if command -v npm >/dev/null 2>&1; then
    (cd "$ROOT_DIR/apps/web" && run_cmd npm run build)
    return
  fi

  log_warn "Neither pnpm nor npm available; skipping Expo web bundle build"
}

deploy_worker() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would deploy Worker via ${WRANGLER_LABEL} deploy"
    return
  fi
  log_info "Deploying Worker via ${WRANGLER_LABEL} deploy"
  wrangler_cmd deploy
}

write_generated_env() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log_info "[dry-run] Would write $GENERATED_ENV_FILE"
    return
  fi
  log_info "Writing $GENERATED_ENV_FILE"
  local secret_names=""
  if [[ ${#SYNCED_SECRET_NAMES[@]} -gt 0 ]]; then
    secret_names=$(printf '%s\n' "${SYNCED_SECRET_NAMES[@]}" | awk '!seen[$0]++' | paste -sd',' -)
  fi
  {
    printf '# Autogenerated by bootstrap.sh on %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '# Do not edit manually – rerun bootstrap.sh instead.\n\n'
    printf 'PROJECT_ID=%s\n' "${PROJECT_ID:-}"
    printf 'PROJECT_DOMAIN=%s\n' "${PROJECT_DOMAIN:-}"
    printf 'APP_URL=%s\n' "${APP_URL:-}"
    printf 'APP_BASE_URL=%s\n' "${APP_BASE_URL:-}"
    printf 'LOGTO_ENDPOINT=%s\n' "${LOGTO_ENDPOINT:-}"
    printf 'LOGTO_APPLICATION_ID=%s\n' "${LOGTO_APPLICATION_ID:-}"
    printf 'LOGTO_ISSUER=%s\n' "${LOGTO_ISSUER:-}"
    printf 'LOGTO_JWKS_URI=%s\n' "${LOGTO_JWKS_URI:-}"
    printf 'LOGTO_API_RESOURCE=%s\n' "${LOGTO_API_RESOURCE:-}"
    printf 'EXPO_PUBLIC_LOGTO_ENDPOINT=%s\n' "${EXPO_PUBLIC_LOGTO_ENDPOINT:-}"
    printf 'EXPO_PUBLIC_LOGTO_APP_ID=%s\n' "${EXPO_PUBLIC_LOGTO_APP_ID:-}"
    printf 'EXPO_PUBLIC_API_RESOURCE=%s\n' "${EXPO_PUBLIC_API_RESOURCE:-}"
    printf 'EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI=%s\n' "${EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI:-}"
    printf 'EXPO_PUBLIC_WORKER_ORIGIN=%s\n' "${EXPO_PUBLIC_WORKER_ORIGIN:-}"
    printf 'D1_DATABASE_NAME=%s\n' "${D1_DATABASE_NAME:-}"
    printf 'D1_DATABASE_ID=%s\n' "${D1_DATABASE_ID:-}"
    printf 'R2_BUCKET_NAME=%s\n' "${R2_BUCKET_NAME:-}"
    printf 'CLOUDFLARE_ZONE_ID=%s\n' "${CLOUDFLARE_ZONE_ID:-}"
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

  load_env_file "$HOME/.env"
  load_env_file "$ROOT_DIR/.env"
  load_env_file "$ROOT_DIR/.env.local.generated"
  set +a

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

  resolve_stripe_secret
  prepare_cloudflare_env
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
  write_generated_env
  deploy_worker

  # Post-deploy guidance for follow-up steps that still require manual input
  post_deploy_guidance

  log_info "Bootstrap complete"
  log_info "Review $GENERATED_ENV_FILE for generated identifiers."
}

main "$@"
