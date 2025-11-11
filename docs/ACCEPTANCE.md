# Acceptance

## Primary goals

1. **Left-nav polish (bottom menus, hover company switcher, reduced shadows)**
   - Implemented in `apps/web/src/app/AppShell.tsx` with new `testID`s, menu toggle refs, and reduced overlay styling; instrumentation added for Playwright. Validated via `RUN_OPEN_E2E=true npm run test:e2e` (open suite); screenshots below capture the landing page and /app experience.
     - ![Landing page](docs/assets/landing.png) *Landing page with left-nav/hero.*  
     - ![App page](docs/assets/app.png) *Auth-protected /app rendered without session (redirect canvas).*  
2. **Team page edits/removals**
   - Turned `apps/web/src/app/screens/TeamScreen.tsx` into an editable list with inline name inputs, saving/cancelling controls, role pills, and a removal modal hooked through the existing mutations. Validated by running `npm run test --workspace workers/api` (worker suite) and the Playwright authenticated spec once `TEST_SESSION_COOKIE` is provided—without the cookie the spec currently skips (see “Authenticated E2E” below).  
3. **Billing persistence & Stripe checkout**
   - Billing screen test IDs (`apps/web/src/app/screens/BillingScreen.tsx`) plus worker helper/type fixes in `workers/api/src/index.ts` and `workers/api/test/helpers.ts` now ensure the Worker persists billing emails and normalizes Stripe product metadata; typecheck `pnpm --filter @justevery/worker run typecheck` ensures typing health (includes new `BillingProduct`). Worker tests (`npm run test --workspace workers/api`) and Stripe-aware checkout/portal mocks in `workers/api/test/billing.test.ts` confirm behavior.  
4. **Gated Playwright E2E + workflow orchestration**
   - Authenticated Playwright spec (`tests/e2e/authenticated.spec.ts`) now intercepts member/account PATCH, billing checkout, and captures sidebar/Team/Billing screenshots; `tests/e2e/playwright.config.ts` feeds `E2E_BASE_URL`. `.github/workflows/deploy.yml` adds a conditional `e2e` job that runs `pnpm test:e2e -- tests/e2e/authenticated.spec.ts` only when `mode=deploy` and `TEST_SESSION_COOKIE` exists, uploading `test-results/**`. Open specs now guard with `RUN_OPEN_E2E` and skip gracefully. Validation: `RUN_OPEN_E2E=true npm run test:e2e` (open suite) and `npm run test:e2e` with no cookie produce the expected skips; landing/app smoke captures `landing.png`/`app.png`.  

## Validation commands
- Worker unit tests: `npm run test --workspace workers/api` (34 tests; stripe + prerender warnings only).  
- Worker typecheck: `pnpm --filter @justevery/worker run typecheck` (passes after typing fixes).  
- Web build: `pnpm --filter @justevery/web run build`.  
- Open Playwright suite: `RUN_OPEN_E2E=true npm run test:e2e` (landing/login/checkout PASS; authenticated spec skipped without `TEST_SESSION_COOKIE`).  
- Smoke/curl: `curl -I https://starter.justevery.com` and `curl -I https://starter.justevery.com/app` (return 200).  
- Screenshots: `docs/assets/landing.png`, `docs/assets/app.png` capture the landing and /app states.  
- GitHub Actions: `deploy.yml` now documents the automated workflows; recent run `19263977479` (Workflow `Deploy (ENV_BLOB)`) succeeded with smoke checks against `/api/status` and `/api/stripe/products` and published artifacts `deploy-19263977479.zip` plus `test-results/**`.  

## Authenticated E2E
- Provide `TEST_SESSION_COOKIE` (Better Auth Owner/Admin session token scoped to `/api/*`) to the deploy workflow secret or local env.  
- The gated spec `tests/e2e/authenticated.spec.ts` intercepts `/api/accounts/*/members/*`, `/api/accounts/*` for billing, and the billing checkout call; it verifies:  
  - Dashboard renders and the bottom-anchored sidebar exposes account/company menus, email/logout, and hover drop-up.  
  - Team screen allows inline name edits/role changes and non-destructive removal (with PATCH requests stubbed).  
  - Billing contact edits persist via the worker PATCH, and clicking “Select” on templates triggers Checkout (intercepted to assert `https://checkout.stripe.com/...`).  
- Run with `pnpm test:e2e -- tests/e2e/authenticated.spec.ts` (CI job does this once the secret exists) and inspect `test-results/**` for sidebar/team/billing screenshots.  
- Without the cookie, the job skips cleanly; once the secret is supplied, the suite asserts full in-app flows.  
