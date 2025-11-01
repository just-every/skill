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
- Jobs: install dependencies (pnpm), lint (dry-run first), run tests, build Expo web, run Worker typecheck, deploy via `wrangler publish` (using GitHub secrets mirrored from `.env`).
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
