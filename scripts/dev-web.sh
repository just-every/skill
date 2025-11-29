#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE=".env.generated"

if [ "${JE_LOCAL_URLS:-0}" = "1" ]; then
  if [ ! -f ".env.generated" ]; then
    echo "Missing .env.generated. Run \`pnpm bootstrap:env\` first." >&2
    exit 1
  fi

  node ./scripts/prepare-local-env.mjs
  ENV_FILE=".env.local"
else
  if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE. Run \`pnpm bootstrap:env\` first." >&2
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

ensure_code_bridge() {
  # If env is already configured, leave it alone (useful for CI/remote hosts)
  if [ -n "${EXPO_PUBLIC_CODE_BRIDGE_URL:-}" ] && [ -n "${EXPO_PUBLIC_CODE_BRIDGE_SECRET:-}" ]; then
    echo "[dev-web] code-bridge env already set; leaving as-is"
    return
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo "[dev-web] jq not available; cannot load code-bridge metadata" >&2
    return
  fi

  mkdir -p .code

  local meta_file=".code/code-bridge.json"
  local lock_file=".code/code-bridge.lock"
  local log_file=".code/code-bridge-host.log"
  local host_bin="$PROJECT_ROOT/node_modules/.bin/code-bridge-host"

  local need_host=0
  local current_pid=""

  if [ -f "$lock_file" ]; then
    current_pid=$(jq -r '.pid // empty' "$lock_file" 2>/dev/null || true)
    if [ -z "$current_pid" ] || ! kill -0 "$current_pid" 2>/dev/null; then
      need_host=1
      rm -f "$lock_file"
    fi
  else
    need_host=1
  fi

  if [ ! -f "$meta_file" ]; then
    need_host=1
  fi

  if [ "$need_host" -eq 1 ]; then
    echo "[dev-web] starting code-bridge-host..."
    if [ -x "$host_bin" ]; then
      "$host_bin" "$PROJECT_ROOT" >>"$log_file" 2>&1 &
    else
      npx code-bridge-host "$PROJECT_ROOT" >>"$log_file" 2>&1 &
    fi
  fi

  # Wait briefly for metadata to show up (host writes it on boot)
  for _ in $(seq 1 50); do
    if [ -f "$meta_file" ] && jq -e '.url and .secret' "$meta_file" >/dev/null 2>&1; then
      if [ -f "$lock_file" ]; then
        current_pid=$(jq -r '.pid // empty' "$lock_file" 2>/dev/null || true)
      fi

      if [ -n "$current_pid" ] && ! kill -0 "$current_pid" 2>/dev/null; then
        sleep 0.1
        continue
      fi

      CODE_BRIDGE_URL=$(jq -r '.url' "$meta_file")
      CODE_BRIDGE_SECRET=$(jq -r '.secret' "$meta_file")
      if [ -n "$CODE_BRIDGE_URL" ] && [ -n "$CODE_BRIDGE_SECRET" ]; then
        export EXPO_PUBLIC_CODE_BRIDGE_URL="$CODE_BRIDGE_URL"
        export EXPO_PUBLIC_CODE_BRIDGE_SECRET="$CODE_BRIDGE_SECRET"
        export EXPO_PUBLIC_CODE_BRIDGE_PROJECT_ID="apps-web"
        echo "[dev-web] code-bridge enabled -> $CODE_BRIDGE_URL (pid=${current_pid:-unknown})"
        return
      fi
    fi
    sleep 0.1
  done

  echo "[dev-web] code-bridge metadata not found or incomplete (.code/code-bridge.json); bridge disabled" >&2
}

ensure_code_bridge

# Force-enable bridge in dev (web)
export CODE_BRIDGE=1
# Dev auth bypass token (used by API and SPA to set cookie)
export DEV_SESSION_TOKEN=${DEV_SESSION_TOKEN:-devtoken}
export EXPO_PUBLIC_DEV_SESSION_TOKEN="$DEV_SESSION_TOKEN"

exec npm run dev --workspace apps/web "$@"
