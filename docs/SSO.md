# SSO and Stytch

This project uses [Stytch](https://stytch.com) for passwordless SSO. The Cloudflare Worker handles the login redirect, validates the callback, persists sessions in D1/KV, and redirects authenticated users into the Expo app shell.

## Required environment variables

Set these in `.env` (or the relevant secrets store) before running `bootstrap.sh`:

- `STYTCH_PROJECT_ID` – Project-level identifier used as the public token when initiating the hosted login.
- `STYTCH_SECRET` – Stytch project secret used to verify callbacks and exchange session tokens.

### Optional overrides

- `STYTCH_LOGIN_URL` (default `https://login.justevery.com`) – Base URL for the hosted login experience.
- `STYTCH_REDIRECT_URL` – Absolute callback URL; if omitted the Worker sends `{request_origin}/auth/callback`.
- `APP_BASE_URL` – Path or absolute URL the Worker redirects to after successful sign-in (defaults to `/app`).
- `LANDING_URL` – Marketing/root URL used for logout redirects and route provisioning.
- `STYTCH_PUBLIC_TOKEN`, `STYTCH_SSO_CONNECTION_ID`, `STYTCH_ORGANIZATION_*`, `STYTCH_SSO_DOMAIN` – Fine-grained control over which SSO connection is invoked. See `packages/config/src/env.ts` for the full list.

Refer to `.env.example` for a complete template.

## Redirect URLs

The Worker expects the Stytch callback at `/auth/callback`. During login it sends Stytch two URLs:

- The landing page (`LANDING_URL`) for post-login marketing redirects.
- The authenticated callback (`${APP_URL}/auth/callback`) unless `STYTCH_REDIRECT_URL` is explicitly set.

`bootstrap.sh` calls the Stytch Management API (when `STYTCH_PROJECT_ID` and `STYTCH_SECRET` are present) to ensure both URLs exist in your project’s allowed redirect list and, when `STYTCH_SSO_CONNECTION_ID`/`STYTCH_SSO_DOMAIN` are provided, to attach the configured SSO domain to the connection. Dry runs print the intended API calls without mutating remote state.

## Running bootstrap

- `DRY_RUN=1 ./bootstrap.sh` logs the planned Stytch redirect sync with `[dry-run]` markers and writes `.env.local.generated` using placeholder values so you can verify the configuration without side effects.
- Running without `DRY_RUN` creates missing redirect URLs, seeds Cloudflare resources, and records their identifiers in `.env.local.generated` (keep that file out of version control).

## Verifying SSO end-to-end

1. Run the Worker locally (`pnpm --filter @justevery/worker dev` or `wrangler dev`).
2. Visit `/login` – you should be redirected to Stytch with `redirect_url=` pointing at your callback.
3. Complete the hosted login. After the Worker processes the callback it issues the `je_session` cookie and redirects to `APP_BASE_URL`.
4. Hit `/api/session` to confirm `{ authenticated: true, ... }` payloads for logged-in users.

## Managing secrets

Store production secrets using Wrangler instead of committing them to `.env`:

```bash
wrangler secret put STYTCH_SECRET --config workers/api/wrangler.toml
wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/api/wrangler.toml
# add --env production for scoped environments
```

## Troubleshooting

- `SSO configuration is incomplete` – Provide either `STYTCH_SSO_CONNECTION_ID` or a valid slug/domain so the Worker can determine which connection to start.
- `Redirect URL not allowed` on Stytch – Ensure both `LANDING_URL` and `${APP_URL}/auth/callback` are present in the Stytch dashboard or rerun bootstrap with valid credentials so it can create them.
- `STYTCH_PUBLIC_TOKEN missing` log – The Worker falls back to `STYTCH_PROJECT_ID` automatically; set `STYTCH_PUBLIC_TOKEN` if you use separate public tokens per environment.
