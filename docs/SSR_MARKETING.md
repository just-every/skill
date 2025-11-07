# Marketing SSR & Prerender

The marketing shell (home, pricing, contact) now renders twice:
1. **Build time** – `pnpm --filter @justevery/web run build` runs Expo export and `scripts/prerender.tsx`, which writes hydrated-ready HTML into `apps/web/dist/prerendered/`.
2. **Runtime** – `workers/api/src/index.ts` intercepts `/`, `/pricing`, `/contact`, injects runtime env (`window.__JUSTEVERY_ENV__`), applies bot-aware caching, and falls back to the SPA for everyone else.

## Build & Bundle
- Run `pnpm --filter @justevery/web run build` before `wrangler dev` or any deploy. The command exports the Expo web bundle *and* emits `dist/prerendered/*.html` that already include the hashed JS entrypoint.
- The Worker asset binding (`[assets] directory = ../../apps/web/dist`) automatically includes `prerendered/*` for both dev and deploy. No extra copy step is needed—just ensure the build runs prior to `wrangler dev` or `pnpm bootstrap:deploy`.
- Changing marketing content or layout? Update the Expo pages in `apps/web/src/pages/*`, rerun the build, and check the resulting HTML artifacts into your deploy.

## Worker Behavior
- `servePrerenderedHtml` runs before API/app-shell routing. Paths `/`, `/pricing`, `/contact` load `/prerendered/`, `/prerendered/pricing`, `/prerendered/contact` from the asset bundle.
- Responses always include runtime env injection plus debug headers: `X-Prerender-Route` and `X-Prerender-Asset`.
- Cache policy: bots (detected via UA) receive `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`; regular browsers receive `Cache-Control: no-cache`. All responses add `Vary: User-Agent`.
- The SPA fallback (`serveAppShell`) still handles `/app` (and other dynamic routes), ensuring hydration continues to work for authenticated areas.

## Validation Checklist
_Local (run after `pnpm --filter @justevery/web run build` and before committing):_
- `wrangler dev --port 9193` (or your preferred port); note that dev tooling may short-circuit `/`, so hit `/pricing` and `/contact` to confirm Worker handling.
- Bot HTML: `curl -s -D - -H 'User-Agent: Googlebot' http://127.0.0.1:9193/pricing` and ensure:
  - `X-Prerender-Route` / `X-Prerender-Asset` headers match the path.
  - `window.__JUSTEVERY_ENV__` exists in the markup.
  - Hero copy from the Expo page is present (proves SSR succeeded).
  - `Cache-Control` equals `public, max-age=3600, stale-while-revalidate=86400`.
- Browser hydration: visit `http://127.0.0.1:9193/pricing` with a normal UA (or `curl -H 'User-Agent: Mozilla/5.0'`) and confirm `Cache-Control: no-cache` plus no console errors in DevTools.
- SPA fallback: `curl -I http://127.0.0.1:9193/app` should serve the SPA shell (200 with `Cache-Control: no-store, max-age=0`).
- Root quirk: `wrangler dev` serves `/` straight from the asset proxy; fetch `http://127.0.0.1:9193/prerendered/` or run a remote dev session (`wrangler dev --remote`) to spot-check the homepage SSR content.

_CI / Release:_
- `pnpm --filter @justevery/web run build` (Expo export + prerender) – required before `pnpm bootstrap:deploy`.
- `pnpm bootstrap:smoke --minimal` – confirms Worker endpoints and SPA fallback still answer after build.
- `pnpm bootstrap:deploy:dry-run` – renders `wrangler.toml`, applies migrations, and ensures the asset bundle (including `prerendered/*`) is what Cloudflare will receive.
- Optionally archive the HTML outputs: upload `apps/web/dist/prerendered/*.html` as workflow artifacts for future diffing.

_Failure Triage:_
| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| Bots keep seeing empty shells | Build skipped or assets missing | Rerun `pnpm --filter @justevery/web run build`; confirm `dist/prerendered/*` exists and rerun deploy |
| Hydration mismatch warning | Expo markup drift vs runtime state | Clear `.expo` cache, rebuild, confirm no stateful hooks fire during SSR |
| Wrong cache headers | `servePrerenderedHtml` not executing | Check Worker logs; ensure request path matches `/`, `/pricing`, `/contact` and that assets binding is mounted |
| `window.__JUSTEVERY_ENV__` undefined | Runtime injection failed | Verify Worker `injectRuntimeEnv` runs (look for script tag in HTML) and env vars exist in `.dev.vars` / ENV_BLOB |
| SPA routes returning SSR HTML | `shouldServeAppShell` list missing route | Update `SPA_EXTRA_ROUTES` in `workers/api/src/index.ts` to include the new path |

Keep this file handy for release sign-off—pair it with `docs/SECRETS_CLOUDFLARE.md` and the readiness checklist before tagging a new starter baseline.
