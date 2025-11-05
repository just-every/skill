# Local Development – Wrangler

This guide explains how to work on `workers/api` with Wrangler and how to pair it with the Expo web shell.

## Development Modes

| Mode | Command | When to use | Notes |
| --- | --- | --- | --- |
| **Local (Miniflare)** | `npm run dev:worker` | Day-to-day feature work, fast feedback | Reads `workers/api/.dev.vars`; state kept in `.wrangler/state/`; HTTPS disabled by default. |
| **Remote (Edge runtime)** | `wrangler dev --remote --config workers/api/wrangler.toml` | Validate against real Cloudflare bindings/secrets | Ignores `.dev.vars`; ensure secrets are set with `wrangler secret put`. |
| **Hybrid (Expo + Worker)** | Run the worker via one of the above and set `EXPO_PUBLIC_WORKER_ORIGIN` before `npm run dev:web` | UI/Worker integration and login flows | Use `http://127.0.0.1:8787` for local worker; use deployed URL for remote. |

## Quick Start

1. **Install deps** – `pnpm install --frozen-lockfile`
2. **Copy vars** – `cp workers/api/.dev.vars.example workers/api/.dev.vars` and fill values
3. **Run worker locally** – `npm run dev:worker`
4. **Run Expo web** – `EXPO_PUBLIC_WORKER_ORIGIN=http://127.0.0.1:8787 npm run dev:web`
5. **Remote spot-check** – `wrangler dev --remote --config workers/api/wrangler.toml`

## Frequently Used Commands

- Tail logs (local): `wrangler tail --config workers/api/wrangler.toml`
- Run migrations: `pnpm --dir workers/api run d1:migrate`
- Seed storage locally: `wrangler r2 object put --file ./path workers/api-assets@local/uploads/demo.txt`
- Unit tests: `npm test --workspace workers/api`

## `.dev.vars` Expectations

`wrangler dev` (local) reads `workers/api/.dev.vars` for bindings:

```env
DB=app-db            # D1 binding name used in wrangler.toml
ASSETS=local-assets  # R2 binding name used in wrangler.toml
LOGTO_ISSUER=https://tenant.logto.app/oidc
LOGTO_AUDIENCE=https://demo.justevery.com/api
LOGTO_JWKS_URI=https://tenant.logto.app/oidc/jwks
STRIPE_WEBHOOK_SECRET=whsec_xxx            # optional
STRIPE_SECRET_KEY=sk_test_xxx              # optional
```

The file is ignored by Git—use `.dev.vars.example` as the template when onboarding.

## Troubleshooting

- **JWKS fetch failures / 401**
  - Confirm `LOGTO_ISSUER` ends with `/oidc`; restart Miniflare if you change it (JWKS is cached).
  - If the JWKS endpoint requires the real tenant, test with `wrangler dev --remote`.
- **Audience mismatch**
  - HTTP 401/403 with `WWW-Authenticate: ... insufficient_scope` → decode the token (`jwt.io`) and ensure `aud` includes `LOGTO_AUDIENCE`.
  - Update the Logto resource in the console if needed and restart the worker.
- **D1 differences**
  - Local state lives under `.wrangler/state/`; delete the directory to reset.
  - Remote mode uses true D1 – ensure migrations are applied via `wrangler d1 migrations apply`.
- **Expo cannot reach local worker**
  - Verify `EXPO_PUBLIC_WORKER_ORIGIN` matches the dev worker URL (including protocol).
  - Check CORS preflight: local worker returns 204 for `OPTIONS /api/*` when running via `npm run dev:worker`.
- **Miniflare port conflicts**
  - Override with `WRANGLER_DEV_PORT=8788 npm run dev:worker` and set the same origin for Expo.

## Safety Checklist

- Never commit `.dev.vars`; keep secrets in 1Password or similar.
- Use `scripts/sync-dev-vars.sh` to merge updates safely; it only touches whitelisted keys.
- For remote mode, use `wrangler secret put` to sync any updated secret before testing.

