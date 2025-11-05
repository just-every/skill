# Bootstrapping Guide

The `bootstrap.sh` script provisions Cloudflare resources, templates Wrangler
configuration, and optionally seeds Stripe products based on the values in your
environment files.

**Idempotency Guarantee:** `bootstrap.sh` is fully idempotent. Reruns with the same configuration will reuse existing resources instead of creating duplicates. See [BOOTSTRAP_VALIDATION.md](./BOOTSTRAP_VALIDATION.md) for detailed rerun behavior and validation tests.

## Prerequisites

- Node.js ≥ 18 and pnpm / npm for installing dependencies locally.
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated with an API token that has permission to manage Workers, D1, and R2.
- `jq`, `curl`, and `sed` available on your PATH (installed by default on most developer machines).
- Valid credentials for Logto (management API client) and Stripe stored in `/home/azureuser/.env` or the project `.env` file.

## Required Environment Variables

Populate `.env` using `.env.example` as a template. At minimum you must define:

- `PROJECT_ID`
- `PROJECT_DOMAIN` & `APP_URL`
- `CLOUDFLARE_ACCOUNT_ID` & `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_R2_BUCKET` (optional – falls back to `<project>-assets`)
- `LOGTO_MANAGEMENT_ENDPOINT` & `LOGTO_MANAGEMENT_AUTH_BASIC` (base64 client credentials for the Logto management API)
- `LOGTO_API_RESOURCE` (resource indicator to embed in issued access tokens)
- Optional overrides: `LOGTO_ENDPOINT`, `LOGTO_APPLICATION_ID`, `LOGTO_APPLICATION_SECRET`
- `STRIPE_PRODUCTS` (shorthand or JSON array) and optionally `STRIPE_SECRET_KEY`

Set `DRY_RUN=1` to exercise the script without creating resources.

## Running the Script

```bash
# Preview without side effects
DRY_RUN=1 ./bootstrap.sh

# Execute against Cloudflare and Stripe (first run)
./bootstrap.sh

# Rerun safely - will reuse all existing resources
./bootstrap.sh

# Deploy the Worker once resources exist
npx wrangler deploy --config workers/api/wrangler.toml
```

### Idempotency Flags

The following flags control rerun behavior:

| Flag | Default | Purpose |
|------|---------|---------|
| `DRY_RUN` | `0` | Preview actions without creating/updating resources |
| `SYNC_SECRETS` | `1` | Set to `0` to skip all secret synchronization |
| `FORCE_SECRET_SYNC` | `0` | Set to `1` to force re-sync all secrets (use when values changed) |
| `STRIPE_PRUNE_DUPLICATE_WEBHOOKS` | `0` | Set to `1` to automatically delete duplicate webhook endpoints |

**Examples:**

```bash
# Force secret re-sync after updating values in .env
FORCE_SECRET_SYNC=1 ./bootstrap.sh

# Clean up duplicate Stripe webhook endpoints
STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1 ./bootstrap.sh

# Skip secret sync entirely (for faster reruns)
SYNC_SECRETS=0 ./bootstrap.sh
```

## How Bootstrap Works

### Idempotent Resource Provisioning

On every run, `bootstrap.sh` reconciles resources to ensure they exist and match configuration:

1. **Stripe Products**: Queries by `metadata.project_id`, reuses matching products and prices
2. **Stripe Webhook**: Reconciles single endpoint by URL, updates events if needed
3. **D1 Database**: Verifies cached ID from `.env.local.generated`, falls back to name search
4. **R2 Bucket**: Verifies cached name from `.env.local.generated`, falls back to name search
5. **Worker Secrets**: Skips sync for already-synced secrets (unless `FORCE_SECRET_SYNC=1`)

### Task Flow

1. Ensures the `wrangler`, `jq`, `curl`, `sed`, and `node` commands are available.
2. Loads environment variables from `/home/azureuser/.env`, then `./.env`, and finally `./.env.local.generated` (if present).
3. Verifies mandatory configuration values (including `PROJECT_DOMAIN` and `APP_URL`).
4. **Reconciles** Cloudflare D1 and R2 resources (reuses existing or creates new).
5. Updates `workers/api/wrangler.toml` from the template, storing a backup copy.
6. Confirms the Worker configuration (`wrangler.toml`) is up to date; `wrangler deploy` later applies the `[[routes]]` block and manages the custom domain automatically (requires DNS scope on your Wrangler login or API token).
7. Runs database migrations via `node workers/api/scripts/migrate.js`.
8. Seeds the `projects` table with the default project row (upserts on conflict).
9. **Reconciles** Stripe products + prices based on `STRIPE_PRODUCTS` (reuses by metadata).
10. **Reconciles** Stripe webhook endpoint for `${PROJECT_DOMAIN}/webhook/stripe` (single endpoint per URL).
11. Syncs Worker secrets (skips already-synced secrets unless `FORCE_SECRET_SYNC=1`).
12. Uploads a placeholder `welcome.txt` asset into the configured R2 bucket.
13. Writes `.env.local.generated` containing resolved resource identifiers, Stripe outputs, and
    the `EXPO_PUBLIC_*` values consumed by the Expo placeholder.

