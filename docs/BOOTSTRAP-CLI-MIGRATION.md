# Bootstrap CLI Migration

This project now provisions infrastructure through the typed
`@justevery/bootstrap-cli` workspace package. All legacy shell scripts have
been removed or shimmed; use the `pnpm bootstrap:*` commands below for every
environment.

## Prerequisites
- Node 18.18+ and `pnpm`
- Wrangler installed locally (`pnpm --filter @justevery/worker add -D wrangler`
  or `npm install -g wrangler`) **and** authenticated (`wrangler login` or a
  valid `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`)
- `.env` (or exported env vars) containing the keys required by the CLI schema
  — Cloudflare, Logto, and Stripe credentials as validated by
  `packages/bootstrap-cli/src/env.ts`
- For smoke tests: Playwright browsers (`pnpm exec playwright install --with-deps`)
  — `pnpm smoke:local` will install Chromium if missing

## Primary Commands
| Command | Purpose | Notes |
| --- | --- | --- |
| `pnpm bootstrap:preflight [-- --check]` | Validate environment + derived config without writes. | `--check` prints diagnostics only. |
| `pnpm bootstrap:env [-- --dry-run|-- --check]` | Generate `.env.local.generated` and `workers/api/.dev.vars`. | `--dry-run` previews changes; `--check` fails on diffs. |
| `pnpm bootstrap:deploy -- --dry-run` | Render `workers/api/wrangler.toml` only. | Skips deploy step and asserts Wrangler readiness. |
| `pnpm bootstrap:deploy` | Render + deploy the Worker. | Requires Wrangler auth and real Cloudflare creds. |
| `pnpm smoke:local [-- --routes /]` | End-to-end smoke against local wrangler dev. | Defaults to routes `/,/api/session`; pass `--routes` to narrow scope. |

`bootstrap.sh` is now a thin shim that runs the CLI sequence (preflight → env →
apply) and prints a deprecation notice.

## Local Smoke Flow
1. Ensure `.env` is populated and Cloudflare/Logto endpoints resolve locally.
2. Run `pnpm smoke:local` (installs Playwright as needed, starts
   `wrangler dev`, hits default routes, and stores artefacts under
   `test-results/smoke-local/<timestamp>/`).
3. Override coverage with `pnpm smoke:local -- --routes /,/health` when you only
   need safe endpoints.

## Deploy Workflow
1. Preview config: `pnpm bootstrap:preflight -- --check`
2. Write env files: `pnpm bootstrap:env`
3. Dry-run deploy: `pnpm bootstrap:deploy -- --dry-run`
4. Real deploy (requires valid Cloudflare credentials):
   `pnpm bootstrap:deploy`
5. Optional remote smoke (once deployed): `pnpm bootstrap:smoke -- --base <url> --mode full`

Dry-run mode never contacts Cloudflare. The CLI now performs a Wrangler
preflight (version + `whoami`) before running the real deploy.

## Cleanup Status
- All legacy shell scripts under `scripts/` have been removed or replaced with
  shims pointing to the CLI.
- GitHub Actions workflows call the CLI commands directly.
- Docs, README, and package scripts reference only the new workflow.
