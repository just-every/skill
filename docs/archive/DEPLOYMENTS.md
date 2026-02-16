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

Production gating note:

- `scripts/deploy.sh --mode deploy` now hard-fails unless trial orchestration env vars are present and valid (`pnpm audit:deploy-env`) and a live trial smoke run succeeds.
- `pnpm release:block:skills-live-smoke` writes `artifacts/release-blockers/skills-live-smoke.json` and exits non-zero with `live_smoke_pending_external_creds` when credentials are missing.

## Post-deploy Verification
- `curl https://<domain>/api/status` → `{ "status": "ok" }`
- `curl https://<domain>/api/stripe/products` → non-empty array.
- `pnpm bootstrap:smoke --mode minimal --base https://<domain>` for automated
  screenshots + HTTP checks.
- `node scripts/smoke-skills-trials.mjs --mode live` to verify benchmark-native
  trial orchestration persisted all three comparable modes and produced positive
  `oracle_skill/library_selection vs baseline` deltas.

This live skills smoke is executed automatically by `scripts/deploy.sh --mode deploy` and is not optional.

### Benchmark-Native Skills Smoke Prerequisites

Set these env vars (in `ENV_BLOB_OVERRIDE` for CI, `.env.repo` locally):

- `SKILLS_TRIAL_EXECUTE_TOKEN`
- `SKILLS_TRIAL_ORCHESTRATOR_URL`
- `SKILLS_TRIAL_ORCHESTRATOR_TOKEN`
- `SKILLS_TRIAL_SMOKE_BENCHMARK_CASE_ID`
- `SKILLS_TRIAL_SMOKE_ORACLE_SKILL_ID`

These are validated by `pnpm audit:deploy-env`.

## Rollback
1. Use Cloudflare D1 Time Travel:
   `wrangler d1 time-travel restore <db> --timestamp=<ISO8601>`
2. Re-run `deploy.yml` against the previous commit via `workflow_dispatch`.

## Secrets
- All deployments rely on `ENV_BLOB`. Regenerate via
  `./scripts/generate-env-blob.sh ~/.env | pnpm publish:env-blob` after any
  bootstrap run that changes generated IDs or Stripe products.
