# Starter Stack (Cloudflare Worker + Expo)

Ultra-minimal starter: Cloudflare Worker (`workers/api`) plus Expo web (`apps/web`).
Secrets live in `~/.env`. The Node-based bootstrap CLI renders config from
`workers/api/wrangler.toml.template` (no `wrangler.toml` committed). Authentication via Better Auth
(login.justevery.com OIDC worker).

## Prerequisites
- Node.js ≥ 18 and npm or pnpm
- Cloudflare account + Wrangler (authenticated)
- Optional: Stripe account
- Secrets in `~/.env` (see quick start)

## Quick Start (CLI)
1. Install dependencies
   ```bash
   pnpm install
   ```
2. Copy the env template and export secrets
   ```bash
   cp .env.example ~/.env
   $EDITOR ~/.env
   set -a; source ~/.env; set +a
   ```
   Annotated keys live in `docs/ENVIRONMENT_VARIABLE_MAPPING.md`. See `docs/SECRETS_CLOUDFLARE.md` for instructions on obtaining Cloudflare API credentials.
3. Bootstrap infrastructure
   ```bash
   pnpm bootstrap:preflight
   pnpm bootstrap:env
   pnpm bootstrap:deploy:dry-run   # optional validation
   ```
4. Develop locally
   ```bash
   pnpm run dev:worker
   EXPO_PUBLIC_WORKER_ORIGIN=http://127.0.0.1:8787 pnpm run dev:web
   ```
5. Deploy & verify
   ```bash
   pnpm bootstrap:deploy:dry-run
   pnpm bootstrap:deploy
   pnpm bootstrap:env -- --check           # confirm generated files are current
   curl -I https://starter.justevery.com/
   curl -s https://starter.justevery.com/api/session
   ```

More detail: `docs/QUICKSTART.md`. Prefer the `pnpm bootstrap:*` commands—the legacy shell scripts have been archived for reference only. For marketing SSR + bot validation notes, see `docs/SSR_MARKETING.md`.

## GitHub Actions (ENV_BLOB)

The repo now uses a single secret (`ENV_BLOB`) that contains your entire `.env`. See
`docs/env-blob.md` for the required keys and maintenance checklist. To sync:

```bash
./scripts/sync-env-to-github.sh          # reads $HOME/.env by default
```

Need a one-off blob for testing? Run `./scripts/generate-env-blob.sh .env`
and paste the output into `gh secret set ENV_BLOB`.

**Initial bootstrap shortcut:** `pnpm bootstrap:deploy:new` runs the full bootstrap
pipeline and immediately publishes a refreshed `ENV_BLOB` secret to the
`production` environment (requires `gh auth login` or a `GH_TOKEN`). After that,
CI’s `deploy.yml` handles all incremental deploys.

### Workflows

- `.github/workflows/deploy.yml` – runs on push to `main`; decodes ENV_BLOB, exports a D1 backup, runs migrations, calls `pnpm bootstrap:deploy`, and uploads artifacts.
- `.github/workflows/deploy-dry-run.yml` – manual dry run for validation.
- `.github/workflows/backup-nightly.yml` – nightly `wrangler d1 export` with artifact retention.

### Rollback

1. Grab the backup artifact from the deploy run (SQL file under `d1-backup-*`).
2. Restore: `wrangler d1 execute <DB_NAME> --remote --file=backup.sql`.
3. Re-run `deploy.yml` pointing at the previous commit via `workflow_dispatch`.

## Bootstrap CLI
- `pnpm bootstrap:preflight` – validations (Cloudflare token, required envs)
- `pnpm bootstrap:env` – writes `.env.local.generated` and `workers/api/.dev.vars`
- `pnpm bootstrap:deploy` – render `wrangler.toml`, sync secrets, and deploy the Worker
- `pnpm bootstrap:deploy:dry-run` – render and validate without deploying
- `pnpm bootstrap:smoke` – HTTP + screenshot smoke checks against a base URL
- `pnpm bootstrap:env -- --check` – diff generated files without writing

Rollback: rerunning the previous release of the CLI is safe—`pnpm bootstrap:deploy:dry-run`
shows exactly what would change and `pnpm bootstrap:env -- --check` confirms generated files
before writing.

See `docs/BOOTSTRAP-CLI-MIGRATION.md` for the full migration guide.

## Appendix: Operations Tips

**ENV_BLOB Deploy** – Secrets travel via `pnpm bootstrap:deploy`; see `docs/SECRETS_CLOUDFLARE.md` for token setup and rotation.

**Nightly D1 Backups** – Managed by `.github/workflows/backup-nightly.yml`; database IDs live in rendered `wrangler.toml` for manual exports.

**SSR Validation** – Follow `docs/SSR_MARKETING.md` (or run `pnpm --filter @justevery/web run build` + `pnpm bootstrap:smoke`) before promoting changes.

**Smoke Tests** – `pnpm bootstrap:smoke` exercises Worker APIs, assets, and Better Auth bindings; add `--minimal` in CI for fast checks.

For runbooks and deeper troubleshooting, start with the `docs/` folder.
