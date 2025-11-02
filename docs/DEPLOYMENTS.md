# Deployments

This project ships a Cloudflare Worker that fronts authentication (Stytch), billing (Stripe), data (D1 + KV), and assets (R2). The `bootstrap.sh` script automates most resource provisioning so `wrangler deploy` can claim the routes immediately.

## Prerequisites

- Cloudflare account ID and API token with Workers, KV, D1, R2, and Routes permissions (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`).
- Access to the `justevery.com` zone (`CLOUDFLARE_ZONE_ID`); bootstrap uses it when creating Worker routes.
- Stytch project credentials (`STYTCH_PROJECT_ID`, `STYTCH_SECRET`).
- (Optional) Stripe API keys if you want bootstrap to seed products/webhooks (`STRIPE_TEST_SECRET_KEY` / `STRIPE_LIVE_SECRET_KEY` and `STRIPE_PRODUCTS`).
- Update `.env` from `.env.example` with project-specific URLs (`PROJECT_ID`, `LANDING_URL`, `APP_URL`, `APP_BASE_URL` if you need a non-default path).

## Bootstrap workflow

```bash
# Dry run (no API mutations, helpful for verification)
DRY_RUN=1 ./bootstrap.sh

# Full provisioning
./bootstrap.sh
```

Key steps performed (non dry-run):

1. Authenticates Wrangler (`wrangler whoami`) using `CLOUDFLARE_API_TOKEN`.
2. Ensures Cloudflare D1 database, KV namespace, and R2 bucket exist (creates them if missing).
3. Templates `workers/api/wrangler.toml` with project identifiers, bindings, route patterns, and service variables.
4. Creates/updates proxied DNS A records (default `192.0.2.1`) for the landing/app hosts and records the names in `.env.local.generated`.
5. Calls the Cloudflare API to ensure Worker routes exist for the landing host and app path, recording the pattern(s) in `.env.local.generated`.
6. Runs D1 migrations and seeds the `projects` table with the landing/app URLs.
7. Seeds Stripe products (if Stripe credentials and `STRIPE_PRODUCTS` are supplied).
8. Creates a Stripe webhook at `${LANDING_URL}/webhook/stripe` and stores `STRIPE_WEBHOOK_SECRET`.
9. Pushes Worker secrets (`STYTCH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) via `wrangler secret put` unless `SYNC_SECRETS=0`.
10. Syncs Stytch redirect URLs (and, when configured, connection domains) via the Stytch Management API.
11. Uploads a placeholder asset to R2.
12. Writes `.env.local.generated` with resolved identifiers, secrets, DNS records, and route patterns.

Dry runs skip remote mutations, print `[dry-run] ...` log lines for each action, and still generate `.env.local.generated` using placeholder identifiers so you can inspect templating.

## Managing secrets

Bootstrap automatically syncs the key Worker secrets unless you export `SYNC_SECRETS=0`. For manual rotations or additional environments, use Wrangler (add `--env production` if you maintain multiple environments):

```bash
wrangler secret put STYTCH_SECRET --config workers/api/wrangler.toml
wrangler secret put STRIPE_SECRET_KEY --config workers/api/wrangler.toml
wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/api/wrangler.toml
```

## Deploying the Worker

```bash
pnpm install
pnpm --filter @justevery/worker build   # if you add a build step later
wrangler deploy --config workers/api/wrangler.toml
```

After deployment Cloudflare claims the routes recorded in `.env.local.generated` (typically `${PROJECT_ID}.justevery.com/*` and `${PROJECT_ID}.justevery.com/app*`).

## Post-deploy verification

1. Visit `LANDING_URL` – the Worker should serve the marketing page.
2. Navigate to `/login` – ensure the redirect URL points to `${APP_URL}/auth/callback`.
3. Complete an SSO flow to confirm the Worker sets the `je_session` cookie and the app shell loads.
4. Trigger the Stripe webhook (or use the dashboard’s “send test” feature) to verify signature validation.

## Secrets rotation

Keep cloud credentials fresh and update GitHub Secrets after each rotation:

- **Cloudflare** – Rotate the API token in the Cloudflare dashboard (Workers + Routes + KV + D1 + R2 scopes). Update `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_ZONE_ID` secrets in GitHub.
- **Stytch** – Generate a new project secret from Stytch Console → Project Settings. Update `STYTCH_SECRET` (and `STYTCH_PROJECT_ID` if it changes) in GitHub Secrets, then rerun the workflow to refresh the Worker secret via bootstrap or `wrangler secret put`.
- **Stripe** – Rotate API keys in the Stripe dashboard. Update `STRIPE_SECRET_KEY` (test and/or live) and re-run bootstrap to recreate the webhook secret; store the new `STRIPE_WEBHOOK_SECRET` via `wrangler secret put`.
- **GitHub Actions** – After rotating any vendor secret, visit Settings → Secrets → Actions for this repo and replace the stored value. The deploy workflow reads from these secrets on every run.

## Troubleshooting

- **Missing routes** – Rerun bootstrap (non dry-run) to recreate the Worker routes. Confirm `CLOUDFLARE_ZONE_ID` and API token scopes.
- **403s when calling Cloudflare API** – Use an API token with the “Workers Routes: Edit” permission or fall back to email/API key pairs.
- **Stytch redirect not allowed** – Ensure credentials are present during bootstrap so `sync_stytch_redirects` can register URLs, or add them manually in the Stytch dashboard.
- **Stripe webhook failures** – Confirm `STRIPE_SECRET_KEY` matches the environment (test vs live) and redeploy after bootstrap refreshes `STRIPE_WEBHOOK_SECRET`.
