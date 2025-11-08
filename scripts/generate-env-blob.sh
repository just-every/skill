#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-}

if [[ -z "$ENV_FILE" ]]; then
  if [[ -f .env.production ]]; then
    ENV_FILE=.env.production
  elif [[ -f .env ]]; then
    ENV_FILE=.env
  else
    echo "Usage: $0 <path-to-env-file>" >&2
    exit 1
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file '$ENV_FILE' not found" >&2
  exit 1
fi

# macOS base64 wraps lines by default; remove newlines for GitHub secrets.
base64 < "$ENV_FILE" | tr -d '\n'
