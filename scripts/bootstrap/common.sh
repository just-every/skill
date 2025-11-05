# shellcheck shell=bash

GREEN="$(tput setaf 2 2>/dev/null || true)"
YELLOW="$(tput setaf 3 2>/dev/null || true)"
RED="$(tput setaf 1 2>/dev/null || true)"
RESET="$(tput sgr0 2>/dev/null || true)"

log_info() {
  echo "${GREEN}[info]${RESET} $*"
}

log_warn() {
  echo "${YELLOW}[warn]${RESET} $*"
}

log_error() {
  echo "${RED}[error]${RESET} $*" >&2
}

is_dry_run() {
  [[ "${DRY_RUN:-0}" == "1" ]]
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
    log_info "Loading env vars from ${file#$ROOT_DIR/}"
    # shellcheck disable=SC1090
    set -a
    source "$file"
    set +a
  fi
}

ensure_var() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    if is_dry_run; then
      local placeholder="dry-run-$(to_lower "$name")"
      log_warn "Environment variable '$name' missing; using placeholder '$placeholder' (dry-run)."
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
  if is_dry_run; then
    log_info "[dry-run] $*"
    return 0
  fi
  "$@"
}

run_cmd_capture() {
  if is_dry_run; then
    log_info "[dry-run] $*"
    echo "{}"
    return 0
  fi
  "$@"
}

read_generated_value() {
  local key=$1
  [[ -f "$GENERATED_ENV_FILE" ]] || return 0
  grep -E "^${key}=" "$GENERATED_ENV_FILE" 2>/dev/null | cut -d= -f2-
}

extract_origin() {
  local url=$1
  [[ -z "$url" ]] && return
  if [[ "$url" =~ ^https?://[^/]+ ]]; then
    printf '%s' "${BASH_REMATCH[0]}"
    return
  fi
  printf '%s' "$url"
}

prepare_cloudflare_env() {
  if [[ -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    export CLOUDFLARE_ZONE_ID
  else
    log_warn "CLOUDFLARE_ZONE_ID not set; Wrangler will infer the zone from custom domains."
  fi
}
