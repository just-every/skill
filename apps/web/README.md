# Justevery Expo Placeholder

This Expo shell is intentionally minimal and exists to validate Logto native authentication wiring plus
connectivity to the Cloudflare Worker provisioned by `bootstrap.sh`.

## Configure Logto & Worker

1. Run `./bootstrap.sh` (or source its generated `.env.local.generated`) so your shell exports the `EXPO_PUBLIC_*` variables.
   - `bootstrap.sh` now surfaces the Worker origin, API resource, and Logto redirect URLs alongside the existing Cloudflare/Stripe values.
   - For local sessions, run `set -a; source ./.env.local.generated; set +a` before `pnpm --filter apps/web dev`.
2. Confirm the Logto native application in the Console lists the same redirect URI scheme as `app.json` (default: `justevery://callback`).

## Running locally

```bash
pnpm install
pnpm --filter apps/web dev
```

The placeholder renders a single screen with:

- **Sign in / Sign out** flows powered by `@logto/rn`, plus a profile summary fed by `fetchUserInfo()`.
- **Worker integration** helpers that open the deployed Worker shell and fetch `/api/stripe/products` to verify bootstrap wiring.

## Notes

- Metro package exports are enabled via `metro.config.js` to satisfy `@logto/rn`.
- The provider applies a default `email` scope; override it through `EXPO_PUBLIC_LOGTO_SCOPES` if needed.
- For native builds, register the redirect URI scheme (e.g. `justevery://callback`) in the Logto Console and in the Expo project configuration.
