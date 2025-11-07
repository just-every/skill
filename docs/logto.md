# Logto + Expo Integration Guide

This starter wires the Expo shell (`apps/web`) to Logto using a Traditional application. Native builds still lean on the official `@logto/rn` SDK, but the web experience now delegates the entire PKCE exchange to the Worker so the login flow is a full-page redirect instead of a popup.

## Redirect flow (web)

1. `useLogto()` on web calls `window.location.assign(workerOrigin + '/auth/sign-in?return=...')`.
2. The Worker (see `handleAuthSignIn` in `workers/api/src/logtoAuth.ts`) generates PKCE state, caches it in an HttpOnly cookie, and redirects to Logto.
3. Logto sends the browser back to `/callback`. The Worker exchanges the code using `LOGTO_APPLICATION_SECRET`, stores the resulting tokens in an encrypted session cookie, and finally bounces the user back to the requested page.
4. The dashboard continues to fetch bearer tokens when it needs them (for example, to call `/api/session`) via the new helper endpoints described below.

## Client usage (`apps/web/src/auth/LogtoProvider.tsx`)

- `useLogto()` still exposes `signIn`, `signOut`, `getAccessToken`, `getIdTokenClaims`, and `fetchUserInfo`, but on web each method simply proxies to the Worker:
  - `GET /auth/token` returns an access token for `LOGTO_API_RESOURCE` so the dashboard can keep calling `/api/*` with a bearer header.
  - `GET /auth/id-token` and `GET /auth/userinfo` hydrate the “ID token claims” and “User info” cards without exposing the Logto secret to the browser.
  - `POST /auth/sign-out` revokes the refresh token (when one exists) and clears the signed cookie before redirecting home.
- Native builds still render the upstream `@logto/rn` provider so Expo Go and device builds behave the same as before.

## Worker validation (`workers/api/src/index.ts`)

Every `/api/*` route still verifies bearer tokens by calling `jwtVerify` with the Logto JWKS. The new `/auth/*` endpoints are responsible only for exchanging, refreshing, and returning tokens over HTTPS.

### `/auth/sign-in`
Generates PKCE state and stateful cookies before redirecting the browser to the Logto hosted login page. Accepts an optional `return` query param so the dashboard can deep-link back to `/app`, `/pricing`, etc.

### `/callback`
Handles the `code`/`state` response from Logto, exchanges the code using `LOGTO_APPLICATION_SECRET`, stores the resulting tokens in an HttpOnly cookie, and redirects the browser back to the original page.

### `/auth/token`, `/auth/id-token`, `/auth/userinfo`
Expose access tokens, ID token claims, and user info to the dashboard UI. These endpoints require the session cookie (automatically sent via `credentials: 'include'`) and never reveal the Logto secret.

### `/auth/sign-out`
Revokes the refresh token when one exists, clears the cookie, and redirects to `/?return=...`.

## Quick start

1. Configure `.env.local.generated` (or rerun `pnpm bootstrap:env`) so the following exist:
   - `EXPO_PUBLIC_LOGTO_ENDPOINT`
   - `EXPO_PUBLIC_LOGTO_APP_ID`
   - `EXPO_PUBLIC_LOGTO_REDIRECT_URI*`
   - `EXPO_PUBLIC_API_RESOURCE`
   - `LOGTO_APPLICATION_SECRET` (written automatically when the bootstrap CLI provisions the Traditional app; set it in production with `wrangler secret put LOGTO_APPLICATION_SECRET`).
2. `pnpm --filter @justevery/web run build`
3. `pnpm bootstrap:deploy`
4. Visit `https://starter.justevery.com/app` (or `localhost:19006`) and click **Sign in with Logto**.
5. After returning from Logto you should see:
   - User info + ID token claims.
   - API resource tokens with prefixes.
   - Ability to edit branding (persists via `/api/accounts/{slug}/branding`).

For more advanced scenarios (custom scopes/resources, fetching extra claims, etc.) reference the inline comments in `Dashboard.tsx` and the snippets in your issue description.
