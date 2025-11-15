# Acceptance

## Primary goals

1. **Org UI removal**
   - Replaced the old AppShell/Team/Usage/Assets experience with a slim `/app` CTA that links admins to `https://login.justevery.com` for all organization management. Left nav, invite modals, and member-specific hooks were deleted to prevent stale org logic from lingering in this repo.
2. **Keep billing local**
   - Billing flows, Stripe checkout/portal, and subscription/invoice queries remain in this project. `apps/web/src/pages/Dashboard.tsx` now renders the Billing screen directly alongside the login CTA. Worker endpoints under `/api/accounts/:slug/billing/*` continue to persist billing email and talk to Stripe.
3. **Simplified worker tests**
   - Worker tests run via the built-in `node:test` runner (`tsx --test test/index.test.ts test/session.test.ts`) to cover `/api/status`, `/api/stripe/products`, landing fallback, and session bridging without Vitest/ESM churn.

## Validation commands
- Worker unit tests: `npm run test --workspace workers/api` (node/test TAP suite covering status, stripe products, landing fallback, and session proxy).  
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
