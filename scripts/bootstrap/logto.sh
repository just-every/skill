# shellcheck shell=bash

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

  if is_dry_run; then
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

  jq -nc \
    --arg name "$display_name" \
    --arg desc "$description" \
    --arg redirect "$redirect_uri" \
    --arg logout "$logout_uri" \
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

  local expected_payload existing_response
  expected_payload=$(build_logto_application_payload "$display_name" 0 "$description" "$redirect_uri" "$logout_uri")

  if ! existing_response=$(run_cmd_capture curl -sS --fail-with-body -X GET \
    -H "Authorization: Bearer ${LOGTO_MANAGEMENT_TOKEN}" \
    "${apps_url}/${app_id}"); then
    log_warn "Failed to fetch Logto application ${app_id}; will attempt to recreate"
    return 1
  fi

  local patch_required=0
  local current_name current_description has_redirect has_logout always_issue rotate_refresh
  current_name=$(jq -r '.name // empty' <<<"$existing_response" 2>/dev/null || true)
  [[ "$current_name" != "$display_name" ]] && patch_required=1

  current_description=$(jq -r '.description // empty' <<<"$existing_response" 2>/dev/null || true)
  [[ "$current_description" != "$description" ]] && patch_required=1

  has_redirect=$(jq --arg redirect "$redirect_uri" '.oidcClientMetadata.redirectUris // [] | index($redirect)' <<<"$existing_response" 2>/dev/null || echo "null")
  [[ "$has_redirect" == "null" ]] && patch_required=1

  has_logout=$(jq --arg logout "$logout_uri" '.oidcClientMetadata.postLogoutRedirectUris // [] | index($logout)' <<<"$existing_response" 2>/dev/null || echo "null")
  [[ "$has_logout" == "null" ]] && patch_required=1

  always_issue=$(jq -r '.customClientMetadata.alwaysIssueRefreshToken // empty' <<<"$existing_response" 2>/dev/null || true)
  [[ "$always_issue" != "true" ]] && patch_required=1

  rotate_refresh=$(jq -r '.customClientMetadata.rotateRefreshToken // empty' <<<"$existing_response" 2>/dev/null || true)
  [[ "$rotate_refresh" != "true" ]] && patch_required=1

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

  if is_dry_run; then
    LOGTO_APPLICATION_ID="dry-run-logto-app"
    export LOGTO_APPLICATION_ID
    log_info "[dry-run] Would ensure Logto application ${display_name}"
    return
  fi

  if [[ -n "${LOGTO_APPLICATION_ID:-}" ]]; then
    if reconcile_logto_application_metadata "$LOGTO_APPLICATION_ID" "$apps_url" "$display_name" "$description" "$redirect_uri" "$logout_uri"; then
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
  local search_names=()
  search_names+=("$display_name")
  [[ "$display_name" != "$PROJECT_ID" ]] && search_names+=("$PROJECT_ID")

  for candidate_name in "${search_names[@]}"; do
    [[ -z "$candidate_name" ]] && continue
    existing_id=$(jq -r --arg name "$candidate_name" '((.items // []) + (.data // [])) | map(select(.name == $name) | .id) | .[0] // empty' <<<"$list_response" 2>/dev/null || true)
    [[ -n "$existing_id" ]] && break
  done

  if [[ -n "$existing_id" ]]; then
    LOGTO_APPLICATION_ID="$existing_id"
    export LOGTO_APPLICATION_ID
    log_info "Found existing Logto application ${display_name} (${existing_id})"
    reconcile_logto_application_metadata "$existing_id" "$apps_url" "$display_name" "$description" "$redirect_uri" "$logout_uri" || true
    return
  fi

  log_info "Creating Logto application ${display_name}"
  local payload
  payload=$(build_logto_application_payload "$display_name" 1 "$description" "$redirect_uri" "$logout_uri")

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