After bootstrap completes, source `.env.local.generated` (for example `set -a; source ./.env.local.generated; set +a`) before running Expo so the public runtime vars are available to `apps/web`.

## Stripe Product Notation

The shorthand format accepts semi-colon separated entries:

```
PlanName:amount,currency,interval;Another:amount,currency,interval
```

Example:

```
Founders:2500,usd,month;Scale:4900,usd,quarter
```

When present, `bootstrap.sh` creates both the Product and a recurring Price per
entry, tagging generated IDs inside `.env.local.generated`.

## Database Migrations and Seeding

After templating Wrangler config, the script runs all SQL migrations in
`workers/api/migrations` and inserts (or updates) the default project row so the
Worker has baseline metadata available immediately.

## Stripe Webhook Setup

When `STRIPE_SECRET_KEY` is defined, `bootstrap.sh` creates a webhook endpoint at
`${PROJECT_DOMAIN}/webhook/stripe` listening to checkout, subscription, and invoice
events. The generated endpoint ID and secret are written to
`.env.local.generated` for safe storage.

After bootstrap, store the webhook signing secret in the Worker environment:

```bash
echo "$STRIPE_WEBHOOK_SECRET" | wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/api/wrangler.toml
```

## R2 Placeholder Upload

To verify storage access, the script uploads a simple `welcome.txt` object to the
configured R2 bucket. You can delete or replace this file once real assets are in
place.

## Verify the Worker

```
npx wrangler deploy --config workers/api/wrangler.toml

curl -I https://demo.justevery.com/
curl -s https://demo.justevery.com/api/session
curl -s https://demo.justevery.com/api/stripe/products
```

## Expo web export note

Expo SDK 51+ only needs `babel-preset-expo` in `apps/web/babel.config.js`.

```
cd apps/web
npx expo export --platform web --output-dir dist
```

## Troubleshooting

- **wrangler auth errors**: run `wrangler login` or set `CLOUDFLARE_API_TOKEN` with the necessary scopes (Workers Scripts, D1, R2)
- **jq not found**: install via `brew install jq`, `apt install jq`, or your package manager.
- **Stripe provisioning skipped**: confirm `STRIPE_SECRET_KEY` and `STRIPE_PRODUCTS` are set.
- **Template values unchanged**: ensure the placeholders (e.g. `{{PROJECT_ID}}`) still exist in `workers/api/wrangler.toml.template`.

## Rollback

If you need to tear down the resources created by `bootstrap.sh`:

```bash
# Delete the D1 database
npx wrangler d1 delete $(grep D1_DATABASE_NAME .env.local.generated | cut -d= -f2)

# Delete the R2 bucket (bucket contents must be empty)
npx wrangler r2 bucket delete $(grep R2_BUCKET_NAME .env.local.generated | cut -d= -f2)
```

For auditing purposes, commit `.env.local.generated` to secrets management, not to version control.

## Rerun Behavior and Validation

### Safe Reruns

`bootstrap.sh` is designed to be safely rerun multiple times:

- **First run**: Creates all resources, stamps metadata, writes `.env.local.generated`
- **Subsequent runs**: Reuses existing resources by reconciliation, skips redundant operations
- **After config changes**: Updates resources as needed, preserves IDs

### What Gets Reused vs. Recreated

| Resource | Rerun Behavior | Lookup Strategy |
|----------|----------------|-----------------|
| **Stripe Products** | Reused by `metadata.project_id` and name | Query Stripe API for matching products |
| **Stripe Webhook** | Reused by URL | Query Stripe API for matching endpoints |
| **D1 Database** | Reused by cached ID or name | Check `.env.local.generated` first, verify remotely |
| **R2 Bucket** | Reused by cached name | Check `.env.local.generated` first, verify remotely |
| **Worker Secrets** | Skipped if already synced | Check `SYNCED_SECRET_NAMES` in `.env.local.generated` |
| **Wrangler Config** | Regenerated from template | Always updated |
| **Migrations** | Rerun (idempotent SQL) | Drizzle tracks applied migrations |
| **Project Seed** | Upserted | `ON CONFLICT(id) DO UPDATE` |

### Validation

See [BOOTSTRAP_VALIDATION.md](./BOOTSTRAP_VALIDATION.md) for:
- Detailed idempotency guarantees per resource type
- Acceptance test checklist
- Common rerun scenarios and expected outcomes
- Troubleshooting idempotency issues

**Quick validation:**

```bash
# First run
./bootstrap.sh

# Rerun - should see "Found existing" or "Verified" logs for all resources
./bootstrap.sh

# Dry-run after successful run - should show zero create operations
DRY_RUN=1 ./bootstrap.sh 2>&1 | grep -c "Would create"  # Should output: 0
```
