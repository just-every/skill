## Verify admin flows after deploy

1. **Sign in (Better Auth / hosted popup)**
   - Browse to `https://starter.justevery.com/app`; unauthenticated users should be redirected to `https://login.justevery.com/`.
   - Sign in with a valid Owner/Admin test user (or passkey) and return to the app; the dashboard shell should load with a `better-auth.session_token` cookie scoped to `/api`.

2. **Profile popup availability**
   - Use the account menu → “Manage login profile” (or visit `/app/settings`, which now opens the popup) and confirm the hosted profile popup renders from `login.justevery.com/profile-popup.js`.
   - Verify sections: Account, Security, Organizations, Billing are available.

3. **Organization switching (popup-driven)**
   - In the profile popup, go to **Organizations** and switch to another org (if present).
   - App should refresh company context (companies query refetch) and subsequent API calls use the new org; `/api/accounts` should reflect the active org.
   - Hitting `/app/team` should immediately open the popup to Organizations and not render local Team UI.

4. **Billing (popup-driven)**
   - Visit `/app/billing` (wrapper) – it should open the popup Billing section instead of local billing UI.
   - In **Billing**, click Upgrade/Manage; the popup should emit `billing:checkout` and open the Stripe checkout/portal URL in a new tab.
   - If billing return URLs are used, `/app/billing/success` and `/app/billing/cancel` should still render the return screen, but “Manage in Stripe” now re-opens the popup Billing section.

5. **Settings (popup-driven)**
   - Visit `/app/settings`; it should open the profile popup to **Account**. Confirm changes (e.g., display name/email) are performed via the popup.

6. **Logout**
   - From the popup, choose Sign out; the app should clear session and redirect back to login.

Notes
- Local Team/Billing/Settings React screens have been replaced by hosted popup flows per `../login/docs/profile-popup-integration.md` and `docs/BILLING.md`.
- Billing and team APIs remain server-side but are accessed via the popup; no local tables/forms should render on `/app/team` or `/app/billing`.
- E2E: `tests/e2e/profile-popup.spec.ts` exercises login + popup wrappers when `TEST_LOGIN_EMAIL/TEST_LOGIN_PASSWORD` are set; otherwise it skips.
   - When running locally against the real hosted popup, start `node scripts/dev-login-proxy.mjs` and export the `EXPO_PUBLIC_*`/`LOGIN_ORIGIN` env vars to point at `http://127.0.0.1:4545` before launching the web shell or Playwright. The proxy forwards `/profile-popup.js` + `/profile/*` to `https://login.justevery.com` while keeping auth/worker endpoints stubbed.
   - From Billing, choose a plan and trigger Checkout; the worker should POST to `/api/accounts/:slug/billing/checkout`, which now forwards the request to `login.justevery.com/api/billing/checkout` using the `BILLING_CHECKOUT_TOKEN`. Expect a Stripe URL in the response.
   - Use the same billing section to open the Customer Portal; the worker still POSTs `/api/accounts/:slug/billing/portal`, receives a portal `url`, and redirects the browser.
   - Ensure the enriched `/api/stripe/products` payload is non-empty (i.e., real price IDs and metadata) before hitting checkout.

5. **Runtime health**
   - `curl https://starter.justevery.com/api/status` should return `{"status":"ok",...}`.
   - `curl https://starter.justevery.com/api/stripe/products` should return a `products` array with at least one entry backed by the bootstrap-generated `STRIPE_PRODUCTS` payload.

6. **Document any issues**
   - If an endpoint returns `missing_cookie`, confirm auth flow was executed and retry after sign-in.
   - Record any unexpected failures in this document, including timestamp and request/response data.

### Troubleshooting

- **Vitest fails with `ERR_REQUIRE_ESM` referencing `vite/dist/node/index.js`.**
  - Cause: on 9 Nov 2025 we picked up Vite 7 via transitive install. Vite 7 is ESM-only, but Vitest 4’s CJS launcher (and our `scripts/run-vitest-seq.mjs`) still `require()`s the CommonJS entry point, so the worker tests abort before running.
  - Fix: pin Vite back to a CJS-compatible version. We now override Vite to `6.0.11` in the workspace root (`package.json → pnpm.overrides.vite`). Rerun `pnpm install` after pulling to ensure the lockfile respects the override, then run `pnpm --filter ./workers/api test`.
  - Future work: when we deliberately upgrade to Vite 7+, update Vitest to a release that loads Vite via ESM (or switch our test runner to the new CLI) so this override can be removed.
