# Bootstrapping Guide

The `bootstrap.sh` script provisions Cloudflare resources, templates Wrangler
configuration, and optionally seeds Stripe products based on the values in your
environment files.

## Prerequisites

- Node.js ≥ 18 and pnpm / npm for installing dependencies locally.
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated with an API token that has permission to manage Workers, KV, D1, and R2.
- `jq`, `curl`, and `sed` available on your PATH (installed by default on most developer machines).
- Valid API keys for Stytch and Stripe stored in `/home/azureuser/.env` or the project `.env` file.

## Required Environment Variables

Populate `.env` using `.env.example` as a template. At minimum you must define:

- `PROJECT_ID`
- `LANDING_URL` & `APP_URL`
- `CLOUDFLARE_ACCOUNT_ID` & `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_R2_BUCKET` (optional – falls back to `<project>-assets`)
- `STYTCH_PROJECT_ID` & `STYTCH_SECRET`
- `STRIPE_PRODUCTS` (shorthand or JSON array) and optionally `STRIPE_SECRET_KEY`

Set `DRY_RUN=1` to exercise the script without creating resources.

## Running the Script

```bash
# Preview without side effects
DRY_RUN=1 ./bootstrap.sh

# Execute against Cloudflare and Stripe
./bootstrap.sh
```

Key tasks performed:

1. Ensures the `wrangler`, `jq`, `curl`, and `sed` commands are available.
2. Loads environment variables from `/home/azureuser/.env` followed by `./.env`.
3. Verifies mandatory configuration values.
4. Creates or reuses Cloudflare D1, R2, and KV resources, matching names to `PROJECT_ID`.
5. Updates `workers/api/wrangler.toml` from the template, storing a backup copy.
6. Optionally provisions Stripe products + prices based on `STRIPE_PRODUCTS`.
7. Writes `.env.local.generated` containing resolved resource identifiers for future reference.

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

## Troubleshooting

- **wrangler auth errors**: run `wrangler login` or set `CLOUDFLARE_API_TOKEN` with the necessary scopes (Workers Scripts, KV Storage, D1, R2)
- **jq not found**: install via `brew install jq`, `apt install jq`, or your package manager.
- **Stripe provisioning skipped**: confirm `STRIPE_SECRET_KEY` and `STRIPE_PRODUCTS` are set.
- **Template values unchanged**: ensure the placeholders (e.g. `{{PROJECT_ID}}`) still exist in `workers/api/wrangler.toml.template`.

For auditing purposes, commit `.env.local.generated` to secrets management, not to version control.
