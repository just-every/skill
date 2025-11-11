#!/usr/bin/env bash
set -euo pipefail

if [ -f "$HOME/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/.env"
  set +a
fi

echo "[deprecated] Use 'pnpm bootstrap:*' commands instead of bootstrap.sh" >&2
echo "           Forwarding to @justevery/bootstrap-cli..." >&2

exec pnpm --filter @justevery/bootstrap-cli exec tsx src/cli.ts "$@"
