# Starfield Background

This project powers six bespoke parallax pixel-star treatments behind the left menu, pluggable via the `STARFIELD_ENABLED` feature flag (defaults to on, and can be falsified to skip the canvas/switcher entirely in production). The starfield assets are lazy-loaded when the flag is enabled so they don’t impact initial hydration when disabled. Each variant blends into the background at rest yet blooms subtly on hover/focus through nav interaction amplification, crossfade transitions, and density tweaks. Palettes are now bound to CSS tokens so the colors subtly adapt to the site’s light/dark theme while maintaining the same behavior. The renderer snaps draw coordinates to the device pixel grid (with `imageSmoothingEnabled` off) for 1px edges, and it pauses RAF + micro-events when the tab is hidden to save CPU. The `Starfield` component is built around the `canvas` layer, uses the `STARFIELD_VARIANTS` definitions, and exposes knobs for motion, intensity, and transitions.

## Variants

- **Quiet pulse** – trails that leave barely-there alpha lines; radial hotspot gain nudges the particles brighter near hovered/focused nav items, while ephemeral micro-twinkles keep the rest of the canvas still.
- **Quiet pulse** – trails that leave barely-there alpha lines with a trail-echo micro blink; amplification around the hotspot makes the echo more visible before fading.
- **Ember veil** – warm vertical streaks drawn with pulsing blur, perfect for guiding attention upward; rare shooting streaks mimic ember sparks when the menu is engaged.
- **Ember veil** – warm vertical streaks drawn with pulsing blur and an ember-updraft micro plume that drifts upward near the cursor.
- **Grid glow** – quantized horizontal/vertical dashes chant a lattice; the grid flickers only when the hotspot is nearly above it, referencing data-grid hover lighting in enterprise dashboards.
- **Grid glow** – quantized horizontal/vertical dashes with lattice pin-glints that respond subtly to the hotspot.
- **Orbit trail** – haloed dots orbit the menu edge with soft ring strokes, while a low-rate streak event simulates micro-meteorites that leave faint arcs.
- **Orbit trail** – haloed dots with a perihelion flare micro burst when the cursor is nearby.
- **Pixel bloom** – tight clusters bloom into pixel sprays when hovered, the hotspot falloff keeps the rest of the field dormant, and micro-events create occasional color bursts.
- **Pixel bloom** – tight clusters bloom into pixel cascades, and a cluster-cascade micro behavior adds extra scattered squares when hovered.
- **Prism mist** – chromatic mist layers (RGB offsets) pulse slowly; shimmer events dip the colors into observably different hues near the nav pointer without overwhelming the background.
- **Prism mist** – chromatic mist layers that incorporate a spectrum-breath micro effect for a faint color swell around hotspots.

## Per-variant intent

- **Quiet pulse** – make the left menu feel like drifting dust with faint motion; rely on hotspot intensity and twinkle micro-events for feedback instead of constant motion.
- **Ember veil** – evoke hearth warmth without a literal fire animation; the vertical beams and rare streaks deliver the sensation of embers lifting from a horizon.
- **Grid glow** – speak to precision/productivity with a data grid that only brightens in the vicinity of the hovered nav item, reminding users of digital dashboards.
- **Orbit trail** – demarcate the menu boundary with orbiters; the tiny halos and streak arcs bring just enough structure to feel intentional.
- **Pixel bloom** – use clustered blooms to punctuate nav focus, gradually spreading brightness outward through local hotspot falloff.
- **Prism mist** – offer a poetic, soft shimmer that communicates depth via chromatic layering and gentle micro-shimmer events.

## Tuning knobs

- `hoverGain` controls the maximum amplitude for the active layer when `interactionLevel` is 1 (nav hover/focus). Keep this below ~1.4 to preserve subtlety.
- `density` clamps the number of stars drawn per layer; reduce it before shipping to low-powered devices or within reduced-motion paths.
- `interactionLevel` should be driven by local UI (nav hover/focus) so the effect stays nearly invisible at rest but responds where the user is pointing.
- `reduceMotionOverride` mirrors `prefers-reduced-motion` or manual toggles to collapse the animation loop down to a single draw.
- `transitionDurationMs` is used for crossfading layers; 300–420 ms gives the nicest bleed between variants.
- `/dev/sidebar` sandbox now exposes live tuning controls for density (60-180), hoverGain (1.0-1.4), and microEventFrequency (0.0005-0.004). Adjustments persist via localStorage, immediately update the Starfield props, and reduced-motion mode clamps them to gentler levels for safe previews (use the “Reset defaults” control to return to the documented ranges).

## Performance & accessibility guardrails

- Each variant renders into a `StarfieldLayer` that shares pointer data from the containing sidebar, so there is only one set of event listeners for parallax math.
- When `prefers-reduced-motion` is active or the dev sandbox toggles motion off, the canvas still draws a static frame but skips `requestAnimationFrame` to avoid wasted cycles.
- When the browser signals `navigator.connection.saveData` or the device reports `(pointer: coarse)`, the starfield autoswitches into a conserve/static lane (lower density, muted hover gain, near-zero micro events, and forced reduced-motion when both apply) so low-power devices and data-saver users stay performant.
- The bottom-left `StarfieldVariantSwitcher` is a keyboard-navigable radiogroup with persistent localStorage state; it also includes `aria` labels on each swatch.
- Canvas layers have `pointer-events: none`, so the effect never interferes with actual menu interactivity.
- Crossfade between variants keeps the brightness ramp modest; if a new effect requires heavier motion, adjust only the active layer's `hoverGain` and keep the previous layer fading out quickly.

