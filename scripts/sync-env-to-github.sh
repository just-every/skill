#!/usr/bin/env bash
set -euo pipefail

REPO_ORG=${GITHUB_REPOSITORY%/*}
REPO_NAME=${GITHUB_REPOSITORY#*/}
ENV_FILE=${ENV_FILE:-$HOME/.env}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "Syncing $ENV_FILE into ENV_BLOB secret for $GITHUB_REPOSITORY"
BASE64_CONTENT=$(base64 < "$ENV_FILE" | tr -d '\n')
gh secret set ENV_BLOB --body "$BASE64_CONTENT"

echo "ENV_BLOB updated."
