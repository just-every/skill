# justevery Starter Stack

This repository provides the baseline Cloudflare-first stack used to bootstrap new projects under the `justevery.com` domain. It includes:

- An Expo (React Native) web application scaffold under `apps/web`.
- A Cloudflare Worker in `workers/api` that fronts authentication, Stripe integration, and static HTML placeholders.
- Infrastructure automation via `bootstrap.sh`, which provisions Cloudflare D1, R2, and KV resources, templates Wrangler configuration, and seeds Stripe products.
- Documentation, migrations, and CI workflows so the project is deployable with minimal additional setup.

## Documentation

- Architecture & roadmap: `PLAN.md`
- Bootstrap automation: `docs/bootstrap.md`
- Deployment checklist: `docs/DEPLOYMENTS.md`
- SSO setup & troubleshooting: `docs/SSO.md`

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
- Stytch SSO configuration & debugging: see `docs/SSO.md`.
