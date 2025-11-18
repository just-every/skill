# Architecture Plan

1. **Better Auth login worker** – Dedicated Cloudflare Worker at `login.justevery.com` handles all sign-in flows. Client env exposes `LOGIN_ORIGIN`, `BETTER_AUTH_URL`, and `SESSION_COOKIE_DOMAIN`.
2. **API worker** – Consumes session cookies by forwarding them to the Better Auth `/api/auth/session` endpoint (see `packages/auth-shared`). Middleware caches responses briefly to avoid excess latency.
3. **Bootstrap CLI** – Only provisions Cloudflare and Stripe resources. Better Auth stays external; env scaffolding ensures the new auth variables reach `.env.generated`, `workers/api/.dev.vars`, and Expo runtimes.
4. **Docs & Runbooks** – Operational playbooks live under `docs/archive/`. See `docs/archive/SSO.md` for auth flows and `docs/archive/DEPLOYMENTS.md` for deployment/monitoring steps.

Update this file whenever auth flows or providers change to keep downstream teams aligned.
