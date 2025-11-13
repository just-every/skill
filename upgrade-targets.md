# Upgrade Targets & Compatibility Report

_Last updated: 2025-11-13_

## Overview
- Goal: bring every workspace (apps/web, workers/api, shared tooling) up to the latest stable releases to keep this starter stack evergreen.
- Method: capture current vs. latest versions, note blockers, and define a migration order informed by dry-resolution checks (`pnpm outdated --recursive`) and targeted `npm view <pkg> version` queries.

## Global Tooling Targets

| Tool | Current | Latest / Required | Notes |
| --- | --- | --- | --- |
| Node.js | `>=18.18` (root `package.json:34-40`) | Expo SDK 54 CLI and Wrangler 4 both support Node 18.18+, but Expo recommends Node 20 LTS. Target **Node 20.17 LTS** so Metro, Oxide, and Wrangler share the same runtime. |
| pnpm | `10.12.4` (`package.json:5`) | 10.x already current; keep ≥10.12 to leverage tightened peer resolution. |
| TypeScript | `^5.9.3` in every workspace (see `apps/web/package.json:49-52`, `workers/api/package.json:13-17`, `packages/bootstrap-cli/package.json:29-34`) | 5.9.3 is the latest stable as of today; no change unless TS 6 ships. |

## apps/web (Expo + React Native Web)

### Dependency Inventory

| Package | Current (`apps/web/package.json:12-53`) | Latest (via `npm view`) | Action / Comments |
| --- | --- | --- | --- |
| `expo` | `~51.0.0` | `54.0.23` | **Upgrade required.** Expo 54 aligns with React Native ≥0.81 and unlocks NativeWind v5 + new Metro runtime. |
| `react-native` | `0.74.1` | `0.82.1` | **Breaking jump.** Needs upgrade before NativeWind v5 / Tailwind 4. Blocks Tailwind plan until resolved. |
| `react` / `react-dom` | `18.2.0` | `19.2.0` | Expo 54 still pins React 18; plan to stay on 18.2.0 until Expo publishes React 19 support. |
| `react-native-web` | `~0.19.10` | `0.21.2` | Upgrade in lockstep with RN core (Expo 54 ships RNW 0.21). |
| `nativewind` | `^4.2.1` | `4.2.1` (latest stable) | NativeWind **v5** releases once RN ≥0.81 is in place; plan upgrade immediately after RN/Expo bump. |
| `tailwindcss` | `^3.4.18` | `4.1.17` | Target Tailwind 4.1 once Expo/RN/NativeWind prerequisites met; needs new CSS-first config and Oxide CLI integration. |
| `@tailwindcss/forms` | `^0.5.10` | `0.5.10` | Latest 0.5.x still Tailwind-3 focused; Tailwind 4 requires the forthcoming 0.6+ plugin or CSS `@plugin` workaround. |
| `@tailwindcss/typography` | `^0.5.19` | `0.5.19` | Same story—monitor for 1.0 Tailwind 4 compatible release or import via CSS when available. |
| `tailwind-merge` | `^2.6.0` | `3.4.0` | Upgrade after Tailwind 4 to get updated class conflict tables. |
| `@expo/metro-runtime` | `~3.2.3` | `6.1.2` | Needs bump with Expo 54—new Metro condition names remove `unstable_*`. |
| `expo-crypto` / `expo-secure-store` / `expo-web-browser` | `~13.x` | `15.0.7 / 15.0.7 / 15.0.9` | Upgrade via `expo install` post-SDK bump so native shims match. |
| `@react-native-async-storage/async-storage` | `^1.23.1` | `2.2.0` | Upgrade along with RN to avoid deprecated promise APIs. |
| `react-native-svg` | `^15.14.0` | `15.15.0` | Minor bump once RN upgrade is underway. |
| `@tanstack/react-query` | `5.51.15` | `5.90.8` | Safe to bump any time; no platform tie-in. |

### Expo / RN / React / NativeWind Matrix & Constraints

| Layer | Current | Target | Constraints / Notes |
| --- | --- | --- | --- |
| Expo SDK | 51 | 54 | Expo 54 includes RN 0.81+, Metro 0.81, CLI 10. Requires Node ≥18.18 and re-running `expo doctor`. |
| React Native | 0.74.1 | ≥0.81.2 (Expo 54 baseline) | **Primary blocker** for Tailwind / NativeWind upgrade. Impacts Metro config and native module APIs. |
| React / React DOM | 18.2.0 | 18.2.0 (stay) | Keep at Expo-pinned version until Expo adopts React 19. |
| React Native Web | 0.19.x | 0.21.x | Must match RN core to avoid renderer divergence. |
| NativeWind | 4.2.1 | 5.x (pending GA) | NativeWind v5 requires RN ≥0.81 and Tailwind 4; removes Babel plugin, uses Metro plugin exclusively. |

**Blocking issue**: Until RN (and therefore Expo) is on ≥0.81, the Tailwind 4 / NativeWind v5 migration cannot proceed. Plan the Expo SDK upgrade first.

### Tailwind 4.1 Readiness Snapshot
- Tailwind 4 requires replacing `tailwind.config.js` with CSS-first (or TS) config and importing plugins via CSS `@plugin`. See `TAILWIND_MIGRATION_PLAN.md` in the claude-sonnet worktree for detailed steps.
- Plugin status: current `@tailwindcss/forms` / `@tailwindcss/typography` releases are Tailwind-3-oriented; track upcoming 0.6 / 1.0 drops or rely on CSS `@plugin` once they ship.
- Arbitrary value usage (`[...]`) and custom tokens (`brand-*`, `shadow-card`) must be revalidated under Oxide’s parser—see migration plan risk checklist for files to inspect.

