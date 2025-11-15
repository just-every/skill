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

4. **Stripe Checkout & Portal**
   - From Billing, choose a plan and trigger Checkout; the worker should POST to `/api/accounts/:slug/billing/checkout` with `priceId`/quantity and return a `url` pointing at Stripe.
   - Use the same billing section to open the Customer Portal; the worker should POST `/api/accounts/:slug/billing/portal`, receive a portal `url`, and redirect the browser.
   - Ensure the enriched `/api/stripe/products` payload is non-empty (i.e., real price IDs and metadata) before hitting checkout.

5. **Runtime health**
   - `curl https://starter.justevery.com/api/status` should return `{"status":"ok",...}`.
   - `curl https://starter.justevery.com/api/stripe/products` should return a `products` array with at least one entry backed by the bootstrap-generated `STRIPE_PRODUCTS` payload.

6. **Document any issues**
   - If an endpoint returns `missing_cookie`, confirm auth flow was executed and retry after sign-in.
   - Record any unexpected failures in this document, including timestamp and request/response data.
