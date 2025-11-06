# Bootstrap Idempotency Validation

This document describes the idempotency guarantees of `bootstrap.sh` and how to validate rerun behavior.

## Idempotency Guarantees

Running `bootstrap.sh` multiple times with the same configuration should:

1. **Reuse existing resources** instead of creating duplicates
2. **Update configurations** when settings have changed
3. **Skip redundant operations** when state is already correct
4. **Preserve resource IDs** across runs via `.env.local.generated`

## Resource-Specific Behavior

### Stripe Products

**Reconciliation Strategy:**
- Queries existing products by `metadata.project_id` matching `PROJECT_ID`
- Matches products by name within the project scope
- For each configured product:
  - If exists: reuses product, searches for matching price (amount, currency, interval)
  - If price exists: reuses it
  - If price missing: creates new price for existing product
  - If product missing: creates new product with metadata, then creates price

**Rerun Guarantees:**
- No duplicate products created for the same project
- Existing products are reused by metadata lookup
- Metadata is stamped on creation: `metadata[project_id]="$PROJECT_ID"`
- Price matching is strict: amount, currency, interval, and active status

**Validation:**
```bash
# First run
STRIPE_PRODUCTS="Basic:1000,usd,month;Pro:5000,usd,month" ./bootstrap.sh

# Rerun should reuse both products and prices
STRIPE_PRODUCTS="Basic:1000,usd,month;Pro:5000,usd,month" ./bootstrap.sh

# Check logs for "Found existing Stripe product" messages
```

### Stripe Webhook

**Reconciliation Strategy:**
- Lists all webhook endpoints via Stripe API
- Filters by target URL: `${PROJECT_DOMAIN}/webhook/stripe`
- Reconciles based on endpoint count:
  - **0 endpoints:** Creates new endpoint
  - **1 endpoint:** Reuses existing, verifies/updates enabled_events if needed
  - **Multiple endpoints:** Uses first by default; warns about duplicates

**Prune Flag:**
- Set `STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1` to automatically delete duplicates
- Keeps the first endpoint, deletes the rest
- Updates `.env.local.generated` with kept endpoint ID and secret

**Rerun Guarantees:**
- Single endpoint per URL is maintained
- Endpoint ID and secret are exposed only when changed or created
- Events list is reconciled and updated if mismatched

**Validation:**
```bash
# First run
./bootstrap.sh

# Rerun should find and reuse the webhook endpoint
./bootstrap.sh

# Check logs for "Found existing Stripe webhook endpoint" message
```

### D1 Database

**Reconciliation Strategy:**
1. Check `.env.local.generated` for cached `D1_DATABASE_ID`
2. If cached ID exists, verify it remotely via `wrangler d1 list --json`
3. If cached ID verified: reuse it
4. If cached ID missing remotely: fallback to name search
5. If name search finds match: reuse it
6. Otherwise: create new database

**Rerun Guarantees:**
- Uses cached ID from `.env.local.generated` when available
- Verifies remote existence before trusting cache
- Falls back gracefully if cached resource was deleted
- No duplicate databases created when name matches

**Validation:**
```bash
# First run
./bootstrap.sh

# Check .env.local.generated for D1_DATABASE_ID
grep D1_DATABASE_ID .env.local.generated

# Rerun should verify and reuse
./bootstrap.sh

# Check logs for "Verified D1 database ... exists remotely"
```

### R2 Bucket

**Reconciliation Strategy:**
1. Check `.env.local.generated` for cached `R2_BUCKET_NAME`
2. If cached name exists, verify it remotely via `wrangler r2 bucket list`
3. If cached bucket verified: reuse it
4. If cached bucket missing remotely: fallback to configured name
5. If configured name exists: reuse it
6. Otherwise: create new bucket

**Rerun Guarantees:**
- Uses cached bucket name from `.env.local.generated`
- Verifies remote existence via bucket list
- Falls back gracefully if cached bucket was deleted
- No duplicate buckets created when name matches

**Validation:**
```bash
# First run
./bootstrap.sh

# Check .env.local.generated for R2_BUCKET_NAME
grep R2_BUCKET_NAME .env.local.generated

# Rerun should verify and reuse
./bootstrap.sh

# Check logs for "Verified R2 bucket ... exists remotely"
```

### Worker Secrets

**Reconciliation Strategy:**
- By default, skips secrets that were synced in previous runs (tracked in `SYNCED_SECRET_NAMES`)
- Checks `.env.local.generated` for list of previously synced secrets
- Secrets are synced to Cloudflare on every run.

## Flags and Environment Variables

