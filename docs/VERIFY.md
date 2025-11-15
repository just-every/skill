## Verify admin flows after deploy

1. **Sign in as an Owner/Admin in Better Auth**
   - Browse to `https://starter.justevery.com/app` and confirm it redirects to `https://login.justevery.com/` when not authenticated.
   - Complete the login form using the configured admin email/password (or passkey) and ensure the worker issues a `better-auth.session_token` cookie scoped to `/api`.
   - Expected outcome: landing page loads the dashboard shell once the cookie is present.

2. **Org & team management (login worker)**
   - Launch `https://login.justevery.com/` directly (or via the dashboard CTA) once signed in.
   - Use the login app’s Organization view to edit a member name, update roles, and remove a member; all mutations are handled by the login worker and should respond with `ok` payloads.
   - Confirm the starter dashboard refreshes and simply links out—it no longer performs these mutations itself.

3. **Billing contact & Checkout (login worker)**
   - From the login app’s Billing section, update the billing contact email and verify persistence via a page refresh.
   - Trigger Stripe Checkout and the customer portal from the login app, ensuring the returned URLs point at Stripe and open successfully.
   - Back in this repo, only `/api/stripe/products` remains to power marketing/pricing content—ensure that endpoint returns the expected plan metadata.

4. **Runtime health**
   - `curl https://starter.justevery.com/api/status` should return `{"status":"ok",...}`.
   - `curl https://starter.justevery.com/api/stripe/products` should return a `products` array with at least one entry backed by the bootstrap-generated `STRIPE_PRODUCTS` payload.

5. **Document any issues**
   - If an endpoint returns `missing_cookie`, confirm auth flow was executed and retry after sign-in.
   - Record any unexpected failures in this document, including timestamp and request/response data.