## workers/api (Cloudflare Worker)

### Dependency Inventory

| Package | Current | Latest | Notes |
| --- | --- | --- | --- |
| `wrangler` | `^4.45.3` (`workers/api/package.json:13-17`) | `4.47.0` | Already on v4; bump to latest 4.x for CLI fixes. Requires Node ≥18. |
| `@cloudflare/workers-types` | `^4.20251014.0` | `4.20251111.0` | Keep in sync with new `compatibility_date`. |
| `typescript` | `^5.9.3` | `5.9.3` | Latest; no change. |
| `vitest` | `^4.0.6` | `4.0.8` | Patch upgrade; watch for mock API tweaks. |
| `miniflare` | (transitive via Wrangler) | `4.20251111.0` | Add explicit devDependency if you need programmatic tests. |
| `zod` (`packages/bootstrap-cli/package.json:19-34`) | `^3.23.8` | `3.25.76` | Upgrade CLI schemas; optional but recommended. |

### Worker Config Targets
- `wrangler.toml:1-20` currently uses `compatibility_date = "2024-09-01"` and `nodejs_compat`. Update to the newest date once dependency bumps land to unlock latest runtime features.
- Consider adding `@cloudflare/vitest-pool-workers` to align Vitest with Miniflare’s runtime when writing new tests (per agent recommendations).

### Migration Order (Workers)
1. Update `@cloudflare/workers-types` → latest date-based version.
2. Bump `vitest` → `4.0.8`, and bootstrap CLI Vitest dependency accordingly.
3. Optionally add `miniflare` + `@cloudflare/vitest-pool-workers` for richer local tests.
4. Update `compatibility_date` and rerun `npm run typecheck`, `npm test`, `npm run dev:worker`.
5. Deploy to preview via `wrangler deploy --env preview`, run smoke tests, then promote.

## Shared Tooling (bootstrap CLI, scripts)

| Package | Current (`packages/bootstrap-cli/package.json:19-34`) | Latest | Action |
| --- | --- | --- | --- |
| `zod` | `^3.23.8` | `3.25.76` | Upgrade to keep schema helpers current. |
| `vitest` | `^1.6.1` | `4.0.8` | Align with worker workspace to avoid divergent test runners. |
| `commander` | `^12.1.0` | `14.0.2` | Upgrade once Node 20 baseline locked. |
| `dotenv` | `^16.4.5` | `17.2.3` | Minor bump after Node 20 adoption. |
| `listr2` | `^8.2.1` | `9.0.5` | Upgrade to stay compatible with ESM pipeline. |

## Tailwind 4.1 Migration Readiness (Detail)

Key findings from `code-claude-sonnet-4-5-draft-tailwind-3-4-1/TAILWIND_MIGRATION_PLAN.md`:
1. **Blocker**: NativeWind v5 requires React Native ≥0.81 (Expo SDK 54). Tailwind 4 upgrade must wait until the RN upgrade is complete.
2. **Config changes**: Move to CSS-first config with `@theme` tokens and `@plugin` directives; convert existing JS config to TS as needed.
3. **Metro / Babel**: NativeWind v5 drops the Babel plugin—Metro plugin (`withNativeWind(config, { input: './global.css' })`) becomes mandatory.
4. **Risk checklist**: arbitrary values, custom theme tokens, focus / active variants, and `tailwind-merge` need validation under Oxide.
5. **Verification**: Plan calls for a 6.5–7.5 day effort covering RN upgrade, Tailwind upgrade, NativeWind upgrade, build pipeline updates, and visual regression testing across key screens (`Home`, `Dashboard`, `Pricing`, etc.).

## Ordered Migration Path

1. **Lock tooling baseline**: upgrade Node runtime on local + CI to Node 20 LTS and keep pnpm at ≥10.12.4.
2. **Expo / React Native stack**:
   - Upgrade to Expo SDK 54 (brings RN ≥0.81, RNW 0.21, Metro 0.81) per Expo agent matrix.
   - Update Expo-managed modules (`expo-crypto`, `expo-secure-store`, `expo-web-browser`, `@expo/metro-runtime`).
   - Confirm NativeWind v5 compatibility after RN upgrade.
3. **Tailwind / NativeWind**:
   - Apply Tailwind 4.1 migration plan once RN + NativeWind prerequisites satisfied.
   - Update `tailwind-merge` to 3.4.0, convert config, and validate plugin usage.
4. **Workers/API stack**:
   - Bump `@cloudflare/workers-types`, `vitest`, and optionally add `miniflare` / `@cloudflare/vitest-pool-workers`.
   - Update `compatibility_date` and rerun worker smoke tests.
5. **Shared CLI + automation**:
   - Upgrade `@justevery/bootstrap-cli` dependencies (`zod`, `vitest`, `commander`, `dotenv`, `listr2`).
   - Ensure Node 20 requirement is documented for CLI users.
6. **Final validation**:
   - Run `npm run dev:web`, `npm run dev:worker`, `npm run test:e2e`, and worker Vitest suites.
   - Perform Expo web export + prerender to confirm build pipeline remains green.

## Next Actions
- [ ] Approve Node 20 LTS adoption (dev + CI) and update documentation.
- [ ] Schedule Expo SDK 54 / RN 0.81 upgrade (largest blocker for Tailwind / NativeWind).
- [ ] Track NativeWind v5 GA timeline and Tailwind 4 plugin releases; update plan when packages publish.
- [ ] After RN upgrade branch is stable, apply Tailwind / NativeWind migration using `TAILWIND_MIGRATION_PLAN.md` as the playbook.
- [ ] Execute worker toolchain bumps once web stack plan is underway (low-risk, already on Wrangler 4).
