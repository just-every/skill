# Starter Stack (Cloudflare Worker + Expo)

Ultra-minimal starter: Cloudflare Worker (`workers/api`) plus Expo web (`apps/web`).
Secrets live in `~/.env`. The Node-based bootstrap CLI renders config from
`workers/api/wrangler.toml.template` (no `wrangler.toml` committed). Authentication via Better Auth
(login.justevery.com OIDC worker). Better Auth now scopes the
`better-auth.session_token` cookie to `/api/*`, so anything that needs the
session (e.g. `/api/accounts`, `/api/me`) must be served from `/api` or proxied
through the Worker—direct browser calls to non-`/api` paths will never receive
the cookie.

Session verification relies on a Cloudflare Service Binding (`LOGIN_SERVICE`)
that points to the `login` worker. Make sure every environment’s
`wrangler.toml` keeps that binding in sync, otherwise the Worker will try to
hit the DNS origin directly and time out.

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
   `CLOUDFLARE_*`, `STRIPE_*`, and Better Auth secrets stay exclusively in `~/.env`; the checked-in `.env.example` only documents non-sensitive defaults.
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

### Using this repo as a template

`docs/STARTER_TEMPLATE.md` walks through cloning this repository for a new product, renaming the project, running the bootstrap CLI, and validating the Worker + Expo surfaces. Share that doc with downstream teams so every fork follows the same provisioning + verification steps.

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

### Workflow

- `.github/workflows/deploy.yml` – runs on push to `main`; decodes ENV_BLOB, runs Wrangler migrations, calls `pnpm bootstrap:deploy`, uploads artifacts, and (when a test cookie exists) runs the authenticated Playwright suite.

### Rollback

1. Use Time Travel to rewind the D1 database: `wrangler d1 time-travel restore starter-d1 --timestamp=<ISO8601>` (or `--bookmark=<id>`). CI logs the `time-travel info` bookmark during deploys; you can capture a fresh one locally with `wrangler d1 time-travel info starter-d1` before experimenting.
2. Re-run `deploy.yml` pointing at the previous commit via `workflow_dispatch`.

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

**D1 Time Travel** – Cloudflare keeps 30 days of point-in-time history for production D1 databases by default. Use `wrangler d1 time-travel info starter-d1` to capture a bookmark before risky changes, and `wrangler d1 time-travel restore starter-d1 --timestamp=<ISO8601>` (or `--bookmark=<id>`) to roll back. Because of this, we do **not** export SQL dumps in CI—avoid re‑adding manual backups. (Docs: <https://developers.cloudflare.com/d1/reference/time-travel/>)

**SSR Validation** – Follow `docs/SSR_MARKETING.md` (or run `pnpm --filter @justevery/web run build` + `pnpm bootstrap:smoke`) before promoting changes.

**Smoke Tests** – `pnpm bootstrap:smoke` exercises Worker APIs, assets, and Better Auth bindings; add `--minimal` in CI for fast checks.

For runbooks and deeper troubleshooting, start with the `docs/` folder.

- Reference `docs/VERIFY.md` for the post-deploy smoke checks, `docs/TEMPLATE_READY.md` for the overall template checklist, and `docs/ACCEPTANCE.md` for the acceptance summary.
- Playwright smoke now focuses on public surfaces; run `RUN_OPEN_E2E=true npm run test:e2e` to exercise landing/login/checkout. Authenticated coverage will return once the login worker ships M2M tokens, at which point we can add non-cookie credentials back to CI.
