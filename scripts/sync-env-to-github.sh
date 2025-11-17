#!/usr/bin/env bash
set -euo pipefail

REPO_ORG=${GITHUB_REPOSITORY%/*}
REPO_NAME=${GITHUB_REPOSITORY#*/}
ENV_FILE=${ENV_FILE:-$HOME/.env}

# If the repo has its own .env, merge home + repo so shared secrets live in ~/.env but repo-specific override locally.
if [[ -f .env ]]; then
  MERGED=$(node <<'NODE'
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        if (idx === -1) return null;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1);
        return key ? [key, value] : null;
      })
      .filter(Boolean)
  );
}

const home = parseEnv(path.join(os.homedir(), '.env'));
const repo = parseEnv(path.join(process.cwd(), '.env'));
const merged = { ...home, ...repo };
const lines = Object.entries(merged)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
process.stdout.write(lines);
NODE
)
  TEMP_ENV=$(mktemp)
  printf '%s' "$MERGED" > "$TEMP_ENV"
  ENV_FILE=$TEMP_ENV
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "Syncing $ENV_FILE into ENV_BLOB secret for $GITHUB_REPOSITORY"
BASE64_CONTENT=$(base64 < "$ENV_FILE" | tr -d '\n')
gh secret set ENV_BLOB --body "$BASE64_CONTENT"

echo "ENV_BLOB updated."
