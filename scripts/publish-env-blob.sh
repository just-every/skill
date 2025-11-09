#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-}
ENV_NAME=${ENV_NAME:-production}

BLOB=$(./scripts/generate-env-blob.sh "$ENV_FILE")

echo "Updating ENV_BLOB secret on environment '${ENV_NAME}'..."
gh secret set ENV_BLOB --env "$ENV_NAME" --body "$BLOB" >/dev/null

echo "ENV_BLOB secret updated for environment '${ENV_NAME}'."
