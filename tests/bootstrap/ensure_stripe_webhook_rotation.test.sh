#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export ROOT_DIR

source "$ROOT_DIR/scripts/bootstrap/common.sh"
source "$ROOT_DIR/scripts/bootstrap/stripe.sh"

unset -f run_cmd_capture

run_cmd_capture() {
  if [[ "$1" != "curl" ]]; then
    echo "unexpected command: $*" >&2
    exit 1
  fi

  shift
  local joined=" $* "

  if [[ "$joined" == *" GET https://api.stripe.com/v1/webhook_endpoints?limit=100 "* ]]; then
    printf 'list\n' >>"$CALL_LOG_FILE"
    cat <<'JSON'
{"data":[{"id":"we_123","url":"https://starter.example/webhook/stripe"}]}
JSON
    return 0
  fi

  if [[ "$joined" == *" GET https://api.stripe.com/v1/webhook_endpoints/we_123 "* ]]; then
    printf 'get\n' >>"$CALL_LOG_FILE"
    cat <<'JSON'
{
  "id": "we_123",
  "secret": null,
  "enabled_events": [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "invoice.payment_succeeded",
    "invoice.payment_failed"
  ]
}
JSON
    return 0
  fi

  if [[ "$joined" == *" POST https://api.stripe.com/v1/webhook_endpoints/we_123/secret "* ]]; then
    printf 'rotate\n' >>"$CALL_LOG_FILE"
    cat <<'JSON'
{"secret":"whsec_rotated"}
JSON
    return 0
  fi

  if [[ "$joined" == *" POST https://api.stripe.com/v1/webhook_endpoints/we_123 "* ]]; then
    # Should not be reached when rotation succeeds.
    echo "unexpected update request" >&2
    exit 1
  fi

  echo "unhandled command: $*" >&2
  exit 1
}

log_info() {
  printf '[test-info] %s\n' "$*"
}

log_warn() {
  printf '[test-warn] %s\n' "$*"
}

log_error() {
  printf '[test-error] %s\n' "$*" >&2
}

PROJECT_ID=starter
PROJECT_DOMAIN=https://starter.example
STRIPE_SECRET_KEY=sk_test_dummy
STRIPE_WEBHOOK_ENDPOINT_ID=we_123
STRIPE_WEBHOOK_SECRET=""

CALL_LOG_FILE=$(mktemp)
trap 'rm -f "$CALL_LOG_FILE"' EXIT

ensure_stripe_webhook

call_count=$(wc -l <"$CALL_LOG_FILE")
call_sequence=$(paste -sd',' "$CALL_LOG_FILE")
echo "call_sequence=$call_sequence"

if [[ "$STRIPE_WEBHOOK_SECRET" != "whsec_rotated" ]]; then
  echo "expected STRIPE_WEBHOOK_SECRET to equal rotated secret" >&2
  exit 1
fi

if [[ "$STRIPE_WEBHOOK_ENDPOINT_ID" != "we_123" ]]; then
  echo "expected STRIPE_WEBHOOK_ENDPOINT_ID to remain we_123" >&2
  exit 1
fi

if [[ $call_count -ne 3 ]]; then
  echo "expected exactly 3 Stripe API calls, got $call_count" >&2
  exit 1
fi

if [[ "$call_sequence" != "list,get,rotate" ]]; then
  echo "unexpected Stripe API call sequence: $call_sequence" >&2
  exit 1
fi

echo "ensure_stripe_webhook rotation test passed"
