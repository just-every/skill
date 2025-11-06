# shellcheck shell=bash

WRANGLER_BIN=()
WRANGLER_BASE=()
WRANGLER_LABEL="wrangler"

detect_wrangler() {
  if [[ -x "$ROOT_DIR/node_modules/.bin/wrangler" ]]; then
    WRANGLER_BIN=("$ROOT_DIR/node_modules/.bin/wrangler")
  elif command -v wrangler >/dev/null 2>&1; then
    WRANGLER_BIN=("wrangler")
  elif command -v npx >/dev/null 2>&1; then
    WRANGLER_BIN=("npx" "--yes" "wrangler")
  else
    log_error "Wrangler CLI not found. Install it via 'npm install --workspace workers/api'."
    exit 1
  fi

  WRANGLER_LABEL="${WRANGLER_BIN[*]}"
  WRANGLER_BASE=("${WRANGLER_BIN[@]}" "--config" "$ROOT_DIR/workers/api/wrangler.toml")
}

wrangler_cmd() {
  run_cmd "${WRANGLER_BASE[@]}" "$@"
}

ensure_cloudflare_auth() {
  if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    export CLOUDFLARE_ACCOUNT_ID
  fi

  if ! wrangler_cmd whoami >/dev/null 2>&1; then
    log_error "Wrangler is not authenticated. Run 'wrangler login' before executing bootstrap.sh."
    exit 1
  fi
}

wrangler_d1_list() {
  local output
  output=$("${WRANGLER_BASE[@]}" d1 list --json 2>/dev/null || echo '[]')
  printf '%s' "$output"
}

ensure_d1() {
  local name=${CLOUDFLARE_D1_NAME:-"${PROJECT_ID}-d1"}
  D1_DATABASE_NAME="$name"
  log_info "Ensuring D1 database '$name' exists"

  local list_json existing
  list_json=$(wrangler_d1_list)
  existing=$(jq -r --arg name "$name" '.[] | select(.name==$name) | .uuid' <<<"$list_json" 2>/dev/null || echo "")

  if [[ -n "$existing" ]]; then
    log_info "Found existing D1 database by name: $existing"
    D1_DATABASE_ID="$existing"
    return
  fi

  log_info "Creating new D1 database '$name'"
  wrangler_cmd d1 create "$name" >/dev/null

  list_json=$(wrangler_d1_list)
  D1_DATABASE_ID=$(jq -r --arg name "$name" '.[] | select(.name==$name) | .uuid' <<<"$list_json" 2>/dev/null || echo "")
  if [[ -z "${D1_DATABASE_ID:-}" ]]; then
    log_warn "Unable to fetch D1 database id after creation; leaving D1_DATABASE_ID unset"
  else
    log_info "Created D1 database with id ${D1_DATABASE_ID}"
  fi
}

ensure_r2() {
  local bucket=${CLOUDFLARE_R2_BUCKET:-"${PROJECT_ID}-assets"}
  R2_BUCKET_NAME="$bucket"
  log_info "Ensuring R2 bucket '$bucket' exists"

  local list_output
  list_output=$("${WRANGLER_BASE[@]}" r2 bucket list 2>/dev/null || echo '')

  if [[ -n "$bucket" && "$list_output" == *"name:           $bucket"* ]]; then
    log_info "Found existing R2 bucket: $bucket"
    R2_BUCKET_ID="$bucket"
    return
  fi

  log_info "Creating new R2 bucket '$bucket'"
  wrangler_cmd r2 bucket create "$bucket"
  R2_BUCKET_ID="$bucket"
}

