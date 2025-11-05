# shellcheck shell=bash

write_expo_env_file() {
  log_info "Expo env vars are read from the current shell/.env.local.generated; skipping apps/web/.env.local"
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

  if [[ -z "${EXPO_PUBLIC_LOGTO_REDIRECT_URI:-}" ]]; then
    EXPO_PUBLIC_LOGTO_REDIRECT_URI="justevery://callback"
    log_info "Defaulting EXPO_PUBLIC_LOGTO_REDIRECT_URI to ${EXPO_PUBLIC_LOGTO_REDIRECT_URI}"
  fi
  export EXPO_PUBLIC_LOGTO_REDIRECT_URI

  if [[ -z "${EXPO_PUBLIC_LOGTO_SCOPES:-}" ]]; then
    EXPO_PUBLIC_LOGTO_SCOPES="openid profile email"
    log_info "Defaulting EXPO_PUBLIC_LOGTO_SCOPES to '${EXPO_PUBLIC_LOGTO_SCOPES}'"
  fi
  export EXPO_PUBLIC_LOGTO_SCOPES

  if [[ -z "${EXPO_PUBLIC_LOGTO_RESOURCES:-}" && -n "${EXPO_PUBLIC_API_RESOURCE:-}" ]]; then
    EXPO_PUBLIC_LOGTO_RESOURCES="$EXPO_PUBLIC_API_RESOURCE"
    log_info "Defaulting EXPO_PUBLIC_LOGTO_RESOURCES to ${EXPO_PUBLIC_LOGTO_RESOURCES}"
  fi
  [[ -n "${EXPO_PUBLIC_LOGTO_RESOURCES:-}" ]] && export EXPO_PUBLIC_LOGTO_RESOURCES

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

  if is_dry_run; then
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
