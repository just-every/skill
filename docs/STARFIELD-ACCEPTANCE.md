# Starfield Acceptance Checklist

## Primary goal
- [x] Six behaviorally distinct starfield variants (quiet pulse, ember veil, grid glow, orbit trail, pixel bloom, prism mist) render behind `/dev/sidebar` with unique motion profiles.
- [x] At rest the canvas stays ultra-subtle; intensity only ramps during hovered/focused nav interactions and near hotspots.
- [x] Hover/focus amplifies the hotspot locally (increased glow/micro-events) without spilling across the sidebar.
- [x] Bottom-left switcher persists the selected variant in localStorage, provides keyboard focus states, and keeps toggle accessible (`aria` radiogroup, focus ring).
- [x] Reduced-motion preferences (hook + motion toggle) halt RAF loops and cull micro-events while keeping the canvas drawn once.
- [x] Theme-aware palettes use CSS tokens so all variants respond to light/dark themes without behavioral drift.
- [x] Canvas rendering snaps to device pixels (`imageSmoothingEnabled=false`) for pixel-crisp output, and code-splitting + `STARFIELD_ENABLED` guard keep payloads off unless the feature flag is true.
- [x] `/dev/sidebar` sandbox tuning controls (density, hover gain, micro-event frequency) persist via localStorage and immediately influence the Starfield props; reduced-motion & conserve modes clamp to safer ranges.
- [x] Supporting media/screenshots (`docs/starfield/01-06-*.png` + WebM clips) and the new `docs/starfield/gallery.html` provide static references for each variant.
- [x] Playwright suite covers variant switching, persistence, reduced-motion toggle, hotspots, flag-off, and conserve/static detection across Chromium/Firefox/WebKit + DPR permutations; CI (build + Playwright starfield suite) remains green.

## Validation steps
1. Start the Expo web server (`pnpm --filter @justevery/web exec expo start --web --port 19008` or use `pnpm run dev:web`), then open `/dev/sidebar` (`http://127.0.0.1:19008/dev/sidebar`).
2. Inspect `docs/starfield/gallery.html` to verify the six WebM previews and captions (it loads the same files published via `docs/starfield/01-06-*.webm`).
3. Run `pnpm --filter @justevery/web exec tsc --project tsconfig.dev-sandbox.json --noEmit` and `E2E_BASE_URL=http://127.0.0.1:4173 pnpm test:e2e:starfield` to confirm compilation + multi-browser e2e coverage.
4. Confirm `STARFIELD.md` lists the gallery + tuning knobs, and the new acceptance checklist references the PR (below). 

With this checklist, the starfield should meet the Primary Goal and remain auditable from PR, docs, and CI artifacts.
