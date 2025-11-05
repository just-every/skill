# justevery Starter Stack – Delivery Plan (Updated 2025-11-04T22:55Z)

## Snapshot
- Baseline Expo shell + Worker remain healthy; callback error handling now returns 400 (see `test-results/bootstrap-20251104T223526Z`).
- R2 bucket listing succeeds with the current Cloudflare token (`npm run assert:r2`).
- Authenticated artefacts are still pending because we lack Logto management credentials for bootstrap to create/update the SPA client. Secrets checks halt until they land (`LOGTO_MANAGEMENT_ENDPOINT`, `LOGTO_MANAGEMENT_AUTH_BASIC`, Stripe keys).

## Status
- **Complete**
  - Workstream 2 – Callback behaviour hardened; `/callback?error=debug` returns 400 locally and remotely.
  - Workstream 3 – R2 listing diagnostics in place; current token scopes validated via `npm run assert:r2`.
  - Workstream 4 – Docs/CI updates landed (`docs/SECRETS_HANDOFF.md`, workflows gated).
- **Blocked**
  - Workstream 1 – Pending Logto client credentials and Worker secret. See `docs/SECRETS_HANDOFF.md` and `test-results/logto-missing-20251104T224722Z/report.md` for the exact keys and Wrangler command.

## Delivery Log
- ### Workstream 1 – Logto Web Flow (**Blocked**)
  - Awaiting Logto management credentials so bootstrap can provision/update the SPA application (`LOGTO_APPLICATION_ID`) and Stripe keys; no `/app` smoke evidence can be captured. Follow `docs/SECRETS_HANDOFF.md` and resolve `test-results/logto-missing-20251104T224722Z/report.md` rows.

- ### Workstream 2 – Auth Callback + Session API (**Complete**)
  - 400 response confirmed in `test-results/bootstrap-20251104T223526Z/_callback_error_debug.json`.

- ### Workstream 3 – Public Marketing Assets / R2 Diagnostics (**Complete**)
  - `npm run assert:r2` succeeds; latest bootstrap summary shows bucket listing success.

- ### Workstream 4 – Secrets & CI Documentation (**Complete**)
  - `docs/SECRETS_HANDOFF.md` + CI workflows now gate on helper scripts; npm scripts added for local use.

## Risks & Watchlist
- **Logto app gap**: Without valid management credentials the SPA client configuration drifts (redirect URIs, CORS); bring credentials online before the next release.
- **Callback status drift**: Live `/callback?error=debug` returning 200 could mask regression paths; fix before tagging the starter stack.
- **R2 CLI permissions**: Validation relies on `wrangler r2 object list`; confirm the Cloudflare API token scopes to prevent release-blocking failures.

## Immediate Next Steps
1. Provide Logto management credentials (`LOGTO_MANAGEMENT_ENDPOINT`, `LOGTO_MANAGEMENT_AUTH_BASIC`) and Stripe secrets, following `docs/SECRETS_HANDOFF.md`.
2. Re-run `npm run assert:secrets`, `npm run assert:r2`, and `npm run --silent token:logto` until they pass; then execute remote bootstrap + smoke to capture `/api/session` = 200 and `/app` screenshots.
