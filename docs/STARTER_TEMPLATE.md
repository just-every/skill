# Starter Template Playbook

Use this guide when cloning the starter stack for a new product. It captures the
minimum steps to rename the project, provision infrastructure, and prove the
Worker + Expo shell are healthy before handing the repo to a new team.

## 1. Prerequisites
- Node.js ≥ 18.18 (Node 20 LTS recommended) and pnpm ≥ 10.12.
- Cloudflare account + API token with Workers, D1, and R2 scopes.
- Stripe account (optional but recommended) with API + webhook keys.
- Better Auth tenant hosted at `https://login.justevery.com` (fixed origin).
- Local secrets stored in `~/.env` – never check `CLOUDFLARE_*`, `STRIPE_*`, or
  Better Auth keys into the repo.

## 2. Clone & rename
1. `git clone git@github.com:just-every/project.git <new-project>`
2. Update `PROJECT_ID`, `PROJECT_NAME`, `PROJECT_DOMAIN`, and `APP_URL` in
   `.env.example`, then copy to `~/.env` and customise the values.
3. Search/replace the starter slug if you need branded sample copy (`starter`
   → `<slug>` in marketing assets, README badges, etc.).

## 3. Bootstrap infrastructure
Run these from the repo root after `pnpm install`:

```bash
pnpm bootstrap:preflight
pnpm bootstrap:env
pnpm bootstrap:deploy:dry-run
pnpm bootstrap:deploy
```

`bootstrap:env` writes `.env.local.generated` and `workers/api/.dev.vars`.
`bootstrap:deploy` renders `workers/api/wrangler.toml`, provisions Cloudflare +
Stripe resources, and persists the generated identifiers back into the env files.

## 4. Update CI secrets
1. Run `./scripts/generate-env-blob.sh ~/.env > .env.blob`.
2. Publish the blob with `pnpm publish:env-blob` or `gh secret set ENV_BLOB ...`.
3. Confirm `.github/workflows/deploy.yml` succeeds on a dry run.

## 5. Verification checklist
Run the commands below and record outputs alongside the commit/tag:
- `npm test --workspace workers/api`
- `pnpm --filter @justevery/web run build`
- `RUN_OPEN_E2E=true npm run test:e2e`
- `pnpm bootstrap:smoke --mode minimal --base https://<domain>`
- `curl -s https://<domain>/api/status`
- `curl -s https://<domain>/api/stripe/products`

For deeper validation steps see `docs/VERIFY.md`, `docs/TEMPLATE_READY.md`, and
`docs/ACCEPTANCE.md`.

## 6. Handoff
- Tag the commit (e.g., `template/<slug>-initial` or `template/latest`).
- Share this doc, `docs/QUICKSTART.md`, and the ENV_BLOB procedure with the new
  team so they can rerun bootstrap commands in their own environment.
