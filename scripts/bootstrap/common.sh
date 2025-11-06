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

format_env_value() {
  local value=$1
  printf '%q' "$value"
}

print_env_line() {
  local key=$1
  local value=${2-}

  if [[ -z "$value" ]]; then
    printf '%s=\n' "$key"
    return
  fi

  printf '%s=%s\n' "$key" "$(format_env_value "$value")"
}

ensure_var() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    log_error "Environment variable '$name' must be set before running bootstrap."
    exit 1
  fi
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[&/]/\\&/g' -e 's/"/\\"/g'
}

run_cmd() {
  "$@"
}

run_cmd_capture() {
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

extract_host_from_url() {
  local url=${1:-}
  [[ -z "$url" ]] && return

  local without_scheme
  if [[ "$url" == *://* ]]; then
    without_scheme=${url#*://}
  else
    without_scheme=$url
  fi

  without_scheme=${without_scheme%%/*}
  without_scheme=${without_scheme%%:*}

  printf '%s' "$without_scheme"
}

prepare_cloudflare_env() {
  if [[ -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    export CLOUDFLARE_ZONE_ID
  else
    log_warn "CLOUDFLARE_ZONE_ID not set; Wrangler will infer the zone from custom domains."
  fi
}
