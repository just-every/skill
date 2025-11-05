#!/usr/bin/env bash
# Safely merge whitelisted keys from a source env file into workers/api/.dev.vars.
# Usage: SRC_FILE=.env.local DRY_RUN=false scripts/sync-dev-vars.sh

set -euo pipefail

SRC_FILE=${SRC_FILE:-.env.local}
DEST_FILE=${DEST_FILE:-workers/api/.dev.vars}
ALLOW_KEYS_REGEX='^(DB|ASSETS|LOGTO_ISSUER|LOGTO_AUDIENCE|LOGTO_JWKS_URI|LOGTO_APPLICATION_ID|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)='
DRY_RUN=${DRY_RUN:-true}

if [[ ! -f "$SRC_FILE" ]]; then
  echo "Source file not found: $SRC_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST_FILE")"
touch "$DEST_FILE"

echo "Syncing whitelisted keys from $SRC_FILE -> $DEST_FILE (DRY_RUN=$DRY_RUN)"

if [[ "$DRY_RUN" != "true" ]]; then
  cp "$DEST_FILE" "${DEST_FILE}.bak.$(date +%Y%m%d%H%M%S)"
fi

ADDED=0
UPDATED=0
SKIPPED=0

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  if [[ "$line" =~ $ALLOW_KEYS_REGEX ]]; then
    key="${line%%=*}"
    if grep -qE "^${key}=" "$DEST_FILE"; then
      if [[ "$DRY_RUN" != "true" ]]; then
        awk -v k="$key" -v v="${line#*=}" -F= '
          BEGIN { OFS="=" }
          $1==k { $2=v; print; next }
          { print }
        ' "$DEST_FILE" > "${DEST_FILE}.tmp" && mv "${DEST_FILE}.tmp" "$DEST_FILE"
      fi
      ((UPDATED++))
    else
      if [[ "$DRY_RUN" != "true" ]]; then
        printf '%s\n' "$line" >> "$DEST_FILE"
      fi
      ((ADDED++))
    fi
  else
    ((SKIPPED++))
  fi
done < "$SRC_FILE"

echo "Summary: added=$ADDED updated=$UPDATED skipped_non_whitelisted=$SKIPPED"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run only. Set DRY_RUN=false to write changes (backup will be created)."
fi
