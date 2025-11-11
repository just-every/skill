## Summary
- Sidebar polish: bottom-anchored account + company menus, hover drop-up, softer overlays.
- Team page now allows inline name edits, role pills, and safe remove flows.
- Billing persistence (D1) plus Stripe products + Checkout endpoint improvements; added `BillingProduct` parsing & tests.
- Post-deploy smoke checks and gated `tests/e2e/authenticated.spec.ts` in `.github/workflows/deploy.yml`.
- Tests/typecheck: `pnpm --filter @justevery/worker run typecheck`, `npm run test --workspace workers/api`, `pnpm --filter @justevery/web run build`, `RUN_OPEN_E2E=true npm run test:e2e` (open suite).

## Validation
- `pnpm --filter @justevery/worker run typecheck`
- `npm run test --workspace workers/api`
- `pnpm --filter @justevery/web run build`
- `RUN_OPEN_E2E=true npm run test:e2e`
- Deploy smoke run: `gh run list deploy.yml`

## References
- docs/VERIFY.md
- docs/TEMPLATE_READY.md
- docs/ACCEPTANCE.md

## Authenticated E2E
- [ ] `TEST_SESSION_COOKIE` secret (Owner/Admin Better Auth session token) exists so the gated spec executes via `pnpm test:e2e -- tests/e2e/authenticated.spec.ts`.
