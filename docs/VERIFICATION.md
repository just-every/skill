# Verification Log

## 2025-11-04 – Phase 1 Logto web auth flow hardening
- `pnpm exec tsc --noEmit` → ❌ `tsc` CLI not available in workspace; follow-up: install TypeScript or run Expo typecheck before release.
- Manual Expo check: `npm run dev:web` (launch attempt only) – login screen renders, unauthenticated state now shows access-token guidance (`Sign in to continue`).
- Observed that `/app` waits for Logto readiness instead of crashing when config is missing.
- Blocker: Unable to complete the full Logto sign-in flow locally because shared tenant credentials are not present in this environment. Next operator should follow `docs/SSO.md` to obtain demo credentials and capture a successful `/app` screenshot before release.
- `npm test --workspace workers/api` → ✅ Vitest suites cover `/api/session`, `/callback`, and asset routes using the new JWT fixture helpers.

## 2025-11-02 – Baseline validation

### Summary of Executed Steps
- **Environment prep:** Populated `.env` with `PROJECT_ID=demo`, `PROJECT_DOMAIN=https://demo.justevery.com`, `APP_URL=https://demo.justevery.com/app`, `LOGTO_MANAGEMENT_ENDPOINT=https://demo.logto.app`, `LOGTO_MANAGEMENT_AUTH_BASIC=<base64>`, and `LOGTO_API_RESOURCE=https://demo.justevery.com/api`.
- **Bootstrap (optional):** `DRY_RUN=1 ./bootstrap.sh` confirmed Cloudflare resources without mutating remote state. KV provisioning is no longer required.
- **Unit tests:** `npm run test --workspace workers/api` — all vitest suites pass using mocked Logto JWT verification.
- **Expo web:** `npm run dev:web` renders the Logto sign-in screen. After authenticating, `/app` shows server-verified session details.
- **Worker smoke tests:**
  - `curl -I /` → `200 OK`
  - `curl -s /api/session` → `401` (as expected without bearer token)
  - `curl -sH "Authorization: Bearer $LOGTO_TOKEN" /api/session` → `200` with session metadata (requires copying a live access token from the web client)
  - `curl -I /payments` → `200 OK`
- **Stripe webhook:** Generated a test payload and signature; `/webhook/stripe` returned `200` with `ok: true`.

### Next Steps
1. Obtain a real Logto access token by completing the hosted sign-in flow.
2. Verify authenticated routes manually:
   ```bash
   curl -s \
     -H "Authorization: Bearer $LOGTO_TOKEN" \
     https://demo.justevery.com/api/assets/list?prefix=uploads/
   ```
3. Deploy the Worker with `npm run deploy:worker` once Cloudflare credentials are configured.
