# Release Candidate Notes

## Highlights
- Sidebar polish: navigation items, bottom-anchored account menu, and company switcher now surface stable selectors plus accessible states for automated checks.
- Team page enhancements: inline name editing, role pills, and a non-destructive removal flow backed by optimistic hooks and success/failure messaging.
- Billing persistence fixes: billing contact edits persist to D1-backed accounts, Stripe Checkout interceptions ensure the UI can exit gracefully, and product-select buttons now have deterministic test IDs.
- Stripe products request assurance: smoke-run integration now proves `/api/stripe/products` returns a non-empty array alongside `/api/status`.
- Gated Playwright E2E: new authenticated spec honors `TEST_SESSION_COOKIE`, captures sidebar/Team/Billing screenshots, and the deploy workflow conditionally runs the suite when CI can provide the session cookie.

## How to run E2E in CI
1. Ensure `ENV_BLOB` is populated with the client’s environment blob so the worker can bootstrap accounts, D1, and Stripe keys.
2. Supply `TEST_SESSION_COOKIE` containing a Better Auth session token scoped to `/api/*`; without it the authenticated spec is skipped and the job exits cleanly.
3. The workflow sets `E2E_BASE_URL` from `PROJECT_DOMAIN`; once the cookie is present, the `tests/e2e/authenticated.spec.ts` spec will run, stub PATCH/checkout calls, and emit `test-results/**` artifacts (sidebar.png, team-screen.png, billing-screen.png, plus any Playwright traces).
4. `npm run test:e2e` (or `pnpm test:e2e`) is the orchestrating script; run it after `pnpm --filter @justevery/web run build` so prerender assets exist.
