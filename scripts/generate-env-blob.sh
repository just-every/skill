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

MERGED=$(BASE_ENV_FILE="$ENV_FILE" node <<'NODE'
const fs = require('fs');
const path = require('path');
const basePath = path.resolve(process.cwd(), process.env.BASE_ENV_FILE);
const generatedPath = path.resolve(process.cwd(), process.env.GENERATED_ENV_FILE || '.env.local.generated');

function parseEnv(file) {
  if (!fs.existsSync(file)) {
    return {};
  }
  const contents = fs.readFileSync(file, 'utf8');
  const result = {};
  contents.split(/\r?\n/).forEach((line) => {
    if (!line || /^\s*#/.test(line)) {
      return;
    }
    const idx = line.indexOf('=');
    if (idx === -1) {
      return;
    }
    const key = line.slice(0, idx).trim();
    if (!key) {
      return;
    }
    const value = line.slice(idx + 1);
    result[key] = value;
  });
  return result;
}

const base = parseEnv(basePath);
const generated = parseEnv(generatedPath);
const combined = { ...base, ...generated };

const lines = Object.entries(combined)
  .filter(([key, value]) => Boolean(key) && typeof value !== 'undefined' && String(value).length > 0)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

process.stdout.write(lines);
NODE
)

# macOS base64 wraps lines by default; remove newlines for GitHub secrets.
printf '%s' "$MERGED" | base64 | tr -d '\n'
