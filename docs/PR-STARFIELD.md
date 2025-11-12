# PR Summary: Starfield Sidebar Enhancements

## Scope/Key Files
- `apps/web/src/app/components/Starfield.tsx` – rebuilt as layered canvas renderer with six behaviorally distinct variants, hotspots, micro-event spawning, and smooth crossfades.
- `apps/web/src/app/AppShell.tsx` – injected nav hover/focus interaction state, hotspot wiring, and variant crossfade props plus the same switcher variant persistence logic.
- `apps/web/src/pages/DevSidebarSandbox.tsx` – sandbox demo with hotspot/micro-event controls, variant metadata, and hotspots tied to the sample nav items.
- `docs/STARFIELD.md` – technical write-up, research references, and screenshot gallery referencing `docs/starfield/01-06-*.png`.
- `docs/starfield/*.png` – Six hovered-shot screenshots captured via `scripts/capture-starfield.js`.

## How to Run & Validate
1. `pnpm --filter @justevery/web exec expo start --web --port 19008` (or the existing dev server) so `/dev/sidebar` is accessible.
2. Visit `http://127.0.0.1:19008/dev/sidebar` to preview each variant, use the bottom-left switcher, and toggle the motion pill.
3. Run `node scripts/capture-starfield.js` once the server is live to regenerate the hovered-state screenshots (requires Playwright Chromium).
4. `pnpm --filter @justevery/web exec tsc --project tsconfig.dev-sandbox.json --noEmit` verifies the new components/hotspot hooks compile.

## Feature Notes & Tuning
- **Six variants** now behave distinctly: quarter alpha trails, ember columns, grid sparks, orbit halos, clustered pixel blooms, and chromatic mist.
- **Subtle defaults** keep density, hover gain, and micro-event frequency low; adjust `Starfield` props for `density`, `hoverGain`, or `microEventFrequency` if the target hardware needs even quieter motion.
- **Hotspots & micro-events** respond to hovered/focused nav items for localized amplification while keeping the rest of the canvas calm.
- **Theme-aware palettes** now source colors from CSS tokens so the starfield shifts with light/dark themes without changing behavior, the renderer snaps drawing to the device pixel grid (`imageSmoothingEnabled=false`) for crisp 1px lines, and both the starfield and switcher are lazy-loaded only when `STARFIELD_ENABLED` is true to minimize initial bundle weight.
- **Variant micro-behaviors** (trail echo, ember updraft, lattice pin-glints, perihelion flare, cluster cascade, spectrum breath) run at ultra-low frequency and amplify near hotspots without changing the baseline noise.
- **Playwright sanity checks** now cover the `/dev/sidebar` sandbox (`tests/e2e/starfield.spec.ts`) for variant switching, persistence, reduced-motion toggle, hotspot activation, and the `STARFIELD_ENABLED=false` path; run with `E2E_BASE_URL=http://127.0.0.1:19008 pnpm test:e2e:starfield`.
- Captured animated WebM previews via `node scripts/record-starfield.js`, storing them alongside screenshots under `docs/starfield/` for reference, plus the static [gallery](starfield/gallery.html) for quick review.
- **Sign-off Comment**
"✅ Starfield complete: six ultra-subtle parallax star variants (each with bespoke micro-behaviors), hotspot amplification, bottom-left switcher (persist + a11y), reduced-motion, theme-aware palettes, pixel-crisp rendering, and code-split loading. CI (build + Playwright) is green. Docs/screenshots/previews: STARFIELD.md, docs/PR-STARFIELD.md, docs/STARFIELD-RESEARCH.md, docs/starfield/*. Toggle via STARFIELD_ENABLED. Please review the subtlety/intensity per variant and let me know if anything needs adjusting before approval."
- **Switcher persistence** (localStorage) ensures the chosen variant sticks, and the keyboard-accessible radiogroup resides in the sidebar’s bottom-left.
- **Reduced-motion** mode immediately caps animation (single draw, no RAF) while keeping the crossfade layers intact.
- **Feature flag** `STARFIELD_ENABLED` toggles the overlay (defaults to `true` in dev); disabling it yields the baseline gradient sidebar without the canvas or switcher.

## Tests & Acceptance
- Visual verification: `/dev/sidebar` for each variant (quiet at rest, brighter near nav hover/focus, smooth crossfades).
- Functional: bottom-left switcher works via mouse/keyboard, persists selection, honors reduced-motion; sandbox hotspots/micro-event knob operate correctly.
- Automation: `pnpm --filter @justevery/web exec tsc --project tsconfig.dev-sandbox.json --noEmit`.
- Screenshots: `docs/starfield/01-quietPulse.png` through `06-prismMist.png` show the hovered hotspot state used in the updated `docs/STARFIELD.md` gallery.
- Acceptance checklist: [docs/STARFIELD-ACCEPTANCE.md](docs/STARFIELD-ACCEPTANCE.md) maps each Primary Goal item to verification steps so reviewers know what to validate before merging.

## Status
- ✅ Typecheck + Playwright starfield suite (Chromium DPR1/2 light & dark, Firefox DPR2 light, WebKit DPR2 light) ran against `E2E_BASE_URL=http://127.0.0.1:4173` served dist.
- ✅ Acceptance checklist: [docs/STARFIELD-ACCEPTANCE.md](docs/STARFIELD-ACCEPTANCE.md).
- Acceptance checklist: `docs/STARFIELD-ACCEPTANCE.md` maps each Primary Goal item to verification steps so reviewers know what to validate before merging.
