# shellcheck shell=bash

STRIPE_SECRET_SOURCE="STRIPE_SECRET_KEY"

resolve_stripe_secret() {
  local mode="$(to_lower "${STRIPE_MODE:-test}")"

  if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
    STRIPE_MODE="$mode"
    STRIPE_SECRET_SOURCE="STRIPE_SECRET_KEY"
    export STRIPE_SECRET_KEY STRIPE_MODE
    log_info "Using provided STRIPE_SECRET_KEY for Stripe mode '$mode'"
    return
  fi

  local candidate=""
  local source="STRIPE_SECRET_KEY"

  case "$mode" in
    live)
      candidate="${STRIPE_LIVE_SECRET_KEY:-}"
      source="STRIPE_LIVE_SECRET_KEY"
      ;;
    test|sandbox|*)
      candidate="${STRIPE_TEST_SECRET_KEY:-}"
      source="STRIPE_TEST_SECRET_KEY"
      mode="test"
      ;;
  esac

  if [[ -z "$candidate" ]]; then
    if is_dry_run; then
      STRIPE_SECRET_KEY="sk_${mode}_dry_run_placeholder"
      STRIPE_SECRET_SOURCE="dry-run placeholder"
      STRIPE_MODE="$mode"
      export STRIPE_SECRET_KEY STRIPE_MODE
      log_warn "Stripe secret key missing for mode '$mode'; using placeholder (dry-run)."
      return
    fi
    log_error "Stripe secret key not configured. Set STRIPE_SECRET_KEY or ${source}."
    exit 1
  fi

  STRIPE_SECRET_KEY="$candidate"
  STRIPE_SECRET_SOURCE="$source"
  STRIPE_MODE="$mode"
  export STRIPE_SECRET_KEY STRIPE_MODE
  log_info "Resolved Stripe secret key from ${source} for mode '$mode'"
}

parse_stripe_products() {
  local raw=${STRIPE_PRODUCTS:-}
  [[ -z "$raw" ]] && echo "[]" && return
  local IFS=';' entry
  local arr="[]"
  for entry in $raw; do
    [[ -z "$entry" ]] && continue
    local name part amount currency interval
    name=${entry%%:*}
    part=${entry#*:}
    amount=${part%%,*}
    part=${part#*,}
    currency=${part%%,*}
    interval=${part##*,}
    arr=$(jq --arg name "$name" --arg amount "${amount:-0}" --arg currency "$currency" --arg interval "$interval" \
      '. + [{name: $name, amount: ($amount|tonumber?), currency: $currency, interval: $interval}]' <<<"$arr")
  done
  echo "$arr"
}

provision_stripe_products() {
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set; skipping Stripe provisioning"
    return
  fi

  local products_json
  products_json=$(parse_stripe_products)
  if [[ -z "$products_json" || "$products_json" == "[]" ]]; then
    log_warn "No STRIPE_PRODUCTS configured; skipping Stripe provisioning"
    return
  fi

  if is_dry_run; then
    log_info "[dry-run] Would reconcile Stripe products: $products_json"
    STRIPE_PRODUCT_IDS="[]"
    return
  fi

  log_info "Reconciling Stripe products"

  local existing_products
  existing_products=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/products?limit=100" \
    -u "$STRIPE_SECRET_KEY:" 2>&1 || echo '{"data":[]}')

  local ids="[]"
  local index=0
  local length
  length=$(jq 'length' <<<"$products_json")
  while [[ $index -lt $length ]]; do
    local product_json
    product_json=$(jq -c --argjson idx "$index" '.[$idx]' <<<"$products_json")
    local name amount currency interval
    name=$(jq -r '.name' <<<"$product_json")
    amount=$(jq -r '.amount' <<<"$product_json")
    currency=$(jq -r '.currency' <<<"$product_json")
    interval=$(jq -r '.interval' <<<"$product_json")

    local existing_product_id
    existing_product_id=$(jq -r --arg project_id "$PROJECT_ID" --arg name "$name" \
      '.data[] | select(.metadata.project_id == $project_id and .name == $name) | .id // empty' \
      <<<"$existing_products" | head -1)

    local product_id price_id
    if [[ -n "$existing_product_id" ]]; then
      log_info "Found existing Stripe product '$name' (${existing_product_id})"
      product_id="$existing_product_id"

      local existing_prices
      existing_prices=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/prices?product=${product_id}&limit=100" \
        -u "$STRIPE_SECRET_KEY:" 2>&1 || echo '{"data":[]}')

      price_id=$(jq -r --argjson amount "$amount" --arg currency "$currency" --arg interval "$interval" \
        '.data[] | select(.unit_amount == $amount and .currency == $currency and .recurring.interval == $interval and .active == true) | .id // empty' \
        <<<"$existing_prices" | head -1)

      if [[ -n "$price_id" ]]; then
        log_info "Found existing matching price for '$name' (${price_id})"
      else
        log_info "No matching price found for '$name'; creating new price"
        local price_response
        price_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/prices \
          -u "$STRIPE_SECRET_KEY:" \
          -d unit_amount="$amount" \
          -d currency="$currency" \
          -d recurring[interval]="$interval" \
          -d product="$product_id")
        price_id=$(jq -r '.id // empty' <<<"$price_response")
      fi
    else
      log_info "Creating new Stripe product '$name'"
      local product_response
      product_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/products \
        -u "$STRIPE_SECRET_KEY:" \
        -d name="$name" \
        -d metadata[project_id]="$PROJECT_ID")
      product_id=$(jq -r '.id // empty' <<<"$product_response")

      local price_response
      price_response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/prices \
        -u "$STRIPE_SECRET_KEY:" \
        -d unit_amount="$amount" \
        -d currency="$currency" \
        -d recurring[interval]="$interval" \
        -d product="$product_id")
      price_id=$(jq -r '.id // empty' <<<"$price_response")
    fi

    ids=$(jq --arg product "$product_id" --arg price "$price_id" '. + [{product: $product, price: $price}]' <<<"$ids")
    ((index++))
  done

  STRIPE_PRODUCT_IDS="$ids"
}

