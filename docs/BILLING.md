# Billing & Stripe Integration

End-to-end guide for configuring Stripe, wiring the Worker routes, and smoke-testing the billing experience. Organization
and team management now live inside the login worker (`../login`), but billing, Stripe checkout/portal, and plan metadata
remain in this repository.

## Environment Variables

Add these to `~/.env` (bootstrap CLI) **and** `workers/api/.dev.vars` (local Wrangler):

| Key | Description |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe API key (Dashboard → Developers → API keys → Secret key) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the webhook endpoint you create below |
| `STRIPE_PRODUCTS` | JSON array describing the plans/prices the dashboard should list (each entry must include `priceId`, `unitAmount`, and `currency`; `id`, `name`, `description`, `interval`, and `metadata` are optional) |
| `TRIAL_PERIOD_DAYS` | Optional integer (default **30**). Controls the seeded `current_period_end` when a brand-new account is provisioned before Stripe fires real webhooks. Set shorter values (e.g., `14`) when demoing rapid trial expirations; keep ≥30 in prod to mirror your Stripe trial length. |
| `STRIPE_REDIRECT_ALLOWLIST` | Optional comma-separated list of absolute URLs or origins that are allowed for `successUrl`, `cancelUrl`, and `returnUrl`. Each entry should include the scheme+host (e.g., `https://starter.justevery.com,https://app.local`) and is matched by origin. Use this to permit additional dev tunnels or staging domains; leave unset to fall back to the first-party origins (`APP_BASE_URL`, `PROJECT_DOMAIN`, `EXPO_PUBLIC_WORKER_ORIGIN`, `LOGIN_ORIGIN`). |

Example `.dev.vars` snippet:

```bash
# workers/api/.dev.vars
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRODUCTS='[
  {"id":"prod_scale","name":"Scale","description":"Scale plan","priceId":"price_scale_monthly","unitAmount":5400,"currency":"usd","interval":"month","metadata":{"tier":"scale"}},
  {"id":"prod_launch","name":"Launch","description":"Launch plan","priceId":"price_launch_monthly","unitAmount":2100,"currency":"usd","interval":"month","metadata":{"tier":"launch"}}
]'
TRIAL_PERIOD_DAYS=30
# Allow localhost + deployed origin
STRIPE_REDIRECT_ALLOWLIST="https://starter.justevery.com,https://app.local"
```

Restart `npm run dev:worker` after editing secrets so Wrangler reloads them.

## Worker Endpoints

| Route | Method | Roles | Description |
| --- | --- | --- | --- |
| `/api/accounts/:slug/billing/products` | GET | Billing+ | Lists plans from `STRIPE_PRODUCTS` |
| `/api/accounts/:slug/billing/checkout` | POST | Owner/Admin | Creates a Stripe Checkout session (requires `priceId`, `successUrl`, `cancelUrl`) |
| `/api/accounts/:slug/billing/portal` | POST | Owner/Admin | Creates a Stripe customer portal session (`returnUrl` required) |
| `/api/accounts/:slug/billing/invoices` | GET | Billing+ | Returns invoices for the company’s Stripe customer (`?limit=10`) |
| `/webhook/stripe` | POST | Stripe | Verifies signatures and upserts `company_subscriptions` |

RBAC is enforced via the requester’s membership: Billing roles can read, Owner/Admin can mutate.

## Verification Checklist (cURL)

Replace `justevery` with your account slug and include a valid session cookie (`better-auth.session_token=...`).

1. **List products**
   ```bash
   curl -s https://starter.justevery.com/api/accounts/justevery/billing/products \
     -H "cookie: better-auth.session_token=YOUR_SESSION" | jq
   ```
   *Expect:* `200 OK` with `{ "products": [...] }` using the data from `STRIPE_PRODUCTS`.

2. **Positive checkout**
   ```bash
   curl -s -X POST https://starter.justevery.com/api/accounts/justevery/billing/checkout \
     -H "content-type: application/json" \
     -H "cookie: better-auth.session_token=OWNER_SESSION" \
     -d '{"priceId":"price_scale_monthly","successUrl":"https://starter.justevery.com/app/billing?state=success","cancelUrl":"https://starter.justevery.com/app/billing?state=cancel"}' | jq
   ```
   *Expect:* `200 OK` with `{ "sessionId": "cs_...", "url": "https://checkout.stripe.com/..." }`.

