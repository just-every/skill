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
   FONT_AWESOME_PACKAGE_TOKEN=<npm-fontawesome-token>
   # Optional Stripe (see docs/BILLING.md)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRODUCTS='[{"productId":"prod_...","priceId":"price_..."}]'
   ```
   ```bash
   set -a; source ~/.env; set +a
   ```
   The bootstrap CLI and install hooks mirror `FONT_AWESOME_PACKAGE_TOKEN` into `.npmrc` automatically, so private Font Awesome packages are available both locally and in CI.
   _See `docs/SECRETS_CLOUDFLARE.md` for instructions on obtaining your Cloudflare Account ID and API Token. See `docs/BILLING.md` for Stripe configuration. Bootstrap calculates `PROJECT_HOST` from `PROJECT_DOMAIN` automatically and uses it when claiming Worker routes (wrangler template routes default to `{{PROJECT_ID}}.justevery.com`)._

3. Bootstrap (preflight → env → deploy)
   ```bash
   pnpm bootstrap:preflight
   pnpm bootstrap:env
   pnpm bootstrap:deploy:dry-run   # optional validation
   ```
   - Generates `.env.local.generated` and renders `workers/api/wrangler.toml` on demand.

### `pnpm bootstrap:deploy` behavior
- Loads `~/.env`, `.env`, and any generated env files so you can keep secrets in your home directory and still share repo-specific defaults.
- Validates required bindings (Stripe keys, Better Auth/Tenant config, Cloudflare account/D1/R2 settings, etc.) before provisioning infrastructure.
- Provisions Stripe products/prices from the plan definitions you shipped in `STRIPE_PRODUCTS`, then writes a structured JSON payload back to your generated env files for the Worker and UI to consume.
- The generated `STRIPE_PRODUCTS` now includes the associated `priceId`, `unitAmount`, `currency`, `interval`, `description`, and `metadata` for each plan; the Worker uses this data to power the Billing plan list and to gate Checkout buttons until a real Stripe price exists.
  ```bash
  STRIPE_PRODUCTS='[
    {"id":"prod_TNHA7XzCAXqNfU","name":"Founders","description":"Founders plan","priceId":"price_1SQWcDGD1Q57MReNLuvln86m","unitAmount":2500,"currency":"usd","interval":"month","metadata":{}},
    {"id":"prod_TNHAmpDbavwPfp","name":"Scale","description":"Scale plan","priceId":"price_1SQWcDGD1Q57MReNhTRLLXWa","unitAmount":4900,"currency":"usd","interval":"month","metadata":{}}
  ]'
  ```

  The Worker/UI read this payload (via `/api/stripe/products` and the Billing screen) so plan cards know which Stripe price to call when Checkout or the portal is requested.

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

## Release verification notes
- For release-ready verification, see `docs/VERIFY.md` (smoke checks, Playwright artifacts), `docs/TEMPLATE_READY.md` (template-ready checklist), and `docs/ACCEPTANCE.md` (final goal-to-file/tets/artifacts mapping). 
- The gated Copy/Team/Billing Playwright suite requires a Better Auth `TEST_SESSION_COOKIE` (Owner/Admin session) in CI; when absent the job skips automatically, but you can set `RUN_OPEN_E2E=true` locally once you have credentials to exercise the landing/login/checkout spec bundle.
