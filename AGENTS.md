# Repository Guidelines

This repository is the canonical justevery starter stack; future products should branch from it and preserve shared automation, docs, and infra conventions.

## Project Structure & Module Organization
- `apps/web/` hosts the Expo placeholder shell; share config via `packages/config`.
- `apps/web/src/profile/` exposes `useJustEveryProfilePopup` which wraps the hosted `profile-popup.js` helper from the login worker. Use `openProfilePopup` in the app shell to show account/settings/orgs/billing; the helper handles the iframe and events.
- `workers/api/` runs the Cloudflare Worker with Wrangler config, D1 access, and Vitest suites; keep bindings in `Env`.
- `docs/archive/` keeps operational playbooks (`bootstrap`, deployments, SSO) cited in `PLAN.md`; refresh when flows or providers change.
- `tests/e2e/` holds Playwright journeys against the deployed worker; keep fixtures aligned with seeded data.
- Root helpers: `pnpm bootstrap:*` commands provision Cloudflare + Stripe resources via the typed CLI.

## Build, Test, and Development Commands
- `npm run dev` – Starts both dev processes: the Worker (`dev:worker`) and the Expo web shell (`dev:local`) with loopback overrides.
- `npm run dev:worker` – Wrangler dev server (`wrangler dev --config workers/api/wrangler.toml`) backed by Miniflare; honours `.dev.vars` for env/bindings. Add D1/R2 bindings there so tests mirror production. Use `npm run dev:worker:local` when you need localhost overrides without mutating `.env`.
- `npm run dev:local` – Rewrites `.env.local` + `workers/api/.dev.vars` for localhost origins and launches the Expo web shell with those overrides (mirrors the login repo’s `dev:local`). Assumes the Better Auth worker runs at `http://127.0.0.1:9787`; export `JE_LOCAL_LOGIN_ORIGIN` to change it.
- `npm run build` – Runs workspace builds (`expo export`, Worker bundle).
- `npm test --workspace workers/api` – Vitest unit suites.
- `npm run test:e2e` – Playwright against `E2E_BASE_URL` or `PROJECT_DOMAIN`.
- `scripts/deploy.sh --mode deploy|dry-run` – **Single source of truth for every deploy path**. This script runs the Expo build, client smoke tests, env audit, bootstrap plan, migrations, worker deploy, and HTTP smoke probes. Update this file (and nowhere else) when changing deploy behaviour.
- `pnpm bootstrap:deploy` / `pnpm bootstrap:deploy:dry-run` – Still available under the hood, but the unified script orchestrates their usage. Call these directly only for debugging.
- Pushing to `main` automatically triggers the GitHub deploy workflow to `starter.justevery.com`; monitor that run with `gh run watch --branch main` when shipping user-visible changes.

## Deployment Flow
- Always run `scripts/deploy.sh --mode deploy` for production pushes and `scripts/deploy.sh --mode dry-run` for validation. CI uses the exact same script, so any change to the deploy sequence must land in this file to avoid drift.
- The deploy script executes `pnpm audit:deploy-env`, which reads `.env.ci` / `.env.generated` to ensure Cloudflare, Stripe, Better Auth, and billing credentials are present and non-placeholder before proceeding. Fix failing audits before re-running.
- Post-deploy verification curls `/api/status` and `/api/stripe/products` using `PROJECT_DOMAIN`. Keep this updated if domains change.
- Repo-specific deploy overrides are passed via the `ENV_BLOB_OVERRIDE` secret (base64 env lines) in CI; local overrides live in `.env.repo` (ignored by git).

## Coding Style & Naming Conventions
- TypeScript is strict via `tsconfig.base.json`; add explicit return types on exported helpers and update `Env` when bindings change.
- Use 2-space indentation, trailing commas, PascalCase for components, camelCase for hooks/utilities, and keep secrets in config packages rather than source files.

## Testing Guidelines
- Place unit tests under `workers/api/test` with `*.test.ts` names; focus on behaviour (auth, asset serving, migrations).
- Keep Playwright specs idempotent and rely on data seeded by the bootstrap CLI; add fixtures under `tests/e2e/__fixtures__` when needed.
- New endpoints need Vitest coverage plus an end-to-end check proving auth and the happy path.

## Commit & Pull Request Guidelines
- Follow the imperative, scope-prefixed style in history (`chore: upgrade toolchain`, `Add Worker unit tests`) and avoid noisy WIP commits.
- PRs should outline scope, list verification commands (`npm test --workspace workers/api`, `npm run test:e2e`), and document any env/config updates or manual steps.
- Link relevant roadmap items (`PLAN.md`), update docs, and supply screenshots or curl transcripts for user-visible changes.

## Environment & Configuration Tips
- Run the CLI (`pnpm bootstrap:preflight`, `pnpm bootstrap:env`, `pnpm bootstrap:deploy`) after cloning and when infra config changes; it is idempotent and reuses the `.env` metadata to skip recreating Cloudflare or Stripe resources.
- Record updates to secrets, Better Auth, or Stripe setup in `docs/better-auth.md` (Better Auth integration) or `docs/archive/DEPLOYMENTS.md`, and mirror changes in `.dev.vars` files.
- `FONT_AWESOME_PACKAGE_TOKEN` lives in `~/.env`; the `scripts/sync-fontawesome-token.mjs` preinstall hook now reads that file automatically so pnpm installs pull the private Font Awesome packages without extra steps.
- Shared credentials live in `~/.env`; source it (`set -a; source ~/.env; set +a`) before running remote validation or CI-like scripts so required env vars exist.
- For local auth testing, create `workers/api/.dev.vars` with the same bindings used in production (D1, R2, BETTER_AUTH_URL, etc.). Wrangler loads these automatically during `npm run dev:worker` and keeps state under `.wrangler/state/`.
- Use `wrangler dev --remote` when you need Cloudflare's edge runtime (JWT verification with real Better Auth tenant) while retaining hot reload.
- Session verification uses the `LOGIN_SERVICE` service binding (points to the
  `login` worker). Always include this binding when cloning/creating new
  environments; otherwise worker-to-worker requests will time out.
- Better Auth now scopes `better-auth.session_token` to `/api/*`. All browsers
  must call the Worker’s `/api` routes (or a server-side proxy) to send the
  cookie—calling out to other origins/paths will never include it.
- For local auth, cookies are set on `127.0.0.1`; the app now normalizes any
  `localhost` return/login URLs to `127.0.0.1` so callbacks keep the session.
- Placeholder/mock data must never be served on production domains. Keep
  `ALLOW_PLACEHOLDER_DATA` unset in prod and treat any Cloudflare D1 issues as
  blockers that require migrations or DB fixes rather than falling back to
  seeded data.
