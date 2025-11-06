# Script Deletion Plan

**Status:** ✅ Complete. All legacy scripts deleted and replaced by `@justevery/bootstrap-cli`.

---

## Deleted
- `bootstrap.sh` (replaced by `pnpm bootstrap:*` commands)
- Legacy shell helpers (`scripts/bootstrap/*.sh`)
- Smoke/validation scripts (`scripts/assert-*`, `scripts/*smoke*.cjs`, `scripts/bootstrap-validate.cjs`, `scripts/deploy-worker.cjs`, `scripts/run-smoke-suite.cjs`)
- Empty `scripts/legacy/` directory removed

---

## CLI coverage
- `pnpm bootstrap:preflight` – validation
- `pnpm bootstrap:env` – env generation (`--dry-run`/`--check` supported)
- `pnpm bootstrap:apply` – infrastructure reconciliation (`--deploy` to chain deploy)
- `pnpm bootstrap:deploy` – wrangler rendering + deploy (`--dry-run` default)
- `pnpm bootstrap:smoke` – HTTP checks + Playwright screenshots

---

## Remaining utilities
- `scripts/fetch-logto-token.cjs` (used by `pnpm token:logto`)
- `scripts/smoke-local.cjs` (used by `pnpm smoke:local`)

---

## Validation Checklist

- [x] Bootstrap CLI successfully passes all tests in `packages/bootstrap-cli/test/`
- [x] CI workflows updated to use CLI commands (no shell script references)
- [x] All legacy scripts deleted from `scripts/` directory
- [x] Empty `scripts/legacy/` directory removed
- [x] `npm run` scripts all point to CLI or direct tools
- [x] Documentation updated to reflect new structure
- [x] actionlint passes with no errors
