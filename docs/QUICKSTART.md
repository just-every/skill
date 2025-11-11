# Quick Start

Minimal flow to go from clone → deploy in 10–15 minutes.

## Overview
- Cloudflare Worker: `workers/api`
- Expo web app: `apps/web`
- Secrets live in `~/.env`
- `pnpm bootstrap:*` commands handle provisioning (`bootstrap.sh` is now a shim)

## Prerequisites
- Node.js ≥ 18, npm or pnpm
- Cloudflare account + Wrangler (authenticated)
- Optional: Stripe account (see `docs/BILLING.md` for billing setup)

## Steps
1. Install
   ```bash
   pnpm install
   ```

2. Secrets (`~/.env`, then export)
   ```
   PROJECT_ID=starter
   PROJECT_DOMAIN=https://starter.justevery.com
   APP_URL=https://starter.justevery.com/app
   CLOUDFLARE_ACCOUNT_ID=<id>
   CLOUDFLARE_API_TOKEN=<token>
   # Optional Stripe (see docs/BILLING.md)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRODUCTS='[{"productId":"prod_...","priceId":"price_..."}]'
   ```
   ```bash
   set -a; source ~/.env; set +a
   ```
   _See `docs/SECRETS_CLOUDFLARE.md` for instructions on obtaining your Cloudflare Account ID and API Token. See `docs/BILLING.md` for Stripe configuration. Bootstrap calculates `PROJECT_HOST` from `PROJECT_DOMAIN` automatically and uses it when claiming Worker routes (wrangler template routes default to `{{PROJECT_ID}}.justevery.com`)._

3. Bootstrap (preflight → env → deploy)
   ```bash
   pnpm bootstrap:preflight
   pnpm bootstrap:env
   pnpm bootstrap:deploy:dry-run   # optional validation
   ```
   - Generates `.env.local.generated` and renders `workers/api/wrangler.toml` on demand.

4. Run the Worker (local)
   ```bash
   npm run dev:worker
   ```
   - Default URL: `http://127.0.0.1:8787`
   - Optional: copy `workers/api/.dev.vars.example` → `.dev.vars` for custom bindings.

5. Run the web app (point to the worker)
   ```bash
   EXPO_PUBLIC_WORKER_ORIGIN=http://127.0.0.1:8787 npm run dev:web
   ```

6. Deploy the Worker
   ```bash
   pnpm bootstrap:deploy:dry-run   # validation
   pnpm bootstrap:deploy           # real deploy
   ```
   For GitHub Actions deployments, set up repository secrets as described in `docs/SECRETS_CLOUDFLARE.md`.

7. Verify
   ```bash
   curl -I https://starter.justevery.com/
   curl -s https://starter.justevery.com/api/session
   # Optional: verify Stripe integration
   curl -s https://starter.justevery.com/api/accounts/justevery/billing/products
   ```
   - Expect 401 from `/api/session` without a bearer token; rerun with a valid token to confirm auth.
   - See `docs/BILLING.md` for checkout/portal/invoice cURL flows.

Re-run the CLI when secrets or infrastructure change. `bootstrap.sh` remains as a shim but is deprecated.