### Idempotency Control Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `STRIPE_PRUNE_DUPLICATE_WEBHOOKS` | `0` | Set to `1` to automatically delete duplicate webhook endpoints |

- Clean up duplicate Stripe webhooks: `STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1 ./bootstrap.sh --deploy`

## Acceptance Test Checklist

- [ ] First run creates all resources
- [ ] Second run with identical config reuses all resources (no creates)
- [ ] Stripe products matched by `metadata.project_id` and name
- [ ] Stripe webhook reconciled by URL, single endpoint maintained
- [ ] D1 database reused via cached ID verification
- [ ] R2 bucket reused via cached name verification
- [ ] Worker secrets successfully synced on rerun
- [ ] `.env.local.generated` accurately tracks resource IDs and synced secrets
- [ ] Local mode skips remote Cloudflare/Stripe mutations
- [ ] Duplicate webhook cleanup works with `STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1`

## Automated Validation Script

Use the bundled validator to combine log analysis with live checks against Stripe and Cloudflare.

```bash
# Validate the most recent bootstrap run (auto-detect latest test-results/bootstrap-*/ directory)
npm run validate:bootstrap

# Validate a specific run directory
npm run validate:bootstrap -- --run test-results/bootstrap-20251105T030000Z

# Provide an explicit log file (overrides automatic discovery)
npm run validate:bootstrap -- --log test-results/bootstrap-20251105T030000Z/dry-run.log
```

The validator writes `validation.json` and `validation.txt` alongside the referenced run directory. Checks performed:

- Confirms the bootstrap log contains **no create operations** (reruns must show only reconcile/skip messaging)
- Queries Stripe for products tagged with `metadata.project_id=${PROJECT_ID}` and ensures one webhook endpoint exists per target URL
- Uses `wrangler d1 list --json` and `wrangler r2 bucket list` to verify resources by name and detect duplicates
- Fetches Cloudflare Worker routes for `CLOUDFLARE_ZONE_ID` and matches them against `workers/api/wrangler.toml`

Exit codes:

- `0` – All checks passed (warnings may still be emitted)
- `1` – At least one failure detected (duplicates, missing resources, or create operations in the log)

Before running, ensure the following environment variables are loaded (for example: `set -a; source ~/.env; set +a`):

- `PROJECT_ID`
- `STRIPE_SECRET_KEY` (or `STRIPE_TEST_SECRET_KEY` / `STRIPE_LIVE_SECRET_KEY`)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`

The script also reads `.env.local.generated` to reuse cached identifiers and will downgrade to warnings when credentials are missing.

## Common Rerun Scenarios

### Scenario 1: Configuration Unchanged
**Expected:** All resources reused, no creates, secrets skipped

```bash
./bootstrap.sh  # First run
./bootstrap.sh  # Rerun - should see "Found existing" logs and secret sync output
```

### Scenario 2: Secret Values Changed
**Expected:** Rerun updates Cloudflare Worker secrets with new values

```bash
# Update secret in .env
echo "STRIPE_SECRET_KEY=sk_test_new_value" >> .env

# Rerun to push updated secrets (add --deploy to publish remotely)
./bootstrap.sh
./bootstrap.sh --deploy
```

### Scenario 3: New Product Added
**Expected:** Existing products reused, new product created

```bash
# Initial products
STRIPE_PRODUCTS="Basic:1000,usd,month" ./bootstrap.sh

# Add Pro tier
STRIPE_PRODUCTS="Basic:1000,usd,month;Pro:5000,usd,month" ./bootstrap.sh

# Should reuse Basic, create Pro
```

### Scenario 4: Resource Manually Deleted
**Expected:** Fallback to name search, or recreate if not found

```bash
# After first run, manually delete D1 database
wrangler d1 delete <db-name>

# Rerun should detect cached ID is stale, fallback to create
./bootstrap.sh
```

## Troubleshooting Idempotency Issues

### Duplicate Stripe Products
**Symptom:** Multiple products with same name
**Cause:** Products created before metadata stamping was added
**Fix:** Manually tag existing products with `metadata.project_id` in Stripe dashboard

### Duplicate Webhooks
**Symptom:** Multiple webhook endpoints for same URL
**Cause:** Prior runs created duplicates
**Fix:** Run with `STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1` to clean up

### Stale Cached IDs
**Symptom:** Script tries to use cached ID but resource was deleted
**Solution:** Script falls back to name search automatically; or delete `.env.local.generated` for fresh run

### Secret Sync Skipped When Value Changed
**Symptom:** Updated secret in `.env` but Worker still has old value
**Fix:** Rerun `./bootstrap.sh` (and `./bootstrap.sh --deploy` if publishing) to push the new secret values
