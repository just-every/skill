# Release Candidate Notes

## Highlights
- Sidebar polish: navigation items, bottom-anchored account menu, and company switcher now surface stable selectors plus accessible states for automated checks.
- Team page enhancements: inline name editing, role pills, and a non-destructive removal flow backed by optimistic hooks and success/failure messaging.
- Billing persistence fixes: billing contact edits persist to D1-backed accounts, Stripe Checkout interceptions ensure the UI can exit gracefully, and product-select buttons now have deterministic test IDs.
- Stripe products request assurance: smoke-run integration now proves `/api/stripe/products` returns a non-empty array alongside `/api/status`.
- Playwright open suite: `RUN_OPEN_E2E=true npm run test:e2e` exercises landing/login/checkout; authenticated coverage returns once the login worker exposes M2M tokens so CI can mint scoped credentials without cookies.

## How to run E2E in CI
1. Ensure `ENV_BLOB` is populated with the client’s environment blob so the worker can bootstrap accounts, D1, and Stripe keys.
2. Set `RUN_OPEN_E2E=true npm run test:e2e` to exercise the landing/login/checkout probes (these call `/`, `/api/session`, `/api/stripe/products`, and `/checkout`).
3. Authenticated Playwright flows are paused until the login service emits M2M tokens; once available we will reintroduce the spec with non-cookie credentials and document the steps here.
