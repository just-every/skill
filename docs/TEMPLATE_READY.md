# Template Readiness Checklist

## Primary goals & implementation
| Goal | Files / route | Notes |
| --- | --- | --- |
| Remove org/team UI | `apps/web/src/pages/Dashboard.tsx`, `apps/web/src/app/hooks.ts` | `/app` now renders a CTA linking to login.justevery.com plus the billing screen; AppShell/team/usage assets were deleted.|
| Keep billing + Stripe flows | `apps/web/src/app/screens/BillingScreen.tsx`, `/workers/api/src/index.ts` | Billing email updates + checkout/portal endpoints remain here. Hooks were trimmed to only the billing queries/mutations.|
| Simplify worker tests | `workers/api/test/*.test.ts` | Replaced the Vitest suite with `node:test` TAP cases run through `tsx --test`.|

## Validation
- Worker tests: `npm test --workspace workers/api` (node/test TAP suite covering status, Stripe products, landing fallback, session proxy).
- Web build: `pnpm --filter @justevery/web run build` (passed).
- Post-deploy verification: curl `https://starter.justevery.com/api/status` (expect `{"status":"ok"}`) and `https://starter.justevery.com/api/stripe/products` (expect enriched plan list) immediately after each deploy.

## Deploy verification steps
1. `gh workflow run deploy.yml --field mode=deploy` (latest successful run 19261571845, job 55067369467).
2. After deploy, curl `https://starter.justevery.com/api/status` and ensure `status: ok` plus worker origin present.
3. Curl `https://starter.justevery.com/api/stripe/products` – should return JSON array with enriched entries (priceId/currency/interval).

## Authenticated verification (requires Owner/Admin session)
- Log in via Better Auth to `https://starter.justevery.com/app` and confirm the dashboard renders the billing widgets + login CTA.
- For org/member work, follow the CTA to `https://login.justevery.com/` and use that app (this repo no longer exposes those screens).
- On the Billing screen change the billing email, trigger Checkout, and open the Stripe portal; verify the Worker returns URLs for both flows.

With these checks passed, the template is ready for production usage and no further duplication is required.
