# Starter Stack (Cloudflare Worker + Expo)

Ultra-minimal starter: Cloudflare Worker (`workers/api`) plus Expo web (`apps/web`).
Secrets live in `~/.env`. `bootstrap.sh` renders config from `workers/api/wrangler.toml.template`
(no `wrangler.toml` committed).

## Prerequisites
- Node.js ≥ 18 and npm or pnpm
- Cloudflare account + Wrangler (authenticated)
- Optional: Stripe account
- Secrets in `~/.env` (see quick start)

## Quick Start (10–15 min)
1. Install
   ```bash
   npm install --workspaces
   ```
2. Prepare secrets (`~/.env`, then export) – use full URLs (include `https://`)
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
   > Bootstrap derives `PROJECT_HOST` from `PROJECT_DOMAIN` and uses it for Worker routes (wrangler template routes default to `{{PROJECT_ID}}.justevery.com`).
3. Bootstrap (provisions + generates config from the template)
   ```bash
   ./bootstrap.sh
   ```
4. Dev Worker (Miniflare on 127.0.0.1:8787)
   ```bash
   npm run dev:worker
   ```
5. Dev Web (point Expo at the worker)
   ```bash
   EXPO_PUBLIC_WORKER_ORIGIN=http://127.0.0.1:8787 npm run dev:web
   ```
6. Deploy Worker
   ```bash
   npm run deploy:worker
   ```
7. Verify
   ```bash
   curl -I https://starter.justevery.com/
   curl -s https://starter.justevery.com/api/session
   ```

More detail: `docs/QUICKSTART.md`. Legacy guides live under `docs/archive/`.