3. **Checkout validation error**
   ```bash
   curl -i -X POST https://starter.justevery.com/api/accounts/justevery/billing/checkout \
     -H "content-type: application/json" \
     -H "cookie: better-auth.session_token=OWNER_SESSION" \
     -d '{"priceId":"price_scale_monthly"}'
   ```
   *Expect:* `400 Bad Request` with `{ "error": "successUrl and cancelUrl are required" }`.

4. **Portal session**
   ```bash
   curl -s -X POST https://starter.justevery.com/api/accounts/justevery/billing/portal \
     -H "content-type: application/json" \
     -H "cookie: better-auth.session_token=OWNER_SESSION" \
     -d '{"returnUrl":"https://starter.justevery.com/app/billing"}' | jq
   ```
   *Expect:* `200 OK` with `{ "url": "https://billing.stripe.com/..." }`.

5. **Portal auth check**
   ```bash
   curl -i -X POST https://starter.justevery.com/api/accounts/justevery/billing/portal \
     -H "content-type: application/json" \
     -H "cookie: better-auth.session_token=BILLING_ROLE_SESSION" \
     -d '{"returnUrl":"https://starter.justevery.com/app/billing"}'
   ```
   *Expect:* `403 Forbidden` because Billing role is read-only.

6. **List invoices**
   ```bash
   curl -s "https://starter.justevery.com/api/accounts/justevery/billing/invoices?limit=5" \
     -H "cookie: better-auth.session_token=BILLING_ROLE_SESSION" | jq
   ```
   *Expect:* `200 OK` with `{ "invoices": [ { "id": "in_...", "status": "paid", ... } ] }`.

7. **Stripe webhook (subscription updated)**
   ```bash
   stripe listen --forward-to https://starter.justevery.com/webhook/stripe
   stripe trigger customer.subscription.updated
   ```
   *Expect:* webhook handler returns `200 {"ok":true}` and `company_subscriptions` table updated (check with D1 or logs). If signature mismatch, response is `400 {"error":"Invalid or missing Stripe signature"}`.

8. **Local dev secrets reminder**
   ```bash
   # After editing ~/.env
   set -a; source ~/.env; set +a
   pnpm bootstrap:env
   ```
   *Reason:* ensures Wrangler picks up new Stripe keys before running or deploying.

## Troubleshooting

- **403 responses**: confirm the session belongs to an Owner/Admin when performing writes.
- **502 from invoices/checkout**: verify `STRIPE_SECRET_KEY` is set and valid; the worker logs the Stripe status and body.
- **Webhook signature errors**: ensure `STRIPE_WEBHOOK_SECRET` matches the value shown in the Stripe Dashboard after creating/updating the endpoint.

For more deployment context see `docs/QUICKSTART.md` and `docs/SECRETS_CLOUDFLARE.md`.
- **Redirect allowlist tips**
  - Keep `STRIPE_REDIRECT_ALLOWLIST` as tight as possible—each origin you list becomes a valid redirect target for Checkout/Portal flows.
  - Dev example: `STRIPE_REDIRECT_ALLOWLIST="https://starter.justevery.com,https://app.local,https://<your-ngrok>.ngrok.io"`.
  - Prod example: leave unset (defaults to `APP_BASE_URL`, `PROJECT_DOMAIN`, `LOGIN_ORIGIN`) or explicitly enumerate your public domains.
  - If a client supplies a URL outside the allowlist, the worker returns `400 invalid_redirect_origin`, preventing spoofed redirects.

- **Trial provisioning**
  - `TRIAL_PERIOD_DAYS` only affects the initial row inserted into `company_subscriptions` before Stripe responds. Once webhooks arrive, the canonical period dates overwrite the seed values.
  - Match this value to the Stripe product’s trial length so dashboard messaging (“Renews on…”) lines up before the first webhook. For environments with no trial in Stripe, set `TRIAL_PERIOD_DAYS=1` to nudge users into billing faster.
