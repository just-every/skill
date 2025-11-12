# Changelog

## [0.2.0]
- UI sidebar polish (bottom-anchored account/company menus, hover drop-up switcher, softer overlays/shadows) in `apps/web/src/app/AppShell.tsx` plus Playwright hooks.
- Team page name edit, role pills, and removal modal updates in `apps/web/src/app/screens/TeamScreen.tsx`.
- Billing contact persistence via D1, Stripe Checkout handling, and payment metadata parsing in `workers/api/src/index.ts`, plus helper/test instrumentation and type fixes in `workers/api/test/*`.
- Post-deploy smoke checks covering `/api/status` and `/api/stripe/products`, plus open Playwright E2E guidance captured in `docs/ACCEPTANCE.md`/`docs/VERIFY.md`.
- Typecheck/test stability (`pnpm --filter @justevery/worker run typecheck`, `npm run test --workspace workers/api`, `pnpm --filter @justevery/web run build`, `RUN_OPEN_E2E=true npm run test:e2e`).

## Release Checklist
- Confirm `docs/ACCEPTANCE.md` and `docs/VERIFY.md` are up to date for stakeholders and handoff.
- Run `RUN_OPEN_E2E=true npm run test:e2e` to cover the open Playwright suite (authenticated coverage returns once login.justevery.com exposes M2M tokens).
- Capture `landing.png`/`app.png` in `docs/assets/` after smoke tests.
