# Acceptance

## Primary goals

1. **Dashboard simplification**
   - `/app` now renders a thin CTA card (see `apps/web/src/pages/Dashboard.tsx`) that links to the centralized login worker for every org/member/billing action. No local queries or mutations remain.
2. **Worker scope reduction**
   - `/workers/api/src/index.ts` was trimmed to session bridging, marketing assets, `/api/status`, `/api/stripe/products`, and runtime-env injection. All `/api/accounts/*` routes plus Stripe checkout/portal handlers were removed.
3. **Docs + verification refresh**
   - README, Quickstart, Billing, Verify, and Template Ready docs now call out that org/billing flows live in the login repo. Smoke checks cover `/api/status` + `/api/stripe/products`; login repo guides cover invites/checkout.
4. **Playwright smoke coverage**
   - `RUN_OPEN_E2E=true npm run test:e2e` exercises landing/login/checkout probes and generates updated screenshots. Authenticated Playwright coverage is temporarily paused (spec removed from the repo) until the login worker emits M2M tokens for CI; this keeps the starter free of cookie-based secrets.

## Validation commands
- Worker unit tests: `npm run test --workspace workers/api` (session + prerender + runtime env).  
- Worker typecheck: `pnpm --filter @justevery/worker run typecheck` (passes after typing fixes).  
- Web build: `pnpm --filter @justevery/web run build`.  
- Open Playwright suite: `RUN_OPEN_E2E=true npm run test:e2e` (landing/login/checkout PASS).
- Smoke/curl: `curl -I https://starter.justevery.com` and `curl -I https://starter.justevery.com/app` (return 200).  
- Screenshots: `docs/assets/landing.png`, `docs/assets/app.png` capture the landing and /app states.  
- GitHub Actions: `deploy.yml` now documents the automated workflows; recent run `19263977479` (Workflow `Deploy`) succeeded with smoke checks against `/api/status` and `/api/stripe/products` and published artifacts `deploy-19263977479.zip` plus `test-results/**`.  
- Deploy run `19268410510` (2025-11-11 14:16 UTC) verified `/api/status` (ok + BNE colo) and `/api/stripe/products` returning real price IDs (`price_1SQWcDGD1Q57MReNLuvln86m`, `price_1SQWcDGD1Q57MReNhTRLLXWa`) after the normalization fix, so Billing “Select” buttons stay enabled.  
- Browser Smoke (2025-11-11): loaded https://starter.justevery.com and https://starter.justevery.com/app via the deployed worker; landing renders correctly, /app redirects to Better Auth login, console logs show only the expected auth-required warning.  

## Authenticated E2E (next steps)
- Login.justevery.com is adding M2M tokens so CI can authenticate without copying browser cookies. Once those tokens are available we will restore an authenticated Playwright spec (and associated CI job) using the new credential flow.
