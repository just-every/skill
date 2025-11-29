#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

CONFIG_WORKSPACE="workers/api"
ENV_FILE=".env.generated"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run \`pnpm bootstrap:env\` first." >&2
  exit 1
fi

if [ "${JE_LOCAL_URLS:-0}" = "1" ]; then
  # Pick a free port starting at 9788 to avoid collisions when multiple dev runs are active
  find_port() {
    local start="$1"
    local port="$start"
    while lsof -i tcp:"$port" >/dev/null 2>&1; do
      port=$((port + 1))
    done
    echo "$port"
  }

  DEFAULT_WORKER_PORT=$(find_port "${JE_LOCAL_WORKER_PORT:-9788}")
  LOCAL_WORKER_ORIGIN="${JE_LOCAL_WORKER_ORIGIN:-http://127.0.0.1:${DEFAULT_WORKER_PORT}}"
  LOCAL_LOGIN_ORIGIN="${JE_LOCAL_LOGIN_ORIGIN:-http://127.0.0.1:9787}"
  LOCAL_APP_URL="${JE_LOCAL_APP_URL:-http://127.0.0.1:19006}"

  LOCAL_WORKER_ORIGIN="$LOCAL_WORKER_ORIGIN" \
  LOCAL_LOGIN_ORIGIN="$LOCAL_LOGIN_ORIGIN" \
  LOCAL_APP_URL="$LOCAL_APP_URL" \
  LOCAL_BETTER_AUTH_URL="${JE_LOCAL_BETTER_AUTH_URL:-}" \
  LOCAL_SESSION_ENDPOINT="${JE_LOCAL_SESSION_ENDPOINT:-}" \
  LOCAL_COOKIE_DOMAIN="${JE_LOCAL_COOKIE_DOMAIN:-}" \
  node ./scripts/prepare-local-env.mjs

  ENV_FILE=".env.local"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run \`npm run dev:local\` to generate local overrides." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Force-enable code-bridge in dev for worker instrumentation
export CODE_BRIDGE=1
export DEV_SESSION_TOKEN=${DEV_SESSION_TOKEN:-devtoken}

exec npm run dev --workspace "$CONFIG_WORKSPACE" "$@"
