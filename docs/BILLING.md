# Billing & Stripe Integration

The organization and billing APIs that previously lived in this repository now
reside entirely inside the login worker (`../login`). This starter Worker keeps
only the read-only `/api/stripe/products` endpoint so the marketing site and
pricing cards can render plan metadata, but all checkout/portal/invoice flows
must be driven through the login app.

## Current responsibilities
- expose `/api/stripe/products` by parsing the `STRIPE_PRODUCTS` JSON payload
  (still sourced from `~/.env` so marketing surfaces have price metadata)
- surface environment configuration to Expo via `/api/runtime-env`
- defer authenticated mutations (invites, clients, invoices, checkout, portal)
  to `https://login.justevery.com`

## Where to manage billing
- Run the login repo locally (`pnpm run dev:worker` inside `../login`) to test
  checkout, customer portal, or invoice feeds.
- Follow the login repo’s documentation for configuring `STRIPE_SECRET_KEY`,
  webhook secrets, and the org/billing REST APIs.
- When verifying a deployment of this starter Worker, you only need to curl
  `/api/stripe/products` to confirm pricing metadata renders correctly; all
  other billing smoke tests should target the login Worker environment instead.

Keeping billing logic centralized in the login service prevents drift between
org-management experiences and ensures there is a single source of truth for
Stripe state.

