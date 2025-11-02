# Project Bootstrap Plan

## 1. Goals & Guiding Principles
- Deliver a reusable starter repo for future `justevery.com` projects with opinionated defaults and batteries included.
- Prioritise Cloudflare-native hosting (Workers + D1 + R2) and managed services (Stytch SSO, Stripe billing).
- Keep the web experience deployable immediately, while the Expo/React Native codebase stays platform-agnostic for mobile expansion.
- Automate provisioning and deployments via `wrangler` and a `bootstrap.sh` script using environment-driven configuration.

## 2. Target Architecture
- **Client**: Expo (React Native) app targeting web first (`expo-router` + `expo` web build). Separate routes for landing, login, authenticated app, and payments placeholder.
- **Worker**: Cloudflare Worker serving SSR/static assets (landing, login, app shell) and acting as an API proxy to Stytch, Stripe, and D1.
- **Database**: Cloudflare D1 for app data (users, subscriptions, feature flags, audit trail) with migrations managed via `drizzle-kit` or Wrangler migrations.
- **Storage**: Cloudflare R2 for asset uploads (user avatars, marketing images). Access through signed URLs from the Worker.
- **Authentication**: Stytch SSO (login.justevery.com) using OAuth redirect into Worker → Expo app. Session management through Stytch session tokens stored in Durable Objects/Workers KV.
- **Payments**: Stripe Billing products configured per project; Worker webhook endpoint to sync status into D1.
- **CI/CD**: GitHub Actions workflow deploying Worker via Wrangler, running tests/linting, building Expo web bundle, seeding D1, and validating bootstrap script.

## 3. Repository Structure
- `apps/web/` – Expo project with `expo-router`, routes: `/` (landing), `/login`, `/app`, `/payments`.
- `workers/api/` – Cloudflare Worker (TypeScript) handling SSR, auth callbacks, API routes, Stripe webhooks.
- `packages/ui/` – Shared React Native components (buttons, layout, theming) reused across routes.
- `packages/config/` – Centralised TypeScript config, environment schema (using `zod`), and service clients.
- Config files: `wrangler.toml`, `tsconfig`, `.eslintrc`, `prettier`, `.github/workflows/deploy.yml`, `.env.example`, `bootstrap.sh`.
- Docs: `README.md`, `PLAN.md` (this file), `docs/architecture.md`, `docs/bootstrap.md` (generated later).

## 4. Environment & Secrets Management
- `.env` (local only) populated from `/home/azureuser/.env`; `.env.example` includes:
  - `PROJECT_ID`, `LANDING_URL`, `APP_URL`, `STRIPE_PRODUCTS`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_R2_BUCKET`, `STYTCH_PROJECT_ID`, `STYTCH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Use `dotenv` + `zod` validator inside Worker and Expo app for safe access.
- Ensure `bootstrap.sh` loads `.env`, validates required variables, and exits early if any are missing.

## 5. Feature Workstream Breakdown
### 5.1 Marketing Landing Page
- Implement placeholder hero layout in Expo route `/` with neutral design and CTA linking to `/login`.
- Source assets from R2 (fallback to local placeholder). Ensure responsive design for desktop/mobile web.
- Include metadata (SEO tags) via Expo Router head config.

### 5.2 Login (SSO via Stytch)
- Use Stytch hosted login at `https://login.justevery.com` with redirect to Worker callback `/auth/callback`.
- Worker verifies Stytch tokens, stores session in D1 + Durable Object, sets HttpOnly cookie for Expo app consumption.
- Expo `/login` route triggers redirect to Stytch if unauthenticated and shows success message on return.
- Provide logout flow clearing session cookie.

### 5.3 App Shell (Authenticated)
- Expo `/app` route gated by session check (fetch to Worker `/api/session`).
- Render placeholder dashboard with welcome message and upcoming project modules.
- Define navigation skeleton for future features.

### 5.4 Payments Placeholder
- `/payments` route accessible from app shell.
- Display Stripe product data fetched from Worker `/api/stripe/products` (seeded via bootstrap).
- Add CTA button for buyers (links to Stripe Checkout placeholder).

### 5.5 Database Layer (Cloudflare D1)
- Define schema using Drizzle ORM or SQL migrations: `users`, `sessions`, `projects`, `subscriptions`, `audit_log`.
- Provide `scripts/migrate.ts` to run migrations via Wrangler.
- Add seeding script run during `bootstrap.sh` to create initial project entry.

### 5.6 Storage (Cloudflare R2)
- Configure bucket via Wrangler; ensure CORS for `*.justevery.com` origins.
- Worker endpoint to generate signed upload/download URLs.
- Expo app includes placeholder component demonstrating image upload (stub logic until mobile support).