update_wrangler_config() {
  local template="$ROOT_DIR/workers/api/wrangler.toml.template"
  local target="$ROOT_DIR/workers/api/wrangler.toml"
  if [[ ! -f "$template" ]]; then
    log_warn "wrangler.toml.template not found at ${template#$ROOT_DIR/}; skipping templating"
    return
  fi

  log_info "Templating Wrangler config"
  local tmp
  tmp=$(mktemp)
  sed \
    -e "s/{{PROJECT_ID}}/$(escape_sed "$PROJECT_ID")/g" \
    -e "s/{{D1_DATABASE_ID}}/$(escape_sed "${D1_DATABASE_ID:-}")/g" \
    -e "s/{{D1_DATABASE_NAME}}/$(escape_sed "${D1_DATABASE_NAME:-}")/g" \
    -e "s/{{R2_BUCKET_NAME}}/$(escape_sed "${R2_BUCKET_NAME:-}")/g" \
    -e "s#{{PROJECT_DOMAIN}}#$(escape_sed "${PROJECT_DOMAIN:-}")#g" \
    -e "s#{{PROJECT_HOST}}#$(escape_sed "${PROJECT_HOST:-}")#g" \
    -e "s#{{APP_URL}}#$(escape_sed "${APP_URL:-}")#g" \
    -e "s#{{APP_BASE_URL}}#$(escape_sed "${APP_BASE_URL:-}")#g" \
    -e "s#{{LOGTO_ISSUER}}#$(escape_sed "${LOGTO_ISSUER:-}")#g" \
    -e "s#{{LOGTO_JWKS_URI}}#$(escape_sed "${LOGTO_JWKS_URI:-}")#g" \
    -e "s#{{LOGTO_API_RESOURCE}}#$(escape_sed "${LOGTO_API_RESOURCE:-}")#g" \
    -e "s#{{LOGTO_ENDPOINT}}#$(escape_sed "${LOGTO_ENDPOINT:-}")#g" \
    -e "s#{{LOGTO_APPLICATION_ID}}#$(escape_sed "${LOGTO_APPLICATION_ID:-}")#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_ENDPOINT}}#$(escape_sed "${EXPO_PUBLIC_LOGTO_ENDPOINT:-${LOGTO_ENDPOINT:-}}")#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_APP_ID}}#$(escape_sed "${EXPO_PUBLIC_LOGTO_APP_ID:-${LOGTO_APPLICATION_ID:-}}")#g" \
    -e "s#{{EXPO_PUBLIC_API_RESOURCE}}#$(escape_sed "${EXPO_PUBLIC_API_RESOURCE:-${LOGTO_API_RESOURCE:-}}")#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI}}#$(escape_sed "${EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI:-}")#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_REDIRECT_URI}}#$(escape_sed "${EXPO_PUBLIC_LOGTO_REDIRECT_URI:-}")#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL}}#$(escape_sed "${EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL:-}")#g" \
    -e "s#{{EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD}}#$(escape_sed "${EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD:-}")#g" \
    -e "s#{{STRIPE_PRODUCTS}}#$(escape_sed "${STRIPE_PRODUCTS:-[]}")#g" \
    -e "s#{{STRIPE_WEBHOOK_SECRET}}#$(escape_sed "${STRIPE_WEBHOOK_SECRET:-}")#g" \
    -e "s#{{EXPO_PUBLIC_WORKER_ORIGIN}}#$(escape_sed "${EXPO_PUBLIC_WORKER_ORIGIN:-}")#g" \
    -e "s#{{EXPO_PUBLIC_WORKER_ORIGIN_LOCAL}}#$(escape_sed "${EXPO_PUBLIC_WORKER_ORIGIN_LOCAL:-}")#g" \
    -e "s#{{CLOUDFLARE_ZONE_ID}}#$(escape_sed "${CLOUDFLARE_ZONE_ID:-}")#g" \
    "$template" > "$tmp"
  if [[ -f "$target" ]]; then
    cp "$target" "$target.backup"
  fi
  mv "$tmp" "$target"
}

run_migrations() {
  if [[ "${BOOTSTRAP_DEPLOY:-0}" == "1" ]]; then
    log_info "Running D1 migrations against remote database"
    (cd "$ROOT_DIR/workers/api" && node scripts/migrate.js --remote)
  else
    log_info "Skipping remote D1 migrations (local mode)"
  fi

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
  local domain="${PROJECT_DOMAIN:-}"
  local app_url="${APP_URL:-}"
  local escaped_landing
  local escaped_app
  escaped_landing=$(printf "%s" "$domain" | sed "s/'/''/g")
  escaped_app=$(printf "%s" "$app_url" | sed "s/'/''/g")
  local db_name
  db_name=$(get_d1_database_name)
  local sql
  read -r -d '' sql <<SQL || true
INSERT INTO projects (id, slug, domain, app_url, created_at)
VALUES ('${PROJECT_ID}', '${project_slug}', '${escaped_landing}', '${escaped_app}', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, domain=excluded.domain, app_url=excluded.app_url;
SQL
  if [[ "${BOOTSTRAP_DEPLOY:-0}" == "1" ]]; then
    log_info "Seeding default project row into database '${db_name}' (remote)"
    "${WRANGLER_BASE[@]}" d1 execute "${db_name}" --remote --command "$sql" >/dev/null
  else
    log_info "Skipping remote project seed (local mode)"
  fi

  log_info "Seeding default project row into database '${db_name}' (local preview)"
  "${WRANGLER_BASE[@]}" d1 execute "${db_name}" --command "$sql" >/dev/null

  if [[ "${BOOTSTRAP_DEPLOY:-0}" == "1" ]]; then
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
  fi
}

upload_r2_placeholder() {
  local object_key="welcome.txt"
  log_info "Uploading placeholder asset to R2"
  local tmp_file
  tmp_file=$(mktemp)
  printf 'Welcome to %s!\n' "$PROJECT_ID" >"$tmp_file"
  wrangler_cmd r2 object put "${R2_BUCKET_NAME:-$PROJECT_ID-assets}/$object_key" --file "$tmp_file"
  rm -f "$tmp_file"
}
