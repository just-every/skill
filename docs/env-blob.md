# ENV_BLOB Reference

`ENV_BLOB` is a single base64-encoded blob that GitHub Actions decodes into `.env.ci`
before exporting every key into the job environment. Regenerate it whenever you rotate
credentials or bootstrap new infrastructure IDs.

## Required Keys

| Key | Purpose | Source |
| --- | --- | --- |
| `PROJECT_ID` | Namespaces the Worker, R2 bucket, and D1 database | `.env` / bootstrap CLI |
| `PROJECT_DOMAIN` | User-facing domain for auth + routing | `.env` |
| `CLOUDFLARE_ACCOUNT_ID` | Account used by Wrangler & API token | Cloudflare dashboard |
| `CLOUDFLARE_API_TOKEN` | Token with Workers, D1, and R2 scopes | Cloudflare dashboard |
| `D1_DATABASE_NAME` | Friendly D1 database name Wrangler targets | `pnpm bootstrap:env` output |
| `D1_DATABASE_ID` or `CLOUDFLARE_D1_ID` | UUID for the remote D1 database | bootstrap CLI or Cloudflare UI |
| `CLOUDFLARE_R2_BUCKET` | Bucket bound as `STORAGE` inside the Worker | bootstrap CLI or Cloudflare UI |
| `STRIPE_SECRET_KEY` | Stripe API key used for provisioning + runtime | Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Used by Worker to verify Stripe webhooks | bootstrap CLI output |

### Recommended Extras

| Key | Reason |
| --- | --- |
| `APP_URL`, `APP_BASE_URL`, `WORKER_ORIGIN` | Keep Expo + Worker URLs consistent between local and CI |
| `BETTER_AUTH_URL`, `LOGIN_ORIGIN`, `SESSION_COOKIE_DOMAIN` | Ensure auth + cookies are routed to the right domains |
| `STRIPE_PRODUCTS` (JSON) | Lists product + price IDs so bootstrap runs stay deterministic |

> **Tip**: Run `pnpm bootstrap:env` after editing `.env` files. It rewrites
> `.env.local.generated` / `workers/api/.dev.vars` and is the canonical source for generated IDs.

## Packing a New Blob

1. Ensure your local `.env.production` (or preferred file) contains the keys above.
2. Convert it to a single-line base64 string:

```bash
base64 < .env.production | tr -d "\n"
```

3. Update the GitHub secret:

```bash
gh secret set ENV_BLOB --repo just-every/project --body "$(base64 < .env.production | tr -d "\n")"
```

### Helper Script

Use the provided helper to avoid copy/paste mistakes:

```bash
# Defaults to .env.production if present, otherwise .env
./scripts/generate-env-blob.sh .env.production | pbcopy

# Example: refresh the repo secret
./scripts/generate-env-blob.sh .env.production \
  | gh secret set ENV_BLOB --repo just-every/project --body -
```

## Preflight Checklist

- [ ] `PROJECT_ID` matches the deployed Worker (see `workers/api/wrangler.toml`).
- [ ] `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` are valid (`pnpm bootstrap:preflight`).
- [ ] `D1_DATABASE_NAME` / `D1_DATABASE_ID` point at the intended environment.
- [ ] `CLOUDFLARE_R2_BUCKET` exists (rerun `pnpm bootstrap:apply` if unsure).
- [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are populated (`whsec_...`).
- [ ] Blob rebuilt after any bootstrap run that changed generated values.

Following this checklist prevents the "ENV_BLOB secret is required" failure in CI and
ensures the bootstrap CLI can render the correct Worker configuration.
