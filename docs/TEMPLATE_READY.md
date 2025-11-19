# Template Readiness Checklist

## Primary goals & implementation
| Goal | Files / route | Notes |
| --- | --- | --- |
| Team page role/name edit + removal | `apps/web/src/app/screens/TeamScreen.tsx`, hooks in `apps/web/src/app/hooks.ts` | Inline name edit + role pills hit `/api/accounts/:slug/members/:id` PATCH and DELETE with optimistic invalidation.|
| Billing contact persistence & Checkout | `apps/web/src/app/screens/BillingScreen.tsx`, `/workers/api/src/index.ts` handlers and Stripe-rich parsing | Billing form now hits `PATCH /api/accounts/:slug` (DB-backed) plus `POST /api/accounts/:slug/billing/checkout`. Worker tests ensure `STRIPE_PRODUCTS` data flows and Checkout returns Stripe URL.|
| Session/sidebar UI | `apps/web/src/app/AppShell.tsx` | Sidebar nav sits above; bottom-anchored company/account drop-ups show email/logout and hover-switch with soft shadows. Accessibility labels added.|

## Validation
- Worker tests: `npm test --workspace workers/api` (includes billing, checkout, stripe parsing) – last run 2025-11-11 (~2.3s).
- Web build: `pnpm --filter @justevery/web run build` (passed).
- Post-deploy verification: curl `https://starter.justevery.com/api/status` (expect `{"status":"ok"}`) and `https://starter.justevery.com/api/stripe/products` (expect enriched plan list) immediately after each deploy.

## Deploy verification steps
1. `gh workflow run deploy.yml --field mode=deploy` (latest successful run 19261571845, job 55067369467).
2. After deploy, curl `https://starter.justevery.com/api/status` and ensure `status: ok` plus worker origin present.
3. Curl `https://starter.justevery.com/api/stripe/products` – should return JSON array with enriched entries (priceId/currency/interval).

## Authenticated verification (requires Owner/Admin session)
- Log in via Better Auth to `https://starter.justevery.com/app` and verify the dashboard shell loads.
- Team/Billing/Settings UIs are now hosted in the login profile popup. Visiting `/app/team`, `/app/billing`, or `/app/settings` should open the popup to Organizations, Billing, or Account respectively (no local tables/forms). 
- Billing still proxies via worker APIs; use the popup Billing section to update billing email and start checkout/portal flows. Validate worker responses (`/api/accounts/:slug/billing/checkout`, `.../portal`) via network panel or worker logs.

With these checks passed, the template is ready for production usage and no further duplication is required.