ensure_stripe_webhook() {
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set; skipping Stripe webhook provisioning"
    return
  fi

  local target_url="${PROJECT_DOMAIN%/}/webhook/stripe"
  local cached_endpoint="${STRIPE_WEBHOOK_ENDPOINT_ID:-}"
  local -a events=(
    "checkout.session.completed"
    "customer.subscription.created"
    "customer.subscription.updated"
    "invoice.payment_succeeded"
    "invoice.payment_failed"
  )

  if is_dry_run; then
    STRIPE_WEBHOOK_ENDPOINT_ID="dry-run-webhook"
    STRIPE_WEBHOOK_SECRET="whsec_dry_run"
    log_info "[dry-run] Would reconcile Stripe webhook at $target_url"
    return
  fi

  log_info "Reconciling Stripe webhook endpoint for $target_url"

  local cached_secret="${STRIPE_WEBHOOK_SECRET:-}"

  local list_response
  list_response=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/webhook_endpoints?limit=100" \
    -u "$STRIPE_SECRET_KEY:" 2>&1) || {
    log_warn "Failed to list Stripe webhook endpoints"
    return
  }

  local matching_ids=()
  IFS=$'\n' read -r -d '' -a matching_ids < <(jq -r --arg url "$target_url" '.data[] | select(.url == $url) | .id' <<<"$list_response" && printf '\0')

  local -a event_args=()
  for event in "${events[@]}"; do
    event_args+=(-d "enabled_events[]=$event")
  done

  if [[ ${#matching_ids[@]} -eq 0 ]]; then
    local response
    response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/webhook_endpoints \
      -u "$STRIPE_SECRET_KEY:" \
      -d "url=$target_url" \
      "${event_args[@]}") || return
    STRIPE_WEBHOOK_ENDPOINT_ID=$(jq -r '.id // empty' <<<"$response")
    STRIPE_WEBHOOK_SECRET=$(jq -r '.secret // empty' <<<"$response")
    if [[ -z "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" ]]; then
      log_warn "Stripe webhook creation response missing id"
      return
    fi
    if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" || "${STRIPE_WEBHOOK_SECRET}" == "null" ]]; then
      log_warn "Stripe webhook creation response missing secret; manual follow-up required"
      STRIPE_WEBHOOK_SECRET=""
    else
      log_info "Created Stripe webhook endpoint: $STRIPE_WEBHOOK_ENDPOINT_ID"
    fi
    return
  fi

  local selected_id=""
  if [[ ${#matching_ids[@]} -gt 1 ]]; then
    if [[ "${STRIPE_PRUNE_DUPLICATE_WEBHOOKS:-0}" == "1" ]]; then
      log_info "Found ${#matching_ids[@]} webhook endpoints; pruning duplicates"
      selected_id="${matching_ids[0]}"
      for endpoint_id in "${matching_ids[@]:1}"; do
        log_info "Deleting duplicate webhook endpoint: $endpoint_id"
        run_cmd_capture curl -sS -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$endpoint_id" \
          -u "$STRIPE_SECRET_KEY:" >/dev/null
      done
    else
      selected_id="${matching_ids[0]}"
      log_warn "Found ${#matching_ids[@]} webhook endpoints; using ${selected_id}. Set STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1 to clean up duplicates."
    fi
  else
    selected_id="${matching_ids[0]}"
    log_info "Found existing Stripe webhook endpoint: $selected_id"
  fi

  local endpoint_response
  endpoint_response=$(run_cmd_capture curl -sS -X GET "https://api.stripe.com/v1/webhook_endpoints/$selected_id" \
    -u "$STRIPE_SECRET_KEY:" 2>&1)

  STRIPE_WEBHOOK_ENDPOINT_ID="$selected_id"
  local fetched_secret
  fetched_secret=$(jq -r '.secret // empty' <<<"$endpoint_response" 2>/dev/null || true)

  if [[ -n "$cached_endpoint" && "$cached_endpoint" == "$selected_id" && -n "$cached_secret" ]]; then
    STRIPE_WEBHOOK_SECRET="$cached_secret"
    log_info "Cached Stripe webhook secret found for $selected_id; skipping reconciliation"
    return
  fi

  if [[ -n "$fetched_secret" && "$fetched_secret" != "null" ]]; then
    STRIPE_WEBHOOK_SECRET="$fetched_secret"
  else
    log_info "Stripe webhook endpoint $selected_id missing secret; rotating via Stripe API"
    local rotate_response=""
    if ! rotate_response=$(run_cmd_capture curl -sS -X POST "https://api.stripe.com/v1/webhook_endpoints/$selected_id/secret" \
      -u "$STRIPE_SECRET_KEY:" 2>&1); then
      rotate_response=""
    fi
    local rotated_secret
    rotated_secret=$(jq -r '.secret // empty' <<<"$rotate_response" 2>/dev/null || true)

    if [[ -n "$rotated_secret" && "$rotated_secret" != "null" ]]; then
      STRIPE_WEBHOOK_SECRET="$rotated_secret"
      log_info "Rotated Stripe webhook secret for $selected_id"
    else
      log_warn "Stripe webhook endpoint $selected_id failed to return secret after rotation; recreating"
      run_cmd_capture curl -sS -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$selected_id" \
        -u "$STRIPE_SECRET_KEY:" >/dev/null || true
    local response
    response=$(run_cmd_capture curl -sS -X POST https://api.stripe.com/v1/webhook_endpoints \
      -u "$STRIPE_SECRET_KEY:" \
      -d "url=$target_url" \
      "${event_args[@]}") || {
        log_warn "Stripe webhook recreation request failed"
        return 0
      }
    STRIPE_WEBHOOK_ENDPOINT_ID=$(jq -r '.id // empty' <<<"$response" 2>/dev/null || true)
    STRIPE_WEBHOOK_SECRET=$(jq -r '.secret // empty' <<<"$response" 2>/dev/null || true)
    if [[ -z "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" ]]; then
      log_warn "Stripe webhook recreation failed"
      return 0
    fi
    log_info "Recreated Stripe webhook endpoint: ${STRIPE_WEBHOOK_ENDPOINT_ID}"
    if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" || "${STRIPE_WEBHOOK_SECRET}" == "null" ]]; then
      log_warn "Stripe webhook recreation response missing secret; manual follow-up required"
      STRIPE_WEBHOOK_SECRET=""
      return 0
    fi
    return 0
    fi
  fi

  local current_events
  current_events=$(jq -r '.enabled_events[]' <<<"$endpoint_response" | sort | tr '\n' ',')
  local expected_events
  expected_events=$(printf '%s\n' "${events[@]}" | sort | tr '\n' ',')

  if [[ "$current_events" != "$expected_events" ]]; then
    log_info "Webhook events mismatch; updating endpoint $selected_id"
    run_cmd_capture curl -sS -X POST "https://api.stripe.com/v1/webhook_endpoints/$selected_id" \
      -u "$STRIPE_SECRET_KEY:" \
      "${event_args[@]}" >/dev/null
  else
    log_info "Webhook endpoint events already match; no update needed"
  fi
}

stripe_post_deploy_note() {
  local target_url="${PROJECT_DOMAIN%/}/webhook/stripe"

  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "Stripe follow-up: STRIPE_SECRET_KEY not provided; webhook secret could not be managed."
    return
  fi

  if [[ -z "${STRIPE_WEBHOOK_ENDPOINT_ID:-}" || -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
    log_warn "Stripe follow-up: webhook endpoint for $target_url not created or secret unavailable (likely quota)."
    log_warn "Visit https://dashboard.stripe.com/${STRIPE_MODE:-test}/webhooks to delete old endpoints, then rerun bootstrap to capture a fresh secret."
  else
    log_info "Stripe follow-up: webhook endpoint ${STRIPE_WEBHOOK_ENDPOINT_ID} configured for $target_url."
    log_info "Secret stored in STRIPE_WEBHOOK_SECRET and synced to the Worker; rotate via dashboard when needed."
  fi
}
