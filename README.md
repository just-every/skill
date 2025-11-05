# justevery Starter Stack

This repository provides the baseline Cloudflare-first stack used to bootstrap new projects under the `justevery.com` domain. It includes:

- An Expo (React Native) web application scaffold under `apps/web`.
- A Cloudflare Worker in `workers/api` that fronts authentication, Stripe integration, and static HTML placeholders.
- Infrastructure automation via `bootstrap.sh`, which provisions Cloudflare D1, R2, and KV resources, templates Wrangler configuration, and seeds Stripe products.
- Documentation, migrations, and CI workflows so the project is deployable with minimal additional setup.

## Documentation

- Architecture & roadmap: `PLAN.md`
- Bootstrap automation: `docs/bootstrap.md`
- Deployment checklist & history: `docs/DEPLOYMENTS.md`
- Bootstrap validation runbook: `docs/BOOTSTRAP_VALIDATION.md`
- Wrangler local dev modes: `docs/LOCAL_DEVELOPMENT.md`
- SSO setup & troubleshooting: `docs/SSO.md`
- Secrets onboarding: `docs/SECRETS_SETUP.md`

## Quick start

```
npm install --workspaces --include-workspace-root
./bootstrap.sh
npm test --workspace workers/api
npm run deploy --workspace workers/api  # wraps `wrangler deploy`

curl -I https://demo.justevery.com/
curl -s https://demo.justevery.com/api/session
curl -s https://demo.justevery.com/api/stripe/products
```

### Expo web export

For Expo SDK 51+, only `babel-preset-expo` is required in `apps/web/babel.config.js`.

```
cd apps/web
npx expo export --platform web --output-dir dist
```

## Verification

- Latest deployment evidence: see `docs/DEPLOYMENTS.md`.
- PLAN-to-implementation audit trail: see `docs/VERIFICATION.md`.
- Logto configuration & debugging: see `docs/SSO.md`.

### Smoke harness

- Local: `node scripts/run-smoke-suite.cjs --mode minimal --base https://demo.justevery.com` (add `--token $LOGTO_TOKEN` for authorised checks).
- CI: `.github/workflows/smoke.yml` runs nightly and on releases; secrets determine whether the suite runs in `full` or `minimal` mode.
- Artifacts land under `test-results/smoke/<timestamp>/` (JSON report, markdown summary, screenshots + manifest).

### Bootstrap validation

- Local (Miniflare): `npm run validate:bootstrap`
- Remote (Edge): `npm run validate:bootstrap:remote -- --base https://demo.justevery.com`
- Detailed checklist and artefact expectations: `docs/BOOTSTRAP_VALIDATION.md`
- Quick audit: `node scripts/assert-secrets.cjs`

## Authentication

- `/login` inside the Expo app launches the Logto sign-in flow using `EXPO_PUBLIC_LOGTO_ENDPOINT` and `EXPO_PUBLIC_LOGTO_APP_ID`.
- Successful sign-in yields an access token; the Expo client forwards it as `Authorization: Bearer <token>` when calling the Worker.
- The Worker verifies every protected request locally with Logto using the configured `LOGTO_ISSUER`, `LOGTO_JWKS_URI`, and `LOGTO_API_RESOURCE` bindings.
