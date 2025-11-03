# Authentication with Stytch B2B

The starter stack now relies on the Stytch React B2B SDK in the Expo web app to
own the interactive login experience. The frontend obtains a `session_jwt`
directly from Stytch and forwards it to the Worker in the
`Authorization: Bearer <session_jwt>` header. The Worker verifies every request
by calling Stytch’s
[`/v1/b2b/sessions/authenticate`](https://stytch.com/docs/b2b/api/authenticate-session)
endpoint before serving protected data.

## Required environment variables

Set the following in `.env` (or your secret manager) before running the stack:

| Variable | Purpose |
| --- | --- |
| `STYTCH_PROJECT_ID` | Project identifier used to authenticate with Stytch. |
| `STYTCH_SECRET` | Server-side secret used when calling Stytch’s Management APIs and `sessions.authenticate`. |
| `EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN` | Public token consumed by the Expo web app when initialising the Stytch B2B SDK. |
| `EXPO_PUBLIC_STYTCH_BASE_URL` | (Optional) Custom Stytch domain (CNAME) required when HTTP-only cookies are enforced. |

Optional but helpful:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_WORKER_ORIGIN` | Absolute URL the web client should use when talking to the Worker (e.g. `http://localhost:8787` in development). |
| `APP_BASE_URL` | Where to send users after login (`/app` by default). |
| `STRIPE_WEBHOOK_SECRET` | Used by the Worker’s Stripe webhook verifier. |

Refer to `.env.example` for a full template.

`bootstrap.sh` writes the resolved Stytch identifiers to `.env.local.generated`, including
`EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN`. Copy those keys into `apps/web/.env.local` (or export them in
your shell) so the Expo runtime can initialise the Stytch SDK locally.

## Flow overview

1. The Expo web app renders the Stytch React B2B login component. Once the user
   completes the flow, Stytch issues a `session_jwt` on the client.
2. The app stores the session using `useStytchB2BSession` and includes the JWT
   in the `Authorization` header for every Worker request.
3. The Worker calls `POST https://test.stytch.com/v1/b2b/sessions/authenticate`
   (or `https://api.stytch.com` in live environments) with Basic auth derived
   from `STYTCH_PROJECT_ID:STYTCH_SECRET`.
4. If Stytch returns a valid session, the Worker proceeds with the request. If
   verification fails, the Worker returns `401 Unauthorized`.

No cookies, redirects, or KV/D1 session storage are involved anymore. All
session state lives on the client; the Worker only validates bearer tokens on
each call.

## Local development

1. Install dependencies and run the web app with `npm run dev:web`.
2. Start the Worker with `npm run dev:worker`.
3. Make sure `.env` (or your shell) provides the three Stytch variables above.
4. Visit `/login` in the Expo web shell, sign in with Stytch, then access the
   authenticated routes. Network calls to `/api/*` should now include the bearer
   token automatically.

To inspect Worker traffic you can curl endpoints manually:

```bash
curl \
  -H "Authorization: Bearer <session_jwt>" \
  https://localhost:8787/api/session
```

## Deployment notes

- Rotate `STYTCH_SECRET` using the Stytch dashboard and update the secret via
  `wrangler secret put STYTCH_SECRET --config workers/api/wrangler.toml`.
- Keep `EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN` in sync with your active Stytch environment. Regenerate
  `.env.local.generated` (or adjust `apps/web/.env.local`) whenever the public token changes so the
  embedded login continues to initialise correctly.
- The Worker no longer manages redirect URLs or generates PKCE state. Ensure
  the set of allowed redirect URLs is managed directly in the Stytch console to
  align with your frontend deployment URLs.
- Native (non-web) surfaces still display a message directing users to the web
  login until a dedicated native integration is implemented.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| `401 Unauthorized` from Worker | Confirm the request carries `Authorization: Bearer <session_jwt>` and that the JWT has not expired. |
| Worker logs `Stytch authentication rejected` | Verify `STYTCH_PROJECT_ID`, `STYTCH_SECRET`, and that the JWT is from the correct environment (test vs live). |
| Expo login renders blank | Ensure `EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN` is set and matches the environment (test/public vs live/public). |

The Worker no longer exposes `/login`, `/auth/callback`, or `/api/debug/login-url`.
If you still see references to those routes, clear caches and redeploy to pick
up the updated build.
