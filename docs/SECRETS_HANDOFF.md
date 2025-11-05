# Secrets Handoff – Logto & Worker

Use this checklist to supply the credentials required to finish Workstream 1. Keep all secrets out of git (store only in local `.env` files, CI secrets, or Cloudflare secret storage).

## Required Items
- `LOGTO_MANAGEMENT_ENDPOINT` – base URL of the Logto tenant (for example `https://<tenant>.logto.app`).
- EITHER `LOGTO_MANAGEMENT_AUTH_BASIC` (Base64 `client_id:client_secret` for the Logto Management API) OR the pair `LOGTO_CLIENT_ID` / `LOGTO_CLIENT_SECRET` (same management client).
- (Optional) `LOGTO_APPLICATION_ID` – existing SPA application id if you already provisioned one manually; otherwise bootstrap will create/update it once credentials land.
- Existing Cloudflare credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) and Stripe secrets already managed elsewhere.

Minimum Logto scopes: the management client must be able to call the Management API token endpoint with `scope=all` (or the narrower `applications:read applications:write secrets:read`).

## Where to Place Secrets
- **Local development**: add the variables above to your root `.env` (or export in shell) so helper scripts can run. Never commit the file.
- **Worker secret**: ensure `LOGTO_APPLICATION_ID`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` exist via `wrangler secret put ...` (see `docs/DEPLOYMENTS.md`).
- **CI**: store the same values in repository secrets (`LOGTO_MANAGEMENT_ENDPOINT`, `LOGTO_MANAGEMENT_AUTH_BASIC` or `LOGTO_CLIENT_ID` / `LOGTO_CLIENT_SECRET`, plus Stripe secrets).

## Verify & Sync (copy/paste)
```bash
# 1. Ensure the env vars are available (or present in .env)
export LOGTO_MANAGEMENT_ENDPOINT="https://<tenant>.logto.app"
export LOGTO_MANAGEMENT_AUTH_BASIC="<base64(client_id:client_secret)>"
# or export LOGTO_CLIENT_ID / LOGTO_CLIENT_SECRET instead of LOGTO_MANAGEMENT_AUTH_BASIC

# 2. Confirm Cloudflare token scopes
npm run assert:r2

# 3. Ensure the Worker secrets exist
npm run assert:secrets

# 4. Put / rotate Worker secrets when missing
wrangler secret put LOGTO_APPLICATION_ID --config workers/api/wrangler.toml
wrangler secret put STRIPE_SECRET_KEY --config workers/api/wrangler.toml
wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/api/wrangler.toml

# 5. Mint a short-lived Logto access token (stdout only; nothing saved)
export LOGTO_TOKEN="$(npm run --silent token:logto)"

# 6. Run authenticated smoke + screenshots once the token exists
npm run smoke -- --mode full --base "$LANDING_URL" --token "$LOGTO_TOKEN"
node scripts/smoke-screens.cjs --base "$LANDING_URL"
```

Each helper script logs a clear error if prerequisites are missing. The CI workflows (`bootstrap-validate.yml`, `smoke.yml`) also run `npm run assert:secrets` and `npm run assert:r2` before continuing, so the pipelines will halt until these values are in place.

## Finish once secrets land
```bash
# Remote bootstrap (records artefacts under test-results/bootstrap-<stamp>)
npm run validate:bootstrap:remote -- --token "$LOGTO_TOKEN"

# Full smoke + screenshots with token
npm run smoke -- --mode full --base "$LANDING_URL" --token "$LOGTO_TOKEN"
node scripts/smoke-screens.cjs --base "$LANDING_URL"

# Append summary to verification log
node - <<'PY'
from datetime import datetime
from pathlib import Path
stamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ')
note = f"\n## {stamp} authenticated evidence\n\n- bootstrap: test-results/bootstrap-{stamp.replace(':','').replace('-','')} (update path)\n- smoke: test-results/smoke/run-{stamp.replace(':','').replace('-','')}\n"
Path('test-results/final-verification.md').write_text(Path('test-results/final-verification.md').read_text() + note)
PY
```

## Related Docs
- `docs/SSO.md` – additional Logto token instructions
- `docs/bootstrap.md` – bootstrap script behaviour (secret sync)
- `docs/DEPLOYMENTS.md` – deployment & smoke guidance
- `docs/VERIFICATION.md` – recording verification artefacts
