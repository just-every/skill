# Logto Token & Secret Operations

These steps help you mint a temporary Logto access token for smoke tests and keep the Worker’s application secret in sync. Never commit real credentials to the repo.

## 1. Prerequisites
- `PROJECT_DOMAIN` exported or present in `.env`.
- Logto tenant details configured in `.env.local.generated` / Wrangler secrets (`LOGTO_ISSUER`, `LOGTO_API_RESOURCE`, etc.).
- `wrangler` authenticated against the target Cloudflare account.

## 2. Mint a Temporary Logto Access Token
Choose one of the flows below:

### Option A – Hosted login (recommended)
1. Open `${PROJECT_DOMAIN}/login` in a browser.
2. Sign in with a disposable test account.
3. In DevTools run `window.localStorage.getItem('logto:session')` (or inspect the network tab) to copy the `access_token`.
4. Export it for tooling:
   ```bash
   export LOGTO_TOKEN='<copied_access_token>'
   ```

### Option B – Client credentials (if your tenant exposes an API client)
1. Export credentials locally (do not commit them):
   ```bash
   export LOGTO_ENDPOINT='https://login.justevery.com'
   export LOGTO_API_RESOURCE='https://demo.justevery.com/api'
   export LOGTO_CLIENT_ID='<machine_to_machine_client_id>'
   export LOGTO_CLIENT_SECRET='<machine_to_machine_client_secret>'
   ```
2. Request a token using the helper script:
   ```bash
   export LOGTO_TOKEN="$(npm run --silent token:logto)"
   ```
   The script writes token metadata (method, claims, expiry) to `test-results/logto-token.meta.json` without persisting the token itself.

   Alternatively, use curl directly:
   ```bash
   export LOGTO_TOKEN="$(curl -s -X POST "$LOGTO_ENDPOINT/oidc/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode 'grant_type=client_credentials' \
     --data-urlencode "client_id=$LOGTO_CLIENT_ID" \
     --data-urlencode "client_secret=$LOGTO_CLIENT_SECRET" \
     --data-urlencode "resource=$LOGTO_API_RESOURCE" \
     | jq -r .access_token)"
   ```
   Ensure the client is authorised for `LOGTO_API_RESOURCE`.

Once exported, the smoke suite automatically uses `LOGTO_TOKEN` for authenticated checks.

## 3. Sync Worker Secrets
1. Ensure the Worker has the SPA application id and Stripe secrets:
   ```bash
   wrangler secret put LOGTO_APPLICATION_ID --config workers/api/wrangler.toml
   wrangler secret put STRIPE_SECRET_KEY --config workers/api/wrangler.toml
   wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/api/wrangler.toml
   ```
2. Verify the secrets are present:
   ```bash
   wrangler secret list --config workers/api/wrangler.toml
   ```
3. (Optional) Record the values in `.env` so `bootstrap.sh` can sync them automatically.

## 4. Run Local Smoke Checks
```bash
export PROJECT_DOMAIN='https://demo.justevery.com'
npm run smoke -- --mode full
```
Artefacts are written to `test-results/smoke/run-<timestamp>/`, including `checks/<endpoint>/headers.json` and a JSON or text capture for `/callback?error=debug`.
