# Deployments

This project ships a Cloudflare Worker that fronts authentication (Logto), billing (Stripe), data (D1), and assets (R2). The `bootstrap.sh` script automates most resource provisioning so `wrangler deploy` can claim the routes immediately.

## Prerequisites

- Cloudflare account ID and API token with Workers, D1, R2, and Routes permissions (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`).
- Access to the `justevery.com` zone (`CLOUDFLARE_ZONE_ID`); bootstrap uses it when creating Worker routes.
- Logto management credentials (`LOGTO_MANAGEMENT_ENDPOINT`, `LOGTO_MANAGEMENT_AUTH_BASIC`).
- (Optional) Stripe API keys if you want bootstrap to seed products/webhooks (`STRIPE_TEST_SECRET_KEY` / `STRIPE_LIVE_SECRET_KEY` and `STRIPE_PRODUCTS`).
- Update `.env` from `.env.example` with project-specific URLs (`PROJECT_ID`, `PROJECT_DOMAIN`, `APP_URL`, `APP_BASE_URL` if you need a non-default path).

## Bootstrap workflow

```bash
# Local setup (reconcile config and start the Worker on http://127.0.0.1:8787)
./bootstrap.sh

# Full provisioning + remote deploy
./bootstrap.sh --deploy
```

### Local mode (`./bootstrap.sh`)

- Loads env vars, derives defaults, and updates Logto application metadata (redirect URIs include both local and production entries).
- Templates `workers/api/wrangler.toml` and builds the Expo bundle.
- Runs D1 migrations against the **local preview** database and seeds the default project row locally.
- Writes `.env.local.generated` with resolved identifiers and Stripe metadata.
- Launches `npm run dev:worker` on `http://127.0.0.1:8787` (unless the port is already in use).
- Skips Cloudflare D1/R2 reconciliation, Stripe provisioning, and Worker secret sync — no remote mutations occur.

### Deploy mode (`./bootstrap.sh --deploy`)

In addition to the local steps above, deploy mode:

1. Authenticates Wrangler (`wrangler whoami`).
2. Ensures Cloudflare D1 and R2 resources exist (creates them if missing).
3. Runs D1 migrations and seeds the `projects` table **remotely**.
4. Reconciles Stripe products and webhook endpoints (requires `STRIPE_SECRET_KEY`).
5. Pushes Worker secrets (`LOGTO_APPLICATION_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) via `wrangler secret put`.
6. Uploads a placeholder asset to R2.
7. Runs `wrangler deploy` to publish the Worker and claim routes.

After a deploy, source `.env.local.generated` (or commit relevant identifiers under secrets management) so subsequent local runs reuse cached resource IDs.

## Managing secrets

Bootstrap automatically syncs the key Worker secrets. For manual rotations or additional environments, use Wrangler (add `--env production` if you maintain multiple environments):

```bash
wrangler secret put LOGTO_APPLICATION_ID --config workers/api/wrangler.toml
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

1. Visit `PROJECT_DOMAIN` – the Worker should serve the marketing page.
2. Navigate to `/login` – ensure the redirect URL points to `${APP_URL}/auth/callback`.
3. Complete an SSO flow to confirm the Worker sets the `je_session` cookie and the app shell loads.
4. Trigger the Stripe webhook (or use the dashboard's "send test" feature) to verify signature validation.
5. When credentials are available, run the full checklist in `docs/BOOTSTRAP_VALIDATION.md` and archive the artefacts under `test-results/bootstrap-<ISO>/`.

## Smoke Suite and Artefact Capture

After any deployment or configuration change, run the smoke suite to verify critical endpoints and capture evidence:

```bash
# Full smoke suite (requires Wrangler access for D1 and secrets checks)
node scripts/run-smoke-suite.cjs --base https://demo.justevery.com --mode full

# Minimal smoke suite (HTTP checks only, no Wrangler calls)
node scripts/run-smoke-suite.cjs --base https://demo.justevery.com --mode minimal

# With authenticated token for /api/session checks
export LOGTO_TOKEN="<access_token>"
node scripts/run-smoke-suite.cjs --base https://demo.justevery.com --token "$LOGTO_TOKEN"
```

### Artefacts Generated

Each smoke run creates a timestamped folder under `test-results/smoke/<timestamp>/`:

- **`report.json`** – Full report including checks, D1 status, and Worker secrets status.
- **`checks.json`** – Array of all HTTP check results with headers and body snippets.
- **`report.md`** – Human-readable markdown summary.
- **`artefacts/`** – Directory containing full response JSON and headers for special endpoints (e.g., `callback-error-debug-response.json` for `/callback?error=debug`).
- **`screens-manifest.json`** – Screenshot metadata (if `smoke-screens.cjs` runs).
- **`*.png`** – Screenshots of key pages.

### Updating final-verification.md

After each significant deployment or bootstrap validation, update the final verification document:

1. **Run the smoke suite** and note the timestamp:
   ```bash
   node scripts/run-smoke-suite.cjs --base https://demo.justevery.com
   # Outputs: "Smoke suite completed. Artifacts in test-results/smoke/20251104-211353"
   ```

2. **Review the artefacts** in `test-results/smoke/<timestamp>/`:
   - Check `report.md` for pass/fail status of all checks.
   - Inspect `artefacts/callback-error-debug-response.json` to confirm `/callback?error=debug` returns JSON (not HTML) with a 400 status.
   - Review screenshots for visual regressions.

3. **Append to final-verification.md** (create if missing):
   ```markdown
   ## Smoke Check – <YYYY-MM-DD>

   **Base URL**: https://demo.justevery.com
   **Mode**: full
   **Artefacts**: `test-results/smoke/<timestamp>/`

   ### Results
   - All HTTP checks passed: ✅ / ❌
   - `/callback?error=debug` returned 400 with JSON body: ✅ / ❌
   - D1 projects table query succeeded: ✅ / ❌
   - Worker secrets present (LOGTO_APPLICATION_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET): ✅ / ❌
   - Screenshots captured: ✅ / ❌

   ### Notes
   - [Any deviations, blockers, or manual steps taken]
   ```

4. **Commit the artefacts** (optional but recommended for audit trails):
   ```bash
   git add test-results/smoke/<timestamp>/
   git commit -m "docs: smoke check evidence for <deployment-date>"
   ```

## Secrets rotation

Keep cloud credentials fresh and update GitHub Secrets after each rotation:

- **Cloudflare** – Rotate the API token in the Cloudflare dashboard (Workers + Routes + D1 + R2 scopes). Update `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_ZONE_ID` secrets in GitHub.
- **Logto** – Ensure the SPA application metadata (redirect URIs, CORS) is current. Update `LOGTO_MANAGEMENT_ENDPOINT` / `LOGTO_MANAGEMENT_AUTH_BASIC` in GitHub Secrets if rotated; bootstrap will sync `LOGTO_APPLICATION_ID` for the Worker.
- **Stripe** – Rotate API keys in the Stripe dashboard. Update `STRIPE_SECRET_KEY` (test and/or live) and re-run bootstrap to recreate the webhook secret; store the new `STRIPE_WEBHOOK_SECRET` via `wrangler secret put`.
- **GitHub Actions** – After rotating any vendor secret, visit Settings → Secrets → Actions for this repo and replace the stored value. The deploy workflow reads from these secrets on every run.

## Troubleshooting

- **Missing routes** – Rerun `./bootstrap.sh --deploy` to recreate the Worker routes. Confirm `CLOUDFLARE_ZONE_ID` and API token scopes.
- **403s when calling Cloudflare API** – Use an API token with the “Workers Routes: Edit” permission or fall back to email/API key pairs.
- **Logto token rejected** – Confirm the frontend is sending a current access token (via the Logto React SDK) and that the Worker bindings (`LOGTO_ISSUER`, `LOGTO_JWKS_URI`, `LOGTO_API_RESOURCE`) match the tenant configuration.
- **Stripe webhook failures** – Confirm `STRIPE_SECRET_KEY` matches the environment (test vs live) and redeploy after bootstrap refreshes `STRIPE_WEBHOOK_SECRET`.

## Deployment History

- **2025-11-04 – Local Validation (Miniflare)** – Generated via `npm run validate:bootstrap`. HTTP endpoints responded as expected (/, /payments 200; `/api/session` 401 unauthenticated; `/callback` 400). Local D1 query succeeded; R2 listing skipped (no local bucket). Artefacts: `test-results/bootstrap-20251104-113635/` (`SUMMARY.md`, `report.json`).
- **Pending Remote Validation (2025-11-04)** – Attempted `npm run validate:bootstrap:remote -- --base https://demo.justevery.com`; blocked by missing credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `LOGTO_MANAGEMENT_ENDPOINT`, `LOGTO_MANAGEMENT_AUTH_BASIC`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). See `test-results/bootstrap-20251104-114629/` (`secrets-audit.txt`) and follow `docs/SECRETS_SETUP.md` before re-running.
