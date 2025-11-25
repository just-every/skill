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

exec npm run dev --workspace apps/web "$@"