## Adding new variants

1. Extend `STARFIELD_VARIANTS` with a new entry (label, description, swatch, physics, and a `behavior`).
2. Adjust `buildStars` to seed any extra metadata needed by the renderer (clusters, offsets, etc.).
3. Add logic to `renderVariant` to draw that new behavior while keeping `globalAlpha` and brightness clamps consistent.
4. Update `StarfieldVariantSwitcher` if you want custom swatch treatment or text.

With these guardrails, the starfield remains an understated, responsive overlay that subtly rewards interaction without overwhelming the menu.

## Testing
- Playwright suite `tests/e2e/starfield.spec.ts` exercise the `/dev/sidebar` sandbox for variant switching, persistence, reduced-motion toggle, hotspot activation, and feature-flag disabling. Run with `E2E_BASE_URL=http://127.0.0.1:19008 pnpm test:e2e:starfield`.
- Animated previews were generated via `node scripts/record-starfield.js` (resets variant, hovers, records 5 s WebM clips under `docs/starfield/`).
## Research references

For a deeper dive see [docs/STARFIELD-RESEARCH.md](docs/STARFIELD-RESEARCH.md) which maps eight references (CSS-Tricks, Codrops, Pen experiments, Material Design motion) to our six variants, explains tuning ranges (density, `hoverGain`, micro-event frequency, depth curves), and lists alternative ideas and extension steps.

## Screenshot gallery

Each variant screenshot shows the hovered nav item with a hotspot, captured from `/dev/sidebar`.

| Variant | Screenshot |
| --- | --- |
| Quiet pulse | ![Quiet pulse](docs/starfield/01-quietPulse.png) |
| Ember veil | ![Ember veil](docs/starfield/02-emberVeil.png) |
| Grid glow | ![Grid glow](docs/starfield/03-gridGlow.png) |
| Orbit trail | ![Orbit trail](docs/starfield/04-orbitTrail.png) |
| Pixel bloom | ![Pixel bloom](docs/starfield/05-pixelBloom.png) |
| Prism mist | ![Prism mist](docs/starfield/06-prismMist.png) |
|} |

## Animated previews
Clips record ~2 s rest, then hover hotspot for each variant.
<details>
<summary>Open video gallery</summary>
<div class="grid grid-cols-2 gap-4 mt-3">
  <video controls loop muted playsinline width="320" src="docs/starfield/01-quietPulse.webm"></video>
  <video controls loop muted playsinline width="320" src="docs/starfield/02-emberVeil.webm"></video>
  <video controls loop muted playsinline width="320" src="docs/starfield/03-gridGlow.webm"></video>
  <video controls loop muted playsinline width="320" src="docs/starfield/04-orbitTrail.webm"></video>
  <video controls loop muted playsinline width="320" src="docs/starfield/05-pixelBloom.webm"></video>
  <video controls loop muted playsinline width="320" src="docs/starfield/06-prismMist.webm"></video>
</div>
</details>

For a quick static overview, open [docs/starfield/gallery.html](docs/starfield/gallery.html) (included in the starfield artifacts) so you can view the clips + captions without playing them inline.

## Usage & props
```tsx
import { useRef } from 'react';
import { Starfield, DEFAULT_STARFIELD_VARIANT } from './app/components/Starfield';

const SidebarWithStarfield = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative">
      <Starfield
        variant={DEFAULT_STARFIELD_VARIANT}
        density={120}
        hoverGain={1.15}
        interactionLevel={0}
        hotspot={{ x: 0.5, y: 0.5, intensity: 0.8, radius: 0.35 }}
        microEventFrequency={0.002}
        reduceMotionOverride={false}
        transitionDurationMs={360}
        containerRef={containerRef}
      />
    </div>
  );
};
```
Key props to tune:
- `variant` – pick one of the six `STARFIELD_VARIANTS` keys; switcher persists locally.
- `density`, `hoverGain`, `microEventFrequency` – drive star density, amplification, and micro-events; reduced-motion or conserve/static modes clamp them.
- `interactionLevel` – normalized (0‑1) indicator of hover/focus so the active layer brightens only when the user is pointing near hotspots.
- `hotspot` – optional x/y/radius/intensity to simulate nav hover/focus amplification.
- `reduceMotionOverride` – forces the hook to stop RAF loops and keep the canvas static even without prefers-reduced-motion.
- `transitionDurationMs` – controls crossfade timing when switching variants.
The `STARFIELD_ENABLED` flag gates code-split loading so the canvas/switcher remain absent when false, theme tokens drive palettes, reduced-motion toggles force a single draw, and conserve/static modes automatically dial back density/event frequency for data-saver or coarse-pointer devices. For deeper context visit the `/dev/sidebar` sandbox, the static [gallery](docs/starfield/gallery.html), and the [acceptance checklist](docs/STARFIELD-ACCEPTANCE.md).
