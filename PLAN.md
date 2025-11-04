# justevery Starter Stack – Delivery Plan (Updated 2025-11-04)

## Snapshot
- Repo already hosts the baseline Expo web shell, Cloudflare Worker, bootstrap automation, and docs.
- D1 migrations, R2 stubs, and Stripe product scaffolding exist but need reliability hardening before the template can be tagged "ready".
- Latest smoke run (2025-11-04) confirms landing, payments, and unauthenticated session endpoints respond, but the authenticated flow is still broken in production.
- Wrangler local dev loop works (`npm run dev:worker` + `.dev.vars`); leverage it for the Logto fixes before deploying.

## Locked / No Further Action Needed
- Architecture guardrails, repo layout, coding standards, and docs baseline (`README`, `docs/*`) are current.
- Worker serves static assets, landing, payments placeholder, and Stripe wiring with idempotent seed scripts.
- Bootstrap script provisions Cloudflare resources (D1, R2, Worker) and lays down WRANGLER config; reruns remain idempotent for infrastructure creation.

## Outstanding Work
### 1. Logto Web Flow (Highest Priority)
- **Bug**: `/app` gate relies on an undefined `sessionJwt` (apps/web/app/app.tsx:200) so the dashboard never unlocks after login.
- **Fix**: Refactor Expo app to depend on `useLogto()` access tokens; remove the dead `sessionJwt` branch and ensure `useLogtoReady()` waits for injected env.
- **Follow-up**: Confirm runtime env injection succeeds by reloading `https://demo.justevery.com/login` and observing the event handler consuming `window.__JUSTEVERY_ENV__`.

### 2. Auth Callback + Session API
- Worker lacks a `/callback` handler to exchange Logto authorization code for tokens. Either add Worker exchange logic or rely on Logto SPA SDK redirect flow exclusively—documented behaviour must match implementation.
- Add `/api/session` endpoint coverage for authorised requests (currently only 401 path is proven). Include a happy-path test in `workers/api/test/routes.extra.test.ts` with a mocked valid JWT.

### 3. Bootstrap Validation
- Re-run `./bootstrap.sh` (non-dry-run) after the auth fixes. Ensure the script:
  - Executes migrations remotely (`wrangler d1 execute --remote demo-d1`).
  - Seeds `projects` row and verifies count ≥ 1 in remote DB.
  - Uploads placeholder asset to R2 (hero image) so app preview is populated.
- Capture output (stdout + generated `.env.local.generated`) and attach to `docs/DEPLOYMENTS.md`.

### 4. Smoke & Screenshot Harness Integration
- Promote `scripts/smoke-check.cjs` and new screenshot harness into CI once auth is reliable.
- Ensure `npm run smoke` and `npm run smoke:screens` include Logto-authorised checks when `LOGTO_TOKEN` is provided; document usage in README.
- Expand coverage so every routed page (`/`, `/login`, `/callback`, `/logout`, `/app`, `/payments`) is exercised manually or via Playwright. Validate all internal links, external redirects, and R2-hosted assets render correctly before signing off.

### 5. Local Wrangler Workflow
- Document and standardise `.dev.vars` under `workers/api/` with bindings for D1, R2, and `LOGTO_*` to mimic production secrets locally.
- Encourage using `npm run dev:worker` (Miniflare) during feature work; combine with `EXPO_PUBLIC_WORKER_ORIGIN=http://127.0.0.1:8787` when running `npm run dev:web`.
- Capture guidance for `wrangler dev --remote` when Logto JWT validation must hit the real tenant.

### 6. Documentation Updates
- Update `docs/DEPLOYMENTS.md` and `docs/VERIFICATION.md` with the latest bootstrap run, including timestamps and D1 query output.
- Add a “Logto troubleshooting” section in `docs/SSO.md` summarising the fixes above.

## Risks & Watchlist
- **Logto tokens**: Ensure environment variables remain in sync across Worker secrets and Expo runtime. Missing `LOGTO_JWKS_URI` will break auth silently.
- **Cloudflare limits**: Bootstrap creates resources with deterministic names (`demo-d1`, `demo-assets`); ensure teardown or reuse when cloning template.
- **Stripe mode drift**: Guard bootstrap to respect `STRIPE_MODE` and avoid contaminating live products with demo data.

## Immediate Next Steps
1. Patch Expo app & Worker auth flow (sections 1–2). Validate locally with `npm run dev:worker` + `npm run dev:web`, then rerun `npm test --workspace workers/api`.
2. Exercise every published page locally and in staging (links, assets, redirects) using `npm run smoke`, `npm run smoke:screens`, and manual checks. Capture failures in `docs/VERIFICATION.md`.
3. Execute bootstrap against https://demo.justevery.com, stash smoke/screenshot artifacts in `test-results/`, and refresh docs per sections 5–6 before cutting the template tag.

Once these steps are complete, the starter stack can be declared production-ready for cloning into new `justevery` products.
