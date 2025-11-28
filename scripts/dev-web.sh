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

if [ -z "${EXPO_PUBLIC_CODE_BRIDGE_URL:-}" ] || [ -z "${EXPO_PUBLIC_CODE_BRIDGE_SECRET:-}" ]; then
  CODE_BRIDGE_META=".code/code-bridge.json"
  if command -v jq >/dev/null 2>&1; then
    if [ -f "$CODE_BRIDGE_META" ]; then
      CODE_BRIDGE_URL=$(jq -r '.url // empty' "$CODE_BRIDGE_META")
      CODE_BRIDGE_SECRET=$(jq -r '.secret // empty' "$CODE_BRIDGE_META")

      if [ -n "$CODE_BRIDGE_URL" ] && [ -n "$CODE_BRIDGE_SECRET" ]; then
        export EXPO_PUBLIC_CODE_BRIDGE_URL="$CODE_BRIDGE_URL"
        export EXPO_PUBLIC_CODE_BRIDGE_SECRET="$CODE_BRIDGE_SECRET"
        export EXPO_PUBLIC_CODE_BRIDGE_PROJECT_ID="apps-web"
        echo "[dev-web] code-bridge enabled -> $CODE_BRIDGE_URL"
      else
        echo "[dev-web] code-bridge metadata found but missing url/secret; skipping" >&2
      fi
    else
      echo "[dev-web] code-bridge metadata not found (.code/code-bridge.json); bridge disabled" >&2
    fi
  else
    echo "[dev-web] jq not available; cannot load code-bridge metadata" >&2
  fi
else
  echo "[dev-web] code-bridge env already set; leaving as-is"
fi

exec npm run dev --workspace apps/web "$@"
