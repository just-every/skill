# Deployment Playbook

## Pipelines
- **CI (preferred)**: `.github/workflows/deploy.yml` decodes `ENV_BLOB`, runs
  migrations, executes `pnpm bootstrap:deploy`, and attaches smoke artefacts.
- **Local fallback**: `pnpm bootstrap:deploy` using the same `~/.env` secrets.

## Standard Flow
1. `git checkout main && git pull`.
2. `pnpm bootstrap:env -- --check` to confirm generated files match secrets.
3. `pnpm bootstrap:deploy:dry-run` for a no-op render.
4. `pnpm bootstrap:deploy` (CI) or trigger the deploy workflow via `gh workflow
   run deploy.yml --field mode=deploy`.

## Post-deploy Verification
- `curl https://<domain>/api/status` → `{ "status": "ok" }`
- `curl https://<domain>/api/stripe/products` → non-empty array.
- `pnpm bootstrap:smoke --mode minimal --base https://<domain>` for automated
  screenshots + HTTP checks.

## Rollback
1. Use Cloudflare D1 Time Travel:
   `wrangler d1 time-travel restore <db> --timestamp=<ISO8601>`
2. Re-run `deploy.yml` against the previous commit via `workflow_dispatch`.

## Secrets
- All deployments rely on `ENV_BLOB`. Regenerate via
  `./scripts/generate-env-blob.sh ~/.env | pnpm publish:env-blob` after any
  bootstrap run that changes generated IDs or Stripe products.
