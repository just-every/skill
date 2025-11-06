# Quick Start

Minimal flow to go from clone → deploy in 10–15 minutes.

## Overview
- Cloudflare Worker: `workers/api`
- Expo web app: `apps/web`
- Secrets live in `~/.env`
- `bootstrap.sh` renders config from `workers/api/wrangler.toml.template` (no `wrangler.toml` committed)

## Prerequisites
- Node.js ≥ 18, npm or pnpm
- Cloudflare account + Wrangler (authenticated)
- Optional: Stripe account

## Steps
1. Install
   ```bash
   npm install --workspaces
   ```

2. Secrets (`~/.env`, then export)
   ```
   PROJECT_ID=starter
   PROJECT_DOMAIN=https://starter.justevery.com
   APP_URL=https://starter.justevery.com/app
   CLOUDFLARE_ACCOUNT_ID=<id>
   CLOUDFLARE_API_TOKEN=<token>
   # Optional Stripe
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   ```bash
   set -a; source ~/.env; set +a
   ```
   _Bootstrap calculates `PROJECT_HOST` from `PROJECT_DOMAIN` automatically and uses it when claiming Worker routes (wrangler template routes default to `{{PROJECT_ID}}.justevery.com`)._

3. Bootstrap (provisions Cloudflare + renders config)
   ```bash
   ./bootstrap.sh
   ```
   - Generates `.env.local.generated` and a runtime `wrangler.toml` from the template.

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
   npm run deploy:worker
   ```

7. Verify
   ```bash
   curl -I https://starter.justevery.com/
   curl -s https://starter.justevery.com/api/session
   ```
   - Expect 401 from `/api/session` without a bearer token; rerun with a valid token to confirm auth.

Re-run `./bootstrap.sh` whenever secrets or resources change. Archived legacy docs live under `docs/archive/`.