### 5.7 GitHub Actions Deployment Workflow
- Workflow triggers on `main` pushes + manual dispatch.
- Jobs: install dependencies (pnpm), lint (dry-run first), run tests, build Expo web, run Worker typecheck, deploy via `wrangler deploy` (using GitHub secrets mirrored from `.env`).
- Post-deploy job runs integration smoke test hitting `/`, `/login`, `/app` with `wrangler dev` preview tokens.

## 6. bootstrap.sh Responsibilities
- Load `.env` and validate required keys.
- Cloudflare setup:
  1. Create/update Worker, bind D1 database, bind R2 bucket, configure routes for `https://{PROJECT_ID}.justevery.com` and `/app`.
  2. Create D1 database if missing, run migrations, seed default records.
  3. Create R2 bucket if missing and upload placeholder assets.
- Stytch setup: ensure project name matches `PROJECT_ID`, register redirect URLs (`LANDING_URL`, `APP_URL`), sync environment variables into Stytch application.
- Stripe setup: create or update products/prices listed in `STRIPE_PRODUCTS`, configure webhook endpoint pointing to Worker.
- Output summary, store generated IDs in `.env.local.generated` for auditing.

## 7. Documentation & Developer Experience
- Update `README.md` with quick-start: prerequisites, environment setup, running dev server (`pnpm dev`), Worker preview (`wrangler dev`), Expo app instructions.
- Add `docs/bootstrap.md` describing `bootstrap.sh` usage, expected outputs, rollback steps.
- Provide `docs/architecture.md` with diagrams linking Worker, Expo client, Stytch, Stripe, D1, R2.
- Include `CONTRIBUTING.md` with coding standards, lint/test instructions, branch naming, PR checklist.

## 8. Testing Strategy
- Unit tests for Worker handlers (session validation, Stripe webhook parsing) using Miniflare.
- Component tests for Expo UI (React Testing Library + Jest).
- E2E smoke tests using Playwright hitting the deployed preview (landing, login redirect, authenticated view) executed in CI and optionally via GitHub Actions workflow.
- bootstrap script integration test (dry-run mode) verifying API calls are triggered without mutations.

## 9. Roadmap & Stretch Goals
- Implement feature flag management UI for upcoming projects.
- Add support for mobile builds (iOS/Android) once web MVP stabilises.
- Introduce analytics pipeline (PostHog) with Worker event forwarding.
- Build CLI tool to scaffold new project clones using this template.

## 10. Open Questions / Follow-Ups
- Determine naming convention for Stripe products (`STRIPE_PRODUCTS` format) and storage for created IDs.
- Decide between Durable Objects vs. Workers KV for session storage; assess rate limits.
- Confirm domain provisioning flow with Cloudflare (wildcard vs per-project DNS records).
- Clarify access control model for internal admins vs external customers in D1 schema.
- Establish secrets rotation process across Cloudflare, Stytch, Stripe, and GitHub Actions.

## 11. Status (2025-11-02)
- **Sections 1–5 (architecture, app, worker, data)**: ✅ Implemented in repo; see `docs/VERIFICATION.md` for evidence mapping.
- **Section 6 (bootstrap.sh)**: ➡️ Script provisions Cloudflare D1/R2/KV, seeds DB, templates Wrangler config, and sets up Stripe products/webhooks. Remaining automation work: Cloudflare DNS + Worker deployment + Stytch management API calls + secret sync into Worker.
- **Section 7 (documentation)**: ✅ Completed (`README.md`, `docs/bootstrap.md`, `docs/architecture.md`, `docs/SSO.md`, `docs/VERIFICATION.md`, `CONTRIBUTING.md`).
- **Section 8 (testing)**: ✅ Worker unit tests, Expo component tests, Playwright smoke tests, and CI workflow in place.
- **Sections 9–10**: 📌 Still roadmap/open; no implementation expected yet.

## 12. Completing the Bootstrap Flow with ~/.env Credentials

The following steps describe how the single `bootstrap.sh` run should consume the existing secrets in `/home/azureuser/.env` so no manual follow-up is required. The script should guard each step, create missing resources, and patch mismatches.

1. **Load configuration**
   - Read shared platform credentials from `/home/azureuser/.env` (Cloudflare, Stripe, Stytch). These values apply to every subdomain under `justevery.com`.
   - Pull per-product inputs (`PROJECT_ID`, `LANDING_URL`, `APP_URL`, `STRIPE_PRODUCTS`, optional `STRIPE_MODE`) from the repo-local `.env`. Each project template keeps its own `.env` with these overrides while still relying on the shared `$HOME/.env` for privileged keys.
   - Export Cloudflare credentials: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (token must include Workers, D1, R2, KV, DNS scopes). Keep `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY` on hand for DNS APIs that still require the older key/email pair.

