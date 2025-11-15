# Template Readiness Checklist

## Primary goals & implementation
| Goal | Files / route | Notes |
| --- | --- | --- |
| Dashboard defers org/billing to login app | `apps/web/src/pages/Dashboard.tsx` | `/app` now renders a thin shell that links to `https://login.justevery.com` for all org/member/billing management.|
| Marketing pricing data | `/workers/api/src/index.ts` | Worker still parses `STRIPE_PRODUCTS` for `/api/stripe/products` so landing/pricing remain accurate.|
| Auth/session bootstrap | `apps/web/src/auth/AuthProvider.tsx`, `/workers/api/src/index.ts` | AuthProvider syncs Better Auth tokens to the Worker via `/api/session/bootstrap`; `/api/session` and `/api/me` remain intact.|

## Validation
- Worker tests: `npm test --workspace workers/api` (static + session + env injection) – last run 2025-11-15 (~0.6s).
- Web build: `pnpm --filter @justevery/web run build` (passed).
- Post-deploy verification: curl `https://starter.justevery.com/api/status` (expect `{"status":"ok"}`) and `https://starter.justevery.com/api/stripe/products` (expect enriched plan list) immediately after each deploy.

## Deploy verification steps
1. `gh workflow run deploy.yml --field mode=deploy` (latest successful run 19261571845, job 55067369467).
2. After deploy, curl `https://starter.justevery.com/api/status` and ensure `status: ok` plus worker origin present.
3. Curl `https://starter.justevery.com/api/stripe/products` – should return JSON array with enriched entries (priceId/currency/interval).

## Authenticated verification (requires Owner/Admin session)
- Log in via Better Auth to `https://starter.justevery.com/app` and verify the dashboard shell loads.
- Use the “Open login” button inside the dashboard to reach `https://login.justevery.com`, then perform org/member/billing checks in that app (see login repo docs).
- Back on the starter dashboard confirm `/api/stripe/products` renders the expected pricing metadata.

With these checks passed, the template is ready for production usage and no further duplication is required.
