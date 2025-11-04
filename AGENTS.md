# Repository Guidelines

This repository is the canonical justevery starter stack; future products should branch from it and preserve shared automation, docs, and infra conventions.

## Project Structure & Module Organization
- `apps/web/` hosts the Expo Router web shell; share UI via `packages/ui` and config via `packages/config`.
- `workers/api/` runs the Cloudflare Worker with Wrangler config, D1 access, and Vitest suites; keep bindings in `Env` and migrations under `scripts/`.
- `docs/` keeps operational playbooks (`bootstrap`, deployments, SSO) cited in `PLAN.md`; refresh when flows or providers change.
- `tests/e2e/` holds Playwright journeys against the deployed worker; keep fixtures aligned with seeded data.
- Root helpers: `bootstrap.sh` provisions Cloudflare + Stripe resources; `scripts/deploy-worker.cjs` standardises deploys.

## Build, Test, and Development Commands
- `npm run dev:web` – Expo web dev server with hot reload.
- `npm run dev:worker` – Wrangler watch mode using `workers/api/wrangler.toml`.
- `npm run build` – Runs workspace builds (`expo export`, Worker bundle).
- `npm test --workspace workers/api` – Vitest unit suites.
- `npm run test:e2e` – Playwright against `E2E_BASE_URL` or `LANDING_URL`.
- `npm run deploy:worker` – Scripted Wrangler deploy; ensure environment is bootstrapped first.

## Coding Style & Naming Conventions
- TypeScript is strict via `tsconfig.base.json`; add explicit return types on exported helpers and update `Env` when bindings change.
- Use 2-space indentation, trailing commas, PascalCase for components, camelCase for hooks/utilities, and keep secrets in config packages rather than source files.

## Testing Guidelines
- Place unit tests under `workers/api/test` with `*.test.ts` names; focus on behaviour (auth, asset serving, migrations).
- Keep Playwright specs idempotent and rely on data seeded by `bootstrap.sh`; add fixtures under `tests/e2e/__fixtures__` when needed.
- New endpoints need Vitest coverage plus an end-to-end check proving auth and the happy path.

## Commit & Pull Request Guidelines
- Follow the imperative, scope-prefixed style in history (`chore: upgrade toolchain`, `Add Worker unit tests`) and avoid noisy WIP commits.
- PRs should outline scope, list verification commands (`npm test --workspace workers/api`, `npm run test:e2e`), and document any env/config updates or manual steps.
- Link relevant roadmap items (`PLAN.md`), update docs, and supply screenshots or curl transcripts for user-visible changes.

## Environment & Configuration Tips
- Run `./bootstrap.sh` after cloning and when infra config changes; it is idempotent and reuses the `.env` metadata to skip recreating Cloudflare or Stripe resources.
- Record updates to secrets, Stytch, or Stripe setup in `docs/SSO.md` or `docs/DEPLOYMENTS.md`, and mirror changes in `.dev.vars` files.