2. **Cloudflare provisioning**
   - **Workers + bindings**: Use `CLOUDFLARE_API_TOKEN` with Wrangler to ensure the Worker script exists, binding `SESSION_KV`, `DB`, and `STORAGE`. Continue using the existing D1/R2/KV ensure functions.
   - **DNS + routes**: With `CLOUDFLARE_ZONE_ID` and either the API token (preferred) or API key/email, check for a `CNAME` (or `AAAA` if using proxied Workers) pointing `{PROJECT_ID}.justevery.com` at the Worker. Create/update if missing.
   - **Custom domain binding**: Call `wrangler routes`/Cloudflare Workers API to attach the Worker to the new hostname so requests resolve immediately.
   - **Deployment**: Run `wrangler deploy` using the templated `workers/api/wrangler.toml` once bindings and DNS are ready.

3. **Database + storage finalisation**
   - Continue running migrations and seeding via `node workers/api/scripts/migrate.js` and D1 `execute` calls.
   - Confirm R2 placeholder asset exists; re-upload if missing.

4. **Stripe automation**
   - Read `STRIPE_MODE` (default `test`). Select the matching secret key from `/home/azureuser/.env`: `STRIPE_TEST_SECRET_KEY` when `test`, `STRIPE_LIVE_SECRET_KEY` when `live`.
   - Provision products/prices from `STRIPE_PRODUCTS`, create/update webhook endpoint at `${LANDING_URL}/webhook/stripe`, and capture `STRIPE_WEBHOOK_SECRET` in `.env.local.generated`.
   - Push `STRIPE_WEBHOOK_SECRET` into Worker secrets automatically via `wrangler secret put` so the deployed Worker is ready.

5. **Stytch management**
   - Authenticate using `STYTCH_MANAGEMENT_KEY_ID` + `STYTCH_MANAGEMENT_SECRET` alongside `STYTCH_PROJECT_ID` and `STYTCH_PROJECT_ENVIRONMENT` to call the Management API.
   - Ensure redirect URLs (`LANDING_URL`, `APP_URL`, `/auth/callback`) are registered, update the hosted login configuration, and link the provided `STYTCH_SSO_CONNECTION_ID` (or fallback slug/domain values).
   - Sync runtime secrets into the Worker (`STYTCH_PROJECT_SECRET`, `STYTCH_PUBLIC_TOKEN`, `STYTCH_SSO_CONNECTION_ID`, optional domain/slug) using `wrangler secret put` so `/login` and `/auth/callback` succeed post-deploy.

6. **Verification + reporting**
   - Once provisioning completes, automate smoke checks (`curl` `/`, `/login`, `/app`, `/api/session`) and write the results to `docs/DEPLOYMENTS.md`.
   - Update `.env.local.generated` with IDs and timestamps so future runs can diff expected vs actual resources.
   - Emit a final summary indicating whether each subsystem changed (DNS, Worker, Stripe, Stytch) to make reruns idempotent.

Implementing the remaining automation in steps 2–6 will deliver the desired one-command bootstrap experience while leveraging only the credentials already stored in `/home/azureuser/.env`.

## 13. Cleanup & Production Readiness Checklist

After the `demo.justevery.com` environment is fully automated and deployed, follow this list before cloning the template for new products. The intent is to keep the demo instance live (and its `.env` values checked into this repo) so future updates can be verified against a stable reference.

1. **Confirm demo deployment health**
   - Run bootstrap in non-dry-run mode and ensure the Worker, DNS, Stytch, and Stripe resources converge without manual intervention.
   - Execute the smoke tests (`npm run test:e2e` or the CI workflow) and record results in `docs/DEPLOYMENTS.md`.

2. **Snapshot credentials & metadata**
   - Keep `./.env` in the repo with demo-specific values (non-secret identifiers only). Regenerate `.env.local.generated` and commit the diff to secrets storage (not to git) so the audit trail reflects the latest IDs.
   - Ensure `/home/azureuser/.env` remains the canonical store for shared credentials the bootstrap script reads across all products.
   - Document webhook endpoints, connection IDs, and database names in `docs/VERIFICATION.md` for quick validation.

3. **Strip demo-only data from seed path**
   - Ensure D1 migrations + seed scripts contain only generic bootstrap fixtures. Any demo content (sample users, marketing copy, Stripe products) should reside in `.env` or R2, not in code, so fresh products start clean.

4. **Tag the template state**
   - Create a git tag (e.g. `template-ready-2025-11-02`) after verifying the demo deployment. This tag becomes the starting point when spinning up future product repos.

5. **Document clone procedure**
   - Update `docs/bootstrap.md` with a “New product rollout” appendix that references the final bootstrap script, required `.env` overrides, and any environment-specific gotchas discovered while finishing demo.justevery.com.

6. **Lock down production secrets**
   - Rotate or remove any demo API keys that shouldn’t inform production. Ensure the management keys in `/home/azureuser/.env` remain valid, but set expectations (e.g. label them “demo/seed only”) so production clones supply their own credentials.

Once these items are checked, the repo can serve as the canonical starter kit. Future products inherit the documented bootstrap flow, while the live demo deployment stays in sync to validate upcoming changes.
