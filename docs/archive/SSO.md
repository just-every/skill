# SSO / Better Auth Playbook

## Overview
- Better Auth lives at `https://login.justevery.com` and handles all user-facing
  sign-in + session issuance.
- The Cloudflare Worker in `workers/api` verifies sessions via the Better Auth
  `/api/auth/session` endpoint and requires the `LOGIN_SERVICE` service binding.
- Session cookies (`better-auth.session_token`) are scoped to `/api/*`, so any
  app route that needs auth must proxy through the Worker.

## Required Env
- `LOGIN_ORIGIN=https://login.justevery.com`
- `BETTER_AUTH_URL=${PROJECT_DOMAIN}/api/auth` (override if auth is on another
  domain).
- `SESSION_COOKIE_DOMAIN=<project host>`

These values are derived automatically by `pnpm bootstrap:env` but should be
verified whenever you rename the project or change the public domain.

## Local Testing
1. Run `pnpm bootstrap:env` to regenerate `.env.local.generated` and
   `workers/api/.dev.vars`.
2. Start the worker with `npm run dev:worker` so Miniflare loads the bindings.
3. Start the Expo shell with `EXPO_PUBLIC_WORKER_ORIGIN=http://127.0.0.1:8787`.
4. Use Better Auth credentials in the hosted login page to obtain a session and
   exercise `/app` flows.

## Troubleshooting
- **missing_cookie**: confirm the browser is calling `/api/*` endpoints (not
  hitting the Better Auth origin directly) and that the cookie domain matches
  `PROJECT_DOMAIN`.
- **LOGIN_SERVICE timeout**: ensure `wrangler.toml` includes the
  `[[services]]` stanza binding `login` and redeploy via `pnpm bootstrap:deploy`.
- **CSRF / redirect loops**: verify `SESSION_COOKIE_DOMAIN` omits the scheme,
  and confirm the public domain matches the one Better Auth expects.
