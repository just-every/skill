# Auth Session Setup

1. **Sign in as an Owner/Admin.** Open the deployed app (`https://starter.justevery.com/app`), complete Better Auth login with an owner/admin account, and stay on a page under `/app` so the session exists in the browser.
2. **Capture `better-auth.session_token`.** Open DevTools → Application (Chrome) / Storage (Firefox) → Cookies → `https://starter.justevery.com`. Copy the `better-auth.session_token` value from the cookie list; it is scoped to `/api/*` and includes the session token you will reuse in CI.
3. **Save as `TEST_SESSION_COOKIE`.** In GitHub, go to Settings → Secrets & variables → Actions and create the secret `TEST_SESSION_COOKIE` (use the raw cookie string, no `name=` prefix). This secret only needs to live in environments that should run the gated E2E job.
4. **Re-run deploy workflow.** Trigger `.github/workflows/deploy.yml` with `mode=deploy` (via `gh workflow run ...`). When the secret exists, the `e2e` job runs `pnpm test:e2e -- tests/e2e/authenticated.spec.ts`, intercepts members/billing/checkout, and uploads screenshots/test-results. Without the secret, E2E is skipped.

> 🔐 **Warning:** `TEST_SESSION_COOKIE` contains a live Better Auth session tied to your owner/admin user. Rotate it regularly, store it securely, and only inject it for deploys that truly need UI verification.
