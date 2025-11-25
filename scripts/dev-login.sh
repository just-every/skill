#!/bin/bash
set -euo pipefail

# Unified local login dev script: starts worker (local URLs) + Expo (iOS/Android) with env from prepare-local-env.

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

TARGET_PLATFORM="${1:-ios}" # ios|android
shift || true
# Capture any extra Expo CLI args; "[@]-" guard prevents set -u from treating an empty
# array as unbound when later expanded.
EXPO_ARGS=("$@")

if [ "$TARGET_PLATFORM" != "ios" ] && [ "$TARGET_PLATFORM" != "android" ]; then
  echo "Usage: bash scripts/dev-login.sh [ios|android] [expo-args...]" >&2
  exit 1
fi

if [ ! -f .env.generated ]; then
  echo "Missing .env.generated. Run \`pnpm bootstrap:env\` first." >&2
  exit 1
fi

# Prepare .env.local + workers/api/.dev.vars with local URLs
JE_LOCAL_URLS=1 node ./scripts/prepare-local-env.mjs

# Export env for current shell
set -a
source ./.env.local
set +a

# Default DEV_LOGIN_PROXY to 0 so we *start* the worker unless the caller opts
# into using an external dev proxy. When set to 1, we assume the worker is
# reachable elsewhere (e.g. forwarded from a teammate).
DEV_LOGIN_PROXY=${DEV_LOGIN_PROXY:-0}

# Launch worker in background (local mode) unless DEV_LOGIN_PROXY=1 (external dev proxy running)
if [ "$DEV_LOGIN_PROXY" != "1" ]; then
  JE_LOCAL_URLS=1 npm run dev:worker:local >/tmp/je-worker.log 2>&1 &
  WORKER_PID=$!
  echo "[dev-login] Started worker (pid $WORKER_PID), logs: /tmp/je-worker.log"
else
  echo "[dev-login] DEV_LOGIN_PROXY=1 set; skipping login worker launch"
  WORKER_PID=""
fi

cleanup() {
  if [ -n "$WORKER_PID" ] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Platform-specific host overrides for the packager origin
cd "$PROJECT_ROOT/apps/web"

if [ "$TARGET_PLATFORM" = "android" ]; then
  export REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2
  export EXPO_PUBLIC_APP_ORIGIN=${EXPO_PUBLIC_APP_ORIGIN:-http://10.0.2.2:8081}
  export EXPO_PUBLIC_LOGIN_ORIGIN=${EXPO_PUBLIC_LOGIN_ORIGIN:-http://10.0.2.2:9787}
  export EXPO_PUBLIC_BETTER_AUTH_URL=${EXPO_PUBLIC_BETTER_AUTH_URL:-http://10.0.2.2:9787/api/auth}
  export EXPO_PUBLIC_SESSION_ENDPOINT=${EXPO_PUBLIC_SESSION_ENDPOINT:-http://10.0.2.2:9787/api/auth/session}
  export EXPO_PUBLIC_WORKER_ORIGIN=${EXPO_PUBLIC_WORKER_ORIGIN:-http://10.0.2.2:8787}
  export EXPO_PUBLIC_WORKER_ORIGIN_LOCAL=${EXPO_PUBLIC_WORKER_ORIGIN_LOCAL:-http://10.0.2.2:8787}
  exec npx expo start --android --lan "${EXPO_ARGS[@]-}"
else
  export EXPO_PUBLIC_APP_ORIGIN=${EXPO_PUBLIC_APP_ORIGIN:-http://127.0.0.1:8081}
  export EXPO_PUBLIC_LOGIN_ORIGIN=${EXPO_PUBLIC_LOGIN_ORIGIN:-http://127.0.0.1:9787}
  export EXPO_PUBLIC_BETTER_AUTH_URL=${EXPO_PUBLIC_BETTER_AUTH_URL:-http://127.0.0.1:9787/api/auth}
  export EXPO_PUBLIC_SESSION_ENDPOINT=${EXPO_PUBLIC_SESSION_ENDPOINT:-http://127.0.0.1:9787/api/auth/session}
  export EXPO_PUBLIC_WORKER_ORIGIN=${EXPO_PUBLIC_WORKER_ORIGIN:-http://127.0.0.1:8787}
  export EXPO_PUBLIC_WORKER_ORIGIN_LOCAL=${EXPO_PUBLIC_WORKER_ORIGIN_LOCAL:-http://127.0.0.1:8787}
  exec npx expo start --ios --localhost "${EXPO_ARGS[@]-}"
fi
