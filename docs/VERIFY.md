## Verify admin flows after deploy

1. **Sign in as an Owner/Admin in Better Auth**
   - Browse to `https://starter.justevery.com/app` and confirm it redirects to `https://login.justevery.com/` when not authenticated.
   - Complete the login form using the configured admin email/password (or passkey) and ensure the worker issues a `better-auth.session_token` cookie scoped to `/api`.
   - Expected outcome: landing page loads the dashboard shell once the cookie is present.

2. **Team member role/name updates and removal**
   - Open the Team screen in the app (via left navigation) while signed in as an Admin/Owner.
   - Inline-edit a member name, save, and confirm the UI reflects the change; the worker should accept the PATCH payload and persist the new name.
   - Tap a role chip, change the role, and verify the optimistic update holds; the worker should respond with `ok` and the query should refetch the team list.
   - Hit the Remove button, approve the confirmation dialog, and ensure the member disappears from the list after the DELETE succeeds.

3. **Billing contact persistence**
   - Navigate to the Billing screen.
   - Update the saved billing email, click Save, and confirm the worker PATCH `/api/accounts/:slug` returns `ok` and the field stays updated.
   - Flip the field back or re-load the page to ensure persistence.

4. **Checkout proxy & Portal**
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
