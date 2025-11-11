# Template Readiness Checklist

## Primary goals & implementation
| Goal | Files / route | Notes |
| --- | --- | --- |
| Team page role/name edit + removal | `apps/web/src/app/screens/TeamScreen.tsx`, hooks in `apps/web/src/app/hooks.ts` | Inline name edit + role pills hit `/api/accounts/:slug/members/:id` PATCH and DELETE with optimistic invalidation.|
| Billing contact persistence & Checkout | `apps/web/src/app/screens/BillingScreen.tsx`, `/workers/api/src/index.ts` handlers and Stripe-rich parsing | Billing form now hits `PATCH /api/accounts/:slug` (DB-backed) plus `POST /api/accounts/:slug/billing/checkout`. Worker tests ensure `STRIPE_PRODUCTS` data flows and Checkout returns Stripe URL.|
| Session/sidebar UI | `apps/web/src/app/AppShell.tsx` | Sidebar nav sits above; bottom-anchored company/account drop-ups show email/logout and hover-switch with soft shadows. Accessibility labels added.|

## Validation
- Worker tests: `npm test --workspace workers/api` (includes billing, checkout, stripe parsing) – last run 2025-11-11 (~2.3s).&nbsp;[logs reference run 19261571845? should mention run id? that's deploy but tests run locally.]
- Web build: `pnpm --filter @justevery/web run build` (passed).&nbsp;
- Deploy smoke (run 19261571845 / job 55067369467): `/api/status` returns `{"status":"ok"...}`, `/api/stripe/products` returns enriched plan list. These steps ensure runtime health and Stripe metadata.|

## Deploy & smoke steps
1. `gh workflow run deploy.yml --field mode=deploy` (latest successful run 19261571845, job 55067369467).
2. After deploy, curl `https://starter.justevery.com/api/status` and ensure `status: ok` plus worker origin present.
3. Curl `https://starter.justevery.com/api/stripe/products` – should return JSON array with enriched entries (priceId/currency/interval).

## Authenticated verification (requires Owner/Admin session)
- Log in via Better Auth to `https://starter.justevery.com/app` and verify the dashboard shell loads.
- On Team screen edit a member name + role and remove a member; confirm UI reflects edits and worker returns `ok`.
- On Billing screen change billing email, save, and ensure persistent value; select a plan to call `/api/accounts/:slug/billing/checkout` (returns Stripe URL) and open `/api/accounts/:slug/billing/portal`.|

With these checks passed, the template is ready for production usage and no further duplication is required.
